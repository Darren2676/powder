<script setup lang="ts">
import { ref, reactive, computed, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, DownloadOutlined, UploadOutlined, HistoryOutlined, DownOutlined, SplitCellsOutlined, SendOutlined, SearchOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { getOrders, createOrder, updateOrder, deleteOrder, exportOrders, importOrders, splitOrders, dispatchOrders, dispatchAndGenerate, dispatchPrecheck } from '@/api/production/order'
import { getItems } from '@/api/master-data/itemMaster'
import { getEquipments } from '@/api/equipment/equipment'
import { getMoulds } from '@/api/equipment/mould'
import { getMouldBomByItemAndMould } from '@/api/master-data/mfgBom'
import { getSchedules } from '@/api/master-data/schedule'
import { getFactories } from '@/api/system/factory'
import { useAuthStore } from '@/store/auth'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ApprovalLogModal from '@/components/Common/ApprovalLogModal.vue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import ManualCloseModal from '@/components/Common/ManualCloseModal.vue'

import { useColumnPreference } from '@/composables/useColumnPreference'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval, batchSubmitForApproval, batchApproveRecords, batchWithdrawApproval, batchReverseApproval } from '@/api/system/approval'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'
import { useModalDrag } from '@/composables/useModalDrag'
import { generateExportFilename } from '@/utils/exportFilename'

interface Order {
  production_order_number: string
  production_number: string
  item_number: string
  item_name: string
  basic_unit: string
  specifications: string
  product_drawing_number: string
  rubber_compound_number: string
  batch_production_quota: string
  planned_quantity: number
  equipment_number: string
  equipment_name: string
  mould_number: string
  formed_part_specifications: string
  formed_part_unit_consumption: string
  actual_cavity_count: string
  actual_hole_count: string
  actual_daily_output: string
  planned_completion_time: string | null
  production_date: string | null
  schedule_id: string
  plan_status: string
  remark: string
  approval_status: string
  factory_id?: number | null
}

interface Product {
  item_number: string
  item_name: string
  basic_unit: string
  specifications: string
  product_drawing_number: string
  rubber_compound_number: string
  batch_production_quota: string
}





const activeStatus = ref('')
const factoryFilter = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) {
      factoryList.value = res.data.items || []
    }
  } catch (e) { /* ignore */ }
}
const authStore = useAuthStore()
const approvalFilter = ref('')
const approvalLogVisible = ref(false)

// 列筛选状态
const columnFilters = reactive<Record<string, string>>({
  production_number: '',
  item_number: '',
  equipment_number: '',
  production_date: '',
  schedule_id: ''
})
const approvalLogRecordId = ref('')

const statusTabs = [
  { key: '', label: '全部' },
  { key: '未开始', label: '未开始' },
  { key: '已派发', label: '已派发' },
  { key: '已备料', label: '已备料' },
  { key: '生产中', label: '生产中' },
  { key: '已完成', label: '已完成' }
]

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}))

const { loading, dataSource, searchText, pagination, selectedRowKeys, fetchData } = useTableList(getOrders)

const getFilterParams = () => ({
  status: activeStatus.value || undefined,
  approval_status: approvalFilter.value || undefined,
  factory_id: factoryFilter.value || undefined
})

const handleSearch = () => {
  pagination.current = 1
  fetchData(getFilterParams())
}

const handleReset = () => {
  searchText.value = ''
  approvalFilter.value = ''
  activeStatus.value = ''
  factoryFilter.value = undefined
  pagination.current = 1
  fetchData(getFilterParams())
}

const handleStatusChange = () => {
  pagination.current = 1
  fetchData(getFilterParams())
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData(getFilterParams())
}

const emptyForm = (): Order => ({
  production_order_number: '',
  production_number: '',
  item_number: '',
  item_name: '',
  basic_unit: '',
  specifications: '',
  product_drawing_number: '',
  rubber_compound_number: '',
  batch_production_quota: '',
  planned_quantity: 0,
  equipment_number: '',
  equipment_name: '',
  mould_number: '',
  formed_part_specifications: '',
  formed_part_unit_consumption: '',
  actual_cavity_count: '',
  actual_hole_count: '',
  actual_daily_output: '',
  planned_completion_time: null,
  production_date: null,
  schedule_id: '',
  plan_status: '未开始',
  remark: '',
  approval_status: '草稿',
  factory_id: null
})

// 编辑弹窗
const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<Order>(emptyForm())
const editDate = ref<any>(null)
const editProductionDate = ref<any>(null)

// 新建弹窗
const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<Order>(emptyForm())
const createDate = ref<any>(null)

// 产品搜索
const productOptions = ref<Product[]>([])
const productSearchLoading = ref(false)



const defaultDataColumns: any[] = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '生产单编号', dataIndex: 'production_order_number', key: 'production_order_number', resizable: true },
  { title: '生产计划编号', dataIndex: 'production_number', key: 'production_number', customFilterDropdown: true, resizable: true },
  { title: '状态', dataIndex: 'plan_status', key: 'plan_status', resizable: true },
  { title: '完成状态', dataIndex: 'completion_status', key: 'completion_status', width: 100, resizable: true },
  { title: '入库状态', dataIndex: 'inbound_status', key: 'inbound_status', width: 100, resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', customFilterDropdown: true, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', resizable: true },
  { title: '产品图号', dataIndex: 'product_drawing_number', key: 'product_drawing_number', resizable: true },
  { title: '胶料编号', dataIndex: 'rubber_compound_number', key: 'rubber_compound_number', resizable: true },
  { title: '班产定额', dataIndex: 'batch_production_quota', key: 'batch_production_quota', resizable: true },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', resizable: true },
  { title: '单位', dataIndex: 'basic_unit', key: 'basic_unit', resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', resizable: true },
  { title: '实际班产', dataIndex: 'actual_daily_output', key: 'actual_daily_output', resizable: true },
  { title: '设备编号', dataIndex: 'equipment_number', key: 'equipment_number', customFilterDropdown: true, resizable: true },
  { title: '设备名称', dataIndex: 'equipment_name', key: 'equipment_name', resizable: true },
  { title: '模具编号', dataIndex: 'mould_number', key: 'mould_number', resizable: true },
  { title: '成型件规格', dataIndex: 'formed_part_specifications', key: 'formed_part_specifications', resizable: true },
  { title: '成型件单耗', dataIndex: 'formed_part_unit_consumption', key: 'formed_part_unit_consumption', resizable: true },
  { title: '实际模腔数', dataIndex: 'actual_cavity_count', key: 'actual_cavity_count', resizable: true },
  { title: '实际模穴数', dataIndex: 'actual_hole_count', key: 'actual_hole_count', resizable: true },
  { title: '生产日期', dataIndex: 'production_date', key: 'production_date', width: 120, customFilterDropdown: true, resizable: true },
  { title: '班次', dataIndex: 'schedule_id', key: 'schedule_id', width: 90, customFilterDropdown: true, resizable: true },
  { title: '计划完成时间', dataIndex: 'planned_completion_time', key: 'planned_completion_time', resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('order_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 80, fixed: 'right' as const }]
})

const handleColumnFilterReset = (key: string) => {
  columnFilters[key] = ''
  pagination.current = 1
  fetchData()
}

// ==================== More Actions (dropdown) ====================
const handleMoreAction = async (key: string, record: Order) => {
  const id = record.production_order_number
  if (key === 'edit') {
    if (record.approval_status !== '草稿') return
    handleEdit(record)
  } else if (key === 'delete') {
    if (record.approval_status !== '草稿') return
    handleDelete(record)
  } else if (key === 'history') {
    approvalLogRecordId.value = id
    approvalLogVisible.value = true
  } else if (key === 'submit') {
    Modal.confirm({
      title: '提交审核', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要提交审核吗？提交后将不可编辑。', okText: '确认', cancelText: '取消',
      onOk: async () => { try { await submitForApproval('production_order', id); message.success('提交审核成功'); fetchData() } catch { message.error('提交审核失败') } }
    })
  } else if (key === 'approve') {
    Modal.confirm({
      title: '审核通过', icon: createVNode(ExclamationCircleOutlined),
      content: '确定审核通过吗？', okText: '通过', cancelText: '取消',
      onOk: async () => { try { await approveRecord('production_order', id); message.success('审核通过'); fetchData() } catch { message.error('审核失败') } }
    })
  } else if (key === 'withdraw') {
    Modal.confirm({
      title: '撤回提交', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要撤回审核提交吗？', okText: '撤回', cancelText: '取消',
      onOk: async () => { try { await withdrawApproval('production_order', id); message.success('撤回成功'); fetchData() } catch { message.error('撤回失败') } }
    })
  } else if (key === 'reverse') {
    Modal.confirm({
      title: '反审退回', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要执行反审吗？记录将退回草稿状态，可重新编辑。', okText: '确认反审', okType: 'danger', cancelText: '取消',
      onOk: async () => { try { await reverseApproval('production_order', id); message.success('反审成功，已退回草稿'); fetchData() } catch { message.error('反审失败') } }
    })
  }
}

// 新建
const handleCreate = () => {
  Object.assign(createForm, emptyForm())
  createDate.value = null
  productOptions.value = []
  createModalVisible.value = true
}

// 产品搜索（AutoComplete）
let searchTimer: any = null
const handleProductSearch = (searchValue: string) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!searchValue) { productOptions.value = []; return }
  searchTimer = setTimeout(async () => {
    productSearchLoading.value = true
    try {
      const res = await getItems({ item_type: '成品', search: searchValue, limit: 20 })
      if (res.success) productOptions.value = res.data.items
    } catch { productOptions.value = [] }
    finally { productSearchLoading.value = false }
  }, 300)
}

const productAutoOptions = computed(() =>
  productOptions.value.map(p => ({
    value: p.item_number,
    label: p.item_number + ' - ' + p.item_name
  }))
)

const fillProductInfo = (product: Product) => {
  createForm.item_number = product.item_number
  createForm.item_name = product.item_name
  createForm.basic_unit = product.basic_unit?.trim() || ''
  createForm.specifications = product.specifications?.trim() || ''
  createForm.product_drawing_number = product.product_drawing_number?.trim() || ''
  createForm.rubber_compound_number = product.rubber_compound_number?.trim() || ''
  createForm.batch_production_quota = product.batch_production_quota?.trim() || ''
}

const handleProductAutoSelect = (value: string) => {
  const product = productOptions.value.find(p => p.item_number === value)
  if (product) fillProductInfo(product)
}

const handleProductAutoChange = (value: string) => {
  const product = productOptions.value.find(p => p.item_number === value)
  if (!product) {
    createForm.item_name = ''
    createForm.basic_unit = ''
    createForm.specifications = ''
    createForm.product_drawing_number = ''
    createForm.rubber_compound_number = ''
    createForm.batch_production_quota = ''
  }
}

// 设备搜索
const equipmentOptions = ref<any[]>([])
let equipmentSearchTimer: any = null
const handleEquipmentSearch = (searchValue: string, form: any) => {
  if (equipmentSearchTimer) clearTimeout(equipmentSearchTimer)
  if (!searchValue) { equipmentOptions.value = []; return }
  equipmentSearchTimer = setTimeout(async () => {
    try {
      const res = await getEquipments({ search: searchValue, limit: 20 })
      if (res.success) equipmentOptions.value = res.data.items
    } catch { equipmentOptions.value = [] }
  }, 300)
}
const equipmentAutoOptions = computed(() =>
  equipmentOptions.value.map((e: any) => ({
    value: e.equipment_number,
    label: e.equipment_number + ' - ' + e.equipment_name
  }))
)
const handleEquipmentSelect = (value: string, form: any) => {
  const eq = equipmentOptions.value.find((e: any) => e.equipment_number === value)
  if (eq) {
    form.equipment_number = eq.equipment_number
    form.equipment_name = eq.equipment_name || ''
  }
}
const handleEquipmentChange = (value: string, form: any) => {
  if (!value) {
    form.equipment_number = ''
    form.equipment_name = ''
  }
}

// 模具搜索
const mouldOptions = ref<any[]>([])
let mouldSearchTimer: any = null
const handleMouldSearch = (searchValue: string, form: any) => {
  if (mouldSearchTimer) clearTimeout(mouldSearchTimer)
  if (!searchValue) { mouldOptions.value = []; return }
  mouldSearchTimer = setTimeout(async () => {
    try {
      const res = await getMoulds({ search: searchValue, limit: 20 })
      if (res.success) mouldOptions.value = res.data.items
    } catch { mouldOptions.value = [] }
  }, 300)
}
const mouldAutoOptions = computed(() =>
  mouldOptions.value.map((m: any) => ({
    value: m.item_number,
    label: m.item_number + ' - ' + (m.item_name || '')
  }))
)
const handleMouldSelect = (value: string, form: any) => {
  const md = mouldOptions.value.find((m: any) => m.item_number === value)
  if (md) {
    form.mould_number = md.item_number
    form.formed_part_specifications = md.formed_part_specifications || ''
    form.formed_part_unit_consumption = md.formed_part_materia_consumption || ''
    form.actual_cavity_count = md.actual_operation_frequency || ''
    form.actual_hole_count = md.actual_cavities_number || ''
    form.actual_daily_output = md.actual_production_number || ''
  }
}
const handleMouldChange = (value: string, form: any) => {
  if (!value) {
    form.mould_number = ''
    form.formed_part_specifications = ''
    form.formed_part_unit_consumption = ''
    form.actual_cavity_count = ''
    form.actual_hole_count = ''
    form.actual_daily_output = ''
  }
}

const handleCreateSubmit = async () => {
  if (!createForm.item_number) { message.warning('请选择产品'); return }
  createLoading.value = true
  try {
    const data = {
      ...createForm,
      planned_completion_time: createDate.value ? dayjs(createDate.value).format('YYYY-MM-DD') : null
    }
    const res = await createOrder(data)
    if (res.success) { message.success('新建成功'); createModalVisible.value = false; fetchData() }
    else { message.error(res.message || '新建失败') }
  } catch { message.error('新建失败') }
  finally { createLoading.value = false }
}

// 编辑
const handleEdit = (record: Order) => {
  Object.assign(editForm, record)
  editDate.value = record.planned_completion_time ? dayjs(record.planned_completion_time) : null
  editProductionDate.value = record.production_date ? dayjs(record.production_date) : null
  editModalVisible.value = true
}

const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const data = {
      ...editForm,
      planned_completion_time: editDate.value ? dayjs(editDate.value).format('YYYY-MM-DD') : null,
      production_date: editProductionDate.value ? dayjs(editProductionDate.value).format('YYYY-MM-DD') : null
    }
    const res = await updateOrder(editForm.production_order_number, data)
    if (res.success) { message.success('修改成功'); editModalVisible.value = false; fetchData() }
    else { message.error(res.message || '修改失败') }
  } catch { message.error('修改失败') }
  finally { editLoading.value = false }
}

// 删除
const handleDelete = (record: Order) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除生产单 "${record.production_order_number}" 吗？`,
    okText: '确定',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteOrder(record.production_order_number)
        if (res.success) { message.success('删除成功'); fetchData() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

const formatDate = (date: string | null) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}

// 根据班次ID获取班次名称
const getScheduleName = (scheduleId: string | null) => {
  if (!scheduleId) return '-'
  const schedule = scheduleList.value.find((s: any) => s.schedules_id === scheduleId)
  return schedule ? (schedule.schedules_name || scheduleId) : scheduleId
}

// 计算实际班产 = 实际模腔数 * 实际模穴数
const calcActualDailyOutput = (record: any) => {
  const cavityCount = Number(record.actual_cavity_count) || 0
  const holeCount = Number(record.actual_hole_count) || 0
  if (cavityCount > 0 && holeCount > 0) {
    return cavityCount * holeCount
  }
  return record.actual_daily_output || '-'
}

const fileInputRef = ref<HTMLInputElement>()

const handleExport = async () => {
  try {
    const res = await exportOrders(searchText.value || undefined)
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('orders')
    link.click()
    URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}

const handleImportClick = () => { fileInputRef.value?.click() }

const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return
  try {
    const formData = new FormData()
    formData.append('file', file)
    const res = await importOrders(formData)
    if (res.success) { message.success(res.message || '导入成功'); fetchData() }
    else { message.error(res.message || '导入失败') }
  } catch { message.error('导入失败') }
  finally { target.value = '' }
}



onMounted(async () => {
  await loadColumnPreference()
  await loadDispatchColPreference()
  fetchData(getFilterParams())
  loadFactories()
  // 加载班次列表用于列表显示
  try {
    const res = await getSchedules({ limit: 100 })
    if (res.success) {
      scheduleList.value = res.data.items || []
    }
  } catch { scheduleList.value = [] }
})

// ==================== 批量审批操作 ====================
const batchLoading = ref(false)
const manualCloseRef = ref()
const handleBatchAction = (action: string) => {
  if (selectedRowKeys.value.length === 0) { message.warning('请先勾选记录'); return }
  const count = selectedRowKeys.value.length
  const actionMap: Record<string, { title: string; desc: string; fn: () => Promise<any>; okType?: string }> = {
    'submit': { title: '批量提交审核', desc: `确定要批量提交 ${count} 条记录吗？仅草稿状态的记录会被提交。`, fn: () => batchSubmitForApproval('production_order', selectedRowKeys.value) },
    'approve': { title: '批量审核通过', desc: `确定要批量审核 ${count} 条记录吗？仅待审批状态的记录会被审批。`, fn: () => batchApproveRecords('production_order', selectedRowKeys.value) },
    'withdraw': { title: '批量撤回', desc: `确定要批量撤回 ${count} 条记录吗？仅待审批状态的记录会被撤回。`, fn: () => batchWithdrawApproval('production_order', selectedRowKeys.value) },
    'reverse': { title: '批量反审', desc: `确定要批量反审 ${count} 条记录吗？已审批的记录将退回草稿。`, fn: () => batchReverseApproval('production_order', selectedRowKeys.value), okType: 'danger' }
  }
  const cfg = actionMap[action]
  if (!cfg) return
  Modal.confirm({
    title: cfg.title, icon: createVNode(ExclamationCircleOutlined), content: cfg.desc,
    okText: '确认', okType: (cfg.okType as any) || 'primary', cancelText: '取消',
    onOk: async () => {
      batchLoading.value = true
      try {
        const res = await cfg.fn()
        if (res.success) {
          const d = res.data; message.success(`${cfg.title}完成：成功 ${d.succeeded.length} 条，失败 ${d.failed.length} 条`)
          if (d.failed.length > 0) d.failed.slice(0, 3).forEach((f: any) => message.warning(`${f.record_id}: ${f.message}`))
          selectedRowKeys.value = []; fetchData()
        } else { message.error(res.message || '操作失败') }
      } catch { message.error('批量操作失败') }
      finally { batchLoading.value = false }
    }
  })
}
// ==================== 拆分功能 ====================
interface SplitRow {
  _uid: string
  type: 'original' | 'new'
  production_order_number: string
  source_order_number: string
  production_number: string
  item_number: string
  item_name: string
  specifications: string
  product_drawing_number: string
  rubber_compound_number: string
  batch_production_quota: string
  basic_unit: string
  equipment_number: string
  equipment_name: string
  mould_number: string
  formed_part_specifications: string
  formed_part_unit_consumption: string
  actual_cavity_count: string
  actual_hole_count: string
  actual_daily_output: string
  original_planned_quantity: number
  new_planned_quantity: number
  planned_completion_time: string | null
  remark: string
  _selected: boolean
}

const { modalStyle: splitModalStyle, onDragStart: onSplitDragStart, resetDrag: resetSplitDrag } = useModalDrag()

const splitModalVisible = ref(false)
const splitLoading = ref(false)
const splitRows = ref<SplitRow[]>([])
const splitBatchQty = ref<number | null>(null)
let splitUidCounter = 0

// 只在"全部"和"未开始"标签页下显示拆分按钮
const showSplitButton = computed(() => activeStatus.value === '' || activeStatus.value === '未开始')

// 原始行数量
const splitOriginalCount = computed(() => splitRows.value.filter(r => r.type === 'original').length)
// 新增行数量
const splitNewCount = computed(() => splitRows.value.filter(r => r.type === 'new').length)
// 选中行数量
const splitSelectedCount = computed(() => splitRows.value.filter(r => r._selected).length)

const handleOpenSplit = () => {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先勾选需要拆分的记录')
    return
  }
  splitUidCounter = 0
  splitRows.value = []
  // 加载选中的记录为原始行
  for (const key of selectedRowKeys.value) {
    const record = dataSource.value.find(d => d.production_order_number === key)
    if (record) {
      splitRows.value.push({
        _uid: `row_${splitUidCounter++}`,
        type: 'original',
        production_order_number: record.production_order_number,
        source_order_number: record.production_order_number,
        production_number: record.production_number,
        item_number: record.item_number,
        item_name: record.item_name,
        specifications: record.specifications,
        product_drawing_number: record.product_drawing_number,
        rubber_compound_number: record.rubber_compound_number,
        batch_production_quota: record.batch_production_quota,
        basic_unit: record.basic_unit,
        equipment_number: record.equipment_number || '',
        equipment_name: record.equipment_name || '',
        mould_number: record.mould_number || '',
        formed_part_specifications: record.formed_part_specifications || '',
        formed_part_unit_consumption: record.formed_part_unit_consumption || '',
        actual_cavity_count: record.actual_cavity_count || '',
        actual_hole_count: record.actual_hole_count || '',
        actual_daily_output: record.actual_daily_output || '',
        original_planned_quantity: Number(record.planned_quantity) || 0,
        new_planned_quantity: Number(record.planned_quantity) || 0,
        planned_completion_time: record.planned_completion_time,
        remark: record.remark,
        _selected: false
      })
    }
  }
  splitModalVisible.value = true
  resetSplitDrag()
}

// 在某行后面增加新行
const handleSplitAdd = (row: SplitRow) => {
  const idx = splitRows.value.findIndex(r => r._uid === row._uid)
  const newRow: SplitRow = {
    _uid: `row_${splitUidCounter++}`,
    type: 'new',
    production_order_number: '',
    source_order_number: row.source_order_number,
    production_number: row.production_number,
    item_number: row.item_number,
    item_name: row.item_name,
    specifications: row.specifications,
    product_drawing_number: row.product_drawing_number,
    rubber_compound_number: row.rubber_compound_number,
    batch_production_quota: row.batch_production_quota,
    basic_unit: row.basic_unit,
    equipment_number: row.equipment_number || '',
    equipment_name: row.equipment_name || '',
    mould_number: row.mould_number || '',
    formed_part_specifications: row.formed_part_specifications || '',
    formed_part_unit_consumption: row.formed_part_unit_consumption || '',
    actual_cavity_count: row.actual_cavity_count || '',
    actual_hole_count: row.actual_hole_count || '',
    actual_daily_output: row.actual_daily_output || '',
    original_planned_quantity: row.original_planned_quantity,
    new_planned_quantity: 0,
    planned_completion_time: row.planned_completion_time,
    remark: row.remark,
    _selected: false
  }
  splitRows.value.splice(idx + 1, 0, newRow)
}

// 删除新增行
const handleSplitDelete = (row: SplitRow) => {
  if (row.type === 'original') return
  splitRows.value = splitRows.value.filter(r => r._uid !== row._uid)
}

// 切换行选中状态
const handleSplitRowSelect = (row: SplitRow, checked: boolean) => {
  row._selected = checked
}

// 全选/取消全选
const splitAllSelected = computed(() => splitRows.value.length > 0 && splitRows.value.every(r => r._selected))
const splitIndeterminate = computed(() => splitRows.value.some(r => r._selected) && !splitAllSelected.value)
const handleSplitSelectAll = (e: any) => {
  const checked = e.target.checked
  splitRows.value.forEach(r => r._selected = checked)
}

// 批量修改选中行的新计划数量
const handleSplitBatchModify = () => {
  if (splitBatchQty.value === null || splitBatchQty.value === undefined) {
    message.warning('请输入新计划数量')
    return
  }
  const selected = splitRows.value.filter(r => r._selected)
  if (selected.length === 0) {
    message.warning('请先勾选需要批量修改的行')
    return
  }
  selected.forEach(r => r.new_planned_quantity = splitBatchQty.value!)
  message.success(`已批量修改 ${selected.length} 行的新计划数量`)
}

// 提交拆分
const handleSplitSubmit = async () => {
  if (splitNewCount.value === 0) {
    message.warning('至少需要一条新增记录才能执行拆分')
    return
  }

  Modal.confirm({
    title: '确定拆分',
    icon: createVNode(ExclamationCircleOutlined),
    content: `将更新 ${splitOriginalCount.value} 条原始记录的计划数量，并新增 ${splitNewCount.value} 条生产单。`,
    okText: '确定拆分',
    cancelText: '取消',
    onOk: async () => {
      splitLoading.value = true
      try {
        const items = splitRows.value.map(r => ({
          type: r.type,
          production_order_number: r.production_order_number,
          new_planned_quantity: r.new_planned_quantity,
          source_order_number: r.source_order_number
        }))
        const res = await splitOrders(items)
        if (res.success) {
          const d = res.data
          message.success(`拆分完成：更新 ${d.updated} 条，新增 ${d.created} 条${d.failed > 0 ? `，失败 ${d.failed} 条` : ''}`)
          if (d.errors && d.errors.length > 0) {
            d.errors.slice(0, 3).forEach((e: string) => message.warning(e))
          }
          splitModalVisible.value = false
          selectedRowKeys.value = []
          fetchData()
        } else {
          message.error(res.message || '拆分失败')
        }
      } catch {
        message.error('拆分操作失败')
      } finally {
        splitLoading.value = false
      }
    }
  })
}

// ==================== 拆分功能结束 ====================

// ==================== 派发功能 ====================
interface DispatchRow {
  _uid: string
  production_order_number: string
  production_number: string
  item_number: string
  item_name: string
  specifications: string
  planned_quantity: number
  equipment_number: string
  equipment_name: string
  mould_number: string
  formed_part_specifications: string
  formed_part_unit_consumption: string
  actual_cavity_count: string
  actual_hole_count: string
  actual_daily_output: string
  production_date: string
  schedule_id: string
  _selected: boolean
}

const { modalStyle: dispatchModalStyle, onDragStart: onDispatchDragStart, resetDrag: resetDispatchDrag } = useModalDrag()

// 派发表格列个性化
const defaultDispatchColumns: any[] = [
  { title: '生产单编号', dataIndex: 'production_order_number', key: 'production_order_number', width: 140, resizable: true },
  { title: '生产计划编号', dataIndex: 'production_number', key: 'production_number', width: 130, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 110, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 120, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 100, resizable: true },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 90, align: 'right' as const, resizable: true },
  { title: '实际班产', dataIndex: 'actual_daily_output', key: 'actual_daily_output', width: 90, resizable: true },
  { title: '设备编号', dataIndex: 'equipment_number', key: 'equipment_number', width: 130, resizable: true },
  { title: '生产日期', dataIndex: 'production_date', key: 'production_date', width: 130, resizable: true },
  { title: '班次', dataIndex: 'schedule_id', key: 'schedule_id', width: 110, resizable: true },
  { title: '设备名称', dataIndex: 'equipment_name', key: 'equipment_name', width: 110, resizable: true },
  { title: '模具编号', dataIndex: 'mould_number', key: 'mould_number', width: 130, resizable: true },
  { title: '成型件规格', dataIndex: 'formed_part_specifications', key: 'formed_part_specifications', width: 120, resizable: true },
  { title: '成型件单耗', dataIndex: 'formed_part_unit_consumption', key: 'formed_part_unit_consumption', width: 110, resizable: true },
  { title: '实际模腔数', dataIndex: 'actual_cavity_count', key: 'actual_cavity_count', width: 100, resizable: true },
  { title: '实际模穴数', dataIndex: 'actual_hole_count', key: 'actual_hole_count', width: 100, resizable: true }
]

const {
  columns: dispatchColumns, columnSettingVisible: dispatchColSettingVisible, columnSettingList: dispatchColSettingList, columnSettingSaving: dispatchColSettingSaving,
  openColumnSetting: openDispatchColSetting, moveColumnUp: dispatchColMoveUp, moveColumnDown: dispatchColMoveDown, saveColumnSetting: dispatchColSave, resetColumnSetting: dispatchColReset,
  loadColumnPreference: loadDispatchColPreference, handleResizeColumn: handleDispatchResizeColumn
} = useColumnPreference('dispatch_modal', defaultDispatchColumns, {
  fixedLeft: [],
  fixedRight: []
})

const dispatchModalVisible = ref(false)
const dispatchLoading = ref(false)
const dispatchRows = ref<DispatchRow[]>([])
let dispatchUidCounter = 0

// 班次列表
const scheduleList = ref<any[]>([])

// 批量修改区域
const dispatchBatchEquipmentNumber = ref('')
const dispatchBatchMouldNumber = ref('')
const dispatchBatchProductionDate = ref<any>(null)
const dispatchBatchScheduleId = ref('')
// 派发用的设备/模具搜索选项（独立，避免与新建/编辑冲突）
const dispatchEquipmentOptions = ref<any[]>([])
const dispatchMouldOptions = ref<any[]>([])
// 行内编辑用的设备/模具搜索选项
const dispatchRowEquipmentOptions = ref<any[]>([])
const dispatchRowMouldOptions = ref<any[]>([])

let dispatchEquipmentTimer: any = null
let dispatchMouldTimer: any = null
let dispatchRowEquipmentTimer: any = null
let dispatchRowMouldTimer: any = null

// 批量修改区域的设备搜索
const handleDispatchBatchEquipmentSearch = (searchValue: string) => {
  if (dispatchEquipmentTimer) clearTimeout(dispatchEquipmentTimer)
  if (!searchValue) { dispatchEquipmentOptions.value = []; return }
  dispatchEquipmentTimer = setTimeout(async () => {
    try {
      const res = await getEquipments({ search: searchValue, limit: 20 })
      if (res.success) dispatchEquipmentOptions.value = res.data.items
    } catch { dispatchEquipmentOptions.value = [] }
  }, 300)
}
const dispatchBatchEquipmentAutoOptions = computed(() =>
  dispatchEquipmentOptions.value.map((e: any) => ({
    value: e.equipment_number,
    label: e.equipment_number + ' - ' + e.equipment_name
  }))
)
const handleDispatchBatchEquipmentSelect = (value: string) => {
  const eq = dispatchEquipmentOptions.value.find((e: any) => e.equipment_number === value)
  if (eq) {
    dispatchBatchEquipmentNumber.value = eq.equipment_number
    // 暂存名称用于批量应用
    ;(dispatchBatchEquipmentNumber as any)._name = eq.equipment_name || ''
  }
}

// 批量修改区域的模具搜索
const handleDispatchBatchMouldSearch = (searchValue: string) => {
  if (dispatchMouldTimer) clearTimeout(dispatchMouldTimer)
  if (!searchValue) { dispatchMouldOptions.value = []; return }
  dispatchMouldTimer = setTimeout(async () => {
    try {
      const res = await getMoulds({ search: searchValue, limit: 20 })
      if (res.success) dispatchMouldOptions.value = res.data.items
    } catch { dispatchMouldOptions.value = [] }
  }, 300)
}
const dispatchBatchMouldAutoOptions = computed(() =>
  dispatchMouldOptions.value.map((m: any) => ({
    value: m.item_number,
    label: m.item_number + ' - ' + (m.item_name || '')
  }))
)
const handleDispatchBatchMouldSelect = (value: string) => {
  const md = dispatchMouldOptions.value.find((m: any) => m.item_number === value)
  if (md) {
    dispatchBatchMouldNumber.value = md.item_number
    ;(dispatchBatchMouldNumber as any)._data = md
  }
}

// 行内编辑的设备搜索
const handleDispatchRowEquipmentSearch = (searchValue: string) => {
  if (dispatchRowEquipmentTimer) clearTimeout(dispatchRowEquipmentTimer)
  if (!searchValue) { dispatchRowEquipmentOptions.value = []; return }
  dispatchRowEquipmentTimer = setTimeout(async () => {
    try {
      const res = await getEquipments({ search: searchValue, limit: 20 })
      if (res.success) dispatchRowEquipmentOptions.value = res.data.items
    } catch { dispatchRowEquipmentOptions.value = [] }
  }, 300)
}
const dispatchRowEquipmentAutoOptions = computed(() =>
  dispatchRowEquipmentOptions.value.map((e: any) => ({
    value: e.equipment_number,
    label: e.equipment_number + ' - ' + e.equipment_name
  }))
)
const handleDispatchRowEquipmentSelect = (value: string, row: DispatchRow) => {
  const eq = dispatchRowEquipmentOptions.value.find((e: any) => e.equipment_number === value)
  if (eq) {
    row.equipment_number = eq.equipment_number
    row.equipment_name = eq.equipment_name || ''
  }
}
const handleDispatchRowEquipmentChange = (value: string, row: DispatchRow) => {
  if (!value) {
    row.equipment_number = ''
    row.equipment_name = ''
  }
}

// 行内编辑的模具搜索
const handleDispatchRowMouldSearch = (searchValue: string) => {
  if (dispatchRowMouldTimer) clearTimeout(dispatchRowMouldTimer)
  if (!searchValue) { dispatchRowMouldOptions.value = []; return }
  dispatchRowMouldTimer = setTimeout(async () => {
    try {
      const res = await getMoulds({ search: searchValue, limit: 20 })
      if (res.success) dispatchRowMouldOptions.value = res.data.items
    } catch { dispatchRowMouldOptions.value = [] }
  }, 300)
}
const dispatchRowMouldAutoOptions = computed(() =>
  dispatchRowMouldOptions.value.map((m: any) => ({
    value: m.item_number,
    label: m.item_number + ' - ' + (m.item_name || '')
  }))
)
const handleDispatchRowMouldSelect = async (value: string, row: DispatchRow) => {
  const md = dispatchRowMouldOptions.value.find((m: any) => m.item_number === value)
  if (md) {
    row.mould_number = md.item_number
    row.formed_part_specifications = md.formed_part_specifications || ''
    row.formed_part_unit_consumption = md.formed_part_materia_consumption || ''
    row.actual_cavity_count = md.actual_operation_frequency || ''
    row.actual_hole_count = md.actual_cavities_number || ''
    row.actual_daily_output = md.actual_production_number || ''

    // 查询该模具是否关联了专属BOM
    try {
      const res = await getMouldBomByItemAndMould(row.item_number, md.item_number)
      if (res.success && res.data?.mapping) {
        message.info(`该模具关联了专属制造BOM【${res.data.mapping.mfg_bom_name || res.data.mapping.mfg_bom_number}】，派发后将自动进行模具MRP重算`)
      }
    } catch { /* 查询失败不阻断 */ }
  }
}
const handleDispatchRowMouldChange = (value: string, row: DispatchRow) => {
  if (!value) {
    row.mould_number = ''
    row.formed_part_specifications = ''
    row.formed_part_unit_consumption = ''
    row.actual_cavity_count = ''
    row.actual_hole_count = ''
    row.actual_daily_output = ''
  }
}

// 派发选中数
const dispatchSelectedCount = computed(() => dispatchRows.value.filter(r => r._selected).length)
const dispatchAllSelected = computed(() => dispatchRows.value.length > 0 && dispatchRows.value.every(r => r._selected))
const dispatchIndeterminate = computed(() => dispatchRows.value.some(r => r._selected) && !dispatchAllSelected.value)
const dispatchSelectedKeys = computed(() => dispatchRows.value.filter(r => r._selected).map(r => r._uid))
const onDispatchSelectChange = (keys: string[]) => {
  dispatchRows.value.forEach(r => { r._selected = keys.includes(r._uid) })
}
const handleDispatchSelectAll = (e: any) => {
  const checked = e.target.checked
  dispatchRows.value.forEach(r => r._selected = checked)
}

// 打开派发对话框
const handleOpenDispatch = async () => {
  if (selectedRowKeys.value.length === 0) {
    message.warning('请先选择要派发的记录')
    return
  }

  // 预检第一步：检查审批状态和计划状态
  const canDispatch: string[] = []
  const problems: { key: string; reasons: string[] }[] = []

  for (const key of selectedRowKeys.value) {
    const record = dataSource.value.find(d => d.production_order_number === key)
    if (!record) continue
    const reasons: string[] = []
    if (record.approval_status !== '已审批') {
      reasons.push(`审批状态为"${record.approval_status || '草稿'}"，需"已审批"`)
    }
    if (record.plan_status !== '未开始') {
      reasons.push(`计划状态为"${record.plan_status}"，需"未开始"`)
    }
    if (reasons.length > 0) {
      problems.push({ key, reasons })
    } else {
      canDispatch.push(key)
    }
  }

  // 预检第二步：对通过基本检查的订单，检查工艺路线状态
  const warnings: { key: string; reasons: string[] }[] = []
  if (canDispatch.length > 0) {
    const itemNumbers = canDispatch.map(key => {
      const record = dataSource.value.find(d => d.production_order_number === key)
      return record?.item_number
    }).filter(Boolean) as string[]

    try {
      const res = await dispatchPrecheck(itemNumbers)
      if (res.success && res.data) {
        const routingMap = res.data as Record<string, { routing_exists: boolean; routing_approved: boolean; approval_status: string }>
        for (const key of canDispatch) {
          const record = dataSource.value.find(d => d.production_order_number === key)
          if (!record) continue
          const info = routingMap[record.item_number]
          if (info) {
            if (!info.routing_exists) {
              warnings.push({ key, reasons: [`产品"${record.item_number}"未维护工艺路线，派发后将无法生成工序任务`] })
            } else if (!info.routing_approved) {
              warnings.push({ key, reasons: [`产品"${record.item_number}"工艺路线审批状态为"${info.approval_status}"，派发后将无法生成工序任务`] })
            }
          }
        }
      }
    } catch { /* 预检接口异常不阻断流程 */ }
  }

  // 合并不可派发和工艺路线警告，弹窗提示
  if (problems.length > 0 || warnings.length > 0) {
    const allNodes: any[] = []

    // 不可派发的记录（红色）
    if (problems.length > 0) {
      allNodes.push(createVNode('p', { style: 'margin-bottom: 6px; font-weight: 600; color: #ff4d4f' }, `${problems.length} 条不满足派发条件（将跳过）：`))
      for (const p of problems) {
        allNodes.push(createVNode('div', { style: 'margin: 4px 0; padding: 4px 8px; background: #fff2f0; border-radius: 4px; border-left: 3px solid #ff4d4f' }, [
          createVNode('b', {}, p.key),
          createVNode('span', { style: 'color: #666; margin-left: 8px' }, p.reasons.join('；'))
        ]))
      }
    }

    // 工艺路线警告（橙色）
    if (warnings.length > 0) {
      allNodes.push(createVNode('p', { style: `margin-bottom: 6px; font-weight: 600; color: #fa8c16; ${problems.length > 0 ? 'margin-top: 12px;' : ''}` }, `${warnings.length} 条工艺路线异常（可派发但影响工序生成）：`))
      for (const w of warnings) {
        allNodes.push(createVNode('div', { style: 'margin: 4px 0; padding: 4px 8px; background: #fff7e6; border-radius: 4px; border-left: 3px solid #fa8c16' }, [
          createVNode('b', {}, w.key),
          createVNode('span', { style: 'color: #666; margin-left: 8px' }, w.reasons.join('；'))
        ]))
      }
    }

    if (canDispatch.length === 0) {
      // 全部不可派发
      Modal.error({
        title: '无法派发',
        width: 600,
        content: createVNode('div', { style: 'max-height: 400px; overflow-y: auto' }, allNodes)
      })
      return
    }

    // 有可派发的记录，询问用户
    allNodes.push(createVNode('p', { style: 'margin-top: 12px; color: #52c41a; font-weight: 600' }, `${canDispatch.length} 条符合派发条件，是否继续？`))
    let cancelled = false
    await new Promise<void>((resolve) => {
      Modal.confirm({
        title: '派发预检结果',
        width: 600,
        icon: createVNode(ExclamationCircleOutlined),
        content: createVNode('div', { style: 'max-height: 400px; overflow-y: auto' }, allNodes),
        okText: `继续派发 (${canDispatch.length}条)`,
        cancelText: '取消',
        onOk: () => resolve(),
        onCancel: () => { cancelled = true; resolve() }
      })
    })
    if (cancelled) return
    // 仅用可派发的记录
    selectedRowKeys.value = canDispatch
  }

  // 加载班次列表
  try {
    const res = await getSchedules({ limit: 100 })
    if (res.success) {
      scheduleList.value = res.data.items || []
    }
  } catch { scheduleList.value = [] }

  dispatchUidCounter = 0
  dispatchRows.value = []
  dispatchBatchEquipmentNumber.value = ''
  dispatchBatchMouldNumber.value = ''
  dispatchBatchProductionDate.value = null
  dispatchBatchScheduleId.value = ''

  for (const key of selectedRowKeys.value) {
    const record = dataSource.value.find(d => d.production_order_number === key)
    if (record) {
      dispatchRows.value.push({
        _uid: `dispatch_${dispatchUidCounter++}`,
        production_order_number: record.production_order_number,
        production_number: record.production_number,
        item_number: record.item_number,
        item_name: record.item_name,
        specifications: record.specifications,
        planned_quantity: Number(record.planned_quantity) || 0,
        equipment_number: record.equipment_number || '',
        equipment_name: record.equipment_name || '',
        mould_number: record.mould_number || '',
        formed_part_specifications: record.formed_part_specifications || '',
        formed_part_unit_consumption: record.formed_part_unit_consumption || '',
        actual_cavity_count: record.actual_cavity_count || '',
        actual_hole_count: record.actual_hole_count || '',
        actual_daily_output: record.actual_daily_output || '',
        production_date: record.production_date || '',
        schedule_id: record.schedule_id || '',
        _selected: false
      })
    }
  }
  dispatchModalVisible.value = true
  resetDispatchDrag()
}

// 批量应用到勾选行
const handleDispatchBatchApply = () => {
  const selected = dispatchRows.value.filter(r => r._selected)
  if (selected.length === 0) {
    message.warning('请先在派发表格中勾选需要批量修改的行')
    return
  }

  let appliedFields = 0

  // 应用设备
  if (dispatchBatchEquipmentNumber.value) {
    const eq = dispatchEquipmentOptions.value.find((e: any) => e.equipment_number === dispatchBatchEquipmentNumber.value)
    selected.forEach(r => {
      r.equipment_number = dispatchBatchEquipmentNumber.value
      r.equipment_name = eq ? (eq.equipment_name || '') : ((dispatchBatchEquipmentNumber as any)._name || '')
    })
    appliedFields++
  }

  // 应用模具
  if (dispatchBatchMouldNumber.value) {
    const md = (dispatchBatchMouldNumber as any)._data || dispatchMouldOptions.value.find((m: any) => m.item_number === dispatchBatchMouldNumber.value)
    if (md) {
      selected.forEach(r => {
        r.mould_number = md.item_number
        r.formed_part_specifications = md.formed_part_specifications || ''
        r.formed_part_unit_consumption = md.formed_part_materia_consumption || ''
        r.actual_cavity_count = md.actual_operation_frequency || ''
        r.actual_hole_count = md.actual_cavities_number || ''
        r.actual_daily_output = md.actual_production_number || ''
      })
      appliedFields++
    }
  }

  // 应用生产日期
  if (dispatchBatchProductionDate.value) {
    const dateStr = dayjs(dispatchBatchProductionDate.value).format('YYYY-MM-DD')
    selected.forEach(r => {
      r.production_date = dateStr
    })
    appliedFields++
  }

  // 应用班次
  if (dispatchBatchScheduleId.value) {
    selected.forEach(r => {
      r.schedule_id = dispatchBatchScheduleId.value
    })
    appliedFields++
  }

  if (appliedFields === 0) {
    message.warning('请至少填写一个批量修改项')
    return
  }
  message.success(`已应用到 ${selected.length} 行`)
}

// 确定派发（一键派发+自动生成工序任务+备料单）
const dispatchResultVisible = ref(false)
const dispatchResultData = ref<any>(null)

// 执行实际派发
const doExecuteDispatch = async (items: any[]) => {
  dispatchLoading.value = true
  try {
    const res = await dispatchAndGenerate(items)
    if (res.success) {
      message.success(res.message || '派发成功')
      dispatchModalVisible.value = false
      selectedRowKeys.value = []
      dispatchResultData.value = res.data
      dispatchResultVisible.value = true
      fetchData()
    } else {
      message.error(res.message || '派发失败')
    }
  } catch (err: any) {
    const conflicts = err?.response?.data?.conflicts
    if (conflicts && Array.isArray(conflicts) && conflicts.length > 0) {
      Modal.error({
        title: '排产冲突，派发失败',
        width: 520,
        content: createVNode('div', {}, [
          createVNode('p', { style: 'margin-bottom:8px;color:#ff4d4f;font-weight:600' }, '以下资源在相同日期和班次已有排产记录：'),
          ...conflicts.map((c: string) => createVNode('p', { style: 'margin:4px 0;padding-left:12px;border-left:3px solid #ff4d4f' }, c))
        ])
      })
    } else {
      message.error('派发操作失败')
    }
  } finally {
    dispatchLoading.value = false
  }
}

const handleDispatchSubmit = () => {
  message.info('正在检查派发条件...')
  console.log('[handleDispatchSubmit] dispatchRows:', dispatchRows.value.map((r: any) => ({ orderNo: r.production_order_number, itemNo: r.item_number, mouldNo: r.mould_number })))
  // -------- 前端预检：本批次内排产冲突检查 --------
  const localConflicts: string[] = []

  // 1) 模具+日期+班次 重复检查
  const mouldMap = new Map<string, string[]>()
  for (const r of dispatchRows.value) {
    if (r.mould_number && r.production_date && r.schedule_id) {
      const key = `${r.mould_number}|${r.production_date}|${r.schedule_id}`
      if (!mouldMap.has(key)) mouldMap.set(key, [])
      mouldMap.get(key)!.push(r.production_order_number)
    }
  }
  for (const [key, orders] of mouldMap) {
    if (orders.length > 1) {
      const [mould, date, schedule] = key.split('|')
      localConflicts.push(`模具 ${mould} 在 ${date} ${schedule} 被分配给多条生产单: ${orders.join(', ')}`)
    }
  }

  // 2) 设备+日期+班次 重复检查
  const equipMap = new Map<string, string[]>()
  for (const r of dispatchRows.value) {
    if (r.equipment_number && r.production_date && r.schedule_id) {
      const key = `${r.equipment_number}|${r.production_date}|${r.schedule_id}`
      if (!equipMap.has(key)) equipMap.set(key, [])
      equipMap.get(key)!.push(r.production_order_number)
    }
  }
  for (const [key, orders] of equipMap) {
    if (orders.length > 1) {
      const [equip, date, schedule] = key.split('|')
      localConflicts.push(`设备 ${equip} 在 ${date} ${schedule} 被分配给多条生产单: ${orders.join(', ')}`)
    }
  }

  if (localConflicts.length > 0) {
    Modal.error({
      title: '排产冲突',
      width: 520,
      content: createVNode('div', {}, [
        createVNode('p', { style: 'margin-bottom:8px;color:#ff4d4f;font-weight:600' }, '本批次内存在以下冲突，请修改后重试：'),
        ...localConflicts.map(c => createVNode('p', { style: 'margin:4px 0;padding-left:12px;border-left:3px solid #ff4d4f' }, c))
      ])
    })
    return
  }

  // 直接派发
  Modal.confirm({
    title: '确定派发',
    icon: createVNode(ExclamationCircleOutlined),
    content: `将派发 ${dispatchRows.value.length} 条生产调度单，同时自动生成工序任务和备料单。`,
    okText: `确定派发 (${dispatchRows.value.length}条)`,
    cancelText: '取消',
    onOk: () => {
      message.info('开始执行派发...')
      const items = dispatchRows.value.map(r => ({
        production_order_number: r.production_order_number,
        equipment_number: r.equipment_number,
        equipment_name: r.equipment_name,
        mould_number: r.mould_number,
        formed_part_specifications: r.formed_part_specifications,
        formed_part_unit_consumption: r.formed_part_unit_consumption,
        actual_cavity_count: r.actual_cavity_count,
        actual_hole_count: r.actual_hole_count,
        actual_daily_output: r.actual_daily_output,
        production_date: r.production_date,
        schedule_id: r.schedule_id
      }))
      return doExecuteDispatch(items)
    }
  })
}
// ==================== 派发功能结束 ====================

</script>

<template>
  <div class="order-page">
    <a-card title="生产单管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索生产单编号/计划编号/产品编号/名称"
            style="width: 300px"
            allow-clear
            @search="handleSearch"
            @pressEnter="handleSearch"
          />
          <a-select v-model:value="approvalFilter" placeholder="审批状态" allow-clear style="width: 120px" @change="handleSearch">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="草稿">草稿</a-select-option>
            <a-select-option value="待审批">待审批</a-select-option>
            <a-select-option value="已审批">已审批</a-select-option>
          </a-select>
          <a-select v-model:value="factoryFilter" placeholder="工厂" allow-clear style="width: 100px" @change="handleSearch">
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
          <a-button @click="handleReset">
            <template #icon><ReloadOutlined /></template>
            重置
          </a-button>
          <a-button @click="handleExport">
            <template #icon><DownloadOutlined /></template>
            导出
          </a-button>
          <a-button @click="handleImportClick">
            <template #icon><UploadOutlined /></template>
            导入
          </a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />

          <a-button type="primary" @click="handleCreate">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
          <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
        </a-space>
      </template>

      <a-tabs v-model:activeKey="activeStatus" @change="handleStatusChange" style="margin-bottom: 16px;">
        <a-tab-pane v-for="tab in statusTabs" :key="tab.key" :tab="tab.label" />
      </a-tabs>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 'max-content' }"
        :row-selection="rowSelection"
        row-key="production_order_number"
        size="middle"
        bordered
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #customFilterDropdown="{ column, confirm, clearFilters }">
          <div style="padding: 8px">
            <template v-if="column.key === 'production_date'">
              <a-date-picker
                v-model:value="columnFilters.production_date"
                placeholder="选择日期"
                style="width: 180px; margin-bottom: 8px; display: block"
                value-format="YYYY-MM-DD"
                allow-clear
              />
            </template>
            <template v-else-if="column.key === 'schedule_id'">
              <a-select
                v-model:value="columnFilters.schedule_id"
                placeholder="选择班次"
                style="width: 180px; margin-bottom: 8px; display: block"
                allow-clear
              >
                <a-select-option v-for="s in scheduleList" :key="s.schedules_id" :value="s.schedules_id">
                  {{ s.schedules_name }}
                </a-select-option>
              </a-select>
            </template>
            <template v-else>
              <a-input
                v-model:value="columnFilters[column.key as string]"
                :placeholder="`搜索${column.title}`"
                style="width: 180px; margin-bottom: 8px; display: block"
                allow-clear
                @pressEnter="handleColumnFilterConfirm(column.key as string); confirm()"
              />
            </template>
            <div style="display: flex; gap: 8px">
              <a-button type="primary" size="small" style="flex: 1" @click="handleColumnFilterConfirm(column.key as string); confirm()">
                <SearchOutlined /> 筛选
              </a-button>
              <a-button size="small" style="flex: 1" @click="handleColumnFilterReset(column.key as string); clearFilters()">
                重置
              </a-button>
            </div>
          </div>
        </template>
        <template #customFilterIcon="{ column }">
          <SearchOutlined :style="{ color: columnFilters[column.key] ? '#1890ff' : undefined }" />
        </template>
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'planned_completion_time'">
            {{ formatDate(record.planned_completion_time) }}
          </template>
          <template v-else-if="column.key === 'schedule_id'">
            {{ getScheduleName(record.schedule_id) }}
          </template>
          <template v-else-if="column.key === 'actual_daily_output'">
            {{ calcActualDailyOutput(record) }}
          </template>
          <template v-else-if="column.key === 'completion_status'">
            <a-tag :color="record.completion_status === '已完成' ? 'green' : 'orange'">{{ record.completion_status || '未完成' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'inbound_status'">
            <a-tag :color="record.inbound_status === '全部入库' ? 'green' : (record.inbound_status === '部分入库' ? 'blue' : 'default')">{{ record.inbound_status || '未入库' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <ApprovalStatusTag :status="record.approval_status" />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-dropdown :trigger="['click']">
              <a-button type="link" size="small" @click.stop>更多<DownOutlined style="font-size: 10px; margin-left: 2px;" /></a-button>
              <template #overlay>
                <a-menu @click="({ key: k }: any) => handleMoreAction(k, record)">
                  <a-menu-item key="edit" :disabled="record.approval_status !== '草稿'"><EditOutlined /> 编辑</a-menu-item>
                  <a-menu-item key="submit" v-if="record.approval_status === '草稿'">提交审核</a-menu-item>
                  <a-menu-item key="approve" v-if="record.approval_status === '待审批'"><span style="color: #52c41a">审核通过</span></a-menu-item>
                  <a-menu-item key="withdraw" v-if="record.approval_status === '待审批'">撤回提交</a-menu-item>
                  <a-menu-item key="reverse" v-if="record.approval_status === '已审批'"><span style="color: #ff4d4f">反审退回</span></a-menu-item>
                  <a-menu-divider />
                  <a-menu-item key="history"><HistoryOutlined /> 审批历史</a-menu-item>
                  <a-menu-item key="delete" :disabled="record.approval_status !== '草稿'"><span style="color: #ff4d4f"><DeleteOutlined /> 删除</span></a-menu-item>
                </a-menu>
              </template>
            </a-dropdown>
          </template>
        </template>
      </a-table>

      <!-- 批量操作栏 -->
      <div style="display: flex; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid #f0f0f0; margin-top: 4px;">
        <span style="color: #666; margin-right: 4px;">已选 <b style="color: #1890ff;">{{ selectedRowKeys.length }}</b> 项</span>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('submit')">批量提交</a-button>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('approve')">批量审批</a-button>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('withdraw')">批量撤回</a-button>
        <a-button size="small" danger :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('reverse')">批量反审</a-button>
        <a-button size="small" danger :disabled="selectedRowKeys.length === 0" @click="manualCloseRef?.open()">批量关闭</a-button>
        <a-button v-if="showSplitButton" size="small" type="primary" ghost :disabled="selectedRowKeys.length === 0" @click="handleOpenSplit">
          <template #icon><SplitCellsOutlined /></template>
          拆分 ({{ selectedRowKeys.length }})
        </a-button>
        <a-button size="small" type="primary" :disabled="selectedRowKeys.length === 0" @click="handleOpenDispatch">
          <template #icon><SendOutlined /></template>
          派发 ({{ selectedRowKeys.length }})
        </a-button>
        <a-button size="small" type="link" :disabled="selectedRowKeys.length === 0" @click="selectedRowKeys = []">清除选择</a-button>
      </div>
    </a-card>
    <a-modal v-model:open="editModalVisible" title="修改生产单" :confirm-loading="editLoading" @ok="handleEditSubmit" width="600px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="生产单编号">
          <a-input v-model:value="editForm.production_order_number" disabled />
        </a-form-item>
        <a-form-item label="所属工厂">
          <a-select v-model:value="editForm.factory_id" placeholder="请选择" allow-clear>
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="生产计划编号">
          <a-input v-model:value="editForm.production_number" />
        </a-form-item>
        <a-form-item label="产品编号">
          <a-input v-model:value="editForm.item_number" disabled />
        </a-form-item>
        <a-form-item label="产品名称">
          <a-input v-model:value="editForm.item_name" disabled />
        </a-form-item>
        <a-form-item label="单位">
          <a-input v-model:value="editForm.basic_unit" disabled />
        </a-form-item>
        <a-form-item label="规格">
          <a-input v-model:value="editForm.specifications" disabled />
        </a-form-item>
        <a-form-item label="产品图号">
          <a-input v-model:value="editForm.product_drawing_number" disabled />
        </a-form-item>
        <a-form-item label="胶料编号">
          <a-input v-model:value="editForm.rubber_compound_number" disabled />
        </a-form-item>
        <a-form-item label="班产定额">
          <a-input v-model:value="editForm.batch_production_quota" disabled />
        </a-form-item>
        <a-form-item label="计划数量">
          <a-input-number v-model:value="editForm.planned_quantity" :min="0" style="width: 100%" />
        </a-form-item>
        <a-divider orientation="left" style="font-size: 13px; margin: 12px 0;">设备信息</a-divider>
        <a-form-item label="设备编号">
          <a-auto-complete
            v-model:value="editForm.equipment_number"
            :options="equipmentAutoOptions"
            placeholder="输入设备编号或名称搜索"
            @search="(v: string) => handleEquipmentSearch(v, editForm)"
            @select="(v: string) => handleEquipmentSelect(v, editForm)"
            @change="(v: string) => handleEquipmentChange(v, editForm)"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="设备名称">
          <a-input v-model:value="editForm.equipment_name" disabled />
        </a-form-item>
        <a-divider orientation="left" style="font-size: 13px; margin: 12px 0;">模具信息</a-divider>
        <a-form-item label="模具编号">
          <a-auto-complete
            v-model:value="editForm.mould_number"
            :options="mouldAutoOptions"
            placeholder="输入模具编号或名称搜索"
            @search="(v: string) => handleMouldSearch(v, editForm)"
            @select="(v: string) => handleMouldSelect(v, editForm)"
            @change="(v: string) => handleMouldChange(v, editForm)"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="成型件规格">
          <a-input v-model:value="editForm.formed_part_specifications" disabled />
        </a-form-item>
        <a-form-item label="成型件单耗">
          <a-input v-model:value="editForm.formed_part_unit_consumption" disabled />
        </a-form-item>
        <a-form-item label="实际模腔数">
          <a-input v-model:value="editForm.actual_cavity_count" disabled />
        </a-form-item>
        <a-form-item label="实际模穴数">
          <a-input v-model:value="editForm.actual_hole_count" disabled />
        </a-form-item>
        <a-form-item label="实际班产">
          <a-input :value="calcActualDailyOutput(editForm)" disabled />
        </a-form-item>
        <a-divider orientation="left" style="font-size: 13px; margin: 12px 0;">排产信息</a-divider>
        <a-form-item label="生产日期">
          <a-date-picker v-model:value="editProductionDate" style="width: 100%" placeholder="选择生产日期" />
        </a-form-item>
        <a-form-item label="班次">
          <a-select v-model:value="editForm.schedule_id" placeholder="选择班次" allow-clear>
            <a-select-option v-for="s in scheduleList" :key="s.schedules_id" :value="s.schedules_id">
              {{ s.schedules_name }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="计划完成时间">
          <a-date-picker v-model:value="editDate" style="width: 100%" />
        </a-form-item>
        <a-form-item label="状态">
          <a-select v-model:value="editForm.plan_status">
            <a-select-option value="未开始">未开始</a-select-option>
            <a-select-option value="已派发">已派发</a-select-option>
            <a-select-option value="已备料">已备料</a-select-option>
            <a-select-option value="生产中">生产中</a-select-option>
            <a-select-option value="已完成">已完成</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="editForm.remark" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 新建弹窗 -->
    <a-modal v-model:open="createModalVisible" title="新建生产单" :confirm-loading="createLoading" @ok="handleCreateSubmit" width="600px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="所属工厂">
          <a-select v-model:value="createForm.factory_id" placeholder="请选择" allow-clear>
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="生产计划编号">
          <a-input v-model:value="createForm.production_number" placeholder="请输入生产计划编号" />
        </a-form-item>
        <a-form-item label="产品编号" required>
          <a-auto-complete
            v-model:value="createForm.item_number"
            :options="productAutoOptions"
            placeholder="输入产品编号或名称搜索"
            @search="handleProductSearch"
            @select="handleProductAutoSelect"
            @change="handleProductAutoChange"
          />
        </a-form-item>
        <a-form-item label="产品名称">
          <a-input v-model:value="createForm.item_name" disabled />
        </a-form-item>
        <a-form-item label="单位">
          <a-input v-model:value="createForm.basic_unit" disabled />
        </a-form-item>
        <a-form-item label="规格">
          <a-input v-model:value="createForm.specifications" disabled />
        </a-form-item>
        <a-form-item label="产品图号">
          <a-input v-model:value="createForm.product_drawing_number" disabled />
        </a-form-item>
        <a-form-item label="胶料编号">
          <a-input v-model:value="createForm.rubber_compound_number" disabled />
        </a-form-item>
        <a-form-item label="班产定额">
          <a-input v-model:value="createForm.batch_production_quota" disabled />
        </a-form-item>
        <a-form-item label="计划数量">
          <a-input-number v-model:value="createForm.planned_quantity" :min="0" style="width: 100%" placeholder="请输入计划数量" />
        </a-form-item>
        <a-divider orientation="left" style="font-size: 13px; margin: 12px 0;">设备信息</a-divider>
        <a-form-item label="设备编号">
          <a-auto-complete
            v-model:value="createForm.equipment_number"
            :options="equipmentAutoOptions"
            placeholder="输入设备编号或名称搜索"
            @search="(v: string) => handleEquipmentSearch(v, createForm)"
            @select="(v: string) => handleEquipmentSelect(v, createForm)"
            @change="(v: string) => handleEquipmentChange(v, createForm)"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="设备名称">
          <a-input v-model:value="createForm.equipment_name" disabled />
        </a-form-item>
        <a-divider orientation="left" style="font-size: 13px; margin: 12px 0;">模具信息</a-divider>
        <a-form-item label="模具编号">
          <a-auto-complete
            v-model:value="createForm.mould_number"
            :options="mouldAutoOptions"
            placeholder="输入模具编号或名称搜索"
            @search="(v: string) => handleMouldSearch(v, createForm)"
            @select="(v: string) => handleMouldSelect(v, createForm)"
            @change="(v: string) => handleMouldChange(v, createForm)"
            allow-clear
          />
        </a-form-item>
        <a-form-item label="成型件规格">
          <a-input v-model:value="createForm.formed_part_specifications" disabled />
        </a-form-item>
        <a-form-item label="成型件单耗">
          <a-input v-model:value="createForm.formed_part_unit_consumption" disabled />
        </a-form-item>
        <a-form-item label="实际模腔数">
          <a-input v-model:value="createForm.actual_cavity_count" disabled />
        </a-form-item>
        <a-form-item label="实际模穴数">
          <a-input v-model:value="createForm.actual_hole_count" disabled />
        </a-form-item>
        <a-form-item label="实际班产">
          <a-input :value="calcActualDailyOutput(createForm)" disabled />
        </a-form-item>
        <a-form-item label="计划完成时间">
          <a-date-picker v-model:value="createDate" style="width: 100%" placeholder="请选择计划完成时间" />
        </a-form-item>
        <a-form-item label="状态">
          <a-select v-model:value="createForm.plan_status" placeholder="请选择状态">
            <a-select-option value="未开始">未开始</a-select-option>
            <a-select-option value="已派发">已派发</a-select-option>
            <a-select-option value="已备料">已备料</a-select-option>
            <a-select-option value="生产中">生产中</a-select-option>
            <a-select-option value="已完成">已完成</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="createForm.remark" :rows="3" placeholder="请输入备注" />
        </a-form-item>
      </a-form>
    </a-modal>



    <!-- 审批日志弹窗 -->
    <ApprovalLogModal v-model:open="approvalLogVisible" module="production_order" :record-id="approvalLogRecordId" />

    <!-- 拆分对话框 -->
    <a-modal
      v-model:open="splitModalVisible"
      width="1200px"
      :footer="null"
      :maskClosable="false"
      :style="splitModalStyle"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onSplitDragStart">任务拆分</div>
      </template>
      <div class="split-header">
        <span style="color: #666;">原始行将更新计划数量，新增行将创建新生产单</span>
        <div class="split-stats">
          <a-tag color="default">原始 {{ splitOriginalCount }} 条</a-tag>
          <a-tag color="success">新增 {{ splitNewCount }} 条</a-tag>
        </div>
      </div>

      <div class="split-table-wrapper">
        <table class="split-table">
          <thead>
            <tr>
              <th style="width: 40px;">
                <a-checkbox :checked="splitAllSelected" :indeterminate="splitIndeterminate" @change="handleSplitSelectAll" />
              </th>
              <th style="width: 70px;">类型</th>
              <th>生产单编号</th>
              <th>生产计划编号</th>
              <th style="min-width: 90px;">产品编号</th>
              <th style="min-width: 90px;">产品名称</th>
              <th>规格</th>
              <th style="min-width: 75px;">班产定额</th>
              <th style="min-width: 80px;">设备编号</th>
              <th style="min-width: 80px;">模具编号</th>
              <th style="width: 90px;">原计划数量</th>
              <th style="width: 110px;">新计划数量</th>
              <th style="width: 80px;">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in splitRows" :key="row._uid" :class="{ 'split-row-original': row.type === 'original', 'split-row-new': row.type === 'new' }">
              <td>
                <a-checkbox :checked="row._selected" @change="(e: any) => handleSplitRowSelect(row, e.target.checked)" />
              </td>
              <td>
                <a-tag v-if="row.type === 'original'" color="default">原始</a-tag>
                <a-tag v-else color="green">新增</a-tag>
              </td>
              <td>
                <span v-if="row.type === 'original'">{{ row.production_order_number }}</span>
                <span v-else style="color: #999; font-style: italic;">自动生成</span>
              </td>
              <td>{{ row.production_number }}</td>
              <td>{{ row.item_number }}</td>
              <td>{{ row.item_name }}</td>
              <td>{{ row.specifications }}</td>
              <td>{{ row.batch_production_quota }}</td>
              <td>{{ row.equipment_number }}</td>
              <td>{{ row.mould_number }}</td>
              <td style="text-align: right;">{{ row.original_planned_quantity }}</td>
              <td>
                <a-input-number
                  v-model:value="row.new_planned_quantity"
                  :min="0"
                  style="width: 95px;"
                  size="small"
                />
              </td>
              <td>
                <a-space>
                  <a-button type="link" size="small" @click="handleSplitAdd(row)">增加</a-button>
                  <a-button v-if="row.type === 'new'" type="link" size="small" danger @click="handleSplitDelete(row)">删除</a-button>
                </a-space>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="split-footer">
        <div class="split-batch">
          <span style="color: #666; margin-right: 8px;">批量修改：</span>
          <a-input-number
            v-model:value="splitBatchQty"
            placeholder="输入新计划数量"
            :min="0"
            style="width: 160px;"
            size="small"
          />
          <a-button size="small" :disabled="splitSelectedCount === 0" @click="handleSplitBatchModify" style="margin-left: 8px;">
            批量修改 ({{ splitSelectedCount }})
          </a-button>
        </div>
        <div class="split-actions">
          <a-button @click="splitModalVisible = false">取消</a-button>
          <a-button
            type="primary"
            :loading="splitLoading"
            :disabled="splitNewCount === 0"
            @click="handleSplitSubmit"
          >
            确定拆分 (新增 {{ splitNewCount }} 条)
          </a-button>
        </div>
      </div>
    </a-modal>

    <!-- 派发对话框 -->
    <a-modal
      v-model:open="dispatchModalVisible"
      width="95%"
      :footer="null"
      :maskClosable="false"
      :style="dispatchModalStyle"
    >
      <template #title>
        <div class="drag-handle" @mousedown="onDispatchDragStart">派发生产调度单</div>
      </template>
      <div class="dispatch-header">
        <span style="color: #fa8c16;">编辑后提交，状态将自动更改为"已派发"</span>
        <a-tag color="blue">共 {{ dispatchRows.length }} 条待派发</a-tag>
      </div>

      <!-- 批量修改区域 -->
      <div class="dispatch-batch">
        <span style="color: #666; font-weight: 500; margin-right: 12px;">批量修改：</span>
        <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="color: #666; white-space: nowrap;">设备：</span>
            <a-auto-complete
              v-model:value="dispatchBatchEquipmentNumber"
              :options="dispatchBatchEquipmentAutoOptions"
              placeholder="输入设备编号搜索"
              @search="handleDispatchBatchEquipmentSearch"
              @select="handleDispatchBatchEquipmentSelect"
              allow-clear
              style="width: 180px;"
            />
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="color: #666; white-space: nowrap;">模具：</span>
            <a-auto-complete
              v-model:value="dispatchBatchMouldNumber"
              :options="dispatchBatchMouldAutoOptions"
              placeholder="输入模具编号搜索"
              @search="handleDispatchBatchMouldSearch"
              @select="handleDispatchBatchMouldSelect"
              allow-clear
              style="width: 180px;"
            />
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="color: #666; white-space: nowrap;">生产日期：</span>
            <a-date-picker
              v-model:value="dispatchBatchProductionDate"
              placeholder="选择日期"
              style="width: 130px;"
              allow-clear
            />
          </div>
          <div style="display: flex; align-items: center; gap: 4px;">
            <span style="color: #666; white-space: nowrap;">班次：</span>
            <a-select
              v-model:value="dispatchBatchScheduleId"
              placeholder="选择班次"
              style="width: 130px;"
              allow-clear
            >
              <a-select-option v-for="s in scheduleList" :key="s.schedules_id" :value="s.schedules_id">
                {{ s.schedules_name || s.schedules_id }}
              </a-select-option>
            </a-select>
          </div>
          <a-button type="primary" size="small" :disabled="dispatchSelectedCount === 0" @click="handleDispatchBatchApply">
            应用到勾选行 ({{ dispatchSelectedCount }})
          </a-button>
        </div>
      </div>

      <!-- 派发编辑表格 -->
      <a-table
        :columns="dispatchColumns"
        :data-source="dispatchRows"
        :pagination="false"
        :scroll="{ x: 'max-content' }"
        row-key="_uid"
        size="small"
        bordered
        :row-selection="{ selectedRowKeys: dispatchSelectedKeys, onChange: onDispatchSelectChange }"
        @resizeColumn="handleDispatchResizeColumn"
      >
        <template #title>
          <div style="display: flex; justify-content: flex-end; align-items: center; padding: 0 0 8px;">
            <a-button size="small" @click="openDispatchColSetting"><SettingOutlined /> 列设置</a-button>
          </div>
        </template>
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'production_order_number'">
            {{ record.production_order_number }}
          </template>
          <template v-else-if="column.key === 'planned_quantity'">
            <span style="text-align: right;">{{ record.planned_quantity }}</span>
          </template>
          <template v-else-if="column.key === 'actual_daily_output'">
            <span style="color: #999;">{{ record.actual_daily_output || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'equipment_number'">
            <a-auto-complete
              v-model:value="record.equipment_number"
              :options="dispatchRowEquipmentAutoOptions"
              placeholder="搜索设备"
              size="small"
              @search="handleDispatchRowEquipmentSearch"
              @select="(v: string) => handleDispatchRowEquipmentSelect(v, record)"
              @change="(v: string) => handleDispatchRowEquipmentChange(v, record)"
              allow-clear
              style="width: 100%;"
            />
          </template>
          <template v-else-if="column.key === 'production_date'">
            <a-date-picker
              v-model:value="record.production_date"
              placeholder="选择日期"
              size="small"
              style="width: 110px;"
              allow-clear
              valueFormat="YYYY-MM-DD"
            />
          </template>
          <template v-else-if="column.key === 'schedule_id'">
            <a-select
              v-model:value="record.schedule_id"
              placeholder="选择班次"
              size="small"
              style="width: 100%;"
              allow-clear
            >
              <a-select-option v-for="s in scheduleList" :key="s.schedules_id" :value="s.schedules_id">
                {{ s.schedules_name || s.schedules_id }}
              </a-select-option>
            </a-select>
          </template>
          <template v-else-if="column.key === 'equipment_name'">
            <span style="color: #999;">{{ record.equipment_name || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'mould_number'">
            <a-auto-complete
              v-model:value="record.mould_number"
              :options="dispatchRowMouldAutoOptions"
              placeholder="搜索模具"
              size="small"
              @search="handleDispatchRowMouldSearch"
              @select="(v: string) => handleDispatchRowMouldSelect(v, record)"
              @change="(v: string) => handleDispatchRowMouldChange(v, record)"
              allow-clear
              style="width: 100%;"
            />
          </template>
          <template v-else-if="column.key === 'formed_part_specifications'">
            <span style="color: #999;">{{ record.formed_part_specifications || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'formed_part_unit_consumption'">
            <span style="color: #999;">{{ record.formed_part_unit_consumption || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'actual_cavity_count'">
            <span style="color: #999;">{{ record.actual_cavity_count || '-' }}</span>
          </template>
          <template v-else-if="column.key === 'actual_hole_count'">
            <span style="color: #999;">{{ record.actual_hole_count || '-' }}</span>
          </template>
        </template>
      </a-table>

      <div class="dispatch-footer">
        <div></div>
        <div class="dispatch-actions">
          <a-button @click="dispatchModalVisible = false">取消</a-button>
          <a-button
            type="primary"
            :loading="dispatchLoading"
            @click="handleDispatchSubmit"
          >
            确定派发 ({{ dispatchRows.length }}条)
          </a-button>
        </div>
      </div>
    </a-modal>

    <!-- 派发结果展示对话框 -->
    <a-modal
      v-model:open="dispatchResultVisible"
      title="派发结果"
      :footer="null"
      width="720px"
      @cancel="dispatchResultVisible = false"
    >
      <div v-if="dispatchResultData" style="padding: 8px 0;">
        <div style="display: flex; gap: 16px; margin-bottom: 16px;">
          <a-statistic title="成功派发" :value="dispatchResultData.dispatch?.count || 0" suffix="条" :value-style="{ color: '#52c41a', fontSize: '20px' }" />
          <a-statistic title="工序任务" :value="dispatchResultData.processTasks?.totalGenerated || 0" suffix="条" :value-style="{ color: '#1890ff', fontSize: '20px' }" />
          <a-statistic title="备料单" :value="dispatchResultData.materialPreparations?.totalGenerated || 0" suffix="份" :value-style="{ color: '#722ed1', fontSize: '20px' }" />
          <a-statistic v-if="dispatchResultData.semiProductOrders?.totalGenerated > 0" title="预成型件生产单" :value="dispatchResultData.semiProductOrders?.totalGenerated || 0" suffix="份" :value-style="{ color: '#fa8c16', fontSize: '20px' }" />
          <a-statistic v-if="dispatchResultData.errors?.length > 0" title="跳过" :value="dispatchResultData.errors?.length || 0" suffix="条" :value-style="{ color: '#ff4d4f', fontSize: '20px' }" />
        </div>
        <a-collapse v-if="dispatchResultData.processTasks?.details?.length > 0" :bordered="false" style="background: #fafafa;">
          <a-collapse-panel v-for="(detail, idx) in dispatchResultData.processTasks.details" :key="idx">
            <template #header>
              <span>
                <a-tag color="green">已派发</a-tag>
                <strong>{{ detail.orderNo }}</strong>
                <span style="margin-left: 12px; color: #666; font-size: 12px;">
                  工序任务: {{ detail.tasksGenerated }}条
                  <template v-if="dispatchResultData.materialPreparations?.details?.[idx]">
                    | 备料明细: {{ dispatchResultData.materialPreparations.details[idx].materialsGenerated }}项
                  </template>
                  <template v-if="dispatchResultData.semiProductOrders?.details?.[idx]?.semiOrders?.length > 0">
                    | <span style="color: #fa8c16;">预成型件: {{ dispatchResultData.semiProductOrders.details[idx].semiOrders.length }}份</span>
                  </template>
                </span>
              </span>
            </template>
            <div style="font-size: 12px; color: #666;">
              <p v-if="detail.skipped" style="color: #fa8c16;"><strong>工序任务:</strong> {{ detail.skipped }}</p>
              <p v-else><strong>工序任务:</strong> 成功生成 {{ detail.tasksGenerated }} 条工序任务</p>
              <template v-if="dispatchResultData.materialPreparations?.details?.[idx]">
                <p v-if="dispatchResultData.materialPreparations.details[idx].prepSkipped" style="color: #fa8c16;">
                  <strong>备料单:</strong> {{ dispatchResultData.materialPreparations.details[idx].prepSkipped }}
                </p>
                <p v-else><strong>备料单:</strong> 成功生成备料单，含 {{ dispatchResultData.materialPreparations.details[idx].materialsGenerated }} 项物料</p>
              </template>
              <template v-if="dispatchResultData.semiProductOrders?.details?.[idx]?.semiOrders?.length > 0">
                <div style="margin-top: 8px; padding: 8px; background: #fff7e6; border-radius: 4px;">
                  <p style="color: #fa8c16; margin-bottom: 4px;"><strong>预成型件生产单（模具MRP重算生成）：</strong></p>
                  <ul style="margin: 0; padding-left: 16px;">
                    <li v-for="(spo, sIdx) in dispatchResultData.semiProductOrders.details[idx].semiOrders" :key="sIdx">
                      {{ spo.semiProductOrderNumber }} — {{ spo.itemNumber }} {{ spo.itemName }}（数量: {{ spo.plannedQuantity }}）
                    </li>
                  </ul>
                </div>
              </template>
            </div>
          </a-collapse-panel>
        </a-collapse>
        <div v-if="dispatchResultData.errors?.length > 0" style="margin-top: 12px;">
          <a-alert type="warning" show-icon>
            <template #message>以下生产单未能派发</template>
            <template #description>
              <ul style="margin: 4px 0; padding-left: 20px;">
                <li v-for="(err, eIdx) in dispatchResultData.errors" :key="eIdx" style="font-size: 12px; color: #666;">{{ err }}</li>
              </ul>
            </template>
          </a-alert>
        </div>
      </div>
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

    <ColumnSettingDrawer
      v-model:open="dispatchColSettingVisible"
      :settingList="dispatchColSettingList"
      :saving="dispatchColSettingSaving"
      @moveUp="dispatchColMoveUp"
      @moveDown="dispatchColMoveDown"
      @save="dispatchColSave"
      @reset="dispatchColReset"
    />

    <!-- 批量关闭弹窗 -->
    <ManualCloseModal ref="manualCloseRef" module="production_order" :record-ids="selectedRowKeys" @success="fetchData" />
  </div>
</template>

<style scoped>
.order-page {
  padding: 0;
}

.split-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.split-stats {
  display: flex;
  gap: 8px;
}

.split-table-wrapper {
  max-height: 400px;
  overflow-y: auto;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
}

.split-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.split-table th {
  background: #fafafa;
  padding: 8px 12px;
  text-align: left;
  font-weight: 500;
  border-bottom: 1px solid #f0f0f0;
  position: sticky;
  top: 0;
  z-index: 1;
}

.split-table td {
  padding: 6px 12px;
  border-bottom: 1px solid #f5f5f5;
}

.split-row-original {
  background: #fafafa;
}

.split-row-new {
  background: #f6ffed;
}

.split-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.split-batch {
  display: flex;
  align-items: center;
}

.split-actions {
  display: flex;
  gap: 8px;
}

.dispatch-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding: 8px 0;
  border-bottom: 1px solid #f0f0f0;
}

.dispatch-batch {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  background: #fafafa;
  border-radius: 6px;
  margin-bottom: 12px;
  border: 1px solid #f0f0f0;
}

.dispatch-table-wrapper {
  max-height: 450px;
  overflow: auto;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
}

.dispatch-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
  min-width: 2000px;
}

.dispatch-table th {
  background: #fafafa;
  padding: 8px 10px;
  text-align: left;
  font-weight: 500;
  border-bottom: 1px solid #f0f0f0;
  position: sticky;
  top: 0;
  z-index: 1;
  white-space: nowrap;
}

.dispatch-table td {
  padding: 6px 10px;
  border-bottom: 1px solid #f5f5f5;
}

.dispatch-table tbody tr:hover {
  background: #e6f7ff;
}

.dispatch-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}

.dispatch-actions {
  display: flex;
  gap: 8px;
}

.drag-handle {
  cursor: move;
  user-select: none;
}
</style>
