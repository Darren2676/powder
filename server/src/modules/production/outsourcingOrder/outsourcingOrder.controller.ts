import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import dayjs from 'dayjs';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { generateOutsourcingOrderNumber, generateOutsourcingIssueNumber, generateOutsourcingReceiptNumber } from '@/services/documentNumber.service';
import { registerApprovalHandler } from '@/services/approval.service';
import { createLogger } from '@/config/logger';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

const log = createLogger('outsourcingOrder');

// Re-export from service for backward compatibility
export { generateOutsourcingOrderNumber } from '@/services/documentNumber.service';

// ==================== 列表 ====================
export const getOutsourcingOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const order_status = (req.query.order_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(outsourcing_order_number LIKE :search OR process_task_number LIKE :search OR production_order_number LIKE :search OR supplier_name LIKE :search OR item_number LIKE :search OR item_name LIKE :search OR standard_process_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) { conditions.push(`approval_status = :approval_status`); replacements.approval_status = approval_status; }
    if (order_status) { conditions.push(`order_status = :order_status`); replacements.order_status = order_status; }

    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      conditions.push(`factory_id = :_factoryId`);
      replacements._factoryId = _factoryId;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM outsourcing_order ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;

    const [items]: any = await sequelize.query(
      `SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY creation_date DESC, outsourcing_order_number DESC) AS _row_num FROM outsourcing_order ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取委外订单列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getOutsourcingOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const [rows]: any = await sequelize.query(`SELECT * FROM outsourcing_order WHERE outsourcing_order_number = :id${factoryCond}`, { replacements: { id, ...(_factoryId !== null ? { _factoryId } : {}) } });
    if (!rows.length) { res.status(404).json({ success: false, message: '委外订单不存在' }); return; }
    res.json(success(rows[0], '获取委外订单详情成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createOutsourcingOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const b = req.body;
    if (!b.process_task_number) { res.status(400).json({ success: false, message: '工序任务号不能为空' }); return; }

    // 查询工序任务信息自动填充冗余字段
    const [tasks]: any = await sequelize.query(
      `SELECT * FROM process_task WHERE process_task_number = :ptn`,
      { replacements: { ptn: b.process_task_number } }
    );
    if (!tasks.length) { res.status(400).json({ success: false, message: '工序任务不存在' }); return; }
    const task = tasks[0];

    // 防重复
    const [existing]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM outsourcing_order WHERE process_task_number = :ptn`,
      { replacements: { ptn: b.process_task_number } }
    );
    if (existing[0].cnt > 0) { res.status(400).json({ success: false, message: '该工序任务已存在委外订单' }); return; }

    const orderNumber = await generateOutsourcingOrderNumber(factoryCode);
    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const username = (req as any).user?.username || '';

    await sequelize.query(
      `INSERT INTO outsourcing_order (
        outsourcing_order_number, process_task_number, production_order_number, production_number,
        process_route_number, step_number, standard_process_number, standard_process_name,
        work_center_number, work_center_name, item_number, item_name, specifications, basic_unit,
        planned_quantity, received_quantity, supplier_number, supplier_name,
        unit_price, total_amount, order_date, expected_return_date, actual_return_date,
        approval_status, order_status, remark, creation_date, creation_man
      ) VALUES (
        :orderNumber, :process_task_number, :production_order_number, :production_number,
        :process_route_number, :step_number, :standard_process_number, :standard_process_name,
        :work_center_number, :work_center_name, :item_number, :item_name, :specifications, :basic_unit,
        :planned_quantity, 0, :supplier_number, :supplier_name,
        :unit_price, :total_amount, :order_date, :expected_return_date, NULL,
        N'草稿', N'待发出', :remark, :creation_date, :creation_man
      )`,
      {
        replacements: {
          orderNumber,
          process_task_number: b.process_task_number,
          production_order_number: task.production_order_number || '',
          production_number: task.production_number || '',
          process_route_number: task.process_route_number || '',
          step_number: task.step_number || 0,
          standard_process_number: task.standard_process_number || '',
          standard_process_name: task.standard_process_name || '',
          work_center_number: task.work_center_number || '',
          work_center_name: task.work_center_name || '',
          item_number: task.item_number || '',
          item_name: task.item_name || '',
          specifications: task.specifications || '',
          basic_unit: task.basic_unit || '',
          planned_quantity: task.planned_quantity || 0,
          supplier_number: b.supplier_number || '',
          supplier_name: b.supplier_name || '',
          unit_price: parseFloat(b.unit_price) || 0,
          total_amount: (parseFloat(b.unit_price) || 0) * (parseFloat(task.planned_quantity) || 0),
          order_date: b.order_date || now.split(' ')[0],
          expected_return_date: b.expected_return_date || '',
          remark: b.remark || '',
          creation_date: now,
          creation_man: username
        }
      }
    );

    res.json(success({ outsourcing_order_number: orderNumber }, '创建委外订单成功'));
  } catch (err) { next(err); }
};

// ==================== 更新 ====================
export const updateOutsourcingOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [check]: any = await sequelize.query(`SELECT approval_status, planned_quantity FROM outsourcing_order WHERE outsourcing_order_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外订单不存在' }); return; }
    if (check[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return; }

    const unitPrice = parseFloat(b.unit_price) || 0;
    const plannedQty = parseFloat(check[0].planned_quantity) || 0;

    await sequelize.query(
      `UPDATE outsourcing_order SET
        supplier_number = :supplier_number, supplier_name = :supplier_name,
        unit_price = :unit_price, total_amount = :total_amount,
        order_date = :order_date, expected_return_date = :expected_return_date,
        remark = :remark
      WHERE outsourcing_order_number = :id`,
      {
        replacements: {
          id,
          supplier_number: b.supplier_number || '',
          supplier_name: b.supplier_name || '',
          unit_price: unitPrice,
          total_amount: unitPrice * plannedQty,
          order_date: b.order_date || '',
          expected_return_date: b.expected_return_date || '',
          remark: b.remark || ''
        }
      }
    );

    res.json(success(null, '更新委外订单成功'));
  } catch (err) { next(err); }
};

// ==================== 删除 ====================
export const deleteOutsourcingOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [check]: any = await sequelize.query(`SELECT approval_status FROM outsourcing_order WHERE outsourcing_order_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外订单不存在' }); return; }
    if (check[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return; }

    await sequelize.query(`DELETE FROM outsourcing_order WHERE outsourcing_order_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    res.json(success(null, '删除委外订单成功'));
  } catch (err) { next(err); }
};

// ==================== 发出 ====================
export const sendOut = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(`SELECT approval_status, order_status FROM outsourcing_order WHERE outsourcing_order_number = :id`, { replacements: { id } });
    if (!rows.length) { res.status(404).json({ success: false, message: '委外订单不存在' }); return; }
    if (rows[0].approval_status !== '已审批') { res.status(403).json({ success: false, message: '只有已审批的订单才能发出' }); return; }
    if (rows[0].order_status !== '待发出') { res.status(403).json({ success: false, message: '只有待发出状态的订单才能发出' }); return; }

    await sequelize.query(`UPDATE outsourcing_order SET order_status = N'已发出' WHERE outsourcing_order_number = :id`, { replacements: { id } });
    res.json(success(null, '委外订单已发出'));
  } catch (err) { next(err); }
};

// ==================== 收货确认（仅记录回收数量，不更新order_status和completed_quantity） ====================
export const confirmReceipt = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { received_quantity } = req.body;
    const recvQty = parseFloat(received_quantity);
    if (!recvQty || recvQty <= 0) { res.status(400).json({ success: false, message: '收货数量必须大于0' }); return; }

    const [rows]: any = await sequelize.query(
      `SELECT * FROM outsourcing_order WHERE outsourcing_order_number = :id`,
      { replacements: { id } }
    );
    if (!rows.length) { res.status(404).json({ success: false, message: '委外订单不存在' }); return; }
    const order = rows[0];

    if (order.order_status !== '已发出' && order.order_status !== '部分收回') {
      res.status(403).json({ success: false, message: '只有已发出或部分收回状态的订单才能收货' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      const newReceived = (parseFloat(order.received_quantity) || 0) + recvQty;
      const now = dayjs().format('YYYY/MM/DD');

      // 仅更新委外订单的received_quantity，不改order_status和completed_quantity
      // order_status 和 completed_quantity 在质检合格回收入库时才更新
      await sequelize.query(
        `UPDATE outsourcing_order SET received_quantity = :newReceived, actual_return_date = :actualDate WHERE outsourcing_order_number = :id`,
        { replacements: { id, newReceived, actualDate: now }, transaction }
      );

      // 注意：不回写 process_task.completed_quantity
      // completed_quantity 在质检合格后、回收入库时才更新

      await transaction.commit();
      res.json(success({ received_quantity: newReceived }, '收货确认成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 关闭 ====================
export const closeOutsourcingOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(`SELECT order_status FROM outsourcing_order WHERE outsourcing_order_number = :id`, { replacements: { id } });
    if (!rows.length) { res.status(404).json({ success: false, message: '委外订单不存在' }); return; }
    if (rows[0].order_status === '已关闭') { res.status(403).json({ success: false, message: '订单已关闭' }); return; }

    await sequelize.query(`UPDATE outsourcing_order SET order_status = N'已关闭' WHERE outsourcing_order_number = :id`, { replacements: { id } });
    res.json(success(null, '委外订单已关闭'));
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['outsourcing_order_number', 'process_task_number', 'production_order_number', 'step_number', 'standard_process_name', 'item_number', 'item_name', 'specifications', 'basic_unit', 'planned_quantity', 'received_quantity', 'supplier_number', 'supplier_name', 'unit_price', 'total_amount', 'order_date', 'expected_return_date', 'actual_return_date', 'approval_status', 'order_status', 'remark'];
const exportHeaderLabels = ['委外订单号', '工序任务号', '生产单号', '工序序号', '工序名称', '产品编号', '产品名称', '规格', '单位', '计划数量', '已收回数量', '供应商编号', '供应商名称', '加工单价', '金额', '下单日期', '预计回货日期', '实际回货日期', '审批状态', '执行状态', '备注'];

export const exportOutsourcingOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE outsourcing_order_number LIKE :search OR process_task_number LIKE :search OR production_order_number LIKE :search OR supplier_name LIKE :search OR item_number LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [items]: any = await sequelize.query(`SELECT * FROM outsourcing_order ${whereClause} ORDER BY creation_date DESC`, { replacements });
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, exportFields, exportHeaderLabels, 'outsourcing_orders', res, format);
  } catch (err) { next(err); }
};

// ==================== 委外订单审批回调：自动生成备料出库申请和委外回收申请 ====================
const onOutsourcingOrderApproved = async (recordId: string): Promise<void> => {
  try {
    const factoryCode = '';
    const orderNumber = recordId;
    // 查询委外订单
    const [orders]: any = await sequelize.query(
      `SELECT * FROM outsourcing_order WHERE outsourcing_order_number = :orderNumber`,
      { replacements: { orderNumber } }
    );
    if (!orders.length) { log.error({ orderNumber }, '审批回调：委外订单不存在'); return; }
    const order = orders[0];

    // 查询工序任务信息
    const [tasks]: any = await sequelize.query(
      `SELECT pt.*, wc.warehouse_number AS wc_warehouse_number, wc.warehouse_name AS wc_warehouse_name FROM process_task pt LEFT JOIN work_center wc ON pt.work_center_number = wc.work_cente_number WHERE pt.process_task_number = :ptn`,
      { replacements: { ptn: order.process_task_number } }
    );
    if (!tasks.length) { log.error({ orderNumber, ptn: order.process_task_number }, '审批回调：工序任务不存在'); return; }
    const task = tasks[0];

    // 查询下一道工序
    const [nextSteps]: any = await sequelize.query(
      `SELECT pt.*, wc.warehouse_number AS wc_warehouse_number, wc.warehouse_name AS wc_warehouse_name FROM process_task pt LEFT JOIN work_center wc ON pt.work_center_number = wc.work_cente_number WHERE pt.production_order_number = :orderNo AND pt.step_number > :step ORDER BY pt.step_number ASC`,
      { replacements: { orderNo: order.production_order_number, step: order.step_number || task.step_number } }
    );
    const nextStep = nextSteps.length > 0 ? nextSteps[0] : null;

    // 查询待检仓（WH_TYPE='待检仓' 或 warehouse_number LIKE 'INSP%'）
    const [inspWh]: any = await sequelize.query(
      `SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE warehouse_type = N'待检仓' OR warehouse_number LIKE 'INSP%' ORDER BY warehouse_number`
    );
    const inspectionWarehouse = inspWh.length > 0 ? inspWh[0] : { warehouse_number: 'INSP_WH', warehouse_name: '待检仓' };

    // 查询制造BOM获取物料清单
    const [bomItems]: any = await sequelize.query(
      `SELECT bd.material_number, im.item_name, im.specifications, bd.standard_quantity, im.basic_unit AS unit
       FROM mfg_bom_detail bd
       INNER JOIN mfg_bom_header bh ON bd.mfg_bom_number = bh.mfg_bom_number
       LEFT JOIN item_master im ON bd.material_number = im.item_number
       WHERE bh.item_number = :item_number AND bh.[condition] = N'启用' AND bh.approval_status = N'已审批'`,
      { replacements: { item_number: order.item_number || '' } }
    );

    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const username = 'system';

    const transaction = await sequelize.transaction();
    try {
      const factoryCode = '';
      // ====== 自动创建备料出库申请 ======
      const issueNumber = await generateOutsourcingIssueNumber(factoryCode, transaction);
      const issueWarehouseNumber = task.wc_warehouse_number || '';
      const issueWarehouseName = task.wc_warehouse_name || '';

      await sequelize.query(`
        INSERT INTO outsourcing_material_issue (
          issue_number, outsourcing_order_number, issue_date,
          warehouse_number, warehouse_name, handler,
          doc_type, work_center_number, work_center_name, step_number,
          production_order_number, process_task_number,
          status, remark, creation_date, creation_man
        ) VALUES (
          :issueNumber, :ooNumber, :issue_date,
          :warehouse_number, :warehouse_name, '',
          N'issue', :wc_number, :wc_name, :step_number,
          :production_order_number, :process_task_number,
          N'待确认', N'委外订单审批自动生成', :creation_date, :creation_man
        )
      `, {
        replacements: {
          issueNumber, ooNumber: orderNumber,
          issue_date: now.split(' ')[0],
          warehouse_number: issueWarehouseNumber,
          warehouse_name: issueWarehouseName,
          wc_number: task.work_center_number || '',
          wc_name: task.work_center_name || '',
          step_number: task.step_number || 0,
          production_order_number: order.production_order_number || '',
          process_task_number: order.process_task_number || '',
          creation_date: now, creation_man: username
        },
        transaction
      });

      // 插入备料出库明细（从BOM填充）
      for (let bi = 0; bi < bomItems.length; bi++) {
        const bomItem = bomItems[bi];
        await sequelize.query(`
          INSERT INTO outsourcing_material_issue_detail (
            issue_number, line_number, item_number, item_name,
            specifications, batch_number, issued_quantity, unit, remark
          ) VALUES (
            :issueNumber, :line_number, :item_number, :item_name,
            :specifications, '', :issued_quantity, :unit, ''
          )
        `, {
          replacements: {
            issueNumber,
            line_number: (bi + 1) * 10,
            item_number: bomItem.material_number || '',
            item_name: bomItem.item_name || '',
            specifications: bomItem.specifications || '',
            issued_quantity: (parseFloat(bomItem.standard_quantity) || 0) * (parseFloat(order.planned_quantity) || 0),
            unit: bomItem.unit || ''
          },
          transaction
        });
      }

      // ====== 自动创建委外回收申请 ======
      const receiptNumber = await generateOutsourcingReceiptNumber(factoryCode, transaction);

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
          N'', N'待确认', N'委外订单审批自动生成', :creation_date, :creation_man
        )
      `, {
        replacements: {
          receiptNumber, ooNumber: orderNumber,
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

      // 插入回收明细（产品本身）
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
          receipt_quantity: order.planned_quantity || 0,
          unit: order.basic_unit || ''
        },
        transaction
      });

      await transaction.commit();
      log.info({ orderNumber }, '审批回调：自动生成备料出库申请和委外回收申请成功');
    } catch (e) {
      await transaction.rollback();
      log.error({ orderNumber, err: e }, '审批回调：自动生成单据失败');
    }
  } catch (err) {
    log.error({ recordId, err }, '审批回调：外层异常');
  }
};

// 注册审批回调
registerApprovalHandler('outsourcing_order', {
  onApprove: onOutsourcingOrderApproved,
  onReverse: async (_recordId: string) => {
    // 反审时暂不自动清理已生成的单据，需人工处理
  }
});
