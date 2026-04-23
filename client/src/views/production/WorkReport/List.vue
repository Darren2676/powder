<script setup lang="ts">
import { ref, reactive, onMounted, createVNode, computed, watch } from 'vue'
import { message, Modal } from 'ant-design-vue'
import { ReloadOutlined, EditOutlined, DeleteOutlined, ExclamationCircleOutlined, DownloadOutlined, UploadOutlined, HistoryOutlined, DownOutlined, EyeOutlined, FormOutlined, SettingOutlined, SafetyCertificateOutlined } from '@ant-design/icons-vue'
import { getWorkReports, createWorkReport, updateWorkReport, deleteWorkReport, exportWorkReports, importWorkReports, getTasksForReport, getSchedules, getTeams, getEmployees } from '@/api/production/workReport'
import { useAuthStore } from '@/store/auth'
import { useRouter } from 'vue-router'
import ApprovalStatusTag from '@/components/Common/ApprovalStatusTag.vue'
import ApprovalLogModal from '@/components/Common/ApprovalLogModal.vue'
import ColumnSettingDrawer from '@/components/Common/ColumnSettingDrawer.vue'
import { useColumnPreference } from '@/composables/useColumnPreference'
import { useTableList } from '@/composables/useTableList'
import { generateExportFilename } from '@/utils/exportFilename'
import { submitForApproval, approveRecord, reverseApproval, withdrawApproval, batchSubmitForApproval, batchApproveRecords, batchWithdrawApproval, batchReverseApproval } from '@/api/system/approval'
import dayjs from 'dayjs'

const approvalFilter = ref('')
const { loading, dataSource, searchText, selectedRowKeys, pagination, fetchData: fetchList, handleTableChange, handleSearch, handleReset } = useTableList(getWorkReports)

// Override fetchData to pass approvalFilter
const fetchData = () => fetchList({ approval_status: approvalFilter.value || undefined })

const authStore = useAuthStore()
const router = useRouter()
const approvalLogVisible = ref(false)
const approvalLogRecordId = ref('')

const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: string[]) => { selectedRowKeys.value = keys }
}))



const defaultDataColumns: any[] = [
  { title: '报工单编号', dataIndex: 'work_report_number', key: 'work_report_number', width: 170, resizable: true },
  { title: '工序任务编号', dataIndex: 'process_task_number', key: 'process_task_number', width: 160, resizable: true },
  { title: '生产单编号', dataIndex: 'production_order_number', key: 'production_order_number', width: 150, resizable: true },
  { title: '工序', key: 'step_info', width: 140, resizable: true },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 130, resizable: true },
  { title: '合格数量', dataIndex: 'qualified_quantity', key: 'qualified_quantity', width: 90, resizable: true },
  { title: '不合格数量', dataIndex: 'unqualified_quantity', key: 'unqualified_quantity', width: 100, resizable: true },
  { title: '累计完成', dataIndex: 'cumulative_quantity', key: 'cumulative_quantity', width: 90, resizable: true },
  { title: '报工日期', dataIndex: 'report_date', key: 'report_date', width: 110, resizable: true },
  { title: '班次', dataIndex: 'schedules_name', key: 'schedules_name', width: 80, resizable: true },
  { title: '操作员', dataIndex: 'operator_name', key: 'operator_name', width: 90, resizable: true },
  { title: '审批状态', dataIndex: 'approval_status', key: 'approval_status', width: 100, resizable: true }
]

const {
  columns, columnSettingVisible, columnSettingList, columnSettingSaving,
  openColumnSetting, moveColumnUp, moveColumnDown, saveColumnSetting, resetColumnSetting,
  loadColumnPreference, handleResizeColumn
} = useColumnPreference('work_report_list', defaultDataColumns, {
  fixedLeft: [{ title: '行号', key: 'rowIndex', width: 60, fixed: 'left' as const }],
  fixedRight: [{ title: '操作', key: 'action', width: 80, fixed: 'right' as const }]
})

const handleDelete = (record: any) => {
  Modal.confirm({ title: '确认删除', icon: createVNode(ExclamationCircleOutlined), content: `确定要删除报工单 "${record.work_report_number}" 吗？`, okText: '确定', okType: 'danger', cancelText: '取消',
    async onOk() { try { const res = await deleteWorkReport(record.work_report_number); if (res.success) { message.success('删除成功'); fetchData() } else { message.error(res.message || '删除失败') } } catch { message.error('删除失败') } }
  })
}

// ==================== 导入导出 ====================
const fileInputRef = ref<HTMLInputElement>()
const handleExport = async () => {
  try {
    const res = await exportWorkReports(searchText.value || undefined)
    const blob = new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = generateExportFilename('work_reports'); link.click(); URL.revokeObjectURL(link.href)
    message.success('导出成功')
  } catch { message.error('导出失败') }
}
const handleImportClick = () => { fileInputRef.value?.click() }
const handleFileChange = async (event: Event) => {
  const target = event.target as HTMLInputElement; const file = target.files?.[0]; if (!file) return
  try { const formData = new FormData(); formData.append('file', file); const res = await importWorkReports(formData); if (res.success) { message.success(res.message || '导入成功'); fetchData() } else { message.error(res.message || '导入失败') } }
  catch { message.error('导入失败') } finally { target.value = '' }
}

// ==================== 报工弹窗 - 第一步：选择工序任务 ====================
const reportStep = ref(0) // 0=关闭, 1=选任务, 2=填报工
const taskLoading = ref(false)
const taskDataSource = ref<any[]>([])
const taskSearchText = ref('')
const selectedTask = ref<any>(null)

const taskPagination = reactive({ current: 1, pageSize: 10, total: 0, showSizeChanger: true, showTotal: (total: number) => `共 ${total} 条记录` })

const taskColumns = [
  { title: '行号', key: 'taskRowIndex', width: 55 },
  { title: '工序任务编号', dataIndex: 'process_task_number', key: 'process_task_number', width: 155 },
  { title: '生产单编号', dataIndex: 'production_order_number', key: 'production_order_number', width: 145 },
  { title: '工序', key: 'task_step_info', width: 130 },
  { title: '产品名称', dataIndex: 'item_name', key: 'item_name', width: 120 },
  { title: '计划数量', dataIndex: 'planned_quantity', key: 'planned_quantity', width: 90 },
  { title: '已完成', dataIndex: 'completed_quantity', key: 'completed_quantity', width: 80 },
  { title: '剩余', dataIndex: 'remaining_quantity', key: 'remaining_quantity', width: 80 },
  { title: '最大可报', dataIndex: 'max_reportable', key: 'max_reportable', width: 90 },
  { title: '工作中心', dataIndex: 'work_center_name', key: 'work_center_name', width: 100 },
  { title: '状态', dataIndex: 'task_status', key: 'task_status', width: 80 },
  { title: '已报工', dataIndex: 'report_count', key: 'report_count', width: 70 }
]

const fetchTaskData = async () => {
  taskLoading.value = true
  try {
    const res = await getTasksForReport({ page: taskPagination.current, limit: taskPagination.pageSize, search: taskSearchText.value || undefined })
    if (res.success) { taskDataSource.value = res.data.items; taskPagination.total = res.data.pagination.total }
  } catch { message.error('获取工序任务列表失败') }
  finally { taskLoading.value = false }
}

const handleTaskTableChange = (pag: any) => { taskPagination.current = pag.current; taskPagination.pageSize = pag.pageSize; fetchTaskData() }
const handleTaskSearch = () => { taskPagination.current = 1; fetchTaskData() }

const handleOpenReport = () => {
  reportStep.value = 1; selectedTask.value = null; taskSearchText.value = ''; taskPagination.current = 1; fetchTaskData()
}

const handleSelectTask = (record: any) => {
  selectedTask.value = record
  reportStep.value = 2
  // 初始化表单
  reportForm.qualified_quantity = 0
  reportForm.unqualified_quantity = 0
  reportForm.report_date = dayjs().format('YYYY/MM/DD')
  reportForm.schedules_id = ''; reportForm.schedules_name = ''
  reportForm.team_number = ''; reportForm.team_name = ''
  reportForm.operator_number = ''; reportForm.operator_name = ''
  reportForm.actual_start_time = ''; reportForm.actual_end_time = ''
  reportForm.unqualified_reason = ''; reportForm.remark = ''
  // 加载下拉选项
  loadDropdowns()
}

// ==================== 报工弹窗 - 第二步：填写报工信息 ====================
const reportForm = reactive({
  qualified_quantity: 0, unqualified_quantity: 0, report_date: '', schedules_id: '', schedules_name: '',
  team_number: '', team_name: '', operator_number: '', operator_name: '',
  actual_start_time: '', actual_end_time: '', unqualified_reason: '', remark: ''
})
const reportSubmitting = ref(false)
const scheduleOptions = ref<any[]>([])
const teamOptions = ref<any[]>([])
const employeeOptions = ref<any[]>([])

const loadDropdowns = async () => {
  try {
    const [schedRes, grpRes, empRes] = await Promise.all([getSchedules(), getTeams(), getEmployees()])
    if (schedRes.success) scheduleOptions.value = schedRes.data?.items || schedRes.data || []
    if (grpRes.success) teamOptions.value = grpRes.data?.items || grpRes.data || []
    if (empRes.success) employeeOptions.value = empRes.data?.items || empRes.data || []
  } catch { /* ignore */ }
}

const handleScheduleChange = (val: string) => {
  const found = scheduleOptions.value.find((s: any) => s.schedules_id === val)
  reportForm.schedules_name = found?.schedules_name || ''
}
const handleTeamChange = (val: string) => {
  const found = teamOptions.value.find((g: any) => g.team_number === val)
  reportForm.team_name = found?.team_name || ''
}
const handleOperatorChange = (val: string) => {
  const found = employeeOptions.value.find((e: any) => e.employee_number === val)
  reportForm.operator_name = found?.employee_name || ''
}

const handleSubmitReport = async () => {
  if (!selectedTask.value) return
  if (reportForm.qualified_quantity <= 0 && reportForm.unqualified_quantity <= 0) {
    message.warning('合格数量或不合格数量至少填写一项'); return
  }
  reportSubmitting.value = true
  try {
    const res = await createWorkReport({
      process_task_number: selectedTask.value.process_task_number,
      ...reportForm
    })
    if (res.success) { message.success('报工成功'); reportStep.value = 0; fetchData() }
    else { message.error(res.message || '报工失败') }
  } catch (e: any) { message.error(e?.response?.data?.message || '报工失败') }
  finally { reportSubmitting.value = false }
}

// ==================== 编辑弹窗 ====================
const editVisible = ref(false)
const editForm = reactive<any>({})
const editSubmitting = ref(false)

const handleEdit = (record: any) => {
  Object.assign(editForm, {
    work_report_number: record.work_report_number,
    qualified_quantity: record.qualified_quantity,
    unqualified_quantity: record.unqualified_quantity,
    report_date: record.report_date,
    schedules_id: record.schedules_id,
    schedules_name: record.schedules_name,
    team_number: record.team_number,
    team_name: record.team_name,
    operator_number: record.operator_number,
    operator_name: record.operator_name,
    actual_start_time: record.actual_start_time,
    actual_end_time: record.actual_end_time,
    unqualified_reason: record.unqualified_reason,
    remark: record.remark
  })
  editVisible.value = true
  loadDropdowns()
}

const handleEditScheduleChange = (val: string) => { const f = scheduleOptions.value.find((s: any) => s.schedules_id === val); editForm.schedules_name = f?.schedules_name || '' }
const handleEditGroupChange = (val: string) => { const f = teamOptions.value.find((g: any) => g.team_number === val); editForm.team_name = f?.team_name || '' }
const handleEditOperatorChange = (val: string) => { const f = employeeOptions.value.find((e: any) => e.employee_number === val); editForm.operator_name = f?.employee_name || '' }

const handleEditSubmit = async () => {
  editSubmitting.value = true
  try {
    const res = await updateWorkReport(editForm.work_report_number, editForm)
    if (res.success) { message.success('更新成功'); editVisible.value = false; fetchData() }
    else { message.error(res.message || '更新失败') }
  } catch { message.error('更新失败') }
  finally { editSubmitting.value = false }
}

onMounted(async () => { await loadColumnPreference(); fetchData() })

// ==================== 更多操作 (dropdown) ====================
const handleMoreAction = async (key: string, record: any) => {
  const id = record.work_report_number
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
      content: '确定要提交审核吗？', okText: '确认', cancelText: '取消',
      onOk: async () => { try { await submitForApproval('work_report', id); message.success('提交审核成功'); fetchData() } catch { message.error('提交审核失败') } }
    })
  } else if (key === 'approve') {
    Modal.confirm({
      title: '审核通过', icon: createVNode(ExclamationCircleOutlined),
      content: '确定审核通过吗？', okText: '通过', cancelText: '取消',
      onOk: async () => { try { await approveRecord('work_report', id); message.success('审核通过'); fetchData() } catch { message.error('审核失败') } }
    })
  } else if (key === 'withdraw') {
    Modal.confirm({
      title: '撤回提交', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要撤回审核提交吗？', okText: '撤回', cancelText: '取消',
      onOk: async () => { try { await withdrawApproval('work_report', id); message.success('撤回成功'); fetchData() } catch { message.error('撤回失败') } }
    })
  } else if (key === 'reverse') {
    Modal.confirm({
      title: '反审退回', icon: createVNode(ExclamationCircleOutlined),
      content: '确定要执行反审吗？记录将退回草稿状态。', okText: '确认反审', okType: 'danger', cancelText: '取消',
      onOk: async () => { try { await reverseApproval('work_report', id); message.success('反审成功'); fetchData() } catch { message.error('反审失败') } }
    })
  } else if (key === 'inspection') {
    router.push(`/production-inspections?search=${encodeURIComponent(record.production_order_number || '')}`)
  }
}

// ==================== 批量审批操作 ====================
const batchLoading = ref(false)
const handleBatchAction = (action: string) => {
  if (selectedRowKeys.value.length === 0) { message.warning('请先勾选记录'); return }
  const count = selectedRowKeys.value.length
  const actionMap: Record<string, { title: string; desc: string; fn: () => Promise<any>; okType?: string }> = {
    'submit': { title: '批量提交审核', desc: `确定要批量提交 ${count} 条记录吗？仅草稿状态的记录会被提交。`, fn: () => batchSubmitForApproval('work_report', selectedRowKeys.value) },
    'approve': { title: '批量审核通过', desc: `确定要批量审核 ${count} 条记录吗？仅待审批状态的记录会被审批，审批通过后将自动回写工序任务完成数量。`, fn: () => batchApproveRecords('work_report', selectedRowKeys.value) },
    'withdraw': { title: '批量撤回', desc: `确定要批量撤回 ${count} 条记录吗？仅待审批状态的记录会被撤回。`, fn: () => batchWithdrawApproval('work_report', selectedRowKeys.value) },
    'reverse': { title: '批量反审', desc: `确定要批量反审 ${count} 条记录吗？已审批的记录将退回草稿，并逆向扣减工序任务完成数量。`, fn: () => batchReverseApproval('work_report', selectedRowKeys.value), okType: 'danger' }
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
  <div class="work-report-page">
    <a-card title="工序报工" :bordered="false">
      <template #extra>
        <a-space>
          <a-input-search v-model:value="searchText" placeholder="搜索报工单/工序任务/产品/操作员" style="width: 300px" allow-clear @search="handleSearch" @pressEnter="handleSearch" />
          <a-select v-model:value="approvalFilter" placeholder="审批状态" allow-clear style="width: 120px" @change="handleSearch">
            <a-select-option value="">全部</a-select-option>
            <a-select-option value="草稿">草稿</a-select-option>
            <a-select-option value="待审批">待审批</a-select-option>
            <a-select-option value="已审批">已审批</a-select-option>
          </a-select>
          <a-button @click="handleReset"><template #icon><ReloadOutlined /></template>重置</a-button>
          <a-button @click="handleExport"><template #icon><DownloadOutlined /></template>导出</a-button>
          <a-button @click="handleImportClick"><template #icon><UploadOutlined /></template>导入</a-button>
          <input ref="fileInputRef" type="file" accept=".xlsx,.xls" style="display: none" @change="handleFileChange" />
          <a-button type="primary" @click="handleOpenReport"><template #icon><FormOutlined /></template>工序报工</a-button>
          <a-tooltip title="列设置"><a-button @click="openColumnSetting"><SettingOutlined /></a-button></a-tooltip>
        </a-space>
      </template>

      <a-table :columns="columns" :data-source="dataSource" :loading="loading" :pagination="pagination" :scroll="{ x: 'max-content' }" :row-selection="rowSelection" row-key="work_report_number" size="middle" bordered @change="handleTableChange" @resizeColumn="handleResizeColumn">
        <template #bodyCell="{ column, record, index }">
          <template v-if="column.key === 'rowIndex'">{{ (pagination.current - 1) * pagination.pageSize + index + 1 }}</template>
          <template v-else-if="column.key === 'step_info'">{{ record.step_number }}-{{ record.standard_process_name }}</template>
          <template v-else-if="column.key === 'qualified_quantity'"><span style="color: #52c41a; font-weight: 600;">{{ record.qualified_quantity }}</span></template>
          <template v-else-if="column.key === 'unqualified_quantity'">
            <span :style="{ color: parseFloat(record.unqualified_quantity) > 0 ? '#ff4d4f' : '#999', fontWeight: parseFloat(record.unqualified_quantity) > 0 ? '600' : 'normal' }">{{ record.unqualified_quantity }}</span>
          </template>
          <template v-else-if="column.key === 'approval_status'"><ApprovalStatusTag :status="record.approval_status" /></template>
          <template v-else-if="column.key === 'action'">
            <a-dropdown :trigger="['click']">
              <a-button type="link" size="small" @click.stop>更多<DownOutlined style="font-size: 10px; margin-left: 2px;" /></a-button>
              <template #overlay>
                <a-menu @click="({ key: k }: any) => handleMoreAction(k, record)">
                  <a-menu-item key="edit" v-if="record.approval_status === '草稿'"><EditOutlined /> 编辑</a-menu-item>
                  <a-menu-item key="submit" v-if="record.approval_status === '草稿'">提交审核</a-menu-item>
                  <a-menu-item key="approve" v-if="record.approval_status === '待审批'"><span style="color: #52c41a">审核通过</span></a-menu-item>
                  <a-menu-item key="withdraw" v-if="record.approval_status === '待审批'">撤回提交</a-menu-item>
                  <a-menu-item key="reverse" v-if="record.approval_status === '已审批'"><span style="color: #ff4d4f">反审退回</span></a-menu-item>
                  <a-menu-divider />
                  <a-menu-item key="history"><HistoryOutlined /> 审批历史</a-menu-item>
                  <a-menu-item key="inspection"><SafetyCertificateOutlined /> 查看检验</a-menu-item>
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

    <!-- 第一步：选择工序任务 -->
    <a-modal v-model:open="reportStep" :open="reportStep === 1" title="工序报工 - 选择工序任务" width="1200px" :footer="null" @cancel="reportStep = 0">
      <template v-if="reportStep === 1">
        <a-alert message="请选择要报工的工序任务。仅显示已审批且状态为「未开始」或「进行中」的工序任务。" type="info" show-icon style="margin-bottom: 16px;" />
        <div style="margin-bottom: 12px;">
          <a-input-search v-model:value="taskSearchText" placeholder="搜索工序任务编号/生产单/产品/工序名称" style="width: 360px" allow-clear @search="handleTaskSearch" @pressEnter="handleTaskSearch" />
        </div>
        <a-table :columns="taskColumns" :data-source="taskDataSource" :loading="taskLoading" :pagination="taskPagination" row-key="process_task_number" size="small" bordered @change="handleTaskTableChange">
          <template #bodyCell="{ column, record, index }">
            <template v-if="column.key === 'taskRowIndex'">{{ (taskPagination.current - 1) * taskPagination.pageSize + index + 1 }}</template>
            <template v-else-if="column.key === 'task_step_info'">{{ record.step_number }}-{{ record.standard_process_name }}</template>
            <template v-else-if="column.key === 'task_status'">
              <a-tag :color="record.task_status === '进行中' ? 'processing' : 'default'">{{ record.task_status }}</a-tag>
            </template>
            <template v-else-if="column.key === 'process_task_number'">
              <a style="color: #1890ff; cursor: pointer;" @click="handleSelectTask(record)">{{ record.process_task_number }}</a>
            </template>
          </template>
        </a-table>
      </template>

      <!-- 第二步：填写报工信息 -->
      <template v-if="reportStep === 2">
        <div style="margin-bottom: 16px;">
          <a-button size="small" @click="reportStep = 1" style="margin-bottom: 12px;">← 返回选择工序任务</a-button>
          <a-descriptions :column="4" bordered size="small" v-if="selectedTask">
            <a-descriptions-item label="工序任务">{{ selectedTask.process_task_number }}</a-descriptions-item>
            <a-descriptions-item label="工序">{{ selectedTask.step_number }}-{{ selectedTask.standard_process_name }}</a-descriptions-item>
            <a-descriptions-item label="产品">{{ selectedTask.item_name }}</a-descriptions-item>
            <a-descriptions-item label="工作中心">{{ selectedTask.work_center_name || '-' }}</a-descriptions-item>
            <a-descriptions-item label="计划数量">{{ selectedTask.planned_quantity }}</a-descriptions-item>
            <a-descriptions-item label="已完成">{{ selectedTask.completed_quantity }}</a-descriptions-item>
            <a-descriptions-item label="剩余可报">
              <span style="color: #1890ff; font-weight: 600;">{{ selectedTask.max_reportable }}</span>
            </a-descriptions-item>
            <a-descriptions-item label="状态">
              <a-tag :color="selectedTask.task_status === '进行中' ? 'processing' : 'default'">{{ selectedTask.task_status }}</a-tag>
            </a-descriptions-item>
          </a-descriptions>
        </div>

        <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }" style="max-width: 800px; margin: 0 auto;">
          <a-row :gutter="16">
            <a-col :span="12">
              <a-form-item label="合格数量" required>
                <a-input-number v-model:value="reportForm.qualified_quantity" :min="0" :max="selectedTask?.max_reportable || 99999" :precision="4" style="width: 100%" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="不合格数量">
                <a-input-number v-model:value="reportForm.unqualified_quantity" :min="0" :precision="4" style="width: 100%" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="报工日期" required>
                <a-input v-model:value="reportForm.report_date" placeholder="YYYY/MM/DD" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="班次" required>
                <a-select v-model:value="reportForm.schedules_id" placeholder="选择班次" allow-clear @change="handleScheduleChange">
                  <a-select-option v-for="s in scheduleOptions" :key="s.schedules_id" :value="s.schedules_id">{{ s.schedules_name }}</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="班组">
                <a-select v-model:value="reportForm.team_number" placeholder="选择班组" allow-clear @change="handleTeamChange">
                  <a-select-option v-for="g in teamOptions" :key="g.team_number" :value="g.team_number">{{ g.team_name }}</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="操作员" required>
                <a-select v-model:value="reportForm.operator_number" placeholder="选择操作员" allow-clear show-search :filter-option="(input: string, option: any) => (option?.label || '').toLowerCase().includes(input.toLowerCase())" @change="handleOperatorChange">
                  <a-select-option v-for="e in employeeOptions" :key="e.employee_number" :value="e.employee_number" :label="e.employee_name">{{ e.employee_name }}({{ e.employee_number }})</a-select-option>
                </a-select>
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="开始时间">
                <a-input v-model:value="reportForm.actual_start_time" placeholder="YYYY/MM/DD HH:mm" />
              </a-form-item>
            </a-col>
            <a-col :span="12">
              <a-form-item label="结束时间">
                <a-input v-model:value="reportForm.actual_end_time" placeholder="YYYY/MM/DD HH:mm" />
              </a-form-item>
            </a-col>
            <a-col :span="24" v-if="reportForm.unqualified_quantity > 0">
              <a-form-item label="不合格原因" :label-col="{ span: 3 }" :wrapper-col="{ span: 20 }">
                <a-textarea v-model:value="reportForm.unqualified_reason" :rows="2" placeholder="请填写不合格原因" />
              </a-form-item>
            </a-col>
            <a-col :span="24">
              <a-form-item label="备注" :label-col="{ span: 3 }" :wrapper-col="{ span: 20 }">
                <a-textarea v-model:value="reportForm.remark" :rows="2" placeholder="备注" />
              </a-form-item>
            </a-col>
          </a-row>
          <div style="text-align: center; margin-top: 16px;">
            <a-space>
              <a-button @click="reportStep = 0">取消</a-button>
              <a-button type="primary" :loading="reportSubmitting" @click="handleSubmitReport">确认报工</a-button>
            </a-space>
          </div>
        </a-form>
      </template>
    </a-modal>

    <!-- 编辑弹窗 -->
    <a-modal v-model:open="editVisible" title="编辑报工单" width="700px" :confirm-loading="editSubmitting" @ok="handleEditSubmit">
      <a-form :label-col="{ span: 6 }" :wrapper-col="{ span: 16 }">
        <a-row :gutter="16">
          <a-col :span="12">
            <a-form-item label="合格数量"><a-input-number v-model:value="editForm.qualified_quantity" :min="0" :precision="4" style="width: 100%" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="不合格数量"><a-input-number v-model:value="editForm.unqualified_quantity" :min="0" :precision="4" style="width: 100%" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="报工日期"><a-input v-model:value="editForm.report_date" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="班次">
              <a-select v-model:value="editForm.schedules_id" placeholder="选择班次" allow-clear @change="handleEditScheduleChange">
                <a-select-option v-for="s in scheduleOptions" :key="s.schedules_id" :value="s.schedules_id">{{ s.schedules_name }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="班组">
              <a-select v-model:value="editForm.team_number" placeholder="选择班组" allow-clear @change="handleEditGroupChange">
                <a-select-option v-for="g in teamOptions" :key="g.team_number" :value="g.team_number">{{ g.team_name }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="操作员">
              <a-select v-model:value="editForm.operator_number" placeholder="选择操作员" allow-clear show-search :filter-option="(input: string, option: any) => (option?.label || '').toLowerCase().includes(input.toLowerCase())" @change="handleEditOperatorChange">
                <a-select-option v-for="e in employeeOptions" :key="e.employee_number" :value="e.employee_number" :label="e.employee_name">{{ e.employee_name }}</a-select-option>
              </a-select>
            </a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="开始时间"><a-input v-model:value="editForm.actual_start_time" /></a-form-item>
          </a-col>
          <a-col :span="12">
            <a-form-item label="结束时间"><a-input v-model:value="editForm.actual_end_time" /></a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item label="不合格原因" :label-col="{ span: 3 }" :wrapper-col="{ span: 20 }"><a-textarea v-model:value="editForm.unqualified_reason" :rows="2" /></a-form-item>
          </a-col>
          <a-col :span="24">
            <a-form-item label="备注" :label-col="{ span: 3 }" :wrapper-col="{ span: 20 }"><a-textarea v-model:value="editForm.remark" :rows="2" /></a-form-item>
          </a-col>
        </a-row>
      </a-form>
    </a-modal>

    <!-- 审批日志弹窗 -->
    <ApprovalLogModal v-model:open="approvalLogVisible" module="work_report" :record-id="approvalLogRecordId" />

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
.work-report-page { padding: 0; }
</style>
