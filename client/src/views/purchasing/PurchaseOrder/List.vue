<script setup lang="ts">
import { ref, reactive, onMounted, createVNode, h, computed } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, DownloadOutlined, ExclamationCircleOutlined, DownOutlined, PrinterOutlined, SettingOutlined, SwapOutlined } from '@ant-design/icons-vue'
import { getPurchaseOrders, getPurchaseOrderDetail, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, exportPurchaseOrders, closePurchaseOrder, getReceivable } from '@/api/purchasing/purchaseOrder'
import { createStockIn, confirmStockIn } from '@/api/warehouse/stockIn'
import { getItems } from '@/api/master-data/itemMaster'
import { getSuppliers } from '@/api/master-data/supplier'
import { getWarehouses } from '@/api/master-data/warehouse'
import { getAssignableUsers } from '@/api/system/user'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval, batchSubmitForApproval, batchApproveRecords, batchWithdrawApproval, batchReverseApproval } from '@/api/system/approval'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import ManualCloseModal from '@/components/Common/ManualCloseModal.vue'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'
import { useColumnPreference } from '@/composables/useColumnPreference'

// ==================== 数据 ====================

const router = useRouter()

const dataList = ref<any[]>([])


const filterApproval = ref('')
const filterOrder = ref('')

const modalVisible = ref(false)
const modalTitle = ref('新建采购订单')
const isView = ref(false)
const manualCloseRef = ref()
const selectedRowKeys = ref<string[]>([])
const formData = ref<any>({})
const detailRows = ref<any[]>([])
const returnRecords = ref<any[]>([])

const itemOptions = ref<any[]>([])
const supplierOptions = ref<any[]>([])
const warehouseOptions = ref<any[]>([])
const userOptions = ref<any[]>([])

// 入库弹窗
const stockInVisible = ref(false)
const stockInPON = ref('')
const stockInItems = ref<any[]>([])
const stockInWarehouse = reactive({ warehouse_number: '', warehouse_name: '' })

// ==================== 列定义 ====================
const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getPurchaseOrders)

const defaultDataColumns: any[] = [
  { title: '采购订单号', dataIndex: 'purchase_order_number', key: 'purchase_order_number', width: 180, sorter: (a: any, b: any) => (a.purchase_order_number || '').localeCompare(b.purchase_order_number || ''), resizable: true },
  { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', width: 150, resizable: true },
  { title: '采购负责人', dataIndex: 'procurement_manager', key: 'procurement_manager', width: 100, resizable: true },
  { title: '订单日期', dataIndex: 'order_date', key: 'order_date', width: 110, customRender: ({ text }: any) => text ? dayjs(text).format('YYYY-MM-DD') : '', resizable: true },
  { title: '交货日期', dataIndex: 'delivery_date', key: 'delivery_date', width: 110, customRender: ({ text }: any) => text ? dayjs(text).format('YYYY-MM-DD') : '', resizable: true },
  { title: '总金额', dataIndex: 'total_amount', key: 'total_amount', width: 110, customRender: ({ text }: any) => parseFloat(text || 0).toFixed(2), resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true },
  { title: '执行状态', dataIndex: 'order_status', key: 'order_status', width: 100, resizable: true },
  { title: '退货状态', dataIndex: 'return_count', key: 'return_status', width: 110, resizable: true },
  { title: '来源申请', dataIndex: 'source_req_number', key: 'source_req_number', width: 160, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('purchase_order_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 140, fixed: 'right' as const }]
})

const detailColumns = [
  { title: '物料编码', dataIndex: 'item_number', key: 'item_number', width: 140 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 160 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 70 },
  { title: '订单数量', dataIndex: 'order_quantity', key: 'order_quantity', width: 100 },
  { title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 90 },
  { title: '金额', dataIndex: 'total_amount', key: 'total_amount', width: 100, customRender: ({ text }: any) => parseFloat(text || 0).toFixed(2) },
  { title: '已入库', dataIndex: 'received_quantity', key: 'received_quantity', width: 80 },
  { title: '到货状态', dataIndex: 'receive_status', key: 'receive_status', width: 90 },
  { title: '交货日期', dataIndex: 'delivery_date', key: 'delivery_date', width: 110, customRender: ({ text }: any) => text ? dayjs(text).format('YYYY-MM-DD') : '' },
  { title: '操作', key: 'action', width: 80 }
]

const returnColumns = [
  { title: '退货单号', dataIndex: 'return_number', key: 'return_number', width: 160 },
  { title: '退货类型', dataIndex: 'return_type', key: 'return_type', width: 90 },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 90 },
  { title: '退货状态', dataIndex: 'return_status', key: 'return_status', width: 80 },
  { title: '换货状态', dataIndex: 'exchange_status', key: 'exchange_status', width: 80 },
  { title: '退货数量', dataIndex: 'total_return_quantity', key: 'total_return_quantity', width: 90 },
  { title: '退货金额', dataIndex: 'total_return_amount', key: 'total_return_amount', width: 100 },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 140 }
]

// ==================== 加载 ====================
const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getPurchaseOrders({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value, approval_status: filterApproval.value, order_status: filterOrder.value
    })
    dataList.value = res.data?.items || []
    pagination.total = res.data?.pagination?.total || 0
  } finally { loading.value = false }
}

const loadDropdowns = async () => {
  try {
    const [itemRes, supRes, whRes, userRes]: any = await Promise.all([
      getItems({ limit: 9999 }), getSuppliers({ limit: 9999 }), getWarehouses({ limit: 9999 }), getAssignableUsers()
    ])
    itemOptions.value = itemRes.data?.items || []
    supplierOptions.value = supRes.data?.items || []
    warehouseOptions.value = whRes.data?.items || []
    userOptions.value = userRes.data || []
  } catch { /* ignore */ }
}

onMounted(() => { loadColumnPreference(); fetchList(); loadDropdowns() })





const openView = async (record: any) => {
  modalTitle.value = '查看采购订单'
  isView.value = true
  const res: any = await getPurchaseOrderDetail(record.purchase_order_number)
  formData.value = res.data?.header || {}
  detailRows.value = res.data?.details || []
  returnRecords.value = res.data?.returns || []
  modalVisible.value = true
}

const openEdit = async (record: any) => {
  modalTitle.value = '编辑采购订单'
  isView.value = false
  const res: any = await getPurchaseOrderDetail(record.purchase_order_number)
  formData.value = res.data?.header || {}
  detailRows.value = (res.data?.details || []).map((d: any) => ({ ...d }))
  returnRecords.value = res.data?.returns || []
  modalVisible.value = true
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除采购订单「${(record.purchase_order_number || '').trim()}」吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await deletePurchaseOrder(record.purchase_order_number)
        if (res.success) { message.success('删除成功'); fetchList() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

const onSupplierSelect = (val: string) => {
  const sup = supplierOptions.value.find((s: any) => s.supplier_number === val)
  if (sup) {
    formData.value.supplier_number = sup.supplier_number
    formData.value.supplier_name = sup.supplier_name
    formData.value.procurement_manager = sup.procurement_manager || ''
    formData.value.linkman = sup.linkman || ''
    formData.value.contacts = sup.contacts || ''
  }
}

// 采购负责人模糊搜索选项
const poManagerOptions = computed(() => {
  const search = formData.value.procurement_manager?.toLowerCase() || ''
  if (!search) return userOptions.value.map(u => ({ value: u.real_name || u.username }))
  return userOptions.value
    .filter(u => (u.real_name || '').toLowerCase().includes(search) || (u.username || '').toLowerCase().includes(search))
    .map(u => ({ value: u.real_name || u.username }))
})

const addDetailRow = () => {
  detailRows.value.push({ item_number: '', item_name: '', specifications: '', basic_unit: '', order_quantity: 0, unit_price: 0, total_amount: 0, received_quantity: 0, delivery_date: null, receive_status: '未到货', remark: '' })
}

const removeDetailRow = (index: number) => { detailRows.value.splice(index, 1) }

const onItemSelect = (val: string, row: any) => {
  const item = itemOptions.value.find((i: any) => i.item_number === val)
  if (item) {
    row.item_number = item.item_number
    row.item_name = item.item_name
    row.specifications = item.specifications || ''
    row.basic_unit = item.basic_unit || ''
  }
}

const calcLineAmount = (row: any) => {
  row.total_amount = (parseFloat(row.order_quantity) || 0) * (parseFloat(row.unit_price) || 0)
  formData.value.total_amount = detailRows.value.reduce((s: number, d: any) => s + (parseFloat(d.total_amount) || 0), 0)
}

const handleSave = async () => {
  const payload = { ...formData.value, details: detailRows.value }
  if (formData.value.purchase_order_number) {
    await updatePurchaseOrder(formData.value.purchase_order_number, payload)
    message.success('更新成功')
  } else {
    await createPurchaseOrder(payload)
    message.success('创建成功')
  }
  modalVisible.value = false
  fetchList()
}

// ==================== 审批 ====================
const handleSubmitApproval = async (record: any) => { await submitForApproval('purchase_order', record.purchase_order_number); message.success('提交审批成功'); fetchList() }
const handleApprove = async (record: any) => { await approveRecord('purchase_order', record.purchase_order_number); message.success('审批通过'); fetchList() }
const handleWithdraw = async (record: any) => { await withdrawApproval('purchase_order', record.purchase_order_number); message.success('撤回成功'); fetchList() }
const handleReverse = async (record: any) => { await reverseApproval('purchase_order', record.purchase_order_number); message.success('反审批成功'); fetchList() }

// ==================== 批量操作 ====================
const MODULE_NAME = 'purchase_order'
const batchLoading = ref(false)
const handleBatchAction = (action: string) => {
  if (selectedRowKeys.value.length === 0) { message.warning('请先勾选记录'); return }
  const count = selectedRowKeys.value.length
  const actionMap: Record<string, { title: string; desc: string; fn: () => Promise<any>; okType?: string }> = {
    'submit': { title: '批量提交审核', desc: `确定要批量提交 ${count} 条记录吗？仅草稿状态的记录会被提交。`, fn: () => batchSubmitForApproval(MODULE_NAME, selectedRowKeys.value) },
    'approve': { title: '批量审核通过', desc: `确定要批量审核 ${count} 条记录吗？仅待审批状态的记录会被审批。`, fn: () => batchApproveRecords(MODULE_NAME, selectedRowKeys.value) },
    'withdraw': { title: '批量撤回', desc: `确定要批量撤回 ${count} 条记录吗？仅待审批状态的记录会被撤回。`, fn: () => batchWithdrawApproval(MODULE_NAME, selectedRowKeys.value) },
    'reverse': { title: '批量反审', desc: `确定要批量反审 ${count} 条记录吗？已审批的记录将退回草稿。`, fn: () => batchReverseApproval(MODULE_NAME, selectedRowKeys.value), okType: 'danger' }
  }
  const cfg = actionMap[action]
  if (!cfg) return
  Modal.confirm({
    title: cfg.title, icon: h(ExclamationCircleOutlined), content: cfg.desc,
    okText: '确认', okType: (cfg.okType as any) || 'primary', cancelText: '取消',
    onOk: async () => {
      batchLoading.value = true
      try {
        const res = await cfg.fn()
        if (res.success) {
          const d = res.data; message.success(`${cfg.title}完成：成功 ${d.succeeded.length} 条，失败 ${d.failed.length} 条`)
          if (d.failed.length > 0) d.failed.slice(0, 3).forEach((f: any) => message.warning(`${f.record_id}: ${f.message}`))
          selectedRowKeys.value = []; fetchList()
        } else { message.error(res.message || '操作失败') }
      } catch { message.error('批量操作失败') }
      finally { batchLoading.value = false }
    }
  })
}

const handlePrint = (record: any) => {
  window.open(`/api/purchase-orders/${encodeURIComponent(record.purchase_order_number)}/print`, '_blank')
}

const handleClose = (record: any) => {
  Modal.confirm({
    title: '确认关闭',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要关闭采购订单「${(record.purchase_order_number || '').trim()}」吗？关闭后不可再入库。`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await closePurchaseOrder(record.purchase_order_number)
        if (res.success) { message.success('关闭成功'); fetchList() }
        else { message.error(res.message || '关闭失败') }
      } catch { message.error('关闭失败') }
    }
  })
}

const openCreate = () => {
  modalTitle.value = '新建采购订单'
  isView.value = false
  formData.value = {}
  detailRows.value = []
  returnRecords.value = []
  modalVisible.value = true
}

// ==================== 创建入库单 ====================
const openStockIn = async (record: any) => {
  stockInPON.value = record.purchase_order_number
  const res: any = await getReceivable(record.purchase_order_number)
  stockInItems.value = (res.data?.items || []).map((d: any) => {
    const needsInspection = d.incoming_inspection === 'Y'
    return {
      ...d,
      incoming_inspection: d.incoming_inspection || 'N',
      stock_in_quantity: parseFloat(d.remaining) || 0,
      qualified_quantity: needsInspection ? 0 : (parseFloat(d.remaining) || 0),
      unqualified_quantity: 0
    }
  })
  // 根据物料来料检验标志自动默认仓库
  const allNeedInspection = stockInItems.value.every((d: any) => d.incoming_inspection === 'Y')
  const allNoInspection = stockInItems.value.every((d: any) => d.incoming_inspection !== 'Y')

  if (allNeedInspection || !allNoInspection) {
    // 全部需检验 或 混合 → 默认待检仓
    const inspWh = warehouseOptions.value.find((w: any) => w.warehouse_name === '待检仓' || w.warehouse_type === '待检仓')
    if (inspWh) {
      stockInWarehouse.warehouse_number = inspWh.warehouse_number
      stockInWarehouse.warehouse_name = inspWh.warehouse_name
    } else {
      stockInWarehouse.warehouse_number = ''
      stockInWarehouse.warehouse_name = ''
    }
  } else {
    // 全部免检 → 默认第一个物料的默认仓库
    const firstItem = stockInItems.value[0]
    if (firstItem?.default_warehouse) {
      const wh = warehouseOptions.value.find((w: any) => w.warehouse_number === firstItem.default_warehouse)
      if (wh) {
        stockInWarehouse.warehouse_number = wh.warehouse_number
        stockInWarehouse.warehouse_name = wh.warehouse_name
      } else {
        stockInWarehouse.warehouse_number = firstItem.default_warehouse
        stockInWarehouse.warehouse_name = firstItem.default_warehouse
      }
    } else {
      stockInWarehouse.warehouse_number = ''
      stockInWarehouse.warehouse_name = ''
    }
  }
  stockInVisible.value = true
}

const onWarehouseSelect = (val: string) => {
  const wh = warehouseOptions.value.find((w: any) => w.warehouse_number === val)
  if (wh) {
    stockInWarehouse.warehouse_number = wh.warehouse_number
    stockInWarehouse.warehouse_name = wh.warehouse_name
  }
}

const getWarehouseName = (warehouseNumber: string) => {
  if (!warehouseNumber) return '-'
  const wh = warehouseOptions.value.find((w: any) => w.warehouse_number === warehouseNumber)
  return wh ? `${wh.warehouse_number} ${wh.warehouse_name}` : warehouseNumber
}

const handleStockIn = async () => {
  if (!stockInWarehouse.warehouse_number) { message.warning('请选择入库仓库'); return }
  const validItems = stockInItems.value.filter((d: any) => (parseFloat(d.stock_in_quantity) || 0) > 0)
  if (!validItems.length) { message.warning('请填写入库数量'); return }

  // 创建入库单
  const createRes: any = await createStockIn({
    purchase_order_number: stockInPON.value,
    warehouse_number: stockInWarehouse.warehouse_number,
    warehouse_name: stockInWarehouse.warehouse_name,
    details: validItems.map((d: any) => ({
      purchase_detail_id: d.id,
      item_number: d.item_number,
      item_name: d.item_name,
      specifications: d.specifications,
      basic_unit: d.basic_unit,
      order_quantity: d.order_quantity,
      received_quantity: d.received_quantity,
      stock_in_quantity: d.stock_in_quantity,
      qualified_quantity: d.qualified_quantity,
      unqualified_quantity: d.unqualified_quantity
    }))
  })

  // 立即确认入库
  const siNumber = createRes.data?.stock_in_number
  if (siNumber) {
    await confirmStockIn(siNumber)
  }

  if (createRes.data?.auto_inspections?.length > 0) {
    message.success(`入库成功，已自动创建检验单：${createRes.data.auto_inspections.join(', ')}`)
  } else {
    message.success('入库成功')
  }
  stockInVisible.value = false
  fetchList()
}

// ==================== 导出 ====================
const handleRefresh = () => { fetchList() }

// ==================== 退货 ====================
const handleReturn = (record: any) => {
  router.push({ name: 'PurchaseReturnList', query: { po: record.purchase_order_number } })
}
const handleExport = async () => {
  const res: any = await exportPurchaseOrders(searchText.value)
  const url = window.URL.createObjectURL(new Blob([res.data]))
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', 'purchase_orders.xlsx')
  document.body.appendChild(link)
  link.click()
  link.remove()
}
</script>

<template>
  <div style="padding: 20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0">采购订单</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <a-input-search v-model:value="searchText" placeholder="搜索订单号/供应商/负责人" style="width:260px" @search="handleSearch" allow-clear />
        <a-select v-model:value="filterApproval" placeholder="审批状态" style="width:120px" allow-clear @change="handleSearch">
          <a-select-option value="草稿">草稿</a-select-option>
          <a-select-option value="待审批">待审批</a-select-option>
          <a-select-option value="已审批">已审批</a-select-option>
        </a-select>
        <a-select v-model:value="filterOrder" placeholder="执行状态" style="width:120px" allow-clear @change="handleSearch">
          <a-select-option value="待执行">待执行</a-select-option>
          <a-select-option value="执行中">执行中</a-select-option>
          <a-select-option value="已完成">已完成</a-select-option>
          <a-select-option value="已关闭">已关闭</a-select-option>
        </a-select>
        <a-button @click="handleRefresh"><template #icon><ReloadOutlined /></template></a-button>
        <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
        <a-button @click="openColumnSetting"><template #icon><SettingOutlined /></template>列设置</a-button>
        <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>新建</a-button>
      </div>
    </div>

    <a-table :columns="columns" :data-source="dataList" :loading="loading" :pagination="false" @change="handleTableChange" row-key="purchase_order_number" :scroll="{ x: 'max-content' }" size="small" @resizeColumn="handleResizeColumn" :row-selection="{ selectedRowKeys: selectedRowKeys, onChange: (keys: any) => selectedRowKeys = keys, preserveSelectedRowKeys: true }">
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'rowIndex'">
          {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
        </template>
        <template v-else-if="column.key === 'approval_status'">
          <ApprovalStatusTag :status="record.approval_status" />
        </template>
        <template v-else-if="column.key === 'order_status'">
          <a-tag :color="record.order_status === '已完成' ? 'green' : record.order_status === '执行中' ? 'blue' : record.order_status === '已关闭' ? 'red' : 'default'">{{ record.order_status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'return_status'">
          <template v-if="record.return_count > 0">
            <a-tag v-if="record.pending_return_count > 0" color="orange">待退货({{ record.return_count }})</a-tag>
            <a-tag v-else-if="record.pending_exchange_count > 0" color="blue">换货中({{ record.pending_exchange_count }})</a-tag>
            <a-tag v-else-if="record.completed_return_count > 0" color="green">已退货({{ record.completed_return_count }})</a-tag>
            <a-tag v-else color="default">有退货({{ record.return_count }})</a-tag>
          </template>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="openView(record)">查看</a-button>
            <a-divider type="vertical" />
            <a-dropdown :trigger="['click']">
              <a-button type="link" size="small" @click.stop>
                更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
              </a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '草稿'" @click="openEdit(record)">编辑</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '草稿'" @click="handleSubmitApproval(record)">提交审批</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '待审批'" @click="handleApprove(record)">审批</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '待审批'" @click="handleWithdraw(record)">撤回</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '已审批'" @click="handleReverse(record)">反审批</a-menu-item>
                  <a-menu-divider v-if="(record.approval_status || '').trim() !== '草稿'" />
                  <a-menu-item v-if="(record.approval_status || '').trim() === '已审批'" @click="handlePrint(record)"><PrinterOutlined style="margin-right:4px" />打印</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '已审批' && (record.order_status || '').trim() !== '已完成' && (record.order_status || '').trim() !== '已关闭'" @click="openStockIn(record)">入库</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '已审批' && (record.order_status || '').trim() !== '待执行' && (record.order_status || '').trim() !== '已关闭'" @click="handleReturn(record)"><SwapOutlined style="margin-right:4px" />退货</a-menu-item>
                  <a-menu-item v-if="(record.order_status || '').trim() !== '已关闭' && (record.order_status || '').trim() !== '已完成'" @click="handleClose(record)">关闭</a-menu-item>
                  <a-menu-divider />
                  <a-menu-item v-if="(record.approval_status || '').trim() === '草稿'" @click="handleDelete(record)">
                    <span style="color: #ff4d4f">删除</span>
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 批量操作栏 + 分页（合并一行） -->
    <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; gap: 8px; padding: 8px 0; border-top: 1px solid #f0f0f0; margin-top: 4px;">
      <div style="display: flex; align-items: center; gap: 6px; flex-wrap: nowrap; white-space: nowrap;">
        <span style="color: #666; margin-right: 2px; flex-shrink: 0;">已选 <b style="color: #1890ff;">{{ selectedRowKeys.length }}</b> 项</span>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('submit')">批量提交</a-button>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('approve')">批量审批</a-button>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('withdraw')">批量撤回</a-button>
        <a-button size="small" danger :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('reverse')">批量反审</a-button>
        <a-button size="small" danger :disabled="selectedRowKeys.length === 0" @click="manualCloseRef?.open()">批量关闭</a-button>
        <a-button size="small" type="link" :disabled="selectedRowKeys.length === 0" @click="selectedRowKeys = []">清除选择</a-button>
      </div>
      <a-pagination
        size="small"
        :current="pagination.current"
        :page-size="pagination.pageSize"
        :total="pagination.total"
        show-quick-jumper
        :show-size-changer="true"
        :show-total="(total: number) => `共 ${total} 条记录`"
        @change="(page: number, pageSize: number) => { pagination.current = page; pagination.pageSize = pageSize; fetchList() }"
      />
    </div>

    <!-- 批量关闭弹窗 -->
    <ManualCloseModal ref="manualCloseRef" module="purchase_order" :record-ids="selectedRowKeys" @success="fetchList" />

    <!-- 编辑/查看弹窗 -->
    <a-modal v-model:open="modalVisible" :title="modalTitle" width="1100px" @ok="handleSave" :ok-button-props="{ style: isView ? { display: 'none' } : {} }" :cancel-text="isView ? '关闭' : '取消'">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="供应商" required>
            <a-select v-model:value="formData.supplier_number" show-search option-filter-prop="label" style="width:100%" @change="onSupplierSelect" :disabled="isView" placeholder="选择供应商">
              <a-select-option v-for="s in supplierOptions" :key="s.supplier_number" :value="s.supplier_number" :label="s.supplier_number + ' ' + s.supplier_name">{{ s.supplier_name }}</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="采购负责人"><a-auto-complete v-model:value="formData.procurement_manager" :options="poManagerOptions" placeholder="输入姓名搜索或直接录入" style="width:100%" allow-clear :disabled="isView" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="订单日期"><a-date-picker v-model:value="formData.order_date" :disabled="isView" style="width:100%" value-format="YYYY-MM-DD" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="交货日期"><a-date-picker v-model:value="formData.delivery_date" :disabled="isView" style="width:100%" value-format="YYYY-MM-DD" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="联系人"><a-input v-model:value="formData.linkman" :disabled="isView" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="联系方式"><a-input v-model:value="formData.contacts" :disabled="isView" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="总金额"><a-input-number v-model:value="formData.total_amount" :disabled="true" style="width:100%" :precision="2" /></a-form-item></a-col>
          <a-col :span="6"><a-form-item label="备注"><a-input v-model:value="formData.remark" :disabled="isView" /></a-form-item></a-col>
        </a-row>
      </a-form>

      <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 8px">
        <h4 style="margin:0">物料明细</h4>
        <a-button v-if="!isView" size="small" type="primary" @click="addDetailRow"><PlusOutlined /> 添加行</a-button>
      </div>
      <a-table :columns="detailColumns" :data-source="detailRows" :pagination="false" row-key="(r: any, i: number) => i" size="small" :scroll="{ x: 1100 }">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'item_number' && !isView">
            <a-select v-model:value="record.item_number" show-search option-filter-prop="label" style="width:100%" @change="(v: string) => onItemSelect(v, record)" placeholder="搜索物料">
              <a-select-option v-for="item in itemOptions" :key="item.item_number" :value="item.item_number" :label="item.item_number + ' ' + item.item_name">{{ item.item_number }} {{ item.item_name }}</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'order_quantity' && !isView">
            <a-input-number v-model:value="record.order_quantity" :min="0" style="width:100%" @change="calcLineAmount(record)" />
          </template>
          <template v-else-if="column.key === 'unit_price' && !isView">
            <a-input-number v-model:value="record.unit_price" :min="0" :precision="2" style="width:100%" @change="calcLineAmount(record)" />
          </template>
          <template v-else-if="column.key === 'delivery_date' && !isView">
            <a-date-picker v-model:value="record.delivery_date" style="width:100%" value-format="YYYY-MM-DD" />
          </template>
          <template v-else-if="column.key === 'action' && !isView">
            <a-button size="small" danger @click="removeDetailRow(index)"><DeleteOutlined /></a-button>
          </template>
        </template>
      </a-table>

      <!-- 关联退货单 -->
      <div v-if="returnRecords.length > 0" style="margin-top: 16px">
        <h4 style="margin: 0 0 8px">关联退货单</h4>
        <a-table :columns="returnColumns" :data-source="returnRecords" :pagination="false" row-key="return_number" size="small" :scroll="{ x: 900 }">
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'approval_status'">
              <ApprovalStatusTag :status="record.approval_status" />
            </template>
            <template v-else-if="column.key === 'return_status'">
              <a-tag :color="record.return_status === '已退货' ? 'green' : 'blue'">{{ record.return_status }}</a-tag>
            </template>
            <template v-else-if="column.key === 'exchange_status'">
              <a-tag v-if="record.return_type === '退货换货'" :color="record.exchange_status === '已换货' ? 'green' : 'orange'">{{ record.exchange_status }}</a-tag>
              <span v-else>-</span>
            </template>
            <template v-else-if="column.key === 'total_return_amount'">
              {{ record.total_return_amount ? Number(record.total_return_amount).toFixed(2) : '-' }}
            </template>
          </template>
        </a-table>
      </div>
    </a-modal>

    <!-- 入库弹窗 -->
    <a-modal v-model:open="stockInVisible" title="来料入库" width="1000px" @ok="handleStockIn" ok-text="确认入库">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8"><a-form-item label="采购订单号"><a-input :value="stockInPON" disabled /></a-form-item></a-col>
          <a-col :span="8"><a-form-item label="入库仓库" required>
            <a-select v-model:value="stockInWarehouse.warehouse_number" show-search option-filter-prop="label" style="width:100%" @change="onWarehouseSelect" placeholder="选择仓库">
              <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number" :label="w.warehouse_number + ' ' + w.warehouse_name">{{ w.warehouse_name }}</a-select-option>
            </a-select>
          </a-form-item></a-col>
        </a-row>
      </a-form>
      <h4>可入库明细 (剩余未入库数量 > 0 的行)</h4>
      <a-table :columns="[
        { title: '物料编码', dataIndex: 'item_number', width: 130 },
        { title: '物料名称', dataIndex: 'item_name', width: 150 },
        { title: '规格', dataIndex: 'specifications', width: 100 },
        { title: '单位', dataIndex: 'basic_unit', width: 60 },
        { title: '来料检验', dataIndex: 'incoming_inspection', width: 80, customRender: ({ text }: any) => text === 'Y' ? '是' : '否' },
        { title: '入库仓库', key: 'target_warehouse', width: 90 },
        { title: '订单数量', dataIndex: 'order_quantity', width: 90 },
        { title: '已入库', dataIndex: 'received_quantity', width: 80 },
        { title: '可入库', dataIndex: 'remaining', width: 80 },
        { title: '本次入库', key: 'stock_in_quantity', width: 100 },
        { title: '合格数量', key: 'qualified_quantity', width: 100 },
        { title: '不合格数量', key: 'unqualified_quantity', width: 100 }
      ]" :data-source="stockInItems" :pagination="false" row-key="id" size="small">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'target_warehouse'">
            <a-tag v-if="record.incoming_inspection === 'Y'" color="orange">待检仓</a-tag>
            <span v-else>{{ getWarehouseName(record.default_warehouse) }}</span>
          </template>
          <template v-if="column.key === 'stock_in_quantity'">
            <a-input-number v-model:value="record.stock_in_quantity" :min="0" :max="parseFloat(record.remaining)" style="width:100%" size="small" @change="record.incoming_inspection !== 'Y' && (record.qualified_quantity = record.stock_in_quantity); record.unqualified_quantity = 0" />
          </template>
          <template v-else-if="column.key === 'qualified_quantity'">
            <a-input-number v-model:value="record.qualified_quantity" :min="0" :max="record.stock_in_quantity" style="width:100%" size="small" :disabled="record.incoming_inspection === 'Y'" @change="record.unqualified_quantity = record.stock_in_quantity - record.qualified_quantity" />
          </template>
          <template v-else-if="column.key === 'unqualified_quantity'">
            <a-input-number v-model:value="record.unqualified_quantity" :min="0" :max="record.stock_in_quantity" style="width:100%" size="small" :disabled="record.incoming_inspection === 'Y'" @change="record.qualified_quantity = record.stock_in_quantity - record.unqualified_quantity" />
          </template>
        </template>
      </a-table>
    </a-modal>

    <ColumnSettingDrawer
      :open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @update:open="columnSettingVisible = $event"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />
  </div>
</template>
