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

// ==================== 审批通过后回写工序任务（向后兼容导出） ====================
export const onWorkReportApproved = workReportService.onWorkReportApproved;

// ==================== 反审后逆向回写工序任务（向后兼容导出） ====================
export const onWorkReportReversed = workReportService.onWorkReportReversed;
