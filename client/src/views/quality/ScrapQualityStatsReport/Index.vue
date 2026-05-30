<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { message } from 'ant-design-vue'
import dayjs from 'dayjs'
import {
  SearchOutlined, ReloadOutlined, ExclamationCircleOutlined, CheckCircleOutlined,
  CloseCircleOutlined, ClockCircleOutlined, EyeOutlined
} from '@ant-design/icons-vue'
import { getScrapQualityStatsKPI, getScrapQualityStatsChartData, getScrapQualityStatsTableData } from '@/api/quality/scrapQualityStatsReport'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, PieChart, LineChart } from 'echarts/charts'
import { TitleComponent, TooltipComponent, LegendComponent, GridComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, BarChart, PieChart, LineChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const loading = ref(false)
const activeTab = ref('chart')
const searchText = ref('')
const dateRange = ref<[dayjs.Dayjs, dayjs.Dayjs] | null>(null)

const statsData = reactive({ total: 0, processed_count: 0, scrap_count: 0, pending_count: 0 })
const chartData = ref<any>({})
const tableData = ref<any[]>([])
const detailVisible = ref(false)
const detailData = ref<any>(null)

const pagination = reactive({
  current: 1, pageSize: 20, total: 0,
  showSizeChanger: true, showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `${total} 条`
})

const columns = [
  { title: '不合格单号', dataIndex: 'nonconforming_number', key: 'nonconforming_number', width: 150 },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 110 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 120 },
  { title: '来源类型', dataIndex: 'source_type', key: 'source_type', width: 100 },
  { title: '处理方式', dataIndex: 'handling_method', key: 'handling_method', width: 90 },
  { title: '报废数量', dataIndex: 'scrap_quantity', key: 'scrap_quantity', width: 90, align: 'right' as const },
  { title: '处理日期', dataIndex: 'handling_date', key: 'handling_date', width: 110 },
  { title: '处理状态', dataIndex: 'handling_status', key: 'handling_status', width: 90 },
]

const getParams = () => {
  const params: any = {}
  if (searchText.value) params.search = searchText.value
  if (dateRange.value) { params.start_date = dateRange.value[0].format('YYYY-MM-DD'); params.end_date = dateRange.value[1].format('YYYY-MM-DD') }
  return params
}

const fetchKPI = async () => { try { const res: any = await getScrapQualityStatsKPI(getParams()); if (res?.success) Object.assign(statsData, res.data) } catch { /* */ } }
const fetchChartData = async () => { try { const res: any = await getScrapQualityStatsChartData(getParams()); if (res?.success) chartData.value = res.data } catch { /* */ } }
const fetchTableData = async (page = 1, pageSize = pagination.pageSize) => {
  loading.value = true
  try {
    const params = { ...getParams(), page, limit: pageSize }
    const res: any = await getScrapQualityStatsTableData(params)
    if (res?.success) { tableData.value = res.data.items || []; pagination.total = res.data.total || 0; pagination.current = page; pagination.pageSize = pageSize }
  } catch { message.error('获取数据失败') } finally { loading.value = false }
}

const handleSearch = () => { fetchKPI(); fetchChartData(); fetchTableData(1) }
const handleReset = () => { searchText.value = ''; dateRange.value = null; handleSearch() }
const handleTableChange = (pag: any) => { fetchTableData(pag.current, pag.pageSize) }
const showDetail = (record: any) => { detailData.value = record; detailVisible.value = true }

const methodPieOption = computed(() => {
  const data = chartData.value?.method_distribution || []
  if (!data.length) return {}
  const colorMap: Record<string, string> = { '报废': '#ff4d4f', '返修': '#faad14', '挑选': '#1890ff', '特采': '#52c41a', '退货': '#722ed1', '让步接收': '#13c2c2', '拒收': '#eb2f96' }
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    color: data.map((d: any) => colorMap[d.name] || '#999'),
    series: [{ type: 'pie', radius: ['35%', '60%'], center: ['50%', '45%'],
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{c}件' },
      data: data.map((d: any) => ({ name: d.name, value: parseInt(d.value) || 0 }))
    }]
  }
})

const sourcePieOption = computed(() => {
  const data = chartData.value?.source_distribution || []
  if (!data.length) return {}
  const colorMap: Record<string, string> = { '来料检验': '#1890ff', '生产检验': '#52c41a', '委外检验': '#faad14' }
  return {
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0, type: 'scroll' },
    color: data.map((d: any) => colorMap[d.name] || '#999'),
    series: [{ type: 'pie', radius: ['35%', '60%'], center: ['50%', '45%'],
      itemStyle: { borderRadius: 4, borderColor: '#fff', borderWidth: 2 },
      label: { show: true, formatter: '{b}\n{c}件' },
      data: data.map((d: any) => ({ name: d.name, value: parseInt(d.value) || 0 }))
    }]
  }
})

const trendOption = computed(() => {
  const data = chartData.value?.monthly_trend || []
  if (!data.length) return {}
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    legend: { data: ['报废单数', '报废数量'], bottom: 0 },
    grid: { left: 50, right: 50, top: 20, bottom: 40 },
    xAxis: { type: 'category', data: data.map((d: any) => d.month) },
    yAxis: [{ type: 'value', name: '单数' }, { type: 'value', name: '数量' }],
    series: [
      { name: '报废单数', type: 'bar', barMaxWidth: 24, data: data.map((d: any) => parseInt(d.order_count) || 0), itemStyle: { color: '#1890ff' } },
      { name: '报废数量', type: 'line', yAxisIndex: 1, data: data.map((d: any) => parseFloat(d.total_qty) || 0), itemStyle: { color: '#ff4d4f' } }
    ]
  }
})

const topItemsOption = computed(() => {
  const data = (chartData.value?.top_items || []).slice(0, 10)
  if (!data.length) return {}
  return {
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
    grid: { left: 100, right: 20, top: 20, bottom: 40 },
    xAxis: { type: 'value', name: '报废数量' },
    yAxis: { type: 'category', data: data.map((d: any) => d.item_name || d.item_number).reverse() },
    series: [{ type: 'bar', data: data.map((d: any) => parseFloat(d.total_scrap) || 0).reverse(), itemStyle: { color: '#ff4d4f' } }]
  }
})

onMounted(() => { fetchKPI(); fetchChartData(); fetchTableData() })
</script>

<template>
  <div style="padding: 0;">
    <a-card size="small" :bordered="false" style="margin-bottom: 16px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <h3 class="page-title" style="margin: 0; white-space: nowrap;">废品统计分析报表</h3>
        <a-divider type="vertical" style="height: 24px; margin: 0;" />
        <a-form layout="inline" style="display: flex; flex-wrap: wrap; gap: 8px; align-items: center; flex: 1;">
          <a-form-item label="搜索" style="margin-bottom: 0;">
            <a-input-search v-model:value="searchText" placeholder="不合格单号/物料编号/名称" style="width: 260px;" allow-clear @search="handleSearch" />
          </a-form-item>
          <a-form-item label="日期范围" style="margin-bottom: 0;">
            <a-range-picker v-model:value="dateRange" :placeholder="['开始日期', '结束日期']" style="width: 240px;" @change="handleSearch" />
          </a-form-item>
          <a-form-item style="margin-bottom: 0;">
            <a-space>
              <a-button type="primary" @click="handleSearch"><template #icon><SearchOutlined /></template>查询</a-button>
              <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
            </a-space>
          </a-form-item>
        </a-form>
      </div>
    </a-card>

    <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 16px;">
      <a-card size="small" :bordered="false" style="text-align: center;">
        <a-statistic title="不合格总数" :value="statsData.total" :value-style="{ color: '#faad14', fontSize: '28px', fontWeight: 700 }"><template #prefix><ExclamationCircleOutlined /></template></a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" style="text-align: center;">
        <a-statistic title="已处理数量" :value="statsData.processed_count" :value-style="{ color: '#52c41a', fontSize: '28px', fontWeight: 700 }"><template #prefix><CheckCircleOutlined /></template></a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" style="text-align: center;">
        <a-statistic title="报废总数" :value="statsData.scrap_count" :value-style="{ color: '#ff4d4f', fontSize: '28px', fontWeight: 700 }"><template #prefix><CloseCircleOutlined /></template></a-statistic>
      </a-card>
      <a-card size="small" :bordered="false" style="text-align: center;">
        <a-statistic title="待处理数量" :value="statsData.pending_count" :value-style="{ color: '#faad14', fontSize: '28px', fontWeight: 700 }"><template #prefix><ClockCircleOutlined /></template></a-statistic>
      </a-card>
    </div>

    <a-card size="small" :bordered="false">
      <a-tabs v-model:activeKey="activeTab" size="small">
        <a-tab-pane key="chart" tab="图表概览">
          <a-row :gutter="16">
            <a-col :span="12">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">处理方式分布</div>
              <v-chart v-if="chartData?.method_distribution?.length" :option="methodPieOption" style="height: 280px;" autoresize />
              <a-empty v-else description="暂无数据" />
            </a-col>
            <a-col :span="12">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">来源类型分布</div>
              <v-chart v-if="chartData?.source_distribution?.length" :option="sourcePieOption" style="height: 280px;" autoresize />
              <a-empty v-else description="暂无数据" />
            </a-col>
          </a-row>
          <a-row :gutter="16" style="margin-top: 16px;">
            <a-col :span="12">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">月度报废趋势</div>
              <v-chart v-if="chartData?.monthly_trend?.length" :option="trendOption" style="height: 280px;" autoresize />
              <a-empty v-else description="暂无数据" />
            </a-col>
            <a-col :span="12">
              <div style="font-size: 13px; font-weight: 600; margin-bottom: 8px;">物料报废TOP10</div>
              <v-chart v-if="chartData?.top_items?.length" :option="topItemsOption" style="height: 280px;" autoresize />
              <a-empty v-else description="暂无数据" />
            </a-col>
          </a-row>
        </a-tab-pane>
        <a-tab-pane key="detail" tab="报废明细">
          <a-table :columns="columns" :data-source="tableData" :loading="loading" :pagination="pagination" :scroll="{ x: 950 }" row-key="nonconforming_number" size="small" @change="handleTableChange">
            <template #bodyCell="{ column, record, text }">
              <template v-if="column.key === 'nonconforming_number'">
                <a style="color: #1890ff; cursor: pointer;" @click="showDetail(record)">{{ text }}</a>
              </template>
              <template v-else-if="column.key === 'handling_method'">
                <a-tag color="red">{{ text }}</a-tag>
              </template>
              <template v-else-if="column.key === 'handling_status'">
                <a-tag :color="text === '已完成' ? 'green' : 'orange'">{{ text }}</a-tag>
              </template>
              <template v-else-if="column.key === 'handling_date'">
                {{ text ? dayjs(text).format('YYYY-MM-DD') : '-' }}
              </template>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <a-modal v-model:open="detailVisible" :title="'报废详情 - ' + (detailData?.nonconforming_number || '')" :width="800" :footer="null" :body-style="{ maxHeight: '70vh', overflowY: 'auto', padding: '16px' }">
      <template v-if="detailData">
        <a-descriptions size="small" :column="2" bordered>
          <a-descriptions-item label="不合格单号">{{ detailData.nonconforming_number }}</a-descriptions-item>
          <a-descriptions-item label="来源类型">{{ detailData.source_type }}</a-descriptions-item>
          <a-descriptions-item label="物料编号">{{ detailData.item_number }}</a-descriptions-item>
          <a-descriptions-item label="物料名称">{{ detailData.item_name }}</a-descriptions-item>
          <a-descriptions-item label="不合格数量">{{ detailData.unqualified_quantity }}</a-descriptions-item>
          <a-descriptions-item label="报废数量">{{ detailData.scrap_quantity }}</a-descriptions-item>
          <a-descriptions-item label="处理方式">{{ detailData.handling_method }}</a-descriptions-item>
          <a-descriptions-item label="处理状态">{{ detailData.handling_status }}</a-descriptions-item>
          <a-descriptions-item label="处理日期">{{ detailData.handling_date ? dayjs(detailData.handling_date).format('YYYY-MM-DD') : '-' }}</a-descriptions-item>
          <a-descriptions-item label="报废入库单号">{{ detailData.stock_in_number || '-' }}</a-descriptions-item>
          <a-descriptions-item label="备注" :span="2">{{ detailData.remark || '-' }}</a-descriptions-item>
        </a-descriptions>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #262626;
}
</style>
