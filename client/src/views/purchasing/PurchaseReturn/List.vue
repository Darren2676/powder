<script setup lang="ts">
import { ref, reactive, computed, onMounted, createVNode } from 'vue'
import { useRoute } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, ExclamationCircleOutlined, DownOutlined, SwapOutlined, SettingOutlined, PrinterOutlined } from '@ant-design/icons-vue'
import { getPurchaseReturns, getPurchaseReturnDetail, createPurchaseReturn, updatePurchaseReturn, deletePurchaseReturn, submitPurchaseReturn, approvePurchaseReturn, withdrawPurchaseReturn, executeReturn, exchangeStockIn, getPOReceivedItems } from '@/api/purchasing/purchaseReturn'
import { getPurchaseOrders } from '@/api/purchasing/purchaseOrder'
import { getWarehouses } from '@/api/master-data/warehouse'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import { useTableList } from '@/composables/useTableList'
import { useModalDrag } from '@/composables/useModalDrag'
import { useColumnPreference } from '@/composables/useColumnPreference'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'

// 弹窗拖拽
const { modalStyle, onDragStart, resetDrag } = useModalDrag()

// ==================== 数据 ====================
const filterApproval = ref('')
const poOptions = ref<any[]>([])
const warehouseOptions = ref<any[]>([])

const modalVisible = ref(false)
const isView = ref(false)
const formData = ref<any>({})
const detailRows = ref<any[]>([])

// ==================== 列定义 ====================
const { loading, searchText, pagination, handleTableChange, handleSearch } = useTableList(getPurchaseReturns)

const defaultDataColumns: any[] = [
  { title: '退货单号', dataIndex: 'return_number', key: 'return_number', width: 170, resizable: true },
  { title: '采购订单号', dataIndex: 'purchase_order_number', key: 'purchase_order_number', width: 170, resizable: true },
  { title: '供应商名称', dataIndex: 'supplier_name', key: 'supplier_name', width: 140, resizable: true },
  { title: '退货类型', dataIndex: 'return_type', key: 'return_type', width: 100, resizable: true },
  { title: '退货原因', dataIndex: 'return_reason', key: 'return_reason', width: 150, resizable: true },
  { title: '退货仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120, resizable: true },
  { title: '退货总数量', dataIndex: 'total_return_quantity', key: 'total_return_quantity', width: 110, resizable: true },
  { title: '退货总金额', dataIndex: 'total_return_amount', key: 'total_return_amount', width: 120, resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true },
  { title: '退货状态', dataIndex: 'return_status', key: 'return_status', width: 90, resizable: true },
  { title: '换货状态', dataIndex: 'exchange_status', key: 'exchange_status', width: 90, resizable: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 90, resizable: true },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 150, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('purchase_return', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 180, fixed: 'right' as const }]
})

const detailColumns = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60 },
  { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 130 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60 },
  { title: '已入库数量', dataIndex: 'received_quantity', key: 'received_quantity', width: 100 },
  { title: '退货数量', dataIndex: 'return_quantity', key: 'return_quantity', width: 100 },
  { title: '单价', dataIndex: 'unit_price', key: 'unit_price', width: 90 },
  { title: '退货金额', dataIndex: 'return_amount', key: 'return_amount', width: 100 },
  { title: '换货状态', dataIndex: 'exchange_status', key: 'exchange_status', width: 90 },
  { title: '操作', key: 'action', width: 60 }
]

// ==================== 加载 ====================
const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getPurchaseReturns({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value, approval_status: filterApproval.value
    })
    const d = res.data
    dataList.value = d?.items || []
    pagination.total = d?.pagination?.total || 0
  } finally { loading.value = false }
}

const dataList = ref<any[]>([])

const loadDropdowns = async () => {
  try {
    const [poRes, whRes]: any = await Promise.all([
      getPurchaseOrders({ limit: 9999 }),
      getWarehouses({ limit: 9999 })
    ])
    poOptions.value = (poRes.data?.items || []).filter((po: any) => po.order_status !== '待执行')
    warehouseOptions.value = whRes.data?.items || []
  } catch { /* ignore */ }
}

const route = useRoute()

onMounted(async () => {
  loadColumnPreference(); fetchList(); await loadDropdowns()
  // 从采购订单页面跳转过来时自动打开新建弹窗并预填订单号
  const poFromQuery = (route.query.po as string) || ''
  if (poFromQuery) {
    openCreate()
    formData.value.purchase_order_number = poFromQuery
    await onPOSelect(poFromQuery)
  }
})

// ==================== 采购订单选择后加载已入库明细 ====================
const onPOSelect = async (val: string) => {
  if (!val) { detailRows.value = []; return }
  try {
    const res: any = await getPOReceivedItems(val)
    const poHeader = res.data?.poHeader || {}
    formData.value.purchase_order_number = val
    formData.value.supplier_number = poHeader.supplier_number || ''
    formData.value.supplier_name = poHeader.supplier_name || ''
    const items = res.data?.details || []
    detailRows.value = items.map((d: any) => ({
      ...d,
      return_quantity: 0,
      unit_price: d.unit_price || 0,
      return_amount: 0,
      exchange_quantity: formData.value.return_type === '退货换货' ? 0 : 0,
      exchange_status: formData.value.return_type === '退货换货' ? '待换货' : ''
    }))
  } catch { message.error('获取已入库物料失败') }
}

const onReturnTypeChange = (val: string) => {
  formData.value.return_type = val
  for (const row of detailRows.value) {
    if (val === '退货换货') {
      row.exchange_quantity = row.return_quantity || 0
      row.exchange_status = '待换货'
    } else {
      row.exchange_quantity = 0
      row.exchange_status = ''
    }
  }
}

const onWarehouseSelect = (val: string) => {
  const wh = warehouseOptions.value.find((w: any) => w.warehouse_number === val)
  if (wh) {
    formData.value.warehouse_number = wh.warehouse_number
    formData.value.warehouse_name = wh.warehouse_name
  }
}

const onReturnQtyChange = (row: any) => {
  const retQty = parseFloat(row.return_quantity) || 0
  const received = parseFloat(row.received_quantity) || 0
  if (retQty > received) {
    row.return_quantity = received
    message.warning('退货数量不能超过已入库数量')
  }
  row.return_amount = retQty * (parseFloat(row.unit_price) || 0)
  if (formData.value.return_type === '退货换货') {
    row.exchange_quantity = retQty
  }
}

const removeDetailRow = (index: number) => { detailRows.value.splice(index, 1) }

// ==================== 弹窗操作 ====================
const openCreate = () => {
  isView.value = false
  formData.value = {
    purchase_order_number: '', supplier_number: '', supplier_name: '',
    return_type: '退货退款', return_reason: '',
    warehouse_number: '', warehouse_name: '', remark: ''
  }
  detailRows.value = []
  modalVisible.value = true
  resetDrag()
}

const openView = async (record: any) => {
  isView.value = true
  const res: any = await getPurchaseReturnDetail(record.return_number)
  formData.value = res.data?.header || {}
  detailRows.value = res.data?.details || []
  modalVisible.value = true
  resetDrag()
}

const openEdit = async (record: any) => {
  isView.value = false
  const res: any = await getPurchaseReturnDetail(record.return_number)
  formData.value = res.data?.header || {}
  detailRows.value = res.data?.details || []
  modalVisible.value = true
  resetDrag()
}

const handleSave = async () => {
  if (!formData.value.purchase_order_number) { message.warning('请选择采购订单'); return }
  const validDetails = detailRows.value.filter((d: any) => (parseFloat(d.return_quantity) || 0) > 0)
  if (!validDetails.length) { message.warning('请填写退货数量'); return }
  if (!formData.value.warehouse_number) { message.warning('请选择退货仓库'); return }

  const payload = {
    ...formData.value,
    details: validDetails.map(d => ({
      purchase_detail_id: d.purchase_detail_id,
      stock_in_number: d.stock_in_number,
      item_number: d.item_number, item_name: d.item_name,
      specifications: d.specifications, basic_unit: d.basic_unit,
      received_quantity: d.received_quantity, return_quantity: d.return_quantity,
      unit_price: d.unit_price, return_amount: d.return_amount,
      exchange_quantity: d.exchange_quantity, remark: d.remark || ''
    }))
  }

  if (formData.value.return_number) {
    await updatePurchaseReturn(formData.value.return_number, payload)
    message.success('更新成功')
  } else {
    await createPurchaseReturn(payload)
    message.success('创建成功')
  }
  modalVisible.value = false
  fetchList()
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除退货单「${record.return_number}」吗？`,
    okText: '确定', okType: 'danger', cancelText: '取消',
    async onOk() {
      try { await deletePurchaseReturn(record.return_number); message.success('删除成功'); fetchList() }
      catch { message.error('删除失败') }
    }
  })
}

// ==================== 审批 ====================
const handleApprove = async (record: any) => {
  try {
    const status = (record.approval_status || '').trim()
    if (status === '草稿') {
      await submitPurchaseReturn(record.return_number); message.success('提交审批成功')
    } else {
      await approvePurchaseReturn(record.return_number); message.success('审批通过')
    }
    fetchList()
  } catch { message.error('操作失败') }
}

const handleWithdraw = async (record: any) => {
  Modal.confirm({
    title: '确认撤消', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要撤消退货单「${record.return_number}」的审核吗？`,
    okText: '确定', cancelText: '取消',
    async onOk() {
      try { await withdrawPurchaseReturn(record.return_number); message.success('已撤消审核'); fetchList() }
      catch { message.error('撤消失败') }
    }
  })
}

// ==================== 执行退货 ====================
const handleExecuteReturn = (record: any) => {
  Modal.confirm({
    title: '确认执行退货出库', icon: createVNode(ExclamationCircleOutlined),
    content: `执行退货将扣减库存并回写采购订单，确定要执行退货单「${record.return_number}」吗？`,
    okText: '确定执行', okType: 'danger', cancelText: '取消',
    async onOk() {
      try { await executeReturn(record.return_number); message.success('退货出库执行成功'); fetchList() }
      catch (e: any) { message.error(e?.response?.data?.message || '退货出库失败') }
    }
  })
}

// ==================== 换货入库 ====================
const handleExchangeStockIn = (record: any) => {
  Modal.confirm({
    title: '确认换货入库', icon: createVNode(ExclamationCircleOutlined),
    content: `确认将供应商补发的换货物料入库？`,
    okText: '确认入库', cancelText: '取消',
    async onOk() {
      try { await exchangeStockIn(record.return_number); message.success('换货入库成功'); fetchList() }
      catch (e: any) { message.error(e?.response?.data?.message || '换货入库失败') }
    }
  })
}

const handlePrint = (record: any) => {
  const token = localStorage.getItem('token') || ''
  window.open(`/api/v1/purchase-returns/${encodeURIComponent(record.return_number)}/print?token=${encodeURIComponent(token)}`, '_blank')
}

const isReturnEditable = (record: any) => (record.approval_status || '').trim() === '草稿'
const canExecuteReturn = (record: any) => (record.approval_status || '').trim() === '已审批' && record.return_status !== '已退货'
const canExchangeStockIn = (record: any) => record.return_type === '退货换货' && record.return_status === '已退货' && record.exchange_status !== '已换货'
</script>

<template>
  <div style="padding: 20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0">采购退货</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <a-input-search v-model:value="searchText" placeholder="搜索退货单号/订单号/供应商" style="width:280px" @search="handleSearch" allow-clear />
        <a-select v-model:value="filterApproval" placeholder="审批状态" style="width:120px" allow-clear @change="fetchList()">
          <a-select-option value="草稿">草稿</a-select-option>
          <a-select-option value="待审批">待审批</a-select-option>
          <a-select-option value="已审批">已审批</a-select-option>
          <a-select-option value="已驳回">已驳回</a-select-option>
        </a-select>
        <a-button @click="fetchList()"><template #icon><ReloadOutlined /></template></a-button>
        <a-button @click="openColumnSetting"><template #icon><SettingOutlined /></template>列设置</a-button>
        <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>新建</a-button>
      </div>
    </div>

    <a-table :columns="columns" :data-source="dataList" :loading="loading" :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }" @change="handleTableChange" row-key="return_number" :scroll="{ x: 'max-content' }" size="small" @resizeColumn="handleResizeColumn">
      <template #bodyCell="{ column, record, index }">
        <template v-if="column.key === 'rowIndex'">
          {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
        </template>
        <template v-else-if="column.key === 'approval_status'">
          <ApprovalStatusTag :status="record.approval_status" />
        </template>
        <template v-else-if="column.key === 'return_type'">
          <a-tag :color="record.return_type === '退货换货' ? 'orange' : 'red'">{{ record.return_type }}</a-tag>
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
        <template v-else-if="column.key === 'creation_date'">
          {{ record.creation_date ? record.creation_date.substring(0, 16).replace('T', ' ') : '' }}
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="openView(record)">查看</a-button>
            <a-divider type="vertical" />
            <a-dropdown :trigger="['click']">
              <a-button type="link" size="small" @click.stop>更多<DownOutlined style="font-size: 10px; margin-left: 2px;" /></a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item v-if="isReturnEditable(record)" @click="handleApprove(record)">提交审批</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '待审批'" @click="handleApprove(record)">审批</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() !== '草稿'" @click="handlePrint(record)"><PrinterOutlined style="margin-right:4px" />打印</a-menu-item>
                  <a-menu-item v-if="(record.approval_status || '').trim() === '已审批'" @click="handleWithdraw(record)">撤消</a-menu-item>
                  <a-menu-item v-if="isReturnEditable(record)" @click="openEdit(record)">编辑</a-menu-item>
                  <a-menu-item v-if="canExecuteReturn(record)" @click="handleExecuteReturn(record)">
                    <span style="color: #fa8c16">执行退货</span>
                  </a-menu-item>
                  <a-menu-item v-if="canExchangeStockIn(record)" @click="handleExchangeStockIn(record)">
                    <span style="color: #52c41a">换货入库</span>
                  </a-menu-item>
                  <a-menu-divider v-if="isReturnEditable(record)" />
                  <a-menu-item v-if="isReturnEditable(record)" @click="handleDelete(record)">
                    <span style="color: #ff4d4f">删除</span>
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 新建/编辑/查看弹窗 -->
    <a-modal v-model:open="modalVisible" width="1100px" :style="modalStyle">
      <template #title>
        <div class="drag-handle" @mousedown="onDragStart">{{ isView ? '查看退货单' : (formData.return_number ? '编辑退货单' : '新建退货单') }}</div>
      </template>
      <template #footer>
        <template v-if="isView">
          <a-button @click="modalVisible = false">关闭</a-button>
        </template>
        <template v-else>
          <a-button @click="modalVisible = false">取消</a-button>
          <a-button type="primary" @click="handleSave">保存</a-button>
        </template>
      </template>
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="采购订单号" required>
            <a-select v-model:value="formData.purchase_order_number" show-search option-filter-prop="label" style="width:100%" :disabled="isView || !!formData.return_number" @change="onPOSelect" placeholder="选择采购订单" allow-clear>
              <a-select-option v-for="po in poOptions" :key="po.purchase_order_number" :value="po.purchase_order_number" :label="po.purchase_order_number + ' ' + po.supplier_name">{{ po.purchase_order_number }} {{ po.supplier_name }}</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="供应商名称">
            <a-input :value="formData.supplier_name" disabled />
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="退货类型" required>
            <a-select v-model:value="formData.return_type" style="width:100%" :disabled="isView" @change="onReturnTypeChange">
              <a-select-option value="退货退款">退货退款</a-select-option>
              <a-select-option value="退货换货">退货换货</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="退货仓库" required>
            <a-select v-model:value="formData.warehouse_number" show-search option-filter-prop="label" style="width:100%" :disabled="isView" @change="onWarehouseSelect" placeholder="选择仓库" allow-clear>
              <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number" :label="w.warehouse_number + ' ' + w.warehouse_name">{{ w.warehouse_name }}</a-select-option>
            </a-select>
          </a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="退货原因">
            <a-input v-model:value="formData.return_reason" :disabled="isView" placeholder="填写退货原因" />
          </a-form-item></a-col>
          <a-col :span="12"><a-form-item label="备注">
            <a-input v-model:value="formData.remark" :disabled="isView" />
          </a-form-item></a-col>
        </a-row>
      </a-form>

      <div style="display:flex;justify-content:space-between;align-items:center;margin:12px 0 8px">
        <h4 style="margin:0">退货明细</h4>
      </div>
      <a-table :columns="detailColumns" :data-source="detailRows" :pagination="false" :row-key="(_r: any, i: number) => i" size="small" :scroll="{ x: 1200 }">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'return_quantity' && !isView">
            <a-input-number v-model:value="record.return_quantity" :min="0" :max="parseFloat(record.received_quantity) || 0" :precision="2" style="width:100%" @change="onReturnQtyChange(record)" />
          </template>
          <template v-else-if="column.key === 'unit_price' && !isView">
            <a-input-number v-model:value="record.unit_price" :min="0" :precision="2" style="width:100%" @change="onReturnQtyChange(record)" />
          </template>
          <template v-else-if="column.key === 'return_amount'">
            {{ (parseFloat(record.return_quantity) || 0) * (parseFloat(record.unit_price) || 0) ? ((parseFloat(record.return_quantity) || 0) * (parseFloat(record.unit_price) || 0)).toFixed(2) : '-' }}
          </template>
          <template v-else-if="column.key === 'exchange_status'">
            <a-tag v-if="record.exchange_status" :color="record.exchange_status === '已换货' ? 'green' : 'orange'">{{ record.exchange_status }}</a-tag>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.key === 'action' && !isView">
            <a-button size="small" danger @click="removeDetailRow(index)">删除</a-button>
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

<style scoped>
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
