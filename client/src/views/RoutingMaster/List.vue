<script setup lang="ts">
import { ref, reactive, onMounted, createVNode, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import {
  ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined,
  DownloadOutlined, UploadOutlined, PlusOutlined, HistoryOutlined
} from '@ant-design/icons-vue'
import {
  getRoutingHeaders, getRoutingHeaderDetail, createRoutingHeader, updateRoutingHeader, deleteRoutingHeader,
  addRoutingDetail, updateRoutingDetail, deleteRoutingDetail,
  exportRoutingMasters, importRoutingMasters
} from '@/api/routingMaster'
import { getProcedures } from '@/api/procedure'
import { getWorkCenters } from '@/api/workCenter'
import { getItems } from '@/api/itemMaster'
import { getWarehouses } from '@/api/warehouse'
import { useAuthStore } from '@/store/auth'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ApprovalActions from '@/components/Common/ApprovalActions.vue'
import ApprovalLogModal from '@/components/Common/ApprovalLogModal.vue'

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
}

const emptyHeader = (): RoutingHeader => ({
  process_route_number: undefined,
  process_route_name: '',
  item_number: '',
  item_name: '',
  production_automatic_inventory_entry_rules: '',
  condition: '启用',
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
  default_repository: ''
})

// ==================== Header State ====================
const authStore = useAuthStore()
const searchText = ref('')
const approvalFilter = ref('')
const approvalLogVisible = ref(false)
const approvalLogRecordId = ref('')
const headerLoading = ref(false)
const headerData = ref<RoutingHeader[]>([])
const headerPagination = reactive({ current: 1, pageSize: 20, total: 0 })
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

// ==================== Dropdown Data ====================
const procedureList = ref<any[]>([])
const procedureOptions = ref<{ label: string; value: string }[]>([])
const workCenterList = ref<any[]>([])
const workCenterOptions = ref<{ label: string; value: string }[]>([])
const productList = ref<any[]>([])
const productOptions = ref<{ label: string; value: string }[]>([])
const warehouseList = ref<any[]>([])
const warehouseOptions = ref<{ label: string; value: string }[]>([])

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
    const res = await getItems({ item_type: '成品', page: 1, limit: 9999 })
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
  { title: '工艺路线编号', dataIndex: 'process_route_number', key: 'process_route_number', width: 140 },
  { title: '工艺路线名称', dataIndex: 'process_route_name', key: 'process_route_name', width: 140 },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 120 },
  { title: '生产自动入库规则', dataIndex: 'production_automatic_inventory_entry_rules', key: 'production_automatic_inventory_entry_rules', width: 150 },
  { title: '状态', dataIndex: 'condition', key: 'condition', width: 80 },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100 },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 150 },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 100 },
  { title: '操作', key: 'action', width: 280, fixed: 'right' as const }
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
  { title: '工序物料投入编号', dataIndex: 'process_material_input_number', key: 'process_material_input_number', width: 150 },
  { title: '工序物料投入数量', dataIndex: 'process_material_input_quantity', key: 'process_material_input_quantity', width: 150 },
  { title: '工序物料投入单位', dataIndex: 'process_material_input_unit', key: 'process_material_input_unit', width: 150 },
  { title: '物料损耗率', dataIndex: 'material_wastage_rate', key: 'material_wastage_rate', width: 110 },
  { title: '倒冲', dataIndex: 'flowing_backward', key: 'flowing_backward', width: 80 },
  { title: '默认仓库', dataIndex: 'default_repository', key: 'default_repository', width: 100 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' as const }
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
  Object.assign(detailEditForm, { ...emptyDetail(), ...record })
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
    await updateRoutingDetail(detailEditForm.id!, detailEditForm)
    message.success('更新成功'); detailEditVisible.value = false; fetchDetails()
  } catch { message.error('更新失败') }
}
const handleDetailCreateOk = async () => {
  if (!selectedHeaderKey.value) { message.warning('请先选择工艺路线'); return }
  try {
    await addRoutingDetail(selectedHeaderKey.value, detailCreateForm)
    message.success('新增工序成功'); detailCreateVisible.value = false
    Object.assign(detailCreateForm, emptyDetail()); fetchDetails()
  } catch { message.error('新增工序失败') }
}
const openDetailCreate = () => {
  if (!selectedHeaderKey.value) { message.warning('请先在上方选择一条工艺路线'); return }
  Object.assign(detailCreateForm, emptyDetail())
  detailCreateVisible.value = true
}

// ==================== Export / Import ====================
const handleExport = async (format: string = 'xlsx') => {
  try {
    const res = await exportRoutingMasters(format)
    const ext = format === 'xls' ? 'xls' : 'xlsx'
    const blob = new Blob([res.data], { type: res.headers?.['content-type'] || 'application/octet-stream' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `routing_masters.${ext}`; link.click(); URL.revokeObjectURL(link.href)
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
})
</script>

<template>
  <div class="routing-master-page">
    <!-- ========== Header Table (Top) ========== -->
    <a-card title="工艺路线管理（主表）" :bordered="false" class="header-card">
      <template #extra>
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
      </template>
      <a-table
        :columns="headerColumns" :data-source="headerData" :loading="headerLoading"
        :row-key="(record: RoutingHeader) => record.process_route_number!"
        :pagination="headerPagination"
        :scroll="{ x: 1200, y: 'calc(50vh - 200px)' }"
        :custom-row="headerCustomRow"
        :row-class-name="(record: RoutingHeader) => selectedHeaderKey === record.process_route_number ? 'selected-row' : ''"
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
            <a-space :size="2">
              <a-button type="link" size="small" :disabled="headerData[index].approval_status !== '草稿'" @click.stop="handleHeaderEdit(headerData[index])"><template #icon><EditOutlined /></template>编辑</a-button>
              <a-button type="link" danger size="small" :disabled="headerData[index].approval_status !== '草稿'" @click.stop="handleHeaderDelete(headerData[index])"><template #icon><DeleteOutlined /></template>删除</a-button>
              <ApprovalActions module="routing_header" :record-id="headerData[index].process_route_number!" :approval-status="headerData[index].approval_status || '草稿'" @status-changed="fetchHeaders" />
              <a-button type="link" size="small" @click.stop="approvalLogRecordId = headerData[index].process_route_number!; approvalLogVisible = true"><template #icon><HistoryOutlined /></template></a-button>
            </a-space>
          </template>
        </template>
      </a-table>
    </a-card>

    <!-- ========== Detail Table (Bottom) ========== -->
    <a-card :bordered="false" class="detail-card">
      <template #title>
        <span>工序明细</span>
        <span v-if="selectedHeaderKey" style="margin-left: 12px; font-size: 13px; color: #888;">当前路线: {{ selectedHeaderKey }}</span>
        <span v-else style="margin-left: 12px; font-size: 13px; color: #aaa;">请在上方选择一条工艺路线</span>
      </template>
      <template #extra>
        <a-button type="primary" :disabled="!selectedHeaderKey" @click="openDetailCreate"><template #icon><PlusOutlined /></template>新增工序</a-button>
      </template>
      <a-table
        :columns="detailColumns" :data-source="detailData" :loading="detailLoading"
        :row-key="(record: RoutingDetail) => record.id!"
        :pagination="false"
        :scroll="{ x: 1800, y: 'calc(50vh - 200px)' }"
      >
        <template #bodyCell="{ column, index }">
          <template v-if="column.key === 'rowIndex'">{{ index + 1 }}</template>
          <template v-else-if="column.key === 'action'">
            <a-space>
              <a-button type="link" size="small" @click="handleDetailEdit(detailData[index])"><template #icon><EditOutlined /></template>编辑</a-button>
              <a-button type="link" danger size="small" @click="handleDetailDelete(detailData[index])"><template #icon><DeleteOutlined /></template>删除</a-button>
            </a-space>
          </template>
        </template>
      </a-table>
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
          <a-col :span="12"><a-form-item label="生产自动入库规则"><a-input v-model:value="headerCreateForm.production_automatic_inventory_entry_rules" /></a-form-item></a-col>
          <a-col :span="12">
            <a-form-item label="状态"><a-select v-model:value="headerCreateForm.condition" placeholder="请选择"><a-select-option value="启用">启用</a-select-option><a-select-option value="禁用">禁用</a-select-option></a-select></a-form-item>
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
          <a-col :span="12"><a-form-item label="生产自动入库规则"><a-input v-model:value="headerEditForm.production_automatic_inventory_entry_rules" /></a-form-item></a-col>
          <a-col :span="12">
            <a-form-item label="状态"><a-select v-model:value="headerEditForm.condition" placeholder="请选择"><a-select-option value="启用">启用</a-select-option><a-select-option value="禁用">禁用</a-select-option></a-select></a-form-item>
          </a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="创建日期"><a-input v-model:value="headerEditForm.creation_date" disabled /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="创建人"><a-input v-model:value="headerEditForm.creation_man" disabled /></a-form-item></a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- ========== Detail Create Modal ========== -->
    <a-modal v-model:open="detailCreateVisible" title="新增工序" @ok="handleDetailCreateOk" okText="确认" cancelText="取消" width="800px">
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
          <a-col :span="12"><a-form-item label="工序物料投入编号"><a-input v-model:value="detailCreateForm.process_material_input_number" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工序物料投入数量"><a-input v-model:value="detailCreateForm.process_material_input_quantity" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工序物料投入单位"><a-input v-model:value="detailCreateForm.process_material_input_unit" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="物料损耗率"><a-input v-model:value="detailCreateForm.material_wastage_rate" /></a-form-item></a-col>
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
      </a-form>
    </a-modal>

    <!-- ========== Detail Edit Modal ========== -->
    <a-modal v-model:open="detailEditVisible" title="编辑工序" @ok="handleDetailEditOk" okText="确认" cancelText="取消" width="800px">
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
          <a-col :span="12"><a-form-item label="工序物料投入编号"><a-input v-model:value="detailEditForm.process_material_input_number" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="工序物料投入数量"><a-input v-model:value="detailEditForm.process_material_input_quantity" /></a-form-item></a-col>
        </a-row>
        <a-row :gutter="16">
          <a-col :span="12"><a-form-item label="工序物料投入单位"><a-input v-model:value="detailEditForm.process_material_input_unit" /></a-form-item></a-col>
          <a-col :span="12"><a-form-item label="物料损耗率"><a-input v-model:value="detailEditForm.material_wastage_rate" /></a-form-item></a-col>
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
      </a-form>
    </a-modal>

    <!-- ========== Approval Log Modal ========== -->
    <ApprovalLogModal v-model:open="approvalLogVisible" module="routing_header" :record-id="approvalLogRecordId" />
  </div>
</template>

<style scoped>
.routing-master-page {
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
