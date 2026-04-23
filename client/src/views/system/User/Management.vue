<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import * as userApi from '@/api/system/user';
import * as roleApi from '@/api/system/role';
import * as securityApi from '@/api/system/security';
import * as authApi from '@/api/system/auth';
import { useAuthStore } from '@/store/auth';
import { getEmployees } from '@/api/master-data/employee';
import { getActiveDepartments } from '@/api/system/department';
import type { User, UserQueryParams } from '@/types';
import type { SecuritySetting, LoginLog } from '@/api/system/security';
import { ROLE_MAP, ROLE_COLORS, USER_STATUS_MAP, USER_STATUS_COLORS, DEFAULT_PAGE_SIZE } from '@/utils/constants';
import { EditOutlined, DeleteOutlined, PlusOutlined, LockOutlined, UnlockOutlined, KeyOutlined, SearchOutlined, StopOutlined, CheckCircleOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import dayjs from 'dayjs';
import type { Rule } from 'ant-design-vue/es/form';
import { useColumnPreference } from '@/composables/useColumnPreference';
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue';

// ========== Tab ==========
const activeTab = ref('users');

// ========== 用户管理 ==========
const loading = ref(false);
const users = ref<User[]>([]);
const total = ref(0);

// 行选择（单选）
const selectedRowKeys = ref<number[]>([]);
const selectedUser = computed<User | null>(() => {
  if (selectedRowKeys.value.length === 0) return null;
  return users.value.find(u => u.id === selectedRowKeys.value[0]) || null;
});
const rowSelection = computed(() => ({
  type: 'radio' as const,
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: number[]) => {
    selectedRowKeys.value = keys;
  }
}));

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
  employee_number: '',
  employee_name: '',
  role: 'staff',
  department: '',
  phone: '',
  status: 'active'
});

const createFormRules: Record<string, Rule[]> = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }, { min: 6, message: '密码至少6个字符', trigger: 'blur' }],
  phone: [{ required: true, message: '请输入手机号', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }]
};

const departmentList = ref<{ id: number; dept_name: string }[]>([]);
const rbacRoleList = ref<Array<{ id: number; role_name: string; role_code: string }>>([]);

const loadRoles = async () => {
  try {
    const res: any = await roleApi.getAllRoles();
    if (res.success) {
      rbacRoleList.value = res.data;
    }
  } catch (e) {
    console.error('Failed to load roles:', e);
  }
};
const employeeList = ref<{ employee_number: string; employee_name: string; department: string }[]>([]);

const loadDepartments = async () => {
  try {
    const res: any = await getActiveDepartments();
    if (res.success) {
      departmentList.value = res.data;
    }
  } catch (e) {
    console.error('Failed to load departments:', e);
  }
};

const loadEmployees = async () => {
  try {
    const res: any = await getEmployees({ limit: 9999 });
    if (res.success) {
      employeeList.value = res.data.items || res.data;
    }
  } catch (e) {
    console.error('Failed to load employees:', e);
  }
};

const handleEmployeeSelect = (employeeNumber: string) => {
  if (!employeeNumber) {
    createForm.employee_number = '';
    createForm.employee_name = '';
    createForm.real_name = '';
    createForm.department = '';
    return;
  }
  const emp = employeeList.value.find(e => e.employee_number === employeeNumber);
  if (emp) {
    createForm.employee_number = emp.employee_number;
    createForm.employee_name = emp.employee_name;
    createForm.real_name = emp.employee_name;
    createForm.department = emp.department || '';
  }
};

const searchTimeout = ref<number | null>(null);

const defaultDataColumns: any[] = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 80, resizable: true },
  { title: '用户名', dataIndex: 'username', key: 'username', width: 120, resizable: true },
  { title: '员工编号', dataIndex: 'employee_number', key: 'employee_number', width: 120, resizable: true },
  { title: '员工姓名', dataIndex: 'employee_name', key: 'employee_name', width: 120, resizable: true },
  { title: '真实姓名', dataIndex: 'real_name', key: 'real_name', width: 120, resizable: true },
  { title: '手机号', dataIndex: 'phone', key: 'phone', width: 140, resizable: true },
  { title: '邮箱', dataIndex: 'email', key: 'email', width: 180, ellipsis: true, resizable: true },
  { title: '角色', key: 'role', width: 160, resizable: true },
  { title: '部门', dataIndex: 'department', key: 'department', width: 120, resizable: true },
  { title: '状态', dataIndex: 'status', key: 'status', width: 100, resizable: true },
  { title: '创建时间', dataIndex: 'created_at', key: 'created_at', width: 180, resizable: true },
];

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('user_management', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 260, fixed: 'right' as const }]
});

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

const handleCreate = () => {
  Object.assign(createForm, {
    username: '', password: '', email: '', real_name: '',
    employee_number: '', employee_name: '', role: 'staff',
    department: '', phone: '', status: 'active'
  });
  createModalVisible.value = true;
};

const handleCreateSubmit = async () => {
  if (!createForm.username || !createForm.password) {
    message.warning('请填写用户名和密码');
    return;
  }
  if (createForm.password.length < 6) {
    message.warning('密码至少6个字符');
    return;
  }
  if (!createForm.phone) {
    message.warning('请填写手机号');
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

// 重置密码弹窗
const resetPasswordModalVisible = ref(false);
const resetPasswordForm = reactive({ userId: 0, username: '', newPassword: '' });
const handleResetPassword = (record: User) => {
  resetPasswordForm.userId = record.id;
  resetPasswordForm.username = record.username;
  resetPasswordForm.newPassword = '';
  resetPasswordModalVisible.value = true;
};
const handleResetPasswordSubmit = async () => {
  if (!resetPasswordForm.newPassword) {
    message.warning('请输入新密码');
    return;
  }
  try {
    const res: any = await securityApi.resetUserPassword(resetPasswordForm.userId, resetPasswordForm.newPassword);
    if (res.success) {
      message.success('密码重置成功');
      resetPasswordModalVisible.value = false;
    } else {
      message.error(res.message || '重置失败');
    }
  } catch (e: any) {
    message.error(e?.response?.data?.message || '重置密码失败');
  }
};

// 解锁用户
const handleUnlockUser = (record: User) => {
  Modal.confirm({
    title: '确认解锁',
    content: `确定要解锁用户 "${record.username}" 吗?`,
    okText: '解锁',
    cancelText: '取消',
    onOk: async () => {
      try {
        const res: any = await securityApi.unlockUser(record.id);
        if (res.success) {
          message.success('用户已解锁');
          fetchUsers();
        }
      } catch (e) {
        message.error('解锁失败');
      }
    }
  });
};

// 禁用用户
const handleDisableUser = (record: User) => {
  Modal.confirm({
    title: '确认禁用',
    content: `确定要禁用用户 "${record.username}" 吗？禁用后该用户将无法登录系统。`,
    okText: '禁用',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        const response: any = await userApi.updateUser(record.id, { status: 'disabled' });
        if (response.success) {
          message.success('用户已禁用');
          fetchUsers();
        }
      } catch (e) {
        message.error('禁用失败');
      }
    }
  });
};

// 启用用户（从禁用恢复为激活）
const handleEnableUser = (record: User) => {
  Modal.confirm({
    title: '确认启用',
    content: `确定要启用用户 "${record.username}" 吗？`,
    okText: '启用',
    cancelText: '取消',
    onOk: async () => {
      try {
        const response: any = await userApi.updateUser(record.id, { status: 'active' });
        if (response.success) {
          message.success('用户已启用');
          fetchUsers();
        }
      } catch (e) {
        message.error('启用失败');
      }
    }
  });
};

// ========== 登录日志 ==========
const logLoading = ref(false);
const loginLogs = ref<LoginLog[]>([]);
const logTotal = ref(0);
const logQuery = reactive({
  page: 1,
  limit: 10,
  username: '',
  status: undefined as string | undefined,
  start_date: '',
  end_date: ''
});

const logColumns = [
  { title: 'ID', dataIndex: 'id', key: 'id', width: 80 },
  { title: '用户名', dataIndex: 'username', key: 'username', width: 120 },
  { title: '登录时间', dataIndex: 'login_time', key: 'login_time', width: 180 },
  { title: 'IP地址', dataIndex: 'ip_address', key: 'ip_address', width: 140 },
  { title: '状态', dataIndex: 'status', key: 'log_status', width: 100 },
  { title: '失败原因', dataIndex: 'fail_reason', key: 'fail_reason', ellipsis: true },
  { title: '设备类型', dataIndex: 'device_type', key: 'device_type', width: 100 },
  { title: '设备ID', dataIndex: 'device_id', key: 'device_id', width: 220, ellipsis: true },
];

const fetchLoginLogs = async () => {
  logLoading.value = true;
  try {
    const params: any = { page: logQuery.page, limit: logQuery.limit };
    if (logQuery.username) params.username = logQuery.username;
    if (logQuery.status) params.status = logQuery.status;
    if (logQuery.start_date) params.start_date = logQuery.start_date;
    if (logQuery.end_date) params.end_date = logQuery.end_date;
    const res: any = await securityApi.getLoginLogs(params);
    if (res.success) {
      loginLogs.value = res.data.items;
      logTotal.value = res.data.pagination.total;
    }
  } catch (e) {
    console.error('Failed to fetch login logs:', e);
  } finally {
    logLoading.value = false;
  }
};

const handleLogTableChange = (pagination: any) => {
  logQuery.page = pagination.current;
  logQuery.limit = pagination.pageSize;
  fetchLoginLogs();
};

const handleLogSearch = () => {
  logQuery.page = 1;
  fetchLoginLogs();
};

const logDateRange = ref<[string, string] | null>(null);
const handleLogDateChange = (dates: any) => {
  if (dates && dates.length === 2) {
    logQuery.start_date = dayjs(dates[0]).format('YYYY-MM-DD');
    logQuery.end_date = dayjs(dates[1]).format('YYYY-MM-DD');
  } else {
    logQuery.start_date = '';
    logQuery.end_date = '';
  }
};

// ========== 安全设置 ==========
const settingsLoading = ref(false);
const settingsSaving = ref(false);
const securitySettings = ref<SecuritySetting[]>([]);

// 针对选中用户的安全操作
const authStore = useAuthStore();
const secResetPasswordLoading = ref(false);
const secResetPasswordForm = reactive({ newPassword: '', confirmPassword: '' });

// 重置选中用户密码
const handleSecResetPassword = async () => {
  if (!selectedUser.value) {
    message.warning('请先在用户列表中选择一个用户');
    return;
  }
  if (!secResetPasswordForm.newPassword) {
    message.warning('请输入新密码');
    return;
  }
  if (secResetPasswordForm.newPassword.length < 6) {
    message.warning('新密码长度不能少于6个字符');
    return;
  }
  if (secResetPasswordForm.newPassword !== secResetPasswordForm.confirmPassword) {
    message.warning('两次输入的新密码不一致');
    return;
  }

  secResetPasswordLoading.value = true;
  try {
    const res: any = await securityApi.resetUserPassword(selectedUser.value.id, secResetPasswordForm.newPassword);
    if (res.success) {
      message.success(`用户 "${selectedUser.value.username}" 的密码已重置成功`);
      secResetPasswordForm.newPassword = '';
      secResetPasswordForm.confirmPassword = '';
    } else {
      message.error(res.message || '重置失败');
    }
  } catch (e: any) {
    message.error(e?.response?.data?.message || '重置密码失败');
  } finally {
    secResetPasswordLoading.value = false;
  }
};

// 解锁选中用户
const handleSecUnlockUser = async () => {
  if (!selectedUser.value) return;
  try {
    const res: any = await securityApi.unlockUser(selectedUser.value.id);
    if (res.success) {
      message.success(`用户 "${selectedUser.value.username}" 已解锁`);
      fetchUsers();
    }
  } catch (e) {
    message.error('解锁失败');
  }
};

// 禁用选中用户
const handleSecDisableUser = async () => {
  if (!selectedUser.value) return;
  Modal.confirm({
    title: '确认禁用',
    content: `确定要禁用用户 "${selectedUser.value.username}" 吗？禁用后该用户将无法登录系统。`,
    okText: '禁用',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        const response: any = await userApi.updateUser(selectedUser.value!.id, { status: 'disabled' });
        if (response.success) {
          message.success('用户已禁用');
          fetchUsers();
        }
      } catch (e) {
        message.error('禁用失败');
      }
    }
  });
};

// 启用选中用户
const handleSecEnableUser = async () => {
  if (!selectedUser.value) return;
  Modal.confirm({
    title: '确认启用',
    content: `确定要启用用户 "${selectedUser.value.username}" 吗？`,
    okText: '启用',
    cancelText: '取消',
    onOk: async () => {
      try {
        const response: any = await userApi.updateUser(selectedUser.value!.id, { status: 'active' });
        if (response.success) {
          message.success('用户已启用');
          fetchUsers();
        }
      } catch (e) {
        message.error('启用失败');
      }
    }
  });
};

// 选中用户是否被锁定
const isSelectedUserLocked = computed(() => {
  if (!selectedUser.value) return false;
  return !!(selectedUser.value.locked_until && new Date(selectedUser.value.locked_until) > new Date());
});

const settingsForm = reactive({
  password_min_length: '6',
  password_require_uppercase: 'false',
  password_require_lowercase: 'false',
  password_require_number: 'false',
  password_require_special: 'false',
  login_max_attempts: '5',
  login_lock_duration: '30',
  login_log_enabled: 'true'
});

const settingsLabels: Record<string, string> = {
  password_min_length: '密码最小长度',
  password_require_uppercase: '需要大写字母',
  password_require_lowercase: '需要小写字母',
  password_require_number: '需要数字',
  password_require_special: '需要特殊字符',
  login_max_attempts: '最大登录失败次数',
  login_lock_duration: '账户锁定时长(分钟)',
  login_log_enabled: '启用登录日志'
};

const fetchSecuritySettings = async () => {
  settingsLoading.value = true;
  try {
    const res: any = await securityApi.getSecuritySettings();
    if (res.success) {
      securitySettings.value = res.data;
      for (const item of res.data) {
        if (item.setting_key in settingsForm) {
          (settingsForm as any)[item.setting_key] = item.setting_value;
        }
      }
    }
  } catch (e) {
    console.error('Failed to fetch security settings:', e);
  } finally {
    settingsLoading.value = false;
  }
};

const handleSaveSettings = async () => {
  settingsSaving.value = true;
  try {
    const settings = Object.entries(settingsForm).map(([key, value]) => ({
      setting_key: key,
      setting_value: String(value)
    }));
    const res: any = await securityApi.updateSecuritySettings(settings);
    if (res.success) {
      message.success('安全设置保存成功');
    } else {
      message.error(res.message || '保存失败');
    }
  } catch (e) {
    message.error('保存安全设置失败');
  } finally {
    settingsSaving.value = false;
  }
};

// ========== Tab 切换加载 ==========
watch(activeTab, (tab) => {
  if (tab === 'login-logs' && loginLogs.value.length === 0) {
    fetchLoginLogs();
  } else if (tab === 'security' && securitySettings.value.length === 0) {
    fetchSecuritySettings();
  }
});

onMounted(() => {
  loadColumnPreference();
  fetchUsers();
  loadDepartments();
  loadEmployees();
});
</script>

<template>
  <div class="user-management-container">
    <a-tabs v-model:activeKey="activeTab">
      <!-- ========== Tab 1: 用户管理 ========== -->
      <a-tab-pane key="users" tab="用户管理">
        <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
          <a-space wrap>
            <a-select v-model:value="queryParams.role" placeholder="筛选角色" style="width: 120px;" allow-clear @change="handleRoleChange">
              <a-select-option value="admin">管理员</a-select-option>
              <a-select-option value="manager">经理</a-select-option>
              <a-select-option value="staff">员工</a-select-option>
            </a-select>
            <a-select v-model:value="queryParams.status" placeholder="筛选状态" style="width: 120px;" allow-clear @change="handleStatusChange">
              <a-select-option value="active">激活</a-select-option>
              <a-select-option value="inactive">停用</a-select-option>
              <a-select-option value="disabled">禁用</a-select-option>
            </a-select>
            <a-input-search v-model:value="queryParams.search" placeholder="搜索用户名或姓名" style="width: 300px;" @search="handleSearch" @change="e => handleSearch(e.target.value)" />
          </a-space>
          <a-space>
            <a-button @click="openColumnSetting">
              <template #icon><SettingOutlined /></template>
              列设置
            </a-button>
            <a-button type="primary" @click="handleCreate">
              <template #icon><PlusOutlined /></template>
              新增
            </a-button>
          </a-space>
        </div>

        <a-table
          :columns="columns"
          :data-source="users"
          :loading="loading"
          :row-selection="rowSelection"
          :pagination="{ current: queryParams.page, pageSize: queryParams.limit, total: total, showSizeChanger: true, showTotal: (total: number) => `共 ${total} 条` }"
          :scroll="{ x: 'max-content' }"
          row-key="id"
          size="middle"
          bordered
          @change="handleTableChange"
          @resizeColumn="handleResizeColumn"
        >
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.key === 'rowIndex'">
              {{ (queryParams.page - 1) * queryParams.limit + index + 1 }}
            </template>
            <template v-else-if="column.key === 'employee_number'">
              {{ record.employee_number || '-' }}
            </template>
            <template v-else-if="column.key === 'employee_name'">
              {{ record.employee_name || '-' }}
            </template>
            <template v-else-if="column.key === 'role'">
              <a-tag :color="ROLE_COLORS[record.role]">{{ ROLE_MAP[record.role] }}</a-tag>
            </template>
            <template v-else-if="column.key === 'department'">
              {{ record.department || '-' }}
            </template>
            <template v-else-if="column.key === 'status'">
              <a-badge :status="USER_STATUS_COLORS[record.status]" :text="USER_STATUS_MAP[record.status]" />
              <a-tag v-if="record.locked_until && new Date(record.locked_until) > new Date()" color="red" style="margin-left: 4px;">已锁定</a-tag>
            </template>
            <template v-else-if="column.key === 'created_at'">
              {{ dayjs(record.created_at).format('YYYY-MM-DD HH:mm:ss') }}
            </template>
            <template v-else-if="column.key === 'action'">
              <a-space>
                <a-button type="link" size="small" @click="handleEdit(record)">
                  <template #icon><EditOutlined /></template>
                  编辑
                </a-button>
                <a-tooltip title="重置密码">
                  <a-button type="link" size="small" @click="handleResetPassword(record)">
                    <template #icon><KeyOutlined /></template>
                  </a-button>
                </a-tooltip>
                <a-tooltip v-if="record.locked_until && new Date(record.locked_until) > new Date()" title="解锁">
                  <a-button type="link" size="small" style="color: #fa8c16;" @click="handleUnlockUser(record)">
                    <template #icon><UnlockOutlined /></template>
                  </a-button>
                </a-tooltip>
                <a-button v-if="record.status === 'active'" type="link" size="small" danger @click="handleDisableUser(record)">
                  <template #icon><StopOutlined /></template>
                  禁用
                </a-button>
                <a-button v-if="record.status === 'disabled'" type="link" size="small" style="color: #52c41a;" @click="handleEnableUser(record)">
                  <template #icon><CheckCircleOutlined /></template>
                  启用
                </a-button>
                <a-button v-if="record.status === 'inactive'" type="link" danger size="small" @click="handleDelete(record)">
                  <template #icon><DeleteOutlined /></template>
                  删除
                </a-button>
              </a-space>
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <!-- ========== Tab 2: 登录日志 ========== -->
      <a-tab-pane key="login-logs" tab="登录日志">
        <div style="margin-bottom: 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap;">
          <a-input v-model:value="logQuery.username" placeholder="用户名" style="width: 150px;" allow-clear />
          <a-select v-model:value="logQuery.status" placeholder="状态" style="width: 120px;" allow-clear>
            <a-select-option value="success">成功</a-select-option>
            <a-select-option value="failed">失败</a-select-option>
          </a-select>
          <a-range-picker v-model:value="logDateRange" @change="handleLogDateChange" />
          <a-button type="primary" @click="handleLogSearch">
            <template #icon><SearchOutlined /></template>
            查询
          </a-button>
        </div>

        <a-table
          :columns="logColumns"
          :data-source="loginLogs"
          :loading="logLoading"
          :pagination="{ current: logQuery.page, pageSize: logQuery.limit, total: logTotal, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }"
          row-key="id"
          @change="handleLogTableChange"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'login_time'">
              {{ dayjs(record.login_time).format('YYYY-MM-DD HH:mm:ss') }}
            </template>
            <template v-else-if="column.key === 'log_status'">
              <a-tag :color="record.status === 'success' ? 'green' : 'red'">
                {{ record.status === 'success' ? '成功' : '失败' }}
              </a-tag>
            </template>
            <template v-else-if="column.key === 'device_type'">
              <a-tag>{{ record.device_type || '未知' }}</a-tag>
            </template>
          </template>
        </a-table>
      </a-tab-pane>

      <!-- ========== Tab 3: 安全设置 ========== -->
      <a-tab-pane key="security" tab="安全设置">
        <a-spin :spinning="settingsLoading">
          <!-- 选中用户安全操作 -->
          <a-card style="margin-bottom: 16px;">
            <template #title>
              <span>用户安全操作</span>
              <span v-if="selectedUser" style="margin-left: 12px; font-weight: normal; color: #1890ff;">
                <UserOutlined /> {{ selectedUser.username }}
                <span style="color: #999; margin-left: 4px;">({{ selectedUser.real_name || selectedUser.employee_name || '-' }})</span>
                <a-tag :color="USER_STATUS_COLORS[selectedUser.status]" style="margin-left: 8px;">{{ USER_STATUS_MAP[selectedUser.status] }}</a-tag>
                <a-tag v-if="isSelectedUserLocked" color="red" style="margin-left: 4px;">已锁定</a-tag>
              </span>
            </template>

            <template v-if="!selectedUser">
              <a-empty description="请先在用户列表中选择一个用户" :image-style="{ height: '60px' }" />
            </template>

            <template v-else>
              <!-- 重置密码 -->
              <div style="margin-bottom: 24px;">
                <h4 style="margin-bottom: 12px; color: #333;"><KeyOutlined style="margin-right: 6px;" />重置密码</h4>
                <a-form layout="inline">
                  <a-form-item label="新密码">
                    <a-input-password v-model:value="secResetPasswordForm.newPassword" placeholder="请输入新密码" style="width: 200px;" />
                  </a-form-item>
                  <a-form-item label="确认密码">
                    <a-input-password v-model:value="secResetPasswordForm.confirmPassword" placeholder="请再次输入新密码" style="width: 200px;" />
                  </a-form-item>
                  <a-form-item>
                    <a-button type="primary" :loading="secResetPasswordLoading" @click="handleSecResetPassword">重置密码</a-button>
                  </a-form-item>
                </a-form>
              </div>

              <a-divider style="margin: 16px 0;" />

              <!-- 账户操作 -->
              <div>
                <h4 style="margin-bottom: 12px; color: #333;"><LockOutlined style="margin-right: 6px;" />账户操作</h4>
                <a-space>
                  <a-button v-if="isSelectedUserLocked" type="primary" ghost @click="handleSecUnlockUser">
                    <UnlockOutlined /> 解锁账户
                  </a-button>
                  <a-button v-if="selectedUser.status === 'active'" danger @click="handleSecDisableUser">
                    <StopOutlined /> 禁用账户
                  </a-button>
                  <a-button v-if="selectedUser.status === 'disabled'" type="primary" ghost style="color: #52c41a; border-color: #52c41a;" @click="handleSecEnableUser">
                    <CheckCircleOutlined /> 启用账户
                  </a-button>
                </a-space>
              </div>
            </template>
          </a-card>

          <a-card title="密码策略" style="margin-bottom: 16px;">
            <a-form layout="horizontal" :label-col="{ span: 6 }" :wrapper-col="{ span: 10 }">
              <a-form-item label="密码最小长度">
                <a-input-number v-model:value="settingsForm.password_min_length" :min="4" :max="32" style="width: 100%;" />
              </a-form-item>
              <a-form-item label="需要大写字母">
                <a-switch :checked="settingsForm.password_require_uppercase === 'true'" @change="(v: boolean) => settingsForm.password_require_uppercase = v ? 'true' : 'false'" />
              </a-form-item>
              <a-form-item label="需要小写字母">
                <a-switch :checked="settingsForm.password_require_lowercase === 'true'" @change="(v: boolean) => settingsForm.password_require_lowercase = v ? 'true' : 'false'" />
              </a-form-item>
              <a-form-item label="需要数字">
                <a-switch :checked="settingsForm.password_require_number === 'true'" @change="(v: boolean) => settingsForm.password_require_number = v ? 'true' : 'false'" />
              </a-form-item>
              <a-form-item label="需要特殊字符">
                <a-switch :checked="settingsForm.password_require_special === 'true'" @change="(v: boolean) => settingsForm.password_require_special = v ? 'true' : 'false'" />
              </a-form-item>
            </a-form>
          </a-card>

          <a-card title="登录安全" style="margin-bottom: 16px;">
            <a-form layout="horizontal" :label-col="{ span: 6 }" :wrapper-col="{ span: 10 }">
              <a-form-item label="最大登录失败次数">
                <a-input-number v-model:value="settingsForm.login_max_attempts" :min="1" :max="20" style="width: 100%;" />
              </a-form-item>
              <a-form-item label="账户锁定时长(分钟)">
                <a-input-number v-model:value="settingsForm.login_lock_duration" :min="1" :max="1440" style="width: 100%;" />
              </a-form-item>
              <a-form-item label="启用登录日志">
                <a-switch :checked="settingsForm.login_log_enabled === 'true'" @change="(v: boolean) => settingsForm.login_log_enabled = v ? 'true' : 'false'" />
              </a-form-item>
            </a-form>
          </a-card>

          <div style="text-align: right;">
            <a-button type="primary" :loading="settingsSaving" @click="handleSaveSettings">保存设置</a-button>
          </div>
        </a-spin>
      </a-tab-pane>
    </a-tabs>

    <!-- Edit Modal -->
    <a-modal v-model:open="editModalVisible" title="编辑用户" @ok="handleEditSubmit" ok-text="保存" cancel-text="取消">
      <a-form :model="editForm" :rules="editFormRules" layout="vertical">
        <a-form-item name="role" label="角色">
          <a-select v-model:value="editForm.role">
            <a-select-option value="admin">管理员</a-select-option>
            <a-select-option value="manager">经理</a-select-option>
            <a-select-option value="staff">员工</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item name="department" label="部门">
          <a-select v-model:value="editForm.department" placeholder="请选择部门" allow-clear show-search :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())">
            <a-select-option v-for="dept in departmentList" :key="dept.id" :value="dept.dept_name" :label="dept.dept_name">{{ dept.dept_name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item name="status" label="状态">
          <a-radio-group v-model:value="editForm.status">
            <a-radio value="active">激活</a-radio>
            <a-radio value="inactive">停用</a-radio>
            <a-radio value="disabled">禁用</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Create Modal -->
    <a-modal v-model:open="createModalVisible" title="新增用户" :confirm-loading="createLoading" @ok="handleCreateSubmit" ok-text="创建" cancel-text="取消" width="500px">
      <a-form :model="createForm" :rules="createFormRules" layout="vertical">
        <a-form-item name="username" label="用户名" required>
          <a-input v-model:value="createForm.username" placeholder="请输入用户名" />
        </a-form-item>
        <a-form-item name="password" label="密码" required>
          <a-input-password v-model:value="createForm.password" placeholder="请输入密码（至少6个字符）" />
        </a-form-item>
        <a-form-item name="employee_number" label="选择员工">
          <a-select v-model:value="createForm.employee_number" placeholder="请选择员工（自动填充姓名、部门）" allow-clear show-search :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())" @change="handleEmployeeSelect">
            <a-select-option v-for="emp in employeeList" :key="emp.employee_number" :value="emp.employee_number" :label="emp.employee_number + ' ' + emp.employee_name">{{ emp.employee_number }} - {{ emp.employee_name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item name="employee_name" label="员工姓名">
          <a-input v-model:value="createForm.employee_name" disabled placeholder="选择员工后自动填充" />
        </a-form-item>
        <a-form-item name="real_name" label="真实姓名">
          <a-input v-model:value="createForm.real_name" placeholder="选择员工后自动填充" />
        </a-form-item>
        <a-form-item name="email" label="邮箱">
          <a-input v-model:value="createForm.email" placeholder="请输入邮箱（选填）" />
        </a-form-item>
        <a-form-item name="phone" label="手机号" required>
          <a-input v-model:value="createForm.phone" placeholder="请输入手机号" />
        </a-form-item>
        <a-form-item name="role" label="角色" required>
          <a-select v-model:value="createForm.role">
            <a-select-option value="admin">管理员</a-select-option>
            <a-select-option value="manager">经理</a-select-option>
            <a-select-option value="staff">员工</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item name="department" label="部门">
          <a-select v-model:value="createForm.department" placeholder="请选择部门" allow-clear show-search :filter-option="(input: string, option: any) => option.label?.toLowerCase().includes(input.toLowerCase())">
            <a-select-option v-for="dept in departmentList" :key="dept.id" :value="dept.dept_name" :label="dept.dept_name">{{ dept.dept_name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item name="status" label="状态">
          <a-radio-group v-model:value="createForm.status">
            <a-radio value="active">激活</a-radio>
            <a-radio value="inactive">停用</a-radio>
            <a-radio value="disabled">禁用</a-radio>
          </a-radio-group>
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Reset Password Modal -->
    <a-modal v-model:open="resetPasswordModalVisible" title="重置密码" @ok="handleResetPasswordSubmit" ok-text="确认重置" cancel-text="取消">
      <p>用户: <strong>{{ resetPasswordForm.username }}</strong></p>
      <a-form layout="vertical">
        <a-form-item label="新密码" required>
          <a-input-password v-model:value="resetPasswordForm.newPassword" placeholder="请输入新密码" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- Column Setting Drawer -->
    <ColumnSettingDrawer
      :open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @update:open="columnSettingVisible = $event"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />
  </div>
</template>

<style scoped>
.user-management-container {
  background: #fff;
  border-radius: 8px;
  padding: 16px;
}
</style>
