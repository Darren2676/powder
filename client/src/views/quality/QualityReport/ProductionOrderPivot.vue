<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import {
  SearchOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  PercentageOutlined,
  ExportOutlined,
  WarningOutlined
} from '@ant-design/icons-vue'
import { getProductionOrderQualityPivot } from '@/api/quality/qualityReport'

// ==================== 状态 ====================

const loading = ref(false)
const dataSource = ref<any[]>([])
const pivotColumnsData = ref<Array<{ defect_class_name: string; total_qty: number }>>([])
const searchText = ref('')
const dateRange = ref<[dayjs.Dayjs, dayjs.Dayjs] | null>([dayjs().startOf('month'), dayjs().endOf('month')])
const planStatusFilter = ref<string | undefined>(undefined)

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条`
})

const statsData = reactive({
  total_orders: 0,
  total_inbound: 0,
  total_unqualified: 0,
  total_concession: 0,
  total_net_unqualified: 0,
  overall_yield_rate: null as number | null
})

const planStatusOptions = [
  { label: '全部', value: '' },
  { label: '已派发', value: '已派发' },
  { label: '生产中', value: '生产中' },
  { label: '已完成', value: '已完成' },
  { label: '已入库', value: '已入库' },
  { label: '已完工', value: '已完工' }
]

// ==================== 列定义（动态拼装） ====================

const columns = computed(() => {
  const fixedLeft: any[] = [
    { title: '生产单号', dataIndex: 'production_order_number', key: 'production_order_number', width: 160, fixed: 'left' as const },
    { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 110 },
    { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 130 },
    { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 160, ellipsis: true },
    { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, align: 'center' as const },
    { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 90, align: 'right' as const }
  ]

  const dynamic: any[] = pivotColumnsData.value.map((col) => ({
    title: col.defect_class_name,
    key: `defect_class__${col.defect_class_name}`,
    dataIndex: ['defect_classes', col.defect_class_name],
    width: 100,
    align: 'right' as const,
    customRender: ({ value }: any) => {
      const v = parseFloat(value) || 0
      return v > 0
        ? { children: v, props: { style: 'color: #ff4d4f; font-weight: 600;' } }
        : { children: 0, props: { style: 'color: #ccc;' } }
    }
  }))

  const fixedRight: any[] = [
    { title: '不合格小计', dataIndex: 'total_unqualified', key: 'total_unqualified', width: 100, align: 'right' as const },
    { title: '让步接收', dataIndex: 'concession_quantity', key: 'concession_quantity', width: 90, align: 'right' as const },
    { title: '净不合格', dataIndex: 'net_unqualified', key: 'net_unqualified', width: 90, align: 'right' as const },
    { title: '入库正品', dataIndex: 'inbound_quantity', key: 'inbound_quantity', width: 90, align: 'right' as const },
    { title: '合格率', dataIndex: 'yield_rate', key: 'yield_rate', width: 110, align: 'right' as const, fixed: 'right' as const },
    { title: '状态', dataIndex: 'plan_status', key: 'plan_status', width: 80, align: 'center' as const, fixed: 'right' as const }
  ]

  return [...fixedLeft, ...dynamic, ...fixedRight]
})

const scrollX = computed(() => {
  // 固定列宽 ~700, 每个动态列 100, 右侧固定 ~570
  const dynamicWidth = pivotColumnsData.value.length * 100
  return 700 + dynamicWidth + 570
})

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

    const res: any = await getProductionOrderQualityPivot(params)
    if (res?.success) {
      pivotColumnsData.value = res.data.pivot_columns || []
      dataSource.value = res.data.rows || []
      pagination.total = res.data.pagination?.total || 0
      pagination.current = page
      pagination.pageSize = pageSize

      const s = res.data.stats || {}
      statsData.total_orders = parseInt(s.total_orders) || 0
      statsData.total_inbound = parseFloat(s.total_inbound) || 0
      statsData.total_unqualified = parseFloat(s.total_unqualified) || 0
      statsData.total_concession = parseFloat(s.total_concession) || 0
      statsData.total_net_unqualified = parseFloat(s.total_net_unqualified) || 0
      statsData.overall_yield_rate = s.overall_yield_rate !== null && s.overall_yield_rate !== undefined ? parseFloat(s.overall_yield_rate) : null
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
  dateRange.value = [dayjs().startOf('month'), dayjs().endOf('month')]
  planStatusFilter.value = undefined
  fetchData(1)
}

// ==================== 导出 ====================

const handleExport = () => {
  if (!dataSource.value.length) {
    message.warning('当前无可导出数据')
    return
  }
  const headerLine = [
    '生产单号', '产品编号', '产品名称', '规格', '单位', '计划数量',
    ...pivotColumnsData.value.map((c) => c.defect_class_name),
    '不合格小计', '让步接收', '净不合格', '入库正品', '合格率(%)', '状态'
  ].join(',')
  const lines = dataSource.value.map((row) => {
    const dynVals = pivotColumnsData.value.map((c) => row.defect_classes?.[c.defect_class_name] ?? 0)
    return [
      row.production_order_number,
      row.item_number,
      `"${row.item_name || ''}"`,
      `"${row.specifications || ''}"`,
      row.basic_unit || '',
      row.planned_quantity || 0,
      ...dynVals,
      row.total_unqualified || 0,
      row.concession_quantity || 0,
      row.net_unqualified || 0,
      row.inbound_quantity || 0,
      row.yield_rate !== null && row.yield_rate !== undefined ? row.yield_rate : '',
      row.plan_status || ''
    ].join(',')
  })
  const csv = '\ufeff' + [headerLine, ...lines].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `生产单质量透视报表_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
  link.click()
  URL.revokeObjectURL(url)
  message.success('已导出')
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
  if (rate === null || rate === undefined) return { text: '未入库', color: 'default' }
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
  <div class="po-pivot-page">
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
        <a-form-item label="生产日期" style="margin-bottom: 0;">
          <a-range-picker
            v-model:value="dateRange"
            :placeholder="['开始日期', '结束日期']"
            style="width: 240px;"
            @change="handleSearch"
          />
        </a-form-item>
        <a-form-item label="状态" style="margin-bottom: 0;">
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
            <a-button @click="handleExport">
              <template #icon><ExportOutlined /></template>
              导出CSV
            </a-button>
          </a-space>
        </a-form-item>
      </a-form>
    </a-card>

    <!-- KPI -->
    <div class="stats-row">
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="整体合格率"
          :value="statsData.overall_yield_rate !== null ? statsData.overall_yield_rate : '-'"
          suffix="%"
          :value-style="{ color: statsData.overall_yield_rate !== null ? getYieldRateColor(statsData.overall_yield_rate) : '#999', fontSize: '26px', fontWeight: 700 }"
        >
          <template #prefix><PercentageOutlined /></template>
        </a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="生产单数"
          :value="statsData.total_orders"
          :value-style="{ color: '#1890ff', fontSize: '26px', fontWeight: 700 }"
        >
          <template #prefix><FileTextOutlined /></template>
        </a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="入库正品总量"
          :value="statsData.total_inbound"
          :value-style="{ color: '#52c41a', fontSize: '26px', fontWeight: 700 }"
        >
          <template #prefix><CheckCircleOutlined /></template>
        </a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="不合格总量"
          :value="statsData.total_unqualified"
          :value-style="{ color: statsData.total_unqualified > 0 ? '#ff4d4f' : '#999', fontSize: '26px', fontWeight: 700 }"
        >
          <template #prefix><CloseCircleOutlined /></template>
        </a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="让步接收总量"
          :value="statsData.total_concession"
          :value-style="{ color: '#faad14', fontSize: '26px', fontWeight: 700 }"
        >
          <template #prefix><WarningOutlined /></template>
        </a-statistic>
      </a-card>
    </div>

    <!-- 公式说明 -->
    <a-alert
      message="净不合格 = 报工不合格小计 − 让步接收量；合格率 = 入库正品 ÷ (入库正品 + 净不合格) × 100%"
      description="动态列展示按生产单 × 缺陷分类的不合格量分布；缺陷分类列按全表合计降序排序，超过 20 个分类时自动汇入「其他」列。"
      type="info"
      show-icon
      style="margin-bottom: 16px;"
    />

    <!-- 透视表 -->
    <a-card size="small" :bordered="false" title="生产单质量透视报表（行=生产单，列=缺陷分类）">
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: scrollX, y: 600 }"
        row-key="production_order_number"
        size="small"
        bordered
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, text }">
          <template v-if="column.key === 'total_unqualified'">
            <a-tag v-if="parseFloat(text) > 0" color="error">{{ text }}</a-tag>
            <span v-else style="color: #999;">0</span>
          </template>
          <template v-else-if="column.key === 'concession_quantity'">
            <a-tag v-if="parseFloat(text) > 0" color="orange">{{ text }}</a-tag>
            <span v-else style="color: #999;">0</span>
          </template>
          <template v-else-if="column.key === 'net_unqualified'">
            <span :style="{ color: parseFloat(text) > 0 ? '#ff4d4f' : '#999', fontWeight: parseFloat(text) > 0 ? 600 : 400 }">
              {{ text || 0 }}
            </span>
          </template>
          <template v-else-if="column.key === 'inbound_quantity'">
            <span :style="{ color: parseFloat(text) > 0 ? '#52c41a' : '#999', fontWeight: parseFloat(text) > 0 ? 600 : 400 }">
              {{ text || 0 }}
            </span>
          </template>
          <template v-else-if="column.key === 'yield_rate'">
            <template v-if="text !== null && text !== undefined">
              <span :style="{ color: getYieldRateColor(parseFloat(text)), fontWeight: 600 }">
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
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<style scoped>
.po-pivot-page {
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
