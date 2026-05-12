import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';

// 查询BOM列表
export const openGetBomHeaders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = (req.query.search as string) || '';
    const bom_type = (req.query.bom_type as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(bom_number LIKE :search OR bom_name LIKE :search OR item_number LIKE :search OR item_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (bom_type) {
      conditions.push(`bom_type = :bom_type`);
      replacements.bom_type = bom_type;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM bom_header ${whereClause}`, { replacements });
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT bom_number, bom_name, bom_type, bom_version, item_number, item_name, base_quantity, [condition], approval_status, remark, creation_date,
               ROW_NUMBER() OVER (ORDER BY bom_number) AS _row_num
        FROM bom_header ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取BOM列表成功'));
  } catch (err) { next(err); }
};

// 查询BOM详情
export const openGetBomDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const [headers]: any = await sequelize.query(`SELECT * FROM bom_header WHERE bom_number = :id`, { replacements: { id } });
    if (headers.length === 0) {
      return res.status(404).json({ success: false, message: 'BOM不存在' });
    }
    const [details]: any = await sequelize.query(`SELECT * FROM bom_detail WHERE bom_number = :id ORDER BY line_number`, { replacements: { id } });
    res.json(success({ header: headers[0], details }, '获取BOM详情成功'));
  } catch (err) { next(err); }
};

// 查询BOM树形结构
export const openGetBomTree = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const [headers]: any = await sequelize.query(`SELECT * FROM bom_header WHERE bom_number = :id`, { replacements: { id } });
    if (headers.length === 0) {
      return res.status(404).json({ success: false, message: 'BOM不存在' });
    }

    // 递归获取BOM树（最多5层）
    const buildTree = async (bomNumber: string, level: number): Promise<any[]> => {
      if (level > 5) return [];
      const [details]: any = await sequelize.query(
        `SELECT * FROM bom_detail WHERE bom_number = :bn ORDER BY line_number`,
        { replacements: { bn: bomNumber } }
      );
      const result = [];
      for (const d of details) {
        const node: any = { ...d, children: [] };
        // 检查子BOM
        const childBomNumber = d.child_bom_number;
        if (childBomNumber) {
          node.children = await buildTree(childBomNumber, level + 1);
        } else {
          // 自动查找是否有子BOM
          const [childBom]: any = await sequelize.query(
            `SELECT TOP 1 bom_number FROM bom_header WHERE item_number = :itemNumber AND [condition] = N'启用'`,
            { replacements: { itemNumber: d.material_number } }
          );
          if (childBom.length > 0) {
            node.children = await buildTree(childBom[0].bom_number, level + 1);
          }
        }
        result.push(node);
      }
      return result;
    };

    const tree = await buildTree(id, 1);
    res.json(success({ header: headers[0], tree }, '获取BOM树成功'));
  } catch (err) { next(err); }
};

// 查询BOM扁平化
export const openGetBomFlatten = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const [headers]: any = await sequelize.query(`SELECT * FROM bom_header WHERE bom_number = :id`, { replacements: { id } });
    if (headers.length === 0) {
      return res.status(404).json({ success: false, message: 'BOM不存在' });
    }

    // 递归扁平化（最多5层）
    const flatten: any[] = [];
    const flattenBom = async (bomNumber: string, level: number, parentPath: string) => {
      if (level > 5) return;
      const [details]: any = await sequelize.query(
        `SELECT * FROM bom_detail WHERE bom_number = :bn ORDER BY line_number`,
        { replacements: { bn: bomNumber } }
      );
      for (const d of details) {
        const path = parentPath ? `${parentPath} > ${d.material_name || d.material_number}` : (d.material_name || d.material_number);
        flatten.push({ ...d, level, path });

        const childBomNumber = d.child_bom_number;
        if (childBomNumber) {
          await flattenBom(childBomNumber, level + 1, path);
        } else {
          const [childBom]: any = await sequelize.query(
            `SELECT TOP 1 bom_number FROM bom_header WHERE item_number = :itemNumber AND [condition] = N'启用'`,
            { replacements: { itemNumber: d.material_number } }
          );
          if (childBom.length > 0) {
            await flattenBom(childBom[0].bom_number, level + 1, path);
          }
        }
      }
    };

    await flattenBom(id, 1, '');
    res.json(success({ header: headers[0], items: flatten }, '获取BOM扁平列表成功'));
  } catch (err) { next(err); }
};
