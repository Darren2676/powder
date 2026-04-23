import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { returnInbound as returnInboundService } from '@/services/warehouse.service';
import { syncReturnStatus, syncLineStatus } from '@/services/salesOrderSync.service';

// ==================== 编号生成 ====================
const generateReturnOrderNumber = async (transaction?: any): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `RT-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(return_order_number) as max_num FROM return_order WHERE return_order_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' }, ...(transaction ? { transaction } : {}) }
  );

  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 退货单列表 ====================
export const getList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', type = '', status = '', approval_status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = {};

    if (search) {
      whereClause += ` AND (ro.return_order_number LIKE :search OR ro.shipping_order_number LIKE :search OR ro.customer_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (type) {
      whereClause += ` AND ro.type = :type`;
      replacements.type = type;
    }
    if (status) {
      whereClause += ` AND ro.status = :status`;
      replacements.status = status;
    }
    if (approval_status) {
      whereClause += ` AND ro.approval_status = :approval_status`;
      replacements.approval_status = approval_status;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM return_order ro ${whereClause}`,
      { replacements }
    );
    const total = countResult[0]?.total || 0;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT ro.*, ROW_NUMBER() OVER (ORDER BY ro.creation_date DESC) as rn
        FROM return_order ro
        ${whereClause}
      ) t WHERE t.rn > :offset AND t.rn <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd } });

    res.json(success({ items, total, page: pageNum, limit: pageSize }));
  } catch (err) { next(err); }
};

// ==================== 退货单详情 ====================
export const getDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { return_order_number } = req.params;

    const [headerRows]: any = await sequelize.query(
      `SELECT * FROM return_order WHERE return_order_number = :rn`,
      { replacements: { rn: return_order_number } }
    );
    if (headerRows.length === 0) {
      res.status(404).json({ success: false, message: '退货单不存在' }); return;
    }

    const [details]: any = await sequelize.query(
      `SELECT * FROM return_order_detail WHERE return_order_number = :rn ORDER BY line_number`,
      { replacements: { rn: return_order_number } }
    );

    const [batches]: any = await sequelize.query(
      `SELECT * FROM return_order_batch WHERE return_order_number = :rn ORDER BY detail_id, id`,
      { replacements: { rn: return_order_number } }
    );

    const detailsWithBatches = details.map((d: any) => ({
      ...d,
      batches: batches.filter((b: any) => b.detail_id === d.id)
    }));

    res.json(success({ header: headerRows[0], details: detailsWithBatches }));
  } catch (err) { next(err); }
};

// ==================== 获取发货单信息（用于创建退货单） ====================
// 返回发货单的明细和批次，并计算每个批次的可退数量
export const getShippingOrderForReturn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { shipping_order_number } = req.params;

    // 获取发货单主表
    const [headerRows]: any = await sequelize.query(
      `SELECT * FROM shipping_order WHERE shipping_order_number = :sn`,
      { replacements: { sn: shipping_order_number } }
    );
    if (headerRows.length === 0) {
      res.status(404).json({ success: false, message: '发货单不存在' }); return;
    }

    const header = headerRows[0];
    if (!['已发货', '已签收'].includes(header.status)) {
      res.status(400).json({ success: false, message: `发货单状态为"${header.status}"，不允许退货` }); return;
    }

    // 获取发货单明细
    const [details]: any = await sequelize.query(
      `SELECT * FROM shipping_order_detail WHERE shipping_order_number = :sn ORDER BY line_number`,
      { replacements: { sn: shipping_order_number } }
    );

    // 获取发货单批次明细
    const [batches]: any = await sequelize.query(
      `SELECT * FROM shipping_order_batch WHERE shipping_order_number = :sn ORDER BY detail_id, id`,
      { replacements: { sn: shipping_order_number } }
    );

    // 查询已有退货单中各批次已退数量（排除已驳回的）
    const [returnedBatches]: any = await sequelize.query(`
      SELECT rob.batch_number, rod.shipping_order_detail_id, SUM(rob.quantity) as returned_qty
      FROM return_order_batch rob
      INNER JOIN return_order_detail rod ON rob.detail_id = rod.id AND rob.return_order_number = rod.return_order_number
      INNER JOIN return_order ro ON ro.return_order_number = rod.return_order_number
      WHERE ro.shipping_order_number = :sn AND ro.status != N'已驳回'
      GROUP BY rob.batch_number, rod.shipping_order_detail_id
    `, { replacements: { sn: shipping_order_number } });

    // 构建已退数量映射 key: `${detail_id}_${batch_number}`
    const returnedMap: Record<string, number> = {};
    for (const rb of returnedBatches) {
      const key = `${rb.shipping_order_detail_id}_${rb.batch_number}`;
      returnedMap[key] = Number(rb.returned_qty) || 0;
    }

    // 组装明细+批次，计算可退数量
    const detailsWithBatches = details.map((d: any) => {
      const detailBatches = batches.filter((b: any) => b.detail_id === d.id);
      const batchesWithReturnable = detailBatches.map((b: any) => {
        const key = `${d.id}_${b.batch_number}`;
        const returnedQty = returnedMap[key] || 0;
        const shippedQty = Number(b.quantity) || 0;
        return {
          ...b,
          returned_quantity: returnedQty,
          returnable_quantity: Math.max(0, shippedQty - returnedQty)
        };
      });
      return {
        ...d,
        batches: batchesWithReturnable
      };
    });

    res.json(success({ header, details: detailsWithBatches }));
  } catch (err) { next(err); }
};

// ==================== 创建退货单 ====================
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.shipping_order_number) {
      res.status(400).json({ success: false, message: '请选择发货单' }); return;
    }
    if (!b.type || !['退款退货', '退货换货'].includes(b.type)) {
      res.status(400).json({ success: false, message: '请选择退货类型' }); return;
    }
    if (!b.details || !Array.isArray(b.details) || b.details.length === 0) {
      res.status(400).json({ success: false, message: '请添加至少一条退货明细' }); return;
    }
    if (!b.warehouse_number || !b.warehouse_name) {
      res.status(400).json({ success: false, message: '请选择退货入库仓库' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      const returnOrderNumber = await generateReturnOrderNumber(transaction);

      // 校验发货单
      const [soRows]: any = await sequelize.query(
        `SELECT * FROM shipping_order WHERE shipping_order_number = :sn`,
        { replacements: { sn: b.shipping_order_number }, transaction }
      );
      if (soRows.length === 0) {
        await transaction.rollback();
        res.status(400).json({ success: false, message: '发货单不存在' }); return;
      }
      if (!['已发货', '已签收'].includes(soRows[0].status)) {
        await transaction.rollback();
        res.status(400).json({ success: false, message: `发货单状态为"${soRows[0].status}"，不允许退货` }); return;
      }

      // 插入主表
      await sequelize.query(`
        INSERT INTO return_order (return_order_number, type, shipping_order_number,
          customer_number, customer_name, warehouse_number, warehouse_name,
          status, approval_status, reason, remark, creation_man, creation_date, accounting_period)
        VALUES (:return_order_number, :type, :shipping_order_number,
          :customer_number, :customer_name, :warehouse_number, :warehouse_name,
          N'待确认', N'草稿', :reason, :remark, :creation_man, GETDATE(), CONVERT(NVARCHAR(7), GETDATE(), 120))
      `, {
        replacements: {
          return_order_number: returnOrderNumber,
          type: b.type,
          shipping_order_number: b.shipping_order_number,
          customer_number: soRows[0].customer_number || '',
          customer_name: soRows[0].customer_name || '',
          warehouse_number: b.warehouse_number,
          warehouse_name: b.warehouse_name,
          reason: b.reason || '',
          remark: b.remark || '',
          creation_man: (req as any).user?.username || ''
        }, transaction
      });

      // 插入明细 + 批次
      let lineNumber = 0;
      for (const detail of b.details) {
        lineNumber++;
        const returnQty = Number(detail.return_quantity) || 0;
        if (returnQty <= 0) continue;

        const [insertResult]: any = await sequelize.query(`
          INSERT INTO return_order_detail (return_order_number, line_number, shipping_order_detail_id,
            sales_order_number, sales_detail_id, item_number, item_name, specifications,
            basic_unit, product_drawing_number, shipped_quantity, return_quantity, remark)
          VALUES (:return_order_number, :line_number, :shipping_order_detail_id,
            :sales_order_number, :sales_detail_id, :item_number, :item_name, :specifications,
            :basic_unit, :product_drawing_number, :shipped_quantity, :return_quantity, :remark);
          SELECT SCOPE_IDENTITY() AS detail_id;
        `, {
          replacements: {
            return_order_number: returnOrderNumber,
            line_number: lineNumber,
            shipping_order_detail_id: detail.shipping_order_detail_id || 0,
            sales_order_number: detail.sales_order_number || '',
            sales_detail_id: detail.sales_detail_id || 0,
            item_number: detail.item_number || '',
            item_name: detail.item_name || '',
            specifications: detail.specifications || '',
            basic_unit: detail.basic_unit || '',
            product_drawing_number: detail.product_drawing_number || '',
            shipped_quantity: detail.shipped_quantity || 0,
            return_quantity: returnQty,
            remark: detail.remark || ''
          }, transaction
        });

        const detailId = insertResult[0]?.detail_id;

        // 插入批次明细
        if (detail.batches && Array.isArray(detail.batches)) {
          for (const batch of detail.batches) {
            const batchQty = Number(batch.quantity) || 0;
            if (batchQty <= 0) continue;
            await sequelize.query(`
              INSERT INTO return_order_batch (return_order_number, detail_id, batch_number, quantity)
              VALUES (:return_order_number, :detail_id, :batch_number, :quantity)
            `, {
              replacements: {
                return_order_number: returnOrderNumber,
                detail_id: detailId,
                batch_number: batch.batch_number || '',
                quantity: batchQty
              }, transaction
            });
          }
        }
      }

      await transaction.commit();
      res.json(success({ return_order_number: returnOrderNumber }, '退货单创建成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 更新退货单（仅草稿） ====================
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { return_order_number } = req.params;
    const b = req.body;

    const [existing]: any = await sequelize.query(
      `SELECT id, approval_status FROM return_order WHERE return_order_number = :rn`,
      { replacements: { rn: return_order_number } }
    );
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: '退货单不存在' }); return;
    }
    if (existing[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(400).json({ success: false, message: '只有草稿状态可以编辑' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      // 更新主表
      await sequelize.query(`
        UPDATE return_order SET
          type = :type, warehouse_number = :warehouse_number, warehouse_name = :warehouse_name,
          reason = :reason, remark = :remark, accounting_period = :accounting_period
        WHERE return_order_number = :rn
      `, {
        replacements: {
          rn: return_order_number,
          type: b.type || '退款退货',
          warehouse_number: b.warehouse_number || '',
          warehouse_name: b.warehouse_name || '',
          reason: b.reason || '',
          remark: b.remark || '',
          accounting_period: b.accounting_period || ''
        }, transaction
      });

      // 删除旧明细和批次
      await sequelize.query(
        `DELETE FROM return_order_batch WHERE return_order_number = :rn`,
        { replacements: { rn: return_order_number }, transaction }
      );
      await sequelize.query(
        `DELETE FROM return_order_detail WHERE return_order_number = :rn`,
        { replacements: { rn: return_order_number }, transaction }
      );

      // 重新插入明细 + 批次
      let lineNumber = 0;
      if (b.details && Array.isArray(b.details)) {
        for (const detail of b.details) {
          lineNumber++;
          const returnQty = Number(detail.return_quantity) || 0;
          if (returnQty <= 0) continue;

          const [insertResult]: any = await sequelize.query(`
            INSERT INTO return_order_detail (return_order_number, line_number, shipping_order_detail_id,
              sales_order_number, sales_detail_id, item_number, item_name, specifications,
              basic_unit, product_drawing_number, shipped_quantity, return_quantity, remark)
            VALUES (:return_order_number, :line_number, :shipping_order_detail_id,
              :sales_order_number, :sales_detail_id, :item_number, :item_name, :specifications,
              :basic_unit, :product_drawing_number, :shipped_quantity, :return_quantity, :remark);
            SELECT SCOPE_IDENTITY() AS detail_id;
          `, {
            replacements: {
              return_order_number,
              line_number: lineNumber,
              shipping_order_detail_id: detail.shipping_order_detail_id || 0,
              sales_order_number: detail.sales_order_number || '',
              sales_detail_id: detail.sales_detail_id || 0,
              item_number: detail.item_number || '',
              item_name: detail.item_name || '',
              specifications: detail.specifications || '',
              basic_unit: detail.basic_unit || '',
              product_drawing_number: detail.product_drawing_number || '',
              shipped_quantity: detail.shipped_quantity || 0,
              return_quantity: returnQty,
              remark: detail.remark || ''
            }, transaction
          });

          const detailId = insertResult[0]?.detail_id;

          if (detail.batches && Array.isArray(detail.batches)) {
            for (const batch of detail.batches) {
              const batchQty = Number(batch.quantity) || 0;
              if (batchQty <= 0) continue;
              await sequelize.query(`
                INSERT INTO return_order_batch (return_order_number, detail_id, batch_number, quantity)
                VALUES (:return_order_number, :detail_id, :batch_number, :quantity)
              `, {
                replacements: {
                  return_order_number,
                  detail_id: detailId,
                  batch_number: batch.batch_number || '',
                  quantity: batchQty
                }, transaction
              });
            }
          }
        }
      }

      await transaction.commit();
      res.json(success(null, '退货单更新成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 删除退货单（仅草稿） ====================
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { return_order_number } = req.params;

    const [existing]: any = await sequelize.query(
      `SELECT id, approval_status FROM return_order WHERE return_order_number = :rn`,
      { replacements: { rn: return_order_number } }
    );
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: '退货单不存在' }); return;
    }
    if (existing[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(400).json({ success: false, message: '只有草稿状态可以删除' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(
        `DELETE FROM return_order_batch WHERE return_order_number = :rn`,
        { replacements: { rn: return_order_number }, transaction }
      );
      await sequelize.query(
        `DELETE FROM return_order_detail WHERE return_order_number = :rn`,
        { replacements: { rn: return_order_number }, transaction }
      );
      await sequelize.query(
        `DELETE FROM return_order WHERE return_order_number = :rn`,
        { replacements: { rn: return_order_number }, transaction }
      );
      await transaction.commit();
      res.json(success(null, '退货单已删除'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 确认退货（含回写 refunded_quantity + 重算 shipping_status） ====================
export const confirm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const rn = req.params.return_order_number as string;
    const { confirm_remark = '' } = req.body;
    const operator = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      // 1. 校验退货单状态（加锁）
      const [headerRows]: any = await sequelize.query(
        `SELECT * FROM return_order WITH (UPDLOCK) WHERE return_order_number = :rn`,
        { replacements: { rn }, transaction }
      );
      if (headerRows.length === 0) {
        await transaction.rollback();
        res.status(404).json({ success: false, message: '退货单不存在' }); return;
      }
      if (headerRows[0].status === '已确认') {
        await transaction.rollback();
        res.status(400).json({ success: false, message: '该退货单已确认' }); return;
      }
      if (headerRows[0].approval_status !== '已审批') {
        await transaction.rollback();
        res.status(400).json({ success: false, message: '只有已审批状态可以确认退货' }); return;
      }

      // 2. 更新退货单状态
      await sequelize.query(`
        UPDATE return_order SET status = N'已确认',
          confirmed_by = :confirmed_by, confirmed_date = GETDATE(), confirm_remark = :confirm_remark
        WHERE return_order_number = :rn
      `, {
        replacements: { rn, confirmed_by: operator, confirm_remark },
        transaction
      });

      // 3. 查询退货单明细（用于回写）
      const [rtDetails]: any = await sequelize.query(
        `SELECT * FROM return_order_detail WHERE return_order_number = :rn`,
        { replacements: { rn }, transaction }
      );

      // 4. 回写 sales_order_detail.refunded_quantity：累加退货数量 + 同步 return_status
      for (const d of rtDetails) {
        if (d.sales_detail_id && d.sales_detail_id > 0) {
          const qty = Number(d.return_quantity) || 0;
          await sequelize.query(
            `UPDATE sales_order_detail SET refunded_quantity = ISNULL(refunded_quantity, 0) + :qty WHERE id = :id`,
            { replacements: { qty, id: d.sales_detail_id }, transaction }
          );
          // 回写 return_status
          await syncReturnStatus(d.sales_detail_id, transaction);
        }
      }

      // 5. 重新计算各 sales_order_detail 的 shipping_status
      const salesDetailIds = [...new Set(
        rtDetails
          .map((d: any) => d.sales_detail_id)
          .filter((id: number) => id > 0)
      )];

      for (const detailId of salesDetailIds) {
        const [detailRows]: any = await sequelize.query(
          `SELECT order_quantity, ISNULL(shipped_quantity, 0) as shipped_quantity,
                 ISNULL(refunded_quantity, 0) as refunded_quantity
           FROM sales_order_detail WHERE id = :id`,
          { replacements: { id: detailId }, transaction }
        );
        if (detailRows.length === 0) continue;

        const orderQty = Number(detailRows[0].order_quantity) || 0;
        const shippedQty = Number(detailRows[0].shipped_quantity) || 0;
        const refundedQty = Number(detailRows[0].refunded_quantity) || 0;
        // 实际净发 = shipped - refunded
        const netShipped = shippedQty - refundedQty;

        let newStatus = '未申请';
        if (netShipped > 0) {
          if (netShipped >= orderQty) {
            newStatus = netShipped > orderQty ? '超额发货' : '全部发货';
          } else {
            newStatus = '部分发货';
          }
        } else {
          // 净发为0，看是否有申请
          const [aggRows]: any = await sequelize.query(`
            SELECT ISNULL(SUM(srd.ship_quantity), 0) as total_applied
            FROM shipping_request_detail srd
            INNER JOIN shipping_request sr ON sr.request_number = srd.request_number
            WHERE srd.sales_detail_id = :detailId AND sr.status != N'已取消'
          `, { replacements: { detailId }, transaction });
          const totalApplied = Number(aggRows[0]?.total_applied) || 0;
          if (totalApplied > 0) {
            newStatus = totalApplied >= orderQty ? '全部发货' : '部分发货';
          }
        }

        await sequelize.query(
          `UPDATE sales_order_detail SET shipping_status = :status WHERE id = :id`,
          { replacements: { status: newStatus, id: detailId }, transaction }
        );
        // 同步行状态 + 订单头状态
        await syncLineStatus(detailId as number, transaction);
      }

      await transaction.commit();

      // 6. 自动触发退货入库（P2：默认全部作为合格品入库）
      const header = headerRows[0];
      try {
        await returnInboundService(
          {
            return_order_number: rn,
            warehouse_number: header.warehouse_number || '',
            warehouse_name: header.warehouse_name || '',
            details: rtDetails.map((d: any) => ({
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              product_drawing_number: d.product_drawing_number || '',
              return_quantity: Number(d.return_quantity) || 0,
              qualified_qty: Number(d.return_quantity) || 0,
              unqualified_qty: 0,
              detail_id: d.id
            })),
            remark: header.reason || '退货确认自动入库',
            accounting_period: header.accounting_period || ''
          },
          operator
        );
      } catch (inboundErr: any) {
        // 入库失败不影响确认结果，仅记录日志，仓库可稍后手动入库
        console.warn(`[退货入库] ${rn} 自动入库失败:`, inboundErr?.message || inboundErr);
      }

      res.json(success(null, '退货确认成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 退货单明细分页查询 ====================
export const getReturnOrderDetailsPage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = {};

    if (search) {
      whereClause += ` AND (h.return_order_number LIKE :search OR h.shipping_order_number LIKE :search 
        OR h.customer_name LIKE :search OR d.item_number LIKE :search OR d.item_name LIKE :search 
        OR d.sales_order_number LIKE :search OR b.batch_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    // 支持多选状态
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

    // 计算总数（按批次级别）
    const [countResult]: any = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM return_order_batch b
      INNER JOIN return_order_detail d ON d.id = b.detail_id AND d.return_order_number = b.return_order_number
      INNER JOIN return_order h ON h.return_order_number = b.return_order_number
      ${whereClause}
    `, { replacements });
    const total = countResult[0]?.total || 0;

    // 分页查询 - JOIN三表取批次级别数据
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT b.id as batch_id, b.batch_number, b.quantity as batch_quantity,
               d.line_number, d.shipping_order_detail_id, d.sales_order_number, d.sales_detail_id,
               d.item_number, d.item_name, d.specifications, d.basic_unit, d.product_drawing_number,
               d.shipped_quantity, d.return_quantity as line_return_quantity, d.remark as detail_remark,
               h.return_order_number, h.type as return_type, h.shipping_order_number,
               h.customer_number, h.customer_name, h.warehouse_name, h.status as order_status,
               h.reason, h.creation_man, h.creation_date as order_creation_date,
               h.confirmed_by, h.confirmed_date, h.confirm_remark,
               ROW_NUMBER() OVER (ORDER BY h.creation_date DESC, b.return_order_number, d.line_number, b.id) AS _row_num
        FROM return_order_batch b
        INNER JOIN return_order_detail d ON d.id = b.detail_id AND d.return_order_number = b.return_order_number
        INNER JOIN return_order h ON h.return_order_number = b.return_order_number
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd } });

    res.json(success({ items, total, page: pageNum, limit: pageSize }));
  } catch (err) { next(err); }
};

// ==================== 导出选中退货单明细 ====================
export const exportReturnOrderDetailsSelected = async (req: Request, res: Response, next: NextFunction) => {
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
      SELECT h.return_order_number, h.type as return_type, h.shipping_order_number,
             h.customer_name, h.warehouse_name, h.status as order_status,
             h.reason, h.creation_man, h.creation_date as order_creation_date,
             h.confirmed_by, h.confirmed_date,
             d.line_number, d.item_number, d.item_name, d.specifications, d.basic_unit,
             d.shipped_quantity, d.return_quantity as line_return_quantity, d.sales_order_number,
             b.batch_number, b.quantity as batch_quantity
      FROM return_order_batch b
      INNER JOIN return_order_detail d ON d.id = b.detail_id AND d.return_order_number = b.return_order_number
      INNER JOIN return_order h ON h.return_order_number = b.return_order_number
      WHERE b.id IN (${placeholders})
      ORDER BY h.return_order_number, d.line_number, b.id
    `, { replacements });

    const fields = [
      'return_order_number', 'order_status', 'return_type', 'customer_name',
      'line_number', 'batch_number', 'batch_quantity',
      'item_number', 'item_name', 'specifications', 'basic_unit',
      'shipped_quantity', 'line_return_quantity',
      'shipping_order_number', 'sales_order_number', 'warehouse_name', 'reason',
      'creation_man', 'order_creation_date', 'confirmed_by', 'confirmed_date'
    ];
    const headers = [
      '退货单号', '状态', '退货类型', '客户名称',
      '行号', '批次号', '批次数量',
      '产品编号', '产品名称', '规格', '单位',
      '发货数量', '退货数量',
      '发货单号', '销售订单号', '退货仓库', '退货原因',
      '创建人', '创建日期', '确认人', '确认日期'
    ];
    exportToExcel(items, fields, headers, 'return_order_details_selected', res);
  } catch (err) { next(err); }
};

// ==================== 驳回退货单 ====================
export const reject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { return_order_number } = req.params;
    const { confirm_remark = '' } = req.body;
    const operator = (req as any).user?.username || '';

    const [existing]: any = await sequelize.query(
      `SELECT id, approval_status FROM return_order WHERE return_order_number = :rn`,
      { replacements: { rn: return_order_number } }
    );
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: '退货单不存在' }); return;
    }
    if (existing[0].approval_status !== '已审批') {
      res.status(400).json({ success: false, message: '只有已审批状态可以驳回' }); return;
    }

    await sequelize.query(`
      UPDATE return_order SET status = N'已驳回',
        confirmed_by = :confirmed_by, confirmed_date = GETDATE(), confirm_remark = :confirm_remark
      WHERE return_order_number = :rn
    `, {
      replacements: {
        rn: return_order_number,
        confirmed_by: operator,
        confirm_remark
      }
    });

    res.json(success(null, '退货单已驳回'));
  } catch (err) { next(err); }
};
