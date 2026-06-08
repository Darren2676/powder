<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import {
  SearchOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  BarChartOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  EyeOutlined
} from '@ant-design/icons-vue'
import { getQualitySummary, getProductionQualityReport, getDefectAnalysis, getProcessQuality } from '@/api/quality/qualityReport'
import { getFactories } from '@/api/system/factory'
import YieldRate from './YieldRate.vue'
import ProductionOrderPivot from './ProductionOrderPivot.vue'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart, LineChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components'
import VChart from 'vue-echarts'

use([
  CanvasRenderer,
  BarChart,
  PieChart,
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
])

// ==================== 状态 ====================

const loading = ref(false)
const detailLoading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const dateRange = ref<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)
const filterFactoryId = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])

const loadFactories = async () => {
  try {
    const res: any = await getFactories()
    if (res?.success) factoryList.value = res.data || []
  } catch { /* ignore */ }
}

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
  total_reported: 0,
  total_qualified: 0,
  total_unqualified: 0,
  overall_pass_rate: 100
})

// 详情弹窗
const detailVisible = ref(false)
const detailData = ref<any>(null)

// 图表选项卡
const activeChartTab = ref('bar')

// 主页面 Tab
const activeMainTab = ref('summary')

// ==================== 列定义 ====================

const columns = [
  { title: '生产单号', dataIndex: 'production_order_number', key: 'production_order_number', width: 160, fixed: 'left' as const },
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, align: 'center' as const },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 110 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 120 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 200, ellipsis: true },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 90, align: 'right' as const },
  { title: '报工总量', dataIndex: 'total_reported', key: 'total_reported', width: 90, align: 'right' as const },
  { title: '合格总量', dataIndex: 'total_qualified', key: 'total_qualified', width: 90, align: 'right' as const },
  { title: '不合格量', dataIndex: 'total_unqualified', key: 'total_unqualified', width: 90, align: 'right' as const },
  { title: '合格率', dataIndex: 'overall_pass_rate', key: 'overall_pass_rate', width: 90, align: 'right' as const },
  { title: '综合合格率', dataIndex: 'yield_rate', key: 'yield_rate', width: 100, align: 'right' as const },
  { title: '工序数', dataIndex: 'process_count', key: 'process_count', width: 80, align: 'center' as const },
  { title: '缺陷报工', dataIndex: 'defect_report_count', key: 'defect_report_count', width: 90, align: 'center' as const },
  { title: '设备', dataIndex: 'equipment_name', key: 'equipment_name', width: 130 },
  { title: '生产日期', dataIndex: 'production_date', key: 'production_date', width: 110 },
  { title: '操作', key: 'action', width: 80, fixed: 'right' as const, align: 'center' as const }
]

// 详情-工序质量明细列
const processColumns = [
  { title: '工序号', dataIndex: 'step_number', key: 'step_number', width: 70, align: 'center' as const },
  { title: '工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 100 },
  { title: '工作中心', dataIndex: 'work_center_name', key: 'work_center_name', width: 100 },
  { title: '计划量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 80, align: 'right' as const },
  { title: '报工量', dataIndex: 'total_reported', key: 'total_reported', width: 80, align: 'right' as const },
  { title: '合格量', dataIndex: 'total_qualified', key: 'total_qualified', width: 80, align: 'right' as const },
  { title: '不合格量', dataIndex: 'total_unqualified', key: 'total_unqualified', width: 80, align: 'right' as const },
  { title: '合格率', dataIndex: 'pass_rate', key: 'pass_rate', width: 80, align: 'right' as const }
]

// 详情-报工明细列
const reportColumns = [
  { title: '报工单号', dataIndex: 'work_report_number', key: 'work_report_number', width: 140 },
  { title: '工序号', dataIndex: 'step_number', key: 'step_number', width: 65, align: 'center' as const },
  { title: '工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 90 },
  { title: '合格量', dataIndex: 'qualified_quantity', key: 'qualified_quantity', width: 75, align: 'right' as const },
  { title: '不合格量', dataIndex: 'unqualified_quantity', key: 'unqualified_quantity', width: 80, align: 'right' as const },
  { title: '报工总量', dataIndex: 'total_quantity', key: 'total_quantity', width: 80, align: 'right' as const },
  { title: '缺陷分类', dataIndex: 'defect_class_name', key: 'defect_class_name', width: 90 },
  { title: '缺陷名称', dataIndex: 'defect_name', key: 'defect_name', width: 90 },
  { title: '不合格原因', dataIndex: 'unqualified_reason', key: 'unqualified_reason', width: 110 },
  { title: '班次', dataIndex: 'schedules_name', key: 'schedules_name', width: 90 },
  { title: '班组', dataIndex: 'team_name', key: 'team_name', width: 90 },
  { title: '操作员', dataIndex: 'operator_name', key: 'operator_name', width: 90 },
  { title: '报工日期', dataIndex: 'report_date', key: 'report_date', width: 100 }
]

// 详情-缺陷分析列
const defectColumns = [
  { title: '缺陷分类', dataIndex: 'defect_class_name', key: 'defect_class_name', width: 120 },
  { title: '缺陷名称', dataIndex: 'defect_name', key: 'defect_name', width: 120 },
  { title: '发生工序', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 100 },
  { title: '工序号', dataIndex: 'step_number', key: 'step_number', width: 70, align: 'center' as const },
  { title: '发生次数', dataIndex: 'occurrence_count', key: 'occurrence_count', width: 90, align: 'right' as const },
  { title: '不合格数', dataIndex: 'total_defect_qty', key: 'total_defect_qty', width: 90, align: 'right' as const }
]

// ==================== 图表配置 ====================

const barChartOption = computed(() => {
  if (!detailData.value?.process_summary) return {}
  const data = detailData.value.process_summary
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['合格量', '不合格量'], bottom: 0 },
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
    xAxis: {
      type: 'category',
      data: data.map((d: any) => d.standard_process_name || `工序${d.step_number}`),
      axisLabel: { rotate: 30, fontSize: 11 }
    },
    yAxis: { type: 'value' },
    series: [
      {
        name: '合格量',
        type: 'bar',
        stack: 'total',
        data: data.map((d: any) => parseFloat(d.total_qualified) || 0),
        itemStyle: { color: '#52c41a' }
      },
      {
        name: '不合格量',
        type: 'bar',
        stack: 'total',
        data: data.map((d: any) => parseFloat(d.total_unqualified) || 0),
        itemStyle: { color: '#ff4d4f' }
      }
    ]
  }
})

const lineChartOption = computed(() => {
  if (!detailData.value?.process_summary) return {}
  const data = detailData.value.process_summary
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const item = params[0]
        return `${item.name}<br/>${item.seriesName}: ${item.value}%`
      }
    },
    grid: { left: 50, right: 20, top: 20, bottom: 40 },
    xAxis: {
      type: 'category',
      data: data.map((d: any) => d.standard_process_name || `工序${d.step_number}`),
      axisLabel: { rotate: 30, fontSize: 11 }
    },
    yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%' } },
    series: [{
      name: '合格率',
      type: 'line',
      data: data.map((d: any) => parseFloat(d.pass_rate) || 100),
      itemStyle: { color: '#1890ff' },
      lineStyle: { width: 2 },
      markLine: {
        silent: true,
        data: [{ yAxis: 95, label: { formatter: '95%目标线' }, lineStyle: { color: '#faad14', type: 'dashed' } }]
      }
    }]
  }
})

const pieChartOption = computed(() => {
  if (!detailData.value?.defect_analysis?.length) return {}
  const data = detailData.value.defect_analysis
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c}件 ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [{
      type: 'pie',
      radius: ['35%', '60%'],
      center: ['50%', '45%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{c}件' },
      data: data.map((d: any) => ({
        name: `${d.defect_class_name}/${d.defect_name}(${d.standard_process_name})`,
        value: parseFloat(d.total_defect_qty) || 0
      }))
    }]
  }
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
    if (filterFactoryId.value) params.factory_id = filterFactoryId.value

    const res: any = await getQualitySummary(params)
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
      pagination.current = page
      pagination.pageSize = pageSize

      if (res.data.stats) {
        const s = res.data.stats
        statsData.total_orders = parseInt(s.total_orders) || 0
        statsData.total_reported = parseInt(s.total_reported) || 0
        statsData.total_qualified = parseInt(s.total_qualified) || 0
        statsData.total_unqualified = parseInt(s.total_unqualified) || 0
        statsData.overall_pass_rate = parseFloat(s.overall_pass_rate) || 100
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
  filterFactoryId.value = undefined
  fetchData(1)
}

// ==================== 详情 ====================

const showDetail = async (record: any) => {
  detailVisible.value = true
  detailLoading.value = true
  detailData.value = null
  activeChartTab.value = 'bar'
  try {
    const res: any = await getProductionQualityReport(record.production_order_number)
    if (res?.success) {
      detailData.value = res.data
    } else {
      message.error('获取质量报告失败')
    }
  } catch (e: any) {
    message.error('获取详情失败: ' + (e.message || '未知错误'))
  } finally {
    detailLoading.value = false
  }
}

// ==================== 工具函数 ====================

const formatDate = (val: any) => {
  if (!val) return '-'
  return dayjs(val).format('YYYY-MM-DD')
}

const formatDateTime = (val: any) => {
  if (!val) return '-'
  return dayjs(val).format('YYYY-MM-DD HH:mm')
}

const getPassRateColor = (rate: number) => {
  if (rate >= 99) return '#52c41a'
  if (rate >= 95) return '#1890ff'
  if (rate >= 90) return '#faad14'
  return '#ff4d4f'
}

const getQualityLevel = (rate: number) => {
  if (rate >= 99) return { text: '优良', color: 'success' }
  if (rate >= 95) return { text: '良好', color: 'processing' }
  if (rate >= 90) return { text: '关注', color: 'warning' }
  return { text: '异常', color: 'error' }
}

const getYieldRateColor = (rate: number | null) => {
  if (rate === null || rate === undefined) return '#999'
  if (rate >= 95) return '#52c41a'
  if (rate >= 85) return '#1890ff'
  if (rate >= 70) return '#faad14'
  return '#ff4d4f'
}

// ==================== 初始化 ====================

onMounted(() => {
  loadFactories()
  fetchData()
})
</script>

<template>
  <div class="quality-report-page">
    <a-tabs v-model:activeKey="activeMainTab" size="small">
      <a-tab-pane key="summary" tab="生产单质量汇总">
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
        <a-form-item v-if="factoryList.length > 0" label="工厂" style="margin-bottom: 0;">
          <a-select
            v-model:value="filterFactoryId"
            placeholder="全部工厂"
            style="width: 140px;"
            allow-clear
            @change="handleSearch"
          >
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
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
          title="整体合格率"
          :value="statsData.overall_pass_rate"
          suffix="%"
          :value-style="{ color: getPassRateColor(statsData.overall_pass_rate), fontSize: '28px', fontWeight: 700 }"
        >
          <template #prefix>
            <SafetyCertificateOutlined />
          </template>
        </a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="生产单数"
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
          title="报工总量 / 合格总量"
          :value="statsData.total_reported"
          :value-style="{ color: '#52c41a', fontSize: '28px', fontWeight: 700 }"
        >
          <template #prefix>
            <CheckCircleOutlined />
          </template>
          <template #suffix>
            <span style="font-size: 14px; color: #999; margin-left: 4px;">/ {{ statsData.total_qualified }}</span>
          </template>
        </a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" class="stat-card">
        <a-statistic
          title="不合格总量"
          :value="statsData.total_unqualified"
          :value-style="{ color: statsData.total_unqualified > 0 ? '#ff4d4f' : '#999', fontSize: '28px', fontWeight: 700 }"
        >
          <template #prefix>
            <CloseCircleOutlined />
          </template>
        </a-statistic>
      </a-card>
    </div>

    <!-- 质量数据列表 -->
    <a-card size="small" :bordered="false" title="生产单质量汇总">
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 1500 }"
        row-key="production_order_number"
        size="small"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, text }">
          <template v-if="column.key === 'production_order_number'">
            <a @click="showDetail(record)" style="color: #1890ff; cursor: pointer;">{{ text }}</a>
          </template>
          <template v-else-if="column.key === 'overall_pass_rate'">
            <span :style="{ color: getPassRateColor(parseFloat(text)), fontWeight: 600 }">
              {{ text }}%
            </span>
          </template>
          <template v-else-if="column.key === 'yield_rate'">
            <template v-if="text !== null && text !== undefined">
              <span :style="{ color: getYieldRateColor(parseFloat(text)), fontWeight: 600 }">
                {{ text }}%
              </span>
            </template>
            <span v-else style="color: #bbb;">-</span>
          </template>
          <template v-else-if="column.key === 'total_unqualified'">
            <a-tag v-if="parseFloat(text) > 0" color="error">{{ text }}</a-tag>
            <span v-else style="color: #999;">0</span>
          </template>
          <template v-else-if="column.key === 'defect_report_count'">
            <a-tag v-if="parseFloat(text) > 0" color="warning">{{ text }}</a-tag>
            <span v-else style="color: #999;">0</span>
          </template>
          <template v-else-if="column.key === 'production_date'">
            {{ formatDate(text) }}
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" size="small" @click="showDetail(record)">
              <template #icon><EyeOutlined /></template>
              详情
            </a-button>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- 详情弹窗 -->
    <a-modal
      v-model:open="detailVisible"
      :title="detailData?.order ? `质量报表 - ${detailData.order.production_order_number}` : '质量报表'"
      :width="1200"
      :footer="null"
      :body-style="{ maxHeight: '78vh', overflowY: 'auto', padding: '16px' }"
    >
      <a-spin :spinning="detailLoading">
        <template v-if="detailData">
          <!-- 生产单概要 -->
          <a-card size="small" :bordered="false" style="margin-bottom: 16px; background: #fafafa;">
            <a-row :gutter="16">
              <a-col :span="12">
                <a-descriptions size="small" :column="2" :labelStyle="{ fontWeight: 600, width: '85px' }">
                  <a-descriptions-item label="生产单号">{{ detailData.order.production_order_number }}</a-descriptions-item>
                  <a-descriptions-item label="生产计划号">{{ detailData.order.production_number || '-' }}</a-descriptions-item>
                  <a-descriptions-item label="产品编号">{{ detailData.order.item_number }}</a-descriptions-item>
                  <a-descriptions-item label="产品名称">{{ detailData.order.item_name }}</a-descriptions-item>
                  <a-descriptions-item label="规格" :span="2">{{ detailData.order.specifications || '-' }}</a-descriptions-item>
                  <a-descriptions-item label="图号">{{ detailData.order.product_drawing_number || '-' }}</a-descriptions-item>
                  <a-descriptions-item label="胶料编号">{{ detailData.order.rubber_compound_number || '-' }}</a-descriptions-item>
                </a-descriptions>
              </a-col>
              <a-col :span="12">
                <a-descriptions size="small" :column="2" :labelStyle="{ fontWeight: 600, width: '85px' }">
                  <a-descriptions-item label="计划数量">{{ detailData.order.planned_quantity }} {{ detailData.order.basic_unit }}</a-descriptions-item>
                  <a-descriptions-item label="设备">{{ detailData.order.equipment_name || '-' }}</a-descriptions-item>
                  <a-descriptions-item label="模具">{{ detailData.order.mould_number || '-' }}</a-descriptions-item>
                  <a-descriptions-item label="生产日期">{{ formatDate(detailData.order.production_date) }}</a-descriptions-item>
                  <a-descriptions-item label="计划完成">{{ formatDate(detailData.order.planned_completion_time) }}</a-descriptions-item>
                  <a-descriptions-item label="状态">
                    <a-tag :color="detailData.order.plan_status === '已完工' ? 'success' : 'processing'">
                      {{ detailData.order.plan_status || '-' }}
                    </a-tag>
                  </a-descriptions-item>
                </a-descriptions>
              </a-col>
            </a-row>
          </a-card>

          <!-- KPI指标卡片 -->
          <div class="kpi-row">
            <div class="kpi-item">
              <div class="kpi-label">整体合格率</div>
              <div class="kpi-value" :style="{ color: getPassRateColor(detailData.kpi_summary.overall_pass_rate) }">
                {{ detailData.kpi_summary.overall_pass_rate }}%
              </div>
              <a-tag :color="getQualityLevel(detailData.kpi_summary.overall_pass_rate).color" size="small">
                {{ getQualityLevel(detailData.kpi_summary.overall_pass_rate).text }}
              </a-tag>
            </div>
            <div class="kpi-item">
              <div class="kpi-label">报工总量</div>
              <div class="kpi-value" style="color: #1890ff;">{{ detailData.kpi_summary.total_reported }}</div>
            </div>
            <div class="kpi-item">
              <div class="kpi-label">合格总量</div>
              <div class="kpi-value" style="color: #52c41a;">{{ detailData.kpi_summary.total_qualified }}</div>
            </div>
            <div class="kpi-item">
              <div class="kpi-label">不合格总量</div>
              <div class="kpi-value" :style="{ color: detailData.kpi_summary.total_unqualified > 0 ? '#ff4d4f' : '#999' }">
                {{ detailData.kpi_summary.total_unqualified }}
              </div>
            </div>
            <div class="kpi-item">
              <div class="kpi-label">零缺陷工序</div>
              <div class="kpi-value" style="color: #52c41a;">
                {{ detailData.kpi_summary.zero_defect_count }} / {{ detailData.kpi_summary.total_processes }}
              </div>
            </div>
            <div class="kpi-item">
              <div class="kpi-label">工序合格率</div>
              <div class="kpi-value" style="color: #1890ff;">{{ detailData.kpi_summary.process_pass_rate }}%</div>
            </div>
            <div class="kpi-item">
              <div class="kpi-label">综合合格率</div>
              <div class="kpi-value" :style="{ color: getYieldRateColor(detailData.kpi_summary.yield_rate) }">
                {{ detailData.kpi_summary.yield_rate !== null && detailData.kpi_summary.yield_rate !== undefined ? detailData.kpi_summary.yield_rate + '%' : '未入库' }}
              </div>
            </div>
          </div>

          <!-- 选项卡：工序质量 / 图表 / 报工明细 / 缺陷分析 -->
          <a-tabs v-model:activeKey="activeChartTab" size="small" style="margin-top: 12px;">
            <a-tab-pane key="bar" tab="工序质量明细">
              <a-table
                :columns="processColumns"
                :data-source="detailData.process_summary"
                :pagination="false"
                row-key="step_number"
                size="small"
              >
                <template #bodyCell="{ column, text }">
                  <template v-if="column.key === 'pass_rate'">
                    <span :style="{ color: getPassRateColor(parseFloat(text)), fontWeight: 600 }">
                      {{ text }}%
                    </span>
                  </template>
                  <template v-else-if="column.key === 'total_unqualified'">
                    <a-tag v-if="parseFloat(text) > 0" color="error" size="small">{{ text }}</a-tag>
                    <span v-else style="color: #999;">0</span>
                  </template>
                </template>
              </a-table>
            </a-tab-pane>

            <a-tab-pane key="charts" tab="图表分析">
              <a-row :gutter="16">
                <a-col :span="12">
                  <div class="chart-title">工序合格/不合格对比</div>
                  <v-chart
                    v-if="detailData.process_summary?.length"
                    :option="barChartOption"
                    style="height: 280px; width: 100%;"
                    autoresize
                  />
                  <a-empty v-else description="暂无数据" />
                </a-col>
                <a-col :span="12">
                  <div class="chart-title">工序合格率趋势</div>
                  <v-chart
                    v-if="detailData.process_summary?.length"
                    :option="lineChartOption"
                    style="height: 280px; width: 100%;"
                    autoresize
                  />
                  <a-empty v-else description="暂无数据" />
                </a-col>
              </a-row>
              <a-row :gutter="16" style="margin-top: 16px;">
                <a-col :span="24">
                  <div class="chart-title">缺陷类型分布</div>
                  <v-chart
                    v-if="detailData.defect_analysis?.length"
                    :option="pieChartOption"
                    style="height: 300px; width: 100%;"
                    autoresize
                  />
                  <a-empty v-else description="无缺陷记录" style="padding: 40px 0;" />
                </a-col>
              </a-row>
            </a-tab-pane>

            <a-tab-pane key="reports" tab="报工明细">
              <a-table
                :columns="reportColumns"
                :data-source="detailData.work_reports"
                :pagination="false"
                :scroll="{ x: 1300 }"
                row-key="work_report_number"
                size="small"
              >
                <template #bodyCell="{ column, text }">
                  <template v-if="column.key === 'unqualified_quantity'">
                    <a-tag v-if="parseFloat(text) > 0" color="error" size="small">{{ text }}</a-tag>
                    <span v-else style="color: #999;">0</span>
                  </template>
                  <template v-else-if="column.key === 'report_date'">
                    {{ formatDate(text) }}
                  </template>
                </template>
              </a-table>
            </a-tab-pane>

            <a-tab-pane key="defects" tab="缺陷分析">
              <template v-if="detailData.defect_analysis?.length">
                <a-table
                  :columns="defectColumns"
                  :data-source="detailData.defect_analysis"
                  :pagination="false"
                  row-key="defect_name"
                  size="small"
                />
              </template>
              <a-empty v-else description="该生产单无缺陷记录" style="padding: 60px 0;" />
            </a-tab-pane>
          </a-tabs>
        </template>
      </a-spin>
    </a-modal>
      </a-tab-pane>
      <a-tab-pane key="yield-rate" tab="综合合格率">
        <YieldRate />
      </a-tab-pane>
      <a-tab-pane key="po-pivot" tab="生产单质量透视">
        <ProductionOrderPivot />
      </a-tab-pane>
    </a-tabs>
  </div>
</template>

<style scoped>
.quality-report-page {
  padding: 0;
}

.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 16px;
}

.stat-card {
  text-align: center;
}

.kpi-row {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 12px;
  margin-bottom: 8px;
}

.kpi-item {
  background: #f7f8fa;
  border-radius: 6px;
  padding: 12px 8px;
  text-align: center;
}

.kpi-label {
  font-size: 12px;
  color: #666;
  margin-bottom: 4px;
}

.kpi-value {
  font-size: 22px;
  font-weight: 700;
  line-height: 1.3;
}

.chart-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
  padding-left: 4px;
}
</style>
