import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { generateWRNumber } from '@/services/documentNumber.service';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { BusinessError } from '@/shared/errors/BusinessError';
import * as workReportService from '@/services/workReport.service';

const selectCols = 'work_report_number, process_task_number, production_order_number, step_number, standard_process_name, item_number, item_name, specifications, basic_unit, work_center_number, work_center_name, planned_quantity, qualified_quantity, unqualified_quantity, total_quantity, cumulative_quantity, report_date, schedules_id, schedules_name, team_number, team_name, operator_number, operator_name, actual_start_time, actual_end_time, actual_hours, unqualified_reason, defect_class_number, defect_class_name, defect_number, defect_name, approval_status, remark, creation_date, creation_man';

const exportFields = ['work_report_number', 'process_task_number', 'production_order_number', 'step_number', 'standard_process_name', 'item_name', 'qualified_quantity', 'unqualified_quantity', 'total_quantity', 'cumulative_quantity', 'report_date', 'schedules_name', 'operator_name', 'work_center_name', 'approval_status', 'creation_date', 'creation_man', 'remark'];
const exportHeaders = ['报工单编号', '工序任务编号', '生产单编号', '工序序号', '工序名称', '产品名称', '合格数量', '不合格数量', '总产出', '累计完成', '报工日期', '班次', '操作员', '工作中心', '审批状态', '创建日期', '创建人', '备注'];

// ==================== 获取列表 ====================
export const getWorkReports = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const process_task_number = (req.query.process_task_number as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(work_report_number LIKE :search OR process_task_number LIKE :search OR production_order_number LIKE :search OR item_name LIKE :search OR operator_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) { conditions.push(`approval_status = :approval_status`); replacements.approval_status = approval_status; }
    if (process_task_number) { conditions.push(`process_task_number = :process_task_number`); replacements.process_task_number = process_task_number; }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM work_report ${whereClause}`, { replacements });
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT ${selectCols}, ROW_NUMBER() OVER (ORDER BY work_report_number DESC) AS _row_num
        FROM work_report ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取报工单列表成功'));
  } catch (err) { next(err); }
};

// ==================== 创建报工单 ====================
export const createWorkReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const result = await workReportService.createWorkReport(req.body, user);
    res.json(success({ work_report_number: result.workReportNumber }, '创建报工单成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 移动端: 快速报工（简化参数自动填充） ====================
export const quickReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const result = await workReportService.quickReport(req.body, user);
    res.json(success({ work_report_number: result.workReportNumber }, '快速报工成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 编辑报工单 ====================
export const updateWorkReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    await workReportService.updateWorkReport(id, req.body, user);
    res.json(success(null, '更新报工单成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 删除报工单 ====================
export const deleteWorkReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const id = req.params.id as string;
    await workReportService.deleteWorkReport(id, user);
    res.json(success(null, '删除报工单成功'));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 导出 ====================
export const exportWorkReports = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT ${exportFields.join(', ')} FROM work_report ORDER BY work_report_number DESC`);
    exportToExcel(items, exportFields, exportHeaders, 'work_reports', res);
  } catch (err) { next(err); }
};

// ==================== 导入 ====================
export const importWorkReports = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, exportFields, exportHeaders);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let imported = 0;
    for (const item of rows) {
      try {
        if (!item.work_report_number) item.work_report_number = await generateWRNumber();
        const [existing]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM work_report WHERE work_report_number = :n`, { replacements: { n: item.work_report_number } });
        if (existing[0].cnt > 0) continue;
        await sequelize.query(`
          INSERT INTO work_report (work_report_number, process_task_number, production_order_number, step_number, standard_process_name, item_name, qualified_quantity, unqualified_quantity, total_quantity, cumulative_quantity, report_date, schedules_name, operator_name, work_center_name, approval_status, creation_date, creation_man, remark)
          VALUES (:work_report_number, :process_task_number, :production_order_number, :step_number, :standard_process_name, :item_name, :qualified_quantity, :unqualified_quantity, :total_quantity, :cumulative_quantity, :report_date, :schedules_name, :operator_name, :work_center_name, :approval_status, :creation_date, :creation_man, :remark)
        `, { replacements: { ...item, qualified_quantity: item.qualified_quantity || 0, unqualified_quantity: item.unqualified_quantity || 0, total_quantity: item.total_quantity || 0, cumulative_quantity: item.cumulative_quantity || 0, approval_status: item.approval_status || ORDER_STATUS.DRAFT } });
        imported++;
      } catch (e) {}
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条报工单`));
  } catch (err) { next(err); }
};

// ==================== 获取可报工的工序任务列表 ====================
export const getTasksForReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';

    let whereClause = `WHERE approval_status = N'已审批' AND task_status IN (N'未开始', N'进行中')`;
    const replacements: any = {};

    if (search) {
      whereClause += ` AND (process_task_number LIKE :search OR production_order_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search OR standard_process_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM process_task ${whereClause}`, { replacements });
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT process_task_number, production_order_number, step_number, standard_process_name, item_number, item_name, specifications, basic_unit, planned_quantity, completed_quantity, work_center_number, work_center_name, task_status, excess_reporting_ratio,
        ROW_NUMBER() OVER (ORDER BY production_order_number, step_number) AS _row_num
        FROM process_task ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const enrichedItems = [];
    for (const item of items) {
      const { _row_num, ...task } = item;
      const plannedQty = parseFloat(task.planned_quantity) || 0;
      const completedQty = parseFloat(task.completed_quantity) || 0;
      const excessRatio = parseFloat(task.excess_reporting_ratio) || 0;
      let actualDailyQty = 0;
      if (task.production_order_number) {
        const [odRows]: any = await sequelize.query(`SELECT actual_daily_output FROM production_order WHERE production_order_number = :orderNo`, { replacements: { orderNo: task.production_order_number } });
        actualDailyQty = parseFloat(odRows[0]?.actual_daily_output) || 0;
      }
      const baseQty = actualDailyQty > 0 ? actualDailyQty : plannedQty;
      const maxAllowed = baseQty * (1 + excessRatio / 100);

      task.remaining_quantity = Math.round((plannedQty - completedQty) * 10000) / 10000;
      task.max_reportable = Math.round((maxAllowed - completedQty) * 10000) / 10000;

      // 已有报工单数量
      const [rptCount]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM work_report WHERE process_task_number = :taskNo`,
        { replacements: { taskNo: task.process_task_number } }
      );
      task.report_count = rptCount[0].cnt;

      enrichedItems.push(task);
    }

    res.json(success({ items: enrichedItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取可报工工序任务列表成功'));
  } catch (err) { next(err); }
};

// ==================== 完成生产单：报工最后一道工序 + 确认所有工序完成 ====================
export const completeOrderReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const result = await workReportService.completeOrderReport(req.body, user);
    res.json(success({
      work_report_number: result.workReportNumber,
      completed_tasks: result.completedTasks
    }, `生产单 ${req.body.production_order_number} 已完成，所有工序已标记为完成`));
  } catch (err) {
    if (err instanceof BusinessError) {
      res.status(err.statusCode).json({ success: false, message: err.message });
      return;
    }
    next(err);
  }
};

// ==================== 撤销重报 - 预览（查询从目标工序到末道工序的所有报工单） ====================
export const undoPreview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { production_order_number, target_step_number } = req.body;

    if (!production_order_number) {
      res.status(400).json({ success: false, message: '生产单编号不能为空' });
      return;
    }
    if (target_step_number == null || target_step_number === undefined) {
      res.status(400).json({ success: false, message: '目标工序号不能为空' });
      return;
    }

    // 1. 查询该生产单所有工序
    const [allSteps]: any = await sequelize.query(
      `SELECT process_task_number, step_number, standard_process_name, task_status, completed_quantity FROM process_task WHERE production_order_number = :orderNo ORDER BY step_number ASC`,
      { replacements: { orderNo: production_order_number } }
    );

    if (!allSteps.length) {
      res.json(success({ valid: false, message: '该生产单没有工序任务' }, ''));
      return;
    }

    const maxStep = allSteps[allSteps.length - 1].step_number;
    if (Number(target_step_number) > Number(maxStep)) {
      res.json(success({ valid: false, message: `目标工序号(${target_step_number})超过最大工序号(${maxStep})` }, ''));
      return;
    }

    // 2. 查询从目标工序到末道工序的所有草稿报工单（按step_number降序）
    const [reports]: any = await sequelize.query(
      `SELECT wr.work_report_number, wr.process_task_number, wr.step_number, wr.standard_process_name, wr.qualified_quantity, wr.unqualified_quantity, wr.approval_status, wr.creation_date, wr.remark, pt.task_status, pt.completed_quantity
       FROM work_report wr
       LEFT JOIN process_task pt ON wr.process_task_number = pt.process_task_number
       WHERE wr.production_order_number = :orderNo AND wr.step_number >= :targetStep
       ORDER BY wr.step_number DESC, wr.creation_date DESC`,
      { replacements: { orderNo: production_order_number, targetStep: target_step_number } }
    );

    // 3. 查询关联的检验单
    const [inspections]: any = await sequelize.query(
      `SELECT pi.inspection_number, pi.process_task_number, pi.status, pi.qualified_quantity, pi.unqualified_quantity
       FROM production_inspection pi
       INNER JOIN process_task pt ON pi.process_task_number = pt.process_task_number
       WHERE pt.production_order_number = :orderNo AND pt.step_number >= :targetStep
       ORDER BY pt.step_number DESC`,
      { replacements: { orderNo: production_order_number, targetStep: target_step_number } }
    );

    // 4. 检查是否有不可删除的报工单（待审批状态不可删除，已审批会自动反审后删除）
    const pendingApprovalReports = reports.filter((r: any) => r.approval_status === '待审批');
    const canDelete = reports.length > 0 && pendingApprovalReports.length === 0;

    // 5. 统计哪些工序会受影响
    const affectedSteps = allSteps.filter((s: any) => Number(s.step_number) >= Number(target_step_number));

    res.json(success({
      production_order_number,
      target_step_number,
      max_step_number: maxStep,
      total_step_count: allSteps.length,
      affected_step_count: affectedSteps.length,
      affected_steps: affectedSteps.map((s: any) => ({
        step_number: s.step_number,
        process_task_number: s.process_task_number,
        standard_process_name: s.standard_process_name,
        task_status: s.task_status,
        completed_quantity: s.completed_quantity
      })),
      reports_to_delete: reports.map((r: any) => ({
        work_report_number: r.work_report_number,
        step_number: r.step_number,
        standard_process_name: r.standard_process_name,
        qualified_quantity: r.qualified_quantity,
        unqualified_quantity: r.unqualified_quantity,
        approval_status: r.approval_status,
        creation_date: r.creation_date,
        remark: r.remark
      })),
      related_inspections: inspections.map((i: any) => ({
        inspection_number: i.inspection_number,
        process_task_number: i.process_task_number,
        status: i.status
      })),
      pending_approval_count: pendingApprovalReports.length,
      can_delete_all: canDelete,
      delete_warning: canDelete ? '' : (pendingApprovalReports.length > 0
        ? `有 ${pendingApprovalReports.length} 条报工单处于"待审批"状态，需要先撤回审批后才能删除`
        : '没有可删除的报工单')
    }, '预览成功'));
  } catch (err) { next(err); }
};

// ==================== 撤销重报 - 执行（批量删除从目标工序到末道工序的所有草稿报工单） ====================
export const undoExecute = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const { production_order_number, target_step_number } = req.body;

    if (!production_order_number) {
      res.status(400).json({ success: false, message: '生产单编号不能为空' });
      return;
    }
    if (target_step_number == null || target_step_number === undefined) {
      res.status(400).json({ success: false, message: '目标工序号不能为空' });
      return;
    }

    // ========== 前置检查1: 入库状态 ==========
    const [orderInfo]: any = await sequelize.query(
      `SELECT inbound_status FROM production_order WHERE production_order_number = :orderNo`,
      { replacements: { orderNo: production_order_number } }
    );
    if (orderInfo.length > 0 && orderInfo[0].inbound_status && orderInfo[0].inbound_status !== '未入库') {
      res.status(400).json({
        success: false,
        message: `该生产单入库状态为"${orderInfo[0].inbound_status}"，请先撤回入库后再撤销重报`,
        data: { inbound_status: orderInfo[0].inbound_status }
      });
      return;
    }

    // ========== 前置检查2: 装箱状态 ==========
    const [packingBoxes]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM packing_box pb
       INNER JOIN packing_bag_label pbl ON pb.box_number = pbl.box_number
       INNER JOIN production_inbound_order_detail piod ON pbl.batch_number = piod.batch_number
       WHERE piod.production_order_number = :orderNo AND pb.status = N'已入库'`,
      { replacements: { orderNo: production_order_number } }
    );
    if (packingBoxes.length > 0 && packingBoxes[0].cnt > 0) {
      res.status(400).json({
        success: false,
        message: `该生产单有 ${packingBoxes[0].cnt} 个已入库的装箱记录，请先拆箱后再撤销重报`,
        data: { packed_box_count: packingBoxes[0].cnt }
      });
      return;
    }

    // 查询需要删除的报工单
    const [reports]: any = await sequelize.query(
      `SELECT work_report_number, approval_status, qualified_quantity, step_number, standard_process_name
       FROM work_report
       WHERE production_order_number = :orderNo AND step_number >= :targetStep
       ORDER BY step_number DESC`,
      { replacements: { orderNo: production_order_number, targetStep: target_step_number } }
    );

    if (!reports.length) {
      res.json(success({ deleted_count: 0, deleted_reports: [] }, '没有需要删除的报工单'));
      return;
    }

    // 检查是否有"待审批"状态的报工单（待审批不允许直接删除，需先撤回提交）
    const pendingApproval = reports.filter((r: any) => r.approval_status === '待审批');
    if (pendingApproval.length > 0) {
      res.status(400).json({
        success: false,
        message: `有 ${pendingApproval.length} 条报工单处于"待审批"状态，无法删除。请先撤回审批。`,
        data: { pending_approval_reports: pendingApproval.map((r: any) => r.work_report_number) }
      });
      return;
    }

    // 对"已审批"状态的报工单先执行反审（兼容报工自动审批场景）
    const approvedReports = reports.filter((r: any) => r.approval_status === '已审批');
    for (const report of approvedReports) {
      await sequelize.query(
        `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark) VALUES (N'work_report', :record_id, N'reverse', N'已审批', N'草稿', 0, :operator, N'撤销重报自动反审')`,
        { replacements: { record_id: report.work_report_number, operator: user?.username || '' } }
      );
    }

    // 逐条删除（从高工序号往低工序号方向删除）
    const deleted: string[] = [];
    const errors: { work_report_number: string; message: string }[] = [];

    for (const report of reports) {
      try {
        await workReportService.deleteWorkReport(report.work_report_number, user);
        deleted.push(report.work_report_number);
      } catch (e: any) {
        errors.push({
          work_report_number: report.work_report_number,
          message: e.message || '删除失败'
        });
      }
    }

    // 清理关联的专检记录（production_inspection）并重置工序 inspect_status
    let deletedInspections = 0;
    let deletedNcRecords = 0;
    if (deleted.length > 0) {
      const placeholders = deleted.map((_: any, i: number) => `:wr${i}`).join(',');
      const inspReplacements: any = {};
      deleted.forEach((wr: string, i: number) => { inspReplacements[`wr${i}`] = wr; });
      
      // 先查找关联的NC单号（在删除检验记录之前查询）
      const [relatedInspections]: any = await sequelize.query(
        `SELECT inspection_number, nonconforming_number FROM production_inspection WHERE work_report_number IN (${placeholders})`,
        { replacements: inspReplacements }
      );

      // 先删除检验明细项
      await sequelize.query(
        `DELETE FROM production_inspection_item WHERE inspection_number IN (
          SELECT inspection_number FROM production_inspection WHERE work_report_number IN (${placeholders})
        )`,
        { replacements: inspReplacements }
      );
      // 再删除检验主记录
      const [inspResult]: any = await sequelize.query(
        `DELETE FROM production_inspection WHERE work_report_number IN (${placeholders})`,
        { replacements: inspReplacements }
      );
      deletedInspections = inspResult?.[1] || 0;

      // 级联清理关联的NC单（nonconforming_product）
      const ncNumbers = relatedInspections
        .map((insp: any) => insp.nonconforming_number)
        .filter((n: any) => n);
      if (ncNumbers.length > 0) {
        const ncPlaceholders = ncNumbers.map((_: any, i: number) => `:nc${i}`).join(',');
        const ncReplacements: any = {};
        ncNumbers.forEach((n: string, i: number) => { ncReplacements[`nc${i}`] = n; });
        // 检查是否有已处理的NC单
        const [processedNc]: any = await sequelize.query(
          `SELECT nonconforming_number, handling_status FROM nonconforming_product WHERE nonconforming_number IN (${ncPlaceholders}) AND handling_status NOT IN (N'待处理', N'处理中')`,
          { replacements: ncReplacements }
        );
        if (processedNc.length > 0) {
          // 已处理的NC单不级联删除，仅解绑与检验单的关联
          const processedNcNumbers = processedNc.map((nc: any) => nc.nonconforming_number);
          const procNcPlaceholders = processedNcNumbers.map((_: any, i: number) => `:pnc${i}`).join(',');
          const procNcReplacements: any = {};
          processedNcNumbers.forEach((n: string, i: number) => { procNcReplacements[`pnc${i}`] = n; });
          await sequelize.query(
            `UPDATE nonconforming_product SET source_number = NULL WHERE nonconforming_number IN (${procNcPlaceholders})`,
            { replacements: procNcReplacements }
          );
        }
        // 删除待处理/处理中的NC单
        const [ncResult]: any = await sequelize.query(
          `DELETE FROM nonconforming_product WHERE nonconforming_number IN (${ncPlaceholders}) AND handling_status IN (N'待处理', N'处理中')`,
          { replacements: ncReplacements }
        );
        deletedNcRecords = ncResult?.[1] || 0;
      }

      // 重置目标工序到末道所有工序的 inspect_status
      await sequelize.query(
        `UPDATE process_task SET inspect_status = NULL 
         WHERE production_order_number = :orderNo AND step_number >= :targetStep`,
        { replacements: { orderNo: production_order_number, targetStep: target_step_number } }
      );
    }

    // 查询更新后的工序状态
    const [updatedTasks]: any = await sequelize.query(
      `SELECT step_number, standard_process_name, task_status, completed_quantity, inspect_status
       FROM process_task WHERE production_order_number = :orderNo AND step_number >= :targetStep
       ORDER BY step_number ASC`,
      { replacements: { orderNo: production_order_number, targetStep: target_step_number } }
    );

    res.json(success({
      deleted_count: deleted.length,
      deleted_reports: deleted,
      deleted_inspections: deletedInspections,
      deleted_nc_records: deletedNcRecords,
      errors: errors.length > 0 ? errors : undefined,
      updated_tasks: updatedTasks.map((t: any) => ({
        step_number: t.step_number,
        standard_process_name: t.standard_process_name,
        task_status: t.task_status,
        completed_quantity: t.completed_quantity,
        inspect_status: t.inspect_status
      }))
    }, `成功删除 ${deleted.length} 条报工单${deletedInspections > 0 ? `、${deletedInspections} 条专检记录` : ''}${deletedNcRecords > 0 ? `、${deletedNcRecords} 条NC单` : ''}${errors.length > 0 ? `，${errors.length} 条失败` : ''}`));
  } catch (err) { next(err); }
};

// ==================== 审批通过后回写工序任务（向后兼容导出） ====================
export const onWorkReportApproved = workReportService.onWorkReportApproved;

// ==================== 反审后逆向回写工序任务（向后兼容导出） ====================
export const onWorkReportReversed = workReportService.onWorkReportReversed;
