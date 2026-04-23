import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { generateBatchNumber, generateMaterialTxnNumber, syncMaterialInventorySummary } from '@/services/inventory.service';
import { ORDER_STATUS, PURCHASE_STATUS } from '@/shared/constants/statuses';

// ==================== 编号生成 ====================

const generateStockInNumber = async (): Promise<string> => {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `SI-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(stock_in_number) as max_num FROM stock_in WHERE stock_in_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return prefix + String(seq).padStart(3, '0');
};

// ==================== CRUD ====================

export const getStockIns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(stock_in_number LIKE :search OR purchase_order_number LIKE :search OR supplier_name LIKE :search OR warehouse_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      conditions.push(`approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM stock_in ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT stock_in_number, purchase_order_number, supplier_number, supplier_name,
               warehouse_number, warehouse_name, stock_in_date, stock_in_type,
               approval_status, [condition], operator, remark, creation_date, creation_man,
               ROW_NUMBER() OVER (ORDER BY creation_date DESC, stock_in_number DESC) AS _row_num
        FROM stock_in ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取入库单列表成功'));
  } catch (err) { next(err); }
};

export const getStockInDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(
      `SELECT * FROM stock_in WHERE stock_in_number = :id`, { replacements: { id } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '入库单不存在' }); return; }
    const [details]: any = await sequelize.query(
      `SELECT * FROM stock_in_detail WHERE stock_in_number = :id ORDER BY line_number`, { replacements: { id } }
    );
    res.json(success({ header: headers[0], details }, '获取入库单详情成功'));
  } catch (err) { next(err); }
};

export const createStockIn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.purchase_order_number) { res.status(400).json({ success: false, message: '采购订单号不能为空' }); return; }
    if (!b.warehouse_number) { res.status(400).json({ success: false, message: '仓库不能为空' }); return; }

    const stock_in_number = await generateStockInNumber();
    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const creation_man = (req as any).user?.username || '';

    // 获取采购订单信息
    const [poHeader]: any = await sequelize.query(
      `SELECT supplier_number, supplier_name FROM purchase_order WHERE purchase_order_number = :pon`,
      { replacements: { pon: b.purchase_order_number } }
    );

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO stock_in (stock_in_number, purchase_order_number, supplier_number, supplier_name,
          warehouse_number, warehouse_name, stock_in_date, stock_in_type, approval_status,
          [condition], operator, remark, creation_date, creation_man)
        VALUES (:stock_in_number, :purchase_order_number, :supplier_number, :supplier_name,
          :warehouse_number, :warehouse_name, :stock_in_date, :stock_in_type, N'草稿',
          N'启用', :operator, :remark, :creation_date, :creation_man)
      `, {
        replacements: {
          stock_in_number,
          purchase_order_number: b.purchase_order_number || '',
          supplier_number: poHeader[0]?.supplier_number || b.supplier_number || '',
          supplier_name: poHeader[0]?.supplier_name || b.supplier_name || '',
          warehouse_number: b.warehouse_number || '',
          warehouse_name: b.warehouse_name || '',
          stock_in_date: b.stock_in_date || new Date().toISOString().split('T')[0],
          stock_in_type: b.stock_in_type || '采购入库',
          operator: creation_man,
          remark: b.remark || '',
          creation_date,
          creation_man
        },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO stock_in_detail (stock_in_number, line_number, purchase_order_number, purchase_detail_id,
              item_number, item_name, specifications, basic_unit, order_quantity, received_quantity,
              stock_in_quantity, qualified_quantity, unqualified_quantity, batch_number, remark)
            VALUES (:stock_in_number, :line_number, :purchase_order_number, :purchase_detail_id,
              :item_number, :item_name, :specifications, :basic_unit, :order_quantity, :received_quantity,
              :stock_in_quantity, :qualified_quantity, :unqualified_quantity, '', :remark)
          `, {
            replacements: {
              stock_in_number,
              line_number: (i + 1) * 10,
              purchase_order_number: b.purchase_order_number || '',
              purchase_detail_id: d.purchase_detail_id || 0,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              order_quantity: d.order_quantity || 0,
              received_quantity: d.received_quantity || 0,
              stock_in_quantity: d.stock_in_quantity || 0,
              qualified_quantity: d.qualified_quantity || 0,
              unqualified_quantity: d.unqualified_quantity || 0,
              remark: d.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success({ stock_in_number }, '创建入库单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

export const deleteStockIn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM stock_in WHERE stock_in_number = :id`, { replacements: { id } }
    );
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已入库的记录不允许删除' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM stock_in_detail WHERE stock_in_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM stock_in WHERE stock_in_number = :id`, { replacements: { id }, transaction });
      await transaction.commit();
      res.json(success(null, '删除入库单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 确认入库 ====================

export const confirmStockIn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const operator = (req as any).user?.username || '';

    // 获取入库单信息
    const [siHeader]: any = await sequelize.query(
      `SELECT * FROM stock_in WHERE stock_in_number = :id`, { replacements: { id } }
    );
    if (!siHeader.length) { res.status(404).json({ success: false, message: '入库单不存在' }); return; }
    if (siHeader[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '该入库单已确认入库' }); return;
    }

    const header = siHeader[0];

    // 获取入库明细
    const [details]: any = await sequelize.query(
      `SELECT * FROM stock_in_detail WHERE stock_in_number = :id ORDER BY line_number`,
      { replacements: { id } }
    );
    if (!details.length) { res.status(400).json({ success: false, message: '入库单无明细行' }); return; }

    const transaction = await sequelize.transaction();
    try {
      for (const d of details) {
        const qualifiedQty = parseFloat(d.qualified_quantity) || 0;
        if (qualifiedQty <= 0) continue;

        // 1. 生成批次号
        const batchNo = await generateBatchNumber('MB', transaction);

        // 2. 写入批次库存
        await sequelize.query(`
          INSERT INTO material_batch_inventory (batch_number, item_number, item_name, item_type, specifications,
            basic_unit, warehouse_number, warehouse_name, quantity, initial_quantity,
            supplier_number, supplier_name, production_order_number, inbound_date, status, creation_date, last_updated)
          VALUES (:batchNo, :item_number, :item_name, N'原材料', :specifications,
            :basic_unit, :warehouse_number, :warehouse_name, :quantity, :quantity,
            :supplier_number, :supplier_name, '', GETDATE(), N'正常', GETDATE(), GETDATE())
        `, {
          replacements: {
            batchNo,
            item_number: d.item_number,
            item_name: d.item_name,
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            warehouse_number: header.warehouse_number,
            warehouse_name: header.warehouse_name,
            quantity: qualifiedQty,
            supplier_number: header.supplier_number || '',
            supplier_name: header.supplier_name || ''
          },
          transaction
        });

        // 3. 同步汇总库存
        await syncMaterialInventorySummary(
          d.item_number, header.warehouse_number, transaction
        );

        // 4. 写入库存流水
        // 获取当前汇总库存（入库后）
        const [invRows]: any = await sequelize.query(
          `SELECT quantity FROM material_inventory WHERE item_number = :itemNo AND warehouse_number = :whNo`,
          { replacements: { itemNo: d.item_number, whNo: header.warehouse_number }, transaction }
        );
        const afterQty = invRows.length ? parseFloat(invRows[0].quantity) : qualifiedQty;
        const beforeQty = afterQty - qualifiedQty;

        const txnNo = await generateMaterialTxnNumber();
        await sequelize.query(`
          INSERT INTO material_inventory_transaction (transaction_number, transaction_type, source_type, source_number,
            item_number, item_name, item_type, specifications, basic_unit,
            warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
            batch_number, supplier_number, supplier_name, operator, operation_date, remark, creation_date)
          VALUES (:txnNo, N'入库', N'采购入库', :sourceNo,
            :item_number, :item_name, N'原材料', :specifications, :basic_unit,
            :warehouse_number, :warehouse_name, :quantity, :beforeQty, :afterQty,
            :batchNo, :supplier_number, :supplier_name, :operator, GETDATE(), :remark, GETDATE())
        `, {
          replacements: {
            txnNo,
            sourceNo: id,
            item_number: d.item_number,
            item_name: d.item_name,
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            warehouse_number: header.warehouse_number,
            warehouse_name: header.warehouse_name,
            quantity: qualifiedQty,
            beforeQty,
            afterQty,
            batchNo,
            supplier_number: header.supplier_number || '',
            supplier_name: header.supplier_name || '',
            operator,
            remark: `入库单${id}采购入库`
          },
          transaction
        });

        // 5. 更新入库单明细批次号
        await sequelize.query(
          `UPDATE stock_in_detail SET batch_number = :batchNo WHERE id = :detailId`,
          { replacements: { batchNo, detailId: d.id }, transaction }
        );

        // 6. 回写采购订单明细 received_quantity
        if (d.purchase_detail_id) {
          await sequelize.query(`
            UPDATE purchase_order_detail SET
              received_quantity = received_quantity + :qty,
              receive_status = CASE
                WHEN received_quantity + :qty >= order_quantity THEN N'已到货'
                ELSE N'部分到货'
              END
            WHERE id = :detailId
          `, { replacements: { qty: qualifiedQty, detailId: d.purchase_detail_id }, transaction });
        }
      }

      // 7. 更新采购订单主表执行状态
      if (header.purchase_order_number) {
        const [poDetails]: any = await sequelize.query(
          `SELECT receive_status FROM purchase_order_detail WHERE purchase_order_number = :pon`,
          { replacements: { pon: header.purchase_order_number }, transaction }
        );
        const allReceived = poDetails.length > 0 && poDetails.every((r: any) => r.receive_status === PURCHASE_STATUS.RECEIVED);
        const anyReceived = poDetails.some((r: any) => r.receive_status !== PURCHASE_STATUS.NOT_RECEIVED);
        const newStatus = allReceived ? '已完成' : (anyReceived ? '执行中' : '待执行');
        await sequelize.query(
          `UPDATE purchase_order SET order_status = :newStatus WHERE purchase_order_number = :pon`,
          { replacements: { newStatus, pon: header.purchase_order_number }, transaction }
        );
      }

      // 8. 更新入库单状态
      await sequelize.query(
        `UPDATE stock_in SET approval_status = N'已入库' WHERE stock_in_number = :id`,
        { replacements: { id }, transaction }
      );

      await transaction.commit();
      res.json(success(null, '确认入库成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================

export const exportStockIns = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE (h.stock_in_number LIKE :search OR h.purchase_order_number LIKE :search OR h.supplier_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }
    const [rows]: any = await sequelize.query(
      `SELECT h.stock_in_number, h.purchase_order_number, h.supplier_name, h.warehouse_name,
              h.stock_in_date, h.stock_in_type, h.approval_status, h.operator,
              d.line_number, d.item_number, d.item_name, d.specifications, d.basic_unit,
              d.stock_in_quantity, d.qualified_quantity, d.unqualified_quantity, d.batch_number
       FROM stock_in h LEFT JOIN stock_in_detail d ON h.stock_in_number = d.stock_in_number
       ${whereClause} ORDER BY h.stock_in_number DESC, d.line_number`,
      { replacements }
    );

    const fields = ['stock_in_number', 'purchase_order_number', 'supplier_name', 'warehouse_name',
      'stock_in_date', 'stock_in_type', 'approval_status', 'operator',
      'line_number', 'item_number', 'item_name', 'specifications', 'basic_unit',
      'stock_in_quantity', 'qualified_quantity', 'unqualified_quantity', 'batch_number'];
    const headers = ['入库单号', '采购订单号', '供应商', '仓库', '入库日期', '入库类型', '状态', '操作人',
      '行号', '物料编码', '物料名称', '规格', '单位', '入库数量', '合格数量', '不合格数量', '批次号'];

    exportToExcel(rows, fields, headers, 'stock_ins', res);
  } catch (err) { next(err); }
};
