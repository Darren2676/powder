import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import dayjs from 'dayjs';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { generateOutsourcingOrderNumber } from '@/services/documentNumber.service';

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
    const [rows]: any = await sequelize.query(`SELECT * FROM outsourcing_order WHERE outsourcing_order_number = :id`, { replacements: { id } });
    if (!rows.length) { res.status(404).json({ success: false, message: '委外订单不存在' }); return; }
    res.json(success(rows[0], '获取委外订单详情成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createOutsourcingOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
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

    const orderNumber = await generateOutsourcingOrderNumber();
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
    const [check]: any = await sequelize.query(`SELECT approval_status FROM outsourcing_order WHERE outsourcing_order_number = :id`, { replacements: { id } });
    if (!check.length) { res.status(404).json({ success: false, message: '委外订单不存在' }); return; }
    if (check[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return; }

    await sequelize.query(`DELETE FROM outsourcing_order WHERE outsourcing_order_number = :id`, { replacements: { id } });
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

// ==================== 收货确认 ====================
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
      const plannedQty = parseFloat(order.planned_quantity) || 0;
      const newStatus = newReceived >= plannedQty ? '已完成' : '部分收回';
      const now = dayjs().format('YYYY/MM/DD');

      // 更新委外订单
      await sequelize.query(
        `UPDATE outsourcing_order SET received_quantity = :newReceived, order_status = :newStatus, actual_return_date = :actualDate WHERE outsourcing_order_number = :id`,
        { replacements: { id, newReceived, newStatus, actualDate: now }, transaction }
      );

      // 回写工序任务 completed_quantity
      await sequelize.query(
        `UPDATE process_task SET completed_quantity = ISNULL(completed_quantity, 0) + :recvQty, task_status = CASE WHEN ISNULL(completed_quantity, 0) + :recvQty2 >= planned_quantity THEN N'已完成' ELSE N'进行中' END WHERE process_task_number = :ptn`,
        { replacements: { recvQty, recvQty2: recvQty, ptn: order.process_task_number }, transaction }
      );

      await transaction.commit();
      res.json(success({ received_quantity: newReceived, order_status: newStatus }, '收货确认成功'));
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
