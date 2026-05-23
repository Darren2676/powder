import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';

// ==================== 列表查询（从快照表） ====================
export const getProductionMaterialCost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const plan_status = (req.query.plan_status as string) || '';

    // 构建生产单维度的搜索条件
    const orderConditions: string[] = [];
    const replacements: any = {};

    if (search) {
      orderConditions.push(`(po.production_order_number LIKE :search OR po.item_number LIKE :search OR po.item_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (plan_status) {
      orderConditions.push(`po.plan_status = :plan_status`);
      replacements.plan_status = plan_status;
    }

    const orderWhere = orderConditions.length > 0 ? 'AND ' + orderConditions.join(' AND ') : '';

    // 总数
    const countResult: any = await sequelize.query(`
      SELECT COUNT(DISTINCT po.production_order_number) as total
      FROM production_order po
      INNER JOIN production_material_cost_snapshot s ON s.production_order_number = po.production_order_number
      WHERE 1=1 ${orderWhere}
    `, { replacements });

    const total = countResult[0][0].total;
    const offset = (page - 1) * limit;

    // 生产单维度汇总（从快照表聚合）
    const [orderRows]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT po.production_order_number, po.item_number, po.item_name,
               po.specifications, po.basic_unit, po.planned_quantity,
               po.plan_status, po.production_number,
               SUM(s.material_cost) as material_cost_total,
               SUM(s.issued_quantity) as total_issued_qty,
               COUNT(*) as material_count,
               SUM(CASE WHEN s.has_cost = 0 THEN 1 ELSE 0 END) as unpriced_count,
               MIN(s.cost_list_number) as cost_list_number,
               ROW_NUMBER() OVER (ORDER BY po.production_order_number DESC) AS _row_num
        FROM production_order po
        INNER JOIN production_material_cost_snapshot s ON s.production_order_number = po.production_order_number
        WHERE 1=1 ${orderWhere}
        GROUP BY po.production_order_number, po.item_number, po.item_name,
                 po.specifications, po.basic_unit, po.planned_quantity,
                 po.plan_status, po.production_number
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    // 构建生产单汇总数据
    const items = orderRows.map((r: any) => {
      const { _row_num, material_cost_total, total_issued_qty, material_count, unpriced_count, cost_list_number, ...rest } = r;
      const materialCostTotal = parseFloat(material_cost_total) || 0;
      return {
        ...rest,
        material_cost_total: Math.round(materialCostTotal * 100) / 100,
        material_count: parseInt(material_count) || 0,
        unpriced_count: parseInt(unpriced_count) || 0,
        unit_cost_avg: rest.planned_quantity > 0
          ? Math.round(materialCostTotal / parseFloat(rest.planned_quantity) * 100) / 100
          : 0,
        cost_list_number: cost_list_number || '',
      };
    });

    // 获取每个生产单的快照明细
    const orderNumbers = items.map((r: any) => r.production_order_number);
    const detailMap: Record<string, any[]> = {};
    let totalUnpricedCount = 0;

    if (orderNumbers.length > 0) {
      const placeholders = orderNumbers.map((_: any, i: number) => `:on${i}`).join(',');
      const detailReplacements: any = {};
      orderNumbers.forEach((n: string, i: number) => { detailReplacements[`on${i}`] = n; });

      const [detailRows]: any = await sequelize.query(`
        SELECT id, snapshot_number, production_order_number, preparation_number, issue_number,
               material_number, material_name, material_type, unit,
               issued_quantity, standard_cost, material_cost,
               cost_list_number, cost_list_name, has_cost,
               step_number, work_center_name, source_type, source_number,
               CONVERT(VARCHAR(19), creation_date, 120) as creation_date, creation_man
        FROM production_material_cost_snapshot
        WHERE production_order_number IN (${placeholders})
        ORDER BY production_order_number, preparation_number, step_number, material_number
      `, { replacements: detailReplacements });

      for (const d of detailRows) {
        if (!detailMap[d.production_order_number]) {
          detailMap[d.production_order_number] = [];
        }
        detailMap[d.production_order_number].push(d);
        if (!d.has_cost) totalUnpricedCount++;
      }
    }

    // 全局汇总
    const summaryMaterialCost = items.reduce((s: number, i: any) => s + (i.material_cost_total || 0), 0);
    const summaryMaterialCount = items.reduce((s: number, i: any) => s + (i.material_count || 0), 0);
    const costListNumber = items.length > 0 ? items[0].cost_list_number : '';

    res.json(success({
      items,
      details: detailMap,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      summary: {
        total_orders: total,
        current_orders: items.length,
        total_material_cost: Math.round(summaryMaterialCost * 100) / 100,
        total_material_count: summaryMaterialCount,
        total_unpriced_count: totalUnpricedCount,
        cost_list_number: costListNumber
      }
    }, '获取生产单材料成本成功'));
  } catch (err) { next(err); }
};

// ==================== 汇总统计（从快照表） ====================
export const getProductionMaterialCostSummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const [summaryRows]: any = await sequelize.query(`
      SELECT
        COUNT(DISTINCT production_order_number) as total_orders,
        SUM(material_cost) as total_material_cost,
        COUNT(*) as total_material_count,
        SUM(CASE WHEN has_cost = 0 THEN 1 ELSE 0 END) as total_unpriced_count,
        MIN(cost_list_number) as cost_list_number
      FROM production_material_cost_snapshot
    `);

    const row = summaryRows[0] || {};
    const totalOrders = parseInt(row.total_orders) || 0;
    const totalMaterialCost = parseFloat(row.total_material_cost) || 0;
    const totalMaterialCount = parseInt(row.total_material_count) || 0;
    const totalUnpriced = parseInt(row.total_unpriced_count) || 0;

    res.json(success({
      total_orders: totalOrders,
      total_material_cost: Math.round(totalMaterialCost * 100) / 100,
      total_material_count: totalMaterialCount,
      total_unpriced_count: totalUnpriced,
      priced_rate: totalMaterialCount > 0
        ? Math.round((totalMaterialCount - totalUnpriced) / totalMaterialCount * 10000) / 100
        : 0,
      cost_list_number: row.cost_list_number || ''
    }, '获取材料成本汇总成功'));
  } catch (err) { next(err); }
};

// ==================== 导出（从快照表） ====================
export const exportProductionMaterialCost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    const plan_status = (req.query.plan_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(po.production_order_number LIKE :search OR po.item_number LIKE :search OR po.item_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (plan_status) {
      conditions.push(`po.plan_status = :plan_status`);
      replacements.plan_status = plan_status;
    }

    const whereClause = conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';

    const [detailRows]: any = await sequelize.query(`
      SELECT po.production_order_number, po.item_number, po.item_name,
             po.specifications, po.basic_unit, po.planned_quantity, po.plan_status,
             s.preparation_number, s.issue_number,
             s.material_number, s.material_name, s.material_type, s.unit,
             s.issued_quantity, s.standard_cost, s.material_cost,
             s.has_cost, s.cost_list_number,
             s.step_number, s.work_center_name,
             s.source_type, s.source_number,
             CONVERT(VARCHAR(19), s.creation_date, 120) as snapshot_date
      FROM production_material_cost_snapshot s
      INNER JOIN production_order po ON po.production_order_number = s.production_order_number
      WHERE 1=1 ${whereClause}
      ORDER BY po.production_order_number, s.preparation_number, s.step_number, s.material_number
    `, { replacements });

    const exportData = detailRows.map((d: any) => ({
      production_order_number: d.production_order_number,
      item_number: d.item_number,
      item_name: d.item_name,
      specifications: d.specifications,
      basic_unit: d.basic_unit,
      planned_quantity: d.planned_quantity,
      plan_status: d.plan_status,
      preparation_number: d.preparation_number,
      issue_number: d.issue_number,
      material_number: d.material_number,
      material_name: d.material_name,
      material_type: d.material_type,
      unit: d.unit,
      issued_quantity: d.issued_quantity,
      standard_cost: d.standard_cost,
      material_cost: d.material_cost,
      cost_list_number: d.cost_list_number,
      step_number: d.step_number,
      work_center_name: d.work_center_name,
      source_type: d.source_type,
      snapshot_date: d.snapshot_date,
    }));

    const fields = [
      'production_order_number', 'item_number', 'item_name', 'specifications', 'basic_unit',
      'planned_quantity', 'plan_status', 'preparation_number', 'issue_number',
      'material_number', 'material_name', 'material_type', 'unit',
      'issued_quantity', 'standard_cost', 'material_cost', 'cost_list_number',
      'step_number', 'work_center_name', 'source_type', 'snapshot_date'
    ];
    const headers = [
      '生产单编号', '产品编号', '产品名称', '规格', '基本单位',
      '计划数量', '生产状态', '备料单号', '领料单号',
      '物料编号', '物料名称', '物料类型', '单位',
      '领料数量', '标准成本单价', '材料成本', '成本表编号',
      '工序号', '工作中心', '来源类型', '快照时间'
    ];

    exportToExcel(exportData, fields, headers, 'production_material_cost', res);
  } catch (err) { next(err); }
};
