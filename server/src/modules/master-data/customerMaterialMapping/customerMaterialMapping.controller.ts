import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';

// ==================== 列表查询 ====================
export const getList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page = 1, limit = 20, search = '', customer_number = '', item_number = '' } = req.query;
    const pageNum = Number(page);
    const pageSize = Number(limit);
    const offset = (pageNum - 1) * pageSize;
    const offsetEnd = offset + pageSize;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    if (customer_number) {
      whereClause += ` AND customer_number = :customer_number`;
      replacements.customer_number = customer_number;
    }
    if (item_number) {
      whereClause += ` AND item_number = :item_number`;
      replacements.item_number = item_number;
    }
    if (search) {
      whereClause += ` AND (customer_number LIKE :search OR customer_name LIKE :search OR item_number LIKE :search OR item_name LIKE :search OR customer_item_number LIKE :search OR customer_item_description LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM customer_material_mapping ${whereClause}`,
      { replacements }
    );

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY customer_number, item_number) AS _row_num
        FROM customer_material_mapping ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page: pageNum,
      limit: pageSize
    }));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(
      `SELECT * FROM customer_material_mapping WHERE id = :id`,
      { replacements: { id } }
    );
    if (!rows.length) {
      res.status(404).json({ success: false, message: '记录不存在' }); return;
    }
    res.json(success(rows[0]));
  } catch (err) { next(err); }
};

export const approveMapping = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE customer_material_mapping SET approval_status = N'已审核' WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawMapping = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(`UPDATE customer_material_mapping SET approval_status = N'未审核' WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};// ==================== 新增 ====================
export const create = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;

    if (!b.customer_number || !b.item_number) {
      res.status(400).json({ success: false, message: '客户编号和物料编号为必填项' }); return;
    }

    await sequelize.query(`
      INSERT INTO customer_material_mapping
        (customer_number, customer_name, item_number, item_name, specifications, customer_item_number, customer_item_description, remark)
      VALUES
        (:customer_number, :customer_name, :item_number, :item_name, :specifications, :customer_item_number, :customer_item_description, :remark)
    `, {
      replacements: {
        customer_number: b.customer_number,
        customer_name: b.customer_name || '',
        item_number: b.item_number,
        item_name: b.item_name || '',
        specifications: b.specifications || '',
        customer_item_number: b.customer_item_number || '',
        customer_item_description: b.customer_item_description || '',
        remark: b.remark || ''
      }
    });

    res.json(success(null, '创建成功'));
  } catch (err: any) {
    if (err.message?.includes('UX_customer_material_mapping')) {
      res.status(400).json({ success: false, message: '该客户物料对照关系已存在' }); return;
    }
    next(err);
  }
};

// ==================== 更新 ====================
export const update = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [existing]: any = await sequelize.query(
      `SELECT id FROM customer_material_mapping WHERE id = :id`,
      { replacements: { id } }
    );
    if (!existing.length) {
      res.status(404).json({ success: false, message: '记录不存在' }); return;
    }

    await sequelize.query(`
      UPDATE customer_material_mapping SET
        customer_number = :customer_number,
        customer_name = :customer_name,
        item_number = :item_number,
        item_name = :item_name,
        specifications = :specifications,
        customer_item_number = :customer_item_number,
        customer_item_description = :customer_item_description,
        remark = :remark,
        update_date = GETDATE()
      WHERE id = :id
    `, {
      replacements: {
        id,
        customer_number: b.customer_number || '',
        customer_name: b.customer_name || '',
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        specifications: b.specifications || '',
        customer_item_number: b.customer_item_number || '',
        customer_item_description: b.customer_item_description || '',
        remark: b.remark || ''
      }
    });

    res.json(success(null, '更新成功'));
  } catch (err: any) {
    if (err.message?.includes('UX_customer_material_mapping')) {
      res.status(400).json({ success: false, message: '该客户物料对照关系已存在' }); return;
    }
    next(err);
  }
};

// ==================== 删除 ====================
export const remove = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [existing]: any = await sequelize.query(
      `SELECT id FROM customer_material_mapping WHERE id = :id`,
      { replacements: { id } }
    );
    if (!existing.length) {
      res.status(404).json({ success: false, message: '记录不存在' }); return;
    }

    await sequelize.query(
      `DELETE FROM customer_material_mapping WHERE id = :id`,
      { replacements: { id } }
    );

    res.json(success(null, '删除成功'));
  } catch (err) { next(err); }
};

// ==================== 反向查询：根据客户物料号查找产品 ====================
export const reverseLookup = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customer_number, customer_item_number } = req.query;

    if (!customer_number || !customer_item_number) {
      res.status(400).json({ success: false, message: '客户编号和客户物料号为必填项' }); return;
    }

    const [rows]: any = await sequelize.query(`
      SELECT cm.item_number, cm.item_name, cm.specifications, cm.customer_item_description,
             im.basic_unit, pe.product_drawing_number
      FROM customer_material_mapping cm
      LEFT JOIN item_master im ON im.item_number = cm.item_number
      LEFT JOIN product_ext pe ON pe.item_number = cm.item_number
      WHERE cm.customer_number = :customer_number AND cm.customer_item_number = :customer_item_number
    `, {
      replacements: { customer_number, customer_item_number }
    });

    if (!rows.length) {
      res.json(success(null, '未找到匹配的产品'));
      return;
    }

    res.json(success(rows[0]));
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
export const exportMappings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};

    if (search) {
      whereClause = `WHERE customer_number LIKE :search OR customer_name LIKE :search OR item_number LIKE :search OR item_name LIKE :search OR customer_item_number LIKE :search`;
      replacements.search = `%${search}%`;
    }

    const [items]: any = await sequelize.query(
      `SELECT customer_number, customer_name, item_number, item_name, specifications, customer_item_number, customer_item_description, remark FROM customer_material_mapping ${whereClause} ORDER BY customer_number, item_number`,
      { replacements }
    );

    const headers = ['客户编号', '客户名称', '物料编号', '物料名称', '物料规格', '客户物料号', '客户物料描述', '备注'];
    const fields = ['customer_number', 'customer_name', 'item_number', 'item_name', 'specifications', 'customer_item_number', 'customer_item_description', 'remark'];

    exportToExcel(items, fields, headers, 'customer_material_mappings', res);
  } catch (err) {
    next(err);
  }
};

// ==================== 导入 ====================
export const importMappings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: '请上传Excel文件' });
      return;
    }

    const fields = ['customer_number', 'customer_name', 'item_number', 'item_name', 'specifications', 'customer_item_number', 'customer_item_description', 'remark'];
    const headers = ['客户编号', '客户名称', '物料编号', '物料名称', '物料规格', '客户物料号', '客户物料描述', '备注'];
    const rows = parseExcelFile(req.file.buffer, fields, headers);

    if (rows.length === 0) {
      res.status(400).json({ success: false, message: 'Excel文件内容为空' });
      return;
    }

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row.customer_number || !row.item_number) {
        skipped++;
        continue;
      }

      const [existing]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM customer_material_mapping WHERE customer_number = :customer_number AND item_number = :item_number AND customer_item_number = :customer_item_number`,
        { replacements: { customer_number: row.customer_number, item_number: row.item_number, customer_item_number: row.customer_item_number || '' } }
      );

      if (existing[0].cnt > 0) {
        await sequelize.query(`
          UPDATE customer_material_mapping SET
            customer_name = :customer_name, item_name = :item_name, specifications = :specifications,
            customer_item_description = :customer_item_description, remark = :remark, update_date = GETDATE()
          WHERE customer_number = :customer_number AND item_number = :item_number AND customer_item_number = :customer_item_number
        `, { replacements: { ...row, customer_item_number: row.customer_item_number || '' } });
      } else {
        await sequelize.query(`
          INSERT INTO customer_material_mapping (customer_number, customer_name, item_number, item_name, specifications, customer_item_number, customer_item_description, remark)
          VALUES (:customer_number, :customer_name, :item_number, :item_name, :specifications, :customer_item_number, :customer_item_description, :remark)
        `, { replacements: { ...row, customer_item_number: row.customer_item_number || '' } });
      }
      imported++;
    }

    res.json(success({ imported, skipped }, `导入完成，成功 ${imported} 条，跳过 ${skipped} 条`));
  } catch (err) {
    next(err);
  }
};
