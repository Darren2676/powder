import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { usePermissionStore } from '@/store/permission';

// ── 按业务域导入路由 ──
import { systemRoutes } from './system';
import { masterDataRoutes } from './master-data';
import { salesRoutes } from './sales';
import { planningRoutes } from './planning';
import { productionRoutes } from './production';
import { warehouseRoutes } from './warehouse';
import { purchasingRoutes } from './purchasing';
import { qualityRoutes } from './quality';
import { financeRoutes } from './finance';
import { integrationRoutes } from './integration';
import { equipmentRoutes } from './equipment';
import { scoreRoutes } from './score';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/system/Auth/Login.vue'),
    meta: { requiresAuth: false, guestOnly: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/system/Auth/Register.vue'),
    meta: { requiresAuth: false, guestOnly: true }
  },
  {
    path: '/',
    component: () => import('@/components/Layout/AppLayout.vue'),
    meta: { requiresAuth: true },
    children: [
      {
        path: '',
        name: 'Dashboard',
        component: () => import('@/views/system/Cockpit/Index.vue'),
        meta: { title: '管理驾驶舱' }
      },
      ...systemRoutes,
      ...masterDataRoutes,
      ...salesRoutes,
      ...planningRoutes,
      ...productionRoutes,
      ...warehouseRoutes,
      ...purchasingRoutes,
      ...qualityRoutes,
      ...financeRoutes,
      ...integrationRoutes,
      ...equipmentRoutes,
      ...scoreRoutes,
    ]
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

// 路由权限code映射到菜单key
const routePermissionMap: Record<string, string> = {
  'UserManagement': 'users',
  'RoleList': 'system',
  'DepartmentList': 'departments',
  'WorkflowList': 'workflow',
  'WorkflowDesigner': 'workflow',
  'SalesOrderList': 'sales-orders',
  'ForecastList': 'forecasts',
  'PendingShipmentList': 'pending-shipments',
  'ShippingRequestList': 'shipping-requests',
  'ShippingOrderList': 'shipping-orders-list',
  'ReturnOrderList': 'return-orders',
  'SalesReport': 'sales-report',
  'ShippingWarning': 'shipping-warning',
  'OverdueShipping': 'overdue-shipping',
  'ShippingByOrderSummary': 'shipping-by-order-summary',
  'OrderProductionSummary': 'order-production-summary',
  'SalesDashboard': 'sales-order-dashboard',
  'SampleRequestList': 'sample-requests',
  'SampleRequestCreate': 'sample-request-create',
  'SalesPersonShippingReport': 'sales-person-shipping-report',
  'MpsReport': 'mps-report',
  'PlanList': 'plans',
  'PlanMaterialCost': 'plan-material-cost',
  'MrpPage': 'mrp',
  'OrderList': 'orders',
  'GanttView': 'gantt',
  'ProcessTaskList': 'process-tasks',
  'MaterialPreparationList': 'material-preparations',
  'MaterialIssueList': 'material-issue',
  'BackflushTaskList': 'backflush-tasks',
  'WorkReportList': 'work-reports',
  'OutsourcingReqList': 'outsourcing-reqs',
  'OutsourcingOrderList': 'outsourcing-orders',
  'OutsourcingIssueList': 'outsourcing-issue',
  'OutsourcingReceiptList': 'outsourcing-receipt',
  'OutsourcingInspectionList': 'outsourcing-inspection',
  'OutsourcingPriceList': 'outsourcing-prices',
  'FgInventoryQuery': 'fg-inventory-query',
  'FgInboundList': 'fg-inbound',
  'FgOutboundList': 'fg-outbound',
  'MwInventory': 'mw-inventory',
  'MwInboundList': 'mw-inbound',
  'MwOutboundList': 'mw-outbound',
  'PurchaseReqList': 'purchase-reqs',
  'PurchaseOrderList': 'purchase-orders',
  'PurchaseOrderDetails': 'purchase-order-details',
  'StockInList': 'stock-ins',
  'BatchTraceList': 'batch-trace',
  'QualityReportList': 'quality-report',
  'PurchaseInspectionList': 'purchase-inspection',
  'SalesPriceList': 'sales-prices',
  'PurchasePriceList': 'purchase-prices',
  'PieceRatePriceList': 'piece-rate-prices',
  'PieceRateWageList': 'piece-rate-wages',
  'ProductionMaterialCost': 'production-material-cost',
  'StandardCostList': 'standard-costs',
  'AccountingPeriodList': 'accounting-periods',
  'EquipmentList': 'equipments',
  'MouldList': 'moulds',
  'MouldMaintenanceList': 'mould-maintenance',
  'EquipmentDowntimeList': 'equipment-downtime',
  'EquipmentMaintenancePlanList': 'equipment-maintenance-plan',
  'EquipmentOeeDashboard': 'equipment-oee',
  'ItemMasterList': 'item-masters',
  'BomList': 'boms',
  'CostBomIndex': 'cost-bom',
  'ProcedureList': 'procedures',
  'WorkCenterList': 'work-centers',
  'RoutingMasterList': 'routing-masters',
  'ProcessParameterList': 'process-parameters',
  'PlasticPowderParameterList': 'plastic-powder-parameters',
  'PlasticProcessCategoryList': 'plastic-process-categories',
  'CustomerList': 'customers',
  'SupplierList': 'suppliers',
  'EmployeeList': 'employees',
  'ApiKeyList': 'api-keys',
  'ScrapOrderReport': 'scrap-order-report',
  'ScrapInventoryReport': 'scrap-inventory-report',
  'ScrapDisposalReport': 'scrap-disposal-report',
  'ScrapQualityStatsReport': 'scrap-quality-stats-report',
  'ScrapInboundOrderList': 'scrap-inbound-orders',
  'ScrapInventoryList': 'scrap-inventory',
  'ScrapTransactionList': 'scrap-transactions',
  'PurchaseReturnList': 'purchase-returns',
  'PurchaseInvoiceList': 'purchase-invoices',
  'HefeiUniversity2025': 'hefei-university-2025',
};

// Navigation guard
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  const permStore = usePermissionStore();
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth !== false);
  const guestOnly = to.matched.some(record => record.meta.guestOnly);

  if (requiresAuth && !authStore.isLoggedIn) {
    const { message } = await import('ant-design-vue');
    message.warning('请先登录');
    next({ name: 'Login', query: { redirect: to.fullPath } });
    return;
  }

  if (guestOnly && authStore.isLoggedIn) {
    next({ name: 'Dashboard' });
    return;
  }

  // 基于RBAC的权限校验
  if (requiresAuth && authStore.isLoggedIn) {
    // 如果权限未加载，尝试从服务器获取
    if (!permStore.loaded) {
      await permStore.fetchPermissions();
    }

    // 检查路由权限
    const routeName = to.name as string;
    const permCode = to.meta?.permissionCode as string || routePermissionMap[routeName];

    if (permCode && !permStore.isAdmin) {
      // 非admin用户需要检查权限
      if (!permStore.hasPermission(permCode) && !permStore.hasMenuKey(permCode)) {
        const { message } = await import('ant-design-vue');
        message.error('没有权限访问该页面');
        next({ name: 'Dashboard' });
        return;
      }
    }

    // 兼容旧的requiresAdmin meta
    const requiresAdmin = to.matched.some(record => record.meta.requiresAdmin);
    if (requiresAdmin && !permStore.isAdmin) {
      const { message } = await import('ant-design-vue');
      message.error('没有权限访问该页面');
      next({ name: 'Dashboard' });
      return;
    }
  }

  next();
});

export default router;
