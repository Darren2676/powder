import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { logLinesideMovement, logWorkReportLinesideMovement, logWorkReportReverseLinesideMovement } from '@/services/linesideMovement.service';
import { getFactoryId } from '../../../utils/factoryWhere.util';

// Re-export from service for backward compatibility
export { logLinesideMovement, logWorkReportLinesideMovement, logWorkReportReverseLinesideMovement } from '@/services/linesideMovement.service';

// ==================== WIP报告：按生产单 ====================
export const getWipByOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const plan_status = (req.query.plan_status as string) || '';

    const conditions: string[] = [`po.plan_status IN (N'已派发', N'已备料', N'生产中', N'已完成')`];
    const replacements: any = {};

    if (search) {
      conditions.push(`(po.production_order_number LIKE :search OR po.item_number LIKE :search OR po.item_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (plan_status) {
      conditions.push(`po.plan_status = :plan_status`);
      replacements.plan_status = plan_status;
    }

    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      conditions.push(`po.factory_id = :_factoryId`);
      replacements._factoryId = _factoryId;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

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
               ISNULL(po.inbound_status, '') as inbound_status,
               ROW_NUMBER() OVER (ORDER BY po.production_order_number DESC) AS _row_num
        FROM production_order po ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    // 逐单计算WIP
    const items = [];
    for (const order of orders) {
      const { _row_num, ...o } = order;

      const [steps]: any = await sequelize.query(
        `SELECT step_number, standard_process_name, work_center_number, work_center_name,
                planned_quantity, ISNULL(completed_quantity, 0) as completed_quantity, task_status
         FROM process_task
         WHERE production_order_number = :orderNo
         ORDER BY step_number ASC`,
        { replacements: { orderNo: o.production_order_number } }
      );

      let totalWip = 0;
      let currentStepName = '';
      const inboundQty = parseFloat(o.inbound_quantity) || 0;
      const plannedQty = parseFloat(o.planned_quantity) || 0;

      for (let i = 0; i < steps.length; i++) {
        const cur = parseFloat(steps[i].completed_quantity) || 0;
        const nextCompleted = (i < steps.length - 1)
          ? (parseFloat(steps[i + 1].completed_quantity) || 0)
          : inboundQty;
        const wip = cur - nextCompleted;
        totalWip += Math.max(wip, 0);

        if (!currentStepName && steps[i].task_status !== '已完成' && steps[i].task_status !== '已关闭') {
          currentStepName = steps[i].standard_process_name || `工序${steps[i].step_number}`;
        }
      }

      const lastCompleted = steps.length > 0 ? (parseFloat(steps[steps.length - 1].completed_quantity) || 0) : 0;
      const completionRate = plannedQty > 0 ? Math.round(lastCompleted / plannedQty * 10000) / 100 : 0;

      items.push({
        ...o,
        current_step_name: currentStepName || (steps.length > 0 ? '已完成' : '无工序'),
        total_wip: totalWip,
        completion_rate: completionRate,
        step_count: steps.length
      });
    }

    res.json(success({
      items,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取WIP报告成功'));
  } catch (err) { next(err); }
};

// ==================== WIP报告：单张生产单各工序明细 ====================
export const getWipByOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderNo = req.params.orderNo;

    const [orders]: any = await sequelize.query(
      `SELECT production_order_number, item_number, item_name, specifications, basic_unit,
              planned_quantity, plan_status, ISNULL(inbound_quantity, 0) as inbound_quantity,
              ISNULL(inbound_status, '') as inbound_status
       FROM production_order WHERE production_order_number = :orderNo`,
      { replacements: { orderNo } }
    );
    if (!orders.length) {
      res.status(404).json({ success: false, message: '生产单不存在' });
      return;
    }
    const order = orders[0];
    const inboundQty = parseFloat(order.inbound_quantity) || 0;

    const [steps]: any = await sequelize.query(
      `SELECT process_task_number, step_number, standard_process_name,
              work_center_number, work_center_name,
              planned_quantity, ISNULL(completed_quantity, 0) as completed_quantity, task_status
       FROM process_task
       WHERE production_order_number = :orderNo
       ORDER BY step_number ASC`,
      { replacements: { orderNo } }
    );

    const stepsWithWip = steps.map((step: any, i: number) => {
      const cur = parseFloat(step.completed_quantity) || 0;
      const nextCompleted = (i < steps.length - 1)
        ? (parseFloat(steps[i + 1].completed_quantity) || 0)
        : inboundQty;
      const linesideWip = Math.max(cur - nextCompleted, 0);

      const prevCompleted = i > 0 ? (parseFloat(steps[i - 1].completed_quantity) || 0) : null;
      const waitingQuantity = prevCompleted !== null ? Math.max(prevCompleted - cur, 0) : 0;

      return {
        ...step,
        lineside_wip: linesideWip,
        waiting_quantity: waitingQuantity
      };
    });

    res.json(success({ order, steps: stepsWithWip }, '获取生产单WIP明细成功'));
  } catch (err) { next(err); }
};

// ==================== WIP报告：按工作中心 ====================
export const getWipByWorkCenter = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';

    // 查所有有活跃工序任务的工作中心
    let searchCondition = '';
    const replacements: any = {};
    if (search) {
      searchCondition = `AND (pt.work_center_number LIKE :search OR pt.work_center_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const [workCenters]: any = await sequelize.query(`
      SELECT pt.work_center_number, pt.work_center_name,
             COUNT(DISTINCT pt.production_order_number) as active_order_count,
             COUNT(DISTINCT pt.item_number) as item_type_count
      FROM process_task pt
      INNER JOIN production_order po ON pt.production_order_number = po.production_order_number
      WHERE po.plan_status IN (N'已派发', N'已备料', N'生产中', N'已完成')
        AND pt.task_status NOT IN (N'已关闭')
        AND pt.work_center_number IS NOT NULL AND pt.work_center_number != ''
        ${searchCondition}
      GROUP BY pt.work_center_number, pt.work_center_name
      ORDER BY pt.work_center_number
    `, { replacements });

    // 计算每个工作中心的线边在制总量
    const items = [];
    for (const wc of workCenters) {
      const [tasks]: any = await sequelize.query(`
        SELECT pt.process_task_number, pt.production_order_number, pt.step_number,
               ISNULL(pt.completed_quantity, 0) as completed_quantity,
               pt.item_number
        FROM process_task pt
        INNER JOIN production_order po ON pt.production_order_number = po.production_order_number
        WHERE pt.work_center_number = :wcNum
          AND po.plan_status IN (N'已派发', N'已备料', N'生产中', N'已完成')
          AND pt.task_status NOT IN (N'已关闭')
      `, { replacements: { wcNum: wc.work_center_number } });

      let totalWipQty = 0;
      for (const task of tasks) {
        const cur = parseFloat(task.completed_quantity) || 0;

        // 查下一道工序完成量
        const [nextSteps]: any = await sequelize.query(`
          SELECT TOP 1 ISNULL(completed_quantity, 0) as completed_quantity
          FROM process_task
          WHERE production_order_number = :orderNo AND step_number > :step
          ORDER BY step_number ASC
        `, { replacements: { orderNo: task.production_order_number, step: task.step_number } });

        let nextCompleted: number;
        if (nextSteps.length > 0) {
          nextCompleted = parseFloat(nextSteps[0].completed_quantity) || 0;
        } else {
          // 末道工序，减去已入库数量
          const [orderRows]: any = await sequelize.query(
            `SELECT ISNULL(inbound_quantity, 0) as inbound_quantity FROM production_order WHERE production_order_number = :orderNo`,
            { replacements: { orderNo: task.production_order_number } }
          );
          nextCompleted = parseFloat(orderRows[0]?.inbound_quantity) || 0;
        }

        totalWipQty += Math.max(cur - nextCompleted, 0);
      }

      items.push({
        work_center_number: wc.work_center_number,
        work_center_name: wc.work_center_name,
        active_order_count: wc.active_order_count,
        item_type_count: wc.item_type_count,
        total_wip_quantity: totalWipQty
      });
    }

    res.json(success({ items }, '获取工作中心WIP汇总成功'));
  } catch (err) { next(err); }
};

// ==================== WIP报告：单工作中心详情 ====================
export const getWipByWorkCenterDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const wcNumber = req.params.wcNumber;

    const [tasks]: any = await sequelize.query(`
      SELECT pt.process_task_number, pt.production_order_number, pt.step_number,
             pt.standard_process_name, pt.item_number, pt.item_name, pt.specifications,
             pt.planned_quantity, ISNULL(pt.completed_quantity, 0) as completed_quantity,
             pt.task_status, pt.work_center_number, pt.work_center_name
      FROM process_task pt
      INNER JOIN production_order po ON pt.production_order_number = po.production_order_number
      WHERE pt.work_center_number = :wcNum
        AND po.plan_status IN (N'已派发', N'已备料', N'生产中', N'已完成')
        AND pt.task_status NOT IN (N'已关闭')
      ORDER BY pt.production_order_number, pt.step_number
    `, { replacements: { wcNum: wcNumber } });

    const items = [];
    for (const task of tasks) {
      const cur = parseFloat(task.completed_quantity) || 0;

      const [nextSteps]: any = await sequelize.query(`
        SELECT TOP 1 ISNULL(completed_quantity, 0) as completed_quantity
        FROM process_task
        WHERE production_order_number = :orderNo AND step_number > :step
        ORDER BY step_number ASC
      `, { replacements: { orderNo: task.production_order_number, step: task.step_number } });

      let nextCompleted: number;
      if (nextSteps.length > 0) {
        nextCompleted = parseFloat(nextSteps[0].completed_quantity) || 0;
      } else {
        const [orderRows]: any = await sequelize.query(
          `SELECT ISNULL(inbound_quantity, 0) as inbound_quantity FROM production_order WHERE production_order_number = :orderNo`,
          { replacements: { orderNo: task.production_order_number } }
        );
        nextCompleted = parseFloat(orderRows[0]?.inbound_quantity) || 0;
      }

      const linesideWip = Math.max(cur - nextCompleted, 0);

      items.push({
        ...task,
        lineside_wip: linesideWip
      });
    }

    res.json(success({ items }, '获取工作中心WIP明细成功'));
  } catch (err) { next(err); }
};

// ==================== 线边仓流水查询 ====================
export const getLinesideTransactions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const transaction_type = (req.query.transaction_type as string) || '';
    const source_type = (req.query.source_type as string) || '';
    const work_center_number = (req.query.work_center_number as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(transaction_number LIKE :search OR production_order_number LIKE :search OR source_number LIKE :search OR item_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (transaction_type) {
      conditions.push(`transaction_type = :txnType`);
      replacements.txnType = transaction_type;
    }
    if (source_type) {
      conditions.push(`source_type = :srcType`);
      replacements.srcType = source_type;
    }
    if (work_center_number) {
      conditions.push(`work_center_number = :wcNum`);
      replacements.wcNum = work_center_number;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM lineside_inventory_transaction ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT id, transaction_number, transaction_type, source_type, source_number,
               production_order_number, item_number, item_name, specifications, basic_unit,
               step_number, work_center_number, work_center_name,
               quantity, direction, operator, operation_date, remark,
               ROW_NUMBER() OVER (ORDER BY id DESC) AS _row_num
        FROM lineside_inventory_transaction ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取线边仓流水成功'));
  } catch (err) { next(err); }
};

// ==================== WIP仪表板汇总 ====================
export const getWipSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // 活跃生产单数
    const [orderCount]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM production_order WHERE plan_status IN (N'已派发', N'已备料', N'生产中')`
    );

    // 活跃工作中心数
    const [wcCount]: any = await sequelize.query(`
      SELECT COUNT(DISTINCT pt.work_center_number) as cnt
      FROM process_task pt
      INNER JOIN production_order po ON pt.production_order_number = po.production_order_number
      WHERE po.plan_status IN (N'已派发', N'已备料', N'生产中')
        AND pt.task_status IN (N'未开始', N'进行中')
        AND pt.work_center_number IS NOT NULL AND pt.work_center_number != ''
    `);

    // 今日线边仓流水数
    const [todayTxn]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM lineside_inventory_transaction WHERE CAST(operation_date AS DATE) = CAST(GETDATE() AS DATE)`
    );

    res.json(success({
      active_orders: orderCount[0].cnt,
      active_work_centers: wcCount[0].cnt,
      today_transactions: todayTxn[0].cnt
    }, '获取WIP汇总成功'));
  } catch (err) { next(err); }
};

// ==================== 导出选中：WIP按生产单 ====================
export const exportWipByOrderSelected = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      res.status(400).json({ success: false, message: '请选择要导出的记录' }); return;
    }
    if (ids.length > 1000) {
      res.status(400).json({ success: false, message: '单次导出不能超过1000条' }); return;
    }
    const replacements: any = {};
    ids.forEach((id: any, i: number) => { replacements[`id${i}`] = id; });
    const placeholders = ids.map((_: any, i: number) => `:id${i}`).join(', ');

    const [orders]: any = await sequelize.query(`
      SELECT production_order_number, item_number, item_name, specifications,
             basic_unit, planned_quantity, plan_status,
             ISNULL(inbound_quantity, 0) as inbound_quantity
      FROM production_order
      WHERE production_order_number IN (${placeholders})
      ORDER BY production_order_number DESC
    `, { replacements });

    const items = [];
    for (const o of orders) {
      const [steps]: any = await sequelize.query(
        `SELECT step_number, standard_process_name,
                planned_quantity, ISNULL(completed_quantity, 0) as completed_quantity, task_status
         FROM process_task
         WHERE production_order_number = :orderNo
         ORDER BY step_number ASC`,
        { replacements: { orderNo: o.production_order_number } }
      );

      let totalWip = 0;
      let currentStepName = '';
      const inboundQty = parseFloat(o.inbound_quantity) || 0;
      const plannedQty = parseFloat(o.planned_quantity) || 0;

      for (let i = 0; i < steps.length; i++) {
        const cur = parseFloat(steps[i].completed_quantity) || 0;
        const nextCompleted = (i < steps.length - 1)
          ? (parseFloat(steps[i + 1].completed_quantity) || 0)
          : inboundQty;
        totalWip += Math.max(cur - nextCompleted, 0);

        if (!currentStepName && steps[i].task_status !== '已完成' && steps[i].task_status !== '已关闭') {
          currentStepName = steps[i].standard_process_name || `工序${steps[i].step_number}`;
        }
      }

      const lastCompleted = steps.length > 0 ? (parseFloat(steps[steps.length - 1].completed_quantity) || 0) : 0;
      const completionRate = plannedQty > 0 ? Math.round(lastCompleted / plannedQty * 10000) / 100 : 0;

      items.push({
        ...o,
        current_step_name: currentStepName || (steps.length > 0 ? '已完成' : '无工序'),
        total_wip: totalWip,
        completion_rate: completionRate
      });
    }

    const fields = [
      'production_order_number', 'item_number', 'item_name', 'specifications',
      'planned_quantity', 'current_step_name', 'total_wip', 'inbound_quantity',
      'completion_rate', 'plan_status'
    ];
    const headers = [
      '生产单编号', '产品编号', '产品名称', '规格',
      '计划数量', '当前工序', '总在制数量', '已入库',
      '完成率', '生产状态'
    ];
    exportToExcel(items, fields, headers, 'wip_by_order_selected', res);
  } catch (err) { next(err); }
};

// ==================== 导出选中：WIP按工作中心 ====================
export const exportWipByWorkCenterSelected = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      res.status(400).json({ success: false, message: '请选择要导出的记录' }); return;
    }
    if (ids.length > 1000) {
      res.status(400).json({ success: false, message: '单次导出不能超过1000条' }); return;
    }
    const replacements: any = {};
    ids.forEach((id: any, i: number) => { replacements[`id${i}`] = id; });
    const placeholders = ids.map((_: any, i: number) => `:id${i}`).join(', ');

    const [workCenters]: any = await sequelize.query(`
      SELECT pt.work_center_number, pt.work_center_name,
             COUNT(DISTINCT pt.production_order_number) as active_order_count,
             COUNT(DISTINCT pt.item_number) as item_type_count
      FROM process_task pt
      INNER JOIN production_order po ON pt.production_order_number = po.production_order_number
      WHERE po.plan_status IN (N'已派发', N'已备料', N'生产中', N'已完成')
        AND pt.task_status NOT IN (N'已关闭')
        AND pt.work_center_number IN (${placeholders})
      GROUP BY pt.work_center_number, pt.work_center_name
      ORDER BY pt.work_center_number
    `, { replacements });

    const items = [];
    for (const wc of workCenters) {
      const [tasks]: any = await sequelize.query(`
        SELECT pt.production_order_number, pt.step_number,
               ISNULL(pt.completed_quantity, 0) as completed_quantity
        FROM process_task pt
        INNER JOIN production_order po ON pt.production_order_number = po.production_order_number
        WHERE pt.work_center_number = :wcNum
          AND po.plan_status IN (N'已派发', N'已备料', N'生产中', N'已完成')
          AND pt.task_status NOT IN (N'已关闭')
      `, { replacements: { wcNum: wc.work_center_number } });

      let totalWipQty = 0;
      for (const task of tasks) {
        const cur = parseFloat(task.completed_quantity) || 0;
        const [nextSteps]: any = await sequelize.query(`
          SELECT TOP 1 ISNULL(completed_quantity, 0) as completed_quantity
          FROM process_task
          WHERE production_order_number = :orderNo AND step_number > :step
          ORDER BY step_number ASC
        `, { replacements: { orderNo: task.production_order_number, step: task.step_number } });

        let nextCompleted: number;
        if (nextSteps.length > 0) {
          nextCompleted = parseFloat(nextSteps[0].completed_quantity) || 0;
        } else {
          const [orderRows]: any = await sequelize.query(
            `SELECT ISNULL(inbound_quantity, 0) as inbound_quantity FROM production_order WHERE production_order_number = :orderNo`,
            { replacements: { orderNo: task.production_order_number } }
          );
          nextCompleted = parseFloat(orderRows[0]?.inbound_quantity) || 0;
        }
        totalWipQty += Math.max(cur - nextCompleted, 0);
      }

      items.push({
        work_center_number: wc.work_center_number,
        work_center_name: wc.work_center_name,
        active_order_count: wc.active_order_count,
        total_wip_quantity: totalWipQty,
        item_type_count: wc.item_type_count
      });
    }

    const fields = [
      'work_center_number', 'work_center_name', 'active_order_count',
      'total_wip_quantity', 'item_type_count'
    ];
    const headers = [
      '工作中心编号', '工作中心名称', '活跃订单数',
      '线边在制总量', '在制产品种类'
    ];
    exportToExcel(items, fields, headers, 'wip_by_work_center_selected', res);
  } catch (err) { next(err); }
};

// ==================== 导出选中：线边仓流水 ====================
export const exportLinesideTransactionsSelected = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      res.status(400).json({ success: false, message: '请选择要导出的记录' }); return;
    }
    if (ids.length > 1000) {
      res.status(400).json({ success: false, message: '单次导出不能超过1000条' }); return;
    }
    const replacements: any = {};
    ids.forEach((id: any, i: number) => { replacements[`id${i}`] = id; });
    const placeholders = ids.map((_: any, i: number) => `:id${i}`).join(', ');

    const [items]: any = await sequelize.query(`
      SELECT transaction_number, transaction_type, source_type, source_number,
             production_order_number, item_name, step_number, work_center_name,
             quantity, direction, operator, operation_date
      FROM lineside_inventory_transaction
      WHERE id IN (${placeholders})
      ORDER BY id DESC
    `, { replacements });

    const fields = [
      'transaction_number', 'transaction_type', 'source_type', 'source_number',
      'production_order_number', 'item_name', 'step_number', 'work_center_name',
      'quantity', 'direction', 'operator', 'operation_date'
    ];
    const headers = [
      '流水号', '类型', '来源', '来源单号',
      '生产单号', '产品名称', '工序序号', '工作中心',
      '数量', '方向', '操作人', '时间'
    ];
    exportToExcel(items, fields, headers, 'lineside_transactions_selected', res);
  } catch (err) { next(err); }
};
