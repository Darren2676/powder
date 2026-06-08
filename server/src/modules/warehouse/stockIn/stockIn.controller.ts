import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { generateBatchNumber, generateMaterialTxnNumber, syncMaterialInventorySummary } from '@/services/inventory.service';
import { ORDER_STATUS, PURCHASE_STATUS } from '@/shared/constants/statuses';
import { checkAndAutoComplete } from '@/services/documentAutoComplete.service';
import { createInspectionForStockIn } from '../../../modules/purchasing/purchaseInspection/purchaseInspection.controller';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 编号生成 ====================

const generateStockInNumber = async (factoryCode: string = ''): Promise<string> => {
  const today = new Date();
  const fc = factoryCode ? factoryCode.toUpperCase() : '';
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
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

    // 多工厂数据隔离过滤
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      conditions.push(`factory_id = :_factoryId`);
      replacements._factoryId = effectiveFactoryId;
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
               ISNULL(f.factory_short, f.factory_name) as factory_short, f.factory_name,
               ROW_NUMBER() OVER (ORDER BY creation_date DESC, stock_in_number DESC) AS _row_num
        FROM stock_in LEFT JOIN factory f ON stock_in.factory_id = f.id
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
    }, '获取入库单列表成功'));
  } catch (err) { next(err); }
};

export const getStockInDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    // 多工厂防越权
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [headers]: any = await sequelize.query(
      `SELECT * FROM stock_in WHERE stock_in_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
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
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const b = req.body;
    if (!b.purchase_order_number) { res.status(400).json({ success: false, message: '采购订单号不能为空' }); return; }
    if (!b.warehouse_number) { res.status(400).json({ success: false, message: '仓库不能为空' }); return; }

    const stock_in_number = await generateStockInNumber(factoryCode);
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
          [condition], operator, remark, factory_id, creation_date, creation_man)
        VALUES (:stock_in_number, :purchase_order_number, :supplier_number, :supplier_name,
          :warehouse_number, :warehouse_name, :stock_in_date, :stock_in_type, N'草稿',
          N'启用', :operator, :remark, :factory_id, :creation_date, :creation_man)
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
          factory_id: _factoryId,
          creation_date,
          creation_man
        },
        transaction
      });

      const autoInspections: string[] = [];

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

        // 自动报检：遍历明细行，对"需要检验"的物料自动创建采购质量检验单
        for (const d of b.details) {
          if (!d.item_number) continue;
          const [itemRows]: any = await sequelize.query(
            `SELECT incoming_inspection FROM item_master WHERE item_number = :item_number`,
            { replacements: { item_number: d.item_number }, transaction }
          );
          if (itemRows.length > 0 && itemRows[0].incoming_inspection === 'Y') {
              const inspNo = await createInspectionForStockIn({
                stock_in_number,
                purchase_order_number: b.purchase_order_number || '',
                supplier_number: poHeader[0]?.supplier_number || b.supplier_number || '',
                supplier_name: poHeader[0]?.supplier_name || b.supplier_name || '',
                item_number: d.item_number,
                item_name: d.item_name || '',
                specifications: d.specifications || '',
                basic_unit: d.basic_unit || '',
                received_quantity: d.stock_in_quantity || d.received_quantity || 0,
                batch_number: '',
                creation_man
              }, factoryCode, _factoryId, transaction);
              autoInspections.push(inspNo);
              // 回写检验单号到入库明细行，同时将合格数量置0（等待检验结果）
              await sequelize.query(
                `UPDATE stock_in_detail SET inspection_number = :inspNo, inspect_status = N'待检验', qualified_quantity = 0
                 WHERE stock_in_number = :stock_in_number AND item_number = :item_number`,
                { replacements: { inspNo, stock_in_number, item_number: d.item_number }, transaction }
              );
          }
        }
      }

      await transaction.commit();
      res.json(success({ stock_in_number, auto_inspections: autoInspections }, '创建入库单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

export const deleteStockIn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM stock_in WHERE stock_in_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (!chk.length) {
      res.status(404).json({ success: false, message: '入库单不存在' }); return;
    }
    if (chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已入库的记录不允许删除' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM stock_in_detail WHERE stock_in_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM stock_in WHERE stock_in_number = :id${factoryCond}`, { replacements: { id, ...factoryReps }, transaction });
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
    const factoryCode = await getFactoryCode(req);
    const { id } = req.params;
    const operator = (req as any).user?.username || '';
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    // 获取入库单信息
    const [siHeader]: any = await sequelize.query(
      `SELECT * FROM stock_in WHERE stock_in_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
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
      // 预查询待检仓信息（来料检验用，按当前工厂过滤）
      const [inspWhRows]: any = await sequelize.query(
        `SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE (warehouse_name = N'待检仓' OR warehouse_type = N'待检仓')${factoryCond}`,
        { replacements: { ...factoryReps }, transaction }
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
        // 需检验物料用 stock_in_quantity 入库，非检验物料用 qualified_quantity
        const entryQty = needsInspection ? stockInQty : qualifiedQty;
        if (entryQty <= 0) continue;

        // 根据物料来料检验标志分流仓库
        const whNumber = needsInspection ? inspWhNumber : header.warehouse_number;
        const whName = needsInspection ? inspWhName : header.warehouse_name;
        const sourceType = needsInspection ? '来料待检' : '采购入库';
        const inspectStatus = needsInspection ? '待检验' : '免检';

        // 1. 生成批次号
        const batchNo = await generateBatchNumber('MB', factoryCode, transaction);

        // 2. 写入批次库存
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

        // 3. 同步汇总库存
        await syncMaterialInventorySummary(
          d.item_number, whNumber, transaction
        );

        // 4. 写入库存流水
        const [invRows]: any = await sequelize.query(
          `SELECT quantity FROM material_inventory WHERE item_number = :itemNo AND warehouse_number = :whNo`,
          { replacements: { itemNo: d.item_number, whNo: whNumber }, transaction }
        );
        const afterQty = invRows.length ? parseFloat(invRows[0].quantity) : entryQty;
        const beforeQty = afterQty - entryQty;

        const txnNo = await generateMaterialTxnNumber(factoryCode, transaction);
        await sequelize.query(`
          INSERT INTO material_inventory_transaction (transaction_number, transaction_type, source_type, source_number,
            item_number, item_name, item_type, specifications, basic_unit,
            warehouse_number, warehouse_name, quantity, before_quantity, after_quantity,
            batch_number, supplier_number, supplier_name, operator, operation_date, remark, creation_date, factory_id)
          VALUES (:txnNo, N'入库', :sourceType, :sourceNo,
            :item_number, :item_name, N'原材料', :specifications, :basic_unit,
            :warehouse_number, :warehouse_name, :quantity, :beforeQty, :afterQty,
            :batchNo, :supplier_number, :supplier_name, :operator, GETDATE(), :remark, GETDATE(), :factory_id)
        `, {
          replacements: {
            txnNo,
            sourceType,
            sourceNo: id,
            item_number: d.item_number,
            item_name: d.item_name,
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            warehouse_number: whNumber,
            warehouse_name: whName,
            quantity: entryQty,
            beforeQty,
            afterQty,
            batchNo,
            supplier_number: header.supplier_number || '',
            supplier_name: header.supplier_name || '',
            operator,
            remark: `入库单${id}${sourceType === '来料待检' ? '来料待检' : '采购入库'}`,
            factory_id: _factoryId
          },
          transaction
        });

        // 5. 更新入库单明细批次号与检验状态
        await sequelize.query(
          `UPDATE stock_in_detail SET batch_number = :batchNo, inspect_status = :inspectStatus WHERE id = :detailId`,
          { replacements: { batchNo, inspectStatus, detailId: d.id }, transaction }
        );

        // 5b. 回写检验单批次号（需检验物料在创建入库单时检验单的batch_number为空，确认入库后需更新）
        if (needsInspection && d.inspection_number) {
          await sequelize.query(
            `UPDATE purchase_quality_inspection SET batch_number = :batchNo WHERE inspection_number = :inspNo`,
            { replacements: { batchNo, inspNo: d.inspection_number }, transaction }
          );
        }

        // 6. 回写采购订单明细 received_quantity（需检验物料跳过，等检验完成后回写）
        if (!needsInspection && d.purchase_detail_id) {
          await sequelize.query(`
            UPDATE purchase_order_detail SET
              received_quantity = received_quantity + :qty,
              receive_status = CASE
                WHEN received_quantity + :qty >= order_quantity THEN N'已到货'
                ELSE N'部分到货'
              END
            WHERE id = :detailId AND factory_id = :_factoryId
          `, { replacements: { qty: qualifiedQty, detailId: d.purchase_detail_id, ...factoryReps }, transaction });
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
          `UPDATE purchase_order SET order_status = :newStatus WHERE purchase_order_number = :pon${factoryCond}`,
          { replacements: { newStatus, pon: header.purchase_order_number, ...factoryReps }, transaction }
        );
        // 尝试配置驱动的自动完成（覆盖上面的硬编码状态，如配置启用则以配置为准）
        await checkAndAutoComplete('purchase_order', header.purchase_order_number, transaction);
      }

      // 8. 更新入库单状态
      await sequelize.query(
        `UPDATE stock_in SET approval_status = N'已入库' WHERE stock_in_number = :id${factoryCond}`,
        { replacements: { id, ...factoryReps }, transaction }
      );

      await transaction.commit();
      res.json(success(null, '确认入库成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 撤回入库 ====================

export const withdrawStockIn = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const operator = (req as any).user?.username || '';
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    // 1. 校验入库单存在且状态为"已入库"
    const [siHeader]: any = await sequelize.query(
      `SELECT * FROM stock_in WHERE stock_in_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (!siHeader.length) { res.status(404).json({ success: false, message: '入库单不存在' }); return; }
    const header = siHeader[0];
    if (header.approval_status !== '已入库') {
      res.status(403).json({ success: false, message: '仅已入库的单据可撤回' }); return;
    }

    // 2. 获取入库明细
    const [details]: any = await sequelize.query(
      `SELECT * FROM stock_in_detail WHERE stock_in_number = :id ORDER BY line_number`,
      { replacements: { id } }
    );
    if (!details.length) { res.status(400).json({ success: false, message: '入库单无明细行' }); return; }

    // 3. 安全检查：批次库存是否已被消耗
    for (const d of details) {
      if (!d.batch_number) continue;
      // 根据物料来料检验标志确定仓库
      const [itemRows]: any = await sequelize.query(
        `SELECT incoming_inspection FROM item_master WHERE item_number = :item_number`,
        { replacements: { item_number: d.item_number } }
      );
      const needsInspection = itemRows.length > 0 && itemRows[0].incoming_inspection === 'Y';
      // 需检验物料入库到待检仓，免检物料入库到入库单指定仓库
      let whNumber = header.warehouse_number;
      if (needsInspection) {
        const [inspWhRows]: any = await sequelize.query(
          `SELECT TOP 1 warehouse_number FROM warehouse WHERE (warehouse_name = N'待检仓' OR warehouse_type = N'待检仓')${factoryCond}`,
          { replacements: { ...factoryReps } }
        );
        if (inspWhRows.length > 0) whNumber = inspWhRows[0].warehouse_number;
      }

      const [batchRows]: any = await sequelize.query(
        `SELECT quantity FROM material_batch_inventory WHERE batch_number = :bn AND item_number = :itemNum AND warehouse_number = :whNum`,
        { replacements: { bn: d.batch_number, itemNum: d.item_number, whNum: whNumber } }
      );
      if (batchRows.length > 0) {
        const currentQty = parseFloat(batchRows[0].quantity);
        const entryQty = needsInspection
          ? (parseFloat(d.stock_in_quantity) || 0)
          : (parseFloat(d.qualified_quantity) || 0);
        if (currentQty < entryQty) {
          res.status(400).json({
            success: false,
            message: `批次 ${d.batch_number} 已被消耗（剩余 ${currentQty}，需回退 ${entryQty}），请先撤回后续出库操作`
          });
          return;
        }
      }
    }

    // 4. 安全检查：来料检验单是否已完成检验
    const inspectionNumbers: string[] = [];
    for (const d of details) {
      if (d.inspection_number) inspectionNumbers.push(d.inspection_number);
    }
    if (inspectionNumbers.length > 0) {
      const [inspRows]: any = await sequelize.query(
        `SELECT inspection_number, inspect_status FROM purchase_quality_inspection WHERE inspection_number IN (:inspNos)`,
        { replacements: { inspNos: inspectionNumbers } }
      );
      for (const insp of inspRows) {
        if (insp.inspect_status === '已完成' || insp.inspect_status === '检验中') {
          res.status(400).json({
            success: false,
            message: `检验单 ${insp.inspection_number} 已完成检验，请先撤回检验结果后再撤回入库`
          });
          return;
        }
      }
    }

    const transaction = await sequelize.transaction();
    try {
      const txnNumbers: string[] = [];

      for (const d of details) {
        if (!d.batch_number) continue;

        // 确定仓库
        const [itemRows]: any = await sequelize.query(
          `SELECT incoming_inspection FROM item_master WHERE item_number = :item_number`,
          { replacements: { item_number: d.item_number }, transaction }
        );
        const needsInspection = itemRows.length > 0 && itemRows[0].incoming_inspection === 'Y';
        let whNumber = header.warehouse_number;
        if (needsInspection) {
          const [inspWhRows]: any = await sequelize.query(
            `SELECT TOP 1 warehouse_number FROM warehouse WHERE (warehouse_name = N'待检仓' OR warehouse_type = N'待检仓')${factoryCond}`,
            { replacements: { ...factoryReps }, transaction }
          );
          if (inspWhRows.length > 0) whNumber = inspWhRows[0].warehouse_number;
        }

        const entryQty = needsInspection
          ? (parseFloat(d.stock_in_quantity) || 0)
          : (parseFloat(d.qualified_quantity) || 0);
        if (entryQty <= 0) continue;

        // 5.1 扣减/删除批次库存
        const [batchRows]: any = await sequelize.query(
          `SELECT id, quantity FROM material_batch_inventory WHERE batch_number = :bn AND item_number = :itemNum AND warehouse_number = :whNum`,
          { replacements: { bn: d.batch_number, itemNum: d.item_number, whNum: whNumber }, transaction }
        );
        if (batchRows.length > 0) {
          const currentQty = parseFloat(batchRows[0].quantity);
          if (currentQty - entryQty <= 0) {
            await sequelize.query(
              `DELETE FROM material_batch_inventory WHERE id = :id`,
              { replacements: { id: batchRows[0].id }, transaction }
            );
          } else {
            await sequelize.query(
              `UPDATE material_batch_inventory SET quantity = quantity - :qty, last_updated = GETDATE() WHERE id = :id`,
              { replacements: { qty: entryQty, id: batchRows[0].id }, transaction }
            );
          }
        }

        // 5.2 同步汇总库存
        await syncMaterialInventorySummary(d.item_number, whNumber, transaction);

        // 5.3 收集入库时创建的库存流水号
        const [txRows]: any = await sequelize.query(
          `SELECT transaction_number FROM material_inventory_transaction WHERE source_number = :sourceNo AND batch_number = :batchNo AND transaction_type = N'入库'`,
          { replacements: { sourceNo: id, batchNo: d.batch_number }, transaction }
        );
        for (const tx of txRows) {
          txnNumbers.push(tx.transaction_number);
        }

        // 5.4 回退采购订单明细 received_quantity（仅免检物料在确认时回写了）
        if (!needsInspection && d.purchase_detail_id) {
          const qualifiedQty = parseFloat(d.qualified_quantity) || 0;
          await sequelize.query(`
            UPDATE purchase_order_detail SET
              received_quantity = CASE WHEN received_quantity - :qty < 0 THEN 0 ELSE received_quantity - :qty END,
              receive_status = CASE
                WHEN received_quantity - :qty2 <= 0 THEN N'未到货'
                WHEN received_quantity - :qty3 < order_quantity THEN N'部分到货'
                ELSE N'已到货'
              END
            WHERE id = :detailId AND factory_id = :_factoryId
          `, { replacements: { qty: qualifiedQty, qty2: qualifiedQty, qty3: qualifiedQty, detailId: d.purchase_detail_id, ...factoryReps }, transaction });
        }
      }

      // 6. 标记库存流水作废（物料流水表无 status 列，用 remark 追加作废标记）
      if (txnNumbers.length > 0) {
        await sequelize.query(
          `UPDATE material_inventory_transaction SET remark = ISNULL(remark, '') + N' [已作废-入库单撤回]' WHERE transaction_number IN (:txns)`,
          { replacements: { txns: txnNumbers }, transaction }
        );
      }

      // 7. 清空入库明细批次号和检验状态
      await sequelize.query(
        `UPDATE stock_in_detail SET batch_number = '', inspect_status = NULL, qualified_quantity = stock_in_quantity WHERE stock_in_number = :id`,
        { replacements: { id }, transaction }
      );

      // 8. 作废来料检验单
      if (inspectionNumbers.length > 0) {
        await sequelize.query(
          `UPDATE purchase_quality_inspection SET inspect_status = N'已作废', remark = ISNULL(remark, '') + N' [入库单撤回]' WHERE inspection_number IN (:inspNos)`,
          { replacements: { inspNos: inspectionNumbers }, transaction }
        );
      }

      // 9. 重算采购订单主表执行状态
      if (header.purchase_order_number) {
        const [poDetails]: any = await sequelize.query(
          `SELECT receive_status FROM purchase_order_detail WHERE purchase_order_number = :pon`,
          { replacements: { pon: header.purchase_order_number }, transaction }
        );
        const allReceived = poDetails.length > 0 && poDetails.every((r: any) => r.receive_status === PURCHASE_STATUS.RECEIVED);
        const anyReceived = poDetails.some((r: any) => r.receive_status !== PURCHASE_STATUS.NOT_RECEIVED);
        const newStatus = allReceived ? '已完成' : (anyReceived ? '执行中' : '待执行');
        await sequelize.query(
          `UPDATE purchase_order SET order_status = :newStatus WHERE purchase_order_number = :pon${factoryCond}`,
          { replacements: { newStatus, pon: header.purchase_order_number, ...factoryReps }, transaction }
        );
        await checkAndAutoComplete('purchase_order', header.purchase_order_number, transaction);
      }

      // 10. 更新入库单状态为"已撤回"
      await sequelize.query(
        `UPDATE stock_in SET approval_status = N'已撤回' WHERE stock_in_number = :id${factoryCond}`,
        { replacements: { id, ...factoryReps }, transaction }
      );

      await transaction.commit();
      res.json(success(null, '撤回入库成功'));
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
      whereClause += (whereClause ? ' AND ' : 'WHERE ') + `(h.stock_in_number LIKE :search OR h.purchase_order_number LIKE :search OR h.supplier_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    // 多工厂数据隔离过滤
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      whereClause += (whereClause ? ' AND ' : 'WHERE ') + `h.factory_id = :_factoryId`;
      replacements._factoryId = effectiveFactoryId;
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

// ==================== 采购对账：分页查询 ====================
export const getPurchaseReconciliationPage = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', reconciliationStatus = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = `WHERE 1=1`;
    const replacements: any = { offset, offsetEnd };

    if (reconciliationStatus) {
      const arr = String(reconciliationStatus).split(',').filter(Boolean);
      if (arr.length === 1) {
        whereClause += ` AND d.reconciliation_status = :recStatus`;
        replacements.recStatus = arr[0];
      } else if (arr.length > 1) {
        const placeholders = arr.map((_s: any, i: number) => `:recStatus${i}`).join(', ');
        whereClause += ` AND d.reconciliation_status IN (${placeholders})`;
        arr.forEach((s: string, i: number) => { replacements[`recStatus${i}`] = s; });
      }
    }
    if (search) {
      whereClause += ` AND (h.stock_in_number LIKE :search OR d.item_number LIKE :search OR d.item_name LIKE :search OR h.supplier_name LIKE :search OR h.purchase_order_number LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    // 多工厂数据隔离过滤
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      whereClause += ` AND h.factory_id = :_factoryId`;
      replacements._factoryId = effectiveFactoryId;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total
       FROM stock_in_detail d
       INNER JOIN stock_in h ON h.stock_in_number = d.stock_in_number
       ${whereClause}`, { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT d.id as detail_id, d.stock_in_number, d.line_number,
               d.purchase_order_number, d.item_number, d.item_name,
               d.specifications, d.basic_unit,
               d.stock_in_quantity, d.qualified_quantity, d.unqualified_quantity,
               d.batch_number, d.reconciliation_status,
               h.supplier_name, h.supplier_number, h.warehouse_name,
               h.stock_in_date, h.stock_in_type, h.approval_status,
               h.creation_man, h.creation_date as order_creation_date,
               f.factory_name, f.factory_short,
               ROW_NUMBER() OVER (ORDER BY h.creation_date DESC, d.stock_in_number, d.line_number) AS _row_num
        FROM stock_in_detail d
        INNER JOIN stock_in h ON h.stock_in_number = d.stock_in_number
        LEFT JOIN factory f ON h.factory_id = f.id
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

// ==================== 采购对账：批量更新对账状态 ====================
export const updatePurchaseReconciliationStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailIds, reconciliationStatus } = req.body;

    if (!Array.isArray(detailIds) || !detailIds.length) {
      res.status(400).json({ success: false, message: '请选择要更新的记录' }); return;
    }
    if (!['已对账', '未对账'].includes(reconciliationStatus)) {
      res.status(400).json({ success: false, message: '无效的对账状态' }); return;
    }

    // 多工厂防越权
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND h.factory_id = :_factoryId' : '';
    const factoryReps: any = _factoryId !== null ? { _factoryId } : {};

    const replacements: any = { reconciliationStatus, ...factoryReps };
    detailIds.forEach((id: number, i: number) => { replacements[`id${i}`] = id; });
    const placeholders = detailIds.map((_: any, i: number) => `:id${i}`).join(', ');

    await sequelize.query(
      `UPDATE d SET d.reconciliation_status = :reconciliationStatus
       FROM stock_in_detail d
       INNER JOIN stock_in h ON h.stock_in_number = d.stock_in_number
       WHERE d.id IN (${placeholders})${factoryCond}`,
      { replacements }
    );

    res.json(success(null, `已更新 ${detailIds.length} 条记录为"${reconciliationStatus}"`));
  } catch (err) { next(err); }
};

// ==================== 采购对账：获取打印数据 ====================
export const getPurchaseReconciliationPrintData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailIds } = req.body;

    if (!Array.isArray(detailIds) || !detailIds.length) {
      res.status(400).json({ success: false, message: '请选择要打印的记录' }); return;
    }

    // 多工厂防越权
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND h.factory_id = :_factoryId' : '';
    const factoryReps: any = _factoryId !== null ? { _factoryId } : {};

    const replacements: any = { ...factoryReps };
    detailIds.forEach((id: number, i: number) => { replacements[`id${i}`] = id; });
    const placeholders = detailIds.map((_: any, i: number) => `:id${i}`).join(', ');

    const [details]: any = await sequelize.query(`
      SELECT d.id as detail_id, d.stock_in_number, d.line_number,
             d.purchase_order_number, d.item_number, d.item_name,
             d.specifications, d.basic_unit,
             d.stock_in_quantity, d.qualified_quantity, d.unqualified_quantity,
             d.batch_number, d.reconciliation_status,
             h.supplier_name, h.supplier_number, h.warehouse_name,
             h.stock_in_date, h.stock_in_type, h.approval_status,
             h.creation_man, h.creation_date as order_creation_date,
             h.remark
      FROM stock_in_detail d
      INNER JOIN stock_in h ON h.stock_in_number = d.stock_in_number
      WHERE d.id IN (${placeholders})${factoryCond}
      ORDER BY h.stock_in_number, d.line_number
    `, { replacements });

    res.json(success({ items: details }));
  } catch (err) { next(err); }
};
