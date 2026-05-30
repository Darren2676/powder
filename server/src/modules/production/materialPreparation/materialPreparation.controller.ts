import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel, parseExcelFile } from '../../../utils/excel.util';
import dayjs from 'dayjs';
import { ORDER_STATUS } from '@/shared/constants/statuses';

import { BusinessError } from '@/shared/errors/BusinessError';

const headerSelectCols = 'preparation_number, production_order_number, production_number, item_number, item_name, specifications, basic_unit, bom_number, bom_version, planned_quantity, bom_base_quantity, total_material_types, preparation_status, approval_status, remark, creation_date, creation_man';

const detailSelectCols = 'id, preparation_number, line_number, material_number, material_name, material_type, unit, bom_standard_quantity, bom_wastage_rate, bom_actual_quantity, required_quantity, adjusted_quantity, issued_quantity, step_number, work_center_number, work_center_name, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, bom_path, standard_process_name, auto_weigh, remark';

const exportFields = ['preparation_number', 'production_order_number', 'item_number', 'item_name', 'specifications', 'planned_quantity', 'bom_number', 'bom_version', 'total_material_types', 'preparation_status', 'approval_status', 'creation_date', 'creation_man', 'remark'];
const exportHeaders = ['备料单编号', '生产单编号', '产品编号', '产品名称', '规格', '计划数量', 'BOM编号', 'BOM版本', '物料种类', '备料状态', '审批状态', '创建日期', '创建人', '备注'];

// 自动生成备料单编号: MP-YYYYMMDD-NNN
const generatePrepNumber = async (): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `MP-${today}-`;

  const [rows]: any = await sequelize.query(
    `SELECT MAX(preparation_number) as max_num FROM material_preparation WHERE preparation_number LIKE :prefix`,
    { replacements: { prefix: prefix + '%' } }
  );

  let seq = 1;
  if (rows[0].max_num) {
    const lastSeq = parseInt(rows[0].max_num.slice(-3));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }

  return prefix + String(seq).padStart(3, '0');
};

// ==================== 获取列表 ====================
export const getMaterialPreparations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const preparation_status = (req.query.preparation_status as string) || '';
    const approval_status = (req.query.approval_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(preparation_number LIKE :search OR production_order_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search OR bom_number LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (preparation_status) {
      conditions.push(`preparation_status = :preparation_status`);
      replacements.preparation_status = preparation_status;
    }
    if (approval_status) {
      conditions.push(`approval_status = :approval_status`);
      replacements.approval_status = approval_status;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM material_preparation ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT ${headerSelectCols}, ROW_NUMBER() OVER (ORDER BY preparation_number DESC) AS _row_num
        FROM material_preparation ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({
      items: cleanItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取备料单列表成功'));
  } catch (err) { next(err); }
};

// ==================== 新建备料单（手动） ====================
export const createMaterialPreparation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const user = (req as any).user;
    const b = req.body;

    if (!b.production_order_number) {
      res.status(400).json({ success: false, message: '生产单编号不能为空' });
      return;
    }

    const preparation_number = await generatePrepNumber();
    const now = dayjs().format('YYYY/MM/DD HH:mm');

    await sequelize.query(`
      INSERT INTO material_preparation (preparation_number, production_order_number, production_number, item_number, item_name, specifications, basic_unit, bom_number, bom_version, planned_quantity, bom_base_quantity, total_material_types, preparation_status, approval_status, remark, creation_date, creation_man)
      VALUES (:preparation_number, :production_order_number, :production_number, :item_number, :item_name, :specifications, :basic_unit, :bom_number, :bom_version, :planned_quantity, :bom_base_quantity, :total_material_types, N'未领料', N'草稿', :remark, :creation_date, :creation_man)
    `, {
      replacements: {
        preparation_number,
        production_order_number: b.production_order_number || '',
        production_number: b.production_number || '',
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        specifications: b.specifications || '',
        basic_unit: b.basic_unit || '',
        bom_number: b.bom_number || '',
        bom_version: b.bom_version || '',
        planned_quantity: b.planned_quantity || 0,
        bom_base_quantity: b.bom_base_quantity || 1,
        total_material_types: b.total_material_types || 0,
        remark: b.remark || '',
        creation_date: now,
        creation_man: user?.username || ''
      }
    });

    res.json(success({ preparation_number }, '创建备料单成功'));
  } catch (err) { next(err); }
};

// ==================== 编辑备料单 ====================
export const updateMaterialPreparation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM material_preparation WHERE preparation_number = :id`, { replacements: { id } });
    if (!chk.length) { res.status(404).json({ success: false, message: '备料单不存在' }); return; }
    if (chk[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' }); return; }

    const b = req.body;
    await sequelize.query(`
      UPDATE material_preparation SET
        production_order_number = :production_order_number,
        production_number = :production_number,
        item_number = :item_number,
        item_name = :item_name,
        specifications = :specifications,
        basic_unit = :basic_unit,
        bom_number = :bom_number,
        bom_version = :bom_version,
        planned_quantity = :planned_quantity,
        bom_base_quantity = :bom_base_quantity,
        remark = :remark
      WHERE preparation_number = :id
    `, {
      replacements: {
        id,
        production_order_number: b.production_order_number || '',
        production_number: b.production_number || '',
        item_number: b.item_number || '',
        item_name: b.item_name || '',
        specifications: b.specifications || '',
        basic_unit: b.basic_unit || '',
        bom_number: b.bom_number || '',
        bom_version: b.bom_version || '',
        planned_quantity: b.planned_quantity || 0,
        bom_base_quantity: b.bom_base_quantity || 1,
        remark: b.remark || ''
      }
    });

    res.json(success(null, '更新备料单成功'));
  } catch (err) { next(err); }
};

// ==================== 删除备料单 ====================
export const deleteMaterialPreparation = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM material_preparation WHERE preparation_number = :id`, { replacements: { id } });
    if (chk.length && chk[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许删除' }); return; }
    // 同时删除明细
    await sequelize.query(`DELETE FROM material_preparation_detail WHERE preparation_number = :id`, { replacements: { id } });
    await sequelize.query(`DELETE FROM material_preparation WHERE preparation_number = :id`, { replacements: { id } });
    res.json(success(null, '删除备料单成功'));
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
export const exportMaterialPreparations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [items]: any = await sequelize.query(`SELECT ${exportFields.join(', ')} FROM material_preparation ORDER BY preparation_number DESC`);
    exportToExcel(items, exportFields, exportHeaders, 'material_preparations', res);
  } catch (err) { next(err); }
};

// ==================== 导入 ====================
export const importMaterialPreparations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) { res.status(400).json({ success: false, message: '请上传Excel文件' }); return; }
    const rows = parseExcelFile(req.file.buffer, exportFields, exportHeaders);
    if (rows.length === 0) { res.status(400).json({ success: false, message: 'Excel文件内容为空' }); return; }

    let imported = 0;
    for (const item of rows) {
      try {
        if (!item.preparation_number) item.preparation_number = await generatePrepNumber();
        const [existing]: any = await sequelize.query(
          `SELECT COUNT(*) as cnt FROM material_preparation WHERE preparation_number = :n`,
          { replacements: { n: item.preparation_number } }
        );
        if (existing[0].cnt > 0) continue;
        await sequelize.query(`
          INSERT INTO material_preparation (preparation_number, production_order_number, item_number, item_name, specifications, planned_quantity, bom_number, bom_version, total_material_types, preparation_status, approval_status, creation_date, creation_man, remark)
          VALUES (:preparation_number, :production_order_number, :item_number, :item_name, :specifications, :planned_quantity, :bom_number, :bom_version, :total_material_types, :preparation_status, :approval_status, :creation_date, :creation_man, :remark)
        `, { replacements: { ...item, planned_quantity: item.planned_quantity || 0, total_material_types: item.total_material_types || 0, preparation_status: item.preparation_status || '未领料', approval_status: item.approval_status || ORDER_STATUS.DRAFT } });
        imported++;
      } catch (e) {}
    }
    res.json(success({ imported, totalCount: rows.length }, `成功导入 ${imported} 条备料单`));
  } catch (err) { next(err); }
};

// ==================== 获取备料单明细 ====================
export const getPreparationDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    // 获取主表信息
    const [headers]: any = await sequelize.query(
      `SELECT ${headerSelectCols} FROM material_preparation WHERE preparation_number = :id`,
      { replacements: { id } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '备料单不存在' }); return; }

    // 获取明细
    const [details]: any = await sequelize.query(
      `SELECT ${detailSelectCols} FROM material_preparation_detail WHERE preparation_number = :id ORDER BY line_number`,
      { replacements: { id } }
    );

    res.json(success({
      header: headers[0],
      details
    }, '获取备料单明细成功'));
  } catch (err) { next(err); }
};

// ==================== 更新备料单明细（手动调整数量） ====================
export const updatePreparationDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { details } = req.body;

    // 检查主表状态
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM material_preparation WHERE preparation_number = :id`, { replacements: { id } });
    if (!chk.length) { res.status(404).json({ success: false, message: '备料单不存在' }); return; }
    if (chk[0].approval_status !== ORDER_STATUS.DRAFT) { res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许修改明细' }); return; }

    if (!details || !Array.isArray(details)) {
      res.status(400).json({ success: false, message: '明细数据格式错误' });
      return;
    }

    // 逐条更新 adjusted_quantity, issued_quantity 和 remark
    for (const d of details) {
      if (d.id) {
        // 支持更新 issued_quantity（移动端确认领料）
        if (d.issued_quantity !== undefined) {
          await sequelize.query(`
            UPDATE material_preparation_detail SET
              issued_quantity = :issued_quantity
            WHERE id = :id AND preparation_number = :prep_number
          `, {
            replacements: {
              id: d.id,
              prep_number: id,
              issued_quantity: d.issued_quantity || 0
            }
          });
        }
        if (d.adjusted_quantity !== undefined || d.remark !== undefined) {
          await sequelize.query(`
            UPDATE material_preparation_detail SET
              adjusted_quantity = :adjusted_quantity,
              remark = :remark
            WHERE id = :id AND preparation_number = :prep_number
          `, {
            replacements: {
              id: d.id,
              prep_number: id,
              adjusted_quantity: d.adjusted_quantity || 0,
              remark: d.remark || ''
            }
          });
        }
      }
    }

    // 更新主表备料状态
    const [statusCheck]: any = await sequelize.query(`
      SELECT 
        COUNT(*) as total_items,
        SUM(CASE WHEN issued_quantity >= required_quantity AND required_quantity > 0 THEN 1 ELSE 0 END) as fully_issued
      FROM material_preparation_detail WHERE preparation_number = :id
    `, { replacements: { id } });

    if (statusCheck[0]) {
      const total = statusCheck[0].total_items || 0;
      const fullyIssued = statusCheck[0].fully_issued || 0;
      let newStatus = '未领料';
      if (fullyIssued > 0 && fullyIssued >= total) {
        newStatus = '已领料';
      } else if (fullyIssued > 0) {
        newStatus = '部分领料';
      }
      await sequelize.query(`UPDATE material_preparation SET preparation_status = :status WHERE preparation_number = :id`, { replacements: { status: newStatus, id } });
    }

    res.json(success(null, '更新备料单明细成功'));
  } catch (err) { next(err); }
};

// ==================== 核心：从生产单自动生成备料单 ====================
export const generateFromOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { production_order_numbers } = req.body;
    const user = (req as any).user;

    if (!production_order_numbers || !Array.isArray(production_order_numbers) || production_order_numbers.length === 0) {
      res.status(400).json({ success: false, message: '请选择要备料的生产单' });
      return;
    }

    const results: { generatedCount: number; skippedCount: number; details: any[]; skipped: any[] } = {
      generatedCount: 0, skippedCount: 0, details: [], skipped: []
    };
    const now = dayjs().format('YYYY/MM/DD HH:mm');

    for (const orderNo of production_order_numbers) {
      // 1. 查询生产单
      const [orders]: any = await sequelize.query(
        `SELECT production_order_number, production_number, item_number, item_name, specifications, basic_unit, planned_quantity, approval_status FROM production_order WHERE production_order_number = :orderNo`,
        { replacements: { orderNo } }
      );
      if (orders.length === 0) { results.skipped.push({ orderNo, reason: '生产单不存在' }); results.skippedCount++; continue; }
      const order = orders[0];
      if (order.approval_status !== '已审批') { results.skipped.push({ orderNo, reason: '生产单未审批（当前状态：' + order.approval_status + '）' }); results.skippedCount++; continue; }

      // 2. 通过 item_number 查找匹配的 BOM（启用+已审批，取最新版本）
      const [boms]: any = await sequelize.query(
        `SELECT TOP 1 bom_number, bom_name, bom_version, base_quantity FROM bom_header WHERE item_number = :item_number AND [condition] = N'启用' AND approval_status = N'已审批' ORDER BY bom_version DESC`,
        { replacements: { item_number: order.item_number } }
      );
      if (boms.length === 0) { results.skipped.push({ orderNo, reason: '未匹配到已审批且启用的BOM（产品编号：' + order.item_number + '）' }); results.skippedCount++; continue; }
      const bom = boms[0];
      const bomBaseQty = parseFloat(bom.base_quantity) || 1;

      // 4. 展平BOM获取所有叶子节点物料
      const flatItems: any[] = [];
      await flattenBomRecursive(bom.bom_number, bomBaseQty, new Set(), 0, 10, flatItems, '');

      // 按物料编号分组汇总
      const grouped: Record<string, any> = {};
      for (const item of flatItems) {
        if (grouped[item.material_number]) {
          grouped[item.material_number].accumulated_quantity = Math.round((grouped[item.material_number].accumulated_quantity + item.accumulated_quantity) * 10000) / 10000;
        } else {
          grouped[item.material_number] = { ...item };
        }
      }
      const flatList = Object.values(grouped).sort((a: any, b: any) => a.material_number.localeCompare(b.material_number));

      if (flatList.length === 0) { results.skipped.push({ orderNo, reason: 'BOM展平后无物料明细' }); results.skippedCount++; continue; }

      // 5. 获取该生产单的工序任务（用于补充工序信息）
      const [processTasks]: any = await sequelize.query(
        `SELECT step_number, work_center_number, work_center_name FROM process_task WHERE production_order_number = :orderNo ORDER BY step_number`,
        { replacements: { orderNo } }
      );
      const taskMap: Record<number, any> = {};
      for (const pt of processTasks) {
        if (pt.step_number != null) taskMap[pt.step_number] = pt;
      }

      // 6. 同时从BOM明细获取step_number等额外信息
      const [bomDetails]: any = await sequelize.query(
        `SELECT material_number, step_number, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, standard_quantity, wastage_rate, actual_quantity FROM bom_detail WHERE bom_number = :bomNumber ORDER BY line_number`,
        { replacements: { bomNumber: bom.bom_number } }
      );
      const bomDetailMap: Record<string, any> = {};
      for (const bd of bomDetails) {
        if (!bomDetailMap[bd.material_number]) bomDetailMap[bd.material_number] = bd;
      }

      // 7. 生成备料单编号
      const prepNumber = await generatePrepNumber();

      // 8. 计算倍率和生成明细
      const plannedQty = parseFloat(order.planned_quantity) || 0;
      const multiplier = bomBaseQty > 0 ? plannedQty / bomBaseQty : 0;

      const detailValues: string[] = [];
      const detailReplacements: any = {};

      flatList.forEach((item: any, index: number) => {
        const bomDetail = bomDetailMap[item.material_number] || {};
        const stepNum = bomDetail.step_number || item.step_number || null;
        const matchedTask = stepNum != null ? taskMap[stepNum] : null;
        const requiredQty = Math.round(multiplier * item.accumulated_quantity * 10000) / 10000;

        const i = index;
        detailValues.push(`(:prep_number, :line_${i}, :mat_num_${i}, :mat_name_${i}, :mat_type_${i}, :unit_${i}, :bom_std_${i}, :bom_waste_${i}, :bom_act_${i}, :req_qty_${i}, :adj_qty_${i}, 0, :step_${i}, :wc_num_${i}, :wc_name_${i}, :is_key_${i}, :sub_grp_${i}, :sub_pri_${i}, :supply_${i}, :warehouse_${i}, :bom_path_${i}, N'N', '')`);
        detailReplacements[`line_${i}`] = (index + 1) * 10;
        detailReplacements[`mat_num_${i}`] = item.material_number || '';
        detailReplacements[`mat_name_${i}`] = item.material_name || '';
        detailReplacements[`mat_type_${i}`] = item.material_type || '';
        detailReplacements[`unit_${i}`] = item.unit || '';
        detailReplacements[`bom_std_${i}`] = parseFloat(bomDetail.standard_quantity) || 0;
        detailReplacements[`bom_waste_${i}`] = parseFloat(bomDetail.wastage_rate) || 0;
        detailReplacements[`bom_act_${i}`] = parseFloat(bomDetail.actual_quantity) || item.accumulated_quantity || 0;
        detailReplacements[`req_qty_${i}`] = requiredQty;
        detailReplacements[`adj_qty_${i}`] = requiredQty;
        detailReplacements[`step_${i}`] = stepNum;
        detailReplacements[`wc_num_${i}`] = matchedTask?.work_center_number || '';
        detailReplacements[`wc_name_${i}`] = matchedTask?.work_center_name || '';
        detailReplacements[`is_key_${i}`] = bomDetail.is_key_material || 0;
        detailReplacements[`sub_grp_${i}`] = bomDetail.substitute_group || '';
        detailReplacements[`sub_pri_${i}`] = bomDetail.substitute_priority || 0;
        detailReplacements[`supply_${i}`] = bomDetail.supply_type || '';
        detailReplacements[`warehouse_${i}`] = bomDetail.default_warehouse || '';
        detailReplacements[`bom_path_${i}`] = item.bom_path || '';
      });

      // 9. 创建主表记录
      await sequelize.query(`
        INSERT INTO material_preparation (preparation_number, production_order_number, production_number, item_number, item_name, specifications, basic_unit, bom_number, bom_version, planned_quantity, bom_base_quantity, total_material_types, preparation_status, approval_status, remark, creation_date, creation_man)
        VALUES (:preparation_number, :production_order_number, :production_number, :item_number, :item_name, :specifications, :basic_unit, :bom_number, :bom_version, :planned_quantity, :bom_base_quantity, :total_material_types, N'未领料', N'草稿', '', :creation_date, :creation_man)
      `, {
        replacements: {
          preparation_number: prepNumber,
          production_order_number: order.production_order_number,
          production_number: order.production_number || '',
          item_number: order.item_number || '',
          item_name: order.item_name || '',
          specifications: order.specifications || '',
          basic_unit: order.basic_unit || '',
          bom_number: bom.bom_number,
          bom_version: bom.bom_version || '',
          planned_quantity: plannedQty,
          bom_base_quantity: bomBaseQty,
          total_material_types: flatList.length,
          creation_date: now,
          creation_man: user?.username || ''
        }
      });

      // 10. 批量插入明细（逐条以兼容MSSQL参数限制）
      for (let i = 0; i < flatList.length; i++) {
        const singleReplacements: any = { prep_number: prepNumber };
        const keys = Object.keys(detailReplacements).filter(k => k.endsWith(`_${i}`));
        for (const k of keys) { singleReplacements[k] = detailReplacements[k]; }
        singleReplacements[`line_${i}`] = detailReplacements[`line_${i}`];

        await sequelize.query(`
          INSERT INTO material_preparation_detail (preparation_number, line_number, material_number, material_name, material_type, unit, bom_standard_quantity, bom_wastage_rate, bom_actual_quantity, required_quantity, adjusted_quantity, issued_quantity, step_number, work_center_number, work_center_name, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, bom_path, auto_weigh, remark)
          VALUES (:prep_number, :line_${i}, :mat_num_${i}, :mat_name_${i}, :mat_type_${i}, :unit_${i}, :bom_std_${i}, :bom_waste_${i}, :bom_act_${i}, :req_qty_${i}, :adj_qty_${i}, 0, :step_${i}, :wc_num_${i}, :wc_name_${i}, :is_key_${i}, :sub_grp_${i}, :sub_pri_${i}, :supply_${i}, :warehouse_${i}, :bom_path_${i}, N'N', '')
        `, { replacements: singleReplacements });
      }

      results.generatedCount++;
      results.details.push({
        production_order_number: orderNo,
        preparation_number: prepNumber,
        material_count: flatList.length
      });
    }

    const msg = results.generatedCount > 0
      ? `成功为 ${results.generatedCount} 个生产单生成备料单`
      : '未生成任何备料单';
    const skippedMsg = results.skipped.length > 0
      ? `，跳过 ${results.skipped.length} 条：` + results.skipped.map(s => `${s.orderNo}(${s.reason})`).join('；')
      : '';

    res.json(success(results, msg + skippedMsg));
  } catch (err) { next(err); }
};

// ==================== 核心：按工序从生产单自动生成备料单 ====================
export const generateByProcess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { production_order_numbers } = req.body;
    const user = (req as any).user;

    if (!production_order_numbers || !Array.isArray(production_order_numbers) || production_order_numbers.length === 0) {
      res.status(400).json({ success: false, message: '请选择要备料的生产单' });
      return;
    }

    const results: { generatedCount: number; skippedCount: number; details: any[]; skipped: any[] } = {
      generatedCount: 0, skippedCount: 0, details: [], skipped: []
    };
    const now = dayjs().format('YYYY/MM/DD HH:mm');

    for (const orderNo of production_order_numbers) {
      // 1. 查询生产单
      const [orders]: any = await sequelize.query(
        `SELECT production_order_number, production_number, item_number, item_name, specifications, basic_unit, planned_quantity, approval_status FROM production_order WHERE production_order_number = :orderNo`,
        { replacements: { orderNo } }
      );
      if (orders.length === 0) { results.skipped.push({ orderNo, reason: '生产单不存在' }); results.skippedCount++; continue; }
      const order = orders[0];
      if (order.approval_status !== '已审批') { results.skipped.push({ orderNo, reason: '生产单未审批（当前状态：' + order.approval_status + '）' }); results.skippedCount++; continue; }

      // 2. 查找匹配的BOM
      const [boms]: any = await sequelize.query(
        `SELECT TOP 1 bom_number, bom_name, bom_version, base_quantity FROM bom_header WHERE item_number = :item_number AND [condition] = N'启用' AND approval_status = N'已审批' ORDER BY bom_version DESC`,
        { replacements: { item_number: order.item_number } }
      );
      if (boms.length === 0) { results.skipped.push({ orderNo, reason: '未匹配到已审批且启用的BOM（产品编号：' + order.item_number + '）' }); results.skippedCount++; continue; }
      const bom = boms[0];
      const bomBaseQty = parseFloat(bom.base_quantity) || 1;

      // 3. 查找匹配的工艺路线
      const [routes]: any = await sequelize.query(
        `SELECT TOP 1 process_route_number FROM routing_header WHERE item_number = :item_number AND [condition] = N'启用' AND approval_status = N'已审批' ORDER BY creation_date DESC`,
        { replacements: { item_number: order.item_number } }
      );
      if (routes.length === 0) { results.skipped.push({ orderNo, reason: '未找到匹配的已审批工艺路线（产品编号：' + order.item_number + '）' }); results.skippedCount++; continue; }
      const routeNumber = routes[0].process_route_number;

      // 4. 查询工艺路线明细
      const [routeDetails]: any = await sequelize.query(
        `SELECT id, step_number, standard_process_number, standard_process_name, work_center_number, work_center_name FROM routing_detail WHERE process_route_number = :prn ORDER BY step_number`,
        { replacements: { prn: routeNumber } }
      );
      const routeStepMap: Record<number, any> = {};
      const procCodeToStepMap: Record<string, any> = {};
      for (const rd of routeDetails) {
        if (rd.step_number != null) routeStepMap[rd.step_number] = rd;
        if (rd.standard_process_number) procCodeToStepMap[rd.standard_process_number] = rd;
      }

      // 5. 构建 routing_detail_material 物料→工序映射
      const routeMaterialMap: Record<string, { step_number: number; standard_process_name: string; work_center_number: string; work_center_name: string }> = {};
      const routeDetailIds = routeDetails.map((rd: any) => rd.id).filter(Boolean);
      if (routeDetailIds.length > 0) {
        const [routeMats]: any = await sequelize.query(
          `SELECT rdm.material_number, rd.step_number, rd.standard_process_name, rd.work_center_number, rd.work_center_name
           FROM routing_detail_material rdm
           INNER JOIN routing_detail rd ON rdm.routing_detail_id = rd.id
           WHERE rd.process_route_number = :prn`,
          { replacements: { prn: routeNumber } }
        );
        for (const rm of routeMats) {
          if (rm.material_number && !routeMaterialMap[rm.material_number]) {
            routeMaterialMap[rm.material_number] = {
              step_number: rm.step_number,
              standard_process_name: rm.standard_process_name || '',
              work_center_number: rm.work_center_number || '',
              work_center_name: rm.work_center_name || ''
            };
          }
        }
      }

      // 6. 展平BOM获取所有叶子节点物料
      const flatItems: any[] = [];
      await flattenBomRecursive(bom.bom_number, bomBaseQty, new Set(), 0, 10, flatItems, '');

      // 7. 从BOM明细获取额外信息
      const [bomDetails]: any = await sequelize.query(
        `SELECT material_number, step_number, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, standard_quantity, wastage_rate, actual_quantity FROM bom_detail WHERE bom_number = :bomNumber ORDER BY line_number`,
        { replacements: { bomNumber: bom.bom_number } }
      );
      const bomDetailMap: Record<string, any> = {};
      for (const bd of bomDetails) {
        if (!bomDetailMap[bd.material_number]) bomDetailMap[bd.material_number] = bd;
      }

      // 8. 为每个物料分配工序
      const unmatchedMaterials: string[] = [];
      const unconfiguredMaterials: string[] = [];
      for (const item of flatItems) {
        if (routeMaterialMap[item.material_number]) {
          const rm = routeMaterialMap[item.material_number];
          item.assigned_step = rm.step_number;
          item.assigned_process_name = rm.standard_process_name;
          item.assigned_wc_number = rm.work_center_number;
          item.assigned_wc_name = rm.work_center_name;
        } else {
          // 回退：尝试匹配 bom_detail.step_number（可能是数字或文本工序编码如LH/BZ）
          const bomDetail = bomDetailMap[item.material_number] || {};
          // 依次尝试：bomDetail.step_number → item自身step → 祖先step链(从近到远)
          const stepsToTry = [...new Set([bomDetail.step_number, ...(item.ancestor_steps || [])].filter(Boolean))];
          let matched = false;
          for (const rawStep of stepsToTry) {
            const parsed = parseInt(rawStep, 10);
            if (!isNaN(parsed) && routeStepMap[parsed]) {
              item.assigned_step = parsed;
              item.assigned_process_name = routeStepMap[parsed].standard_process_name || '';
              item.assigned_wc_number = routeStepMap[parsed].work_center_number || '';
              item.assigned_wc_name = routeStepMap[parsed].work_center_name || '';
              matched = true;
              break;
            } else if (typeof rawStep === 'string' && procCodeToStepMap[rawStep]) {
              const m = procCodeToStepMap[rawStep];
              item.assigned_step = m.step_number;
              item.assigned_process_name = m.standard_process_name || '';
              item.assigned_wc_number = m.work_center_number || '';
              item.assigned_wc_name = m.work_center_name || '';
              matched = true;
              break;
            }
          }
          if (!matched) {
            // 最终兜底：分配到第一道工序
            const firstStep = routeDetails.length > 0 ? routeDetails[0] : null;
            if (firstStep && firstStep.step_number != null) {
              item.assigned_step = firstStep.step_number;
              item.assigned_process_name = firstStep.standard_process_name || '';
              item.assigned_wc_number = firstStep.work_center_number || '';
              item.assigned_wc_name = firstStep.work_center_name || '';
              unconfiguredMaterials.push(item.material_number);
            } else {
              unmatchedMaterials.push(item.material_number);
            }
          }
        }
      }

      // 9. 未匹配物料处理
      if (unmatchedMaterials.length > 0) {
        const uniqueUnmatched = [...new Set(unmatchedMaterials)];
        results.skipped.push({ orderNo, reason: '以下物料无法匹配工序（无工艺路线）：' + uniqueUnmatched.join(', ') });
        results.skippedCount++;
        continue;
      }
      if (unconfiguredMaterials.length > 0) {
        const uniqueUnconfigured = [...new Set(unconfiguredMaterials)];
        console.warn(`订单 ${orderNo} 以下物料未配置 routing_detail_material 映射，已自动分配到第一道工序：${uniqueUnconfigured.join(', ')}`);
      }

      // 10. 按 material_number + step_number 分组汇总
      const grouped: Record<string, any> = {};
      for (const item of flatItems) {
        const key = `${item.material_number}__${item.assigned_step}`;
        if (grouped[key]) {
          grouped[key].accumulated_quantity = Math.round((grouped[key].accumulated_quantity + item.accumulated_quantity) * 10000) / 10000;
        } else {
          grouped[key] = { ...item };
        }
      }
      const flatList = Object.values(grouped).sort((a: any, b: any) => {
        const stepDiff = (a.assigned_step || 0) - (b.assigned_step || 0);
        if (stepDiff !== 0) return stepDiff;
        return a.material_number.localeCompare(b.material_number);
      });

      if (flatList.length === 0) { results.skipped.push({ orderNo, reason: 'BOM展平后无物料明细' }); results.skippedCount++; continue; }

      // 11. 生成备料单
      const prepNumber = await generatePrepNumber();
      const plannedQty = parseFloat(order.planned_quantity) || 0;
      const multiplier = bomBaseQty > 0 ? plannedQty / bomBaseQty : 0;

      // 12. 创建主表记录
      await sequelize.query(`
        INSERT INTO material_preparation (preparation_number, production_order_number, production_number, item_number, item_name, specifications, basic_unit, bom_number, bom_version, planned_quantity, bom_base_quantity, total_material_types, preparation_status, approval_status, remark, creation_date, creation_man)
        VALUES (:preparation_number, :production_order_number, :production_number, :item_number, :item_name, :specifications, :basic_unit, :bom_number, :bom_version, :planned_quantity, :bom_base_quantity, :total_material_types, N'未领料', N'草稿', '', :creation_date, :creation_man)
      `, {
        replacements: {
          preparation_number: prepNumber,
          production_order_number: order.production_order_number,
          production_number: order.production_number || '',
          item_number: order.item_number || '',
          item_name: order.item_name || '',
          specifications: order.specifications || '',
          basic_unit: order.basic_unit || '',
          bom_number: bom.bom_number,
          bom_version: bom.bom_version || '',
          planned_quantity: plannedQty,
          bom_base_quantity: bomBaseQty,
          total_material_types: flatList.length,
          creation_date: now,
          creation_man: user?.username || ''
        }
      });

      // 13. 逐条插入明细
      for (let i = 0; i < flatList.length; i++) {
        const item: any = flatList[i];
        const bomDetail = bomDetailMap[item.material_number] || {};
        const requiredQty = Math.round(multiplier * item.accumulated_quantity * 10000) / 10000;

        await sequelize.query(`
          INSERT INTO material_preparation_detail (preparation_number, line_number, material_number, material_name, material_type, unit, bom_standard_quantity, bom_wastage_rate, bom_actual_quantity, required_quantity, adjusted_quantity, issued_quantity, step_number, work_center_number, work_center_name, standard_process_name, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, bom_path, auto_weigh, remark)
          VALUES (:prep_number, :line_num, :mat_num, :mat_name, :mat_type, :unit, :bom_std, :bom_waste, :bom_act, :req_qty, :adj_qty, 0, :step, :wc_num, :wc_name, :proc_name, :is_key, :sub_grp, :sub_pri, :supply, :warehouse, :bom_path, N'N', '')
        `, {
          replacements: {
            prep_number: prepNumber,
            line_num: (i + 1) * 10,
            mat_num: item.material_number || '',
            mat_name: item.material_name || '',
            mat_type: item.material_type || '',
            unit: item.unit || '',
            bom_std: parseFloat(bomDetail.standard_quantity) || 0,
            bom_waste: parseFloat(bomDetail.wastage_rate) || 0,
            bom_act: parseFloat(bomDetail.actual_quantity) || item.accumulated_quantity || 0,
            req_qty: requiredQty,
            adj_qty: requiredQty,
            step: item.assigned_step,
            wc_num: item.assigned_wc_number || '',
            wc_name: item.assigned_wc_name || '',
            proc_name: item.assigned_process_name || '',
            is_key: bomDetail.is_key_material || 0,
            sub_grp: bomDetail.substitute_group || '',
            sub_pri: bomDetail.substitute_priority || 0,
            supply: bomDetail.supply_type || '',
            warehouse: bomDetail.default_warehouse || '',
            bom_path: item.bom_path || ''
          }
        });
      }

      results.generatedCount++;
      results.details.push({
        production_order_number: orderNo,
        preparation_number: prepNumber,
        material_count: flatList.length
      });
    }

    const msg = results.generatedCount > 0
      ? `成功为 ${results.generatedCount} 个生产单生成按工序备料单`
      : '未生成任何备料单';
    const skippedMsg = results.skipped.length > 0
      ? `，跳过 ${results.skipped.length} 条：` + results.skipped.map(s => `${s.orderNo}(${s.reason})`).join('；')
      : '';

    res.json(success(results, msg + skippedMsg));
  } catch (err) { next(err); }
};

// ==================== 获取可生成备料的生产单列表 ====================
export const getOrdersForGenerate = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const search = (req.query.search as string) || '';

    let whereClause = `WHERE approval_status = N'已审批'`;
    const replacements: any = {};

    const planStatus = req.query.plan_status as string;
    if (planStatus) {
      const statuses = planStatus.split(',').map(s => s.trim()).filter(Boolean);
      if (statuses.length === 1) {
        whereClause += ` AND plan_status = :plan_status`;
        replacements.plan_status = statuses[0];
      } else if (statuses.length > 1) {
        const placeholders = statuses.map((_, i) => `:plan_status_${i}`).join(', ');
        statuses.forEach((s, i) => { replacements[`plan_status_${i}`] = s; });
        whereClause += ` AND plan_status IN (${placeholders})`;
      }
    }

    if (search) {
      whereClause += ` AND (production_order_number LIKE :search OR production_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    const [countResult]: any = await sequelize.query(
      `SELECT COUNT(*) as total FROM production_order ${whereClause}`, { replacements }
    );
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT production_order_number, production_number, item_number, item_name, specifications, basic_unit, planned_quantity, approval_status, ROW_NUMBER() OVER (ORDER BY production_order_number DESC) AS _row_num
        FROM production_order ${whereClause}
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    // 预检每张生产单的BOM匹配状态
    const enrichedItems = [];
    for (const item of items) {
      const { _row_num, ...order } = item;
      // 查匹配的BOM
      const [matchedBoms]: any = await sequelize.query(
        `SELECT TOP 1 bom_number, bom_version FROM bom_header WHERE item_number = :item_number AND [condition] = N'启用' AND approval_status = N'已审批' ORDER BY bom_version DESC`,
        { replacements: { item_number: order.item_number } }
      );
      if (matchedBoms.length > 0) {
        order.bom_matched = true;
        order.bom_number = matchedBoms[0].bom_number;
        order.bom_version = matchedBoms[0].bom_version;
      } else {
        order.bom_matched = false;
        order.bom_number = null;
        order.bom_version = null;
      }
      // 查已生成的备料单数
      const [prepCount]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM material_preparation WHERE production_order_number = :orderNo`,
        { replacements: { orderNo: order.production_order_number } }
      );
      order.existing_preparation_count = prepCount[0].cnt;
      enrichedItems.push(order);
    }

    res.json(success({
      items: enrichedItems,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) }
    }, '获取已审批生产单列表成功'));
  } catch (err) { next(err); }
};

// ==================== 移动端: 备料单明细按工序分组 ====================
export const getPreparationDetailsGrouped = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(
      `SELECT ${headerSelectCols} FROM material_preparation WHERE preparation_number = :id`,
      { replacements: { id } }
    );
    if (!headers.length) { res.status(404).json({ success: false, message: '备料单不存在' }); return; }

    const [details]: any = await sequelize.query(
      `SELECT ${detailSelectCols} FROM material_preparation_detail WHERE preparation_number = :id ORDER BY step_number, line_number`,
      { replacements: { id } }
    );

    // 按 step_number 分组
    const groups: Record<string, { step_number: number | null; work_center_name: string; items: any[] }> = {};
    for (const d of details) {
      const key = d.step_number != null ? String(d.step_number) : 'general';
      if (!groups[key]) {
        groups[key] = {
          step_number: d.step_number,
          work_center_name: d.work_center_name || (d.step_number != null ? `工序${d.step_number}` : '通用物料'),
          items: []
        };
      }
      groups[key].items.push(d);
    }

    res.json(success({
      header: headers[0],
      groups: Object.values(groups)
    }, '获取备料单分组明细成功'));
  } catch (err) { next(err); }
};

// ==================== 内部递归辅助函数：展开BOM并累计用量 ====================
async function flattenBomRecursive(bomNumber: string, parentMultiplier: number, visitedSet: Set<string>, depth: number, maxDepth: number, result: any[], path: string, ancestorSteps?: string[]) {
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

  const parentSteps = ancestorSteps || [];

  for (const d of details) {
    const childBomNum = d.child_bom_number || bomMap[d.material_number] || null;
    const actualQty = parseFloat(d.actual_quantity) || 0;
    const accumulatedQty = parentMultiplier * (actualQty / baseQty);
    const currentPath = path ? `${path} > ${bomNumber}` : bomNumber;
    // 构建祖先 step 链：当前行有自己的 step 时，将其加入链头部
    const currentSteps = d.step_number ? [d.step_number, ...parentSteps] : [...parentSteps];

    if (childBomNum) {
      await flattenBomRecursive(childBomNum, accumulatedQty, new Set(visitedSet), depth + 1, maxDepth, result, currentPath, currentSteps);
    } else {
      result.push({
        material_number: d.material_number,
        material_name: d.material_name,
        material_type: d.material_type,
        unit: d.unit,
        accumulated_quantity: Math.round(accumulatedQty * 10000) / 10000,
        bom_path: currentPath,
        level: depth,
        is_leaf: true,
        step_number: d.step_number || (parentSteps.length > 0 ? parentSteps[0] : null),
        ancestor_steps: currentSteps
      });
    }
  }
}

// ==================== 移动端: 工序备料状态聚合查询 ====================
export const getProcessPrepStatus = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const orderNo = req.params.orderNo;

    // 1. 查询生产单基本信息
    const [orders]: any = await sequelize.query(
      `SELECT production_order_number, production_number, item_number, item_name, specifications, basic_unit, planned_quantity, plan_status, approval_status FROM production_order WHERE production_order_number = :orderNo`,
      { replacements: { orderNo } }
    );
    if (!orders.length) {
      res.status(404).json({ success: false, message: '生产单不存在' });
      return;
    }
    const order = orders[0];

    // 2. 查询该生产单的备料单
    const [preps]: any = await sequelize.query(
      `SELECT preparation_number, preparation_status, approval_status FROM material_preparation WHERE production_order_number = :orderNo`,
      { replacements: { orderNo } }
    );

    // 3. 查询所有工序任务
    const [tasks]: any = await sequelize.query(
      `SELECT process_task_number, step_number, standard_process_name, work_center_number, work_center_name, task_status, completed_quantity, planned_quantity FROM process_task WHERE production_order_number = :orderNo ORDER BY step_number ASC`,
      { replacements: { orderNo } }
    );

    if (!preps.length) {
      const steps = tasks.map((t: any) => ({
        step_number: t.step_number,
        standard_process_name: t.standard_process_name,
        work_center_name: t.work_center_name,
        task_status: t.task_status,
        material_count: 0,
        issued_count: 0,
        is_fully_issued: false,
        has_materials: false
      }));
      res.json(success({
        has_preparation: false,
        preparation_number: null,
        order,
        steps
      }, '该生产单暂无备料单'));
      return;
    }

    const prep = preps[0];

    // 4. 查询备料单明细，按 step_number 分组聚合
    const [matGroups]: any = await sequelize.query(`
      SELECT
        step_number,
        COUNT(*) as material_count,
        SUM(CASE WHEN ISNULL(issued_quantity, 0) >= ISNULL(required_quantity, 0) AND ISNULL(required_quantity, 0) > 0 THEN 1 ELSE 0 END) as issued_count
      FROM material_preparation_detail
      WHERE preparation_number = :prepNo
      GROUP BY step_number
      ORDER BY step_number
    `, { replacements: { prepNo: prep.preparation_number } });

    const matMap: Record<number, { material_count: number; issued_count: number }> = {};
    let nullStepMaterials: { material_count: number; issued_count: number } | null = null;
    for (const g of matGroups) {
      if (g.step_number != null) {
        matMap[g.step_number] = {
          material_count: parseInt(g.material_count) || 0,
          issued_count: parseInt(g.issued_count) || 0
        };
      } else {
        nullStepMaterials = {
          material_count: parseInt(g.material_count) || 0,
          issued_count: parseInt(g.issued_count) || 0
        };
      }
    }

    // 5. 合并工序任务与物料聚合数据
    const steps = tasks.map((t: any) => {
      const mat = matMap[t.step_number] || { material_count: 0, issued_count: 0 };
      const hasMaterials = mat.material_count > 0;
      const isFullyIssued = hasMaterials ? mat.issued_count >= mat.material_count : true;
      return {
        step_number: t.step_number,
        standard_process_name: t.standard_process_name,
        work_center_name: t.work_center_name,
        task_status: t.task_status,
        process_task_number: t.process_task_number,
        material_count: mat.material_count,
        issued_count: mat.issued_count,
        is_fully_issued: isFullyIssued,
        has_materials: hasMaterials
      };
    });

    // 6. 如果有未归属工序的物料（step_number=null），追加为"通用物料"步骤
    if (nullStepMaterials && nullStepMaterials.material_count > 0) {
      steps.push({
        step_number: -1,
        standard_process_name: '通用物料',
        work_center_name: '',
        task_status: null,
        process_task_number: null,
        material_count: nullStepMaterials.material_count,
        issued_count: nullStepMaterials.issued_count,
        is_fully_issued: nullStepMaterials.issued_count >= nullStepMaterials.material_count,
        has_materials: true
      });
    }

    res.json(success({
      has_preparation: true,
      preparation_number: prep.preparation_number,
      preparation_status: prep.preparation_status,
      order,
      steps
    }, '获取工序备料状态成功'));
  } catch (err) { next(err); }
};

// ==================== 批量更新明细自动称量标记 ====================
export const updateDetailAutoWeigh = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const { ids, auto_weigh } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw new BusinessError(400, '请选择至少一条明细记录');
    }
    if (!['Y', 'N'].includes(auto_weigh)) {
      throw new BusinessError(400, 'auto_weigh 值必须为 Y 或 N');
    }

    const placeholders = ids.map((_: any, i: number) => `:id${i}`).join(',');
    const replacements: any = { val: auto_weigh, prepNumber: id };
    ids.forEach((idVal: number, i: number) => { replacements[`id${i}`] = idVal; });

    await sequelize.query(
      `UPDATE material_preparation_detail SET auto_weigh = :val WHERE id IN (${placeholders}) AND preparation_number = :prepNumber`,
      { replacements }
    );

    res.json(success({ updatedCount: ids.length }, '更新成功'));
  } catch (err) { next(err); }
};
