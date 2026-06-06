<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { getHQInventoryFlow, type InventoryFlowData } from '@/api/system/headquarters'
import { ImportOutlined, ExportOutlined, SwapOutlined } from '@ant-design/icons-vue'
import dayjs from 'dayjs'

use([CanvasRenderer, BarChart, PieChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const loading = ref(false)
const data = ref<InventoryFlowData | null>(null)
const dateRange = ref<[dayjs.Dayjs, dayjs.Dayjs]>()
const activeTab = ref('chart')

const fetchData = async () => {
  loading.value = true
  try {
    const params: any = {}
    if (dateRange.value) { params.dateFrom = dateRange.value[0].format('YYYY-MM-DD'); params.dateTo = dateRange.value[1].format('YYYY-MM-DD') }
    const res = await getHQInventoryFlow(params)
    if (res.success) data.value = res.data
  } finally { loading.value = false }
}
onMounted(fetchData)

const summary = computed(() => data.value?.summary || { total_inbound: 0, total_outbound: 0, total_transactions: 0 })
const factories = computed(() => data.value?.factories || [])

const kpiCards = computed(() => [
  { title: '入库总量', value: summary.value.total_inbound, icon: ImportOutlined, color: '#52c41a', bg: '#f6ffed' },
  { title: '出库总量', value: summary.value.total_outbound, icon: ExportOutlined, color: '#fa8c16', bg: '#fff7e6' },
  { title: '流水笔数', value: summary.value.total_transactions, icon: SwapOutlined, color: '#1890ff', bg: '#e6f7ff' },
])

const factoryBarOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['入库', '出库'], top: 0 },
  grid: { left: 60, right: 30, bottom: 30, top: 40 },
  xAxis: { type: 'category', data: factories.value.map((f: any) => f.factory.factory_name) },
  yAxis: { type: 'value' },
  series: [
    { name: '入库', type: 'bar', data: factories.value.map((f: any) => f.inbound_total), itemStyle: { color: '#52c41a' } },
    { name: '出库', type: 'bar', data: factories.value.map((f: any) => f.outbound_total), itemStyle: { color: '#fa8c16' } },
  ]
}))

const categoryPieOption = computed(() => {
  const catMap: Record<string, number> = {}
  factories.value.forEach((f: any) => f.flows.forEach((fl: any) => { catMap[fl.category] = (catMap[fl.category] || 0) + fl.total_qty }))
  return {
    tooltip: { trigger: 'item' }, legend: { bottom: 0 },
    series: [{ type: 'pie', radius: ['40%', '70%'], data: Object.entries(catMap).map(([name, value]) => ({ name, value })) }]
  }
})

// 展平flows到表格行
const flatRows = computed(() => {
  const rows: any[] = []
  factories.value.forEach((f: any) => {
    if (f.flows.length === 0) {
      rows.push({ factory_name: f.factory.factory_name, category: '-', transaction_type: '-', transaction_count: 0, total_qty: 0 })
    } else {
      f.flows.forEach((fl: any) => {
        rows.push({ factory_name: f.factory.factory_name, category: fl.category, transaction_type: fl.transaction_type, transaction_count: fl.transaction_count, total_qty: fl.total_qty })
      })
    }
  })
  return rows
})

const tableColumns = [
  { title: '工厂', dataIndex: 'factory_name', key: 'factory_name', width: 120 },
  { title: '类别', dataIndex: 'category', key: 'category', width: 80 },
  { title: '交易类型', dataIndex: 'transaction_type', key: 'transaction_type', width: 100 },
  { title: '笔数', dataIndex: 'transaction_count', key: 'transaction_count', width: 80 },
  { title: '数量', dataIndex: 'total_qty', key: 'total_qty', width: 120 },
]
</script>

<template>
  <div style="padding: 16px">
    <a-card :bordered="false">
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
        <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">集团出入库流水总表</span>
        <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
          <a-range-picker v-model:value="dateRange" :placeholder="['开始日期', '结束日期']" style="width: 260px" />
          <a-button type="primary" @click="fetchData" :loading="loading">查询</a-button>
        </div>
      </div>
      <a-tabs v-model:activeKey="activeTab">
        <a-tab-pane key="chart" tab="图表概览">
          <a-row :gutter="16" style="margin-bottom: 20px">
            <a-col :span="8" v-for="card in kpiCards" :key="card.title">
              <a-card size="small" :bordered="false" :style="{ background: card.bg }">
                <a-statistic :title="card.title" :value="card.value" :value-style="{ color: card.color, fontSize: '20px' }">
                  <template #prefix><component :is="card.icon" /></template>
                </a-statistic>
              </a-card>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="12"><a-card title="各工厂出入库对比" size="small"><VChart :option="factoryBarOption" style="height: 300px" autoresize /></a-card></a-col>
            <a-col :span="12"><a-card title="物料类别分布" size="small"><VChart :option="categoryPieOption" style="height: 300px" autoresize /></a-card></a-col>
          </a-row>
        </a-tab-pane>
        <a-tab-pane key="detail" tab="明细数据">
          <a-table :dataSource="flatRows" :columns="tableColumns" rowKey="transaction_type" :pagination="false" size="small" bordered />
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </div>
</template>
