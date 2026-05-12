import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';

const selectCols = 'work_report_number, process_task_number, production_order_number, step_number, standard_process_name, item_number, item_name, specifications, basic_unit, work_center_number, work_center_name, planned_quantity, qualified_quantity, unqualified_quantity, total_quantity, cumulative_quantity, report_date, schedules_id, schedules_name, team_number, team_name, operator_number, operator_name, actual_start_time, actual_end_time, actual_hours, unqualified_reason, defect_class_number, defect_class_name, defect_number, defect_name, approval_status, remark, creation_date';

// 查询报工列表
export const openGetWorkReports = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = (req.query.search as string) || '';
    const production_order_number = (req.query.production_order_number as string) || '';
    const approval_status = (req.query.approval_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(work_report_number LIKE :search OR process_task_number LIKE :search OR production_order_number LIKE :search OR item_name LIKE :search OR operator_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (production_order_number) {
      conditions.push(`production_order_number = :production_order_number`);
      replacements.production_order_number = production_order_number;
    }
    if (approval_status) {
      conditions.push(`approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }

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

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取报工列表成功'));
  } catch (err) { next(err); }
};

// 查询报工详情
export const openGetWorkReportDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(
      `SELECT ${selectCols} FROM work_report WHERE work_report_number = :id`,
      { replacements: { id } }
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '报工记录不存在' });
    }
    res.json(success(rows[0], '获取报工详情成功'));
  } catch (err) { next(err); }
};

// 创建报工
export const openCreateWorkReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.production_order_number) {
      return res.status(400).json({ success: false, message: '生产单编号不能为空' });
    }

    // 生成报工编号
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [maxRows]: any = await sequelize.query(
      `SELECT MAX(work_report_number) as max_num FROM work_report WHERE work_report_number LIKE :prefix`,
      { replacements: { prefix: `WR${dateStr}%` } }
    );
    let seq = 1;
    if (maxRows[0].max_num) {
      const lastSeq = parseInt(maxRows[0].max_num.slice(-3));
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    const work_report_number = `WR${dateStr}${String(seq).padStart(3, '0')}`;

    await sequelize.query(`
      INSERT INTO work_report (work_report_number, process_task_number, production_order_number, step_number, standard_process_name, item_number, item_name, specifications, basic_unit, work_center_number, work_center_name, planned_quantity, qualified_quantity, unqualified_quantity, total_quantity, cumulative_quantity, report_date, schedules_id, schedules_name, team_number, team_name, operator_number, operator_name, actual_start_time, actual_end_time, actual_hours, unqualified_reason, defect_class_number, defect_class_name, defect_number, defect_name, approval_status, remark, creation_man)
      VALUES (:work_report_number, :process_task_number, :production_order_number, :step_number, :standard_process_name, :item_number, :item_name, :specifications, :basic_unit, :work_center_number, :work_center_name, :planned_quantity, :qualified_quantity, :unqualified_quantity, :total_quantity, :cumulative_quantity, :report_date, :schedules_id, :schedules_name, :team_number, :team_name, :operator_number, :operator_name, :actual_start_time, :actual_end_time, :actual_hours, :unqualified_reason, :defect_class_number, :defect_class_name, :defect_number, :defect_name, N'草稿', :remark, N'API')
    `, {
      replacements: {
        work_report_number,
        process_task_number: b.process_task_number || '',
        production_order_number: b.production_order_number,
        step_number: b.step_number || 0,
        standard_process_name: b.standard_process_name || '',
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        specifications: b.specifications || '',
        basic_unit: b.basic_unit || '',
        work_center_number: b.work_center_number || '',
        work_center_name: b.work_center_name || '',
        planned_quantity: b.planned_quantity || 0,
        qualified_quantity: b.qualified_quantity || 0,
        unqualified_quantity: b.unqualified_quantity || 0,
        total_quantity: b.total_quantity || 0,
        cumulative_quantity: b.cumulative_quantity || 0,
        report_date: b.report_date || new Date().toISOString().slice(0, 10),
        schedules_id: b.schedules_id || null,
        schedules_name: b.schedules_name || '',
        team_number: b.team_number || '',
        team_name: b.team_name || '',
        operator_number: b.operator_number || '',
        operator_name: b.operator_name || '',
        actual_start_time: b.actual_start_time || null,
        actual_end_time: b.actual_end_time || null,
        actual_hours: b.actual_hours || null,
        unqualified_reason: b.unqualified_reason || '',
        defect_class_number: b.defect_class_number || '',
        defect_class_name: b.defect_class_name || '',
        defect_number: b.defect_number || '',
        defect_name: b.defect_name || '',
        remark: b.remark || ''
      }
    });

    res.json(success({ work_report_number }, '创建报工记录成功'));
  } catch (err) { next(err); }
};
