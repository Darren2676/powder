<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, DownloadOutlined, DeleteOutlined, EyeOutlined, EditOutlined, ImportOutlined } from '@ant-design/icons-vue'
import { getPurchaseOrders, getPurchaseOrderDetail, createPurchaseOrder, updatePurchaseOrder, deletePurchaseOrder, exportPurchaseOrders, closePurchaseOrder, getReceivable } from '@/api/purchasing/purchaseOrder'
import { createStockIn, confirmStockIn } from '@/api/warehouse/stockIn'
import { getItems } from '@/api/master-data/itemMaster'
import { getSuppliers } from '@/api/master-data/supplier'
import { getWarehouses } from '@/api/master-data/warehouse'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval } from '@/api/system/approval'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'

// ==================== 数据 ====================

const dataList = ref<any[]>([])


const filterApproval = ref('')
const filterOrder = ref('')

const modalVisible = ref(false)
const modalTitle = ref('新建采购订单')
const isView = ref(false)
const formData = ref<any>({})
const detailRows = ref<any[]>([])

const itemOptions = ref<any[]>([])
const supplierOptions = ref<any[]>([])
const warehouseOptions = ref<any[]>([])

// 入库弹窗
const stockInVisible = ref(false)
const stockInPON = ref('')
const stockInItems = ref<any[]>([])
const stockInWarehouse = reactive({ warehouse_number: '', warehouse_name: '' })

// ==================== 列定义 ====================
const { loading, dataSource, searchText, pagination, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getPurchaseOrders)

const columns = [
  { title: '采购订单号', dataIndex: 'purchase_order_number', key: 'purchase_order_number', width: 180 },
  { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', width: 150 },
  { title: '采购负责人', dataIndex: 'procurement_manager', key: 'procurement_manager', width: 100 },
  { title: '订单日期', dataIndex: 'order_date', key: 'order_date', width: 110, customRender: ({ text }: any) => text ? dayjs(text).format('YYYY-MM-DD') : '' },
  { title: '交货日期', dataIndex: 'delivery_date', key: 'delivery_date', width: 110, customRender: ({ text }: any) => text ? dayjs(text).format('YYYY-MM-DD') : '' },
  { title: '总金额', dataIndex: 'total_amount', key: 'total_amount', width: 110, customRender: ({ text }: any) => parseFloat(text || 0).toFixed(2) },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '执行状态', dataIndex: 'order_status', key: 'order_status', width: 100 },
  { title: '来源申请', dataIndex: 'source_req_number', key: 'source_req_number', width: 160 },
  { title: '操作', key: 'action', width: 350, fixed: 'right' as const }
]

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
    const [itemRes, supRes, whRes]: any = await Promise.all([
      getItems({ limit: 9999 }), getSuppliers({ limit: 9999 }), getWarehouses({ limit: 9999 })
    ])
    itemOptions.value = itemRes.data?.items || []
    supplierOptions.value = supRes.data?.items || []
    warehouseOptions.value = whRes.data?.items || []
  } catch { /* ignore */ }
}

onMounted(() => { fetchList(); loadDropdowns() })





const openView = async (record: any) => {
  modalTitle.value = '查看采购订单'
  isView.value = true
  const res: any = await getPurchaseOrderDetail(record.purchase_order_number)
  formData.value = res.data?.header || {}
  detailRows.value = res.data?.details || []
  modalVisible.value = true
}

const openEdit = async (record: any) => {
  modalTitle.value = '编辑采购订单'
  isView.value = false
  const res: any = await getPurchaseOrderDetail(record.purchase_order_number)
  formData.value = res.data?.header || {}
  detailRows.value = (res.data?.details || []).map((d: any) => ({ ...d }))
  modalVisible.value = true
}

const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除', content: `确定删除采购订单 ${record.purchase_order_number}？`,
    icon: () => null,
    onOk: async () => {
      await deletePurchaseOrder(record.purchase_order_number)
      message.success('删除成功')
      fetchList()
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

const handleClose = (record: any) => {
  Modal.confirm({
    title: '确认关闭', content: `确定关闭采购订单 ${record.purchase_order_number}？关闭后不可再入库。`,
    icon: () => null,
    onOk: async () => { await closePurchaseOrder(record.purchase_order_number); message.success('关闭成功'); fetchList() }
  })
}

// ==================== 创建入库单 ====================
const openStockIn = async (record: any) => {
  stockInPON.value = record.purchase_order_number
  const res: any = await getReceivable(record.purchase_order_number)
  stockInItems.value = (res.data?.items || []).map((d: any) => ({
    ...d,
    stock_in_quantity: parseFloat(d.remaining) || 0,
    qualified_quantity: parseFloat(d.remaining) || 0,
    unqualified_quantity: 0
  }))
  stockInWarehouse.warehouse_number = ''
  stockInWarehouse.warehouse_name = ''
  stockInVisible.value = true
}

const onWarehouseSelect = (val: string) => {
  const wh = warehouseOptions.value.find((w: any) => w.warehouse_number === val)
  if (wh) {
    stockInWarehouse.warehouse_number = wh.warehouse_number
    stockInWarehouse.warehouse_name = wh.warehouse_name
  }
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

  message.success('入库成功')
  stockInVisible.value = false
  fetchList()
}

// ==================== 导出 ====================
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
        <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>新建</a-button>
      </div>
    </div>

    <a-table :columns="columns" :data-source="dataList" :loading="loading" :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }" @change="handleTableChange" row-key="purchase_order_number" :scroll="{ x: 1400 }" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'approval_status'">
          <ApprovalStatusTag :status="record.approval_status" />
        </template>
        <template v-else-if="column.key === 'order_status'">
          <a-tag :color="record.order_status === '已完成' ? 'green' : record.order_status === '执行中' ? 'blue' : record.order_status === '已关闭' ? 'red' : 'default'">{{ record.order_status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space size="small">
            <a-button size="small" @click="openView(record)"><template #icon><EyeOutlined /></template></a-button>
            <a-button size="small" @click="openEdit(record)" :disabled="record.approval_status !== '草稿'"><template #icon><EditOutlined /></template></a-button>
            <a-button size="small" @click="handleSubmitApproval(record)" :disabled="record.approval_status !== '草稿'">提交</a-button>
            <a-button size="small" @click="handleApprove(record)" :disabled="record.approval_status !== '待审批'">审批</a-button>
            <a-button size="small" @click="handleWithdraw(record)" :disabled="record.approval_status !== '待审批'">撤回</a-button>
            <a-button size="small" @click="handleReverse(record)" :disabled="record.approval_status !== '已审批'">反审</a-button>
            <a-button size="small" type="primary" @click="openStockIn(record)" :disabled="record.approval_status !== '已审批' || record.order_status === '已完成' || record.order_status === '已关闭'"><template #icon><ImportOutlined /></template>入库</a-button>
            <a-button size="small" @click="handleClose(record)" :disabled="record.order_status === '已关闭' || record.order_status === '已完成'">关闭</a-button>
            <a-popconfirm title="确定删除？" @confirm="handleDelete(record)">
              <a-button size="small" danger :disabled="record.approval_status !== '草稿'"><template #icon><DeleteOutlined /></template></a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 编辑/查看弹窗 -->
    <a-modal v-model:open="modalVisible" :title="modalTitle" width="1100px" @ok="handleSave" :ok-button-props="{ style: isView ? { display: 'none' } : {} }" :cancel-text="isView ? '关闭' : '取消'">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="6"><a-form-item label="供应商" required>
            <a-select v-model:value="formData.supplier_number" show-search option-filter-prop="label" style="width:100%" @change="onSupplierSelect" :disabled="isView" placeholder="选择供应商">
              <a-select-option v-for="s in supplierOptions" :key="s.supplier_number" :value="s.supplier_number" :label="s.supplier_number + ' ' + s.supplier_name">{{ s.supplier_name }}</a-select-option>
            </a-select>
          </a-form-item></a-col>
          <a-col :span="6"><a-form-item label="采购负责人"><a-input v-model:value="formData.procurement_manager" :disabled="isView" /></a-form-item></a-col>
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
        { title: '订单数量', dataIndex: 'order_quantity', width: 90 },
        { title: '已入库', dataIndex: 'received_quantity', width: 80 },
        { title: '可入库', dataIndex: 'remaining', width: 80 },
        { title: '本次入库', key: 'stock_in_quantity', width: 100 },
        { title: '合格数量', key: 'qualified_quantity', width: 100 },
        { title: '不合格数量', key: 'unqualified_quantity', width: 100 }
      ]" :data-source="stockInItems" :pagination="false" row-key="id" size="small">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'stock_in_quantity'">
            <a-input-number v-model:value="record.stock_in_quantity" :min="0" :max="parseFloat(record.remaining)" style="width:100%" size="small" @change="record.qualified_quantity = record.stock_in_quantity; record.unqualified_quantity = 0" />
          </template>
          <template v-else-if="column.key === 'qualified_quantity'">
            <a-input-number v-model:value="record.qualified_quantity" :min="0" :max="record.stock_in_quantity" style="width:100%" size="small" @change="record.unqualified_quantity = record.stock_in_quantity - record.qualified_quantity" />
          </template>
          <template v-else-if="column.key === 'unqualified_quantity'">
            <a-input-number v-model:value="record.unqualified_quantity" :min="0" :max="record.stock_in_quantity" style="width:100%" size="small" @change="record.qualified_quantity = record.stock_in_quantity - record.unqualified_quantity" />
          </template>
        </template>
      </a-table>
    </a-modal>
  </div>
</template>
