<template>
  <div style="padding: 0 0 20px 0;">
    <a-page-header title="销售员订单发货报表" style="padding: 0; margin: 0 0 8px 0;" />

    <!-- 搜索栏 -->
    <a-card :bordered="false" size="small" style="margin-bottom: 8px;">
      <a-row :gutter="12" align="middle">
        <a-col :span="4">
          <a-select v-model:value="filterSalesPerson" placeholder="销售负责人" allow-clear show-search size="small" style="width: 100%;"
            :filter-option="(input: string, option: any) => option.key?.toLowerCase().includes(input.toLowerCase())">
            <a-select-option v-for="sp in salesPersonOptions" :key="sp" :value="sp">{{ sp }}</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="5">
          <a-range-picker v-model:value="dateRange" size="small" style="width: 100%;" :placeholder="['开始日期', '结束日期']" format="YYYY-MM-DD" value-format="YYYY-MM-DD" />
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="filterOrderStatus" placeholder="订单状态" allow-clear size="small" style="width: 100%;">
            <a-select-option value="生产中">生产中</a-select-option>
            <a-select-option value="已完成">已完成</a-select-option>
            <a-select-option value="已取消">已取消</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="3">
          <a-select v-model:value="filterShippingStatus" placeholder="发货状态" allow-clear size="small" style="width: 100%;">
            <a-select-option value="未申请">未申请</a-select-option>
            <a-select-option value="未发货">未发货</a-select-option>
            <a-select-option value="部分发货">部分发货</a-select-option>
            <a-select-option value="全部发货">全部发货</a-select-option>
            <a-select-option value="超额发货">超额发货</a-select-option>
          </a-select>
        </a-col>
        <a-col>
          <a-button type="primary" size="small" @click="handleSearch"><SearchOutlined /> 查询</a-button>
        </a-col>
        <a-col>
          <a-button size="small" @click="handleReset">重置</a-button>
        </a-col>
        <a-col>
          <a-button type="primary" :loading="exportLoading" size="small" @click="handleExport">
            <DownloadOutlined /> 导出
          </a-button>
        </a-col>
      </a-row>
    </a-card>

    <!-- 主表：销售负责人维度汇总 -->
    <a-table
      :columns="summaryColumns"
      :data-source="summaryData"
      :loading="loading"
      :pagination="pagination"
      size="small"
      bordered
      row-key="head_of_sales"
      :scroll="{ x: 'max-content' }"
      :expandedRowKeys="expandedKeys"
      @change="handleTableChange"
      @expand="handleExpand"
      @resizeColumn="handleSummaryResize"
    >
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'rowIndex'">
          {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
        </template>
        <template v-if="column.key === 'total_amount'">
          <span style="color: #cf1322; font-weight: 600;">¥{{ record.total_amount?.toFixed(2) }}</span>
        </template>
        <template v-if="column.key === 'ship_rate'">
          <a-progress :percent="record.ship_rate" :size="'small'" :stroke-color="record.ship_rate >= 100 ? '#52c41a' : record.ship_rate >= 50 ? '#1890ff' : '#ff4d4f'" style="width: 100px;" />
        </template>
        <template v-if="column.key === 'fully_shipped_count'">
          <a-tag color="success">{{ record.fully_shipped_count }}</a-tag>
        </template>
        <template v-if="column.key === 'partial_shipped_count'">
          <a-tag color="warning">{{ record.partial_shipped_count }}</a-tag>
        </template>
        <template v-if="column.key === 'unshipped_count'">
          <a-tag color="error">{{ record.unshipped_count }}</a-tag>
        </template>
      </template>
      <!-- 展开行：订单明细 -->
      <template #expandedRowRender="{ record }">
        <a-table
          v-if="detailMap[record.head_of_sales]"
          :columns="detailColumns"
          :data-source="detailMap[record.head_of_sales]"
          :pagination="false"
          size="small"
          bordered
          row-key="id"
          :scroll="{ x: 'max-content' }"
          @resizeColumn="handleDetailResize"
        >
          <template #bodyCell="{ column, record: d }">
            <template v-if="column.key === 'sales_order_number'">
              <a style="color: #1890ff;">{{ d.sales_order_number }}</a>
            </template>
            <template v-if="column.key === 'shipping_status'">
              <a-tag :color="shippingStatusColor(d.shipping_status)">{{ d.shipping_status }}</a-tag>
            </template>
            <template v-if="column.key === 'order_status'">
              <a-tag :color="d.order_status === '已完成' ? 'green' : d.order_status === '已取消' ? 'red' : 'blue'">{{ d.order_status }}</a-tag>
            </template>
            <template v-if="column.key === 'unshipped_quantity'">
              <span :style="{ color: d.unshipped_quantity > 0 ? '#ff4d4f' : '#52c41a', fontWeight: 500 }">
                {{ d.unshipped_quantity }}
              </span>
            </template>
          </template>
        </a-table>
        <a-spin v-else />
      </template>
    </a-table>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, DownloadOutlined } from '@ant-design/icons-vue'
import { getSalesPersonShippingReport, getSalesPersons, exportSalesPersonShippingReport } from '@/api/sales/salesPersonShippingReport'
import { useColumnPreference } from '@/composables/useColumnPreference'

// === State ===
const loading = ref(false)
const exportLoading = ref(false)
const filterSalesPerson = ref<string | undefined>(undefined)
const dateRange = ref<[string, string] | null>(null)
const filterOrderStatus = ref<string | undefined>(undefined)
const filterShippingStatus = ref<string | undefined>(undefined)
const salesPersonOptions = ref<string[]>([])
const summaryData = ref<any[]>([])
const detailMap = ref<Record<string, any[]>>({})
const expandedKeys = ref<string[]>([])

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`
})

// === 汇总列定义 ===
const defaultSummaryColumns = [
  { title: '销售负责人', dataIndex: 'head_of_sales', key: 'head_of_sales', width: 120, resizable: true, fixed: 'left' as const },
  { title: '订单数', dataIndex: 'order_count', key: 'order_count', width: 80, resizable: true },
  { title: '明细行数', dataIndex: 'detail_count', key: 'detail_count', width: 80, resizable: true },
  { title: '订单金额', dataIndex: 'total_amount', key: 'total_amount', width: 130, resizable: true },
  { title: '订单数量', dataIndex: 'order_qty', key: 'order_qty', width: 100, resizable: true },
  { title: '已发数量', dataIndex: 'shipped_qty', key: 'shipped_qty', width: 100, resizable: true },
  { title: '未发数量', dataIndex: 'unshipped_qty', key: 'unshipped_qty', width: 100, resizable: true },
  { title: '发货率', dataIndex: 'ship_rate', key: 'ship_rate', width: 150, resizable: true },
  { title: '全部发货', dataIndex: 'fully_shipped_count', key: 'fully_shipped_count', width: 90, resizable: true },
  { title: '部分发货', dataIndex: 'partial_shipped_count', key: 'partial_shipped_count', width: 90, resizable: true },
  { title: '未发货', dataIndex: 'unshipped_count', key: 'unshipped_count', width: 80, resizable: true },
]

const {
  columns: summaryColumns, loadColumnPreference: loadSummaryPref, handleResizeColumn: handleSummaryResize
} = useColumnPreference('sales_person_shipping_summary', defaultSummaryColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
})

// === 明细列定义 ===
const defaultDetailColumns = [
  { title: '订单编号', dataIndex: 'sales_order_number', key: 'sales_order_number', width: 160, resizable: true },
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 160, resizable: true },
  { title: '订单日期', dataIndex: 'order_date', key: 'order_date', width: 100, resizable: true },
  { title: '订单状态', dataIndex: 'order_status', key: 'order_status', width: 80, resizable: true },
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60, resizable: true },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 120, resizable: true },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 160, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, resizable: true },
  { title: '订单数量', dataIndex: 'order_quantity', key: 'order_quantity', width: 90, resizable: true },
  { title: '已发数量', dataIndex: 'shipped_quantity', key: 'shipped_quantity', width: 90, resizable: true },
  { title: '未发数量', dataIndex: 'unshipped_quantity', key: 'unshipped_quantity', width: 90, resizable: true },
  { title: '发货状态', dataIndex: 'shipping_status', key: 'shipping_status', width: 90, resizable: true },
  { title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 90, resizable: true },
  { title: '金额', dataIndex: 'total_amount', key: 'total_amount', width: 100, resizable: true },
  { title: '交货日期', dataIndex: 'delivery_date', key: 'delivery_date', width: 100, resizable: true },
]

const {
  columns: detailColumns, loadColumnPreference: loadDetailPref, handleResizeColumn: handleDetailResize
} = useColumnPreference('sales_person_shipping_detail', defaultDetailColumns, {
  fixedLeft: [],
  fixedRight: [],
})

// === 方法 ===
const shippingStatusColor = (status: string) => {
  const map: Record<string, string> = {
    '全部发货': 'success', '部分发货': 'warning', '超额发货': 'purple',
    '未发货': 'error', '未申请': 'default'
  }
  return map[status] || 'default'
}

const fetchData = async () => {
  loading.value = true
  try {
    const params: any = {
      page: pagination.current,
      limit: pagination.pageSize,
    }
    if (filterSalesPerson.value) params.head_of_sales = filterSalesPerson.value
    if (dateRange.value && dateRange.value[0]) params.start_date = dateRange.value[0]
    if (dateRange.value && dateRange.value[1]) params.end_date = dateRange.value[1]
    if (filterOrderStatus.value) params.order_status = filterOrderStatus.value
    if (filterShippingStatus.value) params.shipping_status = filterShippingStatus.value

    const res = await getSalesPersonShippingReport(params)
    const d = res.data
    summaryData.value = d.items || []
    detailMap.value = d.details || {}
    pagination.total = d.pagination?.total || 0
  } catch (e: any) {
    message.error(e.message || '获取数据失败')
  } finally {
    loading.value = false
  }
}

const fetchSalesPersons = async () => {
  try {
    const res = await getSalesPersons()
    if (res.data) salesPersonOptions.value = res.data
  } catch { /* 静默 */ }
}

const handleSearch = () => {
  pagination.current = 1
  fetchData()
}

const handleReset = () => {
  filterSalesPerson.value = undefined
  dateRange.value = null
  filterOrderStatus.value = undefined
  filterShippingStatus.value = undefined
  pagination.current = 1
  fetchData()
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleExpand = (expanded: boolean, record: any) => {
  if (expanded) {
    expandedKeys.value = [...expandedKeys.value, record.head_of_sales]
  } else {
    expandedKeys.value = expandedKeys.value.filter((k: string) => k !== record.head_of_sales)
  }
}

const handleExport = async () => {
  exportLoading.value = true
  try {
    const params: any = {}
    if (filterSalesPerson.value) params.head_of_sales = filterSalesPerson.value
    if (dateRange.value && dateRange.value[0]) params.start_date = dateRange.value[0]
    if (dateRange.value && dateRange.value[1]) params.end_date = dateRange.value[1]
    if (filterOrderStatus.value) params.order_status = filterOrderStatus.value
    if (filterShippingStatus.value) params.shipping_status = filterShippingStatus.value

    const res = await exportSalesPersonShippingReport(params)
    const blob = new Blob([res.data as any], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '销售员订单发货报表.xlsx'
    a.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch (e: any) {
    message.error(e.message || '导出失败')
  } finally {
    exportLoading.value = false
  }
}

onMounted(() => {
  loadSummaryPref()
  loadDetailPref()
  fetchSalesPersons()
  fetchData()
})
</script>
