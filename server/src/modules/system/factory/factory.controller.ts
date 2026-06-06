import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success, paginate } from '../../../utils/response.util';

/**
 * GET /api/v1/factories
 * 分页获取工厂列表（用于管理页面）
 */
export const getFactories = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 50;
    const search = (req.query.search as string) || '';
    const status = req.query.status as string;

    const conditions: string[] = [];
    const replacements: Record<string, any> = {};

    if (search) {
      conditions.push(`(f.factory_code LIKE :search OR f.factory_name LIKE :search OR f.factory_short LIKE :search)`);
      replacements.search = `%${search}%`;
    }

    if (status) {
      conditions.push(`f.status = :status`);
      replacements.status = status;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await sequelize.query(
      `SELECT COUNT(1) as total FROM factory f ${whereClause}`,
      { replacements }
    );
    const total = (countResult as any)[0][0]?.total || 0;

    const offset = (page - 1) * limit;
    const rows = await sequelize.query(
      `SELECT * FROM (SELECT f.*, ROW_NUMBER() OVER (ORDER BY f.id) AS _rn FROM factory f ${whereClause}) AS t WHERE t._rn > :offset AND t._rn <= :offsetEnd ORDER BY t._rn`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );

    const cleanRows = ((rows as any)[0] || []).map((r: any) => { const { _rn, ...rest } = r; return rest; });
    res.json(paginate(cleanRows, total, page, limit));
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/v1/factories/:id
 * 获取单个工厂详情
 */
export const getFactoryById = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    const [rows]: any = await sequelize.query(
      `SELECT * FROM factory WHERE id = :id`,
      { replacements: { id } }
    );
    if (!rows[0]) {
      return res.status(404).json({ success: false, message: '工厂不存在' });
    }
    res.json(success(rows[0]));
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/factories
 * 创建工厂
 */
export const createFactory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { factory_code, factory_name, factory_short, address, contact_name, contact_phone, is_headquarters, status } = req.body;

    if (!factory_code || !factory_name) {
      return res.status(400).json({ success: false, message: '工厂编码和名称为必填项' });
    }

    // 检查编码唯一性
    const [existing]: any = await sequelize.query(
      `SELECT id FROM factory WHERE factory_code = :code`,
      { replacements: { code: factory_code } }
    );
    if (existing[0]) {
      return res.status(400).json({ success: false, message: `工厂编码 "${factory_code}" 已存在` });
    }

    const [result]: any = await sequelize.query(
      `INSERT INTO factory (factory_code, factory_name, factory_short, address, contact_name, contact_phone, is_headquarters, status)
       OUTPUT INSERTED.id
       VALUES (:factory_code, :factory_name, :factory_short, :address, :contact_name, :contact_phone, :is_headquarters, :status)`,
      {
        replacements: {
          factory_code,
          factory_name,
          factory_short: factory_short || factory_name,
          address: address || '',
          contact_name: contact_name || '',
          contact_phone: contact_phone || '',
          is_headquarters: is_headquarters ? 1 : 0,
          status: status || '启用'
        }
      }
    );

    const newId = (result as any)[0]?.id;
    res.status(201).json(success({ id: newId }, '工厂创建成功'));
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/v1/factories/:id
 * 更新工厂
 */
export const updateFactory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);
    const { factory_code, factory_name, factory_short, address, contact_name, contact_phone, is_headquarters, status } = req.body;

    // 检查工厂是否存在
    const [existing]: any = await sequelize.query(
      `SELECT id FROM factory WHERE id = :id`,
      { replacements: { id } }
    );
    if (!existing[0]) {
      return res.status(404).json({ success: false, message: '工厂不存在' });
    }

    // 如果修改了编码，检查唯一性
    if (factory_code) {
      const [dup]: any = await sequelize.query(
        `SELECT id FROM factory WHERE factory_code = :code AND id != :id`,
        { replacements: { code: factory_code, id } }
      );
      if (dup[0]) {
        return res.status(400).json({ success: false, message: `工厂编码 "${factory_code}" 已被其他工厂使用` });
      }
    }

    const setClauses: string[] = [];
    const replacements: Record<string, any> = { id };

    if (factory_code !== undefined) { setClauses.push('factory_code = :factory_code'); replacements.factory_code = factory_code; }
    if (factory_name !== undefined) { setClauses.push('factory_name = :factory_name'); replacements.factory_name = factory_name; }
    if (factory_short !== undefined) { setClauses.push('factory_short = :factory_short'); replacements.factory_short = factory_short; }
    if (address !== undefined) { setClauses.push('address = :address'); replacements.address = address; }
    if (contact_name !== undefined) { setClauses.push('contact_name = :contact_name'); replacements.contact_name = contact_name; }
    if (contact_phone !== undefined) { setClauses.push('contact_phone = :contact_phone'); replacements.contact_phone = contact_phone; }
    if (is_headquarters !== undefined) { setClauses.push('is_headquarters = :is_headquarters'); replacements.is_headquarters = is_headquarters ? 1 : 0; }
    if (status !== undefined) { setClauses.push('status = :status'); replacements.status = status; }

    if (setClauses.length === 0) {
      return res.status(400).json({ success: false, message: '没有需要更新的字段' });
    }

    setClauses.push('updated_at = GETDATE()');

    await sequelize.query(
      `UPDATE factory SET ${setClauses.join(', ')} WHERE id = :id`,
      { replacements }
    );

    res.json(success(null, '工厂更新成功'));
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/v1/factories/:id
 * 删除工厂（软删除，改为停用状态）
 */
export const deleteFactory = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseInt(req.params.id as string);

    const [existing]: any = await sequelize.query(
      `SELECT id, factory_code FROM factory WHERE id = :id`,
      { replacements: { id } }
    );
    if (!existing[0]) {
      return res.status(404).json({ success: false, message: '工厂不存在' });
    }

    // 检查是否为总部工厂
    if (existing[0].is_headquarters) {
      return res.status(400).json({ success: false, message: '总部工厂不可删除，请先取消总部标识' });
    }

    // 软删除：改为停用
    await sequelize.query(
      `UPDATE factory SET status = N'停用', updated_at = GETDATE() WHERE id = :id`,
      { replacements: { id } }
    );

    res.json(success(null, '工厂已停用'));
  } catch (err) {
    next(err);
  }
};
