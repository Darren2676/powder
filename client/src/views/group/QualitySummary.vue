<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart, GaugeChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import { getHQQualitySummary, type QualitySummaryData } from '@/api/system/headquarters'
import { SafetyCertificateOutlined, CheckCircleOutlined, WarningOutlined } from '@ant-design/icons-vue'
import dayjs from 'dayjs'

use([CanvasRenderer, BarChart, PieChart, GaugeChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const loading = ref(false)
const data = ref<QualitySummaryData | null>(null)
const dateRange = ref<[dayjs.Dayjs, dayjs.Dayjs]>()
const activeTab = ref('chart')

const fetchData = async () => {
  loading.value = true
  try {
    const params: any = {}
    if (dateRange.value) { params.dateFrom = dateRange.value[0].format('YYYY-MM-DD'); params.dateTo = dateRange.value[1].format('YYYY-MM-DD') }
    const res = await getHQQualitySummary(params)
    if (res.success) data.value = res.data
  } finally { loading.value = false }
}
onMounted(fetchData)

const summary = computed(() => data.value?.summary || { total_inspection_count: 0, total_inspected_qty: 0, total_qualified_qty: 0, total_unqualified_qty: 0, overall_qualified_rate: '0%', total_nc_count: 0 })
const factories = computed(() => data.value?.factories || [])

const kpiCards = computed(() => [
  { title: '检验次数', value: summary.value.total_inspection_count, icon: SafetyCertificateOutlined, color: '#1890ff', bg: '#e6f7ff' },
  { title: '检验总数', value: summary.value.total_inspected_qty, icon: SafetyCertificateOutlined, color: '#fa8c16', bg: '#fff7e6' },
  { title: '合格率', value: summary.value.overall_qualified_rate, icon: CheckCircleOutlined, color: '#52c41a', bg: '#f6ffed' },
  { title: '不良品数', value: summary.value.total_nc_count, icon: WarningOutlined, color: '#ff4d4f', bg: '#fff2f0' },
])

const qualifiedBarOption = computed(() => ({
  tooltip: { trigger: 'axis' },
  legend: { data: ['合格数', '不合格数'], top: 0 },
  grid: { left: 60, right: 30, bottom: 30, top: 40 },
  xAxis: { type: 'category', data: factories.value.map((f: any) => f.factory.factory_name) },
  yAxis: { type: 'value' },
  series: [
    { name: '合格数', type: 'bar', data: factories.value.map((f: any) => f.inspection.total_qualified_qty), itemStyle: { color: '#52c41a' } },
    { name: '不合格数', type: 'bar', data: factories.value.map((f: any) => f.inspection.total_unqualified_qty), itemStyle: { color: '#ff4d4f' } },
  ]
}))

const ncPieOption = computed(() => {
  const methodMap: Record<string, number> = { '返工': 0, '报废': 0, '让步接收': 0, '其他': 0 }
  factories.value.forEach((f: any) => {
    methodMap['返工'] += f.nonconforming.rework_count
    methodMap['报废'] += f.nonconforming.scrap_count
    methodMap['让步接收'] += f.nonconforming.concession_count
  })
  return {
    tooltip: { trigger: 'item' }, legend: { bottom: 0 },
    series: [{ type: 'pie', radius: ['40%', '70%'], data: Object.entries(methodMap).filter(([, v]) => v > 0).map(([name, value]) => ({ name, value })) }]
  }
})

const tableColumns = [
  { title: '工厂', dataIndex: ['factory', 'factory_name'], key: 'factory_name', width: 120 },
  { title: '检验次数', dataIndex: ['inspection', 'inspection_count'], key: 'insp_count', width: 100 },
  { title: '检验总数', dataIndex: ['inspection', 'total_inspected_qty'], key: 'insp_qty', width: 110 },
  { title: '合格数', dataIndex: ['inspection', 'total_qualified_qty'], key: 'qual_qty', width: 100 },
  { title: '不合格数', dataIndex: ['inspection', 'total_unqualified_qty'], key: 'unqual_qty', width: 100 },
  { title: '合格率', dataIndex: 'qualified_rate', key: 'qual_rate', width: 90 },
  { title: '不良品数', dataIndex: ['nonconforming', 'nc_count'], key: 'nc_count', width: 100 },
  { title: '待处理', dataIndex: ['nonconforming', 'pending_handling'], key: 'nc_pending', width: 90 },
  { title: '返工', dataIndex: ['nonconforming', 'rework_count'], key: 'nc_rework', width: 80 },
  { title: '报废', dataIndex: ['nonconforming', 'scrap_count'], key: 'nc_scrap', width: 80 },
]
</script>

<template>
  <div style="padding: 16px">
    <a-card :bordered="false">
      <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
        <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">集团质量汇总表</span>
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
                <a-statistic :title="card.title" :value="card.value" :value-style="{ color: card.color, fontSize: '20px' }">
                  <template #prefix><component :is="card.icon" /></template>
                </a-statistic>
              </a-card>
            </a-col>
          </a-row>
          <a-row :gutter="16">
            <a-col :span="12"><a-card title="各工厂质量对比" size="small"><VChart :option="qualifiedBarOption" style="height: 300px" autoresize /></a-card></a-col>
            <a-col :span="12"><a-card title="不良品处理分布" size="small"><VChart :option="ncPieOption" style="height: 300px" autoresize /></a-card></a-col>
          </a-row>
        </a-tab-pane>
        <a-tab-pane key="detail" tab="明细数据">
          <a-table :dataSource="factories" :columns="tableColumns" rowKey="factory.id" :pagination="false" size="small" bordered />
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </div>
</template>
