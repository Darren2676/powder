import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { getFactoryId } from '../../../utils/factoryWhere.util';

/**
 * 获取单个生产单的完整质量报告
 * GET /api/quality-report/production/:production_order_number
 */
export const getProductionQualityReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { production_order_number } = req.params;
    const _factoryId = getFactoryId(req);

    // 1. 获取生产单基本信息
    const [orderRows]: any = await sequelize.query(`
      SELECT
        po.production_order_number,
        po.production_number,
        po.item_number,
        po.item_name,
        po.specifications,
        po.product_drawing_number,
        po.rubber_compound_number,
        po.basic_unit,
        po.planned_quantity,
        po.equipment_number,
        po.equipment_name,
        po.mould_number,
        po.production_date,
        po.schedule_id,
        po.planned_completion_time,
        po.plan_status,
        po.remark,
        po.yield_rate,
        po.inbound_quantity
      FROM production_order po
      WHERE po.production_order_number = :production_order_number${_factoryId !== null ? ' AND po.factory_id = :_factoryId' : ''}
    `, { replacements: { production_order_number, ...(_factoryId !== null ? { _factoryId: _factoryId } : {}) } });

    if (!orderRows.length) {
      res.status(404).json({ success: false, message: '生产单不存在' });
      return;
    }

    const order = orderRows[0];

    // 2. 获取工序任务列表
    const [processRows]: any = await sequelize.query(`
      SELECT
        pt.process_task_number,
        pt.step_number,
        pt.standard_process_name,
        pt.work_center_number,
        pt.work_center_name,
        pt.planned_quantity,
        pt.completed_quantity,
        pt.task_status
      FROM process_task pt
      WHERE pt.production_order_number = :production_order_number
      ORDER BY pt.step_number ASC
    `, { replacements: { production_order_number } });

    // 3. 获取报工记录明细
    const [reportRows]: any = await sequelize.query(`
      SELECT
        wr.work_report_number,
        wr.process_task_number,
        wr.step_number,
        wr.standard_process_name,
        wr.work_center_name,
        wr.planned_quantity,
        wr.qualified_quantity,
        wr.unqualified_quantity,
        wr.total_quantity,
        wr.cumulative_quantity,
        wr.report_date,
        wr.schedules_name,
        wr.team_name,
        wr.operator_name,
        wr.defect_class_name,
        wr.defect_name,
        wr.unqualified_reason,
        wr.approval_status,
        wr.actual_start_time,
        wr.actual_end_time,
        wr.actual_hours
      FROM work_report wr
      WHERE wr.production_order_number = :production_order_number
      ORDER BY wr.step_number ASC, wr.report_date ASC
    `, { replacements: { production_order_number } });

    // 4. 按工序汇总质量数据
    const [processSummary]: any = await sequelize.query(`
      SELECT
        pt.step_number,
        pt.standard_process_name,
        pt.work_center_name,
        pt.planned_quantity,
        pt.completed_quantity,
        ISNULL(SUM(wr.qualified_quantity), 0) AS total_qualified,
        ISNULL(SUM(wr.unqualified_quantity), 0) AS total_unqualified,
        ISNULL(SUM(wr.total_quantity), 0) AS total_reported,
        CASE WHEN ISNULL(SUM(wr.total_quantity), 0) > 0
             THEN CAST(SUM(wr.qualified_quantity) * 100.0 / SUM(wr.total_quantity) AS DECIMAL(5,2))
             ELSE 100 END AS pass_rate
      FROM process_task pt
      LEFT JOIN work_report wr ON wr.process_task_number = pt.process_task_number
      WHERE pt.production_order_number = :production_order_number
      GROUP BY pt.step_number, pt.standard_process_name, pt.work_center_name,
               pt.planned_quantity, pt.completed_quantity
      ORDER BY pt.step_number ASC
    `, { replacements: { production_order_number } });

    // 5. 缺陷分析
    const [defectAnalysis]: any = await sequelize.query(`
      SELECT
        wr.defect_class_name,
        wr.defect_name,
        wr.standard_process_name,
        wr.step_number,
        COUNT(*) AS occurrence_count,
        SUM(wr.unqualified_quantity) AS total_defect_qty
      FROM work_report wr
      WHERE wr.production_order_number = :production_order_number
        AND wr.unqualified_quantity > 0
        AND wr.defect_name IS NOT NULL
        AND wr.defect_name <> ''
      GROUP BY wr.defect_class_name, wr.defect_name, wr.standard_process_name, wr.step_number
      ORDER BY total_defect_qty DESC
    `, { replacements: { production_order_number } });

    // 6. 计算质量指标汇总
    const totalProcesses = processSummary.length;
    const totalReported = processSummary.reduce((s: number, r: any) => s + (parseFloat(r.total_reported) || 0), 0);
    const totalQualified = processSummary.reduce((s: number, r: any) => s + (parseFloat(r.total_qualified) || 0), 0);
    const totalUnqualified = processSummary.reduce((s: number, r: any) => s + (parseFloat(r.total_unqualified) || 0), 0);
    const zeroDefectCount = processSummary.filter((r: any) => parseFloat(r.total_unqualified) === 0).length;
    const overallPassRate = totalReported > 0 ? parseFloat((totalQualified * 100.0 / totalReported).toFixed(2)) : 100;
    const processPassRate = totalProcesses > 0 ? parseFloat((zeroDefectCount * 100.0 / totalProcesses).toFixed(1)) : 100;

    const kpiSummary = {
      total_processes: totalProcesses,
      total_reported: totalReported,
      total_qualified: totalQualified,
      total_unqualified: totalUnqualified,
      overall_pass_rate: overallPassRate,
      zero_defect_count: zeroDefectCount,
      defect_process_count: totalProcesses - zeroDefectCount,
      process_pass_rate: processPassRate,
      planned_quantity: parseFloat(order.planned_quantity) || 0,
      inbound_quantity: parseFloat(order.inbound_quantity) || 0,
      yield_rate: order.yield_rate !== null && order.yield_rate !== undefined ? parseFloat(order.yield_rate) : null
    };

    res.json(success({
      order,
      processes: processRows,
      work_reports: reportRows,
      process_summary: processSummary,
      defect_analysis: defectAnalysis,
      kpi_summary: kpiSummary
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * 质量汇总统计 - 按产品/时间维度
 * GET /api/quality-report/summary
 */
export const getQualitySummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const offsetEnd = offset + limit;

    const { start_date, end_date, item_number, search } = req.query;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      whereClause += ` AND po.factory_id = :_factoryId`;
      replacements._factoryId = effectiveFactoryId;
    }

    if (start_date) {
      whereClause += ` AND po.production_date >= :start_date`;
      replacements.start_date = start_date;
    }
    if (end_date) {
      whereClause += ` AND po.production_date <= :end_date`;
      replacements.end_date = end_date;
    }
    if (item_number) {
      whereClause += ` AND po.item_number = :item_number`;
      replacements.item_number = item_number;
    }
    if (search) {
      whereClause += ` AND (po.production_order_number LIKE :search OR po.item_number LIKE :search OR po.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    // 计数
    const [countResult]: any = await sequelize.query(`
      SELECT COUNT(DISTINCT po.production_order_number) as total
      FROM production_order po
      INNER JOIN work_report wr ON wr.production_order_number = po.production_order_number
      ${whereClause}
    `, { replacements });

    // 分页查询 - 按生产单汇总
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT
          po.production_order_number,
          po.item_number,
          po.item_name,
          po.specifications,
          po.basic_unit,
          po.planned_quantity,
          po.production_date,
          po.equipment_name,
          po.plan_status,
          po.yield_rate,
          f.factory_short,
          COUNT(DISTINCT wr.step_number) AS process_count,
          SUM(wr.qualified_quantity) AS total_qualified,
          SUM(wr.unqualified_quantity) AS total_unqualified,
          SUM(wr.total_quantity) AS total_reported,
          CASE WHEN SUM(wr.total_quantity) > 0
               THEN CAST(SUM(wr.qualified_quantity) * 100.0 / SUM(wr.total_quantity) AS DECIMAL(5,2))
               ELSE 100 END AS overall_pass_rate,
          SUM(CASE WHEN wr.unqualified_quantity > 0 THEN 1 ELSE 0 END) AS defect_report_count,
          po.inbound_quantity,
          ROW_NUMBER() OVER (ORDER BY po.production_date DESC, po.production_order_number DESC) AS _row_num
        FROM production_order po
        INNER JOIN work_report wr ON wr.production_order_number = po.production_order_number
        LEFT JOIN factory f ON po.factory_id = f.id
        ${whereClause}
        GROUP BY po.production_order_number, po.item_number, po.item_name, po.specifications,
                 po.basic_unit, po.planned_quantity, po.production_date, po.equipment_name, po.plan_status,
                 po.yield_rate, po.inbound_quantity, f.factory_short
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    // 汇总统计卡片数据
    const [overallStats]: any = await sequelize.query(`
      SELECT
        COUNT(DISTINCT po.production_order_number) AS total_orders,
        ISNULL(SUM(wr.total_quantity), 0) AS total_reported,
        ISNULL(SUM(wr.qualified_quantity), 0) AS total_qualified,
        ISNULL(SUM(wr.unqualified_quantity), 0) AS total_unqualified,
        CASE WHEN ISNULL(SUM(wr.total_quantity), 0) > 0
             THEN CAST(SUM(wr.qualified_quantity) * 100.0 / SUM(wr.total_quantity) AS DECIMAL(5,2))
             ELSE 100 END AS overall_pass_rate,
        COUNT(DISTINCT CASE WHEN wr.unqualified_quantity > 0 THEN wr.step_number END) AS defect_process_count
      FROM production_order po
      INNER JOIN work_report wr ON wr.production_order_number = po.production_order_number
      ${whereClause}
    `, { replacements });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page,
      limit,
      stats: overallStats[0] || {}
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * 生产单质量透视报表 - 行=生产单, 列=缺陷分类(动态)
 * GET /api/quality/quality-report/production-order-pivot
 *
 * 公式:
 *   不合格小计(净) = SUM(work_report.unqualified_quantity) - SUM(nonconforming_product.concession_quantity WHERE handling_method='让步接收')
 *   合格率 = inbound_quantity / (inbound_quantity + 净不合格小计) * 100%
 */
export const getProductionOrderQualityPivot = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const offsetEnd = offset + limit;

    const { start_date, end_date, item_number, search, plan_status } = req.query;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };

    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      whereClause += ' AND po.factory_id = :_factoryId';
      replacements._factoryId = effectiveFactoryId;
    }

    if (start_date) {
      whereClause += ' AND po.production_date >= :start_date';
      replacements.start_date = start_date;
    }
    if (end_date) {
      whereClause += ' AND po.production_date <= :end_date';
      replacements.end_date = end_date;
    }
    if (item_number) {
      whereClause += ' AND po.item_number = :item_number';
      replacements.item_number = item_number;
    }
    if (plan_status) {
      whereClause += ' AND po.plan_status = :plan_status';
      replacements.plan_status = plan_status;
    }
    if (search) {
      whereClause += ' AND (po.production_order_number LIKE :search OR po.item_number LIKE :search OR po.item_name LIKE :search)';
      replacements.search = `%${search}%`;
    }

    // ① 分页查询生产单基础数据
    const [orderRows]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT
          po.production_order_number, po.item_number, po.item_name, po.specifications,
          po.basic_unit, po.planned_quantity, po.inbound_quantity, po.yield_rate,
          po.production_date, po.plan_status, po.equipment_name, f.factory_short,
          ROW_NUMBER() OVER (ORDER BY po.production_date DESC, po.production_order_number DESC) AS _row_num
        FROM production_order po
        LEFT JOIN factory f ON po.factory_id = f.id
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    // 总数统计
    const [countResult]: any = await sequelize.query(`
      SELECT COUNT(*) AS total FROM production_order po ${whereClause}
    `, { replacements });

    const orderNumbers: string[] = orderRows.map((r: any) => r.production_order_number);

    // ② 缺陷透视聚合 (按 production_order_number x defect_class_name)
    let defectRows: any[] = [];
    if (orderNumbers.length > 0) {
      const [rows]: any = await sequelize.query(`
        SELECT
          production_order_number,
          ISNULL(NULLIF(defect_class_name, ''), N'未分类') AS defect_class_name,
          SUM(unqualified_quantity) AS qty
        FROM work_report
        WHERE unqualified_quantity > 0
          AND production_order_number IN (:orderNumbers)
        GROUP BY production_order_number, ISNULL(NULLIF(defect_class_name, ''), N'未分类')
      `, { replacements: { orderNumbers } });
      defectRows = rows;
    }

    // ③ 让步接收回写
    let concessionRows: any[] = [];
    if (orderNumbers.length > 0) {
      const [rows]: any = await sequelize.query(`
        SELECT
          production_order_number,
          ISNULL(SUM(concession_quantity), 0) AS concession_qty
        FROM nonconforming_product
        WHERE handling_method = N'让步接收'
          AND production_order_number IN (:orderNumbers)
        GROUP BY production_order_number
      `, { replacements: { orderNumbers } });
      concessionRows = rows;
    }

    // ==== Node 内合并组装 ====

    // 让步接收 map
    const concessionMap: Record<string, number> = {};
    for (const r of concessionRows) {
      concessionMap[r.production_order_number] = parseFloat(r.concession_qty) || 0;
    }

    // 缺陷分类汇总 (用于动态列与排序)
    const classTotalMap: Record<string, number> = {};
    // production_order_number -> { defect_class_name -> qty }
    const orderDefectMap: Record<string, Record<string, number>> = {};
    for (const r of defectRows) {
      const pon = r.production_order_number;
      const cls = r.defect_class_name;
      const qty = parseFloat(r.qty) || 0;
      if (!orderDefectMap[pon]) orderDefectMap[pon] = {};
      orderDefectMap[pon][cls] = (orderDefectMap[pon][cls] || 0) + qty;
      classTotalMap[cls] = (classTotalMap[cls] || 0) + qty;
    }

    // 动态列: 按全表合计降序, 截断前20个, 其余汇入"其他"
    const MAX_PIVOT_COLS = 20;
    const sortedClasses = Object.entries(classTotalMap).sort((a, b) => b[1] - a[1]);
    const topClasses = sortedClasses.slice(0, MAX_PIVOT_COLS);
    const restClasses = sortedClasses.slice(MAX_PIVOT_COLS);
    const restClassNames = new Set(restClasses.map(([n]) => n));
    const hasRest = restClasses.length > 0;

    const pivot_columns: Array<{ defect_class_name: string; total_qty: number }> = topClasses.map(([n, q]) => ({
      defect_class_name: n,
      total_qty: Math.round(q * 10000) / 10000
    }));
    if (hasRest) {
      const restTotal = restClasses.reduce((s, [, q]) => s + q, 0);
      pivot_columns.push({ defect_class_name: '其他', total_qty: Math.round(restTotal * 10000) / 10000 });
    }

    // 组装 rows
    const rows: any[] = orderRows.map((o: any) => {
      const pon = o.production_order_number;
      const inbound = parseFloat(o.inbound_quantity) || 0;
      const planned = parseFloat(o.planned_quantity) || 0;
      const concession = concessionMap[pon] || 0;

      // 该生产单的缺陷分类分布
      const orderClasses = orderDefectMap[pon] || {};
      const defect_classes: Record<string, number> = {};
      let totalUnqualified = 0;
      let restSum = 0;
      for (const [cls, qty] of Object.entries(orderClasses)) {
        totalUnqualified += qty;
        if (restClassNames.has(cls)) {
          restSum += qty;
        } else {
          defect_classes[cls] = Math.round(qty * 10000) / 10000;
        }
      }
      if (hasRest && restSum > 0) {
        defect_classes['其他'] = Math.round(restSum * 10000) / 10000;
      }

      // 净不合格 = 总不合格 - 让步接收, 夹紧到 0
      const netUnqualified = Math.max(0, totalUnqualified - concession);

      // 合格率 = inbound / (inbound + netUnqualified)
      let yieldRate: number | null = null;
      const denominator = inbound + netUnqualified;
      if (denominator > 0) {
        yieldRate = Math.round(inbound * 10000 / denominator) / 100;
      }

      return {
        production_order_number: pon,
        item_number: o.item_number,
        item_name: o.item_name,
        specifications: o.specifications,
        basic_unit: o.basic_unit,
        planned_quantity: planned,
        inbound_quantity: inbound,
        production_date: o.production_date,
        plan_status: o.plan_status,
        equipment_name: o.equipment_name,
        factory_short: o.factory_short,
        total_unqualified: Math.round(totalUnqualified * 10000) / 10000,
        concession_quantity: Math.round(concession * 10000) / 10000,
        net_unqualified: Math.round(netUnqualified * 10000) / 10000,
        yield_rate: yieldRate,
        defect_classes
      };
    });

    // 整体汇总 stats (跨当前查询条件全表, 不仅当前页)
    const [overallStats]: any = await sequelize.query(`
      SELECT
        (SELECT COUNT(*) FROM production_order po ${whereClause}) AS total_orders,
        (SELECT ISNULL(SUM(po.inbound_quantity), 0) FROM production_order po ${whereClause}) AS total_inbound,
        (SELECT ISNULL(SUM(wr.unqualified_quantity), 0)
           FROM work_report wr
           WHERE wr.production_order_number IN (
             SELECT po.production_order_number FROM production_order po ${whereClause}
           )) AS total_unqualified,
        (SELECT ISNULL(SUM(np.concession_quantity), 0)
           FROM nonconforming_product np
           WHERE np.handling_method = N'让步接收'
             AND np.production_order_number IN (
               SELECT po.production_order_number FROM production_order po ${whereClause}
             )) AS total_concession
    `, { replacements });

    const s = overallStats[0] || {};
    const totalInbound = parseFloat(s.total_inbound) || 0;
    const totalUnqualified = parseFloat(s.total_unqualified) || 0;
    const totalConcession = parseFloat(s.total_concession) || 0;
    const totalNetUnqualified = Math.max(0, totalUnqualified - totalConcession);
    let overallYieldRate: number | null = null;
    const denom = totalInbound + totalNetUnqualified;
    if (denom > 0) {
      overallYieldRate = Math.round(totalInbound * 10000 / denom) / 100;
    }

    res.json(success({
      pivot_columns,
      rows,
      pagination: {
        total: countResult[0]?.total || 0,
        page,
        limit
      },
      stats: {
        total_orders: parseInt(s.total_orders) || 0,
        total_inbound: totalInbound,
        total_unqualified: totalUnqualified,
        total_concession: totalConcession,
        total_net_unqualified: totalNetUnqualified,
        overall_yield_rate: overallYieldRate
      }
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * 缺陷分析统计
 * GET /api/quality-report/defect-analysis
 */
export const getDefectAnalysis = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start_date, end_date, item_number, defect_class_name } = req.query;

    let whereClause = 'WHERE wr.unqualified_quantity > 0';
    const replacements: any = {};
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      whereClause += ` AND wr.factory_id = :_factoryId`;
      replacements._factoryId = effectiveFactoryId;
    }

    if (start_date) {
      whereClause += ` AND wr.report_date >= :start_date`;
      replacements.start_date = start_date;
    }
    if (end_date) {
      whereClause += ` AND wr.report_date <= :end_date`;
      replacements.end_date = end_date;
    }
    if (item_number) {
      whereClause += ` AND wr.item_number = :item_number`;
      replacements.item_number = item_number;
    }
    if (defect_class_name) {
      whereClause += ` AND wr.defect_class_name = :defect_class_name`;
      replacements.defect_class_name = defect_class_name;
    }

    // 按缺陷分类汇总
    const [byClass]: any = await sequelize.query(`
      SELECT
        wr.defect_class_name,
        COUNT(*) AS occurrence_count,
        SUM(wr.unqualified_quantity) AS total_defect_qty
      FROM work_report wr
      ${whereClause}
        AND wr.defect_class_name IS NOT NULL AND wr.defect_class_name <> ''
      GROUP BY wr.defect_class_name
      ORDER BY total_defect_qty DESC
    `, { replacements });

    // 按缺陷名称细分
    const [byDefect]: any = await sequelize.query(`
      SELECT
        wr.defect_class_name,
        wr.defect_name,
        COUNT(*) AS occurrence_count,
        SUM(wr.unqualified_quantity) AS total_defect_qty
      FROM work_report wr
      ${whereClause}
        AND wr.defect_name IS NOT NULL AND wr.defect_name <> ''
      GROUP BY wr.defect_class_name, wr.defect_name
      ORDER BY total_defect_qty DESC
    `, { replacements });

    // 按工序缺陷分布
    const [byProcess]: any = await sequelize.query(`
      SELECT
        wr.standard_process_name,
        wr.step_number,
        COUNT(*) AS occurrence_count,
        SUM(wr.unqualified_quantity) AS total_defect_qty,
        SUM(wr.total_quantity) AS total_reported,
        CASE WHEN SUM(wr.total_quantity) > 0
             THEN CAST(SUM(wr.unqualified_quantity) * 100.0 / SUM(wr.total_quantity) AS DECIMAL(5,2))
             ELSE 0 END AS defect_rate
      FROM work_report wr
      ${whereClause}
      GROUP BY wr.standard_process_name, wr.step_number
      ORDER BY total_defect_qty DESC
    `, { replacements });

    // 按产品缺陷分布
    const [byProduct]: any = await sequelize.query(`
      SELECT
        wr.item_number,
        wr.item_name,
        COUNT(*) AS occurrence_count,
        SUM(wr.unqualified_quantity) AS total_defect_qty
      FROM work_report wr
      ${whereClause}
      GROUP BY wr.item_number, wr.item_name
      ORDER BY total_defect_qty DESC
    `, { replacements });

    res.json(success({
      by_class: byClass,
      by_defect: byDefect,
      by_process: byProcess,
      by_product: byProduct
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * 工序质量排名
 * GET /api/quality-report/process-quality
 */
export const getProcessQuality = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { start_date, end_date, standard_process_name } = req.query;

    let whereClause = 'WHERE 1=1';
    const replacements: any = {};
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      whereClause += ` AND wr.factory_id = :_factoryId`;
      replacements._factoryId = effectiveFactoryId;
    }

    if (start_date) {
      whereClause += ` AND wr.report_date >= :start_date`;
      replacements.start_date = start_date;
    }
    if (end_date) {
      whereClause += ` AND wr.report_date <= :end_date`;
      replacements.end_date = end_date;
    }
    if (standard_process_name) {
      whereClause += ` AND wr.standard_process_name = :standard_process_name`;
      replacements.standard_process_name = standard_process_name;
    }

    // 工序质量排名
    const [processRanking]: any = await sequelize.query(`
      SELECT
        wr.standard_process_name,
        wr.work_center_name,
        COUNT(DISTINCT wr.production_order_number) AS order_count,
        SUM(wr.qualified_quantity) AS total_qualified,
        SUM(wr.unqualified_quantity) AS total_unqualified,
        SUM(wr.total_quantity) AS total_reported,
        CASE WHEN SUM(wr.total_quantity) > 0
             THEN CAST(SUM(wr.qualified_quantity) * 100.0 / SUM(wr.total_quantity) AS DECIMAL(5,2))
             ELSE 100 END AS pass_rate,
        CASE WHEN SUM(wr.total_quantity) > 0
             THEN CAST(SUM(wr.unqualified_quantity) * 100.0 / SUM(wr.total_quantity) AS DECIMAL(5,2))
             ELSE 0 END AS defect_rate
      FROM work_report wr
      ${whereClause}
      GROUP BY wr.standard_process_name, wr.work_center_name
      ORDER BY pass_rate ASC
    `, { replacements });

    // 班组质量排名
    const [groupRanking]: any = await sequelize.query(`
      SELECT
        wr.team_name,
        COUNT(DISTINCT wr.production_order_number) AS order_count,
        SUM(wr.qualified_quantity) AS total_qualified,
        SUM(wr.unqualified_quantity) AS total_unqualified,
        SUM(wr.total_quantity) AS total_reported,
        CASE WHEN SUM(wr.total_quantity) > 0
             THEN CAST(SUM(wr.qualified_quantity) * 100.0 / SUM(wr.total_quantity) AS DECIMAL(5,2))
             ELSE 100 END AS pass_rate
      FROM work_report wr
      ${whereClause}
        AND wr.team_name IS NOT NULL AND wr.team_name <> ''
      GROUP BY wr.team_name
      ORDER BY pass_rate ASC
    `, { replacements });

    // 操作员质量排名
    const [operatorRanking]: any = await sequelize.query(`
      SELECT
        wr.operator_name,
        COUNT(DISTINCT wr.production_order_number) AS order_count,
        SUM(wr.qualified_quantity) AS total_qualified,
        SUM(wr.unqualified_quantity) AS total_unqualified,
        SUM(wr.total_quantity) AS total_reported,
        CASE WHEN SUM(wr.total_quantity) > 0
             THEN CAST(SUM(wr.qualified_quantity) * 100.0 / SUM(wr.total_quantity) AS DECIMAL(5,2))
             ELSE 100 END AS pass_rate
      FROM work_report wr
      ${whereClause}
        AND wr.operator_name IS NOT NULL AND wr.operator_name <> ''
      GROUP BY wr.operator_name
      ORDER BY pass_rate ASC
    `, { replacements });

    res.json(success({
      process_ranking: processRanking,
      group_ranking: groupRanking,
      operator_ranking: operatorRanking
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * 按产品生产质量汇总报告
 * GET /api/quality-report/product-summary
 */
export const getProductQualitySummary = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const offsetEnd = offset + limit;

    const { start_date, end_date, search } = req.query;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      whereClause += ` AND wr.factory_id = :_factoryId`;
      replacements._factoryId = effectiveFactoryId;
    }

    if (start_date) {
      whereClause += ` AND wr.report_date >= :start_date`;
      replacements.start_date = start_date;
    }
    if (end_date) {
      whereClause += ` AND wr.report_date <= :end_date`;
      replacements.end_date = end_date;
    }
    if (search) {
      whereClause += ` AND (wr.item_number LIKE :search OR wr.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    // 计数（按产品去重）
    const [countResult]: any = await sequelize.query(`
      SELECT COUNT(*) as total FROM (
        SELECT wr.item_number
        FROM work_report wr
        ${whereClause}
        GROUP BY wr.item_number
      ) AS cnt
    `, { replacements });

    // 按产品汇总 - 分页
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT
          wr.item_number,
          MAX(wr.item_name) AS item_name,
          MAX(wr.specifications) AS specifications,
          MAX(wr.basic_unit) AS basic_unit,
          COUNT(DISTINCT wr.production_order_number) AS order_count,
          COUNT(DISTINCT wr.work_report_number) AS report_count,
          SUM(wr.qualified_quantity) AS total_qualified,
          SUM(wr.unqualified_quantity) AS total_unqualified,
          SUM(wr.total_quantity) AS total_reported,
          CASE WHEN SUM(wr.total_quantity) > 0
               THEN CAST(SUM(wr.qualified_quantity) * 100.0 / SUM(wr.total_quantity) AS DECIMAL(5,2))
               ELSE 100 END AS overall_pass_rate,
          SUM(CASE WHEN wr.unqualified_quantity > 0 THEN 1 ELSE 0 END) AS defect_report_count,
          ROW_NUMBER() OVER (ORDER BY
            CASE WHEN SUM(wr.total_quantity) > 0
                 THEN CAST(SUM(wr.qualified_quantity) * 100.0 / SUM(wr.total_quantity) AS DECIMAL(5,2))
                 ELSE 100 END ASC,
            SUM(wr.unqualified_quantity) DESC
          ) AS _row_num
        FROM work_report wr
        ${whereClause}
        GROUP BY wr.item_number
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    // 整体统计卡片
    const [overallStats]: any = await sequelize.query(`
      SELECT
        COUNT(DISTINCT wr.item_number) AS total_products,
        COUNT(DISTINCT wr.production_order_number) AS total_orders,
        ISNULL(SUM(wr.total_quantity), 0) AS total_reported,
        ISNULL(SUM(wr.qualified_quantity), 0) AS total_qualified,
        ISNULL(SUM(wr.unqualified_quantity), 0) AS total_unqualified,
        CASE WHEN ISNULL(SUM(wr.total_quantity), 0) > 0
             THEN CAST(SUM(wr.qualified_quantity) * 100.0 / SUM(wr.total_quantity) AS DECIMAL(5,2))
             ELSE 100 END AS overall_pass_rate
      FROM work_report wr
      ${whereClause}
    `, { replacements });

    // 获取所有产品的缺陷分类明细
    const [defectDetails]: any = await sequelize.query(`
      SELECT
        wr.item_number,
        wr.defect_class_name,
        wr.defect_name,
        wr.standard_process_name,
        COUNT(*) AS occurrence_count,
        SUM(wr.unqualified_quantity) AS defect_qty
      FROM work_report wr
      ${whereClause}
        AND wr.unqualified_quantity > 0
        AND wr.defect_name IS NOT NULL AND wr.defect_name <> ''
      GROUP BY wr.item_number, wr.defect_class_name, wr.defect_name, wr.standard_process_name
      ORDER BY wr.item_number, defect_qty DESC
    `, { replacements });

    // 将缺陷明细按产品分组
    const defectMap: Record<string, any[]> = {};
    for (const d of defectDetails) {
      if (!defectMap[d.item_number]) defectMap[d.item_number] = [];
      defectMap[d.item_number].push(d);
    }

    // 附加缺陷明细到每个产品
    for (const item of items) {
      item.defect_details = defectMap[item.item_number] || [];
    }

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page,
      limit,
      stats: overallStats[0] || {},
      all_defect_details: defectDetails
    }));
  } catch (err) {
    next(err);
  }
};

/**
 * 综合合格率报表 - 按生产单维度
 * GET /api/quality-report/yield-rate
 */
export const getYieldRateReport = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const offsetEnd = offset + limit;

    const { start_date, end_date, item_number, search, plan_status } = req.query;

    let whereClause = 'WHERE 1=1';
    const replacements: any = { offset, offsetEnd };
    const _factoryId = getFactoryId(req);
    const queryFactoryId = req.query.factory_id ? parseInt(req.query.factory_id as string) : null;
    const effectiveFactoryId = _factoryId !== null ? _factoryId : queryFactoryId;
    if (effectiveFactoryId !== null) {
      whereClause += ` AND po.factory_id = :_factoryId`;
      replacements._factoryId = effectiveFactoryId;
    }

    if (start_date) {
      whereClause += ` AND po.production_date >= :start_date`;
      replacements.start_date = start_date;
    }
    if (end_date) {
      whereClause += ` AND po.production_date <= :end_date`;
      replacements.end_date = end_date;
    }
    if (item_number) {
      whereClause += ` AND po.item_number = :item_number`;
      replacements.item_number = item_number;
    }
    if (plan_status) {
      whereClause += ` AND po.plan_status = :plan_status`;
      replacements.plan_status = plan_status;
    }
    if (search) {
      whereClause += ` AND (po.production_order_number LIKE :search OR po.item_number LIKE :search OR po.item_name LIKE :search)`;
      replacements.search = `%${search}%`;
    }

    // 计数
    const [countResult]: any = await sequelize.query(`
      SELECT COUNT(*) as total FROM production_order po ${whereClause}
    `, { replacements });

    // 分页查询
    const [items]: any = await sequelize.query(`
      SELECT * FROM (
        SELECT
          po.production_order_number,
          po.item_number,
          po.item_name,
          po.specifications,
          po.basic_unit,
          po.planned_quantity,
          po.inbound_quantity,
          po.production_date,
          po.plan_status,
          po.yield_rate,
          f.factory_short,
          ISNULL(wr_agg.total_unqualified, 0) AS total_unqualified,
          CASE
            WHEN po.inbound_quantity IS NOT NULL AND (po.inbound_quantity + ISNULL(wr_agg.total_unqualified, 0)) > 0
            THEN CAST(po.inbound_quantity * 100.0 / (po.inbound_quantity + ISNULL(wr_agg.total_unqualified, 0)) AS DECIMAL(5,2))
            ELSE NULL
          END AS yield_rate_calc,
          ROW_NUMBER() OVER (ORDER BY
            CASE WHEN po.yield_rate IS NOT NULL THEN 1 ELSE 0 END,
            po.yield_rate ASC,
            po.production_date DESC
          ) AS _row_num
        FROM production_order po
        LEFT JOIN factory f ON po.factory_id = f.id
        LEFT JOIN (
          SELECT production_order_number, SUM(unqualified_quantity) AS total_unqualified
          FROM work_report
          GROUP BY production_order_number
        ) wr_agg ON wr_agg.production_order_number = po.production_order_number
        ${whereClause}
      ) AS t WHERE t._row_num > :offset AND t._row_num <= :offsetEnd
    `, { replacements });

    // 汇总统计
    const [overallStats]: any = await sequelize.query(`
      SELECT
        COUNT(*) AS total_orders,
        ISNULL(SUM(po.inbound_quantity), 0) AS total_inbound,
        ISNULL(SUM(wr_agg.total_unqualified), 0) AS total_unqualified,
        CASE WHEN ISNULL(SUM(po.inbound_quantity), 0) + ISNULL(SUM(wr_agg.total_unqualified), 0) > 0
             THEN CAST(ISNULL(SUM(po.inbound_quantity), 0) * 100.0 / (ISNULL(SUM(po.inbound_quantity), 0) + ISNULL(SUM(wr_agg.total_unqualified), 0)) AS DECIMAL(5,2))
             ELSE NULL END AS overall_yield_rate,
        COUNT(CASE WHEN po.yield_rate IS NOT NULL THEN 1 END) AS calculated_count,
        COUNT(CASE WHEN po.yield_rate IS NULL THEN 1 END) AS pending_count
      FROM production_order po
      LEFT JOIN (
        SELECT production_order_number, SUM(unqualified_quantity) AS total_unqualified
        FROM work_report
        GROUP BY production_order_number
      ) wr_agg ON wr_agg.production_order_number = po.production_order_number
      ${whereClause}
    `, { replacements });

    res.json(success({
      items,
      total: countResult[0]?.total || 0,
      page,
      limit,
      stats: overallStats[0] || {}
    }));
  } catch (err) {
    next(err);
  }
};