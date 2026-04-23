import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';

const fields = ['standard_process_number', 'standard_process_name', 'work_center_number', 'work_center_name', 'workshop_warehouse', 'inspection_process', 'inspection_schemes', 'inspection_specification', 'inspection_process_inspector', 'over_staffing_reporting', 'excess_reporting_ratio', 'ingredient_addition', 'self_inspection', 'self_inspection_inspection_plan', 'self_inspection_specification'];
const headers = ['标准工序编号', '标准工序名称', '工作中心编号', '工作中心名称', '车间仓库', '是否检验工序', '检验方案', '检验规范', '检验员', '超额报工', '超额报工比例', '配料方式', '是否自检', '自检检验方案', '自检规范'];

export const getProcedures = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) { whereClause = `WHERE standard_process_number LIKE :search OR standard_process_name LIKE :search`; replacements.search = `%${search}%`; }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM [standard_process] ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY standard_process_number) AS _row_num FROM [standard_process] ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取标准工序列表成功'));
  } catch (err) { next(err); }
};

export const createProcedure = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.standard_process_number) { res.status(400).json({ success: false, message: '标准工序编号不能为空' }); return; }
    await sequelize.query(`INSERT INTO [standard_process] (standard_process_number, standard_process_name, work_center_number, work_center_name, workshop_warehouse, inspection_process, inspection_schemes, inspection_specification, inspection_process_inspector, over_staffing_reporting, excess_reporting_ratio, ingredient_addition, self_inspection, self_inspection_inspection_plan, self_inspection_specification) VALUES (:standard_process_number, :standard_process_name, :work_center_number, :work_center_name, :workshop_warehouse, :inspection_process, :inspection_schemes, :inspection_specification, :inspection_process_inspector, :over_staffing_reporting, :excess_reporting_ratio, :ingredient_addition, :self_inspection, :self_inspection_inspection_plan, :self_inspection_specification)`, {
      replacements: {
        standard_process_number: b.standard_process_number,
        standard_process_name: b.standard_process_name || '',
        work_center_number: b.work_center_number || '',
        work_center_name: b.work_center_name || '',
        workshop_warehouse: b.workshop_warehouse || '',
        inspection_process: b.inspection_process || '',
        inspection_schemes: b.inspection_schemes || '',
        inspection_specification: b.inspection_specification || '',
        inspection_process_inspector: b.inspection_process_inspector || '',
        over_staffing_reporting: b.over_staffing_reporting || '',
        excess_reporting_ratio: b.excess_reporting_ratio || '',
        ingredient_addition: b.ingredient_addition || '',
        self_inspection: b.self_inspection || '',
        self_inspection_inspection_plan: b.self_inspection_inspection_plan || '',
        self_inspection_specification: b.self_inspection_specification || ''
      }
    });
    res.json(success(null, '创建标准工序成功'));
  } catch (err) { next(err); }
};

export const updateProcedure = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    await sequelize.query(`UPDATE [standard_process] SET standard_process_name = :standard_process_name, work_center_number = :work_center_number, work_center_name = :work_center_name, workshop_warehouse = :workshop_warehouse, inspection_process = :inspection_process, inspection_schemes = :inspection_schemes, inspection_specification = :inspection_specification, inspection_process_inspector = :inspection_process_inspector, over_staffing_reporting = :over_staffing_reporting, excess_reporting_ratio = :excess_reporting_ratio, ingredient_addition = :ingredient_addition, self_inspection = :self_inspection, self_inspection_inspection_plan = :self_inspection_inspection_plan, self_inspection_specification = :self_inspection_specification WHERE standard_process_number = :id`, {
      replacements: {
        id,
        standard_process_name: b.standard_process_name,
        work_center_number: b.work_center_number || '',
        work_center_name: b.work_center_name || '',
        workshop_warehouse: b.workshop_warehouse || '',
        inspection_process: b.inspection_process || '',
        inspection_schemes: b.inspection_schemes || '',
        inspection_specification: b.inspection_specification || '',
        inspection_process_inspector: b.inspection_process_inspector || '',
        over_staffing_reporting: b.over_staffing_reporting || '',
        excess_reporting_ratio: b.excess_reporting_ratio || '',
        ingredient_addition: b.ingredient_addition || '',
        self_inspection: b.self_inspection || '',
        self_inspection_inspection_plan: b.self_inspection_inspection_plan || '',
        self_inspection_specification: b.self_inspection_specification || ''
      }
    });
    res.json(success(null, '更新标准工序成功'));
  } catch (err) { next(err); }
};

export const deleteProcedure = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM [standard_process] WHERE standard_process_number = :id`, { replacements: { id } });
    res.json(success(null, '删除标准工序成功'));
  } catch (err) { next(err); }
};

export const exportProcedures = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM [standard_process] ORDER BY standard_process_number`);
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, fields, headers, 'procedures', res, format);
  } catch (err) { next(err); }
};

export const importProcedures = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let successCount = 0;
    for (const item of rows) {
      try {
        await sequelize.query(`INSERT INTO [standard_process] (standard_process_number, standard_process_name, work_center_number, work_center_name, workshop_warehouse, inspection_process, inspection_schemes, inspection_specification, inspection_process_inspector, over_staffing_reporting, excess_reporting_ratio, ingredient_addition, self_inspection, self_inspection_inspection_plan, self_inspection_specification) VALUES (:standard_process_number, :standard_process_name, :work_center_number, :work_center_name, :workshop_warehouse, :inspection_process, :inspection_schemes, :inspection_specification, :inspection_process_inspector, :over_staffing_reporting, :excess_reporting_ratio, :ingredient_addition, :self_inspection, :self_inspection_inspection_plan, :self_inspection_specification)`, {
          replacements: { standard_process_number: item.standard_process_number || '', standard_process_name: item.standard_process_name || '', work_center_number: item.work_center_number || '', work_center_name: item.work_center_name || '', workshop_warehouse: item.workshop_warehouse || '', inspection_process: item.inspection_process || '', inspection_schemes: item.inspection_schemes || '', inspection_specification: item.inspection_specification || '', inspection_process_inspector: item.inspection_process_inspector || '', over_staffing_reporting: item.over_staffing_reporting || '', excess_reporting_ratio: item.excess_reporting_ratio || '', ingredient_addition: item.ingredient_addition || '', self_inspection: item.self_inspection || '', self_inspection_inspection_plan: item.self_inspection_inspection_plan || '', self_inspection_specification: item.self_inspection_specification || '' }
        });
        successCount++;
      } catch (e) {}
    }
    res.json(success({ successCount, totalCount: rows.length }, `成功导入 ${successCount} 条记录`));
  } catch (err) { next(err); }
};

export const approveProcedure = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE [standard_process] SET approval_status = N'已审核' WHERE standard_process_number = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawProcedure = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE [standard_process] SET approval_status = N'未审核' WHERE standard_process_number = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};
