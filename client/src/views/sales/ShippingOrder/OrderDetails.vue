<script setup lang="ts">
import { ref, computed, reactive, onMounted } from 'vue'
import { message } from 'ant-design-vue'
import { SearchOutlined, ReloadOutlined, SettingOutlined, DownloadOutlined } from '@ant-design/icons-vue'
import { getShippingOrderDetailsPage, exportShippingOrderDetailsSelected } from '@/api/sales/shippingOrder'
import { getInvoicesByShippingDetail } from '@/api/sales/salesInvoice'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { generateExportFilename } from '@/utils/exportFilename'
import dayjs from 'dayjs'

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterStatus = ref<string[]>([])
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
  { title: '状态', dataIndex: 'order_status', key: 'order_status', width: 90, resizable: true },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 150, resizable: true },
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 70 },
  { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 170, resizable: true },
  { title: '申请单号', dataIndex: 'request_number', key: 'request_number', width: 170, resizable: true },
  { title: '销售订单号', dataIndex: 'sales_order_number', key: 'sales_order_number', width: 170, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 160, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 130, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 70, resizable: true },
  { title: '批次数量', dataIndex: 'batch_quantity', key: 'batch_quantity', width: 100, resizable: true },
  { title: '行发货量', dataIndex: 'line_quantity', key: 'line_quantity', width: 100, resizable: true },
  { title: '出库仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120, resizable: true },
  { title: '承运商', dataIndex: 'carrier', key: 'carrier', width: 130, resizable: true },
  { title: '运单号', dataIndex: 'tracking_number', key: 'tracking_number', width: 150, resizable: true },
  { title: '发货日期', dataIndex: 'shipping_date', key: 'shipping_date', width: 110, resizable: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100, resizable: true },
  { title: '创建时间', dataIndex: 'order_creation_date', key: 'order_creation_date', width: 170, resizable: true },
  { title: '开票状态', dataIndex: 'invoice_status', key: 'invoice_status', width: 100, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('shipping_order_details', defaultDataColumns, {
  fixedLeft: [{ title: '发货单号', dataIndex: 'shipping_order_number', key: 'shipping_order_number', width: 170, fixed: 'left' as const, resizable: true }],
  fixedRight: []
})

const statusColors: Record<string, string> = {
  '已发货': 'blue',
  '已签收': 'green',
  '已取消': 'default'
}

const formatDate = (date: any) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
const formatDateTime = (date: any) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-'

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getShippingOrderDetailsPage({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value,
      status: filterStatus.value.length ? filterStatus.value.join(',') : ''
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取发货单明细失败')
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
    const res = await exportShippingOrderDetailsSelected({ ids: selectedRowKeys.value })
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = generateExportFilename('shipping_order_details_selected')
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
    const res: any = await getInvoicesByShippingDetail(detailId)
    if (res?.success) relatedInvoices.value = res.data || []
  } catch { message.error('获取关联发票失败') }
  finally { relatedInvoicesLoading.value = false }
}

const relatedInvoiceColumns = [
  { title: '发票编号', dataIndex: 'invoice_number', width: 170 },
  { title: '发票代码', dataIndex: 'invoice_code', width: 120 },
  { title: '发票号码', dataIndex: 'invoice_no', width: 120 },
  { title: '开票日期', dataIndex: 'invoice_date', width: 110 },
  { title: '开票数量', dataIndex: 'invoice_quantity', width: 90 },
  { title: '单价', dataIndex: 'unit_price', width: 90 },
  { title: '不含税金额', dataIndex: 'amount_without_tax', width: 110 },
  { title: '审批状态', dataIndex: 'approval_status', width: 90 }
]
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap">
      <span style="font-size: 18px; font-weight: 600; color: #1a1a2e; margin-right: 4px; white-space: nowrap">发货单明细</span>
      <a-input-search
        v-model:value="searchText"
        placeholder="搜索发货单号/批次号/产品/客户/销售订单号/承运商/运单号"
        style="width: 380px"
        @search="handleSearch"
        @pressEnter="handleSearch"
        allow-clear
      >
        <template #prefix><SearchOutlined /></template>
      </a-input-search>
      <a-select
        v-model:value="filterStatus"
        mode="multiple"
        placeholder="全部状态"
        style="min-width: 160px"
        allow-clear
        :max-tag-count="2"
        @change="handleSearch"
      >
        <a-select-option value="已发货">已发货</a-select-option>
        <a-select-option value="已签收">已签收</a-select-option>
        <a-select-option value="已取消">已取消</a-select-option>
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
      row-key="batch_id"
      :scroll="{ x: 2400 }"
      size="small"
      bordered
      @change="handleTableChange"
      @resizeColumn="handleResizeColumn"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'order_status'">
          <a-tag :color="statusColors[record.order_status] || 'default'">{{ record.order_status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'batch_quantity'">
          <span style="color: #1677ff; font-weight: 600">{{ record.batch_quantity }}</span>
        </template>
        <template v-else-if="column.key === 'shipping_date'">
          {{ formatDate(record.shipping_date) }}
        </template>
        <template v-else-if="column.key === 'order_creation_date'">
          {{ formatDateTime(record.order_creation_date) }}
        </template>
        <template v-else-if="column.key === 'invoice_status'">
          <a-tag :color="invoiceStatusColors[record.invoice_status] || 'default'" style="cursor: pointer" @click="record.detail_id && handleViewRelatedInvoices(record.detail_id)">
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
    <a-modal v-model:open="relatedInvoicesVisible" title="关联发票列表" width="900px" :footer="null">
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
          该发货明细行暂无关联发票
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
