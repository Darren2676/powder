import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { exportToExcel } from '../../../utils/excel.util';

// ==================== 列表查询（按生产计划维度汇总） ====================
export const getPlanMaterialCost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const search = (req.query.search as string) || '';
    const plan_status = (req.query.plan_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(pp.production_number LIKE :search OR pp.item_number LIKE :search OR pp.item_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (plan_status) {
      conditions.push(`pp.plan_status = :plan_status`);
      replacements.plan_status = plan_status;
    }

    const whereClause = conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';

    // 总数
    const countResult: any = await sequelize.query(`
      SELECT COUNT(*) as total FROM (
        SELECT pp.production_number
        FROM Production_plan pp
        INNER JOIN production_order po ON po.production_number = pp.production_number
        INNER JOIN production_material_cost_snapshot s ON s.production_order_number = po.production_order_number
        WHERE 1=1 ${whereClause}
        GROUP BY pp.production_number
      ) AS t
    `, { replacements });

    const total = countResult[0][0].total;
    const offset = (page - 1) * limit;

    // 计划维度汇总
    const [planRows]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT pp.production_number, pp.item_number, pp.item_name,
               pp.planned_quantity, pp.plan_status,
               COUNT(DISTINCT po.production_order_number) as order_count,
               SUM(s.material_cost) as material_cost_total,
               COUNT(*) as material_count,
               SUM(CASE WHEN s.has_cost = 0 THEN 1 ELSE 0 END) as unpriced_count,
               MIN(s.cost_list_number) as cost_list_number,
               ROW_NUMBER() OVER (ORDER BY pp.production_number DESC) AS _row_num
        FROM Production_plan pp
        INNER JOIN production_order po ON po.production_number = pp.production_number
        INNER JOIN production_material_cost_snapshot s ON s.production_order_number = po.production_order_number
        WHERE 1=1 ${whereClause}
        GROUP BY pp.production_number, pp.item_number, pp.item_name, pp.planned_quantity, pp.plan_status
      ) AS t
      WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements: { ...replacements, offset, offsetEnd: offset + limit } });

    const items = planRows.map((r: any) => {
      const { _row_num, material_cost_total, material_count, unpriced_count, order_count, cost_list_number, ...rest } = r;
      const materialCostTotal = parseFloat(material_cost_total) || 0;
      return {
        ...rest,
        order_count: parseInt(order_count) || 0,
        material_cost_total: Math.round(materialCostTotal * 100) / 100,
        material_count: parseInt(material_count) || 0,
        unpriced_count: parseInt(unpriced_count) || 0,
        unit_cost_avg: rest.planned_quantity > 0
          ? Math.round(materialCostTotal / parseFloat(rest.planned_quantity) * 100) / 100
          : 0,
        cost_list_number: cost_list_number || '',
      };
    });

    // 获取每个计划的快照明细（按生产单分组）
    const planNumbers = items.map((r: any) => r.production_number);
    const detailMap: Record<string, any> = {};
    const orderMap: Record<string, any[]> = {};
    let totalUnpricedCount = 0;

    if (planNumbers.length > 0) {
      // 查该计划下所有生产单的快照
      const placeholders = planNumbers.map((_: any, i: number) => `:pn${i}`).join(',');
      const detailReplacements: any = {};
      planNumbers.forEach((n: string, i: number) => { detailReplacements[`pn${i}`] = n; });

      const [detailRows]: any = await sequelize.query(`
        SELECT pp.production_number as plan_number,
               po.production_order_number,
               s.id, s.snapshot_number, s.preparation_number, s.issue_number,
               s.material_number, s.material_name, s.material_type, s.unit,
               s.issued_quantity, s.standard_cost, s.material_cost,
               s.cost_list_number, s.cost_list_name, s.has_cost,
               s.step_number, s.work_center_name, s.source_type, s.source_number,
               CONVERT(VARCHAR(19), s.creation_date, 120) as creation_date, s.creation_man
        FROM production_material_cost_snapshot s
        INNER JOIN production_order po ON po.production_order_number = s.production_order_number
        INNER JOIN Production_plan pp ON pp.production_number = po.production_number
        WHERE pp.production_number IN (${placeholders})
        ORDER BY pp.production_number, po.production_order_number, s.preparation_number, s.step_number, s.material_number
      `, { replacements: detailReplacements });

      for (const d of detailRows) {
        const planNum = d.plan_number;
        if (!orderMap[planNum]) orderMap[planNum] = [];
        if (!orderMap[planNum].includes(d.production_order_number)) {
          orderMap[planNum].push(d.production_order_number);
        }
        if (!detailMap[planNum]) detailMap[planNum] = {};
        if (!detailMap[planNum][d.production_order_number]) {
          detailMap[planNum][d.production_order_number] = [];
        }
        detailMap[planNum][d.production_order_number].push(d);
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
      orders: orderMap,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
      summary: {
        total_plans: total,
        current_plans: items.length,
        total_material_cost: Math.round(summaryMaterialCost * 100) / 100,
        total_material_count: summaryMaterialCount,
        total_unpriced_count: totalUnpricedCount,
        cost_list_number: costListNumber
      }
    }, '获取计划单材料成本成功'));
  } catch (err) { next(err); }
};

// ==================== 汇总统计 ====================
export const getPlanMaterialCostSummary = async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const [summaryRows]: any = await sequelize.query(`
      SELECT
        COUNT(DISTINCT pp.production_number) as total_plans,
        SUM(s.material_cost) as total_material_cost,
        COUNT(*) as total_material_count,
        SUM(CASE WHEN s.has_cost = 0 THEN 1 ELSE 0 END) as total_unpriced_count,
        MIN(s.cost_list_number) as cost_list_number
      FROM Production_plan pp
      INNER JOIN production_order po ON po.production_number = pp.production_number
      INNER JOIN production_material_cost_snapshot s ON s.production_order_number = po.production_order_number
    `);

    const row = summaryRows[0] || {};
    const totalPlans = parseInt(row.total_plans) || 0;
    const totalMaterialCost = parseFloat(row.total_material_cost) || 0;
    const totalMaterialCount = parseInt(row.total_material_count) || 0;
    const totalUnpriced = parseInt(row.total_unpriced_count) || 0;

    res.json(success({
      total_plans: totalPlans,
      total_material_cost: Math.round(totalMaterialCost * 100) / 100,
      total_material_count: totalMaterialCount,
      total_unpriced_count: totalUnpriced,
      priced_rate: totalMaterialCount > 0
        ? Math.round((totalMaterialCount - totalUnpriced) / totalMaterialCount * 10000) / 100
        : 0,
      cost_list_number: row.cost_list_number || ''
    }, '获取计划单材料成本汇总成功'));
  } catch (err) { next(err); }
};

// ==================== 导出 ====================
export const exportPlanMaterialCost = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const search = (req.query.search as string) || '';
    const plan_status = (req.query.plan_status as string) || '';

    const conditions: string[] = [];
    const replacements: any = {};

    if (search) {
      conditions.push(`(pp.production_number LIKE :search OR pp.item_number LIKE :search OR pp.item_name LIKE :search)`);
      replacements.search = `%${search}%`;
    }
    if (plan_status) {
      conditions.push(`pp.plan_status = :plan_status`);
      replacements.plan_status = plan_status;
    }

    const whereClause = conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '';

    const [detailRows]: any = await sequelize.query(`
      SELECT pp.production_number as plan_number, pp.item_number, pp.item_name,
             pp.planned_quantity, pp.plan_status,
             po.production_order_number,
             s.preparation_number, s.issue_number,
             s.material_number, s.material_name, s.material_type, s.unit,
             s.issued_quantity, s.standard_cost, s.material_cost,
             s.has_cost, s.cost_list_number,
             s.step_number, s.work_center_name,
             s.source_type, s.source_number,
             CONVERT(VARCHAR(19), s.creation_date, 120) as snapshot_date
      FROM production_material_cost_snapshot s
      INNER JOIN production_order po ON po.production_order_number = s.production_order_number
      INNER JOIN Production_plan pp ON pp.production_number = po.production_number
      WHERE 1=1 ${whereClause}
      ORDER BY pp.production_number, po.production_order_number, s.preparation_number, s.step_number, s.material_number
    `, { replacements });

    const exportData = detailRows.map((d: any) => ({
      plan_number: d.plan_number,
      item_number: d.item_number,
      item_name: d.item_name,
      planned_quantity: d.planned_quantity,
      plan_status: d.plan_status,
      production_order_number: d.production_order_number,
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
      'plan_number', 'item_number', 'item_name', 'planned_quantity', 'plan_status',
      'production_order_number', 'preparation_number', 'issue_number',
      'material_number', 'material_name', 'material_type', 'unit',
      'issued_quantity', 'standard_cost', 'material_cost', 'cost_list_number',
      'step_number', 'work_center_name', 'source_type', 'snapshot_date'
    ];
    const headers = [
      '计划编号', '产品编号', '产品名称', '计划数量', '计划状态',
      '生产单编号', '备料单号', '领料单号',
      '物料编号', '物料名称', '物料类型', '单位',
      '领料数量', '标准成本单价', '材料成本', '成本表编号',
      '工序号', '工作中心', '来源类型', '快照时间'
    ];

    exportToExcel(exportData, fields, headers, 'plan_material_cost', res);
  } catch (err) { next(err); }
};
