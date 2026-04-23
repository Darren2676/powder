<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import { ReloadOutlined, SearchOutlined, FileExcelOutlined } from '@ant-design/icons-vue'
import { getInspectSummary } from '@/api/integration/xinheyunInspect'
import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'
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
const exporting = ref(false)
const dataSource = ref<any[]>([])
const dateRange = ref<[Dayjs, Dayjs] | null>(null)
const activeTab = ref('report')

// 图表组件引用
const barChartRef = ref<InstanceType<typeof VChart> | null>(null)
const lineChartRef = ref<InstanceType<typeof VChart> | null>(null)
const pieChartRef = ref<InstanceType<typeof VChart> | null>(null)

const pagination = reactive({
  current: 1, pageSize: 200, total: 0,
  showSizeChanger: false, showQuickJumper: false
})

// ========== 数据获取 ==========

const fetchData = async () => {
  loading.value = true
  try {
    const params: any = { page: 1, limit: 200 }
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
    message.error('获取包装质量数据失败')
  } finally {
    loading.value = false
  }
}

const handleExecute = () => { fetchData() }
const handleReset = () => { dateRange.value = null; fetchData() }

// ========== 按产品编号聚合数据 ==========

interface ProductAgg {
  item_code: string
  item_name: string
  vulcanization_qty: number
  packaging_qty: number
  packaging_defect_qty: number
  packaging_pass_rate: number
  order_count: number
}

const productAggData = computed<ProductAgg[]>(() => {
  const map = new Map<string, { item_name: string; vul: number; pkg: number; def: number; cnt: number }>()
  for (const d of dataSource.value) {
    const code = d.item_code || '未知'
    if (!map.has(code)) {
      map.set(code, { item_name: d.item_name || '', vul: 0, pkg: 0, def: 0, cnt: 0 })
    }
    const agg = map.get(code)!
    agg.vul += (d.vulcanization_qty || 0)
    agg.pkg += (d.packaging_qty || 0)
    agg.def += (d.packaging_defect_qty || 0)
    agg.cnt += 1
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
      packaging_pass_rate: total > 0 ? Math.round((v.pkg / total) * 10000) / 100 : 0,
      order_count: v.cnt
    })
  }
  result.sort((a, b) => (b.packaging_qty + b.vulcanization_qty) - (a.packaging_qty + a.vulcanization_qty))
  return result
})

// ========== 汇总统计 ==========

const summaryStats = computed(() => {
  const agg = productAggData.value
  const totalVul = agg.reduce((s, d) => s + d.vulcanization_qty, 0)
  const totalPkg = agg.reduce((s, d) => s + d.packaging_qty, 0)
  const totalDef = agg.reduce((s, d) => s + d.packaging_defect_qty, 0)
  const totalAll = totalPkg + totalDef
  const passRate = totalAll > 0 ? Math.round((totalPkg / totalAll) * 10000) / 100 : 0
  return {
    productCount: agg.length,
    orderCount: dataSource.value.length,
    totalVul, totalPkg, totalDef, passRate
  }
})

// ========== 图表配置 ==========

/** 柱状图 - 产品产量对比 */
const barChartOption = computed(() => {
  const data = productAggData.value.slice(0, 30)
  const categories = data.map(d => d.item_code)
  const vulData = data.map(d => d.vulcanization_qty)
  const pkgData = data.map(d => d.packaging_qty)
  const defData = data.map(d => d.packaging_defect_qty)
  return {
    title: { text: '产品产量对比（硫化 / 包装合格 / 包装不合格）', left: 'center', textStyle: { fontSize: 13, color: '#333' } },
    tooltip: {
      trigger: 'axis', axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const code = params[0]?.axisValue || ''
        const item = data.find(d => d.item_code === code)
        let html = `<b>${code}</b>`
        if (item?.item_name) html += `<br/><span style="color:#888">${item.item_name}</span>`
        for (const p of params) {
          html += `<br/>${p.marker} ${p.seriesName}: <b>${p.value.toLocaleString()}</b>`
        }
        if (item) html += `<br/>合格率: <b>${item.packaging_pass_rate}%</b>`
        return html
      }
    },
    legend: { data: ['硫化报工数', '包装合格数', '包装不合格数'], bottom: 0, textStyle: { fontSize: 11 } },
    grid: { left: 55, right: 15, top: 40, bottom: 36 },
    dataZoom: categories.length > 12 ? [{ type: 'slider', height: 18, start: 0, end: Math.min(100, (12 / categories.length) * 100) }] : [],
    xAxis: { type: 'category', data: categories, axisLabel: { rotate: 35, fontSize: 10, interval: 0 } },
    yAxis: { type: 'value', name: '数量', nameTextStyle: { fontSize: 11 }, axisLabel: { fontSize: 10 } },
    series: [
      { name: '硫化报工数', type: 'bar', data: vulData, itemStyle: { color: '#1890ff' }, barMaxWidth: 24, stack: undefined },
      { name: '包装合格数', type: 'bar', data: pkgData, itemStyle: { color: '#52c41a' }, barMaxWidth: 24, stack: 'packaging' },
      { name: '包装不合格数', type: 'bar', data: defData, itemStyle: { color: '#ff4d4f' }, barMaxWidth: 24, stack: 'packaging' }
    ]
  }
})

/** 折线图 - 各产品包装合格率 */
const lineChartOption = computed(() => {
  const data = productAggData.value.filter(d => d.packaging_pass_rate > 0)
  const categories = data.map(d => d.item_code)
  const rates = data.map(d => d.packaging_pass_rate)
  return {
    title: { text: '各产品包装合格率', left: 'center', textStyle: { fontSize: 13, color: '#333' } },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const p = params[0]
        const code = p?.axisValue || ''
        const item = data.find(d => d.item_code === code)
        let html = `<b>${code}</b>`
        if (item?.item_name) html += `<br/><span style="color:#888">${item.item_name}</span>`
        html += `<br/>${p.marker} 合格率: <b>${p.value}%</b>`
        if (item) {
          html += `<br/>合格数: ${item.packaging_qty.toLocaleString()} / 不合格数: ${item.packaging_defect_qty.toLocaleString()}`
        }
        return html
      }
    },
    grid: { left: 55, right: 15, top: 40, bottom: 36 },
    dataZoom: categories.length > 15 ? [{ type: 'slider', height: 18, start: 0, end: Math.min(100, (15 / categories.length) * 100) }] : [],
    xAxis: { type: 'category', data: categories, axisLabel: { rotate: 35, fontSize: 10 } },
    yAxis: { type: 'value', name: '合格率(%)', min: 0, max: 100, nameTextStyle: { fontSize: 11 }, axisLabel: { formatter: '{value}%', fontSize: 10 } },
    series: [{
      name: '包装合格率', type: 'line', data: rates, smooth: true,
      lineStyle: { color: '#faad14', width: 2 },
      itemStyle: { color: '#faad14' },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(250,173,20,0.25)' }, { offset: 1, color: 'rgba(250,173,20,0.02)' }] } },
      markLine: { silent: true, data: [{ yAxis: 95, name: '目标线', lineStyle: { color: '#52c41a', type: 'dashed', width: 1.5 }, label: { formatter: '95%', position: 'end', fontSize: 11 } }] }
    }]
  }
})

/** 饼图 - 产品包装产量分布 */
const pieChartOption = computed(() => {
  const data = productAggData.value.filter(d => d.packaging_qty > 0 || d.packaging_defect_qty > 0)
  const colors = ['#52c41a', '#1890ff', '#faad14', '#722ed1', '#13c2c2', '#eb2f96', '#fa8c16', '#2f54eb', '#a0d911', '#f5222d', '#597ef7', '#36cfc9', '#ff85c0', '#ffc53d']
  return {
    title: { text: '产品包装产量占比', left: 'center', textStyle: { fontSize: 13, color: '#333' } },
    tooltip: {
      trigger: 'item',
      formatter: (params: any) => {
        const item = data.find(d => d.item_code === params.name)
        let html = `<b>${params.name}</b>`
        if (item?.item_name) html += `<br/><span style="color:#888">${item.item_name}</span>`
        html += `<br/>包装总量: <b>${((item?.packaging_qty || 0) + (item?.packaging_defect_qty || 0)).toLocaleString()}</b>`
        html += `<br/>合格率: <b>${item?.packaging_pass_rate || 0}%</b>`
        html += `<br/>占比: <b>${params.percent}%</b>`
        return html
      }
    },
    legend: { bottom: 0, type: 'scroll', textStyle: { fontSize: 10 } },
    series: [{
      type: 'pie', radius: ['32%', '60%'], center: ['50%', '48%'],
      avoidLabelOverlap: true,
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{d}%', fontSize: 10 },
      emphasis: { label: { fontSize: 13, fontWeight: 'bold' } },
      data: data.map((d, i) => ({
        value: d.packaging_qty + d.packaging_defect_qty,
        name: d.item_code,
        itemStyle: { color: colors[i % colors.length] }
      }))
    }]
  }
})

// ========== 明细表格 ==========

const detailColumns = [
  { title: '序号', key: 'rowIndex', width: 50, align: 'center' as const },
  { title: '产品编号', dataIndex: 'item_code', key: 'item_code', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 160, ellipsis: true },
  { title: '生产单数', dataIndex: 'order_count', key: 'order_count', width: 80, align: 'center' as const },
  { title: '硫化报工数', dataIndex: 'vulcanization_qty', key: 'vulcanization_qty', width: 100, align: 'right' as const },
  { title: '包装合格数', dataIndex: 'packaging_qty', key: 'packaging_qty', width: 100, align: 'right' as const },
  { title: '包装不合格数', dataIndex: 'packaging_defect_qty', key: 'packaging_defect_qty', width: 110, align: 'right' as const },
  { title: '包装合格率', dataIndex: 'packaging_pass_rate', key: 'packaging_pass_rate', width: 100, align: 'right' as const }
]

const formatNumber = (val: number | null | undefined) => {
  if (val === null || val === undefined) return '0'
  return Number(val).toLocaleString()
}

/** 从 ECharts 实例获取 base64 图片数据 */
const getChartImage = (chartRef: InstanceType<typeof VChart> | null): string | null => {
  if (!chartRef) return null
  const chart = (chartRef as any).chart
  if (!chart) return null
  const dataURL = chart.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#fff' })
  return dataURL ? dataURL.split(',')[1] : null
}

/** 导出 Excel（图表截图 + 数据明细） */
const handleExport = async () => {
  if (productAggData.value.length === 0) {
    message.warning('暂无数据可导出')
    return
  }
  exporting.value = true
  try {
    await nextTick()

    const wb = new ExcelJS.Workbook()
    wb.creator = '新核云包装质量报表'
    wb.created = new Date()

    // ====== Sheet 1: 图表分析 ======
    const chartSheet = wb.addWorksheet('图表分析')

    // 标题行
    chartSheet.mergeCells('A1:J1')
    const titleCell = chartSheet.getCell('A1')
    const dateRangeStr = dateRange.value
      ? `（${dateRange.value[0].format('YYYY-MM-DD')} ~ ${dateRange.value[1].format('YYYY-MM-DD')}）`
      : '（全部）'
    titleCell.value = `新核云包装质量报表${dateRangeStr}`
    titleCell.font = { size: 16, bold: true, color: { argb: 'FF333333' } }
    titleCell.alignment = { horizontal: 'center', vertical: 'middle' }
    chartSheet.getRow(1).height = 30

    // 汇总统计行
    const stats = summaryStats.value
    chartSheet.mergeCells('A2:J2')
    const statsCell = chartSheet.getCell('A2')
    statsCell.value = `产品种类: ${stats.productCount}    生产单数: ${stats.orderCount}    硫化总量: ${stats.totalVul.toLocaleString()}    包装合格总量: ${stats.totalPkg.toLocaleString()}    包装不合格总量: ${stats.totalDef.toLocaleString()}    整体合格率: ${stats.passRate}%`
    statsCell.font = { size: 11, color: { argb: 'FF666666' } }
    statsCell.alignment = { horizontal: 'center', vertical: 'middle' }
    chartSheet.getRow(2).height = 22

    // 插入图表图片
    let currentRow = 4
    const chartConfigs = [
      { ref: barChartRef.value, label: '产品产量对比' },
      { ref: lineChartRef.value, label: '各产品包装合格率' },
      { ref: pieChartRef.value, label: '产品包装产量占比' }
    ]

    for (const cfg of chartConfigs) {
      const imgBase64 = getChartImage(cfg.ref)
      if (imgBase64) {
        chartSheet.mergeCells(`A${currentRow}:J${currentRow}`)
        const labelCell = chartSheet.getCell(`A${currentRow}`)
        labelCell.value = cfg.label
        labelCell.font = { size: 12, bold: true, color: { argb: 'FF333333' } }
        currentRow++

        const imageId = wb.addImage({ base64: imgBase64, extension: 'png' })
        chartSheet.addImage(imageId, {
          tl: { col: 0, row: currentRow - 1 },
          ext: { width: 720, height: 340 }
        })
        currentRow += 18
      }
    }

    chartSheet.columns = Array(10).fill(null).map(() => ({ width: 12 }))

    // ====== Sheet 2: 数据明细 ======
    const dataSheet = wb.addWorksheet('数据明细')

    const headers = ['序号', '产品编号', '产品名称', '生产单数', '硫化报工数', '包装合格数', '包装不合格数', '包装合格率(%)']
    const headerRow = dataSheet.addRow(headers)
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1890FF' } }
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' }
    headerRow.height = 22

    productAggData.value.forEach((row, idx) => {
      const r = dataSheet.addRow([
        idx + 1, row.item_code, row.item_name, row.order_count,
        row.vulcanization_qty, row.packaging_qty, row.packaging_defect_qty,
        row.packaging_pass_rate
      ])
      const rateCell = r.getCell(8)
      rateCell.numFmt = '0.00"%"'
      if (row.packaging_pass_rate >= 95) {
        rateCell.font = { color: { argb: 'FF52C41A' }, bold: true }
      } else if (row.packaging_pass_rate >= 80) {
        rateCell.font = { color: { argb: 'FFFAAD14' }, bold: true }
      } else {
        rateCell.font = { color: { argb: 'FFFF4D4F' }, bold: true }
      }
      if (row.packaging_defect_qty > 0) {
        r.getCell(7).font = { color: { argb: 'FFFF4D4F' }, bold: true }
      }
      if (idx % 2 === 1) {
        r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } }
      }
    })

    const totalRow = dataSheet.addRow([
      '', '合计', '',
      productAggData.value.reduce((s, d) => s + d.order_count, 0),
      stats.totalVul, stats.totalPkg, stats.totalDef, stats.passRate
    ])
    totalRow.font = { bold: true }
    totalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F7FF' } }
    totalRow.getCell(8).numFmt = '0.00"%"'

    dataSheet.columns = [
      { width: 6 }, { width: 16 }, { width: 24 }, { width: 10 },
      { width: 13 }, { width: 13 }, { width: 14 }, { width: 14 }
    ]

    dataSheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          left: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          bottom: { style: 'thin', color: { argb: 'FFD9D9D9' } },
          right: { style: 'thin', color: { argb: 'FFD9D9D9' } }
        }
      })
    })

    const buffer = await wb.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    saveAs(blob, `新核云包装质量报表_${new Date().toISOString().slice(0, 10)}.xlsx`)
    message.success('导出成功（含图表截图和数据明细）')
  } catch (err) {
    console.error('导出失败:', err)
    message.error('导出失败，请重试')
  } finally {
    exporting.value = false
  }
}

onMounted(() => { fetchData() })
</script>

<template>
  <div style="padding: 16px">
    <a-card :bordered="false" :body-style="{ padding: '12px 24px 24px' }">
      <!-- 筛选栏 -->
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px; flex-wrap: wrap;">
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
        <a-button @click="handleExport" :loading="exporting">
          <template #icon><FileExcelOutlined /></template>
          导出Excel
        </a-button>
      </div>

      <!-- 统计卡片 -->
      <div v-if="dataSource.length > 0" class="stats-row">
        <div class="stat-card">
          <div class="stat-value" style="color: #1890ff;">{{ summaryStats.productCount }}</div>
          <div class="stat-label">产品种类</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #722ed1;">{{ summaryStats.orderCount }}</div>
          <div class="stat-label">生产单数</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #1890ff;">{{ summaryStats.totalVul.toLocaleString() }}</div>
          <div class="stat-label">硫化总量</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #52c41a;">{{ summaryStats.totalPkg.toLocaleString() }}</div>
          <div class="stat-label">包装合格总量</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" style="color: #ff4d4f;">{{ summaryStats.totalDef.toLocaleString() }}</div>
          <div class="stat-label">包装不合格总量</div>
        </div>
        <div class="stat-card">
          <div class="stat-value" :style="{ color: summaryStats.passRate >= 95 ? '#52c41a' : summaryStats.passRate >= 80 ? '#faad14' : '#ff4d4f' }">
            {{ summaryStats.passRate }}%
          </div>
          <div class="stat-label">整体合格率</div>
        </div>
      </div>

      <!-- 页签区域 -->
      <a-tabs v-model:activeKey="activeTab">
        <a-tab-pane key="report" tab="质量报表">
          <!-- 图表区域 -->
          <div v-if="dataSource.length > 0" class="charts-section">
            <div class="charts-row">
              <div class="chart-card chart-wide">
                <v-chart ref="barChartRef" :option="barChartOption" autoresize style="height: 300px;" />
              </div>
            </div>
            <div class="charts-row">
              <div class="chart-card chart-wide">
                <v-chart ref="lineChartRef" :option="lineChartOption" autoresize style="height: 280px;" />
              </div>
              <div class="chart-card chart-narrow">
                <v-chart ref="pieChartRef" :option="pieChartOption" autoresize style="height: 280px;" />
              </div>
            </div>
          </div>
          <a-empty v-else-if="!loading" description="暂无数据，请选择时间范围后点击执行" style="margin: 40px 0;" />
        </a-tab-pane>

        <a-tab-pane key="summary" tab="按产品编号汇总明细">
          <a-table
            v-if="productAggData.length > 0"
            :columns="detailColumns"
            :data-source="productAggData"
            :pagination="false"
            :scroll="{ x: 820, y: 500 }"
            row-key="item_code"
            size="small"
            :bordered="true"
            :loading="loading"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'rowIndex'">
                {{ index + 1 }}
              </template>
              <template v-else-if="column.key === 'vulcanization_qty'">
                <span style="font-weight: 600; color: #1890ff;">{{ formatNumber(record.vulcanization_qty) }}</span>
              </template>
              <template v-else-if="column.key === 'packaging_qty'">
                <span style="font-weight: 600; color: #52c41a;">{{ formatNumber(record.packaging_qty) }}</span>
              </template>
              <template v-else-if="column.key === 'packaging_defect_qty'">
                <span :style="{ fontWeight: '600', color: record.packaging_defect_qty > 0 ? '#ff4d4f' : '#999' }">
                  {{ formatNumber(record.packaging_defect_qty) }}
                </span>
              </template>
              <template v-else-if="column.key === 'packaging_pass_rate'">
                <a-tag :color="record.packaging_pass_rate >= 95 ? 'green' : record.packaging_pass_rate >= 80 ? 'orange' : 'red'">
                  {{ record.packaging_pass_rate }}%
                </a-tag>
              </template>
            </template>
          </a-table>
          <a-empty v-else-if="!loading" description="暂无数据，请选择时间范围后点击执行" style="margin: 40px 0;" />
        </a-tab-pane>
      </a-tabs>
    </a-card>
  </div>
</template>

<style scoped>
.stats-row {
  display: flex;
  gap: 12px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.stat-card {
  flex: 1;
  min-width: 100px;
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 10px 12px;
  text-align: center;
}
.stat-value {
  font-size: 20px;
  font-weight: 700;
  line-height: 1.3;
}
.stat-label {
  font-size: 12px;
  color: #888;
  margin-top: 2px;
}
.charts-section {
  margin-bottom: 8px;
}
.charts-row {
  display: flex;
  gap: 12px;
  margin-bottom: 12px;
}
.charts-row:last-child {
  margin-bottom: 0;
}
.chart-card {
  background: #fafafa;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  padding: 8px;
  min-width: 0;
}
.chart-wide {
  flex: 3;
}
.chart-narrow {
  flex: 2;
}
</style>
