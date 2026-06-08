import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { generateBatchNumber, generateMaterialTxnNumber, syncMaterialInventorySummary } from '@/services/inventory.service';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 编号生成 ====================
export const generateReturnNumber = async (factoryCode: string = '', transaction?: any): Promise<string> => {
  const today = new Date();
  const fc = factoryCode ? factoryCode.toUpperCase() : '';
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `PRT${fc}-${dateStr}-`;
  const opts: any = transaction ? { replacements: { prefix: prefix + '%' }, transaction } : { replacements: { prefix: prefix + '%' } };
  const [rows]: any = await sequelize.query(
    `SELECT MAX(return_number) as max_num FROM purchase_return WHERE return_number LIKE :prefix`, opts
  );
  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 列表 ====================
export const getPurchaseReturns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};
    if (search) {
      conditions.push(`(r.return_number LIKE :search OR r.purchase_order_number LIKE :search OR r.supplier_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      conditions.push(`r.approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      conditions.push(`r.factory_id = :_factoryId`);
      replacements._factoryId = effectiveFactoryId;
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM purchase_return r ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;
    const offset = (page - 1) * limit;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT r.*, f.factory_name, f.factory_short, ROW_NUMBER() OVER (ORDER BY r.creation_date DESC) AS _row_num
        FROM purchase_return r
        LEFT JOIN factory f ON r.factory_id = f.id
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取采购退货列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getPurchaseReturnDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps: any = _factoryId !== null ? { _factoryId } : {};
    const [headers]: any = await sequelize.query(
      `SELECT * FROM purchase_return WHERE return_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '退货单不存在' }); return; }
    const [details]: any = await sequelize.query(
      `SELECT * FROM purchase_return_detail WHERE return_number = :id ORDER BY line_number`, { replacements: { id } }
    );
    res.json(success({ header: headers[0], details }, '获取退货单详情成功'));
  } catch (err) { next(err); }
};

// ==================== 获取采购订单已入库物料 ====================
export const getPOReceivedItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { poNumber } = req.params;
    const [poHeader]: any = await sequelize.query(
      `SELECT purchase_order_number, supplier_number, supplier_name FROM purchase_order WHERE purchase_order_number = :po`, { replacements: { po: poNumber } }
    );
    if (!poHeader.length) { res.status(404).json({ success: false, message: '采购订单不存在' }); return; }

    // 获取已入库的明细行
    const [details]: any = await sequelize.query(`
      SELECT pod.id as purchase_detail_id, pod.item_number, pod.item_name, pod.specifications, pod.basic_unit,
             pod.order_quantity, pod.unit_price, pod.received_quantity, pod.receive_status,
             si.stock_in_number
      FROM purchase_order_detail pod
      INNER JOIN stock_in_detail sid ON sid.purchase_detail_id = pod.id AND sid.qualified_quantity > 0
      INNER JOIN stock_in si ON si.stock_in_number = sid.stock_in_number AND si.approval_status = N'已入库'
      WHERE pod.purchase_order_number = :po AND pod.received_quantity > 0
      ORDER BY pod.line_number
    `, { replacements: { po: poNumber } });

    // 去重(同一个PO明细可能对应多个stock_in)
    const seen = new Set<number>();
    const uniqueDetails = details.filter((d: any) => {
      if (seen.has(d.purchase_detail_id)) return false;
      seen.add(d.purchase_detail_id);
      return true;
    });

    res.json(success({ poHeader: poHeader[0], details: uniqueDetails }, '获取已入库物料成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createPurchaseReturn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const b = req.body;
    if (!b.purchase_order_number) { res.status(400).json({ success: false, message: '采购订单号不能为空' }); return; }
    if (!b.details || !b.details.length) { res.status(400).json({ success: false, message: '请选择退货明细' }); return; }

    const return_number = await generateReturnNumber(factoryCode);
    const _factoryId = getFactoryId(req);
    const creation_man = (req as any).user?.username || '';
    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    let totalQty = 0, totalAmt = 0;

    const transaction = await sequelize.transaction();
    try {
      for (const d of b.details) {
        const retQty = parseFloat(d.return_quantity) || 0;
        const unitPrice = parseFloat(d.unit_price) || 0;
        totalQty += retQty;
        totalAmt += retQty * unitPrice;
      }

      await sequelize.query(`
        INSERT INTO purchase_return (return_number, purchase_order_number, supplier_number, supplier_name,
          return_type, return_reason, warehouse_number, warehouse_name,
          approval_status, return_status, exchange_status, total_return_quantity, total_return_amount,
          remark, factory_id, creation_date, creation_man)
        VALUES (:return_number, :purchase_order_number, :supplier_number, :supplier_name,
          :return_type, :return_reason, :warehouse_number, :warehouse_name,
          N'草稿', N'待退货', N'待换货', :total_return_quantity, :total_return_amount,
          :remark, :factory_id, :creation_date, :creation_man)
      `, {
        replacements: {
          return_number,
          purchase_order_number: b.purchase_order_number || '',
          supplier_number: b.supplier_number || '',
          supplier_name: b.supplier_name || '',
          return_type: b.return_type || '退货退款',
          return_reason: b.return_reason || '',
          warehouse_number: b.warehouse_number || '',
          warehouse_name: b.warehouse_name || '',
          total_return_quantity: totalQty,
          total_return_amount: totalAmt,
          remark: b.remark || '',
          factory_id: b.factory_id || _factoryId,
          creation_date,
          creation_man
        },
        transaction
      });

      for (let i = 0; i < b.details.length; i++) {
        const d = b.details[i];
        const retQty = parseFloat(d.return_quantity) || 0;
        const unitPrice = parseFloat(d.unit_price) || 0;
        await sequelize.query(`
          INSERT INTO purchase_return_detail (return_number, line_number, purchase_detail_id, stock_in_number,
            item_number, item_name, specifications, basic_unit,
            received_quantity, return_quantity, unit_price, return_amount,
            exchange_quantity, exchange_status, remark)
          VALUES (:return_number, :line_number, :purchase_detail_id, :stock_in_number,
            :item_number, :item_name, :specifications, :basic_unit,
            :received_quantity, :return_quantity, :unit_price, :return_amount,
            :exchange_quantity, :exchange_status, :remark)
        `, {
          replacements: {
            return_number,
            line_number: (i + 1) * 10,
            purchase_detail_id: d.purchase_detail_id || 0,
            stock_in_number: d.stock_in_number || '',
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            received_quantity: d.received_quantity || 0,
            return_quantity: retQty,
            unit_price: unitPrice,
            return_amount: retQty * unitPrice,
            exchange_quantity: b.return_type === '退货换货' ? retQty : 0,
            exchange_status: b.return_type === '退货换货' ? '待换货' : '',
            remark: d.remark || ''
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ return_number }, '创建采购退货单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 更新 ====================
export const updatePurchaseReturn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps: any = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM purchase_return WHERE return_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '退货单不存在' }); return; }
    if (chk[0].approval_status !== '草稿') { res.status(403).json({ success: false, message: '非草稿状态不允许编辑' }); return; }

    let totalQty = 0, totalAmt = 0;
    for (const d of (b.details || [])) {
      totalQty += parseFloat(d.return_quantity) || 0;
      totalAmt += (parseFloat(d.return_quantity) || 0) * (parseFloat(d.unit_price) || 0);
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE purchase_return SET
          return_type = :return_type, return_reason = :return_reason,
          warehouse_number = :warehouse_number, warehouse_name = :warehouse_name,
          total_return_quantity = :total_return_quantity, total_return_amount = :total_return_amount,
          remark = :remark
        WHERE return_number = :id${factoryCond}
      `, {
        replacements: {
          id,
          return_type: b.return_type || '退货退款',
          return_reason: b.return_reason || '',
          warehouse_number: b.warehouse_number || '',
          warehouse_name: b.warehouse_name || '',
          total_return_quantity: totalQty,
          total_return_amount: totalAmt,
          remark: b.remark || '',
          ...factoryReps
        },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        await sequelize.query(`DELETE FROM purchase_return_detail WHERE return_number = :id`, { replacements: { id }, transaction });
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          const retQty = parseFloat(d.return_quantity) || 0;
          const unitPrice = parseFloat(d.unit_price) || 0;
          await sequelize.query(`
            INSERT INTO purchase_return_detail (return_number, line_number, purchase_detail_id, stock_in_number,
              item_number, item_name, specifications, basic_unit,
              received_quantity, return_quantity, unit_price, return_amount,
              exchange_quantity, exchange_status, remark)
            VALUES (:return_number, :line_number, :purchase_detail_id, :stock_in_number,
              :item_number, :item_name, :specifications, :basic_unit,
              :received_quantity, :return_quantity, :unit_price, :return_amount,
              :exchange_quantity, :exchange_status, :remark)
          `, {
            replacements: {
              return_number: id,
              line_number: (i + 1) * 10,
              purchase_detail_id: d.purchase_detail_id || 0,
              stock_in_number: d.stock_in_number || '',
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              received_quantity: d.received_quantity || 0,
              return_quantity: retQty,
              unit_price: unitPrice,
              return_amount: retQty * unitPrice,
              exchange_quantity: b.return_type === '退货换货' ? retQty : 0,
              exchange_status: b.return_type === '退货换货' ? '待换货' : '',
              remark: d.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success(null, '更新采购退货单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 删除 ====================
export const deletePurchaseReturn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM purchase_return WHERE return_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '退货单不存在' }); return; }
    if (chk[0].approval_status !== '草稿') { res.status(403).json({ success: false, message: '非草稿状态不允许删除' }); return; }
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM purchase_return_detail WHERE return_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM purchase_return WHERE return_number = :id${factoryCond}`, { replacements: { id, ...factoryReps }, transaction });
      await transaction.commit();
      res.json(success(null, '删除成功'));
    } catch (e) { await transaction.rollback(); throw e; }
  } catch (err) { next(err); }
};

// ==================== 提交审批 ====================
export const submitPurchaseReturn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM purchase_return WHERE return_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    if (!chk.length) { res.status(404).json({ success: false, message: '退货单不存在' }); return; }
    if (chk[0].approval_status !== '草稿') { res.status(400).json({ success: false, message: '只有草稿可以提交审批' }); return; }
    await sequelize.query(`UPDATE purchase_return SET approval_status = N'待审批' WHERE return_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    res.json(success(null, '提交审批成功'));
  } catch (err) { next(err); }
};

// ==================== 审批通过 ====================
export const approvePurchaseReturn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM purchase_return WHERE return_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    if (!chk.length) { res.status(404).json({ success: false, message: '退货单不存在' }); return; }
    if (chk[0].approval_status !== '待审批') { res.status(400).json({ success: false, message: '只有待审批可以审批' }); return; }
    await sequelize.query(`UPDATE purchase_return SET approval_status = N'已审批' WHERE return_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    res.json(success(null, '审批通过'));
  } catch (err) { next(err); }
};

// ==================== 审批驳回 ====================
export const rejectPurchaseReturn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    await sequelize.query(`UPDATE purchase_return SET approval_status = N'已驳回' WHERE return_number = :id AND approval_status = N'待审批'${factoryCond}`, { replacements: { id, ...factoryReps } });
    res.json(success(null, '已驳回'));
  } catch (err) { next(err); }
};

// ==================== 撤消审批 ====================
export const withdrawPurchaseReturn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(`SELECT approval_status, return_status FROM purchase_return WHERE return_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    if (!chk.length) { res.status(404).json({ success: false, message: '退货单不存在' }); return; }
    if (chk[0].approval_status !== '已审批') { res.status(400).json({ success: false, message: '只有已审批可以撤消' }); return; }
    if (chk[0].return_status !== '待退货') { res.status(400).json({ success: false, message: '已执行退货，不可撤消' }); return; }
    await sequelize.query(`UPDATE purchase_return SET approval_status = N'草稿' WHERE return_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    res.json(success(null, '已撤消审批'));
  } catch (err) { next(err); }
};

// ==================== 执行退货出库（核心） ====================
export const executeReturn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const { id } = req.params;
    const operator = (req as any).user?.username || '';

    const [headers]: any = await sequelize.query(
      `SELECT * FROM purchase_return WHERE return_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '退货单不存在' }); return; }
    const header = headers[0];
    if (header.approval_status !== '已审批') { res.status(400).json({ success: false, message: '只有已审批的退货单才能执行退货' }); return; }
    if (header.return_status === '已退货') { res.status(400).json({ success: false, message: '退货已完成，不可重复执行' }); return; }

    const [details]: any = await sequelize.query(
      `SELECT * FROM purchase_return_detail WHERE return_number = :id ORDER BY line_number`, { replacements: { id } }
    );

    const transaction = await sequelize.transaction();
    try {
      const factoryCode = await getFactoryCode(req);
      for (const d of details) {
        const retQty = parseFloat(d.return_quantity) || 0;
        if (retQty <= 0) continue;

        const whNumber = header.warehouse_number;
        const whName = header.warehouse_name;

        // 1. 查批次库存(FIFO)
        const [batches]: any = await sequelize.query(`
          SELECT id, batch_number, quantity FROM material_batch_inventory
          WHERE item_number = :item_number AND warehouse_number = :warehouse_number AND status != N'冻结'
          ORDER BY creation_date ASC
        `, { replacements: { item_number: d.item_number, warehouse_number: whNumber }, transaction });

        let remaining = retQty;
        for (const batch of batches) {
          if (remaining <= 0) break;
          const batchQty = parseFloat(batch.quantity) || 0;
          if (batchQty <= 0) continue;
          const deduct = Math.min(remaining, batchQty);
          const newBatchQty = batchQty - deduct;

          await sequelize.query(
            `UPDATE material_batch_inventory SET quantity = :qty WHERE id = :id`,
            { replacements: { qty: newBatchQty, id: batch.id }, transaction }
          );
          remaining -= deduct;
        }

        if (remaining > 0) {
          // 库存不足，回滚
          await transaction.rollback();
          res.status(400).json({ success: false, message: `物料 ${d.item_number} 库存不足，无法退货 ${retQty}` });
          return;
        }

        // 2. 同步汇总库存
        await syncMaterialInventorySummary(d.item_number, whNumber, transaction);

        // 3. 写入库存流水
        const [invRows]: any = await sequelize.query(
          `SELECT ISNULL(quantity, 0) as qty FROM material_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number`,
          { replacements: { item_number: d.item_number, warehouse_number: whNumber }, transaction }
        );
        const afterQty = parseFloat(invRows[0]?.qty) || 0;
        const beforeQty = afterQty + retQty;

        const txNum = await generateMaterialTxnNumber(factoryCode, transaction);
        await sequelize.query(`
          INSERT INTO material_inventory_transaction (transaction_number, transaction_type, source_type, source_number,
            item_number, item_name, specifications, basic_unit, item_type,
            warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
            batch_number, supplier_number, supplier_name, operator, remark, creation_date)
          VALUES (:transaction_number, N'出库', N'采购退货出库', :source_number,
            :item_number, :item_name, :specifications, :basic_unit, N'原材料',
            :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
            :batch_number, :supplier_number, :supplier_name, :operator, :remark, GETDATE())
        `, {
          replacements: {
            transaction_number: txNum,
            source_number: id,
            item_number: d.item_number,
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            warehouse_number: whNumber,
            warehouse_name: whName,
            quantity: retQty,
            before_quantity: beforeQty,
            after_quantity: afterQty,
            batch_number: '',
            supplier_number: header.supplier_number || '',
            supplier_name: header.supplier_name || '',
            operator,
            remark: `采购退货 ${id}`
          },
          transaction
        });

        // 4. 回写采购订单明细 received_quantity
        if (d.purchase_detail_id && Number(d.purchase_detail_id) > 0) {
          await sequelize.query(`
            UPDATE purchase_order_detail SET
              received_quantity = received_quantity - :retQty,
              receive_status = CASE
                WHEN received_quantity - :retQty <= 0 THEN N'未到货'
                WHEN received_quantity - :retQty < order_quantity THEN N'部分到货'
                ELSE N'已到货'
              END
            WHERE id = :detailId AND factory_id = :_factoryId
          `, { replacements: { retQty, detailId: d.purchase_detail_id, ...factoryReps }, transaction });
        }
      }

      // 5. 重算采购订单主表状态
      if (header.purchase_order_number) {
        const [poDetails]: any = await sequelize.query(
          `SELECT receive_status FROM purchase_order_detail WHERE purchase_order_number = :pon`,
          { replacements: { pon: header.purchase_order_number }, transaction }
        );
        const allReceived = poDetails.length > 0 && poDetails.every((r: any) => r.receive_status === '已到货');
        const anyReceived = poDetails.some((r: any) => r.receive_status !== '未到货');
        const newStatus = allReceived ? '已完成' : (anyReceived ? '执行中' : '待执行');
        await sequelize.query(
          `UPDATE purchase_order SET order_status = :newStatus WHERE purchase_order_number = :pon${factoryCond}`,
          { replacements: { newStatus, pon: header.purchase_order_number, ...factoryReps }, transaction }
        );
      }

      // 6. 更新退货单状态
      await sequelize.query(
        `UPDATE purchase_return SET return_status = N'已退货' WHERE return_number = :id${factoryCond}`,
        { replacements: { id, ...factoryReps }, transaction }
      );

      await transaction.commit();
      res.json(success(null, '退货出库执行成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 打印 ====================

export const printPurchaseReturn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps: any = _factoryId !== null ? { _factoryId } : {};
    const [headerRows]: any = await sequelize.query(
      `SELECT * FROM purchase_return WHERE return_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (!headerRows.length) { res.status(404).json({ success: false, message: '退货单不存在' }); return; }
    const header = headerRows[0];

    const [details]: any = await sequelize.query(
      `SELECT * FROM purchase_return_detail WHERE return_number = :id ORDER BY line_number`,
      { replacements: { id } }
    );

    const totalAmount = parseFloat(header.total_return_amount || 0).toFixed(2);
    const totalQuantity = parseFloat(header.total_return_quantity || 0).toFixed(2);
    const creationDate = header.creation_date || '';

    const detailRows = details.map((d: any, i: number) => `
      <tr>
        <td style="text-align:center">${i + 1}</td>
        <td>${d.item_number || ''}</td>
        <td>${d.item_name || ''}</td>
        <td>${d.specifications || ''}</td>
        <td style="text-align:center">${d.basic_unit || ''}</td>
        <td style="text-align:right">${parseFloat(d.received_quantity || 0).toFixed(2)}</td>
        <td style="text-align:right">${parseFloat(d.return_quantity || 0).toFixed(2)}</td>
        <td style="text-align:right">${parseFloat(d.unit_price || 0).toFixed(2)}</td>
        <td style="text-align:right">${parseFloat(d.return_amount || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>采购退货单 ${header.return_number}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: "SimSun", "宋体", serif; font-size: 14px; color: #000; padding: 40px 30px; }
  .header { text-align: center; margin-bottom: 20px; }
  .header h1 { font-size: 22px; margin-bottom: 4px; }
  .header .sub { font-size: 16px; }
  .info-section { display: flex; justify-content: space-between; margin-bottom: 16px; }
  .info-block { width: 48%; }
  .info-row { display: flex; margin-bottom: 4px; }
  .info-label { width: 80px; flex-shrink: 0; }
  .info-value { border-bottom: 1px solid #000; flex: 1; min-width: 100px; padding: 0 4px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th, td { border: 1px solid #000; padding: 6px 8px; font-size: 13px; }
  th { background: #f0f0f0; text-align: center; }
  .total-row td { font-weight: bold; font-size: 14px; }
  .footer { display: flex; justify-content: space-between; margin-top: 30px; }
  .footer div { width: 30%; text-align: center; }
  .footer .label { margin-bottom: 30px; }
  .remark { margin-top: 16px; }
  .remark .info-label { width: 60px; }
  @media print {
    body { padding: 10px 15px; }
    @page { size: A4 landscape; margin: 12mm; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>采 购 退 货 单</h1>
    <div class="sub">编号: ${header.return_number}</div>
  </div>

  <div class="info-section">
    <div class="info-block">
      <div class="info-row"><span class="info-label">供应商:</span><span class="info-value">${header.supplier_name || ''}</span></div>
      <div class="info-row"><span class="info-label">采购订单号:</span><span class="info-value">${header.purchase_order_number || ''}</span></div>
      <div class="info-row"><span class="info-label">退货仓库:</span><span class="info-value">${header.warehouse_name || ''}</span></div>
    </div>
    <div class="info-block">
      <div class="info-row"><span class="info-label">退货类型:</span><span class="info-value">${header.return_type || ''}</span></div>
      <div class="info-row"><span class="info-label">退货状态:</span><span class="info-value">${header.return_status || ''}</span></div>
      <div class="info-row"><span class="info-label">创建日期:</span><span class="info-value">${creationDate}</span></div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width:40px">序号</th>
        <th style="width:110px">物料编码</th>
        <th>物料名称</th>
        <th>规格</th>
        <th style="width:50px">单位</th>
        <th style="width:85px">已入库数量</th>
        <th style="width:85px">退货数量</th>
        <th style="width:75px">单价</th>
        <th style="width:85px">退货金额</th>
      </tr>
    </thead>
    <tbody>
      ${detailRows}
    </tbody>
    <tfoot>
      <tr class="total-row">
        <td colspan="6" style="text-align:right">合计:</td>
        <td style="text-align:right">${totalQuantity}</td>
        <td></td>
        <td style="text-align:right">${totalAmount}</td>
      </tr>
    </tfoot>
  </table>

  <div class="remark">
    <div class="info-row"><span class="info-label">退货原因:</span><span class="info-value">${header.return_reason || ''}</span></div>
    <div class="info-row" style="margin-top:4px"><span class="info-label">备注:</span><span class="info-value">${header.remark || ''}</span></div>
  </div>

  <div class="footer">
    <div><div class="label">制单人:</div>${header.creation_man || ''}</div>
    <div><div class="label">审批人:</div></div>
    <div><div class="label">日期:</div>${new Date().toLocaleDateString('zh-CN')}</div>
  </div>

  <script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) { next(err); }
};

// ==================== 换货入库 ====================
export const exchangeStockIn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const { id } = req.params;
    const operator = (req as any).user?.username || '';

    const [headers]: any = await sequelize.query(
      `SELECT * FROM purchase_return WHERE return_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '退货单不存在' }); return; }
    const header = headers[0];
    if (header.return_type !== '退货换货') { res.status(400).json({ success: false, message: '只有退货换货类型才能执行换货入库' }); return; }
    if (header.return_status !== '已退货') { res.status(400).json({ success: false, message: '请先执行退货出库' }); return; }
    if (header.exchange_status === '已换货') { res.status(400).json({ success: false, message: '换货已完成' }); return; }

    const [details]: any = await sequelize.query(
      `SELECT * FROM purchase_return_detail WHERE return_number = :id ORDER BY line_number`, { replacements: { id } }
    );

    const transaction = await sequelize.transaction();
    try {
      const factoryCode = await getFactoryCode(req);
      const whNumber = header.warehouse_number;
      const whName = header.warehouse_name;
      let allExchanged = true;

      for (const d of details) {
        const exQty = parseFloat(d.exchange_quantity) || 0;
        if (exQty <= 0) continue;
        if (d.exchange_status === '已换货') continue;

        // 1. 生成批次号
        const batchNo = await generateBatchNumber('MB', factoryCode, transaction);

        // 2. 写入批次库存
        await sequelize.query(`
          INSERT INTO material_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit, item_type,
            warehouse_number, warehouse_name, quantity, status, creation_date, factory_id)
          VALUES (:batch_number, :item_number, :item_name, :specifications, :basic_unit, N'原材料',
            :warehouse_number, :warehouse_name, :quantity, N'可用', GETDATE(), :factory_id)
        `, {
          replacements: {
            batch_number: batchNo,
            item_number: d.item_number,
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            warehouse_number: whNumber,
            warehouse_name: whName,
            quantity: exQty,
            factory_id: _factoryId
          },
          transaction
        });

        // 3. 同步汇总库存
        await syncMaterialInventorySummary(d.item_number, whNumber, transaction);

        // 4. 写入库存流水
        const [invRows]: any = await sequelize.query(
          `SELECT ISNULL(quantity, 0) as qty FROM material_inventory WHERE item_number = :item_number AND warehouse_number = :warehouse_number`,
          { replacements: { item_number: d.item_number, warehouse_number: whNumber }, transaction }
        );
        const afterQty = parseFloat(invRows[0]?.qty) || 0;
        const beforeQty = afterQty - exQty;

        const txNum = await generateMaterialTxnNumber(factoryCode, transaction);
        await sequelize.query(`
          INSERT INTO material_inventory_transaction (transaction_number, transaction_type, source_type, source_number,
            item_number, item_name, specifications, basic_unit, item_type,
            warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
            batch_number, supplier_number, supplier_name, operator, remark, creation_date)
          VALUES (:transaction_number, N'入库', N'换货入库', :source_number,
            :item_number, :item_name, :specifications, :basic_unit, N'原材料',
            :warehouse_number, :warehouse_name, :quantity, :before_quantity, :after_quantity,
            :batch_number, :supplier_number, :supplier_name, :operator, :remark, GETDATE())
        `, {
          replacements: {
            transaction_number: txNum,
            source_number: id,
            item_number: d.item_number,
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            warehouse_number: whNumber,
            warehouse_name: whName,
            quantity: exQty,
            before_quantity: beforeQty,
            after_quantity: afterQty,
            batch_number: batchNo,
            supplier_number: header.supplier_number || '',
            supplier_name: header.supplier_name || '',
            operator,
            remark: `换货入库 ${id}`
          },
          transaction
        });

        // 5. 回写采购订单 received_quantity
        if (d.purchase_detail_id && Number(d.purchase_detail_id) > 0) {
          await sequelize.query(`
            UPDATE purchase_order_detail SET
              received_quantity = received_quantity + :exQty,
              receive_status = CASE
                WHEN received_quantity + :exQty >= order_quantity THEN N'已到货'
                ELSE N'部分到货'
              END
            WHERE id = :detailId AND factory_id = :_factoryId
          `, { replacements: { exQty, detailId: d.purchase_detail_id, ...factoryReps }, transaction });
        }

        // 6. 更新明细换货状态
        await sequelize.query(
          `UPDATE purchase_return_detail SET exchange_status = N'已换货' WHERE id = :id`,
          { replacements: { id: d.id }, transaction }
        );
      }

      // 7. 重算采购订单主表状态
      if (header.purchase_order_number) {
        const [poDetails]: any = await sequelize.query(
          `SELECT receive_status FROM purchase_order_detail WHERE purchase_order_number = :pon`,
          { replacements: { pon: header.purchase_order_number }, transaction }
        );
        const allReceived = poDetails.length > 0 && poDetails.every((r: any) => r.receive_status === '已到货');
        const anyReceived = poDetails.some((r: any) => r.receive_status !== '未到货');
        const newStatus = allReceived ? '已完成' : (anyReceived ? '执行中' : '待执行');
        await sequelize.query(
          `UPDATE purchase_order SET order_status = :newStatus WHERE purchase_order_number = :pon${factoryCond}`,
          { replacements: { newStatus, pon: header.purchase_order_number, ...factoryReps }, transaction }
        );
      }

      // 8. 更新退货单换货状态
      const [remainDetails]: any = await sequelize.query(
        `SELECT exchange_status FROM purchase_return_detail WHERE return_number = :id`,
        { replacements: { id }, transaction }
      );
      const allDone = remainDetails.every((r: any) => r.exchange_status === '已换货');
      await sequelize.query(
        `UPDATE purchase_return SET exchange_status = :es WHERE return_number = :id${factoryCond}`,
        { replacements: { es: allDone ? '已换货' : '部分换货', id, ...factoryReps }, transaction }
      );

      await transaction.commit();
      res.json(success(null, '换货入库执行成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};
