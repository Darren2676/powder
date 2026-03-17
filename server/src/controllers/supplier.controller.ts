import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

const fields = ['supplier_number', 'supplier_name', 'procurement_manager', 'linkman', 'contacts', 'detail_address', 'telephone'];
const headers = ['供应商编号', '供应商名称', '采购经理', '联系人', '联系方式', '详细地址', '电话'];

export const getSuppliers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';

    let whereClause = '';
    const replacements: any = {};

    if (search) {
      whereClause = `WHERE supplier_number LIKE :search OR supplier_name LIKE :search OR linkman LIKE :search`;
      replacements.search = `%${search}%`;
    }

    const countSql = `SELECT COUNT(*) as total FROM supplier ${whereClause}`;
    const [countResult]: any = await sequelize.query(countSql, { replacements });
    const total = countResult[0].total;

    const dataSql = `
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY supplier_number) AS _row_num
        FROM supplier ${whereClause}
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
    }, '获取供应商列表成功'));
  } catch (err) {
    next(err);
  }
};

export const createSupplier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { supplier_number, supplier_name, procurement_manager, linkman, contacts, detail_address, telephone } = req.body;

    if (!supplier_number) {
      res.status(400).json({ success: false, message: '供应商编号不能为空' });
      return;
    }

    const insertSql = `
      INSERT INTO supplier (supplier_number, supplier_name, procurement_manager, linkman, contacts, detail_address, telephone)
      VALUES (:supplier_number, :supplier_name, :procurement_manager, :linkman, :contacts, :detail_address, :telephone)
    `;

    await sequelize.query(insertSql, {
      replacements: {
        supplier_number,
        supplier_name: supplier_name || '',
        procurement_manager: procurement_manager || '',
        linkman: linkman || '',
        contacts: contacts || '',
        detail_address: detail_address || '',
        telephone: telephone || ''
      }
    });

    res.json(success(null, '创建供应商成功'));
  } catch (err) {
    next(err);
  }
};

export const updateSupplier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { supplierId } = req.params;
    const { supplier_name, procurement_manager, linkman, contacts, detail_address, telephone } = req.body;

    const updateSql = `
      UPDATE supplier SET
        supplier_name = :supplier_name,
        procurement_manager = :procurement_manager,
        linkman = :linkman,
        contacts = :contacts,
        detail_address = :detail_address,
        telephone = :telephone
      WHERE supplier_number = :supplierId
    `;

    await sequelize.query(updateSql, {
      replacements: { supplierId, supplier_name, procurement_manager, linkman, contacts, detail_address, telephone }
    });

    res.json(success(null, '更新供应商成功'));
  } catch (err) {
    next(err);
  }
};

export const deleteSupplier = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { supplierId } = req.params;
    await sequelize.query(`DELETE FROM supplier WHERE supplier_number = :supplierId`, {
      replacements: { supplierId }
    });
    res.json(success(null, '删除供应商成功'));
  } catch (err) {
    next(err);
  }
};

export const exportSuppliers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM supplier ORDER BY supplier_number`);
    exportToExcel(items, fields, headers, 'suppliers', res);
  } catch (err) {
    next(err);
  }
};

export const importSuppliers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) {
      res.status(400).json({ success: false, message: '请上传Excel文件' });
      return;
    }
    const rows = parseExcelFile(req.file.buffer, fields, headers);
    if (rows.length === 0) {
      res.status(400).json({ success: false, message: 'Excel文件内容为空' });
      return;
    }

    let imported = 0;
    for (const item of rows) {
      try {
        const insertSql = `
          INSERT INTO supplier (supplier_number, supplier_name, procurement_manager, linkman, contacts, detail_address, telephone)
          VALUES (:supplier_number, :supplier_name, :procurement_manager, :linkman, :contacts, :detail_address, :telephone)
        `;
        await sequelize.query(insertSql, {
          replacements: {
            supplier_number: item.supplier_number || '',
            supplier_name: item.supplier_name || '',
            procurement_manager: item.procurement_manager || '',
            linkman: item.linkman || '',
            contacts: item.contacts || '',
            detail_address: item.detail_address || '',
            telephone: item.telephone || ''
          }
        });
        imported++;
      } catch (e) {
        // 忽略单条记录错误
      }
    }

    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) {
    next(err);
  }
};
