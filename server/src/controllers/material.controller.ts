import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

export const getMaterials = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';

    let whereClause = '';
    const replacements: any = {};

    if (search) {
      whereClause = `WHERE item_number LIKE :search OR item_name LIKE :search OR supplier_name LIKE :search OR material_class_name LIKE :search`;
      replacements.search = `%${search}%`;
    }

    // 查询总数
    const countSql = `SELECT COUNT(*) as total FROM material ${whereClause}`;
    const [countResult]: any = await sequelize.query(countSql, { replacements });
    const total = countResult[0].total;

    // 使用 ROW_NUMBER() 兼容低版本 SQL Server
    const dataSql = `
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY item_number) AS _row_num
        FROM material ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(dataSql, {
      replacements: { ...replacements, offset, offsetEnd: offset + limit }
    });

    // 移除辅助列 _row_num
    const cleanItems = items.map((item: any) => {
      const { _row_num, ...rest } = item;
      return rest;
    });

    res.json(success({
      items: cleanItems,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    }, '获取物料列表成功'));
  } catch (err) {
    next(err);
  }
};

export const createMaterial = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const {
      item_number,
      item_name,
      material_class_number,
      material_class_name,
      material_properties,
      supplier_number,
      supplier_name,
      basic_unit
    } = req.body;

    if (!item_number) {
      res.status(400).json({ success: false, message: '物料编号不能为空' });
      return;
    }

    const insertSql = `
      INSERT INTO material (item_number, item_name, material_class_number, material_class_name, material_properties, supplier_number, supplier_name, basic_unit)
      VALUES (:item_number, :item_name, :material_class_number, :material_class_name, :material_properties, :supplier_number, :supplier_name, :basic_unit)
    `;

    await sequelize.query(insertSql, {
      replacements: {
        item_number,
        item_name: item_name || '',
        material_class_number: material_class_number || '',
        material_class_name: material_class_name || '',
        material_properties: material_properties || '',
        supplier_number: supplier_number || '',
        supplier_name: supplier_name || '',
        basic_unit: basic_unit || ''
      }
    });

    res.json(success(null, '创建物料成功'));
  } catch (err) {
    next(err);
  }
};

export const updateMaterial = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemNumber } = req.params;
    const {
      item_name,
      material_class_number,
      material_class_name,
      material_properties,
      supplier_number,
      supplier_name,
      basic_unit
    } = req.body;

    const updateSql = `
      UPDATE material SET
        item_name = :item_name,
        material_class_number = :material_class_number,
        material_class_name = :material_class_name,
        material_properties = :material_properties,
        supplier_number = :supplier_number,
        supplier_name = :supplier_name,
        basic_unit = :basic_unit
      WHERE item_number = :itemNumber
    `;

    await sequelize.query(updateSql, {
      replacements: {
        itemNumber,
        item_name,
        material_class_number,
        material_class_name,
        material_properties,
        supplier_number,
        supplier_name,
        basic_unit
      }
    });

    res.json(success(null, '更新物料成功'));
  } catch (err) {
    next(err);
  }
};

export const deleteMaterial = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemNumber } = req.params;

    const deleteSql = `DELETE FROM material WHERE item_number = :itemNumber`;
    await sequelize.query(deleteSql, {
      replacements: { itemNumber }
    });

    res.json(success(null, '删除物料成功'));
  } catch (err) {
    next(err);
  }
};

export const exportMaterials = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    let whereClause = '';
    const replacements: any = {};

    if (search) {
      whereClause = `WHERE item_number LIKE :search OR item_name LIKE :search OR supplier_name LIKE :search OR material_class_name LIKE :search`;
      replacements.search = `%${search}%`;
    }

    const dataSql = `SELECT item_number, item_name, material_class_number, material_class_name, material_properties, supplier_number, supplier_name, basic_unit FROM material ${whereClause} ORDER BY item_number`;
    const [items]: any = await sequelize.query(dataSql, { replacements });

    const headers = ['物料编号', '物料名称', '物料分类编号', '物料分类名称', '物料属性', '供应商编号', '供应商名称', '基本单位'];
    const fields = ['item_number', 'item_name', 'material_class_number', 'material_class_name', 'material_properties', 'supplier_number', 'supplier_name', 'basic_unit'];

    exportToExcel(items, fields, headers, 'materials', res);
  } catch (err) {
    next(err);
  }
};

export const importMaterials = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: '请上传Excel文件' });
      return;
    }

    const fields = ['item_number', 'item_name', 'material_class_number', 'material_class_name', 'material_properties', 'supplier_number', 'supplier_name', 'basic_unit'];
    const headers = ['物料编号', '物料名称', '物料分类编号', '物料分类名称', '物料属性', '供应商编号', '供应商名称', '基本单位'];
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

      // 检查是否存在
      const [existing]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM material WHERE item_number = :item_number`,
        { replacements: { item_number: replacements.item_number } }
      );

      if (existing[0].cnt > 0) {
        // 更新
        await sequelize.query(`
          UPDATE material SET
            item_name = :item_name, material_class_number = :material_class_number,
            material_class_name = :material_class_name, material_properties = :material_properties,
            supplier_number = :supplier_number, supplier_name = :supplier_name, basic_unit = :basic_unit
          WHERE item_number = :item_number
        `, { replacements });
      } else {
        // 插入
        await sequelize.query(`
          INSERT INTO material (item_number, item_name, material_class_number, material_class_name, material_properties, supplier_number, supplier_name, basic_unit)
          VALUES (:item_number, :item_name, :material_class_number, :material_class_name, :material_properties, :supplier_number, :supplier_name, :basic_unit)
        `, { replacements });
      }
      imported++;
    }

    res.json(success({ imported, skipped }, `导入完成，成功 ${imported} 条，跳过 ${skipped} 条`));
  } catch (err) {
    next(err);
  }
};
