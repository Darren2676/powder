<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import {
  SearchOutlined, ReloadOutlined, FileTextOutlined, DeleteOutlined,
  ClockCircleOutlined, CheckCircleOutlined, EyeOutlined
} from '@ant-design/icons-vue'
import { getScrapDisposalKPI, getScrapDisposalChartData, getScrapDisposalTableData } from '@/api/quality/scrapDisposalReport'
import { getFactories } from '@/api/system/factory'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart, LineChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, BarChart, PieChart, LineChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const loading = ref(false)
const activeTab = ref('chart')
const searchText = ref('')
const dateRange = ref<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)

const statsData = reactive({ total: 0, total_qty: 0, pending_count: 0, confirmed_count: 0 })
const chartData = ref<any>({})
const tableData = ref<any[]>([])
const detailVisible = ref(false)
const detailData = ref<any>(null)
const filterFactoryId = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch { /* ignore */ }
}

const pagination = reactive({
  current: 1, pageSize: 20, total: 0,
  showSizeChanger: true, showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `${total} 条`
})

const columns = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true,
    customRender: ({ record }: any) => record.factory_short || '-' },
  { title: '处置单号', dataIndex: 'disposal_number', key: 'disposal_number', width: 160 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '处置原因', dataIndex: 'disposal_reason', key: 'disposal_reason', width: 140, ellipsis: true },
  { title: '处置数量', dataIndex: 'total_qty', key: 'total_qty', width: 90, align: 'right' as const },
  { title: '申请日期', dataIndex: 'creation_date', key: 'creation_date', width: 110 },
  { title: '确认人', dataIndex: 'confirmed_by', key: 'confirmed_by', width: 80 },
  { title: '确认日期', dataIndex: 'confirmed_date', key: 'confirmed_date', width: 110 },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 140, ellipsis: true },
]

const getParams = () => {
  const params: any = {}
  if (filterFactoryId.value !== undefined && filterFactoryId.value !== null) params.factory_id = filterFactoryId.value
  if (searchText.value) params.search = searchText.value
  if (dateRange.value) { params.start_date = dateRange.value[0].format('YYYY-MM-DD'); params.end_date = dateRange.value[1].format('YYYY-MM-DD') }
  return params
}

const fetchKPI = async () => { try { const res: any = await getScrapDisposalKPI(getParams()); if (res?.success) Object.assign(statsData, res.data) } catch { /* */ } }
const fetchChartData = async () => { try { const res: any = await getScrapDisposalChartData(getParams()); if (res?.success) chartData.value = res.data } catch { /* */ } }
const fetchTableData = async (page = 1, pageSize = pagination.pageSize) => {
  loading.value = true
  try {
    const params = { ...getParams(), page, limit: pageSize }
    const res: any = await getScrapDisposalTableData(params)
    if (res?.success) { tableData.value = res.data.items || []; pagination.total = res.data.total || 0; pagination.current = page; pagination.pageSize = pageSize }
  } catch { message.error('获取数据失败') } finally { loading.value = false }
}

const handleSearch = () => { fetchKPI(); fetchChartData(); fetchTableData(1) }
const handleReset = () => { searchText.value = ''; dateRange.value = null; handleSearch() }
const handleTableChange = (pag: any) => { fetchTableData(pag.current, pag.pageSize) }
const showDetail = (record: any) => { detailData.value = record; detailVisible.value = true }

const statusPieOption = computed(() => {
  const data = chartData.value?.status_distribution || []
  if (!data.length) return {}
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [{ type: 'pie', radius: ['35%', '60%'], center: ['50%', '45%'],
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{c}单' },
      data: data.map((d: any) => ({ name: d.name, value: parseInt(d.value) || 0 }))
    }]
  }
})

const reasonPieOption = computed(() => {
  const data = chartData.value?.reason_distribution || []
  if (!data.length) return {}
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    series: [{ type: 'pie', radius: ['35%', '60%'], center: ['50%', '45%'],
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{c}单' },
      data: data.map((d: any) => ({ name: d.name, value: parseInt(d.value) || 0 }))
    }]
  }
})

const trendOption = computed(() => {
  const data = chartData.value?.monthly_trend || []
  if (!data.length) return {}
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['处置单数', '处置数量'], bottom: 0 },
    grid: { left: 50, right: 50, top: 20, bottom: 40 },
    xAxis: { type: 'category', data: data.map((d: any) => d.month) },
    yAxis: [{ type: 'value', name: '单数' }, { type: 'value', name: '数量' }],
    series: [
      { name: '处置单数', type: 'bar', barMaxWidth: 24, data: data.map((d: any) => parseInt(d.order_count) || 0), itemStyle: { color: '#1890ff' } },
      { name: '处置数量', type: 'line', yAxisIndex: 1, data: data.map((d: any) => parseFloat(d.total_qty) || 0), itemStyle: { color: '#ff4d4f' } }
    ]
  }
})

const statusColor = (s: string) => {
  if (s === '已确认') return 'green'
  if (s === '待确认') return 'orange'
  if (s === '已驳回') return 'red'
  return 'default'
}

onMounted(() => { loadFactories(); fetchKPI(); fetchChartData(); fetchTableData() })
</script>

<template>
  <div style="padding: 0;">
    <a-card size="small" :bordered="false" style="margin-bottom: 16px;">
      <a-form layout="inline" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center;">
        <a-form-item label="所属工厂" style="margin-bottom: 0;" v-if="factoryList.length > 0">
          <a-select v-model:value="filterFactoryId" placeholder="全部工厂" allow-clear style="width: 140px;" @change="handleSearch">
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="搜索" style="margin-bottom: 0;">
          <a-input-search v-model:value="searchText" placeholder="处置单号/处置原因" style="width: 220px;" allow-clear @search="handleSearch" />
        </a-form-item>
        <a-form-item label="日期范围" style="margin-bottom: 0;">
          <a-range-picker v-model:value="dateRange" :placeholder="['开始日期', '结束日期']" style="width: 240px;" @change="handleSearch" />
        </a-form-item>
        <a-form-item style="margin-bottom: 0;">
          <a-space>
            <a-button type="primary" @click="handleSearch"><template #icon><SearchOutlined /></template>查询</a-button>
            <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          </a-space>
        </a-form-item>
      </a-form>
    </a-card>

    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px;">
      <a-card size="small" :bordered="false" style="text-align: center;">
        <a-statistic title="处置单总数" :value="statsData.total" :value-style="{ color: '#1890ff', fontSize: '28px', fontWeight: 700 }"><template #prefix><FileTextOutlined /></template></a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" style="text-align: center;">
        <a-statistic title="处置总数量" :value="statsData.total_qty" :value-style="{ color: '#ff4d4f', fontSize: '28px', fontWeight: 700 }"><template #prefix><DeleteOutlined /></template></a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" style="text-align: center;">
        <a-statistic title="待确认数" :value="statsData.pending_count" :value-style="{ color: '#faad14', fontSize: '28px', fontWeight: 700 }"><template #prefix><ClockCircleOutlined /></template></a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" style="text-align: center;">
        <a-statistic title="已确认数" :value="statsData.confirmed_count" :value-style="{ color: '#52c41a', fontSize: '28px', fontWeight: 700 }"><template #prefix><CheckCircleOutlined /></template></a-statistic>
      </a-card>
    </div>

    <a-card size="small" :bordered="false">
      <a-tabs v-model:activeKey="activeTab" size="small">
        <a-tab-pane key="chart" tab="图表概览">
          <a-row :gutter="16">
            <a-col :span="12">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">处置状态分布</div>
              <v-chart v-if="chartData?.status_distribution?.length" :option="statusPieOption" style="height: 280px;" autoresize />
              <a-empty v-else description="暂无数据" />
            </a-col>
            <a-col :span="12">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">处置原因分析</div>
              <v-chart v-if="chartData?.reason_distribution?.length" :option="reasonPieOption" style="height: 280px;" autoresize />
              <a-empty v-else description="暂无数据" />
            </a-col>
          </a-row>
          <a-row :gutter="16" style="margin-top: 16px;">
            <a-col :span="24">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">月度处置趋势</div>
              <v-chart v-if="chartData?.monthly_trend?.length" :option="trendOption" style="height: 300px;" autoresize />
              <a-empty v-else description="暂无数据" />
            </a-col>
          </a-row>
        </a-tab-pane>
        <a-tab-pane key="detail" tab="处置单明细">
          <a-table :columns="columns" :data-source="tableData" :loading="loading" :pagination="pagination" :scroll="{ x: 900 }" row-key="disposal_number" size="small" @change="handleTableChange">
            <template #bodyCell="{ column, record, text }">
              <template v-if="column.key === 'disposal_number'">
                <a style="color: #1890ff; cursor: pointer;" @click="showDetail(record)">{{ text }}</a>
              </template>
              <template v-else-if="column.key === 'status'">
                <a-tag :color="statusColor(text)">{{ text }}</a-tag>
              </template>
              <template v-else-if="column.key === 'creation_date' || column.key === 'confirmed_date'">
                {{ text ? dayjs(text).format('YYYY-MM-DD') : '-' }}
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <a-modal v-model:open="detailVisible" :title="'处置单详情 - ' + (detailData?.disposal_number || '')" :width="800" :footer="null" :body-style="{ maxHeight: '70vh', overflowY: 'auto', padding: '16px' }">
      <template v-if="detailData">
        <a-descriptions size="small" :column="2" bordered>
          <a-descriptions-item label="处置单号">{{ detailData.disposal_number }}</a-descriptions-item>
          <a-descriptions-item label="状态"><a-tag :color="statusColor(detailData.status)">{{ detailData.status }}</a-tag></a-descriptions-item>
          <a-descriptions-item label="处置原因">{{ detailData.disposal_reason }}</a-descriptions-item>
          <a-descriptions-item label="处置数量">{{ detailData.total_qty }}</a-descriptions-item>
          <a-descriptions-item label="申请人">{{ detailData.operator }}</a-descriptions-item>
          <a-descriptions-item label="申请日期">{{ detailData.creation_date ? dayjs(detailData.creation_date).format('YYYY-MM-DD') : '-' }}</a-descriptions-item>
          <a-descriptions-item label="确认人">{{ detailData.confirmed_by || '-' }}</a-descriptions-item>
          <a-descriptions-item label="确认日期">{{ detailData.confirmed_date ? dayjs(detailData.confirmed_date).format('YYYY-MM-DD') : '-' }}</a-descriptions-item>
          <a-descriptions-item label="备注" :span="2">{{ detailData.remark || '-' }}</a-descriptions-item>
        </a-descriptions>
      </template>
    </a-modal>
  </div>
</template>
