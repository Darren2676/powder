<script setup lang="ts">
import { ref, reactive, onMounted, createVNode, watch, computed, nextTick } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownloadOutlined, UploadOutlined, PlusOutlined, HistoryOutlined,
  UnorderedListOutlined, ApartmentOutlined, DownOutlined
} from '@ant-design/icons-vue'
import {
  getRoutingHeaders, getRoutingHeaderDetail, createRoutingHeader, updateRoutingHeader, deleteRoutingHeader,
  addRoutingDetail, updateRoutingDetail, deleteRoutingDetail,
  exportRoutingMasters, importRoutingMasters
} from '@/api/master-data/routingMaster'
import { getProcedures } from '@/api/master-data/procedure'
import { getWorkCenters } from '@/api/master-data/workCenter'
import { getItems } from '@/api/master-data/itemMaster'
import { getWarehouses } from '@/api/master-data/warehouse'
import { getInspectionPlans } from '@/api/quality/inspectionPlan'
import { getInspectionSpecs } from '@/api/quality/inspectionSpec'
import { useAuthStore } from '@/store/auth'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval } from '@/api/system/approval'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ApprovalLogModal from '@/components/Common/ApprovalLogModal.vue'
import { CONDITION_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

defineOptions({ name: 'RoutingMasterList' })

// ==================== Interfaces ====================
interface RoutingHeader {
  process_route_number?: string
  process_route_name: string
  item_number: string
  item_name: string
  production_automatic_inventory_entry_rules: string
  condition: string
  creation_date: string
  creation_man: string
  approval_status: string
}
interface RoutingDetail {
  id?: number
  process_route_number?: string
  step_number: number
  standard_process_number: string
  standard_process_name: string
  post_processing_sequence_number: string
  post_processing_sequence_name: string
  work_center_number: string
  work_center_name: string
  excess_reporting_ratio: string
  ingredient_addition_method: string
  process_material_input_number: string
  process_material_input_quantity: string
  process_material_input_unit: string
  material_wastage_rate: string
  flowing_backward: string
  default_repository: string
  operator: string
  is_outsourced: boolean
  enable_self_inspect: boolean
  enable_special_inspect: boolean
  self_inspect_plan_name: string
  special_inspect_plan_name: string
  self_inspect_spec_name: string
  special_inspect_spec_name: string
  materials?: MaterialItem[]
}
interface MaterialItem {
  id?: number
  routing_detail_id?: number
  material_number: string
  material_name: string
  quantity: number
  unit: string
  wastage_rate: number
  remark: string
}

const emptyHeader = (): RoutingHeader => ({
  process_route_number: undefined,
  process_route_name: '',
  item_number: '',
  item_name: '',
  production_automatic_inventory_entry_rules: 'Y',
  condition: CONDITION_STATUS.ENABLED,
  creation_date: '',
  creation_man: '',
  approval_status: '草稿'
})
const emptyDetail = (): RoutingDetail => ({
  id: undefined,
  process_route_number: undefined,
  step_number: 0,
  standard_process_number: '',
  standard_process_name: '',
  post_processing_sequence_number: '',
  post_processing_sequence_name: '',
  work_center_number: '',
  work_center_name: '',
  excess_reporting_ratio: '',
  ingredient_addition_method: '',
  process_material_input_number: '',
  process_material_input_quantity: '',
  process_material_input_unit: '',
  material_wastage_rate: '',
  flowing_backward: '',
  default_repository: '',
  operator: '',
  is_outsourced: false,
  enable_self_inspect: false,
  enable_special_inspect: false,
  self_inspect_plan_name: '',
  special_inspect_plan_name: '',
  self_inspect_spec_name: '',
  special_inspect_spec_name: ''
})

// ==================== Header State ====================
const authStore = useAuthStore()
const pageTab = ref('header')
const searchText = ref('')
const approvalFilter = ref('')
const approvalLogVisible = ref(false)
const approvalLogRecordId = ref('')
const headerLoading = ref(false)
const headerData = ref<RoutingHeader[]>([])
const headerPagination = reactive({ current: 1, pageSize: 10, total: 0 })
const selectedHeaderKey = ref<string | null>(null)
const headerEditVisible = ref(false)
const headerCreateVisible = ref(false)
const headerEditForm = reactive<RoutingHeader>(emptyHeader())
const headerCreateForm = reactive<RoutingHeader>(emptyHeader())
const fileInputRef = ref<HTMLInputElement>()

// ==================== Detail State ====================
const detailLoading = ref(false)
const detailData = ref<RoutingDetail[]>([])
const detailEditVisible = ref(false)
const detailCreateVisible = ref(false)
const detailEditForm = reactive<RoutingDetail>(emptyDetail())
const detailCreateForm = reactive<RoutingDetail>(emptyDetail())
const detailViewMode = ref<'table' | 'flow'>('table')

// ==================== Header Detail Modal State ====================
const headerDetailVisible = ref(false)
const headerDetailRecord = ref<RoutingHeader>(emptyHeader())
const headerDetailTab = ref('info')
const headerDetailDetails = ref<RoutingDetail[]>([])
const headerDetailLoading = ref(false)

// ==================== 明细只读状态（跟随主表审批状态） ====================
const selectedHeaderRecord = computed(() => {
  if (!selectedHeaderKey.value) return null
  return headerData.value.find(h => h.process_route_number === selectedHeaderKey.value) || null
})
const isDetailReadonly = computed(() => {
  if (!selectedHeaderRecord.value) return true
  return selectedHeaderRecord.value.approval_status !== '草稿'
})

// ==================== Dropdown Data ====================
const procedureList = ref<any[]>([])
const procedureOptions = ref<{ label: string; value: string }[]>([])
const workCenterList = ref<any[]>([])
const workCenterOptions = ref<{ label: string; value: string }[]>([])
const productList = ref<any[]>([])
const productOptions = ref<{ label: string; value: string }[]>([])
const warehouseList = ref<any[]>([])
const warehouseOptions = ref<{ label: string; value: string }[]>([])
const inspectionPlanOptions = ref<{ label: string; value: string }[]>([])
const inspectionSpecOptions = ref<{ label: string; value: string }[]>([])

// ==================== 物料子表 State ====================
const allItemList = ref<any[]>([])
const allItemOptions = ref<{ label: string; value: string }[]>([])
const createMaterials = ref<MaterialItem[]>([])
const editMaterials = ref<MaterialItem[]>([])
const emptyMaterial = (): MaterialItem => ({ material_number: '', material_name: '', quantity: 0, unit: '', wastage_rate: 0, remark: '' })

const fetchAllItems = async () => {
  try {
    const res = await getItems({ page: 1, limit: 9999 })
    const list = res.data.items || []
    allItemList.value = list
    allItemOptions.value = list.map((p: any) => ({ label: `${p.item_number} - ${p.item_name}`, value: p.item_number }))
  } catch {}
}
const handleMaterialSelect = (materials: MaterialItem[], idx: number, val: string) => {
  materials[idx].material_number = val
  const found = allItemList.value.find((p: any) => p.item_number === val)
  materials[idx].material_name = found ? found.item_name : ''
  materials[idx].unit = found ? (found.basic_unit || '') : ''
}

const fetchProcedures = async () => {
  try {
    const res = await getProcedures({ page: 1, limit: 9999 })
    const list = res.data.items || []
    procedureList.value = list
    procedureOptions.value = list.map((p: any) => ({ label: `${p.standard_process_number} - ${p.standard_process_name}`, value: p.standard_process_number }))
  } catch {}
}
const fetchWorkCenters = async () => {
  try {
    const res = await getWorkCenters({ page: 1, limit: 9999 })
    const list = res.data.items || []
    workCenterList.value = list
    workCenterOptions.value = list.map((w: any) => ({ label: `${w.work_cente_number} - ${w.work_cente_name}`, value: w.work_cente_number }))
  } catch {}
}
const fetchProducts = async () => {
  try {
    const res = await getItems({ item_properties: '产品,半成品,前处理骨架,混炼胶,预成型件', page: 1, limit: 9999 })
    const list = res.data.items || []
    productList.value = list
    productOptions.value = list.map((p: any) => ({ label: `${p.item_number} - ${p.item_name}`, value: p.item_number }))
  } catch {}
}
const fetchWarehouses = async () => {
  try {
    const res = await getWarehouses({ page: 1, limit: 9999 })
    const list = res.data.items || []
    warehouseList.value = list
    warehouseOptions.value = list.map((w: any) => ({ label: `${w.warehouse_number} - ${w.warehouse_name}`, value: w.warehouse_number }))
  } catch {}
}
const fetchInspectionPlans = async () => {
  try {
    const res = await getInspectionPlans({ page: 1, limit: 9999 })
    const list = res.data.items || []
    inspectionPlanOptions.value = list.map((p: any) => ({ label: `${p.plan_name}`, value: p.plan_name }))
  } catch {}
}
const fetchInspectionSpecs = async () => {
  try {
    const res = await getInspectionSpecs({ page: 1, limit: 9999 })
    const list = res.data.items || []
    inspectionSpecOptions.value = list.map((s: any) => ({ label: `${s.spec_name}`, value: s.spec_name }))
  } catch {}
}

// ==================== Auto-fill Handlers (Header) ====================
const handleHeaderProductChange = (form: RoutingHeader, val: string) => {
  form.item_number = val
  const found = productList.value.find((p: any) => p.item_number === val)
  form.item_name = found ? found.item_name : ''
}

// ==================== Auto-fill Handlers (Detail) ====================
const handleDetailProcedureChange = (form: RoutingDetail, val: string) => {
  form.standard_process_number = val
  const found = procedureList.value.find((p: any) => p.standard_process_number === val)
  form.standard_process_name = found ? found.standard_process_name : ''
}
const handleDetailPostProcessChange = (form: RoutingDetail, val: string) => {
  form.post_processing_sequence_number = val
  const found = procedureList.value.find((p: any) => p.standard_process_number === val)
  form.post_processing_sequence_name = found ? found.standard_process_name : ''
}
const handleDetailWorkCenterChange = (form: RoutingDetail, val: string) => {
  form.work_center_number = val
  const found = workCenterList.value.find((w: any) => w.work_cente_number === val)
  form.work_center_name = found ? found.work_cente_name : ''
}
const handleDetailWarehouseChange = (form: RoutingDetail, val: string) => {
  form.default_repository = val
}

// ==================== Header Columns ====================
const headerColumns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '选择', key: 'radioSelect', width: 60 },
  { title: '工艺路线编号', dataIndex: 'process_route_number', key: 'process_route_number', width: 140 },
  { title: '工艺路线名称', dataIndex: 'process_route_name', key: 'process_route_name', width: 140 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 120 },
  { title: '生产自动入库规则', dataIndex: 'production_automatic_inventory_entry_rules', key: 'production_automatic_inventory_entry_rules', width: 150 },
  { title: '状态', dataIndex: 'condition', key: 'condition', width: 80 },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 150 },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100 },
  { title: '操作', key: 'action', width: 80, fixed: 'right' as const }
]

// ==================== Detail Columns ====================
const detailColumns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '工序序号', dataIndex: 'step_number', key: 'step_number', width: 80 },
  { title: '标准工序编号', dataIndex: 'standard_process_number', key: 'standard_process_number', width: 130 },
  { title: '标准工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 130 },
  { title: '后置工序编号', dataIndex: 'post_processing_sequence_number', key: 'post_processing_sequence_number', width: 120 },
  { title: '后置工序名称', dataIndex: 'post_processing_sequence_name', key: 'post_processing_sequence_name', width: 120 },
  { title: '工作中心编号', dataIndex: 'work_center_number', key: 'work_center_number', width: 130 },
  { title: '工作中心名称', dataIndex: 'work_center_name', key: 'work_center_name', width: 130 },
  { title: '超额报工比例', dataIndex: 'excess_reporting_ratio', key: 'excess_reporting_ratio', width: 120 },
  { title: '配料方式', dataIndex: 'ingredient_addition_method', key: 'ingredient_addition_method', width: 100 },
  { title: '投入物料', key: 'materials_summary', width: 200 },
  { title: '倒冲', dataIndex: 'flowing_backward', key: 'flowing_backward', width: 80 },
  { title: '默认仓库', dataIndex: 'default_repository', key: 'default_repository', width: 100 },
  { title: '操作员', dataIndex: 'operator', key: 'operator', width: 100 },
  { title: '委外', dataIndex: 'is_outsourced', key: 'is_outsourced', width: 70 },
  { title: '自检', key: 'enable_self_inspect', width: 70 },
  { title: '专检', key: 'enable_special_inspect', width: 70 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const }
]

// ==================== Detail Modal Columns ====================
const detailModalColumns = [
  { title: '工序序号', dataIndex: 'step_number', key: 'step_number', width: 80 },
  { title: '标准工序编号', dataIndex: 'standard_process_number', key: 'standard_process_number', width: 120 },
  { title: '标准工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 120 },
  { title: '后置工序', dataIndex: 'post_processing_sequence_name', key: 'post_processing_sequence_name', width: 100 },
  { title: '工作中心', dataIndex: 'work_center_name', key: 'work_center_name', width: 110 },
  { title: '配料方式', dataIndex: 'ingredient_addition_method', key: 'ingredient_addition_method', width: 80 },
  { title: '投入物料', key: 'modal_materials_summary', width: 220 },
  { title: '超额报工', dataIndex: 'excess_reporting_ratio', key: 'excess_reporting_ratio', width: 90 },
  { title: '倒冲', dataIndex: 'flowing_backward', key: 'flowing_backward', width: 60 },
  { title: '默认仓库', dataIndex: 'default_repository', key: 'default_repository', width: 100 },
  { title: '操作员', dataIndex: 'operator', key: 'operator', width: 80 }
]

// ==================== Header CRUD ====================
const fetchHeaders = async () => {
  headerLoading.value = true
  try {
    const res = await getRoutingHeaders({ page: headerPagination.current, limit: headerPagination.pageSize, search: searchText.value, approval_status: approvalFilter.value })
    headerData.value = res.data.items
    headerPagination.total = res.data.pagination.total
  } catch { message.error('获取工艺路线列表失败') }
  finally { headerLoading.value = false }
}
const handleHeaderSearch = () => { headerPagination.current = 1; fetchHeaders() }
const handleHeaderReset = () => { searchText.value = ''; approvalFilter.value = ''; headerPagination.current = 1; fetchHeaders() }
const handleHeaderTableChange = (pag: any) => { headerPagination.current = pag.current; headerPagination.pageSize = pag.pageSize; fetchHeaders() }

// ==================== Header Detail (Modal with Tabs) ====================
const handleHeaderDetail = async (record: RoutingHeader) => {
  headerDetailRecord.value = { ...record }
  headerDetailTab.value = 'info'
  headerDetailDetails.value = []
  headerDetailVisible.value = true
  headerDetailLoading.value = true
  try {
    const res = await getRoutingHeaderDetail(record.process_route_number!)
    const detailObj = res.data || res
    const details = detailObj.details || []
    headerDetailDetails.value = details.map((d: any, i: number) => ({ ...d, _idx: i + 1 }))
    console.log('[工艺路线详情] 工序明细数量:', headerDetailDetails.value.length)
  } catch (e: any) {
    console.error('[工艺路线详情] 加载失败:', e)
    message.error('加载工艺路线详情失败')
  } finally {
    headerDetailLoading.value = false
  }
}

const handleHeaderEdit = (record: RoutingHeader) => {
  Object.assign(headerEditForm, { ...emptyHeader(), ...record })
  headerEditVisible.value = true
}
const handleHeaderDelete = (record: RoutingHeader) => {
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除工艺路线"${record.process_route_number}"及其所有工序明细吗?`, okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        await deleteRoutingHeader(record.process_route_number!)
        message.success('删除成功')
        if (selectedHeaderKey.value === record.process_route_number) {
          selectedHeaderKey.value = null
          detailData.value = []
        }
        fetchHeaders()
      } catch { message.error('删除失败') }
    }
  })
}

// ==================== More Actions (dropdown) ====================
const handleMoreAction = async (key: string, record: RoutingHeader) => {
  const id = record.process_route_number!
  if (key === 'edit') {
    if (record.approval_status !== '草稿') return
    handleHeaderEdit(record)
  } else if (key === 'delete') {
    if (record.approval_status !== '草稿') return
    handleHeaderDelete(record)
  } else if (key === 'history') {
    approvalLogRecordId.value = id
    approvalLogVisible.value = true
  } else if (key === 'submit') {
    Modal.confirm({
      title: '提交审核', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要提交审核吗？提交后将不可编辑。', okText: '确认', cancelText: '取消',
      onOk: async () => { try { await submitForApproval('routing_header', id); message.success('提交审核成功'); fetchHeaders() } catch { message.error('提交审核失败') } }
    })
  } else if (key === 'approve') {
    Modal.confirm({
      title: '审核通过', icon: createVNode(ExclamationCircleOutlined),
      content: '确定审核通过吗？', okText: '通过', cancelText: '取消',
      onOk: async () => { try { await approveRecord('routing_header', id); message.success('审核通过'); fetchHeaders() } catch { message.error('审核失败') } }
    })
  } else if (key === 'withdraw') {
    Modal.confirm({
      title: '撤回提交', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要撤回审核提交吗？', okText: '撤回', cancelText: '取消',
      onOk: async () => { try { await withdrawApproval('routing_header', id); message.success('撤回成功'); fetchHeaders() } catch { message.error('撤回失败') } }
    })
  } else if (key === 'reverse') {
    Modal.confirm({
      title: '反审退回', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要执行反审吗？记录将退回草稿状态，可重新编辑。', okText: '确认反审', okType: 'danger', cancelText: '取消',
      onOk: async () => { try { await reverseApproval('routing_header', id); message.success('反审成功，已退回草稿'); fetchHeaders() } catch { message.error('反审失败') } }
    })
  }
}
const handleHeaderEditOk = async () => {
  try {
    await updateRoutingHeader(headerEditForm.process_route_number!, headerEditForm)
    message.success('更新成功'); headerEditVisible.value = false; fetchHeaders()
  } catch { message.error('更新失败') }
}
const handleHeaderCreateOk = async () => {
  if (!headerCreateForm.process_route_number) { message.warning('请输入工艺路线编号'); return }
  try {
    await createRoutingHeader(headerCreateForm)
    message.success('创建成功'); headerCreateVisible.value = false
    Object.assign(headerCreateForm, emptyHeader()); fetchHeaders()
  } catch { message.error('创建失败') }
}

// ==================== Header Row Click ====================
const handleHeaderRowClick = (record: RoutingHeader) => {
  selectedHeaderKey.value = record.process_route_number!
  nextTick(() => { pageTab.value = 'detail' })
}
const headerCustomRow = (record: RoutingHeader) => ({
  onClick: () => handleHeaderRowClick(record),
  style: selectedHeaderKey.value === record.process_route_number ? 'background: #e6f7ff; cursor: pointer;' : 'cursor: pointer;'
})

// ==================== Detail CRUD ====================
const fetchDetails = async () => {
  if (!selectedHeaderKey.value) { detailData.value = []; return }
  detailLoading.value = true
  try {
    const res = await getRoutingHeaderDetail(selectedHeaderKey.value)
    detailData.value = res.data.details || []
  } catch { message.error('获取工序明细失败') }
  finally { detailLoading.value = false }
}

watch(selectedHeaderKey, () => { fetchDetails() })

const handleDetailEdit = (record: RoutingDetail) => {
  Object.assign(detailEditForm, { ...emptyDetail(), ...record, is_outsourced: !!record.is_outsourced })
  editMaterials.value = (record.materials && record.materials.length > 0)
    ? record.materials.map(m => ({ ...m }))
    : [emptyMaterial()]
  detailEditVisible.value = true
}
const handleDetailDelete = (record: RoutingDetail) => {
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除工序序号 ${record.step_number} 吗?`, okText: '确认', cancelText: '取消',
    onOk: async () => {
      try { await deleteRoutingDetail(record.id!); message.success('删除成功'); fetchDetails() }
      catch { message.error('删除失败') }
    }
  })
}
const handleDetailEditOk = async () => {
  try {
    const payload = { ...detailEditForm, materials: editMaterials.value.filter(m => m.material_number) }
    await updateRoutingDetail(detailEditForm.id!, payload)
    message.success('更新成功'); detailEditVisible.value = false; fetchDetails()
  } catch { message.error('更新失败') }
}
const handleDetailCreateOk = async () => {
  if (!selectedHeaderKey.value) { message.warning('请先选择工艺路线'); return }
  try {
    const payload = { ...detailCreateForm, materials: createMaterials.value.filter(m => m.material_number) }
    await addRoutingDetail(selectedHeaderKey.value, payload)
    message.success('新增工序成功'); detailCreateVisible.value = false
    Object.assign(detailCreateForm, emptyDetail()); createMaterials.value = []; fetchDetails()
  } catch { message.error('新增工序失败') }
}
const openDetailCreate = () => {
  if (!selectedHeaderKey.value) { message.warning('请先在上方选择一条工艺路线'); return }
  Object.assign(detailCreateForm, emptyDetail())
  detailCreateForm.operator = authStore.user?.username || ''
  createMaterials.value = [emptyMaterial()]
  detailCreateVisible.value = true
}

// ==================== Export / Import ====================
const handleExport = async (format: string = 'xlsx') => {
  try {
    const res = await exportRoutingMasters(format)
    const ext = format === 'xls' ? 'xls' : 'xlsx'
    const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = generateExportFilename('routing_masters', ext); link.click(); URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}
const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement; const file = target.files?.[0]; if (!file) return
  try {
    const formData = new FormData(); formData.append('file', file)
    await importRoutingMasters(formData); message.success('导入成功'); fetchHeaders()
  } catch { message.error('导入失败') }
  finally { target.value = '' }
}

// ==================== Lifecycle ====================
onMounted(() => {
  fetchHeaders()
  fetchProcedures()
  fetchWorkCenters()
  fetchProducts()
  fetchWarehouses()
  fetchAllItems()
  fetchInspectionPlans()
  fetchInspectionSpecs()
})
</script>

<template>
  <div class="routing-master-page">
    <a-card title="工艺路线管理" :bordered="false">
      <a-tabs v-model:activeKey="pageTab">
        <!-- ========== Tab 1: 工艺路线（主表） ========== -->
        <a-tab-pane key="header" tab="工艺路线（主表）">
          <div class="tab-toolbar">
            <a-space>
              <a-input-search v-model:value="searchText" placeholder="搜索编号/名称/产品编号" style="width: 250px" @search="handleHeaderSearch" />
              <a-select v-model:value="approvalFilter" placeholder="审批状态" allow-clear style="width: 120px" @change="handleHeaderSearch">
                <a-select-option value="">全部</a-select-option>
                <a-select-option value="草稿">草稿</a-select-option>
                <a-select-option value="待审批">待审批</a-select-option>
                <a-select-option value="已审批">已审批</a-select-option>
              </a-select>
              <a-button @click="handleHeaderReset"><template #icon><ReloadOutlined /></template>重置</a-button>
              <a-dropdown>
                <a-button><template #icon><DownloadOutlined /></template>导出</a-button>
                <template #overlay>
                  <a-menu @click="({ key }: any) => handleExport(key)">
                    <a-menu-item key="xlsx">导出为 xlsx</a-menu-item>
                    <a-menu-item key="xls">导出为 xls</a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
              <a-button @click="handleImportClick"><template #icon><UploadOutlined /></template>导入</a-button>
              <a-button type="primary" @click="headerCreateVisible = true"><template #icon><PlusOutlined /></template>新建</a-button>
              <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
            </a-space>
          </div>
          <a-table
            :columns="headerColumns" :data-source="headerData" :loading="headerLoading"
            :row-key="(record: RoutingHeader) => record.process_route_number!"
            :pagination="headerPagination"
            :scroll="{ x: 1200 }"
            :custom-row="headerCustomRow"
            :row-class-name="(record: RoutingHeader) => selectedHeaderKey === record.process_route_number ? 'selected-row' : ''"
            @change="handleHeaderTableChange"
          >
            <template #bodyCell="{ column, index }">
              <template v-if="column.key === 'rowIndex'">{{ (headerPagination.current - 1) * headerPagination.pageSize + index + 1 }}</template>
              <template v-else-if="column.key === 'radioSelect'">
                <a-radio :checked="selectedHeaderKey === headerData[index].process_route_number" @click.stop="handleHeaderRowClick(headerData[index])" />
              </template>
              <template v-else-if="column.key === 'condition'">
                <a-tag :color="headerData[index].condition === CONDITION_STATUS.ENABLED ? 'green' : 'red'">{{ headerData[index].condition }}</a-tag>
              </template>
              <template v-else-if="column.key === 'approval_status'">
                <ApprovalStatusTag :status="headerData[index].approval_status" />
              </template>
              <template v-else-if="column.key === 'action'">
                <a-space :size="4">
                  <a-button type="link" size="small" @click.stop="handleHeaderDetail(headerData[index])">详情</a-button>
                  <a-dropdown :trigger="['click']">
                    <a-button type="link" size="small" @click.stop>更多<DownOutlined style="font-size: 10px; margin-left: 2px;" /></a-button>
                    <template #overlay>
                      <a-menu @click="({ key: k }: any) => handleMoreAction(k, headerData[index])">
                        <a-menu-item key="edit" :disabled="headerData[index].approval_status !== '草稿'"><EditOutlined /> 编辑</a-menu-item>
                        <a-menu-item key="submit" v-if="headerData[index].approval_status === '草稿'">提交审核</a-menu-item>
                        <a-menu-item key="approve" v-if="headerData[index].approval_status === '待审批'"><span style="color: #52c41a">审核通过</span></a-menu-item>
                        <a-menu-item key="withdraw" v-if="headerData[index].approval_status === '待审批'">撤回提交</a-menu-item>
                        <a-menu-item key="reverse" v-if="headerData[index].approval_status === '已审批'"><span style="color: #ff4d4f">反审退回</span></a-menu-item>
                        <a-menu-divider />
                        <a-menu-item key="history"><HistoryOutlined /> 审批历史</a-menu-item>
                        <a-menu-item key="delete" :disabled="headerData[index].approval_status !== '草稿'"><span style="color: #ff4d4f"><DeleteOutlined /> 删除</span></a-menu-item>
                      </a-menu>
                    </template>
                  </a-dropdown>
                </a-space>
              </template>
            </template>
          </a-table>
        </a-tab-pane>

        <!-- ========== Tab 2: 工序明细 ========== -->
        <a-tab-pane key="detail">
          <template #tab>
            <span>工序明细</span>
            <span v-if="selectedHeaderKey" style="margin-left: 6px; font-size: 12px; color: #888;">( {{ selectedHeaderKey }} )</span>
          </template>
          <div v-if="!selectedHeaderKey" style="padding: 60px 0; text-align: center;">
            <a-empty description="请先在「工艺路线（主表）」页签中点击选择一条工艺路线" />
            <a-button type="link" @click="pageTab = 'header'" style="margin-top: 12px;">前往选择</a-button>
          </div>
          <template v-else>
            <div class="tab-toolbar">
              <a-space>
                <span style="font-size: 13px; color: #666;">当前路线: <b>{{ selectedHeaderKey }}</b></span>
                <a-tag v-if="isDetailReadonly" color="orange" style="font-size: 12px;">只读（主表非草稿状态）</a-tag>
              </a-space>
              <a-space>
                <a-radio-group v-model:value="detailViewMode" button-style="solid" size="small">
                  <a-radio-button value="table"><UnorderedListOutlined /> 列表</a-radio-button>
                  <a-radio-button value="flow"><ApartmentOutlined /> 流程图</a-radio-button>
                </a-radio-group>
                <a-button type="primary" :disabled="isDetailReadonly" @click="openDetailCreate"><template #icon><PlusOutlined /></template>新增工序</a-button>
              </a-space>
            </div>

            <!-- 列表视图 -->
            <a-table
              v-if="detailViewMode === 'table'"
              :columns="detailColumns" :data-source="detailData" :loading="detailLoading"
              :row-key="(record: RoutingDetail) => record.id!"
              :pagination="false"
              :scroll="{ x: 1800 }"
            >
              <template #bodyCell="{ column, index }">
                <template v-if="column.key === 'rowIndex'">{{ index + 1 }}</template>
                <template v-else-if="column.key === 'materials_summary'">
                  <template v-if="detailData[index].materials && detailData[index].materials.length > 0">
                    <div v-for="(mat, mi) in detailData[index].materials" :key="mi" style="line-height: 1.6; font-size: 12px;">
                      {{ mat.material_number }} x{{ mat.quantity }}{{ mat.unit }}
                    </div>
                  </template>
                  <span v-else style="color: #ccc;">-</span>
                </template>
                <template v-else-if="column.key === 'is_outsourced'">
                  <a-tag :color="detailData[index].is_outsourced ? 'orange' : 'default'">{{ detailData[index].is_outsourced ? '是' : '否' }}</a-tag>
                </template>
                <template v-else-if="column.key === 'enable_self_inspect'">
                  <a-tag :color="detailData[index].enable_self_inspect ? 'blue' : 'default'">{{ detailData[index].enable_self_inspect ? '开' : '关' }}</a-tag>
                </template>
                <template v-else-if="column.key === 'enable_special_inspect'">
                  <a-tag :color="detailData[index].enable_special_inspect ? 'green' : 'default'">{{ detailData[index].enable_special_inspect ? '开' : '关' }}</a-tag>
                </template>
                <template v-else-if="column.key === 'action'">
                  <a-space>
                    <a-button type="link" size="small" :disabled="isDetailReadonly" @click="handleDetailEdit(detailData[index])"><template #icon><EditOutlined /></template>编辑</a-button>
                    <a-button type="link" danger size="small" :disabled="isDetailReadonly" @click="handleDetailDelete(detailData[index])"><template #icon><DeleteOutlined /></template>删除</a-button>
                  </a-space>
                </template>
              </template>
            </a-table>

            <!-- 流程图视图 -->
            <div v-else class="flow-view">
              <a-spin :spinning="detailLoading">
                <div v-if="detailData.length === 0" class="flow-empty">
                  <a-empty description="暂无工序数据" />
                </div>
                <div v-else class="flow-container">
                  <div class="flow-chain">
                    <template v-for="(step, idx) in detailData" :key="step.id">
                      <div :class="['flow-node', { 'flow-node-disabled': isDetailReadonly }]" @click="!isDetailReadonly && handleDetailEdit(step)">
                        <div class="flow-node-step">{{ step.step_number }}</div>
                        <div class="flow-node-body">
                          <div class="flow-node-title">{{ step.standard_process_name || step.standard_process_number }}</div>
                          <div class="flow-node-sub">{{ step.work_center_name || step.work_center_number || '-' }}</div>
                          <div v-if="step.ingredient_addition_method" class="flow-node-tag">{{ step.ingredient_addition_method }}</div>
                          <div v-if="step.enable_self_inspect || step.enable_special_inspect" class="flow-node-inspect">
                            <span v-if="step.enable_self_inspect" class="inspect-badge inspect-self">自检</span>
                            <span v-if="step.enable_special_inspect" class="inspect-badge inspect-special">专检</span>
                          </div>
                        </div>
                      </div>
                      <div v-if="idx < detailData.length - 1" class="flow-arrow">
                        <div class="flow-arrow-line"></div>
                        <div class="flow-arrow-head"></div>
                      </div>
                    </template>
                  </div>
                </div>
              </a-spin>
            </div>
          </template>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <!-- ========== Header Create Modal ========== -->
    <a-modal v-model:open="headerCreateVisible" title="新建工艺路线" @ok="handleHeaderCreateOk" okText="确认" cancelText="取消" width="700px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工艺路线编号" required><a-input v-model:value="headerCreateForm.process_route_number" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工艺路线名称"><a-input v-model:value="headerCreateForm.process_route_name" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="产品编号">
              <a-select v-model:value="headerCreateForm.item_number" show-search allow-clear placeholder="请选择或输入产品编号"
                :options="productOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleHeaderProductChange(headerCreateForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="产品名称"><a-input v-model:value="headerCreateForm.item_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="生产自动入库规则"><a-select v-model:value="headerCreateForm.production_automatic_inventory_entry_rules"><a-select-option value="Y">Y</a-select-option><a-select-option value="N">N</a-select-option></a-select></a-form-item></a-col>
          <a-col :span="12">
            <a-form-item label="状态"><a-select v-model:value="headerCreateForm.condition" placeholder="请选择"><a-select-option :value="CONDITION_STATUS.ENABLED">启用</a-select-option><a-select-option :value="CONDITION_STATUS.DISABLED">禁用</a-select-option></a-select></a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- ========== Header Edit Modal ========== -->
    <a-modal v-model:open="headerEditVisible" title="编辑工艺路线" @ok="handleHeaderEditOk" okText="确认" cancelText="取消" width="700px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工艺路线编号"><a-input v-model:value="headerEditForm.process_route_number" disabled /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工艺路线名称"><a-input v-model:value="headerEditForm.process_route_name" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="产品编号">
              <a-select v-model:value="headerEditForm.item_number" show-search allow-clear placeholder="请选择或输入产品编号"
                :options="productOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleHeaderProductChange(headerEditForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="产品名称"><a-input v-model:value="headerEditForm.item_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="生产自动入库规则"><a-select v-model:value="headerEditForm.production_automatic_inventory_entry_rules"><a-select-option value="Y">Y</a-select-option><a-select-option value="N">N</a-select-option></a-select></a-form-item></a-col>
          <a-col :span="12">
            <a-form-item label="状态"><a-select v-model:value="headerEditForm.condition" placeholder="请选择"><a-select-option :value="CONDITION_STATUS.ENABLED">启用</a-select-option><a-select-option :value="CONDITION_STATUS.DISABLED">禁用</a-select-option></a-select></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="创建日期"><a-input v-model:value="headerEditForm.creation_date" disabled /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="创建人"><a-input v-model:value="headerEditForm.creation_man" disabled /></a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- ========== Detail Create Modal ========== -->
    <a-modal v-model:open="detailCreateVisible" title="新增工序" @ok="handleDetailCreateOk" okText="确认" cancelText="取消" width="1000px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工序序号"><a-input-number v-model:value="detailCreateForm.step_number" :min="0" :step="10" style="width: 100%" placeholder="留空自动生成" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="标准工序编号">
              <a-select v-model:value="detailCreateForm.standard_process_number" show-search allow-clear placeholder="请选择"
                :options="procedureOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleDetailProcedureChange(detailCreateForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="标准工序名称"><a-input v-model:value="detailCreateForm.standard_process_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="后置工序编号">
              <a-select v-model:value="detailCreateForm.post_processing_sequence_number" show-search allow-clear placeholder="请选择"
                :options="procedureOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleDetailPostProcessChange(detailCreateForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="后置工序名称"><a-input v-model:value="detailCreateForm.post_processing_sequence_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="工作中心编号">
              <a-select v-model:value="detailCreateForm.work_center_number" show-search allow-clear placeholder="请选择"
                :options="workCenterOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleDetailWorkCenterChange(detailCreateForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="工作中心名称"><a-input v-model:value="detailCreateForm.work_center_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="超额报工比例"><a-input v-model:value="detailCreateForm.excess_reporting_ratio" /></a-form-item></a-col>
          <a-col :span="12">
            <a-form-item label="配料方式">
              <a-select v-model:value="detailCreateForm.ingredient_addition_method" allow-clear placeholder="请选择">
                <a-select-option value="备料">备料</a-select-option><a-select-option value="领料">领料</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工序物料投入编号"><a-input v-model:value="detailCreateForm.process_material_input_number" disabled placeholder="由物料表自动同步" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工序物料投入数量"><a-input v-model:value="detailCreateForm.process_material_input_quantity" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工序物料投入单位"><a-input v-model:value="detailCreateForm.process_material_input_unit" disabled /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="物料损耗率"><a-input v-model:value="detailCreateForm.material_wastage_rate" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="倒冲"><a-input v-model:value="detailCreateForm.flowing_backward" /></a-form-item></a-col>
          <a-col :span="12">
            <a-form-item label="默认仓库">
              <a-select v-model:value="detailCreateForm.default_repository" show-search allow-clear placeholder="请选择"
                :options="warehouseOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleDetailWarehouseChange(detailCreateForm, val)" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="操作员"><a-input v-model:value="detailCreateForm.operator" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="是否委外"><a-switch v-model:checked="detailCreateForm.is_outsourced" checked-children="是" un-checked-children="否" /></a-form-item></a-col>
        </a-row>
        <a-divider orientation="left" style="margin: 12px 0 8px;">检验配置</a-divider>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="启用自检"><a-switch v-model:checked="detailCreateForm.enable_self_inspect" checked-children="开" un-checked-children="关" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="启用专检"><a-switch v-model:checked="detailCreateForm.enable_special_inspect" checked-children="开" un-checked-children="关" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16" v-if="detailCreateForm.enable_self_inspect">
          <a-col :span="12">
            <a-form-item label="自检方案">
              <a-select v-model:value="detailCreateForm.self_inspect_plan_name" show-search allow-clear placeholder="请选择检验方案"
                :options="inspectionPlanOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="自检规范">
              <a-select v-model:value="detailCreateForm.self_inspect_spec_name" show-search allow-clear placeholder="请选择检验规范"
                :options="inspectionSpecOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16" v-if="detailCreateForm.enable_special_inspect">
          <a-col :span="12">
            <a-form-item label="专检方案">
              <a-select v-model:value="detailCreateForm.special_inspect_plan_name" show-search allow-clear placeholder="请选择检验方案"
                :options="inspectionPlanOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="专检规范">
              <a-select v-model:value="detailCreateForm.special_inspect_spec_name" show-search allow-clear placeholder="请选择检验规范"
                :options="inspectionSpecOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <!-- 工序物料投入表 -->
      <div style="margin-top: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-weight: 600; font-size: 14px;">工序物料投入</span>
          <a-button size="small" type="primary" @click="createMaterials.push(emptyMaterial())"><PlusOutlined /> 添加物料</a-button>
        </div>
        <a-table :data-source="createMaterials" :pagination="false" size="small" bordered row-key="material_number">
          <a-table-column title="序号" :width="50">
            <template #default="{ index }">{{ index + 1 }}</template>
          </a-table-column>
          <a-table-column title="物料编号" :width="200">
            <template #default="{ index }">
              <a-select v-model:value="createMaterials[index].material_number" show-search allow-clear placeholder="请选择物料" style="width: 100%"
                :options="allItemOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleMaterialSelect(createMaterials, index, val)" />
            </template>
          </a-table-column>
          <a-table-column title="物料名称" data-index="material_name" :width="150" />
          <a-table-column title="数量" :width="100">
            <template #default="{ index }">
              <a-input-number v-model:value="createMaterials[index].quantity" :min="0" :precision="4" style="width: 100%" />
            </template>
          </a-table-column>
          <a-table-column title="单位" :width="80">
            <template #default="{ index }">
              <a-input v-model:value="createMaterials[index].unit" style="width: 100%" />
            </template>
          </a-table-column>
          <a-table-column title="损耗率" :width="100">
            <template #default="{ index }">
              <a-input-number v-model:value="createMaterials[index].wastage_rate" :min="0" :precision="4" style="width: 100%" />
            </template>
          </a-table-column>
          <a-table-column title="备注" :width="120">
            <template #default="{ index }">
              <a-input v-model:value="createMaterials[index].remark" style="width: 100%" />
            </template>
          </a-table-column>
          <a-table-column title="操作" :width="60">
            <template #default="{ index }">
              <a-button type="link" danger size="small" @click="createMaterials.splice(index, 1)"><DeleteOutlined /></a-button>
            </template>
          </a-table-column>
        </a-table>
      </div>
    </a-modal>

    <!-- ========== Detail Edit Modal ========== -->
    <a-modal v-model:open="detailEditVisible" title="编辑工序" @ok="handleDetailEditOk" okText="确认" cancelText="取消" width="1000px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工序序号"><a-input-number v-model:value="detailEditForm.step_number" :min="0" :step="10" style="width: 100%" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="标准工序编号">
              <a-select v-model:value="detailEditForm.standard_process_number" show-search allow-clear placeholder="请选择"
                :options="procedureOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleDetailProcedureChange(detailEditForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="标准工序名称"><a-input v-model:value="detailEditForm.standard_process_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="后置工序编号">
              <a-select v-model:value="detailEditForm.post_processing_sequence_number" show-search allow-clear placeholder="请选择"
                :options="procedureOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleDetailPostProcessChange(detailEditForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="后置工序名称"><a-input v-model:value="detailEditForm.post_processing_sequence_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="工作中心编号">
              <a-select v-model:value="detailEditForm.work_center_number" show-search allow-clear placeholder="请选择"
                :options="workCenterOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleDetailWorkCenterChange(detailEditForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="工作中心名称"><a-input v-model:value="detailEditForm.work_center_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="超额报工比例"><a-input v-model:value="detailEditForm.excess_reporting_ratio" /></a-form-item></a-col>
          <a-col :span="12">
            <a-form-item label="配料方式">
              <a-select v-model:value="detailEditForm.ingredient_addition_method" allow-clear placeholder="请选择">
                <a-select-option value="备料">备料</a-select-option><a-select-option value="领料">领料</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工序物料投入编号"><a-input v-model:value="detailEditForm.process_material_input_number" disabled placeholder="由物料表自动同步" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工序物料投入数量"><a-input v-model:value="detailEditForm.process_material_input_quantity" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工序物料投入单位"><a-input v-model:value="detailEditForm.process_material_input_unit" disabled /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="物料损耗率"><a-input v-model:value="detailEditForm.material_wastage_rate" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="倒冲"><a-input v-model:value="detailEditForm.flowing_backward" /></a-form-item></a-col>
          <a-col :span="12">
            <a-form-item label="默认仓库">
              <a-select v-model:value="detailEditForm.default_repository" show-search allow-clear placeholder="请选择"
                :options="warehouseOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleDetailWarehouseChange(detailEditForm, val)" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="操作员"><a-input v-model:value="detailEditForm.operator" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="是否委外"><a-switch v-model:checked="detailEditForm.is_outsourced" checked-children="是" un-checked-children="否" /></a-form-item></a-col>
        </a-row>
        <a-divider orientation="left" style="margin: 12px 0 8px;">检验配置</a-divider>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="启用自检"><a-switch v-model:checked="detailEditForm.enable_self_inspect" checked-children="开" un-checked-children="关" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="启用专检"><a-switch v-model:checked="detailEditForm.enable_special_inspect" checked-children="开" un-checked-children="关" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16" v-if="detailEditForm.enable_self_inspect">
          <a-col :span="12">
            <a-form-item label="自检方案">
              <a-select v-model:value="detailEditForm.self_inspect_plan_name" show-search allow-clear placeholder="请选择检验方案"
                :options="inspectionPlanOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="自检规范">
              <a-select v-model:value="detailEditForm.self_inspect_spec_name" show-search allow-clear placeholder="请选择检验规范"
                :options="inspectionSpecOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16" v-if="detailEditForm.enable_special_inspect">
          <a-col :span="12">
            <a-form-item label="专检方案">
              <a-select v-model:value="detailEditForm.special_inspect_plan_name" show-search allow-clear placeholder="请选择检验方案"
                :options="inspectionPlanOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="专检规范">
              <a-select v-model:value="detailEditForm.special_inspect_spec_name" show-search allow-clear placeholder="请选择检验规范"
                :options="inspectionSpecOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
        </a-row>
      </a-form>
      <!-- 工序物料投入表 -->
      <div style="margin-top: 8px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <span style="font-weight: 600; font-size: 14px;">工序物料投入</span>
          <a-button size="small" type="primary" @click="editMaterials.push(emptyMaterial())"><PlusOutlined /> 添加物料</a-button>
        </div>
        <a-table :data-source="editMaterials" :pagination="false" size="small" bordered row-key="material_number">
          <a-table-column title="序号" :width="50">
            <template #default="{ index }">{{ index + 1 }}</template>
          </a-table-column>
          <a-table-column title="物料编号" :width="200">
            <template #default="{ index }">
              <a-select v-model:value="editMaterials[index].material_number" show-search allow-clear placeholder="请选择物料" style="width: 100%"
                :options="allItemOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleMaterialSelect(editMaterials, index, val)" />
            </template>
          </a-table-column>
          <a-table-column title="物料名称" data-index="material_name" :width="150" />
          <a-table-column title="数量" :width="100">
            <template #default="{ index }">
              <a-input-number v-model:value="editMaterials[index].quantity" :min="0" :precision="4" style="width: 100%" />
            </template>
          </a-table-column>
          <a-table-column title="单位" :width="80">
            <template #default="{ index }">
              <a-input v-model:value="editMaterials[index].unit" style="width: 100%" />
            </template>
          </a-table-column>
          <a-table-column title="损耗率" :width="100">
            <template #default="{ index }">
              <a-input-number v-model:value="editMaterials[index].wastage_rate" :min="0" :precision="4" style="width: 100%" />
            </template>
          </a-table-column>
          <a-table-column title="备注" :width="120">
            <template #default="{ index }">
              <a-input v-model:value="editMaterials[index].remark" style="width: 100%" />
            </template>
          </a-table-column>
          <a-table-column title="操作" :width="60">
            <template #default="{ index }">
              <a-button type="link" danger size="small" @click="editMaterials.splice(index, 1)"><DeleteOutlined /></a-button>
            </template>
          </a-table-column>
        </a-table>
      </div>
    </a-modal>

    <!-- ========== Header Detail Modal (Tabs) ========== -->
    <a-modal v-model:open="headerDetailVisible" :title="`工艺路线详情 - ${headerDetailRecord.process_route_number}`" :footer="null" width="1400px" :bodyStyle="{ padding: '12px 16px' }">
      <a-spin :spinning="headerDetailLoading">
        <a-tabs v-model:activeKey="headerDetailTab" :animated="false">
          <!-- Tab 1: 基本信息 -->
          <a-tab-pane key="info" tab="基本信息">
            <a-descriptions :column="2" bordered size="small" :labelStyle="{ fontWeight: 'bold', width: '140px' }">
              <a-descriptions-item label="工艺路线编号">{{ headerDetailRecord.process_route_number }}</a-descriptions-item>
              <a-descriptions-item label="工艺路线名称">{{ headerDetailRecord.process_route_name }}</a-descriptions-item>
              <a-descriptions-item label="产品编号">{{ headerDetailRecord.item_number }}</a-descriptions-item>
              <a-descriptions-item label="产品名称">{{ headerDetailRecord.item_name }}</a-descriptions-item>
              <a-descriptions-item label="生产自动入库规则" :span="2">{{ headerDetailRecord.production_automatic_inventory_entry_rules || '-' }}</a-descriptions-item>
              <a-descriptions-item label="状态"><a-tag :color="headerDetailRecord.condition === CONDITION_STATUS.ENABLED ? 'green' : 'red'">{{ headerDetailRecord.condition }}</a-tag></a-descriptions-item>
              <a-descriptions-item label="审批状态"><ApprovalStatusTag :status="headerDetailRecord.approval_status" /></a-descriptions-item>
              <a-descriptions-item label="创建人">{{ headerDetailRecord.creation_man || '-' }}</a-descriptions-item>
              <a-descriptions-item label="创建日期">{{ headerDetailRecord.creation_date || '-' }}</a-descriptions-item>
            </a-descriptions>
            <div style="margin-top: 16px;">
              <a-statistic title="工序总数" :value="headerDetailDetails.length" style="display: inline-block; margin-right: 40px;" />
              <a-statistic title="涉及工作中心" :value="new Set(headerDetailDetails.map((d: any) => d.work_center_number).filter(Boolean)).size" style="display: inline-block;" />
            </div>
          </a-tab-pane>

          <!-- Tab 2: 工序明细列表 -->
          <a-tab-pane key="details" tab="工序明细列表">
            <a-table
              :columns="detailModalColumns"
              :data-source="headerDetailDetails"
              row-key="_idx"
              :pagination="false"
              :scroll="{ x: 1500, y: 500 }"
              size="small"
              bordered
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'ingredient_addition_method'">
                  <a-tag v-if="record.ingredient_addition_method" :color="record.ingredient_addition_method === '备料' ? 'blue' : 'cyan'">{{ record.ingredient_addition_method }}</a-tag>
                  <span v-else style="color: #ccc;">-</span>
                </template>
                <template v-else-if="column.key === 'modal_materials_summary'">
                  <template v-if="record.materials && record.materials.length > 0">
                    <div v-for="(mat, mi) in record.materials" :key="mi" style="line-height: 1.6; font-size: 12px;">
                      {{ mat.material_number }}{{ mat.material_name ? ` (${mat.material_name})` : '' }} x{{ mat.quantity }}{{ mat.unit }}<span v-if="mat.wastage_rate" style="color: #999;"> 损耗{{ mat.wastage_rate }}</span>
                    </div>
                  </template>
                  <span v-else style="color: #ccc;">-</span>
                </template>
              </template>
            </a-table>
          </a-tab-pane>

          <!-- Tab 3: 流程图 -->
          <a-tab-pane key="flow" tab="流程图">
            <div v-if="headerDetailDetails.length > 0" class="modal-flow-container">
              <div class="modal-flow-chain">
                <template v-for="(step, idx) in headerDetailDetails" :key="step._idx">
                  <div class="flow-node">
                    <div class="flow-node-step">{{ step.step_number }}</div>
                    <div class="flow-node-body">
                      <div class="flow-node-title">{{ step.standard_process_name || step.standard_process_number }}</div>
                      <div class="flow-node-sub">{{ step.work_center_name || step.work_center_number || '-' }}</div>
                      <div v-if="step.ingredient_addition_method" class="flow-node-tag">{{ step.ingredient_addition_method }}</div>
                    </div>
                  </div>
                  <div v-if="idx < headerDetailDetails.length - 1" class="flow-arrow">
                    <div class="flow-arrow-line"></div>
                    <div class="flow-arrow-head"></div>
                  </div>
                </template>
              </div>
            </div>
            <a-empty v-else description="暂无工序数据" />
          </a-tab-pane>
        </a-tabs>
      </a-spin>
    </a-modal>

    <!-- ========== Approval Log Modal ========== -->
    <ApprovalLogModal v-model:open="approvalLogVisible" module="routing_header" :record-id="approvalLogRecordId" />
  </div>
</template>

<style scoped>
.routing-master-page {
  height: 100%;
}
:deep(.ant-card-extra) { padding: 0; }
:deep(.selected-row) td {
  background: #e6f7ff !important;
}
.tab-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

/* ===== Flow View ===== */
.flow-view {
  min-height: 180px;
}
.flow-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 160px;
}
.flow-container {
  overflow-x: auto;
  padding: 20px 8px 24px;
}
.flow-chain {
  display: inline-flex;
  align-items: center;
  min-width: 100%;
}

/* Node */
.flow-node {
  position: relative;
  min-width: 140px;
  max-width: 180px;
  border-radius: 8px;
  background: #fff;
  border: 2px solid #1677ff;
  box-shadow: 0 2px 8px rgba(22, 119, 255, 0.12);
  cursor: pointer;
  transition: all 0.25s ease;
  flex-shrink: 0;
}
.flow-node:hover {
  border-color: #4096ff;
  box-shadow: 0 4px 16px rgba(22, 119, 255, 0.25);
  transform: translateY(-2px);
}
.flow-node-step {
  background: #1677ff;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 10px;
  border-radius: 6px 6px 0 0;
  text-align: center;
  letter-spacing: 1px;
}
.flow-node-body {
  padding: 10px 12px;
}
.flow-node-title {
  font-size: 14px;
  font-weight: 600;
  color: #1a1a2e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}
.flow-node-sub {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.flow-node-tag {
  display: inline-block;
  margin-top: 6px;
  padding: 1px 8px;
  font-size: 11px;
  border-radius: 4px;
  background: #f0f5ff;
  color: #1677ff;
  border: 1px solid #d6e4ff;
}
.flow-node-inspect {
  margin-top: 6px;
  display: flex;
  gap: 4px;
}
.inspect-badge {
  display: inline-block;
  padding: 0 6px;
  font-size: 10px;
  border-radius: 3px;
  line-height: 18px;
}
.inspect-self {
  background: #e6f4ff;
  color: #1677ff;
  border: 1px solid #91caff;
}
.inspect-special {
  background: #f6ffed;
  color: #52c41a;
  border: 1px solid #b7eb8f;
}

/* Arrow */
.flow-arrow {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding: 0 2px;
}
.flow-arrow-line {
  width: 36px;
  height: 2px;
  background: linear-gradient(90deg, #1677ff, #69b1ff);
}
.flow-arrow-head {
  width: 0;
  height: 0;
  border-top: 6px solid transparent;
  border-bottom: 6px solid transparent;
  border-left: 10px solid #69b1ff;
}

/* Flow node disabled (readonly) */
.flow-node-disabled {
  opacity: 0.6;
  cursor: not-allowed !important;
  border-color: #d9d9d9 !important;
  box-shadow: none !important;
}
.flow-node-disabled:hover {
  transform: none !important;
  box-shadow: none !important;
  border-color: #d9d9d9 !important;
}
.flow-node-disabled .flow-node-step {
  background: #bfbfbf;
}

/* ===== Modal Flow View ===== */
.modal-flow-container {
  overflow-x: auto;
  padding: 24px 12px 28px;
  background: #fafafa;
  border-radius: 8px;
  border: 1px solid #f0f0f0;
}
.modal-flow-chain {
  display: inline-flex;
  align-items: center;
  min-width: 100%;
}
</style>
