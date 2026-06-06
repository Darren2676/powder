import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import { CONDITION_STATUS, ORDER_STATUS } from '@/shared/constants/statuses';
import { getFactoryCode } from '../../../utils/factoryWhere.util';

// ==================== 编号生成 ====================

const generatemfgBomNumber = async (factoryCode: string = ''): Promise<string> => {
  const today = new Date();
  const fc = factoryCode ? factoryCode.toUpperCase() : '';
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const prefix = `MB${fc}-${dateStr}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(mfg_bom_number) as max_num FROM mfg_bom_header WHERE mfg_bom_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return prefix + String(seq).padStart(3, '0');
};

// ==================== Header CRUD ====================

export const getMfgBomHeaders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';
    const condition = (req.query.condition as string) || '';
    const approval_status = (req.query.approval_status as string) || '';
    const bom_type = (req.query.bom_type as string) || '';
    const f_mfg_bom_number = (req.query.mfg_bom_number as string) || '';
    const f_mfg_bom_name = (req.query.mfg_bom_name as string) || '';
    const f_item_number = (req.query.item_number as string) || '';
    const f_item_name = (req.query.item_name as string) || '';
    const conditions: string[] = [];
    const replacements: any = {};
    if (search) { conditions.push(`(mfg_bom_number LIKE :search OR mfg_bom_name LIKE :search OR item_number LIKE :search OR item_name LIKE :search)`); replacements.search = `%${search}%`; }
    if (condition) { conditions.push(`[condition] = :condition`); replacements.condition = condition; }
    if (approval_status) { conditions.push(`approval_status = :approval_status`); replacements.approval_status = approval_status; }
    if (bom_type) { conditions.push(`bom_type = :bom_type`); replacements.bom_type = bom_type; }
    if (f_mfg_bom_number) { conditions.push(`mfg_bom_number LIKE :f_mfg_bom_number`); replacements.f_mfg_bom_number = `%${f_mfg_bom_number}%`; }
    if (f_mfg_bom_name) { conditions.push(`mfg_bom_name LIKE :f_mfg_bom_name`); replacements.f_mfg_bom_name = `%${f_mfg_bom_name}%`; }
    if (f_item_number) { conditions.push(`item_number LIKE :f_item_number`); replacements.f_item_number = `%${f_item_number}%`; }
    if (f_item_name) { conditions.push(`item_name LIKE :f_item_name`); replacements.f_item_name = `%${f_item_name}%`; }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM mfg_bom_header ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`SELECT * FROM (SELECT *, ROW_NUMBER() OVER (ORDER BY mfg_bom_number DESC) AS _row_num FROM mfg_bom_header ${whereClause}) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd`, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });
    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });
    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取制造BOM列表成功'));
  } catch (err) { next(err); }
};

export const getMfgBomHeaderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(`SELECT * FROM mfg_bom_header WHERE mfg_bom_number = :id`, { replacements: { id } });
    if (!headers.length) { res.status(404).json({ success: false, message: '制造BOM不存在' }); return; }
    const [details]: any = await sequelize.query(`SELECT * FROM mfg_bom_detail WHERE mfg_bom_number = :id ORDER BY line_number`, { replacements: { id } });

    // 批量检查哪些物料拥有可用子制造BOM
    const materialNumbers = details.map((d: any) => d.material_number).filter((m: string) => m);
    let bomMap: Record<string, string> = {};
    if (materialNumbers.length > 0) {
      const placeholders = materialNumbers.map((_: string, i: number) => `:m${i}`).join(',');
      const matReplacements: any = {};
      materialNumbers.forEach((m: string, i: number) => { matReplacements[`m${i}`] = m; });
      const [bomRows]: any = await sequelize.query(
        `SELECT item_number, mfg_bom_number FROM mfg_bom_header WHERE item_number IN (${placeholders}) AND [condition] = N'启用'`,
        { replacements: matReplacements }
      );
      for (const row of bomRows) {
        if (!bomMap[row.item_number]) bomMap[row.item_number] = row.mfg_bom_number;
      }
    }
    const enrichedDetails = details.map((d: any) => ({
      ...d,
      has_child_bom: !!(d.child_mfg_bom_number || bomMap[d.material_number]),
      matched_bom_number: d.child_mfg_bom_number || bomMap[d.material_number] || null
    }));

    res.json(success({ header: headers[0], details: enrichedDetails }, '获取制造BOM详情成功'));
  } catch (err) { next(err); }
};

export const createMfgBomHeader = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.mfg_bom_number || !b.mfg_bom_number.trim()) {
      res.status(400).json({ success: false, message: '请输入制造BOM编号' }); return;
    }
    const mfg_bom_number = b.mfg_bom_number.trim();

    // 检查编号是否已存在
    const [existCheck]: any = await sequelize.query(
      `SELECT mfg_bom_number FROM mfg_bom_header WHERE mfg_bom_number = :id`,
      { replacements: { id: mfg_bom_number } }
    );
    if (existCheck.length) {
      res.status(400).json({ success: false, message: `制造BOM编号 ${mfg_bom_number} 已存在` }); return;
    }

    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const creation_man = (req as any).user?.username || '';
    await sequelize.query(`INSERT INTO mfg_bom_header (mfg_bom_number, mfg_bom_name, item_number, item_name, bom_version, bom_type, base_quantity, base_unit, process_route_number, [condition], approval_status, remark, creation_date, creation_man) VALUES (:mfg_bom_number, :mfg_bom_name, :item_number, :item_name, :bom_version, :bom_type, :base_quantity, :base_unit, :process_route_number, :condition, N'草稿', :remark, :creation_date, :creation_man)`, {
      replacements: {
        mfg_bom_number,
        mfg_bom_name: b.mfg_bom_name || '',
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        bom_version: b.bom_version || 'V1.0',
        bom_type: '制造BOM',
        base_quantity: b.base_quantity || 1,
        base_unit: b.base_unit || '',
        process_route_number: b.process_route_number || '',
        condition: b.condition || CONDITION_STATUS.ENABLED,
        remark: b.remark || '',
        creation_date,
        creation_man
      }
    });
    res.json(success({ mfg_bom_number }, '创建制造BOM成功'));
  } catch (err) { next(err); }
};

export const updateMfgBomHeader = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const b = req.body;
    const [check]: any = await sequelize.query(`SELECT approval_status FROM mfg_bom_header WHERE mfg_bom_number = :id`, { replacements: { id } });
    if (check.length && check[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return; }

    const newBomNumber = (b.mfg_bom_number || '').trim();
    const bomNumberChanged = newBomNumber && newBomNumber !== id;

    if (bomNumberChanged) {
      const [existCheck]: any = await sequelize.query(`SELECT mfg_bom_number FROM mfg_bom_header WHERE mfg_bom_number = :newId`, { replacements: { newId: newBomNumber } });
      if (existCheck.length) { res.status(400).json({ success: false, message: `制造BOM编号 ${newBomNumber} 已存在` }); return; }
    }

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`UPDATE mfg_bom_header SET mfg_bom_number = :new_bom_number, mfg_bom_name = :mfg_bom_name, item_number = :item_number, item_name = :item_name, bom_version = :bom_version, bom_type = :bom_type, base_quantity = :base_quantity, base_unit = :base_unit, process_route_number = :process_route_number, [condition] = :condition, approval_status = :approval_status, remark = :remark WHERE mfg_bom_number = :id`, {
        replacements: {
          id,
          new_bom_number: bomNumberChanged ? newBomNumber : id,
          mfg_bom_name: b.mfg_bom_name || '',
          item_number: b.item_number || '',
          item_name: b.item_name || '',
          bom_version: b.bom_version || 'V1.0',
          bom_type: '制造BOM',
          base_quantity: b.base_quantity || 1,
          base_unit: b.base_unit || '',
          process_route_number: b.process_route_number || '',
          condition: b.condition || CONDITION_STATUS.ENABLED,
          approval_status: b.approval_status || ORDER_STATUS.DRAFT,
          remark: b.remark || ''
        }, transaction
      });
      if (bomNumberChanged) {
        await sequelize.query(`UPDATE mfg_bom_detail SET mfg_bom_number = :newId WHERE mfg_bom_number = :oldId`, { replacements: { newId: newBomNumber, oldId: id }, transaction });
        await sequelize.query(`UPDATE mould SET mfg_bom_number = :newId WHERE mfg_bom_number = :oldId`, { replacements: { newId: newBomNumber, oldId: id }, transaction });
      }
      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
    res.json(success(null, '更新制造BOM成功'));
  } catch (err) { next(err); }
};

export const deleteMfgBomHeader = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [check]: any = await sequelize.query(`SELECT approval_status FROM mfg_bom_header WHERE mfg_bom_number = :id`, { replacements: { id } });
    if (check.length && check[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return; }
    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`DELETE FROM mfg_bom_detail WHERE mfg_bom_number = :id`, { replacements: { id }, transaction });
      await sequelize.query(`DELETE FROM mfg_bom_header WHERE mfg_bom_number = :id`, { replacements: { id }, transaction });
      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
    res.json(success(null, '删除制造BOM成功'));
  } catch (err) { next(err); }
};

// ==================== Detail CRUD ====================

export const getMfgBomDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    const [items]: any = await sequelize.query(`SELECT * FROM mfg_bom_detail WHERE mfg_bom_number = :headerId ORDER BY line_number`, { replacements: { headerId } });
    res.json(success(items, '获取制造BOM明细成功'));
  } catch (err) { next(err); }
};

export const addMfgBomDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { headerId } = req.params;
    const b = req.body;
    const [headerCheck]: any = await sequelize.query(`SELECT approval_status FROM mfg_bom_header WHERE mfg_bom_number = :headerId`, { replacements: { headerId } });
    if (headerCheck.length && headerCheck[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '主表已提交审批或已审批，不允许新增物料明细' }); return; }
    let line_number = b.line_number;
    if (!line_number) {
      const [maxResult]: any = await sequelize.query(`SELECT ISNULL(MAX(line_number), 0) as max_line FROM mfg_bom_detail WHERE mfg_bom_number = :headerId`, { replacements: { headerId } });
      line_number = (maxResult[0].max_line || 0) + 10;
    }
    const std_qty = parseFloat(b.standard_quantity) || 0;
    const wst_rate = parseFloat(b.wastage_rate) || 0;
    const actual_quantity = Math.round(std_qty * (1 + wst_rate / 100) * 10000) / 10000;
    const [result]: any = await sequelize.query(`INSERT INTO mfg_bom_detail (mfg_bom_number, line_number, material_number, material_name, material_type, standard_quantity, unit, wastage_rate, actual_quantity, step_number, child_mfg_bom_number, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, remark) OUTPUT INSERTED.id VALUES (:mfg_bom_number, :line_number, :material_number, :material_name, :material_type, :standard_quantity, :unit, :wastage_rate, :actual_quantity, :step_number, :child_mfg_bom_number, :is_key_material, :substitute_group, :substitute_priority, :supply_type, :default_warehouse, :remark)`, {
      replacements: {
        mfg_bom_number: headerId,
        line_number,
        material_number: b.material_number || '',
        material_name: b.material_name || '',
        material_type: b.material_type || '',
        standard_quantity: std_qty,
        unit: b.unit || '',
        wastage_rate: wst_rate,
        actual_quantity,
        step_number: b.step_number || '',
        child_mfg_bom_number: b.child_mfg_bom_number || null,
        is_key_material: b.is_key_material || 0,
        substitute_group: b.substitute_group || '',
        substitute_priority: b.substitute_priority || 0,
        supply_type: b.supply_type || '',
        default_warehouse: b.default_warehouse || '',
        remark: b.remark || ''
      }
    });
    const newId = result[0]?.id;
    res.json(success({ id: newId, line_number }, '新增制造BOM明细成功'));
  } catch (err) { next(err); }
};

export const updateMfgBomDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const b = req.body;
    const [detailRow]: any = await sequelize.query(`SELECT mfg_bom_number FROM mfg_bom_detail WHERE id = :detailId`, { replacements: { detailId } });
    if (detailRow.length) {
      const [headerCheck]: any = await sequelize.query(`SELECT approval_status FROM mfg_bom_header WHERE mfg_bom_number = :bomNum`, { replacements: { bomNum: detailRow[0].mfg_bom_number } });
      if (headerCheck.length && headerCheck[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '主表已提交审批或已审批，不允许编辑物料明细' }); return; }
    }
    const std_qty = parseFloat(b.standard_quantity) || 0;
    const wst_rate = parseFloat(b.wastage_rate) || 0;
    const actual_quantity = Math.round(std_qty * (1 + wst_rate / 100) * 10000) / 10000;
    await sequelize.query(`UPDATE mfg_bom_detail SET line_number = :line_number, material_number = :material_number, material_name = :material_name, material_type = :material_type, standard_quantity = :standard_quantity, unit = :unit, wastage_rate = :wastage_rate, actual_quantity = :actual_quantity, step_number = :step_number, child_mfg_bom_number = :child_mfg_bom_number, is_key_material = :is_key_material, substitute_group = :substitute_group, substitute_priority = :substitute_priority, supply_type = :supply_type, default_warehouse = :default_warehouse, remark = :remark WHERE id = :detailId`, {
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
        step_number: b.step_number || '',
        child_mfg_bom_number: b.child_mfg_bom_number || null,
        is_key_material: b.is_key_material || 0,
        substitute_group: b.substitute_group || '',
        substitute_priority: b.substitute_priority || 0,
        supply_type: b.supply_type || '',
        default_warehouse: b.default_warehouse || '',
        remark: b.remark || ''
      }
    });
    res.json(success(null, '更新制造BOM明细成功'));
  } catch (err) { next(err); }
};

export const deleteMfgBomDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { detailId } = req.params;
    const [detailRow]: any = await sequelize.query(`SELECT mfg_bom_number FROM mfg_bom_detail WHERE id = :detailId`, { replacements: { detailId } });
    if (detailRow.length) {
      const [headerCheck]: any = await sequelize.query(`SELECT approval_status FROM mfg_bom_header WHERE mfg_bom_number = :bomNum`, { replacements: { bomNum: detailRow[0].mfg_bom_number } });
      if (headerCheck.length && headerCheck[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '主表已提交审批或已审批，不允许删除物料明细' }); return; }
    }
    await sequelize.query(`DELETE FROM mfg_bom_detail WHERE id = :detailId`, { replacements: { detailId } });
    res.json(success(null, '删除制造BOM明细成功'));
  } catch (err) { next(err); }
};

// ==================== Export / Import ====================

const exportFields = ['mfg_bom_number', 'mfg_bom_name', 'item_number', 'item_name', 'bom_version', 'bom_type', 'base_quantity', 'base_unit', 'process_route_number', 'condition', 'line_number', 'material_number', 'material_name', 'material_type', 'standard_quantity', 'unit', 'wastage_rate', 'actual_quantity', 'step_number', 'is_key_material', 'substitute_group', 'substitute_priority', 'supply_type', 'default_warehouse', 'remark'];
const exportHeaders = ['制造BOM编号', '名称', '产品编号', '产品名称', '版本号', 'BOM类型', '基准数量', '基准单位', '关联工艺路线', '状态', '行号', '物料编号', '物料名称', '物料类型', '标准用量', '单位', '损耗率(%)', '实际用量', '工序号', '关键物料', '替代料组号', '替代优先级', '供应类型', '默认仓库', '备注'];

export const exportMfgBomData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT h.mfg_bom_number, h.mfg_bom_name, h.item_number, h.item_name, h.bom_version, h.bom_type, h.base_quantity, h.base_unit, h.process_route_number, h.[condition], d.line_number, d.material_number, d.material_name, d.material_type, d.standard_quantity, d.unit, d.wastage_rate, d.actual_quantity, d.step_number, d.is_key_material, d.substitute_group, d.substitute_priority, d.supply_type, d.default_warehouse, d.remark FROM mfg_bom_header h LEFT JOIN mfg_bom_detail d ON h.mfg_bom_number = d.mfg_bom_number ORDER BY h.mfg_bom_number, d.line_number`);
    const format = (req.query.format as string) === 'xls' ? 'xls' : 'xlsx';
    exportToExcel(items, exportFields, exportHeaders, 'mfg_bom_data', res, format);
  } catch (err) { next(err); }
};

export const importMfgBomData = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, exportFields, exportHeaders);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }

    const creation_man = (req as any).user?.username || '';
    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const grouped: Record<string, any[]> = {};
    for (const row of rows) {
      const key = row.mfg_bom_number || '';
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
        const [existing]: any = await sequelize.query(`SELECT mfg_bom_number FROM mfg_bom_header WHERE mfg_bom_number = :id`, { replacements: { id: bomNum }, transaction });
        if (!existing.length) {
          await sequelize.query(`INSERT INTO mfg_bom_header (mfg_bom_number, mfg_bom_name, item_number, item_name, bom_version, bom_type, base_quantity, base_unit, process_route_number, [condition], approval_status, remark, creation_date, creation_man) VALUES (:mfg_bom_number, :mfg_bom_name, :item_number, :item_name, :bom_version, :bom_type, :base_quantity, :base_unit, :process_route_number, :condition, N'草稿', '', :creation_date, :creation_man)`, {
            replacements: {
              mfg_bom_number: bomNum,
              mfg_bom_name: first.mfg_bom_name || '',
              item_number: first.item_number || '',
              item_name: first.item_name || '',
              bom_version: first.bom_version || 'V1.0',
              bom_type: '制造BOM',
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
          await sequelize.query(`INSERT INTO mfg_bom_detail (mfg_bom_number, line_number, material_number, material_name, material_type, standard_quantity, unit, wastage_rate, actual_quantity, step_number, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, remark) VALUES (:mfg_bom_number, :line_number, :material_number, :material_name, :material_type, :standard_quantity, :unit, :wastage_rate, :actual_quantity, :step_number, :is_key_material, :substitute_group, :substitute_priority, :supply_type, :default_warehouse, :remark)`, {
            replacements: {
              mfg_bom_number: bomNum,
              line_number: row.line_number || 10,
              material_number: row.material_number || '',
              material_name: row.material_name || '',
              material_type: row.material_type || '',
              standard_quantity: std_qty,
              unit: row.unit || '',
              wastage_rate: wst_rate,
              actual_quantity,
              step_number: row.step_number || '',
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
    res.json(success({ headerCount, detailCount }, `成功导入 ${headerCount} 条制造BOM，${detailCount} 条明细`));
  } catch (err) { next(err); }
};

// ==================== Version Copy ====================

export const copyMfgBomAsNewVersion = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(`SELECT * FROM mfg_bom_header WHERE mfg_bom_number = :id`, { replacements: { id } });
    if (!headers.length) { res.status(404).json({ success: false, message: '制造BOM不存在' }); return; }
    const source = headers[0];
    if (source.approval_status !== '已审批') { res.status(400).json({ success: false, message: '只有已审批的制造BOM才能复制为新版本' }); return; }

    const currentVersion = source.bom_version || 'V1.0';
    const versionNum = parseInt(currentVersion.replace(/[^0-9]/g, '')) || 1;
    const newVersion = `V${versionNum + 1}.0`;
    const newBomNumber = `${id}-${newVersion}`;

    const [existCheck]: any = await sequelize.query(`SELECT mfg_bom_number FROM mfg_bom_header WHERE mfg_bom_number = :newId`, { replacements: { newId: newBomNumber } });
    if (existCheck.length) { res.status(400).json({ success: false, message: `制造BOM编号 ${newBomNumber} 已存在` }); return; }

    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      await sequelize.query(`INSERT INTO mfg_bom_header (mfg_bom_number, mfg_bom_name, item_number, item_name, bom_version, bom_type, base_quantity, base_unit, process_route_number, [condition], approval_status, remark, creation_date, creation_man) VALUES (:mfg_bom_number, :mfg_bom_name, :item_number, :item_name, :bom_version, :bom_type, :base_quantity, :base_unit, :process_route_number, :condition, N'草稿', :remark, :creation_date, :creation_man)`, {
        replacements: {
          mfg_bom_number: newBomNumber,
          mfg_bom_name: source.mfg_bom_name || '',
          item_number: source.item_number || '',
          item_name: source.item_name || '',
          bom_version: newVersion,
          bom_type: '制造BOM',
          base_quantity: source.base_quantity || 1,
          base_unit: source.base_unit || '',
          process_route_number: source.process_route_number || '',
          condition: source.condition || CONDITION_STATUS.ENABLED,
          remark: source.remark || '',
          creation_date,
          creation_man
        }, transaction
      });

      const [details]: any = await sequelize.query(`SELECT * FROM mfg_bom_detail WHERE mfg_bom_number = :id ORDER BY line_number`, { replacements: { id }, transaction });
      for (const d of details) {
        await sequelize.query(`INSERT INTO mfg_bom_detail (mfg_bom_number, line_number, material_number, material_name, material_type, standard_quantity, unit, wastage_rate, actual_quantity, step_number, child_mfg_bom_number, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, remark) VALUES (:mfg_bom_number, :line_number, :material_number, :material_name, :material_type, :standard_quantity, :unit, :wastage_rate, :actual_quantity, :step_number, :child_mfg_bom_number, :is_key_material, :substitute_group, :substitute_priority, :supply_type, :default_warehouse, :remark)`, {
          replacements: {
            mfg_bom_number: newBomNumber,
            line_number: d.line_number,
            material_number: d.material_number || '',
            material_name: d.material_name || '',
            material_type: d.material_type || '',
            standard_quantity: d.standard_quantity || 0,
            unit: d.unit || '',
            wastage_rate: d.wastage_rate || 0,
            actual_quantity: d.actual_quantity || 0,
            step_number: d.step_number || '',
            child_mfg_bom_number: d.child_mfg_bom_number || null,
            is_key_material: d.is_key_material || 0,
            substitute_group: d.substitute_group || '',
            substitute_priority: d.substitute_priority || 0,
            supply_type: d.supply_type || '',
            default_warehouse: d.default_warehouse || '',
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

// ==================== 复制制造BOM（主表+明细） ====================
export const duplicateMfgBom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const bomId = id as string;
    const [headers]: any = await sequelize.query(`SELECT * FROM mfg_bom_header WHERE mfg_bom_number = :id`, { replacements: { id: bomId } });
    if (!headers.length) { res.status(404).json({ success: false, message: '制造BOM不存在' }); return; }
    const source = headers[0];

    // 计算基础编号：去掉已有的 -N 后缀
    const baseMatch = bomId.match(/^(.+)-(\d+)$/);
    const baseNumber = baseMatch ? baseMatch[1] : bomId;

    // 查找同基础编号的最大序号
    const [existing]: any = await sequelize.query(
      `SELECT mfg_bom_number FROM mfg_bom_header WHERE mfg_bom_number LIKE :pattern OR mfg_bom_number = :base`,
      { replacements: { pattern: `${baseNumber}-%`, base: baseNumber } }
    );
    let maxSeq = 1;
    for (const row of existing) {
      const num = row.mfg_bom_number;
      if (num === baseNumber) { maxSeq = Math.max(maxSeq, 1); continue; }
      const m = num.match(/^(.+)-(\d+)$/);
      if (m && m[1] === baseNumber) {
        maxSeq = Math.max(maxSeq, parseInt(m[2]));
      }
    }
    const newBomNumber = `${baseNumber}-${maxSeq + 1}`;
    const newBomName = source.mfg_bom_name ? source.mfg_bom_name.replace(/^(.+?)(-\d+)?$/, `$1-${maxSeq + 1}`) : newBomNumber;

    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      // 复制主表
      await sequelize.query(`INSERT INTO mfg_bom_header (mfg_bom_number, mfg_bom_name, item_number, item_name, bom_version, bom_type, base_quantity, base_unit, process_route_number, [condition], approval_status, remark, creation_date, creation_man) VALUES (:mfg_bom_number, :mfg_bom_name, :item_number, :item_name, :bom_version, :bom_type, :base_quantity, :base_unit, :process_route_number, :condition, N'草稿', :remark, :creation_date, :creation_man)`, {
        replacements: {
          mfg_bom_number: newBomNumber,
          mfg_bom_name: newBomName,
          item_number: source.item_number || '',
          item_name: source.item_name || '',
          bom_version: source.bom_version || 'V1.0',
          bom_type: '制造BOM',
          base_quantity: source.base_quantity || 1,
          base_unit: source.base_unit || '',
          process_route_number: source.process_route_number || '',
          condition: source.condition || CONDITION_STATUS.ENABLED,
          remark: source.remark || '',
          creation_date,
          creation_man
        }, transaction
      });

      // 复制明细
      const [details]: any = await sequelize.query(`SELECT * FROM mfg_bom_detail WHERE mfg_bom_number = :id ORDER BY line_number`, { replacements: { id: bomId }, transaction });
      for (const d of details) {
        await sequelize.query(`INSERT INTO mfg_bom_detail (mfg_bom_number, line_number, material_number, material_name, material_type, standard_quantity, unit, wastage_rate, actual_quantity, step_number, child_mfg_bom_number, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, remark) VALUES (:mfg_bom_number, :line_number, :material_number, :material_name, :material_type, :standard_quantity, :unit, :wastage_rate, :actual_quantity, :step_number, :child_mfg_bom_number, :is_key_material, :substitute_group, :substitute_priority, :supply_type, :default_warehouse, :remark)`, {
          replacements: {
            mfg_bom_number: newBomNumber,
            line_number: d.line_number,
            material_number: d.material_number || '',
            material_name: d.material_name || '',
            material_type: d.material_type || '',
            standard_quantity: d.standard_quantity || 0,
            unit: d.unit || '',
            wastage_rate: d.wastage_rate || 0,
            actual_quantity: d.actual_quantity || 0,
            step_number: d.step_number || '',
            child_mfg_bom_number: d.child_mfg_bom_number || null,
            is_key_material: d.is_key_material || 0,
            substitute_group: d.substitute_group || '',
            substitute_priority: d.substitute_priority || 0,
            supply_type: d.supply_type || '',
            default_warehouse: d.default_warehouse || '',
            remark: d.remark || ''
          }, transaction
        });
      }
      await transaction.commit();
      res.json(success({ newBomNumber, detailsCount: details.length }, `已复制制造BOM，新编号: ${newBomNumber}，包含 ${details.length} 条明细`));
    } catch (e) {
      await transaction.rollback();
      throw e;
    }
  } catch (err) { next(err); }
};

// ==================== 批量检查物料子制造BOM ====================

export const checkMfgBomHasBom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const materialNumbers = ((req.query.material_numbers as string) || '').split(',').filter(m => m.trim());
    if (materialNumbers.length === 0) { res.json(success({}, '查询完成')); return; }

    const placeholders = materialNumbers.map((_: string, i: number) => `:m${i}`).join(',');
    const replacements: any = {};
    materialNumbers.forEach((m: string, i: number) => { replacements[`m${i}`] = m.trim(); });

    const [rows]: any = await sequelize.query(
      `SELECT item_number, mfg_bom_number, bom_version FROM mfg_bom_header WHERE item_number IN (${placeholders}) AND [condition] = N'启用' ORDER BY bom_version DESC`,
      { replacements }
    );

    const result: Record<string, { has_bom: boolean; mfg_bom_number: string | null }> = {};
    for (const m of materialNumbers) {
      const mt = m.trim();
      const found = rows.find((r: any) => r.item_number === mt);
      result[mt] = found ? { has_bom: true, mfg_bom_number: found.mfg_bom_number } : { has_bom: false, mfg_bom_number: null };
    }

    res.json(success(result, '查询完成'));
  } catch (err) { next(err); }
};

// ==================== BOM树形展开 ====================

async function expandMfgBomRecursive(bomNumber: string, visitedSet: Set<string>, depth: number, maxDepth: number): Promise<any> {
  if (depth > maxDepth) return null;
  if (visitedSet.has(bomNumber)) return { circular: true, mfg_bom_number: bomNumber };

  visitedSet.add(bomNumber);

  const [headers]: any = await sequelize.query(`SELECT * FROM mfg_bom_header WHERE mfg_bom_number = :bomNumber`, { replacements: { bomNumber } });
  if (!headers.length) return null;
  const header = headers[0];

  const [details]: any = await sequelize.query(`SELECT * FROM mfg_bom_detail WHERE mfg_bom_number = :bomNumber ORDER BY line_number`, { replacements: { bomNumber } });

  const materialNumbers = details.map((d: any) => d.material_number).filter((m: string) => m);
  let bomMap: Record<string, string> = {};
  if (materialNumbers.length > 0) {
    const placeholders = materialNumbers.map((_: string, i: number) => `:m${i}`).join(',');
    const matReplacements: any = {};
    materialNumbers.forEach((m: string, i: number) => { matReplacements[`m${i}`] = m; });
    const [bomRows]: any = await sequelize.query(
      `SELECT item_number, mfg_bom_number FROM mfg_bom_header WHERE item_number IN (${placeholders}) AND [condition] = N'启用'`,
      { replacements: matReplacements }
    );
    for (const row of bomRows) {
      if (!bomMap[row.item_number]) bomMap[row.item_number] = row.mfg_bom_number;
    }
  }

  const enrichedDetails = [];
  for (const d of details) {
    const childBomNum = d.child_mfg_bom_number || bomMap[d.material_number] || null;
    const hasChildBom = !!childBomNum;
    let children = null;

    if (hasChildBom) {
      children = await expandMfgBomRecursive(childBomNum, new Set(visitedSet), depth + 1, maxDepth);
    }

    enrichedDetails.push({
      ...d,
      has_child_bom: hasChildBom,
      matched_bom_number: childBomNum,
      children
    });
  }

  return {
    mfg_bom_number: header.mfg_bom_number,
    mfg_bom_name: header.mfg_bom_name,
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

export const getMfgBomTree = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const maxDepth = parseInt(req.query.max_depth as string) || 10;
    const tree = await expandMfgBomRecursive(id as string, new Set(), 0, maxDepth);
    if (!tree) { res.status(404).json({ success: false, message: '制造BOM不存在' }); return; }
    res.json(success(tree, '获取制造BOM树形结构成功'));
  } catch (err) { next(err); }
};

// ==================== 从BOM物料清单导入 ====================

export const importFromBom = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { bom_number } = req.body;
    if (!bom_number) { res.status(400).json({ success: false, message: '请提供BOM编号' }); return; }

    // 查询源BOM主表
    const [bomHeaders]: any = await sequelize.query(
      `SELECT * FROM bom_header WHERE bom_number = :bom_number`,
      { replacements: { bom_number } }
    );
    if (!bomHeaders.length) { res.status(404).json({ success: false, message: `BOM ${bom_number} 不存在` }); return; }
    const bom = bomHeaders[0];

    // 查询源BOM明细
    const [bomDetails]: any = await sequelize.query(
      `SELECT * FROM bom_detail WHERE bom_number = :bom_number ORDER BY line_number`,
      { replacements: { bom_number } }
    );

    // 直接使用BOM编号作为制造BOM编号
    const mfgBomNumber = bom_number;

    // 检查制造BOM编号是否已存在
    const [existCheck]: any = await sequelize.query(
      `SELECT mfg_bom_number FROM mfg_bom_header WHERE mfg_bom_number = :id`,
      { replacements: { id: mfgBomNumber } }
    );
    if (existCheck.length) {
      res.status(400).json({ success: false, message: `制造BOM编号 ${mfgBomNumber} 已存在，该BOM可能已导入` }); return;
    }

    const now = new Date();
    const creation_date = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const creation_man = (req as any).user?.username || '';

    const transaction = await sequelize.transaction();
    try {
      // 创建制造BOM主表
      await sequelize.query(
        `INSERT INTO mfg_bom_header (mfg_bom_number, mfg_bom_name, item_number, item_name, bom_version, bom_type, base_quantity, base_unit, process_route_number, [condition], approval_status, remark, creation_date, creation_man)
         VALUES (:mfg_bom_number, :mfg_bom_name, :item_number, :item_name, :bom_version, :bom_type, :base_quantity, :base_unit, :process_route_number, :condition, N'草稿', :remark, :creation_date, :creation_man)`,
        {
          replacements: {
            mfg_bom_number: mfgBomNumber,
            mfg_bom_name: bom.bom_name || '',
            item_number: bom.item_number || '',
            item_name: bom.item_name || '',
            bom_version: bom.bom_version || 'V1.0',
            bom_type: '制造BOM',
            base_quantity: bom.base_quantity || 1,
            base_unit: bom.base_unit || '',
            process_route_number: bom.process_route_number || '',
            condition: CONDITION_STATUS.ENABLED,
            remark: `从BOM ${bom_number} 导入`,
            creation_date,
            creation_man
          }, transaction
        }
      );

      // 创建制造BOM明细
      for (const d of bomDetails) {
        await sequelize.query(
          `INSERT INTO mfg_bom_detail (mfg_bom_number, line_number, material_number, material_name, material_type, standard_quantity, unit, wastage_rate, actual_quantity, step_number, child_mfg_bom_number, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, remark)
           VALUES (:mfg_bom_number, :line_number, :material_number, :material_name, :material_type, :standard_quantity, :unit, :wastage_rate, :actual_quantity, :step_number, NULL, :is_key_material, :substitute_group, :substitute_priority, :supply_type, :default_warehouse, :remark)`,
          {
            replacements: {
              mfg_bom_number: mfgBomNumber,
              line_number: d.line_number || 10,
              material_number: d.material_number || '',
              material_name: d.material_name || '',
              material_type: d.material_type || '',
              standard_quantity: d.standard_quantity || 0,
              unit: d.unit || '',
              wastage_rate: d.wastage_rate || 0,
              actual_quantity: d.actual_quantity || 0,
              step_number: d.step_number || '',
              is_key_material: d.is_key_material || 0,
              substitute_group: d.substitute_group || '',
              substitute_priority: d.substitute_priority || 0,
              supply_type: d.supply_type || '',
              default_warehouse: d.default_warehouse || '',
              remark: d.remark || ''
            }, transaction
          }
        );
      }

      await transaction.commit();
    } catch (e) {
      await transaction.rollback();
      throw e;
    }

    res.json(success({ mfg_bom_number: mfgBomNumber, details_count: bomDetails.length }, `已从BOM ${bom_number} 导入，生成制造BOM: ${mfgBomNumber}`));
  } catch (err) { next(err); }
};

// ==================== BOM展平汇总 ====================

async function flattenMfgBomRecursive(bomNumber: string, parentMultiplier: number, visitedSet: Set<string>, depth: number, maxDepth: number, result: any[], path: string) {
  if (depth > maxDepth || visitedSet.has(bomNumber)) return;
  visitedSet.add(bomNumber);

  const [headers]: any = await sequelize.query(`SELECT base_quantity FROM mfg_bom_header WHERE mfg_bom_number = :bomNumber`, { replacements: { bomNumber } });
  if (!headers.length) return;
  const baseQty = parseFloat(headers[0].base_quantity) || 1;

  const [details]: any = await sequelize.query(`SELECT * FROM mfg_bom_detail WHERE mfg_bom_number = :bomNumber ORDER BY line_number`, { replacements: { bomNumber } });

  const materialNumbers = details.map((d: any) => d.material_number).filter((m: string) => m);
  let bomMap: Record<string, string> = {};
  if (materialNumbers.length > 0) {
    const placeholders = materialNumbers.map((_: string, i: number) => `:m${i}`).join(',');
    const matReplacements: any = {};
    materialNumbers.forEach((m: string, i: number) => { matReplacements[`m${i}`] = m; });
    const [bomRows]: any = await sequelize.query(
      `SELECT item_number, mfg_bom_number FROM mfg_bom_header WHERE item_number IN (${placeholders}) AND [condition] = N'启用'`,
      { replacements: matReplacements }
    );
    for (const row of bomRows) {
      if (!bomMap[row.item_number]) bomMap[row.item_number] = row.mfg_bom_number;
    }
  }

  for (const d of details) {
    const childBomNum = d.child_mfg_bom_number || bomMap[d.material_number] || null;
    const actualQty = parseFloat(d.actual_quantity) || 0;
    const accumulatedQty = parentMultiplier * (actualQty / baseQty);
    const currentPath = path ? `${path} > ${bomNumber}` : bomNumber;

    if (childBomNum) {
      await flattenMfgBomRecursive(childBomNum, accumulatedQty, new Set(visitedSet), depth + 1, maxDepth, result, currentPath);
    } else {
      result.push({
        material_number: d.material_number,
        material_name: d.material_name,
        material_type: d.material_type,
        unit: d.unit,
        accumulated_quantity: Math.round(accumulatedQty * 10000) / 10000,
        supply_type: d.supply_type,
        bom_path: currentPath,
        level: depth,
        is_leaf: true
      });
    }
  }
}

export const getMfgBomFlatten = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const maxDepth = parseInt(req.query.max_depth as string) || 10;

    const [headers]: any = await sequelize.query(`SELECT base_quantity FROM mfg_bom_header WHERE mfg_bom_number = :id`, { replacements: { id } });
    if (!headers.length) { res.status(404).json({ success: false, message: '制造BOM不存在' }); return; }

    const items: any[] = [];
    await flattenMfgBomRecursive(id as string, parseFloat(headers[0].base_quantity) || 1, new Set(), 0, maxDepth, items, '');

    const grouped: Record<string, any> = {};
    for (const item of items) {
      if (grouped[item.material_number]) {
        grouped[item.material_number].accumulated_quantity = Math.round((grouped[item.material_number].accumulated_quantity + item.accumulated_quantity) * 10000) / 10000;
      } else {
        grouped[item.material_number] = { ...item };
      }
    }

    const flatList = Object.values(grouped).sort((a: any, b: any) => a.material_number.localeCompare(b.material_number));
    res.json(success({ items: flatList }, '获取制造BOM用量汇总成功'));
  } catch (err) { next(err); }
};

// ==================== 模具BOM映射 CRUD ====================

export const getMouldBomMappings = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const item_number = (req.query.item_number as string) || '';
    const mould_number = (req.query.mould_number as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};
    if (item_number) { conditions.push('m.item_number LIKE :item_number'); replacements.item_number = `%${item_number}%`; }
    if (mould_number) { conditions.push('m.mould_number LIKE :mould_number'); replacements.mould_number = `%${mould_number}%`; }
    const whereClause = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM mfg_bom_mould_mapping m ${whereClause}`, { replacements });
    const total = countResult[0].total;
    const offset = (page - 1) * limit;
    let items: any[] = [];
    try {
      const startRow = offset + 1;
      const endRow = offset + limit;
      const [result]: any = await sequelize.query(
        `WITH Numbered AS (
           SELECT m.id, m.item_number, m.mould_number, m.mfg_bom_number, m.is_default, m.approval_status, m.creation_date,
                  h.mfg_bom_name, i.item_name, md.item_name as mould_name,
                  ROW_NUMBER() OVER (ORDER BY m.item_number, m.mould_number) AS RowNum
           FROM mfg_bom_mould_mapping m
           LEFT JOIN mfg_bom_header h ON m.mfg_bom_number = h.mfg_bom_number
           LEFT JOIN item_master i ON m.item_number = i.item_number
           LEFT JOIN mould md ON m.mould_number = md.item_number
           ${whereClause}
         )
         SELECT id, item_number, mould_number, mfg_bom_number, is_default, approval_status, creation_date, mfg_bom_name, item_name, mould_name
         FROM Numbered
         WHERE RowNum BETWEEN :startRow AND :endRow`,
        { replacements: { ...replacements, startRow, endRow } }
      );
      items = result || [];
    } catch (queryErr: any) {
      console.error('模具BOM映射查询错误:', queryErr?.parent?.message || queryErr?.message || queryErr);
      items = [];
    }
    res.json(success({ items, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取模具BOM映射列表成功'));
  } catch (err) { next(err); }
};

export const createMouldBomMapping = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number, mould_number, mfg_bom_number, is_default } = req.body;
    if (!item_number || !mould_number || !mfg_bom_number) {
      res.status(400).json({ success: false, message: '产品编号、模具编号和制造BOM编号不能为空' });
      return;
    }
    await sequelize.query(
      `INSERT INTO mfg_bom_mould_mapping (item_number, mould_number, mfg_bom_number, is_default, approval_status) VALUES (:item_number, :mould_number, :mfg_bom_number, :is_default, '未审核')`,
      { replacements: { item_number, mould_number, mfg_bom_number, is_default: is_default ? 1 : 0 } }
    );
    res.json(success(null, '创建模具BOM映射成功'));
  } catch (err: any) {
    const errMsg = err?.parent?.message || err?.original?.message || err?.message || '';
    if (errMsg.includes('unique') || errMsg.includes('duplicate') || errMsg.includes('UNIQUE') || errMsg.includes('Duplicate') || errMsg.includes('idx_bom_mould_unique')) {
      res.status(409).json({ success: false, message: '数据已存在：该产品与模具的组合映射已存在' });
      return;
    }
    next(err);
  }
};

export const updateMouldBomMapping = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { item_number, mould_number, mfg_bom_number, is_default } = req.body;
    const [rows]: any = await sequelize.query(
      `SELECT approval_status FROM mfg_bom_mould_mapping WHERE id = :id`,
      { replacements: { id } }
    );
    if (rows.length && rows[0].approval_status === '已审核') {
      res.status(403).json({ success: false, message: '已审核记录不能修改' });
      return;
    }
    await sequelize.query(
      `UPDATE mfg_bom_mould_mapping SET item_number = :item_number, mould_number = :mould_number, mfg_bom_number = :mfg_bom_number, is_default = :is_default WHERE id = :id`,
      { replacements: { id, item_number, mould_number, mfg_bom_number, is_default: is_default ? 1 : 0 } }
    );
    res.json(success(null, '更新模具BOM映射成功'));
  } catch (err) { next(err); }
};

export const deleteMouldBomMapping = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(
      `SELECT approval_status FROM mfg_bom_mould_mapping WHERE id = :id`,
      { replacements: { id } }
    );
    if (rows.length && rows[0].approval_status === '已审核') {
      res.status(403).json({ success: false, message: '已审核记录不能删除' });
      return;
    }
    await sequelize.query(`DELETE FROM mfg_bom_mould_mapping WHERE id = :id`, { replacements: { id } });
    res.json(success(null, '删除模具BOM映射成功'));
  } catch (err) { next(err); }
};

export const approveMouldBomMapping = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(
      `UPDATE mfg_bom_mould_mapping SET approval_status = '已审核' WHERE id = :id`,
      { replacements: { id } }
    );
    res.json(success(null, '审核成功'));
  } catch (err) { next(err); }
};

export const withdrawMouldBomMapping = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    await sequelize.query(
      `UPDATE mfg_bom_mould_mapping SET approval_status = '未审核' WHERE id = :id`,
      { replacements: { id } }
    );
    res.json(success(null, '撤销审核成功'));
  } catch (err) { next(err); }
};

export const getMouldBomByItemAndMould = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { item_number, mould_number } = req.query;
    if (!item_number || !mould_number) {
      res.status(400).json({ success: false, message: '产品编号和模具编号不能为空' });
      return;
    }
    const [rows]: any = await sequelize.query(
      `SELECT m.*, h.mfg_bom_name FROM mfg_bom_mould_mapping m LEFT JOIN mfg_bom_header h ON m.mfg_bom_number = h.mfg_bom_number WHERE m.item_number = :item_number AND m.mould_number = :mould_number`,
      { replacements: { item_number, mould_number } }
    );
    res.json(success({ mapping: rows[0] || null }, '查询模具BOM映射成功'));
  } catch (err) { next(err); }
};
