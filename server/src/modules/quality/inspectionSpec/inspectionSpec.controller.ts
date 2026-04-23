import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';

// ========== 主表 CRUD ==========

export const getInspectionSpecs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const spec_type = (req.query.spec_type as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};
    if (search) {
      conditions.push(`(spec_name LIKE :search OR defect_categories LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (spec_type) {
      conditions.push(`spec_type = :spec_type`);
      replacements.spec_type = spec_type;
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM inspection_spec ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY spec_name) AS _row_num
        FROM inspection_spec ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取检验规范列表成功'));
  } catch (err) { next(err); }
};

export const getInspectionSpecDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(
      `SELECT * FROM inspection_spec WHERE spec_name = :id`,
      { replacements: { id } }
    );
    if (!headers.length) {
      res.status(404).json({ success: false, message: '检验规范不存在' });
      return;
    }
    const [details]: any = await sequelize.query(
      `SELECT * FROM inspection_spec_item WHERE spec_name = :id ORDER BY sort_order, id`,
      { replacements: { id } }
    );
    res.json(success({ header: headers[0], details }, '获取检验规范详情成功'));
  } catch (err) { next(err); }
};

export const createInspectionSpec = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.spec_name) {
      res.status(400).json({ success: false, message: '检验规范名称不能为空' });
      return;
    }
    const creation_man = (req as any).user?.username || '';
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO inspection_spec (spec_name, defect_categories, creation_man, spec_type)
        VALUES (:spec_name, :defect_categories, :creation_man, :spec_type)
      `, {
        replacements: {
          spec_name: b.spec_name,
          defect_categories: b.defect_categories || '',
          creation_man,
          spec_type: b.spec_type || '来料'
        },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO inspection_spec_item (spec_name, item_type, char_name, char_category, inspect_requirement,
              data_type, allow_multiple, upper_limit, standard_value, lower_limit,
              single_options, multi_options, qualified_options, default_result, default_value,
              is_required, required_range, sort_order)
            VALUES (:spec_name, :item_type, :char_name, :char_category, :inspect_requirement,
              :data_type, :allow_multiple, :upper_limit, :standard_value, :lower_limit,
              :single_options, :multi_options, :qualified_options, :default_result, :default_value,
              :is_required, :required_range, :sort_order)
          `, {
            replacements: {
              spec_name: b.spec_name,
              item_type: d.item_type || '质量特性',
              char_name: d.char_name || '',
              char_category: d.char_category || '',
              inspect_requirement: d.inspect_requirement || '',
              data_type: d.data_type || '',
              allow_multiple: d.allow_multiple || '否',
              upper_limit: d.upper_limit != null && d.upper_limit !== '' ? Number(d.upper_limit) : null,
              standard_value: d.standard_value != null && d.standard_value !== '' ? Number(d.standard_value) : null,
              lower_limit: d.lower_limit != null && d.lower_limit !== '' ? Number(d.lower_limit) : null,
              single_options: d.single_options || '',
              multi_options: d.multi_options || '',
              qualified_options: d.qualified_options || '',
              default_result: d.default_result || '合格',
              default_value: d.default_value || '',
              is_required: d.is_required || '否',
              required_range: d.required_range || '',
              sort_order: d.sort_order || (i + 1) * 10
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success({ spec_name: b.spec_name }, '创建检验规范成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

export const updateInspectionSpec = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM inspection_spec WHERE spec_name = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' }); return; }
    const b = req.body;
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE inspection_spec SET defect_categories = :defect_categories WHERE spec_name = :id
      `, {
        replacements: { id, defect_categories: b.defect_categories || '' },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        await sequelize.query(
          `DELETE FROM inspection_spec_item WHERE spec_name = :id`,
          { replacements: { id }, transaction }
        );
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO inspection_spec_item (spec_name, item_type, char_name, char_category, inspect_requirement,
              data_type, allow_multiple, upper_limit, standard_value, lower_limit,
              single_options, multi_options, qualified_options, default_result, default_value,
              is_required, required_range, sort_order)
            VALUES (:spec_name, :item_type, :char_name, :char_category, :inspect_requirement,
              :data_type, :allow_multiple, :upper_limit, :standard_value, :lower_limit,
              :single_options, :multi_options, :qualified_options, :default_result, :default_value,
              :is_required, :required_range, :sort_order)
          `, {
            replacements: {
              spec_name: id,
              item_type: d.item_type || '质量特性',
              char_name: d.char_name || '',
              char_category: d.char_category || '',
              inspect_requirement: d.inspect_requirement || '',
              data_type: d.data_type || '',
              allow_multiple: d.allow_multiple || '否',
              upper_limit: d.upper_limit != null && d.upper_limit !== '' ? Number(d.upper_limit) : null,
              standard_value: d.standard_value != null && d.standard_value !== '' ? Number(d.standard_value) : null,
              lower_limit: d.lower_limit != null && d.lower_limit !== '' ? Number(d.lower_limit) : null,
              single_options: d.single_options || '',
              multi_options: d.multi_options || '',
              qualified_options: d.qualified_options || '',
              default_result: d.default_result || '合格',
              default_value: d.default_value || '',
              is_required: d.is_required || '否',
              required_range: d.required_range || '',
              sort_order: d.sort_order || (i + 1) * 10
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success(null, '更新检验规范成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

export const deleteInspectionSpec = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM inspection_spec WHERE spec_name = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许删除，请先撤消审核' }); return; }
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(
        `DELETE FROM inspection_spec_item WHERE spec_name = :id`,
        { replacements: { id }, transaction }
      );
      await sequelize.query(
        `DELETE FROM inspection_spec WHERE spec_name = :id`,
        { replacements: { id }, transaction }
      );
      await transaction.commit();
      res.json(success(null, '删除检验规范成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

export const exportInspectionSpecs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [rows]: any = await sequelize.query(`
      SELECT h.spec_name, h.defect_categories,
        d.item_type, d.char_name, d.char_category, d.inspect_requirement,
        d.data_type, d.allow_multiple, d.upper_limit, d.standard_value, d.lower_limit,
        d.single_options, d.multi_options, d.qualified_options,
        d.default_result, d.default_value, d.is_required, d.required_range
      FROM inspection_spec h
      LEFT JOIN inspection_spec_item d ON h.spec_name = d.spec_name
      ORDER BY h.spec_name, d.sort_order, d.id
    `);

    const fields = ['spec_name', 'defect_categories', 'item_type', 'char_name', 'char_category',
      'inspect_requirement', 'data_type', 'allow_multiple', 'upper_limit', 'standard_value', 'lower_limit',
      'single_options', 'multi_options', 'qualified_options', 'default_result', 'default_value',
      'is_required', 'required_range'];
    const headers = ['检验规范名', '缺陷分类', '类型', '质量特性名称', '质量特性分类',
      '检验要求', '数据类型', '允许输入多项', '上限', '标准值', '下限',
      '单选项', '多选项', '合格项', '默认结果', '默认值', '必填项', '必填范围'];

    exportToExcel(rows, fields, headers, 'inspection_specs', res);
  } catch (err) { next(err); }
};

// ========== 明细 CRUD ==========

export const getInspectionSpecItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    const [items]: any = await sequelize.query(
      `SELECT * FROM inspection_spec_item WHERE spec_name = :headerId ORDER BY sort_order, id`,
      { replacements: { headerId } }
    );
    res.json(success(items, '获取明细列表成功'));
  } catch (err) { next(err); }
};

export const addInspectionSpecItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    const d = req.body;

    const [maxSort]: any = await sequelize.query(
      `SELECT MAX(sort_order) as ms FROM inspection_spec_item WHERE spec_name = :headerId`,
      { replacements: { headerId } }
    );
    const sort_order = (maxSort[0].ms || 0) + 10;

    await sequelize.query(`
      INSERT INTO inspection_spec_item (spec_name, item_type, char_name, char_category, inspect_requirement,
        data_type, allow_multiple, upper_limit, standard_value, lower_limit,
        single_options, multi_options, qualified_options, default_result, default_value,
        is_required, required_range, sort_order)
      VALUES (:spec_name, :item_type, :char_name, :char_category, :inspect_requirement,
        :data_type, :allow_multiple, :upper_limit, :standard_value, :lower_limit,
        :single_options, :multi_options, :qualified_options, :default_result, :default_value,
        :is_required, :required_range, :sort_order)
    `, {
      replacements: {
        spec_name: headerId,
        item_type: d.item_type || '质量特性',
        char_name: d.char_name || '',
        char_category: d.char_category || '',
        inspect_requirement: d.inspect_requirement || '',
        data_type: d.data_type || '',
        allow_multiple: d.allow_multiple || '否',
        upper_limit: d.upper_limit != null && d.upper_limit !== '' ? Number(d.upper_limit) : null,
        standard_value: d.standard_value != null && d.standard_value !== '' ? Number(d.standard_value) : null,
        lower_limit: d.lower_limit != null && d.lower_limit !== '' ? Number(d.lower_limit) : null,
        single_options: d.single_options || '',
        multi_options: d.multi_options || '',
        qualified_options: d.qualified_options || '',
        default_result: d.default_result || '合格',
        default_value: d.default_value || '',
        is_required: d.is_required || '否',
        required_range: d.required_range || '',
        sort_order
      }
    });

    res.json(success(null, '新增明细成功'));
  } catch (err) { next(err); }
};

export const updateInspectionSpecItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const d = req.body;

    await sequelize.query(`
      UPDATE inspection_spec_item SET
        item_type = :item_type, char_name = :char_name, char_category = :char_category,
        inspect_requirement = :inspect_requirement, data_type = :data_type, allow_multiple = :allow_multiple,
        upper_limit = :upper_limit, standard_value = :standard_value, lower_limit = :lower_limit,
        single_options = :single_options, multi_options = :multi_options, qualified_options = :qualified_options,
        default_result = :default_result, default_value = :default_value,
        is_required = :is_required, required_range = :required_range
      WHERE id = :detailId
    `, {
      replacements: {
        detailId,
        item_type: d.item_type || '质量特性',
        char_name: d.char_name || '',
        char_category: d.char_category || '',
        inspect_requirement: d.inspect_requirement || '',
        data_type: d.data_type || '',
        allow_multiple: d.allow_multiple || '否',
        upper_limit: d.upper_limit != null && d.upper_limit !== '' ? Number(d.upper_limit) : null,
        standard_value: d.standard_value != null && d.standard_value !== '' ? Number(d.standard_value) : null,
        lower_limit: d.lower_limit != null && d.lower_limit !== '' ? Number(d.lower_limit) : null,
        single_options: d.single_options || '',
        multi_options: d.multi_options || '',
        qualified_options: d.qualified_options || '',
        default_result: d.default_result || '合格',
        default_value: d.default_value || '',
        is_required: d.is_required || '否',
        required_range: d.required_range || ''
      }
    });

    res.json(success(null, '更新明细成功'));
  } catch (err) { next(err); }
};

export const deleteInspectionSpecItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    await sequelize.query(
      `DELETE FROM inspection_spec_item WHERE id = :detailId`,
      { replacements: { detailId } }
    );
    res.json(success(null, '删除明细成功'));
  } catch (err) { next(err); }
};

export const approveInspectionSpec = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE inspection_spec SET approval_status = N'已审核' WHERE spec_name = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawInspectionSpec = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE inspection_spec SET approval_status = N'未审核' WHERE spec_name = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};
