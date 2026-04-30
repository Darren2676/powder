import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { generateOutsourcingReturnStockinNumber } from '@/services/documentNumber.service';
import { generateBatchNumber, generateMaterialTxnNumber, syncMaterialInventorySummary } from '@/services/inventory.service';
import { fifoDeductBatches, upsertMaterialInventory, createMaterialTransaction } from '@/services/warehouse/helpers';
import { logLinesideMovement } from '@/services/linesideMovement.service';
import dayjs from 'dayjs';

// ==================== 列表 ====================
export const getReturnStockins = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const status = (req.query.status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};
    if (search) {
      conditions.push(`(stockin_number LIKE :search OR outsourcing_order_number LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (status) { conditions.push(`status = :status`); replacements.status = status; }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM outsourcing_return_stockin ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(
      `SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC) AS _row_num FROM outsourcing_return_stockin ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取委外回收入库单列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getReturnStockinDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(`SELECT * FROM outsourcing_return_stockin WHERE stockin_number = :id`, { replacements: { id } });
    if (!rows.length) { res.status(404).json({ success: false, message: '委外回收入库单不存在' }); return; }
    const [details]: any = await sequelize.query(`SELECT * FROM outsourcing_return_stockin_detail WHERE stockin_number = :id`, { replacements: { id } });
    res.json(success({ ...rows[0], details }, '获取委外回收入库单详情成功'));
  } catch (err) { next(err); }
};

// ==================== 确认入库（待检仓出库+下道工序线边仓入库） ====================
export const confirmReturnStockin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [check]: any = await sequelize.query(`SELECT * FROM outsourcing_return_stockin WHERE stockin_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外回收入库单不存在' }); return; }
    if (check[0].status === '已入库') { res.status(403).json({ success: false, message: '入库单已完成' }); return; }

    const [details]: any = await sequelize.query(`SELECT * FROM outsourcing_return_stockin_detail WHERE stockin_number = :id`, { replacements: { id } });

    const transaction = await sequelize.transaction();
    try {
      const operator = (req as any).user?.username || '';
      const warehouseFrom = check[0].warehouse_from; // 待检仓
      const warehouseTo = check[0].warehouse_to;     // 下道工序线边仓
      const productionOrderNumber = check[0].production_order_number || '';
      const nextStepNumber = check[0].step_number || 0;
      const nextWorkCenterNumber = check[0].work_center_number || '';

      // 查询委外订单和当前工序信息（用于线边仓OUT）
      const [orderRows]: any = await sequelize.query(
        `SELECT oo.process_task_number, oo.step_number AS order_step, oo.work_center_number AS order_wc, oo.work_center_name AS order_wc_name FROM outsourcing_order oo WHERE oo.outsourcing_order_number = :orderNumber`,
        { replacements: { orderNumber: check[0].outsourcing_order_number }, transaction }
      );
      const currentOrder = orderRows.length > 0 ? orderRows[0] : null;

      // 查询下道工序的工作中心名称
      let nextWorkCenterName = '';
      if (nextWorkCenterNumber) {
        const [wcRows]: any = await sequelize.query(`SELECT warehouse_name FROM warehouse WHERE warehouse_number = :wn`, { replacements: { wn: warehouseTo }, transaction });
        if (wcRows.length) nextWorkCenterName = wcRows[0].warehouse_name || '';
      }

      for (const d of details) {
        const qualifiedQty = parseFloat(d.qualified_quantity) || 0;
        if (qualifiedQty <= 0) continue;

        // ====== 1. 待检仓出库（FIFO） ======
        if (warehouseFrom) {
          await fifoDeductBatches({
            batchTable: 'material_batch_inventory',
            item_number: d.item_number,
            warehouse_number: warehouseFrom,
            totalQuantity: qualifiedQty,
          }, transaction);
          await syncMaterialInventorySummary(d.item_number, warehouseFrom, transaction);

          // 记录待检仓出库流水
          const txNumOut = await generateMaterialTxnNumber();
          await createMaterialTransaction({
            transaction_number: txNumOut,
            transaction_type: '出库',
            source_type: '委外回收入库出待检',
            source_number: String(id),
            item_number: d.item_number,
            item_name: d.item_name || '',
            item_type: '半成品',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            warehouse_number: warehouseFrom,
            warehouse_name: '待检仓',
            quantity: qualifiedQty,
            before_quantity: 0, after_quantity: 0,
            batch_number: '',
            supplier_number: '', supplier_name: '',
            operator,
            remark: '委外回收入库-待检仓出库'
          }, transaction);
        }

        // ====== 2. 下道工序线边仓入库 ======
        if (warehouseTo) {
          const batchNo = await generateBatchNumber('MB', transaction);
          await sequelize.query(
            `INSERT INTO material_batch_inventory (batch_number, item_number, item_name, item_type, specifications, basic_unit, warehouse_number, warehouse_name, quantity, initial_quantity, production_order_number, inbound_date, status, creation_date, last_updated) VALUES (:batch_number, :item_number, :item_name, N'半成品', :specifications, :basic_unit, :warehouse_number, :warehouse_name, :quantity, :quantity, :production_order_number, GETDATE(), N'正常', GETDATE(), GETDATE())`,
            {
              replacements: {
                batch_number: batchNo, item_number: d.item_number, item_name: d.item_name || '',
                specifications: d.specifications || '', basic_unit: d.basic_unit || '',
                warehouse_number: warehouseTo, warehouse_name: nextWorkCenterName || '',
                quantity: qualifiedQty, production_order_number: productionOrderNumber
              },
              transaction
            }
          );
          await upsertMaterialInventory({
            item_number: d.item_number, item_name: d.item_name || '',
            item_type: '半成品', specifications: d.specifications || '', basic_unit: d.basic_unit || '',
            warehouse_number: warehouseTo, warehouse_name: nextWorkCenterName || '',
            deltaQuantity: qualifiedQty,
          }, transaction);

          // 记录线边仓入库流水
          const txNumIn = await generateMaterialTxnNumber();
          await createMaterialTransaction({
            transaction_number: txNumIn,
            transaction_type: '入库',
            source_type: '委外回收入库入线边',
            source_number: String(id),
            item_number: d.item_number,
            item_name: d.item_name || '',
            item_type: '半成品',
            specifications: d.specifications || '',
            basic_unit: d.basic_unit || '',
            warehouse_number: warehouseTo,
            warehouse_name: nextWorkCenterName || '',
            quantity: qualifiedQty,
            before_quantity: 0, after_quantity: 0,
            batch_number: batchNo,
            supplier_number: '', supplier_name: '',
            operator,
            remark: '委外回收入库-线边仓入库'
          }, transaction);
        }

        // ====== 3. 线边仓流水：当前委外工序OUT ======
        if (currentOrder) {
          await logLinesideMovement({
            transactionType: '出线边',
            sourceType: '委外回收入库出待检',
            sourceNumber: String(id),
            productionOrderNumber,
            itemNumber: d.item_number,
            itemName: d.item_name || '',
            specifications: d.specifications || '',
            basicUnit: d.basic_unit || '',
            stepNumber: currentOrder.order_step || 0,
            workCenterNumber: currentOrder.order_wc || '',
            workCenterName: currentOrder.order_wc_name || '',
            quantity: qualifiedQty,
            direction: 'OUT',
            operator,
            remark: '委外回收入库'
          }, transaction);
        }

        // ====== 4. 线边仓流水：下道工序IN ======
        if (nextStepNumber > 0) {
          await logLinesideMovement({
            transactionType: '入线边',
            sourceType: '委外回收入库入线边',
            sourceNumber: String(id),
            productionOrderNumber,
            itemNumber: d.item_number,
            itemName: d.item_name || '',
            specifications: d.specifications || '',
            basicUnit: d.basic_unit || '',
            stepNumber: nextStepNumber,
            workCenterNumber: nextWorkCenterNumber,
            workCenterName: nextWorkCenterName,
            quantity: qualifiedQty,
            direction: 'IN',
            operator,
            remark: '委外回收入库-下道工序'
          }, transaction);
        }
      }

      // ====== 5. 更新 process_task.completed_quantity ======
      if (currentOrder?.process_task_number) {
        const totalQualified = details.reduce((sum: number, d: any) => sum + (parseFloat(d.qualified_quantity) || 0), 0);
        await sequelize.query(
          `UPDATE process_task SET completed_quantity = ISNULL(completed_quantity, 0) + :qty, task_status = CASE WHEN ISNULL(completed_quantity, 0) + :qty2 >= planned_quantity THEN N'已完成' ELSE N'进行中' END WHERE process_task_number = :ptn`,
          { replacements: { qty: totalQualified, qty2: totalQualified, ptn: currentOrder.process_task_number }, transaction }
        );
      }

      // ====== 6. 更新委外订单 order_status ======
      const totalQualified = details.reduce((sum: number, d: any) => sum + (parseFloat(d.qualified_quantity) || 0), 0);
      const [orderCheck]: any = await sequelize.query(
        `SELECT qualified_quantity, planned_quantity FROM outsourcing_order WHERE outsourcing_order_number = :orderNumber`,
        { replacements: { orderNumber: check[0].outsourcing_order_number }, transaction }
      );
      if (orderCheck.length) {
        const newQualifiedQty = (parseFloat(orderCheck[0].qualified_quantity) || 0) + totalQualified;
        const plannedQty = parseFloat(orderCheck[0].planned_quantity) || 0;
        const orderStatus = newQualifiedQty >= plannedQty ? '已完成' : '部分收回';
        await sequelize.query(
          `UPDATE outsourcing_order SET qualified_quantity = :qty, order_status = :status WHERE outsourcing_order_number = :orderNumber`,
          { replacements: { qty: newQualifiedQty, status: orderStatus, orderNumber: check[0].outsourcing_order_number }, transaction }
        );
      }

      // 更新入库单状态
      await sequelize.query(`UPDATE outsourcing_return_stockin SET status = N'已入库', stockin_date = GETDATE() WHERE stockin_number = :id`, { replacements: { id }, transaction });

      await transaction.commit();
      res.json(success(null, '入库确认成功，库存已更新'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['stockin_number', 'outsourcing_order_number', 'receipt_number', 'inspection_number', 'warehouse_from', 'warehouse_to', 'stockin_date', 'status', 'creation_date'];
const exportHeaderLabels = ['入库单号', '委外订单号', '收回单号', '质检单号', '来源仓', '目标仓', '入库日期', '状态', '创建日期'];

export const exportReturnStockins = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE stockin_number LIKE :search OR outsourcing_order_number LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [items]: any = await sequelize.query(`SELECT * FROM outsourcing_return_stockin ${whereClause} ORDER BY creation_date DESC`, { replacements });
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, exportFields, exportHeaderLabels, 'outsourcing_return_stockins', res, format);
  } catch (err) { next(err); }
};
