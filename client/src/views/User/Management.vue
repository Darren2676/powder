<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import * as userApi from '@/api/user';
import type { User, UserQueryParams } from '@/types';
import { ROLE_MAP, ROLE_COLORS, USER_STATUS_MAP, USER_STATUS_COLORS, DEFAULT_PAGE_SIZE } from '@/utils/constants';
import { EditOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import dayjs from 'dayjs';
import type { Rule } from 'ant-design-vue/es/form';

const loading = ref(false);
const users = ref<User[]>([]);
const total = ref(0);

const queryParams = reactive<UserQueryParams>({
  page: 1,
  limit: DEFAULT_PAGE_SIZE,
  role: undefined,
  status: undefined,
  search: ''
});

const editModalVisible = ref(false);
const editForm = reactive<Partial<User>>({
  id: undefined,
  role: undefined,
  department: '',
  status: 'active'
});

const editFormRules: Record<string, Rule[]> = {
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }]
};

// 新增弹窗相关
const createModalVisible = ref(false);
const createLoading = ref(false);
const createForm = reactive({
  username: '',
  password: '',
  email: '',
  real_name: '',
  role: 'staff',
  department: '',
  phone: '',
  status: 'active'
});

const createFormRules: Record<string, Rule[]> = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }, { min: 6, message: '密码至少6个字符', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }]
};

const searchTimeout = ref<number | null>(null);

const columns = [
  {
    title: 'ID',
    dataIndex: 'id',
    key: 'id',
    width: 80
  },
  {
    title: '用户名',
    dataIndex: 'username',
    key: 'username',
    width: 120
  },
  {
    title: '真实姓名',
    dataIndex: 'real_name',
    key: 'real_name',
    width: 120
  },
  {
    title: '邮箱',
    dataIndex: 'email',
    key: 'email',
    ellipsis: true
  },
  {
    title: '角色',
    dataIndex: 'role',
    key: 'role',
    width: 100
  },
  {
    title: '部门',
    dataIndex: 'department',
    key: 'department',
    width: 120
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 100
  },
  {
    title: '创建时间',
    dataIndex: 'created_at',
    key: 'created_at',
    width: 180
  },
  {
    title: '操作',
    key: 'action',
    fixed: 'right',
    width: 160
  }
];

const fetchUsers = async () => {
  loading.value = true;
  try {
    const response: any = await userApi.getUsers(queryParams);
    if (response.success) {
      users.value = response.data.items;
      total.value = response.data.pagination.total;
    }
  } catch (error) {
    console.error('Failed to fetch users:', error);
  } finally {
    loading.value = false;
  }
};

const handleTableChange = (pagination: any) => {
  queryParams.page = pagination.current;
  queryParams.limit = pagination.pageSize;
  fetchUsers();
};

const handleSearch = (value: string) => {
  if (searchTimeout.value) {
    clearTimeout(searchTimeout.value);
  }
  
  searchTimeout.value = window.setTimeout(() => {
    queryParams.search = value;
    queryParams.page = 1;
    fetchUsers();
  }, 500);
};

const handleRoleChange = (value: string) => {
  queryParams.role = value || undefined;
  queryParams.page = 1;
  fetchUsers();
};

const handleStatusChange = (value: string) => {
  queryParams.status = value || undefined;
  queryParams.page = 1;
  fetchUsers();
};

const handleEdit = (record: User) => {
  editForm.id = record.id;
  editForm.role = record.role;
  editForm.department = record.department;
  editForm.status = record.status;
  editModalVisible.value = true;
};

const handleEditSubmit = async () => {
  if (!editForm.id) return;

  try {
    const response: any = await userApi.updateUser(editForm.id, {
      role: editForm.role,
      department: editForm.department,
      status: editForm.status
    });
    
    if (response.success) {
      message.success('更新成功');
      editModalVisible.value = false;
      fetchUsers();
    }
  } catch (error) {
    console.error('Failed to update user:', error);
  }
};

const handleDelete = (record: User) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除用户 "${record.username}" 吗?此操作不可恢复。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        const response: any = await userApi.deleteUser(record.id);
        if (response.success) {
          message.success('删除成功');
          fetchUsers();
        }
      } catch (error) {
        console.error('Failed to delete user:', error);
      }
    }
  });
};

// 打开新增弹窗
const handleCreate = () => {
  Object.assign(createForm, {
    username: '',
    password: '',
    email: '',
    real_name: '',
    role: 'staff',
    department: '',
    phone: '',
    status: 'active'
  });
  createModalVisible.value = true;
};

// 提交新增
const handleCreateSubmit = async () => {
  if (!createForm.username || !createForm.password) {
    message.warning('请填写用户名和密码');
    return;
  }
  if (createForm.password.length < 6) {
    message.warning('密码至少6个字符');
    return;
  }
  
  createLoading.value = true;
  try {
    const response: any = await userApi.createUser(createForm);
    if (response.success) {
      message.success('创建用户成功');
      createModalVisible.value = false;
      fetchUsers();
    } else {
      message.error(response.message || '创建失败');
    }
  } catch (error: any) {
    message.error('创建用户失败');
  } finally {
    createLoading.value = false;
  }
};

onMounted(() => {
  fetchUsers();
});
</script>

<template>
  <div class="user-management-container">
    <a-card title="用户管理">
      <!-- Filter Bar -->
      <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
        <a-space wrap>
          <a-select
            v-model:value="queryParams.role"
            placeholder="筛选角色"
            style="width: 120px;"
            allow-clear
            @change="handleRoleChange"
          >
            <a-select-option value="admin">管理员</a-select-option>
            <a-select-option value="manager">经理</a-select-option>
            <a-select-option value="staff">员工</a-select-option>
          </a-select>

          <a-select
            v-model:value="queryParams.status"
            placeholder="筛选状态"
            style="width: 120px;"
            allow-clear
            @change="handleStatusChange"
          >
            <a-select-option value="active">激活</a-select-option>
            <a-select-option value="inactive">停用</a-select-option>
          </a-select>

          <a-input-search
            v-model:value="queryParams.search"
            placeholder="搜索用户名或姓名"
            style="width: 300px;"
            @search="handleSearch"
            @change="e => handleSearch(e.target.value)"
          />
        </a-space>

        <a-button type="primary" @click="handleCreate">
          <template #icon><PlusOutlined /></template>
          新增
        </a-button>
      </div>

      <!-- Table -->
      <a-table
        :columns="columns"
        :data-source="users"
        :loading="loading"
        :pagination="{
          current: queryParams.page,
          pageSize: queryParams.limit,
          total: total,
          showSizeChanger: true,
          showTotal: (total: number) => `共 ${total} 条`
        }"
        :scroll="{ x: 1200 }"
        row-key="id"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'role'">
            <a-tag :color="ROLE_COLORS[record.role]">
              {{ ROLE_MAP[record.role] }}
            </a-tag>
          </template>

          <template v-else-if="column.key === 'department'">
            {{ record.department || '-' }}
          </template>

          <template v-else-if="column.key === 'status'">
            <a-badge :status="USER_STATUS_COLORS[record.status]" :text="USER_STATUS_MAP[record.status]" />
          </template>

          <template v-else-if="column.key === 'created_at'">
            {{ dayjs(record.created_at).format('YYYY-MM-DD HH:mm:ss') }}
          </template>

          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleEdit(record)">
                <template #icon>
                  <EditOutlined />
                </template>
                编辑
              </a-button>
              <a-button type="link" danger size="small" @click="handleDelete(record)">
                <template #icon>
                  <DeleteOutlined />
                </template>
                删除
              </a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- Edit Modal -->
    <a-modal
      v-model:open="editModalVisible"
      title="编辑用户"
      @ok="handleEditSubmit"
      ok-text="保存"
      cancel-text="取消"
    >
      <a-form
        :model="editForm"
        :rules="editFormRules"
        layout="vertical"
      >
        <a-form-item name="role" label="角色">
          <a-select v-model:value="editForm.role">
            <a-select-option value="admin">管理员</a-select-option>
            <a-select-option value="manager">经理</a-select-option>
            <a-select-option value="staff">员工</a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item name="department" label="部门">
          <a-input v-model:value="editForm.department" placeholder="请输入部门" />
        </a-form-item>

        <a-form-item name="status" label="状态">
          <a-radio-group v-model:value="editForm.status">
            <a-radio value="active">激活</a-radio>
            <a-radio value="inactive">停用</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Create Modal -->
    <a-modal
      v-model:open="createModalVisible"
      title="新增用户"
      :confirm-loading="createLoading"
      @ok="handleCreateSubmit"
      ok-text="创建"
      cancel-text="取消"
      width="500px"
    >
      <a-form
        :model="createForm"
        :rules="createFormRules"
        layout="vertical"
      >
        <a-form-item name="username" label="用户名" required>
          <a-input v-model:value="createForm.username" placeholder="请输入用户名" />
        </a-form-item>

        <a-form-item name="password" label="密码" required>
          <a-input-password v-model:value="createForm.password" placeholder="请输入密码（至少6个字符）" />
        </a-form-item>

        <a-form-item name="real_name" label="真实姓名">
          <a-input v-model:value="createForm.real_name" placeholder="请输入真实姓名" />
        </a-form-item>

        <a-form-item name="email" label="邮箱">
          <a-input v-model:value="createForm.email" placeholder="请输入邮箱" />
        </a-form-item>

        <a-form-item name="phone" label="电话">
          <a-input v-model:value="createForm.phone" placeholder="请输入电话" />
        </a-form-item>

        <a-form-item name="role" label="角色" required>
          <a-select v-model:value="createForm.role">
            <a-select-option value="admin">管理员</a-select-option>
            <a-select-option value="manager">经理</a-select-option>
            <a-select-option value="staff">员工</a-select-option>
          </a-select>
        </a-form-item>

        <a-form-item name="department" label="部门">
          <a-input v-model:value="createForm.department" placeholder="请输入部门" />
        </a-form-item>

        <a-form-item name="status" label="状态">
          <a-radio-group v-model:value="createForm.status">
            <a-radio value="active">激活</a-radio>
            <a-radio value="inactive">停用</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.user-management-container {
  background: #fff;
  border-radius: 8px;
}
</style>
