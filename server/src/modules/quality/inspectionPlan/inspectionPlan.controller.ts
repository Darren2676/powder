import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';
import { getFactoryId } from '../../../utils/factoryWhere.util';

const fields = ['plan_name', 'inspect_type', 'is_full_inspect', 'is_sampling', 'sampling_trigger',
  'sampling_type', 'sampling_ratio', 'decimal_handling', 'sampling_quantity', 'sampling_range_type',
  'sampling_quantity_range', 'sampling_batch_range', 'is_first_inspect', 'first_inspect_time',
  'first_inspect_quantity', 'is_last_inspect', 'last_inspect_quantity'];
const headers = ['方案名称', '检验类型', '是否全检', '是否抽检', '抽检触发方式',
  '抽检类型', '抽检比例(%)', '小数位处理方式', '抽检数量', '抽检范围类型',
  '抽检数量范围', '抽检批量范围', '是否首检', '首检时间点',
  '首检数量', '是否末检', '末检数量'];

export const getInspectionPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = (req.query.search as string) || '';
    const inspect_type = (req.query.inspect_type as string) || '';

    const _factoryId = getFactoryId(req);
    const conditions: string[] = [];
    const replacements: any = {};
    if (search) {
      conditions.push(`(plan_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (inspect_type) {
      conditions.push(`inspect_type = :inspect_type`);
      replacements.inspect_type = inspect_type;
    }
    if (_factoryId !== null) {
      conditions.push(`factory_id = :_factoryId`);
      replacements._factoryId = _factoryId;
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM inspection_plan ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;

    const planOrderCase = `CASE plan_name
      WHEN N'硫化自检' THEN 1
      WHEN N'生产抽检' THEN 2
      WHEN N'生产全检' THEN 3
      WHEN N'生产过程检' THEN 4
      WHEN N'包装自检' THEN 5
      WHEN N'巡检' THEN 6
      WHEN N'机加自检' THEN 7
      WHEN N'机加全检' THEN 8
      WHEN N'机加抽检' THEN 9
      WHEN N'机加巡检' THEN 10
      ELSE 99
    END`;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY ${planOrderCase}, plan_name) AS _row_num
        FROM inspection_plan ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取检验方案列表成功'));
  } catch (err) { next(err); }
};

export const createInspectionPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const b = req.body;
    if (!b.plan_name) { res.status(400).json({ success: false, message: '方案名称不能为空' }); return; }

    await sequelize.query(`
      INSERT INTO inspection_plan (plan_name, inspect_type, is_full_inspect, is_sampling, sampling_trigger,
        sampling_type, sampling_ratio, decimal_handling, sampling_quantity, sampling_range_type,
        sampling_quantity_range, sampling_batch_range, is_first_inspect, first_inspect_time,
        first_inspect_quantity, is_last_inspect, last_inspect_quantity, enable_quality_chars, factory_id)
      VALUES (:plan_name, :inspect_type, :is_full_inspect, :is_sampling, :sampling_trigger,
        :sampling_type, :sampling_ratio, :decimal_handling, :sampling_quantity, :sampling_range_type,
        :sampling_quantity_range, :sampling_batch_range, :is_first_inspect, :first_inspect_time,
        :first_inspect_quantity, :is_last_inspect, :last_inspect_quantity, :enable_quality_chars, :factory_id)
    `, {
      replacements: {
        plan_name: b.plan_name,
        inspect_type: b.inspect_type || '',
        is_full_inspect: b.is_full_inspect || '否',
        is_sampling: b.is_sampling || '否',
        sampling_trigger: b.sampling_trigger || '',
        sampling_type: b.sampling_type || '',
        sampling_ratio: b.sampling_ratio != null ? Number(b.sampling_ratio) : 0,
        decimal_handling: b.decimal_handling || '',
        sampling_quantity: b.sampling_quantity != null ? Number(b.sampling_quantity) : 0,
        sampling_range_type: b.sampling_range_type || '',
        sampling_quantity_range: b.sampling_quantity_range != null ? Number(b.sampling_quantity_range) : 0,
        sampling_batch_range: b.sampling_batch_range != null ? Number(b.sampling_batch_range) : 0,
        is_first_inspect: b.is_first_inspect || '否',
        first_inspect_time: b.first_inspect_time || '',
        first_inspect_quantity: b.first_inspect_quantity != null ? Number(b.first_inspect_quantity) : 0,
        is_last_inspect: b.is_last_inspect || '否',
        last_inspect_quantity: b.last_inspect_quantity != null ? Number(b.last_inspect_quantity) : 0,
        enable_quality_chars: b.enable_quality_chars || 'N',
        factory_id: _factoryId
      }
    });
    res.json(success(null, '创建检验方案成功'));
  } catch (err) { next(err); }
};

export const updateInspectionPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM inspection_plan WHERE plan_name = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' }); return; }
    const b = req.body;

    await sequelize.query(`
      UPDATE inspection_plan SET
        inspect_type = :inspect_type, is_full_inspect = :is_full_inspect, is_sampling = :is_sampling,
        sampling_trigger = :sampling_trigger, sampling_type = :sampling_type, sampling_ratio = :sampling_ratio,
        decimal_handling = :decimal_handling, sampling_quantity = :sampling_quantity,
        sampling_range_type = :sampling_range_type, sampling_quantity_range = :sampling_quantity_range,
        sampling_batch_range = :sampling_batch_range, is_first_inspect = :is_first_inspect,
        first_inspect_time = :first_inspect_time, first_inspect_quantity = :first_inspect_quantity,
        is_last_inspect = :is_last_inspect, last_inspect_quantity = :last_inspect_quantity,
        enable_quality_chars = :enable_quality_chars
      WHERE plan_name = :id${factoryCond}
    `, {
      replacements: {
        id,
        ...factoryReps,
        inspect_type: b.inspect_type || '',
        is_full_inspect: b.is_full_inspect || '否',
        is_sampling: b.is_sampling || '否',
        sampling_trigger: b.sampling_trigger || '',
        sampling_type: b.sampling_type || '',
        sampling_ratio: b.sampling_ratio != null ? Number(b.sampling_ratio) : 0,
        decimal_handling: b.decimal_handling || '',
        sampling_quantity: b.sampling_quantity != null ? Number(b.sampling_quantity) : 0,
        sampling_range_type: b.sampling_range_type || '',
        sampling_quantity_range: b.sampling_quantity_range != null ? Number(b.sampling_quantity_range) : 0,
        sampling_batch_range: b.sampling_batch_range != null ? Number(b.sampling_batch_range) : 0,
        is_first_inspect: b.is_first_inspect || '否',
        first_inspect_time: b.first_inspect_time || '',
        first_inspect_quantity: b.first_inspect_quantity != null ? Number(b.first_inspect_quantity) : 0,
        is_last_inspect: b.is_last_inspect || '否',
        last_inspect_quantity: b.last_inspect_quantity != null ? Number(b.last_inspect_quantity) : 0,
        enable_quality_chars: b.enable_quality_chars || 'N'
      }
    });
    res.json(success(null, '更新检验方案成功'));
  } catch (err) { next(err); }
};

export const deleteInspectionPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM inspection_plan WHERE plan_name = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许删除，请先撤消审核' }); return; }
    await sequelize.query(`DELETE FROM inspection_plan WHERE plan_name = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    res.json(success(null, '删除检验方案成功'));
  } catch (err) { next(err); }
};

const planOrderCaseExport = `CASE plan_name
  WHEN N'硫化自检' THEN 1
  WHEN N'生产抽检' THEN 2
  WHEN N'生产全检' THEN 3
  WHEN N'生产过程检' THEN 4
  WHEN N'包装自检' THEN 5
  WHEN N'巡检' THEN 6
  WHEN N'机加自检' THEN 7
  WHEN N'机加全检' THEN 8
  WHEN N'机加抽检' THEN 9
  WHEN N'机加巡检' THEN 10
  ELSE 99 END`;

export const exportInspectionPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? 'WHERE factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [items]: any = await sequelize.query(`SELECT * FROM inspection_plan ${factoryCond} ORDER BY ${planOrderCaseExport}, plan_name`, { replacements: factoryReps });
    exportToExcel(items, fields, headers, 'inspection_plans', res);
  } catch (err) { next(err); }
};

export const importInspectionPlans = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }

    let imported = 0;
    for (const item of rows) {
      try {
        await sequelize.query(`
          IF NOT EXISTS (SELECT 1 FROM inspection_plan WHERE plan_name = :plan_name)
          INSERT INTO inspection_plan (plan_name, inspect_type, is_full_inspect, is_sampling, sampling_trigger,
            sampling_type, sampling_ratio, decimal_handling, sampling_quantity, sampling_range_type,
            sampling_quantity_range, sampling_batch_range, is_first_inspect, first_inspect_time,
            first_inspect_quantity, is_last_inspect, last_inspect_quantity, factory_id)
          VALUES (:plan_name, :inspect_type, :is_full_inspect, :is_sampling, :sampling_trigger,
            :sampling_type, :sampling_ratio, :decimal_handling, :sampling_quantity, :sampling_range_type,
            :sampling_quantity_range, :sampling_batch_range, :is_first_inspect, :first_inspect_time,
            :first_inspect_quantity, :is_last_inspect, :last_inspect_quantity, :factory_id)
        `, {
          replacements: {
            plan_name: item.plan_name || '',
            inspect_type: item.inspect_type || '',
            is_full_inspect: item.is_full_inspect || '否',
            is_sampling: item.is_sampling || '否',
            sampling_trigger: item.sampling_trigger || '',
            sampling_type: item.sampling_type || '',
            sampling_ratio: item.sampling_ratio != null && item.sampling_ratio !== '' ? Number(item.sampling_ratio) : 0,
            decimal_handling: item.decimal_handling || '',
            sampling_quantity: item.sampling_quantity != null && item.sampling_quantity !== '' ? Number(item.sampling_quantity) : 0,
            sampling_range_type: item.sampling_range_type || '',
            sampling_quantity_range: item.sampling_quantity_range != null && item.sampling_quantity_range !== '' ? Number(item.sampling_quantity_range) : 0,
            sampling_batch_range: item.sampling_batch_range != null && item.sampling_batch_range !== '' ? Number(item.sampling_batch_range) : 0,
            is_first_inspect: item.is_first_inspect || '否',
            first_inspect_time: item.first_inspect_time || '',
            first_inspect_quantity: item.first_inspect_quantity != null && item.first_inspect_quantity !== '' ? Number(item.first_inspect_quantity) : 0,
            is_last_inspect: item.is_last_inspect || '否',
            last_inspect_quantity: item.last_inspect_quantity != null && item.last_inspect_quantity !== '' ? Number(item.last_inspect_quantity) : 0,
            factory_id: _factoryId
          }
        });
        imported++;
      } catch (e) { /* skip */ }
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};

export const approveInspectionPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const { id } = req.params;
    await sequelize.query(`UPDATE inspection_plan SET approval_status = N'已审核' WHERE plan_name = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawInspectionPlan = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const { id } = req.params;
    await sequelize.query(`UPDATE inspection_plan SET approval_status = N'未审核' WHERE plan_name = :id${factoryCond}`, { replacements: { id, ...factoryReps } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};
