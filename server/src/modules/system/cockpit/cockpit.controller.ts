import { Request, Response, NextFunction } from 'express';
import sequelize from '../../../config/database';
import { success } from '../../../utils/response.util';
import { getFactoryId } from '../../../utils/factoryWhere.util';

// ==================== 管理驾驶舱：工厂级概览（支持多工厂数据隔离） ====================
export const getCockpitOverview = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const _factoryId = getFactoryId(req);
    const factoryCond = _factoryId ? `AND factory_id = :_factoryId` : '';
    const factoryCondH = _factoryId ? `AND h.factory_id = :_factoryId` : '';
    const factoryCondPo = _factoryId ? `AND po.factory_id = :_factoryId` : '';

    const dateFrom = (req.query.dateFrom as string) || '';
    const dateTo = (req.query.dateTo as string) || '';

    const dateCondition = dateFrom && dateTo
      ? `BETWEEN :dateFrom AND :dateTo`
      : dateFrom
        ? `>= :dateFrom`
        : dateTo
          ? `<= :dateTo`
          : `>= DATEADD(MONTH, -12, GETDATE())`;

    const dateConditionOrders = dateFrom && dateTo
      ? `BETWEEN :dateFrom AND :dateTo`
      : dateFrom
        ? `>= :dateFrom`
        : dateTo
          ? `<= :dateTo`
          : `>= DATEADD(MONTH, -12, GETDATE())`;

    const replacements: any = {};
    if (dateFrom) replacements.dateFrom = dateFrom;
    if (dateTo) replacements.dateTo = dateTo;
    if (_factoryId) replacements._factoryId = _factoryId;

    // ========== 1. KPI ==========

    // 销售订单总额
    const [salesKpi]: any = await sequelize.query(
      `SELECT ISNULL(SUM(CAST(d.total_amount AS decimal(18,2))), 0) as sales_amount
       FROM sales_order_detail d
       INNER JOIN sales_order h ON h.sales_order_number = d.sales_order_number
       WHERE h.approval_status = N'已审批'
         AND h.order_date ${dateConditionOrders}
         ${factoryCondH}`,
      { replacements }
    );

    // 采购订单总额
    const [purchaseKpi]: any = await sequelize.query(
      `SELECT ISNULL(SUM(CAST(d.total_amount AS decimal(18,2))), 0) as purchase_amount
       FROM purchase_order_detail d
       INNER JOIN purchase_order h ON h.purchase_order_number = d.purchase_order_number
       WHERE h.approval_status = N'已审批'
         AND h.order_date ${dateConditionOrders}
         ${factoryCondH}`,
      { replacements }
    );

    // 生产单完成率
    const [productionKpi]: any = await sequelize.query(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN plan_status = N'已完成' THEN 1 ELSE 0 END) as completed
       FROM production_order
       WHERE approval_status = N'已审批'
         AND production_date ${dateCondition}
         ${factoryCond}`,
      { replacements }
    );
    const prodTotal = parseInt(productionKpi[0]?.total) || 0;
    const prodCompleted = parseInt(productionKpi[0]?.completed) || 0;
    const productionRate = prodTotal > 0 ? Math.round(prodCompleted / prodTotal * 10000) / 100 : 0;

    // 综合合格率
    const [qualityKpi]: any = await sequelize.query(
      `SELECT
         ISNULL(SUM(po.inbound_quantity), 0) as total_inbound,
         ISNULL(SUM(CASE WHEN wr.approval_status != N'草稿' THEN wr.unqualified_quantity ELSE 0 END), 0) as total_unqualified,
         ISNULL(SUM(CASE WHEN np.handling_method = N'让步接收' THEN np.concession_quantity ELSE 0 END), 0) as total_concession
       FROM production_order po
       LEFT JOIN work_report wr ON wr.production_order_number = po.production_order_number
       LEFT JOIN nonconforming_product np ON np.production_order_number = po.production_order_number
       WHERE po.approval_status = N'已审批'
         AND po.production_date ${dateCondition}
         ${factoryCondPo}`,
      { replacements }
    );
    const totalInbound = parseFloat(qualityKpi[0]?.total_inbound) || 0;
    const totalUnqualified = parseFloat(qualityKpi[0]?.total_unqualified) || 0;
    const totalConcession = parseFloat(qualityKpi[0]?.total_concession) || 0;
    const netUnqualified = totalUnqualified - totalConcession;
    const qualityRate = (totalInbound + netUnqualified) > 0
      ? Math.round(totalInbound / (totalInbound + netUnqualified) * 10000) / 100
      : 0;

    // 成品库存数量
    const [inventoryKpi]: any = await sequelize.query(
      `SELECT ISNULL(SUM(quantity), 0) as inventory_qty
       FROM finished_goods_inventory
       ${_factoryId ? 'WHERE factory_id = :_factoryId' : ''}`,
      { replacements }
    );
    const inventoryValue = parseFloat(inventoryKpi[0]?.inventory_qty) || 0;

    // 设备OEE
    const [oeeKpi]: any = await sequelize.query(
      `SELECT TOP 1 ISNULL(AVG(CAST(oee_rate AS decimal(5,2))), 0) as avg_oee
       FROM equipment_oee
       WHERE record_date >= DATEADD(MONTH, -12, GETDATE())
       ${factoryCond}`,
      { replacements }
    );
    const avgOee = parseFloat(oeeKpi[0]?.avg_oee) || 0;

    const kpi = {
      sales_amount: parseFloat(salesKpi[0]?.sales_amount) || 0,
      purchase_amount: parseFloat(purchaseKpi[0]?.purchase_amount) || 0,
      production_rate: productionRate,
      quality_rate: qualityRate,
      inventory_value: inventoryValue,
      oee: avgOee
    };

    // ========== 2. 月度趋势 ==========

    const factoryCondSo = _factoryId ? `AND so.factory_id = :_factoryId` : '';
    const factoryCondPoTrend = _factoryId ? `AND po.factory_id = :_factoryId` : '';
    const factoryCondProd = _factoryId ? `AND factory_id = :_factoryId` : '';

    // 销售额 vs 采购额
    const [salesVsPurchase]: any = await sequelize.query(`
      SELECT m.month,
             ISNULL(s.amount, 0) as sales_amount,
             ISNULL(p.amount, 0) as purchase_amount
      FROM (
        SELECT CONVERT(varchar(7), DATEADD(MONTH, -n, GETDATE()), 120) as month
        FROM (SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
              UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11) nums
      ) m
      LEFT JOIN (
        SELECT CONVERT(varchar(7), CAST(order_date AS date), 120) as month,
               ISNULL(SUM(CAST(d.total_amount AS decimal(18,2))), 0) as amount
        FROM sales_order so
        LEFT JOIN sales_order_detail d ON so.sales_order_number = d.sales_order_number
        WHERE so.approval_status = N'已审批'
          AND CAST(order_date AS date) >= DATEADD(MONTH, -12, GETDATE())
          ${factoryCondSo}
        GROUP BY CONVERT(varchar(7), CAST(order_date AS date), 120)
      ) s ON m.month = s.month
      LEFT JOIN (
        SELECT CONVERT(varchar(7), CAST(order_date AS date), 120) as month,
               ISNULL(SUM(CAST(d.total_amount AS decimal(18,2))), 0) as amount
        FROM purchase_order po
        LEFT JOIN purchase_order_detail d ON po.purchase_order_number = d.purchase_order_number
        WHERE po.approval_status = N'已审批'
          AND CAST(order_date AS date) >= DATEADD(MONTH, -12, GETDATE())
          ${factoryCondPoTrend}
        GROUP BY CONVERT(varchar(7), CAST(order_date AS date), 120)
      ) p ON m.month = p.month
      ORDER BY m.month
    `, { replacements });

    // 生产产出趋势
    const [productionOutput]: any = await sequelize.query(`
      SELECT m.month,
             ISNULL(t.completed, 0) as completed_count,
             ISNULL(t.inbound_qty, 0) as inbound_qty
      FROM (
        SELECT CONVERT(varchar(7), DATEADD(MONTH, -n, GETDATE()), 120) as month
        FROM (SELECT 0 as n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5
              UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11) nums
      ) m
      LEFT JOIN (
        SELECT CONVERT(varchar(7), CAST(production_date AS date), 120) as month,
               SUM(CASE WHEN plan_status = N'已完成' THEN 1 ELSE 0 END) as completed,
               ISNULL(SUM(inbound_quantity), 0) as inbound_qty
        FROM production_order
        WHERE approval_status = N'已审批'
          AND CAST(production_date AS date) >= DATEADD(MONTH, -12, GETDATE())
          ${factoryCondProd}
        GROUP BY CONVERT(varchar(7), CAST(production_date AS date), 120)
      ) t ON m.month = t.month
      ORDER BY m.month
    `, { replacements });

    const monthlyTrend = {
      sales_vs_purchase: salesVsPurchase.map((r: any) => ({
        month: r.month,
        sales_amount: parseFloat(r.sales_amount) || 0,
        purchase_amount: parseFloat(r.purchase_amount) || 0
      })),
      production_output: productionOutput.map((r: any) => ({
        month: r.month,
        completed_count: parseInt(r.completed_count) || 0,
        inbound_qty: parseFloat(r.inbound_qty) || 0
      }))
    };

    // ========== 3. 业务分布 ==========

    const factoryCondSales = _factoryId ? `WHERE factory_id = :_factoryId` : '';
    const factoryCondProdDist = _factoryId ? `AND factory_id = :_factoryId` : '';
    const factoryCondNc = _factoryId ? `WHERE factory_id = :_factoryId` : '';

    // 销售订单状态分布
    const [salesStatus]: any = await sequelize.query(
      `SELECT approval_status, COUNT(*) as cnt FROM sales_order ${factoryCondSales} GROUP BY approval_status`,
      { replacements: _factoryId ? { _factoryId } : {} }
    );
    const salesStatusDist: Record<string, number> = {};
    salesStatus.forEach((r: any) => { salesStatusDist[r.approval_status || '未知'] = parseInt(r.cnt); });

    // 生产单阶段漏斗
    const [prodFunnel]: any = await sequelize.query(
      `SELECT plan_status as stage, COUNT(*) as cnt
       FROM production_order WHERE approval_status = N'已审批'
       ${factoryCondProdDist}
       GROUP BY plan_status`,
      { replacements: _factoryId ? { _factoryId } : {} }
    );

    // 不合格品处理分布
    const [ncHandling]: any = await sequelize.query(
      `SELECT ISNULL(handling_method, N'未处理') as method, COUNT(*) as cnt
       FROM nonconforming_product
       ${factoryCondNc}
       GROUP BY ISNULL(handling_method, N'未处理')`,
      { replacements: _factoryId ? { _factoryId } : {} }
    );
    const ncHandlingDist: Record<string, number> = {};
    ncHandling.forEach((r: any) => { ncHandlingDist[r.method] = parseInt(r.cnt); });

    const distribution = {
      sales_status: salesStatusDist,
      production_funnel: prodFunnel.map((r: any) => ({ stage: r.stage, count: parseInt(r.cnt) })),
      nc_handling: ncHandlingDist
    };

    // ========== 4. 排行 ==========

    // 客户销售额TOP10
    const [customerTop10]: any = await sequelize.query(
      `SELECT TOP 10 h.customer_name,
              ISNULL(SUM(CAST(d.total_amount AS decimal(18,2))), 0) as total_amount
       FROM sales_order h
       LEFT JOIN sales_order_detail d ON h.sales_order_number = d.sales_order_number
       WHERE h.customer_name IS NOT NULL AND h.customer_name <> ''
       ${factoryCondH}
       GROUP BY h.customer_name
       ORDER BY total_amount DESC`,
      { replacements: _factoryId ? { _factoryId } : {} }
    );

    // 供应商采购额TOP10
    const [supplierTop10]: any = await sequelize.query(
      `SELECT TOP 10 h.supplier_name,
              ISNULL(SUM(CAST(d.total_amount AS decimal(18,2))), 0) as total_amount
       FROM purchase_order h
       LEFT JOIN purchase_order_detail d ON h.purchase_order_number = d.purchase_order_number
       WHERE h.supplier_name IS NOT NULL AND h.supplier_name <> ''
       ${factoryCondH}
       GROUP BY h.supplier_name
       ORDER BY total_amount DESC`,
      { replacements: _factoryId ? { _factoryId } : {} }
    );

    const ranking = {
      customer_top10: customerTop10.map((r: any) => ({
        customer_name: r.customer_name,
        total_amount: parseFloat(r.total_amount) || 0
      })),
      supplier_top10: supplierTop10.map((r: any) => ({
        supplier_name: r.supplier_name,
        total_amount: parseFloat(r.total_amount) || 0
      }))
    };

    // ========== 5. 待审批汇总 ==========

    const fc = _factoryId ? `AND factory_id = :_factoryId` : '';
    const rep = _factoryId ? { _factoryId } : {};

    const [pendingSales]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM sales_order WHERE approval_status = N'待审批' ${fc}`, { replacements: rep });
    const [pendingPurchase]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM purchase_order WHERE approval_status = N'待审批' ${fc}`, { replacements: rep });
    const [pendingProduction]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM production_order WHERE approval_status = N'待审批' ${fc}`, { replacements: rep });
    const [pendingStockIn]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM stock_in WHERE approval_status = N'待审批' ${fc}`, { replacements: rep });
    const [pendingNc]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM nonconforming_product WHERE handling_status = N'待处理' ${fc}`, { replacements: rep });

    const pendingSummary = [
      { domain: '销售管理', doc_type: '销售订单', pending_count: parseInt(pendingSales[0]?.cnt) || 0 },
      { domain: '采购管理', doc_type: '采购订单', pending_count: parseInt(pendingPurchase[0]?.cnt) || 0 },
      { domain: '生产管理', doc_type: '生产单', pending_count: parseInt(pendingProduction[0]?.cnt) || 0 },
      { domain: '仓储管理', doc_type: '入库单', pending_count: parseInt(pendingStockIn[0]?.cnt) || 0 },
      { domain: '质量管理', doc_type: '不合格品', pending_count: parseInt(pendingNc[0]?.cnt) || 0 }
    ];

    res.json(success({
      kpi,
      monthly_trend: monthlyTrend,
      distribution,
      ranking,
      pending_summary: pendingSummary
    }));
  } catch (err) { next(err); }
};