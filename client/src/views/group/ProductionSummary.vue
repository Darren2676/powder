<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { getHQProductionSummary, type ProductionSummaryData } from '@/api/system/headquarters'
import { ScheduleOutlined, CheckCircleOutlined, SyncOutlined, CloseCircleOutlined } from '@ant-design/icons-vue'
import dayjs from 'dayjs'

use([CanvasRenderer, BarChart, LineChart, PieChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const loading = ref(false)
const data = ref<ProductionSummaryData | null>(null)
const dateRange = ref<[dayjs.Dayjs, dayjs.Dayjs]>()
const activeTab = ref('chart')

const fetchData = async () => {
  loading.value = true
  try {
    const params: any = {}
    if (dateRange.value) {
      params.dateFrom = dateRange.value[0].format('YYYY-MM-DD')
      params.dateTo = dateRange.value[1].format('YYYY-MM-DD')
    }
    const res = await getHQProductionSummary(params)
    if (res.success) data.value = res.data
  } finally { loading.value = false }
}
onMounted(fetchData)

const summary = computed(() => data.value?.summary || { total_orders: 0, completed_count: 0, in_progress_count: 0, total_planned_qty: 0, total_completed_qty: 0, completion_rate: '0%' })
const factories = computed(() => data.value?.factories || [])

const kpiCards = computed(() => [
  { title: '生产单总数', value: summary.value.total_orders, icon: ScheduleOutlined, color: '#1890ff', bg: '#e6f7ff' },
  { title: '已完成', value: summary.value.completed_count, icon: CheckCircleOutlined, color: '#52c41a', bg: '#f6ffed' },
  { title: '进行中', value: summary.value.in_progress_count, icon: SyncOutlined, color: '#fa8c16', bg: '#fff7e6' },
  { title: '完成率', value: summary.value.completion_rate, icon: CheckCircleOutlined, color: '#13c2c2', bg: '#e6fffb' },
  { title: '计划产量', value: summary.value.total_planned_qty, icon: ScheduleOutlined, color: '#722ed1', bg: '#f9f0ff' },
])

const factoryBarOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['计划产量', '完成产量', '入库量'], top: 0 },
  grid: { left: 60, right: 30, bottom: 30, top: 40 },
  xAxis: { type: 'category', data: factories.value.map((f: any) => f.factory.factory_name) },
  yAxis: { type: 'value' },
  series: [
    { name: '计划产量', type: 'bar', data: factories.value.map((f: any) => f.total_planned_qty), itemStyle: { color: '#1890ff' } },
    { name: '完成产量', type: 'bar', data: factories.value.map((f: any) => f.total_completed_qty), itemStyle: { color: '#52c41a' } },
    { name: '入库量', type: 'bar', data: factories.value.map((f: any) => f.total_inbound_qty), itemStyle: { color: '#13c2c2' } },
  ]
}))

const trendOption = computed(() => {
  const allMonths = new Set<string>()
  factories.value.forEach((f: any) => f.monthly_trend.forEach((t: any) => allMonths.add(t.month)))
  const months = [...allMonths].sort()
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: factories.value.map((f: any) => f.factory.factory_name), top: 0 },
    grid: { left: 60, right: 30, bottom: 30, top: 40 },
    xAxis: { type: 'category', data: months.map((m: string) => m.substring(5)) },
    yAxis: { type: 'value' },
    series: factories.value.map((f: any, i: number) => ({
      name: f.factory.factory_name, type: 'line', smooth: true,
      data: months.map((m: string) => f.monthly_trend.find((t: any) => t.month === m)?.completed_qty || 0),
      itemStyle: { color: ['#1890ff', '#fa8c16', '#52c41a', '#722ed1'][i % 4] }
    }))
  }
})

const statusPieOption = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [{
    type: 'pie', radius: ['40%', '70%'],
    data: [
      { name: '已完成', value: summary.value.completed_count, itemStyle: { color: '#52c41a' } },
      { name: '进行中', value: summary.value.in_progress_count, itemStyle: { color: '#fa8c16' } },
    ]
  }]
}))

const tableColumns = [
  { title: '工厂', dataIndex: ['factory', 'factory_name'], key: 'factory_name', width: 120 },
  { title: '生产单总数', dataIndex: 'total_orders', key: 'total_orders', width: 100 },
  { title: '已完成', dataIndex: 'completed_count', key: 'completed_count', width: 90 },
  { title: '已入库', dataIndex: 'inbound_count', key: 'inbound_count', width: 90 },
  { title: '进行中', dataIndex: 'in_progress_count', key: 'in_progress_count', width: 90 },
  { title: '已取消', dataIndex: 'cancelled_count', key: 'cancelled_count', width: 90 },
  { title: '计划产量', dataIndex: 'total_planned_qty', key: 'total_planned_qty', width: 110 },
  { title: '完成产量', dataIndex: 'total_completed_qty', key: 'total_completed_qty', width: 110 },
  { title: '入库量', dataIndex: 'total_inbound_qty', key: 'total_inbound_qty', width: 110 },
]
</script>

<template>
  <div class="production-summary-page" style="padding: 16px">
    <a-card :bordered="false">
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
        <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">集团生产汇总表</span>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
          <a-range-picker v-model:value="dateRange" :placeholder="['开始日期', '结束日期']" style="width: 260px" />
          <a-button type="primary" @click="fetchData" :loading="loading">查询</a-button>
        </div>
      </div>
      <a-tabs v-model:activeKey="activeTab">
        <a-tab-pane key="chart" tab="图表概览">
          <a-row :gutter="16" style="margin-bottom: 20px">
            <a-col :span="4" v-for="card in kpiCards" :key="card.title">
              <a-card size="small" :bordered="false" :style="{ background: card.bg }">
                <a-statistic :title="card.title" :value="card.value" :value-style="{ color: card.color, fontSize: '20px' }">
                  <template #prefix><component :is="card.icon" /></template>
                </a-statistic>
              </a-card>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="12"><a-card title="各工厂生产对比" size="small"><VChart :option="factoryBarOption" style="height: 300px" autoresize /></a-card></a-col>
            <a-col :span="12"><a-card title="订单状态分布" size="small"><VChart :option="statusPieOption" style="height: 300px" autoresize /></a-card></a-col>
          </a-row>
          <a-card title="月度产量趋势" size="small" style="margin-top: 16px"><VChart :option="trendOption" style="height: 300px" autoresize /></a-card>
        </a-tab-pane>
        <a-tab-pane key="detail" tab="明细数据">
          <a-table :dataSource="factories" :columns="tableColumns" rowKey="factory.id" :pagination="false" size="small" bordered />
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </div>
</template>
