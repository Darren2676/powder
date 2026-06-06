import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 生产单进度看板：工单列表 ====================
export const getKanbanOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const planStatus = (req.query.plan_status as string) || '';
    const itemProperties = (req.query.item_properties as string) || '';

    const conditions: string[] = [`po.approval_status = N'已审批'`];
    const replacements: any = {};

    if (search) {
      conditions.push(`(po.production_order_number LIKE :search OR po.item_number LIKE :search OR po.item_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (planStatus) {
      conditions.push(`po.plan_status = :planStatus`);
      replacements.planStatus = planStatus;
    }
    if (itemProperties) {
      conditions.push(`im.item_properties = :itemProperties`);
      replacements.itemProperties = itemProperties;
    }

    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      conditions.push(`po.factory_id = :_factoryId`);
      replacements._factoryId = _factoryId;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM production_order po LEFT JOIN item_master im ON po.item_number = im.item_number ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [orders]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT po.production_order_number, po.item_number, po.item_name, po.specifications,
               po.basic_unit, po.planned_quantity, po.plan_status,
               po.production_date, po.equipment_name,
               im.item_properties,
               ROW_NUMBER() OVER (ORDER BY po.production_date DESC, po.production_order_number DESC) AS _row_num
        FROM production_order po LEFT JOIN item_master im ON po.item_number = im.item_number ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const items = [];
    for (const order of orders) {
      const { _row_num, ...o } = order;

      // 工序进度
      const [steps]: any = await sequelize.query(
        `SELECT step_number, standard_process_name, planned_quantity,
                ISNULL(completed_quantity, 0) as completed_quantity, task_status, inspect_status
         FROM process_task
         WHERE production_order_number = :orderNo
         ORDER BY step_number ASC`,
        { replacements: { orderNo: o.production_order_number } }
      );

      const stepCount = steps.length;
      const completedSteps = steps.filter((s: any) => s.task_status === '已完成' || s.task_status === '已关闭').length;

      let currentStepName = '';
      const plannedQty = parseFloat(o.planned_quantity) || 0;

      for (const step of steps) {
        if (!currentStepName && step.task_status !== '已完成' && step.task_status !== '已关闭') {
          currentStepName = step.standard_process_name || `工序${step.step_number}`;
        }
      }

      const lastStep = steps.length > 0 ? steps[steps.length - 1] : null;
      const lastCompleted = lastStep ? parseFloat(lastStep.completed_quantity) : 0;
      const completionRate = plannedQty > 0 ? Math.round(lastCompleted / plannedQty * 10000) / 100 : 0;

      items.push({
        ...o,
        step_count: stepCount,
        completed_steps: completedSteps,
        current_step_name: currentStepName || (stepCount > 0 ? '已完成' : '无工序'),
        completion_rate: completionRate
      });
    }

    res.json(success({
      items,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }));
  } catch (err) { next(err); }
};

// ==================== 生产单进度看板：单工单工艺流程 ====================
export const getKanbanOrderFlow = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderNo = req.params.orderNo;

    // 1. 生产单基本信息
    const [orderRows]: any = await sequelize.query(
      `SELECT production_order_number, item_number, item_name, specifications, basic_unit,
              planned_quantity, plan_status, approval_status, production_date,
              equipment_name, equipment_number, mould_number,
              ISNULL(inbound_quantity, 0) as inbound_quantity,
              ISNULL(inbound_status, N'未入库') as inbound_status
       FROM production_order WHERE production_order_number = :orderNo`,
      { replacements: { orderNo } }
    );

    if (orderRows.length === 0) {
      res.status(404).json({ success: false, message: '生产单不存在' });
      return;
    }

    const orderInfo = orderRows[0];

    // 2. 所有工序任务
    const [tasks]: any = await sequelize.query(
      `SELECT process_task_number, step_number, standard_process_number, standard_process_name,
              work_center_number, work_center_name,
              planned_quantity, ISNULL(completed_quantity, 0) as completed_quantity,
              excess_reporting_ratio,
              task_status, approval_status, inspect_status,
              actual_start_time, actual_end_time
       FROM process_task
       WHERE production_order_number = :orderNo
       ORDER BY step_number ASC`,
      { replacements: { orderNo } }
    );

    // 3. 每道工序的报工汇总
    const processFlow = [];
    let totalReportedQty = 0;
    let totalQualifiedQty = 0;
    let totalUnqualifiedQty = 0;
    let totalReportCount = 0;

    for (const task of tasks) {
      const [reportSummary]: any = await sequelize.query(
        `SELECT COUNT(*) as report_count,
                ISNULL(SUM(qualified_quantity), 0) as qualified_qty,
                ISNULL(SUM(unqualified_quantity), 0) as unqualified_qty
         FROM work_report
         WHERE process_task_number = :taskNo
           AND approval_status != N'草稿'`,
        { replacements: { taskNo: task.process_task_number } }
      );

      const reportCount = parseInt(reportSummary[0]?.report_count) || 0;
      const qualifiedQty = parseFloat(reportSummary[0]?.qualified_qty) || 0;
      const unqualifiedQty = parseFloat(reportSummary[0]?.unqualified_qty) || 0;
      const plannedQty = parseFloat(task.planned_quantity) || 0;
      const completedQty = parseFloat(task.completed_quantity) || 0;

      totalReportedQty += qualifiedQty + unqualifiedQty;
      totalQualifiedQty += qualifiedQty;
      totalUnqualifiedQty += unqualifiedQty;
      totalReportCount += reportCount;

      const progressRate = plannedQty > 0
        ? Math.min(Math.round(completedQty / plannedQty * 10000) / 100, 999.99)
        : 0;

      processFlow.push({
        step_number: task.step_number,
        process_task_number: task.process_task_number,
        standard_process_number: task.standard_process_number,
        process_name: task.standard_process_name,
        work_center_number: task.work_center_number,
        work_center_name: task.work_center_name,
        planned_quantity: plannedQty,
        completed_quantity: completedQty,
        cumulative_reported_qty: qualifiedQty,
        unqualified_qty: unqualifiedQty,
        report_count: reportCount,
        task_status: task.task_status,
        inspect_status: task.inspect_status,
        progress_rate: progressRate,
        actual_start_time: task.actual_start_time,
        actual_end_time: task.actual_end_time
      });
    }

    // 4. 当前工序判定
    let currentStepIndex = -1;
    for (let i = 0; i < processFlow.length; i++) {
      if (processFlow[i].task_status !== '已完成' && processFlow[i].task_status !== '已关闭') {
        currentStepIndex = i;
        break;
      }
    }
    // 如果全部完成，当前工序为-1

    res.json(success({
      order_info: {
        production_order_number: orderInfo.production_order_number,
        item_number: orderInfo.item_number,
        item_name: orderInfo.item_name,
        specifications: orderInfo.specifications,
        basic_unit: orderInfo.basic_unit,
        planned_quantity: parseFloat(orderInfo.planned_quantity) || 0,
        plan_status: orderInfo.plan_status,
        production_date: orderInfo.production_date,
        equipment_name: orderInfo.equipment_name,
        inbound_quantity: parseFloat(orderInfo.inbound_quantity) || 0,
        inbound_status: orderInfo.inbound_status,
        step_count: processFlow.length,
        completed_steps: processFlow.filter(p => p.task_status === '已完成' || p.task_status === '已关闭').length,
        current_step_index: currentStepIndex
      },
      process_flow: processFlow,
      report_summary: {
        total_report_count: totalReportCount,
        total_reported_qty: totalReportedQty,
        total_qualified_qty: totalQualifiedQty,
        total_unqualified_qty: totalUnqualifiedQty
      }
    }));
  } catch (err) { next(err); }
};
