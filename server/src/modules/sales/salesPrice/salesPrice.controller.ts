import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import dayjs from 'dayjs';
import { ORDER_STATUS } from '@/shared/constants/statuses';

// ==================== 编号生成 ====================
const generatePriceListNumber = async (): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `SP-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT MAX(price_list_number) as max_num FROM sales_price_list WHERE price_list_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );
  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return prefix + String(seq).padStart(3, '0');
};

// ==================== 列表 ====================
export const getSalesPriceLists = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const approval_status = (req.query.approval_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(price_list_number LIKE :search OR price_list_name LIKE :search OR customer_number LIKE :search OR customer_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (approval_status) {
      conditions.push(`approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM sales_price_list ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT price_list_number, price_list_name, customer_number, customer_name, customer_category,
               effective_date, expiration_date, price_type, currency, approval_status,
               remark, creation_date, creation_man,
               ROW_NUMBER() OVER (ORDER BY creation_date DESC, price_list_number DESC) AS _row_num
        FROM sales_price_list ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取销售价目表列表成功'));
  } catch (err) { next(err); }
};

// ==================== 详情 ====================
export const getSalesPriceListDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(
      `SELECT * FROM sales_price_list WHERE price_list_number = :id`, { replacements: { id } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '销售价目表不存在' }); return; }
    const [details]: any = await sequelize.query(
      `SELECT * FROM sales_price_list_detail WHERE price_list_number = :id ORDER BY item_number, line_number`,
      { replacements: { id } }
    );
    res.json(success({ header: headers[0], details }, '获取销售价目表详情成功'));
  } catch (err) { next(err); }
};

// ==================== 创建 ====================
export const createSalesPriceList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.price_list_name) { res.status(400).json({ success: false, message: '价目表名称不能为空' }); return; }

    const price_list_number = await generatePriceListNumber();
    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO sales_price_list (price_list_number, price_list_name, customer_number, customer_name,
          customer_category, effective_date, expiration_date, price_type, currency,
          approval_status, remark, creation_date, creation_man)
        VALUES (:price_list_number, :price_list_name, :customer_number, :customer_name,
          :customer_category, :effective_date, :expiration_date, :price_type, :currency,
          N'草稿', :remark, :creation_date, :creation_man)
      `, {
        replacements: {
          price_list_number,
          price_list_name: b.price_list_name || '',
          customer_number: b.customer_number || '',
          customer_name: b.customer_name || '',
          customer_category: b.customer_category || '',
          effective_date: b.effective_date || null,
          expiration_date: b.expiration_date || null,
          price_type: b.price_type || '含税',
          currency: b.currency || 'CNY',
          remark: b.remark || '',
          creation_date: now,
          creation_man
        },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO sales_price_list_detail (price_list_number, line_number, item_number, item_name,
              item_category, specifications, tax_inclusive_price, tax_exclusive_price, tax_rate,
              enable_tiered_pricing, start_quantity, end_quantity, pricing_unit,
              min_price_inclusive, min_price_exclusive, remark)
            VALUES (:price_list_number, :line_number, :item_number, :item_name,
              :item_category, :specifications, :tax_inclusive_price, :tax_exclusive_price, :tax_rate,
              :enable_tiered_pricing, :start_quantity, :end_quantity, :pricing_unit,
              :min_price_inclusive, :min_price_exclusive, :remark)
          `, {
            replacements: {
              price_list_number,
              line_number: d.line_number || (i + 1) * 10,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              item_category: d.item_category || '',
              specifications: d.specifications || '',
              tax_inclusive_price: d.tax_inclusive_price || 0,
              tax_exclusive_price: d.tax_exclusive_price || 0,
              tax_rate: d.tax_rate || 0,
              enable_tiered_pricing: d.enable_tiered_pricing ? 1 : 0,
              start_quantity: d.start_quantity || 0,
              end_quantity: d.end_quantity != null && d.end_quantity !== '' ? d.end_quantity : null,
              pricing_unit: d.pricing_unit || '',
              min_price_inclusive: d.min_price_inclusive || 0,
              min_price_exclusive: d.min_price_exclusive || 0,
              remark: d.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success({ price_list_number }, '创建销售价目表成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 更新 ====================
export const updateSalesPriceList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM sales_price_list WHERE price_list_number = :id`, { replacements: { id } }
    );
    if (!chk.length) { res.status(404).json({ success: false, message: '销售价目表不存在' }); return; }
    if (chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return;
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE sales_price_list SET
          price_list_name = :price_list_name, customer_number = :customer_number, customer_name = :customer_name,
          customer_category = :customer_category, effective_date = :effective_date, expiration_date = :expiration_date,
          price_type = :price_type, currency = :currency, remark = :remark
        WHERE price_list_number = :id
      `, {
        replacements: {
          id,
          price_list_name: b.price_list_name || '',
          customer_number: b.customer_number || '',
          customer_name: b.customer_name || '',
          customer_category: b.customer_category || '',
          effective_date: b.effective_date || null,
          expiration_date: b.expiration_date || null,
          price_type: b.price_type || '含税',
          currency: b.currency || 'CNY',
          remark: b.remark || ''
        },
        transaction
      });

      if (b.details && Array.isArray(b.details)) {
        await sequelize.query(
          `DELETE FROM sales_price_list_detail WHERE price_list_number = :id`,
          { replacements: { id }, transaction }
        );
        for (let i = 0; i < b.details.length; i++) {
          const d = b.details[i];
          await sequelize.query(`
            INSERT INTO sales_price_list_detail (price_list_number, line_number, item_number, item_name,
              item_category, specifications, tax_inclusive_price, tax_exclusive_price, tax_rate,
              enable_tiered_pricing, start_quantity, end_quantity, pricing_unit,
              min_price_inclusive, min_price_exclusive, remark)
            VALUES (:price_list_number, :line_number, :item_number, :item_name,
              :item_category, :specifications, :tax_inclusive_price, :tax_exclusive_price, :tax_rate,
              :enable_tiered_pricing, :start_quantity, :end_quantity, :pricing_unit,
              :min_price_inclusive, :min_price_exclusive, :remark)
          `, {
            replacements: {
              price_list_number: id,
              line_number: d.line_number || (i + 1) * 10,
              item_number: d.item_number || '',
              item_name: d.item_name || '',
              item_category: d.item_category || '',
              specifications: d.specifications || '',
              tax_inclusive_price: d.tax_inclusive_price || 0,
              tax_exclusive_price: d.tax_exclusive_price || 0,
              tax_rate: d.tax_rate || 0,
              enable_tiered_pricing: d.enable_tiered_pricing ? 1 : 0,
              start_quantity: d.start_quantity || 0,
              end_quantity: d.end_quantity != null && d.end_quantity !== '' ? d.end_quantity : null,
              pricing_unit: d.pricing_unit || '',
              min_price_inclusive: d.min_price_inclusive || 0,
              min_price_exclusive: d.min_price_exclusive || 0,
              remark: d.remark || ''
            },
            transaction
          });
        }
      }

      await transaction.commit();
      res.json(success(null, '更新销售价目表成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 删除 ====================
export const deleteSalesPriceList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM sales_price_list WHERE price_list_number = :id`, { replacements: { id } }
    );
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return;
    }
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM sales_price_list_detail WHERE price_list_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM sales_price_list WHERE price_list_number = :id`, { replacements: { id }, transaction });
      await transaction.commit();
      res.json(success(null, '删除销售价目表成功'));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
const exportFields = ['price_list_number', 'price_list_name', 'customer_number', 'customer_name', 'item_number', 'item_name', 'item_category', 'specifications', 'tax_inclusive_price', 'tax_exclusive_price', 'tax_rate', 'enable_tiered_pricing', 'start_quantity', 'end_quantity', 'pricing_unit', 'min_price_inclusive', 'min_price_exclusive', 'approval_status'];
const exportHeaders = ['价目表编号', '价目表名称', '客户编号', '客户名称', '物料编号', '物料名称', '物料分类', '物料规格', '含税单价', '未税单价', '税率%', '启用分段价格', '起始数量', '结束数量', '计价单位', '含税最低价', '不含税最低价', '审批状态'];

export const exportSalesPriceLists = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`
      SELECT h.price_list_number, h.price_list_name, h.customer_number, h.customer_name,
             d.item_number, d.item_name, d.item_category, d.specifications,
             d.tax_inclusive_price, d.tax_exclusive_price, d.tax_rate,
             CASE WHEN d.enable_tiered_pricing = 1 THEN N'是' ELSE N'否' END as enable_tiered_pricing,
             d.start_quantity, d.end_quantity, d.pricing_unit,
             d.min_price_inclusive, d.min_price_exclusive, h.approval_status
      FROM sales_price_list h
      INNER JOIN sales_price_list_detail d ON d.price_list_number = h.price_list_number
      ORDER BY h.price_list_number, d.item_number, d.line_number
    `);
    exportToExcel(items, exportFields, exportHeaders, 'sales_price_lists', res);
  } catch (err) { next(err); }
};

// ==================== 导入 ====================
const importDetailFields = ['item_number', 'item_name', 'item_category', 'specifications', 'tax_inclusive_price', 'tax_exclusive_price', 'tax_rate', 'enable_tiered_pricing', 'start_quantity', 'end_quantity', 'pricing_unit', 'min_price_inclusive', 'min_price_exclusive'];
const importDetailHeaders = ['物料编号', '物料名称', '物料分类', '物料规格', '含税单价', '未税单价', '税率%', '启用分段价格', '起始数量', '结束数量', '计价单位', '含税最低价', '不含税最低价'];

export const importSalesPriceList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, importDetailFields, importDetailHeaders);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }

    const price_list_number = await generatePriceListNumber();
    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const creation_man = (req as any).user?.username || '';
    const b = req.body;

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO sales_price_list (price_list_number, price_list_name, customer_number, customer_name,
          customer_category, effective_date, expiration_date, price_type, currency,
          approval_status, remark, creation_date, creation_man)
        VALUES (:price_list_number, :price_list_name, :customer_number, :customer_name,
          :customer_category, :effective_date, :expiration_date, :price_type, :currency,
          N'草稿', :remark, :creation_date, :creation_man)
      `, {
        replacements: {
          price_list_number,
          price_list_name: b?.price_list_name || '导入价目表',
          customer_number: b?.customer_number || '',
          customer_name: b?.customer_name || '',
          customer_category: b?.customer_category || '',
          effective_date: b?.effective_date || null,
          expiration_date: b?.expiration_date || null,
          price_type: b?.price_type || '含税',
          currency: b?.currency || 'CNY',
          remark: b?.remark || '',
          creation_date: now,
          creation_man
        },
        transaction
      });

      for (let i = 0; i < rows.length; i++) {
        const d = rows[i];
        const isTiered = d.enable_tiered_pricing === '是' || d.enable_tiered_pricing === '1' || d.enable_tiered_pricing === true;
        await sequelize.query(`
          INSERT INTO sales_price_list_detail (price_list_number, line_number, item_number, item_name,
            item_category, specifications, tax_inclusive_price, tax_exclusive_price, tax_rate,
            enable_tiered_pricing, start_quantity, end_quantity, pricing_unit,
            min_price_inclusive, min_price_exclusive)
          VALUES (:price_list_number, :line_number, :item_number, :item_name,
            :item_category, :specifications, :tax_inclusive_price, :tax_exclusive_price, :tax_rate,
            :enable_tiered_pricing, :start_quantity, :end_quantity, :pricing_unit,
            :min_price_inclusive, :min_price_exclusive)
        `, {
          replacements: {
            price_list_number,
            line_number: (i + 1) * 10,
            item_number: d.item_number || '',
            item_name: d.item_name || '',
            item_category: d.item_category || '',
            specifications: d.specifications || '',
            tax_inclusive_price: parseFloat(d.tax_inclusive_price) || 0,
            tax_exclusive_price: parseFloat(d.tax_exclusive_price) || 0,
            tax_rate: parseFloat(d.tax_rate) || 0,
            enable_tiered_pricing: isTiered ? 1 : 0,
            start_quantity: parseFloat(d.start_quantity) || 0,
            end_quantity: d.end_quantity ? parseFloat(d.end_quantity) : null,
            pricing_unit: d.pricing_unit || '',
            min_price_inclusive: parseFloat(d.min_price_inclusive) || 0,
            min_price_exclusive: parseFloat(d.min_price_exclusive) || 0
          },
          transaction
        });
      }

      await transaction.commit();
      res.json(success({ price_list_number, imported: rows.length }, `成功导入 ${rows.length} 条明细到价目表 ${price_list_number}`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};
