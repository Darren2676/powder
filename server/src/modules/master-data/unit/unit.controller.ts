import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';

const fields = ['unit_code', 'unit_name', 'remark'];
const headers = ['单位编码', '单位名称', '备注'];

export const getUnits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};
    if (search) { whereClause = `WHERE unit_code LIKE :search OR unit_name LIKE :search`; replacements.search = `%${search}%`; }
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM unit ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY unit_code) AS _row_num FROM unit ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取单位列表成功'));
  } catch (err) { next(err); }
};

export const createUnit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.unit_code) { res.status(400).json({ success: false, message: '单位编码不能为空' }); return; }
    await sequelize.query(
      `INSERT INTO unit (unit_code, unit_name, remark, default_product, default_semi, default_material)
       VALUES (:unit_code, :unit_name, :remark, :default_product, :default_semi, :default_material)`,
      { replacements: { unit_code: b.unit_code, unit_name: b.unit_name || '', remark: b.remark || '', default_product: b.default_product ? 1 : 0, default_semi: b.default_semi ? 1 : 0, default_material: b.default_material ? 1 : 0 } }
    );
    // 保存换算关系（前端传 to_unit_name，需转为 to_unit_code）
    if (Array.isArray(b.conversions)) {
      for (const conv of b.conversions) {
        const toName = conv.to_unit_name;
        if (toName && conv.conversion_rate > 0) {
          const [found]: any = await sequelize.query(`SELECT unit_code FROM unit WHERE unit_name = :name`, { replacements: { name: toName } });
          if (found.length > 0) {
            const toCode = found[0].unit_code;
            await sequelize.query(
              `IF NOT EXISTS (SELECT 1 FROM unit_conversion WHERE from_unit_code = :from AND to_unit_code = :to)
               INSERT INTO unit_conversion (from_unit_code, to_unit_code, conversion_rate, remark) VALUES (:from, :to, :rate, :remark)`,
              { replacements: { from: b.unit_code, to: toCode, rate: conv.conversion_rate, remark: conv.remark || '' } }
            );
          }
        }
      }
    }
    res.json(success(null, '创建单位成功'));
  } catch (err) { next(err); }
};

export const updateUnit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM unit WHERE unit_code = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' }); return; }
    const b = req.body;
    await sequelize.query(
      `UPDATE unit SET unit_name = :unit_name, remark = :remark,
       default_product = :default_product, default_semi = :default_semi, default_material = :default_material
       WHERE unit_code = :id`,
      { replacements: { id, unit_name: b.unit_name, remark: b.remark || '', default_product: b.default_product ? 1 : 0, default_semi: b.default_semi ? 1 : 0, default_material: b.default_material ? 1 : 0 } }
    );
    // 同步换算关系：先删除该单位的所有换算，再重新插入（前端传 to_unit_name）
    if (Array.isArray(b.conversions)) {
      await sequelize.query(`DELETE FROM unit_conversion WHERE from_unit_code = :id`, { replacements: { id } });
      for (const conv of b.conversions) {
        const toName = conv.to_unit_name;
        if (toName && conv.conversion_rate > 0) {
          const [found]: any = await sequelize.query(`SELECT unit_code FROM unit WHERE unit_name = :name`, { replacements: { name: toName } });
          if (found.length > 0) {
            const toCode = found[0].unit_code;
            await sequelize.query(
              `INSERT INTO unit_conversion (from_unit_code, to_unit_code, conversion_rate, remark) VALUES (:from, :to, :rate, :remark)`,
              { replacements: { from: id, to: toCode, rate: conv.conversion_rate, remark: conv.remark || '' } }
            );
          }
        }
      }
    }
    res.json(success(null, '更新单位成功'));
  } catch (err) { next(err); }
};

export const approveUnit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE unit SET approval_status = N'已审核' WHERE unit_code = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawUnit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE unit SET approval_status = N'未审核' WHERE unit_code = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};

export const deleteUnit = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM unit WHERE unit_code = :id`, { replacements: { id } });
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) { res.status(403).json({ success: false, message: '已审核的记录不允许删除，请先撤消审核' }); return; }
    await sequelize.query(`DELETE FROM unit WHERE unit_code = :id`, { replacements: { id } });
    res.json(success(null, '删除单位成功'));
  } catch (err) { next(err); }
};

export const exportUnits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM unit ORDER BY unit_code`);
    exportToExcel(items, fields, headers, 'units', res);
  } catch (err) { next(err); }
};

export const importUnits = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }
    let imported = 0;
    for (const item of rows) {
      try {
        await sequelize.query(`INSERT INTO unit (unit_code, unit_name, remark) VALUES (:unit_code, :unit_name, :remark)`, {
          replacements: { unit_code: item.unit_code || '', unit_name: item.unit_name || '', remark: item.remark || '' }
        });
        imported++;
      } catch {}
    }
    res.json(success({ total: rows.length, imported }, '导入完成'));
  } catch (err) { next(err); }
};

// 获取指定单位的换算关系列表
export const getUnitConversions = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [items]: any = await sequelize.query(
      `SELECT uc.id, uc.from_unit_code, uc.to_unit_code, ut.unit_name AS to_unit_name,
              uc.conversion_rate, uc.remark
       FROM unit_conversion uc
       LEFT JOIN unit ut ON uc.to_unit_code = ut.unit_code
       WHERE uc.from_unit_code = :id
       ORDER BY uc.id`,
      { replacements: { id } }
    );
    res.json(success(items, '获取换算关系成功'));
  } catch (err) { next(err); }
};

// 获取所有单位（不分页，用于下拉选择）
export const getAllUnits = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT unit_code, unit_name FROM unit ORDER BY unit_code`);
    res.json(success(items, '获取单位列表成功'));
  } catch (err) { next(err); }
};

export const toggleUnitStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE unit SET status = CASE WHEN ISNULL(status, N'启用') = N'启用' THEN N'禁用' ELSE N'启用' END WHERE unit_code = :id`, { replacements: { id } });
    res.json(success(null, '状态更新成功'));
  } catch (err) { next(err); }
};
