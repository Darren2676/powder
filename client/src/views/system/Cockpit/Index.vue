<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { PieChart, BarChart, LineChart } from 'echarts/charts'
import {
  TitleComponent, TooltipComponent, LegendComponent, GridComponent
} from 'echarts/components'
import { getCockpitOverview } from '@/api/system/cockpit'
import dayjs from 'dayjs'
import {
  ShoppingOutlined,
  ShoppingCartOutlined,
  ScheduleOutlined,
  SafetyCertificateOutlined,
  HomeOutlined,
  DashboardOutlined
} from '@ant-design/icons-vue'

use([CanvasRenderer, PieChart, BarChart, LineChart, TitleComponent, TooltipComponent, LegendComponent, GridComponent])

const loading = ref(false)
const data = ref<any>({})
const dateRange = ref<any>([])

const kpi = computed(() => data.value.kpi || {})
const monthlyTrend = computed(() => data.value.monthly_trend || {})
const distribution = computed(() => data.value.distribution || {})
const ranking = computed(() => data.value.ranking || {})
const pendingSummary = computed(() => data.value.pending_summary || [])

// KPI卡片配置
const kpiCards = computed(() => [
  { title: '销售订单总额', value: kpi.value.sales_amount, suffix: '元', icon: ShoppingOutlined, color: '#1890ff', bg: '#e6f7ff' },
  { title: '采购订单总额', value: kpi.value.purchase_amount, suffix: '元', icon: ShoppingCartOutlined, color: '#fa8c16', bg: '#fff7e6' },
  { title: '生产单完成率', value: kpi.value.production_rate, suffix: '%', icon: ScheduleOutlined, color: '#52c41a', bg: '#f6ffed' },
  { title: '综合合格率', value: kpi.value.quality_rate, suffix: '%', icon: SafetyCertificateOutlined, color: '#13c2c2', bg: '#e6fffb' },
  { title: '成品库存数量', value: kpi.value.inventory_value, suffix: '', icon: HomeOutlined, color: '#722ed1', bg: '#f9f0ff' },
  { title: '设备OEE', value: kpi.value.oee, suffix: '%', icon: DashboardOutlined, color: '#eb2f96', bg: '#fff0f6' }
])

// 销售vs采购月度趋势
const salesPurchaseTrendOption = computed(() => {
  const d = monthlyTrend.value.sales_vs_purchase || []
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['销售额', '采购额'], top: 0 },
    grid: { left: 60, right: 60, bottom: 30, top: 40 },
    xAxis: { type: 'category', data: d.map((r: any) => r.month?.substring(5) || '') },
    yAxis: [
      { type: 'value', name: '销售额', axisLabel: { formatter: (v: number) => v >= 10000 ? (v/10000).toFixed(0) + '万' : v.toString() } },
      { type: 'value', name: '采购额', axisLabel: { formatter: (v: number) => v >= 10000 ? (v/10000).toFixed(0) + '万' : v.toString() } }
    ],
    series: [
      { name: '销售额', type: 'bar', data: d.map((r: any) => r.sales_amount), itemStyle: { color: '#1890ff' } },
      { name: '采购额', type: 'line', yAxisIndex: 1, data: d.map((r: any) => r.purchase_amount), itemStyle: { color: '#fa8c16' }, smooth: true }
    ]
  }
})

// 生产产出趋势
const productionTrendOption = computed(() => {
  const d = monthlyTrend.value.production_output || []
  return {
    tooltip: { trigger: 'axis' },
    legend: { data: ['完成单数', '入库数量'], top: 0 },
    grid: { left: 50, right: 30, bottom: 30, top: 40 },
    xAxis: { type: 'category', data: d.map((r: any) => r.month?.substring(5) || '') },
    yAxis: { type: 'value' },
    series: [
      { name: '完成单数', type: 'bar', data: d.map((r: any) => r.completed_count), itemStyle: { color: '#52c41a' } },
      { name: '入库数量', type: 'line', data: d.map((r: any) => r.inbound_qty), itemStyle: { color: '#13c2c2' }, smooth: true }
    ]
  }
})

// 销售状态分布
const salesStatusOption = computed(() => {
  const d = distribution.value.sales_status || {}
  const entries = Object.entries(d)
  const colors = ['#1890ff', '#fa8c16', '#52c41a', '#f5222d', '#722ed1', '#13c2c2']
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, type: 'scroll' },
    series: [{
      type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'],
      label: { formatter: '{b}: {d}%' },
      data: entries.map(([name, value], i) => ({ name, value, itemStyle: { color: colors[i % colors.length] } }))
    }]
  }
})

// 生产阶段漏斗
const prodFunnelOption = computed(() => {
  const d = distribution.value.production_funnel || []
  const sorted = [...d].sort((a, b) => b.count - a.count)
  const colors = ['#1890ff', '#fa8c16', '#52c41a', '#f5222d', '#722ed1', '#13c2c2']
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 100, right: 40, bottom: 20, top: 10 },
    xAxis: { type: 'value' },
    yAxis: { type: 'category', data: sorted.map((r: any) => r.stage) },
    series: [{
      type: 'bar',
      data: sorted.map((r: any, i) => ({ value: r.count, itemStyle: { color: colors[i % colors.length] } })),
      barWidth: 20,
      label: { show: true, position: 'right' }
    }]
  }
})

// 不合格品处理分布
const ncHandlingOption = computed(() => {
  const d = distribution.value.nc_handling || {}
  const entries = Object.entries(d)
  const colors = ['#fa8c16', '#f5222d', '#52c41a', '#722ed1', '#13c2c2']
  return {
    tooltip: { trigger: 'item' },
    legend: { bottom: 0, type: 'scroll' },
    series: [{
      type: 'pie', radius: ['40%', '70%'], center: ['50%', '45%'],
      label: { formatter: '{b}: {d}%' },
      data: entries.map(([name, value], i) => ({ name, value, itemStyle: { color: colors[i % colors.length] } }))
    }]
  }
})

// 客户TOP10
const customerTop10Option = computed(() => {
  const d = ranking.value.customer_top10 || []
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 120, right: 40, bottom: 20, top: 10 },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => v >= 10000 ? (v/10000).toFixed(0) + '万' : v.toString() } },
    yAxis: { type: 'category', data: d.map((r: any) => r.customer_name).reverse() },
    series: [{
      type: 'bar',
      data: d.map((r: any) => r.total_amount).reverse(),
      itemStyle: { color: '#1890ff' },
      label: { show: true, position: 'right', formatter: (p: any) => p.value >= 10000 ? (p.value/10000).toFixed(1) + '万' : p.value.toString() }
    }]
  }
})

// 供应商TOP10
const supplierTop10Option = computed(() => {
  const d = ranking.value.supplier_top10 || []
  return {
    tooltip: { trigger: 'axis' },
    grid: { left: 120, right: 40, bottom: 20, top: 10 },
    xAxis: { type: 'value', axisLabel: { formatter: (v: number) => v >= 10000 ? (v/10000).toFixed(0) + '万' : v.toString() } },
    yAxis: { type: 'category', data: d.map((r: any) => r.supplier_name).reverse() },
    series: [{
      type: 'bar',
      data: d.map((r: any) => r.total_amount).reverse(),
      itemStyle: { color: '#fa8c16' },
      label: { show: true, position: 'right', formatter: (p: any) => p.value >= 10000 ? (p.value/10000).toFixed(1) + '万' : p.value.toString() }
    }]
  }
})

// 待审批表格列
const pendingColumns = [
  { title: '业务域', dataIndex: 'domain', key: 'domain', width: 120 },
  { title: '单据类型', dataIndex: 'doc_type', key: 'doc_type', width: 140 },
  { title: '待处理数', dataIndex: 'pending_count', key: 'pending_count', width: 100, align: 'right' as const }
]

const formatNumber = (v: number) => {
  if (v === undefined || v === null) return '0'
  if (v >= 10000) return (v / 10000).toFixed(2) + '万'
  return v.toLocaleString()
}

const fetchData = async () => {
  loading.value = true
  try {
    const params: any = {}
    if (dateRange.value && dateRange.value.length === 2) {
      params.dateFrom = dateRange.value[0].format('YYYY-MM-DD')
      params.dateTo = dateRange.value[1].format('YYYY-MM-DD')
    }
    const res = await getCockpitOverview(params)
    data.value = res.data?.data || res.data || {}
  } catch (error) {
    console.error('Failed to fetch cockpit data:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => { fetchData() })
</script>

<template>
  <div class="cockpit-page">
    <!-- 顶部标题栏 -->
    <div class="cockpit-header">
      <h2 class="cockpit-title">管理驾驶舱</h2>
      <a-space>
        <a-range-picker v-model:value="dateRange" :placeholder="['开始日期', '结束日期']" style="width: 240px;" />
        <a-button type="primary" @click="fetchData">
          <template #icon><ReloadOutlined /></template>
          刷新
        </a-button>
      </a-space>
    </div>

    <a-spin :spinning="loading">
      <!-- 第一行: KPI卡片 -->
      <a-row :gutter="16" class="kpi-row">
        <a-col :xs="12" :sm="8" :md="4" v-for="(card, idx) in kpiCards" :key="idx">
          <a-card :bodyStyle="{ padding: '16px' }" size="small">
            <div class="kpi-card">
              <div class="kpi-icon" :style="{ background: card.bg }">
                <component :is="card.icon" :style="{ color: card.color, fontSize: '22px' }" />
              </div>
              <div class="kpi-info">
                <div class="kpi-label">{{ card.title }}</div>
                <div class="kpi-value" :style="{ color: card.color }">
                  {{ formatNumber(card.value) }}<span class="kpi-suffix">{{ card.suffix }}</span>
                </div>
              </div>
            </div>
          </a-card>
        </a-col>
      </a-row>

      <!-- 第二行: 经营趋势 -->
      <a-row :gutter="16">
        <a-col :xs="24" :md="12">
          <a-card title="销售额 vs 采购额 月度趋势" size="small" style="margin-bottom: 16px;">
            <VChart :option="salesPurchaseTrendOption" style="height: 280px;" autoresize />
          </a-card>
        </a-col>
        <a-col :xs="24" :md="12">
          <a-card title="生产产出趋势" size="small" style="margin-bottom: 16px;">
            <VChart :option="productionTrendOption" style="height: 280px;" autoresize />
          </a-card>
        </a-col>
      </a-row>

      <!-- 第三行: 业务分布 -->
      <a-row :gutter="16">
        <a-col :xs="24" :md="8">
          <a-card title="销售订单状态分布" size="small" style="margin-bottom: 16px;">
            <VChart :option="salesStatusOption" style="height: 260px;" autoresize />
          </a-card>
        </a-col>
        <a-col :xs="24" :md="8">
          <a-card title="生产单阶段分布" size="small" style="margin-bottom: 16px;">
            <VChart :option="prodFunnelOption" style="height: 260px;" autoresize />
          </a-card>
        </a-col>
        <a-col :xs="24" :md="8">
          <a-card title="不合格品处理分布" size="small" style="margin-bottom: 16px;">
            <VChart :option="ncHandlingOption" style="height: 260px;" autoresize />
          </a-card>
        </a-col>
      </a-row>

      <!-- 第四行: 排行 -->
      <a-row :gutter="16">
        <a-col :xs="24" :md="12">
          <a-card title="客户销售额 TOP10" size="small" style="margin-bottom: 16px;">
            <VChart :option="customerTop10Option" style="height: 300px;" autoresize />
          </a-card>
        </a-col>
        <a-col :xs="24" :md="12">
          <a-card title="供应商采购额 TOP10" size="small" style="margin-bottom: 16px;">
            <VChart :option="supplierTop10Option" style="height: 300px;" autoresize />
          </a-card>
        </a-col>
      </a-row>

      <!-- 第五行: 待审批汇总 -->
      <a-card title="待审批单据汇总" size="small" style="margin-bottom: 16px;">
        <a-table
          :columns="pendingColumns"
          :data-source="pendingSummary"
          :pagination="false"
          size="small"
          row-key="doc_type"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'pending_count'">
              <a-tag :color="record.pending_count > 0 ? 'red' : 'green'">{{ record.pending_count }}</a-tag>
            </template>
          </template>
        </a-table>
      </a-card>
    </a-spin>
  </div>
</template>

<script lang="ts">
import { ReloadOutlined } from '@ant-design/icons-vue'
export default { name: 'CockpitPage' }
</script>

<style scoped>
.cockpit-page {
  padding: 16px;
  background: #f0f2f5;
  min-height: 100vh;
}
.cockpit-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.cockpit-title {
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #1a1a1a;
}
.kpi-row {
  margin-bottom: 8px;
}
.kpi-card {
  display: flex;
  align-items: center;
  gap: 12px;
}
.kpi-icon {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.kpi-info {
  flex: 1;
  min-width: 0;
}
.kpi-label {
  font-size: 12px;
  color: #8c8c8c;
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.kpi-value {
  font-size: 18px;
  font-weight: 700;
  line-height: 1.2;
}
.kpi-suffix {
  font-size: 12px;
  font-weight: 400;
  margin-left: 2px;
}
</style>
