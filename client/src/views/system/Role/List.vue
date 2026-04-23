<template>
  <div>
    <a-page-header title="角色管理" style="padding: 0; margin-bottom: 16px;">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索角色名称/编码"
            style="width: 200px"
            allow-clear
            @search="fetchData"
          />
          <a-button type="primary" @click="handleCreate"><PlusOutlined /> 新建角色</a-button>
        </a-space>
      </template>
    </a-page-header>

    <a-card :bordered="false" size="small">
      <a-table
        :columns="columns"
        :data-source="dataList"
        :loading="loading"
        :pagination="pagination"
        row-key="id"
        size="small"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-if="column.key === 'is_system'">
            <a-tag :color="record.is_system ? 'blue' : 'default'">
              {{ record.is_system ? '系统角色' : '自定义' }}
            </a-tag>
          </template>
          <template v-if="column.key === 'status'">
            <a-tag :color="record.status === '启用' ? 'green' : 'red'">
              {{ record.status }}
            </a-tag>
          </template>
          <template v-if="column.key === 'user_count'">
            <a-badge :count="record.user_count" :number-style="{ backgroundColor: '#1890ff' }" />
          </template>
          <template v-if="column.key === 'permission_count'">
            <a-badge :count="record.permission_count" :number-style="{ backgroundColor: '#52c41a' }" />
          </template>
          <template v-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleEditPerms(record)">
                <SafetyCertificateOutlined /> 分配权限
              </a-button>
              <a-button type="link" size="small" @click="handleEdit(record)">编辑</a-button>
              <a-popconfirm
                v-if="!record.is_system"
                title="确定删除此角色？"
                @confirm="handleDelete(record)"
              >
                <a-button type="link" size="small" danger>删除</a-button>
              </a-popconfirm>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新建/编辑角色弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="editingRole ? '编辑角色' : '新建角色'"
      @ok="handleModalOk"
      :confirm-loading="modalLoading"
      width="480px"
    >
      <a-form :model="formState" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }" style="margin-top: 16px;">
        <a-form-item label="角色名称" required>
          <a-input v-model:value="formState.role_name" placeholder="请输入角色名称" />
        </a-form-item>
        <a-form-item label="角色编码" required>
          <a-input v-model:value="formState.role_code" placeholder="请输入角色编码" :disabled="!!editingRole" />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model:value="formState.description" placeholder="请输入描述" :rows="3" />
        </a-form-item>
        <a-form-item label="排序">
          <a-input-number v-model:value="formState.sort_order" :min="0" style="width: 100%;" />
        </a-form-item>
        <a-form-item v-if="editingRole" label="状态">
          <a-select v-model:value="formState.status" style="width: 100%;">
            <a-select-option value="启用">启用</a-select-option>
            <a-select-option value="禁用">禁用</a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 分配权限弹窗 -->
    <a-modal
      v-model:open="permModalVisible"
      title="分配权限"
      @ok="handlePermOk"
      :confirm-loading="permModalLoading"
      width="720px"
    >
      <div style="margin-bottom: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <span style="font-weight: 500; font-size: 15px;">{{ permRoleName }}</span>
            <span style="color: #999; margin-left: 8px;">已选 {{ checkedKeys.length }} 项权限</span>
          </div>
          <a-space>
            <a-button size="small" @click="handleSelectAll">全选</a-button>
            <a-button size="small" @click="handleDeselectAll">取消全选</a-button>
          </a-space>
        </div>
        <!-- 权限类型图例 -->
        <div style="margin-top: 8px;">
          <a-space :size="12">
            <span><a-tag color="blue" style="font-size: 11px;">菜单</a-tag> 一级模块</span>
            <span><a-tag color="green" style="font-size: 11px;">页面</a-tag> 功能页面</span>
            <span><a-tag color="orange" style="font-size: 11px;">操作</a-tag> 增删改查</span>
            <span><a-tag color="purple" style="font-size: 11px;">字段</a-tag> 敏感字段</span>
          </a-space>
        </div>
      </div>
      <a-spin :spinning="permTreeLoading">
        <a-tree
          v-model:checkedKeys="checkedKeys"
          :tree-data="permTreeData"
          :field-names="{ title: 'permission_name', key: 'id', children: 'children' }"
          checkable
          default-expand-all
          :selectable="false"
          style="max-height: 520px; overflow-y: auto;"
        >
          <template #title="nodeData">
            <span>
              <!-- 菜单 -->
              <span v-if="nodeData.permission_type === 'menu'" style="color: #1890ff; font-weight: 500;">
                {{ nodeData.permission_name }}
              </span>
              <!-- 页面 -->
              <span v-else-if="nodeData.permission_type === 'page'" style="font-weight: 500;">
                {{ nodeData.permission_name }}
              </span>
              <!-- 操作 -->
              <span v-else-if="nodeData.permission_type === 'operation'" style="color: #d46b08;">
                {{ nodeData.permission_name }}
              </span>
              <!-- 字段 -->
              <span v-else-if="nodeData.permission_type === 'field'" style="color: #722ed1;">
                {{ nodeData.permission_name }}
              </span>
              <span v-else>{{ nodeData.permission_name }}</span>

              <!-- 类型标签 -->
              <a-tag v-if="nodeData.permission_type === 'menu'" color="blue" style="margin-left: 4px; font-size: 11px;">菜单</a-tag>
              <a-tag v-else-if="nodeData.permission_type === 'page'" color="green" style="margin-left: 4px; font-size: 11px;">页面</a-tag>
              <a-tag v-else-if="nodeData.permission_type === 'operation'" color="orange" style="margin-left: 4px; font-size: 11px;">操作</a-tag>
              <a-tag v-else-if="nodeData.permission_type === 'field'" color="purple" style="margin-left: 4px; font-size: 11px;">字段</a-tag>
            </span>
          </template>
        </a-tree>
      </a-spin>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { message } from 'ant-design-vue';
import { PlusOutlined, SafetyCertificateOutlined } from '@ant-design/icons-vue';
import * as roleApi from '@/api/system/role';
import { useMenuStore } from '@/store/menu';
import { usePermissionStore } from '@/store/permission';

const menuStore = useMenuStore();
const permStore = usePermissionStore();

const loading = ref(false);
const dataList = ref<any[]>([]);
const searchText = ref('');
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`
});

const columns = [
  { title: '#', key: 'rowIndex', width: 50, align: 'center' as const },
  { title: '角色名称', dataIndex: 'role_name', width: 140 },
  { title: '角色编码', dataIndex: 'role_code', width: 120 },
  { title: '类型', key: 'is_system', width: 100, align: 'center' as const },
  { title: '状态', key: 'status', width: 80, align: 'center' as const },
  { title: '用户数', key: 'user_count', width: 80, align: 'center' as const },
  { title: '权限数', key: 'permission_count', width: 80, align: 'center' as const },
  { title: '描述', dataIndex: 'description', ellipsis: true },
  { title: '排序', dataIndex: 'sort_order', width: 60, align: 'center' as const },
  { title: '操作', key: 'action', width: 220, fixed: 'right' as const }
];

// 新建/编辑
const modalVisible = ref(false);
const modalLoading = ref(false);
const editingRole = ref<any>(null);
const formState = reactive({
  role_name: '',
  role_code: '',
  description: '',
  sort_order: 0,
  status: '启用'
});

// 权限分配
const permModalVisible = ref(false);
const permModalLoading = ref(false);
const permTreeLoading = ref(false);
const permRoleId = ref<number>(0);
const permRoleName = ref('');
const checkedKeys = ref<number[]>([]);
const permTreeData = ref<any[]>([]);

const fetchData = async () => {
  loading.value = true;
  try {
    const res: any = await roleApi.getRoles({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined
    });
    if (res.success) {
      dataList.value = res.data.items;
      pagination.total = res.data.pagination.total;
    }
  } finally {
    loading.value = false;
  }
};

const handleTableChange = (pag: any) => {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchData();
};

const handleCreate = () => {
  editingRole.value = null;
  Object.assign(formState, { role_name: '', role_code: '', description: '', sort_order: 0, status: '启用' });
  modalVisible.value = true;
};

const handleEdit = (record: any) => {
  editingRole.value = record;
  Object.assign(formState, {
    role_name: record.role_name,
    role_code: record.role_code,
    description: record.description || '',
    sort_order: record.sort_order || 0,
    status: record.status || '启用'
  });
  modalVisible.value = true;
};

const handleModalOk = async () => {
  if (!formState.role_name || !formState.role_code) {
    message.warning('角色名称和编码不能为空');
    return;
  }
  modalLoading.value = true;
  try {
    let res: any;
    if (editingRole.value) {
      res = await roleApi.updateRole(editingRole.value.id, formState);
    } else {
      res = await roleApi.createRole(formState);
    }
    if (res.success) {
      message.success(editingRole.value ? '更新成功' : '创建成功');
      modalVisible.value = false;
      fetchData();
    } else {
      message.error(res.message || '操作失败');
    }
  } finally {
    modalLoading.value = false;
  }
};

const handleDelete = async (record: any) => {
  const res: any = await roleApi.deleteRole(record.id);
  if (res.success) {
    message.success('删除成功');
    fetchData();
  } else {
    message.error(res.message || '删除失败');
  }
};

// 权限分配
const handleEditPerms = async (record: any) => {
  permRoleId.value = record.id;
  permRoleName.value = record.role_name;
  permModalVisible.value = true;

  // 加载权限树
  permTreeLoading.value = true;
  try {
    const [treeRes, roleRes]: any[] = await Promise.all([
      roleApi.getPermissionTree(),
      roleApi.getRoleById(record.id)
    ]);
    if (treeRes.success) {
      permTreeData.value = treeRes.data;
    }
    if (roleRes.success && roleRes.data.permissions) {
      // 只勾选叶子节点（operation/field/无children的page），避免 a-tree 半选问题
      const leafIds = getLeafCheckedIds(treeRes.data || [], new Set(roleRes.data.permissions.map((p: any) => p.id)));
      checkedKeys.value = leafIds;
    } else {
      checkedKeys.value = [];
    }
  } finally {
    permTreeLoading.value = false;
  }
};

/**
 * 获取叶子节点的checked ids
 * Ant Design Vue Tree 的 checkedKeys 只需要叶子节点id，父节点会自动半选/全选
 */
const getLeafCheckedIds = (treeData: any[], allCheckedIds: Set<number>): number[] => {
  const leafIds: number[] = [];
  const traverse = (nodes: any[]) => {
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        traverse(node.children);
      } else {
        // 叶子节点
        if (allCheckedIds.has(node.id)) {
          leafIds.push(node.id);
        }
      }
    }
  };
  traverse(treeData);
  return leafIds;
};

const handleSelectAll = () => {
  // 只选叶子节点
  const leafIds: number[] = [];
  const collectLeafIds = (nodes: any[]) => {
    for (const node of nodes) {
      if (node.children && node.children.length > 0) {
        collectLeafIds(node.children);
      } else {
        leafIds.push(node.id);
      }
    }
  };
  collectLeafIds(permTreeData.value);
  checkedKeys.value = leafIds;
};

const handleDeselectAll = () => {
  checkedKeys.value = [];
};

const handlePermOk = async () => {
  permModalLoading.value = true;
  try {
    // 收集所有选中的权限ID（包括半选的父节点）
    const allIds = collectAllCheckedIds(permTreeData.value, new Set(checkedKeys.value));
    const res: any = await roleApi.assignPermissions(permRoleId.value, allIds);
    if (res.success) {
      message.success('权限分配成功');
      permModalVisible.value = false;
      fetchData();
      // 刷新当前用户的菜单树和权限缓存，使变更立即生效
      await Promise.all([
        menuStore.fetchMenuTree(),
        permStore.fetchPermissions()
      ]);
    } else {
      message.error(res.message || '权限分配失败');
    }
  } finally {
    permModalLoading.value = false;
  }
};

/**
 * 根据叶子节点的选中状态，向上推导出所有需要选中的父节点ID
 * 规则：如果一个节点的任意子节点被选中，则该节点也应被选中
 */
const collectAllCheckedIds = (treeData: any[], leafCheckedIds: Set<number>): number[] => {
  const result = new Set<number>();

  const traverse = (nodes: any[]): boolean => {
    let anyChecked = false;
    for (const node of nodes) {
      let isChecked = false;
      if (node.children && node.children.length > 0) {
        isChecked = traverse(node.children);
      } else {
        isChecked = leafCheckedIds.has(node.id);
      }
      if (isChecked) {
        result.add(node.id);
        anyChecked = true;
      }
    }
    return anyChecked;
  };

  traverse(treeData);
  return Array.from(result);
};

onMounted(() => {
  fetchData();
});
</script>
