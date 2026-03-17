import { Request, Response, NextFunction } from 'express';
import sequelize from '../config/database';
import { success } from '../utils/response.util';
import { exportToExcel, parseExcelFile } from '../utils/excel.util';

// 扩展表配置
const extConfig: Record<string, { table: string; fields: string[]; headers: string[] }> = {
  '成品': {
    table: 'product_ext',
    fields: ['product_drawing_number', 'rubber_compound_number', 'batch_production_quota', 'standard_pass_rate'],
    headers: ['产品图号', '胶料编号', '批次产量定额', '标准合格率']
  },
  '原材料': {
    table: 'material_ext',
    fields: ['supplier_number', 'supplier_name'],
    headers: ['供应商编号', '供应商名称']
  },
  '半成品': {
    table: 'semi_product_ext',
    fields: ['source_bom_number'],
    headers: ['来源BOM编号']
  },
  '包材': {
    table: 'packaging_ext',
    fields: ['packaging_remark'],
    headers: ['包材备注']
  },
  '骨架': {
    table: 'skeleton_ext',
    fields: ['product_drawing_number', 'standard_pass_rate'],
    headers: ['产品图号', '标准合格率']
  },
  '预成型件': {
    table: 'preform_ext',
    fields: ['rubber_compound_number', 'standard_pass_rate'],
    headers: ['胶料编号', '标准合格率']
  }
};

const commonFields = ['item_number', 'item_name', 'item_type', 'item_class_number', 'item_class_name', 'item_properties', 'basic_unit', 'specifications', 'business_scope', 'remark'];
const commonHeaders = ['物品编号', '物品名称', '物品类型', '分类编号', '分类名称', '物品属性', '基本单位', '规格', '业务范围', '备注'];

// ==================== 查询列表 ====================
export const getItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const itemType = (req.query.item_type as string) || '';

    let whereClause = '';
    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(im.item_number LIKE :search OR im.item_name LIKE :search OR im.item_class_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (itemType) {
      conditions.push(`im.item_type = :itemType`);
      replacements.itemType = itemType;
    }
    if (conditions.length > 0) {
      whereClause = 'WHERE ' + conditions.join(' AND ');
    }

    // 动态JOIN扩展表
    let joinClause = '';
    let extSelect = '';
    if (itemType && extConfig[itemType]) {
      const ext = extConfig[itemType];
      joinClause = `LEFT JOIN ${ext.table} ex ON im.item_number = ex.item_number`;
      extSelect = ext.fields.map(f => `, ex.${f}`).join('');
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM item_master im ${joinClause} ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;
    const offset = (page - 1) * limit;

    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT im.*${extSelect}, ROW_NUMBER() OVER (ORDER BY im.item_number) AS _row_num
        FROM item_master im ${joinClause} ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取物品列表成功'));
  } catch (err) { next(err); }
};

// ==================== 查询详情 ====================
export const getItemDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemNumber } = req.params;
    const [rows]: any = await sequelize.query(
      `SELECT * FROM item_master WHERE item_number = :itemNumber`,
      { replacements: { itemNumber } }
    );
    if (rows.length === 0) { res.status(404).json({ success: false, message: '物品不存在' }); return; }

    const item = rows[0];
    const ext = extConfig[item.item_type];
    if (ext) {
      const [extRows]: any = await sequelize.query(
        `SELECT * FROM ${ext.table} WHERE item_number = :itemNumber`,
        { replacements: { itemNumber } }
      );
      if (extRows.length > 0) {
        Object.assign(item, extRows[0]);
      }
    }

    res.json(success(item, '获取物品详情成功'));
  } catch (err) { next(err); }
};

// ==================== 新建 ====================
export const createItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.item_number) { res.status(400).json({ success: false, message: '物品编号不能为空' }); return; }
    if (!b.item_type) { res.status(400).json({ success: false, message: '物品类型不能为空' }); return; }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        INSERT INTO item_master (item_number, item_name, item_type, item_class_number, item_class_name, item_properties, basic_unit, specifications, business_scope, remark)
        VALUES (:item_number, :item_name, :item_type, :item_class_number, :item_class_name, :item_properties, :basic_unit, :specifications, :business_scope, :remark)
      `, {
        replacements: {
          item_number: b.item_number,
          item_name: b.item_name || '',
          item_type: b.item_type,
          item_class_number: b.item_class_number || '',
          item_class_name: b.item_class_name || '',
          item_properties: b.item_properties || '',
          basic_unit: b.basic_unit || '',
          specifications: b.specifications || '',
          business_scope: b.business_scope || '',
          remark: b.remark || ''
        },
        transaction
      });

      const ext = extConfig[b.item_type];
      if (ext) {
        const extReplacements: any = { item_number: b.item_number };
        ext.fields.forEach(f => { extReplacements[f] = b[f] || ''; });
        const cols = ['item_number', ...ext.fields].join(', ');
        const vals = ['item_number', ...ext.fields].map(f => `:${f}`).join(', ');
        await sequelize.query(`INSERT INTO ${ext.table} (${cols}) VALUES (${vals})`, { replacements: extReplacements, transaction });
      }

      await transaction.commit();
      res.json(success(null, '创建物品成功'));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 更新 ====================
export const updateItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemNumber } = req.params;
    const b = req.body;

    // 获取当前item_type（不允许修改）
    const [rows]: any = await sequelize.query(
      `SELECT item_type FROM item_master WHERE item_number = :itemNumber`,
      { replacements: { itemNumber } }
    );
    if (rows.length === 0) { res.status(404).json({ success: false, message: '物品不存在' }); return; }
    const itemType = rows[0].item_type;

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`
        UPDATE item_master SET
          item_name = :item_name, item_class_number = :item_class_number, item_class_name = :item_class_name,
          item_properties = :item_properties, basic_unit = :basic_unit, specifications = :specifications, business_scope = :business_scope, remark = :remark
        WHERE item_number = :itemNumber
      `, {
        replacements: {
          itemNumber,
          item_name: b.item_name, item_class_number: b.item_class_number, item_class_name: b.item_class_name,
          item_properties: b.item_properties, basic_unit: b.basic_unit, specifications: b.specifications, business_scope: b.business_scope || '', remark: b.remark
        },
        transaction
      });

      const ext = extConfig[itemType];
      if (ext) {
        const setClauses = ext.fields.map(f => `${f} = :${f}`).join(', ');
        const extReplacements: any = { itemNumber };
        ext.fields.forEach(f => { extReplacements[f] = b[f] !== undefined ? b[f] : ''; });

        // UPSERT: 先尝试更新，不存在则插入
        const [updateResult]: any = await sequelize.query(
          `UPDATE ${ext.table} SET ${setClauses} WHERE item_number = :itemNumber`,
          { replacements: extReplacements, transaction }
        );
        if (updateResult === 0) {
          extReplacements.item_number = itemNumber;
          const cols = ['item_number', ...ext.fields].join(', ');
          const vals = ['item_number', ...ext.fields].map(f => `:${f === 'itemNumber' ? 'item_number' : f}`).join(', ');
          await sequelize.query(`INSERT INTO ${ext.table} (${cols}) VALUES (${vals})`, { replacements: extReplacements, transaction });
        }
      }

      await transaction.commit();
      res.json(success(null, '更新物品成功'));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 删除 ====================
export const deleteItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemNumber } = req.params;

    // 检查引用
    const refChecks = [
      { table: 'bom_header', field: 'item_number', name: 'BOM' },
      { table: 'bom_detail', field: 'material_number', name: 'BOM明细' },
      { table: 'routing_header', field: 'item_number', name: '工艺路线' },
      { table: 'Production_plan', field: 'item_number', name: '生产计划' },
      { table: 'production_task', field: 'item_number', name: '生产任务' }
    ];
    for (const ref of refChecks) {
      try {
        const [result]: any = await sequelize.query(
          `SELECT COUNT(*) as cnt FROM ${ref.table} WHERE ${ref.field} = :itemNumber`,
          { replacements: { itemNumber } }
        );
        if (result[0].cnt > 0) {
          res.status(400).json({ success: false, message: `该物品被${ref.name}引用，无法删除` });
          return;
        }
      } catch { /* 表不存在则跳过 */ }
    }

    // 获取item_type用于删除扩展表
    const [rows]: any = await sequelize.query(
      `SELECT item_type FROM item_master WHERE item_number = :itemNumber`,
      { replacements: { itemNumber } }
    );
    if (rows.length === 0) { res.status(404).json({ success: false, message: '物品不存在' }); return; }

    const transaction = await sequelize.transaction();
    try {
      const ext = extConfig[rows[0].item_type];
      if (ext) {
        await sequelize.query(`DELETE FROM ${ext.table} WHERE item_number = :itemNumber`, { replacements: { itemNumber }, transaction });
      }
      await sequelize.query(`DELETE FROM item_master WHERE item_number = :itemNumber`, { replacements: { itemNumber }, transaction });
      await transaction.commit();
      res.json(success(null, '删除物品成功'));
    } catch (err) {
      await transaction.rollback();
      throw err;
    }
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
export const exportItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    const itemType = (req.query.item_type as string) || '';

    let whereClause = '';
    const conditions: string[] = [];
    const replacements: any = {};

    if (search) { conditions.push(`(im.item_number LIKE :search OR im.item_name LIKE :search)`); replacements.search = `%${search}%`; }
    if (itemType) { conditions.push(`im.item_type = :itemType`); replacements.itemType = itemType; }
    if (conditions.length > 0) { whereClause = 'WHERE ' + conditions.join(' AND '); }

    let joinClause = '';
    let extSelect = '';
    let allFields = [...commonFields];
    let allHeaders = [...commonHeaders];

    if (itemType && extConfig[itemType]) {
      const ext = extConfig[itemType];
      joinClause = `LEFT JOIN ${ext.table} ex ON im.item_number = ex.item_number`;
      extSelect = ext.fields.map(f => `, ex.${f}`).join('');
      allFields = [...allFields, ...ext.fields];
      allHeaders = [...allHeaders, ...ext.headers];
    }

    const [items]: any = await sequelize.query(
      `SELECT im.*${extSelect} FROM item_master im ${joinClause} ${whereClause} ORDER BY im.item_number`,
      { replacements }
    );

    exportToExcel(items, allFields, allHeaders, 'items', res);
  } catch (err) { next(err); }
};

// ==================== 导入 ====================
export const importItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }

    const itemType = (req.query.item_type as string) || (req.body.item_type as string) || '';
    if (!itemType) { res.status(400).json({ success: false, message: '请指定物品类型(item_type)' }); return; }

    const ext = extConfig[itemType];
    const allFields = [...commonFields, ...(ext ? ext.fields : [])];
    const allHeaders = [...commonHeaders, ...(ext ? ext.headers : [])];

    const rows = parseExcelFile(req.file.buffer, allFields, allHeaders);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }

    let imported = 0;
    let skipped = 0;

    for (const row of rows) {
      if (!row.item_number) { skipped++; continue; }
      row.item_type = itemType;

      try {
        const [existing]: any = await sequelize.query(
          `SELECT COUNT(*) as cnt FROM item_master WHERE item_number = :item_number`,
          { replacements: { item_number: row.item_number } }
        );

        const transaction = await sequelize.transaction();
        try {
          if (existing[0].cnt > 0) {
            await sequelize.query(`
              UPDATE item_master SET item_name = :item_name, item_class_number = :item_class_number, item_class_name = :item_class_name,
                item_properties = :item_properties, basic_unit = :basic_unit, specifications = :specifications, business_scope = :business_scope, remark = :remark
              WHERE item_number = :item_number
            `, { replacements: row, transaction });

            if (ext) {
              const setClauses = ext.fields.map(f => `${f} = :${f}`).join(', ');
              await sequelize.query(`UPDATE ${ext.table} SET ${setClauses} WHERE item_number = :item_number`, { replacements: row, transaction });
            }
          } else {
            await sequelize.query(`
              INSERT INTO item_master (item_number, item_name, item_type, item_class_number, item_class_name, item_properties, basic_unit, specifications, business_scope, remark)
              VALUES (:item_number, :item_name, :item_type, :item_class_number, :item_class_name, :item_properties, :basic_unit, :specifications, :business_scope, :remark)
            `, { replacements: row, transaction });

            if (ext) {
              const extReplacements: any = { item_number: row.item_number };
              ext.fields.forEach(f => { extReplacements[f] = row[f] || ''; });
              const cols = ['item_number', ...ext.fields].join(', ');
              const vals = ['item_number', ...ext.fields].map(f => `:${f}`).join(', ');
              await sequelize.query(`INSERT INTO ${ext.table} (${cols}) VALUES (${vals})`, { replacements: extReplacements, transaction });
            }
          }
          await transaction.commit();
          imported++;
        } catch { await transaction.rollback(); skipped++; }
      } catch { skipped++; }
    }

    res.json(success({ imported, skipped }, `导入完成，成功 ${imported} 条，跳过 ${skipped} 条`));
  } catch (err) { next(err); }
};
