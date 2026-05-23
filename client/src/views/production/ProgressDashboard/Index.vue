<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart, BarChart, LineChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent, GridComponent
} from 'echarts/components'
import { Card, Row, Col, Statistic, DatePicker, Select, Input, Table, Tag, Progress, Space, Button } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined,
  ScheduleOutlined, PlayCircleOutlined, CheckCircleOutlined, InboxOutlined, RiseOutlined
} from '@ant-design/icons-vue'
import dayjs from 'dayjs'
import { getProgressSummary, getProgressOrders } from '@/api/production/progressDashboard'

use([CanvasRenderer, PieChart, BarChart, LineChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const RangePicker = DatePicker.RangePicker

// 日期范围
const dateRange = ref<[dayjs.Dayjs, dayjs.Dayjs] | undefined>(undefined)
const activeTab = ref('chart')

// 汇总数据
const loading = ref(false)
const kpi = ref<any>({})
const stageFunnel = ref<any[]>([])
const workCenterLoad = ref<any[]>([])
const processProgress = ref<any>({})
const dailyTrend = ref<any[]>([])

// 订单明细
const orderLoading = ref(false)
const orders = ref<any[]>([])
const pagination = ref({ total: 0, current: 1, pageSize: 15 })
const searchKeyword = ref('')
const planStatusFilter = ref('')
const inboundStatusFilter = ref('')

const planStatusOptions = [
  { value: '', label: '全部状态' },
  { value: '已派发', label: '已派发' },
  { value: '已备料', label: '已备料' },
  { value: '生产中', label: '生产中' },
  { value: '已完成', label: '已完成' }
]
const inboundStatusOptions = [
  { value: '', label: '全部' },
  { value: '未入库', label: '未入库' },
  { value: '部分入库', label: '部分入库' },
  { value: '全部入库', label: '全部入库' }
]

// 图表配置
const stageChartOption = computed(() => {
  const data = stageFunnel.value
  if (!data.length) return {}
  const colors = ['#d9d9d9', '#69b1ff', '#95de64', '#ffc53d', '#ff7a45', '#9254de']
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c}单' },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      center: ['50%', '55%'],
      padAngle: 2,
      itemStyle: { borderRadius: 6 },
      label: { formatter: '{b}\n{c}单', fontSize: 12 },
      data: data.map((d, i) => ({ value: d.count, name: d.stage, itemStyle: { color: colors[i] || '#8c8c8c' } }))
    }]
  }
})

const wcChartOption = computed(() => {
  const data = workCenterLoad.value.slice(0, 10)
  if (!data.length) return {}
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 100, right: 30, top: 10, bottom: 30 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: data.map(d => d.work_center).reverse() },
    series: [
      { name: '已完成任务', type: 'bar', stack: 'total', data: data.map(d => d.completed_tasks).reverse(), itemStyle: { color: '#73d13d' } },
      { name: '进行中任务', type: 'bar', stack: 'total', data: data.map(d => d.total_tasks - d.completed_tasks).reverse(), itemStyle: { color: '#ffc53d' } }
    ]
  }
})

const trendChartOption = computed(() => {
  const data = dailyTrend.value
  if (!data.length) return {}
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 20, top: 30, bottom: 30 },
    xAxis: { type: 'category', data: data.map(d => d.date.slice(5)) },
    yAxis: { type: 'value', name: '报工次数' },
    series: [
      { name: '报工次数', type: 'line', smooth: true, data: data.map(d => d.report_count), itemStyle: { color: '#1890ff' }, areaStyle: { opacity: 0.15 } },
      { name: '合格数量', type: 'line', smooth: true, data: data.map(d => d.qualified_qty), itemStyle: { color: '#52c41a' }, yAxisIndex: 0 }
    ]
  }
})

const progressChartOption = computed(() => {
  const p = processProgress.value
  if (!p || Object.keys(p).length === 0) return {}
  const labels = ['首道工序', '中间工序', '末道工序', '入库']
  const values = [p.first_step_rate, p.middle_step_rate, p.last_step_rate, p.inbound_rate]
  return {
    tooltip: { trigger: 'axis', formatter: '{b}: {c}%' },
    grid: { left: 80, right: 30, top: 10, bottom: 30 },
    xAxis: { type: 'value', max: 100, axisLabel: { formatter: '{value}%' } },
    yAxis: { type: 'category', data: labels.reverse() },
    series: [{
      type: 'bar',
      data: values.reverse(),
      itemStyle: {
        color: (params: any) => {
          const v = params.value
          return v >= 80 ? '#52c41a' : v >= 50 ? '#faad14' : '#ff4d4f'
        },
        borderRadius: [0, 4, 4, 0]
      },
      label: { show: true, position: 'right', formatter: '{c}%' }
    }]
  }
})

// 数据加载
const fetchSummary = async () => {
  loading.value = true
  try {
    const params: any = {}
    if (dateRange.value) {
      params.dateFrom = dateRange.value[0].format('YYYY-MM-DD')
      params.dateTo = dateRange.value[1].format('YYYY-MM-DD')
    }
    const res: any = await getProgressSummary(params)
    const d = res.data
    kpi.value = d.kpi || {}
    stageFunnel.value = d.stage_funnel || []
    workCenterLoad.value = d.work_center_load || []
    processProgress.value = d.process_progress || {}
    dailyTrend.value = d.daily_trend || []
  } catch (e) { console.error(e) }
  loading.value = false
}

const fetchOrders = async () => {
  orderLoading.value = true
  try {
    const params: any = {
      page: pagination.value.current,
      limit: pagination.value.pageSize,
      search: searchKeyword.value,
      plan_status: planStatusFilter.value,
      inbound_status: inboundStatusFilter.value
    }
    if (dateRange.value) {
      params.dateFrom = dateRange.value[0].format('YYYY-MM-DD')
      params.dateTo = dateRange.value[1].format('YYYY-MM-DD')
    }
    const res: any = await getProgressOrders(params)
    orders.value = res.data.items || []
    pagination.value.total = res.data.pagination?.total || 0
  } catch (e) { console.error(e) }
  orderLoading.value = false
}

const handleTableChange = (pag: any) => {
  pagination.value.current = pag.current
  fetchOrders()
}

const handleSearch = () => {
  pagination.value.current = 1
  fetchOrders()
}

const handleDateChange = () => {
  fetchSummary()
  if (activeTab.value === 'detail') fetchOrders()
}

const planStatusColor: Record<string, string> = {
  '未开始': 'default', '已派发': 'processing', '已备料': 'cyan',
  '生产中': 'orange', '已完成': 'green', '已关闭': 'red'
}
const inboundStatusColor: Record<string, string> = {
  '未入库': 'default', '部分入库': 'orange', '全部入库': 'green'
}

const columns = [
  { title: '生产单号', dataIndex: 'production_order_number', width: 150, fixed: 'left' as const },
  { title: '产品编号', dataIndex: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', width: 150, ellipsis: true },
  { title: '计划量', dataIndex: 'planned_quantity', width: 90, align: 'right' as const },
  { title: '生产状态', dataIndex: 'plan_status', width: 90, align: 'center' as const },
  { title: '当前工序', dataIndex: 'current_step_name', width: 110, ellipsis: true },
  { title: '完成率', dataIndex: 'completion_rate', width: 130, align: 'center' as const },
  { title: '领料状态', dataIndex: 'preparation_status', width: 90, align: 'center' as const },
  { title: '检验状态', dataIndex: 'inspect_status', width: 100, align: 'center' as const },
  { title: '入库状态', dataIndex: 'inbound_status', width: 90, align: 'center' as const }
]

onMounted(() => {
  fetchSummary()
  fetchOrders()
})
</script>

<template>
  <div style="padding: 0 16px 16px;">
    <!-- 日期范围选择器（顶部） -->
    <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-top: 8px;">
      <span style="font-weight: 600; font-size: 15px;">生产工单仪表板</span>
      <RangePicker v-model:value="dateRange" @change="handleDateChange" style="width: 260px;" />
      <Button @click="fetchSummary(); fetchOrders()"><ReloadOutlined /> 刷新</Button>
    </div>

    <!-- 页签切换 -->
    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="chart" tab="图表总览">
        <!-- KPI 卡片 -->
        <Row :gutter="16" style="margin-bottom: 16px;">
          <Col :span="4">
            <Card size="small"><Statistic title="生产单总数" :value="kpi.total_orders" :value-style="{ color: '#1890ff' }"><template #prefix><ScheduleOutlined /></template></Statistic></Card>
          </Col>
          <Col :span="4">
            <Card size="small"><Statistic title="生产中" :value="kpi.in_production" :value-style="{ color: '#fa8c16' }"><template #prefix><PlayCircleOutlined /></template></Statistic></Card>
          </Col>
          <Col :span="4">
            <Card size="small"><Statistic title="已完成" :value="kpi.completed" :value-style="{ color: '#52c41a' }"><template #prefix><CheckCircleOutlined /></template></Statistic></Card>
          </Col>
          <Col :span="4">
            <Card size="small"><Statistic title="已入库" :value="kpi.inbound" :value-style="{ color: '#9254de' }"><template #prefix><InboxOutlined /></template></Statistic></Card>
          </Col>
          <Col :span="4">
            <Card size="small"><Statistic title="综合完成率" :value="kpi.overall_completion_rate" suffix="%" :value-style="{ color: '#13c2c2' }"><template #prefix><RiseOutlined /></template></Statistic></Card>
          </Col>
        </Row>

        <!-- 图表区域 -->
        <Row :gutter="16" style="margin-bottom: 16px;">
          <Col :span="12">
            <Card title="阶段分布" size="small" :loading="loading">
              <VChart :option="stageChartOption" style="height: 300px;" autoresize />
            </Card>
          </Col>
          <Col :span="12">
            <Card title="工序进度分布" size="small" :loading="loading">
              <VChart :option="progressChartOption" style="height: 300px;" autoresize />
            </Card>
          </Col>
        </Row>

        <Row :gutter="16">
          <Col :span="12">
            <Card title="工作中心负载" size="small" :loading="loading">
              <VChart :option="wcChartOption" style="height: 320px;" autoresize />
            </Card>
          </Col>
          <Col :span="12">
            <Card title="日产出趋势（近30天）" size="small" :loading="loading">
              <VChart :option="trendChartOption" style="height: 320px;" autoresize />
            </Card>
          </Col>
        </Row>
      </a-tab-pane>

      <a-tab-pane key="detail" tab="订单明细" force-render>
        <!-- 搜索栏 -->
        <div style="display: flex; gap: 8px; margin-bottom: 12px;">
          <Input v-model:value="searchKeyword" placeholder="生产单号/产品编号/名称" style="width: 220px;" allow-clear @pressEnter="handleSearch">
            <template #prefix><SearchOutlined /></template>
          </Input>
          <Select v-model:value="planStatusFilter" :options="planStatusOptions" style="width: 120px;" @change="handleSearch" />
          <Select v-model:value="inboundStatusFilter" :options="inboundStatusOptions" style="width: 120px;" @change="handleSearch" />
          <Button type="primary" @click="handleSearch"><SearchOutlined /> 查询</Button>
        </div>

        <Table
          :columns="columns"
          :data-source="orders"
          :loading="orderLoading"
          :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: false, showTotal: (t: number) => `共 ${t} 条` }"
          :scroll="{ x: 1200 }"
          row-key="production_order_number"
          size="small"
          @change="handleTableChange"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'plan_status'">
              <Tag :color="planStatusColor[record.plan_status] || 'default'">{{ record.plan_status }}</Tag>
            </template>
            <template v-else-if="column.dataIndex === 'inbound_status'">
              <Tag :color="inboundStatusColor[record.inbound_status] || 'default'">{{ record.inbound_status }}</Tag>
            </template>
            <template v-else-if="column.dataIndex === 'completion_rate'">
              <Progress :percent="record.completion_rate" :size="[120, 8]" :stroke-color="record.completion_rate >= 80 ? '#52c41a' : record.completion_rate >= 50 ? '#faad14' : '#ff4d4f'" />
            </template>
            <template v-else-if="column.dataIndex === 'preparation_status'">
              <Tag :color="record.preparation_status === '已领料' ? 'green' : record.preparation_status === '部分领料' ? 'orange' : 'default'">{{ record.preparation_status }}</Tag>
            </template>
            <template v-else-if="column.dataIndex === 'inspect_status'">
              <Tag :color="record.inspect_status === '检验合格' ? 'green' : record.inspect_status === '待检验' ? 'orange' : 'default'">{{ record.inspect_status || '-' }}</Tag>
            </template>
          </template>
        </Table>
      </a-tab-pane>
    </a-tabs>
  </div>
</template>
