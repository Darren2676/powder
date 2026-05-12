import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';

const headerSelectCols = 'preparation_number, production_order_number, production_number, item_number, item_name, specifications, basic_unit, bom_number, bom_version, planned_quantity, bom_base_quantity, total_material_types, preparation_status, approval_status, remark, creation_date';

const detailSelectCols = 'id, preparation_number, line_number, material_number, material_name, material_type, unit, bom_standard_quantity, bom_wastage_rate, bom_actual_quantity, required_quantity, adjusted_quantity, issued_quantity, step_number, work_center_number, work_center_name, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, standard_process_name, remark';

// 查询备料单列表
export const openGetPreparations = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = (req.query.search as string) || '';
    const preparation_status = (req.query.preparation_status as string) || '';
    const production_order_number = (req.query.production_order_number as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(preparation_number LIKE :search OR production_order_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (preparation_status) {
      conditions.push(`preparation_status = :preparation_status`);
      replacements.preparation_status = preparation_status;
    }
    if (production_order_number) {
      conditions.push(`production_order_number = :production_order_number`);
      replacements.production_order_number = production_order_number;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM material_preparation ${whereClause}`, { replacements });
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT ${headerSelectCols}, ROW_NUMBER() OVER (ORDER BY preparation_number DESC) AS _row_num
        FROM material_preparation ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取备料单列表成功'));
  } catch (err) { next(err); }
};

// 查询备料单明细
export const openGetPreparationDetails = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(
      `SELECT ${headerSelectCols} FROM material_preparation WHERE preparation_number = :id`,
      { replacements: { id } }
    );
    if (headers.length === 0) {
      return res.status(404).json({ success: false, message: '备料单不存在' });
    }
    const [details]: any = await sequelize.query(
      `SELECT ${detailSelectCols} FROM material_preparation_detail WHERE preparation_number = :id ORDER BY line_number`,
      { replacements: { id } }
    );
    res.json(success({ header: headers[0], details }, '获取备料单明细成功'));
  } catch (err) { next(err); }
};

// 按工序分组明细
export const openGetPreparationDetailsGrouped = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [headers]: any = await sequelize.query(
      `SELECT ${headerSelectCols} FROM material_preparation WHERE preparation_number = :id`,
      { replacements: { id } }
    );
    if (headers.length === 0) {
      return res.status(404).json({ success: false, message: '备料单不存在' });
    }
    const [details]: any = await sequelize.query(
      `SELECT ${detailSelectCols} FROM material_preparation_detail WHERE preparation_number = :id ORDER BY step_number, line_number`,
      { replacements: { id } }
    );
    // 按工序分组
    const grouped: Record<number, any[]> = {};
    for (const d of details) {
      const step = d.step_number || 0;
      if (!grouped[step]) grouped[step] = [];
      grouped[step].push(d);
    }
    res.json(success({ header: headers[0], grouped }, '获取备料单分组明细成功'));
  } catch (err) { next(err); }
};

// 按工序生成备料单
export const openGenerateByProcess = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { production_order_number } = req.body;
    if (!production_order_number) {
      return res.status(400).json({ success: false, message: '生产单编号不能为空' });
    }

    // 检查工单存在
    const [orderRows]: any = await sequelize.query(
      `SELECT production_order_number, item_number, item_name, specifications, basic_unit, planned_quantity, bom_number FROM production_order WHERE production_order_number = :pon`,
      { replacements: { pon: production_order_number } }
    );
    if (orderRows.length === 0) {
      return res.status(404).json({ success: false, message: '生产单不存在' });
    }
    const order = orderRows[0];

    if (!order.bom_number) {
      return res.status(400).json({ success: false, message: '该工单未关联BOM，无法生成备料单' });
    }

    // 生成备料单编号
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [maxRows]: any = await sequelize.query(
      `SELECT MAX(preparation_number) as max_num FROM material_preparation WHERE preparation_number LIKE :prefix`,
      { replacements: { prefix: `MP-${dateStr}%` } }
    );
    let seq = 1;
    if (maxRows[0].max_num) {
      const lastSeq = parseInt(maxRows[0].max_num.slice(-3));
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    const preparation_number = `MP-${dateStr}-${String(seq).padStart(3, '0')}`;

    // 从BOM明细+工艺路线物料生成备料明细
    const [bomDetails]: any = await sequelize.query(`
      SELECT bd.material_number, bd.material_name, bd.material_type, bd.unit,
             bd.standard_quantity as bom_standard_quantity, bd.wastage_rate as bom_wastage_rate,
             bd.actual_quantity as bom_actual_quantity, bd.step_number, bd.work_center_number,
             bd.work_center_name, bd.is_key_material, bd.substitute_group, bd.substitute_priority,
             bd.supply_type, bd.default_warehouse, bd.standard_process_name
      FROM bom_detail bd
      WHERE bd.bom_number = :bomNumber
      ORDER BY bd.line_number
    `, { replacements: { bomNumber: order.bom_number } });

    // 计算需求数量
    const baseQty = 1;
    const details = bomDetails.map((bd: any, idx: number) => ({
      preparation_number,
      line_number: idx + 1,
      material_number: bd.material_number || '',
      material_name: bd.material_name || '',
      material_type: bd.material_type || '',
      unit: bd.unit || '',
      bom_standard_quantity: bd.bom_standard_quantity || 0,
      bom_wastage_rate: bd.bom_wastage_rate || 0,
      bom_actual_quantity: bd.bom_actual_quantity || 0,
      required_quantity: Math.ceil(order.planned_quantity * (bd.bom_actual_quantity || bd.bom_standard_quantity || 0) / baseQty),
      adjusted_quantity: Math.ceil(order.planned_quantity * (bd.bom_actual_quantity || bd.bom_standard_quantity || 0) / baseQty),
      issued_quantity: 0,
      step_number: bd.step_number || 0,
      work_center_number: bd.work_center_number || '',
      work_center_name: bd.work_center_name || '',
      is_key_material: bd.is_key_material || false,
      substitute_group: bd.substitute_group || '',
      substitute_priority: bd.substitute_priority || 0,
      supply_type: bd.supply_type || '',
      default_warehouse: bd.default_warehouse || '',
      standard_process_name: bd.standard_process_name || '',
      remark: ''
    }));

    // 获取BOM版本
    const [bomHeader]: any = await sequelize.query(
      `SELECT bom_version FROM bom_header WHERE bom_number = :bn`,
      { replacements: { bn: order.bom_number } }
    );
    const bomVersion = bomHeader.length > 0 ? bomHeader[0].bom_version : '';

    // 插入备料单头
    await sequelize.query(`
      INSERT INTO material_preparation (preparation_number, production_order_number, production_number, item_number, item_name, specifications, basic_unit, bom_number, bom_version, planned_quantity, bom_base_quantity, total_material_types, preparation_status, approval_status, remark, creation_man)
      VALUES (:preparation_number, :production_order_number, '', :item_number, :item_name, :specifications, :basic_unit, :bom_number, :bom_version, :planned_quantity, 1, :total_types, N'待备料', N'草稿', '', N'API')
    `, {
      replacements: {
        preparation_number,
        production_order_number: order.production_order_number,
        item_number: order.item_number,
        item_name: order.item_name,
        specifications: order.specifications || '',
        basic_unit: order.basic_unit || '',
        bom_number: order.bom_number,
        bom_version: bomVersion || '',
        planned_quantity: order.planned_quantity,
        total_types: details.length
      }
    });

    // 插入备料明细
    for (const d of details) {
      await sequelize.query(`
        INSERT INTO material_preparation_detail (preparation_number, line_number, material_number, material_name, material_type, unit, bom_standard_quantity, bom_wastage_rate, bom_actual_quantity, required_quantity, adjusted_quantity, issued_quantity, step_number, work_center_number, work_center_name, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse, standard_process_name, remark)
        VALUES (:preparation_number, :line_number, :material_number, :material_name, :material_type, :unit, :bom_standard_quantity, :bom_wastage_rate, :bom_actual_quantity, :required_quantity, :adjusted_quantity, :issued_quantity, :step_number, :work_center_number, :work_center_name, :is_key_material, :substitute_group, :substitute_priority, :supply_type, :default_warehouse, :standard_process_name, :remark)
      `, { replacements: d });
    }

    res.json(success({ preparation_number, total_material_types: details.length }, '按工序生成备料单成功'));
  } catch (err) { next(err); }
};
