import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { CONDITION_STATUS, ORDER_STATUS } from '@/shared/constants/statuses';

// ==================== Header CRUD ====================

export const getBomHeaders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const condition = (req.query.condition as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const bom_type = (req.query.bom_type as string) || '';
    const f_bom_number = (req.query.bom_number as string) || '';
    const f_bom_name = (req.query.bom_name as string) || '';
    const f_item_number = (req.query.item_number as string) || '';
    const f_item_name = (req.query.item_name as string) || '';
    const conditions: string[] = [];
    const replacements: any = {};
    if (search) { conditions.push(`(bom_number LIKE :search OR bom_name LIKE :search OR item_number LIKE :search OR item_name LIKE :search)`); replacements.search = `%${search}%`; }
    if (condition) { conditions.push(`[condition] = :condition`); replacements.condition = condition; }
    if (approval_status) { conditions.push(`approval_status = :approval_status`); replacements.approval_status = approval_status; }
    if (bom_type) { conditions.push(`bom_type = :bom_type`); replacements.bom_type = bom_type; }
    if (f_bom_number) { conditions.push(`bom_number LIKE :f_bom_number`); replacements.f_bom_number = `%${f_bom_number}%`; }
    if (f_bom_name) { conditions.push(`bom_name LIKE :f_bom_name`); replacements.f_bom_name = `%${f_bom_name}%`; }
    if (f_item_number) { conditions.push(`item_number LIKE :f_item_number`); replacements.f_item_number = `%${f_item_number}%`; }
    if (f_item_name) { conditions.push(`item_name LIKE :f_item_name`); replacements.f_item_name = `%${f_item_name}%`; }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM bom_header ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY bom_number) AS _row_num FROM bom_header ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取BOM列表成功'));
  } catch (err) { next(err); }
};

export const getBomHeaderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(`SELECT * FROM bom_header WHERE bom_number = :id`, { replacements: { id } });
    if (!headers.length) { res.status(404).json({ success: false, message: 'BOM不存在' }); return; }
    const [details]: any = await sequelize.query(`SELECT * FROM bom_detail WHERE bom_number = :id ORDER BY line_number`, { replacements: { id } });

    // 批量检查哪些物料拥有可用子BOM
    const materialNumbers = details.map((d: any) => d.material_number).filter((m: string) => m);
    let bomMap: Record<string, string> = {};
    if (materialNumbers.length > 0) {
      const placeholders = materialNumbers.map((_: string, i: number) => `:m${i}`).join(',');
      const matReplacements: any = {};
      materialNumbers.forEach((m: string, i: number) => { matReplacements[`m${i}`] = m; });
      const [bomRows]: any = await sequelize.query(
        `SELECT item_number, bom_number FROM bom_header WHERE item_number IN (${placeholders}) AND [condition] = N'启用'`,
        { replacements: matReplacements }
      );
      for (const row of bomRows) {
        if (!bomMap[row.item_number]) bomMap[row.item_number] = row.bom_number;
      }
    }
    const enrichedDetails = details.map((d: any) => ({
      ...d,
      has_child_bom: !!(d.child_bom_number || bomMap[d.material_number]),
      matched_bom_number: d.child_bom_number || bomMap[d.material_number] || null
    }));

    res.json(success({ header: headers[0], details: enrichedDetails }, '获取BOM详情成功'));
  } catch (err) { next(err); }
};

export const createBomHeader = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.bom_number) { res.status(400).json({ success: false, message: 'BOM编号不能为空' }); return; }

    // BOM创建资格校验
    if (b.item_number) {
      const [itemRows]: any = await sequelize.query(
        `SELECT item_type, business_scope FROM item_master WHERE item_number = :item_number`,
        { replacements: { item_number: b.item_number } }
      );
      if (itemRows.length > 0) {
        const itemType = itemRows[0].item_type;
        const businessScope = itemRows[0].business_scope || '';
        if (itemType === '原材料' || itemType === '包材') {
          res.status(400).json({ success: false, message: `该物品类型(${itemType})不允许创建BOM` }); return;
        }
        if ((itemType === '半成品' || itemType === '预成型件' || itemType === '骨架') && !businessScope.includes('生产')) {
          res.status(400).json({ success: false, message: `该物品(${itemType})的业务范围不包含"生产"，不允许创建BOM` }); return;
        }
      }
    }

    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const creation_man = (req as any).user?.username || '';
    await sequelize.query(`INSERT INTO bom_header (bom_number, bom_name, item_number, item_name, bom_version, bom_type, base_quantity, base_unit, process_route_number, [condition], approval_status, remark, creation_date, creation_man) VALUES (:bom_number, :bom_name, :item_number, :item_name, :bom_version, :bom_type, :base_quantity, :base_unit, :process_route_number, :condition, N'草稿', :remark, :creation_date, :creation_man)`, {
      replacements: {
        bom_number: b.bom_number,
        bom_name: b.bom_name || '',
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        bom_version: b.bom_version || 'V1.0',
        bom_type: b.bom_type || '标准BOM',
        base_quantity: b.base_quantity || 1,
        base_unit: b.base_unit || '',
        process_route_number: b.process_route_number || '',
        condition: b.condition || CONDITION_STATUS.ENABLED,
        remark: b.remark || '',
        creation_date,
        creation_man
      }
    });
    res.json(success(null, '创建BOM成功'));
  } catch (err) { next(err); }
};

export const updateBomHeader = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const [check]: any = await sequelize.query(`SELECT approval_status FROM bom_header WHERE bom_number = :id`, { replacements: { id } });
    if (check.length && check[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return; }
    await sequelize.query(`UPDATE bom_header SET bom_name = :bom_name, item_number = :item_number, item_name = :item_name, bom_version = :bom_version, bom_type = :bom_type, base_quantity = :base_quantity, base_unit = :base_unit, process_route_number = :process_route_number, [condition] = :condition, remark = :remark WHERE bom_number = :id`, {
      replacements: {
        id,
        bom_name: b.bom_name || '',
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        bom_version: b.bom_version || 'V1.0',
        bom_type: b.bom_type || '标准BOM',
        base_quantity: b.base_quantity || 1,
        base_unit: b.base_unit || '',
        process_route_number: b.process_route_number || '',
        condition: b.condition || CONDITION_STATUS.ENABLED,
        remark: b.remark || ''
      }
    });
    res.json(success(null, '更新BOM成功'));
  } catch (err) { next(err); }
};

export const deleteBomHeader = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [check]: any = await sequelize.query(`SELECT approval_status FROM bom_header WHERE bom_number = :id`, { replacements: { id } });
    if (check.length && check[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return; }
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM bom_detail WHERE bom_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM bom_header WHERE bom_number = :id`, { replacements: { id }, transaction });
      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
    res.json(success(null, '删除BOM成功'));
  } catch (err) { next(err); }
};

// ==================== Detail CRUD ====================

export const getBomDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    const [items]: any = await sequelize.query(`SELECT * FROM bom_detail WHERE bom_number = :headerId ORDER BY line_number`, { replacements: { headerId } });
    res.json(success(items, '获取BOM明细成功'));
  } catch (err) { next(err); }
};

export const addBomDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    const b = req.body;
    // 审批状态校验：只有草稿状态的主表才允许新增明细
    const [headerCheck]: any = await sequelize.query(`SELECT approval_status FROM bom_header WHERE bom_number = :headerId`, { replacements: { headerId } });
    if (headerCheck.length && headerCheck[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '主表已提交审批或已审批，不允许新增物料明细' }); return; }
    let line_number = b.line_number;
    if (!line_number) {
      const [maxResult]: any = await sequelize.query(`SELECT ISNULL(MAX(line_number), 0) as max_line FROM bom_detail WHERE bom_number = :headerId`, { replacements: { headerId } });
      line_number = (maxResult[0].max_line || 0) + 10;
    }
    const std_qty = parseFloat(b.standard_quantity) || 0;
    const wst_rate = parseFloat(b.wastage_rate) || 0;
    const actual_quantity = Math.round(std_qty * (1 + wst_rate / 100) * 10000) / 10000;
    const [result]: any = await sequelize.query(`INSERT INTO bom_detail (bom_number, line_number, material_number, material_name, material_type, standard_quantity, unit, wastage_rate, actual_quantity, step_number, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, child_bom_number, remark) OUTPUT INSERTED.id VALUES (:bom_number, :line_number, :material_number, :material_name, :material_type, :standard_quantity, :unit, :wastage_rate, :actual_quantity, :step_number, :is_key_material, :substitute_group, :substitute_priority, :supply_type, :default_warehouse, :child_bom_number, :remark)`, {
      replacements: {
        bom_number: headerId,
        line_number,
        material_number: b.material_number || '',
        material_name: b.material_name || '',
        material_type: b.material_type || '',
        standard_quantity: std_qty,
        unit: b.unit || '',
        wastage_rate: wst_rate,
        actual_quantity,
        step_number: b.step_number || null,
        is_key_material: b.is_key_material || 0,
        substitute_group: b.substitute_group || '',
        substitute_priority: b.substitute_priority || 0,
        supply_type: b.supply_type || '',
        default_warehouse: b.default_warehouse || '',
        child_bom_number: b.child_bom_number || null,
        remark: b.remark || ''
      }
    });
    const newId = result[0]?.id;
    res.json(success({ id: newId, line_number }, '新增BOM明细成功'));
  } catch (err) { next(err); }
};

export const updateBomDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const b = req.body;
    // 审批状态校验：查找明细所属主表，只有草稿状态才允许编辑
    const [detailRow]: any = await sequelize.query(`SELECT bom_number FROM bom_detail WHERE id = :detailId`, { replacements: { detailId } });
    if (detailRow.length) {
      const [headerCheck]: any = await sequelize.query(`SELECT approval_status FROM bom_header WHERE bom_number = :bomNum`, { replacements: { bomNum: detailRow[0].bom_number } });
      if (headerCheck.length && headerCheck[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '主表已提交审批或已审批，不允许编辑物料明细' }); return; }
    }
    const std_qty = parseFloat(b.standard_quantity) || 0;
    const wst_rate = parseFloat(b.wastage_rate) || 0;
    const actual_quantity = Math.round(std_qty * (1 + wst_rate / 100) * 10000) / 10000;
    await sequelize.query(`UPDATE bom_detail SET line_number = :line_number, material_number = :material_number, material_name = :material_name, material_type = :material_type, standard_quantity = :standard_quantity, unit = :unit, wastage_rate = :wastage_rate, actual_quantity = :actual_quantity, step_number = :step_number, is_key_material = :is_key_material, substitute_group = :substitute_group, substitute_priority = :substitute_priority, supply_type = :supply_type, default_warehouse = :default_warehouse, child_bom_number = :child_bom_number, remark = :remark WHERE id = :detailId`, {
      replacements: {
        detailId,
        line_number: b.line_number || 10,
        material_number: b.material_number || '',
        material_name: b.material_name || '',
        material_type: b.material_type || '',
        standard_quantity: std_qty,
        unit: b.unit || '',
        wastage_rate: wst_rate,
        actual_quantity,
        step_number: b.step_number || null,
        is_key_material: b.is_key_material || 0,
        substitute_group: b.substitute_group || '',
        substitute_priority: b.substitute_priority || 0,
        supply_type: b.supply_type || '',
        default_warehouse: b.default_warehouse || '',
        child_bom_number: b.child_bom_number || null,
        remark: b.remark || ''
      }
    });
    res.json(success(null, '更新BOM明细成功'));
  } catch (err) { next(err); }
};

export const deleteBomDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    // 审批状态校验：查找明细所属主表，只有草稿状态才允许删除
    const [detailRow]: any = await sequelize.query(`SELECT bom_number FROM bom_detail WHERE id = :detailId`, { replacements: { detailId } });
    if (detailRow.length) {
      const [headerCheck]: any = await sequelize.query(`SELECT approval_status FROM bom_header WHERE bom_number = :bomNum`, { replacements: { bomNum: detailRow[0].bom_number } });
      if (headerCheck.length && headerCheck[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '主表已提交审批或已审批，不允许删除物料明细' }); return; }
    }
    await sequelize.query(`DELETE FROM bom_detail WHERE id = :detailId`, { replacements: { detailId } });
    res.json(success(null, '删除BOM明细成功'));
  } catch (err) { next(err); }
};

// ==================== Export / Import ====================

const exportFields = ['bom_number', 'bom_name', 'item_number', 'item_name', 'bom_version', 'bom_type', 'base_quantity', 'base_unit', 'process_route_number', 'condition', 'line_number', 'material_number', 'material_name', 'material_type', 'standard_quantity', 'unit', 'wastage_rate', 'actual_quantity', 'is_key_material', 'substitute_group', 'substitute_priority', 'supply_type', 'default_warehouse', 'remark'];
const exportHeaders = ['BOM编号', 'BOM名称', '产品编号', '产品名称', '版本号', 'BOM类型', '基准数量', '基准单位', '关联工艺路线', '状态', '行号', '物料编号', '物料名称', '物料类型', '标准用量', '单位', '损耗率(%)', '实际用量', '关键物料', '替代料组号', '替代优先级', '供应类型', '默认仓库', '备注'];

export const exportBomData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT h.bom_number, h.bom_name, h.item_number, h.item_name, h.bom_version, h.bom_type, h.base_quantity, h.base_unit, h.process_route_number, h.[condition], d.line_number, d.material_number, d.material_name, d.material_type, d.standard_quantity, d.unit, d.wastage_rate, d.actual_quantity, d.is_key_material, d.substitute_group, d.substitute_priority, d.supply_type, d.default_warehouse, d.remark FROM bom_header h LEFT JOIN bom_detail d ON h.bom_number = d.bom_number ORDER BY h.bom_number, d.line_number`);
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, exportFields, exportHeaders, 'bom_data', res, format);
  } catch (err) { next(err); }
};

export const importBomData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, exportFields, exportHeaders);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }

    const creation_man = (req as any).user?.username || '';
    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const grouped: Record<string, any[]> = {};
    for (const row of rows) {
      const key = row.bom_number || '';
      if (!key) continue;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(row);
    }

    let headerCount = 0;
    let detailCount = 0;
    const transaction = await sequelize.transaction();
    try {
      for (const [bomNum, groupRows] of Object.entries(grouped)) {
        const first = groupRows[0];
        const [existing]: any = await sequelize.query(`SELECT bom_number FROM bom_header WHERE bom_number = :id`, { replacements: { id: bomNum }, transaction });
        if (!existing.length) {
          await sequelize.query(`INSERT INTO bom_header (bom_number, bom_name, item_number, item_name, bom_version, bom_type, base_quantity, base_unit, process_route_number, [condition], approval_status, remark, creation_date, creation_man) VALUES (:bom_number, :bom_name, :item_number, :item_name, :bom_version, :bom_type, :base_quantity, :base_unit, :process_route_number, :condition, N'草稿', '', :creation_date, :creation_man)`, {
            replacements: {
              bom_number: bomNum,
              bom_name: first.bom_name || '',
              item_number: first.item_number || '',
              item_name: first.item_name || '',
              bom_version: first.bom_version || 'V1.0',
              bom_type: first.bom_type || '标准BOM',
              base_quantity: first.base_quantity || 1,
              base_unit: first.base_unit || '',
              process_route_number: first.process_route_number || '',
              condition: first.condition || CONDITION_STATUS.ENABLED,
              creation_date,
              creation_man
            }, transaction
          });
          headerCount++;
        }
        for (const row of groupRows) {
          if (!row.material_number && !row.line_number) continue;
          const std_qty = parseFloat(row.standard_quantity) || 0;
          const wst_rate = parseFloat(row.wastage_rate) || 0;
          const actual_quantity = Math.round(std_qty * (1 + wst_rate / 100) * 10000) / 10000;
          await sequelize.query(`INSERT INTO bom_detail (bom_number, line_number, material_number, material_name, material_type, standard_quantity, unit, wastage_rate, actual_quantity, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, remark) VALUES (:bom_number, :line_number, :material_number, :material_name, :material_type, :standard_quantity, :unit, :wastage_rate, :actual_quantity, :is_key_material, :substitute_group, :substitute_priority, :supply_type, :default_warehouse, :remark)`, {
            replacements: {
              bom_number: bomNum,
              line_number: row.line_number || 10,
              material_number: row.material_number || '',
              material_name: row.material_name || '',
              material_type: row.material_type || '',
              standard_quantity: std_qty,
              unit: row.unit || '',
              wastage_rate: wst_rate,
              actual_quantity,
              is_key_material: row.is_key_material || 0,
              substitute_group: row.substitute_group || '',
              substitute_priority: row.substitute_priority || 0,
              supply_type: row.supply_type || '',
              default_warehouse: row.default_warehouse || '',
              remark: row.remark || ''
            }, transaction
          });
          detailCount++;
        }
      }
      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
    res.json(success({ headerCount, detailCount }, `成功导入 ${headerCount} 条BOM，${detailCount} 条明细`));
  } catch (err) { next(err); }
};

// ==================== Version Copy ====================

export const copyBomAsNewVersion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(`SELECT * FROM bom_header WHERE bom_number = :id`, { replacements: { id } });
    if (!headers.length) { res.status(404).json({ success: false, message: 'BOM不存在' }); return; }
    const source = headers[0];
    if (source.approval_status !== '已审批') { res.status(400).json({ success: false, message: '只有已审批的BOM才能复制为新版本' }); return; }

    // 递增版本号
    const currentVersion = source.bom_version || 'V1.0';
    const versionNum = parseInt(currentVersion.replace(/[^0-9]/g, '')) || 1;
    const newVersion = `V${versionNum + 1}.0`;
    const newBomNumber = `${id}-${newVersion}`;

    // 检查新编号是否已存在
    const [existCheck]: any = await sequelize.query(`SELECT bom_number FROM bom_header WHERE bom_number = :newId`, { replacements: { newId: newBomNumber } });
    if (existCheck.length) { res.status(400).json({ success: false, message: `BOM编号 ${newBomNumber} 已存在` }); return; }

    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`INSERT INTO bom_header (bom_number, bom_name, item_number, item_name, bom_version, bom_type, base_quantity, base_unit, process_route_number, [condition], approval_status, remark, creation_date, creation_man) VALUES (:bom_number, :bom_name, :item_number, :item_name, :bom_version, :bom_type, :base_quantity, :base_unit, :process_route_number, :condition, N'草稿', :remark, :creation_date, :creation_man)`, {
        replacements: {
          bom_number: newBomNumber,
          bom_name: source.bom_name || '',
          item_number: source.item_number || '',
          item_name: source.item_name || '',
          bom_version: newVersion,
          bom_type: source.bom_type || '',
          base_quantity: source.base_quantity || 1,
          base_unit: source.base_unit || '',
          process_route_number: source.process_route_number || '',
          condition: source.condition || CONDITION_STATUS.ENABLED,
          remark: source.remark || '',
          creation_date,
          creation_man
        }, transaction
      });

      // 复制所有明细
      const [details]: any = await sequelize.query(`SELECT * FROM bom_detail WHERE bom_number = :id ORDER BY line_number`, { replacements: { id }, transaction });
      for (const d of details) {
        await sequelize.query(`INSERT INTO bom_detail (bom_number, line_number, material_number, material_name, material_type, standard_quantity, unit, wastage_rate, actual_quantity, step_number, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, child_bom_number, remark) VALUES (:bom_number, :line_number, :material_number, :material_name, :material_type, :standard_quantity, :unit, :wastage_rate, :actual_quantity, :step_number, :is_key_material, :substitute_group, :substitute_priority, :supply_type, :default_warehouse, :child_bom_number, :remark)`, {
          replacements: {
            bom_number: newBomNumber,
            line_number: d.line_number,
            material_number: d.material_number || '',
            material_name: d.material_name || '',
            material_type: d.material_type || '',
            standard_quantity: d.standard_quantity || 0,
            unit: d.unit || '',
            wastage_rate: d.wastage_rate || 0,
            actual_quantity: d.actual_quantity || 0,
            step_number: d.step_number || null,
            is_key_material: d.is_key_material || 0,
            substitute_group: d.substitute_group || '',
            substitute_priority: d.substitute_priority || 0,
            supply_type: d.supply_type || '',
            default_warehouse: d.default_warehouse || '',
            child_bom_number: d.child_bom_number || null,
            remark: d.remark || ''
          }, transaction
        });
      }
      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
    res.json(success({ newBomNumber, newVersion }, `已创建新版本 ${newBomNumber}`));
  } catch (err) { next(err); }
};

// ==================== 批量检查物料子BOM ====================

export const checkMaterialHasBom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const materialNumbers = ((req.query.material_numbers as string) || '').split(',').filter(m => m.trim());
    if (materialNumbers.length === 0) { res.json(success({}, '查询完成')); return; }

    const placeholders = materialNumbers.map((_: string, i: number) => `:m${i}`).join(',');
    const replacements: any = {};
    materialNumbers.forEach((m: string, i: number) => { replacements[`m${i}`] = m.trim(); });

    const [rows]: any = await sequelize.query(
      `SELECT item_number, bom_number, bom_version FROM bom_header WHERE item_number IN (${placeholders}) AND [condition] = N'启用' ORDER BY bom_version DESC`,
      { replacements }
    );

    const result: Record<string, { has_bom: boolean; bom_number: string | null }> = {};
    for (const m of materialNumbers) {
      const mt = m.trim();
      const found = rows.find((r: any) => r.item_number === mt);
      result[mt] = found ? { has_bom: true, bom_number: found.bom_number } : { has_bom: false, bom_number: null };
    }

    res.json(success(result, '查询完成'));
  } catch (err) { next(err); }
};

// ==================== BOM树形展开 ====================

// 内部递归辅助函数
async function expandBomRecursive(bomNumber: string, visitedSet: Set<string>, depth: number, maxDepth: number): Promise<any> {
  if (depth > maxDepth) return null;
  if (visitedSet.has(bomNumber)) return { circular: true, bom_number: bomNumber };

  visitedSet.add(bomNumber);

  const [headers]: any = await sequelize.query(`SELECT * FROM bom_header WHERE bom_number = :bomNumber`, { replacements: { bomNumber } });
  if (!headers.length) return null;
  const header = headers[0];

  const [details]: any = await sequelize.query(`SELECT * FROM bom_detail WHERE bom_number = :bomNumber ORDER BY line_number`, { replacements: { bomNumber } });

  // 批量查找子BOM
  const materialNumbers = details.map((d: any) => d.material_number).filter((m: string) => m);
  let bomMap: Record<string, string> = {};
  if (materialNumbers.length > 0) {
    const placeholders = materialNumbers.map((_: string, i: number) => `:m${i}`).join(',');
    const matReplacements: any = {};
    materialNumbers.forEach((m: string, i: number) => { matReplacements[`m${i}`] = m; });
    const [bomRows]: any = await sequelize.query(
      `SELECT item_number, bom_number FROM bom_header WHERE item_number IN (${placeholders}) AND [condition] = N'启用'`,
      { replacements: matReplacements }
    );
    for (const row of bomRows) {
      if (!bomMap[row.item_number]) bomMap[row.item_number] = row.bom_number;
    }
  }

  // 对每条明细递归展开
  const enrichedDetails = [];
  for (const d of details) {
    const childBomNum = d.child_bom_number || bomMap[d.material_number] || null;
    const hasChildBom = !!childBomNum;
    let children = null;

    if (hasChildBom) {
      children = await expandBomRecursive(childBomNum, new Set(visitedSet), depth + 1, maxDepth);
    }

    enrichedDetails.push({
      ...d,
      has_child_bom: hasChildBom,
      matched_bom_number: childBomNum,
      children
    });
  }

  return {
    bom_number: header.bom_number,
    bom_name: header.bom_name,
    item_number: header.item_number,
    item_name: header.item_name,
    bom_version: header.bom_version,
    base_quantity: header.base_quantity,
    base_unit: header.base_unit,
    condition: header.condition,
    approval_status: header.approval_status,
    details: enrichedDetails
  };
}

export const getBomTree = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const maxDepth = parseInt(req.query.max_depth as string) || 10;
    const tree = await expandBomRecursive(id as string, new Set(), 0, maxDepth);
    if (!tree) { res.status(404).json({ success: false, message: 'BOM不存在' }); return; }
    res.json(success(tree, '获取BOM树形结构成功'));
  } catch (err) { next(err); }
};

// ==================== BOM用量汇总 ====================

// 内部递归辅助函数：展开并累计用量
async function flattenBomRecursive(bomNumber: string, parentMultiplier: number, visitedSet: Set<string>, depth: number, maxDepth: number, result: any[], path: string) {
  if (depth > maxDepth || visitedSet.has(bomNumber)) return;
  visitedSet.add(bomNumber);

  const [headers]: any = await sequelize.query(`SELECT base_quantity FROM bom_header WHERE bom_number = :bomNumber`, { replacements: { bomNumber } });
  if (!headers.length) return;
  const baseQty = parseFloat(headers[0].base_quantity) || 1;

  const [details]: any = await sequelize.query(`SELECT * FROM bom_detail WHERE bom_number = :bomNumber ORDER BY line_number`, { replacements: { bomNumber } });

  // 批量查找子BOM
  const materialNumbers = details.map((d: any) => d.material_number).filter((m: string) => m);
  let bomMap: Record<string, string> = {};
  if (materialNumbers.length > 0) {
    const placeholders = materialNumbers.map((_: string, i: number) => `:m${i}`).join(',');
    const matReplacements: any = {};
    materialNumbers.forEach((m: string, i: number) => { matReplacements[`m${i}`] = m; });
    const [bomRows]: any = await sequelize.query(
      `SELECT item_number, bom_number FROM bom_header WHERE item_number IN (${placeholders}) AND [condition] = N'启用'`,
      { replacements: matReplacements }
    );
    for (const row of bomRows) {
      if (!bomMap[row.item_number]) bomMap[row.item_number] = row.bom_number;
    }
  }

  for (const d of details) {
    const childBomNum = d.child_bom_number || bomMap[d.material_number] || null;
    const actualQty = parseFloat(d.actual_quantity) || 0;
    const accumulatedQty = parentMultiplier * (actualQty / baseQty);
    const currentPath = path ? `${path} > ${bomNumber}` : bomNumber;

    if (childBomNum) {
      // 有子BOM，递归展开
      await flattenBomRecursive(childBomNum, accumulatedQty, new Set(visitedSet), depth + 1, maxDepth, result, currentPath);
    } else {
      // 叶子节点，累计到结果
      result.push({
        material_number: d.material_number,
        material_name: d.material_name,
        material_type: d.material_type,
        unit: d.unit,
        accumulated_quantity: Math.round(accumulatedQty * 10000) / 10000,
        bom_path: currentPath,
        level: depth,
        is_leaf: true
      });
    }
  }
}

export const getBomFlatten = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const maxDepth = parseInt(req.query.max_depth as string) || 10;

    // 获取根BOM的base_quantity作为初始乘数
    const [headers]: any = await sequelize.query(`SELECT base_quantity FROM bom_header WHERE bom_number = :id`, { replacements: { id } });
    if (!headers.length) { res.status(404).json({ success: false, message: 'BOM不存在' }); return; }

    const items: any[] = [];
    await flattenBomRecursive(id as string, parseFloat(headers[0].base_quantity) || 1, new Set(), 0, maxDepth, items, '');

    // 按物料编号分组汇总
    const grouped: Record<string, any> = {};
    for (const item of items) {
      if (grouped[item.material_number]) {
        grouped[item.material_number].accumulated_quantity = Math.round((grouped[item.material_number].accumulated_quantity + item.accumulated_quantity) * 10000) / 10000;
      } else {
        grouped[item.material_number] = { ...item };
      }
    }

    const flatList = Object.values(grouped).sort((a: any, b: any) => a.material_number.localeCompare(b.material_number));
    res.json(success({ items: flatList }, '获取BOM用量汇总成功'));
  } catch (err) { next(err); }
};
