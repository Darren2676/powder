<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import {
  DashboardOutlined,
  FileTextOutlined,
  PlusCircleOutlined,
  ContainerOutlined,
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
  ProfileOutlined
} from '@ant-design/icons-vue';

interface Props {
  collapsed?: boolean;
}

const props = defineProps<Props>();

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const allSubMenuKeys = ['basic-data', 'order-management', 'product-data', 'production-data', 'equipment-management'];
const openKeys = ref<string[]>([]);
let preCollapsedOpenKeys: string[] = [];

const pathMap: Record<string, string> = {
  'dashboard': '/',
  'tickets': '/tickets',
  'create-ticket': '/tickets/create',
  'item-masters': '/item-masters',
  'customers': '/customers',
  'suppliers': '/suppliers',
  'plans': '/plans',
  'users': '/users',
  'employees': '/employees',
  'schedules': '/schedules',
  'groups': '/groups',
  'workshops': '/workshops',
  'productionlines': '/productionlines',
  'materia-properties': '/materia-properties',
  'material-classes': '/material-classes',
  'product-classes': '/product-classes',
  'equipments': '/equipments',
  'moulds': '/moulds',
  'procedures': '/procedures',
  'work-centers': '/work-centers',
  'routings': '/routings',
  'routing-masters': '/routing-masters',
  'warehouses': '/warehouses',
  'tasks': '/tasks',
  'boms': '/boms',
  'bom-tree': '/bom-tree',
  'units': '/units'
};

const onOpenChange = (keys: string[]) => {
  openKeys.value = keys;
};

watch(() => props.collapsed, (collapsed) => {
  if (collapsed) {
    preCollapsedOpenKeys = [...openKeys.value];
    openKeys.value = [];
  } else {
    openKeys.value = [...preCollapsedOpenKeys];
  }
});

const selectedKeys = computed(() => {
  const path = route.path;
  if (path === '/') return ['dashboard'];
  if (path.startsWith('/tickets/create')) return ['create-ticket'];
  if (path.startsWith('/tickets')) return ['tickets'];
  if (path.startsWith('/users')) return ['users'];
  if (path.startsWith('/item-masters')) return ['item-masters'];
  if (path.startsWith('/customers')) return ['customers'];
  if (path.startsWith('/suppliers')) return ['suppliers'];
  if (path.startsWith('/plans')) return ['plans'];
  if (path.startsWith('/employees')) return ['employees'];
  if (path.startsWith('/schedules')) return ['schedules'];
  if (path.startsWith('/groups')) return ['groups'];
  if (path.startsWith('/workshops')) return ['workshops'];
  if (path.startsWith('/productionlines')) return ['productionlines'];
  if (path.startsWith('/materia-properties')) return ['materia-properties'];
  if (path.startsWith('/material-classes')) return ['material-classes'];
  if (path.startsWith('/product-classes')) return ['product-classes'];
  if (path.startsWith('/equipments')) return ['equipments'];
  if (path.startsWith('/moulds')) return ['moulds'];
  if (path.startsWith('/procedures')) return ['procedures'];
  if (path.startsWith('/work-centers')) return ['work-centers'];
  if (path.startsWith('/routing-masters')) return ['routing-masters'];
  if (path.startsWith('/routings')) return ['routings'];
  if (path.startsWith('/warehouses')) return ['warehouses'];
  if (path.startsWith('/tasks')) return ['tasks'];
  if (path.startsWith('/bom-tree')) return ['bom-tree'];
  if (path.startsWith('/boms')) return ['boms'];
  if (path.startsWith('/units')) return ['units'];
  return [];
});

const handleMenuClick = ({ key }: { key: string }) => {
  if (pathMap[key]) {
    router.push(pathMap[key]);
  }
};
</script>

<template>
  <a-menu
    theme="dark"
    mode="inline"
    :open-keys="openKeys"
    :selected-keys="selectedKeys"
    @click="handleMenuClick"
    @openChange="onOpenChange"
  >
    <a-menu-item key="dashboard">
      <router-link :to="pathMap['dashboard']" class="menu-link" @click.prevent>
        <DashboardOutlined />
        <span>仪表板</span>
      </router-link>
    </a-menu-item>
    
    <a-sub-menu key="order-management">
      <template #icon>
        <ContainerOutlined />
      </template>
      <template #title>订单管理</template>
      <a-menu-item key="create-ticket">
        <router-link :to="pathMap['create-ticket']" class="menu-link" @click.prevent>
          <PlusCircleOutlined />
          <span>创建工单</span>
        </router-link>
      </a-menu-item>
      <a-menu-item key="tickets">
        <router-link :to="pathMap['tickets']" class="menu-link" @click.prevent>
          <FileTextOutlined />
          <span>工单管理</span>
        </router-link>
      </a-menu-item>
    </a-sub-menu>

    <a-menu-item key="plans">
      <router-link :to="pathMap['plans']" class="menu-link" @click.prevent>
        <ScheduleOutlined />
        <span>计划管理</span>
      </router-link>
    </a-menu-item>

    <a-menu-item key="tasks">
      <router-link :to="pathMap['tasks']" class="menu-link" @click.prevent>
        <ScheduleOutlined />
        <span>生产任务单</span>
      </router-link>
    </a-menu-item>
    
    <a-sub-menu key="basic-data">
      <template #icon>
        <DatabaseOutlined />
      </template>
      <template #title>基础数据</template>
      <a-sub-menu key="production-data">
        <template #icon>
          <DeploymentUnitOutlined />
        </template>
        <template #title>生产数据管理</template>
        <a-menu-item key="schedules">
          <router-link :to="pathMap['schedules']" class="menu-link" @click.prevent>
            <ClockCircleOutlined />
            <span>班次管理</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="groups">
          <router-link :to="pathMap['groups']" class="menu-link" @click.prevent>
            <UsergroupAddOutlined />
            <span>班组管理</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="workshops">
          <router-link :to="pathMap['workshops']" class="menu-link" @click.prevent>
            <HomeOutlined />
            <span>车间管理</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="productionlines">
          <router-link :to="pathMap['productionlines']" class="menu-link" @click.prevent>
            <DeploymentUnitOutlined />
            <span>生产线管理</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="warehouses">
          <router-link :to="pathMap['warehouses']" class="menu-link" @click.prevent>
            <AppstoreOutlined />
            <span>仓库管理</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="units">
          <router-link :to="pathMap['units']" class="menu-link" @click.prevent>
            <ProfileOutlined />
            <span>单位管理</span>
          </router-link>
        </a-menu-item>
      </a-sub-menu>
      <a-sub-menu key="product-data">
        <template #icon>
          <ShoppingOutlined />
        </template>
        <template #title>产品数据管理</template>
        <a-menu-item key="item-masters">
          <router-link :to="pathMap['item-masters']" class="menu-link" @click.prevent>
            <DatabaseOutlined />
            <span>物品主数据</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="boms">
          <router-link :to="pathMap['boms']" class="menu-link" @click.prevent>
            <ProfileOutlined />
            <span>BOM物料清单</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="bom-tree">
          <router-link :to="pathMap['bom-tree']" class="menu-link" @click.prevent>
            <ApartmentOutlined />
            <span>BOM结构树</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="materia-properties">
          <router-link :to="pathMap['materia-properties']" class="menu-link" @click.prevent>
            <TagsOutlined />
            <span>物料属性管理</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="material-classes">
          <router-link :to="pathMap['material-classes']" class="menu-link" @click.prevent>
            <FolderOutlined />
            <span>物料分类管理</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="product-classes">
          <router-link :to="pathMap['product-classes']" class="menu-link" @click.prevent>
            <GroupOutlined />
            <span>产品分类管理</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="procedures">
          <router-link :to="pathMap['procedures']" class="menu-link" @click.prevent>
            <NodeIndexOutlined />
            <span>标准工序</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="work-centers">
          <router-link :to="pathMap['work-centers']" class="menu-link" @click.prevent>
            <ApartmentOutlined />
            <span>工作中心</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="routings">
          <router-link :to="pathMap['routings']" class="menu-link" @click.prevent>
            <BranchesOutlined />
            <span>工艺路线</span>
          </router-link>
        </a-menu-item>
        <a-menu-item key="routing-masters">
          <router-link :to="pathMap['routing-masters']" class="menu-link" @click.prevent>
            <BranchesOutlined />
            <span>工艺路线（主从）</span>
          </router-link>
        </a-menu-item>
      </a-sub-menu>
      <a-menu-item key="customers">
        <router-link :to="pathMap['customers']" class="menu-link" @click.prevent>
          <UserOutlined />
          <span>客户管理</span>
        </router-link>
      </a-menu-item>
      <a-menu-item key="suppliers">
        <router-link :to="pathMap['suppliers']" class="menu-link" @click.prevent>
          <ShopOutlined />
          <span>供应商管理</span>
        </router-link>
      </a-menu-item>
      <a-menu-item key="employees">
        <router-link :to="pathMap['employees']" class="menu-link" @click.prevent>
          <IdcardOutlined />
          <span>员工管理</span>
        </router-link>
      </a-menu-item>
    </a-sub-menu>
    
    <a-sub-menu key="equipment-management">
      <template #icon>
        <ToolOutlined />
      </template>
      <template #title>设备管理</template>
      <a-menu-item key="equipments">
        <router-link :to="pathMap['equipments']" class="menu-link" @click.prevent>
          <ToolOutlined />
          <span>设备台帐管理</span>
        </router-link>
      </a-menu-item>
      <a-menu-item key="moulds">
        <router-link :to="pathMap['moulds']" class="menu-link" @click.prevent>
          <AppstoreOutlined />
          <span>模具管理</span>
        </router-link>
      </a-menu-item>
    </a-sub-menu>
    
    <a-menu-item v-if="authStore.isAdmin" key="users">
      <router-link :to="pathMap['users']" class="menu-link" @click.prevent>
        <TeamOutlined />
        <span>用户管理</span>
      </router-link>
    </a-menu-item>
  </a-menu>
</template>

<style scoped>
.menu-link {
  color: inherit;
  text-decoration: none;
  display: inline;
}

.menu-link:hover,
.menu-link:focus {
  color: inherit;
  text-decoration: none;
}
</style>
