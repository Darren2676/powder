<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { ReloadOutlined, FileExcelOutlined, SearchOutlined, BarChartOutlined, TableOutlined } from '@ant-design/icons-vue'
import { getInspectSummary } from '@/api/integration/xinheyunInspect'
import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent, DataZoomComponent, ToolboxComponent, MarkLineComponent
} from 'echarts/components'

use([
  CanvasRenderer, BarChart, LineChart, PieChart,
  TitleComponent, TooltipComponent, LegendComponent,
  GridComponent, DataZoomComponent, ToolboxComponent, MarkLineComponent
])

const loading = ref(false)
const dataSource = ref<any[]>([])
const dateRange = ref<[Dayjs, Dayjs] | null>(null)
const showCharts = ref(false)

const pagination = reactive({
  current: 1, pageSize: 10, total: 0, showSizeChanger: true, showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

// ========== 按产品编号聚合数据 ==========

interface ProductAgg {
  item_code: string
  item_name: string
  vulcanization_qty: number
  packaging_qty: number
  packaging_defect_qty: number
  packaging_pass_rate: number
}

/** 将 dataSource 按产品编号聚合 */
const productAggData = computed<ProductAgg[]>(() => {
  const map = new Map<string, { item_name: string; vul: number; pkg: number; def: number }>()
  for (const d of dataSource.value) {
    const code = d.item_code || '未知'
    if (!map.has(code)) {
      map.set(code, { item_name: d.item_name || '', vul: 0, pkg: 0, def: 0 })
    }
    const agg = map.get(code)!
    agg.vul += (d.vulcanization_qty || 0)
    agg.pkg += (d.packaging_qty || 0)
    agg.def += (d.packaging_defect_qty || 0)
  }
  const result: ProductAgg[] = []
  for (const [code, v] of map) {
    const total = v.pkg + v.def
    result.push({
      item_code: code,
      item_name: v.item_name,
      vulcanization_qty: v.vul,
      packaging_qty: v.pkg,
      packaging_defect_qty: v.def,
      packaging_pass_rate: total > 0 ? Math.round((v.pkg / total) * 10000) / 100 : 0
    })
  }
  // 按包装报工数降序
  result.sort((a, b) => (b.packaging_qty + b.vulcanization_qty) - (a.packaging_qty + a.vulcanization_qty))
  return result
})

// ========== 图表配置 ==========

/** 柱状图 - 按产品编号的产量对比（硫化报工数 vs 包装报工数） */
const barChartOption = computed(() => {
  const data = productAggData.value.slice(0, 20)
  const categories = data.map(d => d.item_code)
  const vulcanizationData = data.map(d => d.vulcanization_qty)
  const packagingData = data.map(d => d.packaging_qty)
  return {
    title: { text: '产品产量对比', left: 'center', textStyle: { fontSize: 12, color: '#333' } },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const code = params[0]?.axisValue || ''
        const item = data.find(d => d.item_code === code)
        let html = `<b>${code}</b>`
        if (item?.item_name) html += `<br/>${item.item_name}`
        for (const p of params) {
          html += `<br/>${p.marker} ${p.seriesName}: <b>${p.value.toLocaleString()}</b>`
        }
        return html
      }
    },
    legend: { data: ['硫化报工数', '包装报工数'], bottom: 0, textStyle: { fontSize: 10 } },
    grid: { left: 50, right: 10, top: 30, bottom: 30 },
    dataZoom: categories.length > 8 ? [{ type: 'slider', height: 14, start: 0, end: Math.min(100, (8 / categories.length) * 100) }] : [],
    xAxis: {
      type: 'category', data: categories,
      axisLabel: { rotate: 35, fontSize: 9, interval: 0 }
    },
    yAxis: { type: 'value', name: '数量', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 9 } },
    series: [
      { name: '硫化报工数', type: 'bar', data: vulcanizationData, itemStyle: { color: '#1890ff' }, barMaxWidth: 20 },
      { name: '包装报工数', type: 'bar', data: packagingData, itemStyle: { color: '#52c41a' }, barMaxWidth: 20 }
    ]
  }
})

/** 折线图 - 按产品编号的包装合格率 */
const lineChartOption = computed(() => {
  const data = productAggData.value.filter(d => d.packaging_pass_rate > 0)
  const categories = data.map(d => d.item_code)
  const rates = data.map(d => d.packaging_pass_rate)
  return {
    title: { text: '产品包装合格率', left: 'center', textStyle: { fontSize: 12, color: '#333' } },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0]
        const code = p?.axisValue || ''
        const item = data.find(d => d.item_code === code)
        let html = `<b>${code}</b>`
        if (item?.item_name) html += `<br/>${item.item_name}`
        html += `<br/>${p.marker} 合格率: <b>${p.value}%</b>`
        return html
      }
    },
    grid: { left: 50, right: 10, top: 30, bottom: 30 },
    dataZoom: categories.length > 10 ? [{ type: 'slider', height: 14, start: 0, end: Math.min(100, (10 / categories.length) * 100) }] : [],
    xAxis: {
      type: 'category', data: categories,
      axisLabel: { rotate: 35, fontSize: 9 }
    },
    yAxis: { type: 'value', name: '合格率(%)', min: 0, max: 100, nameTextStyle: { fontSize: 10 }, axisLabel: { formatter: '{value}%', fontSize: 9 } },
    series: [{
      name: '包装合格率', type: 'line', data: rates, smooth: true,
      lineStyle: { color: '#faad14', width: 2 },
      itemStyle: { color: '#faad14' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(250,173,20,0.25)' }, { offset: 1, color: 'rgba(250,173,20,0.02)' }] } },
      markLine: { silent: true, data: [{ yAxis: 95, name: '目标线', lineStyle: { color: '#52c41a', type: 'dashed' }, label: { formatter: '95%', position: 'end' } }] }
    }]
  }
})

/** 饼图 - 按产品编号的包装合格/不合格分布 */
const pieChartOption = computed(() => {
  // 每个产品一个扇区，显示包装报工总量占比
  const data = productAggData.value.filter(d => d.packaging_qty > 0 || d.packaging_defect_qty > 0)
  const colors = ['#52c41a', '#1890ff', '#faad14', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911', '#f5222d']
  return {
    title: { text: '产品包装产量分布', left: 'center', textStyle: { fontSize: 12, color: '#333' } },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const item = data.find(d => d.item_code === params.name)
        let html = `<b>${params.name}</b>`
        if (item?.item_name) html += `<br/>${item.item_name}`
        html += `<br/>包装报工数: <b>${(item?.packaging_qty || 0).toLocaleString()}</b>`
        html += `<br/>合格率: <b>${item?.packaging_pass_rate || 0}%</b>`
        html += `<br/>占比: <b>${params.percent}%</b>`
        return html
      }
    },
    legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 10 } },
    series: [{
      type: 'pie', radius: ['30%', '58%'], center: ['50%', '46%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 1 },
      label: { show: true, formatter: '{b}\n{d}%', fontSize: 9 },
      emphasis: { label: { fontSize: 12, fontWeight: 'bold' } },
      data: data.map((d, i) => ({
        value: d.packaging_qty + d.packaging_defect_qty,
        name: d.item_code,
        itemStyle: { color: colors[i % colors.length] }
      }))
    }]
  }
})

const columns = [
  { title: '行号', key: 'rowIndex', width: 45, fixed: 'left' as const, align: 'center' as const },
  { title: '生产单号', dataIndex: 'work_order_number', key: 'work_order_number', width: 140, fixed: 'left' as const },
  { title: '产品编号', dataIndex: 'item_code', key: 'item_code', width: 110 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 150, ellipsis: true },
  { title: '报工时间', dataIndex: 'last_job_booking_time', key: 'last_job_booking_time', width: 130 },
  { title: '硫化报工数', dataIndex: 'vulcanization_qty', key: 'vulcanization_qty', width: 90, align: 'right' as const },
  { title: '包装报工数', dataIndex: 'packaging_qty', key: 'packaging_qty', width: 90, align: 'right' as const },
  { title: '包装不合格数', dataIndex: 'packaging_defect_qty', key: 'packaging_defect_qty', width: 100, align: 'right' as const },
  { title: '包装合格率', dataIndex: 'packaging_pass_rate', key: 'packaging_pass_rate', width: 90, align: 'right' as const }
]

const fetchData = async () => {
  loading.value = true
  try {
    const params: any = {
      page: pagination.current,
      limit: pagination.pageSize,
    }
    if (dateRange.value && dateRange.value[0] && dateRange.value[1]) {
      params.startDate = dateRange.value[0].format('YYYY-MM-DD')
      params.endDate = dateRange.value[1].format('YYYY-MM-DD')
    }
    const res: any = await getInspectSummary(params)
    if (res.success) {
      dataSource.value = res.data.items
      pagination.total = res.data.pagination.total
    }
  } catch {
    message.error('获取检验报工汇总失败')
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleExecute = () => { pagination.current = 1; fetchData() }
const handleReset = () => { dateRange.value = null; pagination.current = 1; fetchData() }

/** 导出 Excel */
const handleExport = () => {
  if (dataSource.value.length === 0) {
    message.warning('暂无数据可导出')
    return
  }
  const headers = ['生产单号', '产品编号', '产品名称', '报工时间', '硫化报工数', '包装报工数', '包装不合格数', '包装合格率(%)']
  const rows = dataSource.value.map(row => [
    row.work_order_number || '',
    row.item_code || '',
    row.item_name || '',
    row.last_job_booking_time ? dayjs(row.last_job_booking_time).format('YYYY-MM-DD HH:mm') : '',
    row.vulcanization_qty || 0,
    row.packaging_qty || 0,
    row.packaging_defect_qty || 0,
    row.packaging_pass_rate !== null ? row.packaging_pass_rate + '%' : ''
  ])
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  // 设置列宽
  ws['!cols'] = [
    { wch: 18 }, { wch: 14 }, { wch: 20 }, { wch: 16 },
    { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }
  ]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '检验报工汇总')
  XLSX.writeFile(wb, `检验报工汇总_${new Date().toISOString().slice(0, 10)}.xlsx`)
  message.success('导出成功')
}

const formatNumber = (val: number | null | undefined) => {
  if (val === null || val === undefined) return '0'
  return Number(val).toLocaleString()
}

onMounted(() => { fetchData() })
</script>

<template>
  <div style="padding: 16px">
    <a-card title="检验报工汇总" :bordered="false">
      <template #extra>
        <a-space>
          <a-button @click="handleExport">
            <template #icon><FileExcelOutlined /></template>
            导出Excel
          </a-button>
        </a-space>
      </template>

      <!-- 说明 -->
      <a-alert
        style="margin-bottom: 8px; padding: 4px 12px; font-size: 12px; line-height: 1.4"
        type="info"
        show-icon
        message="汇总规则：硫化报工数=硫化+自检+合格；包装报工数=包装+自检+合格；包装不合格数=包装+自检+不合格。仅显示有包装合格报工的生产单。"
      />

      <!-- 筛选栏 -->
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap;">
        <span style="color: #666;">报工时间：</span>
        <a-range-picker
          v-model:value="dateRange"
          :placeholder="['开始日期', '结束日期']"
          style="width: 280px"
          format="YYYY-MM-DD"
          :allow-clear="true"
        />
        <a-button type="primary" @click="handleExecute" :loading="loading">
          <template #icon><SearchOutlined /></template>
          执行
        </a-button>
        <a-button @click="handleReset">
          <template #icon><ReloadOutlined /></template>
          重置
        </a-button>
        <div style="flex: 1;" />
        <a-button :type="showCharts ? 'primary' : 'default'" :ghost="showCharts" @click="showCharts = !showCharts">
          <template #icon><BarChartOutlined v-if="!showCharts" /><TableOutlined v-else /></template>
          {{ showCharts ? '收起图表' : '图表分析' }}
        </a-button>
      </div>

      <!-- 图表区域 -->
      <div v-if="showCharts && dataSource.length > 0" class="charts-container">
        <div class="charts-row">
          <div class="chart-card">
            <v-chart :option="barChartOption" autoresize style="height: 220px;" />
          </div>
          <div class="chart-card">
            <v-chart :option="lineChartOption" autoresize style="height: 220px;" />
          </div>
          <div class="chart-card" style="max-width: 320px;">
            <v-chart :option="pieChartOption" autoresize style="height: 220px;" />
          </div>
        </div>
      </div>
      <a-empty v-else-if="showCharts && dataSource.length === 0" description="暂无数据，请执行查询后查看图表" style="margin: 24px 0;" />

      <!-- 表格 -->
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 960 }"
        row-key="work_order_number"
        size="small"
        :bordered="true"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>

          <template v-else-if="column.key === 'vulcanization_qty'">
            <span style="font-weight: 600; color: #1890ff;">
              {{ formatNumber(record.vulcanization_qty) }}
            </span>
          </template>

          <template v-else-if="column.key === 'packaging_qty'">
            <span style="font-weight: 600; color: #52c41a;">
              {{ formatNumber(record.packaging_qty) }}
            </span>
          </template>

          <template v-else-if="column.key === 'packaging_defect_qty'">
            <span :style="{ fontWeight: '600', color: record.packaging_defect_qty > 0 ? '#ff4d4f' : '#999' }">
              {{ formatNumber(record.packaging_defect_qty) }}
            </span>
          </template>

          <template v-else-if="column.key === 'packaging_pass_rate'">
            <template v-if="record.packaging_pass_rate !== null">
              <a-tag :color="record.packaging_pass_rate >= 95 ? 'green' : record.packaging_pass_rate >= 80 ? 'orange' : 'red'">
                {{ record.packaging_pass_rate }}%
              </a-tag>
            </template>
            <span v-else style="color: #999;">-</span>
          </template>

          <template v-else-if="column.key === 'last_job_booking_time'">
            {{ record.last_job_booking_time ? dayjs(record.last_job_booking_time).format('YYYY-MM-DD HH:mm') : '-' }}
          </template>
        </template>
      </a-table>
    </a-card>
  </div>
</template>

<style scoped>
.charts-container {
  margin-bottom: 10px;
}
.charts-row {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
}
.charts-row:last-child {
  margin-bottom: 0;
}
.chart-card {
  flex: 1;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
  padding: 6px;
  min-width: 0;
}
</style>
