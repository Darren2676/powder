<template>
  <div>
    <a-page-header title="API密钥管理" style="padding: 0; margin-bottom: 16px;">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索名称/客户端"
            style="width: 200px"
            allow-clear
            @search="fetchData"
          />
          <a-button @click="openColumnSetting"><SettingOutlined /> 列设置</a-button>
          <a-button type="primary" @click="handleCreate"><PlusOutlined /> 新建密钥</a-button>
        </a-space>
      </template>
    </a-page-header>

    <a-card :bordered="false" size="small">
      <a-table
        :columns="columns"
        :data-source="filteredList"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 'max-content' }"
        row-key="id"
        size="small"
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-if="column.key === 'api_key_masked'">
            <a-typography-text code style="font-size: 12px;">{{ record.api_key_masked }}</a-typography-text>
          </template>
          <template v-if="column.key === 'permissions'">
            <a-space :size="4" wrap>
              <a-tag v-if="record.perm_order_read || record.perm_order_write" color="blue" style="font-size: 11px;">
                工单{{ record.perm_order_write ? '读写' : '读' }}
              </a-tag>
              <a-tag v-if="record.perm_work_report_read || record.perm_work_report_write" color="green" style="font-size: 11px;">
                报工{{ record.perm_work_report_write ? '读写' : '读' }}
              </a-tag>
              <a-tag v-if="record.perm_prep_read || record.perm_prep_write" color="orange" style="font-size: 11px;">
                备料{{ record.perm_prep_write ? '读写' : '读' }}
              </a-tag>
              <a-tag v-if="record.perm_bom_read || record.perm_bom_write" color="purple" style="font-size: 11px;">
                BOM{{ record.perm_bom_write ? '读写' : '读' }}
              </a-tag>
            </a-space>
          </template>
          <template v-if="column.key === 'is_active'">
            <a-badge :status="record.is_active ? 'success' : 'error'" :text="record.is_active ? '启用' : '禁用'" />
          </template>
          <template v-if="column.key === 'expires_at'">
            <span v-if="!record.expires_at" style="color: #52c41a;">永不过期</span>
            <span v-else-if="isExpired(record.expires_at)" style="color: #ff4d4f;">{{ record.expires_at }}</span>
            <span v-else style="color: #faad14;">{{ record.expires_at }}</span>
          </template>
          <template v-if="column.key === 'last_used_at'">
            <span v-if="record.last_used_at">{{ record.last_used_at }}</span>
            <span v-else style="color: #999;">从未使用</span>
          </template>
          <template v-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleEdit(record)">编辑</a-button>
              <a-button type="link" size="small" @click="handleViewUsage(record)">日志</a-button>
              <a-dropdown>
                <a-button type="link" size="small">更多<DownOutlined /></a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item @click="handleRegenerate(record)">
                      <SyncOutlined /> 重新生成
                    </a-menu-item>
                    <a-menu-item v-if="record.is_active" @click="handleToggleActive(record, false)">
                      <StopOutlined /> 禁用
                    </a-menu-item>
                    <a-menu-item v-else @click="handleToggleActive(record, true)">
                      <CheckCircleOutlined /> 启用
                    </a-menu-item>
                    <a-menu-item danger>
                      <a-popconfirm title="确定删除此密钥？删除后不可恢复" @confirm="handleDelete(record)">
                        <span><DeleteOutlined /> 删除</span>
                      </a-popconfirm>
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 新建/编辑弹窗 -->
    <a-modal
      v-model:open="modalVisible"
      :title="editingKey ? '编辑API密钥' : '新建API密钥'"
      @ok="handleModalOk"
      :confirm-loading="modalLoading"
      width="600px"
    >
      <a-form :model="formState" :label-col="{ span: 5 }" :wrapper-col="{ span: 18 }" style="margin-top: 16px;">
        <a-form-item label="密钥名称" required>
          <a-input v-model:value="formState.key_name" placeholder="如：ERP系统对接" />
        </a-form-item>
        <a-form-item label="客户端名称" required>
          <a-input v-model:value="formState.client_name" placeholder="如：XX科技有限公司" />
        </a-form-item>
        <a-form-item label="描述">
          <a-textarea v-model:value="formState.description" placeholder="用途说明" :rows="2" />
        </a-form-item>
        <a-form-item label="访问权限">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div v-for="mod in permissionModules" :key="mod.key" style="border: 1px solid #f0f0f0; border-radius: 4px; padding: 8px 12px;">
              <div style="font-weight: 500; margin-bottom: 6px;">{{ mod.label }}</div>
              <a-checkbox v-model:checked="formState[mod.readKey]">读取</a-checkbox>
              <a-checkbox v-model:checked="formState[mod.writeKey]" style="margin-left: 12px;">写入</a-checkbox>
            </div>
          </div>
        </a-form-item>
        <a-form-item label="频率限制">
          <a-input-number v-model:value="formState.rate_limit" :min="10" :max="10000" style="width: 160px;" />
          <span style="margin-left: 8px; color: #999;">次/分钟</span>
        </a-form-item>
        <a-form-item label="IP白名单">
          <a-textarea v-model:value="formState.allowed_ips" placeholder="留空=不限制，多个IP用逗号分隔" :rows="2" />
        </a-form-item>
        <a-form-item label="过期时间">
          <a-date-picker
            v-model:value="formState.expires_at"
            show-time
            style="width: 100%;"
            placeholder="留空=永不过期"
            value-format="YYYY-MM-DD HH:mm:ss"
          />
        </a-form-item>
        <a-form-item v-if="editingKey" label="状态">
          <a-switch v-model:checked="formState.is_active" checked-children="启用" un-checked-children="禁用" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 密钥创建成功提示 -->
    <a-modal
      v-model:open="keyCreatedVisible"
      title="密钥创建成功"
      :footer="null"
      width="520px"
      :closable="true"
      :maskClosable="false"
    >
      <a-alert type="warning" show-icon style="margin-bottom: 16px;">
        <template #message>请立即复制并妥善保管此密钥，关闭后无法再次查看完整密钥！</template>
      </a-alert>
      <a-typography-paragraph :copyable="{ text: newKeyValue }" style="margin-bottom: 0;">
        <a-typography-text code style="word-break: break-all; font-size: 13px;">{{ newKeyValue }}</a-typography-text>
      </a-typography-paragraph>
      <div style="text-align: right; margin-top: 16px;">
        <a-button type="primary" @click="keyCreatedVisible = false">我已复制保管</a-button>
      </div>
    </a-modal>

    <!-- 密钥重新生成提示 -->
    <a-modal
      v-model:open="regeneratedVisible"
      title="密钥已重新生成"
      :footer="null"
      width="520px"
      :closable="true"
      :maskClosable="false"
    >
      <a-alert type="warning" show-icon style="margin-bottom: 16px;">
        <template #message>旧密钥已失效，请立即复制新密钥并更新第三方配置！</template>
      </a-alert>
      <a-typography-paragraph :copyable="{ text: regeneratedValue }" style="margin-bottom: 0;">
        <a-typography-text code style="word-break: break-all; font-size: 13px;">{{ regeneratedValue }}</a-typography-text>
      </a-typography-paragraph>
      <div style="text-align: right; margin-top: 16px;">
        <a-button type="primary" @click="regeneratedVisible = false">我已复制保管</a-button>
      </div>
    </a-modal>

    <!-- 调用日志弹窗 -->
    <a-modal
      v-model:open="usageModalVisible"
      :title="`调用日志 - ${usageKeyName}`"
      :footer="null"
      width="900px"
    >
      <a-table
        :columns="usageColumns"
        :data-source="usageList"
        :loading="usageLoading"
        :pagination="usagePagination"
        row-key="id"
        size="small"
        @change="handleUsageTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'status_code'">
            <a-tag :color="record.status_code < 400 ? 'green' : 'red'">{{ record.status_code }}</a-tag>
          </template>
          <template v-if="column.key === 'response_time'">
            <span>{{ record.response_time }}ms</span>
          </template>
        </template>
      </a-table>
    </a-modal>

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

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { message, Modal } from 'ant-design-vue';
import {
  PlusOutlined, DownOutlined, SyncOutlined,
  StopOutlined, CheckCircleOutlined, DeleteOutlined, SettingOutlined
} from '@ant-design/icons-vue';
import * as apiKeyApi from '@/api/system/apiKey';
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'

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

const filteredList = computed(() => {
  if (!searchText.value) return dataList.value;
  const s = searchText.value.toLowerCase();
  return dataList.value.filter((item: any) =>
    (item.key_name || '').toLowerCase().includes(s) ||
    (item.client_name || '').toLowerCase().includes(s)
  );
});

const defaultDataColumns: any[] = [
  { title: '密钥名称', dataIndex: 'key_name', key: 'key_name', width: 130, resizable: true },
  { title: '客户端', dataIndex: 'client_name', key: 'client_name', width: 120, resizable: true },
  { title: '密钥', key: 'api_key_masked', width: 160, resizable: true },
  { title: '权限', key: 'permissions', width: 260, resizable: true },
  { title: '状态', key: 'is_active', width: 80, align: 'center' as const, resizable: true },
  { title: '过期时间', key: 'expires_at', width: 130, resizable: true },
  { title: '频率限制', dataIndex: 'rate_limit', key: 'rate_limit', width: 80, align: 'center' as const, resizable: true },
  { title: '最近使用', key: 'last_used_at', width: 130, resizable: true }
];

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('api_key_list', defaultDataColumns, {
  fixedLeft: [{ title: '#', key: 'rowIndex', width: 50, fixed: 'left' as const, align: 'center' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 160, fixed: 'right' as const }]
})

// 权限模块定义
const permissionModules = [
  { key: 'order', label: '生产工单', readKey: 'perm_order_read', writeKey: 'perm_order_write' },
  { key: 'work_report', label: '工序报工', readKey: 'perm_work_report_read', writeKey: 'perm_work_report_write' },
  { key: 'prep', label: '按工序备料', readKey: 'perm_prep_read', writeKey: 'perm_prep_write' },
  { key: 'bom', label: '设计BOM', readKey: 'perm_bom_read', writeKey: 'perm_bom_write' }
];

// 新建/编辑
const modalVisible = ref(false);
const modalLoading = ref(false);
const editingKey = ref<any>(null);

const getDefaultForm = () => ({
  key_name: '',
  client_name: '',
  description: '',
  perm_order_read: true,
  perm_order_write: false,
  perm_work_report_read: true,
  perm_work_report_write: false,
  perm_prep_read: true,
  perm_prep_write: false,
  perm_bom_read: true,
  perm_bom_write: false,
  rate_limit: 100,
  allowed_ips: '',
  expires_at: null as string | null,
  is_active: true
});

const formState = reactive(getDefaultForm());

// 密钥创建成功
const keyCreatedVisible = ref(false);
const newKeyValue = ref('');

// 重新生成
const regeneratedVisible = ref(false);
const regeneratedValue = ref('');

// 调用日志
const usageModalVisible = ref(false);
const usageLoading = ref(false);
const usageKeyName = ref('');
const usageKeyId = ref(0);
const usageList = ref<any[]>([]);
const usagePagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`
});

const usageColumns = [
  { title: '时间', dataIndex: 'created_at', width: 150 },
  { title: '端点', dataIndex: 'endpoint', width: 200 },
  { title: '方法', dataIndex: 'method', width: 70, align: 'center' as const },
  { title: '状态码', key: 'status_code', width: 80, align: 'center' as const },
  { title: '响应时间', key: 'response_time', width: 100, align: 'center' as const },
  { title: 'IP地址', dataIndex: 'ip_address', width: 130 }
];

const isExpired = (expiresAt: string) => {
  return new Date(expiresAt) < new Date();
};

const fetchData = async () => {
  loading.value = true;
  try {
    const res: any = await apiKeyApi.getApiKeys();
    if (res.success) {
      dataList.value = res.data;
      pagination.total = res.data.length;
    }
  } finally {
    loading.value = false;
  }
};

const handleTableChange = (pag: any) => {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
};

const handleCreate = () => {
  editingKey.value = null;
  Object.assign(formState, getDefaultForm());
  modalVisible.value = true;
};

const handleEdit = (record: any) => {
  editingKey.value = record;
  Object.assign(formState, {
    key_name: record.key_name,
    client_name: record.client_name,
    description: record.description || '',
    perm_order_read: !!record.perm_order_read,
    perm_order_write: !!record.perm_order_write,
    perm_work_report_read: !!record.perm_work_report_read,
    perm_work_report_write: !!record.perm_work_report_write,
    perm_prep_read: !!record.perm_prep_read,
    perm_prep_write: !!record.perm_prep_write,
    perm_bom_read: !!record.perm_bom_read,
    perm_bom_write: !!record.perm_bom_write,
    rate_limit: record.rate_limit || 100,
    allowed_ips: record.allowed_ips || '',
    expires_at: record.expires_at || null,
    is_active: !!record.is_active
  });
  modalVisible.value = true;
};

const handleModalOk = async () => {
  if (!formState.key_name || !formState.client_name) {
    message.warning('密钥名称和客户端名称不能为空');
    return;
  }
  modalLoading.value = true;
  try {
    const payload = { ...formState };
    if (editingKey.value) {
      const res: any = await apiKeyApi.updateApiKey(editingKey.value.id, payload);
      if (res.success) {
        message.success('更新成功');
        modalVisible.value = false;
        fetchData();
      } else {
        message.error(res.message || '更新失败');
      }
    } else {
      const res: any = await apiKeyApi.createApiKey(payload);
      if (res.success) {
        modalVisible.value = false;
        newKeyValue.value = res.data.api_key;
        keyCreatedVisible.value = true;
        fetchData();
      } else {
        message.error(res.message || '创建失败');
      }
    }
  } finally {
    modalLoading.value = false;
  }
};

const handleDelete = async (record: any) => {
  const res: any = await apiKeyApi.deleteApiKey(record.id);
  if (res.success) {
    message.success('删除成功');
    fetchData();
  } else {
    message.error(res.message || '删除失败');
  }
};

const handleRegenerate = (record: any) => {
  Modal.confirm({
    title: '重新生成密钥',
    content: '重新生成后旧密钥将立即失效，确定继续？',
    okType: 'danger',
    async onOk() {
      const res: any = await apiKeyApi.regenerateApiKey(record.id);
      if (res.success) {
        regeneratedValue.value = res.data.api_key;
        regeneratedVisible.value = true;
        fetchData();
      } else {
        message.error(res.message || '重新生成失败');
      }
    }
  });
};

const handleToggleActive = async (record: any, active: boolean) => {
  const res: any = await apiKeyApi.updateApiKey(record.id, {
    ...record,
    is_active: active,
    perm_order_read: !!record.perm_order_read,
    perm_order_write: !!record.perm_order_write,
    perm_work_report_read: !!record.perm_work_report_read,
    perm_work_report_write: !!record.perm_work_report_write,
    perm_prep_read: !!record.perm_prep_read,
    perm_prep_write: !!record.perm_prep_write,
    perm_bom_read: !!record.perm_bom_read,
    perm_bom_write: !!record.perm_bom_write
  });
  if (res.success) {
    message.success(active ? '已启用' : '已禁用');
    fetchData();
  } else {
    message.error(res.message || '操作失败');
  }
};

// 调用日志
const handleViewUsage = async (record: any) => {
  usageKeyId.value = record.id;
  usageKeyName.value = record.key_name;
  usageModalVisible.value = true;
  usagePagination.current = 1;
  await fetchUsage();
};

const fetchUsage = async () => {
  usageLoading.value = true;
  try {
    const res: any = await apiKeyApi.getApiKeyUsage(usageKeyId.value, {
      page: usagePagination.current,
      limit: usagePagination.pageSize
    });
    if (res.success) {
      usageList.value = res.data.items;
      usagePagination.total = res.data.pagination.total;
    }
  } finally {
    usageLoading.value = false;
  }
};

const handleUsageTableChange = (pag: any) => {
  usagePagination.current = pag.current;
  usagePagination.pageSize = pag.pageSize;
  fetchUsage();
};

onMounted(() => {
  loadColumnPreference()
  fetchData();
});
</script>
