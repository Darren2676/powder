<script setup lang="ts">
import { ref, reactive, computed, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, DownloadOutlined, UploadOutlined, HistoryOutlined, DownOutlined, CheckCircleOutlined, CloseCircleOutlined, EyeOutlined, InboxOutlined, SettingOutlined, PartitionOutlined } from '@ant-design/icons-vue'
import { getMaterialPreparations, deleteMaterialPreparation, exportMaterialPreparations, importMaterialPreparations, generateByProcess, getOrdersForGenerate, getPreparationDetails, updatePreparationDetails } from '@/api/production/materialPreparation'
import { useAuthStore } from '@/store/auth'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ApprovalLogModal from '@/components/Common/ApprovalLogModal.vue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval, batchSubmitForApproval, batchApproveRecords, batchWithdrawApproval, batchReverseApproval } from '@/api/system/approval'
import { generateExportFilename } from '@/utils/exportFilename'

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
  standard_process_name: string
  is_key_material: number
  substitute_group: string
  substitute_priority: number
  supply_type: string
  default_warehouse: string
  bom_path: string
  remark: string
}

const loading = ref(false)
const dataSource = ref<MaterialPreparation[]>([])
const searchText = ref('')
const prepStatusFilter = ref('')
const approvalFilter = ref('')
const authStore = useAuthStore()
const approvalLogVisible = ref(false)
const approvalLogRecordId = ref('')
const selectedRowKeys = ref<string[]>([])

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

const pagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showQuickJumper: true,
  pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total: number) => `共 ${total} 条记录`
})

const defaultDataColumns: any[] = [
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
} = useColumnPreference('material_preparation_by_process_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 80, fixed: 'right' as const }]
})

const fetchData = async () => {
  loading.value = true
  try {
    const res = await getMaterialPreparations({
      page: pagination.current,
      limit: pagination.pageSize,
      search: searchText.value || undefined,
      preparation_status: prepStatusFilter.value || undefined,
      approval_status: approvalFilter.value || undefined
    })
    if (res.success) {
      dataSource.value = res.data.items
      pagination.total = res.data.pagination.total
    }
  } catch { message.error('获取备料单数据失败') }
  finally { loading.value = false }
}

const handleTableChange = (pag: any) => {
  pagination.current = pag.current
  pagination.pageSize = pag.pageSize
  fetchData()
}

const handleSearch = () => { pagination.current = 1; fetchData() }
const handleReset = () => { searchText.value = ''; prepStatusFilter.value = ''; approvalFilter.value = ''; pagination.current = 1; fetchData() }

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

// ==================== 从生产单按工序备料弹窗 ====================
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
      search: orderSearchText.value || undefined
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

const handleGenerateByProcess = async () => {
  if (orderSelectedRowKeys.value.length === 0) {
    message.warning('请先勾选要备料的生产单')
    return
  }
  orderGenerateLoading.value = true
  try {
    const res = await generateByProcess(orderSelectedRowKeys.value)
    if (res.success) {
      message.success(res.message || '生成成功')
      orderModalVisible.value = false
      fetchData()
    } else {
      message.error(res.message || '生成失败')
    }
  } catch { message.error('按工序生成备料单失败') }
  finally { orderGenerateLoading.value = false }
}

// ==================== 备料单明细弹窗（按工序分组） ====================
const detailModalVisible = ref(false)
const detailLoading = ref(false)
const detailHeader = ref<MaterialPreparation | null>(null)
const detailList = ref<PreparationDetail[]>([])
const detailSaving = ref(false)
const detailEditing = ref(false)

const detailColumns = [
  { title: '行号', dataIndex: 'line_number', key: 'line_number', width: 60 },
  { title: '物料编号', dataIndex: 'material_number', key: 'material_number', width: 120 },
  { title: '物料名称', dataIndex: 'material_name', key: 'material_name', width: 140 },
  { title: '物料类型', dataIndex: 'material_type', key: 'material_type', width: 90 },
  { title: '单位', dataIndex: 'unit', key: 'unit', width: 60 },
  { title: 'BOM标准用量', dataIndex: 'bom_standard_quantity', key: 'bom_standard_quantity', width: 110 },
  { title: '损耗率%', dataIndex: 'bom_wastage_rate', key: 'bom_wastage_rate', width: 80 },
  { title: 'BOM实际用量', dataIndex: 'bom_actual_quantity', key: 'bom_actual_quantity', width: 110 },
  { title: '需求数量', dataIndex: 'required_quantity', key: 'required_quantity', width: 100 },
  { title: '调整数量', key: 'adjusted_quantity', width: 110 },
  { title: '已领料', dataIndex: 'issued_quantity', key: 'issued_quantity', width: 80 },
  { title: '关键物料', key: 'is_key_material', width: 80 },
  { title: '仓库', dataIndex: 'default_warehouse', key: 'default_warehouse', width: 90 }
]

// 按工序分组
const groupedDetailList = computed(() => {
  const groups: { step_number: number | null; standard_process_name: string; work_center_name: string; items: PreparationDetail[] }[] = []
  const map = new Map<string, typeof groups[0]>()
  for (const d of detailList.value) {
    const key = d.step_number != null ? String(d.step_number) : 'general'
    if (!map.has(key)) {
      const group = {
        step_number: d.step_number,
        standard_process_name: d.standard_process_name || (d.step_number != null ? `工序${d.step_number}` : '通用物料'),
        work_center_name: d.work_center_name || '',
        items: [] as PreparationDetail[]
      }
      map.set(key, group)
      groups.push(group)
    }
    map.get(key)!.items.push(d)
  }
  return groups
})

const handleViewDetails = async (record: MaterialPreparation) => {
  detailLoading.value = true
  detailModalVisible.value = true
  detailEditing.value = false
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

onMounted(async () => { await loadColumnPreference(); fetchData() })

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
  <div class="by-process-page">
    <a-card title="按工序备料清单" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索备料单编号/生产单编号/产品"
            style="width: 300px"
            allow-clear
            @search="handleSearch"
            @pressEnter="handleSearch"
          />
          <a-select v-model:value="prepStatusFilter" placeholder="备料状态" allow-clear style="width: 120px" @change="handleSearch">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="未领料">未领料</a-select-option>
            <a-select-option value="部分领料">部分领料</a-select-option>
            <a-select-option value="已领料">已领料</a-select-option>
            <a-select-option value="已关闭">已关闭</a-select-option>
          </a-select>
          <a-select v-model:value="approvalFilter" placeholder="审批状态" allow-clear style="width: 120px" @change="handleSearch">
            <a-select-option value="">全部</a-select-option>
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
          <a-button type="primary" @click="handleOpenOrderModal">
            <template #icon><PartitionOutlined /></template>
            从生产单备料
          </a-button>
          <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
        </a-space>
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

    <!-- 从生产单按工序备料弹窗 -->
    <a-modal
      v-model:open="orderModalVisible"
      title="从生产单按工序生成备料单"
      width="1100px"
      :footer="null"
    >
      <a-alert message="系统将根据工艺路线物料子表和BOM工序信息，按工序分配物料生成备料单。物料无法匹配工序时将报错。仅显示已审批的生产单。" type="info" show-icon style="margin-bottom: 16px;" />
      <div style="margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
        <a-input-search
          v-model:value="orderSearchText"
          placeholder="搜索生产单编号/产品编号/名称"
          style="width: 300px"
          allow-clear
          @search="handleOrderSearch"
          @pressEnter="handleOrderSearch"
        />
        <a-button type="primary" :loading="orderGenerateLoading" @click="handleGenerateByProcess">
          <template #icon><PartitionOutlined /></template>
          按工序生成备料单 ({{ orderSelectedRowKeys.length }})
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

    <!-- 备料单明细弹窗（按工序分组） -->
    <a-modal
      v-model:open="detailModalVisible"
      :title="'备料单明细 - ' + (detailHeader?.preparation_number || '')"
      width="1300px"
      :footer="null"
    >
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
            <span style="font-weight: 600; font-size: 14px;">物料明细列表（按工序分组）</span>
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

          <!-- 按工序分组显示 -->
          <div v-for="(group, gIndex) in groupedDetailList" :key="gIndex" style="margin-bottom: 16px;">
            <div style="background: #e6f7ff; border: 1px solid #91d5ff; border-radius: 4px; padding: 8px 12px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 600; color: #1890ff;">
                <PartitionOutlined style="margin-right: 6px;" />
                工序 {{ group.step_number ?? '-' }} - {{ group.standard_process_name }}
                <span v-if="group.work_center_name" style="color: #666; font-weight: normal; margin-left: 12px;">工作中心: {{ group.work_center_name }}</span>
              </span>
              <a-tag color="blue">{{ group.items.length }} 种物料</a-tag>
            </div>
            <a-table
              :columns="detailColumns"
              :data-source="group.items"
              :pagination="false"
              :scroll="{ x: 'max-content' }"
              row-key="id"
              size="small"
              bordered
            >
              <template #bodyCell="{ column, record }">
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
              </template>
            </a-table>
          </div>

          <!-- 全局合计 -->
          <div style="background: #fafafa; border: 1px solid #d9d9d9; border-radius: 4px; padding: 10px 16px; display: flex; gap: 24px;">
            <span style="font-weight: 600;">合计</span>
            <span>需求数量: <b>{{ detailList.reduce((sum, d) => sum + (parseFloat(String(d.required_quantity)) || 0), 0).toFixed(4) }}</b></span>
            <span>调整数量: <b>{{ detailList.reduce((sum, d) => sum + (parseFloat(String(d.adjusted_quantity)) || 0), 0).toFixed(4) }}</b></span>
            <span>已领料: <b>{{ detailList.reduce((sum, d) => sum + (parseFloat(String(d.issued_quantity)) || 0), 0).toFixed(4) }}</b></span>
            <span>物料种类: <b>{{ detailList.length }}</b></span>
          </div>
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
  </div>
</template>

<style scoped>
.by-process-page {
  padding: 0;
}
</style>
