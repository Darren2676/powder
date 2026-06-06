<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart, BarChart, LineChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
} from 'echarts/components'
import request from '@/utils/request'
import dayjs from 'dayjs'
import type { Dayjs } from 'dayjs'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import {
  ShoppingOutlined,
  FileTextOutlined,
  SendOutlined,
  SwapOutlined,
  PercentageOutlined,
  SearchOutlined,
  ReloadOutlined,
  SettingOutlined
} from '@ant-design/icons-vue'

use([
  CanvasRenderer,
  PieChart,
  BarChart,
  LineChart,
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent
])

const loading = ref(false)
const activeTab = ref('chart')
const kpi = ref<any>({})
const trendChartOption = ref({})
const reasonChartOption = ref({})
const customerChartOption = ref({})
const productChartOption = ref({})
const dateRange = ref<[Dayjs, Dayjs]>([dayjs().subtract(12, 'month'), dayjs()])
const summaryData = ref<any[]>([])
const searchText = ref('')

const summaryPagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const defaultSummaryColumns: any[] = [
  { title: '销售订单号', dataIndex: 'sales_order_number', key: 'sales_order_number', width: 160, resizable: true },
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 140, resizable: true },
  { title: '订单日期', dataIndex: 'order_date', key: 'order_date', width: 110, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 140, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, resizable: true },
  { title: '订单数量', dataIndex: 'order_quantity', key: 'order_quantity', width: 100, resizable: true },
  { title: '已发数量', dataIndex: 'shipped_qty', key: 'shipped_qty', width: 100, resizable: true },
  { title: '已退数量', dataIndex: 'returned_qty', key: 'returned_qty', width: 100, resizable: true },
  { title: '退货率', dataIndex: 'return_rate', key: 'return_rate', width: 100, resizable: true }
]

const {
  columns: summaryColumns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('sales_report', defaultSummaryColumns, { fixedLeft: [], fixedRight: [] })

const formatDate = (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-'

const getDateParams = () => ({
  start_date: dateRange.value[0].format('YYYY-MM-DD'),
  end_date: dateRange.value[1].format('YYYY-MM-DD')
})

const reasonColors = ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#d48265']

const fetchCharts = async () => {
  loading.value = true
  try {
    const params = getDateParams()
    const results = await Promise.allSettled([
      request.get('/sales-report/kpi', { params }),
      request.get('/sales-report/monthly-trend', { params }),
      request.get('/sales-report/customer-ranking', { params }),
      request.get('/sales-report/product-ranking', { params }),
      request.get('/sales-report/return-reason', { params })
    ])

    const kpiRes: any = results[0].status === 'fulfilled' ? results[0].value : null
    const trendRes: any = results[1].status === 'fulfilled' ? results[1].value : null
    const customerRes: any = results[2].status === 'fulfilled' ? results[2].value : null
    const productRes: any = results[3].status === 'fulfilled' ? results[3].value : null
    const reasonRes: any = results[4].status === 'fulfilled' ? results[4].value : null

    // KPI
    if (kpiRes?.success) kpi.value = kpiRes.data

    // 月度趋势
    if (trendRes?.success) {
      const rows = trendRes.data || []
      trendChartOption.value = {
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            let s = `<b>${params[0].axisValue}</b>`
            params.forEach((p: any) => { s += `<br/>${p.marker} ${p.seriesName}: ${p.value}` })
            return s
          }
        },
        legend: { top: 4, data: ['发货数量', '退货数量'], textStyle: { fontSize: 11 } },
        grid: { left: '3%', right: '5%', top: 36, bottom: '4%', containLabel: true },
        xAxis: {
          type: 'category',
          data: rows.map((r: any) => r.month),
          boundaryGap: true,
          axisLabel: { fontSize: 10 }
        },
        yAxis: [
          { type: 'value', name: '发货数量', position: 'left', nameTextStyle: { fontSize: 10, color: '#8c8c8c' } },
          { type: 'value', name: '退货数量', position: 'right', nameTextStyle: { fontSize: 10, color: '#8c8c8c' }, splitLine: { show: false } }
        ],
        series: [
          {
            name: '发货数量',
            type: 'bar',
            data: rows.map((r: any) => r.shipped_qty),
            itemStyle: { color: '#52c41a', borderRadius: [3, 3, 0, 0] },
            barMaxWidth: 24,
            label: { show: true, position: 'top', fontSize: 9, color: '#52c41a', formatter: (p: any) => p.value > 0 ? p.value : '' }
          },
          {
            name: '退货数量',
            type: 'line',
            yAxisIndex: 1,
            data: rows.map((r: any) => r.returned_qty),
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            itemStyle: { color: '#ff4d4f' },
            lineStyle: { width: 2 },
            areaStyle: { color: 'rgba(255,77,79,0.08)' },
            label: { show: true, position: 'top', fontSize: 9, color: '#ff4d4f', formatter: (p: any) => p.value > 0 ? p.value : '' }
          }
        ]
      }
    }

    // 退货原因分布
    if (reasonRes?.success) {
      const rows = reasonRes.data || []
      reasonChartOption.value = {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { orient: 'vertical', right: 8, top: 'middle', textStyle: { fontSize: 11 } },
        series: [{
          name: '退货原因',
          type: 'pie',
          radius: ['36%', '62%'],
          center: ['40%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2 },
          label: { show: true, formatter: '{b}\n{c} ({d}%)', fontSize: 11, lineHeight: 16 },
          labelLine: { show: true, length: 10, length2: 6 },
          data: rows.map((r: any, i: number) => ({
            name: r.reason,
            value: Number(r.total_qty) || 0,
            itemStyle: { color: reasonColors[i % reasonColors.length] }
          }))
        }]
      }
    }

    // 客户 TOP10
    if (customerRes?.success) {
      const rows = customerRes.data || []
      customerChartOption.value = {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params: any) => {
            let s = `<b>${params[0].name}</b>`
            params.forEach((p: any) => { s += `<br/>${p.marker} ${p.seriesName}: ${p.value}` })
            const shipped = Number(params[0]?.value) || 0
            const returned = params[1] ? Number(params[1].value) || 0 : 0
            if (shipped > 0) s += `<br/>退货率: ${(returned / shipped * 100).toFixed(1)}%`
            return s
          }
        },
        legend: { top: 4, data: ['发货数量', '退货数量'], textStyle: { fontSize: 11 } },
        grid: { left: '3%', right: '4%', top: 36, bottom: '4%', containLabel: true },
        xAxis: {
          type: 'category',
          data: rows.map((r: any) => r.customer_name),
          axisLabel: { rotate: 25, fontSize: 10, interval: 0 }
        },
        yAxis: { type: 'value', name: '数量', nameTextStyle: { fontSize: 10, color: '#8c8c8c' } },
        series: [
          {
            name: '发货数量',
            type: 'bar',
            data: rows.map((r: any) => Number(r.shipped_qty) || 0),
            itemStyle: { color: '#52c41a', borderRadius: [4, 4, 0, 0] },
            barMaxWidth: 28
          },
          {
            name: '退货数量',
            type: 'bar',
            data: rows.map((r: any) => Number(r.returned_qty) || 0),
            itemStyle: { color: '#ff4d4f', borderRadius: [4, 4, 0, 0] },
            barMaxWidth: 28
          }
        ]
      }
    }

    // 产品 TOP10
    if (productRes?.success) {
      const rows = productRes.data || []
      productChartOption.value = {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (params: any) => {
            let s = `<b>${params[0].name}</b>`
            params.forEach((p: any) => { s += `<br/>${p.marker} ${p.seriesName}: ${p.value}` })
            const shipped = Number(params[0]?.value) || 0
            const returned = params[1] ? Number(params[1].value) || 0 : 0
            if (shipped > 0) s += `<br/>退货率: ${(returned / shipped * 100).toFixed(1)}%`
            return s
          }
        },
        legend: { top: 4, data: ['发货数量', '退货数量'], textStyle: { fontSize: 11 } },
        grid: { left: '3%', right: '4%', top: 36, bottom: '4%', containLabel: true },
        xAxis: {
          type: 'category',
          data: rows.map((r: any) => r.item_name || r.item_number),
          axisLabel: { rotate: 25, fontSize: 10, interval: 0 }
        },
        yAxis: { type: 'value', name: '数量', nameTextStyle: { fontSize: 10, color: '#8c8c8c' } },
        series: [
          {
            name: '发货数量',
            type: 'bar',
            data: rows.map((r: any) => Number(r.shipped_qty) || 0),
            itemStyle: { color: '#52c41a', borderRadius: [4, 4, 0, 0] },
            barMaxWidth: 28
          },
          {
            name: '退货数量',
            type: 'bar',
            data: rows.map((r: any) => Number(r.returned_qty) || 0),
            itemStyle: { color: '#ff4d4f', borderRadius: [4, 4, 0, 0] },
            barMaxWidth: 28
          }
        ]
      }
    }
  } catch (error) {
    console.error('Failed to fetch report data:', error)
  } finally {
    loading.value = false
  }
}

const fetchSummary = async () => {
  try {
    const params = { ...getDateParams(), page: summaryPagination.current, limit: summaryPagination.pageSize, search: searchText.value }
    const res: any = await request.get('/sales-report/order-summary', { params })
    if (res?.success) {
      summaryData.value = res.data.items || []
      summaryPagination.total = res.data.total || 0
    }
  } catch { /* ignore */ }
}

const fetchAll = () => {
  fetchCharts()
  fetchSummary()
}

const handleDateChange = () => {
  summaryPagination.current = 1
  fetchAll()
}

const handleTableChange = (pag: any) => {
  summaryPagination.current = pag.current
  summaryPagination.pageSize = pag.pageSize
  fetchSummary()
}

const handleSearch = () => {
  summaryPagination.current = 1
  fetchSummary()
}

const getReturnRateColor = (rate: number) => {
  if (rate === 0) return 'default'
  if (rate < 5) return 'green'
  if (rate <= 15) return 'orange'
  return 'red'
}

onMounted(async () => {
  await loadColumnPreference()
  fetchAll()
})
</script>

<template>
  <div class="dashboard-container">
    <div class="dashboard-header">
      <h2 class="dashboard-title">发货退货报告</h2>
      <a-range-picker
        v-model:value="dateRange"
        :allow-clear="false"
        format="YYYY-MM-DD"
        style="width: 260px"
        @change="handleDateChange"
      />
    </div>
    <a-tabs v-model:activeKey="activeTab">
      <a-tab-pane key="chart" tab="图表概览">
        <a-spin :spinning="loading">
          <!-- KPI 统计卡片 -->
          <a-row :gutter="[12, 12]" class="section-row">
            <a-col :xs="12" :sm="8" :md="4">
              <a-card hoverable :bodyStyle="{ padding: '12px 16px' }" class="stat-card">
                <a-statistic title="涉及订单数" :value="kpi.totalOrders || 0" :value-style="{ color: '#1677ff', fontSize: '22px' }">
                  <template #prefix><ShoppingOutlined /></template>
                  <template #suffix><span class="stat-suffix">单</span></template>
                </a-statistic>
              </a-card>
            </a-col>
            <a-col :xs="12" :sm="8" :md="4">
              <a-card hoverable :bodyStyle="{ padding: '12px 16px' }" class="stat-card">
                <a-statistic title="发货单数" :value="kpi.totalShippedOrders || 0" :value-style="{ color: '#1677ff', fontSize: '22px' }">
                  <template #prefix><FileTextOutlined /></template>
                  <template #suffix><span class="stat-suffix">单</span></template>
                </a-statistic>
              </a-card>
            </a-col>
            <a-col :xs="12" :sm="8" :md="4">
              <a-card hoverable :bodyStyle="{ padding: '12px 16px' }" class="stat-card">
                <a-statistic title="总发货数量" :value="kpi.totalShippedQty || 0" :value-style="{ color: '#52c41a', fontSize: '22px' }">
                  <template #prefix><SendOutlined /></template>
                </a-statistic>
              </a-card>
            </a-col>
            <a-col :xs="12" :sm="8" :md="4">
              <a-card hoverable :bodyStyle="{ padding: '12px 16px' }" class="stat-card">
                <a-statistic title="总退货数量" :value="kpi.totalReturnedQty || 0" :value-style="{ color: '#ff4d4f', fontSize: '22px' }">
                  <template #prefix><SwapOutlined /></template>
                </a-statistic>
              </a-card>
            </a-col>
            <a-col :xs="12" :sm="8" :md="4">
              <a-card hoverable :bodyStyle="{ padding: '12px 16px' }" class="stat-card">
                <a-statistic title="退货率" :value="kpi.returnRate || 0" :precision="2" :value-style="{ color: '#faad14', fontSize: '22px' }">
                  <template #prefix><PercentageOutlined /></template>
                  <template #suffix><span class="stat-suffix">%</span></template>
                </a-statistic>
              </a-card>
            </a-col>
          </a-row>

          <!-- 图表第一行: 月度趋势 + 退货原因 -->
          <a-row :gutter="12" class="section-row">
            <a-col :xs="24" :md="14">
              <a-card :headStyle="{ fontWeight: 600, padding: '0 16px', minHeight: '40px' }" :bodyStyle="{ padding: '8px' }" title="月度发货退货趋势">
                <VChart :option="trendChartOption" style="height: 300px;" autoresize />
              </a-card>
            </a-col>
            <a-col :xs="24" :md="10">
              <a-card :headStyle="{ fontWeight: 600, padding: '0 16px', minHeight: '40px' }" :bodyStyle="{ padding: '8px' }" title="退货原因分布">
                <VChart :option="reasonChartOption" style="height: 300px;" autoresize />
              </a-card>
            </a-col>
          </a-row>

          <!-- 图表第二行: 客户TOP10 + 产品TOP10 -->
          <a-row :gutter="12" class="section-row">
            <a-col :xs="24" :md="12">
              <a-card :headStyle="{ fontWeight: 600, padding: '0 16px', minHeight: '40px' }" :bodyStyle="{ padding: '8px' }" title="客户发货退货 TOP10">
                <VChart :option="customerChartOption" style="height: 300px;" autoresize />
              </a-card>
            </a-col>
            <a-col :xs="24" :md="12">
              <a-card :headStyle="{ fontWeight: 600, padding: '0 16px', minHeight: '40px' }" :bodyStyle="{ padding: '8px' }" title="产品发货退货 TOP10">
                <VChart :option="productChartOption" style="height: 300px;" autoresize />
              </a-card>
            </a-col>
          </a-row>
        </a-spin>
      </a-tab-pane>

      <a-tab-pane key="detail" tab="订单明细">
        <!-- 销售订单明细汇总表 -->
        <a-card :headStyle="{ fontWeight: 600, padding: '0 16px', minHeight: '40px' }" :bodyStyle="{ padding: '0' }">
          <template #title>
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span>销售订单发货退货汇总</span>
              <div style="display: flex; gap: 8px;">
                <a-input-search
                  v-model:value="searchText"
                  placeholder="搜索订单号/客户/产品"
                  style="width: 240px"
                  size="small"
                  @search="handleSearch"
                  @pressEnter="handleSearch"
                  allow-clear
                >
                  <template #prefix><SearchOutlined /></template>
                </a-input-search>
                <a-button size="small" @click="fetchSummary"><ReloadOutlined /></a-button>
                <a-tooltip title="列设置"><a-button size="small" @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
              </div>
            </div>
          </template>
          <a-table
            :columns="summaryColumns"
            :data-source="summaryData"
            :pagination="summaryPagination"
            row-key="_row_num"
            :scroll="{ x: 1200 }"
            size="small"
            bordered
            @change="handleTableChange"
            @resizeColumn="handleResizeColumn"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'order_date'">
                {{ formatDate(record.order_date) }}
              </template>
              <template v-else-if="column.key === 'shipped_qty'">
                <span style="color: #52c41a; font-weight: 600">{{ record.shipped_qty }}</span>
              </template>
              <template v-else-if="column.key === 'returned_qty'">
                <span :style="{ color: record.returned_qty > 0 ? '#ff4d4f' : '#8c8c8c', fontWeight: record.returned_qty > 0 ? '600' : '400' }">{{ record.returned_qty }}</span>
              </template>
              <template v-else-if="column.key === 'return_rate'">
                <a-tag :color="getReturnRateColor(Number(record.return_rate))">{{ record.return_rate }}%</a-tag>
              </template>
            </template>
          </a-table>
        </a-card>
      </a-tab-pane>
    </a-tabs>

    <ColumnSettingDrawer
      v-model:open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />
  </div>
</template>

<style scoped>
.dashboard-container {
  background: #f7f8fa;
}
.dashboard-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.dashboard-title {
  font-size: 18px;
  font-weight: 600;
  color: #1d2129;
  margin: 0;
  padding-left: 2px;
}
.section-row {
  margin-bottom: 12px;
}
.stat-card {
  height: 100%;
}
.stat-suffix {
  font-size: 12px;
  color: #8c8c8c;
}
</style>
