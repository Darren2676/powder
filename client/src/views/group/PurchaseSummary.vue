<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { getHQPurchaseSummary, type PurchaseSummaryData } from '@/api/system/headquarters'
import { ShoppingCartOutlined, CheckCircleOutlined, ClockCircleOutlined } from '@ant-design/icons-vue'
import dayjs from 'dayjs'

use([CanvasRenderer, BarChart, LineChart, PieChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const loading = ref(false)
const data = ref<PurchaseSummaryData | null>(null)
const dateRange = ref<[dayjs.Dayjs, dayjs.Dayjs]>()
const activeTab = ref('chart')

const fetchData = async () => {
  loading.value = true
  try {
    const params: any = {}
    if (dateRange.value) { params.dateFrom = dateRange.value[0].format('YYYY-MM-DD'); params.dateTo = dateRange.value[1].format('YYYY-MM-DD') }
    const res = await getHQPurchaseSummary(params)
    if (res.success) data.value = res.data
  } finally { loading.value = false }
}
onMounted(fetchData)

const summary = computed(() => data.value?.summary || { total_orders: 0, total_amount: 0, completed_amount: 0, pending_count: 0 })
const factories = computed(() => data.value?.factories || [])

const kpiCards = computed(() => [
  { title: '采购订单数', value: summary.value.total_orders, icon: ShoppingCartOutlined, color: '#1890ff', bg: '#e6f7ff' },
  { title: '采购总额', value: summary.value.total_amount, suffix: '元', icon: ShoppingCartOutlined, color: '#fa8c16', bg: '#fff7e6' },
  { title: '已完成金额', value: summary.value.completed_amount, suffix: '元', icon: CheckCircleOutlined, color: '#52c41a', bg: '#f6ffed' },
  { title: '待执行订单', value: summary.value.pending_count, icon: ClockCircleOutlined, color: '#faad14', bg: '#fffbe6' },
])

const factoryBarOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['采购总额', '已完成金额'], top: 0 },
  grid: { left: 80, right: 30, bottom: 30, top: 40 },
  xAxis: { type: 'category', data: factories.value.map((f: any) => f.factory.factory_name) },
  yAxis: { type: 'value', axisLabel: { formatter: (v: number) => v >= 10000 ? (v / 10000).toFixed(0) + '万' : String(v) } },
  series: [
    { name: '采购总额', type: 'bar', data: factories.value.map((f: any) => f.total_amount), itemStyle: { color: '#1890ff' } },
    { name: '已完成金额', type: 'bar', data: factories.value.map((f: any) => f.completed_amount), itemStyle: { color: '#52c41a' } },
  ]
}))

const trendOption = computed(() => {
  const allMonths = new Set<string>()
  factories.value.forEach((f: any) => f.monthly_trend.forEach((t: any) => allMonths.add(t.month)))
  const months = [...allMonths].sort()
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: factories.value.map((f: any) => f.factory.factory_name), top: 0 },
    grid: { left: 80, right: 30, bottom: 30, top: 40 },
    xAxis: { type: 'category', data: months.map((m: string) => m.substring(5)) },
    yAxis: { type: 'value', axisLabel: { formatter: (v: number) => v >= 10000 ? (v / 10000).toFixed(0) + '万' : String(v) } },
    series: factories.value.map((f: any, i: number) => ({
      name: f.factory.factory_name, type: 'line', smooth: true,
      data: months.map((m: string) => f.monthly_trend.find((t: any) => t.month === m)?.total_amount || 0),
      itemStyle: { color: ['#1890ff', '#fa8c16', '#52c41a', '#722ed1'][i % 4] }
    }))
  }
})

const tableColumns = [
  { title: '工厂', dataIndex: ['factory', 'factory_name'], key: 'factory_name', width: 120 },
  { title: '订单数', dataIndex: 'order_count', key: 'order_count', width: 90 },
  { title: '采购总额', dataIndex: 'total_amount', key: 'total_amount', width: 130 },
  { title: '已完成数', dataIndex: 'completed_count', key: 'completed_count', width: 100 },
  { title: '已完成金额', dataIndex: 'completed_amount', key: 'completed_amount', width: 130 },
  { title: '待执行数', dataIndex: 'pending_count', key: 'pending_count', width: 100 },
]
const formatAmount = (v: number) => v >= 10000 ? (v / 10000).toFixed(2) + '万' : v.toFixed(2)
</script>

<template>
  <div style="padding: 16px">
    <a-card :bordered="false">
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
        <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">集团采购汇总表</span>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
          <a-range-picker v-model:value="dateRange" :placeholder="['开始日期', '结束日期']" style="width: 260px" />
          <a-button type="primary" @click="fetchData" :loading="loading">查询</a-button>
        </div>
      </div>
      <a-tabs v-model:activeKey="activeTab">
        <a-tab-pane key="chart" tab="图表概览">
          <a-row :gutter="16" style="margin-bottom: 20px">
            <a-col :span="6" v-for="card in kpiCards" :key="card.title">
              <a-card size="small" :bordered="false" :style="{ background: card.bg }">
                <a-statistic :title="card.title" :value="card.value" :suffix="card.suffix || ''" :value-style="{ color: card.color, fontSize: '20px' }">
                  <template #prefix><component :is="card.icon" /></template>
                </a-statistic>
              </a-card>
            </a-col>
          </a-row>
          <a-card title="各工厂采购对比" size="small"><VChart :option="factoryBarOption" style="height: 320px" autoresize /></a-card>
          <a-card title="月度采购趋势" size="small" style="margin-top: 16px"><VChart :option="trendOption" style="height: 300px" autoresize /></a-card>
        </a-tab-pane>
        <a-tab-pane key="detail" tab="明细数据">
          <a-table :dataSource="factories" :columns="tableColumns" rowKey="factory.id" :pagination="false" size="small" bordered>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'total_amount' || column.key === 'completed_amount'">{{ formatAmount(record[column.dataIndex as string]) }}</template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </div>
</template>
