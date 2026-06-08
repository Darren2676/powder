<script setup lang="ts">
import { ref, reactive, onMounted, computed, watch, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  SearchOutlined, ReloadOutlined, PlusOutlined,
  DeleteOutlined, ExclamationCircleOutlined, DownOutlined, UndoOutlined
} from '@ant-design/icons-vue'
import {
  getAbnormalIOList, getAbnormalIODetail, createAbnormalIO,
  updateAbnormalIO, deleteAbnormalIO, confirmAbnormalIO, rejectAbnormalIO, withdrawAbnormalIO
} from '@/api/warehouse/abnormalIO'
import { getWarehouseOptions } from '@/api/warehouse/finishedGoods'
import { getItemOptions } from '@/api/warehouse/materialWarehouse'
import { getFactories } from '@/api/system/factory'
import { useModalDrag } from '@/composables/useModalDrag'
import { useOpenAccountingPeriods } from '@/composables/useOpenAccountingPeriods'
import dayjs from 'dayjs'

const { modalStyle, onDragStart, resetDrag } = useModalDrag()
const { modalStyle: detailModalStyle, onDragStart: onDetailDragStart, resetDrag: resetDetailDrag } = useModalDrag()
const { modalStyle: confirmModalStyle, onDragStart: onConfirmDragStart, resetDrag: resetConfirmDrag } = useModalDrag()
const { openPeriodOptions, openPeriodLoading, noOpenPeriod, fetchOpenPeriods, getDefaultPeriod } = useOpenAccountingPeriods()

const loading = ref(false)
const dataSource = ref<any[]>([])
const searchText = ref('')
const filterType = ref('')
const filterStatus = ref('')
const factoryFilter = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch (e) { /* ignore */ }
}
const warehouseOptions = ref<any[]>([])

const typeOptions = ['退货入库', '报废出库', '调拨出入库', '盘盈盘亏']
const statusOptions = ['待确认', '已确认', '已驳回', '已撤消']

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const columns = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '单号', dataIndex: 'request_number', key: 'request_number', width: 170 },
  { title: '类型', dataIndex: 'type', key: 'type', width: 110 },
  { title: '状态', dataIndex: 'status', key: 'status', width: 90 },
  { title: '仓库', dataIndex: 'warehouse_name', key: 'warehouse_name', width: 120 },
  { title: '目标仓库', dataIndex: 'target_warehouse_name', key: 'target_warehouse_name', width: 120 },
  { title: '客户', dataIndex: 'customer_name', key: 'customer_name', width: 130 },
  { title: '原因', dataIndex: 'reason', key: 'reason', width: 150, ellipsis: true },
  { title: '申请人', dataIndex: 'creation_man', key: 'creation_man', width: 90 },
  { title: '申请日期', dataIndex: 'creation_date', key: 'creation_date', width: 110 },
  { title: '会计期间', dataIndex: 'accounting_period', key: 'accounting_period', width: 100 },
  { title: '确认人', dataIndex: 'confirmed_by', key: 'confirmed_by', width: 90 },
  { title: '确认日期', dataIndex: 'confirmed_date', key: 'confirmed_date', width: 110 },
  { title: '操作', key: 'action', width: 120, fixed: 'right' as const }
]

const formatDate = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}

const formatDateTime = (date: any) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const statusColor = (status: string) => {
  if (status === '待确认') return 'orange'
  if (status === '已确认') return 'green'
  if (status === '已驳回') return 'red'
  if (status === '已撤消') return 'default'
  return 'default'
}

const typeColor = (type: string) => {
  if (type === '退货入库') return 'blue'
  if (type === '报废出库') return 'red'
  if (type === '调拨出入库') return 'purple'
  if (type === '盘盈盘亏') return 'cyan'
  return 'default'
}

// ==================== 数据加载 ====================
const fetchData = async () => {
  loading.value = true
  try {
    const res: any = await getAbnormalIOList({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value,
      type: filterType.value,
      status: filterStatus.value,
      factory_id: factoryFilter.value || undefined
    })
    if (res?.success) {
      dataSource.value = res.data.items || []
      pagination.total = res.data.total || 0
    }
  } catch {
    message.error('获取列表失败')
  } finally {
    loading.value = false
  }
}

const fetchWarehouseOptions = async () => {
  try {
    const res: any = await getWarehouseOptions()
    if (res?.success) warehouseOptions.value = res.data || []
  } catch { /* ignore */ }
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

// ==================== 新建/编辑弹窗 ====================
const formVisible = ref(false)
const formLoading = ref(false)
const isEdit = ref(false)
let detailSeq = 0
const form = reactive({
  request_number: '',
  type: '',
  customer_number: '',
  customer_name: '',
  original_shipping_number: '',
  warehouse_number: '',
  warehouse_name: '',
  target_warehouse_number: '',
  target_warehouse_name: '',
  reason: '',
  remark: '',
  accounting_period: '',
  details: [] as any[]
})

const formTitle = computed(() => isEdit.value ? '编辑其他出入库申请' : '新建其他出入库申请')

const showTargetWarehouse = computed(() => form.type === '调拨出入库')
const showCustomer = computed(() => form.type === '退货入库')
const showStockCountFields = computed(() => form.type === '盘盈盘亏')

const handleCreate = () => {
  isEdit.value = false
  form.request_number = ''
  form.type = ''
  form.customer_number = ''
  form.customer_name = ''
  form.original_shipping_number = ''
  form.warehouse_number = ''
  form.warehouse_name = ''
  form.target_warehouse_number = ''
  form.target_warehouse_name = ''
  form.reason = ''
  form.remark = ''
  form.accounting_period = getDefaultPeriod()
  if (noOpenPeriod.value) {
    message.warning('当前没有已开启的会计期间，请联系财务开启后再操作')
  }
  form.details = []
  resetDrag()
  formVisible.value = true
}

const handleEdit = async (record: any) => {
  isEdit.value = true
  try {
    const res: any = await getAbnormalIODetail(record.request_number)
    if (res?.success) {
      const h = res.data.header
      form.request_number = h.request_number
      form.type = h.type
      form.customer_number = h.customer_number || ''
      form.customer_name = h.customer_name || ''
      form.original_shipping_number = h.original_shipping_number || ''
      form.warehouse_number = h.warehouse_number
      form.warehouse_name = h.warehouse_name
      form.target_warehouse_number = h.target_warehouse_number || ''
      form.target_warehouse_name = h.target_warehouse_name || ''
      form.reason = h.reason || ''
      form.remark = h.remark || ''
      form.accounting_period = h.accounting_period || ''
      form.details = (res.data.details || []).map((d: any) => ({
        ...d,
        _key: ++detailSeq,
        _keyword: d.item_number ? `${d.item_number} - ${d.item_name || ''}` : '',
        _options: []
      }))
      resetDrag()
      formVisible.value = true
    }
  } catch {
    message.error('获取详情失败')
  }
}

const handleWarehouseChange = (value: string) => {
  const w = warehouseOptions.value.find((o: any) => o.warehouse_number === value)
  if (w) {
    form.warehouse_number = w.warehouse_number
    form.warehouse_name = w.warehouse_name
  }
}

const handleTargetWarehouseChange = (value: string) => {
  const w = warehouseOptions.value.find((o: any) => o.warehouse_number === value)
  if (w) {
    form.target_warehouse_number = w.warehouse_number
    form.target_warehouse_name = w.warehouse_name
  }
}

const addDetailLine = () => {
  form.details.push({
    _key: ++detailSeq,
    item_number: '',
    item_name: '',
    specifications: '',
    basic_unit: '',
    product_drawing_number: '',
    batch_number: '',
    quantity: 0,
    system_quantity: 0,
    actual_quantity: 0,
    difference_quantity: 0,
    remark: '',
    _keyword: '',
    _options: []
  })
}

const onItemSearch = async (val: string, index: number) => {
  if (!val || val.length < 1) { form.details[index]._options = []; return }
  try {
    const res: any = await getItemOptions({ keyword: val, item_type: 'all' })
    const items = res?.data || []
    form.details[index]._options = items.map((i: any) => ({
      value: i.item_number,
      label: `${i.item_number} - ${i.item_name}${i.specifications ? ' (' + i.specifications + ')' : ''}`,
      raw: i
    }))
  } catch { /* ignore */ }
}

const onItemSelect = (val: string, index: number) => {
  const opt = form.details[index]._options.find((o: any) => o.value === val)
  if (opt?.raw) {
    const r = opt.raw
    Object.assign(form.details[index], {
      item_number: r.item_number,
      item_name: r.item_name,
      specifications: r.specifications || '',
      basic_unit: r.basic_unit || '',
      product_drawing_number: r.product_drawing_number || '',
      _keyword: `${r.item_number} - ${r.item_name}`
    })
  }
}

const removeDetailLine = (index: number) => {
  form.details.splice(index, 1)
}

// 盘盈盘亏：自动计算差异
const calcDifference = (detail: any) => {
  detail.difference_quantity = (Number(detail.actual_quantity) || 0) - (Number(detail.system_quantity) || 0)
}

const detailColumns = computed(() => {
  const base = [
    { title: '行', key: 'index', width: 40 },
    { title: '物料编号', dataIndex: 'item_number', key: 'item_number', width: 220 },
    { title: '物料名称', dataIndex: 'item_name', key: 'item_name', width: 140 },
    { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 110 },
    { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', width: 60 },
    { title: '批次号', dataIndex: 'batch_number', key: 'batch_number', width: 130 }
  ]

  if (showStockCountFields.value) {
    base.push(
      { title: '系统数量', dataIndex: 'system_quantity', key: 'system_quantity', width: 100 },
      { title: '实盘数量', dataIndex: 'actual_quantity', key: 'actual_quantity', width: 100 },
      { title: '差异', dataIndex: 'difference_quantity', key: 'difference_quantity', width: 90 }
    )
  } else {
    base.push(
      { title: '数量', dataIndex: 'quantity', key: 'quantity', width: 100 }
    )
  }

  base.push({ title: '操作', key: 'detailAction', width: 60 })
  return base
})

const handleFormSubmit = async () => {
  if (!form.type) { message.warning('请选择操作类型'); return }
  if (!form.warehouse_number) { message.warning('请选择仓库'); return }
  if (form.type === '调拨出入库' && !form.target_warehouse_number) {
    message.warning('请选择目标仓库'); return
  }
  if (form.details.length === 0) { message.warning('请添加至少一条明细'); return }

  const invalidLines = form.details.filter(d => !d.item_number)
  if (invalidLines.length > 0) { message.warning('请填写所有明细行的物料编号'); return }

  formLoading.value = true
  try {
    const payload = {
      type: form.type,
      customer_number: form.customer_number,
      customer_name: form.customer_name,
      original_shipping_number: form.original_shipping_number,
      warehouse_number: form.warehouse_number,
      warehouse_name: form.warehouse_name,
      target_warehouse_number: form.target_warehouse_number,
      target_warehouse_name: form.target_warehouse_name,
      reason: form.reason,
      remark: form.remark,
      accounting_period: form.accounting_period,
      details: form.details
    }

    let res: any
    if (isEdit.value) {
      res = await updateAbnormalIO(form.request_number, payload)
    } else {
      res = await createAbnormalIO(payload)
    }

    if (res?.success) {
      message.success(isEdit.value ? '更新成功' : `创建成功，单号: ${res.data?.request_number || ''}`)
      formVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '操作失败')
  } finally {
    formLoading.value = false
  }
}

// ==================== 详情弹窗 ====================
const detailVisible = ref(false)
const detailData = ref<any>({ header: {}, details: [] })
const detailLoading = ref(false)

const handleView = async (record: any) => {
  resetDetailDrag()
  detailLoading.value = true
  detailVisible.value = true
  try {
    const res: any = await getAbnormalIODetail(record.request_number)
    if (res?.success) {
      detailData.value = res.data
    }
  } catch {
    message.error('获取详情失败')
  } finally {
    detailLoading.value = false
  }
}

const viewDetailColumns = computed(() => {
  const h = detailData.value.header
  const base = [
    { title: '行号', dataIndex: 'line_number', width: 50 },
    { title: '物料编号', dataIndex: 'item_number', width: 120 },
    { title: '物料名称', dataIndex: 'item_name', width: 140 },
    { title: '规格', dataIndex: 'specifications', width: 110 },
    { title: '单位', dataIndex: 'basic_unit', width: 60 },
    { title: '批次号', dataIndex: 'batch_number', width: 130 }
  ]
  if (h?.type === '盘盈盘亏') {
    base.push(
      { title: '系统数量', dataIndex: 'system_quantity', width: 100 },
      { title: '实盘数量', dataIndex: 'actual_quantity', width: 100 },
      { title: '差异', dataIndex: 'difference_quantity', width: 90 }
    )
  } else {
    base.push({ title: '数量', dataIndex: 'quantity', width: 100 })
  }
  base.push({ title: '备注', dataIndex: 'remark', width: 120 })
  return base
})

// ==================== 删除 ====================
const handleDelete = (record: any) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除其他出入库单「${(record.request_number || '').trim()}」吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await deleteAbnormalIO(record.request_number)
        if (res?.success) { message.success('删除成功'); fetchData() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

// ==================== 撤消确认 ====================
const handleWithdraw = (record: any) => {
  Modal.confirm({
    title: '确认撤消',
    icon: createVNode(ExclamationCircleOutlined),
    content: `将撤消「${(record.request_number || '').trim()}」的确认操作，已执行的库存变更将被回退。此操作不可撤销，确定继续？`,
    okText: '确定撤消',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res: any = await withdrawAbnormalIO(record.request_number)
        if (res?.success) { message.success('撤消成功，库存已回退'); fetchData() }
        else { message.error(res.message || '撤消失败') }
      } catch (err: any) { message.error(err.response?.data?.message || '撤消失败') }
    }
  })
}

// ==================== 确认/驳回 ====================
const confirmRemarkVisible = ref(false)
const confirmRemarkText = ref('')
const confirmAction = ref<'confirm' | 'reject'>('confirm')
const confirmTargetNumber = ref('')

const showConfirmModal = (record: any) => {
  confirmAction.value = 'confirm'
  confirmTargetNumber.value = record.request_number
  confirmRemarkText.value = ''
  resetConfirmDrag()
  confirmRemarkVisible.value = true
}

const showRejectModal = (record: any) => {
  confirmAction.value = 'reject'
  confirmTargetNumber.value = record.request_number
  confirmRemarkText.value = ''
  resetConfirmDrag()
  confirmRemarkVisible.value = true
}

const confirmActionLoading = ref(false)

const handleConfirmAction = async () => {
  confirmActionLoading.value = true
  try {
    const fn = confirmAction.value === 'confirm' ? confirmAbnormalIO : rejectAbnormalIO
    const res: any = await fn(confirmTargetNumber.value, { confirm_remark: confirmRemarkText.value })
    if (res?.success) {
      message.success(confirmAction.value === 'confirm' ? '确认成功，库存已更新' : '已驳回')
      confirmRemarkVisible.value = false
      fetchData()
    }
  } catch (err: any) {
    message.error(err.response?.data?.message || '操作失败')
  } finally {
    confirmActionLoading.value = false
  }
}

onMounted(() => {
  fetchOpenPeriods()
  fetchWarehouseOptions()
  loadFactories()
  fetchData()
})
</script>

<template>
  <div style="padding: 20px">
    <!-- 工具栏 -->
    <div style="margin-bottom: 16px; display: flex; align-items: center; justify-content: space-between; flex-wrap: nowrap; overflow-x: auto">
      <span style="font-size: 18px; font-weight: 600; white-space: nowrap; flex-shrink: 0">其他出入库</span>
      <div style="display: flex; gap: 8px; align-items: center; flex-wrap: nowrap">
        <a-select
          v-model:value="factoryFilter"
          placeholder="选择工厂"
          style="width: 130px"
          allow-clear
          @change="handleSearch"
        >
          <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">
            {{ f.factory_short || f.factory_name }}
          </a-select-option>
        </a-select>
        <a-input-search
          v-model:value="searchText"
          placeholder="搜索单号/客户/仓库/原因"
          style="width: 260px"
          @search="handleSearch"
          @pressEnter="handleSearch"
          allow-clear
        >
          <template #prefix><SearchOutlined /></template>
        </a-input-search>
        <a-select v-model:value="filterType" placeholder="操作类型" allow-clear style="width: 130px" @change="handleSearch">
          <a-select-option v-for="t in typeOptions" :key="t" :value="t">{{ t }}</a-select-option>
        </a-select>
        <a-select v-model:value="filterStatus" placeholder="状态" allow-clear style="width: 110px" @change="handleSearch">
          <a-select-option v-for="s in statusOptions" :key="s" :value="s">{{ s }}</a-select-option>
        </a-select>
        <a-button @click="fetchData"><ReloadOutlined /> 刷新</a-button>
        <a-button type="primary" @click="handleCreate"><PlusOutlined /> 新建申请</a-button>
      </div>
    </div>

    <!-- 列表 -->
    <a-table
      :columns="columns"
      :data-source="dataSource"
      :loading="loading"
      :pagination="pagination"
      row-key="id"
      :scroll="{ x: 'max-content' }"
      size="small"
      bordered
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'type'">
          <a-tag :color="typeColor(record.type)">{{ record.type }}</a-tag>
        </template>
        <template v-else-if="column.key === 'status'">
          <a-tag :color="statusColor(record.status)">{{ record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'creation_date'">
          {{ formatDate(record.creation_date) }}
        </template>
        <template v-else-if="column.key === 'confirmed_date'">
          {{ formatDate(record.confirmed_date) }}
        </template>
        <template v-else-if="column.key === 'target_warehouse_name'">
          {{ record.type === '调拨出入库' ? record.target_warehouse_name : '-' }}
        </template>
        <template v-else-if="column.key === 'action'">
          <a-space :size="4">
            <a-button type="link" size="small" @click="handleView(record)">
              查看
            </a-button>
            <a-divider type="vertical" />
            <a-dropdown :trigger="['click']">
              <a-button type="link" size="small" @click.stop>
                更多<DownOutlined style="font-size: 10px; margin-left: 2px;" />
              </a-button>
              <template #overlay>
                <a-menu>
                  <a-menu-item v-if="(record.status || '').trim() === '待确认'" @click="showConfirmModal(record)">确认</a-menu-item>
                  <a-menu-item v-if="(record.status || '').trim() === '待确认'" @click="showRejectModal(record)">驳回</a-menu-item>
                  <a-menu-item v-if="(record.status || '').trim() === '已确认'" @click="handleWithdraw(record)"><UndoOutlined style="color: #ff4d4f; margin-right: 6px;" />撤消确认</a-menu-item>
                  <a-menu-item v-if="(record.status || '').trim() === '待确认' || (record.status || '').trim() === '已驳回' || (record.status || '').trim() === '已撤消'" @click="handleEdit(record)">编辑</a-menu-item>
                  <a-menu-divider v-if="(record.status || '').trim() !== '已确认'" />
                  <a-menu-item v-if="(record.status || '').trim() === '待确认' || (record.status || '').trim() === '已驳回' || (record.status || '').trim() === '已撤消'" @click="handleDelete(record)">
                    <span style="color: #ff4d4f">删除</span>
                  </a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </a-space>
        </template>
      </template>
    </a-table>

    <!-- 新建/编辑弹窗 -->
    <a-modal
      v-model:open="formVisible"
      width="1100px"
      :bodyStyle="{ maxHeight: '75vh', overflowY: 'auto' }"
      @ok="handleFormSubmit"
      :confirmLoading="formLoading"
      :okText="isEdit ? '保存' : '提交申请'"
      :style="modalStyle"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onDragStart">{{ formTitle }}</div>
      </template>
      <a-form layout="vertical" style="margin-bottom: 16px">
        <a-row :gutter="16">
          <a-col :span="6">
            <a-form-item label="操作类型" required>
              <a-select v-model:value="form.type" placeholder="请选择" :disabled="isEdit">
                <a-select-option v-for="t in typeOptions" :key="t" :value="t">{{ t }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="6">
            <a-form-item label="仓库" required>
              <a-select
                v-model:value="form.warehouse_number"
                placeholder="请选择仓库"
                @change="handleWarehouseChange"
              >
                <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number">
                  {{ w.warehouse_name }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="6" v-if="showTargetWarehouse">
            <a-form-item label="目标仓库" required>
              <a-select
                v-model:value="form.target_warehouse_number"
                placeholder="请选择目标仓库"
                @change="handleTargetWarehouseChange"
              >
                <a-select-option v-for="w in warehouseOptions" :key="w.warehouse_number" :value="w.warehouse_number">
                  {{ w.warehouse_name }}
                </a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="6" v-if="showCustomer">
            <a-form-item label="客户名称">
              <a-input v-model:value="form.customer_name" placeholder="退货客户" />
            </a-form-item>
          </a-col>
          <a-col :span="6" v-if="showCustomer">
            <a-form-item label="原发货单号">
              <a-input v-model:value="form.original_shipping_number" placeholder="可选" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="原因">
              <a-input v-model:value="form.reason" placeholder="请填写原因" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="备注">
              <a-input v-model:value="form.remark" placeholder="可选" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="6">
            <a-form-item label="会计期间">
              <a-select v-model:value="form.accounting_period" placeholder="请选择会计期间"
                :loading="openPeriodLoading" style="width: 100%">
                <a-select-option v-for="opt in openPeriodOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</a-select-option>
                <a-select-option v-if="noOpenPeriod" disabled value="">无已开启期间</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>

      <!-- 明细行 -->
      <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center">
        <span style="font-weight: 600">明细行</span>
        <a-button size="small" type="dashed" @click="addDetailLine"><PlusOutlined /> 添加行</a-button>
      </div>

      <a-table
        :columns="detailColumns"
        :data-source="form.details"
        :pagination="false"
        row-key="_key"
        size="small"
        bordered
        :scroll="{ x: 950 }"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'index'">{{ index + 1 }}</template>
          <template v-else-if="column.key === 'item_number'">
            <a-auto-complete
              v-model:value="record._keyword"
              :options="record._options"
              size="small"
              style="width: 100%"
              placeholder="输入编号/名称搜索"
              @search="(v: string) => onItemSearch(v, index)"
              @select="(v: string) => onItemSelect(v, index)"
            />
          </template>
          <template v-else-if="column.key === 'item_name'">
            {{ record.item_name || '-' }}
          </template>
          <template v-else-if="column.key === 'specifications'">
            {{ record.specifications || '-' }}
          </template>
          <template v-else-if="column.key === 'basic_unit'">
            {{ record.basic_unit || '-' }}
          </template>
          <template v-else-if="column.key === 'batch_number'">
            <a-input v-model:value="record.batch_number" size="small" placeholder="批次号" />
          </template>
          <template v-else-if="column.key === 'quantity'">
            <a-input-number v-model:value="record.quantity" :min="0" size="small" style="width: 100%" />
          </template>
          <template v-else-if="column.key === 'system_quantity'">
            <a-input-number v-model:value="record.system_quantity" :min="0" size="small" style="width: 100%" @change="calcDifference(record)" />
          </template>
          <template v-else-if="column.key === 'actual_quantity'">
            <a-input-number v-model:value="record.actual_quantity" :min="0" size="small" style="width: 100%" @change="calcDifference(record)" />
          </template>
          <template v-else-if="column.key === 'difference_quantity'">
            <span :style="{ color: record.difference_quantity > 0 ? '#52c41a' : record.difference_quantity < 0 ? '#ff4d4f' : '' }">
              {{ record.difference_quantity > 0 ? '+' : '' }}{{ record.difference_quantity }}
            </span>
          </template>
          <template v-else-if="column.key === 'detailAction'">
            <a-button type="link" size="small" danger @click="removeDetailLine(index)">
              <DeleteOutlined />
            </a-button>
          </template>
        </template>
      </a-table>
    </a-modal>

    <!-- 详情弹窗 -->
    <a-modal
      v-model:open="detailVisible"
      width="1000px"
      :bodyStyle="{ maxHeight: '75vh', overflowY: 'auto' }"
      :footer="null"
      :style="detailModalStyle"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onDetailDragStart">其他出入库详情</div>
      </template>
      <a-spin :spinning="detailLoading">
        <a-descriptions bordered size="small" :column="3" style="margin-bottom: 16px">
          <a-descriptions-item label="单号">{{ detailData.header?.request_number }}</a-descriptions-item>
          <a-descriptions-item label="类型">
            <a-tag :color="typeColor(detailData.header?.type)">{{ detailData.header?.type }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="状态">
            <a-tag :color="statusColor(detailData.header?.status)">{{ detailData.header?.status }}</a-tag>
          </a-descriptions-item>
          <a-descriptions-item label="仓库">{{ detailData.header?.warehouse_name }}</a-descriptions-item>
          <a-descriptions-item label="会计期间">{{ detailData.header?.accounting_period || '-' }}</a-descriptions-item>
          <a-descriptions-item label="目标仓库" v-if="detailData.header?.type === '调拨出入库'">
            {{ detailData.header?.target_warehouse_name }}
          </a-descriptions-item>
          <a-descriptions-item label="客户" v-if="detailData.header?.type === '退货入库'">
            {{ detailData.header?.customer_name }}
          </a-descriptions-item>
          <a-descriptions-item label="原因" :span="2">{{ detailData.header?.reason || '-' }}</a-descriptions-item>
          <a-descriptions-item label="备注">{{ detailData.header?.remark || '-' }}</a-descriptions-item>
          <a-descriptions-item label="申请人">{{ detailData.header?.creation_man }}</a-descriptions-item>
          <a-descriptions-item label="申请日期">{{ formatDateTime(detailData.header?.creation_date) }}</a-descriptions-item>
          <a-descriptions-item label="确认人">{{ detailData.header?.confirmed_by || '-' }}</a-descriptions-item>
          <a-descriptions-item label="确认日期">{{ formatDateTime(detailData.header?.confirmed_date) }}</a-descriptions-item>
          <a-descriptions-item label="确认备注" :span="2">{{ detailData.header?.confirm_remark || '-' }}</a-descriptions-item>
        </a-descriptions>

        <div style="font-weight: 600; margin-bottom: 8px">明细行</div>
        <a-table
          :columns="viewDetailColumns"
          :data-source="detailData.details"
          :pagination="false"
          row-key="id"
          size="small"
          bordered
          :scroll="{ x: 850 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'difference_quantity'">
              <span :style="{ color: record.difference_quantity > 0 ? '#52c41a' : record.difference_quantity < 0 ? '#ff4d4f' : '' }">
                {{ record.difference_quantity > 0 ? '+' : '' }}{{ record.difference_quantity }}
              </span>
            </template>
          </template>
        </a-table>
      </a-spin>
    </a-modal>

    <!-- 确认/驳回备注弹窗 -->
    <a-modal
      v-model:open="confirmRemarkVisible"
      @ok="handleConfirmAction"
      :confirmLoading="confirmActionLoading"
      :okText="confirmAction === 'confirm' ? '确认执行' : '确认驳回'"
      :okButtonProps="confirmAction === 'reject' ? { danger: true } : {}"
      :style="confirmModalStyle"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onConfirmDragStart">{{ confirmAction === 'confirm' ? '确认操作' : '驳回操作' }}</div>
      </template>
      <p v-if="confirmAction === 'confirm'" style="color: #fa8c16; margin-bottom: 12px">
        确认后将自动执行库存变更操作，请仔细核对后再确认。
      </p>
      <p v-else style="color: #ff4d4f; margin-bottom: 12px">
        驳回后该申请将变为已驳回状态。
      </p>
      <a-form-item label="备注">
        <a-textarea v-model:value="confirmRemarkText" :rows="3" placeholder="填写确认/驳回备注（可选）" />
      </a-form-item>
    </a-modal>
  </div>
</template>

<style scoped>
.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
