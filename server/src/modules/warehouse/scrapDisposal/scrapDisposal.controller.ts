/**
 * 报废仓处置控制器
 *
 * 提供报废仓库存查询和报废出库处置功能。
 * 复用 abnormalIO 的报废出库 FIFO 逻辑，但提供独立的报废仓专用视图。
 */
import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { generateBatchNumber, generateTransactionNumber, syncFinishedGoodsSummary } from '@/services/inventory.service';
import { createTransactionBatches, validateAccountingPeriodOpen } from '@/services/warehouse/helpers';
import { BusinessError } from '@/shared/errors/BusinessError';

// ==================== 报废仓库存查询 ====================
export const getScrapInventory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const offset = (page - 1) * limit;

    // 查询报废仓库
    const [scrapWh]: any = await sequelize.query(
      `SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE warehouse_type = N'报废仓库'`
    );
    if (!scrapWh.length) {
      res.json(success({ items: [], pagination: { total: 0, page, limit, totalPages: 0 } }));
      return;
    }
    const warehouseNumber = scrapWh[0].warehouse_number;

    let whereClause = 'WHERE bi.warehouse_number = :wn AND bi.quantity > 0';
    const replacements: any = { wn: warehouseNumber };

    if (search) {
      whereClause += ` AND (bi.item_number LIKE :search OR bi.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(DISTINCT bi.item_number) as total
       FROM finished_batch_inventory bi ${whereClause}`,
      { replacements }
    );
    const total = countResult[0]?.total || 0;

    // 按物料汇总批次库存
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT bi.item_number, bi.item_name, bi.specifications, bi.basic_unit,
          SUM(bi.quantity) as total_quantity,
          COUNT(bi.id) as batch_count,
          MIN(bi.inbound_date) as earliest_inbound,
          MAX(bi.inbound_date) as latest_inbound,
          ROW_NUMBER() OVER (ORDER BY MAX(bi.inbound_date) DESC) AS _row_num
        FROM finished_batch_inventory bi
        ${whereClause}
        GROUP BY bi.item_number, bi.item_name, bi.specifications, bi.basic_unit
      ) t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      warehouse: scrapWh[0]
    }));
  } catch (err) { next(err); }
};

// ==================== 报废仓批次明细查询 ====================
export const getScrapBatchDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number } = req.params;

    const [scrapWh]: any = await sequelize.query(
      `SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE warehouse_type = N'报废仓库'`
    );
    if (!scrapWh.length) {
      res.json(success({ items: [], warehouse: null }));
      return;
    }

    const [batches]: any = await sequelize.query(`
      SELECT batch_number, item_number, item_name, specifications, basic_unit,
        quantity, initial_quantity, inbound_date, status
      FROM finished_batch_inventory
      WHERE item_number = :item_number AND warehouse_number = :wn AND quantity > 0
      ORDER BY inbound_date ASC, id ASC
    `, { replacements: { item_number, wn: scrapWh[0].warehouse_number } });

    res.json(success({ items: batches, warehouse: scrapWh[0] }));
  } catch (err) { next(err); }
};

// ==================== 创建报废处置申请 ====================
export const createScrapDisposal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.details || !Array.isArray(b.details) || b.details.length === 0) {
      res.status(400).json({ success: false, message: '请添加至少一条处置明细' });
      return;
    }
    if (!b.disposal_reason) {
      res.status(400).json({ success: false, message: '请填写处置原因' });
      return;
    }

    // 查询报废仓库
    const [scrapWh]: any = await sequelize.query(
      `SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE warehouse_type = N'报废仓库'`
    );
    if (!scrapWh.length) {
      res.status(400).json({ success: false, message: '未找到报废仓库' });
      return;
    }

    // 校验会计期间
    const accountingPeriod = b.accounting_period || new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
    await validateAccountingPeriodOpen(accountingPeriod);

    // 生成处置单号
    const disposalNumber = await generateDisposalNumber();

    const transaction = await sequelize.transaction();
    try {
      const operator = (req as any).user?.username || '';

      // 插入处置单头
      await sequelize.query(`
        INSERT INTO scrap_disposal (disposal_number, warehouse_number, warehouse_name,
          disposal_reason, remark, status, operator, creation_date, accounting_period)
        VALUES (:disposal_number, :warehouse_number, :warehouse_name,
          :disposal_reason, :remark, N'待确认', :operator, GETDATE(), :accounting_period)
      `, {
        replacements: {
          disposal_number: disposalNumber,
          warehouse_number: scrapWh[0].warehouse_number,
          warehouse_name: scrapWh[0].warehouse_name,
          disposal_reason: b.disposal_reason,
          remark: b.remark || '',
          accounting_period: accountingPeriod,
          operator
        },
        transaction
      });

      // 插入处置明细
      for (let i = 0; i < b.details.length; i++) {
        const d = b.details[i];
        await sequelize.query(`
          INSERT INTO scrap_disposal_detail (disposal_number, line_number, item_number, item_name,
            specifications, basic_unit, quantity, batch_number, remark)
          VALUES (:disposal_number, :line_number, :item_number, :item_name,
            :specifications, :basic_unit, :quantity, :batch_number, :remark)
        `, {
          replacements: {
            disposal_number: disposalNumber,
            line_number: (i + 1) * 10,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            quantity: Number(d.quantity) || 0,
            batch_number: d.batch_number || '',
            remark: d.remark || ''
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ disposal_number: disposalNumber }, '报废处置申请创建成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 报废处置单列表 ====================
export const getScrapDisposalList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd: offset + limit };

    if (search) {
      whereClause += ` AND (h.disposal_number LIKE :search OR h.disposal_reason LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (status) {
      whereClause += ` AND h.status = :status`;
      replacements.status = status;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM scrap_disposal h ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT h.*, ROW_NUMBER() OVER (ORDER BY h.creation_date DESC, h.id DESC) AS _row_num
        FROM scrap_disposal h ${whereClause}
      ) t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total: countResult[0]?.total || 0, page, limit, totalPages: Math.ceil((countResult[0]?.total || 0) / limit) }
    }));
  } catch (err) { next(err); }
};

// ==================== 报废处置单详情 ====================
export const getScrapDisposalDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { disposal_number } = req.params;

    const [headers]: any = await sequelize.query(
      `SELECT * FROM scrap_disposal WHERE disposal_number = :dn`,
      { replacements: { dn: disposal_number } }
    );
    if (!headers.length) {
      res.status(404).json({ success: false, message: '处置单不存在' });
      return;
    }

    const [details]: any = await sequelize.query(
      `SELECT * FROM scrap_disposal_detail WHERE disposal_number = :dn ORDER BY line_number`,
      { replacements: { dn: disposal_number } }
    );

    res.json(success({ header: headers[0], details }));
  } catch (err) { next(err); }
};

// ==================== 确认报废处置（执行出库） ====================
export const confirmScrapDisposal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { disposal_number } = req.params;
    const { confirm_remark = '' } = req.body;

    const [headers]: any = await sequelize.query(
      `SELECT * FROM scrap_disposal WHERE disposal_number = :dn`,
      { replacements: { dn: disposal_number } }
    );
    if (!headers.length) {
      res.status(404).json({ success: false, message: '处置单不存在' });
      return;
    }
    const header = headers[0];
    if (header.status !== '待确认') {
      res.status(400).json({ success: false, message: '只能确认待确认状态的处置单' });
      return;
    }

    const [details]: any = await sequelize.query(
      `SELECT * FROM scrap_disposal_detail WHERE disposal_number = :dn ORDER BY line_number`,
      { replacements: { dn: disposal_number } }
    );
    if (!details.length) {
      res.status(400).json({ success: false, message: '处置单无明细行' });
      return;
    }

    // 校验会计期间
    const accountingPeriod = header.accounting_period || new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0');
    try {
      await validateAccountingPeriodOpen(accountingPeriod);
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message }); return;
    }

    const transaction = await sequelize.transaction();
    const transactionNumbers: string[] = [];
    const operator = (req as any).user?.username || '';

    try {
      for (const d of details) {
        const qty = Number(d.quantity) || 0;
        if (qty <= 0) continue;

        if (d.batch_number) {
          // 指定批次扣减
          const [batchRow]: any = await sequelize.query(
            `SELECT id, quantity FROM finished_batch_inventory
             WHERE batch_number = :bn AND item_number = :in AND warehouse_number = :wn`,
            { replacements: { bn: d.batch_number, in: d.item_number, wn: header.warehouse_number }, transaction }
          );

          if (!batchRow.length || Number(batchRow[0].quantity) < qty) {
            throw new BusinessError(400, `批次 ${d.batch_number} 库存不足`);
          }

          const newBatchQty = Number(batchRow[0].quantity) - qty;
          if (newBatchQty <= 0) {
            await sequelize.query(
              `DELETE FROM finished_batch_inventory WHERE id = :id`,
              { replacements: { id: batchRow[0].id }, transaction }
            );
          } else {
            await sequelize.query(
              `UPDATE finished_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
              { replacements: { qty: newBatchQty, id: batchRow[0].id }, transaction }
            );
          }

          // 记录库存流水
          const [summaryBefore]: any = await sequelize.query(
            `SELECT quantity FROM finished_goods_inventory
             WHERE item_number = :item_number AND warehouse_number = :wn AND quality_status = N'不合格品'`,
            { replacements: { item_number: d.item_number, wn: header.warehouse_number }, transaction }
          );
          const beforeQty = summaryBefore.length ? Number(summaryBefore[0].quantity) : 0;
          const afterQty = Math.max(0, beforeQty - qty);

          await syncFinishedGoodsSummary(d.item_number, header.warehouse_number, transaction, '不合格品');

          const txNum = await generateTransactionNumber(transaction);
          transactionNumbers.push(txNum);

          await sequelize.query(`
            INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
              item_number, item_name, specifications, basic_unit, product_drawing_number,
              warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
              batch_number, operator, operation_date, remark, quality_status, creation_date, accounting_period)
            VALUES (:transaction_number, N'出库', N'报废处置', :source_number,
              :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
              :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
              :batch_number, :operator, GETDATE(), :remark, N'不合格品', GETDATE(), :accounting_period)
          `, {
            replacements: {
              transaction_number: txNum,
              source_number: disposal_number,
              item_number: d.item_number,
              item_name: d.item_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              product_drawing_number: d.product_drawing_number || '',
              warehouse_number: header.warehouse_number,
              warehouse_name: header.warehouse_name,
              quantity: qty, before_quantity: beforeQty, after_quantity: afterQty,
              batch_number: d.batch_number,
              operator,
              remark: header.disposal_reason || '报废处置',
              accounting_period: accountingPeriod
            },
            transaction
          });

          await createTransactionBatches(txNum, [{ batch_number: d.batch_number, quantity: qty }], transaction);
        } else {
          // 未指定批次，FIFO 扣减
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

            if (newBatchQty <= 0) {
              await sequelize.query(
                `DELETE FROM finished_batch_inventory WHERE id = :id`,
                { replacements: { id: batch.id }, transaction }
              );
            } else {
              await sequelize.query(
                `UPDATE finished_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
                { replacements: { qty: newBatchQty, id: batch.id }, transaction }
              );
            }

            usedBatches.push({ batch_number: batch.batch_number, quantity: deductQty });
            remaining -= deductQty;
          }

          if (remaining > 0) {
            throw new BusinessError(400, `物料 ${d.item_number} (${d.item_name}) 报废仓批次库存不足，缺少: ${remaining}`);
          }

          // 同步汇总库存
          const [summaryBefore]: any = await sequelize.query(
            `SELECT quantity FROM finished_goods_inventory
             WHERE item_number = :item_number AND warehouse_number = :wn AND quality_status = N'不合格品'`,
            { replacements: { item_number: d.item_number, wn: header.warehouse_number }, transaction }
          );
          const beforeQty = summaryBefore.length ? Number(summaryBefore[0].quantity) : 0;

          await syncFinishedGoodsSummary(d.item_number, header.warehouse_number, transaction, '不合格品');

          const afterQty = Math.max(0, beforeQty - qty);

          // 流水记录
          const txNum = await generateTransactionNumber(transaction);
          transactionNumbers.push(txNum);
          await sequelize.query(`
            INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
              item_number, item_name, specifications, basic_unit, product_drawing_number,
              warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
              batch_number, operator, operation_date, remark, quality_status, creation_date, accounting_period)
            VALUES (:transaction_number, N'出库', N'报废处置', :source_number,
              :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
              :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
              :batch_number, :operator, GETDATE(), :remark, N'不合格品', GETDATE(), :accounting_period)
          `, {
            replacements: {
              transaction_number: txNum,
              source_number: disposal_number,
              item_number: d.item_number,
              item_name: d.item_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              product_drawing_number: d.product_drawing_number || '',
              warehouse_number: header.warehouse_number,
              warehouse_name: header.warehouse_name,
              quantity: qty, before_quantity: beforeQty, after_quantity: afterQty,
              batch_number: usedBatches[0]?.batch_number || '',
              operator,
              remark: header.disposal_reason || '报废处置',
              accounting_period: accountingPeriod
            },
            transaction
          });

          await createTransactionBatches(txNum, usedBatches, transaction);
        }
      }

      // 更新处置单状态（会计期间保持创建时的值）
      await sequelize.query(`
        UPDATE scrap_disposal SET status = N'已确认',
          confirmed_by = :confirmed_by, confirmed_date = GETDATE(), confirm_remark = :confirm_remark
        WHERE disposal_number = :dn
      `, {
        replacements: {
          dn: disposal_number,
          confirmed_by: operator,
          confirm_remark
        },
        transaction
      });

      await transaction.commit();
      res.json(success({ transactionNumbers }, '报废处置确认成功，库存已更新'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 驳回报废处置 ====================
export const rejectScrapDisposal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { disposal_number } = req.params;
    const { confirm_remark = '' } = req.body;

    const [existing]: any = await sequelize.query(
      `SELECT status FROM scrap_disposal WHERE disposal_number = :dn`,
      { replacements: { dn: disposal_number } }
    );
    if (!existing.length) {
      res.status(404).json({ success: false, message: '处置单不存在' });
      return;
    }
    if (existing[0].status !== '待确认') {
      res.status(400).json({ success: false, message: '只能驳回待确认状态的处置单' });
      return;
    }

    await sequelize.query(`
      UPDATE scrap_disposal SET status = N'已驳回',
        confirmed_by = :confirmed_by, confirmed_date = GETDATE(), confirm_remark = :confirm_remark
      WHERE disposal_number = :dn
    `, {
      replacements: {
        dn: disposal_number,
        confirmed_by: (req as any).user?.username || '',
        confirm_remark
      }
    });

    res.json(success(null, '已驳回'));
  } catch (err) { next(err); }
};

// ==================== 删除报废处置（仅待确认/已驳回状态） ====================
export const deleteScrapDisposal = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { disposal_number } = req.params;

    const [existing]: any = await sequelize.query(
      `SELECT status FROM scrap_disposal WHERE disposal_number = :dn`,
      { replacements: { dn: disposal_number } }
    );
    if (!existing.length) {
      res.status(404).json({ success: false, message: '处置单不存在' });
      return;
    }
    if (existing[0].status !== '待确认' && existing[0].status !== '已驳回') {
      res.status(400).json({ success: false, message: '只能删除待确认或已驳回状态的处置单' });
      return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(
        `DELETE FROM scrap_disposal_detail WHERE disposal_number = :dn`,
        { replacements: { dn: disposal_number }, transaction }
      );
      await sequelize.query(
        `DELETE FROM scrap_disposal WHERE disposal_number = :dn`,
        { replacements: { dn: disposal_number }, transaction }
      );
      await transaction.commit();
      res.json(success(null, '删除成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 处置单号生成 ====================
const generateDisposalNumber = async (): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `SD-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(disposal_number) as max_num FROM scrap_disposal WHERE disposal_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );

  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};
