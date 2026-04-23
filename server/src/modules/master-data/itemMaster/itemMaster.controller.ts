import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { APPROVAL_STATUS } from '@/shared/constants/statuses';

dotenv.config();
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

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
    fields: ['rubber_compound_number', 'standard_pass_rate', 'formed_part_materia_consumption'],
    headers: ['胶料编号', '标准合格率', '成型件单耗']
  }
};

// 基础字段（原有）
const baseFields = ['item_number', 'item_name', 'item_type', 'item_class_number', 'item_class_name', 'item_properties', 'basic_unit', 'specifications', 'business_scope', 'safety_stock_enabled', 'safety_stock_qty', 'lead_time_days', 'purchase_lead_time_days', 'remark'];
const baseHeaders = ['物品编号', '物品名称', '物品类型', '分类编号', '分类名称', '物品属性', '基本单位', '规格', '业务范围', '安全库存管理', '安全库存数', '生产提前期(天)', '采购提前期(天)', '备注'];

// 库存基础分区字段
const inventoryFields = ['batch_management', 'stagnation_days', 'lock_inventory', 'default_warehouse', 'standard_cost', 'actual_cost', 'rounding_method', 'abc_class', 'inventory_unit', 'outbound_method'];
const inventoryHeaders = ['批次管理', '呆滞日期', '启用锁库', '默认仓库', '标准成本', '实际成本', '取整方式', 'ABC分类', '库存单位', '出库方式'];

// 生产&计划分区字段
const productionFields = ['daily_capacity', 'default_routing', 'defect_rate', 'conversion_batch_size', 'planning_strategy', 'increment_size', 'planning_batch_size', 'production_unit'];
const productionHeaders = ['日产能', '默认工艺', '次品率', '转换批量大小', '计划策略', '增量大小', '计划批量大小', '生产单位'];

// 供应链分区字段
const supplyFields = ['configurable_item', 'market_price_tax', 'sales_unit', 'sales_tax_rate', 'sales_price_list', 'over_delivery_rate', 'purchase_unit'];
const supplyHeaders = ['可配置物料', '市场价含税', '销售单位', '销项税率', '销售价目表', '超额发货比例', '采购单位'];

// 质量检验分区字段
const qualityFields = ['incoming_inspection'];
const qualityHeaders = ['收料检验'];

// 合并所有字段（用于导出）
const commonFields = [...baseFields, ...inventoryFields, ...productionFields, ...supplyFields, ...qualityFields];
const commonHeaders = [...baseHeaders, ...inventoryHeaders, ...productionHeaders, ...supplyHeaders, ...qualityHeaders];

// ==================== 查询列表 ====================
export const getItems = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const itemType = (req.query.item_type as string) || '';
    const itemProperties = (req.query.item_properties as string) || '';

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
    if (itemProperties) {
      const propList = itemProperties.split(',').map(s => s.trim()).filter(Boolean);
      if (propList.length === 1) {
        conditions.push(`im.item_properties = :itemProperties`);
        replacements.itemProperties = propList[0];
      } else if (propList.length > 1) {
        conditions.push(`im.item_properties IN (:itemProperties)`);
        replacements.itemProperties = propList;
      }
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
      // 构建动态INSERT语句，包含所有新增字段
      const allFields = [...baseFields, ...inventoryFields, ...productionFields, ...supplyFields, ...qualityFields, 'creation_date'];
      const fieldList = allFields.join(', ');
      const valueList = allFields.map(f => `:${f}`).join(', ');
      
      // 构建替换值
      const replacements: any = {
        item_number: b.item_number,
        item_name: b.item_name || '',
        item_type: b.item_type,
        item_class_number: b.item_class_number || '',
        item_class_name: b.item_class_name || '',
        item_properties: b.item_properties || '',
        basic_unit: b.basic_unit || '',
        specifications: b.specifications || '',
        business_scope: b.business_scope || '',
        safety_stock_enabled: b.safety_stock_enabled || 'N',
        safety_stock_qty: b.safety_stock_qty || 0,
        lead_time_days: b.lead_time_days || 0,
        purchase_lead_time_days: b.purchase_lead_time_days || 0,
        remark: b.remark || '',
        // 库存基础字段
        batch_management: b.batch_management || 'N',
        stagnation_days: b.stagnation_days || 999,
        lock_inventory: b.lock_inventory || 'N',
        default_warehouse: b.default_warehouse || '',
        standard_cost: b.standard_cost || 0,
        actual_cost: b.actual_cost || 0,
        rounding_method: b.rounding_method || '不取整',
        abc_class: b.abc_class || '',
        inventory_unit: b.inventory_unit || '',
        outbound_method: b.outbound_method || '无限制',
        // 生产&计划字段
        daily_capacity: b.daily_capacity || 0,
        default_routing: b.default_routing || '',
        defect_rate: b.defect_rate || 0,
        conversion_batch_size: b.conversion_batch_size || 0,
        planning_strategy: b.planning_strategy || '其他',
        increment_size: b.increment_size || 0,
        planning_batch_size: b.planning_batch_size || 0,
        production_unit: b.production_unit || '',
        // 供应链字段
        configurable_item: b.configurable_item || 'N',
        market_price_tax: b.market_price_tax || 0,
        sales_unit: b.sales_unit || '',
        sales_tax_rate: b.sales_tax_rate || 0,
        sales_price_list: b.sales_price_list || '',
        over_delivery_rate: b.over_delivery_rate || 0,
        purchase_unit: b.purchase_unit || '',
        // 质量检验字段
        incoming_inspection: b.incoming_inspection || 'N',
        creation_date: new Date()
      };

      await sequelize.query(`
        INSERT INTO item_master (${fieldList})
        VALUES (${valueList})
      `, { replacements, transaction });

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

    // 获取当前item_type和审核状态
    const [rows]: any = await sequelize.query(
      `SELECT item_type, approval_status FROM item_master WHERE item_number = :itemNumber`,
      { replacements: { itemNumber } }
    );
    if (rows.length === 0) { res.status(404).json({ success: false, message: '物品不存在' }); return; }
    if ((rows[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
      res.status(403).json({ success: false, message: '已审核的记录不允许编辑，请先撤消审核' });
      return;
    }
    const itemType = rows[0].item_type;

    const transaction = await sequelize.transaction();
    try {
      // 动态构建 UPDATE 语句，只更新传入的字段
      const setClauses: string[] = [];
      const replacements: any = { itemNumber };

      // 基础字段
      const baseFieldList = ['item_name', 'item_class_number', 'item_class_name', 'item_properties', 'basic_unit', 'specifications', 'business_scope', 'safety_stock_enabled', 'safety_stock_qty', 'lead_time_days', 'purchase_lead_time_days', 'remark'];
      baseFieldList.forEach(field => {
        if (b[field] !== undefined) {
          setClauses.push(`${field} = :${field}`);
          replacements[field] = b[field];
        }
      });

      // 库存基础字段
      inventoryFields.forEach(field => {
        if (b[field] !== undefined) {
          setClauses.push(`${field} = :${field}`);
          replacements[field] = b[field];
        }
      });

      // 生产&计划字段
      productionFields.forEach(field => {
        if (b[field] !== undefined) {
          setClauses.push(`${field} = :${field}`);
          replacements[field] = b[field];
        }
      });

      // 供应链字段
      supplyFields.forEach(field => {
        if (b[field] !== undefined) {
          setClauses.push(`${field} = :${field}`);
          replacements[field] = b[field];
        }
      });

      // 质量检验字段
      qualityFields.forEach(field => {
        if (b[field] !== undefined) {
          setClauses.push(`${field} = :${field}`);
          replacements[field] = b[field];
        }
      });

      // 如果没有要更新的字段，跳过 UPDATE
      if (setClauses.length > 0) {
        await sequelize.query(`
          UPDATE item_master SET ${setClauses.join(', ')} WHERE item_number = :itemNumber
        `, { replacements, transaction });
      }

      const ext = extConfig[itemType];
      if (ext) {
        const setClauses = ext.fields.map(f => `${f} = :${f}`).join(', ');
        const extReplacements: any = { itemNumber };
        ext.fields.forEach(f => { extReplacements[f] = b[f] !== undefined ? b[f] : ''; });

        // 先检查扩展表记录是否存在
        const [existCheck]: any = await sequelize.query(
          `SELECT COUNT(*) as cnt FROM ${ext.table} WHERE item_number = :itemNumber`,
          { replacements: { itemNumber }, transaction }
        );
        if (existCheck[0].cnt > 0) {
          // 记录存在 → UPDATE
          await sequelize.query(
            `UPDATE ${ext.table} SET ${setClauses} WHERE item_number = :itemNumber`,
            { replacements: extReplacements, transaction }
          );
        } else {
          // 记录不存在 → INSERT
          extReplacements.item_number = itemNumber;
          const cols = ['item_number', ...ext.fields].join(', ');
          const vals = ['item_number', ...ext.fields].map(f => `:${f}`).join(', ');
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

    // 审核状态检查
    const [chk]: any = await sequelize.query(
      `SELECT approval_status FROM item_master WHERE item_number = :itemNumber`,
      { replacements: { itemNumber } }
    );
    if (chk.length && (chk[0].approval_status || '').trim() === APPROVAL_STATUS.APPROVED) {
      res.status(403).json({ success: false, message: '已审核的记录不允许删除，请先撤消审核' });
      return;
    }

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

      // 级联删除附件: 先查询所有附件的 stored_name
      const [attachments]: any = await sequelize.query(
        `SELECT stored_name FROM item_attachment WHERE item_number = :itemNumber`,
        { replacements: { itemNumber }, transaction }
      );
      await sequelize.query(`DELETE FROM item_attachment WHERE item_number = :itemNumber`, { replacements: { itemNumber }, transaction });

      await sequelize.query(`DELETE FROM item_master WHERE item_number = :itemNumber`, { replacements: { itemNumber }, transaction });
      await transaction.commit();

      // 事务提交后异步删除物理文件 (fire-and-forget)
      if (attachments.length > 0) {
        for (const att of attachments) {
          try { fs.unlinkSync(path.resolve(UPLOAD_DIR, att.stored_name)); } catch {}
        }
      }

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
      row.purchase_lead_time_days = row.purchase_lead_time_days || 0;

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
                item_properties = :item_properties, basic_unit = :basic_unit, specifications = :specifications, business_scope = :business_scope,
                safety_stock_enabled = :safety_stock_enabled, safety_stock_qty = :safety_stock_qty, lead_time_days = :lead_time_days, purchase_lead_time_days = :purchase_lead_time_days, remark = :remark
              WHERE item_number = :item_number
            `, { replacements: row, transaction });

            if (ext) {
              const setClauses = ext.fields.map(f => `${f} = :${f}`).join(', ');
              await sequelize.query(`UPDATE ${ext.table} SET ${setClauses} WHERE item_number = :item_number`, { replacements: row, transaction });
            }
          } else {
            await sequelize.query(`
              INSERT INTO item_master (item_number, item_name, item_type, item_class_number, item_class_name, item_properties, basic_unit, specifications, business_scope, safety_stock_enabled, safety_stock_qty, lead_time_days, purchase_lead_time_days, remark, creation_date)
              VALUES (:item_number, :item_name, :item_type, :item_class_number, :item_class_name, :item_properties, :basic_unit, :specifications, :business_scope, :safety_stock_enabled, :safety_stock_qty, :lead_time_days, :purchase_lead_time_days, :remark, GETDATE())
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

export const approveItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemNumber } = req.params;
    await sequelize.query(`UPDATE item_master SET approval_status = N'已审核' WHERE item_number = :itemNumber`, { replacements: { itemNumber } });
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawItem = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { itemNumber } = req.params;
    await sequelize.query(`UPDATE item_master SET approval_status = N'未审核' WHERE item_number = :itemNumber`, { replacements: { itemNumber } });
    res.json(success(null, '已撤消审核'));
  } catch (err) { next(err); }
};
