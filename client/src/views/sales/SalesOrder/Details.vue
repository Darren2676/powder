<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined, SettingOutlined, DownloadOutlined } from '@ant-design/icons-vue'
import { getSalesOrderDetailsPage, exportSalesOrderDetailsSelected } from '@/api/sales/salesOrder'
import { getInvoicesBySalesDetail } from '@/api/sales/salesInvoice'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { generateExportFilename } from '@/utils/exportFilename'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'

const router = useRouter()
const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterStatus = ref<string[]>([])
const filterApprovalStatus = ref<string[]>([])
const selectedRowKeys = ref<number[]>([])
const exportLoading = ref(false)

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  preserveSelectedRowKeys: true,
  onChange: (keys: number[]) => { selectedRowKeys.value = keys }
}))

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const defaultDataColumns: any[] = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60 },
  { title: '客户编号', dataIndex: 'customer_number', key: 'customer_number', width: 110, resizable: true },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 150, resizable: true },
  { title: '销售负责人', dataIndex: 'head_of_sales', key: 'head_of_sales', width: 100, resizable: true },
  { title: '联系人', dataIndex: 'linkman', key: 'linkman', width: 90, resizable: true },
  { title: '联系方式', dataIndex: 'contacts', key: 'contacts', width: 120, resizable: true },
  { title: '订单日期', dataIndex: 'order_date', key: 'order_date', width: 110, resizable: true },
  { title: '订单交货日期', dataIndex: 'order_delivery_date', key: 'order_delivery_date', width: 120, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 150, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60, resizable: true },
  { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number', width: 110, resizable: true },
  { title: '订单数量', dataIndex: 'order_quantity', key: 'order_quantity', width: 90, resizable: true },
  { title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 80, resizable: true },
  { title: '金额', dataIndex: 'total_amount', key: 'total_amount', width: 100, resizable: true },
  { title: '交货日期', dataIndex: 'delivery_date', key: 'delivery_date', width: 110, resizable: true },
  { title: '承诺交货日期', dataIndex: 'promised_delivery_date', key: 'promised_delivery_date', width: 115, resizable: true },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90, resizable: true },
  { title: '发货状态', dataIndex: 'shipping_status', key: 'shipping_status', width: 90, resizable: true },
  { title: '生产状态', dataIndex: 'production_status', key: 'production_status', width: 100, resizable: true },
  { title: '退货状态', dataIndex: 'return_status', key: 'return_status', width: 90, resizable: true },
  { title: '已发数量', dataIndex: 'shipped_quantity', key: 'shipped_quantity', width: 90, resizable: true },
  { title: '已退数量', dataIndex: 'refunded_quantity', key: 'refunded_quantity', width: 90, resizable: true },
  { title: '订单审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 110, resizable: true },
  { title: '订单状态', dataIndex: 'order_status', key: 'order_status', width: 90, resizable: true },
  { title: '启用状态', dataIndex: 'condition', key: 'condition', width: 80, resizable: true },
  { title: '客户采购订单号', dataIndex: 'customer_po_number', key: 'customer_po_number', width: 140, resizable: true },
  { title: '客户物料号', dataIndex: 'customer_item_number', key: 'customer_item_number', width: 120, resizable: true },
  { title: '客户物料描述', dataIndex: 'customer_item_description', key: 'customer_item_description', width: 140, resizable: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 90, resizable: true },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 120, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, ellipsis: true, resizable: true },
  { title: '开票状态', dataIndex: 'invoice_status', key: 'invoice_status', width: 100, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('sales_order_details', defaultDataColumns, {
  fixedLeft: [{ title: '销售订单号', dataIndex: 'sales_order_number', key: 'sales_order_number', width: 150, fixed: 'left' as const, resizable: true }],
  fixedRight: []
})

const statusColors: Record<string, string> = {
  '未开始': 'default',
  '进行中': 'blue',
  '已完成': 'green'
}

const shippingStatusColors: Record<string, string> = {
  '未申请': 'default',
  '未发货': 'orange',
  '部分发货': 'blue',
  '全部发货': 'green'
}

const approvalStatusColors: Record<string, string> = {
  '草稿': 'default',
  '待审批': 'orange',
  '已审批': 'green',
  '已反审': 'red'
}

const goToSalesOrder = (salesOrderNumber: string) => {
  router.push({ name: 'SalesOrderList', query: { open: salesOrderNumber } })
}

const formatDate = (date: any) => date ? dayjs(date).format('YYYY-MM-DD') : '-'

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getSalesOrderDetailsPage({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value,
      status: filterStatus.value.length ? filterStatus.value.join(',') : '',
      approval_status: filterApprovalStatus.value.length ? filterApprovalStatus.value.join(',') : ''
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取销售订单明细失败')
  } finally {
    loading.value = false
  }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleSearch = () => {
  pagination.current = 1
  fetchData()
}

const handleExportSelected = async () => {
  if (!selectedRowKeys.value.length) {
    message.warning('请先勾选要导出的行')
    return
  }
  exportLoading.value = true
  try {
    const res = await exportSalesOrderDetailsSelected({ ids: selectedRowKeys.value })
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = generateExportFilename('sales_order_details_selected')
    link.click()
    window.URL.revokeObjectURL(url)
    message.success('导出成功')
  } catch {
    message.error('导出选中行失败')
  } finally {
    exportLoading.value = false
  }
}

onMounted(async () => {
  await loadColumnPreference()
  fetchData()
})

// ==================== 开票状态双向查询 ====================
const invoiceStatusColors: Record<string, string> = {
  '未开票': 'default',
  '部分开票': 'orange',
  '已开票': 'green'
}
const relatedInvoicesVisible = ref(false)
const relatedInvoicesLoading = ref(false)
const relatedInvoices = ref<any[]>([])

const handleViewRelatedInvoices = async (detailId: number) => {
  relatedInvoicesVisible.value = true
  relatedInvoicesLoading.value = true
  try {
    const res: any = await getInvoicesBySalesDetail(detailId)
    if (res?.success) relatedInvoices.value = res.data || []
  } catch { message.error('获取关联发票失败') }
  finally { relatedInvoicesLoading.value = false }
}

const relatedInvoiceColumns = [
  { title: '发票编号', dataIndex: 'invoice_number', width: 170 },
  { title: '发货单号', dataIndex: 'shipping_order_number', width: 150 },
  { title: '发票代码', dataIndex: 'invoice_code', width: 120 },
  { title: '发票号码', dataIndex: 'invoice_no', width: 120 },
  { title: '开票日期', dataIndex: 'invoice_date', width: 110 },
  { title: '开票数量', dataIndex: 'invoice_quantity', width: 90 },
  { title: '不含税金额', dataIndex: 'amount_without_tax', width: 110 },
  { title: '审批状态', dataIndex: 'approval_status', width: 90 }
]
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
      <span style="font-size: 18px; font-weight: 600; color: #1a1a2e; margin-right: 4px; white-space: nowrap">销售订单明细</span>
      <a-input-search
        v-model:value="searchText"
        placeholder="搜索销售订单号/产品编号/产品名称/客户名称"
        style="width: 360px"
        @search="handleSearch"
        @pressEnter="handleSearch"
        allow-clear
      >
        <template #prefix><SearchOutlined /></template>
      </a-input-search>
      <a-select
        v-model:value="filterStatus"
        mode="multiple"
        placeholder="明细状态"
        style="min-width: 160px"
        allow-clear
        :max-tag-count="2"
        @change="handleSearch"
      >
        <a-select-option value="未开始">未开始</a-select-option>
        <a-select-option value="进行中">进行中</a-select-option>
        <a-select-option value="已完成">已完成</a-select-option>
      </a-select>
      <a-select
        v-model:value="filterApprovalStatus"
        mode="multiple"
        placeholder="订单审批状态"
        style="min-width: 160px"
        allow-clear
        :max-tag-count="2"
        @change="handleSearch"
      >
        <a-select-option value="草稿">草稿</a-select-option>
        <a-select-option value="待审批">待审批</a-select-option>
        <a-select-option value="已审批">已审批</a-select-option>
      </a-select>
      <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
      <a-button type="primary" :loading="exportLoading" :disabled="!selectedRowKeys.length" @click="handleExportSelected"><DownloadOutlined /> 导出选中</a-button>
      <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
    </div>

    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      :row-selection="rowSelection"
      row-key="id"
      :scroll="{ x: 2500 }"
      size="small"
      bordered
      @change="handleTableChange"
      @resizeColumn="handleResizeColumn"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'sales_order_number'">
          <a style="color: #1677ff; cursor: pointer" @click="goToSalesOrder(record.sales_order_number)">{{ record.sales_order_number }}</a>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="statusColors[record.status] || 'default'">{{ record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'shipping_status'">
          <a-tag :color="shippingStatusColors[record.shipping_status] || 'default'">{{ record.shipping_status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'approval_status'">
          <a-tag :color="approvalStatusColors[record.approval_status] || 'default'">{{ record.approval_status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'order_quantity'">
          <span style="font-weight: 600">{{ record.order_quantity }}</span>
        </template>
        <template v-else-if="column.key === 'total_amount'">
          {{ record.total_amount ? Number(record.total_amount).toFixed(2) : '-' }}
        </template>
        <template v-else-if="column.key === 'delivery_date'">
          {{ formatDate(record.delivery_date) }}
        </template>
        <template v-else-if="column.key === 'promised_delivery_date'">
          {{ formatDate(record.promised_delivery_date) }}
        </template>
        <template v-else-if="column.key === 'order_date'">
          {{ formatDate(record.order_date) }}
        </template>
        <template v-else-if="column.key === 'order_delivery_date'">
          {{ formatDate(record.order_delivery_date) }}
        </template>
        <template v-else-if="column.key === 'unit_price'">
          {{ record.unit_price ? Number(record.unit_price).toFixed(2) : '-' }}
        </template>
        <template v-else-if="column.key === 'invoice_status'">
          <a-tag :color="invoiceStatusColors[record.invoice_status] || 'default'" style="cursor: pointer" @click="record.id && handleViewRelatedInvoices(record.id)">
            {{ record.invoice_status || '未开票' }}
          </a-tag>
        </template>
      </template>
    </a-table>

    <div v-if="selectedRowKeys.length" style="margin-top: 8px; color: #666; font-size: 13px">
      已选择 <span style="color: #1677ff; font-weight: 600">{{ selectedRowKeys.length }}</span> 条记录
      <a style="margin-left: 8px" @click="selectedRowKeys = []">清空选择</a>
    </div>

    <!-- 关联发票弹窗 -->
    <a-modal v-model:open="relatedInvoicesVisible" title="关联发票列表" width="950px" :footer="null">
      <a-spin :spinning="relatedInvoicesLoading">
        <a-table
          :columns="relatedInvoiceColumns"
          :data-source="relatedInvoices"
          :pagination="false"
          row-key="invoice_number"
          size="small"
          bordered
          :scroll="{ y: 350 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'approval_status'">
              <a-tag :color="record.approval_status === '已审批' ? 'green' : 'orange'">{{ record.approval_status }}</a-tag>
            </template>
            <template v-else-if="column.dataIndex === 'invoice_date'">
              {{ formatDate(record.invoice_date) }}
            </template>
          </template>
        </a-table>
        <div v-if="!relatedInvoicesLoading && relatedInvoices.length === 0" style="text-align: center; color: #999; padding: 20px">
          该销售订单明细行暂无关联发票
        </div>
      </a-spin>
    </a-modal>

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
