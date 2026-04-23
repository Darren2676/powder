import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { generateBatchNumber, syncFinishedGoodsSummary } from '@/services/inventory.service';
import { generateTransactionNumber } from '@/services/inventory.service';

// ==================== 异常出入库单号生成 ====================
// RI-退货入库, SO-报废出库, TR-调拨, SC-盘点
const generateAbnormalIONumber = async (prefix: string): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const fullPrefix = `${prefix}-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(request_number) as max_num FROM abnormal_io_request WHERE request_number LIKE :prefix`,
    { replacements: { prefix: fullPrefix + '%' } }
  );

  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(fullPrefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return fullPrefix + String(seq).padStart(3, '0');
};

// type -> prefix 映射
const typePrefixMap: Record<string, string> = {
  '退货入库': 'RI',
  '报废出库': 'SO',
  '调拨出入库': 'TR',
  '盘盈盘亏': 'SC'
};

// ==================== 列表查询 ====================
export const getList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', type = '', status = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (request_number LIKE :search OR customer_name LIKE :search OR warehouse_name LIKE :search OR reason LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (type) {
      whereClause += ` AND type = :type`;
      replacements.type = type;
    }
    if (status) {
      whereClause += ` AND status = :status`;
      replacements.status = status;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM abnormal_io_request ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC, id DESC) AS _row_num
        FROM abnormal_io_request ${whereClause}
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

// ==================== 详情查询 ====================
export const getDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { request_number } = req.params;
    if (!request_number) {
      res.status(400).json({ success: false, message: '缺少单号' }); return;
    }

    const [headers]: any = await sequelize.query(
      `SELECT * FROM abnormal_io_request WHERE request_number = :rn`,
      { replacements: { rn: request_number } }
    );

    if (headers.length === 0) {
      res.status(404).json({ success: false, message: '单据不存在' }); return;
    }

    const [details]: any = await sequelize.query(
      `SELECT * FROM abnormal_io_request_detail WHERE request_number = :rn ORDER BY line_number`,
      { replacements: { rn: request_number } }
    );

    res.json(success({ header: headers[0], details }));
  } catch (err) { next(err); }
};

// ==================== 创建申请 ====================
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.type || !typePrefixMap[b.type]) {
      res.status(400).json({ success: false, message: '无效的操作类型' }); return;
    }
    if (!b.details || !Array.isArray(b.details) || b.details.length === 0) {
      res.status(400).json({ success: false, message: '请添加至少一条明细' }); return;
    }
    if (!b.warehouse_number) {
      res.status(400).json({ success: false, message: '请选择仓库' }); return;
    }

    const prefix = typePrefixMap[b.type];
    const requestNumber = await generateAbnormalIONumber(prefix);
    const transaction = await sequelize.transaction();

    try {
      // 插入单头
      await sequelize.query(`
        INSERT INTO abnormal_io_request (request_number, type, status, customer_number, customer_name,
          original_shipping_number, warehouse_number, warehouse_name, target_warehouse_number, target_warehouse_name,
          reason, remark, creation_man, creation_date, accounting_period)
        VALUES (:request_number, :type, N'待确认', :customer_number, :customer_name,
          :original_shipping_number, :warehouse_number, :warehouse_name, :target_warehouse_number, :target_warehouse_name,
          :reason, :remark, :creation_man, GETDATE(), CONVERT(NVARCHAR(7), GETDATE(), 120))
      `, {
        replacements: {
          request_number: requestNumber,
          type: b.type,
          customer_number: b.customer_number || '',
          customer_name: b.customer_name || '',
          original_shipping_number: b.original_shipping_number || '',
          warehouse_number: b.warehouse_number || '',
          warehouse_name: b.warehouse_name || '',
          target_warehouse_number: b.target_warehouse_number || '',
          target_warehouse_name: b.target_warehouse_name || '',
          reason: b.reason || '',
          remark: b.remark || '',
          creation_man: (req as any).user?.username || ''
        }, transaction
      });

      // 插入明细行
      for (let i = 0; i < b.details.length; i++) {
        const d = b.details[i];
        await sequelize.query(`
          INSERT INTO abnormal_io_request_detail (request_number, line_number, item_number, item_name,
            specifications, basic_unit, product_drawing_number, batch_number, quantity,
            system_quantity, actual_quantity, difference_quantity, remark)
          VALUES (:request_number, :line_number, :item_number, :item_name,
            :specifications, :basic_unit, :product_drawing_number, :batch_number, :quantity,
            :system_quantity, :actual_quantity, :difference_quantity, :remark)
        `, {
          replacements: {
            request_number: requestNumber,
            line_number: i + 1,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            product_drawing_number: d.product_drawing_number || '',
            batch_number: d.batch_number || '',
            quantity: Number(d.quantity) || 0,
            system_quantity: Number(d.system_quantity) || 0,
            actual_quantity: Number(d.actual_quantity) || 0,
            difference_quantity: Number(d.difference_quantity) || 0,
            remark: d.remark || ''
          }, transaction
        });
      }

      await transaction.commit();
      res.json(success({ request_number: requestNumber }, '创建成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 更新申请（仅待确认状态） ====================
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { request_number } = req.params;
    const b = req.body;

    const [existing]: any = await sequelize.query(
      `SELECT id, status FROM abnormal_io_request WHERE request_number = :rn`,
      { replacements: { rn: request_number } }
    );
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: '单据不存在' }); return;
    }
    if (existing[0].status !== '待确认') {
      res.status(400).json({ success: false, message: '只能修改待确认状态的单据' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      // 更新单头
      await sequelize.query(`
        UPDATE abnormal_io_request SET
          customer_number = :customer_number, customer_name = :customer_name,
          original_shipping_number = :original_shipping_number,
          warehouse_number = :warehouse_number, warehouse_name = :warehouse_name,
          target_warehouse_number = :target_warehouse_number, target_warehouse_name = :target_warehouse_name,
          reason = :reason, remark = :remark, accounting_period = :accounting_period
        WHERE request_number = :rn
      `, {
        replacements: {
          rn: request_number,
          customer_number: b.customer_number || '',
          customer_name: b.customer_name || '',
          original_shipping_number: b.original_shipping_number || '',
          warehouse_number: b.warehouse_number || '',
          warehouse_name: b.warehouse_name || '',
          target_warehouse_number: b.target_warehouse_number || '',
          target_warehouse_name: b.target_warehouse_name || '',
          reason: b.reason || '',
          remark: b.remark || '',
          accounting_period: b.accounting_period || ''
        }, transaction
      });

      // 重建明细
      await sequelize.query(
        `DELETE FROM abnormal_io_request_detail WHERE request_number = :rn`,
        { replacements: { rn: request_number }, transaction }
      );

      if (b.details && Array.isArray(b.details)) {
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO abnormal_io_request_detail (request_number, line_number, item_number, item_name,
              specifications, basic_unit, product_drawing_number, batch_number, quantity,
              system_quantity, actual_quantity, difference_quantity, remark)
            VALUES (:request_number, :line_number, :item_number, :item_name,
              :specifications, :basic_unit, :product_drawing_number, :batch_number, :quantity,
              :system_quantity, :actual_quantity, :difference_quantity, :remark)
          `, {
            replacements: {
              request_number: request_number,
              line_number: i + 1,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              product_drawing_number: d.product_drawing_number || '',
              batch_number: d.batch_number || '',
              quantity: Number(d.quantity) || 0,
              system_quantity: Number(d.system_quantity) || 0,
              actual_quantity: Number(d.actual_quantity) || 0,
              difference_quantity: Number(d.difference_quantity) || 0,
              remark: d.remark || ''
            }, transaction
          });
        }
      }

      await transaction.commit();
      res.json(success(null, '更新成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 删除申请（仅待确认状态） ====================
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { request_number } = req.params;

    const [existing]: any = await sequelize.query(
      `SELECT id, status FROM abnormal_io_request WHERE request_number = :rn`,
      { replacements: { rn: request_number } }
    );
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: '单据不存在' }); return;
    }
    if (existing[0].status !== '待确认') {
      res.status(400).json({ success: false, message: '只能删除待确认状态的单据' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(
        `DELETE FROM abnormal_io_request_detail WHERE request_number = :rn`,
        { replacements: { rn: request_number }, transaction }
      );
      await sequelize.query(
        `DELETE FROM abnormal_io_request WHERE request_number = :rn`,
        { replacements: { rn: request_number }, transaction }
      );
      await transaction.commit();
      res.json(success(null, '删除成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 驳回 ====================
export const reject = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { request_number } = req.params;
    const { confirm_remark = '' } = req.body;

    const [existing]: any = await sequelize.query(
      `SELECT id, status FROM abnormal_io_request WHERE request_number = :rn`,
      { replacements: { rn: request_number } }
    );
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: '单据不存在' }); return;
    }
    if (existing[0].status !== '待确认') {
      res.status(400).json({ success: false, message: '只能驳回待确认状态的单据' }); return;
    }

    await sequelize.query(`
      UPDATE abnormal_io_request SET status = N'已驳回',
        confirmed_by = :confirmed_by, confirmed_date = GETDATE(), confirm_remark = :confirm_remark
      WHERE request_number = :rn
    `, {
      replacements: {
        rn: request_number,
        confirmed_by: (req as any).user?.username || '',
        confirm_remark
      }
    });

    res.json(success(null, '已驳回'));
  } catch (err) { next(err); }
};

// ==================== 确认（核心：执行库存变更） ====================
export const confirm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { request_number } = req.params;
    const { confirm_remark = '' } = req.body;

    // 查询单头
    const [headers]: any = await sequelize.query(
      `SELECT * FROM abnormal_io_request WHERE request_number = :rn`,
      { replacements: { rn: request_number } }
    );
    if (headers.length === 0) {
      res.status(404).json({ success: false, message: '单据不存在' }); return;
    }
    const header = headers[0];
    if (header.status !== '待确认') {
      res.status(400).json({ success: false, message: '只能确认待确认状态的单据' }); return;
    }

    // 查询明细
    const [details]: any = await sequelize.query(
      `SELECT * FROM abnormal_io_request_detail WHERE request_number = :rn ORDER BY line_number`,
      { replacements: { rn: request_number } }
    );
    if (details.length === 0) {
      res.status(400).json({ success: false, message: '单据无明细行' }); return;
    }

    const transaction = await sequelize.transaction();
    const transactionNumbers: string[] = [];

    try {
      const operator = (req as any).user?.username || '';

      switch (header.type) {
        case '退货入库':
          await handleReturnInbound(header, details, operator, transaction, transactionNumbers);
          break;
        case '报废出库':
          await handleScrapOutbound(header, details, operator, transaction, transactionNumbers);
          break;
        case '调拨出入库':
          await handleTransfer(header, details, operator, transaction, transactionNumbers);
          break;
        case '盘盈盘亏':
          await handleStockCount(header, details, operator, transaction, transactionNumbers);
          break;
        default:
          await transaction.rollback();
          res.status(400).json({ success: false, message: `未知操作类型: ${header.type}` });
          return;
      }

      // 更新单头状态
      await sequelize.query(`
        UPDATE abnormal_io_request SET status = N'已确认',
          confirmed_by = :confirmed_by, confirmed_date = GETDATE(), confirm_remark = :confirm_remark
        WHERE request_number = :rn
      `, {
        replacements: {
          rn: request_number,
          confirmed_by: operator,
          confirm_remark
        }, transaction
      });

      await transaction.commit();
      res.json(success({ transactionNumbers }, '确认成功，库存已更新'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 退货入库处理 ====================
// 创建新批次入库，增加库存
async function handleReturnInbound(
  header: any, details: any[], operator: string, transaction: any, transactionNumbers: string[]
) {
  for (const d of details) {
    const qty = Number(d.quantity) || 0;
    if (qty <= 0) continue;

    // 生成批次号
    const batchNo = await generateBatchNumber('FB', transaction);

    // 写入批次库存
    await sequelize.query(`
      INSERT INTO finished_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit,
        product_drawing_number, warehouse_number, warehouse_name, quantity, initial_quantity,
        production_order_number, inbound_date, status, creation_date, last_updated)
      VALUES (:batch_number, :item_number, :item_name, :specifications, :basic_unit,
        :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quantity,
        N'', GETDATE(), N'正常', GETDATE(), GETDATE())
    `, {
      replacements: {
        batch_number: batchNo,
        item_number: d.item_number, item_name: d.item_name || '',
        specifications: d.specifications || '', basic_unit: d.basic_unit || '',
        product_drawing_number: d.product_drawing_number || '',
        warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
        quantity: qty
      }, transaction
    });

    // 更新汇总库存
    const [existing]: any = await sequelize.query(
      `SELECT id, quantity FROM finished_goods_inventory WHERE item_number = :item_number AND warehouse_number = :wn`,
      { replacements: { item_number: d.item_number, wn: header.warehouse_number }, transaction }
    );

    const beforeQty = existing.length > 0 ? Number(existing[0].quantity) : 0;
    const afterQty = beforeQty + qty;

    if (existing.length > 0) {
      await sequelize.query(
        `UPDATE finished_goods_inventory SET quantity = :afterQty, last_updated = GETDATE() WHERE id = :id`,
        { replacements: { afterQty, id: existing[0].id }, transaction }
      );
    } else {
      await sequelize.query(`
        INSERT INTO finished_goods_inventory (item_number, item_name, specifications, basic_unit,
          product_drawing_number, warehouse_number, warehouse_name, quantity, last_updated, creation_date)
        VALUES (:item_number, :item_name, :specifications, :basic_unit,
          :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, GETDATE(), GETDATE())
      `, {
        replacements: {
          item_number: d.item_number, item_name: d.item_name || '',
          specifications: d.specifications || '', basic_unit: d.basic_unit || '',
          product_drawing_number: d.product_drawing_number || '',
          warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
          quantity: afterQty
        }, transaction
      });
    }

    // 流水记录
    const txNum = await generateTransactionNumber(transaction);
    transactionNumbers.push(txNum);
    await sequelize.query(`
      INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
        item_number, item_name, specifications, basic_unit, product_drawing_number,
        warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
        batch_number, operator, operation_date, remark, creation_date, accounting_period)
      VALUES (:transaction_number, N'入库', N'退货入库', :source_number,
        :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
        :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
        :batch_number, :operator, GETDATE(), :remark, GETDATE(), :accounting_period)
    `, {
      replacements: {
        transaction_number: txNum,
        source_number: header.request_number,
        item_number: d.item_number, item_name: d.item_name || '',
        specifications: d.specifications || '', basic_unit: d.basic_unit || '',
        product_drawing_number: d.product_drawing_number || '',
        warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
        quantity: qty, before_quantity: beforeQty, after_quantity: afterQty,
        batch_number: batchNo, operator,
        remark: header.reason || '退货入库',
        accounting_period: header.accounting_period || ''
      }, transaction
    });
  }
}

// ==================== 报废出库处理 ====================
// FIFO 批次扣减
async function handleScrapOutbound(
  header: any, details: any[], operator: string, transaction: any, transactionNumbers: string[]
) {
  for (const d of details) {
    const qty = Number(d.quantity) || 0;
    if (qty <= 0) continue;

    // FIFO 分配批次
    const [batches]: any = await sequelize.query(`
      SELECT id, batch_number, quantity FROM finished_batch_inventory
      WHERE item_number = :item_number AND warehouse_number = :wn AND quantity > 0 AND status = N'正常'
      ORDER BY inbound_date ASC, id ASC
    `, { replacements: { item_number: d.item_number, wn: header.warehouse_number }, transaction });

    let remaining = qty;
    const usedBatchNos: string[] = [];

    for (const batch of batches) {
      if (remaining <= 0) break;
      const deductQty = Math.min(remaining, Number(batch.quantity));
      const newBatchQty = Number(batch.quantity) - deductQty;

      await sequelize.query(
        `UPDATE finished_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
        { replacements: { qty: newBatchQty, id: batch.id }, transaction }
      );

      usedBatchNos.push(batch.batch_number);
      remaining -= deductQty;
    }

    if (remaining > 0) {
      throw new Error(`物料 ${d.item_number} (${d.item_name}) 批次库存不足，缺少: ${remaining}`);
    }

    // 同步汇总库存
    const [summaryBefore]: any = await sequelize.query(
      `SELECT quantity FROM finished_goods_inventory WHERE item_number = :item_number AND warehouse_number = :wn`,
      { replacements: { item_number: d.item_number, wn: header.warehouse_number }, transaction }
    );
    const beforeQty = summaryBefore.length > 0 ? Number(summaryBefore[0].quantity) : 0;

    await syncFinishedGoodsSummary(d.item_number, header.warehouse_number, transaction);

    const afterQty = beforeQty - qty;

    // 流水记录
    const txNum = await generateTransactionNumber(transaction);
    transactionNumbers.push(txNum);
    await sequelize.query(`
      INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
        item_number, item_name, specifications, basic_unit, product_drawing_number,
        warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
        batch_number, operator, operation_date, remark, creation_date, accounting_period)
      VALUES (:transaction_number, N'出库', N'报废出库', :source_number,
        :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
        :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
        :batch_number, :operator, GETDATE(), :remark, GETDATE(), :accounting_period)
    `, {
      replacements: {
        transaction_number: txNum,
        source_number: header.request_number,
        item_number: d.item_number, item_name: d.item_name || '',
        specifications: d.specifications || '', basic_unit: d.basic_unit || '',
        product_drawing_number: d.product_drawing_number || '',
        warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
        quantity: qty, before_quantity: beforeQty, after_quantity: afterQty,
        batch_number: usedBatchNos.join(','), operator,
        remark: header.reason || '报废出库',
        accounting_period: header.accounting_period || ''
      }, transaction
    });
  }
}

// ==================== 调拨出入库处理 ====================
// 从源仓库 FIFO 扣减，在目标仓库创建新批次
async function handleTransfer(
  header: any, details: any[], operator: string, transaction: any, transactionNumbers: string[]
) {
  for (const d of details) {
    const qty = Number(d.quantity) || 0;
    if (qty <= 0) continue;

    // --- 源仓库出库（FIFO） ---
    const [batches]: any = await sequelize.query(`
      SELECT id, batch_number, quantity FROM finished_batch_inventory
      WHERE item_number = :item_number AND warehouse_number = :wn AND quantity > 0 AND status = N'正常'
      ORDER BY inbound_date ASC, id ASC
    `, { replacements: { item_number: d.item_number, wn: header.warehouse_number }, transaction });

    let remaining = qty;
    const usedBatchNos: string[] = [];

    for (const batch of batches) {
      if (remaining <= 0) break;
      const deductQty = Math.min(remaining, Number(batch.quantity));
      const newBatchQty = Number(batch.quantity) - deductQty;

      await sequelize.query(
        `UPDATE finished_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
        { replacements: { qty: newBatchQty, id: batch.id }, transaction }
      );

      usedBatchNos.push(batch.batch_number);
      remaining -= deductQty;
    }

    if (remaining > 0) {
      throw new Error(`物料 ${d.item_number} (${d.item_name}) 源仓库批次库存不足，缺少: ${remaining}`);
    }

    // 源仓库汇总
    const [srcBefore]: any = await sequelize.query(
      `SELECT quantity FROM finished_goods_inventory WHERE item_number = :item_number AND warehouse_number = :wn`,
      { replacements: { item_number: d.item_number, wn: header.warehouse_number }, transaction }
    );
    const srcBeforeQty = srcBefore.length > 0 ? Number(srcBefore[0].quantity) : 0;

    await syncFinishedGoodsSummary(d.item_number, header.warehouse_number, transaction);

    // 调出流水
    const txNumOut = await generateTransactionNumber(transaction);
    transactionNumbers.push(txNumOut);
    await sequelize.query(`
      INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
        item_number, item_name, specifications, basic_unit, product_drawing_number,
        warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
        batch_number, operator, operation_date, remark, creation_date, accounting_period)
      VALUES (:transaction_number, N'出库', N'调拨出库', :source_number,
        :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
        :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
        :batch_number, :operator, GETDATE(), :remark, GETDATE(), :accounting_period)
    `, {
      replacements: {
        transaction_number: txNumOut,
        source_number: header.request_number,
        item_number: d.item_number, item_name: d.item_name || '',
        specifications: d.specifications || '', basic_unit: d.basic_unit || '',
        product_drawing_number: d.product_drawing_number || '',
        warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
        quantity: qty, before_quantity: srcBeforeQty, after_quantity: srcBeforeQty - qty,
        batch_number: usedBatchNos.join(','), operator,
        remark: header.reason || '调拨出库',
        accounting_period: header.accounting_period || ''
      }, transaction
    });

    // --- 目标仓库入库 ---
    const newBatchNo = await generateBatchNumber('FB', transaction);

    await sequelize.query(`
      INSERT INTO finished_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit,
        product_drawing_number, warehouse_number, warehouse_name, quantity, initial_quantity,
        production_order_number, inbound_date, status, creation_date, last_updated)
      VALUES (:batch_number, :item_number, :item_name, :specifications, :basic_unit,
        :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quantity,
        N'', GETDATE(), N'正常', GETDATE(), GETDATE())
    `, {
      replacements: {
        batch_number: newBatchNo,
        item_number: d.item_number, item_name: d.item_name || '',
        specifications: d.specifications || '', basic_unit: d.basic_unit || '',
        product_drawing_number: d.product_drawing_number || '',
        warehouse_number: header.target_warehouse_number, warehouse_name: header.target_warehouse_name,
        quantity: qty
      }, transaction
    });

    // 目标仓库汇总
    const [tgtExisting]: any = await sequelize.query(
      `SELECT id, quantity FROM finished_goods_inventory WHERE item_number = :item_number AND warehouse_number = :wn`,
      { replacements: { item_number: d.item_number, wn: header.target_warehouse_number }, transaction }
    );
    const tgtBeforeQty = tgtExisting.length > 0 ? Number(tgtExisting[0].quantity) : 0;
    const tgtAfterQty = tgtBeforeQty + qty;

    if (tgtExisting.length > 0) {
      await sequelize.query(
        `UPDATE finished_goods_inventory SET quantity = :afterQty, last_updated = GETDATE() WHERE id = :id`,
        { replacements: { afterQty: tgtAfterQty, id: tgtExisting[0].id }, transaction }
      );
    } else {
      await sequelize.query(`
        INSERT INTO finished_goods_inventory (item_number, item_name, specifications, basic_unit,
          product_drawing_number, warehouse_number, warehouse_name, quantity, last_updated, creation_date)
        VALUES (:item_number, :item_name, :specifications, :basic_unit,
          :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, GETDATE(), GETDATE())
      `, {
        replacements: {
          item_number: d.item_number, item_name: d.item_name || '',
          specifications: d.specifications || '', basic_unit: d.basic_unit || '',
          product_drawing_number: d.product_drawing_number || '',
          warehouse_number: header.target_warehouse_number, warehouse_name: header.target_warehouse_name,
          quantity: tgtAfterQty
        }, transaction
      });
    }

    // 调入流水
    const txNumIn = await generateTransactionNumber(transaction);
    transactionNumbers.push(txNumIn);
    await sequelize.query(`
      INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
        item_number, item_name, specifications, basic_unit, product_drawing_number,
        warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
        batch_number, operator, operation_date, remark, creation_date, accounting_period)
      VALUES (:transaction_number, N'入库', N'调拨入库', :source_number,
        :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
        :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
        :batch_number, :operator, GETDATE(), :remark, GETDATE(), :accounting_period)
    `, {
      replacements: {
        transaction_number: txNumIn,
        source_number: header.request_number,
        item_number: d.item_number, item_name: d.item_name || '',
        specifications: d.specifications || '', basic_unit: d.basic_unit || '',
        product_drawing_number: d.product_drawing_number || '',
        warehouse_number: header.target_warehouse_number, warehouse_name: header.target_warehouse_name,
        quantity: qty, before_quantity: tgtBeforeQty, after_quantity: tgtAfterQty,
        batch_number: newBatchNo, operator,
        remark: header.reason || '调拨入库',
        accounting_period: header.accounting_period || ''
      }, transaction
    });
  }
}

// ==================== 盘盈盘亏处理 ====================
// 根据 difference_quantity 正负调整库存
async function handleStockCount(
  header: any, details: any[], operator: string, transaction: any, transactionNumbers: string[]
) {
  for (const d of details) {
    const diff = Number(d.difference_quantity) || 0;
    if (diff === 0) continue;

    const [existing]: any = await sequelize.query(
      `SELECT id, quantity FROM finished_goods_inventory WHERE item_number = :item_number AND warehouse_number = :wn`,
      { replacements: { item_number: d.item_number, wn: header.warehouse_number }, transaction }
    );

    const beforeQty = existing.length > 0 ? Number(existing[0].quantity) : 0;

    if (diff > 0) {
      // 盘盈：创建新批次入库
      const batchNo = await generateBatchNumber('FB', transaction);

      await sequelize.query(`
        INSERT INTO finished_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit,
          product_drawing_number, warehouse_number, warehouse_name, quantity, initial_quantity,
          production_order_number, inbound_date, status, creation_date, last_updated)
        VALUES (:batch_number, :item_number, :item_name, :specifications, :basic_unit,
          :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quantity,
          N'', GETDATE(), N'正常', GETDATE(), GETDATE())
      `, {
        replacements: {
          batch_number: batchNo,
          item_number: d.item_number, item_name: d.item_name || '',
          specifications: d.specifications || '', basic_unit: d.basic_unit || '',
          product_drawing_number: d.product_drawing_number || '',
          warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
          quantity: diff
        }, transaction
      });

      const afterQty = beforeQty + diff;
      if (existing.length > 0) {
        await sequelize.query(
          `UPDATE finished_goods_inventory SET quantity = :afterQty, last_updated = GETDATE() WHERE id = :id`,
          { replacements: { afterQty, id: existing[0].id }, transaction }
        );
      } else {
        await sequelize.query(`
          INSERT INTO finished_goods_inventory (item_number, item_name, specifications, basic_unit,
            product_drawing_number, warehouse_number, warehouse_name, quantity, last_updated, creation_date)
          VALUES (:item_number, :item_name, :specifications, :basic_unit,
            :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, GETDATE(), GETDATE())
        `, {
          replacements: {
            item_number: d.item_number, item_name: d.item_name || '',
            specifications: d.specifications || '', basic_unit: d.basic_unit || '',
            product_drawing_number: d.product_drawing_number || '',
            warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
            quantity: afterQty
          }, transaction
        });
      }

      // 流水：盘盈调整
      const txNum = await generateTransactionNumber(transaction);
      transactionNumbers.push(txNum);
      await sequelize.query(`
        INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
          item_number, item_name, specifications, basic_unit, product_drawing_number,
          warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
          batch_number, operator, operation_date, remark, creation_date, accounting_period)
        VALUES (:transaction_number, N'入库', N'盘盈调整', :source_number,
          :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
          :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
          :batch_number, :operator, GETDATE(), :remark, GETDATE(), :accounting_period)
      `, {
        replacements: {
          transaction_number: txNum,
          source_number: header.request_number,
          item_number: d.item_number, item_name: d.item_name || '',
          specifications: d.specifications || '', basic_unit: d.basic_unit || '',
          product_drawing_number: d.product_drawing_number || '',
          warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
          quantity: diff, before_quantity: beforeQty, after_quantity: afterQty,
          batch_number: batchNo, operator,
          remark: header.reason || '盘盈调整',
          accounting_period: header.accounting_period || ''
        }, transaction
      });

    } else {
      // 盘亏：FIFO 扣减
      const absDiff = Math.abs(diff);

      if (beforeQty < absDiff) {
        throw new Error(`物料 ${d.item_number} (${d.item_name}) 库存不足，当前: ${beforeQty}，盘亏: ${absDiff}`);
      }

      const [batches]: any = await sequelize.query(`
        SELECT id, batch_number, quantity FROM finished_batch_inventory
        WHERE item_number = :item_number AND warehouse_number = :wn AND quantity > 0 AND status = N'正常'
        ORDER BY inbound_date ASC, id ASC
      `, { replacements: { item_number: d.item_number, wn: header.warehouse_number }, transaction });

      let remaining = absDiff;
      const usedBatchNos: string[] = [];

      for (const batch of batches) {
        if (remaining <= 0) break;
        const deductQty = Math.min(remaining, Number(batch.quantity));
        const newBatchQty = Number(batch.quantity) - deductQty;

        await sequelize.query(
          `UPDATE finished_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
          { replacements: { qty: newBatchQty, id: batch.id }, transaction }
        );

        usedBatchNos.push(batch.batch_number);
        remaining -= deductQty;
      }

      if (remaining > 0) {
        throw new Error(`物料 ${d.item_number} (${d.item_name}) 批次库存不足，缺少: ${remaining}`);
      }

      await syncFinishedGoodsSummary(d.item_number, header.warehouse_number, transaction);

      const afterQty = beforeQty - absDiff;

      // 流水：盘亏调整
      const txNum = await generateTransactionNumber(transaction);
      transactionNumbers.push(txNum);
      await sequelize.query(`
        INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
          item_number, item_name, specifications, basic_unit, product_drawing_number,
          warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
          batch_number, operator, operation_date, remark, creation_date, accounting_period)
        VALUES (:transaction_number, N'出库', N'盘亏调整', :source_number,
          :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
          :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
          :batch_number, :operator, GETDATE(), :remark, GETDATE(), :accounting_period)
      `, {
        replacements: {
          transaction_number: txNum,
          source_number: header.request_number,
          item_number: d.item_number, item_name: d.item_name || '',
          specifications: d.specifications || '', basic_unit: d.basic_unit || '',
          product_drawing_number: d.product_drawing_number || '',
          warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
          quantity: absDiff, before_quantity: beforeQty, after_quantity: afterQty,
          batch_number: usedBatchNos.join(','), operator,
          remark: header.reason || '盘亏调整',
          accounting_period: header.accounting_period || ''
        }, transaction
      });
    }
  }
}
