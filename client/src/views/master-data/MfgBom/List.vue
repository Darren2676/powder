<script setup lang="ts">
import { ref, reactive, onMounted, createVNode, watch, computed, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownloadOutlined, UploadOutlined, PlusOutlined, HistoryOutlined, CopyOutlined,
  ApartmentOutlined, DownOutlined, UnorderedListOutlined, WarningOutlined,
  ExpandAltOutlined, ShrinkOutlined, ImportOutlined, SettingOutlined, SearchOutlined
} from '@ant-design/icons-vue'
import {
  getMfgBomHeaders, getMfgBomHeaderDetail, createMfgBomHeader, updateMfgBomHeader, deleteMfgBomHeader,
  addMfgBomDetail, updateMfgBomDetail, deleteMfgBomDetail,
  exportMfgBomData, importMfgBomData, copyMfgBomAsNewVersion, duplicateMfgBom,
  getMfgBomTree, importFromBom
} from '@/api/master-data/mfgBom'
import { getBomHeaders } from '@/api/master-data/bom'
import { getItems } from '@/api/master-data/itemMaster'
import { getWarehouses } from '@/api/master-data/warehouse'
import { getRoutingHeaders } from '@/api/master-data/routingMaster'
import { getProcedures } from '@/api/master-data/procedure'
import { useAuthStore } from '@/store/auth'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval } from '@/api/system/approval'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ApprovalLogModal from '@/components/Common/ApprovalLogModal.vue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { TreeChart } from 'echarts/charts'
import { TooltipComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { CONDITION_STATUS } from '@/constants/statuses'
import { generateExportFilename } from '@/utils/exportFilename'

use([TreeChart, TooltipComponent, CanvasRenderer])

defineOptions({ name: 'MfgBomList' })

// ==================== Interfaces ====================
interface MfgBomHeader {
  mfg_bom_number?: string
  mfg_bom_name: string
  item_number: string
  item_name: string
  bom_version: string
  bom_type: string
  base_quantity: number
  base_unit: string
  process_route_number: string
  condition: string
  approval_status: string
  remark: string
  creation_date: string
  creation_man: string
}
interface MfgBomDetail {
  id?: number
  mfg_bom_number?: string
  line_number: number
  material_number: string
  material_name: string
  material_type: string
  standard_quantity: number
  unit: string
  wastage_rate: number
  actual_quantity: number
  step_number: string
  is_key_material: number
  substitute_group: string
  substitute_priority: number
  supply_type: string
  default_warehouse: string
  child_mfg_bom_number: string
  remark: string
  has_child_bom?: boolean
  matched_bom_number?: string
}

const emptyHeader = (): MfgBomHeader => ({
  mfg_bom_number: undefined,
  mfg_bom_name: '',
  item_number: '',
  item_name: '',
  bom_version: 'V1.0',
  bom_type: '制造BOM',
  base_quantity: 1,
  base_unit: 'PCS',
  process_route_number: '',
  condition: CONDITION_STATUS.ENABLED,
  approval_status: '草稿',
  remark: '',
  creation_date: '',
  creation_man: ''
})
const emptyDetail = (): MfgBomDetail => ({
  id: undefined,
  mfg_bom_number: undefined,
  line_number: 0,
  material_number: '',
  material_name: '',
  material_type: '',
  standard_quantity: 0,
  unit: '',
  wastage_rate: 0,
  actual_quantity: 0,
  step_number: '',
  is_key_material: 0,
  substitute_group: '',
  substitute_priority: 0,
  supply_type: '',
  default_warehouse: '',
  child_mfg_bom_number: '',
  remark: ''
})

// ==================== Header State ====================
const authStore = useAuthStore()
const bomRouter = useRouter()
const searchText = ref('')
const approvalFilter = ref('')
const bomTypeFilter = ref('')
const columnFilters = reactive<Record<string, string>>({ mfg_bom_number: '', mfg_bom_name: '', item_number: '', item_name: '' })
const approvalLogVisible = ref(false)
const approvalLogRecordId = ref('')
const headerLoading = ref(false)
const headerData = ref<MfgBomHeader[]>([])
const headerPagination = reactive({ current: 1, pageSize: 10, total: 0, showTotal: (total: number) => `共 ${total} 条记录`, showSizeChanger: true })
const pageTab = ref('header')
const selectedHeaderKey = ref<string | null>(null)
const selectedHeaderKeys = ref<string[]>([])
const headerEditVisible = ref(false)
const headerCreateVisible = ref(false)
const headerDetailVisible = ref(false)
const headerDetailRecord = ref<MfgBomHeader>(emptyHeader())
const headerDetailTab = ref('info')
const headerDetailDetails = ref<MfgBomDetail[]>([])
const headerDetailTreeData = ref<TreeNode[]>([])
const headerDetailTreeExpKeys = ref<string[]>([])
const headerDetailAllTreeKeys = ref<string[]>([])
const headerDetailTreeRaw = ref<any>(null)
const headerDetailLoading = ref(false)
const headerEditForm = reactive<MfgBomHeader>(emptyHeader())
const headerCreateForm = reactive<MfgBomHeader>(emptyHeader())
const fileInputRef = ref<HTMLInputElement>()

// ==================== Detail State ====================
const detailLoading = ref(false)
const detailData = ref<MfgBomDetail[]>([])
const detailEditVisible = ref(false)
const detailCreateVisible = ref(false)
const detailEditForm = reactive<MfgBomDetail>(emptyDetail())
const detailCreateForm = reactive<MfgBomDetail>(emptyDetail())
const detailViewMode = ref<'table' | 'tree'>('table')

// ==================== 明细只读状态 ====================
const selectedHeaderRecord = computed(() => {
  if (!selectedHeaderKey.value) return null
  return headerData.value.find(h => h.mfg_bom_number === selectedHeaderKey.value) || null
})
const isDetailReadonly = computed(() => {
  if (!selectedHeaderRecord.value) return true
  return selectedHeaderRecord.value.approval_status !== '草稿'
})

// ==================== Sub-BOM Expand State ====================
const expandedRowKeys = ref<number[]>([])
const subBomCache = ref<Record<number, any>>({})
const subBomLoading = ref<Record<number, boolean>>({})

const handleDetailExpand = async (expanded: boolean, record: MfgBomDetail) => {
  if (!expanded) return
  if (subBomCache.value[record.id!]) return
  const bomNum = record.child_mfg_bom_number || record.matched_bom_number
  if (!bomNum) return
  subBomLoading.value[record.id!] = true
  try {
    const res = await getMfgBomTree(bomNum)
    subBomCache.value[record.id!] = res.data
  } catch { message.error('加载子BOM失败') }
  finally { subBomLoading.value[record.id!] = false }
}

// ==================== BOM Tree State ====================
interface TreeNode {
  key: string
  material_number: string
  material_name: string
  material_type: string
  standard_quantity: number
  unit: string
  wastage_rate: number
  actual_quantity: number
  has_child_bom: boolean
  matched_bom_number: string | null
  is_circular: boolean
  circular_bom_number: string | null
  children?: TreeNode[]
}

const treeLoading = ref(false)
const treeData = ref<TreeNode[]>([])
const treeExpandedKeys = ref<string[]>([])
const allTreeKeys = ref<string[]>([])

function transformBomTreeToTableData(tree: any, parentKey: string): TreeNode[] {
  if (!tree || !tree.details) return []
  const nodes: TreeNode[] = []
  tree.details.forEach((d: any, index: number) => {
    const key = `${parentKey}-${index}-${d.material_number}`
    const node: TreeNode = {
      key,
      material_number: d.material_number,
      material_name: d.material_name,
      material_type: d.material_type,
      standard_quantity: d.standard_quantity,
      unit: d.unit,
      wastage_rate: d.wastage_rate,
      actual_quantity: d.actual_quantity,
      has_child_bom: d.has_child_bom,
      matched_bom_number: d.matched_bom_number,
      is_circular: false,
      circular_bom_number: null
    }
    if (d.children) {
      if (d.children.circular) {
        node.is_circular = true
        node.circular_bom_number = d.children.mfg_bom_number
      } else {
        const childNodes = transformBomTreeToTableData(d.children, key)
        if (childNodes.length > 0) {
          node.children = childNodes
        }
      }
    }
    nodes.push(node)
  })
  return nodes
}

function collectAllExpandableKeys(nodes: TreeNode[]): string[] {
  const keys: string[] = []
  for (const node of nodes) {
    if (node.children && node.children.length > 0) {
      keys.push(node.key)
      keys.push(...collectAllExpandableKeys(node.children))
    }
  }
  return keys
}

const loadBomTree = async () => {
  if (!selectedHeaderKey.value) return
  treeLoading.value = true
  treeData.value = []
  treeExpandedKeys.value = []
  allTreeKeys.value = []
  try {
    const res = await getMfgBomTree(selectedHeaderKey.value)
    const nodes = transformBomTreeToTableData(res.data, 'root')
    treeData.value = nodes
    const keys = collectAllExpandableKeys(nodes)
    allTreeKeys.value = keys
    treeExpandedKeys.value = [...keys]
  } catch { message.error('加载BOM树形结构失败') }
  finally { treeLoading.value = false }
}

const handleTreeExpandAll = () => { treeExpandedKeys.value = [...allTreeKeys.value] }
const handleTreeCollapseAll = () => { treeExpandedKeys.value = [] }

watch(detailViewMode, (newMode) => {
  if (newMode === 'tree' && selectedHeaderKey.value) {
    loadBomTree()
  }
})

// ==================== Dropdown Data ====================
const productList = ref<any[]>([])
const productOptions = ref<{ label: string; value: string }[]>([])
const materialList = ref<any[]>([])
const materialOptions = ref<{ label: string; value: string }[]>([])
const warehouseList = ref<any[]>([])
const warehouseOptions = ref<{ label: string; value: string }[]>([])
const routingList = ref<any[]>([])
const routingOptions = ref<{ label: string; value: string }[]>([])
const procedureList = ref<any[]>([])
const procedureOptions = ref<{ label: string; value: string }[]>([])

const fetchProducts = async () => {
  try {
    const [res1, res2] = await Promise.all([
      getItems({ item_type: '成品', page: 1, limit: 9999 }),
      getItems({ page: 1, limit: 9999 })
    ])
    const finishedList = res1.data.items || []
    const allList = res2.data.items || []
    const eligibleTypes = ['半成品', '预成型件', '骨架']
    const otherEligible = allList.filter((item: any) =>
      eligibleTypes.includes(item.item_type) && item.business_scope && item.business_scope.includes('生产')
    )
    const list = [...finishedList, ...otherEligible]
    productList.value = list
    productOptions.value = list.map((p: any) => ({ label: `${p.item_number} - ${p.item_name} (${p.item_type})`, value: p.item_number }))
  } catch {}
}
const fetchMaterials = async () => {
  try {
    const res = await getItems({ page: 1, limit: 9999 })
    const list = res.data.items || []
    materialList.value = list
    materialOptions.value = list.map((m: any) => ({ label: `${m.item_number} - ${m.item_name} (${m.item_type})`, value: m.item_number }))
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
const fetchRoutings = async () => {
  try {
    const res = await getRoutingHeaders({ page: 1, limit: 9999 })
    const list = res.data.items || []
    routingList.value = list
    routingOptions.value = list.map((r: any) => ({ label: `${r.process_route_number} - ${r.process_route_name}`, value: r.process_route_number }))
  } catch {}
}
const fetchProcedures = async () => {
  try {
    const res = await getProcedures({ page: 1, limit: 9999 })
    const list = res.data.items || []
    procedureList.value = list
    procedureOptions.value = list.map((p: any) => ({ label: `${p.standard_process_number} - ${p.standard_process_name}`, value: p.standard_process_number }))
  } catch {}
}

// ==================== Auto-fill Handlers ====================
const handleHeaderProductChange = (form: MfgBomHeader, val: string) => {
  form.item_number = val
  const found = productList.value.find((p: any) => p.item_number === val)
  form.item_name = found ? found.item_name : ''
}
const handleDetailMaterialChange = (form: MfgBomDetail, val: string) => {
  form.material_number = val
  const found = materialList.value.find((m: any) => m.item_number === val)
  if (found) {
    form.material_name = found.item_name || ''
    form.material_type = found.item_type || ''
    form.unit = found.basic_unit || ''
  }
}

// ==================== Actual Quantity Computation ====================
const calcActualQty = (stdQty: number, wastageRate: number) => {
  return Math.round(stdQty * (1 + wastageRate / 100) * 10000) / 10000
}
const detailCreateActualQty = computed(() => calcActualQty(detailCreateForm.standard_quantity, detailCreateForm.wastage_rate))
const detailEditActualQty = computed(() => calcActualQty(detailEditForm.standard_quantity, detailEditForm.wastage_rate))

// ==================== Header Columns ====================
const defaultHeaderDataColumns: any[] = [
  { title: '制造BOM编号', dataIndex: 'mfg_bom_number', key: 'mfg_bom_number', width: 110, resizable: true },
  { title: 'BOM名称', dataIndex: 'mfg_bom_name', key: 'mfg_bom_name', width: 110, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 100, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 100, resizable: true },
  { title: '版本', dataIndex: 'bom_version', key: 'bom_version', width: 60, resizable: true },
  { title: '类型', dataIndex: 'bom_type', key: 'bom_type', width: 80, resizable: true },
  { title: '基准数量', dataIndex: 'base_quantity', key: 'base_quantity', width: 70, resizable: true },
  { title: '状态', dataIndex: 'condition', key: 'condition', width: 55, resizable: true },
  { title: '审核', dataIndex: 'approval_status', key: 'approval_status', width: 60, resizable: true },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 100, resizable: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 70, resizable: true }
]
const {
  columns: headerColumns,
  columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown,
  saveColumnSetting, resetColumnSetting,
  loadColumnPreference: loadHeaderColumnPreference,
  handleResizeColumn: handleHeaderResizeColumn
} = useColumnPreference('mfg_bom_header_list', defaultHeaderDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 45, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 80, fixed: 'right' as const }]
})

// ==================== Detail Columns ====================
const defaultDetailDataColumns: any[] = [
  { title: '序号', dataIndex: 'line_number', key: 'line_number', width: 70, resizable: true },
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 120, resizable: true },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 120, resizable: true },
  { title: '物料类型', dataIndex: 'material_type', key: 'material_type', width: 90, resizable: true },
  { title: '标准用量', dataIndex: 'standard_quantity', key: 'standard_quantity', width: 90, resizable: true },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 70, resizable: true },
  { title: '损耗率(%)', dataIndex: 'wastage_rate', key: 'wastage_rate', width: 100, resizable: true },
  { title: '实际用量', dataIndex: 'actual_quantity', key: 'actual_quantity', width: 90, resizable: true },
  { title: '工序号', dataIndex: 'step_number', key: 'step_number', width: 80, resizable: true },
  { title: '关键物料', dataIndex: 'is_key_material', key: 'is_key_material', width: 90, resizable: true },
  { title: '替代料组', dataIndex: 'substitute_group', key: 'substitute_group', width: 90, resizable: true },
  { title: '替代优先级', dataIndex: 'substitute_priority', key: 'substitute_priority', width: 100, resizable: true },
  { title: '供应类型', dataIndex: 'supply_type', key: 'supply_type', width: 90, resizable: true },
  { title: '默认仓库', dataIndex: 'default_warehouse', key: 'default_warehouse', width: 100, resizable: true },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120, resizable: true }
]
const {
  columns: detailColumns,
  columnSettingVisible: detailColumnSettingVisible,
  columnSettingList: detailColumnSettingList,
  columnSettingSaving: detailColumnSettingSaving,
  openColumnSetting: openDetailColumnSetting,
  moveColumnUp: moveDetailColumnUp,
  moveColumnDown: moveDetailColumnDown,
  saveColumnSetting: saveDetailColumnSetting,
  resetColumnSetting: resetDetailColumnSetting,
  loadColumnPreference: loadDetailColumnPreference,
  handleResizeColumn: handleDetailResizeColumn
} = useColumnPreference('mfg_bom_detail_list', defaultDetailDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 80, fixed: 'right' as const }]
})

const subBomColumns = [
  { title: '序号', dataIndex: 'line_number', key: 'line_number', width: 60 },
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 120 },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 120 },
  { title: '物料类型', dataIndex: 'material_type', key: 'material_type', width: 90 },
  { title: '标准用量', dataIndex: 'standard_quantity', key: 'standard_quantity', width: 90 },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
  { title: '损耗率(%)', dataIndex: 'wastage_rate', key: 'wastage_rate', width: 90 },
  { title: '实际用量', dataIndex: 'actual_quantity', key: 'actual_quantity', width: 90 }
]

const treeTableColumns = [
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 180 },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 160 },
  { title: '物料类型', dataIndex: 'material_type', key: 'material_type', width: 100 },
  { title: '标准用量', dataIndex: 'standard_quantity', key: 'standard_quantity', width: 100 },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 70 },
  { title: '损耗率(%)', dataIndex: 'wastage_rate', key: 'wastage_rate', width: 100 },
  { title: '实际用量', dataIndex: 'actual_quantity', key: 'actual_quantity', width: 100 },
  { title: '子BOM', dataIndex: 'matched_bom_number', key: 'matched_bom_number', width: 160 }
]

const detailModalColumns = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60 },
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 120 },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 120 },
  { title: '物料类型', dataIndex: 'material_type', key: 'material_type', width: 90 },
  { title: '标准用量', dataIndex: 'standard_quantity', key: 'standard_quantity', width: 90 },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
  { title: '损耗率(%)', dataIndex: 'wastage_rate', key: 'wastage_rate', width: 90 },
  { title: '实际用量', dataIndex: 'actual_quantity', key: 'actual_quantity', width: 90 },
  { title: '关键物料', dataIndex: 'is_key_material', key: 'is_key_material', width: 80 },
  { title: '子BOM', dataIndex: 'matched_bom_number', key: 'matched_bom_number', width: 120 }
]

const materialTypeColorMap: Record<string, string> = {
  '成品': 'blue', '半成品': 'cyan', '原材料': 'green', '包材': 'orange', '骨架': 'purple', '预成型件': 'magenta'
}

// ==================== Header CRUD ====================
const fetchHeaders = async () => {
  headerLoading.value = true
  try {
    const res = await getMfgBomHeaders({ page: headerPagination.current, limit: headerPagination.pageSize, search: searchText.value, approval_status: approvalFilter.value, bom_type: bomTypeFilter.value, mfg_bom_number: columnFilters.mfg_bom_number || undefined, mfg_bom_name: columnFilters.mfg_bom_name || undefined, item_number: columnFilters.item_number || undefined, item_name: columnFilters.item_name || undefined })
    headerData.value = res.data.items
    headerPagination.total = res.data.pagination.total
  } catch { message.error('获取制造BOM列表失败') }
  finally { headerLoading.value = false }
}
const handleHeaderSearch = () => { headerPagination.current = 1; fetchHeaders() }
const handleHeaderReset = () => { searchText.value = ''; approvalFilter.value = ''; bomTypeFilter.value = ''; Object.keys(columnFilters).forEach(k => columnFilters[k] = ''); headerPagination.current = 1; fetchHeaders() }
const handleHeaderTableChange = (pag: any) => { headerPagination.current = pag.current; headerPagination.pageSize = pag.pageSize; fetchHeaders() }
const handleColumnFilterConfirm = (_key: string) => { headerPagination.current = 1; fetchHeaders() }
const handleColumnFilterReset = (key: string) => { columnFilters[key] = ''; headerPagination.current = 1; fetchHeaders() }

const handleHeaderDetail = async (record: MfgBomHeader) => {
  headerDetailRecord.value = { ...record }
  headerDetailTab.value = 'info'
  headerDetailDetails.value = []
  headerDetailTreeData.value = []
  headerDetailTreeExpKeys.value = []
  headerDetailAllTreeKeys.value = []
  headerDetailTreeRaw.value = null
  headerDetailVisible.value = true
  headerDetailLoading.value = true
  try {
    const [detailRes, treeRes] = await Promise.all([
      getMfgBomHeaderDetail(record.mfg_bom_number!),
      getMfgBomTree(record.mfg_bom_number!)
    ])
    const detailObj = detailRes.data || detailRes
    const details = detailObj.details || []
    headerDetailDetails.value = details.map((d: any, i: number) => ({ ...d, _idx: i + 1 }))
    const rawTree = treeRes.data || treeRes
    headerDetailTreeRaw.value = rawTree
    if (rawTree && rawTree.details) {
      const nodes = transformBomTreeToTableData(rawTree, 'root')
      headerDetailTreeData.value = nodes
      const keys = collectAllExpandableKeys(nodes)
      headerDetailAllTreeKeys.value = keys
      await nextTick()
      headerDetailTreeExpKeys.value = [...keys]
    }
  } catch {
    message.error('加载制造BOM详情失败')
  } finally {
    headerDetailLoading.value = false
  }
}
const handleDetailTreeExpandAll = () => { headerDetailTreeExpKeys.value = [...headerDetailAllTreeKeys.value] }
const handleDetailTreeCollapseAll = () => { headerDetailTreeExpKeys.value = [] }

// ECharts
function transformToEChartsData(tree: any): any {
  if (!tree) return null
  const root: any = {
    name: `${tree.item_number}\n${tree.item_name || tree.mfg_bom_name}`,
    value: `${tree.mfg_bom_number} (${tree.bom_version})`,
    children: []
  }
  if (tree.details) {
    root.children = tree.details.map((d: any) => buildEChartsNode(d))
  }
  return root
}
function buildEChartsNode(detail: any): any {
  const node: any = {
    name: `${detail.material_number}\n${detail.material_name}\n用量: ${detail.standard_quantity} ${detail.unit}`,
    value: `${detail.material_number}\n${detail.actual_quantity} ${detail.unit}`,
    lineStyle: { color: '#91caff' }
  }
  if (detail.children) {
    if (detail.children.circular) {
      node.children = [{ name: '循环引用', value: detail.children.mfg_bom_number, itemStyle: { color: '#ff4d4f' }, label: { color: '#ff4d4f' } }]
    } else if (detail.children.details) {
      node.children = detail.children.details.map((d: any) => buildEChartsNode(d))
    }
  }
  return node
}
const detailEchartsOption = computed(() => {
  const data = transformToEChartsData(headerDetailTreeRaw.value)
  if (!data) return {}
  return {
    tooltip: { trigger: 'item', triggerOn: 'mousemove', formatter: (params: any) => params.data?.value || '' },
    series: [{
      type: 'tree', data: [data], orient: 'LR', layout: 'orthogonal',
      symbol: 'roundRect', symbolSize: [130, 50], roam: true, initialTreeDepth: 3,
      label: { position: 'inside', fontSize: 10, color: '#333' },
      leaves: { label: { position: 'inside', fontSize: 11 } },
      emphasis: { focus: 'descendant' },
      expandAndCollapse: true, animationDuration: 300, animationDurationUpdate: 300
    }],
    grid: { top: 20, bottom: 20 }
  }
})

const originalEditBomNumber = ref('')
const handleHeaderEdit = (record: MfgBomHeader) => {
  originalEditBomNumber.value = record.mfg_bom_number!
  Object.assign(headerEditForm, { ...emptyHeader(), ...record })
  headerEditVisible.value = true
}
const handleHeaderDelete = (record: MfgBomHeader) => {
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除制造BOM"${record.mfg_bom_number}"及其所有物料明细吗?`, okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        await deleteMfgBomHeader(record.mfg_bom_number!)
        message.success('删除成功')
        if (selectedHeaderKey.value === record.mfg_bom_number) {
          selectedHeaderKey.value = null
          detailData.value = []
        }
        fetchHeaders()
      } catch { message.error('删除失败') }
    }
  })
}
const handleHeaderEditOk = async () => {
  try {
    await updateMfgBomHeader(originalEditBomNumber.value, headerEditForm)
    message.success('更新成功'); headerEditVisible.value = false; fetchHeaders()
  } catch { message.error('更新失败') }
}
const handleHeaderCreateOk = async () => {
  if (!headerCreateForm.mfg_bom_number) { message.warning('请输入制造BOM编号'); return }
  try {
    await createMfgBomHeader(headerCreateForm)
    message.success('创建成功'); headerCreateVisible.value = false
    Object.assign(headerCreateForm, emptyHeader()); fetchHeaders()
  } catch { message.error('创建失败') }
}

// ==================== Version Copy ====================
const handleCopyVersion = (record: MfgBomHeader) => {
  Modal.confirm({
    title: '复制为新版本', icon: createVNode(CopyOutlined),
    content: `将制造BOM"${record.mfg_bom_number}"(${record.bom_version})复制为新版本?新版本将为草稿状态。`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        const res = await copyMfgBomAsNewVersion(record.mfg_bom_number!)
        message.success(`已创建新版本: ${res.data.newBomNumber}`)
        fetchHeaders()
      } catch { message.error('版本复制失败') }
    }
  })
}

// ==================== More Actions ====================
const handleMoreAction = async (key: string, record: MfgBomHeader) => {
  const id = record.mfg_bom_number!
  if (key === 'edit') {
    if (record.approval_status !== '草稿') return
    handleHeaderEdit(record)
  } else if (key === 'delete') {
    if (record.approval_status !== '草稿') return
    handleHeaderDelete(record)
  } else if (key === 'copy') {
    handleCopyVersion(record)
  } else if (key === 'duplicate') {
    Modal.confirm({
      title: '复制制造BOM',
      icon: createVNode(CopyOutlined),
      content: `将复制制造BOM "${record.mfg_bom_number}" 的主表及所有明细，生成新的制造BOM。确定继续？`,
      okText: '确定',
      cancelText: '取消',
      async onOk() {
        try {
          const res = await duplicateMfgBom(id)
          if (res.success) {
            message.success(res.message || '复制成功')
            fetchHeaders()
          } else {
            message.error(res.message || '复制失败')
          }
        } catch { message.error('复制失败') }
      }
    })
  } else if (key === 'tree') {
    bomRouter.push({ path: '/mfg-bom-tree', query: { bomNumber: id } })
  } else if (key === 'history') {
    approvalLogRecordId.value = id
    approvalLogVisible.value = true
  } else if (key === 'submit') {
    Modal.confirm({
      title: '提交审核', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要提交审核吗？提交后将不可编辑。', okText: '确认', cancelText: '取消',
      onOk: async () => { try { await submitForApproval('mfg_bom_header', id); message.success('提交审核成功'); fetchHeaders() } catch { message.error('提交审核失败') } }
    })
  } else if (key === 'approve') {
    Modal.confirm({
      title: '审核通过', icon: createVNode(ExclamationCircleOutlined),
      content: '确定审核通过吗？', okText: '通过', cancelText: '取消',
      onOk: async () => { try { await approveRecord('mfg_bom_header', id); message.success('审核通过'); fetchHeaders() } catch { message.error('审核失败') } }
    })
  } else if (key === 'withdraw') {
    Modal.confirm({
      title: '撤回提交', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要撤回审核提交吗？', okText: '撤回', cancelText: '取消',
      onOk: async () => { try { await withdrawApproval('mfg_bom_header', id); message.success('撤回成功'); fetchHeaders() } catch { message.error('撤回失败') } }
    })
  } else if (key === 'reverse') {
    Modal.confirm({
      title: '反审退回', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要执行反审吗？记录将退回草稿状态，可重新编辑。', okText: '确认反审', okType: 'danger', cancelText: '取消',
      onOk: async () => { try { await reverseApproval('mfg_bom_header', id); message.success('反审成功，已退回草稿'); fetchHeaders() } catch { message.error('反审失败') } }
    })
  }
}

// ==================== Header Row Click ====================
const handleHeaderRowClick = (record: MfgBomHeader) => {
  selectedHeaderKey.value = record.mfg_bom_number!
  nextTick(() => { pageTab.value = 'detail' })
}
const headerCustomRow = (record: MfgBomHeader) => ({
  onClick: () => handleHeaderRowClick(record),
  style: selectedHeaderKey.value === record.mfg_bom_number ? 'background: #e6f7ff; cursor: pointer;' : 'cursor: pointer;'
})

// ==================== Detail CRUD ====================
const fetchDetails = async () => {
  if (!selectedHeaderKey.value) { detailData.value = []; return }
  detailLoading.value = true
  expandedRowKeys.value = []
  subBomCache.value = {}
  try {
    const res = await getMfgBomHeaderDetail(selectedHeaderKey.value)
    detailData.value = res.data.details || []
  } catch { message.error('获取制造BOM明细失败') }
  finally { detailLoading.value = false }
}

watch(selectedHeaderKey, () => { fetchDetails() })

const handleDetailEdit = (record: MfgBomDetail) => {
  Object.assign(detailEditForm, { ...emptyDetail(), ...record })
  detailEditVisible.value = true
}
const handleDetailDelete = (record: MfgBomDetail) => {
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除物料行 ${record.line_number} (${record.material_number}) 吗?`, okText: '确认', cancelText: '取消',
    onOk: async () => {
      try { await deleteMfgBomDetail(record.id!); message.success('删除成功'); fetchDetails() }
      catch { message.error('删除失败') }
    }
  })
}
const handleDetailEditOk = async () => {
  detailEditForm.actual_quantity = detailEditActualQty.value
  try {
    await updateMfgBomDetail(detailEditForm.id!, detailEditForm)
    message.success('更新成功'); detailEditVisible.value = false; fetchDetails()
  } catch { message.error('更新失败') }
}
const handleDetailCreateOk = async () => {
  if (!selectedHeaderKey.value) { message.warning('请先选择制造BOM'); return }
  detailCreateForm.actual_quantity = detailCreateActualQty.value
  try {
    await addMfgBomDetail(selectedHeaderKey.value, detailCreateForm)
    message.success('新增物料成功'); detailCreateVisible.value = false
    Object.assign(detailCreateForm, emptyDetail()); fetchDetails()
  } catch { message.error('新增物料失败') }
}
const openDetailCreate = () => {
  if (!selectedHeaderKey.value) { message.warning('请先在上方选择一条制造BOM'); return }
  Object.assign(detailCreateForm, emptyDetail())
  detailCreateVisible.value = true
}

// ==================== Export / Import ====================
const handleExport = async (format: string = 'xlsx') => {
  try {
    const res = await exportMfgBomData(format)
    const ext = format === 'xls' ? 'xls' : 'xlsx'
    const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = generateExportFilename('mfg_bom_data', ext); link.click(); URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}
const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement; const file = target.files?.[0]; if (!file) return
  try {
    const formData = new FormData(); formData.append('file', file)
    await importMfgBomData(formData); message.success('导入成功'); fetchHeaders()
  } catch { message.error('导入失败') }
  finally { target.value = '' }
}

// ==================== Import from BOM ====================
const importBomVisible = ref(false)
const bomListData = ref<any[]>([])
const bomListLoading = ref(false)
const bomSearchText = ref('')
const selectedBomKeys = ref<string[]>([])
const bomPagination = reactive({ current: 1, pageSize: 10, total: 0 })

const bomColumns = [
  { title: 'BOM编号', dataIndex: 'bom_number', key: 'bom_number', width: 120 },
  { title: 'BOM名称', dataIndex: 'bom_name', key: 'bom_name', width: 120 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 100 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 100 },
  { title: '版本', dataIndex: 'bom_version', key: 'bom_version', width: 60 },
  { title: '类型', dataIndex: 'bom_type', key: 'bom_type', width: 80 },
  { title: '状态', dataIndex: 'condition', key: 'condition', width: 60 },
  { title: '审核', dataIndex: 'approval_status', key: 'approval_status', width: 70 },
  { title: '操作', key: 'action', width: 80 }
]

const fetchBomList = async () => {
  bomListLoading.value = true
  try {
    const res = await getBomHeaders({ page: bomPagination.current, limit: bomPagination.pageSize, search: bomSearchText.value })
    bomListData.value = res.data.items || []
    bomPagination.total = res.data.pagination?.total || 0
  } catch { message.error('获取BOM列表失败') }
  finally { bomListLoading.value = false }
}
const openImportBomModal = () => {
  importBomVisible.value = true
  bomSearchText.value = ''
  selectedBomKeys.value = []
  bomPagination.current = 1
  fetchBomList()
}
const handleBomTableChange = (pag: any) => { bomPagination.current = pag.current; bomPagination.pageSize = pag.pageSize; fetchBomList() }

const handleImportFromBom = async (record: any) => {
  try {
    await importFromBom({ bom_number: record.bom_number })
    message.success(`已导入BOM: ${record.bom_number}`)
    fetchHeaders()
    fetchBomList()
  } catch (e: any) { message.error(e?.response?.data?.message || '导入失败') }
}
const handleBatchImportFromBom = async () => {
  if (selectedBomKeys.value.length === 0) { message.warning('请选择要导入的BOM'); return }
  Modal.confirm({
    title: '批量导入', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要导入选中的 ${selectedBomKeys.value.length} 条BOM吗？`, okText: '确认', cancelText: '取消',
    onOk: async () => {
      let successCount = 0
      const errors: string[] = []
      for (const key of selectedBomKeys.value) {
        try {
          await importFromBom({ bom_number: key })
          successCount++
        } catch (e: any) {
          errors.push(`${key}: ${e?.response?.data?.message || '失败'}`)
        }
      }
      if (successCount > 0) message.success(`成功导入 ${successCount} 条BOM`)
      if (errors.length > 0) message.warning(`${errors.length} 条导入失败`)
      selectedBomKeys.value = []
      fetchHeaders()
      fetchBomList()
    }
  })
}

// ==================== Lifecycle ====================
onMounted(async () => {
  fetchHeaders()
  fetchProducts()
  fetchMaterials()
  fetchWarehouses()
  fetchRoutings()
  fetchProcedures()
  await loadHeaderColumnPreference()
  await loadDetailColumnPreference()
})
</script>

<template>
  <div class="mfg-bom-page">
    <!-- ========== Header Table (Top) ========== -->
    <a-card title="制造BOM管理（主表）" :bordered="false" class="header-card">
      <template #extra>
        <a-space :size="4" wrap>
          <a-input-search v-model:value="searchText" placeholder="搜索编号/名称/产品" style="width: 170px" size="small" @search="handleHeaderSearch" />
          <a-select v-model:value="approvalFilter" placeholder="审核状态" allow-clear style="width: 100px" size="small" @change="handleHeaderSearch">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="草稿">草稿</a-select-option>
            <a-select-option value="待审批">待审核</a-select-option>
            <a-select-option value="已审批">已审</a-select-option>
          </a-select>
          <a-select v-model:value="bomTypeFilter" placeholder="BOM类型" allow-clear style="width: 100px" size="small" @change="handleHeaderSearch">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="标准BOM">标准BOM</a-select-option>
            <a-select-option value="工程BOM">工程BOM</a-select-option>
          </a-select>
          <a-button size="small" @click="handleHeaderReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-dropdown>
            <a-button size="small"><template #icon><DownloadOutlined /></template>导出</a-button>
            <template #overlay>
              <a-menu @click="({ key }: any) => handleExport(key)">
                <a-menu-item key="xlsx">导出为 xlsx</a-menu-item>
                <a-menu-item key="xls">导出为 xls</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
          <a-button size="small" @click="handleImportClick"><template #icon><UploadOutlined /></template>导入</a-button>
          <a-button size="small" @click="openImportBomModal"><template #icon><ImportOutlined /></template>从BOM导入</a-button>
          <a-button type="primary" size="small" @click="headerCreateVisible = true"><template #icon><PlusOutlined /></template>新建</a-button>
          <a-tooltip title="列设置"><a-button size="small" @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
        </a-space>
      </template>
      <a-table
        :columns="headerColumns" :data-source="headerData" :loading="headerLoading"
        :row-key="(record: MfgBomHeader) => record.mfg_bom_number!"
        :pagination="headerPagination"
        :scroll="{ x: 1600 }"
        :custom-row="headerCustomRow"
        :row-class-name="(record: MfgBomHeader) => selectedHeaderKey === record.mfg_bom_number ? 'selected-row' : ''"
        :row-selection="{ selectedRowKeys: selectedHeaderKeys, onChange: (keys: string[]) => { selectedHeaderKeys = keys } }"
        size="small"
        @change="handleHeaderTableChange"
        @resizeColumn="handleHeaderResizeColumn"
      >
        <template #bodyCell="{ column, index }">
          <template v-if="column.key === 'rowIndex'">{{ (headerPagination.current - 1) * headerPagination.pageSize + index + 1 }}</template>
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
                    <a-menu-item key="copy" :disabled="headerData[index].approval_status !== '已审批'"><CopyOutlined /> 新版本</a-menu-item>
                    <a-menu-item key="duplicate"><CopyOutlined /> 复制</a-menu-item>
                    <a-menu-item key="tree"><ApartmentOutlined /> 树形结构</a-menu-item>
                    <a-menu-item key="history"><HistoryOutlined /> 审批历史</a-menu-item>
                    <a-menu-item key="delete" :disabled="headerData[index].approval_status !== '草稿'"><span style="color: #ff4d4f"><DeleteOutlined /> 删除</span></a-menu-item>
                  </a-menu>
                </template>
              </a-dropdown>
            </a-space>
          </template>
        </template>
        <template #customFilterDropdown="{ column, confirm, clearFilters }">
          <div style="padding: 8px">
            <a-input
              v-model:value="columnFilters[column.key as string]"
              :placeholder="`搜索${column.title}`"
              style="width: 180px; margin-bottom: 8px; display: block"
              allow-clear
              @pressEnter="handleColumnFilterConfirm(column.key as string); confirm()"
            />
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
      </a-table>
        </a-tab-pane>

        <!-- ========== Tab 2: 物料明细 ========== -->
        <a-tab-pane key="detail">
          <template #tab>
            <span>物料明细</span>
            <span v-if="selectedHeaderKey" style="margin-left: 8px; font-size: 12px; color: #888;">{{ selectedHeaderKey }}</span>
          </template>
          <div v-if="!selectedHeaderKey" style="text-align: center; padding: 40px 0; color: #aaa;">
            <a-empty description="请在「制造BOM管理（主表）」中点击一行以查看明细" />
          </div>
          <template v-else>
            <div class="tab-toolbar">
              <div>
                <a-tag v-if="isDetailReadonly" color="orange" style="font-size: 12px;">只读（主表非草稿状态）</a-tag>
              </div>
              <a-space>
                <a-radio-group v-model:value="detailViewMode" button-style="solid" size="small">
                  <a-radio-button value="table"><UnorderedListOutlined /> 列表</a-radio-button>
                  <a-radio-button value="tree"><ApartmentOutlined /> BOM结构树</a-radio-button>
                </a-radio-group>
                <template v-if="detailViewMode === 'tree' && treeData.length > 0">
                  <a-button size="small" @click="handleTreeExpandAll">全部展开</a-button>
                  <a-button size="small" @click="handleTreeCollapseAll">全部折叠</a-button>
                </template>
                <a-button v-if="detailViewMode === 'table'" type="primary" :disabled="!selectedHeaderKey || isDetailReadonly" @click="openDetailCreate"><template #icon><PlusOutlined /></template>新增物料</a-button>
                <a-tooltip v-if="detailViewMode === 'table'" title="列设置"><a-button size="small" @click="openDetailColumnSetting"><SettingOutlined /></a-button></a-tooltip>
              </a-space>
            </div>

      <!-- 列表视图 -->
      <a-table
        v-if="detailViewMode === 'table'"
        :columns="detailColumns" :data-source="detailData" :loading="detailLoading"
        :row-key="(record: MfgBomDetail) => record.id!"
        :pagination="{ showTotal: (total: number) => `共 ${total} 条记录`, showSizeChanger: true }"
        :scroll="{ x: 1800 }"
        v-model:expandedRowKeys="expandedRowKeys"
        :expandable="{
          expandedRowRender: undefined,
          rowExpandable: (record: MfgBomDetail) => !!record.has_child_bom
        }"
        @expand="handleDetailExpand"
        @resizeColumn="handleDetailResizeColumn"
      >
        <template #expandedRowRender="{ record }">
          <div style="padding: 8px 16px;">
            <a-spin v-if="subBomLoading[record.id]" />
            <template v-else-if="subBomCache[record.id]">
              <div v-if="subBomCache[record.id].circular" style="color: #faad14;">
                <ExclamationCircleOutlined /> 检测到循环引用，已停止展开
              </div>
              <template v-else>
                <div style="margin-bottom: 6px; color: #1890ff; font-weight: 500;">
                  <ApartmentOutlined /> 子BOM: {{ subBomCache[record.id].mfg_bom_number }} - {{ subBomCache[record.id].mfg_bom_name }}
                  <a-tag color="blue" style="margin-left: 8px;">{{ subBomCache[record.id].bom_version }}</a-tag>
                  <a-tag :color="subBomCache[record.id].approval_status === '已审批' ? 'green' : 'orange'">{{ subBomCache[record.id].approval_status }}</a-tag>
                </div>
                <a-table
                  :columns="subBomColumns"
                  :data-source="subBomCache[record.id].details || []"
                  :row-key="(r: any) => r.id"
                  :pagination="false"
                  size="small"
                  bordered
                >
                  <template #bodyCell="{ column, record: subRecord }">
                    <template v-if="column.key === 'material_type'">
                      <span>{{ subRecord.material_type }}</span>
                      <ApartmentOutlined v-if="subRecord.has_child_bom" style="margin-left: 4px; color: #1890ff;" />
                    </template>
                  </template>
                </a-table>
              </template>
            </template>
            <span v-else style="color: #999;">无子BOM数据</span>
          </div>
        </template>
        <template #bodyCell="{ column, index }">
          <template v-if="column.key === 'rowIndex'">{{ index + 1 }}</template>
          <template v-else-if="column.key === 'material_type'">
            <span>{{ detailData[index].material_type }}</span>
            <a-tooltip v-if="detailData[index].has_child_bom" title="有子BOM">
              <ApartmentOutlined style="margin-left: 4px; color: #1890ff;" />
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'is_key_material'">
            <a-tag :color="detailData[index].is_key_material ? 'red' : 'default'">{{ detailData[index].is_key_material ? '是' : '否' }}</a-tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-tooltip title="编辑"><a-button type="link" size="small" :disabled="isDetailReadonly" @click="handleDetailEdit(detailData[index])"><EditOutlined /></a-button></a-tooltip>
              <a-tooltip title="删除"><a-button type="link" danger size="small" :disabled="isDetailReadonly" @click="handleDetailDelete(detailData[index])"><DeleteOutlined /></a-button></a-tooltip>
            </a-space>
          </template>
        </template>
      </a-table>

      <!-- BOM结构树视图 -->
      <a-table
        v-else
        :columns="treeTableColumns"
        :data-source="treeData"
        :loading="treeLoading"
        childrenColumnName="children"
        v-model:expandedRowKeys="treeExpandedKeys"
        rowKey="key"
        :pagination="false"
        :scroll="{ x: 1100, y: 'calc(50vh - 200px)' }"
        size="small"
        bordered
        :row-class-name="(record: TreeNode) => record.is_circular ? 'circular-row' : ''"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'material_number'">
            <span>{{ record.material_number }}</span>
            <a-tooltip v-if="record.is_circular" title="检测到循环引用，已停止展开">
              <a-tag color="warning" style="margin-left: 6px;">
                <WarningOutlined /> 循环引用
              </a-tag>
            </a-tooltip>
          </template>
          <template v-else-if="column.key === 'material_type'">
            <a-tag :color="materialTypeColorMap[record.material_type] || 'default'">{{ record.material_type }}</a-tag>
          </template>
          <template v-else-if="column.key === 'matched_bom_number'">
            <template v-if="record.is_circular">
              <a-tag color="error">
                <WarningOutlined /> {{ record.circular_bom_number }}
              </a-tag>
            </template>
            <template v-else-if="record.matched_bom_number">
              <a style="color: #1890ff;">
                <ApartmentOutlined /> {{ record.matched_bom_number }}
              </a>
            </template>
            <span v-else style="color: #ccc;">-</span>
          </template>
        </template>
      </a-table>
          </template>
        </a-tab-pane>
      </a-tabs>
    </a-card>

    <!-- ========== Header Create Modal ========== -->
    <a-modal v-model:open="headerCreateVisible" title="新建制造BOM" @ok="handleHeaderCreateOk" okText="确认" cancelText="取消" width="750px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="制造BOM编号" required><a-input v-model:value="headerCreateForm.mfg_bom_number" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="BOM名称"><a-input v-model:value="headerCreateForm.mfg_bom_name" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="产品编号">
              <a-select v-model:value="headerCreateForm.item_number" show-search allow-clear placeholder="请选择产品"
                :options="productOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleHeaderProductChange(headerCreateForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="产品名称"><a-input v-model:value="headerCreateForm.item_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="版本号"><a-input v-model:value="headerCreateForm.bom_version" /></a-form-item></a-col>
          <a-col :span="12">
            <a-form-item label="BOM类型">
              <a-select v-model:value="headerCreateForm.bom_type" placeholder="请选择">
                <a-select-option value="标准BOM">标准BOM</a-select-option>
                <a-select-option value="工程BOM">工程BOM</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="基准数量"><a-input-number v-model:value="headerCreateForm.base_quantity" :min="0" style="width: 100%" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="基准单位"><a-select v-model:value="headerCreateForm.base_unit"><a-select-option value="PCS">PCS</a-select-option><a-select-option value="KG">KG</a-select-option></a-select></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="关联工艺路线">
              <a-select v-model:value="headerCreateForm.process_route_number" show-search allow-clear placeholder="请选择工艺路线"
                :options="routingOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="状态"><a-select v-model:value="headerCreateForm.condition"><a-select-option :value="CONDITION_STATUS.ENABLED">启用</a-select-option><a-select-option :value="CONDITION_STATUS.DISABLED">禁用</a-select-option></a-select></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24"><a-form-item label="备注" :label-col="{ span: 4 }" :wrapper-col="{ span: 19 }"><a-textarea v-model:value="headerCreateForm.remark" :rows="2" /></a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- ========== Header Edit Modal ========== -->
    <a-modal v-model:open="headerEditVisible" title="编辑制造BOM" @ok="handleHeaderEditOk" okText="确认" cancelText="取消" width="750px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="制造BOM编号"><a-input v-model:value="headerEditForm.mfg_bom_number" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="BOM名称"><a-input v-model:value="headerEditForm.mfg_bom_name" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="产品编号">
              <a-select v-model:value="headerEditForm.item_number" show-search allow-clear placeholder="请选择产品"
                :options="productOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleHeaderProductChange(headerEditForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="产品名称"><a-input v-model:value="headerEditForm.item_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="版本号"><a-input v-model:value="headerEditForm.bom_version" /></a-form-item></a-col>
          <a-col :span="12">
            <a-form-item label="BOM类型">
              <a-select v-model:value="headerEditForm.bom_type" placeholder="请选择">
                <a-select-option value="标准BOM">标准BOM</a-select-option>
                <a-select-option value="工程BOM">工程BOM</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="基准数量"><a-input-number v-model:value="headerEditForm.base_quantity" :min="0" style="width: 100%" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="基准单位"><a-select v-model:value="headerEditForm.base_unit"><a-select-option value="PCS">PCS</a-select-option><a-select-option value="KG">KG</a-select-option></a-select></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="关联工艺路线">
              <a-select v-model:value="headerEditForm.process_route_number" show-search allow-clear placeholder="请选择工艺路线"
                :options="routingOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="状态"><a-select v-model:value="headerEditForm.condition"><a-select-option :value="CONDITION_STATUS.ENABLED">启用</a-select-option><a-select-option :value="CONDITION_STATUS.DISABLED">禁用</a-select-option></a-select></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="创建日期"><a-input v-model:value="headerEditForm.creation_date" disabled /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="创建人"><a-input v-model:value="headerEditForm.creation_man" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24"><a-form-item label="备注" :label-col="{ span: 4 }" :wrapper-col="{ span: 19 }"><a-textarea v-model:value="headerEditForm.remark" :rows="2" /></a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- ========== Detail Create Modal ========== -->
    <a-modal v-model:open="detailCreateVisible" title="新增物料" @ok="handleDetailCreateOk" okText="确认" cancelText="取消" width="800px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="行序号"><a-input-number v-model:value="detailCreateForm.line_number" :min="0" :step="10" style="width: 100%" placeholder="留空自动生成" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工序号">
              <a-select v-model:value="detailCreateForm.step_number" show-search allow-clear placeholder="请选择工序"
                :options="procedureOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="物料编号">
              <a-select v-model:value="detailCreateForm.material_number" show-search allow-clear placeholder="请选择物料"
                :options="materialOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleDetailMaterialChange(detailCreateForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="物料名称"><a-input v-model:value="detailCreateForm.material_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="物料类型"><a-input v-model:value="detailCreateForm.material_type" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="单位"><a-input v-model:value="detailCreateForm.unit" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="标准用量"><a-input-number v-model:value="detailCreateForm.standard_quantity" :min="0" :precision="4" style="width: 100%" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="损耗率(%)"><a-input-number v-model:value="detailCreateForm.wastage_rate" :min="0" :max="100" :precision="2" style="width: 100%" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="实际用量"><a-input-number :value="detailCreateActualQty" disabled style="width: 100%" /></a-form-item></a-col>
          <a-col :span="12">
            <a-form-item label="关键物料">
              <a-select v-model:value="detailCreateForm.is_key_material">
                <a-select-option :value="0">否</a-select-option>
                <a-select-option :value="1">是</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="替代料组号"><a-input v-model:value="detailCreateForm.substitute_group" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="替代优先级"><a-input-number v-model:value="detailCreateForm.substitute_priority" :min="0" style="width: 100%" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="供应类型">
              <a-select v-model:value="detailCreateForm.supply_type" allow-clear placeholder="请选择">
                <a-select-option value="采购">采购</a-select-option>
                <a-select-option value="自制">自制</a-select-option>
                <a-select-option value="委外">委外</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="默认仓库">
              <a-select v-model:value="detailCreateForm.default_warehouse" show-search allow-clear placeholder="请选择仓库"
                :options="warehouseOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="关联子BOM"><a-input v-model:value="detailCreateForm.child_mfg_bom_number" placeholder="可选，指定子BOM编号" allow-clear /></a-form-item></a-col>
          <a-col :span="12"></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24"><a-form-item label="备注" :label-col="{ span: 4 }" :wrapper-col="{ span: 19 }"><a-textarea v-model:value="detailCreateForm.remark" :rows="2" /></a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- ========== Detail Edit Modal ========== -->
    <a-modal v-model:open="detailEditVisible" title="编辑物料" @ok="handleDetailEditOk" okText="确认" cancelText="取消" width="800px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="行序号"><a-input-number v-model:value="detailEditForm.line_number" :min="0" :step="10" style="width: 100%" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工序号">
              <a-select v-model:value="detailEditForm.step_number" show-search allow-clear placeholder="请选择工序"
                :options="procedureOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="物料编号">
              <a-select v-model:value="detailEditForm.material_number" show-search allow-clear placeholder="请选择物料"
                :options="materialOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())"
                @change="(val: string) => handleDetailMaterialChange(detailEditForm, val)" />
            </a-form-item>
          </a-col>
          <a-col :span="12"><a-form-item label="物料名称"><a-input v-model:value="detailEditForm.material_name" disabled /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="物料类型"><a-input v-model:value="detailEditForm.material_type" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="单位"><a-input v-model:value="detailEditForm.unit" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="标准用量"><a-input-number v-model:value="detailEditForm.standard_quantity" :min="0" :precision="4" style="width: 100%" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="损耗率(%)"><a-input-number v-model:value="detailEditForm.wastage_rate" :min="0" :max="100" :precision="2" style="width: 100%" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="实际用量"><a-input-number :value="detailEditActualQty" disabled style="width: 100%" /></a-form-item></a-col>
          <a-col :span="12">
            <a-form-item label="关键物料">
              <a-select v-model:value="detailEditForm.is_key_material">
                <a-select-option :value="0">否</a-select-option>
                <a-select-option :value="1">是</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="替代料组号"><a-input v-model:value="detailEditForm.substitute_group" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="替代优先级"><a-input-number v-model:value="detailEditForm.substitute_priority" :min="0" style="width: 100%" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="供应类型">
              <a-select v-model:value="detailEditForm.supply_type" allow-clear placeholder="请选择">
                <a-select-option value="采购">采购</a-select-option>
                <a-select-option value="自制">自制</a-select-option>
                <a-select-option value="委外">委外</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="默认仓库">
              <a-select v-model:value="detailEditForm.default_warehouse" show-search allow-clear placeholder="请选择仓库"
                :options="warehouseOptions" :filter-option="(input: string, option: any) => option.label.toLowerCase().includes(input.toLowerCase())" />
            </a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="关联子BOM"><a-input v-model:value="detailEditForm.child_mfg_bom_number" placeholder="可选，指定子BOM编号" allow-clear /></a-form-item></a-col>
          <a-col :span="12"></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24"><a-form-item label="备注" :label-col="{ span: 4 }" :wrapper-col="{ span: 19 }"><a-textarea v-model:value="detailEditForm.remark" :rows="2" /></a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- ========== Header Detail Modal (Tabs) ========== -->
    <a-modal v-model:open="headerDetailVisible" :title="`制造BOM详情 - ${headerDetailRecord.mfg_bom_number}`" :footer="null" width="1500px" :bodyStyle="{ padding: '12px 16px' }">
      <a-spin :spinning="headerDetailLoading">
        <a-tabs v-model:activeKey="headerDetailTab" :animated="false">
          <a-tab-pane key="info" tab="基本信息">
            <a-descriptions :column="2" bordered size="small" :labelStyle="{ fontWeight: 'bold', width: '120px' }">
              <a-descriptions-item label="制造BOM编号">{{ headerDetailRecord.mfg_bom_number }}</a-descriptions-item>
              <a-descriptions-item label="BOM名称">{{ headerDetailRecord.mfg_bom_name }}</a-descriptions-item>
              <a-descriptions-item label="产品编号">{{ headerDetailRecord.item_number }}</a-descriptions-item>
              <a-descriptions-item label="产品名称">{{ headerDetailRecord.item_name }}</a-descriptions-item>
              <a-descriptions-item label="版本号"><a-tag color="blue">{{ headerDetailRecord.bom_version }}</a-tag></a-descriptions-item>
              <a-descriptions-item label="BOM类型"><a-tag :color="headerDetailRecord.bom_type === '标准BOM' ? 'green' : 'cyan'">{{ headerDetailRecord.bom_type }}</a-tag></a-descriptions-item>
              <a-descriptions-item label="基准数量">{{ headerDetailRecord.base_quantity }}</a-descriptions-item>
              <a-descriptions-item label="基准单位">{{ headerDetailRecord.base_unit }}</a-descriptions-item>
              <a-descriptions-item label="关联工艺路线">{{ headerDetailRecord.process_route_number || '-' }}</a-descriptions-item>
              <a-descriptions-item label="状态"><a-tag :color="headerDetailRecord.condition === CONDITION_STATUS.ENABLED ? 'green' : 'red'">{{ headerDetailRecord.condition }}</a-tag></a-descriptions-item>
              <a-descriptions-item label="审批状态"><ApprovalStatusTag :status="headerDetailRecord.approval_status" /></a-descriptions-item>
              <a-descriptions-item label="创建人">{{ headerDetailRecord.creation_man || '-' }}</a-descriptions-item>
              <a-descriptions-item label="创建日期" :span="2">{{ headerDetailRecord.creation_date || '-' }}</a-descriptions-item>
              <a-descriptions-item label="备注" :span="2">{{ headerDetailRecord.remark || '-' }}</a-descriptions-item>
            </a-descriptions>
          </a-tab-pane>
          <a-tab-pane key="details" tab="物料明细">
            <a-table :columns="detailModalColumns" :data-source="headerDetailDetails" row-key="_idx" :pagination="false" :scroll="{ y: 400 }" size="small" bordered>
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'material_type'">
                  <a-tag :color="materialTypeColorMap[record.material_type] || 'default'">{{ record.material_type }}</a-tag>
                </template>
                <template v-else-if="column.key === 'is_key_material'">
                  <a-tag v-if="record.is_key_material" color="red">是</a-tag>
                  <span v-else style="color: #ccc;">-</span>
                </template>
                <template v-else-if="column.key === 'matched_bom_number'">
                  <span v-if="record.matched_bom_number || record.child_mfg_bom_number" style="color: #1890ff;"><ApartmentOutlined /> {{ record.child_mfg_bom_number || record.matched_bom_number }}</span>
                  <span v-else style="color: #ccc;">-</span>
                </template>
              </template>
            </a-table>
          </a-tab-pane>
          <a-tab-pane key="tree" tab="BOM结构树">
            <div v-if="headerDetailTreeData.length > 0" style="margin-bottom: 8px;">
              <a-space>
                <a-button size="small" @click="handleDetailTreeExpandAll"><ExpandAltOutlined /> 全部展开</a-button>
                <a-button size="small" @click="handleDetailTreeCollapseAll"><ShrinkOutlined /> 全部折叠</a-button>
              </a-space>
            </div>
            <a-table
              :columns="treeTableColumns" :data-source="headerDetailTreeData"
              childrenColumnName="children" v-model:expandedRowKeys="headerDetailTreeExpKeys"
              rowKey="key" :pagination="false" :scroll="{ x: 1200, y: 480 }" size="small" bordered
              :row-class-name="(record: TreeNode) => record.is_circular ? 'circular-row' : ''"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'material_number'">
                  <span>{{ record.material_number }}</span>
                  <a-tooltip v-if="record.is_circular" title="检测到循环引用"><a-tag color="warning" style="margin-left: 6px;"><WarningOutlined /> 循环引用</a-tag></a-tooltip>
                </template>
                <template v-else-if="column.key === 'material_type'">
                  <a-tag :color="materialTypeColorMap[record.material_type] || 'default'">{{ record.material_type }}</a-tag>
                </template>
                <template v-else-if="column.key === 'matched_bom_number'">
                  <template v-if="record.is_circular"><a-tag color="error"><WarningOutlined /> {{ record.circular_bom_number }}</a-tag></template>
                  <template v-else-if="record.matched_bom_number"><span style="color: #1890ff;"><ApartmentOutlined /> {{ record.matched_bom_number }}</span></template>
                  <span v-else style="color: #ccc;">-</span>
                </template>
              </template>
            </a-table>
          </a-tab-pane>
          <a-tab-pane key="chart" tab="可视化图表">
            <div v-if="headerDetailTreeRaw && headerDetailTab === 'chart'" class="detail-chart-container">
              <v-chart :option="detailEchartsOption" autoresize style="width: 100%; height: 100%;" />
            </div>
            <a-empty v-else-if="!headerDetailLoading && !headerDetailTreeRaw" description="暂无图表数据" />
          </a-tab-pane>
        </a-tabs>
      </a-spin>
    </a-modal>

    <!-- ========== Import from BOM Modal ========== -->
    <a-modal v-model:open="importBomVisible" title="从BOM物料清单导入" :footer="null" width="950px">
      <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
        <a-input-search v-model:value="bomSearchText" placeholder="搜索BOM编号/名称" style="width: 280px" @search="() => { bomPagination.current = 1; fetchBomList() }" />
        <a-button type="primary" :disabled="selectedBomKeys.length === 0" @click="handleBatchImportFromBom">
          批量导入 ({{ selectedBomKeys.length }})
        </a-button>
      </div>
      <a-table
        :columns="bomColumns" :data-source="bomListData" :loading="bomListLoading"
        :row-key="(r: any) => r.bom_number" :pagination="bomPagination"
        :scroll="{ y: 400 }" size="small"
        :row-selection="{ selectedRowKeys: selectedBomKeys, onChange: (keys: string[]) => { selectedBomKeys = keys } }"
        @change="handleBomTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'condition'">
            <a-tag :color="record.condition === CONDITION_STATUS.ENABLED ? 'green' : 'red'">{{ record.condition }}</a-tag>
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <ApprovalStatusTag :status="record.approval_status" />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-button type="link" size="small" @click="handleImportFromBom(record)">导入</a-button>
          </template>
        </template>
      </a-table>
    </a-modal>

    <!-- ========== Approval Log Modal ========== -->
    <ApprovalLogModal v-model:open="approvalLogVisible" module="mfg_bom_header" :record-id="approvalLogRecordId" />

    <!-- ========== Column Setting Drawers ========== -->
    <ColumnSettingDrawer v-model:open="columnSettingVisible" :settingList="columnSettingList" :saving="columnSettingSaving" @moveUp="moveColumnUp" @moveDown="moveColumnDown" @save="saveColumnSetting" @reset="resetColumnSetting" />
    <ColumnSettingDrawer v-model:open="detailColumnSettingVisible" :settingList="detailColumnSettingList" :saving="detailColumnSettingSaving" @moveUp="moveDetailColumnUp" @moveDown="moveDetailColumnDown" @save="saveDetailColumnSetting" @reset="resetDetailColumnSetting" />
  </div>
</template>

<style scoped>
.mfg-bom-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-size: 13px;
}
.tab-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.tab-toolbar .ant-btn {
  font-size: 12px;
  padding: 2px 8px;
  height: 28px;
}
.tab-toolbar .ant-input-search {
  font-size: 12px;
}
.tab-toolbar .ant-select {
  font-size: 12px;
}
.tab-toolbar :deep(.ant-select-selector) {
  height: 28px !important;
  font-size: 12px;
}
:deep(.ant-card-head) {
  display: none;
}
:deep(.ant-card-body) {
  padding: 8px 12px;
}
:deep(.ant-table) {
  font-size: 12px;
}
:deep(.ant-table-thead > tr > th) {
  padding: 6px 8px;
  font-size: 12px;
}
:deep(.ant-table-tbody > tr > td) {
  padding: 4px 8px;
}
:deep(.selected-row) td {
  background: #e6f7ff !important;
}
:deep(.circular-row) td {
  background: #fffbe6 !important;
}
.detail-chart-container {
  width: 100%;
  height: 860px;
  min-height: 800px;
}
</style>
