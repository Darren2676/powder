import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { generateOutsourcingInspectionNumber, generateOutsourcingReturnStockinNumber } from '@/services/documentNumber.service';
import { generateBatchNumber, generateMaterialTxnNumber, syncMaterialInventorySummary } from '@/services/inventory.service';
import { fifoDeductBatches, upsertMaterialInventory, createMaterialTransaction } from '@/services/warehouse/helpers';
import { logLinesideMovement } from '@/services/linesideMovement.service';
import dayjs from 'dayjs';

export { generateOutsourcingInspectionNumber } from '@/services/documentNumber.service';

// ==================== 列表 ====================
export const getOutsourcingInspections = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const inspection_result = (req.query.inspection_result as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(inspection_number LIKE :search OR receipt_number LIKE :search OR outsourcing_order_number LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (inspection_result) { conditions.push(`inspection_result = :inspection_result`); replacements.inspection_result = inspection_result; }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM outsourcing_inspection ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;

    const [items]: any = await sequelize.query(
      `SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC, inspection_number DESC) AS _row_num FROM outsourcing_inspection ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取委外质检单列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getOutsourcingInspectionDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(`SELECT * FROM outsourcing_inspection WHERE inspection_number = :id`, { replacements: { id } });
    if (!rows.length) { res.status(404).json({ success: false, message: '委外质检单不存在' }); return; }

    res.json(success(rows[0], '获取委外质检单详情成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createOutsourcingInspection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.receipt_number) { res.status(400).json({ success: false, message: '收回单号不能为空' }); return; }

    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const username = (req as any).user?.username || '';

    const inspectionNumber = await generateOutsourcingInspectionNumber();

    await sequelize.query(`
      INSERT INTO outsourcing_inspection (
        inspection_number, receipt_number, outsourcing_order_number,
        inspection_date, inspector, inspection_status, remark, creation_date, creation_man
      ) VALUES (
        :inspectionNumber, :receipt_number, :outsourcing_order_number,
        :inspection_date, :inspector, N'待检验', :remark, :creation_date, :creation_man
      )
    `, {
      replacements: {
        inspectionNumber,
        receipt_number: b.receipt_number,
        outsourcing_order_number: b.outsourcing_order_number || '',
        inspection_date: b.inspection_date || now.split(' ')[0],
        inspector: b.inspector || '',
        remark: b.remark || '',
        creation_date: now,
        creation_man: username
      }
    });

    res.json(success({ inspection_number: inspectionNumber }, '创建委外质检单成功'));
  } catch (err) { next(err); }
};

// ==================== 更新质检结果 ====================
export const updateInspectionResult = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [check]: any = await sequelize.query(`SELECT * FROM outsourcing_inspection WHERE inspection_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外质检单不存在' }); return; }
    if (check[0].inspection_status === '已完成') { res.status(403).json({ success: false, message: '已完成的质检单不允许修改' }); return; }

    const username = (req as any).user?.username || '';

    await sequelize.query(`
      UPDATE outsourcing_inspection SET
        inspection_date = :inspection_date,
        inspector = :inspector,
        inspection_result = :inspection_result,
        qualified_quantity = :qualified_quantity,
        unqualified_quantity = :unqualified_quantity,
        defect_description = :defect_description,
        handling_method = :handling_method,
        remark = :remark
      WHERE inspection_number = :id
    `, {
      replacements: {
        id,
        inspection_date: b.inspection_date || dayjs().format('YYYY/MM/DD HH:mm'),
        inspector: b.inspector || '',
        inspection_result: b.inspection_result,
        qualified_quantity: b.qualified_quantity || 0,
        unqualified_quantity: b.unqualified_quantity || 0,
        defect_description: b.defect_description || '',
        handling_method: b.handling_method || '',
        remark: b.remark || ''
      }
    });

    res.json(success(null, '更新质检结果成功'));
  } catch (err) { next(err); }
};

// ==================== 完成质检（合格/让步→创建回收入库单→自动确认→更新completed_quantity） ====================
export const completeInspection = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const [check]: any = await sequelize.query(`SELECT * FROM outsourcing_inspection WHERE inspection_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外质检单不存在' }); return; }
    if (check[0].inspection_status === '已完成') { res.status(403).json({ success: false, message: '质检单已完成' }); return; }
    if (!check[0].inspection_result) { res.status(400).json({ success: false, message: '请先录入质检结果' }); return; }

    const inspectionResult = check[0].inspection_result;
    const qualifiedQty = parseFloat(check[0].qualified_quantity) || 0;
    const unqualifiedQty = parseFloat(check[0].unqualified_quantity) || 0;
    const isPass = (inspectionResult === '合格' || inspectionResult === '让步接收') && qualifiedQty > 0;

    const transaction = await sequelize.transaction();
    try {
      const operator = (req as any).user?.username || '';

      // 1. 更新质检单状态
      await sequelize.query(`
        UPDATE outsourcing_inspection SET inspection_status = N'已完成'
        WHERE inspection_number = :id
      `, { replacements: { id }, transaction });

      // 2. 更新收回单的质检状态
      await sequelize.query(`
        UPDATE outsourcing_receipt SET
          inspection_status = :inspection_result,
          qualified_quantity = :qualified_quantity,
          unqualified_quantity = :unqualified_quantity
        WHERE receipt_number = :receipt_number
      `, {
        replacements: {
          inspection_result: inspectionResult,
          qualified_quantity: check[0].qualified_quantity,
          unqualified_quantity: check[0].unqualified_quantity,
          receipt_number: check[0].receipt_number
        },
        transaction
      });

      // 3. 合格/让步接收 → 创建回收入库单并自动确认
      if (isPass) {
        // 查询收回单信息（获取待检仓、下道工序信息）
        const [receipt]: any = await sequelize.query(`
          SELECT * FROM outsourcing_receipt WHERE receipt_number = :receipt_number
        `, { replacements: { receipt_number: check[0].receipt_number }, transaction });

        if (receipt.length) {
          const receiptData = receipt[0];
          const orderNumber = check[0].outsourcing_order_number || receiptData.outsourcing_order_number;

          // 查询委外订单信息
          const [orderRows]: any = await sequelize.query(`
            SELECT * FROM outsourcing_order WHERE outsourcing_order_number = :orderNumber
          `, { replacements: { orderNumber }, transaction });

          if (orderRows.length) {
            const order = orderRows[0];

            // 待检仓 → 下道工序线边仓
            const warehouseFrom = receiptData.inspection_warehouse_number || receiptData.warehouse_number || 'INSP_WH';
            const warehouseFromName = receiptData.inspection_warehouse_name || receiptData.warehouse_name || '待检仓';
            const warehouseTo = receiptData.next_step_warehouse_number || '';
            const warehouseToName = receiptData.next_step_warehouse_name || '';
            const nextStepNumber = receiptData.next_step_number || 0;
            const nextWorkCenterNumber = receiptData.next_work_center_number || '';
            const nextWorkCenterName = receiptData.next_work_center_name || '';
            const productionOrderNumber = order.production_order_number || '';

            // 查询质检明细获取物料列表
            const [inspDetails]: any = await sequelize.query(`
              SELECT * FROM outsourcing_inspection_detail WHERE inspection_number = :id
            `, { replacements: { id }, transaction });

            // 如果没有质检明细，从收回单明细获取
            let stockinDetails = inspDetails;
            if (!inspDetails.length) {
              const [receiptDetails]: any = await sequelize.query(`
                SELECT * FROM outsourcing_receipt_detail WHERE receipt_number = :receipt_number
              `, { replacements: { receipt_number: check[0].receipt_number }, transaction });
              stockinDetails = receiptDetails.map((d: any) => ({
                item_number: d.item_number,
                item_name: d.item_name,
                specifications: d.specifications,
                basic_unit: d.unit || d.basic_unit || '',
                qualified_quantity: qualifiedQty,
              }));
            }

            // 3a. 创建 outsourcing_return_stockin 单
            const stockinNumber = await generateOutsourcingReturnStockinNumber(transaction);
            await sequelize.query(`
              INSERT INTO outsourcing_return_stockin (
                stockin_number, outsourcing_order_number, receipt_number, inspection_number,
                warehouse_from, warehouse_to, step_number, work_center_number,
                production_order_number, stockin_date, status, remark,
                creation_date, creation_man
              ) VALUES (
                :stockin_number, :order_number, :receipt_number, :inspection_number,
                :warehouse_from, :warehouse_to, :step_number, :work_center_number,
                :production_order_number, GETDATE(), N'已入库', N'质检合格自动入库',
                GETDATE(), :creation_man
              )
            `, {
              replacements: {
                stockin_number: stockinNumber,
                order_number: orderNumber,
                receipt_number: check[0].receipt_number,
                inspection_number: String(id),
                warehouse_from: warehouseFrom,
                warehouse_to: warehouseTo,
                step_number: nextStepNumber,
                work_center_number: nextWorkCenterNumber,
                production_order_number: productionOrderNumber,
                creation_man: operator || 'system'
              },
              transaction
            });

            // 插入入库单明细
            for (let si = 0; si < stockinDetails.length; si++) {
              const sd = stockinDetails[si];
              const lineQty = sd === stockinDetails[0] && stockinDetails.length === 1
                ? qualifiedQty
                : (parseFloat(sd.qualified_quantity) || 0);
              if (lineQty <= 0) continue;

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
                  item_number: sd.item_number || '',
                  item_name: sd.item_name || '',
                  specifications: sd.specifications || '',
                  basic_unit: sd.basic_unit || sd.unit || '',
                  qualified_quantity: lineQty,
                },
                transaction
              });
            }

            // 3b. 自动确认入库：待检仓FIFO出库 → 下道线边仓入库 → 流水 → completed_quantity → order_status
            for (const sd of stockinDetails) {
              const lineQty = sd === stockinDetails[0] && stockinDetails.length === 1
                ? qualifiedQty
                : (parseFloat(sd.qualified_quantity) || 0);
              if (lineQty <= 0) continue;

              const itemNumber = sd.item_number || '';
              const itemName = sd.item_name || '';
              const specifications = sd.specifications || '';
              const basicUnit = sd.basic_unit || sd.unit || '';

              // ---- 待检仓FIFO出库 ----
              if (warehouseFrom) {
                await fifoDeductBatches({
                  batchTable: 'material_batch_inventory',
                  item_number: itemNumber,
                  warehouse_number: warehouseFrom,
                  totalQuantity: lineQty,
                }, transaction);
                await syncMaterialInventorySummary(itemNumber, warehouseFrom, transaction);

                const txNumOut = await generateMaterialTxnNumber();
                await createMaterialTransaction({
                  transaction_number: txNumOut,
                  transaction_type: '出库',
                  source_type: '委外回收入库出待检',
                  source_number: stockinNumber,
                  item_number: itemNumber,
                  item_name: itemName,
                  item_type: '半成品',
                  specifications,
                  basic_unit: basicUnit,
                  warehouse_number: warehouseFrom,
                  warehouse_name: warehouseFromName,
                  quantity: lineQty,
                  before_quantity: 0, after_quantity: 0,
                  batch_number: '',
                  supplier_number: '', supplier_name: '',
                  operator,
                  remark: '委外回收入库-待检仓出库'
                }, transaction);
              }

              // ---- 下道工序线边仓入库 ----
              if (warehouseTo) {
                const batchNo = await generateBatchNumber('MB', transaction);
                await sequelize.query(
                  `INSERT INTO material_batch_inventory (batch_number, item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, initial_quantity, production_order_number, inbound_date, status, creation_date, last_updated) VALUES (:batch_number, :item_number, :item_name, N'半成品', :specifications, :basic_unit, :warehouse_number, :warehouse_name, :quantity, :quantity, :production_order_number, GETDATE(), N'正常', GETDATE(), GETDATE())`,
                  {
                    replacements: {
                      batch_number: batchNo, item_number: itemNumber, item_name: itemName,
                      specifications, basic_unit: basicUnit,
                      warehouse_number: warehouseTo, warehouse_name: warehouseToName,
                      quantity: lineQty, production_order_number: productionOrderNumber
                    },
                    transaction
                  }
                );
                await upsertMaterialInventory({
                  item_number: itemNumber, item_name: itemName,
                  item_type: '半成品', specifications, basic_unit: basicUnit,
                  warehouse_number: warehouseTo, warehouse_name: warehouseToName,
                  deltaQuantity: lineQty,
                }, transaction);

                const txNumIn = await generateMaterialTxnNumber();
                await createMaterialTransaction({
                  transaction_number: txNumIn,
                  transaction_type: '入库',
                  source_type: '委外回收入库入线边',
                  source_number: stockinNumber,
                  item_number: itemNumber,
                  item_name: itemName,
                  item_type: '半成品',
                  specifications,
                  basic_unit: basicUnit,
                  warehouse_number: warehouseTo,
                  warehouse_name: warehouseToName,
                  quantity: lineQty,
                  before_quantity: 0, after_quantity: 0,
                  batch_number: batchNo,
                  supplier_number: '', supplier_name: '',
                  operator,
                  remark: '委外回收入库-线边仓入库'
                }, transaction);
              }

              // ---- 线边仓流水：当前委外工序OUT ----
              if (order.step_number || order.work_center_number) {
                await logLinesideMovement({
                  transactionType: '出线边',
                  sourceType: '委外回收入库出待检',
                  sourceNumber: stockinNumber,
                  productionOrderNumber,
                  itemNumber: itemNumber,
                  itemName: itemName,
                  specifications,
                  basicUnit: basicUnit,
                  stepNumber: order.step_number || 0,
                  workCenterNumber: order.work_center_number || '',
                  workCenterName: order.work_center_name || '',
                  quantity: lineQty,
                  direction: 'OUT',
                  operator,
                  remark: '委外回收入库'
                }, transaction);
              }

              // ---- 线边仓流水：下道工序IN ----
              if (nextStepNumber > 0) {
                await logLinesideMovement({
                  transactionType: '入线边',
                  sourceType: '委外回收入库入线边',
                  sourceNumber: stockinNumber,
                  productionOrderNumber,
                  itemNumber: itemNumber,
                  itemName: itemName,
                  specifications,
                  basicUnit: basicUnit,
                  stepNumber: nextStepNumber,
                  workCenterNumber: nextWorkCenterNumber,
                  workCenterName: nextWorkCenterName,
                  quantity: lineQty,
                  direction: 'IN',
                  operator,
                  remark: '委外回收入库-下道工序'
                }, transaction);
              }
            }

            // 3c. 更新 process_task.completed_quantity（此时物料真正回到产线）
            if (order.process_task_number) {
              await sequelize.query(
                `UPDATE process_task SET completed_quantity = ISNULL(completed_quantity, 0) + :qty, task_status = CASE WHEN ISNULL(completed_quantity, 0) + :qty2 >= planned_quantity THEN N'已完成' ELSE N'进行中' END WHERE process_task_number = :ptn`,
                { replacements: { qty: qualifiedQty, qty2: qualifiedQty, ptn: order.process_task_number }, transaction }
              );
            }

            // 3d. 更新委外订单 qualified_quantity 和 order_status
            const newQualifiedQty = (parseFloat(order.qualified_quantity) || 0) + qualifiedQty;
            const plannedQty = parseFloat(order.planned_quantity) || 0;
            const orderStatus = newQualifiedQty >= plannedQty ? '已完成' : '部分收回';
            await sequelize.query(
              `UPDATE outsourcing_order SET qualified_quantity = :qty, order_status = :status WHERE outsourcing_order_number = :orderNumber`,
              { replacements: { qty: newQualifiedQty, status: orderStatus, orderNumber }, transaction }
            );
          }
        }
      }
      // 不合格品：仅记录处理方式，不入库，不更新completed_quantity

      await transaction.commit();
      res.json(success(null, isPass ? '质检完成，已自动创建回收入库单并更新库存' : '质检完成，不合格品未入库'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['inspection_number', 'receipt_number', 'outsourcing_order_number', 'inspection_date', 'inspector', 'inspection_result', 'qualified_quantity', 'unqualified_quantity', 'defect_description', 'handling_method', 'creation_date'];
const exportHeaderLabels = ['质检单号', '收回单号', '委外订单号', '检验日期', '检验员', '检验结果', '合格数量', '不合格数量', '缺陷描述', '处理方式', '创建日期'];

export const exportOutsourcingInspections = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE inspection_number LIKE :search OR receipt_number LIKE :search OR outsourcing_order_number LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [items]: any = await sequelize.query(`SELECT * FROM outsourcing_inspection ${whereClause} ORDER BY creation_date DESC`, { replacements });
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, exportFields, exportHeaderLabels, 'outsourcing_inspections', res, format);
  } catch (err) { next(err); }
};
