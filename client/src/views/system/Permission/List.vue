<template>
  <div>
    <a-page-header title="权限菜单管理" style="padding: 0; margin-bottom: 16px;">
      <template #extra>
        <a-space>
          <a-button type="primary" @click="handleCreateMenu(null)"><PlusOutlined /> 新建菜单</a-button>
        </a-space>
      </template>
    </a-page-header>

    <a-card :bordered="false" size="small">
      <a-spin :spinning="loading">
        <a-table
          :columns="columns"
          :data-source="flatList"
          :pagination="false"
          row-key="id"
          size="small"
          :scroll="{ y: 600 }"
          default-expand-all-rows
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'permission_type'">
              <a-tag :color="record.permission_type === 'menu' ? 'blue' : 'green'">
                {{ record.permission_type === 'menu' ? '菜单' : '页面' }}
              </a-tag>
            </template>
            <template v-if="column.key === 'icon'">
              <component :is="iconMap[record.icon]" v-if="record.icon && iconMap[record.icon]" style="font-size: 16px;" />
              <span v-else style="color: #999;">-</span>
            </template>
            <template v-if="column.key === 'status'">
              <a-tag :color="record.status === '启用' ? 'green' : 'red'">{{ record.status }}</a-tag>
            </template>
            <template v-if="column.key === 'action'">
              <a-space :size="4">
                <a-button v-if="record.permission_type === 'menu'" type="link" size="small" @click="handleCreatePage(record)">
                  <PlusOutlined /> 添加页面
                </a-button>
                <a-button type="link" size="small" @click="handleEdit(record)">编辑</a-button>
                <a-popconfirm title="确定删除？" @confirm="handleDelete(record)">
                  <a-button type="link" size="small" danger>删除</a-button>
                </a-popconfirm>
              </a-space>
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-card>

    <!-- 新建/编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="modalTitle"
      @ok="handleModalOk"
      :confirm-loading="modalLoading"
      width="560px"
    >
      <a-form :model="formState" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }" style="margin-top: 16px;">
        <a-form-item label="权限名称" required>
          <a-input v-model:value="formState.permission_name" placeholder="如：销售管理" />
        </a-form-item>
        <a-form-item label="权限编码" required>
          <a-input v-model:value="formState.permission_code" placeholder="如：sales" :disabled="!!editingItem" />
        </a-form-item>
        <a-form-item label="权限类型" required>
          <a-select v-model:value="formState.permission_type" :disabled="!!editingItem" @change="handleTypeChange">
            <a-select-option value="menu">菜单/子菜单</a-select-option>
            <a-select-option value="page">页面</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="formState.permission_type === 'menu' && menuList.length > 0" label="父级菜单">
          <a-select v-model:value="formState.parent_id" placeholder="留空为顶级菜单" allow-clear :disabled="!!editingItem">
            <a-select-option :value="null">（顶级菜单）</a-select-option>
            <a-select-option v-for="m in menuList" :key="m.id" :value="m.id">
              {{ m.indent || '' }}{{ m.permission_name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item v-if="formState.permission_type === 'page'" label="所属菜单" required>
          <a-select v-model:value="formState.parent_id" placeholder="选择所属菜单" :disabled="!!editingItem">
            <a-select-option v-for="m in menuList" :key="m.id" :value="m.id">
              {{ m.indent || '' }}{{ m.permission_name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="菜单Key">
          <a-input v-model:value="formState.menu_key" placeholder="如：sales-management（用于路由匹配）" />
        </a-form-item>
        <a-form-item label="路由路径">
          <a-input v-model:value="formState.route_path" placeholder="如：/sales-orders（页面类型必填）" />
        </a-form-item>
        <a-form-item v-if="formState.permission_type === 'menu'" label="图标">
          <a-select v-model:value="formState.icon" placeholder="选择图标" allow-clear show-search>
            <a-select-option v-for="name in iconNames" :key="name" :value="name">
              <component :is="iconMap[name]" v-if="iconMap[name]" style="margin-right: 8px;" />
              {{ name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="排序">
          <a-input-number v-model:value="formState.sort_order" :min="0" style="width: 100%;" />
        </a-form-item>
        <a-form-item v-if="editingItem" label="状态">
          <a-select v-model:value="formState.status" style="width: 100%;">
            <a-select-option value="启用">启用</a-select-option>
            <a-select-option value="禁用">禁用</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined } from '@ant-design/icons-vue';
import * as roleApi from '@/api/system/role';
import { useMenuStore } from '@/store/menu';
import { usePermissionStore } from '@/store/permission';

const menuStore = useMenuStore();
const permStore = usePermissionStore();
import {
  DashboardOutlined, ShoppingOutlined, DatabaseOutlined, ToolOutlined,
  InboxOutlined, CarOutlined, SafetyCertificateOutlined, AccountBookOutlined,
  SettingOutlined, TeamOutlined, ApartmentOutlined, NodeIndexOutlined,
  ScheduleOutlined, PauseCircleOutlined, UserOutlined, FileDoneOutlined,
  BarChartOutlined, LineChartOutlined, PieChartOutlined, FormOutlined,
  FileTextOutlined, ContainerOutlined, ImportOutlined, ExportOutlined,
  CloudOutlined, ThunderboltOutlined, ExclamationCircleOutlined,
  CalculatorOutlined, CalendarOutlined, CheckSquareOutlined,
  MedicineBoxOutlined, StockOutlined, FundOutlined, AuditOutlined,
  FileSearchOutlined, ReconciliationOutlined, PrinterOutlined,
  SendOutlined, TagsOutlined, GroupOutlined, UnorderedListOutlined,
  ClockCircleOutlined, BranchesOutlined, ProfileOutlined, SwapOutlined
} from '@ant-design/icons-vue';

// 图标映射
const iconMap: Record<string, any> = {
  DashboardOutlined, ShoppingOutlined, DatabaseOutlined, ToolOutlined,
  InboxOutlined, CarOutlined, SafetyCertificateOutlined, AccountBookOutlined,
  SettingOutlined, TeamOutlined, ApartmentOutlined, NodeIndexOutlined,
  ScheduleOutlined, PauseCircleOutlined, UserOutlined, FileDoneOutlined,
  BarChartOutlined, LineChartOutlined, PieChartOutlined, FormOutlined,
  FileTextOutlined, ContainerOutlined, ImportOutlined, ExportOutlined,
  CloudOutlined, ThunderboltOutlined, ExclamationCircleOutlined,
  CalculatorOutlined, CalendarOutlined, CheckSquareOutlined,
  MedicineBoxOutlined, StockOutlined, FundOutlined, AuditOutlined,
  FileSearchOutlined, ReconciliationOutlined, PrinterOutlined,
  SendOutlined, TagsOutlined, GroupOutlined, UnorderedListOutlined,
  ClockCircleOutlined, BranchesOutlined, ProfileOutlined, SwapOutlined
};

const iconNames = Object.keys(iconMap);

const loading = ref(false);
const treeData = ref<any[]>([]);

// 将树形数据展平为表格数据（保留children用于展开）
const flatList = computed(() => {
  return treeData.value;
});

// 菜单列表（用于选择父级，包含缩进显示层级）
const menuList = computed(() => {
  const menus: any[] = [];
  const collect = (items: any[], depth: number = 0) => {
    for (const item of items) {
      if (item.permission_type === 'menu') {
        menus.push({ ...item, indent: '\u00A0\u00A0\u00A0\u00A0'.repeat(depth) });
        if (item.children) collect(item.children, depth + 1);
      }
    }
  };
  collect(treeData.value);
  return menus;
});

const columns = [
  { title: '权限名称', dataIndex: 'permission_name', width: 180 },
  { title: '编码', dataIndex: 'permission_code', width: 140 },
  { title: '类型', key: 'permission_type', width: 80 },
  { title: '菜单Key', dataIndex: 'menu_key', width: 160 },
  { title: '路由', dataIndex: 'route_path', width: 160, ellipsis: true },
  { title: '图标', key: 'icon', width: 60, align: 'center' as const },
  { title: '排序', dataIndex: 'sort_order', width: 60, align: 'center' as const },
  { title: '状态', key: 'status', width: 70, align: 'center' as const },
  { title: '操作', key: 'action', width: 200 }
];

// 弹窗
const modalVisible = ref(false);
const modalLoading = ref(false);
const editingItem = ref<any>(null);
const formState = reactive({
  permission_name: '',
  permission_code: '',
  permission_type: 'menu' as string,
  parent_id: null as number | null,
  menu_key: '',
  route_path: '',
  icon: '',
  sort_order: 0,
  status: '启用'
});

const modalTitle = computed(() => {
  if (editingItem.value) return '编辑权限';
  if (formState.permission_type === 'menu') return '新建菜单';
  return '新建页面';
});

const fetchTree = async () => {
  loading.value = true;
  try {
    const res: any = await roleApi.getPermissionTree();
    if (res.success) {
      treeData.value = res.data;
    }
  } finally {
    loading.value = false;
  }
};

const handleCreateMenu = () => {
  editingItem.value = null;
  Object.assign(formState, {
    permission_name: '', permission_code: '', permission_type: 'menu',
    parent_id: null, menu_key: '', route_path: '', icon: '', sort_order: 0, status: '启用'
  });
  modalVisible.value = true;
};

const handleCreatePage = (menu: any) => {
  editingItem.value = null;
  Object.assign(formState, {
    permission_name: '', permission_code: '', permission_type: 'page',
    parent_id: menu.id, menu_key: '', route_path: '', icon: '', sort_order: 0, status: '启用'
  });
  modalVisible.value = true;
};

const handleEdit = (record: any) => {
  editingItem.value = record;
  Object.assign(formState, {
    permission_name: record.permission_name,
    permission_code: record.permission_code,
    permission_type: record.permission_type,
    parent_id: record.parent_id,
    menu_key: record.menu_key || '',
    route_path: record.route_path || '',
    icon: record.icon || '',
    sort_order: record.sort_order || 0,
    status: record.status || '启用'
  });
  modalVisible.value = true;
};

const handleTypeChange = () => {
  if (formState.permission_type === 'menu') {
    formState.route_path = '';
  }
  if (formState.permission_type === 'page') {
    formState.icon = '';
  }
};

const handleModalOk = async () => {
  if (!formState.permission_name || !formState.permission_code || !formState.permission_type) {
    message.warning('权限名称、编码和类型不能为空');
    return;
  }
  modalLoading.value = true;
  try {
    let res: any;
    if (editingItem.value) {
      res = await roleApi.updatePermission(editingItem.value.id, formState);
    } else {
      res = await roleApi.createPermission(formState);
    }
    if (res.success) {
      message.success(editingItem.value ? '更新成功' : '创建成功');
      modalVisible.value = false;
      await fetchTree();
      // 刷新当前用户的菜单树和权限缓存，使变更立即生效
      await Promise.all([
        menuStore.fetchMenuTree(),
        permStore.fetchPermissions()
      ]);
    } else {
      message.error(res.message || '操作失败');
    }
  } finally {
    modalLoading.value = false;
  }
};

const handleDelete = async (record: any) => {
  const res: any = await roleApi.deletePermission(record.id);
  if (res.success) {
    message.success('删除成功');
    await fetchTree();
    // 刷新当前用户的菜单树和权限缓存，使变更立即生效
    await Promise.all([
      menuStore.fetchMenuTree(),
      permStore.fetchPermissions()
    ]);
  } else {
    message.error(res.message || '删除失败');
  }
};

onMounted(() => {
  fetchTree();
});
</script>
