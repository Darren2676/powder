import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { generateBatchNumber, syncFinishedGoodsSummary } from '@/services/inventory.service';
import { generateTransactionNumber } from '@/services/inventory.service';
import { createTransactionBatches, validateAccountingPeriodOpen } from '@/services/warehouse/helpers';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 其他出入库单号生成 ====================
// RI-退货入库, SO-报废出库, TR-调拨, SC-盘点
const generateAbnormalIONumber = async (prefix: string, factoryCode: string = ''): Promise<string> => {
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
    const _factoryId = getFactoryId(req);
    const requestNumber = await generateAbnormalIONumber(prefix);
    const transaction = await sequelize.transaction();

    try {
      // 插入单头
      await sequelize.query(`
        INSERT INTO abnormal_io_request (request_number, type, status, customer_number, customer_name,
          original_shipping_number, warehouse_number, warehouse_name, target_warehouse_number, target_warehouse_name,
          reason, remark, creation_man, creation_date, accounting_period, factory_id)
        VALUES (:request_number, :type, N'待确认', :customer_number, :customer_name,
          :original_shipping_number, :warehouse_number, :warehouse_name, :target_warehouse_number, :target_warehouse_name,
          :reason, :remark, :creation_man, GETDATE(), CONVERT(NVARCHAR(7), GETDATE(), 120), :factory_id)
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
          creation_man: (req as any).user?.username || '',
          factory_id: _factoryId
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
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [existing]: any = await sequelize.query(
      `SELECT id, status FROM abnormal_io_request WHERE request_number = :rn${factoryCond}`,
      { replacements: { rn: request_number, ...factoryReps } }
    );
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: '单据不存在' }); return;
    }
    if (existing[0].status !== '待确认' && existing[0].status !== '已驳回' && existing[0].status !== '已撤消') {
      res.status(400).json({ success: false, message: '只能修改待确认、已驳回或已撤消状态的单据' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      // 更新单头，已驳回/已撤消状态编辑后重置为待确认
      const newStatus = (existing[0].status === '已驳回' || existing[0].status === '已撤消') ? '待确认' : existing[0].status;
      await sequelize.query(`
        UPDATE abnormal_io_request SET
          status = :status,
          customer_number = :customer_number, customer_name = :customer_name,
          original_shipping_number = :original_shipping_number,
          warehouse_number = :warehouse_number, warehouse_name = :warehouse_name,
          target_warehouse_number = :target_warehouse_number, target_warehouse_name = :target_warehouse_name,
          reason = :reason, remark = :remark, accounting_period = :accounting_period
        WHERE request_number = :rn${factoryCond}
      `, {
        replacements: {
          status: newStatus,
          rn: request_number,
          ...factoryReps,
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
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [existing]: any = await sequelize.query(
      `SELECT id, status FROM abnormal_io_request WHERE request_number = :rn${factoryCond}`,
      { replacements: { rn: request_number, ...factoryReps } }
    );
    if (existing.length === 0) {
      res.status(404).json({ success: false, message: '单据不存在' }); return;
    }
    if (existing[0].status !== '待确认' && existing[0].status !== '已驳回' && existing[0].status !== '已撤消') {
      res.status(400).json({ success: false, message: '只能删除待确认、已驳回或已撤消状态的单据' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(
        `DELETE FROM abnormal_io_request_detail WHERE request_number = :rn`,
        { replacements: { rn: request_number }, transaction }
      );
      await sequelize.query(
        `DELETE FROM abnormal_io_request WHERE request_number = :rn${factoryCond}`,
        { replacements: { rn: request_number, ...factoryReps }, transaction }
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
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [existing]: any = await sequelize.query(
      `SELECT id, status FROM abnormal_io_request WHERE request_number = :rn${factoryCond}`,
      { replacements: { rn: request_number, ...factoryReps } }
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
      WHERE request_number = :rn${factoryCond}
    `, {
      replacements: {
        rn: request_number,
        confirmed_by: (req as any).user?.username || '',
        confirm_remark,
        ...factoryReps
      }
    });

    res.json(success(null, '已驳回'));
  } catch (err) { next(err); }
};

// ==================== 确认（核心：执行库存变更） ====================
export const confirm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const { request_number } = req.params;
    const { confirm_remark = '' } = req.body;
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    // 查询单头
    const [headers]: any = await sequelize.query(
      `SELECT * FROM abnormal_io_request WHERE request_number = :rn${factoryCond}`,
      { replacements: { rn: request_number, ...factoryReps } }
    );
    if (headers.length === 0) {
      res.status(404).json({ success: false, message: '单据不存在' }); return;
    }
    const header = headers[0];
    if (header.status !== '待确认') {
      res.status(400).json({ success: false, message: '只能确认待确认状态的单据' }); return;
    }

    // 校验会计期间
    try {
      await validateAccountingPeriodOpen(header.accounting_period || '');
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message }); return;
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
          await handleReturnInbound(header, details, operator, transaction, transactionNumbers, factoryCode, _factoryId);
          break;
        case '报废出库':
          await handleScrapOutbound(header, details, operator, transaction, transactionNumbers, factoryCode, _factoryId);
          break;
        case '调拨出入库':
          await handleTransfer(header, details, operator, transaction, transactionNumbers, factoryCode, _factoryId);
          break;
        case '盘盈盘亏':
          await handleStockCount(header, details, operator, transaction, transactionNumbers, factoryCode, _factoryId);
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
        WHERE request_number = :rn${factoryCond}
      `, {
        replacements: {
          rn: request_number,
          confirmed_by: operator,
          confirm_remark,
          ...factoryReps
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
  header: any, details: any[], operator: string, transaction: any, transactionNumbers: string[], factoryCode: string = '', _factoryId: number | null = null
) {
  for (const d of details) {
    const qty = Number(d.quantity) || 0;
    if (qty <= 0) continue;

    // 生成批次号
    const batchNo = await generateBatchNumber('FB', factoryCode, transaction);

    // 写入批次库存
    await sequelize.query(`
      INSERT INTO finished_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit,
        product_drawing_number, warehouse_number, warehouse_name, quantity, initial_quantity,
        production_order_number, inbound_date, status, creation_date, last_updated, factory_id)
      VALUES (:batch_number, :item_number, :item_name, :specifications, :basic_unit,
        :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quantity,
        N'', GETDATE(), N'正常', GETDATE(), GETDATE(), :factory_id)
    `, {
      replacements: {
        batch_number: batchNo,
        item_number: d.item_number, item_name: d.item_name || '',
        specifications: d.specifications || '', basic_unit: d.basic_unit || '',
        product_drawing_number: d.product_drawing_number || '',
        warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
        quantity: qty,
        factory_id: _factoryId
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
          product_drawing_number, warehouse_number, warehouse_name, quantity, last_updated, creation_date, factory_id)
        VALUES (:item_number, :item_name, :specifications, :basic_unit,
          :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, GETDATE(), GETDATE(), :factory_id)
      `, {
        replacements: {
          item_number: d.item_number, item_name: d.item_name || '',
          specifications: d.specifications || '', basic_unit: d.basic_unit || '',
          product_drawing_number: d.product_drawing_number || '',
          warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
          quantity: afterQty,
          factory_id: _factoryId
        }, transaction
      });
    }

    // 流水记录
    const txNum = await generateTransactionNumber(factoryCode, transaction);
    transactionNumbers.push(txNum);
    await sequelize.query(`
      INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
        item_number, item_name, specifications, basic_unit, product_drawing_number,
        warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
        batch_number, operator, operation_date, remark, creation_date, accounting_period, factory_id)
      VALUES (:transaction_number, N'入库', N'退货入库', :source_number,
        :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
        :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
        :batch_number, :operator, GETDATE(), :remark, GETDATE(), :accounting_period, :factory_id)
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
        accounting_period: header.accounting_period || '',
        factory_id: _factoryId
      }, transaction
    });
  }
}

// ==================== 报废出库处理 ====================
// FIFO 批次扣减
async function handleScrapOutbound(
  header: any, details: any[], operator: string, transaction: any, transactionNumbers: string[], factoryCode: string = '', _factoryId: number | null = null
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
    const usedBatches: Array<{ batch_number: string; quantity: number }> = [];

    for (const batch of batches) {
      if (remaining <= 0) break;
      const deductQty = Math.min(remaining, Number(batch.quantity));
      const newBatchQty = Number(batch.quantity) - deductQty;

      await sequelize.query(
        `UPDATE finished_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
        { replacements: { qty: newBatchQty, id: batch.id }, transaction }
      );

      usedBatches.push({ batch_number: batch.batch_number, quantity: deductQty });
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
    const txNum = await generateTransactionNumber(factoryCode, transaction);
    transactionNumbers.push(txNum);
    await sequelize.query(`
      INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
        item_number, item_name, specifications, basic_unit, product_drawing_number,
        warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
        batch_number, operator, operation_date, remark, creation_date, accounting_period, factory_id)
      VALUES (:transaction_number, N'出库', N'报废出库', :source_number,
        :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
        :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
        :batch_number, :operator, GETDATE(), :remark, GETDATE(), :accounting_period, :factory_id)
    `, {
      replacements: {
        transaction_number: txNum,
        source_number: header.request_number,
        item_number: d.item_number, item_name: d.item_name || '',
        specifications: d.specifications || '', basic_unit: d.basic_unit || '',
        product_drawing_number: d.product_drawing_number || '',
        warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
        quantity: qty, before_quantity: beforeQty, after_quantity: afterQty,
        batch_number: usedBatches[0]?.batch_number || '', operator,
        remark: header.reason || '报废出库',
        accounting_period: header.accounting_period || '',
        factory_id: _factoryId
      }, transaction
    });

    await createTransactionBatches(txNum, usedBatches, transaction);
  }
}

// ==================== 调拨出入库处理 ====================
// 从源仓库 FIFO 扣减，在目标仓库创建新批次
async function handleTransfer(
  header: any, details: any[], operator: string, transaction: any, transactionNumbers: string[], factoryCode: string = '', _factoryId: number | null = null
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
    const usedBatches: Array<{ batch_number: string; quantity: number }> = [];

    for (const batch of batches) {
      if (remaining <= 0) break;
      const deductQty = Math.min(remaining, Number(batch.quantity));
      const newBatchQty = Number(batch.quantity) - deductQty;

      await sequelize.query(
        `UPDATE finished_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
        { replacements: { qty: newBatchQty, id: batch.id }, transaction }
      );

      usedBatches.push({ batch_number: batch.batch_number, quantity: deductQty });
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
    const txNumOut = await generateTransactionNumber(factoryCode, transaction);
    transactionNumbers.push(txNumOut);
    await sequelize.query(`
      INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
        item_number, item_name, specifications, basic_unit, product_drawing_number,
        warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
        batch_number, operator, operation_date, remark, creation_date, accounting_period, factory_id)
      VALUES (:transaction_number, N'出库', N'调拨出库', :source_number,
        :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
        :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
        :batch_number, :operator, GETDATE(), :remark, GETDATE(), :accounting_period, :factory_id)
    `, {
      replacements: {
        transaction_number: txNumOut,
        source_number: header.request_number,
        item_number: d.item_number, item_name: d.item_name || '',
        specifications: d.specifications || '', basic_unit: d.basic_unit || '',
        product_drawing_number: d.product_drawing_number || '',
        warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
        quantity: qty, before_quantity: srcBeforeQty, after_quantity: srcBeforeQty - qty,
        batch_number: usedBatches[0]?.batch_number || '', operator,
        remark: header.reason || '调拨出库',
        accounting_period: header.accounting_period || '',
        factory_id: _factoryId
      }, transaction
    });

    await createTransactionBatches(txNumOut, usedBatches, transaction);

    // --- 目标仓库入库 ---
    const newBatchNo = await generateBatchNumber('FB', factoryCode, transaction);

    await sequelize.query(`
      INSERT INTO finished_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit,
        product_drawing_number, warehouse_number, warehouse_name, quantity, initial_quantity,
        production_order_number, inbound_date, status, creation_date, last_updated, factory_id)
      VALUES (:batch_number, :item_number, :item_name, :specifications, :basic_unit,
        :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quantity,
        N'', GETDATE(), N'正常', GETDATE(), GETDATE(), :factory_id)
    `, {
      replacements: {
        batch_number: newBatchNo,
        item_number: d.item_number, item_name: d.item_name || '',
        specifications: d.specifications || '', basic_unit: d.basic_unit || '',
        product_drawing_number: d.product_drawing_number || '',
        warehouse_number: header.target_warehouse_number, warehouse_name: header.target_warehouse_name,
        quantity: qty,
        factory_id: _factoryId
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
          product_drawing_number, warehouse_number, warehouse_name, quantity, last_updated, creation_date, factory_id)
        VALUES (:item_number, :item_name, :specifications, :basic_unit,
          :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, GETDATE(), GETDATE(), :factory_id)
      `, {
        replacements: {
          item_number: d.item_number, item_name: d.item_name || '',
          specifications: d.specifications || '', basic_unit: d.basic_unit || '',
          product_drawing_number: d.product_drawing_number || '',
          warehouse_number: header.target_warehouse_number, warehouse_name: header.target_warehouse_name,
          quantity: tgtAfterQty,
          factory_id: _factoryId
        }, transaction
      });
    }

    // 调入流水
    const txNumIn = await generateTransactionNumber(factoryCode, transaction);
    transactionNumbers.push(txNumIn);
    await sequelize.query(`
      INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
        item_number, item_name, specifications, basic_unit, product_drawing_number,
        warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
        batch_number, operator, operation_date, remark, creation_date, accounting_period, factory_id)
      VALUES (:transaction_number, N'入库', N'调拨入库', :source_number,
        :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
        :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
        :batch_number, :operator, GETDATE(), :remark, GETDATE(), :accounting_period, :factory_id)
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
        accounting_period: header.accounting_period || '',
        factory_id: _factoryId
      }, transaction
    });
  }
}

// ==================== 盘盈盘亏处理 ====================
// 根据 difference_quantity 正负调整库存
async function handleStockCount(
  header: any, details: any[], operator: string, transaction: any, transactionNumbers: string[], factoryCode: string = '', _factoryId: number | null = null
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
      const batchNo = await generateBatchNumber('FB', factoryCode, transaction);

      await sequelize.query(`
        INSERT INTO finished_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit,
          product_drawing_number, warehouse_number, warehouse_name, quantity, initial_quantity,
          production_order_number, inbound_date, status, creation_date, last_updated, factory_id)
        VALUES (:batch_number, :item_number, :item_name, :specifications, :basic_unit,
          :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quantity,
          N'', GETDATE(), N'正常', GETDATE(), GETDATE(), :factory_id)
      `, {
        replacements: {
          batch_number: batchNo,
          item_number: d.item_number, item_name: d.item_name || '',
          specifications: d.specifications || '', basic_unit: d.basic_unit || '',
          product_drawing_number: d.product_drawing_number || '',
          warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
          quantity: diff,
          factory_id: _factoryId
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
            product_drawing_number, warehouse_number, warehouse_name, quantity, last_updated, creation_date, factory_id)
          VALUES (:item_number, :item_name, :specifications, :basic_unit,
            :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, GETDATE(), GETDATE(), :factory_id)
        `, {
          replacements: {
            item_number: d.item_number, item_name: d.item_name || '',
            specifications: d.specifications || '', basic_unit: d.basic_unit || '',
            product_drawing_number: d.product_drawing_number || '',
            warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
            quantity: afterQty,
            factory_id: _factoryId
          }, transaction
        });
      }

      // 流水：盘盈调整
      const txNum = await generateTransactionNumber(factoryCode, transaction);
      transactionNumbers.push(txNum);
      await sequelize.query(`
        INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
          item_number, item_name, specifications, basic_unit, product_drawing_number,
          warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
          batch_number, operator, operation_date, remark, creation_date, accounting_period, factory_id)
        VALUES (:transaction_number, N'入库', N'盘盈调整', :source_number,
          :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
          :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
          :batch_number, :operator, GETDATE(), :remark, GETDATE(), :accounting_period, :factory_id)
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
          accounting_period: header.accounting_period || '',
          factory_id: _factoryId
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
      const usedBatches: Array<{ batch_number: string; quantity: number }> = [];

      for (const batch of batches) {
        if (remaining <= 0) break;
        const deductQty = Math.min(remaining, Number(batch.quantity));
        const newBatchQty = Number(batch.quantity) - deductQty;

        await sequelize.query(
          `UPDATE finished_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
          { replacements: { qty: newBatchQty, id: batch.id }, transaction }
        );

        usedBatches.push({ batch_number: batch.batch_number, quantity: deductQty });
        remaining -= deductQty;
      }

      if (remaining > 0) {
        throw new Error(`物料 ${d.item_number} (${d.item_name}) 批次库存不足，缺少: ${remaining}`);
      }

      await syncFinishedGoodsSummary(d.item_number, header.warehouse_number, transaction);

      const afterQty = beforeQty - absDiff;

      // 流水：盘亏调整
      const txNum = await generateTransactionNumber(factoryCode, transaction);
      transactionNumbers.push(txNum);
      await sequelize.query(`
        INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
          item_number, item_name, specifications, basic_unit, product_drawing_number,
          warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
          batch_number, operator, operation_date, remark, creation_date, accounting_period, factory_id)
        VALUES (:transaction_number, N'出库', N'盘亏调整', :source_number,
          :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
          :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
          :batch_number, :operator, GETDATE(), :remark, GETDATE(), :accounting_period, :factory_id)
      `, {
        replacements: {
          transaction_number: txNum,
          source_number: header.request_number,
          item_number: d.item_number, item_name: d.item_name || '',
          specifications: d.specifications || '', basic_unit: d.basic_unit || '',
          product_drawing_number: d.product_drawing_number || '',
          warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
          quantity: absDiff, before_quantity: beforeQty, after_quantity: afterQty,
          batch_number: usedBatches[0]?.batch_number || '', operator,
          remark: header.reason || '盘亏调整',
          accounting_period: header.accounting_period || '',
          factory_id: _factoryId
        }, transaction
      });

      await createTransactionBatches(txNum, usedBatches, transaction);
    }
  }
}

// ==================== 撤消确认（回退库存变更） ====================
export const withdraw = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { request_number } = req.params;
    const operator = (req as any).user?.username || '';
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    // 1. 校验单据状态
    const [headers]: any = await sequelize.query(
      `SELECT * FROM abnormal_io_request WHERE request_number = :rn${factoryCond}`,
      { replacements: { rn: request_number, ...factoryReps } }
    );
    if (headers.length === 0) {
      res.status(404).json({ success: false, message: '单据不存在' }); return;
    }
    const header = headers[0];
    if (header.status !== '已确认') {
      res.status(400).json({ success: false, message: '只能撤消已确认状态的单据' }); return;
    }

    // 2. 查找关联的库存流水（正常状态的）
    const [txRows]: any = await sequelize.query(
      `SELECT * FROM inventory_transaction WHERE source_number = :rn AND (status IS NULL OR status = N'正常')`,
      { replacements: { rn: request_number } }
    );
    if (txRows.length === 0) {
      res.status(400).json({ success: false, message: '未找到关联的库存流水记录' }); return;
    }

    // 3. 查找批次明细
    const txNumbers = txRows.map((r: any) => r.transaction_number);
    const [batchRows]: any = await sequelize.query(
      `SELECT * FROM inventory_transaction_batch WHERE transaction_number IN (:txns) ORDER BY id`,
      { replacements: { txns: txNumbers } }
    );

    // 4. 开启事务，执行反转
    const transaction = await sequelize.transaction();
    try {
      switch (header.type) {
        case '退货入库':
          await reverseInbound(txRows, batchRows, transaction);
          break;
        case '报废出库':
          await reverseOutbound(txRows, batchRows, transaction);
          break;
        case '调拨出入库':
          await reverseTransfer(txRows, batchRows, transaction);
          break;
        case '盘盈盘亏':
          await reverseStockCount(txRows, batchRows, transaction);
          break;
        default:
          await transaction.rollback();
          res.status(400).json({ success: false, message: `未知操作类型: ${header.type}` }); return;
      }

      // 5. 标记库存流水为作废
      await sequelize.query(
        `UPDATE inventory_transaction SET status = N'作废', void_operator = :op, void_date = GETDATE()
         WHERE source_number = :rn AND (status IS NULL OR status = N'正常')`,
        { replacements: { rn: request_number, op: operator }, transaction }
      );

      // 6. 更新单据状态
      await sequelize.query(
        `UPDATE abnormal_io_request SET status = N'已撤消',
          withdraw_operator = :op, withdraw_date = GETDATE()
         WHERE request_number = :rn${factoryCond}`,
        { replacements: { rn: request_number, op: operator, ...factoryReps }, transaction }
      );

      await transaction.commit();
      res.json(success({ transactionNumbers: txNumbers }, '撤消成功，库存已回退'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 入库类反转（退货入库 / 盘盈调整） ====================
// 确认时创建了批次并增加了库存，撤消时需扣减/删除批次
async function reverseInbound(
  txRows: any[], batchRows: any[], transaction: any
) {
  for (const tx of txRows) {
    const batchNo = tx.batch_number;
    if (!batchNo) continue;

    const [batchInv]: any = await sequelize.query(
      `SELECT id, quantity, initial_quantity FROM finished_batch_inventory
       WHERE batch_number = :bn AND item_number = :in AND warehouse_number = :wn`,
      { replacements: { bn: batchNo, in: tx.item_number, wn: tx.warehouse_number }, transaction }
    );

    if (batchInv.length === 0) continue;

    const currentQty = Number(batchInv[0].quantity);
    const originalQty = Number(tx.quantity);

    if (currentQty < originalQty) {
      throw new Error(
        `物料 ${tx.item_number} 的批次 ${batchNo} 已被后续操作消耗（剩余 ${currentQty}，需回退 ${originalQty}），无法撤消。请先撤消后续操作。`
      );
    }

    const newQty = currentQty - originalQty;
    if (newQty <= 0) {
      // 批次数量归零，删除批次记录
      await sequelize.query(
        `DELETE FROM finished_batch_inventory WHERE id = :id`,
        { replacements: { id: batchInv[0].id }, transaction }
      );
    } else {
      await sequelize.query(
        `UPDATE finished_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
        { replacements: { qty: newQty, id: batchInv[0].id }, transaction }
      );
    }

    // 同步汇总库存
    await syncFinishedGoodsSummary(tx.item_number, tx.warehouse_number, transaction);
  }
}

// ==================== 出库类反转（报废出库 / 盘亏调整） ====================
// 确认时FIFO扣减了批次，撤消时按inventory_transaction_batch加回
async function reverseOutbound(
  txRows: any[], batchRows: any[], transaction: any
) {
  for (const tx of txRows) {
    const txBatches = batchRows.filter((b: any) => b.transaction_number === tx.transaction_number);

    for (const b of txBatches) {
      const [batchInv]: any = await sequelize.query(
        `SELECT id, quantity FROM finished_batch_inventory
         WHERE batch_number = :bn AND item_number = :in AND warehouse_number = :wn`,
        { replacements: { bn: b.batch_number, in: tx.item_number, wn: tx.warehouse_number }, transaction }
      );

      if (batchInv.length > 0) {
        const newQty = Number(batchInv[0].quantity) + Number(b.quantity);
        await sequelize.query(
          `UPDATE finished_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
          { replacements: { qty: newQty, id: batchInv[0].id }, transaction }
        );
      } else {
        // 批次已被删除（理论上不应发生），重建批次
        await sequelize.query(`
          INSERT INTO finished_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit,
            product_drawing_number, warehouse_number, warehouse_name, quantity, initial_quantity,
            production_order_number, inbound_date, status, creation_date, last_updated, factory_id)
          VALUES (:batch_number, :item_number, :item_name, :specifications, :basic_unit,
            :product_drawing_number, :warehouse_number, :warehouse_name, :quantity, :quantity,
            N'', GETDATE(), N'正常', GETDATE(), GETDATE(), :factory_id)
        `, {
          replacements: {
            batch_number: b.batch_number,
            item_number: tx.item_number, item_name: tx.item_name || '',
            specifications: tx.specifications || '', basic_unit: tx.basic_unit || '',
            product_drawing_number: tx.product_drawing_number || '',
            warehouse_number: tx.warehouse_number, warehouse_name: tx.warehouse_name || '',
            quantity: b.quantity,
            factory_id: tx.factory_id
          }, transaction
        });
      }
    }

    // 同步汇总库存
    await syncFinishedGoodsSummary(tx.item_number, tx.warehouse_number, transaction);
  }
}

// ==================== 调拨出入库反转 ====================
async function reverseTransfer(
  txRows: any[], batchRows: any[], transaction: any
) {
  const outTxRows = txRows.filter((t: any) => t.source_type === '调拨出库');
  const inTxRows = txRows.filter((t: any) => t.source_type === '调拨入库');

  // 1. 反转调出（出库→加回源仓库批次）
  await reverseOutbound(outTxRows, batchRows, transaction);

  // 2. 反转调入（入库→扣减/删除目标仓库批次）
  await reverseInbound(inTxRows, batchRows, transaction);
}

// ==================== 盘盈盘亏反转 ====================
async function reverseStockCount(
  txRows: any[], batchRows: any[], transaction: any
) {
  const surplusTxRows = txRows.filter((t: any) => t.source_type === '盘盈调整');
  const lossTxRows = txRows.filter((t: any) => t.source_type === '盘亏调整');

  // 1. 盘盈反转（入库类→扣减批次）
  if (surplusTxRows.length > 0) {
    await reverseInbound(surplusTxRows, batchRows, transaction);
  }

  // 2. 盘亏反转（出库类→加回批次）
  if (lossTxRows.length > 0) {
    await reverseOutbound(lossTxRows, batchRows, transaction);
  }
}
