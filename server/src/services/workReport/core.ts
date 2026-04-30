/**
 * 报工单服务 - 核心CRUD操作
 * 从 workReport.service.ts 拆分
 */
import sequelize from '@/config/database';
import dayjs from 'dayjs';
import { BusinessError } from '@/shared/errors/BusinessError';
import { generateWRNumber } from '@/services/documentNumber.service';
import { logWorkReportLinesideMovement, logWorkReportReverseLinesideMovement } from '@/services/linesideMovement.service';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { withTransaction } from '@/shared/db/withTransaction';
import { syncProductionStatus } from '@/services/salesOrderSync.service';
import { emitAsync } from '@/shared/eventBus';
import { EVENT_NAMES } from '@/shared/events';
import { syncTaskCompletion } from './taskSync';

// ==================== 创建报工单 ====================

export const createWorkReport = async (params: {
  process_task_number: string;
  qualified_quantity: number;
  unqualified_quantity?: number;
  report_date?: string;
  schedules_id?: string;
  schedules_name?: string;
  team_number?: string;
  team_name?: string;
  operator_number?: string;
  operator_name?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  unqualified_reason?: string;
  defect_class_number?: string;
  defect_class_name?: string;
  defect_number?: string;
  defect_name?: string;
  remark?: string;
}, user: { username: string }): Promise<{ workReportNumber: string }> => {
  return await withTransaction(async (transaction) => {
    const b = params;

    if (!b.process_task_number) throw new BusinessError(400, '工序任务编号不能为空');
    if (!b.qualified_quantity && b.qualified_quantity !== 0) throw new BusinessError(400, '合格数量不能为空');

    // 查询工序任务
    const [tasks]: any = await sequelize.query(
      `SELECT process_task_number, production_order_number, step_number, standard_process_name, item_number, item_name, specifications, basic_unit, work_center_number, work_center_name, planned_quantity, completed_quantity, excess_reporting_ratio, task_status, approval_status FROM process_task WHERE process_task_number = :taskNo`,
      { replacements: { taskNo: b.process_task_number }, transaction }
    );
    if (!tasks.length) throw new BusinessError(404, '工序任务不存在');
    const task = tasks[0];

    if (task.approval_status !== '已审批') throw new BusinessError(400, '工序任务未审批，不能报工');
    if (task.task_status === '已完成' || task.task_status === '已关闭') throw new BusinessError(400, `工序任务状态为"${task.task_status}"，不能报工`);

    // === 物料门控校验 ===
    if (task.production_order_number) {
      const [orderStatusRows]: any = await sequelize.query(
        `SELECT plan_status FROM production_order WHERE production_order_number = :orderNo`,
        { replacements: { orderNo: task.production_order_number }, transaction }
      );
      const planStatus = orderStatusRows[0]?.plan_status || '';
      const [firstStepRows]: any = await sequelize.query(
        `SELECT MIN(step_number) as first_step FROM process_task WHERE production_order_number = :orderNo`,
        { replacements: { orderNo: task.production_order_number }, transaction }
      );
      const firstStep = firstStepRows[0]?.first_step;
      const isFirstStep = firstStep != null && task.step_number === firstStep;

      if (isFirstStep && (planStatus === '未开始' || planStatus === '已派发')) {
        throw new BusinessError(400, '首道工序报工需先完成首道工序物料领料（当前状态：' + planStatus + '）');
      }
      if (!isFirstStep) {
        const [matGateRows]: any = await sequelize.query(`
          SELECT COUNT(*) as mat_count,
                 SUM(CASE WHEN ISNULL(mpd.issued_quantity, 0) > 0 THEN 1 ELSE 0 END) as issued_count
          FROM material_preparation_detail mpd
          INNER JOIN material_preparation mp ON mpd.preparation_number = mp.preparation_number
          WHERE mp.production_order_number = :orderNo AND mpd.step_number = :stepNum
        `, { replacements: { orderNo: task.production_order_number, stepNum: task.step_number }, transaction });
        const matCount = parseInt(matGateRows[0]?.mat_count) || 0;
        const issuedCount = parseInt(matGateRows[0]?.issued_count) || 0;
        if (matCount > 0 && issuedCount === 0) {
          throw new BusinessError(400, `工序 ${task.step_number} - ${task.standard_process_name || ''} 有 ${matCount} 种物料尚未领料，请先完成该工序的备料`);
        }
      }
    }

    // === 委外工序阻断校验 ===
    // 上一道工序如果是委外工序，必须等委外回收入库完成后才能报工
    if (task.production_order_number) {
      const [prevOutsourcingRows]: any = await sequelize.query(`
        SELECT pt.process_task_number, pt.step_number, pt.process_type,
               oo.outsourcing_order_number, oo.order_status
        FROM process_task pt
        LEFT JOIN outsourcing_order oo ON pt.process_task_number = oo.process_task_number
        WHERE pt.production_order_number = :orderNo
          AND pt.step_number = :currentStep - 1
      `, { replacements: { orderNo: task.production_order_number, currentStep: task.step_number }, transaction });

      if (prevOutsourcingRows.length && prevOutsourcingRows[0].process_type === '外协') {
        const ooStatus = prevOutsourcingRows[0].order_status;
        if (ooStatus !== '已完成') {
          throw new BusinessError(403, `上一道工序「${prevOutsourcingRows[0].step_number}」为委外工序，委外订单状态为"${ooStatus}"，需等待委外回收入库完成后方可报工`);
        }
      }
    }

    // 超额校验
    const excessRatio = parseFloat(task.excess_reporting_ratio) || 0;
    let actualDaily = 0;
    if (task.production_order_number) {
      const [orderRows]: any = await sequelize.query(`SELECT actual_daily_output FROM production_order WHERE production_order_number = :orderNo`, { replacements: { orderNo: task.production_order_number }, transaction });
      actualDaily = parseFloat(orderRows[0]?.actual_daily_output) || 0;
    }
    const baseQty = actualDaily > 0 ? actualDaily : parseFloat(task.planned_quantity);
    const maxAllowed = baseQty * (1 + excessRatio / 100);
    const completedQty = parseFloat(task.completed_quantity) || 0;
    const maxReportable = maxAllowed - completedQty;
    const qualifiedQty = Number(b.qualified_quantity) || 0;
    const unqualifiedQty = Number(b.unqualified_quantity) || 0;

    if (qualifiedQty + unqualifiedQty > maxReportable) {
      throw new BusinessError(400, `合格数(${qualifiedQty})+不合格数(${unqualifiedQty})=${qualifiedQty + unqualifiedQty}，超过最大可报工量(${maxReportable.toFixed(4)})。实际班产${actualDaily || task.planned_quantity}，已完成${completedQty}，超额比例${excessRatio}%`);
    }

    // 跨工序数量验证：中间工序可报数 = 前道完成 - 本道完成
    if (task.production_order_number) {
      const [allSteps]: any = await sequelize.query(
        `SELECT process_task_number, step_number, completed_quantity, standard_process_name FROM process_task WHERE production_order_number = :orderNo ORDER BY step_number ASC`,
        { replacements: { orderNo: task.production_order_number }, transaction }
      );
      if (allSteps.length > 2) {
        const currentIdx = allSteps.findIndex((s: any) => s.process_task_number === task.process_task_number);
        if (currentIdx > 0 && currentIdx < allSteps.length - 1) {
          const prevStep = allSteps[currentIdx - 1];
          const prevCompleted = parseFloat(prevStep.completed_quantity) || 0;
          const crossMax = prevCompleted - completedQty;
          if (qualifiedQty > crossMax) {
            throw new BusinessError(400, `中间工序报工受限：合格数量(${qualifiedQty})超过可报数量(${crossMax})。前道工序「${prevStep.standard_process_name || prevStep.step_number}」完成(${prevCompleted}) - 本道完成(${completedQty}) = ${crossMax}`);
          }
        }
      }
    }

    // 实际班产上限验证：每道工序报工汇总数不能大于实际班产数*(1+超额报工比例)
    if (task.production_order_number) {
      const [orderRows]: any = await sequelize.query(
        `SELECT actual_daily_output FROM production_order WHERE production_order_number = :orderNo`,
        { replacements: { orderNo: task.production_order_number }, transaction }
      );
      const actualDailyOutput = parseFloat(orderRows[0]?.actual_daily_output) || 0;
      if (actualDailyOutput > 0) {
        const maxByDaily = actualDailyOutput * (1 + excessRatio / 100);
        const [dailyReportedRows]: any = await sequelize.query(
          `SELECT ISNULL(SUM(ISNULL(qualified_quantity,0) + ISNULL(unqualified_quantity,0)), 0) as total_reported FROM work_report WHERE process_task_number = :taskNo`,
          { replacements: { taskNo: task.process_task_number }, transaction }
        );
        const dailyTotalReported = parseFloat(dailyReportedRows[0]?.total_reported) || 0;
        const dailyTotalAfter = dailyTotalReported + qualifiedQty + unqualifiedQty;
        if (dailyTotalAfter > maxByDaily) {
          throw new BusinessError(400, `报工总量超限：本次(合格${qualifiedQty}+不合格${unqualifiedQty}) + 已报工(${dailyTotalReported}) = ${dailyTotalAfter}，超过实际班产(${actualDailyOutput})×(1+${excessRatio}%) = ${maxByDaily}`);
        }
      }
    }

    // === 检验门控校验（下道工序报工前检查上道工序检验状态）===
    if (task.production_order_number) {
      const [prevStepRows]: any = await sequelize.query(
        `SELECT TOP 1 process_task_number, step_number, inspect_status, standard_process_name FROM process_task WHERE production_order_number = :orderNo AND step_number < :step ORDER BY step_number DESC`,
        { replacements: { orderNo: task.production_order_number, step: task.step_number }, transaction }
      );
      if (prevStepRows.length > 0) {
        const prev = prevStepRows[0];
        const allowedStatuses = ['无需检', '检验合格', '已处理'];
        if (!allowedStatuses.includes(prev.inspect_status)) {
          throw new BusinessError(400, `上道工序「${prev.standard_process_name || prev.step_number}」检验状态为「${prev.inspect_status || '待检验'}」，请先完成检验或处理`);
        }
      }
    }

    const totalQty = qualifiedQty + unqualifiedQty;
    const cumulativeQty = completedQty + qualifiedQty;

    // 计算工时
    let actualHours = 0;
    if (b.actual_start_time && b.actual_end_time) {
      const start = dayjs(b.actual_start_time);
      const end = dayjs(b.actual_end_time);
      if (start.isValid() && end.isValid()) {
        actualHours = Math.round(end.diff(start, 'minute') / 60 * 100) / 100;
      }
    }

    const wrNumber = await generateWRNumber(transaction);
    const now = dayjs().format('YYYY/MM/DD HH:mm');

    await sequelize.query(`
      INSERT INTO work_report (work_report_number, process_task_number, production_order_number, step_number, standard_process_name, item_number, item_name, specifications, basic_unit, work_center_number, work_center_name, planned_quantity, qualified_quantity, unqualified_quantity, total_quantity, cumulative_quantity, report_date, schedules_id, schedules_name, team_number, team_name, operator_number, operator_name, actual_start_time, actual_end_time, actual_hours, unqualified_reason, defect_class_number, defect_class_name, defect_number, defect_name, approval_status, remark, creation_date, creation_man)
      VALUES (:work_report_number, :process_task_number, :production_order_number, :step_number, :standard_process_name, :item_number, :item_name, :specifications, :basic_unit, :work_center_number, :work_center_name, :planned_quantity, :qualified_quantity, :unqualified_quantity, :total_quantity, :cumulative_quantity, :report_date, :schedules_id, :schedules_name, :team_number, :team_name, :operator_number, :operator_name, :actual_start_time, :actual_end_time, :actual_hours, :unqualified_reason, :defect_class_number, :defect_class_name, :defect_number, :defect_name, N'草稿', :remark, :creation_date, :creation_man)
    `, {
      replacements: {
        work_report_number: wrNumber,
        process_task_number: task.process_task_number,
        production_order_number: task.production_order_number || '',
        step_number: task.step_number,
        standard_process_name: task.standard_process_name || '',
        item_number: task.item_number || '',
        item_name: task.item_name || '',
        specifications: task.specifications || '',
        basic_unit: task.basic_unit || '',
        work_center_number: task.work_center_number || '',
        work_center_name: task.work_center_name || '',
        planned_quantity: parseFloat(task.planned_quantity) || 0,
        qualified_quantity: qualifiedQty,
        unqualified_quantity: unqualifiedQty,
        total_quantity: totalQty,
        cumulative_quantity: cumulativeQty,
        report_date: b.report_date || dayjs().format('YYYY/MM/DD'),
        schedules_id: b.schedules_id || '',
        schedules_name: b.schedules_name || '',
        team_number: b.team_number || '',
        team_name: b.team_name || '',
        operator_number: b.operator_number || '',
        operator_name: b.operator_name || '',
        actual_start_time: b.actual_start_time || '',
        actual_end_time: b.actual_end_time || '',
        actual_hours: actualHours,
        unqualified_reason: b.defect_name ? ((b.defect_class_name || '') + '/' + b.defect_name) : (b.unqualified_reason || ''),
        defect_class_number: b.defect_class_number || '',
        defect_class_name: b.defect_class_name || '',
        defect_number: b.defect_number || '',
        defect_name: b.defect_name || '',
        remark: b.remark || '',
        creation_date: now,
        creation_man: user?.username || ''
      },
      transaction
    });

    // 发布报工创建事件，由订阅者处理工序同步、线边仓流转、检验创建
    await emitAsync(EVENT_NAMES.WORK_REPORT_CREATED, {
      process_task_number: task.process_task_number,
      work_report_number: wrNumber,
      qualified_quantity: qualifiedQty,
      unqualified_quantity: unqualifiedQty,
      total_quantity: qualifiedQty + unqualifiedQty,
      username: user?.username || '',
      transaction,
    });

    return { workReportNumber: wrNumber };
  });
};

// ==================== 移动端: 快速报工（简化参数自动填充） ====================

export const quickReport = async (params: {
  process_task_number: string;
  qualified_quantity: number;
  unqualified_quantity?: number;
  report_date?: string;
  schedules_id?: string;
  schedules_name?: string;
  team_number?: string;
  team_name?: string;
  operator_number?: string;
  operator_name?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  unqualified_reason?: string;
  defect_class_number?: string;
  defect_class_name?: string;
  defect_number?: string;
  defect_name?: string;
  remark?: string;
}, user: { username: string }): Promise<{ workReportNumber: string }> => {
  return await withTransaction(async (transaction) => {
    const b = params;

    if (!b.process_task_number) throw new BusinessError(400, '工序任务编号不能为空');
    if (!b.qualified_quantity && b.qualified_quantity !== 0) throw new BusinessError(400, '合格数量不能为空');

    // 查询工序任务，自动填充字段
    const [tasks]: any = await sequelize.query(
      `SELECT process_task_number, production_order_number, step_number, standard_process_name, item_number, item_name, specifications, basic_unit, work_center_number, work_center_name, planned_quantity, completed_quantity, excess_reporting_ratio, task_status, approval_status FROM process_task WHERE process_task_number = :taskNo`,
      { replacements: { taskNo: b.process_task_number }, transaction }
    );
    if (!tasks.length) throw new BusinessError(404, '工序任务不存在');
    const task = tasks[0];

    if (task.approval_status !== '已审批') throw new BusinessError(400, '工序任务未审批，不能报工');
    if (task.task_status === '已完成' || task.task_status === '已关闭') throw new BusinessError(400, `工序任务状态为"${task.task_status}"，不能报工`);

    // === 物料门控校验 ===
    if (task.production_order_number) {
      const [orderStatusRows]: any = await sequelize.query(
        `SELECT plan_status FROM production_order WHERE production_order_number = :orderNo`,
        { replacements: { orderNo: task.production_order_number }, transaction }
      );
      const planStatus = orderStatusRows[0]?.plan_status || '';
      const [firstStepRows]: any = await sequelize.query(
        `SELECT MIN(step_number) as first_step FROM process_task WHERE production_order_number = :orderNo`,
        { replacements: { orderNo: task.production_order_number }, transaction }
      );
      const firstStep = firstStepRows[0]?.first_step;
      const isFirstStep = firstStep != null && task.step_number === firstStep;

      if (isFirstStep && (planStatus === '未开始' || planStatus === '已派发')) {
        throw new BusinessError(400, '首道工序报工需先完成首道工序物料领料（当前状态：' + planStatus + '）');
      }
      if (!isFirstStep) {
        const [matGateRows]: any = await sequelize.query(`
          SELECT COUNT(*) as mat_count,
                 SUM(CASE WHEN ISNULL(mpd.issued_quantity, 0) > 0 THEN 1 ELSE 0 END) as issued_count
          FROM material_preparation_detail mpd
          INNER JOIN material_preparation mp ON mpd.preparation_number = mp.preparation_number
          WHERE mp.production_order_number = :orderNo AND mpd.step_number = :stepNum
        `, { replacements: { orderNo: task.production_order_number, stepNum: task.step_number }, transaction });
        const matCount = parseInt(matGateRows[0]?.mat_count) || 0;
        const issuedCount = parseInt(matGateRows[0]?.issued_count) || 0;
        if (matCount > 0 && issuedCount === 0) {
          throw new BusinessError(400, `工序 ${task.step_number} - ${task.standard_process_name || ''} 有 ${matCount} 种物料尚未领料，请先完成该工序的备料`);
        }
      }
    }

    // === 委外工序阻断校验（快速报工） ===
    if (task.production_order_number) {
      const [prevOutsourcingRows]: any = await sequelize.query(`
        SELECT pt.process_task_number, pt.step_number, pt.process_type,
               oo.outsourcing_order_number, oo.order_status
        FROM process_task pt
        LEFT JOIN outsourcing_order oo ON pt.process_task_number = oo.process_task_number
        WHERE pt.production_order_number = :orderNo
          AND pt.step_number = :currentStep - 1
      `, { replacements: { orderNo: task.production_order_number, currentStep: task.step_number }, transaction });

      if (prevOutsourcingRows.length && prevOutsourcingRows[0].process_type === '外协') {
        const ooStatus = prevOutsourcingRows[0].order_status;
        if (ooStatus !== '已完成') {
          throw new BusinessError(403, `上一道工序「${prevOutsourcingRows[0].step_number}」为委外工序，委外订单状态为"${ooStatus}"，需等待委外回收入库完成后方可报工`);
        }
      }
    }

    const excessRatio = parseFloat(task.excess_reporting_ratio) || 0;
    let actualDailyForMax = 0;
    if (task.production_order_number) {
      const [orderRowsForMax]: any = await sequelize.query(`SELECT actual_daily_output FROM production_order WHERE production_order_number = :orderNo`, { replacements: { orderNo: task.production_order_number }, transaction });
      actualDailyForMax = parseFloat(orderRowsForMax[0]?.actual_daily_output) || 0;
    }
    const baseQtyForMax = actualDailyForMax > 0 ? actualDailyForMax : parseFloat(task.planned_quantity);
    const maxAllowed = baseQtyForMax * (1 + excessRatio / 100);
    const completedQty = parseFloat(task.completed_quantity) || 0;
    const maxReportable = maxAllowed - completedQty;
    const qualifiedQty = Number(b.qualified_quantity) || 0;
    const unqualifiedQty = Number(b.unqualified_quantity) || 0;

    if (qualifiedQty + unqualifiedQty > maxReportable) {
      throw new BusinessError(400, `合格数(${qualifiedQty})+不合格数(${unqualifiedQty})=${qualifiedQty + unqualifiedQty}，超过最大可报工量(${maxReportable.toFixed(4)})`);
    }

    // 跨工序数量验证：中间工序可报数 = 前道完成 - 本道完成
    if (task.production_order_number) {
      const [allSteps]: any = await sequelize.query(
        `SELECT process_task_number, step_number, completed_quantity, standard_process_name FROM process_task WHERE production_order_number = :orderNo ORDER BY step_number ASC`,
        { replacements: { orderNo: task.production_order_number }, transaction }
      );
      if (allSteps.length > 2) {
        const currentIdx = allSteps.findIndex((s: any) => s.process_task_number === task.process_task_number);
        if (currentIdx > 0 && currentIdx < allSteps.length - 1) {
          const prevStep = allSteps[currentIdx - 1];
          const prevCompleted = parseFloat(prevStep.completed_quantity) || 0;
          const crossMax = prevCompleted - completedQty;
          if (qualifiedQty > crossMax) {
            throw new BusinessError(400, `中间工序报工受限：合格数量(${qualifiedQty})超过可报数量(${crossMax})。前道工序「${prevStep.standard_process_name || prevStep.step_number}」完成(${prevCompleted}) - 本道完成(${completedQty}) = ${crossMax}`);
          }
        }
      }
    }

    // 实际班产上限验证：每道工序报工汇总数不能大于实际班产数*(1+超额报工比例)
    if (task.production_order_number) {
      const [orderRows]: any = await sequelize.query(
        `SELECT actual_daily_output FROM production_order WHERE production_order_number = :orderNo`,
        { replacements: { orderNo: task.production_order_number }, transaction }
      );
      const actualDailyOutput = parseFloat(orderRows[0]?.actual_daily_output) || 0;
      if (actualDailyOutput > 0) {
        const maxByDaily = actualDailyOutput * (1 + excessRatio / 100);
        const [dailyReportedRows]: any = await sequelize.query(
          `SELECT ISNULL(SUM(ISNULL(qualified_quantity,0) + ISNULL(unqualified_quantity,0)), 0) as total_reported FROM work_report WHERE process_task_number = :taskNo`,
          { replacements: { taskNo: task.process_task_number }, transaction }
        );
        const dailyTotalReported = parseFloat(dailyReportedRows[0]?.total_reported) || 0;
        const dailyTotalAfter = dailyTotalReported + qualifiedQty + unqualifiedQty;
        if (dailyTotalAfter > maxByDaily) {
          throw new BusinessError(400, `报工总量超限：本次(合格${qualifiedQty}+不合格${unqualifiedQty}) + 已报工(${dailyTotalReported}) = ${dailyTotalAfter}，超过实际班产(${actualDailyOutput})×(1+${excessRatio}%) = ${maxByDaily}`);
        }
      }
    }

    const totalQty = qualifiedQty + unqualifiedQty;
    const cumulativeQty = completedQty + qualifiedQty;

    let actualHours = 0;
    if (b.actual_start_time && b.actual_end_time) {
      const start = dayjs(b.actual_start_time);
      const end = dayjs(b.actual_end_time);
      if (start.isValid() && end.isValid()) {
        actualHours = Math.round(end.diff(start, 'minute') / 60 * 100) / 100;
      }
    }

    // 自动填充班次/班组/操作员名称
    let schedulesName = b.schedules_name || '';
    if (b.schedules_id && !schedulesName) {
      const [schRows]: any = await sequelize.query(`SELECT TOP 1 schedules_name FROM schedules WHERE schedules_id = :id`, { replacements: { id: b.schedules_id }, transaction });
      if (schRows.length) schedulesName = schRows[0].schedules_name || '';
    }
    let operatorName = b.operator_name || '';
    if (b.operator_number && !operatorName) {
      const [empRows]: any = await sequelize.query(`SELECT TOP 1 employee_name FROM employee WHERE employee_number = :id`, { replacements: { id: b.operator_number }, transaction });
      if (empRows.length) operatorName = empRows[0].employee_name || '';
    }

    const wrNumber = await generateWRNumber(transaction);
    const now = dayjs().format('YYYY/MM/DD HH:mm');

    await sequelize.query(`
      INSERT INTO work_report (work_report_number, process_task_number, production_order_number, step_number, standard_process_name, item_number, item_name, specifications, basic_unit, work_center_number, work_center_name, planned_quantity, qualified_quantity, unqualified_quantity, total_quantity, cumulative_quantity, report_date, schedules_id, schedules_name, team_number, team_name, operator_number, operator_name, actual_start_time, actual_end_time, actual_hours, unqualified_reason, defect_class_number, defect_class_name, defect_number, defect_name, approval_status, remark, creation_date, creation_man)
      VALUES (:work_report_number, :process_task_number, :production_order_number, :step_number, :standard_process_name, :item_number, :item_name, :specifications, :basic_unit, :work_center_number, :work_center_name, :planned_quantity, :qualified_quantity, :unqualified_quantity, :total_quantity, :cumulative_quantity, :report_date, :schedules_id, :schedules_name, :team_number, :team_name, :operator_number, :operator_name, :actual_start_time, :actual_end_time, :actual_hours, :unqualified_reason, :defect_class_number, :defect_class_name, :defect_number, :defect_name, N'草稿', :remark, :creation_date, :creation_man)
    `, {
      replacements: {
        work_report_number: wrNumber,
        process_task_number: task.process_task_number,
        production_order_number: task.production_order_number || '',
        step_number: task.step_number,
        standard_process_name: task.standard_process_name || '',
        item_number: task.item_number || '',
        item_name: task.item_name || '',
        specifications: task.specifications || '',
        basic_unit: task.basic_unit || '',
        work_center_number: task.work_center_number || '',
        work_center_name: task.work_center_name || '',
        planned_quantity: parseFloat(task.planned_quantity) || 0,
        qualified_quantity: qualifiedQty,
        unqualified_quantity: unqualifiedQty,
        total_quantity: totalQty,
        cumulative_quantity: cumulativeQty,
        report_date: b.report_date || dayjs().format('YYYY/MM/DD'),
        schedules_id: b.schedules_id || '',
        schedules_name: schedulesName,
        team_number: b.team_number || '',
        team_name: b.team_name || '',
        operator_number: b.operator_number || '',
        operator_name: operatorName,
        actual_start_time: b.actual_start_time || '',
        actual_end_time: b.actual_end_time || '',
        actual_hours: actualHours,
        unqualified_reason: b.defect_name ? ((b.defect_class_name || '') + '/' + b.defect_name) : (b.unqualified_reason || ''),
        defect_class_number: b.defect_class_number || '',
        defect_class_name: b.defect_class_name || '',
        defect_number: b.defect_number || '',
        defect_name: b.defect_name || '',
        remark: b.remark || '',
        creation_date: now,
        creation_man: user?.username || ''
      },
      transaction
    });

    // 发布报工创建事件，由订阅者处理工序同步、线边仓流转、检验创建
    await emitAsync(EVENT_NAMES.WORK_REPORT_CREATED, {
      process_task_number: task.process_task_number,
      work_report_number: wrNumber,
      qualified_quantity: qualifiedQty,
      unqualified_quantity: unqualifiedQty,
      total_quantity: qualifiedQty + unqualifiedQty,
      username: user?.username || '',
      transaction,
    });

    return { workReportNumber: wrNumber };
  });
};

// ==================== 编辑报工单 ====================

export const updateWorkReport = async (workReportNumber: string, params: {
  qualified_quantity?: number;
  unqualified_quantity?: number;
  report_date?: string;
  schedules_id?: string;
  schedules_name?: string;
  team_number?: string;
  team_name?: string;
  operator_number?: string;
  operator_name?: string;
  actual_start_time?: string;
  actual_end_time?: string;
  unqualified_reason?: string;
  defect_class_number?: string;
  defect_class_name?: string;
  defect_number?: string;
  defect_name?: string;
  remark?: string;
}, user: { username: string }): Promise<void> => {
  return await withTransaction(async (transaction) => {
    const [chk]: any = await sequelize.query(`SELECT approval_status, process_task_number, qualified_quantity FROM work_report WHERE work_report_number = :id`, { replacements: { id: workReportNumber }, transaction });
    if (!chk.length) throw new BusinessError(404, '报工单不存在');
    if (chk[0].approval_status !== ORDER_STATUS.DRAFT) throw new BusinessError(403, '已提交或已审批的报工单不允许编辑');

    const oldQualifiedQty = parseFloat(chk[0].qualified_quantity) || 0;
    const taskNo = chk[0].process_task_number;

    const b = params;
    const qualifiedQty = Number(b.qualified_quantity) || 0;
    const unqualifiedQty = Number(b.unqualified_quantity) || 0;
    const totalQty = qualifiedQty + unqualifiedQty;

    let actualHours = 0;
    if (b.actual_start_time && b.actual_end_time) {
      const start = dayjs(b.actual_start_time);
      const end = dayjs(b.actual_end_time);
      if (start.isValid() && end.isValid()) {
        actualHours = Math.round(end.diff(start, 'minute') / 60 * 100) / 100;
      }
    }

    await sequelize.query(`
      UPDATE work_report SET
        qualified_quantity = :qualified_quantity, unqualified_quantity = :unqualified_quantity,
        total_quantity = :total_quantity,
        report_date = :report_date,
        schedules_id = :schedules_id, schedules_name = :schedules_name,
        team_number = :team_number, team_name = :team_name,
        operator_number = :operator_number, operator_name = :operator_name,
        actual_start_time = :actual_start_time, actual_end_time = :actual_end_time,
        actual_hours = :actual_hours,
        unqualified_reason = :unqualified_reason,
        defect_class_number = :defect_class_number, defect_class_name = :defect_class_name,
        defect_number = :defect_number, defect_name = :defect_name,
        remark = :remark
      WHERE work_report_number = :id
    `, {
      replacements: {
        id: workReportNumber,
        qualified_quantity: qualifiedQty,
        unqualified_quantity: unqualifiedQty,
        total_quantity: totalQty,
        report_date: b.report_date || '',
        schedules_id: b.schedules_id || '',
        schedules_name: b.schedules_name || '',
        team_number: b.team_number || '',
        team_name: b.team_name || '',
        operator_number: b.operator_number || '',
        operator_name: b.operator_name || '',
        actual_start_time: b.actual_start_time || '',
        actual_end_time: b.actual_end_time || '',
        actual_hours: actualHours,
        unqualified_reason: b.defect_name ? ((b.defect_class_name || '') + '/' + b.defect_name) : (b.unqualified_reason || ''),
        defect_class_number: b.defect_class_number || '',
        defect_class_name: b.defect_class_name || '',
        defect_number: b.defect_number || '',
        defect_name: b.defect_name || '',
        remark: b.remark || ''
      },
      transaction
    });

    // 按差值同步工序任务完成数量
    const delta = qualifiedQty - oldQualifiedQty;
    if (taskNo && delta !== 0) {
      await syncTaskCompletion(taskNo, delta, transaction);
    }

    // 线边仓流转：先冲销旧量，再记录新量
    if (taskNo && oldQualifiedQty > 0) {
      await logWorkReportReverseLinesideMovement(taskNo, oldQualifiedQty, workReportNumber, user?.username || '', transaction);
    }
    if (taskNo && qualifiedQty > 0) {
      await logWorkReportLinesideMovement(taskNo, qualifiedQty, workReportNumber, user?.username || '', transaction);
    }
  });
};

// ==================== 删除报工单 ====================

export const deleteWorkReport = async (workReportNumber: string, user: { username: string }): Promise<void> => {
  return await withTransaction(async (transaction) => {
    const [chk]: any = await sequelize.query(`SELECT approval_status, process_task_number, qualified_quantity FROM work_report WHERE work_report_number = :id`, { replacements: { id: workReportNumber }, transaction });
    if (!chk.length) throw new BusinessError(404, '报工单不存在');
    if (chk[0].approval_status !== ORDER_STATUS.DRAFT) throw new BusinessError(403, '已提交或已审批的报工单不允许删除');

    const taskNo = chk[0].process_task_number;
    const qty = parseFloat(chk[0].qualified_quantity) || 0;

    await sequelize.query(`DELETE FROM work_report WHERE work_report_number = :id`, { replacements: { id: workReportNumber }, transaction });

    // 回退工序任务完成数量
    if (taskNo && qty > 0) {
      await syncTaskCompletion(taskNo, -qty, transaction);
    }

    // 线边仓流转冲销
    if (taskNo && qty > 0) {
      await logWorkReportReverseLinesideMovement(taskNo, qty, workReportNumber, user?.username || '', transaction);
    }
  });
};

// ==================== 完成生产单：报工最后一道工序 + 确认所有工序完成 ====================

export const completeOrderReport = async (params: {
  production_order_number: string;
  qualified_quantity: number;
  unqualified_quantity?: number;
  report_date?: string;
  schedules_id?: string;
  schedules_name?: string;
  team_number?: string;
  team_name?: string;
  operator_number?: string;
  operator_name?: string;
  unqualified_reason?: string;
  defect_class_number?: string;
  defect_class_name?: string;
  defect_number?: string;
  defect_name?: string;
  remark?: string;
}, user: { username: string }): Promise<{ workReportNumber: string | null; completedTasks: number }> => {
  return await withTransaction(async (transaction) => {
    const b = params;
    const orderNo = b.production_order_number;

    if (!orderNo) throw new BusinessError(400, '生产单编号不能为空');

    // 获取该生产单所有工序（按工序号排序）
    const [allSteps]: any = await sequelize.query(
      `SELECT process_task_number, step_number, standard_process_name, item_number, item_name, specifications, basic_unit, work_center_number, work_center_name, planned_quantity, completed_quantity, excess_reporting_ratio, task_status, approval_status FROM process_task WHERE production_order_number = :orderNo ORDER BY step_number ASC`,
      { replacements: { orderNo }, transaction }
    );
    if (!allSteps.length) throw new BusinessError(404, '未找到该生产单的工序任务');

    const lastTask = allSteps[allSteps.length - 1];

    // 如果最后一道工序有报工数据，先报工
    const qualifiedQty = Number(b.qualified_quantity) || 0;
    const unqualifiedQty = Number(b.unqualified_quantity) || 0;
    let wrNumber = '';

    if (qualifiedQty > 0) {
      if (lastTask.approval_status !== '已审批') {
        throw new BusinessError(400, `最后一道工序「${lastTask.standard_process_name}」未审批，不能报工`);
      }
      if (lastTask.task_status === '已关闭') {
        throw new BusinessError(400, `最后一道工序「${lastTask.standard_process_name}」已关闭，不能报工`);
      }

      const excessRatio = parseFloat(lastTask.excess_reporting_ratio) || 0;
      const [orderRowsDaily]: any = await sequelize.query(`SELECT actual_daily_output FROM production_order WHERE production_order_number = :orderNo`, { replacements: { orderNo }, transaction });
      const actualDailyComplete = parseFloat(orderRowsDaily[0]?.actual_daily_output) || 0;
      const baseQtyComplete = actualDailyComplete > 0 ? actualDailyComplete : parseFloat(lastTask.planned_quantity);
      const maxAllowed = baseQtyComplete * (1 + excessRatio / 100);
      const completedQty = parseFloat(lastTask.completed_quantity) || 0;
      const maxReportable = maxAllowed - completedQty;

      if (qualifiedQty + unqualifiedQty > maxReportable) {
        throw new BusinessError(400, `合格数(${qualifiedQty})+不合格数(${unqualifiedQty})=${qualifiedQty + unqualifiedQty}，超过最大可报工量(${maxReportable.toFixed(4)})`);
      }

      const totalQty = qualifiedQty + unqualifiedQty;
      const cumulativeQty = completedQty + qualifiedQty;

      // 自动填充班次/操作员名称
      let schedulesName = b.schedules_name || '';
      if (b.schedules_id && !schedulesName) {
        const [schRows]: any = await sequelize.query(`SELECT TOP 1 schedules_name FROM schedules WHERE schedules_id = :id`, { replacements: { id: b.schedules_id }, transaction });
        if (schRows.length) schedulesName = schRows[0].schedules_name || '';
      }
      let operatorName = b.operator_name || '';
      if (b.operator_number && !operatorName) {
        const [empRows]: any = await sequelize.query(`SELECT TOP 1 employee_name FROM employee WHERE employee_number = :id`, { replacements: { id: b.operator_number }, transaction });
        if (empRows.length) operatorName = empRows[0].employee_name || '';
      }

      wrNumber = await generateWRNumber(transaction);
      const now = dayjs().format('YYYY/MM/DD HH:mm');

      await sequelize.query(`
        INSERT INTO work_report (work_report_number, process_task_number, production_order_number, step_number, standard_process_name, item_number, item_name, specifications, basic_unit, work_center_number, work_center_name, planned_quantity, qualified_quantity, unqualified_quantity, total_quantity, cumulative_quantity, report_date, schedules_id, schedules_name, team_number, team_name, operator_number, operator_name, actual_start_time, actual_end_time, actual_hours, unqualified_reason, defect_class_number, defect_class_name, defect_number, defect_name, approval_status, remark, creation_date, creation_man)
        VALUES (:work_report_number, :process_task_number, :production_order_number, :step_number, :standard_process_name, :item_number, :item_name, :specifications, :basic_unit, :work_center_number, :work_center_name, :planned_quantity, :qualified_quantity, :unqualified_quantity, :total_quantity, :cumulative_quantity, :report_date, :schedules_id, :schedules_name, :team_number, :team_name, :operator_number, :operator_name, :actual_start_time, :actual_end_time, :actual_hours, :unqualified_reason, :defect_class_number, :defect_class_name, :defect_number, :defect_name, N'草稿', :remark, :creation_date, :creation_man)
      `, {
        replacements: {
          work_report_number: wrNumber,
          process_task_number: lastTask.process_task_number,
          production_order_number: orderNo,
          step_number: lastTask.step_number,
          standard_process_name: lastTask.standard_process_name || '',
          item_number: lastTask.item_number || '',
          item_name: lastTask.item_name || '',
          specifications: lastTask.specifications || '',
          basic_unit: lastTask.basic_unit || '',
          work_center_number: lastTask.work_center_number || '',
          work_center_name: lastTask.work_center_name || '',
          planned_quantity: parseFloat(lastTask.planned_quantity) || 0,
          qualified_quantity: qualifiedQty,
          unqualified_quantity: unqualifiedQty,
          total_quantity: totalQty,
          cumulative_quantity: cumulativeQty,
          report_date: b.report_date || dayjs().format('YYYY/MM/DD'),
          schedules_id: b.schedules_id || '',
          schedules_name: schedulesName,
          team_number: b.team_number || '',
          team_name: b.team_name || '',
          operator_number: b.operator_number || '',
          operator_name: operatorName,
          actual_start_time: '',
          actual_end_time: '',
          actual_hours: 0,
          unqualified_reason: b.defect_name ? ((b.defect_class_name || '') + '/' + b.defect_name) : (b.unqualified_reason || ''),
          defect_class_number: b.defect_class_number || '',
          defect_class_name: b.defect_class_name || '',
          defect_number: b.defect_number || '',
          defect_name: b.defect_name || '',
          remark: b.remark || '',
          creation_date: now,
          creation_man: user?.username || ''
        },
        transaction
      });

      // 发布报工创建事件，由订阅者处理工序同步、线边仓流转、检验创建
      await emitAsync(EVENT_NAMES.WORK_REPORT_CREATED, {
        process_task_number: lastTask.process_task_number,
        work_report_number: wrNumber,
        qualified_quantity: qualifiedQty,
        unqualified_quantity: unqualifiedQty,
        total_quantity: qualifiedQty + unqualifiedQty,
        username: user?.username || '',
        transaction,
      });
    }

    // 将该生产单所有工序任务标记为"已完成"
    await sequelize.query(
      `UPDATE process_task SET task_status = N'已完成' WHERE production_order_number = :orderNo AND task_status NOT IN (N'已完成', N'已关闭')`,
      { replacements: { orderNo }, transaction }
    );

    // 将生产单状态标记为"已完成"
    await sequelize.query(
      `UPDATE production_order SET plan_status = N'已完成' WHERE production_order_number = :orderNo AND plan_status NOT IN (N'已完成')`,
      { replacements: { orderNo }, transaction }
    );
    // 回写销售订单明细 production_status
    await syncProductionStatus(orderNo, '生产完成', transaction);

    return {
      workReportNumber: wrNumber || null,
      completedTasks: allSteps.length
    };
  });
};
