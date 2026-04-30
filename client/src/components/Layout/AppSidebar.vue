<script setup lang="ts">
import { ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { useMenuStore } from '@/store/menu';
import type { MenuItem } from '@/store/menu';
import {
  DashboardOutlined,
  TeamOutlined,
  AppstoreOutlined,
  ShoppingOutlined,
  DatabaseOutlined,
  ScheduleOutlined,
  UserOutlined,
  ShopOutlined,
  IdcardOutlined,
  ClockCircleOutlined,
  UsergroupAddOutlined,
  HomeOutlined,
  DeploymentUnitOutlined,
  TagsOutlined,
  FolderOutlined,
  GroupOutlined,
  ToolOutlined,
  ApartmentOutlined,
  NodeIndexOutlined,
  BranchesOutlined,
  ProfileOutlined,
  FileDoneOutlined,
  UnorderedListOutlined,
  InboxOutlined,
  FormOutlined,
  SafetyCertificateOutlined,
  BarChartOutlined,
  PieChartOutlined,
  PrinterOutlined,
  SendOutlined,
  CarOutlined,
  ContainerOutlined,
  ImportOutlined,
  ExportOutlined,
  SwapOutlined,
  CloudOutlined,
  ThunderboltOutlined,
  AccountBookOutlined,
  FileTextOutlined,
  ExclamationCircleOutlined,
  SettingOutlined,
  LineChartOutlined,
  CalculatorOutlined,
  CalendarOutlined,
  PauseCircleOutlined,
  CheckSquareOutlined,
  MedicineBoxOutlined,
  StockOutlined,
  FundOutlined,
  AuditOutlined,
  FileSearchOutlined,
  ReconciliationOutlined,
  PlusCircleOutlined,
  OrderedListOutlined,
  TableOutlined,
  PartitionOutlined,
  ProjectOutlined,
  AppstoreAddOutlined,
  HddOutlined,
  ClusterOutlined,
  MenuOutlined
} from '@ant-design/icons-vue';

interface Props {
  collapsed?: boolean;
}

const props = defineProps<Props>();

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();
const menuStore = useMenuStore();

const openKeys = ref<string[]>([]);
let preCollapsedOpenKeys: string[] = [];

// 图标名称到组件的映射
const iconMap: Record<string, any> = {
  DashboardOutlined, TeamOutlined, AppstoreOutlined, ShoppingOutlined,
  DatabaseOutlined, ScheduleOutlined, UserOutlined, ShopOutlined,
  IdcardOutlined, ClockCircleOutlined, UsergroupAddOutlined, HomeOutlined,
  DeploymentUnitOutlined, TagsOutlined, FolderOutlined, GroupOutlined,
  ToolOutlined, ApartmentOutlined, NodeIndexOutlined, BranchesOutlined,
  ProfileOutlined, FileDoneOutlined, UnorderedListOutlined, InboxOutlined,
  FormOutlined, SafetyCertificateOutlined, BarChartOutlined, PieChartOutlined,
  PrinterOutlined, SendOutlined, CarOutlined, ContainerOutlined,
  ImportOutlined, ExportOutlined, SwapOutlined, CloudOutlined,
  ThunderboltOutlined, AccountBookOutlined, FileTextOutlined,
  ExclamationCircleOutlined, SettingOutlined, LineChartOutlined,
  CalculatorOutlined, CalendarOutlined, PauseCircleOutlined,
  CheckSquareOutlined, MedicineBoxOutlined, StockOutlined, FundOutlined,
  AuditOutlined, FileSearchOutlined, ReconciliationOutlined,
  PlusCircleOutlined, OrderedListOutlined, TableOutlined, PartitionOutlined,
  ProjectOutlined, AppstoreAddOutlined, HddOutlined, ClusterOutlined,
  MenuOutlined
};

// 获取图标组件
const getIcon = (iconName: string | null) => {
  if (!iconName || !iconMap[iconName]) return null;
  return iconMap[iconName];
};

// 路由映射表（从菜单key到路由路径的映射，用于fallback）
const keyToRoute: Record<string, string> = {
  'dashboard': '/',
  'my-tasks': '/my-tasks',
  'sales-orders': '/sales-orders',
  'sales-order-details': '/sales-order-details',
  'forecasts': '/forecasts',
  'forecast-details': '/forecast-details',
  'shipping-requests': '/shipping-requests',
  'pending-shipments': '/pending-shipments',
  'shipping-orders-list': '/shipping-orders-list',
  'pending-request-details': '/pending-request-details',
  'shipping-order-details': '/shipping-order-details',
  'return-orders': '/return-orders',
  'return-order-details': '/return-order-details',
  'sales-report': '/sales-report',
  'shipping-warning': '/shipping-warning',
  'overdue-shipping': '/overdue-shipping',
  'shipping-by-order-summary': '/shipping-by-order-summary',
  'sales-prices': '/sales-prices',
  'mps-report': '/mps-report',
  'plans': '/plans',
  'mrp': '/mrp',
  'mrp-history': '/mrp-history',
  'orders': '/orders',
  'gantt': '/gantt',
  'process-tasks': '/process-tasks',
  'material-preparations': '/material-preparations',
  'material-preparation-by-process': '/material-preparation-by-process',
  'material-issue': '/material-issue',
  'material-issue-by-process': '/material-issue-by-process',
  'work-reports': '/work-reports',
  'continuous-report': '/continuous-report',
  'dispatch-print': '/dispatch-print',
  'outsourcing-reqs': '/outsourcing-reqs',
  'outsourcing-orders': '/outsourcing-orders',
  'outsourcing-issue': '/outsourcing-issue',
  'outsourcing-receipt': '/outsourcing-receipt',
  'outsourcing-inspection': '/outsourcing-inspection',
  'wip-by-order': '/wip-by-order',
  'wip-by-work-center': '/wip-by-work-center',
  'wip-lineside-transactions': '/wip-lineside-transactions',
  'fg-inventory': '/fg-inventory',
  'fg-inbound': '/fg-inbound',
  'fg-inbound-orders': '/fg-inbound-orders',
  'fg-outbound': '/fg-outbound',
  'fg-transactions': '/fg-transactions',
  'fg-abnormal-io': '/fg-abnormal-io',
  'fg-stock-count': '/fg-stock-count',
  'fg-stock-count-report': '/fg-stock-count-report',
  'fg-monthly-report': '/fg-monthly-report',
  'fg-return-inbound': '/fg-return-inbound',
  'mw-inventory': '/mw-inventory',
  'mw-inbound': '/mw-inbound',
  'mw-outbound': '/mw-outbound',
  'mw-transactions': '/mw-transactions',
  'mw-safety-stock': '/mw-safety-stock',
  'stock-ins': '/stock-ins',
  'purchase-reqs': '/purchase-reqs',
  'purchase-req-details': '/purchase-req-details',
  'purchase-orders': '/purchase-orders',
  'purchase-prices': '/purchase-prices',
  'purchase-calc': '/purchase-calc',
  'piece-rate-prices': '/piece-rate-prices',
  'defect-reasons': '/defect-reasons',
  'defect-classes': '/defect-classes',
  'defects': '/defects',
  'quality-characteristics': '/quality-characteristics',
  'inspection-specs-production': '/inspection-specs-production',
  'inspection-specs-incoming': '/inspection-specs-incoming',
  'inspection-plans': '/inspection-plans',
  'incoming-inspect-plans': '/incoming-inspect-plans',
  'quality-report': '/quality-report',
  'product-quality-summary': '/product-quality-summary',
  'purchase-inspection': '/purchase-inspection',
  'production-inspections': '/production-inspections',
  'xhy-inspect': '/xhy-inspect',
  'xhy-inspect-lines': '/xhy-inspect-lines',
  'xhy-inspect-summary': '/xhy-inspect-summary',
  'xhy-packaging-quality': '/xhy-packaging-quality',
  'xhy-inventory': '/xhy-inventory',
  'xhy-inventory-txn': '/xhy-inventory-txn',
  'batch-trace': '/batch-trace',
  'accounting-periods': '/accounting-periods',
  'equipments': '/equipments',
  'moulds': '/moulds',
  'mould-maintenance': '/mould-maintenance',
  'equipment-downtime': '/equipment-downtime',
  'equipment-maintenance-plan': '/equipment-maintenance-plan',
  'equipment-oee': '/equipment-oee',
  'item-masters': '/item-masters',
  'materia-properties': '/materia-properties',
  'material-classes': '/material-classes',
  'product-classes': '/product-classes',
  'boms': '/boms',
  'bom-tree': '/bom-tree',
  'mfg-boms': '/mfg-boms',
  'mfg-bom-tree': '/mfg-bom-tree',
  'procedures': '/procedures',
  'work-centers': '/work-centers',
  'routing-masters': '/routing-masters',
  'customers': '/customers',
  'suppliers': '/suppliers',
  'employees': '/employees',
  'schedules': '/schedules',
  'teams': '/teams',
  'workshops': '/workshops',
  'productionlines': '/productionlines',
  'warehouses': '/warehouses',
  'units': '/units',
  'storage-locations': '/storage-locations',
  'logistics-companies': '/logistics-companies',
  'customer-material-mapping': '/customer-material-mapping',
  'users': '/users',
  'roles': '/roles',
  'permissions': '/permissions',
  'departments': '/departments',
  'workflow': '/workflow',
};

// 从路由路径查找对应的菜单key
const findKeyByPath = (path: string): string => {
  const findKey = (items: MenuItem[]): string | null => {
    for (const item of items) {
      if (item.route && path === item.route) return item.key;
      if (item.route && path.startsWith(item.route + '/')) return item.key;
      if (item.children) {
        const childKey = findKey(item.children);
        if (childKey) return childKey;
      }
    }
    return null;
  };
  const key = findKey(menuStore.menuTree);
  if (key) return key;
  // fallback: 用路由路径反查key
  const found = Object.entries(keyToRoute).find(([, v]) => v === path);
  if (found) return found[0];
  const lastPart = path.split('/').filter(Boolean).pop();
  return lastPart || 'dashboard';
};

// 当前选中的菜单key（使用 ref 而非 computed，避免 a-menu 因数组引用变化频繁重渲染导致内部状态混乱）
const selectedKeys = ref<string[]>([findKeyByPath(route.path)]);

// 展开/收起逻辑
watch(() => props.collapsed, (val) => {
  if (val) {
    preCollapsedOpenKeys = [...openKeys.value];
    openKeys.value = [];
  } else {
    openKeys.value = preCollapsedOpenKeys;
  }
});

watch(() => route.path, (newPath) => {
  // 更新选中的菜单key（仅在 key 变化时更新，避免不必要的 a-menu 重渲染）
  const newKey = findKeyByPath(newPath);
  if (selectedKeys.value[0] !== newKey) {
    selectedKeys.value = [newKey];
  }

  // 自动展开父级菜单
  const collectParentKeys = (items: MenuItem[], parents: string[] = []): string[] => {
    for (const item of items) {
      if (item.route && (newPath === item.route || newPath.startsWith(item.route + '/'))) {
        return parents;
      }
      if (item.children) {
        const result = collectParentKeys(item.children, [...parents, item.key]);
        if (result.length > 0) return result;
        if (item.children.some(c => c.route && (newPath === c.route || newPath.startsWith(c.route + '/')))) {
          return [...parents, item.key];
        }
      }
    }
    return [];
  };
  const parentKeys = collectParentKeys(menuStore.menuTree);
  for (const key of parentKeys) {
    if (!openKeys.value.includes(key)) {
      openKeys.value.push(key);
    }
  }
}, { immediate: true });

const handleOpenChange = (keys: string[]) => {
  openKeys.value = keys;
};

// ============ 右键菜单 ============
const contextMenu = ref({ visible: false, x: 0, y: 0, key: '', route: '' })

const resolveRoute = (key: string): string => {
  if (key === 'dashboard') return '/'
  if (key === 'my-tasks') return '/my-tasks'
  const findRoute = (items: MenuItem[]): string | null => {
    for (const item of items) {
      if (item.key === key && item.route) return item.route
      if (item.children) {
        const r = findRoute(item.children)
        if (r) return r
      }
    }
    return null
  }
  return findRoute(menuStore.menuTree) || keyToRoute[key] || '/' + key
}

const handleContextMenu = (e: MouseEvent, key: string) => {
  const routePath = resolveRoute(key)
  if (!routePath) return
  e.preventDefault()
  e.stopPropagation()
  contextMenu.value = { visible: true, x: e.clientX, y: e.clientY, key, route: routePath }
}

const openInNewTab = () => {
  const path = contextMenu.value.route
  if (path) window.open(path, '_blank')
  contextMenu.value.visible = false
}

const closeContextMenu = () => {
  contextMenu.value.visible = false
}
// ====================================

const handleMenuClick = ({ key }: { key: string }) => {
  let targetRoute: string | null = null;

  // 1. 特殊key处理
  if (key === 'dashboard') {
    targetRoute = '/';
  } else if (key === 'my-tasks') {
    targetRoute = '/my-tasks';
  } else {
    // 2. 从菜单树查找路由
    const findRoute = (items: MenuItem[]): string | null => {
      for (const item of items) {
        if (item.key === key && item.route) return item.route;
        if (item.children) {
          const r = findRoute(item.children);
          if (r) return r;
        }
      }
      return null;
    };
    targetRoute = findRoute(menuStore.menuTree);

    // 3. Fallback: 从静态映射表查找
    if (!targetRoute && keyToRoute[key]) {
      targetRoute = keyToRoute[key];
    }

    // 4. 最终fallback: 尝试用 /key 作为路径
    if (!targetRoute && key && !key.includes('-management') && !key.includes('-data') && key !== 'system') {
      targetRoute = '/' + key;
    }
  }

  // 立即更新选中状态，提供即时视觉反馈
  if (selectedKeys.value[0] !== key) {
    selectedKeys.value = [key];
  }

  // 仅在目标路由与当前路由不同时才导航，避免 NavigationDuplicated 错误
  if (targetRoute && targetRoute !== route.path) {
    router.push(targetRoute).catch(() => { /* 忽略 Vue Router 4 的导航失败（如被守卫中断） */ });
  }
};
</script>

<template>
  <a-menu
    mode="inline"
    :selected-keys="selectedKeys"
    :open-keys="openKeys"
    @openChange="handleOpenChange"
    @click="handleMenuClick"
    style="height: 100%; border-right: none;"
  >
    <!-- 右键菜单浮层 -->
  <teleport to="body">
    <div
      v-if="contextMenu.visible"
      class="sidebar-context-mask"
      @click="closeContextMenu"
      @contextmenu.prevent="closeContextMenu"
    />
    <ul
      v-if="contextMenu.visible"
      class="sidebar-context-menu"
      :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }"
    >
      <li @click="openInNewTab">在新标签页中打开</li>
    </ul>
  </teleport>

  <!-- Dashboard -->
    <a-menu-item key="dashboard" @contextmenu="(e: MouseEvent) => handleContextMenu(e, 'dashboard')">
      <DashboardOutlined />
      <span>仪表板</span>
    </a-menu-item>

    <!-- 我的待办 -->
    <a-menu-item key="my-tasks" @contextmenu="(e: MouseEvent) => handleContextMenu(e, 'my-tasks')">
      <FileDoneOutlined />
      <span>我的待办</span>
    </a-menu-item>

    <!-- 动态菜单 - 递归渲染 -->
    <template v-for="menu in menuStore.menuTree" :key="menu.key">
      <a-sub-menu v-if="menu.children && menu.children.length > 0" :key="menu.key">
        <template #icon>
          <component :is="getIcon(menu.icon)" v-if="getIcon(menu.icon)" />
        </template>
        <template #title>{{ menu.name }}</template>

        <template v-for="child in menu.children" :key="child.key">
          <a-sub-menu v-if="child.children && child.children.length > 0" :key="child.key">
            <template #icon>
              <component :is="getIcon(child.icon)" v-if="getIcon(child.icon)" />
            </template>
            <template #title>{{ child.name }}</template>

            <a-menu-item
              v-for="grandChild in child.children"
              :key="grandChild.key"
              @contextmenu="(e: MouseEvent) => handleContextMenu(e, grandChild.key)"
            >
              <component :is="getIcon(grandChild.icon)" v-if="getIcon(grandChild.icon)" />
              <span>{{ grandChild.name }}</span>
            </a-menu-item>
          </a-sub-menu>

          <a-menu-item
            v-else
            :key="child.key"
            @contextmenu="(e: MouseEvent) => handleContextMenu(e, child.key)"
          >
            <component :is="getIcon(child.icon)" v-if="getIcon(child.icon)" />
            <span>{{ child.name }}</span>
          </a-menu-item>
        </template>
      </a-sub-menu>

      <a-menu-item
        v-else
        :key="menu.key"
        @contextmenu="(e: MouseEvent) => handleContextMenu(e, menu.key)"
      >
        <component :is="getIcon(menu.icon)" v-if="getIcon(menu.icon)" />
        <span>{{ menu.name }}</span>
      </a-menu-item>
    </template>
  </a-menu>
</template>

<style scoped>
.sidebar-context-mask {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

.sidebar-context-menu {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  padding: 4px 0;
  margin: 0;
  list-style: none;
  min-width: 160px;
}

.sidebar-context-menu li {
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  color: #333;
  white-space: nowrap;
  user-select: none;
}

.sidebar-context-menu li:hover {
  background: #f5f5f5;
  color: #1677ff;
}
</style>
