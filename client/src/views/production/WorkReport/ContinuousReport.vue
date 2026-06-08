<template>
  <div class="continuous-report-page">
    <a-page-header title="连续报工" style="padding: 0; margin: 0;" />
    <!-- 顶部：扫码 + 生产单信息合并 -->
    <a-card :bordered="false" size="small" class="top-card">
      <a-row :gutter="12" align="middle">
        <a-col :span="6">
          <a-input-search
            ref="scanInputRef"
            v-model:value="orderInput"
            placeholder="扫码或输入生产单编号"
            enter-button="查询"
            :loading="loading"
            @search="handleSearch"
            size="small"
          />
        </a-col>
        <a-col :span="2">
          <a-select v-model:value="factoryFilter" placeholder="工厂" size="small" allow-clear style="width: 100%;" @change="handleSearch(orderInput)">
            <a-select-option v-for="f in factoryList" :key="f.id" :value="f.id">{{ f.factory_short || f.factory_name }}</a-select-option>
          </a-select>
        </a-col>
        <a-col :span="14">
          <template v-if="orderInfo">
            <span class="info-item"><b>{{ orderInfo.production_order_number }}</b></span>
            <a-divider type="vertical" />
            <a-tag v-if="orderInfo.factory_short" color="purple" size="small">{{ orderInfo.factory_short }}</a-tag>
            <a-divider v-if="orderInfo.factory_short" type="vertical" />
            <span class="info-item">{{ orderInfo.item_number }}</span>
            <a-divider type="vertical" />
            <span class="info-item">{{ orderInfo.item_name }}</span>
            <a-divider type="vertical" />
            <span class="info-item">{{ orderInfo.specifications }}</span>
            <a-divider type="vertical" />
            <span class="info-item">计划: <b style="color:#1890ff;">{{ orderInfo.planned_quantity }}</b> {{ orderInfo.basic_unit }}</span>
            <a-divider type="vertical" />
            <span class="info-item">实际班产: <b style="color:#fa8c16;">{{ orderInfo.actual_daily_output || '-' }}</b></span>
            <a-tag v-if="orderInfo.plan_status" :color="orderInfo.plan_status === '已派发' ? 'green' : 'blue'" size="small" style="margin-left:4px;">{{ orderInfo.plan_status }}</a-tag>
          </template>
        </a-col>
        <a-col :span="2" style="text-align:right;">
          <a-button size="small" @click="handleReset"><ReloadOutlined /></a-button>
        </a-col>
      </a-row>
    </a-card>

    <!-- 公共参数：单行紧凑 -->
    <a-card v-if="tasks.length > 0" :bordered="false" size="small" class="params-card">
      <a-row :gutter="8" align="middle">
        <a-col :flex="'auto'">
          <a-space :size="8" wrap>
            <span class="compact-label">报工日期</span>
            <a-date-picker v-model:value="commonParams.report_date" size="small" value-format="YYYY/MM/DD" placeholder="日期" style="width:120px;" />
            <span class="compact-label">班次</span>
            <a-select v-model:value="commonParams.schedules_id" size="small" placeholder="班次" allow-clear @change="onScheduleChange" style="width:100px;">
              <a-select-option v-for="s in scheduleList" :key="s.schedules_id" :value="s.schedules_id">{{ s.schedules_name }}</a-select-option>
            </a-select>
            <span class="compact-label">班组</span>
            <a-select v-model:value="commonParams.team_number" size="small" placeholder="班组" allow-clear @change="onTeamChange" style="width:100px;">
              <a-select-option v-for="g in teamList" :key="g.team_number" :value="g.team_number">{{ g.team_name }}</a-select-option>
            </a-select>
            <span class="compact-label">操作员</span>
            <a-select v-model:value="commonParams.operator_number" size="small" placeholder="操作员" allow-clear show-search :filter-option="filterEmployee" @change="onOperatorChange" style="width:140px;">
              <a-select-option v-for="e in employeeList" :key="e.employee_number" :value="e.employee_number">{{ e.employee_name }} ({{ e.employee_number }})</a-select-option>
            </a-select>
            <a-divider type="vertical" />
            <span class="compact-label">快捷数量</span>
            <a-input-number v-model:value="quickQty" :min="0" size="small" placeholder="数量" style="width:90px;" />
            <a-button size="small" type="primary" ghost @click="applyQuickQty" :disabled="!quickQty">应用全部</a-button>
          </a-space>
        </a-col>
      </a-row>
    </a-card>

    <!-- 工序报工列表 -->
    <div v-if="tasks.length > 0" class="task-list">
      <div
        v-for="(task, index) in tasks"
        :key="task.process_task_number"
        class="task-row"
        :class="{ 'task-row--completed': task.task_status === '已完成', 'task-row--disabled': !task.can_report && task.task_status !== '已完成' }"
      >
        <!-- 上行：工序信息 + 进度 -->
        <div class="task-line1">
          <a-checkbox v-model:checked="task.checked" />
          <span class="step-badge" :class="{ 'step-badge--done': task.task_status === '已完成', 'step-badge--off': !task.can_report && task.task_status !== '已完成' }">{{ task.step_number }}</span>
          <span class="process-name">{{ task.standard_process_name }}</span>
          <a-tag :color="getStatusColor(task.task_status)" class="compact-tag">{{ task.task_status }}</a-tag>
          <a-tag :color="task.approval_status === '已审批' ? 'green' : 'orange'" class="compact-tag">{{ task.approval_status }}</a-tag>
          <a-tag v-if="task.report_count > 0" color="blue" class="compact-tag">报{{ task.report_count }}次</a-tag>
          <span v-if="task.work_center_name" class="wc-text">{{ task.work_center_name }}</span>
          <span v-if="task.operator" class="wc-text">操作员: {{ task.operator }}</span>
          <div class="task-nums">
            <span class="num-group"><span class="num-label">计划</span><span class="num-val">{{ task.planned_quantity }}</span></span>
            <span class="num-group"><span class="num-label">完成</span><span class="num-val" :style="{ color: parseFloat(task.completed_quantity) >= parseFloat(task.planned_quantity) ? '#52c41a' : '#1890ff' }">{{ task.completed_quantity }}</span></span>
            <span class="num-group"><span class="num-label">可报</span><span class="num-val" :style="{ color: task.max_reportable <= 0 ? '#999' : '#fa8c16' }">{{ task.max_reportable }}</span></span>
            <a-progress :percent="getProgress(task)" :show-info="false" :stroke-color="getProgress(task) >= 100 ? '#52c41a' : '#1890ff'" size="small" style="width:100px;" />
            <span class="progress-text">{{ getProgress(task) }}%</span>
          </div>
        </div>
        <!-- 下行：输入/操作 -->
        <div class="task-line2">
          <template v-if="task.can_report">
            <span class="input-label">合格数 <span style="color:#ff4d4f;">*</span></span>
            <a-input-number v-model:value="task.input_qualified_qty" :min="0" :max="task.max_reportable" size="small" placeholder="合格数量" style="width:100px;" />
            <span class="input-label">不合格</span>
            <a-input-number v-model:value="task.input_unqualified_qty" :min="0" size="small" placeholder="不合格" style="width:90px;" />
            <template v-if="task.input_unqualified_qty && task.input_unqualified_qty > 0">
              <span class="input-label">缺陷分类</span>
              <a-select v-model:value="task.input_defect_class_number" size="small" placeholder="缺陷分类" allow-clear show-search :filter-option="(input: string, option: any) => String(option.children?.[0]?.children || '').toLowerCase().includes(input.toLowerCase())" @change="(v: string) => onDefectClassChange(task, v)" style="width:130px;">
                <a-select-option v-for="c in defectClassList" :key="c.defect_class_number" :value="c.defect_class_number">{{ c.defect_class_name }}</a-select-option>
              </a-select>
              <span class="input-label">缺陷名称</span>
              <a-select v-model:value="task.input_defect_name" size="small" placeholder="缺陷名称" allow-clear show-search :disabled="!task.input_defect_class_number" :filter-option="(input: string, option: any) => String(option.children?.[0]?.children || '').toLowerCase().includes(input.toLowerCase())" style="width:140px;">
                <a-select-option v-for="d in getFilteredDefects(task.input_defect_class_number)" :key="d.defect_number" :value="d.defect_name">{{ d.defect_name }}</a-select-option>
              </a-select>
            </template>
            <span class="input-label">操作员</span>
            <a-select v-model:value="task.input_operator_number" size="small" placeholder="操作员" allow-clear show-search :filter-option="filterEmployee" @change="(val: string) => onTaskOperatorChange(task, val)" style="width:140px;">
              <a-select-option v-for="e in employeeList" :key="e.employee_number" :value="e.employee_number">{{ e.employee_name }} ({{ e.employee_number }})</a-select-option>
            </a-select>
            <a-button type="primary" size="small" :loading="task.submitting" :disabled="!task.input_qualified_qty || task.input_qualified_qty <= 0" @click="submitSingleReport(task, index)">报工</a-button>
            <a-popconfirm v-if="index === tasks.length - 1" title="确认完成该生产单所有工序报工？" ok-text="确认" cancel-text="取消" @confirm="submitComplete(task, index)">
              <a-button type="primary" danger size="small" :loading="completing" :disabled="!task.input_qualified_qty || task.input_qualified_qty <= 0">完成</a-button>
            </a-popconfirm>
            <a-button size="small" @click="toggleHistory(task)" :loading="task.historyLoading">{{ task.showHistory ? '收起' : '历史' }}</a-button>
            <a-tooltip title="撤销从此工序到末道工序的所有报工，便于修正后重报">
              <a-button v-if="task.report_count > 0" size="small" danger @click="handleUndoPreview(task)" :loading="undoLoading && undoTargetTask?.process_task_number === task.process_task_number"><template #icon><UndoOutlined /></template>撤销重报</a-button>
            </a-tooltip>
          </template>
          <template v-else-if="task.task_status === '已完成'">
            <span style="color:#52c41a;font-size:13px;">已完成 {{ task.completed_quantity }} {{ task.basic_unit || '' }}</span>
            <a-button size="small" @click="toggleHistory(task)" :loading="task.historyLoading" style="margin-left:8px;">{{ task.showHistory ? '收起' : '历史' }}</a-button>
            <a-tooltip title="撤销从此工序到末道工序的所有报工，便于修正后重报">
              <a-button v-if="task.report_count > 0" size="small" danger @click="handleUndoPreview(task)" :loading="undoLoading && undoTargetTask?.process_task_number === task.process_task_number"><template #icon><UndoOutlined /></template>撤销重报</a-button>
            </a-tooltip>
          </template>
          <template v-else>
            <span style="color:#fa8c16;font-size:13px;">{{ getDisableReason(task) }}</span>
            <a-button size="small" @click="toggleHistory(task)" :loading="task.historyLoading" style="margin-left:8px;">{{ task.showHistory ? '收起' : '历史' }}</a-button>
            <a-tooltip title="撤销从此工序到末道工序的所有报工，便于修正后重报">
              <a-button v-if="task.report_count > 0" size="small" danger @click="handleUndoPreview(task)" :loading="undoLoading && undoTargetTask?.process_task_number === task.process_task_number"><template #icon><UndoOutlined /></template>撤销重报</a-button>
            </a-tooltip>
          </template>
        </div>
        <!-- 历史报工记录（展开） -->
        <div v-if="task.showHistory" class="task-history-row">
          <a-table v-if="task.historyRecords && task.historyRecords.length > 0" :columns="historyColumns" :data-source="task.historyRecords" :pagination="false" size="small" row-key="work_report_number" />
          <a-empty v-else description="暂无报工记录" :image-style="{ height: '30px' }" />
        </div>
      </div>
    </div>

    <!-- 无工序提示 -->
    <a-card v-if="orderInfo && tasks.length === 0 && !loading" :bordered="false" size="small" style="margin-top:8px;text-align:center;">
      <a-empty description="该生产单暂无工序任务，请先进行拆解" :image-style="{ height: '40px' }" />
    </a-card>

    <!-- 底部汇总操作栏 -->
    <div v-if="reportableTasks.length > 0" class="bottom-bar">
      <div class="bottom-bar-content">
        <span class="bottom-info">
          可报 <b>{{ reportableTasks.length }}</b> 道
          <a-divider type="vertical" />
          已填 <b>{{ filledTasks.length }}</b> 道
          <a-divider type="vertical" />
          合格总量 <b style="color:#1890ff;">{{ totalQualifiedQty }}</b>
        </span>
        <a-button type="primary" :loading="batchSubmitting" :disabled="filledTasks.length === 0" @click="submitBatchReport">
          全部报工（{{ filledTasks.length }} 道）
        </a-button>
      </div>
    </div>

    <!-- 撤销重报弹窗 -->
    <a-modal v-model:open="undoModalVisible" title="撤销重报 - 确认" width="800px" :confirm-loading="undoLoading" @ok="handleUndoConfirm" @cancel="undoModalVisible = false">
      <template v-if="undoPreviewData">
        <a-alert
          :message="undoPreviewData.can_delete_all ? '即将删除以下报工记录，被删除工序的完成数量将回退。' : undoPreviewData.delete_warning"
          :type="undoPreviewData.can_delete_all ? 'warning' : 'error'"
          show-icon
          style="margin-bottom: 16px;"
        />

        <a-descriptions :column="2" bordered size="small" style="margin-bottom: 16px;">
          <a-descriptions-item label="生产单编号">{{ undoPreviewData.production_order_number }}</a-descriptions-item>
          <a-descriptions-item label="目标工序">{{ undoTargetTask?.step_number }}-{{ undoTargetTask?.standard_process_name }}</a-descriptions-item>
          <a-descriptions-item label="总工序数">{{ undoPreviewData.total_step_count }}</a-descriptions-item>
          <a-descriptions-item label="受影响工序数">
            <span style="color: #ff4d4f; font-weight: 600;">{{ undoPreviewData.affected_step_count }}</span>
            （工序{{ undoPreviewData.target_step_number }} ~ 工序{{ undoPreviewData.max_step_number }}）
          </a-descriptions-item>
        </a-descriptions>

        <h4 style="margin-bottom: 8px;">受影响工序状态</h4>
        <a-table
          v-if="undoPreviewData.affected_steps?.length"
          :columns="[
            { title: '工序', key: 'step', width: 120 },
            { title: '工序名称', dataIndex: 'standard_process_name', key: 'name' },
            { title: '当前状态', dataIndex: 'task_status', key: 'status', width: 90 },
            { title: '已完成数', dataIndex: 'completed_quantity', key: 'qty', width: 100 }
          ]"
          :data-source="undoPreviewData.affected_steps"
          :pagination="false"
          size="small"
          row-key="step_number"
          style="margin-bottom: 16px;"
        >
          <template #bodyCell="{ record, column }">
            <template v-if="column.key === 'step'">{{ record.step_number }}-{{ record.standard_process_name }}</template>
            <template v-if="column.key === 'status'">
              <a-tag :color="record.task_status === '已完成' ? 'green' : record.task_status === '进行中' ? 'orange' : 'default'">{{ record.task_status }}</a-tag>
            </template>
          </template>
        </a-table>

        <h4 style="margin-bottom: 8px;">将被删除的报工单（{{ undoPreviewData.reports_to_delete?.length || 0 }} 条）<span style="font-size:12px;color:#999;">按工序号降序排列</span></h4>
        <a-table
          v-if="undoPreviewData.reports_to_delete?.length"
          :columns="[
            { title: '报工单号', dataIndex: 'work_report_number', key: 'wr', width: 170 },
            { title: '工序', key: 'step', width: 120 },
            { title: '合格数量', dataIndex: 'qualified_quantity', key: 'q', width: 90 },
            { title: '不合格', dataIndex: 'unqualified_quantity', key: 'u', width: 80 },
            { title: '审批状态', dataIndex: 'approval_status', key: 'as', width: 90 },
            { title: '报工日期', dataIndex: 'creation_date', key: 'cd', width: 110 }
          ]"
          :data-source="undoPreviewData.reports_to_delete"
          :pagination="false"
          size="small"
          row-key="work_report_number"
          style="margin-bottom: 16px;"
        >
          <template #bodyCell="{ record, column }">
            <template v-if="column.key === 'step'">{{ record.step_number }}-{{ record.standard_process_name }}</template>
            <template v-if="column.key === 'as'">
              <a-tag :color="record.approval_status === '草稿' ? 'blue' : 'red'">{{ record.approval_status }}</a-tag>
            </template>
          </template>
        </a-table>
        <a-empty v-else description="没有需要删除的报工单" :image-style="{ height: '30px' }" />

        <div v-if="undoPreviewData.related_inspections?.length" style="margin-top: 8px;">
          <a-alert
            :message="`关联 ${undoPreviewData.related_inspections.length} 条检验记录，需手动处理`"
            type="info"
            show-icon
          />
        </div>
      </template>
      <a-spin v-else :spinning="true" tip="加载中..." />
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, nextTick } from 'vue'
import { message } from 'ant-design-vue'
import { ReloadOutlined, UndoOutlined, ExclamationCircleOutlined } from '@ant-design/icons-vue'
import dayjs from 'dayjs'
import { getTasksByOrder, quickReport, completeOrderReport, getWorkReportsByTask, getSchedules, getTeams, getEmployees, undoPreview, undoExecute } from '@/api/production/workReport'
import { getDefectClasses } from '@/api/quality/defectClass'
import { getDefects } from '@/api/quality/defect'
import { useAuthStore } from '@/store/auth'
import { getFactories } from '@/api/system/factory'

interface TaskWithReport {
  process_task_number: string
  step_number: number
  standard_process_name: string
  standard_process_number: string
  item_number: string
  item_name: string
  specifications: string
  basic_unit: string
  work_center_number: string
  work_center_name: string
  operator: string
  planned_quantity: number
  completed_quantity: number
  remaining_quantity: number
  max_reportable: number
  excess_reporting_ratio: string
  task_status: string
  approval_status: string
  report_count: number
  total_reported_qty: number
  can_report: boolean
  material_gate_status: string
  material_gate_reason: string
  input_qualified_qty: number | null
  input_unqualified_qty: number | null
  input_defect_class_number: string
  input_defect_name: string
  input_operator_number: string
  input_operator_name: string
  input_remark: string
  checked: boolean
  submitting: boolean
  submitted: boolean
  showHistory: boolean
  historyLoading: boolean
  historyRecords: any[]
}

const scanInputRef = ref<any>(null)
const authStore = useAuthStore()
const orderInput = ref('')
const loading = ref(false)
const batchSubmitting = ref(false)
const completing = ref(false)
const orderInfo = ref<any>(null)
const tasks = ref<TaskWithReport[]>([])
const quickQty = ref<number | null>(null)

// ==================== 工厂筛选 ====================
const factoryFilter = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])
const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch (e) { /* ignore */ }
}

// ==================== 撤销重报 ====================
const undoModalVisible = ref(false)
const undoLoading = ref(false)
const undoPreviewData = ref<any>(null)
const undoTargetTask = ref<any>(null)

const handleUndoPreview = async (task: TaskWithReport) => {
  if (!orderInfo.value?.production_order_number) { message.warning('缺少生产单编号'); return }
  undoLoading.value = true
  undoTargetTask.value = task
  try {
    const res: any = await undoPreview({
      production_order_number: orderInfo.value.production_order_number,
      target_step_number: task.step_number
    })
    if (res.success) {
      undoPreviewData.value = res.data
      undoModalVisible.value = true
    } else {
      message.error(res.message || '预览失败')
    }
  } catch (err: any) {
    message.error(err?.response?.data?.message || '预览失败')
  } finally { undoLoading.value = false }
}

const handleUndoConfirm = async () => {
  if (!orderInfo.value?.production_order_number || !undoTargetTask.value) return
  if (!undoPreviewData.value?.can_delete_all) {
    message.warning(undoPreviewData.value?.delete_warning || '无法执行撤销')
    return
  }
  undoLoading.value = true
  try {
    const res: any = await undoExecute({
      production_order_number: orderInfo.value.production_order_number,
      target_step_number: undoTargetTask.value.step_number
    })
    if (res.success) {
      message.success(res.message || `成功删除 ${res.data?.deleted_count || 0} 条报工单，请重新报工`)
      undoModalVisible.value = false
      await refreshTasks()
    } else {
      message.error(res.message || '撤销失败')
    }
  } catch (err: any) {
    message.error(err?.response?.data?.message || '撤销失败')
  } finally { undoLoading.value = false }
}

const commonParams = reactive({
  report_date: dayjs().format('YYYY/MM/DD'),
  schedules_id: '' as string,
  schedules_name: '',
  team_number: '' as string,
  team_name: '',
  operator_number: '' as string,
  operator_name: ''
})

const scheduleList = ref<any[]>([])
const teamList = ref<any[]>([])
const employeeList = ref<any[]>([])
const defectClassList = ref<any[]>([])
const defectAllList = ref<any[]>([])

const reportableTasks = computed(() => tasks.value.filter(t => t.can_report))
const filledTasks = computed(() => reportableTasks.value.filter(t => t.input_qualified_qty && t.input_qualified_qty > 0))
const totalQualifiedQty = computed(() => filledTasks.value.reduce((sum, t) => sum + (t.input_qualified_qty || 0), 0))

const historyColumns = [
  { title: '报工单号', dataIndex: 'work_report_number', width: 150 },
  { title: '合格数量', dataIndex: 'qualified_quantity', width: 80 },
  { title: '不合格', dataIndex: 'unqualified_quantity', width: 70 },
  { title: '报工日期', dataIndex: 'report_date', width: 100 },
  { title: '操作员', dataIndex: 'operator_name', width: 80 },
  { title: '班次', dataIndex: 'schedules_name', width: 80 },
  { title: '审批', dataIndex: 'approval_status', width: 70 },
  { title: '创建时间', dataIndex: 'creation_date', width: 140 }
]

const getStatusColor = (status: string) => {
  const map: Record<string, string> = { '未开始': 'blue', '进行中': 'orange', '已完成': 'green', '已关闭': 'default' }
  return map[status] || 'default'
}

const getProgress = (task: TaskWithReport) => {
  const planned = parseFloat(String(task.planned_quantity)) || 0
  if (planned <= 0) return 0
  const completed = parseFloat(String(task.completed_quantity)) || 0
  return Math.min(Math.round(completed / planned * 100), 100)
}

const getDisableReason = (task: TaskWithReport) => {
  if (task.material_gate_status === 'blocked' && task.material_gate_reason) return task.material_gate_reason
  if (task.approval_status !== '已审批') return `未审批(${task.approval_status})`
  if (task.task_status === '已关闭') return '已关闭'
  if (task.max_reportable <= 0) return '超最大可报量'
  return '不可报工'
}

const filterEmployee = (input: string, option: any) => {
  const label = option.children?.[0]?.children || ''
  return String(label).toLowerCase().includes(input.toLowerCase())
}

const loadDropdowns = async () => {
  try {
    const [schRes, grpRes, empRes, dcRes, dfRes]: any[] = await Promise.all([
      getSchedules(), getTeams(), getEmployees(),
      getDefectClasses({ limit: 9999 }), getDefects({ limit: 9999 })
    ])
    scheduleList.value = schRes?.data?.items || schRes?.data || []
    teamList.value = grpRes?.data?.items || grpRes?.data || []
    employeeList.value = empRes?.data?.items || empRes?.data || []
    defectClassList.value = dcRes?.data?.items || dcRes?.data || []
    defectAllList.value = dfRes?.data?.items || dfRes?.data || []
  } catch (e) {
    console.error('加载下拉数据失败:', e)
  }
}

const onScheduleChange = (val: string) => {
  const sch = scheduleList.value.find((s: any) => s.schedules_id === val)
  commonParams.schedules_name = sch?.schedules_name || ''
}
const onTeamChange = (val: string) => {
  const grp = teamList.value.find((g: any) => g.team_number === val)
  commonParams.team_name = grp?.team_name || ''
}
const onOperatorChange = (val: string) => {
  const emp = employeeList.value.find((e: any) => e.employee_number === val)
  commonParams.operator_name = emp?.employee_name || ''
}
const onTaskOperatorChange = (task: TaskWithReport, val: string) => {
  const emp = employeeList.value.find((e: any) => e.employee_number === val)
  task.input_operator_name = emp?.employee_name || ''
}

const getFilteredDefects = (classNumber: string) => {
  if (!classNumber) return []
  return defectAllList.value.filter((d: any) => d.defect_class_number === classNumber)
}
const onDefectClassChange = (task: TaskWithReport, val: string) => {
  task.input_defect_name = ''
}
const onDefectNameChange = (task: TaskWithReport, val: string) => {
  // val is defect_name, already bound via v-model
}

const handleSearch = async (value: string) => {
  const keyword = (value || orderInput.value || '').trim()
  if (!keyword) { message.warning('请输入生产单编号'); return }
  loading.value = true
  try {
    const res: any = await getTasksByOrder(keyword, factoryFilter.value || undefined)
    const data = res?.data
    if (!data) { message.error('未查询到数据'); return }
    orderInfo.value = data.order
    // 自动带入班次信息（从生产单）
    if (data.order?.schedule_id && !commonParams.schedules_id) {
      commonParams.schedules_id = data.order.schedule_id
      commonParams.schedules_name = data.order.schedule_name || ''
      // 如果下拉列表还没加载完，从列表中再匹配一次
      if (!commonParams.schedules_name) {
        const sch = scheduleList.value.find((s: any) => s.schedules_id === data.order.schedule_id)
        commonParams.schedules_name = sch?.schedules_name || ''
      }
    }
    tasks.value = (data.tasks || []).map((t: any) => ({
      ...t, input_qualified_qty: null, input_unqualified_qty: null, input_defect_class_number: '', input_defect_name: '', input_remark: '',
      input_operator_number: authStore.user?.username || commonParams.operator_number || '',
      input_operator_name: authStore.user?.username || commonParams.operator_name || '',
      submitting: false, submitted: false, checked: false, showHistory: false, historyLoading: false, historyRecords: []
    }))
    if (tasks.value.length > 0) message.success(`已加载 ${tasks.value.length} 道工序，${reportableTasks.value.length} 道可报工`)
  } catch (err: any) {
    message.error(err?.response?.data?.message || '查询失败')
  } finally { loading.value = false }
}

const handleReset = () => {
  orderInput.value = ''; orderInfo.value = null; tasks.value = []; quickQty.value = null; factoryFilter.value = undefined
  nextTick(() => { scanInputRef.value?.focus?.() })
}

const applyQuickQty = () => {
  if (!quickQty.value || quickQty.value <= 0) return
  let applied = 0
  for (let i = 0; i < tasks.value.length; i++) {
    const task = tasks.value[i]
    if (!task.can_report || task.checked === false) continue
    let effectiveMax = task.max_reportable
    // 跨工序限制已移至后端提交时校验，连续报工串行提交时前道完成后后道自然满足
    // 实际班产上限
    const actualDaily = parseFloat(String(orderInfo.value?.actual_daily_output)) || 0
    if (actualDaily > 0) {
      const excessRatio = parseFloat(task.excess_reporting_ratio) || 0
      const dailyLimit = Math.max(actualDaily * (1 + excessRatio / 100) - (task.total_reported_qty || 0), 0)
      effectiveMax = Math.min(effectiveMax, dailyLimit)
    }
    task.input_qualified_qty = Math.min(quickQty.value, effectiveMax)
    applied++
  }
  message.success(`已应用到 ${applied} 道工序`)
}

const validateReport = (task: TaskWithReport, index: number): string | null => {
  const qty = task.input_qualified_qty || 0
  const unqty = task.input_unqualified_qty || 0
  if (qty <= 0) return '合格数量必须大于0'
  if (qty + unqty > task.max_reportable) return `合格数(${qty})+不合格数(${unqty})=${qty + unqty}，超过最大可报数量(${task.max_reportable})`
  if (unqty > 0 && !task.input_defect_class_number) return '有不合格数量时必须选择缺陷分类'
  if (unqty > 0 && !task.input_defect_name) return '有不合格数量时必须选择缺陷名称'
  if (!commonParams.report_date) return '请选择报工日期'
  if (!task.input_operator_number && !commonParams.operator_number) return '请选择操作员'
  // 跨工序验证已移至后端提交接口，连续报工串行提交时前道 completed_quantity 会即时更新
  // 实际班产上限验证：报工汇总数不能大于实际班产*(1+超额报工比例)
  const actualDaily = parseFloat(String(orderInfo.value?.actual_daily_output)) || 0
  if (actualDaily > 0) {
    const excessRatio = parseFloat(task.excess_reporting_ratio) || 0
    const maxByDaily = actualDaily * (1 + excessRatio / 100)
    const totalAfterDaily = (task.total_reported_qty || 0) + qty + unqty
    if (totalAfterDaily > maxByDaily) {
      return `报工总量超限：本次(${qty}+${unqty}) + 已报(${task.total_reported_qty || 0}) = ${totalAfterDaily}，超过实际班产(${actualDaily})×(1+${excessRatio}%) = ${maxByDaily}`
    }
  }
  return null
}

const buildReportData = (task: TaskWithReport) => {
  const classItem = defectClassList.value.find((c: any) => c.defect_class_number === task.input_defect_class_number)
  const defectItem = defectAllList.value.find((d: any) => d.defect_name === task.input_defect_name && d.defect_class_number === task.input_defect_class_number)
  return {
    process_task_number: task.process_task_number,
    qualified_quantity: task.input_qualified_qty,
    unqualified_quantity: task.input_unqualified_qty || 0,
    defect_class_number: task.input_defect_class_number || '',
    defect_class_name: classItem?.defect_class_name || '',
    defect_number: defectItem?.defect_number || '',
    defect_name: task.input_defect_name || '',
    report_date: commonParams.report_date,
    schedules_id: commonParams.schedules_id,
    schedules_name: commonParams.schedules_name,
    team_number: commonParams.team_number,
    team_name: commonParams.team_name,
    operator_number: task.input_operator_number || commonParams.operator_number,
    operator_name: task.input_operator_name || commonParams.operator_name,
    remark: task.input_remark || ''
  }
}

const submitSingleReport = async (task: TaskWithReport, index: number) => {
  const errMsg = validateReport(task, index)
  if (errMsg) { message.warning(`工序${task.step_number}(${task.standard_process_name}): ${errMsg}`); return }
  task.submitting = true
  try {
    await quickReport(buildReportData(task))
    message.success(`工序${task.step_number}(${task.standard_process_name}) 报工成功`)
    task.submitted = true; task.input_qualified_qty = null; task.input_unqualified_qty = null; task.input_defect_class_number = ''; task.input_defect_name = ''
    await refreshTasks()
  } catch (err: any) {
    message.error(`工序${task.step_number}: ${err?.response?.data?.message || '报工失败'}`)
  } finally { task.submitting = false }
}

const submitComplete = async (task: TaskWithReport, index: number) => {
  const errMsg = validateReport(task, index)
  if (errMsg) { message.warning(`工序${task.step_number}(${task.standard_process_name}): ${errMsg}`); return }
  if (!orderInfo.value?.production_order_number) { message.error('缺少生产单编号'); return }
  completing.value = true
  try {
    const classItem = defectClassList.value.find((c: any) => c.defect_class_number === task.input_defect_class_number)
    const defectItem = defectAllList.value.find((d: any) => d.defect_name === task.input_defect_name && d.defect_class_number === task.input_defect_class_number)
    await completeOrderReport({
      production_order_number: orderInfo.value.production_order_number,
      process_task_number: task.process_task_number,
      qualified_quantity: task.input_qualified_qty,
      unqualified_quantity: task.input_unqualified_qty || 0,
      defect_class_number: task.input_defect_class_number || '',
      defect_class_name: classItem?.defect_class_name || '',
      defect_number: defectItem?.defect_number || '',
      defect_name: task.input_defect_name || '',
      report_date: commonParams.report_date,
      schedules_id: commonParams.schedules_id,
      schedules_name: commonParams.schedules_name,
      team_number: commonParams.team_number,
      team_name: commonParams.team_name,
      operator_number: task.input_operator_number || commonParams.operator_number,
      operator_name: task.input_operator_name || commonParams.operator_name,
      remark: task.input_remark || ''
    })
    message.success('生产单已完成，所有工序已标记为完成')
    task.submitted = true; task.input_qualified_qty = null; task.input_unqualified_qty = null; task.input_defect_class_number = ''; task.input_defect_name = ''
    await refreshTasks()
  } catch (err: any) {
    message.error(err?.response?.data?.message || '完成操作失败')
  } finally { completing.value = false }
}

const submitBatchReport = async () => {
  for (const task of filledTasks.value) {
    const globalIndex = tasks.value.findIndex(t => t.process_task_number === task.process_task_number)
    const errMsg = validateReport(task, globalIndex)
    if (errMsg) { message.warning(`工序${task.step_number}(${task.standard_process_name}): ${errMsg}`); return }
  }
  const tasksToSubmit = [...filledTasks.value]
  batchSubmitting.value = true
  let successCount = 0, failCount = 0
  const failMsgs: string[] = []
  for (const task of tasksToSubmit) {
    task.submitting = true
    try {
      await quickReport(buildReportData(task))
      successCount++; task.submitted = true; task.input_qualified_qty = null; task.input_unqualified_qty = null; task.input_defect_class_number = ''; task.input_defect_name = ''
    } catch (err: any) {
      failCount++; failMsgs.push(`工序${task.step_number}: ${err?.response?.data?.message || '未知错误'}`)
    } finally { task.submitting = false }
  }
  batchSubmitting.value = false
  if (failCount === 0) message.success(`全部报工成功！${successCount} 道工序`)
  else { message.warning(`成功 ${successCount} 道，失败 ${failCount} 道`); failMsgs.forEach(msg => message.error(msg)) }
  await refreshTasks()
}

const refreshTasks = async () => {
  if (!orderInput.value.trim()) return
  try {
    const res: any = await getTasksByOrder(orderInput.value.trim(), factoryFilter.value || undefined)
    const data = res?.data
    if (!data) return
    orderInfo.value = data.order
    const newTasks = (data.tasks || []) as any[]
    tasks.value = newTasks.map((t: any) => {
      const existing = tasks.value.find(et => et.process_task_number === t.process_task_number)
      return {
        ...t,
        input_qualified_qty: existing?.submitted ? null : (existing?.input_qualified_qty ?? null),
        input_unqualified_qty: existing?.submitted ? null : (existing?.input_unqualified_qty ?? null),
        input_defect_class_number: existing?.submitted ? '' : (existing?.input_defect_class_number || ''),
        input_defect_name: existing?.submitted ? '' : (existing?.input_defect_name || ''),
        input_operator_number: existing?.submitted ? (authStore.user?.username || '') : (existing?.input_operator_number || authStore.user?.username || ''),
        input_operator_name: existing?.submitted ? (authStore.user?.username || '') : (existing?.input_operator_name || authStore.user?.username || ''),
        input_remark: existing?.input_remark || '',
        submitting: false, submitted: false,
        checked: existing?.checked ?? false,
        showHistory: existing?.showHistory || false, historyLoading: false, historyRecords: existing?.historyRecords || []
      }
    })
  } catch (e) { /* silent */ }
}

const toggleHistory = async (task: TaskWithReport) => {
  if (task.showHistory) { task.showHistory = false; return }
  task.historyLoading = true
  try {
    const res: any = await getWorkReportsByTask(task.process_task_number)
    task.historyRecords = res?.data?.items || []
    task.showHistory = true
  } catch (e) { message.error('加载历史报工记录失败') }
  finally { task.historyLoading = false }
}

onMounted(() => {
  loadDropdowns()
  loadFactories()
  nextTick(() => { scanInputRef.value?.focus?.() })
})
</script>

<style scoped>
.continuous-report-page {
  padding: 0 0 52px 0;
}
.top-card { margin-bottom: 6px; }
.top-card :deep(.ant-card-body) { padding: 8px 12px; }
.params-card { margin-bottom: 6px; }
.params-card :deep(.ant-card-body) { padding: 6px 12px; }

.info-item { font-size: 13px; color: #333; }
.compact-label { font-size: 12px; color: #888; }
.compact-tag { font-size: 11px; padding: 0 4px; line-height: 18px; }

/* === 工序行 === */
.task-list { display: flex; flex-direction: column; gap: 6px; }

.task-row {
  background: #fff;
  border-radius: 6px;
  padding: 10px 14px;
  transition: box-shadow 0.15s;
}
.task-row:hover { box-shadow: 0 1px 6px rgba(0,0,0,0.08); }
.task-row--completed { background: #f6ffed; }
.task-row--disabled { opacity: 0.7; }

/* 上行：信息+进度 */
.task-line1 {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}

/* 下行：输入/操作 */
.task-line2 {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-left: 34px;
  flex-wrap: wrap;
}

.input-label { font-size: 12px; color: #888; }

.step-badge {
  display: inline-flex; align-items: center; justify-content: center;
  width: 26px; height: 26px; border-radius: 50%;
  background: #1890ff; color: #fff; font-weight: 700; font-size: 12px; flex-shrink: 0;
}
.step-badge--done { background: #52c41a; }
.step-badge--off { background: #d9d9d9; }

.process-name { font-size: 14px; font-weight: 600; }
.wc-text { font-size: 11px; color: #aaa; margin-left: 2px; }

.task-nums {
  display: flex; align-items: center; gap: 12px; font-size: 12px; margin-left: auto; flex-shrink: 0;
}
.num-group { display: flex; flex-direction: column; align-items: center; line-height: 1.3; }
.num-label { font-size: 10px; color: #999; }
.num-val { font-size: 14px; font-weight: 600; }
.progress-text { font-size: 11px; color: #999; min-width: 32px; }

.task-history-row {
  margin-top: 6px; padding: 4px 0 0 34px;
  max-height: 200px; overflow-y: auto;
}

/* === 底部栏 === */
.bottom-bar {
  position: fixed; bottom: 0; left: 0; right: 0;
  background: #fff; border-top: 1px solid #f0f0f0;
  box-shadow: 0 -1px 4px rgba(0,0,0,0.05);
  z-index: 100; padding: 6px 16px;
}
.bottom-bar-content {
  max-width: 1400px; margin: 0 auto;
  display: flex; justify-content: space-between; align-items: center;
}
.bottom-info { font-size: 13px; color: #666; }
.bottom-info b { font-size: 14px; }
</style>
