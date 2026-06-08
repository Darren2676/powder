<script setup lang="ts">
import { ref, reactive, computed, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, DownloadOutlined, UploadOutlined, HistoryOutlined, DownOutlined, CheckCircleOutlined, CloseCircleOutlined, EyeOutlined, InboxOutlined, SettingOutlined, CheckOutlined, CloseOutlined } from '@ant-design/icons-vue'
import { getMaterialPreparations, deleteMaterialPreparation, exportMaterialPreparations, importMaterialPreparations, generateFromOrder, getOrdersForGenerate, getPreparationDetails, updatePreparationDetails, updateDetailAutoWeigh } from '@/api/production/materialPreparation'
import { getFactories } from '@/api/system/factory'
import { useAuthStore } from '@/store/auth'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ApprovalLogModal from '@/components/Common/ApprovalLogModal.vue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { useTableList } from '@/composables/useTableList'
import { useModalDrag } from '@/composables/useModalDrag'
import { generateExportFilename } from '@/utils/exportFilename'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval, batchSubmitForApproval, batchApproveRecords, batchWithdrawApproval, batchReverseApproval } from '@/api/system/approval'

interface MaterialPreparation {
  preparation_number: string
  production_order_number: string
  production_number: string
  item_number: string
  item_name: string
  specifications: string
  basic_unit: string
  bom_number: string
  bom_version: string
  planned_quantity: number
  bom_base_quantity: number
  total_material_types: number
  preparation_status: string
  approval_status: string
  remark: string
  creation_date: string
  creation_man: string
  factory_id?: number | null
  factory_short?: string
  factory_name?: string
}

interface PreparationDetail {
  id: number
  preparation_number: string
  line_number: number
  material_number: string
  material_name: string
  material_type: string
  unit: string
  bom_standard_quantity: number
  bom_wastage_rate: number
  bom_actual_quantity: number
  required_quantity: number
  adjusted_quantity: number
  issued_quantity: number
  step_number: number | null
  work_center_number: string
  work_center_name: string
  is_key_material: number
  substitute_group: string
  substitute_priority: number
  supply_type: string
  default_warehouse: string
  bom_path: string
  auto_weigh: string
  remark: string
}




const prepStatusFilter = ref<string | undefined>(undefined)
const approvalFilter = ref<string | undefined>(undefined)
const factoryFilter = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const { loading, dataSource, searchText, selectedRowKeys, pagination, fetchData: fetchList, handleTableChange, handleSearch, handleReset: _handleReset } = useTableList(getMaterialPreparations)

// Override fetchData to pass extra filters
const fetchData = () => fetchList({ preparation_status: prepStatusFilter.value || undefined, approval_status: approvalFilter.value || undefined, factory_id: factoryFilter.value || undefined })
const handleReset = () => { factoryFilter.value = undefined; prepStatusFilter.value = undefined; approvalFilter.value = undefined; _handleReset() }

const authStore = useAuthStore()
const approvalLogVisible = ref(false)
const approvalLogRecordId = ref('')


const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}))

const prepStatusColors: Record<string, string> = {
  '未领料': 'default',
  '部分领料': 'processing',
  '已领料': 'success',
  '已关闭': 'error'
}



const defaultDataColumns: any[] = [
  { title: '工厂', dataIndex: 'factory_short', key: 'factory_short', width: 80, resizable: true, customRender: ({ record }: any) => record.factory_short || record.factory_name || '-' },
  { title: '备料单编号', dataIndex: 'preparation_number', key: 'preparation_number', width: 170, resizable: true },
  { title: '生产单编号', dataIndex: 'production_order_number', key: 'production_order_number', width: 160, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 140, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, resizable: true },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 100, resizable: true },
  { title: 'BOM版本', dataIndex: 'bom_version', key: 'bom_version', width: 90, resizable: true },
  { title: '物料种类', dataIndex: 'total_material_types', key: 'total_material_types', width: 90, resizable: true },
  { title: '备料状态', dataIndex: 'preparation_status', key: 'preparation_status', width: 100, resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 140, resizable: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 90, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('material_preparation_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 80, fixed: 'right' as const }]
})

const handleDelete = (record: MaterialPreparation) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除备料单 "${record.preparation_number}" 吗？将同时删除其所有明细。`,
    okText: '确定', okType: 'danger', cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteMaterialPreparation(record.preparation_number)
        if (res.success) { message.success('删除成功'); fetchData() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

// ==================== More Actions ====================
const handleMoreAction = async (key: string, record: MaterialPreparation) => {
  const id = record.preparation_number
  if (key === 'view') {
    handleViewDetails(record)
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
      onOk: async () => { try { await submitForApproval('material_preparation', id); message.success('提交审核成功'); fetchData() } catch { message.error('提交审核失败') } }
    })
  } else if (key === 'approve') {
    Modal.confirm({
      title: '审核通过', icon: createVNode(ExclamationCircleOutlined),
      content: '确定审核通过吗？', okText: '通过', cancelText: '取消',
      onOk: async () => { try { await approveRecord('material_preparation', id); message.success('审核通过'); fetchData() } catch { message.error('审核失败') } }
    })
  } else if (key === 'withdraw') {
    Modal.confirm({
      title: '撤回提交', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要撤回审核提交吗？', okText: '撤回', cancelText: '取消',
      onOk: async () => { try { await withdrawApproval('material_preparation', id); message.success('撤回成功'); fetchData() } catch { message.error('撤回失败') } }
    })
  } else if (key === 'reverse') {
    Modal.confirm({
      title: '反审退回', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要执行反审吗？记录将退回草稿状态，可重新编辑。', okText: '确认反审', okType: 'danger', cancelText: '取消',
      onOk: async () => { try { await reverseApproval('material_preparation', id); message.success('反审成功，已退回草稿'); fetchData() } catch { message.error('反审失败') } }
    })
  }
}

// ==================== 导入导出 ====================
const fileInputRef = ref<HTMLInputElement>()

const handleExport = async () => {
  try {
    const res = await exportMaterialPreparations(searchText.value || undefined)
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('material_preparations')
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
    const res = await importMaterialPreparations(formData)
    if (res.success) { message.success(res.message || '导入成功'); fetchData() }
    else { message.error(res.message || '导入失败') }
  } catch { message.error('导入失败') }
  finally { target.value = '' }
}

// ==================== 从生产单备料弹窗 ====================
const orderModalVisible = ref(false)
const orderLoading = ref(false)
const orderDataSource = ref<any[]>([])
const orderSearchText = ref('')
const orderSelectedRowKeys = ref<string[]>([])
const orderGenerateLoading = ref(false)

const orderRowSelection = {
  selectedRowKeys: orderSelectedRowKeys,
  onChange: (keys: string[]) => { orderSelectedRowKeys.value = keys },
  getCheckboxProps: (record: any) => ({ disabled: !record.bom_matched })
}

const orderPagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条记录`
})

const orderColumns = [
  { title: '行号', key: 'orderRowIndex', width: 60 },
  { title: '生产单编号', dataIndex: 'production_order_number', key: 'production_order_number' },
  { title: '计划编号', dataIndex: 'production_number', key: 'production_number' },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number' },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name' },
  { title: '规格', dataIndex: 'specifications', key: 'specifications' },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 90 },
  { title: 'BOM匹配', key: 'bom_status', width: 130 },
  { title: '已有备料单', dataIndex: 'existing_preparation_count', key: 'existing_preparation_count', width: 110 }
]

const fetchOrderData = async () => {
  orderLoading.value = true
  try {
    const res = await getOrdersForGenerate({
      page: orderPagination.current,
      limit: orderPagination.pageSize,
      search: orderSearchText.value || undefined,
      factory_id: factoryFilter.value || undefined
    })
    if (res.success) {
      orderDataSource.value = res.data.items
      orderPagination.total = res.data.pagination.total
    }
  } catch { message.error('获取生产单列表失败') }
  finally { orderLoading.value = false }
}

const handleOrderTableChange = (pag: any) => {
  orderPagination.current = pag.current
  orderPagination.pageSize = pag.pageSize
  fetchOrderData()
}

const handleOrderSearch = () => { orderPagination.current = 1; fetchOrderData() }

const handleOpenOrderModal = () => {
  orderSelectedRowKeys.value = []
  orderSearchText.value = ''
  orderPagination.current = 1
  orderModalVisible.value = true
  fetchOrderData()
}

const handleGenerateFromOrder = async () => {
  if (orderSelectedRowKeys.value.length === 0) {
    message.warning('请先勾选要备料的生产单')
    return
  }
  orderGenerateLoading.value = true
  try {
    const res = await generateFromOrder(orderSelectedRowKeys.value)
    if (res.success) {
      message.success(res.message || '生成成功')
      orderModalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '生成失败')
    }
  } catch { message.error('从生产单生成备料单失败') }
  finally { orderGenerateLoading.value = false }
}

// ==================== 备料单明细弹窗 ====================
const detailModalVisible = ref(false)
const { modalStyle: detailModalStyle, onDragStart: detailDragStart, resetDrag: detailResetDrag } = useModalDrag()
const detailLoading = ref(false)
const detailHeader = ref<MaterialPreparation | null>(null)
const detailList = ref<PreparationDetail[]>([])
const detailSaving = ref(false)
const detailEditing = ref(false)
const detailSelectedRowKeys = ref<number[]>([])
const detailRowSelection = computed(() => ({
  selectedRowKeys: detailSelectedRowKeys.value,
  onChange: (keys: number[]) => { detailSelectedRowKeys.value = keys },
}))

const detailDefaultDataColumns: any[] = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60, resizable: true },
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 120, resizable: true },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 140, resizable: true },
  { title: '物料类型', dataIndex: 'material_type', key: 'material_type', width: 90, resizable: true },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 60, resizable: true },
  { title: 'BOM标准用量', dataIndex: 'bom_standard_quantity', key: 'bom_standard_quantity', width: 110, resizable: true },
  { title: '损耗率%', dataIndex: 'bom_wastage_rate', key: 'bom_wastage_rate', width: 80, resizable: true },
  { title: 'BOM实际用量', dataIndex: 'bom_actual_quantity', key: 'bom_actual_quantity', width: 110, resizable: true },
  { title: '需求数量', dataIndex: 'required_quantity', key: 'required_quantity', width: 100, resizable: true },
  { title: '调整数量', key: 'adjusted_quantity', width: 110, resizable: true },
  { title: '已领料', dataIndex: 'issued_quantity', key: 'issued_quantity', width: 80, resizable: true },
  { title: '工序', dataIndex: 'step_number', key: 'step_number', width: 60, resizable: true },
  { title: '工作中心', dataIndex: 'work_center_name', key: 'work_center_name', width: 110, resizable: true },
  { title: '关键物料', key: 'is_key_material', width: 80, resizable: true },
  { title: '自动称量', dataIndex: 'auto_weigh', key: 'auto_weigh', width: 100, resizable: true },
  { title: '仓库', dataIndex: 'default_warehouse', key: 'default_warehouse', width: 90, resizable: true }
]

const {
  columns: detailColumns, columnSettingVisible: detailColumnSettingVisible, columnSettingList: detailColumnSettingList, columnSettingSaving: detailColumnSettingSaving,
  openColumnSetting: openDetailColumnSetting, moveColumnUp: moveDetailColumnUp, moveColumnDown: moveDetailColumnDown,
  saveColumnSetting: saveDetailColumnSetting, resetColumnSetting: resetDetailColumnSetting,
  loadColumnPreference: loadDetailColumnPreference, handleResizeColumn: handleDetailResizeColumn
} = useColumnPreference('prep_detail_list', detailDefaultDataColumns, {
  fixedLeft: [],
  fixedRight: []
})

const handleViewDetails = async (record: MaterialPreparation) => {
  detailLoading.value = true
  detailResetDrag()
  detailSelectedRowKeys.value = []
  detailModalVisible.value = true
  detailEditing.value = false
  loadDetailColumnPreference()
  try {
    const res = await getPreparationDetails(record.preparation_number)
    if (res.success) {
      detailHeader.value = res.data.header
      detailList.value = res.data.details
    } else {
      message.error(res.message || '获取明细失败')
    }
  } catch { message.error('获取备料单明细失败') }
  finally { detailLoading.value = false }
}

const handleSaveDetails = async () => {
  if (!detailHeader.value) return
  detailSaving.value = true
  try {
    const res = await updatePreparationDetails(
      detailHeader.value.preparation_number,
      detailList.value.map(d => ({ id: d.id, adjusted_quantity: d.adjusted_quantity, remark: d.remark }))
    )
    if (res.success) { message.success('保存成功'); detailEditing.value = false }
    else { message.error(res.message || '保存失败') }
  } catch { message.error('保存失败') }
  finally { detailSaving.value = false }
}

// ==================== 批量修改明细自动称量 ====================
const handleDetailAutoWeigh = async (value: 'Y' | 'N') => {
  if (detailSelectedRowKeys.value.length === 0) { message.warning('请先勾选明细行'); return }
  try {
    const res: any = await updateDetailAutoWeigh(detailHeader.value!.preparation_number, detailSelectedRowKeys.value, value)
    if (res.success) {
      message.success(`已更新 ${res.data?.updatedCount || detailSelectedRowKeys.value.length} 条明细`)
      detailSelectedRowKeys.value = []
      // 刷新明细数据
      const refreshRes = await getPreparationDetails(detailHeader.value!.preparation_number)
      if (refreshRes.success) {
        detailList.value = refreshRes.data.details
      }
    } else { message.error(res.message || '更新失败') }
  } catch { message.error('更新失败') }
}

onMounted(async () => { await loadColumnPreference(); loadFactories(); fetchData() })

const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch { /* ignore */ }
}

// ==================== 批量审批操作 ====================
const batchLoading = ref(false)
const handleBatchAction = (action: string) => {
  if (selectedRowKeys.value.length === 0) { message.warning('请先勾选记录'); return }
  const count = selectedRowKeys.value.length
  const actionMap: Record<string, { title: string; desc: string; fn: () => Promise<any>; okType?: string }> = {
    'submit': { title: '批量提交审核', desc: `确定要批量提交 ${count} 条记录吗？仅草稿状态的记录会被提交。`, fn: () => batchSubmitForApproval('material_preparation', selectedRowKeys.value) },
    'approve': { title: '批量审核通过', desc: `确定要批量审核 ${count} 条记录吗？仅待审批状态的记录会被审批。`, fn: () => batchApproveRecords('material_preparation', selectedRowKeys.value) },
    'withdraw': { title: '批量撤回', desc: `确定要批量撤回 ${count} 条记录吗？仅待审批状态的记录会被撤回。`, fn: () => batchWithdrawApproval('material_preparation', selectedRowKeys.value) },
    'reverse': { title: '批量反审', desc: `确定要批量反审 ${count} 条记录吗？已审批的记录将退回草稿。`, fn: () => batchReverseApproval('material_preparation', selectedRowKeys.value), okType: 'danger' }
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
</script>

<template>
  <div class="material-preparation-page">
    <a-card :bordered="false" class="mp-card">
      <template #title>
        <span class="mp-card-title">生产单备料清单</span>
      </template>
      <template #extra>
        <div class="mp-toolbar">
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索备料单/生产单/产品"
            style="width: 260px"
            allow-clear
            @search="handleSearch"
            @pressEnter="handleSearch"
          />
          <a-select v-model:value="factoryFilter" placeholder="全部工厂" allow-clear style="width: 120px" @change="handleSearch">
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
          <span class="mp-label">备料状态：</span>
          <a-select v-model:value="prepStatusFilter" placeholder="全部" allow-clear style="width: 110px" @change="handleSearch">
            <a-select-option value="未领料">未领料</a-select-option>
            <a-select-option value="部分领料">部分领料</a-select-option>
            <a-select-option value="已领料">已领料</a-select-option>
            <a-select-option value="已关闭">已关闭</a-select-option>
          </a-select>
          <span class="mp-label">审批状态：</span>
          <a-select v-model:value="approvalFilter" placeholder="全部" allow-clear style="width: 110px" @change="handleSearch">
            <a-select-option value="草稿">草稿</a-select-option>
            <a-select-option value="待审批">待审批</a-select-option>
            <a-select-option value="已审批">已审批</a-select-option>
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
          <a-button @click="openColumnSetting">
            <template #icon><SettingOutlined /></template>
            列设置
          </a-button>
        </div>
      </template>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 'max-content' }"
        :row-selection="rowSelection"
        row-key="preparation_number"
        size="middle"
        bordered
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'preparation_status'">
            <a-tag :color="prepStatusColors[record.preparation_status] || 'default'">{{ record.preparation_status }}</a-tag>
          </template>
          <template v-else-if="column.key === 'approval_status'">
            <ApprovalStatusTag :status="record.approval_status" />
          </template>
          <template v-else-if="column.key === 'action'">
            <a-dropdown :trigger="['click']">
              <a-button type="link" size="small" @click.stop>更多<DownOutlined style="font-size: 10px; margin-left: 2px;" /></a-button>
              <template #overlay>
                <a-menu @click="({ key: k }: any) => handleMoreAction(k, record)">
                  <a-menu-item key="view"><EyeOutlined /> 查看明细</a-menu-item>
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
      <div style="display: flex; align-items: center; gap: 8px; padding: 12px 0; border-top: 1px solid #f0f0f0; margin-top: 8px;">
        <span style="color: #666; margin-right: 4px;">已选 <b style="color: #1890ff;">{{ selectedRowKeys.length }}</b> 项</span>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('submit')">批量提交</a-button>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('approve')">批量审批</a-button>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('withdraw')">批量撤回</a-button>
        <a-button size="small" danger :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('reverse')">批量反审</a-button>
        <a-button size="small" type="link" :disabled="selectedRowKeys.length === 0" @click="selectedRowKeys = []">清除选择</a-button>
      </div>
    </a-card>

    <!-- 从生产单备料弹窗 -->
    <a-modal
      v-model:open="orderModalVisible"
      title="从生产单生成备料单"
      width="1100px"
      :footer="null"
    >
      <a-alert message="系统将自动匹配产品对应的BOM物料清单，展平多层BOM并计算每种物料的需求数量。仅显示已审批的生产单。已有备料单的生产单不可重复选择。" type="info" show-icon style="margin-bottom: 16px;" />
      <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
        <a-input-search
          v-model:value="orderSearchText"
          placeholder="搜索生产单编号/产品编号/名称"
          style="width: 300px"
          allow-clear
          @search="handleOrderSearch"
          @pressEnter="handleOrderSearch"
        />
        <a-button type="primary" :loading="orderGenerateLoading" @click="handleGenerateFromOrder">
          <template #icon><InboxOutlined /></template>
          生成备料单 ({{ orderSelectedRowKeys.length }})
        </a-button>
      </div>
      <a-table
        :columns="orderColumns"
        :data-source="orderDataSource"
        :loading="orderLoading"
        :pagination="orderPagination"
        :row-selection="orderRowSelection"
        row-key="production_order_number"
        size="small"
        bordered
        @change="handleOrderTableChange"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'orderRowIndex'">
            {{ (orderPagination.current - 1) * orderPagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'bom_status'">
            <template v-if="record.bom_matched">
              <a-tag color="success"><CheckCircleOutlined /> 已匹配({{ record.bom_version }})</a-tag>
            </template>
            <template v-else>
              <a-tag color="error"><CloseCircleOutlined /> 未匹配</a-tag>
            </template>
          </template>
          <template v-else-if="column.key === 'existing_preparation_count'">
            <template v-if="record.existing_preparation_count > 0">
              <a-tag color="warning">{{ record.existing_preparation_count }} 单</a-tag>
            </template>
            <template v-else>
              <span style="color: #999">0</span>
            </template>
          </template>
        </template>
      </a-table>
    </a-modal>

    <!-- 备料单明细弹窗 -->
    <a-modal
      v-model:open="detailModalVisible"
      width="1300px"
      :style="detailModalStyle"
      :footer="null"
    >
      <template #title>
        <div class="drag-handle" @mousedown="detailDragStart">备料单明细 - {{ detailHeader?.preparation_number || '' }}</div>
      </template>
      <a-spin :spinning="detailLoading">
        <template v-if="detailHeader">
          <a-descriptions :column="4" bordered size="small" style="margin-bottom: 16px;">
            <a-descriptions-item label="生产单编号">{{ detailHeader.production_order_number }}</a-descriptions-item>
            <a-descriptions-item label="产品">{{ detailHeader.item_name }}({{ detailHeader.item_number }})</a-descriptions-item>
            <a-descriptions-item label="计划数量">{{ detailHeader.planned_quantity }}</a-descriptions-item>
            <a-descriptions-item label="BOM">{{ detailHeader.bom_number }} {{ detailHeader.bom_version }}</a-descriptions-item>
            <a-descriptions-item label="规格">{{ detailHeader.specifications || '-' }}</a-descriptions-item>
            <a-descriptions-item label="单位">{{ detailHeader.basic_unit || '-' }}</a-descriptions-item>
            <a-descriptions-item label="BOM基准数量">{{ detailHeader.bom_base_quantity }}</a-descriptions-item>
            <a-descriptions-item label="物料种类数">{{ detailHeader.total_material_types }}</a-descriptions-item>
          </a-descriptions>

          <div style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 600; font-size: 14px;">物料明细列表</span>
            <div style="display: flex; align-items: center; gap: 8px;">
              <a-button size="small" :disabled="detailSelectedRowKeys.length === 0" @click="handleDetailAutoWeigh('Y')">
                <template #icon><CheckOutlined /></template>
                设为自动称量
              </a-button>
              <a-button size="small" :disabled="detailSelectedRowKeys.length === 0" @click="handleDetailAutoWeigh('N')">
                <template #icon><CloseOutlined /></template>
                取消自动称量
              </a-button>
              <a-button size="small" @click="openDetailColumnSetting">
                <template #icon><SettingOutlined /></template>
                列设置
              </a-button>
              <a-space v-if="detailHeader.approval_status === '草稿'">
                <a-button v-if="!detailEditing" size="small" @click="detailEditing = true">
                  <template #icon><EditOutlined /></template>
                  调整数量
                </a-button>
                <template v-else>
                  <a-button size="small" @click="detailEditing = false">取消</a-button>
                  <a-button type="primary" size="small" :loading="detailSaving" @click="handleSaveDetails">保存</a-button>
                </template>
              </a-space>
            </div>
          </div>

          <div v-if="detailSelectedRowKeys.length > 0" style="margin-bottom:4px;color:#1890ff;font-size:12px;">已选择 {{ detailSelectedRowKeys.length }} 条明细</div>
          <a-table
            :columns="detailColumns"
            :data-source="detailList"
            :pagination="false"
            :scroll="{ x: 'max-content', y: 400 }"
            :row-selection="detailRowSelection"
            row-key="id"
            size="small"
            bordered
            @resizeColumn="handleDetailResizeColumn"
          >
            <template #bodyCell="{ column, record, text }">
              <template v-if="column.key === 'adjusted_quantity'">
                <template v-if="detailEditing">
                  <a-input-number v-model:value="record.adjusted_quantity" :min="0" :precision="4" size="small" style="width: 100%" />
                </template>
                <template v-else>
                  <span :style="{ fontWeight: 'bold', color: record.adjusted_quantity !== record.required_quantity ? '#fa8c16' : 'inherit' }">
                    {{ record.adjusted_quantity }}
                  </span>
                </template>
              </template>
              <template v-else-if="column.key === 'is_key_material'">
                <span v-if="record.is_key_material" style="color: #fa8c16; font-weight: bold;">*</span>
                <span v-else style="color: #999;">-</span>
              </template>
              <template v-else-if="column.key === 'auto_weigh'">
                <a-tag :color="record.auto_weigh === 'Y' ? 'blue' : 'default'">{{ record.auto_weigh === 'Y' ? '是' : '否' }}</a-tag>
              </template>
            </template>
            <template #summary>
              <a-table-summary fixed>
                <a-table-summary-row>
                  <a-table-summary-cell :col-span="4" style="font-weight: 600;">合计</a-table-summary-cell>
                  <a-table-summary-cell />
                  <a-table-summary-cell />
                  <a-table-summary-cell />
                  <a-table-summary-cell />
                  <a-table-summary-cell style="font-weight: 600; text-align: right;">
                    {{ detailList.reduce((sum, d) => sum + (parseFloat(String(d.required_quantity)) || 0), 0).toFixed(4) }}
                  </a-table-summary-cell>
                  <a-table-summary-cell style="font-weight: 600; text-align: right;">
                    {{ detailList.reduce((sum, d) => sum + (parseFloat(String(d.adjusted_quantity)) || 0), 0).toFixed(4) }}
                  </a-table-summary-cell>
                  <a-table-summary-cell style="text-align: right;">
                    {{ detailList.reduce((sum, d) => sum + (parseFloat(String(d.issued_quantity)) || 0), 0).toFixed(4) }}
                  </a-table-summary-cell>
                  <a-table-summary-cell :col-span="5" />
                </a-table-summary-row>
              </a-table-summary>
            </template>
          </a-table>
        </template>
      </a-spin>
    </a-modal>

    <!-- 审批日志弹窗 -->
    <ApprovalLogModal v-model:open="approvalLogVisible" module="material_preparation" :record-id="approvalLogRecordId" />

    <ColumnSettingDrawer
      v-model:open="columnSettingVisible"
      :settingList="columnSettingList"
      :saving="columnSettingSaving"
      @moveUp="moveColumnUp"
      @moveDown="moveColumnDown"
      @save="saveColumnSetting"
      @reset="resetColumnSetting"
    />

    <!-- 备料明细列设置抽屉 -->
    <ColumnSettingDrawer
      v-model:open="detailColumnSettingVisible"
      :settingList="detailColumnSettingList"
      :saving="detailColumnSettingSaving"
      @moveUp="moveDetailColumnUp"
      @moveDown="moveDetailColumnDown"
      @save="saveDetailColumnSetting"
      @reset="resetDetailColumnSetting"
    />
  </div>
</template>

<style scoped>
.drag-handle {
  cursor: move;
  user-select: none;
}
.material-preparation-page {
  padding: 0;
}
/* 头部标题与工具栏紧凑显示，避免换行 */
:deep(.mp-card .ant-card-head) {
  padding: 0 12px;
  min-height: 44px;
}
:deep(.mp-card .ant-card-head-wrapper) {
  flex-wrap: nowrap;
}
:deep(.mp-card .ant-card-head-title) {
  padding: 10px 0;
  flex-shrink: 0;
}
:deep(.mp-card .ant-card-extra) {
  padding: 8px 0;
  margin-left: 12px;
  flex: 1;
  display: flex;
  justify-content: flex-end;
}
.mp-card-title {
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
}
.mp-toolbar {
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 8px;
}
.mp-toolbar :deep(.ant-btn) {
  padding: 0 10px;
}
.mp-label {
  color: #666;
  font-size: 12px;
  white-space: nowrap;
  margin-left: 4px;
}
</style>
