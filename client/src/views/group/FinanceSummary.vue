<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { getHQFinanceSummary, type FinanceSummaryData } from '@/api/system/headquarters'
import { AccountBookOutlined, ShoppingOutlined, DollarOutlined } from '@ant-design/icons-vue'
import dayjs from 'dayjs'

use([CanvasRenderer, BarChart, PieChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const loading = ref(false)
const data = ref<FinanceSummaryData | null>(null)
const dateRange = ref<[dayjs.Dayjs, dayjs.Dayjs]>()
const activeTab = ref('chart')

const fetchData = async () => {
  loading.value = true
  try {
    const params: any = {}
    if (dateRange.value) { params.dateFrom = dateRange.value[0].format('YYYY-MM-DD'); params.dateTo = dateRange.value[1].format('YYYY-MM-DD') }
    const res = await getHQFinanceSummary(params)
    if (res.success) data.value = res.data
  } finally { loading.value = false }
}
onMounted(fetchData)

const summary = computed(() => data.value?.summary || { total_sales_amount: 0, total_purchase_amount: 0, total_piece_rate_wage: 0, total_gross_margin: 0 })
const factories = computed(() => data.value?.factories || [])

const kpiCards = computed(() => [
  { title: '销售总额', value: summary.value.total_sales_amount, suffix: '元', icon: ShoppingOutlined, color: '#1890ff', bg: '#e6f7ff' },
  { title: '采购总额', value: summary.value.total_purchase_amount, suffix: '元', icon: AccountBookOutlined, color: '#fa8c16', bg: '#fff7e6' },
  { title: '计件工资', value: summary.value.total_piece_rate_wage, suffix: '元', icon: DollarOutlined, color: '#722ed1', bg: '#f9f0ff' },
  { title: '毛利', value: summary.value.total_gross_margin, suffix: '元', icon: DollarOutlined, color: '#52c41a', bg: '#f6ffed' },
])

const factoryBarOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['销售额', '采购额', '计件工资', '毛利'], top: 0 },
  grid: { left: 80, right: 30, bottom: 30, top: 40 },
  xAxis: { type: 'category', data: factories.value.map((f: any) => f.factory.factory_name) },
  yAxis: { type: 'value', axisLabel: { formatter: (v: number) => v >= 10000 ? (v / 10000).toFixed(0) + '万' : String(v) } },
  series: [
    { name: '销售额', type: 'bar', data: factories.value.map((f: any) => f.sales_amount), itemStyle: { color: '#1890ff' } },
    { name: '采购额', type: 'bar', data: factories.value.map((f: any) => f.purchase_amount), itemStyle: { color: '#fa8c16' } },
    { name: '计件工资', type: 'bar', data: factories.value.map((f: any) => f.piece_rate_wage), itemStyle: { color: '#722ed1' } },
    { name: '毛利', type: 'bar', data: factories.value.map((f: any) => f.gross_margin), itemStyle: { color: '#52c41a' } },
  ]
}))

const structurePieOption = computed(() => ({
  tooltip: { trigger: 'item' },
  legend: { bottom: 0 },
  series: [{
    type: 'pie', radius: ['40%', '70%'],
    data: [
      { name: '采购成本', value: summary.value.total_purchase_amount, itemStyle: { color: '#fa8c16' } },
      { name: '人工成本', value: summary.value.total_piece_rate_wage, itemStyle: { color: '#722ed1' } },
      { name: '毛利', value: summary.value.total_gross_margin, itemStyle: { color: '#52c41a' } },
    ]
  }]
}))

const tableColumns = [
  { title: '工厂', dataIndex: ['factory', 'factory_name'], key: 'factory_name', width: 120 },
  { title: '销售额', dataIndex: 'sales_amount', key: 'sales_amount', width: 130 },
  { title: '采购额', dataIndex: 'purchase_amount', key: 'purchase_amount', width: 130 },
  { title: '计件工资', dataIndex: 'piece_rate_wage', key: 'piece_rate_wage', width: 130 },
  { title: '毛利', dataIndex: 'gross_margin', key: 'gross_margin', width: 130 },
]
const formatAmount = (v: number) => v >= 10000 ? (v / 10000).toFixed(2) + '万' : v.toFixed(2)
</script>

<template>
  <div style="padding: 16px">
    <a-card :bordered="false">
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
        <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">集团财务汇总表</span>
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
          <a-row :gutter="16">
            <a-col :span="12"><a-card title="各工厂财务对比" size="small"><VChart :option="factoryBarOption" style="height: 300px" autoresize /></a-card></a-col>
            <a-col :span="12"><a-card title="成本结构分布" size="small"><VChart :option="structurePieOption" style="height: 300px" autoresize /></a-card></a-col>
          </a-row>
        </a-tab-pane>
        <a-tab-pane key="detail" tab="明细数据">
          <a-table :dataSource="factories" :columns="tableColumns" rowKey="factory.id" :pagination="false" size="small" bordered>
            <template #bodyCell="{ column, record }">
              <template v-if="['sales_amount','purchase_amount','piece_rate_wage','gross_margin'].includes(column.key as string)">{{ formatAmount(record[column.dataIndex as string]) }}</template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </div>
</template>
