<script setup lang="ts">
import { ref, reactive, computed, onMounted, createVNode } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, PlusOutlined, DownloadOutlined, UploadOutlined, ImportOutlined, HistoryOutlined, DownOutlined, CheckCircleOutlined, CloseCircleOutlined, SettingOutlined } from '@ant-design/icons-vue'
import { getProcessTasks, createProcessTask, updateProcessTask, deleteProcessTask, batchDeleteProcessTasks, exportProcessTasks, importProcessTasks, generateFromOrder, getOrdersForGenerate } from '@/api/production/processTask'
import { useAuthStore } from '@/store/auth'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ApprovalLogModal from '@/components/Common/ApprovalLogModal.vue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval, batchSubmitForApproval, batchApproveRecords, batchWithdrawApproval, batchReverseApproval } from '@/api/system/approval'
import dayjs from 'dayjs'
import { useTableList } from '@/composables/useTableList'
import { generateExportFilename } from '@/utils/exportFilename'

interface ProcessTask {
  process_task_number: string
  production_order_number: string | null
  production_number: string | null
  process_route_number: string | null
  step_number: number | null
  item_number: string
  item_name: string
  specifications: string
  basic_unit: string
  planned_quantity: number
  completed_quantity: number
  standard_process_number: string
  standard_process_name: string
  work_center_number: string
  work_center_name: string
  process_material_input_number: string
  process_material_input_quantity: string
  process_material_input_unit: string
  material_wastage_rate: string
  excess_reporting_ratio: string
  ingredient_addition_method: string
  planned_start_time: string | null
  planned_end_time: string | null
  actual_start_time: string | null
  actual_end_time: string | null
  task_status: string
  approval_status: string
  remark: string
  creation_date: string
  creation_man: string
}




const activeTaskStatus = ref('')
const approvalFilter = ref('')
const authStore = useAuthStore()
const approvalLogVisible = ref(false)
const approvalLogRecordId = ref('')


const taskStatusTabs = [
  { key: '', label: '全部' },
  { key: '未开始', label: '未开始' },
  { key: '进行中', label: '进行中' },
  { key: '已完成', label: '已完成' },
  { key: '已关闭', label: '已关闭' }
]

const taskStatusColors: Record<string, string> = {
  '未开始': 'default',
  '进行中': 'processing',
  '已完成': 'success',
  '已关闭': 'error'
}

const emptyForm = () => ({
  production_order_number: '',
  production_number: '',
  process_route_number: '',
  step_number: null,
  item_number: '',
  item_name: '',
  specifications: '',
  basic_unit: '',
  planned_quantity: 0,
  standard_process_number: '',
  standard_process_name: '',
  work_center_number: '',
  work_center_name: '',
  process_material_input_number: '',
  process_material_input_quantity: '',
  process_material_input_unit: '',
  material_wastage_rate: '',
  excess_reporting_ratio: '',
  ingredient_addition_method: '',
  planned_start_time: null,
  planned_end_time: null,
  remark: ''
})

const handleStatusChange = () => {
  fetchData()
}

const defaultDataColumns: any[] = [
  { title: '工序任务编号', dataIndex: 'process_task_number', key: 'process_task_number', width: 160, resizable: true },
  { title: '生产单编号', dataIndex: 'production_order_number', key: 'production_order_number', width: 140, resizable: true },
  { title: '工序序号', dataIndex: 'step_number', key: 'step_number', width: 80, resizable: true },
  { title: '标准工序名称', dataIndex: 'standard_process_name', key: 'standard_process_name', width: 120, resizable: true },
  { title: '产品编号', dataIndex: 'item_number', key: 'item_number', width: 120, resizable: true },
  { title: '任务状态', dataIndex: 'task_status', key: 'task_status', width: 90, resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 90, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 120, resizable: true },
  { title: '规格', dataIndex: 'specifications', key: 'specifications', width: 120, resizable: true },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 90, resizable: true },
  { title: '已完成数量', dataIndex: 'completed_quantity', key: 'completed_quantity', width: 100, resizable: true },
  { title: '完成率', key: 'progress', width: 90, resizable: true },
  { title: '工作中心', dataIndex: 'work_center_name', key: 'work_center_name', width: 110, resizable: true },
  { title: '创建日期', dataIndex: 'creation_date', key: 'creation_date', width: 140, resizable: true },
  { title: '创建人', dataIndex: 'creation_man', key: 'creation_man', width: 80, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('process_task_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 80, fixed: 'right' as const }]
})

const calcProgress = (record: ProcessTask) => {
  const planned = parseFloat(String(record.planned_quantity)) || 0
  const completed = parseFloat(String(record.completed_quantity)) || 0
  if (planned <= 0) return '0%'
  const pct = Math.min(100, Math.round(completed / planned * 100))
  return pct + '%'
}

const { loading, dataSource, searchText, pagination, selectedRowKeys, rowSelection, fetchData, handleTableChange, handleSearch, handleReset } = useTableList(getProcessTasks)

const createModalVisible = ref(false)
const createLoading = ref(false)
const createForm = reactive<any>(emptyForm())
const createStartDate = ref<any>(null)
const createEndDate = ref<any>(null)

const editModalVisible = ref(false)
const editLoading = ref(false)
const editForm = reactive<any>(emptyForm())
const editStartDate = ref<any>(null)
const editEndDate = ref<any>(null)

const handleCreate = () => {
  Object.assign(createForm, emptyForm())
  createStartDate.value = null
  createEndDate.value = null
  createModalVisible.value = true
}

const handleCreateSubmit = async () => {
  if (!createForm.standard_process_number && !createForm.standard_process_name) {
    message.warning('请填写标准工序'); return
  }
  createLoading.value = true
  try {
    const data = {
      ...createForm,
      planned_start_time: createStartDate.value ? dayjs(createStartDate.value).format('YYYY-MM-DD') : null,
      planned_end_time: createEndDate.value ? dayjs(createEndDate.value).format('YYYY-MM-DD') : null
    }
    const res = await createProcessTask(data)
    if (res.success) { message.success('新建成功'); createModalVisible.value = false; fetchData() }
    else { message.error(res.message || '新建失败') }
  } catch { message.error('新建失败') }
  finally { createLoading.value = false }
}

const handleEdit = (record: ProcessTask) => {
  Object.assign(editForm, record)
  editStartDate.value = record.planned_start_time ? dayjs(record.planned_start_time) : null
  editEndDate.value = record.planned_end_time ? dayjs(record.planned_end_time) : null
  editModalVisible.value = true
}

const handleEditSubmit = async () => {
  editLoading.value = true
  try {
    const data = {
      ...editForm,
      planned_start_time: editStartDate.value ? dayjs(editStartDate.value).format('YYYY-MM-DD') : null,
      planned_end_time: editEndDate.value ? dayjs(editEndDate.value).format('YYYY-MM-DD') : null
    }
    const res = await updateProcessTask(editForm.process_task_number, data)
    if (res.success) { message.success('修改成功'); editModalVisible.value = false; fetchData() }
    else { message.error(res.message || '修改失败') }
  } catch { message.error('修改失败') }
  finally { editLoading.value = false }
}

const handleDelete = (record: ProcessTask) => {
  Modal.confirm({
    title: '确认删除',
    icon: createVNode(ExclamationCircleOutlined),
    content: `确定要删除工序任务 "${record.process_task_number}" 吗？`,
    okText: '确定', okType: 'danger', cancelText: '取消',
    async onOk() {
      try {
        const res = await deleteProcessTask(record.process_task_number)
        if (res.success) { message.success('删除成功'); fetchData() }
        else { message.error(res.message || '删除失败') }
      } catch { message.error('删除失败') }
    }
  })
}

// ==================== More Actions ====================
const handleMoreAction = async (key: string, record: ProcessTask) => {
  const id = record.process_task_number
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
      onOk: async () => { try { await submitForApproval('process_task', id); message.success('提交审核成功'); fetchData() } catch { message.error('提交审核失败') } }
    })
  } else if (key === 'approve') {
    Modal.confirm({
      title: '审核通过', icon: createVNode(ExclamationCircleOutlined),
      content: '确定审核通过吗？', okText: '通过', cancelText: '取消',
      onOk: async () => { try { await approveRecord('process_task', id); message.success('审核通过'); fetchData() } catch { message.error('审核失败') } }
    })
  } else if (key === 'withdraw') {
    Modal.confirm({
      title: '撤回提交', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要撤回审核提交吗？', okText: '撤回', cancelText: '取消',
      onOk: async () => { try { await withdrawApproval('process_task', id); message.success('撤回成功'); fetchData() } catch { message.error('撤回失败') } }
    })
  } else if (key === 'reverse') {
    Modal.confirm({
      title: '反审退回', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要执行反审吗？记录将退回草稿状态，可重新编辑。', okText: '确认反审', okType: 'danger', cancelText: '取消',
      onOk: async () => { try { await reverseApproval('process_task', id); message.success('反审成功，已退回草稿'); fetchData() } catch { message.error('反审失败') } }
    })
  }
}

// ==================== 导入导出 ====================
const fileInputRef = ref<HTMLInputElement>()

const handleExport = async () => {
  try {
    const res = await exportProcessTasks(searchText.value || undefined)
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = generateExportFilename('process_tasks')
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
    const res = await importProcessTasks(formData)
    if (res.success) { message.success(res.message || '导入成功'); fetchData() }
    else { message.error(res.message || '导入失败') }
  } catch { message.error('导入失败') }
  finally { target.value = '' }
}

// ==================== 从生产单导入 ====================
const orderModalVisible = ref(false)
const orderLoading = ref(false)
const orderDataSource = ref<any[]>([])
const orderSearchText = ref('')
const orderSelectedRowKeys = ref<string[]>([])
const orderGenerateLoading = ref(false)

const orderRowSelection = {
  selectedRowKeys: orderSelectedRowKeys,
  onChange: (keys: string[]) => { orderSelectedRowKeys.value = keys }
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
  { title: '工艺路线匹配', key: 'routing_status', width: 130 },
  { title: '已生成任务', dataIndex: 'existing_task_count', key: 'existing_task_count', width: 100 }
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

const handleGenerateFromOrder = async () => {
  if (orderSelectedRowKeys.value.length === 0) {
    message.warning('请先勾选要拆解的生产单')
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
  } catch { message.error('从生产单生成工序任务失败') }
  finally { orderGenerateLoading.value = false }
}

const formatDate = (date: string | null) => {
  if (!date) return '-'
  return dayjs(date).format('YYYY-MM-DD')
}

onMounted(async () => { await loadColumnPreference(); fetchData() })

// ==================== 批量审批操作 ====================
const batchLoading = ref(false)
const handleBatchAction = (action: string) => {
  if (selectedRowKeys.value.length === 0) { message.warning('请先勾选记录'); return }
  const count = selectedRowKeys.value.length
  const actionMap: Record<string, { title: string; desc: string; fn: () => Promise<any>; okType?: string }> = {
    'submit': { title: '批量提交审核', desc: `确定要批量提交 ${count} 条记录吗？仅草稿状态的记录会被提交。`, fn: () => batchSubmitForApproval('process_task', selectedRowKeys.value) },
    'approve': { title: '批量审核通过', desc: `确定要批量审核 ${count} 条记录吗？仅待审批状态的记录会被审批。`, fn: () => batchApproveRecords('process_task', selectedRowKeys.value) },
    'withdraw': { title: '批量撤回', desc: `确定要批量撤回 ${count} 条记录吗？仅待审批状态的记录会被撤回。`, fn: () => batchWithdrawApproval('process_task', selectedRowKeys.value) },
    'reverse': { title: '批量反审', desc: `确定要批量反审 ${count} 条记录吗？已审批的记录将退回草稿。`, fn: () => batchReverseApproval('process_task', selectedRowKeys.value), okType: 'danger' },
    'delete': { title: '批量删除', desc: `确定要批量删除 ${count} 条记录吗？仅草稿状态的记录会被删除，此操作不可恢复。`, fn: () => batchDeleteProcessTasks(selectedRowKeys.value), okType: 'danger' }
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
  <div class="process-task-page">
    <a-card title="工序任务管理" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search
            v-model:value="searchText"
            placeholder="搜索编号/产品编号/名称/工序/工作中心"
            style="width: 320px"
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
          <a-button type="primary" ghost @click="handleOpenOrderModal">
            <template #icon><ImportOutlined /></template>
            从生产单导入
          </a-button>
          <a-button type="primary" @click="handleCreate">
            <template #icon><PlusOutlined /></template>
            新建
          </a-button>
          <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
        </a-space>
      </template>

      <a-tabs v-model:activeKey="activeTaskStatus" @change="handleStatusChange" style="margin-bottom: 16px;">
        <a-tab-pane v-for="tab in taskStatusTabs" :key="tab.key" :tab="tab.label" />
      </a-tabs>

      <a-table
        :columns="columns"
        :data-source="dataSource"
        :loading="loading"
        :pagination="pagination"
        :scroll="{ x: 'max-content' }"
        :row-selection="rowSelection"
        row-key="process_task_number"
        size="middle"
        bordered
        @change="handleTableChange"
        @resizeColumn="handleResizeColumn"
      >
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">
            {{ (pagination.current - 1) * pagination.pageSize + index + 1 }}
          </template>
          <template v-else-if="column.key === 'progress'">
            <span :style="{ color: calcProgress(record) === '100%' ? '#52c41a' : '#1890ff', fontWeight: 'bold' }">
              {{ calcProgress(record) }}
            </span>
          </template>
          <template v-else-if="column.key === 'task_status'">
            <a-tag :color="taskStatusColors[record.task_status] || 'default'">{{ record.task_status }}</a-tag>
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
      <div style="display: flex; align-items: center; gap: 8px; padding: 12px 0; border-top: 1px solid #f0f0f0; margin-top: 8px;">
        <span style="color: #666; margin-right: 4px;">已选 <b style="color: #1890ff;">{{ selectedRowKeys.length }}</b> 项</span>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('submit')">批量提交</a-button>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('approve')">批量审批</a-button>
        <a-button size="small" :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('withdraw')">批量撤回</a-button>
        <a-button size="small" danger :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('reverse')">批量反审</a-button>
        <a-button size="small" danger :disabled="selectedRowKeys.length === 0" :loading="batchLoading" @click="handleBatchAction('delete')">批量删除</a-button>
        <a-button size="small" type="link" :disabled="selectedRowKeys.length === 0" @click="selectedRowKeys = []">清除选择</a-button>
      </div>
    </a-card>

    <!-- 新建弹窗 -->
    <a-modal v-model:open="createModalVisible" title="新建工序任务" :confirm-loading="createLoading" @ok="handleCreateSubmit" width="650px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="生产单编号">
          <a-input v-model:value="createForm.production_order_number" placeholder="请输入关联的生产单编号" />
        </a-form-item>
        <a-form-item label="工序序号">
          <a-input-number v-model:value="createForm.step_number" :min="1" :step="10" style="width: 100%" placeholder="10" />
        </a-form-item>
        <a-form-item label="标准工序编号" required>
          <a-input v-model:value="createForm.standard_process_number" placeholder="请输入标准工序编号" />
        </a-form-item>
        <a-form-item label="标准工序名称">
          <a-input v-model:value="createForm.standard_process_name" placeholder="请输入标准工序名称" />
        </a-form-item>
        <a-form-item label="产品编号">
          <a-input v-model:value="createForm.item_number" placeholder="请输入产品编号" />
        </a-form-item>
        <a-form-item label="产品名称">
          <a-input v-model:value="createForm.item_name" placeholder="请输入产品名称" />
        </a-form-item>
        <a-form-item label="规格">
          <a-input v-model:value="createForm.specifications" placeholder="请输入规格" />
        </a-form-item>
        <a-form-item label="单位">
          <a-input v-model:value="createForm.basic_unit" placeholder="请输入单位" />
        </a-form-item>
        <a-form-item label="计划数量">
          <a-input-number v-model:value="createForm.planned_quantity" :min="0" style="width: 100%" placeholder="请输入计划数量" />
        </a-form-item>
        <a-form-item label="工作中心编号">
          <a-input v-model:value="createForm.work_center_number" placeholder="请输入工作中心编号" />
        </a-form-item>
        <a-form-item label="工作中心名称">
          <a-input v-model:value="createForm.work_center_name" placeholder="请输入工作中心名称" />
        </a-form-item>
        <a-form-item label="配料方式">
          <a-select v-model:value="createForm.ingredient_addition_method" placeholder="请选择配料方式" allow-clear>
            <a-select-option value="备料">备料</a-select-option>
            <a-select-option value="领料">领料</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="计划开始时间">
          <a-date-picker v-model:value="createStartDate" style="width: 100%" placeholder="请选择" />
        </a-form-item>
        <a-form-item label="计划结束时间">
          <a-date-picker v-model:value="createEndDate" style="width: 100%" placeholder="请选择" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="createForm.remark" :rows="3" placeholder="请输入备注" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 编辑弹窗 -->
    <a-modal v-model:open="editModalVisible" title="修改工序任务" :confirm-loading="editLoading" @ok="handleEditSubmit" width="650px">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-form-item label="工序任务编号">
          <a-input v-model:value="editForm.process_task_number" disabled />
        </a-form-item>
        <a-form-item label="生产单编号">
          <a-input v-model:value="editForm.production_order_number" />
        </a-form-item>
        <a-form-item label="工序序号">
          <a-input-number v-model:value="editForm.step_number" :min="1" :step="10" style="width: 100%" />
        </a-form-item>
        <a-form-item label="标准工序编号">
          <a-input v-model:value="editForm.standard_process_number" />
        </a-form-item>
        <a-form-item label="标准工序名称">
          <a-input v-model:value="editForm.standard_process_name" />
        </a-form-item>
        <a-form-item label="产品编号">
          <a-input v-model:value="editForm.item_number" />
        </a-form-item>
        <a-form-item label="产品名称">
          <a-input v-model:value="editForm.item_name" />
        </a-form-item>
        <a-form-item label="规格">
          <a-input v-model:value="editForm.specifications" />
        </a-form-item>
        <a-form-item label="单位">
          <a-input v-model:value="editForm.basic_unit" />
        </a-form-item>
        <a-form-item label="计划数量">
          <a-input-number v-model:value="editForm.planned_quantity" :min="0" style="width: 100%" />
        </a-form-item>
        <a-form-item label="工作中心编号">
          <a-input v-model:value="editForm.work_center_number" />
        </a-form-item>
        <a-form-item label="工作中心名称">
          <a-input v-model:value="editForm.work_center_name" />
        </a-form-item>
        <a-form-item label="配料方式">
          <a-select v-model:value="editForm.ingredient_addition_method" allow-clear>
            <a-select-option value="备料">备料</a-select-option>
            <a-select-option value="领料">领料</a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="计划开始时间">
          <a-date-picker v-model:value="editStartDate" style="width: 100%" />
        </a-form-item>
        <a-form-item label="计划结束时间">
          <a-date-picker v-model:value="editEndDate" style="width: 100%" />
        </a-form-item>
        <a-form-item label="备注">
          <a-textarea v-model:value="editForm.remark" :rows="3" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 从生产单导入弹窗 -->
    <a-modal
      v-model:open="orderModalVisible"
      title="从生产单生成工序任务"
      width="1000px"
      :footer="null"
    >
      <a-alert message="系统将自动匹配产品对应的工艺路线，按工序明细逐条生成工序任务。仅显示已审批的生产单。" type="info" show-icon style="margin-bottom: 16px;" />
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
          <template #icon><ImportOutlined /></template>
          生成选中 ({{ orderSelectedRowKeys.length }})
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
          <template v-else-if="column.key === 'routing_status'">
            <template v-if="record.routing_matched">
              <a-tag color="success"><CheckCircleOutlined /> 已匹配({{ record.routing_process_count }}道工序)</a-tag>
            </template>
            <template v-else>
              <a-tag color="error"><CloseCircleOutlined /> 未匹配</a-tag>
            </template>
          </template>
        </template>
      </a-table>
    </a-modal>

    <!-- 审批日志弹窗 -->
    <ApprovalLogModal v-model:open="approvalLogVisible" module="process_task" :record-id="approvalLogRecordId" />

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
.process-task-page {
  padding: 0;
}
</style>
