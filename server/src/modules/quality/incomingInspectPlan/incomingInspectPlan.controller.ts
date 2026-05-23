import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';

const fields = ['plan_name', 'inspector_id', 'inspector_name', 'inspect_department',
  'inspect_method', 'sampling_method', 'sampling_quantity', 'decimal_handling',
  'is_destructive', 'enable_quality_chars', 'applied_category'];
const headers = ['方案名称', '检验员账号(工号)', '检验员姓名', '检验部门',
  '检验方法', '抽检方式', '抽检数', '小数处理方式',
  '是否破坏性检验', '启用质量特性', '应用于分类'];

export const getIncomingInspectPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};
    if (search) {
      conditions.push(`(plan_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM incoming_inspect_plan ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY
          CASE plan_name
            WHEN N'C100809-GJ' THEN 0
            WHEN N'C100809-TJ' THEN 1
            ELSE 99
          END, plan_name
        ) AS _row_num
        FROM incoming_inspect_plan ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取收料检验方案列表成功'));
  } catch (err) { next(err); }
};

export const createIncomingInspectPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.plan_name) { res.status(400).json({ success: false, message: '方案名称不能为空' }); return; }

    await sequelize.query(`
      INSERT INTO incoming_inspect_plan (plan_name, inspector_id, inspector_name, inspect_department,
        inspect_method, sampling_method, sampling_quantity, sampling_ratio, decimal_handling, is_destructive, enable_quality_chars, applied_category)
      VALUES (:plan_name, :inspector_id, :inspector_name, :inspect_department,
        :inspect_method, :sampling_method, :sampling_quantity, :sampling_ratio, :decimal_handling, :is_destructive, :enable_quality_chars, :applied_category)
    `, {
      replacements: {
        plan_name: b.plan_name,
        inspector_id: b.inspector_id || '',
        inspector_name: b.inspector_name || '',
        inspect_department: b.inspect_department || '',
        inspect_method: b.inspect_method || '',
        sampling_method: b.sampling_method || '',
        sampling_quantity: b.sampling_quantity != null ? Number(b.sampling_quantity) : 0,
        sampling_ratio: b.sampling_ratio != null ? Number(b.sampling_ratio) : 0,
        decimal_handling: b.decimal_handling || '',
        is_destructive: b.is_destructive || '',
        enable_quality_chars: b.enable_quality_chars || 'N',
        applied_category: b.applied_category || ''
      }
    });
    res.json(success(null, '创建收料检验方案成功'));
  } catch (err) { next(err); }
};

export const updateIncomingInspectPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM incoming_inspect_plan WHERE plan_name = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' }); return; }
    const b = req.body;

    await sequelize.query(`
      UPDATE incoming_inspect_plan SET
        inspector_id = :inspector_id, inspector_name = :inspector_name,
        inspect_department = :inspect_department, inspect_method = :inspect_method,
        sampling_method = :sampling_method, sampling_quantity = :sampling_quantity,
        sampling_ratio = :sampling_ratio, decimal_handling = :decimal_handling, is_destructive = :is_destructive,
        enable_quality_chars = :enable_quality_chars, applied_category = :applied_category
      WHERE plan_name = :id
    `, {
      replacements: {
        id,
        inspector_id: b.inspector_id || '',
        inspector_name: b.inspector_name || '',
        inspect_department: b.inspect_department || '',
        inspect_method: b.inspect_method || '',
        sampling_method: b.sampling_method || '',
        sampling_quantity: b.sampling_quantity != null ? Number(b.sampling_quantity) : 0,
        sampling_ratio: b.sampling_ratio != null ? Number(b.sampling_ratio) : 0,
        decimal_handling: b.decimal_handling || '',
        is_destructive: b.is_destructive || '',
        enable_quality_chars: b.enable_quality_chars || 'N',
        applied_category: b.applied_category || ''
      }
    });
    res.json(success(null, '更新收料检验方案成功'));
  } catch (err) { next(err); }
};

export const deleteIncomingInspectPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM incoming_inspect_plan WHERE plan_name = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许删除，请先撤消审核' }); return; }
    await sequelize.query(`DELETE FROM incoming_inspect_plan WHERE plan_name = :id`, { replacements: { id } });
    res.json(success(null, '删除收料检验方案成功'));
  } catch (err) { next(err); }
};

export const exportIncomingInspectPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM incoming_inspect_plan ORDER BY CASE plan_name WHEN N'C100809-GJ' THEN 0 WHEN N'C100809-TJ' THEN 1 ELSE 99 END, plan_name`);
    exportToExcel(items, fields, headers, 'incoming_inspect_plans', res);
  } catch (err) { next(err); }
};

export const importIncomingInspectPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }

    let imported = 0;
    for (const item of rows) {
      try {
        await sequelize.query(`
          IF NOT EXISTS (SELECT 1 FROM incoming_inspect_plan WHERE plan_name = :plan_name)
          INSERT INTO incoming_inspect_plan (plan_name, inspector_id, inspector_name, inspect_department,
            inspect_method, sampling_method, sampling_quantity, decimal_handling, is_destructive, applied_category)
          VALUES (:plan_name, :inspector_id, :inspector_name, :inspect_department,
            :inspect_method, :sampling_method, :sampling_quantity, :decimal_handling, :is_destructive, :applied_category)
        `, {
          replacements: {
            plan_name: item.plan_name || '',
            inspector_id: item.inspector_id || '',
            inspector_name: item.inspector_name || '',
            inspect_department: item.inspect_department || '',
            inspect_method: item.inspect_method || '',
            sampling_method: item.sampling_method || '',
            sampling_quantity: item.sampling_quantity != null && item.sampling_quantity !== '' ? Number(item.sampling_quantity) : 0,
            decimal_handling: item.decimal_handling || '',
            is_destructive: item.is_destructive || '',
            applied_category: item.applied_category || ''
          }
        });
        imported++;
      } catch (e) { /* skip */ }
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};

export const approveIncomingInspectPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE incoming_inspect_plan SET approval_status = N'已审核' WHERE plan_name = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawIncomingInspectPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE incoming_inspect_plan SET approval_status = N'未审核' WHERE plan_name = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};
