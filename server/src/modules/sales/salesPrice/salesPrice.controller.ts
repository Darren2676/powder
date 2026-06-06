import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import dayjs from 'dayjs';
import { ORDER_STATUS } from '@/shared/constants/statuses';
import { getFactoryCode, getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 编号生成 ====================
const generatePriceListNumber = async (factoryCode: string = ''): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const fc = factoryCode ? `-${factoryCode.toUpperCase()}` : '';
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

    const _factoryId = getFactoryId(req);
    if (_factoryId !== null) {
      conditions.push(`factory_id = :_factoryId`);
      replacements._factoryId = _factoryId;
    }

    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM sales_price_list ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT s.price_list_number, s.price_list_name, s.customer_number, s.customer_name, s.customer_category,
               s.effective_date, s.expiration_date, s.price_type, s.currency, s.approval_status,
               s.remark, s.creation_date, s.creation_man,
               f.factory_name, f.factory_short,
               ROW_NUMBER() OVER (ORDER BY s.creation_date DESC, s.price_list_number DESC) AS _row_num
        FROM sales_price_list s
        LEFT JOIN factory f ON s.factory_id = f.id
        ${whereClause}
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
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};
    const [headers]: any = await sequelize.query(
      `SELECT * FROM sales_price_list WHERE price_list_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
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
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    const b = req.body;
    if (!b.price_list_name) { res.status(400).json({ success: false, message: '价目表名称不能为空' }); return; }

    const price_list_number = await generatePriceListNumber(factoryCode);
    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO sales_price_list (price_list_number, price_list_name, customer_number, customer_name,
          customer_category, effective_date, expiration_date, price_type, currency,
          approval_status, remark, creation_date, creation_man, factory_id)
        VALUES (:price_list_number, :price_list_name, :customer_number, :customer_name,
          :customer_category, :effective_date, :expiration_date, :price_type, :currency,
          N'草稿', :remark, :creation_date, :creation_man, :factory_id)
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
          creation_man,
          factory_id: _factoryId
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

    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM sales_price_list WHERE price_list_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
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
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM sales_price_list WHERE price_list_number = :id${factoryCond}`, { replacements: { id, ...factoryReps } }
    );
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) {
      res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return;
    }
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM sales_price_list_detail WHERE price_list_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM sales_price_list WHERE price_list_number = :id${factoryCond}`, { replacements: { id, ...factoryReps }, transaction });
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
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' WHERE h.factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [items]: any = await sequelize.query(`
      SELECT h.price_list_number, h.price_list_name, h.customer_number, h.customer_name,
             d.item_number, d.item_name, d.item_category, d.specifications,
             d.tax_inclusive_price, d.tax_exclusive_price, d.tax_rate,
             CASE WHEN d.enable_tiered_pricing = 1 THEN N'是' ELSE N'否' END as enable_tiered_pricing,
             d.start_quantity, d.end_quantity, d.pricing_unit,
             d.min_price_inclusive, d.min_price_exclusive, h.approval_status
      FROM sales_price_list h
      INNER JOIN sales_price_list_detail d ON d.price_list_number = h.price_list_number
      ${factoryCond}
      ORDER BY h.price_list_number, d.item_number, d.line_number
    `, { replacements: factoryReps });
    exportToExcel(items, exportFields, exportHeaders, 'sales_price_lists', res);
  } catch (err) { next(err); }
};

// ==================== 导入模板下载 ====================
const importDetailFields = ['item_number', 'item_name', 'item_category', 'specifications', 'tax_inclusive_price', 'tax_exclusive_price', 'tax_rate', 'enable_tiered_pricing', 'start_quantity', 'end_quantity', 'pricing_unit', 'min_price_inclusive', 'min_price_exclusive'];
const importDetailHeaders = ['物料编号', '物料名称', '物料分类', '物料规格', '含税单价', '未税单价', '税率%', '启用分段价格', '起始数量', '结束数量', '计价单位', '含税最低价', '不含税最低价'];

export const downloadImportTemplate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();

    // 第1行：主表字段标签；第2行：主表字段值（示例）
    const headerRows = [
      ['价目表名称(*)', '客户编号', '客户名称', '客户分类', '生效日期(*)', '失效日期(*)', '价格类型', '币种', '备注'],
      ['2026年销售价目表', '', '', '', '2026-01-01', '2026-12-31', '含税', 'CNY', ''],
    ];

    // 第3行空行；第4行明细列头；第5行+示例数据
    const detailRows = [
      importDetailHeaders,
      ['C100809', 'O型密封圈', '成品', '50×3.5', '1.50', '1.33', '13', '否', '1', '', '个', '1.20', '1.06'],
      ['C100810', '油封', '成品', '80×60×10', '3.80', '3.36', '13', '否', '1', '', '个', '3.00', '2.65'],
    ];

    const allRows = [...headerRows, [], ...detailRows];
    const ws = XLSX.utils.aoa_to_sheet(allRows);

    // 设置列宽
    ws['!cols'] = [
      { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 12 },
      { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 14 },
      { wch: 14 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
    ];

    XLSX.utils.book_append_sheet(wb, ws, '销售价目表导入');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const fullName = '销售价目表导入模板.xlsx';
    const encoded = encodeURIComponent(fullName);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${encoded}"; filename*=UTF-8''${encoded}`);
    res.send(Buffer.from(buffer));
  } catch (err) { next(err); }
};

export const importSalesPriceList = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factoryCode = await getFactoryCode(req);
    const _factoryId = getFactoryId(req);
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }

    // 解析Excel：前2行为主表信息，第3行空行，第4行起为明细列头+数据
    const XLSX = await import('xlsx');
    const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const allData: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

    // 读取主表信息（第1行标签，第2行值）
    const headerValues = allData[1] || [];
    const excelPriceListName = String(headerValues[0] || '').trim();
    const excelCustomerNumber = String(headerValues[1] || '').trim();
    const excelCustomerName = String(headerValues[2] || '').trim();
    const excelCustomerCategory = String(headerValues[3] || '').trim();
    const excelEffectiveDate = String(headerValues[4] || '').trim();
    const excelExpirationDate = String(headerValues[5] || '').trim();
    const excelPriceType = String(headerValues[6] || '').trim();
    const excelCurrency = String(headerValues[7] || '').trim();
    const excelRemark = String(headerValues[8] || '').trim();

    // 从第4行开始解析明细
    const detailJsonData: any[] = XLSX.utils.sheet_to_json(ws, { range: 3 });
    const rows = detailJsonData.map((row: any) => {
      const item: any = {};
      importDetailFields.forEach((f, i) => {
        item[f] = String(row[importDetailHeaders[i]] ?? row[f] ?? '').trim();
      });
      return item;
    }).filter((r: any) => r.item_number);

    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件明细内容为空' }); return; }
    if (!excelPriceListName) { res.status(400).json({ success: false, message: '价目表名称不能为空，请在Excel第2行第1列填写' }); return; }
    if (!excelEffectiveDate) { res.status(400).json({ success: false, message: '生效日期不能为空，请在Excel第2行第5列填写' }); return; }
    if (!excelExpirationDate) { res.status(400).json({ success: false, message: '失效日期不能为空，请在Excel第2行第6列填写' }); return; }

    const price_list_number = await generatePriceListNumber(factoryCode);
    const now = dayjs().format('YYYY/MM/DD HH:mm');
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO sales_price_list (price_list_number, price_list_name, customer_number, customer_name,
          customer_category, effective_date, expiration_date, price_type, currency,
          approval_status, remark, creation_date, creation_man, factory_id)
        VALUES (:price_list_number, :price_list_name, :customer_number, :customer_name,
          :customer_category, :effective_date, :expiration_date, :price_type, :currency,
          N'草稿', :remark, :creation_date, :creation_man, :factory_id)
      `, {
        replacements: {
          price_list_number,
          price_list_name: excelPriceListName,
          customer_number: excelCustomerNumber,
          customer_name: excelCustomerName,
          customer_category: excelCustomerCategory,
          effective_date: excelEffectiveDate || null,
          expiration_date: excelExpirationDate || null,
          price_type: excelPriceType || '含税',
          currency: excelCurrency || 'CNY',
          remark: excelRemark,
          creation_date: now,
          creation_man,
          factory_id: _factoryId
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

// ==================== 查询销售订单可用价格（根据客户+物料） ====================
export const getSalesPriceForOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { customer_number, item_number } = req.query;
    if (!customer_number || !item_number) {
      res.status(400).json({ success: false, message: '客户编号和物料编号不能为空' });
      return;
    }

    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId !== null ? ' AND h.factory_id = :_factoryId' : '';
    const factoryReps = _factoryId !== null ? { _factoryId } : {};

    const [rows]: any = await sequelize.query(`
      SELECT TOP 1
        h.price_type,
        h.currency,
        d.tax_inclusive_price,
        d.tax_exclusive_price,
        d.tax_rate,
        h.price_list_number,
        h.price_list_name,
        h.effective_date,
        h.expiration_date
      FROM sales_price_list h
      INNER JOIN sales_price_list_detail d ON h.price_list_number = d.price_list_number
      WHERE h.approval_status = N'已审批'
        AND (h.customer_number = :customer_number OR h.customer_number = '' OR h.customer_number IS NULL)
        AND d.item_number = :item_number
        AND (h.effective_date IS NULL OR CONVERT(DATE, h.effective_date) <= CONVERT(DATE, GETDATE()))
        AND (h.expiration_date IS NULL OR CONVERT(DATE, h.expiration_date) >= CONVERT(DATE, GETDATE()))
        ${factoryCond}
      ORDER BY h.effective_date DESC, h.creation_date DESC
    `, {
      replacements: { customer_number: String(customer_number), item_number: String(item_number), ...factoryReps }
    });

    if (rows.length === 0) {
      res.json(success(null, '未找到符合条件的销售价目表记录'));
      return;
    }

    const row = rows[0];
    // 始终返回含税单价作为销售订单的unit_price，并返回税率
    const unit_price = parseFloat(row.tax_inclusive_price) || 0;
    const tax_rate = parseFloat(row.tax_rate) || 0;

    res.json(success({
      price_type: row.price_type,
      currency: row.currency,
      unit_price,
      tax_rate,
      tax_exclusive_price: parseFloat(row.tax_exclusive_price) || 0,
      price_list_number: row.price_list_number,
      price_list_name: row.price_list_name
    }, '获取价格成功'));
  } catch (err) { next(err); }
};
