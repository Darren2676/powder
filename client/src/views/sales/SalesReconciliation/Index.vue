<script setup lang="ts">
import { ref, computed, reactive, onMounted, h } from 'vue'
import { message } from 'ant-design-vue'
import {
  SearchOutlined, ReloadOutlined, SettingOutlined,
  PrinterOutlined, CheckCircleOutlined, UndoOutlined
} from '@ant-design/icons-vue'
import {
  getReconciliationPage, updateReconciliationStatus, getReconciliationPrintData
} from '@/api/sales/shippingOrder'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import dayjs from 'dayjs'

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterRecStatus = ref<string>('')
const selectedRowKeys = ref<number[]>([])
const markLoading = ref(false)
const printLoading = ref(false)
const printModalVisible = ref(false)
const printHtmlContent = ref('')

const isRowLocked = (record: any) =>
  record.order_status === '已签收' &&
  record.reconciliation_status === '已对账' &&
  record.invoice_status === '已开票'

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  preserveSelectedRowKeys: true,
  onChange: (keys: number[]) => { selectedRowKeys.value = keys },
  getCheckboxProps: (record: any) => ({ disabled: isRowLocked(record) })
}))

const pagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const defaultDataColumns: any[] = [
  { title: '对账状态', dataIndex: 'reconciliation_status', key: 'reconciliation_status', width: 100, resizable: true },
  { title: '发货单号', dataIndex: 'shipping_order_number', key: 'shipping_order_number', width: 170, resizable: true },
  { title: '发货状态', dataIndex: 'order_status', key: 'order_status', width: 90, resizable: true },
  { title: '客户名称', dataIndex: 'customer_name', key: 'customer_name', width: 150, resizable: true },
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 70 },
  { title: '销售订单号', dataIndex: 'sales_order_number', key: 'sales_order_number', width: 170, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 160, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 130, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 70, resizable: true },
  { title: '发货数量', dataIndex: 'line_quantity', key: 'line_quantity', width: 100, resizable: true },
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
} = useColumnPreference('sales_reconciliation', defaultDataColumns, {
  fixedLeft: [{ title: '对账状态', dataIndex: 'reconciliation_status', key: 'reconciliation_status', width: 100, fixed: 'left' as const, resizable: true }],
  fixedRight: []
})

const statusColors: Record<string, string> = {
  '已发货': 'blue',
  '已签收': 'green',
  '已取消': 'default',
  '待发货': 'orange'
}

const recStatusColors: Record<string, string> = {
  '已对账': 'green',
  '未对账': 'orange'
}

const invoiceStatusColors: Record<string, string> = {
  '未开票': 'default',
  '部分开票': 'orange',
  '已开票': 'green'
}

const formatDate = (date: any) => date ? dayjs(date).format('YYYY-MM-DD') : '-'
const formatDateTime = (date: any) => date ? dayjs(date).format('YYYY-MM-DD HH:mm') : '-'

const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getReconciliationPage({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value,
      reconciliationStatus: filterRecStatus.value
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取对账明细失败')
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

const handleMarkReconciled = async () => {
  if (!selectedRowKeys.value.length) {
    message.warning('请先勾选要标记的记录')
    return
  }
  markLoading.value = true
  try {
    const res: any = await updateReconciliationStatus({
      detailIds: selectedRowKeys.value,
      reconciliationStatus: '已对账'
    })
    if (res?.success) {
      message.success(res.message || '标记成功')
      selectedRowKeys.value = []
      fetchData()
    }
  } catch {
    message.error('标记失败')
  } finally {
    markLoading.value = false
  }
}

const handleMarkUnreconciled = async () => {
  if (!selectedRowKeys.value.length) {
    message.warning('请先勾选要标记的记录')
    return
  }
  markLoading.value = true
  try {
    const res: any = await updateReconciliationStatus({
      detailIds: selectedRowKeys.value,
      reconciliationStatus: '未对账'
    })
    if (res?.success) {
      message.success(res.message || '标记成功')
      selectedRowKeys.value = []
      fetchData()
    }
  } catch {
    message.error('标记失败')
  } finally {
    markLoading.value = false
  }
}

const handlePrintStatement = async () => {
  if (!selectedRowKeys.value.length) {
    message.warning('请先勾选要打印的记录')
    return
  }
  printLoading.value = true
  try {
    const res: any = await getReconciliationPrintData(selectedRowKeys.value)
    if (res?.success) {
      const items = res.data.items || []
      if (!items.length) { message.warning('无打印数据'); return }

      const now = dayjs().format('YYYY-MM-DD HH:mm')
      let rowsHtml = ''
      items.forEach((item: any, idx: number) => {
        const batches = item.batches || []
        const batchText = batches.map((b: any) => `${b.batch_number}(${b.quantity})`).join('; ')
        rowsHtml += `
          <tr>
            <td>${idx + 1}</td>
            <td>${item.shipping_order_number || ''}</td>
            <td>${item.sales_order_number || ''}</td>
            <td>${item.customer_name || ''}</td>
            <td>${item.item_number || ''}</td>
            <td>${item.item_name || ''}</td>
            <td>${item.specifications || ''}</td>
            <td>${item.line_quantity || ''}</td>
            <td>${item.basic_unit || ''}</td>
            <td>${formatDate(item.shipping_date)}</td>
            <td>${batchText}</td>
            <td>${item.reconciliation_status || ''}</td>
          </tr>`
      })

      printHtmlContent.value = `
        <h2>销 售 对 账 单</h2>
        <div class="info">打印时间：${now} &nbsp;&nbsp; 共计 ${items.length} 条记录</div>
        <table>
          <thead><tr>
            <th>序号</th><th>发货单号</th><th>销售订单号</th><th>客户</th>
            <th>产品编号</th><th>产品名称</th><th>规格</th>
            <th>发货数量</th><th>单位</th><th>发货日期</th>
            <th>批次信息</th><th>对账状态</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
        <div class="footer" style="display:flex;justify-content:space-between;margin-top:30px">
          <span>制单人：_____________</span>
          <span>对账人：_____________</span>
          <span>日期：_____________</span>
        </div>`
      printModalVisible.value = true
    }
  } catch {
    message.error('获取打印数据失败')
  } finally {
    printLoading.value = false
  }
}

const doPrint = () => { window.print() }

onMounted(async () => {
  await loadColumnPreference()
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: nowrap; overflow-x: auto">
      <span style="font-size: 17px; font-weight: 600; color: #1a1a2e; white-space: nowrap; flex-shrink: 0">销售对账</span>
      <a-input-search
        v-model:value="searchText"
        placeholder="搜索发货单号/产品/客户/销售订单号"
        style="width: 260px; min-width: 180px"
        @search="handleSearch"
        @pressEnter="handleSearch"
        allow-clear
      >
        <template #prefix><SearchOutlined /></template>
      </a-input-search>
      <a-select
        v-model:value="filterRecStatus"
        placeholder="对账状态"
        style="min-width: 120px"
        allow-clear
        @change="handleSearch"
      >
        <a-select-option value="">全部</a-select-option>
        <a-select-option value="已对账">已对账</a-select-option>
        <a-select-option value="未对账">未对账</a-select-option>
      </a-select>
      <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
      <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
      <div style="margin-left: auto; display: flex; gap: 8px; flex-shrink: 0">
        <a-button type="primary" :loading="markLoading" :disabled="!selectedRowKeys.length" @click="handleMarkReconciled">
          <CheckCircleOutlined /> 标记已对账
        </a-button>
        <a-button :loading="markLoading" :disabled="!selectedRowKeys.length" @click="handleMarkUnreconciled">
          <UndoOutlined /> 标记未对账
        </a-button>
        <a-button type="primary" :loading="printLoading" :disabled="!selectedRowKeys.length" @click="handlePrintStatement">
          <PrinterOutlined /> 打印对账单
        </a-button>
      </div>
    </div>

    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      :row-selection="rowSelection"
      :row-class-name="(record: any) => isRowLocked(record) ? 'row-locked' : ''"
      row-key="detail_id"
      :scroll="{ x: 2400 }"
      size="small"
      bordered
      @change="handleTableChange"
      @resizeColumn="handleResizeColumn"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'reconciliation_status'">
          <a-tag :color="recStatusColors[record.reconciliation_status] || 'default'">
            {{ record.reconciliation_status || '未对账' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'order_status'">
          <a-tag :color="statusColors[record.order_status] || 'default'">{{ record.order_status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'line_quantity'">
          <span style="color: #1677ff; font-weight: 600">{{ record.line_quantity }}</span>
        </template>
        <template v-else-if="column.key === 'shipping_date'">
          {{ formatDate(record.shipping_date) }}
        </template>
        <template v-else-if="column.key === 'order_creation_date'">
          {{ formatDateTime(record.order_creation_date) }}
        </template>
        <template v-else-if="column.key === 'invoice_status'">
          <a-tag :color="invoiceStatusColors[record.invoice_status] || 'default'">
            {{ record.invoice_status || '未开票' }}
          </a-tag>
        </template>
      </template>
    </a-table>

    <div v-if="selectedRowKeys.length" style="margin-top: 8px; color: #666; font-size: 13px">
      已选择 <span style="color: #1677ff; font-weight: 600">{{ selectedRowKeys.length }}</span> 条记录
      <a style="margin-left: 8px" @click="selectedRowKeys = []">清空选择</a>
    </div>

    <ColumnSettingDrawer
      v-model:open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />

    <!-- 打印预览模态框 -->
    <a-modal
      v-model:open="printModalVisible"
      title="打印对账单预览"
      width="960px"
      :footer="null"
      :destroyOnClose="true"
      style="top: 20px"
    >
      <div class="print-action-bar" style="display: flex; justify-content: flex-end; gap: 8px; margin-bottom: 10px">
        <a-button type="primary" @click="doPrint"><PrinterOutlined /> 打印</a-button>
        <a-button @click="printModalVisible = false">关闭</a-button>
      </div>
      <div id="printArea" class="print-content" v-html="printHtmlContent"></div>
    </a-modal>
  </div>
</template>

<style>
.row-locked {
  background-color: #f5f5f5 !important;
}
.row-locked td {
  color: #aaa !important;
}

.print-content {
  font-family: SimSun, serif;
  font-size: 12px;
  padding: 10px;
}
.print-content h2 {
  text-align: center;
  font-size: 18px;
  margin-bottom: 5px;
}
.print-content .info {
  text-align: center;
  font-size: 12px;
  margin-bottom: 15px;
  color: #666;
}
.print-content table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 10px;
}
.print-content th,
.print-content td {
  border: 1px solid #333;
  padding: 5px 8px;
  text-align: left;
  font-size: 11px;
}
.print-content th {
  background: #f0f0f0;
  font-weight: bold;
}
.print-content .footer {
  margin-top: 20px;
  font-size: 12px;
}

@media print {
  body * { visibility: hidden; }
  #printArea, #printArea * { visibility: visible; }
  #printArea { position: absolute; left: 0; top: 0; width: 100%; padding: 20px; }
  .print-action-bar { display: none !important; }
  .ant-modal-mask, .ant-modal-wrap { display: none !important; }
}
</style>
