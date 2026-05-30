import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { generateShippingOrderNumber } from '../../../services/documentNumber.service';
import { syncLineStatus } from '@/services/salesOrderSync.service';
import { syncFinishedGoodsSummary } from '@/services/inventory.service';

// ==================== 创建发货单（基于发货申请，支持分批） ====================
export const createShippingOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;

    // ---- 基础校验 ----
    if (!b.request_number) {
      res.status(400).json({ success: false, message: '请选择发货申请' }); return;
    }
    if (!b.details || !Array.isArray(b.details) || b.details.length === 0) {
      res.status(400).json({ success: false, message: '请添加至少一条发货明细' }); return;
    }

    // ---- 事务处理（查询+校验+写入在同一事务内，防止并发竞态） ----
    const transaction = await sequelize.transaction();
    try {
      // 校验发货申请状态（事务内加锁）
      const [reqRows]: any = await sequelize.query(
        `SELECT * FROM shipping_request WITH (UPDLOCK) WHERE request_number = :rn`,
        { replacements: { rn: b.request_number }, transaction }
      );
      if (reqRows.length === 0) {
        await transaction.rollback();
        res.status(404).json({ success: false, message: '发货申请不存在' }); return;
      }
      if (reqRows[0].status !== '已审核') {
        await transaction.rollback();
        res.status(400).json({ success: false, message: '只有已审核的发货申请可以创建发货单' }); return;
      }

      // 加载申请明细 + 计算每行已分配发货数量（事务内加锁防止并发超发）
      const [reqDetails]: any = await sequelize.query(`
        SELECT d.*,
               ISNULL((SELECT SUM(sod.quantity)
                       FROM shipping_order_detail sod
                       INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
                       WHERE sod.request_number = d.request_number
                         AND sod.sales_detail_id = d.sales_detail_id
                         AND so.status != N'已取消'), 0) as already_shipped_qty
        FROM shipping_request_detail d WITH (UPDLOCK)
        WHERE d.request_number = :rn
      `, { replacements: { rn: b.request_number }, transaction });

      // 逐行校验
      for (const d of b.details) {
        const reqDetail = reqDetails.find((rd: any) => rd.id === d.request_detail_id);
        if (!reqDetail) {
          await transaction.rollback();
          res.status(400).json({ success: false, message: `发货申请明细不存在: ID=${d.request_detail_id}` }); return;
        }
        const remaining = Number(reqDetail.ship_quantity) - Number(reqDetail.already_shipped_qty);
        if (Number(d.quantity) <= 0) {
          await transaction.rollback();
          res.status(400).json({ success: false, message: `物料 ${reqDetail.item_number} 发货数量必须大于0` }); return;
        }
        if (Number(d.quantity) > remaining + 0.0001) {
          await transaction.rollback();
          res.status(400).json({
            success: false,
            message: `物料 ${reqDetail.item_number} 发货数量(${d.quantity})超过可发数量(${remaining})`
          }); return;
        }
        // 批次数量合计校验
        if (d.batches && Array.isArray(d.batches) && d.batches.length > 0) {
          const batchSum = d.batches.reduce((sum: number, bt: any) => sum + (Number(bt.quantity) || 0), 0);
          if (Math.abs(batchSum - Number(d.quantity)) > 0.0001) {
            await transaction.rollback();
            res.status(400).json({
              success: false,
              message: `物料 ${reqDetail.item_number} 批次数量合计(${batchSum})与发货数量(${d.quantity})不一致`
            }); return;
          }
        }
      }

      const shipping_order_number = await generateShippingOrderNumber(transaction);

      // 1. 插入发货单主表 (status = 待发货, 关联发货申请)
      await sequelize.query(`
        INSERT INTO shipping_order
          (shipping_order_number, request_number, customer_number, customer_name,
           warehouse_number, warehouse_name, shipping_date, status,
           carrier, tracking_number, freight,
           shipping_address, contact_person, contact_phone,
           remark, creation_man, creation_date)
        VALUES
          (:shipping_order_number, :request_number, :customer_number, :customer_name,
           :warehouse_number, :warehouse_name, GETDATE(), N'待发货',
           :carrier, :tracking_number, :freight,
           :shipping_address, :contact_person, :contact_phone,
           :remark, :creation_man, GETDATE())
      `, {
        replacements: {
          shipping_order_number,
          request_number: b.request_number,
          customer_number: b.customer_number || reqRows[0].customer_number || '',
          customer_name: b.customer_name || reqRows[0].customer_name || '',
          warehouse_number: b.warehouse_number || '',
          warehouse_name: b.warehouse_name || '',
          carrier: b.carrier || '',
          tracking_number: b.tracking_number || '',
          freight: b.freight || 0,
          shipping_address: b.shipping_address || '',
          contact_person: b.contact_person || '',
          contact_phone: b.contact_phone || '',
          remark: b.remark || '',
          creation_man: (req as any).user?.username || ''
        },
        transaction
      });

      // 2. 遍历明细行：插入 shipping_order_detail + shipping_order_batch
      for (let i = 0; i < b.details.length; i++) {
        const d = b.details[i];
        const reqDetail = reqDetails.find((rd: any) => rd.id === d.request_detail_id);

        // 插入明细行并获取自增 ID
        const [insertResult]: any = await sequelize.query(`
          INSERT INTO shipping_order_detail
            (shipping_order_number, line_number, request_number,
             sales_order_number, sales_detail_id,
             item_number, item_name, specifications, basic_unit, product_drawing_number,
             quantity, remark)
          VALUES
            (:shipping_order_number, :line_number, :request_number,
             :sales_order_number, :sales_detail_id,
             :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
             :quantity, :remark);
          SELECT SCOPE_IDENTITY() AS detail_id;
        `, {
          replacements: {
            shipping_order_number,
            line_number: (i + 1) * 10,
            request_number: b.request_number,
            sales_order_number: reqDetail?.sales_order_number || '',
            sales_detail_id: reqDetail?.sales_detail_id || 0,
            item_number: reqDetail?.item_number || '',
            item_name: reqDetail?.item_name || '',
            specifications: reqDetail?.specifications || '',
            basic_unit: reqDetail?.basic_unit || '',
            product_drawing_number: reqDetail?.product_drawing_number || '',
            quantity: Number(d.quantity) || 0,
            remark: d.remark || ''
          },
          transaction
        });

        const detailId = insertResult[0]?.detail_id || 0;

        // 插入批次明细
        if (d.batches && Array.isArray(d.batches)) {
          for (const batch of d.batches) {
            await sequelize.query(`
              INSERT INTO shipping_order_batch
                (shipping_order_number, detail_id, item_number, batch_number, quantity)
              VALUES
                (:shipping_order_number, :detail_id, :item_number, :batch_number, :quantity)
            `, {
              replacements: {
                shipping_order_number,
                detail_id: detailId,
                item_number: reqDetail?.item_number || '',
                batch_number: batch.batch_number || '',
                quantity: Number(batch.quantity) || 0
              },
              transaction
            });
          }
        }

        // 累加申请明细 delivered_quantity
        if (reqDetail?.id) {
          await sequelize.query(
            `UPDATE shipping_request_detail SET shipped_quantity = ISNULL(shipped_quantity, 0) + :qty WHERE id = :id`,
            { replacements: { qty: Number(d.quantity) || 0, id: reqDetail.id }, transaction }
          );
        }
      }

      // 3. 判断发货申请是否所有行都已全部分配发货 → 更新申请状态为"已发货"
      const [remainCheck]: any = await sequelize.query(`
        SELECT d.id, d.ship_quantity,
               ISNULL((SELECT SUM(sod.quantity)
                       FROM shipping_order_detail sod
                       INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
                       WHERE sod.request_number = d.request_number
                         AND sod.sales_detail_id = d.sales_detail_id
                         AND so.status != N'已取消'), 0) as total_shipped
        FROM shipping_request_detail d
        WHERE d.request_number = :rn
      `, { replacements: { rn: b.request_number }, transaction });

      const allFullyShipped = remainCheck.every(
        (r: any) => Number(r.total_shipped) >= Number(r.ship_quantity)
      );
      if (allFullyShipped) {
        await sequelize.query(
          `UPDATE shipping_request SET status = N'已发货' WHERE request_number = :rn`,
          { replacements: { rn: b.request_number }, transaction }
        );
      }

      await transaction.commit();
      res.json(success({ shipping_order_number }, '发货单创建成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 发货单明细列表（批次级别） ====================
export const getShippingOrderDetailsPage = async (req: Request, res: Response, next: NextFunction) => {
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
        const placeholders = statusArr.map((_s, i) => `:status${i}`).join(', ');
        whereClause += ` AND h.status IN (${placeholders})`;
        statusArr.forEach((s, i) => { replacements[`status${i}`] = s; });
      }
    }
    if (search) {
      whereClause += ` AND (h.shipping_order_number LIKE :search OR d.item_number LIKE :search OR d.item_name LIKE :search OR h.customer_name LIKE :search OR d.sales_order_number LIKE :search OR h.carrier LIKE :search OR h.tracking_number LIKE :search OR b.batch_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    // 数据范围过滤：sales 角色只能看到自己负责客户的发货单明细
    const scope = (req as any).dataScope;
    if (scope?.head_of_sales_id) {
      whereClause += ` AND h.customer_number IN (SELECT customer_number FROM customer WHERE head_of_sales_id = :dataScopeUserId)`;
      replacements.dataScopeUserId = scope.head_of_sales_id;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM shipping_order_batch b
       INNER JOIN shipping_order_detail d ON d.id = b.detail_id AND d.shipping_order_number = b.shipping_order_number
       INNER JOIN shipping_order h ON h.shipping_order_number = b.shipping_order_number
       ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT b.id as batch_id, b.batch_number, b.quantity as batch_quantity,
               d.line_number, d.request_number, d.sales_order_number,
               d.item_number, d.item_name, d.specifications, d.basic_unit, d.quantity as line_quantity,
               h.shipping_order_number, h.customer_name, h.warehouse_name, h.status as order_status,
               h.shipping_date, h.carrier, h.tracking_number, h.creation_man, h.creation_date as order_creation_date,
               ROW_NUMBER() OVER (ORDER BY h.creation_date DESC, b.shipping_order_number, d.line_number, b.id) AS _row_num
        FROM shipping_order_batch b
        INNER JOIN shipping_order_detail d ON d.id = b.detail_id AND d.shipping_order_number = b.shipping_order_number
        INNER JOIN shipping_order h ON h.shipping_order_number = b.shipping_order_number
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

// ==================== 导出选中发货单明细 ====================
export const exportShippingOrderDetailsSelected = async (req: Request, res: Response, next: NextFunction) => {
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
      SELECT h.shipping_order_number, h.customer_name, h.warehouse_name, h.status as order_status,
             h.shipping_date, h.carrier, h.tracking_number, h.creation_man, h.creation_date as order_creation_date,
             d.line_number, d.request_number, d.sales_order_number,
             d.item_number, d.item_name, d.specifications, d.basic_unit, d.quantity as line_quantity,
             b.batch_number, b.quantity as batch_quantity
      FROM shipping_order_batch b
      INNER JOIN shipping_order_detail d ON d.id = b.detail_id AND d.shipping_order_number = b.shipping_order_number
      INNER JOIN shipping_order h ON h.shipping_order_number = b.shipping_order_number
      WHERE b.id IN (${placeholders})
      ORDER BY h.shipping_order_number, d.line_number, b.id
    `, { replacements });

    const fields = [
      'shipping_order_number', 'order_status', 'customer_name', 'line_number', 'batch_number',
      'request_number', 'sales_order_number',
      'item_number', 'item_name', 'specifications', 'basic_unit',
      'batch_quantity', 'line_quantity', 'warehouse_name',
      'carrier', 'tracking_number', 'shipping_date', 'creation_man', 'order_creation_date'
    ];
    const headers = [
      '发货单号', '状态', '客户名称', '行号', '批次号',
      '申请单号', '销售订单号',
      '产品编号', '产品名称', '规格', '单位',
      '批次数量', '行发货量', '出库仓库',
      '承运商', '运单号', '发货日期', '创建人', '创建时间'
    ];
    exportToExcel(items, fields, headers, 'shipping_order_details_selected', res);
  } catch (err) { next(err); }
};

// ==================== 发货单列表 ====================
export const getShippingOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = {};

    if (search) {
      whereClause += ` AND (so.shipping_order_number LIKE :search OR so.customer_name LIKE :search OR so.carrier LIKE :search OR so.tracking_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (status) {
      whereClause += ` AND so.status = :status`;
      replacements.status = status;
    }

    // 数据范围过滤：sales 角色只能看到自己负责客户的发货单
    const scope = (req as any).dataScope;
    if (scope?.head_of_sales_id) {
      whereClause += ` AND so.customer_number IN (SELECT customer_number FROM customer WHERE head_of_sales_id = :dataScopeUserId)`;
      replacements.dataScopeUserId = scope.head_of_sales_id;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM shipping_order so ${whereClause}`,
      { replacements }
    );
    const total = countResult[0]?.total || 0;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT so.*, ROW_NUMBER() OVER (ORDER BY so.creation_date DESC) as rn
        FROM shipping_order so
        ${whereClause}
      ) t WHERE t.rn > :offset AND t.rn <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd } });

    res.json(success({ items, total, page: pageNum, limit: pageSize }));
  } catch (err) { next(err); }
};

// ==================== 发货单详情 ====================
export const getShippingOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shipping_order_number } = req.params;

    // 主表
    const [headerRows]: any = await sequelize.query(
      `SELECT * FROM shipping_order WHERE shipping_order_number = :sn`,
      { replacements: { sn: shipping_order_number } }
    );
    if (headerRows.length === 0) {
      res.status(404).json({ success: false, message: '发货单不存在' }); return;
    }

    // 明细
    const [details]: any = await sequelize.query(
      `SELECT * FROM shipping_order_detail WHERE shipping_order_number = :sn ORDER BY line_number`,
      { replacements: { sn: shipping_order_number } }
    );

    // 批次明细
    const [batches]: any = await sequelize.query(
      `SELECT * FROM shipping_order_batch WHERE shipping_order_number = :sn ORDER BY detail_id, id`,
      { replacements: { sn: shipping_order_number } }
    );

    // 将批次明细挂到对应的明细行上
    const detailsWithBatches = details.map((d: any) => ({
      ...d,
      batches: batches.filter((b: any) => b.detail_id === d.id)
    }));

    res.json(success({ header: headerRows[0], details: detailsWithBatches }));
  } catch (err) { next(err); }
};

// ==================== 更新物流信息 ====================
export const updateLogistics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shipping_order_number } = req.params;
    const { carrier, tracking_number, freight, shipping_address, contact_person, contact_phone } = req.body;

    const [existing]: any = await sequelize.query(
      `SELECT id, status FROM shipping_order WHERE shipping_order_number = :sn`,
      { replacements: { sn: shipping_order_number } }
    );
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: '发货单不存在' }); return;
    }
    if (existing[0].status === '已取消') {
      res.status(400).json({ success: false, message: '已取消的发货单不能编辑物流信息' }); return;
    }

    await sequelize.query(`
      UPDATE shipping_order SET
        carrier = :carrier,
        tracking_number = :tracking_number,
        freight = :freight,
        shipping_address = :shipping_address,
        contact_person = :contact_person,
        contact_phone = :contact_phone
      WHERE shipping_order_number = :sn
    `, {
      replacements: {
        sn: shipping_order_number,
        carrier: carrier || '',
        tracking_number: tracking_number || '',
        freight: freight || 0,
        shipping_address: shipping_address || '',
        contact_person: contact_person || '',
        contact_phone: contact_phone || ''
      }
    });

    res.json(success(null, '物流信息更新成功'));
  } catch (err) { next(err); }
};

// ==================== 更新状态 ====================
export const updateStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shipping_order_number } = req.params;
    const { status: newStatus } = req.body;

    if (!['已签收', '已发货'].includes(newStatus)) {
      res.status(400).json({ success: false, message: '无效的状态值，撤消请使用撤消接口' }); return;
    }

    const [existing]: any = await sequelize.query(
      `SELECT id, status FROM shipping_order WHERE shipping_order_number = :sn`,
      { replacements: { sn: shipping_order_number } }
    );
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: '发货单不存在' }); return;
    }

    const currentStatus = existing[0].status;
    if (currentStatus === '已取消') {
      res.status(400).json({ success: false, message: '已取消的发货单不能修改状态' }); return;
    }
    if (currentStatus === '已签收' && newStatus !== '已发货') {
      res.status(400).json({ success: false, message: '已签收的发货单不能修改状态' }); return;
    }

    await sequelize.query(
      `UPDATE shipping_order SET status = :status WHERE shipping_order_number = :sn`,
      { replacements: { sn: shipping_order_number, status: newStatus } }
    );

    res.json(success(null, `状态已更新为"${newStatus}"`));
  } catch (err) { next(err); }
};

// ==================== 撤消发货单（含回写申请状态 + 订单已发数量） ====================
export const cancelShippingOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shipping_order_number } = req.params;

    const transaction = await sequelize.transaction();
    try {
      // 1. 查询发货单状态（加锁）
      const [soRows]: any = await sequelize.query(
        `SELECT * FROM shipping_order WITH (UPDLOCK) WHERE shipping_order_number = :sn`,
        { replacements: { sn: shipping_order_number }, transaction }
      );
      if (soRows.length === 0) {
        await transaction.rollback();
        res.status(404).json({ success: false, message: '发货单不存在' }); return;
      }

      const currentStatus = soRows[0].status;
      if (currentStatus === '已取消') {
        await transaction.rollback();
        res.status(400).json({ success: false, message: '该发货单已取消' }); return;
      }
      if (currentStatus === '已签收') {
        await transaction.rollback();
        res.status(400).json({ success: false, message: '已签收的发货单不可撤消' }); return;
      }

      // 2. 已发货状态需检查是否已有非取消/非驳回的退货单
      if (currentStatus === '已发货') {
        const [rtCheck]: any = await sequelize.query(`
          SELECT TOP 1 return_order_number
          FROM return_order
          WHERE shipping_order_number = :sn
            AND status NOT IN (N'已驳回')
        `, { replacements: { sn: shipping_order_number }, transaction });

        if (rtCheck.length > 0) {
          await transaction.rollback();
          res.status(400).json({
            success: false,
            message: `该发货单已有退货单(${rtCheck[0].return_order_number})，请先处理退货单`
          }); return;
        }

        // 2.1 检查明细行是否有已开票/部分开票的
        const [invCheck]: any = await sequelize.query(`
          SELECT TOP 1 sod.item_number, sod.invoice_status
          FROM shipping_order_detail sod
          WHERE sod.shipping_order_number = :sn
            AND (sod.invoice_status = N'已开票' OR sod.invoice_status = N'部分开票')
        `, { replacements: { sn: shipping_order_number }, transaction });

        if (invCheck.length > 0) {
          await transaction.rollback();
          res.status(400).json({
            success: false,
            message: `发货明细「${invCheck[0].item_number}」已开票(${invCheck[0].invoice_status})，请先处理发票`
          }); return;
        }
      }

      // 3. 查询发货单明细（用于回写）
      const [soDetails]: any = await sequelize.query(
        `SELECT * FROM shipping_order_detail WHERE shipping_order_number = :sn`,
        { replacements: { sn: shipping_order_number }, transaction }
      );

      // 4. 更新发货单状态为已取消
      await sequelize.query(
        `UPDATE shipping_order SET status = N'已取消' WHERE shipping_order_number = :sn`,
        { replacements: { sn: shipping_order_number }, transaction }
      );

      // 4.5 已发货状态：回冲成品库存 + 标记流水作废
      if (currentStatus === '已发货') {
        const operator = (req as any).user?.username || '';

        // 查找关联的库存流水
        const [txRows]: any = await sequelize.query(
          `SELECT * FROM inventory_transaction WHERE shipping_order_number = :sn AND transaction_type = N'出库' AND source_type LIKE N'发货出库%' AND ISNULL(status, '') != N'作废'`,
          { replacements: { sn: shipping_order_number }, transaction }
        );

        // 回冲批次库存
        const txNumbers = txRows.map((t: any) => t.transaction_number);
        if (txNumbers.length > 0) {
          const [batchRows]: any = await sequelize.query(
            `SELECT * FROM inventory_transaction_batch WHERE transaction_number IN (:txns) ORDER BY id`,
            { replacements: { txns: txNumbers }, transaction }
          );

          for (const b of batchRows) {
            const parentTx = txRows.find((t: any) => t.transaction_number === b.transaction_number);
            if (!parentTx) continue;

            // 加回批次库存
            const [batchInv]: any = await sequelize.query(
              `SELECT id, quantity FROM finished_batch_inventory WHERE batch_number = :bn AND item_number = :in AND warehouse_number = :wn`,
              { replacements: { bn: b.batch_number, in: parentTx.item_number, wn: parentTx.warehouse_number }, transaction }
            );

            if (batchInv.length > 0) {
              const newQty = Number(batchInv[0].quantity) + Number(b.quantity);
              await sequelize.query(
                `UPDATE finished_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
                { replacements: { qty: newQty, id: batchInv[0].id }, transaction }
              );
            } else {
              // 批次记录已不存在，重新创建
              await sequelize.query(`
                INSERT INTO finished_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit,
                  product_drawing_number, warehouse_number, warehouse_name, quantity, initial_quantity,
                  production_order_number, inbound_date, status, quality_status, creation_date, last_updated)
                VALUES (:batch_number, :item_number, :item_name, :specifications, :basic_unit,
                  :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quantity,
                  N'', GETDATE(), N'正常', :quality_status, GETDATE(), GETDATE())
              `, {
                replacements: {
                  batch_number: b.batch_number,
                  item_number: parentTx.item_number, item_name: parentTx.item_name || '',
                  specifications: parentTx.specifications || '', basic_unit: parentTx.basic_unit || '',
                  product_drawing_number: parentTx.product_drawing_number || '',
                  warehouse_number: parentTx.warehouse_number, warehouse_name: parentTx.warehouse_name || '',
                  quantity: b.quantity, quality_status: parentTx.quality_status || '合格品'
                }, transaction
              });
            }
          }

          // 同步汇总库存
          for (const tx of txRows) {
            await syncFinishedGoodsSummary(tx.item_number, tx.warehouse_number, transaction, tx.quality_status || '合格品');
          }

          // 标记库存流水为作废
          await sequelize.query(
            `UPDATE inventory_transaction SET status = N'作废', void_operator = :op, void_date = GETDATE() WHERE shipping_order_number = :sn AND transaction_type = N'出库' AND source_type LIKE N'发货出库%' AND ISNULL(status, '') != N'作废'`,
            { replacements: { sn: shipping_order_number, op: operator }, transaction }
          );
        }

        // 扫箱码出库的箱号回冲
        const [boxTxRows]: any = await sequelize.query(
          `SELECT DISTINCT source_number FROM inventory_transaction WHERE shipping_order_number = :sn AND source_type = N'发货出库(箱)'`,
          { replacements: { sn: shipping_order_number }, transaction }
        );
        for (const boxTx of boxTxRows) {
          const boxNumber = boxTx.source_number;
          if (boxNumber) {
            await sequelize.query(
              `UPDATE packing_box_inventory SET status = N'在库', outbound_date = NULL, last_updated = GETDATE() WHERE box_number = :bn AND status = N'已出库'`,
              { replacements: { bn: boxNumber }, transaction }
            );
            await sequelize.query(
              `UPDATE packing_box SET status = N'在库' WHERE box_number = :bn AND status = N'已出库'`,
              { replacements: { bn: boxNumber }, transaction }
            );
          }
        }
      }

      // 4.1 扣减申请明细 shipped_quantity
      for (const d of soDetails) {
        if (d.request_number) {
          await sequelize.query(`
            UPDATE shipping_request_detail
            SET shipped_quantity = IIF(ISNULL(shipped_quantity, 0) - :qty < 0, 0, ISNULL(shipped_quantity, 0) - :qty)
            WHERE request_number = :rn AND sales_detail_id = :sid
          `, {
            replacements: {
              qty: Number(d.quantity) || 0,
              rn: d.request_number,
              sid: d.sales_detail_id || 0
            }, transaction
          });
        }
      }

      // 5. 回写销售订单明细：如果是已发货状态，需扣减 shipped_quantity
      if (currentStatus === '已发货') {
        for (const d of soDetails) {
          if (d.sales_detail_id && d.sales_detail_id > 0) {
            const qty = Number(d.quantity) || 0;
            // 扣减已发数量
            await sequelize.query(
              `UPDATE sales_order_detail SET shipped_quantity = IIF(ISNULL(shipped_quantity, 0) - :qty < 0, 0, ISNULL(shipped_quantity, 0) - :qty) WHERE id = :id`,
              { replacements: { qty, id: d.sales_detail_id }, transaction }
            );
          }
        }
      }

      // 6. 重新计算各 sales_order_detail 的 shipping_status
      const salesDetailIds = [...new Set(
        soDetails
          .map((d: any) => d.sales_detail_id)
          .filter((id: number) => id > 0)
      )];

      for (const detailId of salesDetailIds) {
        // 查询该订单明细行的当前数据
        const [detailRows]: any = await sequelize.query(
          `SELECT order_quantity, ISNULL(shipped_quantity, 0) as shipped_quantity FROM sales_order_detail WHERE id = :id`,
          { replacements: { id: detailId }, transaction }
        );
        if (detailRows.length === 0) continue;

        const orderQty = Number(detailRows[0].order_quantity) || 0;
        const shippedQty = Number(detailRows[0].shipped_quantity) || 0;

        // 同时查询该行所有非取消申请的申请量
        const [aggRows]: any = await sequelize.query(`
          SELECT ISNULL(SUM(srd.ship_quantity), 0) as total_applied
          FROM shipping_request_detail srd
          INNER JOIN shipping_request sr ON sr.request_number = srd.request_number
          WHERE srd.sales_detail_id = :detailId AND sr.status != N'已取消'
        `, { replacements: { detailId }, transaction });
        const totalApplied = Number(aggRows[0]?.total_applied) || 0;

        // 综合判断 shipping_status：优先看实发，再看申请
        let newStatus = '未申请';
        if (shippedQty > 0) {
          if (shippedQty >= orderQty) {
            newStatus = shippedQty > orderQty ? '超额发货' : '全部发货';
          } else {
            newStatus = '部分发货';
          }
        } else if (totalApplied > 0) {
          if (totalApplied >= orderQty) {
            newStatus = totalApplied > orderQty ? '超额发货' : '全部发货';
          } else {
            newStatus = '部分发货';
          }
        }

        await sequelize.query(
          `UPDATE sales_order_detail SET shipping_status = :status WHERE id = :id`,
          { replacements: { status: newStatus, id: detailId }, transaction }
        );
        // 同步行状态 + 订单头状态
        await syncLineStatus(detailId as number, transaction);
      }

      // 7. 回写发货申请状态：重新判断申请是否全部发完
      const requestNumbers = [...new Set(
        soDetails
          .map((d: any) => d.request_number)
          .filter((rn: string) => rn)
      )];

      for (const rn of requestNumbers) {
        // 查询申请当前状态
        const [srRows]: any = await sequelize.query(
          `SELECT status FROM shipping_request WHERE request_number = :rn`,
          { replacements: { rn }, transaction }
        );
        if (srRows.length === 0) continue;
        // 只有当前状态为"已发货"的申请才需要回退
        if (srRows[0].status !== '已发货') continue;

        // 检查该申请下所有行是否仍全部发完
        const [remainCheck]: any = await sequelize.query(`
          SELECT d.id, d.ship_quantity,
                 ISNULL((SELECT SUM(sod.quantity)
                         FROM shipping_order_detail sod
                         INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
                         WHERE sod.request_number = d.request_number
                           AND sod.sales_detail_id = d.sales_detail_id
                           AND so.status != N'已取消'), 0) as total_shipped
          FROM shipping_request_detail d
          WHERE d.request_number = :rn
        `, { replacements: { rn }, transaction });

        const allFullyShipped = remainCheck.every(
          (r: any) => Number(r.total_shipped) >= Number(r.ship_quantity)
        );

        if (!allFullyShipped) {
          // 回退申请状态为“已审核”
          await sequelize.query(
            `UPDATE shipping_request SET status = N'已审核' WHERE request_number = :rn`,
            { replacements: { rn }, transaction }
          );
        }
      }

      await transaction.commit();
      res.json(success(null, '发货单已撤消'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 获取打印数据 ====================
export const getPrintData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shipping_order_number } = req.params;

    // 主表
    const [headerRows]: any = await sequelize.query(
      `SELECT * FROM shipping_order WHERE shipping_order_number = :sn`,
      { replacements: { sn: shipping_order_number } }
    );
    if (headerRows.length === 0) {
      res.status(404).json({ success: false, message: '发货单不存在' }); return;
    }

    // 明细
    const [details]: any = await sequelize.query(
      `SELECT * FROM shipping_order_detail WHERE shipping_order_number = :sn ORDER BY line_number`,
      { replacements: { sn: shipping_order_number } }
    );

    // 批次明细
    const [batches]: any = await sequelize.query(
      `SELECT * FROM shipping_order_batch WHERE shipping_order_number = :sn ORDER BY detail_id, id`,
      { replacements: { sn: shipping_order_number } }
    );

    const detailsWithBatches = details.map((d: any) => ({
      ...d,
      batches: batches.filter((b: any) => b.detail_id === d.id)
    }));

    res.json(success({ header: headerRows[0], details: detailsWithBatches }));
  } catch (err) { next(err); }
};
