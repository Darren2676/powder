<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import {
  SearchOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  PercentageOutlined
} from '@ant-design/icons-vue'
import { getYieldRateReport } from '@/api/quality/qualityReport'

// ==================== 状态 ====================

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const dateRange = ref<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
const planStatusFilter = ref<string | undefined>(undefined)

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `${total} 条`
})

// 汇总统计数据
const statsData = reactive({
  total_orders: 0,
  total_inbound: 0,
  total_unqualified: 0,
  overall_yield_rate: null as number | null,
  calculated_count: 0,
  pending_count: 0
})

// ==================== 列定义 ====================

const columns = [
  { title: '生产单号', dataIndex: 'production_order_number', key: 'production_order_number', width: 160, fixed: 'left' as const },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 110 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 120 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 180, ellipsis: true },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 90, align: 'right' as const },
  { title: '入库正品数', dataIndex: 'inbound_quantity', key: 'inbound_quantity', width: 100, align: 'right' as const },
  { title: '不合格品总数', dataIndex: 'total_unqualified', key: 'total_unqualified', width: 110, align: 'right' as const },
  { title: '综合合格率', dataIndex: 'yield_rate', key: 'yield_rate', width: 110, align: 'right' as const },
  { title: '生产日期', dataIndex: 'production_date', key: 'production_date', width: 110 },
  { title: '状态', dataIndex: 'plan_status', key: 'plan_status', width: 90, align: 'center' as const }
]

const planStatusOptions = [
  { label: '全部', value: '' },
  { label: '已派发', value: '已派发' },
  { label: '生产中', value: '生产中' },
  { label: '已完成', value: '已完成' },
  { label: '已入库', value: '已入库' },
  { label: '已完工', value: '已完工' }
]

// ==================== 数据加载 ====================

const fetchData = async (page = 1, pageSize = pagination.pageSize) => {
  loading.value = true
  try {
    const params: any = { page, limit: pageSize }
    if (searchText.value) params.search = searchText.value
    if (dateRange.value) {
      params.start_date = dateRange.value[0].format('YYYY-MM-DD')
      params.end_date = dateRange.value[1].format('YYYY-MM-DD')
    }
    if (planStatusFilter.value) params.plan_status = planStatusFilter.value

    const res: any = await getYieldRateReport(params)
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
      pagination.current = page
      pagination.pageSize = pageSize

      if (res.data.stats) {
        const s = res.data.stats
        statsData.total_orders = parseInt(s.total_orders) || 0
        statsData.total_inbound = parseFloat(s.total_inbound) || 0
        statsData.total_unqualified = parseFloat(s.total_unqualified) || 0
        statsData.overall_yield_rate = s.overall_yield_rate !== null && s.overall_yield_rate !== undefined ? parseFloat(s.overall_yield_rate) : null
        statsData.calculated_count = parseInt(s.calculated_count) || 0
        statsData.pending_count = parseInt(s.pending_count) || 0
      }
    }
  } catch (e: any) {
    message.error('获取数据失败: ' + (e.message || '未知错误'))
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  fetchData(pag.current, pag.pageSize)
}

const handleSearch = () => {
  fetchData(1)
}

const handleReset = () => {
  searchText.value = ''
  dateRange.value = null
  planStatusFilter.value = undefined
  fetchData(1)
}

// ==================== 工具函数 ====================

const formatDate = (val: any) => {
  if (!val) return '-'
  return dayjs(val).format('YYYY-MM-DD')
}

const getYieldRateColor = (rate: number | null) => {
  if (rate === null || rate === undefined) return '#999'
  if (rate >= 95) return '#52c41a'
  if (rate >= 85) return '#1890ff'
  if (rate >= 70) return '#faad14'
  return '#ff4d4f'
}

const getYieldRateLevel = (rate: number | null) => {
  if (rate === null || rate === undefined) return { text: '未计算', color: 'default' }
  if (rate >= 95) return { text: '优良', color: 'success' }
  if (rate >= 85) return { text: '良好', color: 'processing' }
  if (rate >= 70) return { text: '关注', color: 'warning' }
  return { text: '异常', color: 'error' }
}

const getPlanStatusColor = (status: string) => {
  const map: Record<string, string> = {
    '已完工': 'success',
    '已完成': 'success',
    '已入库': 'success',
    '生产中': 'processing',
    '已派发': 'warning',
    '未开始': 'default'
  }
  return map[status] || 'default'
}

// ==================== 初始化 ====================

onMounted(() => {
  fetchData()
})
</script>

<template>
  <div class="yield-rate-page">
    <!-- 搜索栏 -->
    <a-card size="small" :bordered="false" style="margin-bottom: 16px;">
      <a-form layout="inline" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
        <a-form-item label="搜索" style="margin-bottom: 0;">
          <a-input-search
            v-model:value="searchText"
            placeholder="生产单号/产品编号/名称"
            style="width: 240px;"
            allow-clear
            @search="handleSearch"
          />
        </a-form-item>
        <a-form-item label="日期范围" style="margin-bottom: 0;">
          <a-range-picker
            v-model:value="dateRange"
            :placeholder="['开始日期', '结束日期']"
            style="width: 240px;"
            @change="handleSearch"
          />
        </a-form-item>
        <a-form-item label="生产单状态" style="margin-bottom: 0;">
          <a-select
            v-model:value="planStatusFilter"
            placeholder="全部状态"
            style="width: 120px;"
            allow-clear
            @change="handleSearch"
          >
            <a-select-option v-for="opt in planStatusOptions" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item style="margin-bottom: 0;">
          <a-space>
            <a-button type="primary" @click="handleSearch">
              <template #icon><SearchOutlined /></template>
              查询
            </a-button>
            <a-button @click="handleReset">
              <template #icon><ReloadOutlined /></template>
              重置
            </a-button>
          </a-space>
        </a-form-item>
      </a-form>
    </a-card>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="整体综合合格率"
          :value="statsData.overall_yield_rate !== null ? statsData.overall_yield_rate : '-'"
          suffix="%"
          :value-style="{ color: statsData.overall_yield_rate !== null ? getYieldRateColor(statsData.overall_yield_rate) : '#999', fontSize: '28px', fontWeight: 700 }"
        >
          <template #prefix>
            <PercentageOutlined />
          </template>
        </a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="生产单总数"
          :value="statsData.total_orders"
          :value-style="{ color: '#1890ff', fontSize: '28px', fontWeight: 700 }"
        >
          <template #prefix>
            <FileTextOutlined />
          </template>
        </a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="入库正品总量"
          :value="statsData.total_inbound"
          :value-style="{ color: '#52c41a', fontSize: '28px', fontWeight: 700 }"
        >
          <template #prefix>
            <CheckCircleOutlined />
          </template>
        </a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="不合格品总量"
          :value="statsData.total_unqualified"
          :value-style="{ color: statsData.total_unqualified > 0 ? '#ff4d4f' : '#999', fontSize: '28px', fontWeight: 700 }"
        >
          <template #prefix>
            <CloseCircleOutlined />
          </template>
        </a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="已计算/待计算"
          :value="statsData.calculated_count"
          :value-style="{ color: '#1890ff', fontSize: '28px', fontWeight: 700 }"
        >
          <template #prefix>
            <SafetyCertificateOutlined />
          </template>
          <template #suffix>
            <span style="font-size: 14px; color: #999; margin-left: 4px;">/ {{ statsData.pending_count }}</span>
          </template>
        </a-statistic>
      </a-card>
    </div>

    <!-- 公式说明 -->
    <a-alert
      message="综合合格率 = 入库正品数 / (入库正品数 + 各道工序不合格品数) × 100%"
      description="反映生产单从首道工序到末道工序入库的端到端产出效率。入库正品数取自生产单入库量，不合格品数为所有报工记录的不合格品数之和。"
      type="info"
      show-icon
      style="margin-bottom: 16px;"
    />

    <!-- 数据列表 -->
    <a-card size="small" :bordered="false" title="生产单综合合格率报表">
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 1300 }"
        row-key="production_order_number"
        size="small"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, text }">
          <template v-if="column.key === 'inbound_quantity'">
            <span :style="{ color: text > 0 ? '#52c41a' : '#999', fontWeight: text > 0 ? 600 : 400 }">
              {{ text || 0 }}
            </span>
          </template>
          <template v-else-if="column.key === 'total_unqualified'">
            <a-tag v-if="parseFloat(text) > 0" color="error">{{ text }}</a-tag>
            <span v-else style="color: #999;">0</span>
          </template>
          <template v-else-if="column.key === 'yield_rate'">
            <template v-if="text !== null && text !== undefined">
              <span :style="{ color: getYieldRateColor(parseFloat(text)), fontWeight: 600, fontSize: '14px' }">
                {{ text }}%
              </span>
              <a-tag :color="getYieldRateLevel(parseFloat(text)).color" size="small" style="margin-left: 4px;">
                {{ getYieldRateLevel(parseFloat(text)).text }}
              </a-tag>
            </template>
            <span v-else style="color: #bbb;">未入库</span>
          </template>
          <template v-else-if="column.key === 'plan_status'">
            <a-tag :color="getPlanStatusColor(text)" size="small">{{ text }}</a-tag>
          </template>
          <template v-else-if="column.key === 'production_date'">
            {{ formatDate(text) }}
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<style scoped>
.yield-rate-page {
  padding: 0;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  text-align: center;
}
</style>
