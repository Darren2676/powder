import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';

export const getConversions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';

    let whereClause = '';
    const replacements: any = {};
    if (search) {
      whereClause = `WHERE uf.unit_name LIKE :search OR ut.unit_name LIKE :search`;
      replacements.search = `%${search}%`;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM unit_conversion uc
       LEFT JOIN unit uf ON uc.from_unit_code = uf.unit_code
       LEFT JOIN unit ut ON uc.to_unit_code = ut.unit_code
       ${whereClause}`,
      { replacements }
    );
    const total = countResult[0].total;
    const offset = (page - 1) * limit;

    const [items]: any = await sequelize.query(
      `SELECT * FROM (
        SELECT uc.id, uc.from_unit_code, uf.unit_name AS from_unit_name,
               uc.to_unit_code, ut.unit_name AS to_unit_name,
               uc.conversion_rate, uc.remark,
               ROW_NUMBER() OVER (ORDER BY uc.id) AS _row_num
        FROM unit_conversion uc
        LEFT JOIN unit uf ON uc.from_unit_code = uf.unit_code
        LEFT JOIN unit ut ON uc.to_unit_code = ut.unit_code
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`,
      { replacements: { ...replacements, offset, offsetEnd: offset + limit } }
    );

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取单位换算列表成功'));
  } catch (err) { next(err); }
};

export const createConversion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.from_unit_code || !b.to_unit_code) {
      res.status(400).json({ success: false, message: '源单位和目标单位不能为空' });
      return;
    }
    if (b.from_unit_code === b.to_unit_code) {
      res.status(400).json({ success: false, message: '源单位和目标单位不能相同' });
      return;
    }
    if (!b.conversion_rate || b.conversion_rate <= 0) {
      res.status(400).json({ success: false, message: '换算率必须大于0' });
      return;
    }

    // 检查是否已存在
    const [existing]: any = await sequelize.query(
      `SELECT id FROM unit_conversion WHERE from_unit_code = :from AND to_unit_code = :to`,
      { replacements: { from: b.from_unit_code, to: b.to_unit_code } }
    );
    if (existing.length > 0) {
      res.status(400).json({ success: false, message: '该换算关系已存在' });
      return;
    }

    await sequelize.query(
      `INSERT INTO unit_conversion (from_unit_code, to_unit_code, conversion_rate, remark)
       VALUES (:from_unit_code, :to_unit_code, :conversion_rate, :remark)`,
      { replacements: { from_unit_code: b.from_unit_code, to_unit_code: b.to_unit_code, conversion_rate: b.conversion_rate, remark: b.remark || '' } }
    );

    res.json(success(null, '创建换算关系成功'));
  } catch (err) { next(err); }
};

export const updateConversion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    if (!b.conversion_rate || b.conversion_rate <= 0) {
      res.status(400).json({ success: false, message: '换算率必须大于0' });
      return;
    }

    await sequelize.query(
      `UPDATE unit_conversion SET conversion_rate = :conversion_rate, remark = :remark WHERE id = :id`,
      { replacements: { id, conversion_rate: b.conversion_rate, remark: b.remark || '' } }
    );

    res.json(success(null, '更新换算关系成功'));
  } catch (err) { next(err); }
};

export const deleteConversion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`DELETE FROM unit_conversion WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '删除换算关系成功'));
  } catch (err) { next(err); }
};

// 查询换算：根据源单位和目标单位获取换算率
export const convert = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      res.status(400).json({ success: false, message: '请提供源单位和目标单位' });
      return;
    }

    const [result]: any = await sequelize.query(
      `SELECT uc.conversion_rate, uf.unit_name AS from_unit_name, ut.unit_name AS to_unit_name
       FROM unit_conversion uc
       LEFT JOIN unit uf ON uc.from_unit_code = uf.unit_code
       LEFT JOIN unit ut ON uc.to_unit_code = ut.unit_code
       WHERE uc.from_unit_code = :from AND uc.to_unit_code = :to`,
      { replacements: { from, to } }
    );

    if (result.length === 0) {
      res.status(404).json({ success: false, message: '未找到对应的换算关系' });
      return;
    }

    res.json(success(result[0], '查询换算率成功'));
  } catch (err) { next(err); }
};
