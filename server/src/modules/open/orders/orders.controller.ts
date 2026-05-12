import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';

const selectCols = 'production_order_number, production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, equipment_number, equipment_name, mould_number, formed_part_specifications, formed_part_unit_consumption, actual_cavity_count, actual_hole_count, actual_daily_output, production_date, planned_completion_time, plan_status, completion_status, inbound_status, remark, approval_status';

// 查询工单列表
export const openGetOrders = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const search = (req.query.search as string) || '';
    const plan_status = (req.query.plan_status as string) || '';
    const production_date = (req.query.production_date as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(production_order_number LIKE :search OR production_number LIKE :search OR item_number LIKE :search OR item_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (plan_status) {
      conditions.push(`plan_status = :plan_status`);
      replacements.plan_status = plan_status;
    }
    if (production_date) {
      conditions.push(`CONVERT(VARCHAR(10), production_date, 120) = :production_date`);
      replacements.production_date = production_date;
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const [countResult]: any = await sequelize.query(`SELECT COUNT(*) as total FROM production_order ${whereClause}`, { replacements });
    const total = countResult[0].total;

    const offset = (page - 1) * limit;
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT ${selectCols}, ROW_NUMBER() OVER (ORDER BY production_order_number DESC) AS _row_num
        FROM production_order ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const cleanItems = items.map((item: any) => { const { _row_num, ...rest } = item; return rest; });

    res.json(success({ items: cleanItems, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } }, '获取工单列表成功'));
  } catch (err) { next(err); }
};

// 查询工单详情
export const openGetOrderDetail = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [rows]: any = await sequelize.query(
      `SELECT ${selectCols} FROM production_order WHERE production_order_number = :id`,
      { replacements: { id } }
    );
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: '工单不存在' });
    }
    res.json(success(rows[0], '获取工单详情成功'));
  } catch (err) { next(err); }
};

// 创建工单
export const openCreateOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const b = req.body;
    if (!b.item_number) {
      return res.status(400).json({ success: false, message: '产品编号不能为空' });
    }

    // 生成工单编号
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const [maxRows]: any = await sequelize.query(
      `SELECT MAX(production_order_number) as max_num FROM production_order WHERE production_order_number LIKE :prefix`,
      { replacements: { prefix: `PO${dateStr}%` } }
    );
    let seq = 1;
    if (maxRows[0].max_num) {
      const lastSeq = parseInt(maxRows[0].max_num.slice(-3));
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    const production_order_number = `PO${dateStr}${String(seq).padStart(3, '0')}`;

    await sequelize.query(`
      INSERT INTO production_order (production_order_number, production_number, item_number, item_name, basic_unit, specifications, product_drawing_number, rubber_compound_number, batch_production_quota, planned_quantity, equipment_number, equipment_name, mould_number, formed_part_specifications, formed_part_unit_consumption, actual_cavity_count, actual_hole_count, actual_daily_output, planned_completion_time, plan_status, remark, approval_status)
      VALUES (:production_order_number, :production_number, :item_number, :item_name, :basic_unit, :specifications, :product_drawing_number, :rubber_compound_number, :batch_production_quota, :planned_quantity, :equipment_number, :equipment_name, :mould_number, :formed_part_specifications, :formed_part_unit_consumption, :actual_cavity_count, :actual_hole_count, :actual_daily_output, :planned_completion_time, :plan_status, :remark, N'草稿')
    `, {
      replacements: {
        production_order_number,
        production_number: b.production_number || '',
        item_number: b.item_number,
        item_name: b.item_name || '',
        basic_unit: b.basic_unit || '',
        specifications: b.specifications || '',
        product_drawing_number: b.product_drawing_number || '',
        rubber_compound_number: b.rubber_compound_number || '',
        batch_production_quota: b.batch_production_quota || '',
        planned_quantity: b.planned_quantity || 0,
        equipment_number: b.equipment_number || null,
        equipment_name: b.equipment_name || null,
        mould_number: b.mould_number || null,
        formed_part_specifications: b.formed_part_specifications || null,
        formed_part_unit_consumption: b.formed_part_unit_consumption || null,
        actual_cavity_count: b.actual_cavity_count || null,
        actual_hole_count: b.actual_hole_count || null,
        actual_daily_output: b.actual_daily_output || null,
        planned_completion_time: b.planned_completion_time || null,
        plan_status: b.plan_status || '待执行',
        remark: b.remark || ''
      }
    });

    res.json(success({ production_order_number }, '创建工单成功'));
  } catch (err) { next(err); }
};

// 更新工单
export const openUpdateOrder = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;
    const [chk]: any = await sequelize.query(`SELECT approval_status FROM production_order WHERE production_order_number = :id`, { replacements: { id } });
    if (chk.length === 0) return res.status(404).json({ success: false, message: '工单不存在' });
    if (chk[0].approval_status !== '草稿') return res.status(403).json({ success: false, message: '已提交审批或已审批的记录不允许编辑' });

    const b = req.body;
    await sequelize.query(`
      UPDATE production_order SET
        production_number = :production_number, item_number = :item_number, item_name = :item_name,
        basic_unit = :basic_unit, specifications = :specifications,
        product_drawing_number = :product_drawing_number, rubber_compound_number = :rubber_compound_number,
        batch_production_quota = :batch_production_quota, planned_quantity = :planned_quantity,
        equipment_number = :equipment_number, equipment_name = :equipment_name,
        mould_number = :mould_number, planned_completion_time = :planned_completion_time,
        remark = :remark
      WHERE production_order_number = :id
    `, {
      replacements: {
        id,
        production_number: b.production_number || '', item_number: b.item_number || '', item_name: b.item_name || '',
        basic_unit: b.basic_unit || '', specifications: b.specifications || '',
        product_drawing_number: b.product_drawing_number || '', rubber_compound_number: b.rubber_compound_number || '',
        batch_production_quota: b.batch_production_quota || '', planned_quantity: b.planned_quantity || 0,
        equipment_number: b.equipment_number || null, equipment_name: b.equipment_name || null,
        mould_number: b.mould_number || null, planned_completion_time: b.planned_completion_time || null,
        remark: b.remark || ''
      }
    });

    res.json(success(null, '更新工单成功'));
  } catch (err) { next(err); }
};
