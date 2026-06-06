import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../../../middleware/auth.middleware';
import { isHQRole } from '../../../middleware/factoryScope.middleware';
import sequelize from '../../../config/database';
import { success, error } from '../../../utils/response.util';

const router = Router();

// 所有总部报表路由都需要认证 + 总部角色
router.use(authenticate);
router.use((req: Request, res: Response, next: NextFunction) => {
  const user = req.user!;
  if (!isHQRole(user.role)) {
    return res.status(403).json(error('仅总部角色可访问', 403));
  }
  next();
});

// 数据范围层：按职能角色限定可访问的报表接口
const hqRoleScopeMap: Record<string, string[]> = {
  'admin': ['sales', 'production', 'purchase', 'inventory', 'finance', 'quality', 'inventory-flow'],
  'headquarters_admin': ['sales', 'production', 'purchase', 'inventory', 'finance', 'quality', 'inventory-flow'],
  'headquarters_manager': ['sales', 'production', 'purchase', 'inventory', 'finance', 'quality', 'inventory-flow'],
  'headquarters_finance': ['finance', 'inventory', 'inventory-flow'],
  'headquarters_quality': ['quality', 'production', 'inventory'],
  'headquarters_sales': ['sales', 'purchase', 'inventory', 'inventory-flow'],
};

function hqScopeGuard(reportType: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user!;
    const allowed = hqRoleScopeMap[user.role];
    if (!allowed || !allowed.includes(reportType)) {
      return res.status(403).json(error(`当前角色无权访问${reportType}报表`, 403));
    }
    next();
  };
}

// 通用：获取工厂列表
async function getFactoryList() {
  return await sequelize.query(
    `SELECT id, factory_code, factory_name, factory_short, status FROM factory ORDER BY id`,
    { type: 'SELECT' }
  );
}

// 通用：日期范围条件构建
function dateRangeCondition(dateFrom?: string, dateTo?: string, column: string = 'created_at'): string {
  let cond = '';
  if (dateFrom) cond += ` AND ${column} >= '${dateFrom}'`;
  if (dateTo) cond += ` AND ${column} <= '${dateTo}'`;
  return cond;
}

// 通用：按工厂映射数据
function mapByFactory<T extends Record<string, any>>(data: T[], key: string = 'factory_id'): Map<number, T> {
  const map = new Map<number, T>();
  for (const row of data) {
    map.set(Number(row[key]), row);
  }
  return map;
}

// 通用：汇总结构构建
function buildFactoryRows(factories: any[], dataMap: Map<number, any>, defaultValue: any = {}) {
  return factories.map((f: any) => ({
    factory: { id: f.id, factory_code: f.factory_code, factory_name: f.factory_name, factory_short: f.factory_short, status: f.status },
    ...dataMap.get(f.id) || defaultValue
  }));
}

/**
 * GET /api/v1/headquarters/overview
 * 总部仪表盘概览：各工厂关键指标汇总
 */
router.get('/overview', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factories: any = await getFactoryList();

    const salesStats: any = await sequelize.query(
      `SELECT h.factory_id, COUNT(DISTINCT h.sales_order_number) as order_count, ISNULL(SUM(CAST(d.total_amount AS DECIMAL(18,2))), 0) as total_amount
       FROM sales_order h
       INNER JOIN sales_order_detail d ON h.sales_order_number = d.sales_order_number
       WHERE h.creation_date >= DATEADD(DAY, -30, GETDATE())
       GROUP BY h.factory_id
       ORDER BY h.factory_id`,
      { type: 'SELECT' }
    );

    const purchaseStats: any = await sequelize.query(
      `SELECT h.factory_id, COUNT(DISTINCT h.purchase_order_number) as order_count, ISNULL(SUM(CAST(d.total_amount AS DECIMAL(18,2))), 0) as total_amount
       FROM purchase_order h
       INNER JOIN purchase_order_detail d ON h.purchase_order_number = d.purchase_order_number
       WHERE h.creation_date >= DATEADD(DAY, -30, GETDATE())
       GROUP BY h.factory_id
       ORDER BY h.factory_id`,
      { type: 'SELECT' }
    );

    const productionStats: any = await sequelize.query(
      `SELECT factory_id, COUNT(*) as order_count, COUNT(CASE WHEN plan_status IN (N'已完成',N'已入库') THEN 1 END) as completed
       FROM production_order
       WHERE plan_status NOT IN (N'已取消', N'已关闭')
       GROUP BY factory_id
       ORDER BY factory_id`,
      { type: 'SELECT' }
    );

    const inventoryStats: any = await sequelize.query(
      `SELECT factory_id, COUNT(*) as item_count, ISNULL(SUM(quantity), 0) as total_qty
       FROM material_batch_inventory
       WHERE quantity > 0
       GROUP BY factory_id
       ORDER BY factory_id`,
      { type: 'SELECT' }
    );

    const overview = factories.map((f: any) => {
      const sales = salesStats.find((s: any) => s.factory_id === f.id);
      const purchase = purchaseStats.find((p: any) => p.factory_id === f.id);
      const production = productionStats.find((p: any) => p.factory_id === f.id);
      const inventory = inventoryStats.find((i: any) => i.factory_id === f.id);

      return {
        factory: {
          id: f.id,
          factory_code: f.factory_code,
          factory_name: f.factory_name,
          factory_short: f.factory_short,
          status: f.status
        },
        sales_30d: {
          orders: sales?.order_count || 0,
          amount: sales?.total_amount || 0
        },
        purchase_30d: {
          orders: purchase?.order_count || 0,
          amount: purchase?.total_amount || 0
        },
        production_active: {
          total: production?.order_count || 0,
          completed: production?.completed || 0
        },
        inventory: {
          items: inventory?.item_count || 0,
          total_qty: inventory?.total_qty || 0
        }
      };
    });

    res.json(success({
      factories: overview,
      summary: {
        total_factories: factories.length,
        total_sales_amount: overview.reduce((sum: number, f: any) => sum + (f.sales_30d?.amount || 0), 0),
        total_purchase_amount: overview.reduce((sum: number, f: any) => sum + (f.purchase_30d?.amount || 0), 0),
        active_production_orders: overview.reduce((sum: number, f: any) => sum + (f.production_active?.total || 0), 0)
      }
    }, '总部概览获取成功'));
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/headquarters/sales-summary
 * 集团销售汇总表：各工厂按月份销售统计
 */
router.get('/sales-summary', hqScopeGuard('sales'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo } = req.query as any;
    const factories: any = await getFactoryList();
    const dateCond = dateRangeCondition(dateFrom, dateTo, 'order_date');

    // 各工厂销售汇总
    const salesStats: any = await sequelize.query(
      `SELECT h.factory_id, COUNT(DISTINCT h.sales_order_number) as order_count,
        ISNULL(SUM(CAST(d.total_amount AS DECIMAL(18,2))), 0) as total_amount,
        ISNULL(SUM(CASE WHEN h.order_status = N'已完成' THEN CAST(d.total_amount AS DECIMAL(18,2)) ELSE 0 END), 0) as completed_amount,
        COUNT(DISTINCT CASE WHEN h.order_status = N'已完成' THEN h.sales_order_number END) as completed_count,
        COUNT(DISTINCT CASE WHEN h.order_status IN (N'待执行',N'进行中') THEN h.sales_order_number END) as pending_count,
        COUNT(DISTINCT CASE WHEN h.order_status = N'已取消' THEN h.sales_order_number END) as cancelled_count
       FROM sales_order h
       INNER JOIN sales_order_detail d ON h.sales_order_number = d.sales_order_number
       WHERE 1=1${dateCond.replace(/order_date/g, 'h.order_date')}
       GROUP BY h.factory_id
       ORDER BY h.factory_id`,
      { type: 'SELECT' }
    );

    // 各工厂按月销售趋势
    const monthlyTrend: any = await sequelize.query(
      `SELECT h.factory_id, CONVERT(VARCHAR(7), h.order_date, 120) as month,
        COUNT(DISTINCT h.sales_order_number) as order_count, ISNULL(SUM(CAST(d.total_amount AS DECIMAL(18,2))), 0) as total_amount
       FROM sales_order h
       INNER JOIN sales_order_detail d ON h.sales_order_number = d.sales_order_number
       WHERE 1=1${dateCond.replace(/order_date/g, 'h.order_date')}
       GROUP BY h.factory_id, CONVERT(VARCHAR(7), h.order_date, 120)
       ORDER BY h.factory_id, month`,
      { type: 'SELECT' }
    );

    const dataMap = mapByFactory(salesStats);
    const factoryRows = buildFactoryRows(factories, dataMap, { order_count: 0, total_amount: 0, completed_amount: 0, completed_count: 0, pending_count: 0, cancelled_count: 0 });

    // 月度趋势按工厂分组
    const trendByFactory: Record<number, any[]> = {};
    for (const row of monthlyTrend) {
      const fid = Number(row.factory_id);
      if (!trendByFactory[fid]) trendByFactory[fid] = [];
      trendByFactory[fid].push({ month: row.month, order_count: row.order_count, total_amount: row.total_amount });
    }

    res.json(success({
      factories: factoryRows.map(r => ({ ...r, monthly_trend: trendByFactory[r.factory.id] || [] })),
      summary: {
        total_orders: factoryRows.reduce((s, r) => s + r.order_count, 0),
        total_amount: factoryRows.reduce((s, r) => s + r.total_amount, 0),
        completed_amount: factoryRows.reduce((s, r) => s + r.completed_amount, 0),
        pending_count: factoryRows.reduce((s, r) => s + r.pending_count, 0),
        cancelled_count: factoryRows.reduce((s, r) => s + r.cancelled_count, 0)
      }
    }, '集团销售汇总获取成功'));
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/headquarters/production-summary
 * 集团生产汇总表：各工厂按状态生产统计
 */
router.get('/production-summary', hqScopeGuard('production'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo } = req.query as any;
    const factories: any = await getFactoryList();
    const dateCond = dateRangeCondition(dateFrom, dateTo, 'production_date');
    const prodStats: any = await sequelize.query(
      `SELECT factory_id, COUNT(*) as total_orders,
        COUNT(CASE WHEN completion_status = N'已完成' THEN 1 END) as completed_count,
        COUNT(CASE WHEN inbound_status = N'已入库' THEN 1 END) as inbound_count,
        COUNT(CASE WHEN plan_status IN (N'待排产',N'已排产',N'进行中',N'暂停') THEN 1 END) as in_progress_count,
        COUNT(CASE WHEN plan_status = N'已取消' THEN 1 END) as cancelled_count,
        ISNULL(SUM(CAST(planned_quantity AS DECIMAL(18,4))), 0) as total_planned_qty,
        ISNULL(SUM(CAST(inbound_quantity AS DECIMAL(18,4))), 0) as total_inbound_qty
       FROM production_order
       WHERE 1=1${dateCond}
       GROUP BY factory_id
       ORDER BY factory_id`,
      { type: 'SELECT' }
    );

    // 各工厂按月生产趋势
    const monthlyTrend: any = await sequelize.query(
      `SELECT factory_id, CONVERT(VARCHAR(7), production_date, 120) as month,
        COUNT(*) as order_count,
        ISNULL(SUM(CAST(planned_quantity AS DECIMAL(18,4))), 0) as planned_qty,
        ISNULL(SUM(CAST(inbound_quantity AS DECIMAL(18,4))), 0) as completed_qty
       FROM production_order
       WHERE 1=1${dateCond}
       GROUP BY factory_id, CONVERT(VARCHAR(7), production_date, 120)
       ORDER BY factory_id, month`,
      { type: 'SELECT' }
    );

    const dataMap = mapByFactory(prodStats);
    const factoryRows = buildFactoryRows(factories, dataMap, { total_orders: 0, completed_count: 0, inbound_count: 0, in_progress_count: 0, cancelled_count: 0, total_planned_qty: 0, total_inbound_qty: 0 });

    const trendByFactory: Record<number, any[]> = {};
    for (const row of monthlyTrend) {
      const fid = Number(row.factory_id);
      if (!trendByFactory[fid]) trendByFactory[fid] = [];
      trendByFactory[fid].push({ month: row.month, order_count: row.order_count, planned_qty: row.planned_qty, completed_qty: row.completed_qty });
    }

    res.json(success({
      factories: factoryRows.map(r => ({ ...r, monthly_trend: trendByFactory[r.factory.id] || [] })),
      summary: {
        total_orders: factoryRows.reduce((s, r) => s + r.total_orders, 0),
        completed_count: factoryRows.reduce((s, r) => s + r.completed_count, 0),
        in_progress_count: factoryRows.reduce((s, r) => s + r.in_progress_count, 0),
        total_planned_qty: factoryRows.reduce((s, r) => s + r.total_planned_qty, 0),
        total_inbound_qty: factoryRows.reduce((s, r) => s + r.total_inbound_qty, 0),
        completion_rate: factoryRows.reduce((s, r) => s + r.total_orders, 0) > 0
          ? (factoryRows.reduce((s, r) => s + r.completed_count, 0) / factoryRows.reduce((s, r) => s + r.total_orders, 0) * 100).toFixed(1) + '%' : '0%'
      }
    }, '集团生产汇总获取成功'));
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/headquarters/purchase-summary
 * 团采购汇总表：各工厂按月份采购统计
 */
router.get('/purchase-summary', hqScopeGuard('purchase'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo } = req.query as any;
    const factories: any = await getFactoryList();
    const dateCond = dateRangeCondition(dateFrom, dateTo, 'order_date');

    // 各工厂采购汇总
    const purchaseStats: any = await sequelize.query(
      `SELECT factory_id, COUNT(*) as order_count,
        ISNULL(SUM(CAST(total_amount AS DECIMAL(18,2))), 0) as total_amount,
        COUNT(CASE WHEN order_status = N'已完成' THEN 1 END) as completed_count,
        COUNT(CASE WHEN order_status IN (N'待执行',N'部分到货') THEN 1 END) as pending_count,
        ISNULL(SUM(CASE WHEN order_status = N'已完成' THEN CAST(total_amount AS DECIMAL(18,2)) ELSE 0 END), 0) as completed_amount
       FROM purchase_order
       WHERE 1=1${dateCond}
       GROUP BY factory_id
       ORDER BY factory_id`,
      { type: 'SELECT' }
    );

    // 各工厂按月采购趋势
    const monthlyTrend: any = await sequelize.query(
      `SELECT factory_id, CONVERT(VARCHAR(7), order_date, 120) as month,
        COUNT(*) as order_count, ISNULL(SUM(CAST(total_amount AS DECIMAL(18,2))), 0) as total_amount
       FROM purchase_order
       WHERE 1=1${dateCond}
       GROUP BY factory_id, CONVERT(VARCHAR(7), order_date, 120)
       ORDER BY factory_id, month`,
      { type: 'SELECT' }
    );

    const dataMap = mapByFactory(purchaseStats);
    const factoryRows = buildFactoryRows(factories, dataMap, { order_count: 0, total_amount: 0, completed_count: 0, pending_count: 0, completed_amount: 0 });

    const trendByFactory: Record<number, any[]> = {};
    for (const row of monthlyTrend) {
      const fid = Number(row.factory_id);
      if (!trendByFactory[fid]) trendByFactory[fid] = [];
      trendByFactory[fid].push({ month: row.month, order_count: row.order_count, total_amount: row.total_amount });
    }

    res.json(success({
      factories: factoryRows.map(r => ({ ...r, monthly_trend: trendByFactory[r.factory.id] || [] })),
      summary: {
        total_orders: factoryRows.reduce((s, r) => s + r.order_count, 0),
        total_amount: factoryRows.reduce((s, r) => s + r.total_amount, 0),
        completed_amount: factoryRows.reduce((s, r) => s + r.completed_amount, 0),
        pending_count: factoryRows.reduce((s, r) => s + r.pending_count, 0)
      }
    }, '集团采购汇总获取成功'));
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/headquarters/inventory-summary
 * 团库存汇总表：各工厂按仓库类型库存统计
 */
router.get('/inventory-summary', hqScopeGuard('inventory'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const factories: any = await getFactoryList();

    // 各工厂原材料批次库存汇总
    const materialStats: any = await sequelize.query(
      `SELECT factory_id, COUNT(*) as batch_count,
        ISNULL(SUM(quantity), 0) as total_qty,
        ISNULL(SUM(CAST(initial_quantity AS DECIMAL(18,4))), 0) as total_initial_qty
       FROM material_batch_inventory
       WHERE quantity > 0
       GROUP BY factory_id
       ORDER BY factory_id`,
      { type: 'SELECT' }
    );

    // 各工厂成品批次库存汇总
    const finishedStats: any = await sequelize.query(
      `SELECT factory_id, COUNT(*) as batch_count,
        ISNULL(SUM(quantity), 0) as total_qty,
        ISNULL(SUM(CAST(initial_quantity AS DECIMAL(18,4))), 0) as total_initial_qty
       FROM finished_batch_inventory
       WHERE quantity > 0
       GROUP BY factory_id
       ORDER BY factory_id`,
      { type: 'SELECT' }
    );

    // 各工厂按仓库类型的原材料库存
    const materialByWarehouse: any = await sequelize.query(
      `SELECT m.factory_id, w.warehouse_type,
        COUNT(*) as batch_count, ISNULL(SUM(m.quantity), 0) as total_qty
       FROM material_batch_inventory m
       INNER JOIN warehouse w ON m.warehouse_number = w.warehouse_number
       WHERE m.quantity > 0
       GROUP BY m.factory_id, w.warehouse_type
       ORDER BY m.factory_id, w.warehouse_type`,
      { type: 'SELECT' }
    );

    const matMap = mapByFactory(materialStats);
    const finMap = mapByFactory(finishedStats);
    const factoryRows = buildFactoryRows(factories, matMap, { batch_count: 0, total_qty: 0, total_initial_qty: 0 });

    // 组装结果
    const result = factoryRows.map(r => {
      const fin = finMap.get(r.factory.id) || { batch_count: 0, total_qty: 0, total_initial_qty: 0 };
      const warehouseTypes = materialByWarehouse
        .filter((m: any) => Number(m.factory_id) === r.factory.id)
        .map((m: any) => ({ warehouse_type: m.warehouse_type, batch_count: m.batch_count, total_qty: m.total_qty }));
      return {
        ...r,
        material: { batch_count: r.batch_count, total_qty: r.total_qty },
        finished: { batch_count: fin.batch_count, total_qty: fin.total_qty },
        by_warehouse_type: warehouseTypes
      };
    });

    res.json(success({
      factories: result,
      summary: {
        total_material_batches: result.reduce((s, r) => s + r.material.batch_count, 0),
        total_material_qty: result.reduce((s, r) => s + r.material.total_qty, 0),
        total_finished_batches: result.reduce((s, r) => s + r.finished.batch_count, 0),
        total_finished_qty: result.reduce((s, r) => s + r.finished.total_qty, 0)
      }
    }, '集团库存汇总获取成功'));
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/headquarters/finance-summary
 * 团财务汇总表：各工厂销售额/采购额/计件工资汇总
 */
router.get('/finance-summary', hqScopeGuard('finance'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo } = req.query as any;
    const factories: any = await getFactoryList();
    const dateCondSales = dateRangeCondition(dateFrom, dateTo, 'order_date');
    const dateCondPurchase = dateRangeCondition(dateFrom, dateTo, 'order_date');
    const dateCondWage = dateRangeCondition(dateFrom, dateTo, 'creation_date');

    // 各工厂销售额
    const salesRevenue: any = await sequelize.query(
      `SELECT h.factory_id, ISNULL(SUM(CAST(d.total_amount AS DECIMAL(18,2))), 0) as total_amount,
        COUNT(DISTINCT h.sales_order_number) as order_count
       FROM sales_order h
       INNER JOIN sales_order_detail d ON h.sales_order_number = d.sales_order_number
       WHERE 1=1${dateCondSales.replace(/order_date/g, 'h.order_date')}
       GROUP BY h.factory_id ORDER BY h.factory_id`,
      { type: 'SELECT' }
    );

    // 各工厂采购额
    const purchaseCost: any = await sequelize.query(
      `SELECT factory_id, ISNULL(SUM(CAST(total_amount AS DECIMAL(18,2))), 0) as total_amount,
        COUNT(*) as order_count
       FROM purchase_order WHERE 1=1${dateCondPurchase}
       GROUP BY factory_id ORDER BY factory_id`,
      { type: 'SELECT' }
    );

    // 各工厂计件工资（通过 production_order JOIN）
    const wageStats: any = await sequelize.query(
      `SELECT po.factory_id, ISNULL(SUM(CAST(ph.total_wage AS DECIMAL(18,2))), 0) as total_wage,
        COUNT(DISTINCT pwd.wage_number) as wage_count
       FROM piece_rate_wage_detail pwd
       INNER JOIN production_order po ON pwd.production_order_number = po.production_order_number
       INNER JOIN piece_rate_wage_header ph ON pwd.wage_number = ph.wage_number
       WHERE ph.approval_status = N'已审批'${dateCondWage.replace(/creation_date/g, 'ph.creation_date')}
       GROUP BY po.factory_id ORDER BY po.factory_id`,
      { type: 'SELECT' }
    );

    const salesMap = mapByFactory(salesRevenue);
    const purchaseMap = mapByFactory(purchaseCost);
    const wageMap = mapByFactory(wageStats);

    const result = factories.map((f: any) => {
      const sales = salesMap.get(f.id) || { total_amount: 0, order_count: 0 };
      const purchase = purchaseMap.get(f.id) || { total_amount: 0, order_count: 0 };
      const wage = wageMap.get(f.id) || { total_wage: 0, wage_count: 0 };
      return {
        factory: { id: f.id, factory_code: f.factory_code, factory_name: f.factory_name, factory_short: f.factory_short, status: f.status },
        sales_amount: sales.total_amount,
        sales_order_count: sales.order_count,
        purchase_amount: purchase.total_amount,
        purchase_order_count: purchase.order_count,
        piece_rate_wage: wage.total_wage,
        wage_count: wage.wage_count,
        gross_margin: sales.total_amount - purchase.total_amount - wage.total_wage
      };
    });

    res.json(success({
      factories: result,
      summary: {
        total_sales_amount: result.reduce((s: number, r: any) => s + r.sales_amount, 0),
        total_purchase_amount: result.reduce((s: number, r: any) => s + r.purchase_amount, 0),
        total_piece_rate_wage: result.reduce((s: number, r: any) => s + r.piece_rate_wage, 0),
        total_gross_margin: result.reduce((s: number, r: any) => s + r.gross_margin, 0)
      }
    }, '集团财务汇总获取成功'));
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/headquarters/quality-summary
 * 团质量汇总表：各工厂检验合格率/不良品统计
 */
router.get('/quality-summary', hqScopeGuard('quality'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo } = req.query as any;
    const factories: any = await getFactoryList();
    const dateCond = dateRangeCondition(dateFrom, dateTo, 'pi.creation_date');

    // 各工厂检验统计（通过 production_order JOIN 获取 factory_id）
    const inspectionStats: any = await sequelize.query(
      `SELECT po.factory_id,
        COUNT(*) as inspection_count,
        ISNULL(SUM(CAST(pi.total_quantity AS DECIMAL(18,4))), 0) as total_inspected_qty,
        ISNULL(SUM(CAST(pi.qualified_quantity AS DECIMAL(18,4))), 0) as total_qualified_qty,
        ISNULL(SUM(CAST(pi.unqualified_quantity AS DECIMAL(18,4))), 0) as total_unqualified_qty,
        COUNT(CASE WHEN pi.inspection_result = N'合格' THEN 1 END) as qualified_count,
        COUNT(CASE WHEN pi.inspection_result = N'不合格' THEN 1 END) as unqualified_count,
        COUNT(CASE WHEN pi.inspection_result = N'待检' THEN 1 END) as pending_count
       FROM production_inspection pi
       INNER JOIN production_order po ON pi.production_order_number = po.production_order_number
       WHERE 1=1${dateCond}
       GROUP BY po.factory_id
       ORDER BY po.factory_id`,
      { type: 'SELECT' }
    );

    // 各工厂不良品统计
    const nonconformingStats: any = await sequelize.query(
      `SELECT po.factory_id,
        COUNT(*) as nc_count,
        ISNULL(SUM(CAST(nc.unqualified_quantity AS DECIMAL(18,4))), 0) as total_nc_qty,
        COUNT(CASE WHEN nc.handling_status = N'待处理' THEN 1 END) as pending_handling,
        COUNT(CASE WHEN nc.handling_status = N'已处理' THEN 1 END) as handled_count,
        COUNT(CASE WHEN nc.handling_method = N'返工' THEN 1 END) as rework_count,
        COUNT(CASE WHEN nc.handling_method = N'报废' THEN 1 END) as scrap_count,
        COUNT(CASE WHEN nc.handling_method = N'让步接收' THEN 1 END) as concession_count
       FROM nonconforming_product nc
       INNER JOIN production_order po ON nc.production_order_number = po.production_order_number
       WHERE 1=1${dateCond.replace(/pi\.creation_date/g, 'nc.creation_date')}
       GROUP BY po.factory_id
       ORDER BY po.factory_id`,
      { type: 'SELECT' }
    );

    const inspMap = mapByFactory(inspectionStats);
    const ncMap = mapByFactory(nonconformingStats);

    const result = factories.map((f: any) => {
      const insp = inspMap.get(f.id) || { inspection_count: 0, total_inspected_qty: 0, total_qualified_qty: 0, total_unqualified_qty: 0, qualified_count: 0, unqualified_count: 0, pending_count: 0 };
      const nc = ncMap.get(f.id) || { nc_count: 0, total_nc_qty: 0, pending_handling: 0, handled_count: 0, rework_count: 0, scrap_count: 0, concession_count: 0 };
      const qualifiedRate = insp.total_inspected_qty > 0
        ? (insp.total_qualified_qty / insp.total_inspected_qty * 100).toFixed(1) + '%' : '0%';
      return {
        factory: { id: f.id, factory_code: f.factory_code, factory_name: f.factory_name, factory_short: f.factory_short, status: f.status },
        inspection: insp,
        qualified_rate: qualifiedRate,
        nonconforming: nc
      };
    });

    const totalInspected = result.reduce((s: number, r: any) => s + r.inspection.total_inspected_qty, 0);
    const totalQualified = result.reduce((s: number, r: any) => s + r.inspection.total_qualified_qty, 0);

    res.json(success({
      factories: result,
      summary: {
        total_inspection_count: result.reduce((s: number, r: any) => s + r.inspection.inspection_count, 0),
        total_inspected_qty: totalInspected,
        total_qualified_qty: totalQualified,
        total_unqualified_qty: result.reduce((s: number, r: any) => s + r.inspection.total_unqualified_qty, 0),
        overall_qualified_rate: totalInspected > 0
          ? (totalQualified / totalInspected * 100).toFixed(1) + '%' : '0%',
        total_nc_count: result.reduce((s: number, r: any) => s + r.nonconforming.nc_count, 0)
      }
    }, '集团质量汇总获取成功'));
  } catch (err) { next(err); }
});

/**
 * GET /api/v1/headquarters/inventory-flow
 * 团出入库流水总表：各工厂按日期+类型出入库流水汇总
 */
router.get('/inventory-flow', hqScopeGuard('inventory-flow'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { dateFrom, dateTo } = req.query as any;
    const factories: any = await getFactoryList();
    const dateCondMat = dateRangeCondition(dateFrom, dateTo, 'mit.creation_date');
    const dateCondFin = dateRangeCondition(dateFrom, dateTo, 'it.creation_date');
    const dateCondLs = dateRangeCondition(dateFrom, dateTo, 'lit.operation_date');

    // 原材料出入库流水（JOIN warehouse 获取 factory_id）
    const matFlow: any = await sequelize.query(
      `SELECT mbi.factory_id, mit.transaction_type,
        COUNT(*) as transaction_count,
        ISNULL(SUM(CAST(mit.quantity AS DECIMAL(18,4))), 0) as total_qty
       FROM material_inventory_transaction mit
       INNER JOIN material_batch_inventory mbi ON mit.batch_number = mbi.batch_number
       WHERE 1=1${dateCondMat}
       GROUP BY mbi.factory_id, mit.transaction_type
       ORDER BY mbi.factory_id, mit.transaction_type`,
      { type: 'SELECT' }
    );

    // 成品出入库流水（JOIN finished_batch_inventory 获取 factory_id）
    const finFlow: any = await sequelize.query(
      `SELECT fbi.factory_id, it.transaction_type,
        COUNT(*) as transaction_count,
        ISNULL(SUM(CAST(it.quantity AS DECIMAL(18,4))), 0) as total_qty
       FROM inventory_transaction it
       INNER JOIN finished_batch_inventory fbi ON it.batch_number = fbi.batch_number
       WHERE 1=1${dateCondFin}
       GROUP BY fbi.factory_id, it.transaction_type
       ORDER BY fbi.factory_id, it.transaction_type`,
      { type: 'SELECT' }
    );

    // 线边出入库流水（JOIN production_order 获取 factory_id）
    const lsFlow: any = await sequelize.query(
      `SELECT po.factory_id, lit.transaction_type,
        COUNT(*) as transaction_count,
        ISNULL(SUM(CAST(lit.quantity AS DECIMAL(18,4))), 0) as total_qty
       FROM lineside_inventory_transaction lit
       INNER JOIN production_order po ON lit.production_order_number = po.production_order_number
       WHERE 1=1${dateCondLs}
       GROUP BY po.factory_id, lit.transaction_type
       ORDER BY po.factory_id, lit.transaction_type`,
      { type: 'SELECT' }
    );

    // 按工厂+类型汇总
    const result = factories.map((f: any) => {
      const matByType = matFlow.filter((m: any) => Number(m.factory_id) === f.id)
        .map((m: any) => ({ transaction_type: m.transaction_type, transaction_count: m.transaction_count, total_qty: m.total_qty, category: '原材料' }));
      const finByType = finFlow.filter((m: any) => Number(m.factory_id) === f.id)
        .map((m: any) => ({ transaction_type: m.transaction_type, transaction_count: m.transaction_count, total_qty: m.total_qty, category: '成品' }));
      const lsByType = lsFlow.filter((m: any) => Number(m.factory_id) === f.id)
        .map((m: any) => ({ transaction_type: m.transaction_type, transaction_count: m.transaction_count, total_qty: m.total_qty, category: '线边' }));
      const allFlows = [...matByType, ...finByType, ...lsByType];
      const inboundQty = allFlows.filter((fl: any) => fl.transaction_type === '入库' || fl.transaction_type === '入线边').reduce((sum: number, fl: any) => sum + fl.total_qty, 0);
      const outboundQty = allFlows.filter((fl: any) => fl.transaction_type === '出库' || fl.transaction_type === '出线边').reduce((sum: number, fl: any) => sum + fl.total_qty, 0);
      return {
        factory: { id: f.id, factory_code: f.factory_code, factory_name: f.factory_name, factory_short: f.factory_short, status: f.status },
        flows: allFlows,
        inbound_total: inboundQty,
        outbound_total: outboundQty
      };
    });

    res.json(success({
      factories: result,
      summary: {
        total_inbound: result.reduce((s: number, r: any) => s + r.inbound_total, 0),
        total_outbound: result.reduce((s: number, r: any) => s + r.outbound_total, 0),
        total_transactions: result.reduce((s: number, r: any) => s + r.flows.reduce((ss: number, f: any) => ss + f.transaction_count, 0), 0)
      }
    }, '集团出入库流水汇总获取成功'));
  } catch (err) { next(err); }
});

export default router;
