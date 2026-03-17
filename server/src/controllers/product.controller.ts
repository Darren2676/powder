import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

export const getProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';

    let whereClause = '';
    const replacements: any = {};

    if (search) {
      whereClause = `WHERE item_number LIKE :search OR item_name LIKE :search OR product_class_name LIKE :search`;
      replacements.search = `%${search}%`;
    }

    const countSql = `SELECT COUNT(*) as total FROM product ${whereClause}`;
    const [countResult]: any = await sequelize.query(countSql, { replacements });
    const total = countResult[0].total;

    const dataSql = `
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY item_number) AS _row_num
        FROM product ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(dataSql, {
      replacements: { ...replacements, offset, offsetEnd: offset + limit }
    });

    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取产品列表成功'));
  } catch (err) {
    next(err);
  }
};

export const createProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number, item_name, product_class_number, product_class_name, product_properties, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, standard_pass_rate } = req.body;

    if (!item_number) {
      res.status(400).json({ success: false, message: '产品编号不能为空' });
      return;
    }

    const insertSql = `
      INSERT INTO product (item_number, item_name, product_class_number, product_class_name, product_properties, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, standard_pass_rate)
      VALUES (:item_number, :item_name, :product_class_number, :product_class_name, :product_properties, :basic_unit, :specifications, :product_drawing_number, :rubber_compound_number, :batch_production_quota, :standard_pass_rate)
    `;

    await sequelize.query(insertSql, {
      replacements: {
        item_number,
        item_name: item_name || '',
        product_class_number: product_class_number || '',
        product_class_name: product_class_name || '',
        product_properties: product_properties || '',
        basic_unit: basic_unit || '',
        specifications: specifications || '',
        product_drawing_number: product_drawing_number || '',
        rubber_compound_number: rubber_compound_number || '',
        batch_production_quota: batch_production_quota || '',
        standard_pass_rate: standard_pass_rate || ''
      }
    });

    res.json(success(null, '创建产品成功'));
  } catch (err) {
    next(err);
  }
};

export const updateProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemNumber } = req.params;
    const { item_name, product_class_number, product_class_name, product_properties, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, standard_pass_rate } = req.body;

    const updateSql = `
      UPDATE product SET
        item_name = :item_name,
        product_class_number = :product_class_number,
        product_class_name = :product_class_name,
        product_properties = :product_properties,
        basic_unit = :basic_unit,
        specifications = :specifications,
        product_drawing_number = :product_drawing_number,
        rubber_compound_number = :rubber_compound_number,
        batch_production_quota = :batch_production_quota,
        standard_pass_rate = :standard_pass_rate
      WHERE item_number = :itemNumber
    `;

    await sequelize.query(updateSql, {
      replacements: { itemNumber, item_name, product_class_number, product_class_name, product_properties, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, standard_pass_rate }
    });

    res.json(success(null, '更新产品成功'));
  } catch (err) {
    next(err);
  }
};

export const deleteProduct = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemNumber } = req.params;
    await sequelize.query(`DELETE FROM product WHERE item_number = :itemNumber`, {
      replacements: { itemNumber }
    });
    res.json(success(null, '删除产品成功'));
  } catch (err) {
    next(err);
  }
};

export const exportProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};

    if (search) {
      whereClause = `WHERE item_number LIKE :search OR item_name LIKE :search OR product_class_name LIKE :search`;
      replacements.search = `%${search}%`;
    }

    const dataSql = `SELECT item_number, item_name, product_class_number, product_class_name, product_properties, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, standard_pass_rate FROM product ${whereClause} ORDER BY item_number`;
    const [items]: any = await sequelize.query(dataSql, { replacements });

    const headers = ['产品编号', '产品名称', '产品分类编号', '产品分类名称', '产品属性', '基本单位', '规格', '产品图号', '胶料编号', '批次产量定额', '标准合格率'];
    const fields = ['item_number', 'item_name', 'product_class_number', 'product_class_name', 'product_properties', 'basic_unit', 'specifications', 'product_drawing_number', 'rubber_compound_number', 'batch_production_quota', 'standard_pass_rate'];

    exportToExcel(items, fields, headers, 'products', res);
  } catch (err) {
    next(err);
  }
};

export const importProducts = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: '请上传Excel文件' });
      return;
    }

    const fields = ['item_number', 'item_name', 'product_class_number', 'product_class_name', 'product_properties', 'basic_unit', 'specifications', 'product_drawing_number', 'rubber_compound_number', 'batch_production_quota', 'standard_pass_rate'];
    const headers = ['产品编号', '产品名称', '产品分类编号', '产品分类名称', '产品属性', '基本单位', '规格', '产品图号', '胶料编号', '批次产量定额', '标准合格率'];
    const rows = parseExcelFile(req.file.buffer, fields, headers);

    if (rows.length === 0) {
      res.status(400).json({ success: false, message: 'Excel文件内容为空' });
      return;
    }

    let imported = 0;
    let skipped = 0;

    for (const replacements of rows) {
      if (!replacements.item_number) {
        skipped++;
        continue;
      }

      const [existing]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM product WHERE item_number = :item_number`,
        { replacements: { item_number: replacements.item_number } }
      );

      if (existing[0].cnt > 0) {
        await sequelize.query(`
          UPDATE product SET
            item_name = :item_name, product_class_number = :product_class_number,
            product_class_name = :product_class_name, product_properties = :product_properties,
            basic_unit = :basic_unit, specifications = :specifications,
            product_drawing_number = :product_drawing_number, rubber_compound_number = :rubber_compound_number,
            batch_production_quota = :batch_production_quota, standard_pass_rate = :standard_pass_rate
          WHERE item_number = :item_number
        `, { replacements });
      } else {
        await sequelize.query(`
          INSERT INTO product (item_number, item_name, product_class_number, product_class_name, product_properties, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, standard_pass_rate)
          VALUES (:item_number, :item_name, :product_class_number, :product_class_name, :product_properties, :basic_unit, :specifications, :product_drawing_number, :rubber_compound_number, :batch_production_quota, :standard_pass_rate)
        `, { replacements });
      }
      imported++;
    }

    res.json(success({ imported, skipped }, `导入完成，成功 ${imported} 条，跳过 ${skipped} 条`));
  } catch (err) {
    next(err);
  }
};
