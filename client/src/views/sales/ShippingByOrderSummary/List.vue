<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import request from '@/utils/request'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import {
  ContainerOutlined,
  SearchOutlined,
  ReloadOutlined,
  SettingOutlined,
  CalendarOutlined,
  DownloadOutlined
} from '@ant-design/icons-vue'

const dateRange = ref<[Dayjs, Dayjs]>([dayjs().subtract(3, 'month'), dayjs()])

const fetchDataFn = async (params: any) => {
  const res: any = await request.get('/sales-report/shipping-by-order-summary', {
    params: {
      ...params,
      start_date: dateRange.value[0].format('YYYY-MM-DD'),
      end_date: dateRange.value[1].format('YYYY-MM-DD')
    }
  })
  return res
}

const {
  loading, dataSource, searchText, pagination,
  fetchData, handleTableChange, handleSearch, handleReset
} = useTableList(fetchDataFn)

const defaultColumns: any[] = [
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 140, resizable: true },
  { title: '订单日期', dataIndex: 'order_date', key: 'order_date', width: 110, resizable: true },
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 70, resizable: true, align: 'center' },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 150, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 110, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, resizable: true },
  { title: '订单数量', dataIndex: 'order_quantity', key: 'order_quantity', width: 100, resizable: true, align: 'right' },
  { title: '已发数量', dataIndex: 'shipped_qty', key: 'shipped_qty', width: 100, resizable: true, align: 'right' },
  { title: '已退数量', dataIndex: 'returned_qty', key: 'returned_qty', width: 100, resizable: true, align: 'right' },
  { title: '实发数量', dataIndex: 'net_shipped_qty', key: 'net_shipped_qty', width: 100, resizable: true, align: 'right' },
  { title: '发货率', dataIndex: 'ship_rate', key: 'ship_rate', width: 90, resizable: true, align: 'center' },
  { title: '退货率', dataIndex: 'return_rate', key: 'return_rate', width: 90, resizable: true, align: 'center' }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('shipping_by_order_summary', defaultColumns, {
  fixedLeft: [{ key: 'sales_order_number', title: '销售订单号', dataIndex: 'sales_order_number', width: 160, resizable: true, fixed: 'left' }],
  fixedRight: []
})

const formatDate = (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-'

const getShipRateColor = (rate: number) => {
  if (rate >= 100) return 'success'
  if (rate >= 80) return 'processing'
  if (rate >= 50) return 'warning'
  return 'default'
}

const getReturnRateColor = (rate: number) => {
  if (rate === 0) return 'default'
  if (rate < 3) return 'success'
  if (rate <= 10) return 'warning'
  return 'error'
}

const handleDateChange = () => {
  pagination.current = 1
  fetchData()
}

// 导出 Excel
const exporting = ref(false)
const handleExport = async () => {
  exporting.value = true
  try {
    const params = new URLSearchParams({
      start_date: dateRange.value[0].format('YYYY-MM-DD'),
      end_date: dateRange.value[1].format('YYYY-MM-DD')
    })
    if (searchText.value) params.set('search', searchText.value)
    const token = localStorage.getItem('token')
    const url = `/api/v1/sales-report/shipping-by-order-summary/export?${params.toString()}`
    const a = document.createElement('a')
    a.href = url
    a.download = ''
    // 用 fetch + blob 方式下载，携带 token
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (!resp.ok) throw new Error('导出失败')
    const blob = await resp.blob()
    const blobUrl = URL.createObjectURL(blob)
    a.href = blobUrl
    const disposition = resp.headers.get('content-disposition')
    const match = disposition?.match(/filename\*?=(?:UTF-8'')?([^;]+)/i)
    if (match && match[1]) a.download = decodeURIComponent(match[1])
    else a.download = '发货按订单汇总表.xlsx'
    a.click()
    URL.revokeObjectURL(blobUrl)
  } catch (e: any) {
    console.error('导出失败', e)
  } finally {
    exporting.value = false
  }
}

onMounted(async () => {
  await loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div class="page-container">
    <div class="page-header">
      <h2 class="page-title">
        <ContainerOutlined style="color: #1677ff; margin-right: 8px" />
        发货按订单汇总表
      </h2>
    </div>

    <a-card :bodyStyle="{ padding: '0' }">
      <template #title>
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px">
          <span style="font-weight: 600">汇总明细</span>
          <div style="display: flex; gap: 8px; align-items: center">
            <a-range-picker
              v-model:value="dateRange"
              :allow-clear="false"
              format="YYYY-MM-DD"
              style="width: 220px"
              size="small"
              @change="handleDateChange"
            >
              <template #suffixIcon><CalendarOutlined /></template>
            </a-range-picker>
            <a-input
              v-model:value="searchText"
              placeholder="搜索订单号/客户/物料"
              style="width: 200px"
              size="small"
              allow-clear
              @pressEnter="handleSearch"
            >
              <template #prefix><SearchOutlined /></template>
            </a-input>
            <a-button type="primary" size="small" @click="handleSearch"><SearchOutlined /> 搜索</a-button>
            <a-button size="small" @click="handleReset"><ReloadOutlined /> 重置</a-button>
            <a-button size="small" :loading="exporting" @click="handleExport"><DownloadOutlined /> 导出</a-button>
            <a-tooltip title="列设置"><a-button size="small" @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
          </div>
        </div>
      </template>
      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        row-key="_row_num"
        :scroll="{ x: 1600 }"
        size="small"
        bordered
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'order_date'">
            {{ formatDate(record.order_date) }}
          </template>
          <template v-else-if="column.key === 'order_quantity'">
            <span style="font-weight: 600">{{ record.order_quantity }}</span>
          </template>
          <template v-else-if="column.key === 'shipped_qty'">
            <span style="color: #52c41a; font-weight: 600">{{ record.shipped_qty }}</span>
          </template>
          <template v-else-if="column.key === 'returned_qty'">
            <span :style="{ color: record.returned_qty > 0 ? '#ff4d4f' : '#8c8c8c', fontWeight: record.returned_qty > 0 ? '600' : '400' }">{{ record.returned_qty }}</span>
          </template>
          <template v-else-if="column.key === 'net_shipped_qty'">
            <span style="color: #1677ff; font-weight: 600">{{ record.net_shipped_qty }}</span>
          </template>
          <template v-else-if="column.key === 'ship_rate'">
            <a-tag :color="getShipRateColor(Number(record.ship_rate))">{{ record.ship_rate }}%</a-tag>
          </template>
          <template v-else-if="column.key === 'return_rate'">
            <a-tag :color="getReturnRateColor(Number(record.return_rate))">{{ record.return_rate }}%</a-tag>
          </template>
        </template>
      </a-table>
    </a-card>

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
.page-container {
  background: #f7f8fa;
}
.page-header {
  margin-bottom: 12px;
}
.page-title {
  font-size: 18px;
  font-weight: 600;
  color: #1d2129;
  margin: 0;
}
</style>
