<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { getHQInventorySummary, type InventorySummaryData } from '@/api/system/headquarters'
import { InboxOutlined, ContainerOutlined } from '@ant-design/icons-vue'

use([CanvasRenderer, BarChart, PieChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const loading = ref(false)
const data = ref<InventorySummaryData | null>(null)
const activeTab = ref('chart')

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getHQInventorySummary()
    if (res.success) data.value = res.data
  } finally { loading.value = false }
}
onMounted(fetchData)

const summary = computed(() => data.value?.summary || { total_material_batches: 0, total_material_qty: 0, total_finished_batches: 0, total_finished_qty: 0 })
const factories = computed(() => data.value?.factories || [])

const kpiCards = computed(() => [
  { title: '原材料批次', value: summary.value.total_material_batches, icon: InboxOutlined, color: '#1890ff', bg: '#e6f7ff' },
  { title: '原材料库存量', value: summary.value.total_material_qty, icon: InboxOutlined, color: '#fa8c16', bg: '#fff7e6' },
  { title: '成品批次', value: summary.value.total_finished_batches, icon: ContainerOutlined, color: '#52c41a', bg: '#f6ffed' },
  { title: '成品库存量', value: summary.value.total_finished_qty, icon: ContainerOutlined, color: '#722ed1', bg: '#f9f0ff' },
])

const factoryBarOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['原材料库存', '成品库存'], top: 0 },
  grid: { left: 60, right: 30, bottom: 30, top: 40 },
  xAxis: { type: 'category', data: factories.value.map((f: any) => f.factory.factory_name) },
  yAxis: { type: 'value' },
  series: [
    { name: '原材料库存', type: 'bar', data: factories.value.map((f: any) => f.material.total_qty), itemStyle: { color: '#1890ff' } },
    { name: '成品库存', type: 'bar', data: factories.value.map((f: any) => f.finished.total_qty), itemStyle: { color: '#52c41a' } },
  ]
}))

const typePieOption = computed(() => {
  const typeMap: Record<string, number> = {}
  factories.value.forEach((f: any) => f.by_warehouse_type.forEach((w: any) => { typeMap[w.warehouse_type] = (typeMap[w.warehouse_type] || 0) + w.total_qty }))
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0 },
    series: [{ type: 'pie', radius: ['40%', '70%'], data: Object.entries(typeMap).map(([name, value]) => ({ name, value })) }]
  }
})

const tableColumns = [
  { title: '工厂', dataIndex: ['factory', 'factory_name'], key: 'factory_name', width: 120 },
  { title: '原材料批次', dataIndex: ['material', 'batch_count'], key: 'mat_batch', width: 100 },
  { title: '原材料库存量', dataIndex: ['material', 'total_qty'], key: 'mat_qty', width: 120 },
  { title: '成品批次', dataIndex: ['finished', 'batch_count'], key: 'fin_batch', width: 100 },
  { title: '成品库存量', dataIndex: ['finished', 'total_qty'], key: 'fin_qty', width: 120 },
]
</script>

<template>
  <div style="padding: 16px">
    <a-card :bordered="false">
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between">
        <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">集团库存汇总表</span>
        <div></div>
      </div>
      <a-tabs v-model:activeKey="activeTab">
        <a-tab-pane key="chart" tab="图表概览">
          <a-row :gutter="16" style="margin-bottom: 20px">
            <a-col :span="6" v-for="card in kpiCards" :key="card.title">
              <a-card size="small" :bordered="false" :style="{ background: card.bg }">
                <a-statistic :title="card.title" :value="card.value" :value-style="{ color: card.color, fontSize: '20px' }">
                  <template #prefix><component :is="card.icon" /></template>
                </a-statistic>
              </a-card>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="12"><a-card title="各工厂库存对比" size="small"><VChart :option="factoryBarOption" style="height: 300px" autoresize /></a-card></a-col>
            <a-col :span="12"><a-card title="仓库类型分布" size="small"><VChart :option="typePieOption" style="height: 300px" autoresize /></a-card></a-col>
          </a-row>
        </a-tab-pane>
        <a-tab-pane key="detail" tab="明细数据">
          <a-table :dataSource="factories" :columns="tableColumns" rowKey="factory.id" :pagination="false" size="small" bordered />
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </div>
</template>
