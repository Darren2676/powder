import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

const fields = ['customer_number', 'customer_name', 'country', 'region', 'head_of_sales', 'linkman', 'contacts', 'detail_address', 'telephone'];
const headers = ['客户编号', '客户名称', '国家', '地区', '销售负责人', '联系人', '联系方式', '详细地址', '电话'];

export const getCustomers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';

    let whereClause = '';
    const replacements: any = {};

    if (search) {
      whereClause = `WHERE customer_number LIKE :search OR customer_name LIKE :search OR linkman LIKE :search`;
      replacements.search = `%${search}%`;
    }

    const countSql = `SELECT COUNT(*) as total FROM customer ${whereClause}`;
    const [countResult]: any = await sequelize.query(countSql, { replacements });
    const total = countResult[0].total;

    const dataSql = `
      SELECT * FROM (
        SELECT *, ROW_NUMBER() OVER (ORDER BY customer_number) AS _row_num
        FROM customer ${whereClause}
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
    }, '获取客户列表成功'));
  } catch (err) {
    next(err);
  }
};

export const createCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customer_number, customer_name, country, region, head_of_sales, linkman, contacts, detail_address, telephone } = req.body;

    if (!customer_number) {
      res.status(400).json({ success: false, message: '客户编号不能为空' });
      return;
    }

    const insertSql = `
      INSERT INTO customer (customer_number, customer_name, country, region, head_of_sales, linkman, contacts, detail_address, telephone)
      VALUES (:customer_number, :customer_name, :country, :region, :head_of_sales, :linkman, :contacts, :detail_address, :telephone)
    `;

    await sequelize.query(insertSql, {
      replacements: {
        customer_number,
        customer_name: customer_name || '',
        country: country || '',
        region: region || '',
        head_of_sales: head_of_sales || '',
        linkman: linkman || '',
        contacts: contacts || '',
        detail_address: detail_address || '',
        telephone: telephone || ''
      }
    });

    res.json(success(null, '创建客户成功'));
  } catch (err) {
    next(err);
  }
};

export const updateCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId } = req.params;
    const { customer_name, country, region, head_of_sales, linkman, contacts, detail_address, telephone } = req.body;

    const updateSql = `
      UPDATE customer SET
        customer_name = :customer_name,
        country = :country,
        region = :region,
        head_of_sales = :head_of_sales,
        linkman = :linkman,
        contacts = :contacts,
        detail_address = :detail_address,
        telephone = :telephone
      WHERE customer_number = :customerId
    `;

    await sequelize.query(updateSql, {
      replacements: { customerId, customer_name, country, region, head_of_sales, linkman, contacts, detail_address, telephone }
    });

    res.json(success(null, '更新客户成功'));
  } catch (err) {
    next(err);
  }
};

export const deleteCustomer = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customerId } = req.params;
    await sequelize.query(`DELETE FROM customer WHERE customer_number = :customerId`, {
      replacements: { customerId }
    });
    res.json(success(null, '删除客户成功'));
  } catch (err) {
    next(err);
  }
};

export const exportCustomers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT * FROM customer ORDER BY customer_number`);
    exportToExcel(items, fields, headers, 'customers', res);
  } catch (err) {
    next(err);
  }
};

export const importCustomers = async (req: Request, res: Response, next: NextFunction) => {
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
          INSERT INTO customer (customer_number, customer_name, country, region, head_of_sales, linkman, contacts, detail_address, telephone)
          VALUES (:customer_number, :customer_name, :country, :region, :head_of_sales, :linkman, :contacts, :detail_address, :telephone)
        `;
        await sequelize.query(insertSql, {
          replacements: {
            customer_number: item.customer_number || '',
            customer_name: item.customer_name || '',
            country: item.country || '',
            region: item.region || '',
            head_of_sales: item.head_of_sales || '',
            linkman: item.linkman || '',
            contacts: item.contacts || '',
            detail_address: item.detail_address || '',
            telephone: item.telephone || ''
          }
        });
        imported++;
      } catch (e) {
        // 忽略单条记录错误，继续导入
      }
    }

    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条记录`));
  } catch (err) {
    next(err);
  }
};
