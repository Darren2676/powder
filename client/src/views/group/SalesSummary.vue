<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { getHQSalesSummary, type SalesSummaryData } from '@/api/system/headquarters'
import { ShoppingOutlined, CheckCircleOutlined, ClockCircleOutlined, CloseCircleOutlined } from '@ant-design/icons-vue'
import dayjs from 'dayjs'

use([CanvasRenderer, BarChart, LineChart, PieChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const loading = ref(false)
const data = ref<SalesSummaryData | null>(null)
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
    const res = await getHQSalesSummary(params)
    if (res.success) data.value = res.data
  } finally { loading.value = false }
}
onMounted(fetchData)

const summary = computed(() => data.value?.summary || { total_orders: 0, total_amount: 0, completed_amount: 0, pending_count: 0, cancelled_count: 0 })
const factories = computed(() => data.value?.factories || [])

const kpiCards = computed(() => [
  { title: '订单总数', value: summary.value.total_orders, icon: ShoppingOutlined, color: '#1890ff', bg: '#e6f7ff' },
  { title: '订单总额', value: summary.value.total_amount, suffix: '元', icon: ShoppingOutlined, color: '#fa8c16', bg: '#fff7e6' },
  { title: '已完成金额', value: summary.value.completed_amount, suffix: '元', icon: CheckCircleOutlined, color: '#52c41a', bg: '#f6ffed' },
  { title: '待执行订单', value: summary.value.pending_count, icon: ClockCircleOutlined, color: '#faad14', bg: '#fffbe6' },
  { title: '已取消订单', value: summary.value.cancelled_count, icon: CloseCircleOutlined, color: '#ff4d4f', bg: '#fff2f0' },
])

// 各工厂销售对比柱状图
const factoryBarOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['订单总额', '已完成金额'], top: 0 },
  grid: { left: 80, right: 30, bottom: 30, top: 40 },
  xAxis: { type: 'category', data: factories.value.map(f => f.factory.factory_name) },
  yAxis: { type: 'value', axisLabel: { formatter: (v: number) => v >= 10000 ? (v / 10000).toFixed(0) + '万' : String(v) } },
  series: [
    { name: '订单总额', type: 'bar', data: factories.value.map(f => f.total_amount), itemStyle: { color: '#1890ff' } },
    { name: '已完成金额', type: 'bar', data: factories.value.map(f => f.completed_amount), itemStyle: { color: '#52c41a' } },
  ]
}))

// 月度趋势折线图
const trendOption = computed(() => {
  const allMonths = new Set<string>()
  factories.value.forEach(f => f.monthly_trend.forEach(t => { if (t.month) allMonths.add(t.month) }))
  const months = [...allMonths].sort()
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: factories.value.map(f => f.factory?.factory_name || ''), top: 0 },
    grid: { left: 80, right: 30, bottom: 30, top: 40 },
    xAxis: { type: 'category', data: months.map(m => m ? m.substring(5) : '') },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => v >= 10000 ? (v / 10000).toFixed(0) + '万' : String(v) } },
    series: factories.value.map((f, i) => ({
      name: f.factory?.factory_name || '', type: 'line', smooth: true,
      data: months.map(m => f.monthly_trend.find(t => t.month === m)?.total_amount || 0),
      itemStyle: { color: ['#1890ff', '#fa8c16', '#52c41a', '#722ed1'][i % 4] }
    }))
  }
})

// 订单状态分布饼图
const statusPieOption = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [{
    type: 'pie', radius: ['40%', '70%'],
    data: [
      { name: '已完成', value: summary.value.completed_amount, itemStyle: { color: '#52c41a' } },
      { name: '待执行', value: summary.value.pending_count, itemStyle: { color: '#faad14' } },
      { name: '已取消', value: summary.value.cancelled_count, itemStyle: { color: '#ff4d4f' } },
    ]
  }]
}))

const tableColumns = [
  { title: '工厂', dataIndex: ['factory', 'factory_name'], key: 'factory_name', width: 120 },
  { title: '订单数', dataIndex: 'order_count', key: 'order_count', width: 90, sorter: (a: any, b: any) => a.order_count - b.order_count },
  { title: '订单总额', dataIndex: 'total_amount', key: 'total_amount', width: 130, sorter: (a: any, b: any) => a.total_amount - b.total_amount },
  { title: '已完成金额', dataIndex: 'completed_amount', key: 'completed_amount', width: 130 },
  { title: '已完成数', dataIndex: 'completed_count', key: 'completed_count', width: 100 },
  { title: '待执行数', dataIndex: 'pending_count', key: 'pending_count', width: 100 },
  { title: '已取消数', dataIndex: 'cancelled_count', key: 'cancelled_count', width: 100 },
]

const formatAmount = (v: number) => v >= 10000 ? (v / 10000).toFixed(2) + '万' : v.toFixed(2)
</script>

<template>
  <div class="sales-summary-page" style="padding: 16px">
    <a-card :bordered="false">
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
        <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">集团销售汇总表</span>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
          <a-range-picker v-model:value="dateRange" :placeholder="['开始日期', '结束日期']" style="width: 260px" />
          <a-button type="primary" @click="fetchData" :loading="loading">查询</a-button>
        </div>
      </div>

      <a-tabs v-model:activeKey="activeTab">
        <a-tab-pane key="chart" tab="图表概览">
          <!-- KPI卡片 -->
          <a-row :gutter="16" style="margin-bottom: 20px">
            <a-col :span="4" v-for="card in kpiCards" :key="card.title">
              <a-card size="small" :bordered="false" :style="{ background: card.bg }">
                <a-statistic :title="card.title" :value="card.value" :suffix="card.suffix || ''" :value-style="{ color: card.color, fontSize: '20px' }">
                  <template #prefix><component :is="card.icon" /></template>
                </a-statistic>
              </a-card>
            </a-col>
          </a-row>
          <!-- 图表区 -->
          <a-row :gutter="16">
            <a-col :span="12"><a-card title="各工厂销售对比" size="small"><VChart :option="factoryBarOption" style="height: 300px" autoresize /></a-card></a-col>
            <a-col :span="12"><a-card title="订单状态分布" size="small"><VChart :option="statusPieOption" style="height: 300px" autoresize /></a-card></a-col>
          </a-row>
          <a-card title="月度销售趋势" size="small" style="margin-top: 16px"><VChart :option="trendOption" style="height: 300px" autoresize /></a-card>
        </a-tab-pane>

        <a-tab-pane key="detail" tab="明细数据">
          <a-table :dataSource="factories" :columns="tableColumns" rowKey="factory.id" :pagination="false" size="small" bordered>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'total_amount' || column.key === 'completed_amount'">
                {{ formatAmount(record[column.dataIndex as string]) }}
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </div>
</template>
