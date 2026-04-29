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
        component: () => import('@/views/Dashboard/Index.vue'),
        meta: { title: '销售订单仪表板' }
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
  'MpsReport': 'mps-report',
  'PlanList': 'plans',
  'MrpPage': 'mrp',
  'OrderList': 'orders',
  'GanttView': 'gantt',
  'ProcessTaskList': 'process-tasks',
  'MaterialPreparationList': 'material-preparations',
  'MaterialIssueList': 'material-issue',
  'WorkReportList': 'work-reports',
  'OutsourcingReqList': 'outsourcing-reqs',
  'OutsourcingOrderList': 'outsourcing-orders',
  'FgInventory': 'fg-inventory',
  'FgInboundList': 'fg-inbound',
  'FgOutboundList': 'fg-outbound',
  'MwInventory': 'mw-inventory',
  'MwInboundList': 'mw-inbound',
  'MwOutboundList': 'mw-outbound',
  'PurchaseReqList': 'purchase-reqs',
  'PurchaseOrderList': 'purchase-orders',
  'StockInList': 'stock-ins',
  'BatchTraceList': 'batch-trace',
  'QualityReportList': 'quality-report',
  'PurchaseInspectionList': 'purchase-inspection',
  'SalesPriceList': 'sales-prices',
  'PurchasePriceList': 'purchase-prices',
  'PieceRatePriceList': 'piece-rate-prices',
  'AccountingPeriodList': 'accounting-periods',
  'EquipmentList': 'equipments',
  'MouldList': 'moulds',
  'MouldMaintenanceList': 'mould-maintenance',
  'EquipmentDowntimeList': 'equipment-downtime',
  'EquipmentMaintenancePlanList': 'equipment-maintenance-plan',
  'EquipmentOeeDashboard': 'equipment-oee',
  'ItemMasterList': 'item-masters',
  'BomList': 'boms',
  'ProcedureList': 'procedures',
  'WorkCenterList': 'work-centers',
  'RoutingMasterList': 'routing-masters',
  'CustomerList': 'customers',
  'SupplierList': 'suppliers',
  'EmployeeList': 'employees',
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
