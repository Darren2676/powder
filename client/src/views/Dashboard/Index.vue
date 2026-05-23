<script setup lang="ts">
import { ref, onMounted } from 'vue'
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
import {
  ShoppingOutlined,
  FileTextOutlined,
  ClockCircleOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  RiseOutlined
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

const activeTab = ref('overview')
const loading = ref(false)
const stats = ref<any>({})
const statusChartOption = ref({})
const customerChartOption = ref({})
const trendChartOption = ref({})
const deliveryChartOption = ref({})
const recentOrders = ref<any[]>([])
const recentColumns = [
  { title: '订单编号', dataIndex: 'sales_order_number', key: 'sales_order_number', width: 180 },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 160 },
  { title: '订单日期', dataIndex: 'order_date', key: 'order_date', width: 110 },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '订单金额', dataIndex: 'total_amount', key: 'total_amount', width: 120 }
]

const formatDate = (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-'
const formatMoney = (v: number) => {
  if (v >= 10000) return (v / 10000).toFixed(2) + ' 万'
  return v.toFixed(2)
}

const approvalColorMap: Record<string, string> = {
  '草稿': '#bfbfbf',
  '待审批': '#faad14',
  '已审批': '#52c41a',
  '已驳回': '#ff4d4f'
}

const fetchData = async () => {
  loading.value = true
  try {
    const results = await Promise.allSettled([
      request.get('/sales-orders/stats'),
      request.get('/sales-orders/status-distribution'),
      request.get('/sales-orders/customer-ranking'),
      request.get('/sales-orders/monthly-trend'),
      request.get('/sales-orders/recent-list'),
      request.get('/sales-orders/delivery-trend')
    ])

    const statsRes: any = results[0].status === 'fulfilled' ? results[0].value : null
    const statusRes: any = results[1].status === 'fulfilled' ? results[1].value : null
    const customerRes: any = results[2].status === 'fulfilled' ? results[2].value : null
    const trendRes: any = results[3].status === 'fulfilled' ? results[3].value : null
    const recentRes: any = results[4].status === 'fulfilled' ? results[4].value : null
    const deliveryRes: any = results[5].status === 'fulfilled' ? results[5].value : null

    if (statsRes?.success) stats.value = statsRes.data

    // ========== 审批状态分布 饼图 ==========
    if (statusRes?.success) {
      const data = statusRes.data
      statusChartOption.value = {
        tooltip: { trigger: 'item', formatter: '{b}: {c}单 ({d}%)' },
        legend: { orient: 'vertical', right: 8, top: 'middle', textStyle: { fontSize: 12 } },
        series: [{
          name: '审批状态',
          type: 'pie',
          radius: ['36%', '62%'],
          center: ['40%', '50%'],
          avoidLabelOverlap: true,
          itemStyle: { borderRadius: 5, borderColor: '#fff', borderWidth: 2 },
          label: {
            show: true,
            formatter: '{b}\n{c}单 ({d}%)',
            fontSize: 11,
            lineHeight: 16
          },
          labelLine: { show: true, length: 10, length2: 6 },
          data: Object.entries(data).map(([name, value]) => ({
            name,
            value,
            itemStyle: { color: approvalColorMap[name] || '#1677ff' }
          }))
        }]
      }
    }

    // ========== 客户订单金额 TOP10 柱状图 ==========
    if (customerRes?.success) {
      const rows = customerRes.data || []
      customerChartOption.value = {
        tooltip: {
          trigger: 'axis',
          axisPointer: { type: 'shadow' },
          formatter: (p: any) => {
            const val = parseFloat(p[0].value)
            return `<b>${p[0].name}</b><br/>订单金额: ¥${val >= 10000 ? (val / 10000).toFixed(2) + '万' : val.toLocaleString()}`
          }
        },
        grid: { left: '3%', right: '4%', top: 12, bottom: '4%', containLabel: true },
        xAxis: {
          type: 'category',
          data: rows.map((r: any) => r.customer_name),
          axisLabel: { rotate: 25, fontSize: 10, interval: 0 }
        },
        yAxis: {
          type: 'value',
          name: '金额',
          nameTextStyle: { fontSize: 10, color: '#8c8c8c' },
          axisLabel: { formatter: (v: number) => v >= 10000 ? (v / 10000).toFixed(0) + '万' : String(v) }
        },
        series: [{
          name: '订单金额',
          type: 'bar',
          data: rows.map((r: any) => parseFloat(r.total_amount)),
          itemStyle: { color: '#1677ff', borderRadius: [4, 4, 0, 0] },
          barMaxWidth: 36,
          label: {
            show: true,
            position: 'top',
            fontSize: 10,
            color: '#1677ff',
            formatter: (p: any) => {
              const v = parseFloat(p.value)
              return v >= 10000 ? (v / 10000).toFixed(1) + '万' : v.toLocaleString()
            }
          }
        }]
      }
    }

    // ========== 月度订单趋势 (近12个月) 折线+柱状混合图 ==========
    if (trendRes?.success) {
      const rows = trendRes.data || []
      trendChartOption.value = {
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            let s = `<b>${params[0].axisValue}</b>`
            params.forEach((p: any) => {
              const marker = p.marker
              if (p.seriesName === '订单金额') {
                const v = parseFloat(p.value)
                s += `<br/>${marker} ${p.seriesName}: ¥${v >= 10000 ? (v / 10000).toFixed(2) + '万' : v.toLocaleString()}`
              } else {
                s += `<br/>${marker} ${p.seriesName}: ${p.value}单`
              }
            })
            return s
          }
        },
        legend: { top: 0, data: ['订单数', '订单金额'], textStyle: { fontSize: 11 } },
        grid: { left: '3%', right: '5%', top: 28, bottom: '4%', containLabel: true },
        xAxis: {
          type: 'category',
          data: rows.map((r: any) => r.month),
          boundaryGap: true,
          axisLabel: { fontSize: 10 }
        },
        yAxis: [
          { type: 'value', name: '订单数', position: 'left', nameTextStyle: { fontSize: 10, color: '#8c8c8c' } },
          {
            type: 'value', name: '金额 (元)', position: 'right',
            nameTextStyle: { fontSize: 10, color: '#8c8c8c' },
            axisLabel: { formatter: (v: number) => v >= 10000 ? (v / 10000).toFixed(0) + '万' : String(v) },
            splitLine: { show: false }
          }
        ],
        series: [
          {
            name: '订单数',
            type: 'line',
            data: rows.map((r: any) => r.order_count),
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            itemStyle: { color: '#1677ff' },
            lineStyle: { width: 2 },
            areaStyle: { color: 'rgba(22,119,255,0.08)' },
            label: {
              show: true,
              position: 'top',
              fontSize: 10,
              color: '#1677ff',
              formatter: '{c}单'
            }
          },
          {
            name: '订单金额',
            type: 'bar',
            yAxisIndex: 1,
            data: rows.map((r: any) => parseFloat(r.amount)),
            itemStyle: { color: '#52c41a', borderRadius: [3, 3, 0, 0] },
            barMaxWidth: 24,
            label: {
              show: true,
              position: 'top',
              fontSize: 9,
              color: '#52c41a',
              formatter: (p: any) => {
                const v = parseFloat(p.value)
                if (v === 0) return ''
                return v >= 10000 ? (v / 10000).toFixed(1) + '万' : v.toLocaleString()
              }
            }
          }
        ]
      }
    }

    if (recentRes?.success) {
      recentOrders.value = recentRes.data || []
    }

    // ========== 未来发货趋势 (未来8周) ==========
    if (deliveryRes?.success) {
      const rows = deliveryRes.data || []
      deliveryChartOption.value = {
        tooltip: {
          trigger: 'axis',
          formatter: (params: any) => {
            let s = `<b>${params[0].axisValue}</b>`
            params.forEach((p: any) => {
              s += `<br/>${p.marker} ${p.seriesName}: ${p.value}`
            })
            return s
          }
        },
        legend: { top: 0, data: ['涉及订单数', '发货数量'], textStyle: { fontSize: 11 } },
        grid: { left: '3%', right: '5%', top: 28, bottom: '4%', containLabel: true },
        xAxis: {
          type: 'category',
          data: rows.map((r: any) => r.week_label),
          axisLabel: { fontSize: 9, interval: 0, rotate: 20 }
        },
        yAxis: [
          { type: 'value', name: '订单数', position: 'left', nameTextStyle: { fontSize: 10, color: '#8c8c8c' }, minInterval: 1 },
          { type: 'value', name: '数量', position: 'right', nameTextStyle: { fontSize: 10, color: '#8c8c8c' }, splitLine: { show: false } }
        ],
        series: [
          {
            name: '涉及订单数',
            type: 'bar',
            data: rows.map((r: any) => r.order_count),
            itemStyle: { color: '#faad14', borderRadius: [3, 3, 0, 0] },
            barMaxWidth: 24,
            label: { show: true, position: 'top', fontSize: 10, color: '#faad14', formatter: (p: any) => p.value > 0 ? p.value : '' }
          },
          {
            name: '发货数量',
            type: 'line',
            yAxisIndex: 1,
            data: rows.map((r: any) => r.quantity),
            smooth: true,
            symbol: 'circle',
            symbolSize: 6,
            itemStyle: { color: '#ff4d4f' },
            lineStyle: { width: 2 },
            areaStyle: { color: 'rgba(255,77,79,0.08)' },
            label: { show: true, position: 'top', fontSize: 10, color: '#ff4d4f', formatter: (p: any) => p.value > 0 ? p.value : '' }
          }
        ]
      }
    }
  } catch (error) {
    console.error('Failed to fetch dashboard data:', error)
  } finally {
    loading.value = false
  }
}

onMounted(() => { fetchData() })
</script>

<template>
  <div class="dashboard-container">
    <div class="dashboard-header">
      <h2 class="dashboard-title">销售订单仪表板</h2>
    </div>
    <a-tabs v-model:activeKey="activeTab" type="card">
      <a-tab-pane key="overview" tab="仪表板概览">
        <a-spin :spinning="loading">
          <!-- 统计卡片：6个合并为一行 -->
          <a-row :gutter="[12, 12]" class="section-row">
            <a-col :xs="12" :sm="8" :md="4">
              <a-card hoverable :bodyStyle="{ padding: '8px 12px' }" class="stat-card">
                <a-statistic title="订单总数" :value="stats.total || 0" :value-style="{ color: '#1677ff', fontSize: '20px' }">
                  <template #prefix><ShoppingOutlined /></template>
                  <template #suffix><span class="stat-suffix">单</span></template>
                </a-statistic>
              </a-card>
            </a-col>
            <a-col :xs="12" :sm="8" :md="4">
              <a-card hoverable :bodyStyle="{ padding: '8px 12px' }" class="stat-card">
                <a-statistic title="草稿" :value="stats.draft || 0" :value-style="{ color: '#8c8c8c', fontSize: '20px' }">
                  <template #prefix><FileTextOutlined /></template>
                  <template #suffix><span class="stat-suffix">单</span></template>
                </a-statistic>
              </a-card>
            </a-col>
            <a-col :xs="12" :sm="8" :md="4">
              <a-card hoverable :bodyStyle="{ padding: '8px 12px' }" class="stat-card">
                <a-statistic title="待审批" :value="stats.pending || 0" :value-style="{ color: '#faad14', fontSize: '20px' }">
                  <template #prefix><ClockCircleOutlined /></template>
                  <template #suffix><span class="stat-suffix">单</span></template>
                </a-statistic>
              </a-card>
            </a-col>
            <a-col :xs="12" :sm="8" :md="4">
              <a-card hoverable :bodyStyle="{ padding: '8px 12px' }" class="stat-card">
                <a-statistic title="已审批" :value="stats.approved || 0" :value-style="{ color: '#52c41a', fontSize: '20px' }">
                  <template #prefix><CheckCircleOutlined /></template>
                  <template #suffix><span class="stat-suffix">单</span></template>
                </a-statistic>
              </a-card>
            </a-col>
            <a-col :xs="12" :sm="8" :md="4">
              <a-card hoverable :bodyStyle="{ padding: '8px 12px' }" class="stat-card">
                <a-statistic title="订单总金额" :value="stats.totalAmount || 0" :precision="2" :value-style="{ color: '#1677ff', fontSize: '20px' }" prefix="¥">
                  <template #suffix><span class="stat-suffix"><DollarOutlined /></span></template>
                </a-statistic>
              </a-card>
            </a-col>
            <a-col :xs="12" :sm="8" :md="4">
              <a-card hoverable :bodyStyle="{ padding: '8px 12px' }" class="stat-card">
                <a-statistic title="已审批金额" :value="stats.approvedAmount || 0" :precision="2" :value-style="{ color: '#52c41a', fontSize: '20px' }" prefix="¥">
                  <template #suffix><span class="stat-suffix"><RiseOutlined /></span></template>
                </a-statistic>
              </a-card>
            </a-col>
          </a-row>

          <!-- 图表第一行: 审批状态分布 + 客户订单金额 TOP10 -->
          <a-row :gutter="12" class="section-row">
            <a-col :xs="24" :md="10">
              <a-card :headStyle="{ fontWeight: 600, padding: '0 16px', minHeight: '36px', fontSize: '13px' }" :bodyStyle="{ padding: '6px' }" title="审批状态分布">
                <VChart :option="statusChartOption" style="height: 220px;" autoresize />
              </a-card>
            </a-col>
            <a-col :xs="24" :md="14">
              <a-card :headStyle="{ fontWeight: 600, padding: '0 16px', minHeight: '36px', fontSize: '13px' }" :bodyStyle="{ padding: '6px' }" title="客户订单金额 TOP10">
                <VChart :option="customerChartOption" style="height: 220px;" autoresize />
              </a-card>
            </a-col>
          </a-row>

          <!-- 图表第二行: 月度订单趋势 + 未来发货趋势 -->
          <a-row :gutter="12" class="section-row">
            <a-col :xs="24" :md="14">
              <a-card :headStyle="{ fontWeight: 600, padding: '0 16px', minHeight: '36px', fontSize: '13px' }" :bodyStyle="{ padding: '6px' }" title="月度订单趋势 (近12个月)">
                <VChart :option="trendChartOption" style="height: 220px;" autoresize />
              </a-card>
            </a-col>
            <a-col :xs="24" :md="10">
              <a-card :headStyle="{ fontWeight: 600, padding: '0 16px', minHeight: '36px', fontSize: '13px' }" :bodyStyle="{ padding: '6px' }" title="未来发货趋势 (未来8周)">
                <VChart :option="deliveryChartOption" style="height: 220px;" autoresize />
              </a-card>
            </a-col>
          </a-row>
        </a-spin>
      </a-tab-pane>

      <a-tab-pane key="detail" tab="订单明细">
        <a-spin :spinning="loading">
          <a-card :headStyle="{ fontWeight: 600, padding: '0 16px', minHeight: '36px', fontSize: '13px' }" :bodyStyle="{ padding: '0' }" title="最近销售订单">
            <a-table
              :columns="recentColumns"
              :data-source="recentOrders"
              row-key="sales_order_number"
              :pagination="{ pageSize: 10, showSizeChanger: true, showTotal: (total: number) => `共 ${total} 条` }"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'order_date'">{{ formatDate(record.order_date) }}</template>
                <template v-else-if="column.key === 'approval_status'">
                  <a-tag :color="approvalColorMap[record.approval_status] || 'default'" style="margin: 0;">{{ record.approval_status }}</a-tag>
                </template>
                <template v-else-if="column.key === 'total_amount'">
                  <span style="color: #1677ff; font-weight: 600;">¥{{ formatMoney(parseFloat(record.total_amount) || 0) }}</span>
                </template>
              </template>
            </a-table>
          </a-card>
        </a-spin>
      </a-tab-pane>
    </a-tabs>
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
  margin-bottom: 8px;
}
.dashboard-title {
  font-size: 16px;
  font-weight: 600;
  color: #1d2129;
  margin: 0;
  padding-left: 2px;
}
.section-row {
  margin-bottom: 8px;
}
.stat-card {
  height: 100%;
}
.stat-suffix {
  font-size: 12px;
  color: #8c8c8c;
}
</style>
