<template>
  <div style="padding: 0 0 20px 0;">
    <a-page-header title="样品转化率" style="padding: 0; margin: 0 0 8px 0;" />

    <!-- 搜索栏 -->
    <a-card :bordered="false" size="small" style="margin-bottom: 8px;">
      <a-row :gutter="12" align="middle">
        <a-col :span="4">
          <a-input v-model:value="filterApplicant" placeholder="申请人" allow-clear size="small" style="width: 100%;" @pressEnter="handleSearch" />
        </a-col>
        <a-col :span="5">
          <a-range-picker v-model:value="dateRange" size="small" style="width: 100%;" :placeholder="['开始日期', '结束日期']" format="YYYY-MM-DD" value-format="YYYY-MM-DD" />
        </a-col>
        <a-col :span="3">
          <a-checkbox v-model:checked="onlyCompleted" @change="handleSearch">仅看已完成</a-checkbox>
        </a-col>
        <a-col>
          <a-button type="primary" size="small" @click="handleSearch"><SearchOutlined /> 查询</a-button>
        </a-col>
        <a-col>
          <a-button size="small" @click="handleReset">重置</a-button>
        </a-col>
      </a-row>
    </a-card>

    <!-- KPI 卡片 -->
    <a-row :gutter="12" style="margin-bottom: 12px;">
      <a-col :span="8">
        <a-card :bordered="false" size="small">
          <a-statistic title="样品申请总数" :value="stats.total_count" :value-style="{ color: '#1890ff' }" />
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card :bordered="false" size="small">
          <a-statistic title="已有订单数" :value="stats.ordered_count" :value-style="{ color: '#52c41a' }" />
        </a-card>
      </a-col>
      <a-col :span="8">
        <a-card :bordered="false" size="small">
          <a-statistic title="转化率" :value="stats.conversion_rate" suffix="%" :precision="2" :value-style="{ color: stats.conversion_rate >= 50 ? '#52c41a' : stats.conversion_rate >= 30 ? '#faad14' : '#ff4d4f' }" />
          <a-progress :percent="Math.min(stats.conversion_rate, 100)" :stroke-color="stats.conversion_rate >= 50 ? '#52c41a' : stats.conversion_rate >= 30 ? '#faad14' : '#ff4d4f'" :size="'small'" style="margin-top: 4px;" />
        </a-card>
      </a-col>
    </a-row>

    <!-- 明细表格 -->
    <a-card :bordered="false" size="small">
      <a-table
        :columns="columns"
        :data-source="items"
        :loading="loading"
        :pagination="false"
        size="small"
        bordered
        row-key="request_number"
        :scroll="{ x: 'max-content' }"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'status'">
            <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
          </template>
          <template v-else-if="column.dataIndex === 'has_order'">
            <a-tag :color="record.has_order === '是' ? 'green' : 'default'">{{ record.has_order || '-' }}</a-tag>
          </template>
        </template>
      </a-table>
      <div v-if="items.length === 0 && !loading" style="text-align: center; padding: 24px; color: #999;">暂无数据</div>
    </a-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { SearchOutlined } from '@ant-design/icons-vue';
import { getConversionRate } from '@/api/sales/sampleRequest';

const filterApplicant = ref('');
const dateRange = ref<[string, string] | null>(null);
const onlyCompleted = ref(true);
const loading = ref(false);
const items = ref<any[]>([]);
const stats = reactive({ total_count: 0, ordered_count: 0, conversion_rate: 0 });

const columns = [
  { title: '申请编号', dataIndex: 'request_number', width: 180 },
  { title: '申请日期', dataIndex: 'request_date', width: 110 },
  { title: '客户名称', dataIndex: 'customer_name', width: 180, ellipsis: true },
  { title: '申请人', dataIndex: 'applicant', width: 100 },
  { title: '紧急程度', dataIndex: 'urgency', width: 90 },
  { title: '流程状态', dataIndex: 'status', width: 90 },
  { title: '是否已有订单', dataIndex: 'has_order', width: 120 },
  { title: '需完成日期', dataIndex: 'deadline_date', width: 110 },
];

function statusColor(status: string) {
  const map: Record<string, string> = { '草稿': 'default', '待研发': 'orange', '研发中': 'processing', '已完成': 'success' };
  return map[status] || 'default';
}

async function fetchData() {
  loading.value = true;
  try {
    const params: any = {};
    if (filterApplicant.value) params.applicant = filterApplicant.value;
    if (dateRange.value && dateRange.value[0]) params.startDate = dateRange.value[0];
    if (dateRange.value && dateRange.value[1]) params.endDate = dateRange.value[1];
    if (!onlyCompleted.value) params.onlyCompleted = 'false';

    const res: any = await getConversionRate(params);
    if (res.success) {
      stats.total_count = res.data.total_count || 0;
      stats.ordered_count = res.data.ordered_count || 0;
      stats.conversion_rate = res.data.conversion_rate || 0;
      items.value = res.data.items || [];
    }
  } finally {
    loading.value = false;
  }
}

function handleSearch() { fetchData(); }
function handleReset() {
  filterApplicant.value = '';
  dateRange.value = null;
  onlyCompleted.value = true;
  fetchData();
}

onMounted(fetchData);
</script>
