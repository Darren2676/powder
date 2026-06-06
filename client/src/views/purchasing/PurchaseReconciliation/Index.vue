<script setup lang="ts">
import { ref, computed, reactive, onMounted, h } from 'vue'
import { message } from 'ant-design-vue'
import {
  SearchOutlined, ReloadOutlined, SettingOutlined,
  PrinterOutlined, CheckCircleOutlined, UndoOutlined
} from '@ant-design/icons-vue'
import {
  getPurchaseReconciliationPage, updatePurchaseReconciliationStatus, getPurchaseReconciliationPrintData,
  getPurchaseOrderReconciliationPage, updatePurchaseOrderReconciliationStatus, getPurchaseOrderReconciliationPrintData
} from '@/api/purchasing/purchaseReconciliation'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import dayjs from 'dayjs'

const activeTab = ref('stockIn')
const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterRecStatus = ref<string>('')
const selectedRowKeys = ref<number[]>([])
const markLoading = ref(false)
const printLoading = ref(false)
const printModalVisible = ref(false)
const printHtmlContent = ref('')

// 入库单明细行 — 锁定规则
const isStockInRowLocked = (record: any) =>
  record.stock_in_status === '已审批' &&
  record.reconciliation_status === '已对账' &&
  record.invoice_status === '已开票'

// 采购订单明细行 — 锁定规则
const isPurchaseOrderRowLocked = (record: any) =>
  record.approval_status === '已审批' &&
  record.reconciliation_status === '已对账' &&
  record.invoice_status === '已开票'

const isRowLocked = (record: any) =>
  activeTab.value === 'stockIn' ? isStockInRowLocked(record) : isPurchaseOrderRowLocked(record)

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

// ===== 入库单明细列定义 =====
const stockInDefaultColumns: any[] = [
  { title: '对账状态', dataIndex: 'reconciliation_status', key: 'reconciliation_status', width: 100, resizable: true },
  { title: '入库单号', dataIndex: 'stock_in_number', key: 'stock_in_number', width: 160, resizable: true },
  { title: '入库状态', dataIndex: 'stock_in_status', key: 'stock_in_status', width: 90, resizable: true },
  { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', width: 150, resizable: true },
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 70 },
  { title: '采购订单号', dataIndex: 'purchase_order_number', key: 'purchase_order_number', width: 160, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 160, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 130, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 70, resizable: true },
  { title: '合格数量', dataIndex: 'qualified_quantity', key: 'qualified_quantity', width: 100, resizable: true },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120, resizable: true },
  { title: '入库日期', dataIndex: 'stock_in_date', key: 'stock_in_date', width: 110, resizable: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100, resizable: true },
  { title: '开票状态', dataIndex: 'invoice_status', key: 'invoice_status', width: 100, resizable: true }
]

// ===== 采购订单明细列定义 =====
const purchaseOrderDefaultColumns: any[] = [
  { title: '对账状态', dataIndex: 'reconciliation_status', key: 'reconciliation_status', width: 100, resizable: true },
  { title: '采购订单号', dataIndex: 'purchase_order_number', key: 'purchase_order_number', width: 160, resizable: true },
  { title: '订单状态', dataIndex: 'order_status', key: 'order_status', width: 90, resizable: true },
  { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', width: 150, resizable: true },
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 70 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 130, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 160, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 130, resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 70, resizable: true },
  { title: '订单数量', dataIndex: 'order_quantity', key: 'order_quantity', width: 100, resizable: true },
  { title: '已收数量', dataIndex: 'received_quantity', key: 'received_quantity', width: 100, resizable: true },
  { title: '订单日期', dataIndex: 'order_date', key: 'order_date', width: 110, resizable: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100, resizable: true },
  { title: '开票状态', dataIndex: 'invoice_status', key: 'invoice_status', width: 100, resizable: true }
]

const {
  columns: stockInColumns, columnSettingVisible: stockInColSettingVisible,
  columnSettingList: stockInColSettingList, columnSettingSaving: stockInColSettingSaving,
  openColumnSetting: openStockInColSetting, moveColumnUp: moveStockInColUp,
  moveColumnDown: moveStockInColDown, saveColumnSetting: saveStockInColSetting,
  resetColumnSetting: resetStockInColSetting, loadColumnPreference: loadStockInColPref,
  handleResizeColumn: handleStockInResizeCol
} = useColumnPreference('purchase_reconciliation_stock_in', stockInDefaultColumns, {
  fixedLeft: [{ title: '对账状态', dataIndex: 'reconciliation_status', key: 'reconciliation_status', width: 100, fixed: 'left' as const, resizable: true }],
  fixedRight: []
})

const {
  columns: purchaseOrderColumns, columnSettingVisible: poColSettingVisible,
  columnSettingList: poColSettingList, columnSettingSaving: poColSettingSaving,
  openColumnSetting: openPOColSetting, moveColumnUp: movePOColUp,
  moveColumnDown: movePOColDown, saveColumnSetting: savePOColSetting,
  resetColumnSetting: resetPOColSetting, loadColumnPreference: loadPOColPref,
  handleResizeColumn: handlePOResizeCol
} = useColumnPreference('purchase_reconciliation_purchase_order', purchaseOrderDefaultColumns, {
  fixedLeft: [{ title: '对账状态', dataIndex: 'reconciliation_status', key: 'reconciliation_status', width: 100, fixed: 'left' as const, resizable: true }],
  fixedRight: []
})

const currentColumns = computed(() => activeTab.value === 'stockIn' ? stockInColumns.value : purchaseOrderColumns.value)

const recStatusColors: Record<string, string> = { '已对账': 'green', '未对账': 'orange' }
const invoiceStatusColors: Record<string, string> = { '未开票': 'default', '部分开票': 'orange', '已开票': 'green' }
const statusColors: Record<string, string> = { '草稿': 'default', '待审批': 'orange', '已审批': 'green' }

const formatDate = (date: any) => date ? dayjs(date).format('YYYY-MM-DD') : '-'

const fetchData = async () => {
  loading.value = true
  try {
    const params = {
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value,
      reconciliationStatus: filterRecStatus.value
    }
    let res: any
    if (activeTab.value === 'stockIn') {
      res = await getPurchaseReconciliationPage(params)
    } else {
      res = await getPurchaseOrderReconciliationPage(params)
    }
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

const handleTabChange = () => {
  selectedRowKeys.value = []
  pagination.current = 1
  fetchData()
}

const handleMarkReconciled = async () => {
  if (!selectedRowKeys.value.length) { message.warning('请先勾选要标记的记录'); return }
  markLoading.value = true
  try {
    const fn = activeTab.value === 'stockIn' ? updatePurchaseReconciliationStatus : updatePurchaseOrderReconciliationStatus
    const res: any = await fn({ detailIds: selectedRowKeys.value, reconciliationStatus: '已对账' })
    if (res?.success) { message.success(res.message || '标记成功'); selectedRowKeys.value = []; fetchData() }
  } catch { message.error('标记失败') }
  finally { markLoading.value = false }
}

const handleMarkUnreconciled = async () => {
  if (!selectedRowKeys.value.length) { message.warning('请先勾选要标记的记录'); return }
  markLoading.value = true
  try {
    const fn = activeTab.value === 'stockIn' ? updatePurchaseReconciliationStatus : updatePurchaseOrderReconciliationStatus
    const res: any = await fn({ detailIds: selectedRowKeys.value, reconciliationStatus: '未对账' })
    if (res?.success) { message.success(res.message || '标记成功'); selectedRowKeys.value = []; fetchData() }
  } catch { message.error('标记失败') }
  finally { markLoading.value = false }
}

const handlePrintStatement = async () => {
  if (!selectedRowKeys.value.length) { message.warning('请先勾选要打印的记录'); return }
  printLoading.value = true
  try {
    const fn = activeTab.value === 'stockIn' ? getPurchaseReconciliationPrintData : getPurchaseOrderReconciliationPrintData
    const res: any = await fn(selectedRowKeys.value)
    if (res?.success) {
      const items = res.data.items || []
      if (!items.length) { message.warning('无打印数据'); return }

      const now = dayjs().format('YYYY-MM-DD HH:mm')
      const title = activeTab.value === 'stockIn' ? '采 购 对 账 单（入库明细）' : '采 购 对 账 单（订单明细）'
      let rowsHtml = ''
      items.forEach((item: any, idx: number) => {
        if (activeTab.value === 'stockIn') {
          rowsHtml += `<tr>
            <td>${idx + 1}</td><td>${item.stock_in_number || ''}</td><td>${item.purchase_order_number || ''}</td>
            <td>${item.supplier_name || ''}</td><td>${item.item_number || ''}</td><td>${item.item_name || ''}</td>
            <td>${item.specifications || ''}</td><td>${item.qualified_quantity || ''}</td><td>${item.basic_unit || ''}</td>
            <td>${formatDate(item.stock_in_date)}</td><td>${item.warehouse_name || ''}</td><td>${item.reconciliation_status || ''}</td>
          </tr>`
        } else {
          rowsHtml += `<tr>
            <td>${idx + 1}</td><td>${item.purchase_order_number || ''}</td><td>${item.supplier_name || ''}</td>
            <td>${item.item_number || ''}</td><td>${item.item_name || ''}</td><td>${item.specifications || ''}</td>
            <td>${item.order_quantity || ''}</td><td>${item.received_quantity || ''}</td><td>${item.basic_unit || ''}</td>
            <td>${formatDate(item.order_date)}</td><td>${item.reconciliation_status || ''}</td>
          </tr>`
        }
      })

      const stockInHeaders = '<th>序号</th><th>入库单号</th><th>采购订单号</th><th>供应商</th><th>产品编号</th><th>产品名称</th><th>规格</th><th>合格数量</th><th>单位</th><th>入库日期</th><th>仓库</th><th>对账状态</th>'
      const poHeaders = '<th>序号</th><th>采购订单号</th><th>供应商</th><th>产品编号</th><th>产品名称</th><th>规格</th><th>订单数量</th><th>已收数量</th><th>单位</th><th>订单日期</th><th>对账状态</th>'

      printHtmlContent.value = `
        <h2>${title}</h2>
        <div class="info">打印时间：${now} &nbsp;&nbsp; 共计 ${items.length} 条记录</div>
        <table><thead><tr>${activeTab.value === 'stockIn' ? stockInHeaders : poHeaders}</tr></thead><tbody>${rowsHtml}</tbody></table>
        <div class="footer" style="display:flex;justify-content:space-between;margin-top:30px">
          <span>制单人：_____________</span><span>对账人：_____________</span><span>日期：_____________</span>
        </div>`
      printModalVisible.value = true
    }
  } catch { message.error('获取打印数据失败') }
  finally { printLoading.value = false }
}

const doPrint = () => { window.print() }

onMounted(async () => {
  await Promise.all([loadStockInColPref(), loadPOColPref()])
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <div style="margin-bottom: 16px; display: flex; gap: 8px; align-items: center; flex-wrap: nowrap; overflow-x: auto">
      <span style="font-size: 17px; font-weight: 600; color: #1a1a2e; white-space: nowrap; flex-shrink: 0">采购对账</span>
      <a-input-search
        v-model:value="searchText"
        placeholder="搜索入库单号/订单号/物料/供应商"
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
      <a-tooltip title="列设置"><a-button @click="activeTab === 'stockIn' ? openStockInColSetting() : openPOColSetting()"><SettingOutlined /></a-button></a-tooltip>
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

    <a-tabs v-model:activeKey="activeTab" @change="handleTabChange" size="small">
      <a-tab-pane key="stockIn" tab="入库单明细" />
      <a-tab-pane key="purchaseOrder" tab="采购订单明细" />
    </a-tabs>

    <a-table
      :columns="currentColumns"
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
      @resizeColumn="activeTab === 'stockIn' ? handleStockInResizeCol($event) : handlePOResizeCol($event)"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'reconciliation_status'">
          <a-tag :color="recStatusColors[record.reconciliation_status] || 'default'">
            {{ record.reconciliation_status || '未对账' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'invoice_status'">
          <a-tag :color="invoiceStatusColors[record.invoice_status] || 'default'">
            {{ record.invoice_status || '未开票' }}
          </a-tag>
        </template>
        <template v-else-if="column.key === 'stock_in_status'">
          <a-tag :color="statusColors[record.stock_in_status] || 'default'">{{ record.stock_in_status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'order_status'">
          <a-tag :color="statusColors[record.order_status] || 'default'">{{ record.order_status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'approval_status'">
          <a-tag :color="statusColors[record.approval_status] || 'default'">{{ record.approval_status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'qualified_quantity' || column.key === 'order_quantity' || column.key === 'received_quantity'">
          <span style="color: #1677ff; font-weight: 600">{{ record[column.dataIndex] }}</span>
        </template>
        <template v-else-if="column.key === 'stock_in_date' || column.key === 'order_date'">
          {{ formatDate(record[column.dataIndex]) }}
        </template>
      </template>
    </a-table>

    <div v-if="selectedRowKeys.length" style="margin-top: 8px; color: #666; font-size: 13px">
      已选择 <span style="color: #1677ff; font-weight: 600">{{ selectedRowKeys.length }}</span> 条记录
      <a style="margin-left: 8px" @click="selectedRowKeys = []">清空选择</a>
    </div>

    <ColumnSettingDrawer
      v-model:open="stockInColSettingVisible"
      :settingList="stockInColSettingList"
      :saving="stockInColSettingSaving"
      @moveUp="moveStockInColUp"
      @moveDown="moveStockInColDown"
      @save="saveStockInColSetting"
      @reset="resetStockInColSetting"
    />
    <ColumnSettingDrawer
      v-model:open="poColSettingVisible"
      :settingList="poColSettingList"
      :saving="poColSettingSaving"
      @moveUp="movePOColUp"
      @moveDown="movePOColDown"
      @save="savePOColSetting"
      @reset="resetPOColSetting"
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
