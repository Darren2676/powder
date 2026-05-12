<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { PlusOutlined, ReloadOutlined, EyeOutlined, DeleteOutlined, CheckCircleOutlined } from '@ant-design/icons-vue'
import { getReceivingNotices, getReceivingNoticeDetail, createReceivingNotice, deleteReceivingNotice, confirmReceivingNotice } from '@/api/purchasing/receivingNotice'
import { getPurchaseOrderDetail, getReceivable, getPurchaseOrders } from '@/api/purchasing/purchaseOrder'
import { getWarehouses } from '@/api/master-data/warehouse'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'

// ==================== 数据 ====================
const dataList = ref<any[]>([])
const filterStatus = ref('')

const modalVisible = ref(false)
const modalTitle = ref('新建采购收货通知')
const isView = ref(false)
const formData = ref<any>({})
const detailRows = ref<any[]>([])

const warehouseOptions = ref<any[]>([])
const poOptions = ref<any[]>([])
const poSearchLoading = ref(false)
const handlePOSearch = async (val: string) => {
  if (!val || val.length < 1) { poOptions.value = []; return }
  poSearchLoading.value = true
  try {
    const res: any = await getPurchaseOrders({ search: val, approval_status: '已审批', limit: 20 })
    poOptions.value = (res.data?.items || []).filter((po: any) => po.order_status !== '已关闭')
  } catch (e: any) {
    message.error('搜索采购订单失败: ' + (e.message || ''))
    poOptions.value = []
  } finally {
    poSearchLoading.value = false
  }
}

// 确认弹窗
const confirmVisible = ref(false)
const confirmRN = ref('')
const confirmDetails = ref<any[]>([])
const confirmWarehouse = reactive({ warehouse_number: '', warehouse_name: '' })

// ==================== 列定义 ====================
const { loading, searchText, pagination } = useTableList(getReceivingNotices)

const columns = [
  { title: '收货通知号', dataIndex: 'receiving_number', key: 'receiving_number', width: 170 },
  { title: '采购订单号', dataIndex: 'purchase_order_number', key: 'purchase_order_number', width: 170 },
  { title: '供应商', dataIndex: 'supplier_name', key: 'supplier_name', width: 150 },
  { title: '送货单号', dataIndex: 'delivery_note', key: 'delivery_note', width: 130 },
  { title: '收货日期', dataIndex: 'receiving_date', key: 'receiving_date', width: 110, customRender: ({ text }: any) => text ? dayjs(text).format('YYYY-MM-DD') : '' },
  { title: '采购员', dataIndex: 'operator', key: 'operator', width: 90 },
  { title: '状态', dataIndex: 'approval_status', key: 'approval_status', width: 90 },
  { title: '操作', key: 'action', width: 240, fixed: 'right' as const }
]

const detailColumns = [
  { title: '物料编码', dataIndex: 'item_number', key: 'item_number', width: 140 },
  { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 150 },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120 },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60 },
  { title: '订单数量', dataIndex: 'order_quantity', key: 'order_quantity', width: 90 },
  { title: '已入库', dataIndex: 'received_quantity', key: 'received_quantity', width: 80 },
  { title: '本次收货', key: 'receiving_quantity', width: 100 },
]

// ==================== 加载 ====================
const fetchList = async () => {
  loading.value = true
  try {
    const res: any = await getReceivingNotices({
      page: pagination.current, limit: pagination.pageSize,
      search: searchText.value, approval_status: filterStatus.value
    })
    dataList.value = res.data?.items || []
    pagination.total = res.data?.pagination?.total || 0
  } finally { loading.value = false }
}

const loadDropdowns = async () => {
  try {
    const [whRes]: any = await Promise.all([
      getWarehouses({ limit: 9999 })
    ])
    warehouseOptions.value = whRes.data?.items || []
  } catch { /* ignore */ }
}

onMounted(() => { fetchList(); loadDropdowns() })

const handleRefresh = () => { fetchList() }
const handleSearch = () => { pagination.current = 1; fetchList() }
const handleReset = () => { searchText.value = ''; pagination.current = 1; fetchList() }
const handlePageChange = (pag: any) => { pagination.current = pag.current; pagination.pageSize = pag.pageSize; fetchList() }

// ==================== 查看 ====================
const openView = async (record: any) => {
  modalTitle.value = '查看采购收货通知'
  isView.value = true
  const res: any = await getReceivingNoticeDetail(record.receiving_number)
  formData.value = res.data?.header || {}
  detailRows.value = res.data?.details || []
  modalVisible.value = true
}

// ==================== 新建（选择PO） ====================
const openCreate = () => {
  modalTitle.value = '新建采购收货通知'
  isView.value = false
  formData.value = { receiving_date: dayjs().format('YYYY-MM-DD') }
  detailRows.value = []
  modalVisible.value = true
}

const onPOSelect = async (val: string) => {
  formData.value.purchase_order_number = val
  detailRows.value = []
  if (!val) return
  try {
    const res: any = await getReceivable(val)
    const items = res.data?.items || []
    detailRows.value = items.map((d: any) => ({
      ...d,
      receiving_quantity: parseFloat(d.remaining) || 0
    }))
  } catch { message.error('加载PO明细失败') }
}

const handleSave = async () => {
  if (!formData.value.purchase_order_number) { message.warning('请选择采购订单'); return }
  const validItems = detailRows.value.filter((d: any) => (parseFloat(d.receiving_quantity) || 0) > 0)
  if (!validItems.length) { message.warning('请填写收货数量'); return }

  await createReceivingNotice({
    purchase_order_number: formData.value.purchase_order_number,
    delivery_note: formData.value.delivery_note || '',
    receiving_date: formData.value.receiving_date || dayjs().format('YYYY-MM-DD'),
    remark: formData.value.remark || '',
    details: validItems.map((d: any) => ({
      purchase_detail_id: d.id,
      item_number: d.item_number,
      item_name: d.item_name,
      specifications: d.specifications,
      basic_unit: d.basic_unit,
      order_quantity: d.order_quantity,
      received_quantity: d.received_quantity,
      receiving_quantity: d.receiving_quantity,
      remark: d.remark || ''
    }))
  })
  message.success('创建收货通知成功')
  modalVisible.value = false
  fetchList()
}

// ==================== 删除 ====================
const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除', content: `确定删除收货通知 ${record.receiving_number}？`,
    icon: () => null,
    onOk: async () => {
      await deleteReceivingNotice(record.receiving_number)
      message.success('删除成功')
      fetchList()
    }
  })
}

// ==================== 确认收货 ====================
const openConfirm = async (record: any) => {
  confirmRN.value = record.receiving_number
  const res: any = await getReceivingNoticeDetail(record.receiving_number)
  confirmDetails.value = (res.data?.details || []).map((d: any) => ({
    ...d,
    qualified_quantity: parseFloat(d.receiving_quantity) || 0,
    unqualified_quantity: 0,
    warehouse_number: d.default_warehouse || '',
    warehouse_name: d.default_warehouse_name || ''
  }))
  confirmWarehouse.warehouse_number = ''
  confirmWarehouse.warehouse_name = ''
  confirmVisible.value = true
}

const onWarehouseSelect = (val: string) => {
  const wh = warehouseOptions.value.find((w: any) => w.warehouse_number === val)
  if (wh) {
    confirmWarehouse.warehouse_number = wh.warehouse_number
    confirmWarehouse.warehouse_name = wh.warehouse_name
    // 批量填充到所有行
    for (const row of confirmDetails.value) {
      row.warehouse_number = wh.warehouse_number
      row.warehouse_name = wh.warehouse_name
    }
  }
}

const onLineWarehouseChange = (record: any, val: string) => {
  const wh = warehouseOptions.value.find((w: any) => w.warehouse_number === val)
  if (wh) {
    record.warehouse_number = wh.warehouse_number
    record.warehouse_name = wh.warehouse_name
  }
}

const handleConfirm = async () => {
  // 校验每行都有仓库
  const missingWh = confirmDetails.value.find((d: any) => !d.warehouse_number)
  if (missingWh) { message.warning(`物料 ${missingWh.item_number} 未选择入库仓库`); return }

  const qualifiedQtys: any = {}
  const unqualifiedQtys: any = {}
  const lineWarehouses: any = {}
  for (const d of confirmDetails.value) {
    qualifiedQtys[d.item_number] = parseFloat(d.qualified_quantity) || 0
    unqualifiedQtys[d.item_number] = parseFloat(d.unqualified_quantity) || 0
    lineWarehouses[d.item_number] = {
      warehouse_number: d.warehouse_number,
      warehouse_name: d.warehouse_name
    }
  }

  await confirmReceivingNotice(confirmRN.value, {
    warehouse_number: confirmWarehouse.warehouse_number,
    warehouse_name: confirmWarehouse.warehouse_name,
    qualified_quantities: qualifiedQtys,
    unqualified_quantities: unqualifiedQtys,
    line_warehouses: lineWarehouses
  })
  message.success('确认收货成功')
  confirmVisible.value = false
  fetchList()
}
</script>

<template>
  <div style="padding: 20px">
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0">采购收货通知</h2>
      <div style="display:flex;gap:8px;align-items:center">
        <a-input-search v-model:value="searchText" placeholder="搜索通知号/订单号/供应商" style="width:260px" @search="handleSearch" allow-clear />
        <a-select v-model:value="filterStatus" placeholder="状态" style="width:110px" allow-clear @change="handleSearch">
          <a-select-option value="待确认">待确认</a-select-option>
          <a-select-option value="已确认">已确认</a-select-option>
        </a-select>
        <a-button @click="handleRefresh"><template #icon><ReloadOutlined /></template></a-button>
        <a-button type="primary" @click="openCreate"><template #icon><PlusOutlined /></template>新建</a-button>
      </div>
    </div>

    <a-table :columns="columns" :data-source="dataList" :loading="loading" :pagination="{ current: pagination.current, pageSize: pagination.pageSize, total: pagination.total, showSizeChanger: true, showTotal: (t: number) => `共 ${t} 条` }" @change="handlePageChange" row-key="receiving_number" :scroll="{ x: 1100 }" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'approval_status'">
          <a-tag :color="record.approval_status === '已确认' ? 'green' : 'orange'">{{ record.approval_status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space size="small">
            <a-button size="small" @click="openView(record)"><template #icon><EyeOutlined /></template>查看</a-button>
            <a-button size="small" type="primary" @click="openConfirm(record)" :disabled="record.approval_status !== '待确认'"><template #icon><CheckCircleOutlined /></template>确认收货</a-button>
            <a-popconfirm title="确定删除？" @confirm="handleDelete(record)">
              <a-button size="small" danger :disabled="record.approval_status !== '待确认'"><template #icon><DeleteOutlined /></template></a-button>
            </a-popconfirm>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 新建/查看弹窗 -->
    <a-modal v-model:open="modalVisible" :title="modalTitle" width="1000px" @ok="handleSave" :ok-button-props="{ style: isView ? { display: 'none' } : {} }" :cancel-text="isView ? '关闭' : '取消'">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="isView ? 8 : 12">
            <a-form-item label="采购订单号" required>
              <a-auto-complete v-if="!isView" v-model:value="formData.purchase_order_number" style="width:100%" placeholder="输入订单号搜索" :options="poOptions.map((po: any) => ({ value: po.purchase_order_number, label: po.purchase_order_number + ' ' + po.supplier_name }))" @search="handlePOSearch" @select="onPOSelect" allow-clear />
              <a-input v-else :value="formData.purchase_order_number" disabled />
            </a-form-item>
          </a-col>
          <a-col :span="isView ? 8 : 12">
            <a-form-item label="送货单号">
              <a-input v-if="!isView" v-model:value="formData.delivery_note" placeholder="供应商送货单号" />
              <span v-else>{{ formData.delivery_note || '-' }}</span>
            </a-form-item>
          </a-col>
          <a-col :span="8">
            <a-form-item label="收货日期">
              <a-date-picker v-if="!isView" v-model:value="formData.receiving_date" style="width:100%" value-format="YYYY-MM-DD" />
              <span v-else>{{ formData.receiving_date ? dayjs(formData.receiving_date).format('YYYY-MM-DD') : '-' }}</span>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16" v-if="isView">
          <a-col :span="8"><a-form-item label="供应商"><span>{{ formData.supplier_name || '-' }}</span></a-form-item></a-col>
          <a-col :span="8"><a-form-item label="采购员"><span>{{ formData.operator || '-' }}</span></a-form-item></a-col>
          <a-col :span="8"><a-form-item label="状态"><a-tag :color="formData.approval_status === '已确认' ? 'green' : 'orange'">{{ formData.approval_status }}</a-tag></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16" v-if="!isView">
          <a-col :span="12"><a-form-item label="备注"><a-input v-model:value="formData.remark" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16" v-if="isView">
          <a-col :span="24"><a-form-item label="备注"><span>{{ formData.remark || '-' }}</span></a-form-item></a-col>
        </a-row>
      </a-form>

      <h4 style="margin:12px 0 8px">收货明细</h4>
      <a-table :columns="detailColumns" :data-source="detailRows" :pagination="false" row-key="(r: any, i: number) => i" size="small" :scroll="{ x: 800 }">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'receiving_quantity' && !isView">
            <a-input-number v-model:value="record.receiving_quantity" :min="0" :max="parseFloat(record.remaining || record.order_quantity)" style="width:100%" size="small" />
          </template>
        </template>
      </a-table>
    </a-modal>

    <!-- 确认收货弹窗 -->
    <a-modal v-model:open="confirmVisible" title="确认收货" width="1100px" @ok="handleConfirm" ok-text="确认入库">
      <a-form layout="vertical">
        <a-row :gutter="16">
          <a-col :span="8"><a-form-item label="收货通知号"><a-input :value="confirmRN" disabled /></a-form-item></a-col>
          <a-col :span="8"><a-form-item label="批量设置仓库">
            <a-select v-model:value="confirmWarehouse.warehouse_number" show-search option-filter-prop="label" style="width:100%" @change="onWarehouseSelect" placeholder="选择仓库后批量填充到所有行" allow-clear>
              <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number" :label="w.warehouse_number + ' ' + w.warehouse_name">{{ w.warehouse_name }}</a-select-option>
            </a-select>
          </a-form-item></a-col>
        </a-row>
      </a-form>
      <h4>确认明细</h4>
      <a-table :columns="[
        { title: '物料编码', dataIndex: 'item_number', width: 120 },
        { title: '物料名称', dataIndex: 'item_name', width: 120 },
        { title: '规格', dataIndex: 'specifications', width: 90 },
        { title: '单位', dataIndex: 'basic_unit', width: 50 },
        { title: '收货数量', dataIndex: 'receiving_quantity', width: 80 },
        { title: '入库仓库', key: 'warehouse', width: 150 },
        { title: '合格数量', key: 'qualified_quantity', width: 90 },
        { title: '不合格数量', key: 'unqualified_quantity', width: 90 }
      ]" :data-source="confirmDetails" :pagination="false" row-key="item_number" size="small">
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'warehouse'">
            <a-select v-model:value="record.warehouse_number" show-search option-filter-prop="label" style="width:100%" size="small" @change="(val: string) => onLineWarehouseChange(record, val)" placeholder="选择仓库">
              <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number" :label="w.warehouse_number + ' ' + w.warehouse_name">{{ w.warehouse_name }}</a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'qualified_quantity'">
            <a-input-number v-model:value="record.qualified_quantity" :min="0" :max="record.receiving_quantity" style="width:100%" size="small" @change="record.unqualified_quantity = (parseFloat(record.receiving_quantity) || 0) - (parseFloat(record.qualified_quantity) || 0)" />
          </template>
          <template v-else-if="column.key === 'unqualified_quantity'">
            <a-input-number v-model:value="record.unqualified_quantity" :min="0" :max="record.receiving_quantity" style="width:100%" size="small" @change="record.qualified_quantity = (parseFloat(record.receiving_quantity) || 0) - (parseFloat(record.unqualified_quantity) || 0)" />
          </template>
        </template>
      </a-table>
    </a-modal>
  </div>
</template>
