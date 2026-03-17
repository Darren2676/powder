<script setup lang="ts">
import { ref, reactive, onMounted, createVNode, watch, computed } from 'vue'
import { useRouter } from 'vue-router'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownloadOutlined, UploadOutlined, PlusOutlined, HistoryOutlined, CopyOutlined,
  ApartmentOutlined
} from '@ant-design/icons-vue'
import {
  getBomHeaders, getBomHeaderDetail, createBomHeader, updateBomHeader, deleteBomHeader,
  addBomDetail, updateBomDetail, deleteBomDetail,
  exportBomData, importBomData, copyBomAsNewVersion,
  getBomTree
} from '@/api/bom'
import { getItems } from '@/api/itemMaster'
import { getWarehouses } from '@/api/warehouse'
import { getRoutingHeaders } from '@/api/routingMaster'
import { useAuthStore } from '@/store/auth'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ApprovalActions from '@/components/Common/ApprovalActions.vue'
import ApprovalLogModal from '@/components/Common/ApprovalLogModal.vue'

defineOptions({ name: 'BomList' })

// ==================== Interfaces ====================
interface BomHeader {
  bom_number?: string
  bom_name: string
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
interface BomDetail {
  id?: number
  bom_number?: string
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
  child_bom_number: string
  remark: string
  has_child_bom?: boolean
  matched_bom_number?: string
}

const emptyHeader = (): BomHeader => ({
  bom_number: undefined,
  bom_name: '',
  item_number: '',
  item_name: '',
  bom_version: 'V1.0',
  bom_type: '标准BOM',
  base_quantity: 1,
  base_unit: 'PCS',
  process_route_number: '',
  condition: '启用',
  approval_status: '草稿',
  remark: '',
  creation_date: '',
  creation_man: ''
})
const emptyDetail = (): BomDetail => ({
  id: undefined,
  bom_number: undefined,
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
  child_bom_number: '',
  remark: ''
})

// ==================== Header State ====================
const authStore = useAuthStore()
const bomRouter = useRouter()
const searchText = ref('')
const approvalFilter = ref('')
const bomTypeFilter = ref('')
const approvalLogVisible = ref(false)
const approvalLogRecordId = ref('')
const headerLoading = ref(false)
const headerData = ref<BomHeader[]>([])
const headerPagination = reactive({ current: 1, pageSize: 20, total: 0 })
const selectedHeaderKey = ref<string | null>(null)
const headerEditVisible = ref(false)
const headerCreateVisible = ref(false)
const headerEditForm = reactive<BomHeader>(emptyHeader())
const headerCreateForm = reactive<BomHeader>(emptyHeader())
const fileInputRef = ref<HTMLInputElement>()

// ==================== Detail State ====================
const detailLoading = ref(false)
const detailData = ref<BomDetail[]>([])
const detailEditVisible = ref(false)
const detailCreateVisible = ref(false)
const detailEditForm = reactive<BomDetail>(emptyDetail())
const detailCreateForm = reactive<BomDetail>(emptyDetail())

// ==================== Sub-BOM Expand State ====================
const expandedRowKeys = ref<number[]>([])
const subBomCache = ref<Record<number, any>>({})
const subBomLoading = ref<Record<number, boolean>>({})

const handleDetailExpand = async (expanded: boolean, record: BomDetail) => {
  if (!expanded) return
  if (subBomCache.value[record.id!]) return
  const bomNum = record.child_bom_number || record.matched_bom_number
  if (!bomNum) return
  subBomLoading.value[record.id!] = true
  try {
    const res = await getBomTree(bomNum)
    subBomCache.value[record.id!] = res.data
  } catch { message.error('加载子BOM失败') }
  finally { subBomLoading.value[record.id!] = false }
}

// ==================== Dropdown Data ====================
const productList = ref<any[]>([])
const productOptions = ref<{ label: string; value: string }[]>([])
const materialList = ref<any[]>([])
const materialOptions = ref<{ label: string; value: string }[]>([])
const warehouseList = ref<any[]>([])
const warehouseOptions = ref<{ label: string; value: string }[]>([])
const routingList = ref<any[]>([])
const routingOptions = ref<{ label: string; value: string }[]>([])

const fetchProducts = async () => {
  try {
    // 获取所有可创建BOM的物料：成品 + 业务范围含"生产"的半成品/预成型件/骨架
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

// ==================== Auto-fill Handlers (Header) ====================
const handleHeaderProductChange = (form: BomHeader, val: string) => {
  form.item_number = val
  const found = productList.value.find((p: any) => p.item_number === val)
  form.item_name = found ? found.item_name : ''
}

// ==================== Auto-fill Handlers (Detail) ====================
const handleDetailMaterialChange = (form: BomDetail, val: string) => {
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
const headerColumns = [
  { title: '行号', key: 'rowIndex', width: 45 },
  { title: 'BOM编号', dataIndex: 'bom_number', key: 'bom_number', width: 110 },
  { title: 'BOM名称', dataIndex: 'bom_name', key: 'bom_name', width: 110 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 100 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 100 },
  { title: '版本', dataIndex: 'bom_version', key: 'bom_version', width: 60 },
  { title: '类型', dataIndex: 'bom_type', key: 'bom_type', width: 80 },
  { title: '基准数量', dataIndex: 'base_quantity', key: 'base_quantity', width: 70 },
  { title: '状态', dataIndex: 'condition', key: 'condition', width: 55 },
  { title: '审核', dataIndex: 'approval_status', key: 'approval_status', width: 60 },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 100 },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 70 },
  { title: '操作', key: 'action', width: 130, fixed: 'right' as const }
]

// ==================== Detail Columns ====================
const detailColumns = [
  { title: '行号', key: 'rowIndex', width: 60 },
  { title: '序号', dataIndex: 'line_number', key: 'line_number', width: 70 },
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 120 },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 120 },
  { title: '物料类型', dataIndex: 'material_type', key: 'material_type', width: 90 },
  { title: '标准用量', dataIndex: 'standard_quantity', key: 'standard_quantity', width: 90 },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 70 },
  { title: '损耗率(%)', dataIndex: 'wastage_rate', key: 'wastage_rate', width: 100 },
  { title: '实际用量', dataIndex: 'actual_quantity', key: 'actual_quantity', width: 90 },
  { title: '工序号', dataIndex: 'step_number', key: 'step_number', width: 80 },
  { title: '关键物料', dataIndex: 'is_key_material', key: 'is_key_material', width: 90 },
  { title: '替代料组', dataIndex: 'substitute_group', key: 'substitute_group', width: 90 },
  { title: '替代优先级', dataIndex: 'substitute_priority', key: 'substitute_priority', width: 100 },
  { title: '供应类型', dataIndex: 'supply_type', key: 'supply_type', width: 90 },
  { title: '默认仓库', dataIndex: 'default_warehouse', key: 'default_warehouse', width: 100 },
  { title: '备注', dataIndex: 'remark', key: 'remark', width: 120 },
  { title: '操作', key: 'action', width: 80, fixed: 'right' as const }
]

// ==================== Sub-BOM Columns (展开行内嵌表格) ====================
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

// ==================== Header CRUD ====================
const fetchHeaders = async () => {
  headerLoading.value = true
  try {
    const res = await getBomHeaders({ page: headerPagination.current, limit: headerPagination.pageSize, search: searchText.value, approval_status: approvalFilter.value, bom_type: bomTypeFilter.value })
    headerData.value = res.data.items
    headerPagination.total = res.data.pagination.total
  } catch { message.error('获取BOM列表失败') }
  finally { headerLoading.value = false }
}
const handleHeaderSearch = () => { headerPagination.current = 1; fetchHeaders() }
const handleHeaderReset = () => { searchText.value = ''; approvalFilter.value = ''; bomTypeFilter.value = ''; headerPagination.current = 1; fetchHeaders() }
const handleHeaderTableChange = (pag: any) => { headerPagination.current = pag.current; headerPagination.pageSize = pag.pageSize; fetchHeaders() }

const handleHeaderEdit = (record: BomHeader) => {
  Object.assign(headerEditForm, { ...emptyHeader(), ...record })
  headerEditVisible.value = true
}
const handleHeaderDelete = (record: BomHeader) => {
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除BOM"${record.bom_number}"及其所有物料明细吗?`, okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        await deleteBomHeader(record.bom_number!)
        message.success('删除成功')
        if (selectedHeaderKey.value === record.bom_number) {
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
    await updateBomHeader(headerEditForm.bom_number!, headerEditForm)
    message.success('更新成功'); headerEditVisible.value = false; fetchHeaders()
  } catch { message.error('更新失败') }
}
const handleHeaderCreateOk = async () => {
  if (!headerCreateForm.bom_number) { message.warning('请输入BOM编号'); return }
  try {
    await createBomHeader(headerCreateForm)
    message.success('创建成功'); headerCreateVisible.value = false
    Object.assign(headerCreateForm, emptyHeader()); fetchHeaders()
  } catch { message.error('创建失败') }
}

// ==================== Version Copy ====================
const handleCopyVersion = (record: BomHeader) => {
  Modal.confirm({
    title: '复制为新版本', icon: createVNode(CopyOutlined),
    content: `将BOM"${record.bom_number}"(${record.bom_version})复制为新版本?新版本将为草稿状态。`,
    okText: '确认', cancelText: '取消',
    onOk: async () => {
      try {
        const res = await copyBomAsNewVersion(record.bom_number!)
        message.success(`已创建新版本: ${res.data.newBomNumber}`)
        fetchHeaders()
      } catch { message.error('版本复制失败') }
    }
  })
}

// ==================== Header Row Click ====================
const handleHeaderRowClick = (record: BomHeader) => {
  selectedHeaderKey.value = record.bom_number!
}
const headerCustomRow = (record: BomHeader) => ({
  onClick: () => handleHeaderRowClick(record),
  style: selectedHeaderKey.value === record.bom_number ? 'background: #e6f7ff; cursor: pointer;' : 'cursor: pointer;'
})

// ==================== Detail CRUD ====================
const fetchDetails = async () => {
  if (!selectedHeaderKey.value) { detailData.value = []; return }
  detailLoading.value = true
  expandedRowKeys.value = []
  subBomCache.value = {}
  try {
    const res = await getBomHeaderDetail(selectedHeaderKey.value)
    detailData.value = res.data.details || []
  } catch { message.error('获取BOM明细失败') }
  finally { detailLoading.value = false }
}

watch(selectedHeaderKey, () => { fetchDetails() })

const handleDetailEdit = (record: BomDetail) => {
  Object.assign(detailEditForm, { ...emptyDetail(), ...record })
  detailEditVisible.value = true
}
const handleDetailDelete = (record: BomDetail) => {
  Modal.confirm({
    title: '确认删除', icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除物料行 ${record.line_number} (${record.material_number}) 吗?`, okText: '确认', cancelText: '取消',
    onOk: async () => {
      try { await deleteBomDetail(record.id!); message.success('删除成功'); fetchDetails() }
      catch { message.error('删除失败') }
    }
  })
}
const handleDetailEditOk = async () => {
  detailEditForm.actual_quantity = detailEditActualQty.value
  try {
    await updateBomDetail(detailEditForm.id!, detailEditForm)
    message.success('更新成功'); detailEditVisible.value = false; fetchDetails()
  } catch { message.error('更新失败') }
}
const handleDetailCreateOk = async () => {
  if (!selectedHeaderKey.value) { message.warning('请先选择BOM'); return }
  detailCreateForm.actual_quantity = detailCreateActualQty.value
  try {
    await addBomDetail(selectedHeaderKey.value, detailCreateForm)
    message.success('新增物料成功'); detailCreateVisible.value = false
    Object.assign(detailCreateForm, emptyDetail()); fetchDetails()
  } catch { message.error('新增物料失败') }
}
const openDetailCreate = () => {
  if (!selectedHeaderKey.value) { message.warning('请先在上方选择一条BOM'); return }
  Object.assign(detailCreateForm, emptyDetail())
  detailCreateVisible.value = true
}

// ==================== Export / Import ====================
const handleExport = async (format: string = 'xlsx') => {
  try {
    const res = await exportBomData(format)
    const ext = format === 'xls' ? 'xls' : 'xlsx'
    const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `bom_data.${ext}`; link.click(); URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}
const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement; const file = target.files?.[0]; if (!file) return
  try {
    const formData = new FormData(); formData.append('file', file)
    await importBomData(formData); message.success('导入成功'); fetchHeaders()
  } catch { message.error('导入失败') }
  finally { target.value = '' }
}

// ==================== Lifecycle ====================
onMounted(() => {
  fetchHeaders()
  fetchProducts()
  fetchMaterials()
  fetchWarehouses()
  fetchRoutings()
})
</script>

<template>
  <div class="bom-page">
    <!-- ========== Header Table (Top) ========== -->
    <a-card title="BOM物料清单管理（主表）" :bordered="false" class="header-card">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索BOM编号/名称/产品" style="width: 220px" @search="handleHeaderSearch" />
          <a-select v-model:value="approvalFilter" placeholder="审核状态" allow-clear style="width: 110px" @change="handleHeaderSearch">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="草稿">草稿</a-select-option>
            <a-select-option value="待审批">待审核</a-select-option>
            <a-select-option value="已审批">已审</a-select-option>
          </a-select>
          <a-select v-model:value="bomTypeFilter" placeholder="BOM类型" allow-clear style="width: 120px" @change="handleHeaderSearch">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="标准BOM">标准BOM</a-select-option>
            <a-select-option value="工程BOM">工程BOM</a-select-option>
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
      </template>
      <a-table
        :columns="headerColumns" :data-source="headerData" :loading="headerLoading"
        :row-key="(record: BomHeader) => record.bom_number!"
        :pagination="headerPagination"
        :scroll="{ x: 1600, y: 'calc(50vh - 200px)' }"
        :custom-row="headerCustomRow"
        :row-class-name="(record: BomHeader) => selectedHeaderKey === record.bom_number ? 'selected-row' : ''"
        @change="handleHeaderTableChange"
      >
        <template #bodyCell="{ column, index }">
          <template v-if="column.key === 'rowIndex'">{{ (headerPagination.current - 1) * headerPagination.pageSize + index + 1 }}</template>
          <template v-else-if="column.key === 'condition'">
            <a-tag :color="headerData[index].condition === '启用' ? 'green' : 'red'">{{ headerData[index].condition }}</a-tag>
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <ApprovalStatusTag :status="headerData[index].approval_status" />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-space direction="vertical" :size="0" style="line-height: 1;">
              <a-space :size="2">
                <a-tooltip title="编辑"><a-button type="link" size="small" :disabled="headerData[index].approval_status !== '草稿'" @click.stop="handleHeaderEdit(headerData[index])"><EditOutlined /></a-button></a-tooltip>
                <a-tooltip title="删除"><a-button type="link" danger size="small" :disabled="headerData[index].approval_status !== '草稿'" @click.stop="handleHeaderDelete(headerData[index])"><DeleteOutlined /></a-button></a-tooltip>
                <a-tooltip title="新版本"><a-button type="link" size="small" :disabled="headerData[index].approval_status !== '已审批'" @click.stop="handleCopyVersion(headerData[index])"><CopyOutlined /></a-button></a-tooltip>
                <a-tooltip title="审核日志"><a-button type="link" size="small" @click.stop="approvalLogRecordId = headerData[index].bom_number!; approvalLogVisible = true"><HistoryOutlined /></a-button></a-tooltip>
                <a-tooltip title="树形结构"><a-button type="link" size="small" @click.stop="bomRouter.push({ path: '/bom-tree', query: { bomNumber: headerData[index].bom_number } })"><ApartmentOutlined /></a-button></a-tooltip>
              </a-space>
              <ApprovalActions module="bom_header" :record-id="headerData[index].bom_number!" :approval-status="headerData[index].approval_status || '草稿'" @status-changed="fetchHeaders" />
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- ========== Detail Table (Bottom) ========== -->
    <a-card :bordered="false" class="detail-card">
      <template #title>
        <span>物料明细</span>
        <span v-if="selectedHeaderKey" style="margin-left: 12px; font-size: 13px; color: #888;">当前BOM: {{ selectedHeaderKey }}</span>
        <span v-else style="margin-left: 12px; font-size: 13px; color: #aaa;">请在上方选择一条BOM</span>
      </template>
      <template #extra>
        <a-button type="primary" :disabled="!selectedHeaderKey" @click="openDetailCreate"><template #icon><PlusOutlined /></template>新增物料</a-button>
      </template>
      <a-table
        :columns="detailColumns" :data-source="detailData" :loading="detailLoading"
        :row-key="(record: BomDetail) => record.id!"
        :pagination="false"
        :scroll="{ x: 1800, y: 'calc(50vh - 200px)' }"
        v-model:expandedRowKeys="expandedRowKeys"
        :expandable="{
          expandedRowRender: undefined,
          rowExpandable: (record: BomDetail) => !!record.has_child_bom
        }"
        @expand="handleDetailExpand"
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
                  <ApartmentOutlined /> 子BOM: {{ subBomCache[record.id].bom_number }} - {{ subBomCache[record.id].bom_name }}
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
              <a-tooltip title="编辑"><a-button type="link" size="small" @click="handleDetailEdit(detailData[index])"><EditOutlined /></a-button></a-tooltip>
              <a-tooltip title="删除"><a-button type="link" danger size="small" @click="handleDetailDelete(detailData[index])"><DeleteOutlined /></a-button></a-tooltip>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- ========== Header Create Modal ========== -->
    <a-modal v-model:open="headerCreateVisible" title="新建BOM" @ok="handleHeaderCreateOk" okText="确认" cancelText="取消" width="750px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="BOM编号" required><a-input v-model:value="headerCreateForm.bom_number" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="BOM名称"><a-input v-model:value="headerCreateForm.bom_name" /></a-form-item></a-col>
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
            <a-form-item label="状态"><a-select v-model:value="headerCreateForm.condition"><a-select-option value="启用">启用</a-select-option><a-select-option value="禁用">禁用</a-select-option></a-select></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24"><a-form-item label="备注" :label-col="{ span: 4 }" :wrapper-col="{ span: 19 }"><a-textarea v-model:value="headerCreateForm.remark" :rows="2" /></a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- ========== Header Edit Modal ========== -->
    <a-modal v-model:open="headerEditVisible" title="编辑BOM" @ok="handleHeaderEditOk" okText="确认" cancelText="取消" width="750px">
      <a-form :label-col="{ span: 8 }" :wrapper-col="{ span: 14 }">
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="BOM编号"><a-input v-model:value="headerEditForm.bom_number" disabled /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="BOM名称"><a-input v-model:value="headerEditForm.bom_name" /></a-form-item></a-col>
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
            <a-form-item label="状态"><a-select v-model:value="headerEditForm.condition"><a-select-option value="启用">启用</a-select-option><a-select-option value="禁用">禁用</a-select-option></a-select></a-form-item>
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
          <a-col :span="12"><a-form-item label="工序号"><a-input v-model:value="detailCreateForm.step_number" /></a-form-item></a-col>
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
          <a-col :span="12"><a-form-item label="关联子BOM"><a-input v-model:value="detailCreateForm.child_bom_number" placeholder="可选，指定子BOM编号" allow-clear /></a-form-item></a-col>
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
          <a-col :span="12"><a-form-item label="工序号"><a-input v-model:value="detailEditForm.step_number" /></a-form-item></a-col>
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
          <a-col :span="12"><a-form-item label="关联子BOM"><a-input v-model:value="detailEditForm.child_bom_number" placeholder="可选，指定子BOM编号" allow-clear /></a-form-item></a-col>
          <a-col :span="12"></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="24"><a-form-item label="备注" :label-col="{ span: 4 }" :wrapper-col="{ span: 19 }"><a-textarea v-model:value="detailEditForm.remark" :rows="2" /></a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- ========== Approval Log Modal ========== -->
    <ApprovalLogModal v-model:open="approvalLogVisible" module="bom_header" :record-id="approvalLogRecordId" />
  </div>
</template>

<style scoped>
.bom-page {
  display: flex;
  flex-direction: column;
  gap: 8px;
  height: 100%;
}
.header-card {
  flex: 1;
}
.detail-card {
  flex: 1;
}
:deep(.ant-card-extra) { padding: 0; }
:deep(.selected-row) td {
  background: #e6f7ff !important;
}
</style>
