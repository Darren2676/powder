import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success, paginate } from '../../../utils/response.util';
import { BusinessError } from '../../../shared/errors/BusinessError';
import { lookupBatchRule } from '@/services/inventory.service';

// ==================== 列表查询 ====================
export const getBatchNumberRules = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number, factory_id, batch_rule_mode, is_active, keyword, page = '1', pageSize = '20' } = req.query as any;
    const p = Math.max(1, parseInt(page) || 1);
    const ps = Math.min(100, Math.max(1, parseInt(pageSize) || 20));
    const offset = (p - 1) * ps;

    let where = 'WHERE 1=1';
    const reps: any = {};

    if (keyword) {
      where += ` AND (r.item_number LIKE :kw OR r.item_name LIKE :kw)`;
      reps.kw = `%${keyword}%`;
    } else if (item_number) {
      where += ` AND r.item_number = :item_number`;
      reps.item_number = item_number;
    }
    if (factory_id !== undefined && factory_id !== '') {
      if (factory_id === 'null' || factory_id === '0') {
        where += ` AND r.factory_id IS NULL`;
      } else {
        where += ` AND r.factory_id = :factory_id`;
        reps.factory_id = parseInt(factory_id);
      }
    }
    if (batch_rule_mode) {
      where += ` AND r.batch_rule_mode = :batch_rule_mode`;
      reps.batch_rule_mode = batch_rule_mode;
    }
    if (is_active) {
      where += ` AND r.is_active = :is_active`;
      reps.is_active = is_active;
    }

    const [countRows]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM batch_number_rule_config r ${where}`,
      { replacements: reps }
    );
    const total = countRows[0].total;

    const [rows]: any = await sequelize.query(
      `SELECT * FROM (
        SELECT r.*, f.factory_name, ROW_NUMBER() OVER (ORDER BY r.id DESC) AS _rn
        FROM batch_number_rule_config r
        LEFT JOIN factory f ON r.factory_id = f.id
        ${where}
      ) AS t WHERE t._rn > :offset AND t._rn <= :offsetEnd ORDER BY t._rn`,
      { replacements: { ...reps, offset, offsetEnd: offset + ps } }
    );
    const cleanRows = rows.map((r: any) => { const { _rn, ...rest } = r; return rest; });

    res.json(paginate(cleanRows, total, p, ps));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getBatchNumberRuleById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BusinessError(400, '无效的ID');

    const [rows]: any = await sequelize.query(
      `SELECT r.*, f.factory_name FROM batch_number_rule_config r
       LEFT JOIN factory f ON r.factory_id = f.id
       WHERE r.id = :id`,
      { replacements: { id } }
    );
    if (rows.length === 0) throw new BusinessError(404, '规则不存在');
    res.json(success(rows[0], '查询成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createBatchNumberRule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number, item_name, batch_rule_mode, batch_number_template, is_active, append_split_seq } = req.body;
    let { factory_id } = req.body;
    // 识别前端显式传递的"全部工厂"标记：null、0、空字符串 → 数据库存NULL
    if (factory_id === null || factory_id === 0 || factory_id === '') {
      factory_id = null;
    }
    if (!item_number) throw new BusinessError(400, '产品编号不能为空');
    if (!batch_rule_mode || !['A', 'B'].includes(batch_rule_mode)) throw new BusinessError(400, '产生模式必须为A或B');

    const username = (req as any).user?.username || '';

    // 唯一性校验
    const [dupRows]: any = await sequelize.query(
      `SELECT id FROM batch_number_rule_config WHERE item_number = :item_number AND ISNULL(factory_id, -1) = ISNULL(:factory_id, -1)`,
      { replacements: { item_number, factory_id: factory_id || null } }
    );
    if (dupRows.length > 0) throw new BusinessError(400, '该产品在同一工厂下已存在批次号规则');

    // 查询物料名称
    let itemName = item_name || '';
    if (!itemName) {
      const [imRows]: any = await sequelize.query(
        `SELECT TOP 1 item_name FROM item_master WHERE item_number = :item_number`,
        { replacements: { item_number } }
      );
      if (imRows.length > 0) itemName = imRows[0].item_name;
    }

    await sequelize.query(
      `INSERT INTO batch_number_rule_config (item_number, item_name, factory_id, batch_rule_mode, batch_number_template, append_split_seq, is_active, approval_status, creation_man, last_updater)
       VALUES (:item_number, :item_name, :factory_id, :batch_rule_mode, :batch_number_template, :append_split_seq, :is_active, N'未审核', :username, :username)`,
      {
        replacements: {
          item_number, item_name: itemName,
          factory_id,
          batch_rule_mode,
          batch_number_template: batch_number_template || 'FB-{plan_number}',
          append_split_seq: append_split_seq !== undefined ? (append_split_seq ? 1 : 0) : 1,
          is_active: is_active || '是',
          username
        }
      }
    );

    res.json(success(null, '创建成功'));
  } catch (err) { next(err); }
};

// ==================== 更新 ====================
export const updateBatchNumberRule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BusinessError(400, '无效的ID');
    const { item_number, item_name, batch_rule_mode, batch_number_template, is_active, append_split_seq } = req.body;
    let { factory_id } = req.body;
    // 识别前端显式传递的"全部工厂"标记
    if (factory_id === null || factory_id === 0 || factory_id === '') {
      factory_id = null;
    }
    const username = (req as any).user?.username || '';

    // 存在校验 + 审核检查
    const [existing]: any = await sequelize.query(
      `SELECT id, approval_status FROM batch_number_rule_config WHERE id = :id`,
      { replacements: { id } }
    );
    if (existing.length === 0) throw new BusinessError(404, '规则不存在');
    if ((existing[0].approval_status || '').trim() === '已审核') {
      throw new BusinessError(403, '已审核的记录不允许编辑，请先撤消审核');
    }

    // 唯一性校验（排除自身）
    if (item_number) {
      const [dupRows]: any = await sequelize.query(
        `SELECT id FROM batch_number_rule_config WHERE item_number = :item_number AND ISNULL(factory_id, -1) = ISNULL(:factory_id, -1) AND id != :id`,
        { replacements: { item_number, factory_id: factory_id || null, id } }
      );
      if (dupRows.length > 0) throw new BusinessError(400, '该产品在同一工厂下已存在批次号规则');
    }

    await sequelize.query(
      `UPDATE batch_number_rule_config SET
        item_number = :item_number, item_name = :item_name,
        factory_id = :factory_id, batch_rule_mode = :batch_rule_mode,
        batch_number_template = :batch_number_template, append_split_seq = :append_split_seq, is_active = :is_active,
        last_updater = :username, last_updated_at = GETDATE()
       WHERE id = :id`,
      {
        replacements: {
          id, item_number, item_name: item_name || '',
          factory_id,
          batch_rule_mode: batch_rule_mode || 'A',
          batch_number_template: batch_number_template || 'FB-{plan_number}',
          append_split_seq: append_split_seq !== undefined ? (append_split_seq ? 1 : 0) : 1,
          is_active: is_active || '是',
          username
        }
      }
    );

    res.json(success(null, '更新成功'));
  } catch (err) { next(err); }
};

// ==================== 删除 ====================
export const deleteBatchNumberRule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BusinessError(400, '无效的ID');

    const [existing]: any = await sequelize.query(
      `SELECT id, approval_status FROM batch_number_rule_config WHERE id = :id`,
      { replacements: { id } }
    );
    if (existing.length === 0) throw new BusinessError(404, '规则不存在');
    if ((existing[0].approval_status || '').trim() === '已审核') {
      throw new BusinessError(403, '已审核的记录不允许删除，请先撤消审核');
    }

    await sequelize.query(`DELETE FROM batch_number_rule_config WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '删除成功'));
  } catch (err) { next(err); }
};

// ==================== 查询指定产品的生效规则 ====================
export const lookupBatchNumberRule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number } = req.query as any;
    let { factory_id } = req.query as any;
    if (!item_number) throw new BusinessError(400, '请提供产品编号');
    // factory_id: null/0/空字符串 → null（全局匹配），否则取具体值
    let fid: number | null = null;
    if (factory_id && factory_id !== 'null' && factory_id !== '0' && factory_id !== '') {
      fid = parseInt(factory_id);
    }

    const rule = await lookupBatchRule(item_number, fid);
    res.json(success(rule, '查询成功'));
  } catch (err) { next(err); }
};

// ==================== 审核 ====================
export const approveBatchNumberRule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BusinessError(400, '无效的ID');

    const [existing]: any = await sequelize.query(
      `SELECT id, approval_status FROM batch_number_rule_config WHERE id = :id`,
      { replacements: { id } }
    );
    if (existing.length === 0) throw new BusinessError(404, '规则不存在');
    if ((existing[0].approval_status || '').trim() === '已审核') {
      throw new BusinessError(400, '该记录已审核');
    }

    await sequelize.query(
      `UPDATE batch_number_rule_config SET approval_status = N'已审核', last_updated_at = GETDATE() WHERE id = :id`,
      { replacements: { id } }
    );
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

// ==================== 撤消审核 ====================
export const withdrawBatchNumberRule = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    if (isNaN(id)) throw new BusinessError(400, '无效的ID');

    const [existing]: any = await sequelize.query(
      `SELECT id, approval_status FROM batch_number_rule_config WHERE id = :id`,
      { replacements: { id } }
    );
    if (existing.length === 0) throw new BusinessError(404, '规则不存在');
    if ((existing[0].approval_status || '').trim() !== '已审核') {
      throw new BusinessError(400, '该记录未审核，无需撤消');
    }

    await sequelize.query(
      `UPDATE batch_number_rule_config SET approval_status = N'未审核', last_updated_at = GETDATE() WHERE id = :id`,
      { replacements: { id } }
    );
    res.json(success(null, '撤消审核成功'));
  } catch (err) { next(err); }
};
