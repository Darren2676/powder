import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { syncLineStatus } from '@/services/salesOrderSync.service';

// ==================== 编号生成 ====================
const generateShippingRequestNumber = async (): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `SR-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(request_number) as max_num FROM shipping_request WHERE request_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );

  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 待发货列表（来自销售订单明细） ====================
export const getPendingShipments = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', approval_status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = `WHERE d.shipping_status IN (N'未申请', N'未发货', N'部分发货') AND h.approval_status = N'已审批'`;
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (d.item_number LIKE :search OR d.item_name LIKE :search OR h.sales_order_number LIKE :search OR h.customer_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      const arr = String(approval_status).split(',').filter(Boolean);
      if (arr.length === 1) {
        whereClause = whereClause.replace(`AND h.approval_status = N'已审批'`, `AND h.approval_status = :approval_status`);
        replacements.approval_status = arr[0];
      } else if (arr.length > 1) {
        whereClause = whereClause.replace(`AND h.approval_status = N'已审批'`, `AND h.approval_status IN (${arr.map((_: string, i: number) => `:aps${i}`).join(', ')})`);
        arr.forEach((s: string, i: number) => { replacements[`aps${i}`] = s; });
      }
    }

    // 数据范围过滤：sales 角色只能看到自己负责客户的订单
    const scope = (req as any).dataScope;
    if (scope?.head_of_sales_id) {
      whereClause += ` AND h.head_of_sales_id = :dataScopeUserId`;
      replacements.dataScopeUserId = scope.head_of_sales_id;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM sales_order_detail d
       INNER JOIN sales_order h ON h.sales_order_number = d.sales_order_number
       ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        Select d.id, d.sales_order_number, d.line_number, d.item_number, d.item_name,
               d.specifications, d.basic_unit, d.product_drawing_number,
               d.order_quantity, d.unit_price, d.tax_rate, d.total_amount,
               d.shipped_quantity, d.delivery_date, d.promised_delivery_date,
               d.shipping_status, d.remark, d.refunded_quantity, d.status,
               h.customer_number, h.customer_name, h.delivery_date as header_delivery_date,
               h.sales_order_number as order_number, h.head_of_sales, h.linkman, h.contacts,
               h.order_date, h.order_status, h.[condition], h.remark as header_remark,
               h.creation_date, h.creation_man, h.customer_po_number, h.approval_status,
               ISNULL((SELECT SUM(srd.ship_quantity) FROM shipping_request_detail srd
                 INNER JOIN shipping_request sr ON sr.request_number = srd.request_number
                 WHERE srd.sales_detail_id = d.id AND sr.status != N'已取消'), 0) as applied_quantity,
               COALESCE(NULLIF(d.customer_item_number, ''), cm.customer_item_number) as customer_item_number,
               COALESCE(NULLIF(d.customer_item_description, ''), cm.customer_item_description) as customer_item_description,
               ROW_NUMBER() OVER (ORDER BY h.sales_order_number, d.line_number) AS _row_num
        FROM sales_order_detail d
        INNER JOIN sales_order h ON h.sales_order_number = d.sales_order_number
        LEFT JOIN customer_material_mapping cm ON cm.customer_number = h.customer_number AND cm.item_number = d.item_number AND cm.approval_status = N'已审核'
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: pageSize
    }));
  } catch (err) { next(err); }
};

// ==================== 生成发货申请 ====================
export const createShippingRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    // b.details: [{ sales_order_number, detail_id, item_number, item_name, specifications, basic_unit, order_quantity, ship_quantity, ... }]
    if (!b.details || !Array.isArray(b.details) || b.details.length === 0) {
      res.status(400).json({ success: false, message: '请选择至少一条发货明细' }); return;
    }

    const request_number = await generateShippingRequestNumber();
    const transaction = await sequelize.transaction();

    try {
      // 创建发货申请主表
      await sequelize.query(`
        INSERT INTO shipping_request (request_number, customer_number, customer_name, request_date, status, remark,
          creation_man, creation_date)
        VALUES (:request_number, :customer_number, :customer_name, GETDATE(), N'待审核', :remark,
          :creation_man, GETDATE())
      `, {
        replacements: {
          request_number,
          customer_number: b.customer_number || '',
          customer_name: b.customer_name || '',
          remark: b.remark || '',
          creation_man: (req as any).user?.username || ''
        },
        transaction
      });

      // 创建发货申请明细
      for (let i = 0; i < b.details.length; i++) {
        const d = b.details[i];
        await sequelize.query(`
          INSERT INTO shipping_request_detail (request_number, line_number, sales_order_number, sales_detail_id,
            item_number, item_name, specifications, basic_unit, product_drawing_number,
            order_quantity, shipped_quantity, ship_quantity, delivery_date, remark)
          VALUES (:request_number, :line_number, :sales_order_number, :sales_detail_id,
            :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
            :order_quantity, :shipped_quantity, :ship_quantity, :delivery_date, :remark)
        `, {
          replacements: {
            request_number,
            line_number: (i + 1) * 10,
            sales_order_number: d.sales_order_number || '',
            sales_detail_id: d.detail_id || d.id || 0,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            product_drawing_number: d.product_drawing_number || '',
            order_quantity: d.order_quantity || 0,
            shipped_quantity: d.shipped_quantity || 0,
            ship_quantity: d.ship_quantity || 0,
            delivery_date: d.delivery_date || null,
            remark: d.remark || ''
          },
          transaction
        });

        // 更新销售订单明细的发货状态
        if (d.detail_id || d.id) {
          const detailId = d.detail_id || d.id;
          const shipQty = Number(d.ship_quantity) || 0;
          const orderQty = Number(d.order_quantity) || 0;
          const alreadyShipped = Number(d.shipped_quantity) || 0;
          const totalShipped = alreadyShipped + shipQty;

          let newShippingStatus = '部分发货';
          if (totalShipped >= orderQty) {
            newShippingStatus = totalShipped > orderQty ? '超额发货' : '全部发货';
          }

          await sequelize.query(
            `UPDATE sales_order_detail SET shipping_status = :status WHERE id = :id`,
            { replacements: { status: newShippingStatus, id: detailId }, transaction }
          );
          // 同步行状态 + 订单头状态
          await syncLineStatus(detailId, transaction);
        }
      }

      await transaction.commit();
      res.json(success({ request_number }, '发货申请创建成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 发货申请明细列表（所有状态的申请行明细） ====================
export const getPendingRequestDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = `WHERE 1=1`;
    const replacements: any = { offset, offsetEnd };

    if (status) {
      const statusArr = String(status).split(',').filter(Boolean);
      if (statusArr.length === 1) {
        whereClause += ` AND h.status = :status`;
        replacements.status = statusArr[0];
      } else if (statusArr.length > 1) {
        const placeholders = statusArr.map((s, i) => `:status${i}`).join(', ');
        whereClause += ` AND h.status IN (${placeholders})`;
        statusArr.forEach((s, i) => { replacements[`status${i}`] = s; });
      }
    }
    if (search) {
      whereClause += ` AND (h.request_number LIKE :search OR d.item_number LIKE :search OR d.item_name LIKE :search OR h.customer_name LIKE :search OR d.sales_order_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM shipping_request_detail d
       INNER JOIN shipping_request h ON h.request_number = d.request_number
       ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT d.id, d.request_number, d.line_number, d.sales_order_number, d.sales_detail_id,
               d.item_number, d.item_name, d.specifications, d.basic_unit, d.product_drawing_number,
               d.order_quantity, d.shipped_quantity, d.ship_quantity, d.delivery_date, d.remark,
               h.customer_number, h.customer_name, h.status as request_status,
               h.request_date, h.creation_man, h.remark as request_remark,
               sod.promised_delivery_date,
               COALESCE(NULLIF(d.customer_item_number, ''), sod.customer_item_number) as customer_item_number,
               COALESCE(NULLIF(d.customer_item_description, ''), sod.customer_item_description) as customer_item_description,
               ROW_NUMBER() OVER (ORDER BY h.creation_date DESC, d.request_number, d.line_number) AS _row_num
        FROM shipping_request_detail d
        INNER JOIN shipping_request h ON h.request_number = d.request_number
        LEFT JOIN sales_order_detail sod ON sod.id = d.sales_detail_id
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: pageSize
    }));
  } catch (err) { next(err); }
};

// ==================== 导出选中发货申请明细 ====================
export const exportPendingRequestDetailsSelected = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      res.status(400).json({ success: false, message: '请选择要导出的记录' }); return;
    }
    if (ids.length > 1000) {
      res.status(400).json({ success: false, message: '单次导出不能超过1000条' }); return;
    }
    const replacements: any = {};
    ids.forEach((id: any, i: number) => { replacements[`id${i}`] = id; });
    const placeholders = ids.map((_: any, i: number) => `:id${i}`).join(', ');

    const [items]: any = await sequelize.query(`
      SELECT d.request_number, d.line_number, d.sales_order_number,
             d.item_number, d.item_name, d.specifications, d.basic_unit,
             d.order_quantity, d.shipped_quantity, d.ship_quantity, d.delivery_date, d.remark,
             h.customer_name, h.status as request_status, h.request_date, h.creation_man,
             sod.promised_delivery_date
      FROM shipping_request_detail d
      INNER JOIN shipping_request h ON h.request_number = d.request_number
      LEFT JOIN sales_order_detail sod ON sod.id = d.sales_detail_id
      WHERE d.id IN (${placeholders})
      ORDER BY d.request_number, d.line_number
    `, { replacements });

    const fields = [
      'request_number', 'request_status', 'customer_name', 'line_number', 'sales_order_number',
      'item_number', 'item_name', 'specifications', 'basic_unit',
      'order_quantity', 'shipped_quantity', 'ship_quantity',
      'delivery_date', 'promised_delivery_date', 'creation_man', 'request_date', 'remark'
    ];
    const headers = [
      '申请单号', '状态', '客户名称', '行号', '销售订单号',
      '产品编号', '产品名称', '规格', '单位',
      '订单数量', '已发数量', '本次发货',
      '交货日期', '承诺交货日期', '申请人', '申请日期', '备注'
    ];
    exportToExcel(items, fields, headers, 'shipping_request_details_selected', res);
  } catch (err) { next(err); }
};

// ==================== 发货申请列表 ====================
export const getShippingRequests = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (request_number LIKE :search OR customer_name LIKE :search OR customer_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (status) {
      whereClause += ` AND status = :status`;
      replacements.status = status;
    }

    // 数据范围过滤：sales 角色只能看到自己负责客户的发货申请
    const scope = (req as any).dataScope;
    if (scope?.head_of_sales_id) {
      whereClause += ` AND customer_number IN (SELECT customer_number FROM customer WHERE head_of_sales_id = :dataScopeUserId)`;
      replacements.dataScopeUserId = scope.head_of_sales_id;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM shipping_request ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC) AS _row_num
        FROM shipping_request ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: pageSize
    }));
  } catch (err) { next(err); }
};

// ==================== 发货申请详情 ====================
export const getShippingRequestDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(
      `SELECT * FROM shipping_request WHERE request_number = :id`, { replacements: { id } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '发货申请不存在' }); return; }

    const [details]: any = await sequelize.query(
      `SELECT d.*, sod.promised_delivery_date,
              COALESCE(NULLIF(d.customer_item_number, ''), sod.customer_item_number) as customer_item_number,
              COALESCE(NULLIF(d.customer_item_description, ''), sod.customer_item_description) as customer_item_description
       FROM shipping_request_detail d
       LEFT JOIN sales_order_detail sod ON sod.id = d.sales_detail_id
       WHERE d.request_number = :id ORDER BY d.line_number`,
      { replacements: { id } }
    );

    res.json(success({ header: headers[0], details }));
  } catch (err) { next(err); }
};

// ==================== 更新发货申请（仅待审核状态可修改） ====================
export const updateShippingRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    // 校验状态
    const [chk]: any = await sequelize.query(
      `SELECT status FROM shipping_request WHERE request_number = :id`, { replacements: { id } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '发货申请不存在' }); return; }
    if (chk[0].status !== '待审核') {
      res.status(403).json({ success: false, message: '只有待审核的发货申请可以修改' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      // 更新主表
      await sequelize.query(`
        UPDATE shipping_request SET remark = :remark WHERE request_number = :id
      `, { replacements: { remark: b.remark || '', id }, transaction });

      // 更新明细行的 ship_quantity
      if (b.details && Array.isArray(b.details)) {
        for (const d of b.details) {
          if (d.id && d.ship_quantity != null) {
            await sequelize.query(`
              UPDATE shipping_request_detail SET ship_quantity = :ship_quantity, remark = :remark
              WHERE id = :id AND request_number = :request_number
            `, {
              replacements: {
                ship_quantity: Number(d.ship_quantity) || 0,
                remark: d.remark || '',
                id: d.id,
                request_number: id
              },
              transaction
            });

            // 同步更新对应的 sales_order_detail.shipping_status
            if (d.sales_detail_id) {
              const orderQty = Number(d.order_quantity) || 0;
              const alreadyShipped = Number(d.shipped_quantity) || 0;
              const totalShipped = alreadyShipped + (Number(d.ship_quantity) || 0);
              let newShippingStatus = '部分发货';
              if (totalShipped >= orderQty) {
                newShippingStatus = totalShipped > orderQty ? '超额发货' : '全部发货';
              }
              await sequelize.query(
                `UPDATE sales_order_detail SET shipping_status = :status WHERE id = :id`,
                { replacements: { status: newShippingStatus, id: d.sales_detail_id }, transaction }
              );
              // 同步行状态 + 订单头状态
              await syncLineStatus(d.sales_detail_id, transaction);
            }
          }
        }
      }

      await transaction.commit();
      res.json(success(null, '发货申请修改成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 更新发货申请状态 ====================
export const updateShippingRequestStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    const validStatuses = ['待审核', '已审核', '已发货'];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ success: false, message: '无效的状态值，撤消请使用撤消接口' }); return;
    }
    await sequelize.query(
      `UPDATE shipping_request SET status = :status WHERE request_number = :id`,
      { replacements: { status, id } }
    );
    res.json(success(null, '状态更新成功'));
  } catch (err) { next(err); }
};

// ==================== 回写销售订单明细发货状态（公共函数） ====================
// 统一逻辑：优先看实发净量(shipped-refunded)，再看申请量
const recomputeShippingStatus = async (salesDetailIds: number[], transaction: any) => {
  for (const detailId of salesDetailIds) {
    // 查询实发量、退货量、订单量
    const [detailRows]: any = await sequelize.query(
      `SELECT order_quantity, ISNULL(shipped_quantity, 0) as shipped_quantity,
             ISNULL(refunded_quantity, 0) as refunded_quantity
       FROM sales_order_detail WHERE id = :detailId`,
      { replacements: { detailId }, transaction }
    );
    if (detailRows.length === 0) continue;

    const orderQty = Number(detailRows[0].order_quantity) || 0;
    const shippedQty = Number(detailRows[0].shipped_quantity) || 0;
    const refundedQty = Number(detailRows[0].refunded_quantity) || 0;
    const netShipped = shippedQty - refundedQty;

    let newStatus = '未申请';
    if (netShipped > 0) {
      // 有实发记录，按实发净量判断
      if (netShipped >= orderQty) {
        newStatus = netShipped > orderQty ? '超额发货' : '全部发货';
      } else {
        newStatus = '部分发货';
      }
    } else {
      // 净发为0，回退到看申请量
      const [aggRows]: any = await sequelize.query(`
        SELECT ISNULL(SUM(srd.ship_quantity), 0) as total_applied
        FROM shipping_request_detail srd
        INNER JOIN shipping_request sr ON sr.request_number = srd.request_number
        WHERE srd.sales_detail_id = :detailId AND sr.status != N'已取消'
      `, { replacements: { detailId }, transaction });
      const totalApplied = Number(aggRows[0]?.total_applied) || 0;
      if (totalApplied > 0) {
        if (totalApplied >= orderQty) {
          newStatus = totalApplied > orderQty ? '超额发货' : '全部发货';
        } else {
          newStatus = '部分发货';
        }
      }
    }

    await sequelize.query(
      `UPDATE sales_order_detail SET shipping_status = :status WHERE id = :detailId`,
      { replacements: { status: newStatus, detailId }, transaction }
    );
    // 同步行状态 + 订单头状态
    await syncLineStatus(detailId, transaction);
  }
};

// ==================== 撤消发货申请（含回写） ====================
export const cancelShippingRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const transaction = await sequelize.transaction();
    try {
      // 查询申请状态（加锁）
      const [chk]: any = await sequelize.query(
        `SELECT status FROM shipping_request WITH (UPDLOCK) WHERE request_number = :id`,
        { replacements: { id }, transaction }
      );
      if (!chk.length) {
        await transaction.rollback();
        res.status(404).json({ success: false, message: '发货申请不存在' }); return;
      }
      if (chk[0].status === '已取消') {
        await transaction.rollback();
        res.status(400).json({ success: false, message: '该发货申请已取消' }); return;
      }
      if (chk[0].status === '已发货') {
        await transaction.rollback();
        res.status(400).json({ success: false, message: '该发货申请已发货，不可撤消' }); return;
      }

      // 已审核状态需检查是否已有发货单
      if (chk[0].status === '已审核') {
        const [soCheck]: any = await sequelize.query(`
          SELECT TOP 1 so.shipping_order_number
          FROM shipping_order_detail sod
          INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
          WHERE sod.request_number = :id AND so.status != N'已取消'
        `, { replacements: { id }, transaction });

        if (soCheck.length > 0) {
          await transaction.rollback();
          res.status(400).json({
            success: false,
            message: `该申请已有发货单(${soCheck[0].shipping_order_number})，请先撤消发货单`
          }); return;
        }
      }

      // 获取明细中关联的 sales_detail_id（用于回写）
      const [details]: any = await sequelize.query(
        `SELECT sales_detail_id FROM shipping_request_detail WHERE request_number = :id`,
        { replacements: { id }, transaction }
      );
      const salesDetailIds = details
        .map((d: any) => d.sales_detail_id)
        .filter((id: number) => id > 0);

      // 更新状态为已取消
      await sequelize.query(
        `UPDATE shipping_request SET status = N'已取消' WHERE request_number = :id`,
        { replacements: { id }, transaction }
      );

      // 回写销售订单明细发货状态
      if (salesDetailIds.length > 0) {
        await recomputeShippingStatus(salesDetailIds, transaction);
      }

      await transaction.commit();
      res.json(success(null, '发货申请已撤消'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 删除发货申请（含回写） ====================
export const deleteShippingRequest = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(
      `SELECT status FROM shipping_request WHERE request_number = :id`, { replacements: { id } }
    );
    if (!chk.length) {
      res.status(404).json({ success: false, message: '发货申请不存在' }); return;
    }
    if (chk[0].status !== '待审核') {
      res.status(403).json({ success: false, message: '只有待审核的发货申请可以删除' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      // 获取明细中关联的 sales_detail_id（用于回写）
      const [details]: any = await sequelize.query(
        `SELECT sales_detail_id FROM shipping_request_detail WHERE request_number = :id`,
        { replacements: { id }, transaction }
      );
      const salesDetailIds = details
        .map((d: any) => d.sales_detail_id)
        .filter((sid: number) => sid > 0);

      // 删除明细和主表
      await sequelize.query(`DELETE FROM shipping_request_detail WHERE request_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM shipping_request WHERE request_number = :id`, { replacements: { id }, transaction });

      // 回写销售订单明细发货状态
      if (salesDetailIds.length > 0) {
        await recomputeShippingStatus(salesDetailIds, transaction);
      }

      await transaction.commit();
      res.json(success(null, '删除成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};
