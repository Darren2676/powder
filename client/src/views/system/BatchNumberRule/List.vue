<template>
  <div>
    <a-page-header title="产品批次号产生规则" style="padding: 0; margin-bottom: 16px;">
      <template #extra>
        <a-space>
          <a-button type="primary" @click="handleCreate"><PlusOutlined /> 新增规则</a-button>
        </a-space>
      </template>
    </a-page-header>

    <a-card :bordered="false" size="small">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchKeyword"
            placeholder="搜索产品编号/名称"
            style="width: 220px"
            allow-clear
            @search="handleSearch"
          />
          <a-select
            v-model:value="searchMode"
            placeholder="产生模式"
            style="width: 140px"
            allow-clear
            @change="handleSearch"
          >
            <a-select-option value="A">A-入库时生成</a-select-option>
            <a-select-option value="B">B-计划派发时生成</a-select-option>
          </a-select>
          <a-button @click="handleReset"><ReloadOutlined /></a-button>
          <a-button @click="openColumnSetting">
            <template #icon><SettingOutlined /></template>
            列设置
          </a-button>
        </a-space>
      </template>

      <a-table
        :columns="columns"
        :data-source="dataSource"
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
          <template v-if="column.key === 'batch_rule_mode'">
            <a-tag :color="record.batch_rule_mode === 'B' ? 'green' : 'blue'">
              {{ record.batch_rule_mode === 'B' ? 'B-计划派发时生成' : 'A-入库时生成' }}
            </a-tag>
          </template>
          <template v-if="column.key === 'factory_id'">
            {{ record.factory_name || '全部工厂' }}
          </template>
          <template v-if="column.key === 'append_split_seq'">
            <template v-if="record.batch_rule_mode === 'B'">
              <a-tag :color="record.append_split_seq ? 'green' : 'orange'">
                {{ record.append_split_seq ? '追加' : '不追加' }}
              </a-tag>
            </template>
            <template v-else>-</template>
          </template>
          <template v-if="column.key === 'is_active'">
            <a-tag :color="record.is_active === '是' ? 'green' : 'default'">
              {{ record.is_active }}
            </a-tag>
          </template>
          <template v-if="column.key === 'approval_status'">
            <a-tag :color="(record.approval_status || '').trim() === '已审核' ? 'green' : 'orange'">
              {{ (record.approval_status || '').trim() || '未审核' }}
            </a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleEdit(record)">
                编辑
              </a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>
                  更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
                </a-button>
                <template #overlay>
                  <a-menu>
                    <a-menu-item v-if="(record.approval_status || '').trim() !== '已审核'" @click="handleApprove(record)">审核</a-menu-item>
                    <a-menu-item v-else @click="handleWithdraw(record)">撤消</a-menu-item>
                    <a-menu-divider />
                    <a-menu-item @click="handleDelete(record)">
                      <span style="color: #ff4d4f">删除</span>
                    </a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- Create/Edit Modal -->
    <a-modal
      v-model:open="modalVisible"
      :title="isEdit ? '编辑规则' : '新增规则'"
      @ok="handleModalOk"
      :confirm-loading="submitting"
      width="520px"
    >
      <a-form :model="formState" :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="产品编号" required>
          <a-select
            v-model:value="formState.item_number"
            show-search
            :filter-option="false"
            :disabled="isEdit"
            placeholder="请输入产品编号搜索"
            :not-found-content="itemSearchLoading ? undefined : null"
            :loading="itemSearchLoading"
            allow-clear
            @search="handleItemSearch"
            @select="handleItemSelect"
            @clear="handleItemClear"
          >
            <a-select-option v-for="item in itemSearchResults" :key="item.item_number" :value="item.item_number">
              {{ item.item_number }} - {{ item.item_name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="产品名称">
          <a-input v-model:value="formState.item_name" placeholder="自动带出" disabled />
        </a-form-item>
        <a-form-item label="适用工厂">
          <a-select
            v-model:value="formState.factory_id"
            placeholder="全部工厂"
            allow-clear
            style="width: 100%"
          >
            <a-select-option :value="0">全部工厂</a-select-option>
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">
              {{ f.factory_name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="产生模式" required>
          <a-radio-group v-model:value="formState.batch_rule_mode">
            <a-radio value="A">A-入库时生成</a-radio>
            <a-radio value="B">B-计划派发时生成</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="批次号模板" v-if="formState.batch_rule_mode === 'B'">
          <a-input v-model:value="formState.batch_number_template" placeholder="FB-{plan_number}" />
          <div style="color: #999; font-size: 12px; margin-top: 4px;">
            支持变量: {'{plan_number}'} = 生产计划编号
          </div>
        </a-form-item>
        <a-form-item label="拆分追加序号" v-if="formState.batch_rule_mode === 'B'">
          <a-switch
            :checked="formState.append_split_seq"
            @change="(v: boolean) => formState.append_split_seq = v"
          />
          <div style="color: #999; font-size: 12px; margin-top: 4px;">
            开启后，生产单拆分时批次号自动追加 -S01, -S02...；关闭则所有拆分子单共享同一批次号
          </div>
        </a-form-item>
        <a-form-item label="是否启用">
          <a-switch
            :checked="formState.is_active === '是'"
            @change="(v: boolean) => formState.is_active = v ? '是' : '否'"
          />
        </a-form-item>
      </a-form>
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
import { ref, reactive, onMounted, createVNode } from 'vue';
import { message, Modal } from 'ant-design-vue';
import { PlusOutlined, ReloadOutlined, ExclamationCircleOutlined, DownOutlined, SettingOutlined } from '@ant-design/icons-vue';
import {
  getBatchNumberRules,
  createBatchNumberRule,
  updateBatchNumberRule,
  deleteBatchNumberRule,
  approveBatchNumberRule,
  withdrawBatchNumberRule,
  type BatchNumberRule,
} from '@/api/system/batchNumberRule';
import request from '@/utils/request';
import { useColumnPreference } from '@/composables/useColumnPreference';
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue';

const searchKeyword = ref('');
const searchMode = ref<string | undefined>(undefined);
const loading = ref(false);
const dataSource = ref<BatchNumberRule[]>([]);
const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
});

const modalVisible = ref(false);
const isEdit = ref(false);
const submitting = ref(false);
const editingId = ref(0);
const formState = reactive({
  item_number: '',
  item_name: '',
  factory_id: null as number | null,
  batch_rule_mode: 'A' as 'A' | 'B',
  batch_number_template: 'FB-{plan_number}',
  append_split_seq: true,
  is_active: '是',
});
const factoryList = ref<Array<{ id: number; factory_name: string }>>([]);

// 物料主数据模糊搜索
const itemSearchResults = ref<Array<{ item_number: string; item_name: string }>>([]);
const itemSearchLoading = ref(false);
let itemSearchTimer: ReturnType<typeof setTimeout> | null = null;

const handleItemSearch = (value: string) => {
  if (itemSearchTimer) clearTimeout(itemSearchTimer);
  if (!value || value.length < 1) {
    itemSearchResults.value = [];
    return;
  }
  // 防抖 300ms
  itemSearchTimer = setTimeout(async () => {
    itemSearchLoading.value = true;
    try {
      const res: any = await request({
        url: '/item-masters',
        method: 'GET',
        params: { search: value, page: 1, limit: 20 },
      });
      itemSearchResults.value = res.data?.items || res.items || [];
    } catch {
      itemSearchResults.value = [];
    } finally {
      itemSearchLoading.value = false;
    }
  }, 300);
};

const handleItemSelect = (value: string) => {
  formState.item_number = value;
  const found = itemSearchResults.value.find(r => r.item_number === value);
  if (found) {
    formState.item_name = found.item_name || '';
  }
};

const handleItemClear = () => {
  formState.item_number = '';
  formState.item_name = '';
  itemSearchResults.value = [];
};

const defaultDataColumns: any[] = [
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 140, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 180, ellipsis: true, resizable: true },
  { title: '适用工厂', key: 'factory_id', width: 120, resizable: true },
  { title: '产生模式', key: 'batch_rule_mode', width: 180, resizable: true },
  { title: '批次号模板', dataIndex: 'batch_number_template', key: 'batch_number_template', width: 180, ellipsis: true, resizable: true },
  { title: '拆分追加序号', key: 'append_split_seq', width: 110, resizable: true },
  { title: '启用', key: 'is_active', width: 70, resizable: true },
  { title: '审核状态', dataIndex: 'approval_status', key: 'approval_status', width: 80, resizable: true },
];

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('batch_number_rule', defaultDataColumns, {
  fixedLeft: [{ title: '#', key: 'rowIndex', width: 50 }],
  fixedRight: [{ title: '操作', key: 'action', width: 120, fixed: 'right' as const }]
});

const fetchData = async () => {
  loading.value = true;
  try {
    const res = await getBatchNumberRules({
      keyword: searchKeyword.value || undefined,
      batch_rule_mode: searchMode.value || undefined,
      page: pagination.current,
      pageSize: pagination.pageSize,
    });
    const data = (res as any).data?.data || (res as any).data || {};
    dataSource.value = data.items || [];
    pagination.total = data.pagination?.total || 0;
  } catch (e: any) {
    message.error('查询失败: ' + (e.message || e));
  } finally {
    loading.value = false;
  }
};

const fetchFactories = async () => {
  try {
    const res = await request({ url: '/factories/list', method: 'GET' });
    const data = (res as any).data?.data || (res as any).data || [];
    factoryList.value = Array.isArray(data) ? data : (data.rows || []);
  } catch { /* ignore */ }
};

const handleSearch = () => {
  pagination.current = 1;
  fetchData();
};

const handleReset = () => {
  searchKeyword.value = '';
  searchMode.value = undefined;
  pagination.current = 1;
  fetchData();
};

const handleTableChange = (pag: any) => {
  pagination.current = pag.current;
  pagination.pageSize = pag.pageSize;
  fetchData();
};

const resetForm = () => {
  formState.item_number = '';
  formState.item_name = '';
  formState.factory_id = null;
  formState.batch_rule_mode = 'A';
  formState.batch_number_template = 'FB-{plan_number}';
  formState.append_split_seq = true;
  formState.is_active = '是';
  itemSearchResults.value = [];
};

const handleCreate = () => {
  isEdit.value = false;
  resetForm();
  modalVisible.value = true;
};

const handleEdit = (record: BatchNumberRule) => {
  isEdit.value = true;
  editingId.value = record.id;
  formState.item_number = record.item_number;
  formState.item_name = record.item_name;
  formState.factory_id = record.factory_id;
  formState.batch_rule_mode = record.batch_rule_mode;
  formState.batch_number_template = record.batch_number_template;
  formState.append_split_seq = !!record.append_split_seq;
  formState.is_active = record.is_active;
  // 编辑模式：预设当前项到搜索结果，确保下拉显示当前值
  itemSearchResults.value = record.item_number ? [{ item_number: record.item_number, item_name: record.item_name }] : [];
  modalVisible.value = true;
};

const handleModalOk = async () => {
  if (!formState.item_number) {
    message.warning('请输入产品编号');
    return;
  }
  submitting.value = true;
  try {
    if (isEdit.value) {
      await updateBatchNumberRule(editingId.value, { ...formState });
      message.success('更新成功');
    } else {
      await createBatchNumberRule({ ...formState });
      message.success('创建成功');
    }
    modalVisible.value = false;
    fetchData();
  } catch (e: any) {
    message.error((isEdit.value ? '更新' : '创建') + '失败: ' + (e.message || e));
  } finally {
    submitting.value = false;
  }
};

const handleDelete = (record: BatchNumberRule) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除产品批次号规则「${(record.item_number || '').trim()}」吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        await deleteBatchNumberRule(record.id);
        message.success('删除成功');
        fetchData();
      } catch (e: any) {
        message.error('删除失败: ' + (e.message || e));
      }
    }
  });
};

const handleApprove = async (record: BatchNumberRule) => {
  try {
    await approveBatchNumberRule(record.id);
    message.success('审核成功');
    fetchData();
  } catch (e: any) {
    message.error('审核失败: ' + (e.message || e));
  }
};

const handleWithdraw = async (record: BatchNumberRule) => {
  try {
    await withdrawBatchNumberRule(record.id);
    message.success('撤消审核成功');
    fetchData();
  } catch (e: any) {
    message.error('撤消失败: ' + (e.message || e));
  }
};

onMounted(() => {
  loadColumnPreference();
  fetchData();
  fetchFactories();
});
</script>