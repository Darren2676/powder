<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined } from '@ant-design/icons-vue'
import { getCompletedStockCounts, getMonthlyReport } from '@/api/warehouse/finishedGoods'
import dayjs from 'dayjs'

const loading = ref(false)
const stockCountOptions = ref<any[]>([])
const selectedCountNumber = ref('')
const reportData = ref<any>(null)
const dataSource = ref<any[]>([])

const fetchStockCounts = async () => {
  try {
    const res: any = await getCompletedStockCounts()
    stockCountOptions.value = res?.data || []
  } catch (e) {}
}

const onCountChange = (val: string) => {
  selectedCountNumber.value = val
  if (val) fetchReport()
}

const fetchReport = async () => {
  if (!selectedCountNumber.value) return
  loading.value = true
  try {
    const res: any = await getMonthlyReport({ count_number: selectedCountNumber.value })
    if (res?.success) {
      reportData.value = res.data
      dataSource.value = res.data?.items || []
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '获取报表失败')
  } finally { loading.value = false }
}

const fmt = (val: any) => {
  const n = Number(val) || 0
  return n === 0 ? '-' : n.toFixed(2)
}

const fmtBold = (val: any) => {
  const n = Number(val) || 0
  return n.toFixed(2)
}

const columns = [
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 140, fixed: 'left' as const },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 160, ellipsis: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, ellipsis: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, align: 'center' as const },
  { title: '质量状态', dataIndex: 'quality_status', key: 'quality_status', width: 80, align: 'center' as const },
  { title: '期初数量', dataIndex: 'opening_qty', key: 'opening_qty', width: 100, align: 'right' as const },
  {
    title: '入库',
    children: [
      { title: '生产入库', dataIndex: 'in_production', key: 'in_production', width: 90, align: 'right' as const },
      { title: '退货入库', dataIndex: 'in_return', key: 'in_return', width: 90, align: 'right' as const },
      { title: '盘盈', dataIndex: 'in_surplus', key: 'in_surplus', width: 80, align: 'right' as const },
      { title: '其他入库', dataIndex: 'in_other', key: 'in_other', width: 90, align: 'right' as const },
      { title: '入库合计', dataIndex: 'in_total', key: 'in_total', width: 100, align: 'right' as const }
    ]
  },
  {
    title: '出库',
    children: [
      { title: '发货出库', dataIndex: 'out_shipping', key: 'out_shipping', width: 90, align: 'right' as const },
      { title: '盘亏', dataIndex: 'out_shortage', key: 'out_shortage', width: 80, align: 'right' as const },
      { title: '其他出库', dataIndex: 'out_other', key: 'out_other', width: 90, align: 'right' as const },
      { title: '出库合计', dataIndex: 'out_total', key: 'out_total', width: 100, align: 'right' as const }
    ]
  },
  { title: '期末数量', dataIndex: 'closing_qty', key: 'closing_qty', width: 100, align: 'right' as const, fixed: 'right' as const }
]

const inKeys = ['in_production', 'in_return', 'in_surplus', 'in_other', 'in_total']
const outKeys = ['out_shipping', 'out_shortage', 'out_other', 'out_total']
const boldKeys = ['in_total', 'out_total', 'closing_qty', 'opening_qty']

onMounted(() => { fetchStockCounts() })
</script>

<template>
  <div style="padding: 20px">
    <!-- 顶部筛选 -->
    <div style="margin-bottom: 16px; display: flex; gap: 12px; align-items: center; flex-wrap: wrap">
      <span style="font-weight: 500">基础盘点单:</span>
      <a-select
        v-model:value="selectedCountNumber"
        placeholder="选择已完成的盘点单"
        style="width: 380px"
        show-search
        allow-clear
        :filter-option="(input: string, option: any) => {
          const item = stockCountOptions.find((s: any) => s.count_number === option.value)
          return item ? (item.count_number + item.warehouse_name + item.count_period).toLowerCase().includes(input.toLowerCase()) : false
        }"
        @change="onCountChange"
      >
        <a-select-option v-for="s in stockCountOptions" :key="s.count_number" :value="s.count_number">
          {{ s.count_number }} | {{ s.count_period }} | {{ s.warehouse_name }}
        </a-select-option>
      </a-select>
      <template v-if="reportData">
        <a-tag color="blue">报表月份: {{ reportData.report_month }}</a-tag>
        <a-tag color="green">仓库: {{ reportData.warehouse_name }}</a-tag>
        <a-tag>期初盘点: {{ reportData.count_period }}</a-tag>
      </template>
    </div>

    <!-- 报表表格 -->
    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="false"
      :row-key="(record: any) => record.item_number + '|' + record.quality_status"
      :scroll="{ x: 1800 }"
      size="small"
      bordered
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'quality_status'">
          <a-tag :color="record.quality_status === '合格品' ? 'green' : 'red'" size="small">
            {{ record.quality_status }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'opening_qty'">
          <span style="font-weight: 600">{{ fmtBold(record.opening_qty) }}</span>
        </template>
        <template v-else-if="inKeys.includes(column.key)">
          <span :style="{ color: Number(record[column.key]) > 0 ? '#52c41a' : '', fontWeight: column.key === 'in_total' ? '600' : 'normal' }">
            {{ column.key === 'in_total' ? fmtBold(record[column.key]) : fmt(record[column.key]) }}
          </span>
        </template>
        <template v-else-if="outKeys.includes(column.key)">
          <span :style="{ color: Number(record[column.key]) > 0 ? '#f5222d' : '', fontWeight: column.key === 'out_total' ? '600' : 'normal' }">
            {{ column.key === 'out_total' ? fmtBold(record[column.key]) : fmt(record[column.key]) }}
          </span>
        </template>
        <template v-else-if="column.key === 'closing_qty'">
          <span style="font-weight: 700">{{ fmtBold(record.closing_qty) }}</span>
        </template>
      </template>

      <!-- 合计行 -->
      <template #summary v-if="reportData?.totals">
        <a-table-summary fixed>
          <a-table-summary-row>
            <a-table-summary-cell :index="0" :col-span="5">
              <span style="font-weight: 700">合计</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="5" align="right">
              <span style="font-weight: 700">{{ fmtBold(reportData.totals.opening_qty) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="6" align="right">
              <span style="color: #52c41a">{{ fmt(reportData.totals.in_production) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="7" align="right">
              <span style="color: #52c41a">{{ fmt(reportData.totals.in_return) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="8" align="right">
              <span style="color: #52c41a">{{ fmt(reportData.totals.in_surplus) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="9" align="right">
              <span style="color: #52c41a">{{ fmt(reportData.totals.in_other) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="10" align="right">
              <span style="color: #52c41a; font-weight: 700">{{ fmtBold(reportData.totals.in_total) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="11" align="right">
              <span style="color: #f5222d">{{ fmt(reportData.totals.out_shipping) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="12" align="right">
              <span style="color: #f5222d">{{ fmt(reportData.totals.out_shortage) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="13" align="right">
              <span style="color: #f5222d">{{ fmt(reportData.totals.out_other) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="14" align="right">
              <span style="color: #f5222d; font-weight: 700">{{ fmtBold(reportData.totals.out_total) }}</span>
            </a-table-summary-cell>
            <a-table-summary-cell :index="15" align="right">
              <span style="font-weight: 700">{{ fmtBold(reportData.totals.closing_qty) }}</span>
            </a-table-summary-cell>
          </a-table-summary-row>
        </a-table-summary>
      </template>
    </a-table>

    <a-empty v-if="!selectedCountNumber && !loading" description="请选择一个已完成的盘点单以生成报表" style="margin-top: 60px" />
  </div>
</template>
