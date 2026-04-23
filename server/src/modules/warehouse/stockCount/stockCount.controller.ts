import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { syncFinishedGoodsSummary } from '@/services/inventory.service';
import { generateTransactionNumber } from '@/services/inventory.service';

// 格式化日期为 SQL Server 可识别的字符串 (YYYY-MM-DD HH:mm:ss)
function formatDateForSQL(date: any): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return d.getFullYear() + '-' +
    String(d.getMonth() + 1).padStart(2, '0') + '-' +
    String(d.getDate()).padStart(2, '0') + ' ' +
    String(d.getHours()).padStart(2, '0') + ':' +
    String(d.getMinutes()).padStart(2, '0') + ':' +
    String(d.getSeconds()).padStart(2, '0');
}

// ==================== 盘点单号生成 ====================
const generateCountNumber = async (): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `IC-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(count_number) as max_num FROM stock_count WHERE count_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );

  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 盘点单列表 ====================
export const getList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', status = '', warehouse_number = '', count_period = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    if (search) {
      whereClause += ` AND (count_number LIKE :search OR warehouse_name LIKE :search OR count_man LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (status) {
      whereClause += ` AND status = :status`;
      replacements.status = status;
    }
    if (warehouse_number) {
      whereClause += ` AND warehouse_number = :warehouse_number`;
      replacements.warehouse_number = warehouse_number;
    }
    if (count_period) {
      whereClause += ` AND count_period = :count_period`;
      replacements.count_period = count_period;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM stock_count ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC, id DESC) AS _row_num
        FROM stock_count ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    // 状态统计
    const [stats]: any = await sequelize.query(`
      SELECT
        SUM(CASE WHEN status = N'盘点中' THEN 1 ELSE 0 END) as counting,
        SUM(CASE WHEN status = N'待复核' THEN 1 ELSE 0 END) as pending_review,
        SUM(CASE WHEN status = N'待确认' THEN 1 ELSE 0 END) as pending_confirm,
        SUM(CASE WHEN status = N'已完成' AND count_period = :current_period THEN 1 ELSE 0 END) as completed_this_month
      FROM stock_count
    `, {
      replacements: {
        current_period: new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0')
      }
    });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: pageSize,
      stats: stats[0] || {}
    }));
  } catch (err) { next(err); }
};

// ==================== 盘点单详情 ====================
export const getDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { count_number } = req.params;

    const [headers]: any = await sequelize.query(
      `SELECT * FROM stock_count WHERE count_number = :count_number`,
      { replacements: { count_number } }
    );

    if (!headers.length) {
      return res.status(404).json({ success: false, message: '盘点单不存在' });
    }

    const [details]: any = await sequelize.query(
      `SELECT * FROM stock_count_detail WHERE count_number = :count_number ORDER BY line_number`,
      { replacements: { count_number } }
    );

    res.json(success({ header: headers[0], details }));
  } catch (err) { next(err); }
};

// ==================== 快照预览 ====================
export const snapshotPreview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { warehouse_number, count_type, item_numbers } = req.query;

    if (!warehouse_number) {
      return res.status(400).json({ success: false, message: '仓库编号不能为空' });
    }

    let whereClause = `WHERE warehouse_number = :warehouse_number AND quantity > 0 AND status = N'正常'`;
    const replacements: any = { warehouse_number };

    if (count_type === '抽盘' && item_numbers) {
      const items = String(item_numbers).split(',').map(s => s.trim()).filter(Boolean);
      if (items.length > 0) {
        whereClause += ` AND item_number IN (${items.map((_, i) => `:item_${i}`).join(',')})`;
        items.forEach((item, i) => { replacements[`item_${i}`] = item; });
      }
    }

    const [batches]: any = await sequelize.query(`
      SELECT item_number, item_name, specifications, basic_unit, product_drawing_number,
        batch_number, quantity, production_order_number, inbound_date, quality_status
      FROM finished_batch_inventory ${whereClause}
      ORDER BY item_number, quality_status, inbound_date ASC, id ASC
    `, { replacements });

    const itemSet = new Set(batches.map((b: any) => b.item_number));

    res.json(success({
      total_items: itemSet.size,
      total_batches: batches.length,
      batches
    }));
  } catch (err) { next(err); }
};

// ==================== 创建盘点单 ====================
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    const operator = (req as any).user?.username || '';

    if (!b.warehouse_number || !b.count_period || !b.count_type) {
      return res.status(400).json({ success: false, message: '仓库、盘点期间、盘点类型为必填' });
    }

    const transaction = await sequelize.transaction();
    try {
      const count_number = await generateCountNumber();

      // 查询批次库存快照
      let whereClause = `WHERE warehouse_number = :warehouse_number AND quantity > 0 AND status = N'正常'`;
      const replacements: any = { warehouse_number: b.warehouse_number };

      if (b.count_type === '抽盘' && b.item_numbers && b.item_numbers.length > 0) {
        const items = Array.isArray(b.item_numbers) ? b.item_numbers : [b.item_numbers];
        whereClause += ` AND item_number IN (${items.map((_: any, i: number) => `:item_${i}`).join(',')})`;
        items.forEach((item: string, i: number) => { replacements[`item_${i}`] = item; });
      }

      const [batches]: any = await sequelize.query(`
        SELECT id, item_number, item_name, specifications, basic_unit, product_drawing_number,
          batch_number, quantity, production_order_number, inbound_date, quality_status
        FROM finished_batch_inventory ${whereClause}
        ORDER BY item_number, quality_status, inbound_date ASC, id ASC
      `, { replacements, transaction });

      if (batches.length === 0) {
        try { await transaction.rollback(); } catch (_) {}
        return res.status(400).json({ success: false, message: '所选仓库内无可盘点的批次库存' });
      }

      // 写入明细
      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        await sequelize.query(`
          INSERT INTO stock_count_detail (count_number, line_number, item_number, item_name, specifications,
            basic_unit, product_drawing_number, batch_number, batch_inventory_id, system_quantity,
            actual_quantity, difference_quantity, count_status, production_order_number, inbound_date, quality_status, remark)
          VALUES (:count_number, :line_number, :item_number, :item_name, :specifications,
            :basic_unit, :product_drawing_number, :batch_number, :batch_inventory_id, :system_quantity,
            NULL, 0, N'未盘', :production_order_number, :inbound_date, :quality_status, '')
        `, {
          replacements: {
            count_number,
            line_number: (i + 1) * 10,
            item_number: batch.item_number,
            item_name: batch.item_name || '',
            specifications: batch.specifications || '',
            basic_unit: batch.basic_unit || '',
            product_drawing_number: batch.product_drawing_number || '',
            batch_number: batch.batch_number,
            batch_inventory_id: batch.id,
            system_quantity: batch.quantity,
            production_order_number: batch.production_order_number || '',
            inbound_date: formatDateForSQL(batch.inbound_date),
            quality_status: batch.quality_status || '合格品'
          }, transaction
        });
      }

      // 统计
      const itemSet = new Set(batches.map((batchItem: any) => batchItem.item_number));

      // 写入主表
      await sequelize.query(`
        INSERT INTO stock_count (count_number, count_period, warehouse_number, warehouse_name, count_type,
          status, total_items, total_batches, count_man, count_date, remark, created_time, creation_date, last_updated)
        VALUES (:count_number, :count_period, :warehouse_number, :warehouse_name, :count_type,
          N'盘点中', :total_items, :total_batches, :count_man, GETDATE(), :remark, GETDATE(), GETDATE(), GETDATE())
      `, {
        replacements: {
          count_number, count_period: b.count_period, warehouse_number: b.warehouse_number,
          warehouse_name: b.warehouse_name || '',
          count_type: b.count_type,
          total_items: itemSet.size,
          total_batches: batches.length,
          count_man: operator,
          remark: b.remark || ''
        }, transaction
      });

      await transaction.commit();
      res.json(success({ count_number }, '盘点单创建成功'));
    } catch (e: any) {
      try { await transaction.rollback(); } catch (_) {}
      console.error('盘点单创建失败:', e?.original?.message || e?.message || e);
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 更新盘点明细（录入实盘数量） ====================
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const count_number = String(req.params.count_number);
    const b = req.body;

    // 校验状态
    const [headers]: any = await sequelize.query(
      `SELECT status FROM stock_count WHERE count_number = :count_number`,
      { replacements: { count_number } }
    );
    if (!headers.length) {
      return res.status(404).json({ success: false, message: '盘点单不存在' });
    }
    if (headers[0].status !== '盘点中') {
      return res.status(400).json({ success: false, message: '仅"盘点中"状态的盘点单可编辑' });
    }

    const transaction = await sequelize.transaction();
    try {
      // 更新明细行
      for (const d of b.details) {
        const actualQty = d.actual_quantity !== null && d.actual_quantity !== undefined ? Number(d.actual_quantity) : null;
        let diff = 0;
        let countStatus = '未盘';

        if (actualQty !== null) {
          const systemQty = Number(d.system_quantity) || 0;
          diff = actualQty - systemQty;
          if (diff > 0) countStatus = '盈';
          else if (diff < 0) countStatus = '亏';
          else countStatus = '平';
        }

        await sequelize.query(`
          UPDATE stock_count_detail
          SET actual_quantity = :actual_quantity,
              difference_quantity = :difference_quantity,
              count_status = :count_status,
              remark = :remark
          WHERE id = :id AND count_number = :count_number
        `, {
          replacements: {
            actual_quantity: actualQty,
            difference_quantity: diff,
            count_status: countStatus,
            remark: d.remark || '',
            id: d.id,
            count_number
          }, transaction
        });
      }

      // 重新计算主表汇总
      await recalcSummary(count_number, transaction);

      await transaction.commit();
      res.json(success(null, '盘点明细更新成功'));
    } catch (e) {
      try { await transaction.rollback(); } catch (_) {}
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 删除盘点单 ====================
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { count_number } = req.params;

    const [headers]: any = await sequelize.query(
      `SELECT status FROM stock_count WHERE count_number = :count_number`,
      { replacements: { count_number } }
    );
    if (!headers.length) {
      return res.status(404).json({ success: false, message: '盘点单不存在' });
    }
    if (headers[0].status !== '盘点中') {
      return res.status(400).json({ success: false, message: '仅"盘点中"状态的盘点单可删除' });
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM stock_count_detail WHERE count_number = :count_number`, { replacements: { count_number }, transaction });
      await sequelize.query(`DELETE FROM stock_count WHERE count_number = :count_number`, { replacements: { count_number }, transaction });
      await transaction.commit();
      res.json(success(null, '盘点单已删除'));
    } catch (e) {
      try { await transaction.rollback(); } catch (_) {}
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 提交复核 ====================
export const submitReview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { count_number } = req.params;
    const operator = (req as any).user?.username || '';

    const [headers]: any = await sequelize.query(
      `SELECT status, count_man FROM stock_count WHERE count_number = :count_number`,
      { replacements: { count_number } }
    );
    if (!headers.length) {
      return res.status(404).json({ success: false, message: '盘点单不存在' });
    }
    if (headers[0].status !== '盘点中') {
      return res.status(400).json({ success: false, message: '仅"盘点中"状态可提交复核' });
    }

    // 检查是否所有明细都已盘点
    const [uncounted]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM stock_count_detail WHERE count_number = :count_number AND actual_quantity IS NULL`,
      { replacements: { count_number } }
    );
    if (uncounted[0]?.cnt > 0) {
      return res.status(400).json({ success: false, message: `还有 ${uncounted[0].cnt} 个批次未录入实盘数量，请全部录入后再提交` });
    }

    await sequelize.query(
      `UPDATE stock_count SET status = N'待复核', last_updated = GETDATE() WHERE count_number = :count_number`,
      { replacements: { count_number } }
    );

    res.json(success(null, '已提交复核'));
  } catch (err) { next(err); }
};

// ==================== 复核 ====================
export const review = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { count_number } = req.params;
    const b = req.body;
    const operator = (req as any).user?.username || '';

    const [headers]: any = await sequelize.query(
      `SELECT status, count_man FROM stock_count WHERE count_number = :count_number`,
      { replacements: { count_number } }
    );
    if (!headers.length) {
      return res.status(404).json({ success: false, message: '盘点单不存在' });
    }
    if (headers[0].status !== '待复核') {
      return res.status(400).json({ success: false, message: '仅"待复核"状态可执行复核操作' });
    }

    if (b.action === 'approve') {
      await sequelize.query(`
        UPDATE stock_count SET status = N'待确认', reviewer = :reviewer, review_date = GETDATE(),
          review_remark = :review_remark, last_updated = GETDATE()
        WHERE count_number = :count_number
      `, { replacements: { reviewer: operator, review_remark: b.review_remark || '', count_number } });
      res.json(success(null, '复核通过，等待确认执行'));
    } else if (b.action === 'reject') {
      await sequelize.query(`
        UPDATE stock_count SET status = N'盘点中', reviewer = :reviewer, review_date = GETDATE(),
          review_remark = :review_remark, last_updated = GETDATE()
        WHERE count_number = :count_number
      `, { replacements: { reviewer: operator, review_remark: b.review_remark || '', count_number } });
      res.json(success(null, '已驳回，退回盘点人修改'));
    } else {
      return res.status(400).json({ success: false, message: 'action 必须为 approve 或 reject' });
    }
  } catch (err) { next(err); }
};

// ==================== 确认执行（库存调整） ====================
export const confirm = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { count_number } = req.params;
    const b = req.body;
    const operator = (req as any).user?.username || '';

    const [headers]: any = await sequelize.query(
      `SELECT * FROM stock_count WHERE count_number = :count_number`,
      { replacements: { count_number } }
    );
    if (!headers.length) {
      return res.status(404).json({ success: false, message: '盘点单不存在' });
    }
    const header = headers[0];
    if (header.status !== '待确认') {
      return res.status(400).json({ success: false, message: '仅"待确认"状态可执行确认' });
    }

    // 获取有差异的明细
    const [details]: any = await sequelize.query(
      `SELECT * FROM stock_count_detail WHERE count_number = :count_number AND difference_quantity != 0`,
      { replacements: { count_number } }
    );

    const transaction = await sequelize.transaction();
    try {
      const transactionNumbers: string[] = [];
      const adjustedItems = new Set<string>();

      for (const d of b.details) {
        const diff = Number(d.difference_quantity);
        const batchId = d.batch_inventory_id;
        const batchNumber = d.batch_number;
        const qualityStatus = d.quality_status || '合格品';

        // 获取当前批次实际数量
        const [batchRows]: any = await sequelize.query(
          `SELECT id, quantity FROM finished_batch_inventory WHERE id = :id`,
          { replacements: { id: batchId }, transaction }
        );

        if (!batchRows.length) {
          throw new Error(`批次 ${batchNumber} 在库存中不存在`);
        }

        const currentBatchQty = Number(batchRows[0].quantity);

        // 获取汇总库存(before)
        const [summaryRows]: any = await sequelize.query(
          `SELECT quantity FROM finished_goods_inventory WHERE item_number = :item_number AND warehouse_number = :wn AND quality_status = :quality_status`,
          { replacements: { item_number: d.item_number, wn: header.warehouse_number, quality_status: qualityStatus }, transaction }
        );
        const beforeQty = summaryRows.length > 0 ? Number(summaryRows[0].quantity) : 0;

        if (diff > 0) {
          // 盘盈：直接加到对应批次
          const newBatchQty = currentBatchQty + diff;
          await sequelize.query(
            `UPDATE finished_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
            { replacements: { qty: newBatchQty, id: batchId }, transaction }
          );

          adjustedItems.add(`${d.item_number}|${header.warehouse_number}|${qualityStatus}`);

          // 生成流水
          const txNum = await generateTransactionNumber(transaction);
          transactionNumbers.push(txNum);
          const afterQty = beforeQty + diff;
          await sequelize.query(`
            INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
              item_number, item_name, specifications, basic_unit, product_drawing_number,
              warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
              batch_number, operator, operation_date, remark, quality_status, creation_date)
            VALUES (:transaction_number, N'入库', N'月末盘盈', :source_number,
              :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
              :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
              :batch_number, :operator, GETDATE(), :remark, :quality_status, GETDATE())
          `, {
            replacements: {
              transaction_number: txNum,
              source_number: count_number,
              item_number: d.item_number, item_name: d.item_name || '',
              specifications: d.specifications || '', basic_unit: d.basic_unit || '',
              product_drawing_number: d.product_drawing_number || '',
              warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
              quantity: diff, before_quantity: beforeQty, after_quantity: afterQty,
              batch_number: batchNumber, operator,
              remark: '月末盘点盘盈', quality_status: qualityStatus
            }, transaction
          });

        } else {
          // 盘亏：直接减对应批次
          const absDiff = Math.abs(diff);
          const newBatchQty = currentBatchQty - absDiff;

          if (newBatchQty < 0) {
            throw new Error(`批次 ${batchNumber} 库存不足，当前: ${currentBatchQty}，盘亏: ${absDiff}`);
          }

          await sequelize.query(
            `UPDATE finished_batch_inventory SET quantity = :qty, last_updated = GETDATE() WHERE id = :id`,
            { replacements: { qty: newBatchQty, id: batchId }, transaction }
          );

          adjustedItems.add(`${d.item_number}|${header.warehouse_number}|${qualityStatus}`);

          // 生成流水
          const txNum = await generateTransactionNumber(transaction);
          transactionNumbers.push(txNum);
          const afterQty = beforeQty - absDiff;
          await sequelize.query(`
            INSERT INTO inventory_transaction (transaction_number, transaction_type, source_type, source_number,
              item_number, item_name, specifications, basic_unit, product_drawing_number,
              warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
              batch_number, operator, operation_date, remark, quality_status, creation_date)
            VALUES (:transaction_number, N'出库', N'月末盘亏', :source_number,
              :item_number, :item_name, :specifications, :basic_unit, :product_drawing_number,
              :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
              :batch_number, :operator, GETDATE(), :remark, :quality_status, GETDATE())
          `, {
            replacements: {
              transaction_number: txNum,
              source_number: count_number,
              item_number: d.item_number, item_name: d.item_name || '',
              specifications: d.specifications || '', basic_unit: d.basic_unit || '',
              product_drawing_number: d.product_drawing_number || '',
              warehouse_number: header.warehouse_number, warehouse_name: header.warehouse_name,
              quantity: absDiff, before_quantity: beforeQty, after_quantity: afterQty,
              batch_number: batchNumber, operator,
              remark: '月末盘点盘亏', quality_status: qualityStatus
            }, transaction
          });
        }
      }

      // 同步汇总库存
      for (const key of adjustedItems) {
        const [itemNumber, warehouseNumber, qualityStatus] = key.split('|');
        await syncFinishedGoodsSummary(itemNumber, warehouseNumber, transaction, qualityStatus);
      }

      // 更新主表状态
      await sequelize.query(`
        UPDATE stock_count SET status = N'已完成', confirmed_by = :confirmed_by, confirmed_date = GETDATE(),
          confirm_remark = :confirm_remark, completed_time = GETDATE(), last_updated = GETDATE()
        WHERE count_number = :count_number
      `, { replacements: { confirmed_by: operator, confirm_remark: b.confirm_remark || '', count_number }, transaction });

      await transaction.commit();
      res.json(success({ transactionNumbers }, '盘点确认完成，库存已调整'));
    } catch (e) {
      try { await transaction.rollback(); } catch (_) {}
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 作废 ====================
export const cancel = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { count_number } = req.params;
    const b = req.body;
    const operator = (req as any).user?.username || '';

    const [headers]: any = await sequelize.query(
      `SELECT status, count_man FROM stock_count WHERE count_number = :count_number`,
      { replacements: { count_number } }
    );
    if (!headers.length) {
      return res.status(404).json({ success: false, message: '盘点单不存在' });
    }
    if (headers[0].status !== '待确认') {
      return res.status(400).json({ success: false, message: '仅"待确认"状态可作废' });
    }

    await sequelize.query(`
      UPDATE stock_count SET status = N'已作废', confirmed_by = :confirmed_by, confirmed_date = GETDATE(),
        confirm_remark = :confirm_remark, last_updated = GETDATE()
      WHERE count_number = :count_number
    `, { replacements: { confirmed_by: operator, confirm_remark: b.confirm_remark || '', count_number } });

    res.json(success(null, '盘点单已作废'));
  } catch (err) { next(err); }
};

// ==================== 报表：盘点汇总 ====================
export const reportSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start_period, end_period, warehouse_number } = req.query;

    let whereClause = `WHERE status = N'已完成'`;
    const replacements: any = {};

    if (start_period) {
      whereClause += ` AND count_period >= :start_period`;
      replacements.start_period = start_period;
    }
    if (end_period) {
      whereClause += ` AND count_period <= :end_period`;
      replacements.end_period = end_period;
    }
    if (warehouse_number) {
      whereClause += ` AND warehouse_number = :warehouse_number`;
      replacements.warehouse_number = warehouse_number;
    }

    const [items]: any = await sequelize.query(`
      SELECT count_number, count_period, warehouse_name, count_type,
        total_items, total_batches, matched_batches, surplus_batches, shortage_batches,
        total_surplus_qty, total_shortage_qty,
        CASE WHEN total_batches > 0 THEN CAST(matched_batches * 100.0 / total_batches AS DECIMAL(5,1)) ELSE 0 END as accuracy_rate,
        count_man, reviewer, confirmed_by, confirmed_date
      FROM stock_count ${whereClause}
      ORDER BY count_period DESC, creation_date DESC
    `, { replacements });

    // KPI汇总
    const [kpi]: any = await sequelize.query(`
      SELECT
        COUNT(*) as total_count,
        CASE WHEN SUM(total_batches) > 0 THEN CAST(SUM(matched_batches) * 100.0 / SUM(total_batches) AS DECIMAL(5,1)) ELSE 0 END as avg_accuracy,
        SUM(total_surplus_qty) as total_surplus,
        SUM(total_shortage_qty) as total_shortage
      FROM stock_count ${whereClause}
    `, { replacements });

    res.json(success({ items, kpi: kpi[0] || {} }));
  } catch (err) { next(err); }
};

// ==================== 报表：差异明细 ====================
export const reportDiffDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { count_number, start_period, end_period, warehouse_number, search, diff_type, quality_status, page = 1, limit = 20 } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = `WHERE d.difference_quantity != 0 AND h.status = N'已完成'`;
    const replacements: any = { offset, offsetEnd };

    if (count_number) {
      whereClause += ` AND d.count_number = :count_number`;
      replacements.count_number = count_number;
    }
    if (start_period) {
      whereClause += ` AND h.count_period >= :start_period`;
      replacements.start_period = start_period;
    }
    if (end_period) {
      whereClause += ` AND h.count_period <= :end_period`;
      replacements.end_period = end_period;
    }
    if (warehouse_number) {
      whereClause += ` AND h.warehouse_number = :warehouse_number`;
      replacements.warehouse_number = warehouse_number;
    }
    if (search) {
      whereClause += ` AND (d.item_number LIKE :search OR d.item_name LIKE :search OR d.batch_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    if (diff_type === '盈') {
      whereClause += ` AND d.difference_quantity > 0`;
    } else if (diff_type === '亏') {
      whereClause += ` AND d.difference_quantity < 0`;
    }
    if (quality_status) {
      whereClause += ` AND d.quality_status = :quality_status`;
      replacements.quality_status = quality_status;
    }

    const [countResult]: any = await sequelize.query(`
      SELECT COUNT(*) as total FROM stock_count_detail d
      INNER JOIN stock_count h ON h.count_number = d.count_number
      ${whereClause}
    `, { replacements });

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT d.count_number, h.count_period, h.warehouse_name, d.item_number, d.item_name,
          d.specifications, d.basic_unit, d.batch_number, d.system_quantity, d.actual_quantity,
          d.difference_quantity, d.count_status, d.quality_status, d.remark, h.count_man, h.confirmed_date,
          ROW_NUMBER() OVER (ORDER BY h.count_period DESC, d.count_number, d.line_number) AS _row_num
        FROM stock_count_detail d
        INNER JOIN stock_count h ON h.count_number = d.count_number
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

// ==================== 报表：盘点趋势 ====================
export const reportTrend = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { months = 12, warehouse_number } = req.query;

    let whereClause = `WHERE status = N'已完成'`;
    const replacements: any = {};

    if (warehouse_number) {
      whereClause += ` AND warehouse_number = :warehouse_number`;
      replacements.warehouse_number = warehouse_number;
    }

    const [items]: any = await sequelize.query(`
      SELECT TOP ${Number(months)} count_period,
        SUM(total_surplus_qty) as surplus_qty,
        SUM(total_shortage_qty) as shortage_qty,
        SUM(total_surplus_qty) - SUM(total_shortage_qty) as net_diff,
        CASE WHEN SUM(total_batches) > 0 THEN CAST(SUM(matched_batches) * 100.0 / SUM(total_batches) AS DECIMAL(5,1)) ELSE 100 END as accuracy_rate,
        COUNT(*) as count_times
      FROM stock_count ${whereClause}
      GROUP BY count_period
      ORDER BY count_period DESC
    `, { replacements });

    res.json(success(items.reverse()));
  } catch (err) { next(err); }
};

// ==================== 内部工具函数 ====================
async function recalcSummary(count_number: string, transaction: any) {
  const [stats]: any = await sequelize.query(`
    SELECT
      COUNT(*) as total_batches,
      COUNT(DISTINCT item_number) as total_items,
      SUM(CASE WHEN actual_quantity IS NOT NULL AND difference_quantity = 0 THEN 1 ELSE 0 END) as matched_batches,
      SUM(CASE WHEN difference_quantity > 0 THEN 1 ELSE 0 END) as surplus_batches,
      SUM(CASE WHEN difference_quantity < 0 THEN 1 ELSE 0 END) as shortage_batches,
      ISNULL(SUM(CASE WHEN difference_quantity > 0 THEN difference_quantity ELSE 0 END), 0) as total_surplus_qty,
      ISNULL(SUM(CASE WHEN difference_quantity < 0 THEN ABS(difference_quantity) ELSE 0 END), 0) as total_shortage_qty
    FROM stock_count_detail WHERE count_number = :count_number
  `, { replacements: { count_number }, transaction });

  const s = stats[0];
  await sequelize.query(`
    UPDATE stock_count SET
      total_items = :total_items,
      total_batches = :total_batches,
      matched_batches = :matched_batches,
      surplus_batches = :surplus_batches,
      shortage_batches = :shortage_batches,
      total_surplus_qty = :total_surplus_qty,
      total_shortage_qty = :total_shortage_qty,
      last_updated = GETDATE()
    WHERE count_number = :count_number
  `, {
    replacements: {
      total_items: s.total_items || 0,
      total_batches: s.total_batches || 0,
      matched_batches: s.matched_batches || 0,
      surplus_batches: s.surplus_batches || 0,
      shortage_batches: s.shortage_batches || 0,
      total_surplus_qty: s.total_surplus_qty || 0,
      total_shortage_qty: s.total_shortage_qty || 0,
      count_number
    }, transaction
  });
}
