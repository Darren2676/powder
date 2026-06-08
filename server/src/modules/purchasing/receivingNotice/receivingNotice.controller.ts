import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { generateBatchNumber, generateMaterialTxnNumber } from '@/services/inventory.service';
import { checkAndAutoComplete } from '@/services/documentAutoComplete.service';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 编号生成 ====================

const generateReceivingNumber = async (factoryCode: string = ''): Promise<string> => {
  const today = new Date();
  const fc = factoryCode ? factoryCode.toUpperCase() : '';
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `RN${fc}-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(receiving_number) as max_num FROM purchase_receiving_notice WHERE receiving_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return prefix + String(seq).padStart(3, '0');
};

// ==================== 列表 ====================

export const getReceivingNotices = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(receiving_number LIKE :search OR purchase_order_number LIKE :search OR supplier_name LIKE :search OR delivery_note LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      conditions.push(`approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }

    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      conditions.push(`factory_id = :_factoryId`);
      replacements._factoryId = effectiveFactoryId;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM purchase_receiving_notice ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT receiving_number, purchase_order_number, supplier_number, supplier_name, delivery_note,
               receiving_date, operator, approval_status, remark, creation_date, creation_man,
               ISNULL(f.factory_short, f.factory_name) as factory_short, f.factory_name,
               ROW_NUMBER() OVER (ORDER BY creation_date DESC, receiving_number DESC) AS _row_num
        FROM purchase_receiving_notice LEFT JOIN factory f ON purchase_receiving_notice.factory_id = f.id
        ${whereClause}
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
    }, '获取收货通知列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================

export const getReceivingNoticeDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // 多工厂防越权
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [headers]: any = await sequelize.query(
      `SELECT * FROM purchase_receiving_notice WHERE receiving_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '收货通知不存在' }); return; }
    const [details]: any = await sequelize.query(
      `SELECT * FROM purchase_receiving_notice_detail WHERE receiving_number = :id ORDER BY line_number`,
      { replacements: { id } }
    );

    // 关联查询物料主数据的默认仓库
    const itemNumbers = [...new Set(details.map((d: any) => d.item_number).filter(Boolean))];
    const defaultWarehouseMap: Record<string, { default_warehouse: string; default_warehouse_name: string }> = {};
    if (itemNumbers.length > 0) {
      const [itemRows]: any = await sequelize.query(
        `SELECT im.item_number, im.default_warehouse, w.warehouse_name AS default_warehouse_name
         FROM item_master im
         LEFT JOIN warehouse w ON im.default_warehouse = w.warehouse_number
         WHERE im.item_number IN (:itemNumbers)`,
        { replacements: { itemNumbers } }
      );
      for (const row of itemRows) {
        defaultWarehouseMap[row.item_number] = {
          default_warehouse: row.default_warehouse || '',
          default_warehouse_name: row.default_warehouse_name || ''
        };
      }
    }

    const enrichedDetails = details.map((d: any) => ({
      ...d,
      default_warehouse: defaultWarehouseMap[d.item_number]?.default_warehouse || '',
      default_warehouse_name: defaultWarehouseMap[d.item_number]?.default_warehouse_name || ''
    }));

    res.json(success({ header: headers[0], details: enrichedDetails }, '获取收货通知详情成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================

export const createReceivingNotice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const b = req.body;
    if (!b.purchase_order_number) { res.status(400).json({ success: false, message: '采购订单号不能为空' }); return; }

    const receiving_number = await generateReceivingNumber(factoryCode);
    const _factoryId = getFactoryId(req);
    const creation_man = (req as any).user?.username || '';

    // 获取 PO 供应商信息
    const [poRows]: any = await sequelize.query(
      `SELECT supplier_number, supplier_name FROM purchase_order WHERE purchase_order_number = :pon`,
      { replacements: { pon: b.purchase_order_number } }
    );

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO purchase_receiving_notice (receiving_number, purchase_order_number, supplier_number, supplier_name,
          delivery_note, receiving_date, operator, approval_status, remark, factory_id, creation_date, creation_man)
        VALUES (:receiving_number, :purchase_order_number, :supplier_number, :supplier_name,
          :delivery_note, :receiving_date, :operator, N'待确认', :remark, :factory_id, GETDATE(), :creation_man)
      `, {
        replacements: {
          receiving_number,
          purchase_order_number: b.purchase_order_number || '',
          supplier_number: poRows[0]?.supplier_number || b.supplier_number || '',
          supplier_name: poRows[0]?.supplier_name || b.supplier_name || '',
          delivery_note: b.delivery_note || '',
          receiving_date: b.receiving_date || new Date().toISOString().split('T')[0],
          operator: creation_man,
          remark: b.remark || '',
          factory_id: b.factory_id || _factoryId,
          creation_man
        },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO purchase_receiving_notice_detail (receiving_number, line_number, purchase_order_number, purchase_detail_id,
              item_number, item_name, specifications, basic_unit, order_quantity, received_quantity,
              receiving_quantity, qualified_quantity, unqualified_quantity, remark)
            VALUES (:receiving_number, :line_number, :purchase_order_number, :purchase_detail_id,
              :item_number, :item_name, :specifications, :basic_unit, :order_quantity, :received_quantity,
              :receiving_quantity, :qualified_quantity, :unqualified_quantity, :remark)
          `, {
            replacements: {
              receiving_number,
              line_number: (i + 1) * 10,
              purchase_order_number: b.purchase_order_number || '',
              purchase_detail_id: d.purchase_detail_id || 0,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              specifications: d.specifications || '',
              basic_unit: d.basic_unit || '',
              order_quantity: d.order_quantity || 0,
              received_quantity: d.received_quantity || 0,
              receiving_quantity: d.receiving_quantity || 0,
              qualified_quantity: d.qualified_quantity || 0,
              unqualified_quantity: d.unqualified_quantity || 0,
              remark: d.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success({ receiving_number }, '创建收货通知成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 删除 ====================

export const deleteReceivingNotice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM purchase_receiving_notice WHERE receiving_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (chk.length && chk[0].approval_status !== '待确认') {
      res.status(403).json({ success: false, message: '已确认的收货通知不允许删除' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM purchase_receiving_notice_detail WHERE receiving_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM purchase_receiving_notice WHERE receiving_number = :id${factoryCond}`, { replacements: { id, ...factoryReps }, transaction });
      await transaction.commit();
      res.json(success(null, '删除收货通知成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 确认收货（仓库保管员操作） ====================

export const confirmReceivingNotice = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const { id } = req.params;
    const b = req.body;
    const operator = (req as any).user?.username || '';

    // 校验收货通知状态
    const [rnRows]: any = await sequelize.query(
      `SELECT * FROM purchase_receiving_notice WHERE receiving_number = :id`, { replacements: { id } }
    );
    if (!rnRows.length) { res.status(404).json({ success: false, message: '收货通知不存在' }); return; }
    if (rnRows[0].approval_status !== '待确认') {
      res.status(403).json({ success: false, message: '该收货通知已确认' }); return;
    }

    const rn = rnRows[0];

    // 获取收货通知明细
    const [details]: any = await sequelize.query(
      `SELECT * FROM purchase_receiving_notice_detail WHERE receiving_number = :id ORDER BY line_number`,
      { replacements: { id } }
    );

    const siNumber = await generateStockInNumber(factoryCode);
    const creation_man = operator;

    // 获取PO供应商信息
    const [poRows]: any = await sequelize.query(
      `SELECT supplier_number, supplier_name FROM purchase_order WHERE purchase_order_number = :pon`,
      { replacements: { pon: rn.purchase_order_number } }
    );

    const transaction = await sequelize.transaction();
    try {
      // 生成入库单号
      await sequelize.query(`
        INSERT INTO stock_in (stock_in_number, purchase_order_number, supplier_number, supplier_name,
          warehouse_number, warehouse_name, stock_in_date, stock_in_type, approval_status,
          [condition], operator, remark, creation_date, creation_man)
        VALUES (:stock_in_number, :purchase_order_number, :supplier_number, :supplier_name,
          :warehouse_number, :warehouse_name, :stock_in_date, N'采购入库', N'草稿',
          N'启用', :operator, :remark, GETDATE(), :creation_man)
      `, {
        replacements: {
          stock_in_number: siNumber,
          purchase_order_number: rn.purchase_order_number || '',
          supplier_number: poRows[0]?.supplier_number || rn.supplier_number || '',
          supplier_name: poRows[0]?.supplier_name || rn.supplier_name || '',
          warehouse_number: b.warehouse_number || '',
          warehouse_name: b.warehouse_name || '',
          stock_in_date: new Date().toISOString().split('T')[0],
          operator: creation_man,
          remark: `收货通知${id}确认入库`,
          creation_man
        },
        transaction
      });

      // 写入入库明细（含行级仓库）
      const lineWarehouses = b.line_warehouses || {};
      for (let i = 0; i < details.length; i++) {
        const d = details[i];
        const rQty = parseFloat(d.receiving_quantity) || 0;
        if (rQty <= 0) continue;
        const qQty = parseFloat(b.qualified_quantities?.[d.item_number]) || rQty;
        const uqQty = parseFloat(b.unqualified_quantities?.[d.item_number]) || 0;
        // 行级仓库：优先 line_warehouses → 兜底到表头仓库
        const lineWh = lineWarehouses[d.item_number];
        const detailWhNumber = lineWh?.warehouse_number || b.warehouse_number || '';
        const detailWhName = lineWh?.warehouse_name || b.warehouse_name || '';
        await sequelize.query(`
          INSERT INTO stock_in_detail (stock_in_number, line_number, purchase_order_number, purchase_detail_id,
            item_number, item_name, specifications, basic_unit, order_quantity, received_quantity,
            stock_in_quantity, qualified_quantity, unqualified_quantity, batch_number, remark,
            warehouse_number, warehouse_name)
          VALUES (:stock_in_number, :line_number, :purchase_order_number, :purchase_detail_id,
            :item_number, :item_name, :specifications, :basic_unit, :order_quantity, :received_quantity,
            :stock_in_quantity, :qualified_quantity, :unqualified_quantity, '', :remark,
            :warehouse_number, :warehouse_name)
        `, {
          replacements: {
            stock_in_number: siNumber,
            line_number: (i + 1) * 10,
            purchase_order_number: rn.purchase_order_number || '',
            purchase_detail_id: d.purchase_detail_id || 0,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            order_quantity: d.order_quantity || 0,
            received_quantity: d.received_quantity || 0,
            stock_in_quantity: rQty,
            qualified_quantity: qQty,
            unqualified_quantity: uqQty,
            remark: d.remark || '',
            warehouse_number: detailWhNumber,
            warehouse_name: detailWhName
          },
          transaction
        });
      }

      // 自动报检（复制 stockIn 创建时的报检逻辑）
      const autoInspections: string[] = [];
      for (const d of details) {
        const rQty = parseFloat(d.receiving_quantity) || 0;
        if (rQty <= 0 || !d.item_number) continue;
        const [itemRows]: any = await sequelize.query(
          `SELECT incoming_inspection FROM item_master WHERE item_number = :item_number`,
          { replacements: { item_number: d.item_number }, transaction }
        );
        if (itemRows.length > 0 && itemRows[0].incoming_inspection === 'Y') {
          const { createInspectionForStockIn } = await import('../../purchasing/purchaseInspection/purchaseInspection.controller');
          const inspNo = await createInspectionForStockIn({
            stock_in_number: siNumber,
            purchase_order_number: rn.purchase_order_number || '',
            supplier_number: poRows[0]?.supplier_number || rn.supplier_number || '',
            supplier_name: poRows[0]?.supplier_name || rn.supplier_name || '',
            item_number: d.item_number,
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            received_quantity: rQty,
            batch_number: '',
            creation_man
          }, factoryCode, _factoryId, transaction);
          autoInspections.push(inspNo);
          await sequelize.query(
            `UPDATE stock_in_detail SET inspection_number = :inspNo, inspect_status = N'待检验'
             WHERE stock_in_number = :stock_in_number AND item_number = :item_number`,
            { replacements: { inspNo, stock_in_number: siNumber, item_number: d.item_number }, transaction }
          );
        }
      }

      // 确认入库（调用本地执行函数）
      await executeConfirmStockIn(siNumber, operator, factoryCode, _factoryId, transaction);

      // 更新收货通知状态
      await sequelize.query(
        `UPDATE purchase_receiving_notice SET approval_status = N'已确认', remark = :remark WHERE receiving_number = :id`,
        { replacements: { id, remark: b.remark || rn.remark || '' }, transaction }
      );

      await transaction.commit();
      res.json(success({ stock_in_number: siNumber, inspection_numbers: autoInspections }, '确认收货成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 入库单号生成（内部） ====================
async function generateStockInNumber(factoryCode: string = ''): Promise<string> {
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
  const prefix = `SI${fc}-${dateStr}-`;
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
}

// ==================== 入库确认内核（内联） ====================
async function executeConfirmStockIn(siNumber: string, operator: string, factoryCode: string = '', _factoryId: number | null = null, transaction: any) {
  const podFactoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
  const podFactoryReps = _factoryId !== null ? { _factoryId } : {};
  const [siHeader]: any = await sequelize.query(
    `SELECT * FROM stock_in WHERE stock_in_number = :id`, { replacements: { id: siNumber }, transaction }
  );
  if (!siHeader.length) throw new Error('入库单不存在');

  const header = siHeader[0];
  const [details]: any = await sequelize.query(
    `SELECT * FROM stock_in_detail WHERE stock_in_number = :id ORDER BY line_number`,
    { replacements: { id: siNumber }, transaction }
  );

  // 预查询待检仓
  const [inspWhRows]: any = await sequelize.query(
    `SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE warehouse_name = N'待检仓' OR warehouse_type = N'待检仓'`,
    { transaction }
  );
  const inspWhNumber = inspWhRows.length > 0 ? inspWhRows[0].warehouse_number : header.warehouse_number;
  const inspWhName = inspWhRows.length > 0 ? inspWhRows[0].warehouse_name : (header.warehouse_name + '(待检)');

  // 预查询物料来料检验标志
  const itemInspectionMap: Record<string, boolean> = {};
  for (const d of details) {
    if (!d.item_number || itemInspectionMap[d.item_number] !== undefined) continue;
    const [itemRows]: any = await sequelize.query(
      `SELECT incoming_inspection FROM item_master WHERE item_number = :item_number`,
      { replacements: { item_number: d.item_number }, transaction }
    );
    itemInspectionMap[d.item_number] = itemRows.length > 0 && itemRows[0].incoming_inspection === 'Y';
  }

  for (const d of details) {
    const needsInspection = itemInspectionMap[d.item_number || ''] === true;
    const qualifiedQty = parseFloat(d.qualified_quantity) || 0;
    const stockInQty = parseFloat(d.stock_in_quantity) || 0;
    const entryQty = needsInspection ? stockInQty : qualifiedQty;
    if (entryQty <= 0) continue;

    // 根据物料来料检验标志分流仓库
    // 优先级：待检仓（需检验） > 行级仓库（stock_in_detail.warehouse_number） > 表头仓库
    let whNumber: string, whName: string, sourceType: string;
    if (needsInspection) {
      whNumber = inspWhNumber;
      whName = inspWhName;
      sourceType = '来料待检';
    } else if (d.warehouse_number) {
      whNumber = d.warehouse_number;
      whName = d.warehouse_name || '';
      sourceType = '采购入库';
    } else {
      whNumber = header.warehouse_number;
      whName = header.warehouse_name;
      sourceType = '采购入库';
    }
    const inspectStatus = needsInspection ? '待检验' : '免检';

    // 生成批次号
    const batchNo = await generateBatchNumber('MB', factoryCode, transaction);

    // 写入批次库存
    await sequelize.query(`
      INSERT INTO material_batch_inventory (batch_number, item_number, item_name, item_type, specifications,
        basic_unit, warehouse_number, warehouse_name, quantity, initial_quantity,
        supplier_number, supplier_name, production_order_number, inbound_date, status, creation_date, last_updated, factory_id)
      VALUES (:batchNo, :item_number, :item_name, N'原材料', :specifications,
        :basic_unit, :warehouse_number, :warehouse_name, :quantity, :quantity,
        :supplier_number, :supplier_name, '', GETDATE(), N'正常', GETDATE(), GETDATE(), :factory_id)
    `, {
      replacements: {
        batchNo,
        item_number: d.item_number,
        item_name: d.item_name,
        specifications: d.specifications || '',
        basic_unit: d.basic_unit || '',
        warehouse_number: whNumber,
        warehouse_name: whName,
        quantity: entryQty,
        supplier_number: header.supplier_number || '',
        supplier_name: header.supplier_name || '',
        factory_id: _factoryId
      },
      transaction
    });

    // 同步汇总库存
    await sequelize.query(`
      MERGE material_inventory AS t
      USING (SELECT :item_number AS item_number, :warehouse_number AS warehouse_number, :item_name AS item_name, N'原材料' AS item_type, :specifications AS specifications, :basic_unit AS basic_unit, :warehouse_name AS warehouse_name, :quantity AS quantity) AS s
      ON (t.item_number = s.item_number AND t.warehouse_number = s.warehouse_number)
      WHEN MATCHED THEN UPDATE SET quantity = t.quantity + s.quantity, last_updated = GETDATE()
      WHEN NOT MATCHED THEN INSERT (item_number, warehouse_number, item_name, item_type, specifications, basic_unit, warehouse_name, quantity, last_updated)
      VALUES (s.item_number, s.warehouse_number, s.item_name, s.item_type, s.specifications, s.basic_unit, s.warehouse_name, s.quantity, GETDATE());
    `, {
      replacements: {
        item_number: d.item_number,
        warehouse_number: whNumber,
        item_name: d.item_name,
        specifications: d.specifications || '',
        basic_unit: d.basic_unit || '',
        warehouse_name: whName,
        quantity: entryQty
      },
      transaction
    });

    // 记录流水
    const txnNo = await generateMaterialTxnNumber(factoryCode, transaction);

    const [invRows]: any = await sequelize.query(
      `SELECT quantity FROM material_inventory WHERE item_number = :itemNo AND warehouse_number = :whNo`,
      { replacements: { itemNo: d.item_number, whNo: whNumber }, transaction }
    );
    const afterQty = invRows.length ? parseFloat(invRows[0].quantity) : entryQty;
    const beforeQty = afterQty - entryQty;

    await sequelize.query(`
      INSERT INTO material_inventory_transaction (transaction_number, transaction_type, source_type, source_number,
        item_number, item_name, item_type, specifications, basic_unit,
        warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
        batch_number, supplier_number, supplier_name, operator, operation_date, remark, creation_date)
      VALUES (:txnNo, N'入库', :sourceType, :sourceNo,
        :item_number, :item_name, N'原材料', :specifications, :basic_unit,
        :warehouse_number, :warehouse_name, :quantity, :beforeQty, :afterQty,
        :batchNo, :supplier_number, :supplier_name, :operator, GETDATE(), :remark, GETDATE())
    `, {
      replacements: {
        txnNo, sourceType, sourceNo: siNumber,
        item_number: d.item_number,
        item_name: d.item_name,
        specifications: d.specifications || '',
        basic_unit: d.basic_unit || '',
        warehouse_number: whNumber,
        warehouse_name: whName,
        quantity: entryQty,
        beforeQty, afterQty,
        batchNo,
        supplier_number: header.supplier_number || '',
        supplier_name: header.supplier_name || '',
        operator,
        remark: `入库单${siNumber}${sourceType === '来料待检' ? '来料待检' : '采购入库'}`
      },
      transaction
    });

    // 更新入库明细批次号和检验状态
    await sequelize.query(
      `UPDATE stock_in_detail SET batch_number = :batchNo, inspect_status = :inspectStatus WHERE id = :detailId`,
      { replacements: { batchNo, inspectStatus, detailId: d.id }, transaction }
    );

    // 回写 PO 明细（需检验物料跳过，等检验完成后回写）
    if (!needsInspection && d.purchase_detail_id) {
      await sequelize.query(`
        UPDATE purchase_order_detail SET
          received_quantity = received_quantity + :qty,
          receive_status = CASE
            WHEN received_quantity + :qty >= order_quantity THEN N'已到货'
            ELSE N'部分到货'
          END
        WHERE id = :detailId${podFactoryCond}
      `, { replacements: { qty: qualifiedQty, detailId: d.purchase_detail_id, ...podFactoryReps }, transaction });
    }
  }

  // 更新 PO 主表状态
  if (header.purchase_order_number) {
    const [poDetails]: any = await sequelize.query(
      `SELECT receive_status FROM purchase_order_detail WHERE purchase_order_number = :pon`,
      { replacements: { pon: header.purchase_order_number }, transaction }
    );
    const allReceived = poDetails.length > 0 && poDetails.every((r: any) => r.receive_status === '已到货');
    const anyReceived = poDetails.some((r: any) => r.receive_status !== '未到货');
    const newStatus = allReceived ? '已完成' : (anyReceived ? '执行中' : '待执行');
    await sequelize.query(
      `UPDATE purchase_order SET order_status = :newStatus WHERE purchase_order_number = :pon${podFactoryCond}`,
      { replacements: { newStatus, pon: header.purchase_order_number, ...podFactoryReps }, transaction }
    );
    // 尝试配置驱动的自动完成
    await checkAndAutoComplete('purchase_order', header.purchase_order_number, transaction);
  }

  // 更新入库单状态
  await sequelize.query(
    `UPDATE stock_in SET approval_status = N'已入库' WHERE stock_in_number = :id`,
    { replacements: { id: siNumber }, transaction }
  );
}
