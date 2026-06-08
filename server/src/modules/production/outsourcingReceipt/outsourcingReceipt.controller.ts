import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { generateOutsourcingReceiptNumber, generateOutsourcingInspectionNumber, generateOutsourcingReturnStockinNumber } from '@/services/documentNumber.service';
import { generateBatchNumber, generateMaterialTxnNumber, syncMaterialInventorySummary } from '@/services/inventory.service';
import { fifoDeductBatches, upsertMaterialInventory, createMaterialTransaction } from '@/services/warehouse/helpers';
import { logLinesideMovement } from '@/services/linesideMovement.service';
import dayjs from 'dayjs';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

export { generateOutsourcingReceiptNumber } from '@/services/documentNumber.service';

// ==================== 列表 ====================
export const getOutsourcingReceipts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(receipt_number LIKE :search OR outsourcing_order_number LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (status) { conditions.push(`status = :status`); replacements.status = status; }

    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      conditions.push(`factory_id = :_factoryId`);
      replacements._factoryId = _factoryId;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM outsourcing_receipt ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;

    const [items]: any = await sequelize.query(
      `SELECT t.*, oo.supplier_name FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC, receipt_number DESC) AS _row_num FROM outsourcing_receipt ${whereClause}) AS t LEFT JOIN outsourcing_order oo ON oo.outsourcing_order_number = t.outsourcing_order_number WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取委外收回单列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getOutsourcingReceiptDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(`SELECT * FROM outsourcing_receipt WHERE receipt_number = :id`, { replacements: { id } });
    if (!rows.length) { res.status(404).json({ success: false, message: '委外收回单不存在' }); return; }

    const [details]: any = await sequelize.query(
      `SELECT * FROM outsourcing_receipt_detail WHERE receipt_number = :id ORDER BY line_number`,
      { replacements: { id } }
    );

    res.json(success({ ...rows[0], details }, '获取委外收回单详情成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createOutsourcingReceipt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const b = req.body;
    if (!b.outsourcing_order_number) { res.status(400).json({ success: false, message: '委外订单号不能为空' }); return; }

    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const username = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      const factoryCode = await getFactoryCode(req);
      const receiptNumber = await generateOutsourcingReceiptNumber(factoryCode, transaction);

      await sequelize.query(`
        INSERT INTO outsourcing_receipt (
          receipt_number, outsourcing_order_number, receipt_date,
          warehouse_number, warehouse_name, handler,
          inspection_status, status, remark, factory_id, creation_date, creation_man
        ) VALUES (
          :receiptNumber, :outsourcing_order_number, :receipt_date,
          :warehouse_number, :warehouse_name, :handler,
          N'待检验', N'草稿', :remark, :factory_id, :creation_date, :creation_man
        )
      `, {
        replacements: {
          receiptNumber,
          outsourcing_order_number: b.outsourcing_order_number,
          receipt_date: b.receipt_date || now.split(' ')[0],
          warehouse_number: b.warehouse_number || '',
          warehouse_name: b.warehouse_name || '',
          handler: b.handler || '',
          remark: b.remark || '',
          factory_id: _factoryId,
          creation_date: now,
          creation_man: username
        },
        transaction
      });

      const details = b.details || [];
      for (let i = 0; i < details.length; i++) {
        const d = details[i];
        await sequelize.query(`
          INSERT INTO outsourcing_receipt_detail (
            receipt_number, line_number, item_number, item_name,
            specifications, receipt_quantity, qualified_quantity, unqualified_quantity, unit, remark
          ) VALUES (
            :receiptNumber, :line_number, :item_number, :item_name,
            :specifications, :receipt_quantity, 0, 0, :unit, :remark
          )
        `, {
          replacements: {
            receiptNumber,
            line_number: (i + 1) * 10,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            specifications: d.specifications || '',
            receipt_quantity: d.receipt_quantity || 0,
            unit: d.unit || '',
            remark: d.remark || ''
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ receipt_number: receiptNumber }, '创建委外收回单成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 确认收回（根据物料来料检验字段分流：需检验→入待检仓+创建质检单；免检→直接入库到下道线边仓） ====================
export const confirmReceipt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const { id } = req.params;
    const [check]: any = await sequelize.query(`SELECT * FROM outsourcing_receipt WHERE receipt_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外收回单不存在' }); return; }
    if (check[0].status !== '待确认') { res.status(403).json({ success: false, message: '只能确认待确认状态的收回单' }); return; }

    const [details]: any = await sequelize.query(`SELECT * FROM outsourcing_receipt_detail WHERE receipt_number = :id`, { replacements: { id } });

    // 查询每个物料的来料检验标志
    const itemInspectionMap: Record<string, boolean> = {};
    for (const d of details) {
      if (!d.item_number || itemInspectionMap[d.item_number] !== undefined) continue;
      const [itemRows]: any = await sequelize.query(
        `SELECT incoming_inspection FROM item_master WHERE item_number = :item_number`,
        { replacements: { item_number: d.item_number } }
      );
      itemInspectionMap[d.item_number] = itemRows.length > 0 && itemRows[0].incoming_inspection === 'Y';
    }

    // 分流：需检验 vs 免检
    const needsInspection = details.filter((d: any) => itemInspectionMap[d.item_number || ''] === true);
    const noInspection = details.filter((d: any) => itemInspectionMap[d.item_number || ''] !== true);

    const transaction = await sequelize.transaction();
    try {
      const factoryCode = await getFactoryCode(req);
      const _factoryId = getFactoryId(req);
      const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
      const factoryReps = _factoryId !== null ? { _factoryId } : {};
      const operator = (req as any).user?.username || '';
      const inspWhNumber = check[0].inspection_warehouse_number || check[0].warehouse_number || 'INSP_WH';
      const inspWhName = check[0].inspection_warehouse_name || check[0].warehouse_name || '待检仓';
      const nextWhNumber = check[0].next_step_warehouse_number || '';
      const nextWhName = check[0].next_step_warehouse_name || '';
      const nextStepNumber = check[0].next_step_number || 0;
      const nextWcNumber = check[0].next_work_center_number || '';
      const nextWcName = check[0].next_work_center_name || '';
      const orderNumber = check[0].outsourcing_order_number || '';

      let inspectionNumber: string | null = null;
      let stockinNumber: string | null = null;

      // ========== 路径A：需检验物料 → 入待检仓 + 创建质检单 ==========
      if (needsInspection.length > 0) {
        for (const d of needsInspection) {
          const recvQty = parseFloat(d.receipt_quantity) || 0;
          if (recvQty <= 0) continue;

          // 1. 生成批次号，写入 material_batch_inventory（待检仓）
          const batchNo = await generateBatchNumber('MB', factoryCode, transaction);
          await sequelize.query(
            `INSERT INTO material_batch_inventory (batch_number, item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, initial_quantity, inbound_date, status, creation_date, last_updated, factory_id) VALUES (:batch_number, :item_number, :item_name, N'半成品', :specifications, :basic_unit, :warehouse_number, :warehouse_name, :quantity, :quantity, GETDATE(), N'正常', GETDATE(), GETDATE(), :factory_id)`,
            {
              replacements: {
                batch_number: batchNo,
                item_number: d.item_number || '',
                item_name: d.item_name || '',
                specifications: d.specifications || '',
                basic_unit: d.unit || '',
                warehouse_number: inspWhNumber,
                warehouse_name: inspWhName,
                quantity: recvQty,
                factory_id: _factoryId
              },
              transaction
            }
          );

          // 2. 更新 material_inventory 汇总表
          await upsertMaterialInventory({
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            item_type: '半成品',
            specifications: d.specifications || '',
            basic_unit: d.unit || '',
            warehouse_number: inspWhNumber,
            warehouse_name: inspWhName,
            deltaQuantity: recvQty,
          }, transaction);

          // 3. 记录 material_inventory_transaction 入库流水
          const txNum = await generateMaterialTxnNumber(factoryCode, transaction);
          await createMaterialTransaction({
            transaction_number: txNum,
            transaction_type: '入库',
            source_type: '委外回收入待检',
            source_number: String(id),
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            item_type: '半成品',
            specifications: d.specifications || '',
            basic_unit: d.unit || '',
            warehouse_number: inspWhNumber,
            warehouse_name: inspWhName,
            quantity: recvQty,
            before_quantity: 0,
            after_quantity: 0,
            batch_number: batchNo,
            supplier_number: '', supplier_name: '',
            operator,
            remark: '委外回收入待检仓'
          }, transaction);
        }

        // 创建委外质检单（仅包含需检验物料）
        inspectionNumber = await generateOutsourcingInspectionNumber(factoryCode, transaction);
        await sequelize.query(`
          INSERT INTO outsourcing_inspection (
            inspection_number, receipt_number, outsourcing_order_number,
            inspection_date, inspection_status, remark, creation_date, creation_man
          ) VALUES (
            :inspectionNumber, :receiptNumber, :orderNumber,
            GETDATE(), N'待检验', N'委外收回自动创建', GETDATE(), :username
          )
        `, {
          replacements: {
            inspectionNumber,
            receiptNumber: String(id),
            orderNumber,
            username: operator
          },
          transaction
        });

        // 创建质检明细（仅需检验物料）
        for (const d of needsInspection) {
          await sequelize.query(`
            INSERT INTO outsourcing_inspection_detail (
              inspection_number, item_number, planned_quantity, actual_quantity
            ) VALUES (
              :inspectionNumber, :item_number, :planned_quantity, :actual_quantity
            )
          `, {
            replacements: {
              inspectionNumber,
              item_number: d.item_number || '',
              planned_quantity: d.receipt_quantity || 0,
              actual_quantity: d.receipt_quantity || 0
            },
            transaction
          });
        }
      }

      // ========== 路径B：免检物料 → 直接入库到下道线边仓 + 更新completed_quantity ==========
      if (noInspection.length > 0) {
        // 查询委外订单和工序任务信息
        const [orderRows]: any = await sequelize.query(
          `SELECT * FROM outsourcing_order WHERE outsourcing_order_number = :orderNumber`,
          { replacements: { orderNumber }, transaction }
        );
        const order = orderRows.length > 0 ? orderRows[0] : null;
        const productionOrderNumber = order?.production_order_number || '';

        // 创建回收入库单
        stockinNumber = await generateOutsourcingReturnStockinNumber(factoryCode, transaction);
        await sequelize.query(`
          INSERT INTO outsourcing_return_stockin (
            stockin_number, outsourcing_order_number, receipt_number, inspection_number,
            warehouse_from, warehouse_to, step_number, work_center_number,
            production_order_number, stockin_date, status, remark,
            creation_date, creation_man
          ) VALUES (
            :stockin_number, :order_number, :receipt_number, :inspection_number,
            :warehouse_from, :warehouse_to, :step_number, :work_center_number,
            :production_order_number, GETDATE(), N'已入库', N'免检直接入库',
            GETDATE(), :creation_man
          )
        `, {
          replacements: {
            stockin_number: stockinNumber,
            order_number: orderNumber,
            receipt_number: String(id),
            inspection_number: '',
            warehouse_from: '',
            warehouse_to: nextWhNumber,
            step_number: nextStepNumber,
            work_center_number: nextWcNumber,
            production_order_number: productionOrderNumber,
            creation_man: operator || 'system'
          },
          transaction
        });

        let totalDirectStockinQty = 0;

        for (let si = 0; si < noInspection.length; si++) {
          const d = noInspection[si];
          const recvQty = parseFloat(d.receipt_quantity) || 0;
          if (recvQty <= 0) continue;
          totalDirectStockinQty += recvQty;

          // 插入入库单明细
          await sequelize.query(`
            INSERT INTO outsourcing_return_stockin_detail (
              stockin_number, line_number, item_number, item_name,
              specifications, basic_unit, qualified_quantity, batch_number
            ) VALUES (
              :stockin_number, :line_number, :item_number, :item_name,
              :specifications, :basic_unit, :qualified_quantity, ''
            )
          `, {
            replacements: {
              stockin_number: stockinNumber,
              line_number: (si + 1) * 10,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              specifications: d.specifications || '',
              basic_unit: d.unit || '',
              qualified_quantity: recvQty,
            },
            transaction
          });

          const itemNumber = d.item_number || '';
          const itemName = d.item_name || '';
          const specifications = d.specifications || '';
          const basicUnit = d.unit || '';

          // 直接入库到下道工序线边仓
          if (nextWhNumber) {
            const batchNo = await generateBatchNumber('MB', factoryCode, transaction);
            await sequelize.query(
              `INSERT INTO material_batch_inventory (batch_number, item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, initial_quantity, production_order_number, inbound_date, status, creation_date, last_updated, factory_id) VALUES (:batch_number, :item_number, :item_name, N'半成品', :specifications, :basic_unit, :warehouse_number, :warehouse_name, :quantity, :quantity, :production_order_number, GETDATE(), N'正常', GETDATE(), GETDATE(), :factory_id)`,
              {
                replacements: {
                  batch_number: batchNo, item_number: itemNumber, item_name: itemName,
                  specifications, basic_unit: basicUnit,
                  warehouse_number: nextWhNumber, warehouse_name: nextWhName,
                  quantity: recvQty, production_order_number: productionOrderNumber,
                  factory_id: _factoryId
                },
                transaction
              }
            );
            await upsertMaterialInventory({
              item_number: itemNumber, item_name: itemName,
              item_type: '半成品', specifications, basic_unit: basicUnit,
              warehouse_number: nextWhNumber, warehouse_name: nextWhName,
              deltaQuantity: recvQty,
            }, transaction);

            const txNumIn = await generateMaterialTxnNumber(factoryCode, transaction);
            await createMaterialTransaction({
              transaction_number: txNumIn,
              transaction_type: '入库',
              source_type: '委外免检直接入库',
              source_number: stockinNumber,
              item_number: itemNumber,
              item_name: itemName,
              item_type: '半成品',
              specifications,
              basic_unit: basicUnit,
              warehouse_number: nextWhNumber,
              warehouse_name: nextWhName,
              quantity: recvQty,
              before_quantity: 0, after_quantity: 0,
              batch_number: batchNo,
              supplier_number: '', supplier_name: '',
              operator,
              remark: '委外免检直接入库-线边仓入库'
            }, transaction);
          }

          // 线边仓流水：当前委外工序OUT
          if (order) {
            await logLinesideMovement({
              transactionType: '出线边',
              sourceType: '委外免检直接入库',
              sourceNumber: stockinNumber,
              productionOrderNumber,
              itemNumber: itemNumber,
              itemName: itemName,
              specifications,
              basicUnit: basicUnit,
              stepNumber: order.step_number || 0,
              workCenterNumber: order.work_center_number || '',
              workCenterName: order.work_center_name || '',
              quantity: recvQty,
              direction: 'OUT',
              operator,
              remark: '委外免检直接入库'
            }, transaction);
          }

          // 线边仓流水：下道工序IN
          if (nextStepNumber > 0) {
            await logLinesideMovement({
              transactionType: '入线边',
              sourceType: '委外免检直接入库',
              sourceNumber: stockinNumber,
              productionOrderNumber,
              itemNumber: itemNumber,
              itemName: itemName,
              specifications,
              basicUnit: basicUnit,
              stepNumber: nextStepNumber,
              workCenterNumber: nextWcNumber,
              workCenterName: nextWcName,
              quantity: recvQty,
              direction: 'IN',
              operator,
              remark: '委外免检直接入库-下道工序'
            }, transaction);
          }
        }

        // 更新 process_task.completed_quantity
        if (order?.process_task_number && totalDirectStockinQty > 0) {
          await sequelize.query(
            `UPDATE process_task SET completed_quantity = ISNULL(completed_quantity, 0) + :qty, task_status = CASE WHEN ISNULL(completed_quantity, 0) + :qty2 >= planned_quantity THEN N'已完成' ELSE N'进行中' END WHERE process_task_number = :ptn`,
            { replacements: { qty: totalDirectStockinQty, qty2: totalDirectStockinQty, ptn: order.process_task_number }, transaction }
          );
        }

        // 更新委外订单 qualified_quantity 和 order_status
        if (order && totalDirectStockinQty > 0) {
          const newQualifiedQty = (parseFloat(order.qualified_quantity) || 0) + totalDirectStockinQty;
          const plannedQty = parseFloat(order.planned_quantity) || 0;
          const orderStatus = newQualifiedQty >= plannedQty ? '已完成' : '部分收回';
          await sequelize.query(
            `UPDATE outsourcing_order SET qualified_quantity = :qty, order_status = :status WHERE outsourcing_order_number = :orderNumber${factoryCond}`,
            { replacements: { qty: newQualifiedQty, status: orderStatus, orderNumber, ...factoryReps }, transaction }
          );
        }
      }

      // 更新收回单状态和检验状态
      const inspectionStatus = noInspection.length === details.length
        ? '免检'
        : (needsInspection.length === details.length ? '待检验' : '部分待检');
      await sequelize.query(
        `UPDATE outsourcing_receipt SET status = N'已收回', inspection_status = :inspectionStatus WHERE receipt_number = :id${factoryCond}`,
        { replacements: { id, inspectionStatus, ...factoryReps }, transaction }
      );

      await transaction.commit();
      const msg = noInspection.length === details.length
        ? '收回确认成功，物料免检已直接入库'
        : (needsInspection.length === details.length
          ? '收回确认成功，已入待检仓并创建质检单'
          : '收回确认成功，部分物料入待检仓待检验，部分物料免检直接入库');
      res.json(success({ inspection_number: inspectionNumber, stockin_number: stockinNumber }, msg));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// 其他方法（update, delete, confirm等）类似发料模块...

// ==================== 追加回收（分批回收：为同一委外订单创建新的回收申请） ====================
export const appendReceipt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const b = req.body;
    if (!b.outsourcing_order_number) { res.status(400).json({ success: false, message: '委外订单号不能为空' }); return; }
    if (!b.receipt_quantity || parseFloat(b.receipt_quantity) <= 0) { res.status(400).json({ success: false, message: '追加回收数量必须大于0' }); return; }

    const receiptQuantity = parseFloat(b.receipt_quantity);

    // 查询委外订单
    const [orderCheck]: any = await sequelize.query(
      `SELECT * FROM outsourcing_order WHERE outsourcing_order_number = :id`,
      { replacements: { id: b.outsourcing_order_number } }
    );
    if (!orderCheck.length) { res.status(404).json({ success: false, message: '委外订单不存在' }); return; }
    const order = orderCheck[0];
    if (order.approval_status !== '已审批') { res.status(403).json({ success: false, message: '委外订单未审批，不能追加回收' }); return; }

    // 累计校验：已回收数量 + 本次数量 ≤ 计划数量
    const alreadyReceived = parseFloat(order.received_quantity) || 0;
    const plannedQty = parseFloat(order.planned_quantity) || 0;
    if (alreadyReceived + receiptQuantity > plannedQty) {
      res.status(400).json({ success: false, message: `追加回收数量超出范围，已回收${alreadyReceived}，计划${plannedQty}，本次最多可回收${plannedQty - alreadyReceived}` });
      return;
    }

    // 查询工序任务和下一道工序信息
    const [tasks]: any = await sequelize.query(
      `SELECT pt.*, wc.warehouse_number AS wc_warehouse_number, wc.warehouse_name AS wc_warehouse_name FROM process_task pt LEFT JOIN work_center wc ON pt.work_center_number = wc.work_cente_number WHERE pt.process_task_number = :ptn`,
      { replacements: { ptn: order.process_task_number } }
    );
    const task = tasks.length > 0 ? tasks[0] : null;

    const [nextSteps]: any = await sequelize.query(
      `SELECT pt.*, wc.warehouse_number AS wc_warehouse_number, wc.warehouse_name AS wc_warehouse_name FROM process_task pt LEFT JOIN work_center wc ON pt.work_center_number = wc.work_cente_number WHERE pt.production_order_number = :orderNo AND pt.step_number > :step ORDER BY pt.step_number ASC`,
      { replacements: { orderNo: order.production_order_number, step: order.step_number || task?.step_number || 0 } }
    );
    const nextStep = nextSteps.length > 0 ? nextSteps[0] : null;

    // 查询待检仓
    const [inspWh]: any = await sequelize.query(
      `SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE warehouse_type = N'待检仓' OR warehouse_number LIKE 'INSP%' ORDER BY warehouse_number`
    );
    const inspectionWarehouse = inspWh.length > 0 ? inspWh[0] : { warehouse_number: 'INSP_WH', warehouse_name: '待检仓' };

    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const username = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      const factoryCode = await getFactoryCode(req);
      const receiptNumber = await generateOutsourcingReceiptNumber(factoryCode, transaction);

      // 创建回收申请
      await sequelize.query(`
        INSERT INTO outsourcing_receipt (
          receipt_number, outsourcing_order_number, receipt_date,
          warehouse_number, warehouse_name, handler,
          doc_type,
          inspection_warehouse_number, inspection_warehouse_name,
          next_step_warehouse_number, next_step_warehouse_name,
          next_step_number, next_work_center_number, next_work_center_name,
          inspection_status, status, remark, creation_date, creation_man
        ) VALUES (
          :receiptNumber, :ooNumber, :receipt_date,
          :warehouse_number, :warehouse_name, '',
          N'receipt',
          :insp_wh_number, :insp_wh_name,
          :next_wh_number, :next_wh_name,
          :next_step_number, :next_wc_number, :next_wc_name,
          N'', N'待确认', N'追加回收', :creation_date, :creation_man
        )
      `, {
        replacements: {
          receiptNumber, ooNumber: b.outsourcing_order_number,
          receipt_date: now.split(' ')[0],
          warehouse_number: inspectionWarehouse.warehouse_number,
          warehouse_name: inspectionWarehouse.warehouse_name,
          insp_wh_number: inspectionWarehouse.warehouse_number,
          insp_wh_name: inspectionWarehouse.warehouse_name,
          next_wh_number: nextStep?.wc_warehouse_number || '',
          next_wh_name: nextStep?.wc_warehouse_name || '',
          next_step_number: nextStep?.step_number || 0,
          next_wc_number: nextStep?.work_center_number || '',
          next_wc_name: nextStep?.work_center_name || '',
          creation_date: now, creation_man: username
        },
        transaction
      });

      // 插入回收明细（产品本身，使用追加数量）
      await sequelize.query(`
        INSERT INTO outsourcing_receipt_detail (
          receipt_number, line_number, item_number, item_name,
          specifications, receipt_quantity, qualified_quantity, unqualified_quantity, unit, remark
        ) VALUES (
          :receiptNumber, 10, :item_number, :item_name,
          :specifications, :receipt_quantity, 0, 0, :unit, ''
        )
      `, {
        replacements: {
          receiptNumber,
          item_number: order.item_number || '',
          item_name: order.item_name || '',
          specifications: order.specifications || '',
          receipt_quantity: receiptQuantity,
          unit: order.basic_unit || ''
        },
        transaction
      });

      await transaction.commit();
      res.json(success({ receipt_number: receiptNumber, receipt_quantity: receiptQuantity }, '追加回收申请创建成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};
