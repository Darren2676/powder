<template>
  <div class="sample-request-list">
    <a-card :bordered="false">
      <!-- 标题栏 -->
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
        <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">样品申请管理</span>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
          <a-input v-model:value="searchText" placeholder="编号/客户/申请人" allow-clear style="width:220px" @pressEnter="handleSearch" />
          <a-select v-model:value="filterStatus" placeholder="流程状态" allow-clear style="width:140px" @change="handleSearch">
            <a-select-option value="草稿">草稿</a-select-option>
            <a-select-option value="待研发">待研发</a-select-option>
            <a-select-option value="研发中">研发中</a-select-option>
            <a-select-option value="已完成">已完成</a-select-option>
          </a-select>
          <a-button type="primary" @click="handleSearch">
            <template #icon><SearchOutlined /></template>
            搜索
          </a-button>
          <a-button @click="handleReset">重置</a-button>
          <a-button type="primary" @click="handleCreate">
            <template #icon><PlusOutlined /></template>
            新建申请
          </a-button>
        </div>
      </div>

      <!-- 表格 -->
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        row-key="request_number"
        @change="handleTableChange"
        size="middle"
      >
        <template #bodyCell="{ column, record, text }">
          <template v-if="column.dataIndex === 'status'">
            <a-tag :color="statusColor(text)">{{ text }}</a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'approval_status'">
            <a-tag :color="approvalColor(text)">{{ text }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space :size="4">
              <a-button type="link" size="small" @click="handleView(record)">查看</a-button>
              <a-divider type="vertical" />
              <a-dropdown :trigger="['click']">
                <a-button type="link" size="small" @click.stop>更多<DownOutlined style="font-size: 10px; margin-left: 2px" /></a-button>
                <template #overlay>
                  <a-menu>
                    <template v-if="(record.status || '').trim() === '草稿'">
                      <a-menu-item @click="handleEdit(record)">编辑</a-menu-item>
                      <a-menu-item @click="handleSubmit(record)">提交</a-menu-item>
                      <a-menu-divider />
                      <a-menu-item @click="handleDelete(record)"><span style="color: #ff4d4f">删除</span></a-menu-item>
                    </template>
                    <template v-else-if="(record.status || '').trim() === '待研发'">
                      <a-menu-item @click="handleEdit(record)">修改</a-menu-item>
                      <a-menu-item @click="handleWithdraw(record)">撤回</a-menu-item>
                      <a-menu-item @click="handleReceive(record)">接收</a-menu-item>
                    </template>
                    <template v-else-if="(record.status || '').trim() === '研发中'">
                      <a-menu-item @click="handleEdit(record)">修改</a-menu-item>
                      <a-menu-item @click="handleWithdraw(record)">撤回</a-menu-item>
                      <a-menu-item @click="handleComplete(record)">完成研发</a-menu-item>
                    </template>
                    <template v-else-if="(record.status || '').trim() === '已完成'">
                      <a-menu-item @click="handleEdit(record)">修改</a-menu-item>
                      <a-menu-item @click="handleView(record)">查看详情</a-menu-item>
                    </template>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 完成研发弹窗 -->
    <a-modal v-model:visible="completeVisible" title="完成研发 — 填写实验室数据" @ok="handleCompleteConfirm" :confirm-loading="completeLoading" width="600px">
      <a-form :model="completeForm" layout="vertical">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="寄出样板数量">
              <a-input-number v-model:value="completeForm.lab_panel_qty" style="width:100%" :min="0" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="寄出样粉数量(kg)">
              <a-input-number v-model:value="completeForm.lab_powder_qty" style="width:100%" :min="0" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="完成日期">
              <a-date-picker v-model:value="completeForm.completion_date" style="width:100%" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="产品编号">
              <a-input v-model:value="completeForm.product_number" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-form-item label="配方成本">
          <a-input-number v-model:value="completeForm.formula_cost" style="width:100%" :min="0" :precision="4" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="completeForm.lab_remark" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, createVNode } from 'vue';
import { useRouter } from 'vue-router';
import { SearchOutlined, PlusOutlined, DownOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue';
import { message, Modal } from 'ant-design-vue';
import * as api from '@/api/sales/sampleRequest';

const router = useRouter();

const searchText = ref('');
const filterStatus = ref('');
const loading = ref(false);
const dataSource = ref<any[]>([]);
const pagination = reactive({ current: 1, pageSize: 20, total: 0, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` });

const columns = [
  { title: '申请编号', dataIndex: 'request_number', width: 180 },
  { title: '申请日期', dataIndex: 'request_date', width: 110 },
  { title: '客户名称', dataIndex: 'customer_name', width: 180, ellipsis: true },
  { title: '申请人', dataIndex: 'applicant', width: 100 },
  { title: '紧急程度', dataIndex: 'urgency', width: 90 },
  { title: '流程状态', dataIndex: 'status', width: 90 },
  { title: '审批状态', dataIndex: 'approval_status', width: 90 },
  { title: '需完成日期', dataIndex: 'deadline_date', width: 110 },
  { title: '操作', key: 'action', width: 120, fixed: 'right' as const },
];

function statusColor(status: string) {
  const map: Record<string, string> = { '草稿': 'default', '待研发': 'orange', '研发中': 'processing', '已完成': 'success' };
  return map[status] || 'default';
}

function approvalColor(status: string) {
  const map: Record<string, string> = { '草稿': 'default', '待审批': 'orange', '已审核': 'green', '已审批': 'green' };
  return map[status] || 'default';
}

async function fetchData() {
  loading.value = true;
  try {
    const params: any = { page: pagination.current, limit: pagination.pageSize };
    if (searchText.value) params.search = searchText.value;
    if (filterStatus.value) params.status = filterStatus.value;
    const res: any = await api.getSampleRequests(params);
    if (res.success) {
      dataSource.value = res.data.items;
      pagination.total = res.data.pagination.total;
    }
  } finally {
    loading.value = false;
  }
}

function handleSearch() { pagination.current = 1; fetchData(); }
function handleReset() { searchText.value = ''; filterStatus.value = ''; pagination.current = 1; fetchData(); }
function handleTableChange(pag: any) { pagination.current = pag.current; pagination.pageSize = pag.pageSize; fetchData(); }

function handleCreate() { router.push({ name: 'SampleRequestCreate' }); }
function handleView(record: any) { router.push({ name: 'SampleRequestDetail', params: { id: record.request_number } }); }
function handleEdit(record: any) { router.push({ name: 'SampleRequestCreate', query: { edit: record.request_number } }); }

function handleSubmit(record: any) {
  Modal.confirm({
    title: '确认提交',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要提交样品申请「${(record.request_number || '').trim()}」吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await api.submitSampleRequest(record.request_number);
        if (res.success) { message.success(res.message || '提交成功'); fetchData(); }
      } catch { message.error('提交失败'); }
    }
  });
}

function handleWithdraw(record: any) {
  Modal.confirm({
    title: '确认撤回',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤回样品申请「${(record.request_number || '').trim()}」吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await api.withdrawSampleRequest(record.request_number);
        if (res.success) { message.success(res.message || '撤回成功'); fetchData(); }
      } catch { message.error('撤回失败'); }
    }
  });
}

function handleReceive(record: any) {
  Modal.confirm({
    title: '确认接收',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要接收样品申请「${(record.request_number || '').trim()}」吗？`,
    okText: '确定',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await api.receiveSampleRequest(record.request_number);
        if (res.success) { message.success(res.message || '接收成功'); fetchData(); }
      } catch { message.error('接收失败'); }
    }
  });
}

function handleDelete(record: any) {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除样品申请「${(record.request_number || '').trim()}」吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await api.deleteSampleRequest(record.request_number);
        if (res.success) { message.success(res.message || '删除成功'); fetchData(); }
        else { message.error(res.message || '删除失败'); }
      } catch { message.error('删除失败'); }
    }
  });
}

// 完成研发弹窗
const completeVisible = ref(false);
const completeLoading = ref(false);
const completeRecord = ref<any>(null);
const completeForm = reactive({ lab_panel_qty: null as number | null, lab_powder_qty: null as number | null, completion_date: null as string | null, product_number: '', formula_cost: null as number | null, lab_remark: '' });

function handleComplete(record: any) {
  completeRecord.value = record;
  Object.assign(completeForm, { lab_panel_qty: null, lab_powder_qty: null, completion_date: null, product_number: '', formula_cost: null, lab_remark: '' });
  completeVisible.value = true;
}

async function handleCompleteConfirm() {
  if (!completeRecord.value) return;
  completeLoading.value = true;
  try {
    const res: any = await api.completeSampleRequest(completeRecord.value.request_number, completeForm);
    if (res.success) { message.success(res.message || '完成研发'); completeVisible.value = false; fetchData(); }
  } finally {
    completeLoading.value = false;
  }
}

onMounted(fetchData);
</script>

<style scoped>
.search-bar { margin-bottom: 16px; }
</style>
