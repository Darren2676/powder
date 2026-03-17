import { createRouter, createWebHistory } from 'vue-router';
import type { RouteRecordRaw } from 'vue-router';
import { useAuthStore } from '@/store/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/views/Auth/Login.vue'),
    meta: { requiresAuth: false, guestOnly: true }
  },
  {
    path: '/register',
    name: 'Register',
    component: () => import('@/views/Auth/Register.vue'),
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
        meta: { title: '仪表板' }
      },
      {
        path: 'tickets',
        name: 'TicketList',
        component: () => import('@/views/Ticket/List.vue'),
        meta: { title: '工单管理' }
      },
      {
        path: 'tickets/create',
        name: 'TicketCreate',
        component: () => import('@/views/Ticket/Create.vue'),
        meta: { title: '创建工单' }
      },
      {
        path: 'tickets/:id',
        name: 'TicketDetail',
        component: () => import('@/views/Ticket/Detail.vue'),
        meta: { title: '工单详情' }
      },
      {
        path: 'users',
        name: 'UserManagement',
        component: () => import('@/views/User/Management.vue'),
        meta: { title: '用户管理', requiresAdmin: true }
      },
      {
        path: 'item-masters',
        name: 'ItemMasterList',
        component: () => import('@/views/ItemMaster/List.vue'),
        meta: { title: '物品主数据管理' }
      },
      {
        path: 'plans',
        name: 'PlanList',
        component: () => import('@/views/Plan/List.vue'),
        meta: { title: '计划管理' }
      },
      {
        path: 'customers',
        name: 'CustomerList',
        component: () => import('@/views/Customer/List.vue'),
        meta: { title: '客户管理' }
      },
      {
        path: 'suppliers',
        name: 'SupplierList',
        component: () => import('@/views/Supplier/List.vue'),
        meta: { title: '供应商管理' }
      },
      {
        path: 'employees',
        name: 'EmployeeList',
        component: () => import('@/views/Employee/List.vue'),
        meta: { title: '员工管理' }
      },
      {
        path: 'schedules',
        name: 'ScheduleList',
        component: () => import('@/views/Schedule/List.vue'),
        meta: { title: '班次管理' }
      },
      {
        path: 'groups',
        name: 'GroupList',
        component: () => import('@/views/Group/List.vue'),
        meta: { title: '班组管理' }
      },
      {
        path: 'workshops',
        name: 'WorkshopList',
        component: () => import('@/views/Workshop/List.vue'),
        meta: { title: '车间管理' }
      },
      {
        path: 'productionlines',
        name: 'ProductionlineList',
        component: () => import('@/views/Productionline/List.vue'),
        meta: { title: '生产线管理' }
      },
      {
        path: 'materia-properties',
        name: 'MateriaPropertyList',
        component: () => import('@/views/MateriaProperty/List.vue'),
        meta: { title: '物料属性管理' }
      },
      {
        path: 'material-classes',
        name: 'MaterialClassList',
        component: () => import('@/views/MaterialClass/List.vue'),
        meta: { title: '物料分类管理' }
      },
      {
        path: 'product-classes',
        name: 'ProductClassList',
        component: () => import('@/views/ProductClass/List.vue'),
        meta: { title: '产品分类管理' }
      },
      {
        path: 'equipments',
        name: 'EquipmentList',
        component: () => import('@/views/Equipment/List.vue'),
        meta: { title: '设备台帐管理' }
      },
      {
        path: 'moulds',
        name: 'MouldList',
        component: () => import('@/views/Mould/List.vue'),
        meta: { title: '模具管理' }
      },
      {
        path: 'procedures',
        name: 'ProcedureList',
        component: () => import('@/views/Procedure/List.vue'),
        meta: { title: '标准工序' }
      },
      {
        path: 'work-centers',
        name: 'WorkCenterList',
        component: () => import('@/views/WorkCenter/List.vue'),
        meta: { title: '工作中心' }
      },
      {
        path: 'routings',
        name: 'RoutingList',
        component: () => import('@/views/Routing/List.vue'),
        meta: { title: '工艺路线' }
      },
      {
        path: 'warehouses',
        name: 'WarehouseList',
        component: () => import('@/views/Warehouse/List.vue'),
        meta: { title: '仓库管理' }
      },
      {
        path: 'routing-masters',
        name: 'RoutingMasterList',
        component: () => import('@/views/RoutingMaster/List.vue'),
        meta: { title: '工艺路线（主从）' }
      },
      {
        path: 'tasks',
        name: 'TaskList',
        component: () => import('@/views/Task/List.vue'),
        meta: { title: '生产任务单' }
      },
      {
        path: 'boms',
        name: 'BomList',
        component: () => import('@/views/Bom/List.vue'),
        meta: { title: 'BOM物料清单' }
      },
      {
        path: 'bom-tree',
        name: 'BomTreeViewer',
        component: () => import('@/views/Bom/TreeViewer.vue'),
        meta: { title: 'BOM结构树' }
      },
      {
        path: 'units',
        name: 'UnitList',
        component: () => import('@/views/Unit/List.vue'),
        meta: { title: '单位管理' }
      }
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

// Navigation guard
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore();
  const requiresAuth = to.matched.some(record => record.meta.requiresAuth !== false);
  const guestOnly = to.matched.some(record => record.meta.guestOnly);
  const requiresAdmin = to.matched.some(record => record.meta.requiresAdmin);

  // Check if route requires authentication
  if (requiresAuth && !authStore.isLoggedIn) {
    // 动态导入 message 避免初始化问题
    const { message } = await import('ant-design-vue');
    message.warning('请先登录');
    next({ name: 'Login', query: { redirect: to.fullPath } });
    return;
  }

  // Check if route is guest only (login/register)
  if (guestOnly && authStore.isLoggedIn) {
    next({ name: 'Dashboard' });
    return;
  }

  // Check if route requires admin role
  if (requiresAdmin && !authStore.isAdmin) {
    const { message } = await import('ant-design-vue');
    message.error('没有权限访问该页面');
    next({ name: 'Dashboard' });
    return;
  }

  next();
});

export default router;
