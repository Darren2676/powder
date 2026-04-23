import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';

// ========== 主表 CRUD ==========

export const getIncomingInspectSpecs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};
    if (search) {
      conditions.push(`(spec_name LIKE :search OR defect_categories LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM incoming_inspect_spec ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY spec_name) AS _row_num
        FROM incoming_inspect_spec ${whereClause}
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
    }, '获取来料检验规范列表成功'));
  } catch (err) { next(err); }
};

export const createIncomingInspectSpec = async (req: Request, res: Response, next: NextFunction) => {
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
        INSERT INTO incoming_inspect_spec (spec_name, defect_categories, creation_man)
        VALUES (:spec_name, :defect_categories, :creation_man)
      `, {
        replacements: {
          spec_name: b.spec_name,
          defect_categories: b.defect_categories || '',
          creation_man
        },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO incoming_inspect_spec_item (spec_name, item_type, char_name, char_category, inspect_requirement,
              data_type, allow_multiple, upper_limit, standard_value, lower_limit,
              single_options, multi_options, qualified_options, default_result, default_value,
              is_required, required_range, applied_category, sort_order)
            VALUES (:spec_name, :item_type, :char_name, :char_category, :inspect_requirement,
              :data_type, :allow_multiple, :upper_limit, :standard_value, :lower_limit,
              :single_options, :multi_options, :qualified_options, :default_result, :default_value,
              :is_required, :required_range, :applied_category, :sort_order)
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
              applied_category: d.applied_category || '',
              sort_order: d.sort_order || (i + 1) * 10
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success({ spec_name: b.spec_name }, '创建来料检验规范成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

export const updateIncomingInspectSpec = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM incoming_inspect_spec WHERE spec_name = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' }); return; }
    const b = req.body;
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE incoming_inspect_spec SET defect_categories = :defect_categories WHERE spec_name = :id
      `, {
        replacements: { id, defect_categories: b.defect_categories || '' },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        await sequelize.query(
          `DELETE FROM incoming_inspect_spec_item WHERE spec_name = :id`,
          { replacements: { id }, transaction }
        );
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO incoming_inspect_spec_item (spec_name, item_type, char_name, char_category, inspect_requirement,
              data_type, allow_multiple, upper_limit, standard_value, lower_limit,
              single_options, multi_options, qualified_options, default_result, default_value,
              is_required, required_range, applied_category, sort_order)
            VALUES (:spec_name, :item_type, :char_name, :char_category, :inspect_requirement,
              :data_type, :allow_multiple, :upper_limit, :standard_value, :lower_limit,
              :single_options, :multi_options, :qualified_options, :default_result, :default_value,
              :is_required, :required_range, :applied_category, :sort_order)
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
              applied_category: d.applied_category || '',
              sort_order: d.sort_order || (i + 1) * 10
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success(null, '更新来料检验规范成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

export const deleteIncomingInspectSpec = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM incoming_inspect_spec WHERE spec_name = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许删除，请先撤消审核' }); return; }
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(
        `DELETE FROM incoming_inspect_spec_item WHERE spec_name = :id`,
        { replacements: { id }, transaction }
      );
      await sequelize.query(
        `DELETE FROM incoming_inspect_spec WHERE spec_name = :id`,
        { replacements: { id }, transaction }
      );
      await transaction.commit();
      res.json(success(null, '删除来料检验规范成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

export const exportIncomingInspectSpecs = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [rows]: any = await sequelize.query(`
      SELECT h.spec_name, h.defect_categories,
        d.item_type, d.char_name, d.char_category, d.inspect_requirement,
        d.data_type, d.allow_multiple, d.upper_limit, d.standard_value, d.lower_limit,
        d.single_options, d.multi_options, d.qualified_options,
        d.default_result, d.default_value, d.is_required, d.required_range, d.applied_category
      FROM incoming_inspect_spec h
      LEFT JOIN incoming_inspect_spec_item d ON h.spec_name = d.spec_name
      ORDER BY h.spec_name, d.sort_order, d.id
    `);

    const fields = ['spec_name', 'defect_categories', 'item_type', 'char_name', 'char_category',
      'inspect_requirement', 'data_type', 'allow_multiple', 'upper_limit', 'standard_value', 'lower_limit',
      'single_options', 'multi_options', 'qualified_options', 'default_result', 'default_value',
      'is_required', 'required_range', 'applied_category'];
    const headers = ['检验规范名', '缺陷分类', '类型', '质量特性名称', '质量特性分类',
      '检验要求', '数据类型', '允许输入多项', '上限', '标准值', '下限',
      '单选项', '多选项', '合格项', '默认结果', '默认值', '必填项', '必填范围', '应用于分类'];

    exportToExcel(rows, fields, headers, 'incoming_inspect_specs', res);
  } catch (err) { next(err); }
};

// ========== 明细 CRUD ==========

export const getIncomingInspectSpecItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    const [items]: any = await sequelize.query(
      `SELECT * FROM incoming_inspect_spec_item WHERE spec_name = :headerId ORDER BY sort_order, id`,
      { replacements: { headerId } }
    );
    res.json(success(items, '获取明细列表成功'));
  } catch (err) { next(err); }
};

export const addIncomingInspectSpecItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    const d = req.body;

    const [maxSort]: any = await sequelize.query(
      `SELECT MAX(sort_order) as ms FROM incoming_inspect_spec_item WHERE spec_name = :headerId`,
      { replacements: { headerId } }
    );
    const sort_order = (maxSort[0].ms || 0) + 10;

    await sequelize.query(`
      INSERT INTO incoming_inspect_spec_item (spec_name, item_type, char_name, char_category, inspect_requirement,
        data_type, allow_multiple, upper_limit, standard_value, lower_limit,
        single_options, multi_options, qualified_options, default_result, default_value,
        is_required, required_range, applied_category, sort_order)
      VALUES (:spec_name, :item_type, :char_name, :char_category, :inspect_requirement,
        :data_type, :allow_multiple, :upper_limit, :standard_value, :lower_limit,
        :single_options, :multi_options, :qualified_options, :default_result, :default_value,
        :is_required, :required_range, :applied_category, :sort_order)
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
        applied_category: d.applied_category || '',
        sort_order
      }
    });

    res.json(success(null, '新增明细成功'));
  } catch (err) { next(err); }
};

export const updateIncomingInspectSpecItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const d = req.body;

    await sequelize.query(`
      UPDATE incoming_inspect_spec_item SET
        item_type = :item_type, char_name = :char_name, char_category = :char_category,
        inspect_requirement = :inspect_requirement, data_type = :data_type, allow_multiple = :allow_multiple,
        upper_limit = :upper_limit, standard_value = :standard_value, lower_limit = :lower_limit,
        single_options = :single_options, multi_options = :multi_options, qualified_options = :qualified_options,
        default_result = :default_result, default_value = :default_value,
        is_required = :is_required, required_range = :required_range, applied_category = :applied_category
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
        required_range: d.required_range || '',
        applied_category: d.applied_category || ''
      }
    });

    res.json(success(null, '更新明细成功'));
  } catch (err) { next(err); }
};

export const deleteIncomingInspectSpecItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    await sequelize.query(
      `DELETE FROM incoming_inspect_spec_item WHERE id = :detailId`,
      { replacements: { detailId } }
    );
    res.json(success(null, '删除明细成功'));
  } catch (err) { next(err); }
};

export const approveIncomingInspectSpec = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE incoming_inspect_spec SET approval_status = N'已审核' WHERE spec_name = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawIncomingInspectSpec = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE incoming_inspect_spec SET approval_status = N'未审核' WHERE spec_name = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};
