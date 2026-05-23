import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';

// ==================== 生产进度仪表板：汇总数据 ====================
export const getProgressSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const dateFrom = (req.query.dateFrom as string) || '';
    const dateTo = (req.query.dateTo as string) || '';

    const dateCondition = dateFrom && dateTo
      ? `AND po.production_date BETWEEN :dateFrom AND :dateTo`
      : dateFrom
        ? `AND po.production_date >= :dateFrom`
        : dateTo
          ? `AND po.production_date <= :dateTo`
          : '';

    const replacements: any = {};
    if (dateFrom) replacements.dateFrom = dateFrom;
    if (dateTo) replacements.dateTo = dateTo;

    // 1. KPI卡片
    const [kpiResult]: any = await sequelize.query(`
      SELECT
        COUNT(*) as total_orders,
        SUM(CASE WHEN po.plan_status = N'生产中' THEN 1 ELSE 0 END) as in_production,
        SUM(CASE WHEN po.plan_status = N'已完成' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN po.inbound_status IN (N'部分入库', N'全部入库') THEN 1 ELSE 0 END) as inbound
      FROM production_order po
      WHERE po.approval_status = N'已审批' ${dateCondition}
    `, { replacements });

    const kpi = kpiResult[0];
    const totalOrders = parseInt(kpi.total_orders) || 0;
    const completedOrders = parseInt(kpi.completed) || 0;
    const overallCompletionRate = totalOrders > 0
      ? Math.round(completedOrders / totalOrders * 10000) / 100
      : 0;

    // 2. 阶段漏斗
    const [stageResult]: any = await sequelize.query(`
      SELECT plan_status as stage, COUNT(*) as cnt
      FROM production_order po
      WHERE po.approval_status = N'已审批' ${dateCondition}
      GROUP BY plan_status
    `, { replacements });

    const stageOrder = ['未开始', '已派发', '已备料', '生产中', '已完成'];
    const stageFunnel = stageOrder.map(stage => ({
      stage,
      count: stageResult.filter((r: any) => r.stage === stage)
        .reduce((sum: number, r: any) => sum + parseInt(r.cnt), 0)
    }));
    // 追加"已入库"阶段
    const inboundCount = parseInt(kpi.inbound) || 0;
    stageFunnel.push({ stage: '已入库', count: inboundCount });

    // 3. 工作中心负载
    const [wcResult]: any = await sequelize.query(`
      SELECT ISNULL(pt.work_center_name, N'未分配') as work_center,
             COUNT(DISTINCT pt.production_order_number) as order_count,
             SUM(CASE WHEN pt.task_status = N'已完成' THEN 1 ELSE 0 END) as completed_tasks,
             COUNT(*) as total_tasks
      FROM process_task pt
      INNER JOIN production_order po ON pt.production_order_number = po.production_order_number
      WHERE po.approval_status = N'已审批' ${dateCondition}
      GROUP BY pt.work_center_name
      ORDER BY order_count DESC
    `, { replacements });

    const workCenterLoad = wcResult.map((r: any) => ({
      work_center: r.work_center,
      order_count: parseInt(r.order_count) || 0,
      completed_tasks: parseInt(r.completed_tasks) || 0,
      total_tasks: parseInt(r.total_tasks) || 0
    }));

    // 4. 工序进度分布（首道/中间/末道完成率）
    const [processResult]: any = await sequelize.query(`
      WITH RankedTasks AS (
        SELECT pt.production_order_number, pt.step_number, pt.planned_quantity,
               ISNULL(pt.completed_quantity, 0) as completed_quantity,
               po.plan_status,
               ROW_NUMBER() OVER (PARTITION BY pt.production_order_number ORDER BY pt.step_number ASC) as rn_asc,
               ROW_NUMBER() OVER (PARTITION BY pt.production_order_number ORDER BY pt.step_number DESC) as rn_desc,
               COUNT(*) OVER (PARTITION BY pt.production_order_number) as total_steps
        FROM process_task pt
        INNER JOIN production_order po ON pt.production_order_number = po.production_order_number
        WHERE po.approval_status = N'已审批' ${dateCondition}
      )
      SELECT
        SUM(CASE WHEN rn_asc = 1 THEN completed_quantity ELSE 0 END) as first_completed,
        SUM(CASE WHEN rn_asc = 1 THEN planned_quantity ELSE 0 END) as first_planned,
        SUM(CASE WHEN rn_asc > 1 AND rn_desc > 1 THEN completed_quantity ELSE 0 END) as middle_completed,
        SUM(CASE WHEN rn_asc > 1 AND rn_desc > 1 THEN planned_quantity ELSE 0 END) as middle_planned,
        SUM(CASE WHEN rn_desc = 1 THEN completed_quantity ELSE 0 END) as last_completed,
        SUM(CASE WHEN rn_desc = 1 THEN planned_quantity ELSE 0 END) as last_planned
      FROM RankedTasks
    `, { replacements });

    const pr = processResult[0] || {};
    const calcRate = (completed: number, planned: number) =>
      planned > 0 ? Math.round(completed / planned * 10000) / 100 : 0;

    const processProgress = {
      first_step_rate: calcRate(parseFloat(pr.first_completed) || 0, parseFloat(pr.first_planned) || 0),
      middle_step_rate: calcRate(parseFloat(pr.middle_completed) || 0, parseFloat(pr.middle_planned) || 0),
      last_step_rate: calcRate(parseFloat(pr.last_completed) || 0, parseFloat(pr.last_planned) || 0),
      inbound_rate: overallCompletionRate
    };

    // 5. 日产出趋势（近30天）
    const [trendResult]: any = await sequelize.query(`
      SELECT CONVERT(VARCHAR(10), wr.creation_date, 120) as dt,
             COUNT(DISTINCT wr.work_report_number) as report_count,
             SUM(ISNULL(wr.qualified_quantity, 0)) as qualified_qty
      FROM work_report wr
      INNER JOIN production_order po ON wr.production_order_number = po.production_order_number
      WHERE wr.approval_status != N'草稿'
        AND wr.creation_date >= DATEADD(day, -30, GETDATE())
        ${dateCondition ? dateCondition.replace('po.', 'po.') : ''}
      GROUP BY CONVERT(VARCHAR(10), wr.creation_date, 120)
      ORDER BY dt
    `, { replacements });

    const dailyTrend = trendResult.map((r: any) => ({
      date: r.dt,
      report_count: parseInt(r.report_count) || 0,
      qualified_qty: parseFloat(r.qualified_qty) || 0
    }));

    res.json(success({
      kpi: {
        total_orders: totalOrders,
        in_production: parseInt(kpi.in_production) || 0,
        completed: completedOrders,
        inbound: inboundCount,
        overall_completion_rate: overallCompletionRate
      },
      stage_funnel: stageFunnel,
      work_center_load: workCenterLoad,
      process_progress: processProgress,
      daily_trend: dailyTrend
    }, '获取生产进度汇总成功'));
  } catch (err) { next(err); }
};

// ==================== 生产进度仪表板：订单明细 ====================
export const getProgressOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const planStatus = (req.query.plan_status as string) || '';
    const inboundStatus = (req.query.inbound_status as string) || '';
    const dateFrom = (req.query.dateFrom as string) || '';
    const dateTo = (req.query.dateTo as string) || '';

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
    if (inboundStatus) {
      conditions.push(`po.inbound_status = :inboundStatus`);
      replacements.inboundStatus = inboundStatus;
    }
    if (dateFrom) {
      conditions.push(`po.production_date >= :dateFrom`);
      replacements.dateFrom = dateFrom;
    }
    if (dateTo) {
      conditions.push(`po.production_date <= :dateTo`);
      replacements.dateTo = dateTo;
    }

    const whereClause = `WHERE ${conditions.join(' AND ')}`;

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM production_order po ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [orders]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT po.production_order_number, po.item_number, po.item_name, po.specifications,
               po.basic_unit, po.planned_quantity, po.plan_status,
               ISNULL(po.inbound_quantity, 0) as inbound_quantity,
               ISNULL(po.inbound_status, N'未入库') as inbound_status,
               po.production_date, po.equipment_name,
               ROW_NUMBER() OVER (ORDER BY po.production_date DESC, po.production_order_number DESC) AS _row_num
        FROM production_order po ${whereClause}
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

      // 领料状态
      const [prepResult]: any = await sequelize.query(
        `SELECT TOP 1 preparation_status FROM material_preparation
         WHERE production_order_number = :orderNo ORDER BY creation_date DESC`,
        { replacements: { orderNo: o.production_order_number } }
      );
      const preparationStatus = prepResult.length > 0 ? prepResult[0].preparation_status : '未备料';

      // 检验状态（取最后一道工序的inspect_status）
      const lastInspectStatus = lastStep?.inspect_status || '';

      items.push({
        ...o,
        current_step_name: currentStepName || (steps.length > 0 ? '已完成' : '无工序'),
        completion_rate: completionRate,
        step_count: steps.length,
        preparation_status: preparationStatus,
        inspect_status: lastInspectStatus
      });
    }

    res.json(success({
      items,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取订单明细成功'));
  } catch (err) { next(err); }
};
