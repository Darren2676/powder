import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';

const fields = ['char_name', 'data_type', 'inspect_requirement', 'allow_multiple', 'upper_limit', 'standard_value', 'lower_limit', 'single_options', 'multi_options', 'qualified_options', 'default_value'];
const headers = ['质量特性', '数据类型', '检验要求', '允许输入多项', '上限', '标准值', '下限', '单选项', '多选项', '合格项', '默认值'];

export const getQualityCharacteristics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE char_name LIKE :search OR data_type LIKE :search OR inspect_requirement LIKE :search`;
      replacements.search = `%${search}%`;
    }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM quality_characteristic ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY char_name) AS _row_num FROM quality_characteristic ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取质量特性列表成功'));
  } catch (err) { next(err); }
};

export const createQualityCharacteristic = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.char_name) { res.status(400).json({ success: false, message: '质量特性名称不能为空' }); return; }
    await sequelize.query(
      `INSERT INTO quality_characteristic (char_name, data_type, inspect_requirement, allow_multiple, upper_limit, standard_value, lower_limit, single_options, multi_options, qualified_options, default_value)
       VALUES (:char_name, :data_type, :inspect_requirement, :allow_multiple, :upper_limit, :standard_value, :lower_limit, :single_options, :multi_options, :qualified_options, :default_value)`,
      {
        replacements: {
          char_name: b.char_name,
          data_type: b.data_type || '',
          inspect_requirement: b.inspect_requirement || '',
          allow_multiple: b.allow_multiple || '否',
          upper_limit: b.upper_limit != null && b.upper_limit !== '' ? Number(b.upper_limit) : null,
          standard_value: b.standard_value != null && b.standard_value !== '' ? Number(b.standard_value) : null,
          lower_limit: b.lower_limit != null && b.lower_limit !== '' ? Number(b.lower_limit) : null,
          single_options: b.single_options || '',
          multi_options: b.multi_options || '',
          qualified_options: b.qualified_options || '',
          default_value: b.default_value || ''
        }
      }
    );
    res.json(success(null, '创建质量特性成功'));
  } catch (err) { next(err); }
};

export const updateQualityCharacteristic = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM quality_characteristic WHERE char_name = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' }); return; }
    const b = req.body;
    await sequelize.query(
      `UPDATE quality_characteristic SET data_type = :data_type, inspect_requirement = :inspect_requirement, allow_multiple = :allow_multiple, upper_limit = :upper_limit, standard_value = :standard_value, lower_limit = :lower_limit, single_options = :single_options, multi_options = :multi_options, qualified_options = :qualified_options, default_value = :default_value WHERE char_name = :id`,
      {
        replacements: {
          id,
          data_type: b.data_type || '',
          inspect_requirement: b.inspect_requirement || '',
          allow_multiple: b.allow_multiple || '否',
          upper_limit: b.upper_limit != null && b.upper_limit !== '' ? Number(b.upper_limit) : null,
          standard_value: b.standard_value != null && b.standard_value !== '' ? Number(b.standard_value) : null,
          lower_limit: b.lower_limit != null && b.lower_limit !== '' ? Number(b.lower_limit) : null,
          single_options: b.single_options || '',
          multi_options: b.multi_options || '',
          qualified_options: b.qualified_options || '',
          default_value: b.default_value || ''
        }
      }
    );
    res.json(success(null, '更新质量特性成功'));
  } catch (err) { next(err); }
};

export const deleteQualityCharacteristic = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM quality_characteristic WHERE char_name = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许删除，请先撤消审核' }); return; }
    await sequelize.query(`DELETE FROM quality_characteristic WHERE char_name = :id`, { replacements: { id } });
    res.json(success(null, '删除质量特性成功'));
  } catch (err) { next(err); }
};

export const exportQualityCharacteristics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM quality_characteristic ORDER BY char_name`);
    exportToExcel(items, fields, headers, 'quality_characteristics', res);
  } catch (err) { next(err); }
};

export const importQualityCharacteristics = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let imported = 0;
    for (const item of rows) {
      try {
        const ul = item.upper_limit != null && item.upper_limit !== '' ? Number(item.upper_limit) : null;
        const sv = item.standard_value != null && item.standard_value !== '' ? Number(item.standard_value) : null;
        const ll = item.lower_limit != null && item.lower_limit !== '' ? Number(item.lower_limit) : null;
        await sequelize.query(
          `INSERT INTO quality_characteristic (char_name, data_type, inspect_requirement, allow_multiple, upper_limit, standard_value, lower_limit, single_options, multi_options, qualified_options, default_value)
           VALUES (:char_name, :data_type, :inspect_requirement, :allow_multiple, :upper_limit, :standard_value, :lower_limit, :single_options, :multi_options, :qualified_options, :default_value)`,
          {
            replacements: {
              char_name: item.char_name || '',
              data_type: item.data_type || '',
              inspect_requirement: item.inspect_requirement || '',
              allow_multiple: item.allow_multiple || '否',
              upper_limit: isNaN(ul as number) ? null : ul,
              standard_value: isNaN(sv as number) ? null : sv,
              lower_limit: isNaN(ll as number) ? null : ll,
              single_options: item.single_options || '',
              multi_options: item.multi_options || '',
              qualified_options: item.qualified_options || '',
              default_value: item.default_value || ''
            }
          }
        );
        imported++;
      } catch (e) {}
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) { next(err); }
};

export const approveQualityCharacteristic = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE quality_characteristic SET approval_status = N'已审核' WHERE char_name = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawQualityCharacteristic = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE quality_characteristic SET approval_status = N'未审核' WHERE char_name = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};
