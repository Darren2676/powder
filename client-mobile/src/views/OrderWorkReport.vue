<template>
  <div class="page-container">
    <van-nav-bar
      title="按工序报工"
      left-arrow
      @click-left="router.back()"
      fixed
      placeholder
    />

    <!-- 加载中 -->
    <div v-if="pageLoading" style="padding: 40px 0;">
      <van-loading type="spinner" vertical>加载中...</van-loading>
    </div>

    <template v-else>
      <!-- 无工序任务 -->
      <div v-if="tasks.length === 0" class="card" style="margin: 16px; padding: 20px; text-align: center;">
        <div v-if="orderInfo">
          <div class="order-brief">
            <div class="order-brief__number">{{ orderNo }}</div>
            <div class="order-brief__product">{{ orderInfo.item_name }} {{ orderInfo.specifications || '' }}</div>
          </div>
        </div>
        <p style="color: var(--text-secondary); margin: 16px 0;">该生产单尚无工序任务，请先进行工序拆解</p>
      </div>

      <!-- 有工序任务 -->
      <template v-if="tasks.length > 0">
        <!-- 生产单信息 -->
        <div class="card info-card">
          <div class="info-card__header">
            <span class="info-card__number">{{ orderNo }}</span>
            <span :class="['status-tag', orderStatusClass]">{{ orderInfo?.plan_status }}</span>
          </div>
          <div class="info-card__grid">
            <div class="info-row">
              <span class="info-row__label">产品</span>
              <span class="info-row__value">{{ orderInfo?.item_name || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-row__label">规格</span>
              <span class="info-row__value">{{ orderInfo?.specifications || '-' }}</span>
            </div>
            <div class="info-row">
              <span class="info-row__label">计划数量</span>
              <span class="info-row__value num-highlight">{{ formatNum(orderInfo?.planned_quantity) }}</span>
            </div>
            <div class="info-row">
              <span class="info-row__label">报工进度</span>
              <span class="info-row__value num-highlight">{{ completedTaskCount }}/{{ tasks.length }}</span>
            </div>
          </div>
        </div>

        <!-- 工序步骤条 -->
        <div class="steps-wrapper">
          <van-steps :active="activeStepIndex" finish-icon="success" active-icon="circle" @click-step="onClickStep">
            <van-step v-for="(task, idx) in tasks" :key="task.process_task_number">
              <template #default>
                <div class="step-label" @click="onClickStep(idx)">
                  <span class="step-label__name">{{ task.standard_process_name || '工序' + task.step_number }}</span>
                  <span v-if="task.task_status === '已完成'" class="step-label__tag step-label__tag--done">已完成</span>
                  <span v-else-if="task.material_gate_status === 'blocked'" class="step-label__tag step-label__tag--blocked">受阻</span>
                  <span v-else-if="task.task_status === '进行中'" class="step-label__tag step-label__tag--progress">进行中</span>
                  <span v-else class="step-label__tag step-label__tag--pending">未开始</span>
                </div>
              </template>
            </van-step>
          </van-steps>
        </div>

        <!-- 当前工序详情 -->
        <div v-if="currentTask" class="current-task-section">
          <div class="section-title">
            <span>工序{{ currentTask.step_number }}: {{ currentTask.standard_process_name || '' }}</span>
            <span class="section-title__wc">{{ currentTask.work_center_name || '' }}</span>
          </div>

          <div class="task-detail card">
            <!-- 进度 -->
            <div class="task-detail__progress">
              <van-progress
                :percentage="taskPercent"
                :stroke-width="8"
                :color="currentTask.task_status === '已完成' ? 'var(--success, #07c160)' : 'var(--primary, #1989fa)'"
                :show-pivot="false"
              />
              <div class="progress-info">
                <span>已完成: <b>{{ formatNum(currentTask.completed_quantity) }}</b></span>
                <span>计划: <b>{{ formatNum(currentTask.planned_quantity) }}</b></span>
                <span>可报: <b :style="{ color: currentTask.max_reportable > 0 ? 'var(--primary)' : 'var(--text-muted)' }">{{ formatNum(currentTask.max_reportable) }}</b></span>
              </div>
            </div>

            <!-- 详细信息 -->
            <div class="task-detail__info">
              <div class="detail-row">
                <span class="detail-label">任务编号</span>
                <span class="detail-value">{{ currentTask.process_task_number }}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">报工次数</span>
                <span class="detail-value">{{ currentTask.report_count }}次</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">任务状态</span>
                <span :class="['detail-value', taskStatusColor]">{{ currentTask.task_status }}</span>
              </div>
            </div>

            <!-- 物料门控警告 -->
            <div v-if="currentTask.material_gate_status === 'blocked'" class="gate-warning">
              <van-icon name="warning-o" />
              <span>{{ currentTask.material_gate_reason }}</span>
            </div>
          </div>

          <!-- 底部操作栏 -->
          <div class="bottom-action" v-if="currentTask.can_report">
            <van-button
              type="primary"
              block
              round
              @click="openReportPopup"
            >报工</van-button>
          </div>

          <!-- 已完成 -->
          <div v-if="currentTask.task_status === '已完成'" class="card done-card">
            <span class="done-card__icon">&#10003;</span>
            <span>该工序已报工完成</span>
          </div>
        </div>

        <!-- 全部完成 -->
        <div v-if="allCompleted" class="card complete-card">
          <div class="complete-card__icon">&#127881;</div>
          <div class="complete-card__text">所有工序报工已完成</div>
          <div class="complete-card__actions">
            <van-button size="small" plain round @click="router.back()">返回</van-button>
          </div>
        </div>
      </template>
    </template>

    <!-- 报工弹出层 -->
    <van-popup
      v-model:show="reportPopupVisible"
      position="bottom"
      round
      :style="{ height: '80%' }"
      closeable
      :close-on-click-overlay="false"
    >
      <div class="report-popup">
        <div class="report-popup__header">
          <div class="report-popup__title">
            工序{{ currentTask?.step_number }} 报工 - {{ currentTask?.standard_process_name || '' }}
          </div>
          <div class="report-popup__hint">
            可报数量: <b>{{ formatNum(currentTask?.max_reportable) }}</b>
          </div>
        </div>

        <div class="report-popup__body">
          <van-cell-group inset>
            <van-field
              v-model="form.qualified_quantity"
              type="digit"
              label="合格数量"
              placeholder="输入合格数量"
              required
              input-align="right"
            />
            <van-field
              v-model="form.unqualified_quantity"
              type="digit"
              label="不合格数量"
              placeholder="0"
              input-align="right"
            />
            <van-field
              v-if="hasUnqualified"
              v-model="form.defect_class_name"
              label="缺陷分类"
              placeholder="请选择缺陷分类"
              readonly
              is-link
              required
              input-align="right"
              @click="showDefectClassPicker = true"
            />
            <van-field
              v-if="hasUnqualified"
              v-model="form.defect_name"
              label="缺陷名称"
              placeholder="请选择缺陷名称"
              readonly
              is-link
              required
              input-align="right"
              @click="openDefectPicker"
            />
            <van-field
              v-model="form.report_date"
              label="报工日期"
              placeholder="选择日期"
              readonly
              is-link
              input-align="right"
              @click="showDatePicker = true"
            />
            <van-field
              v-model="form.schedules_name"
              label="班次"
              placeholder="选择班次"
              readonly
              is-link
              input-align="right"
              @click="showSchedulePicker = true"
            />
            <van-field
              v-model="form.operator_name"
              label="操作员"
              placeholder="选择操作员"
              readonly
              is-link
              input-align="right"
              @click="showEmployeePicker = true"
            />
          </van-cell-group>

          <!-- 更多信息 -->
          <van-collapse v-model="moreInfoOpen">
            <van-collapse-item title="更多信息" name="more">
              <van-cell-group inset>
                <van-field
                  v-model="form.unqualified_reason"
                  label="不合格原因"
                  placeholder="输入原因"
                  type="textarea"
                  rows="2"
                  autosize
                />
                <van-field
                  v-model="form.remark"
                  label="备注"
                  placeholder="输入备注"
                  type="textarea"
                  rows="2"
                  autosize
                />
              </van-cell-group>
            </van-collapse-item>
          </van-collapse>
        </div>

        <div class="report-popup__footer">
          <van-button
            type="primary"
            block
            round
            :loading="submitting"
            :disabled="!canSubmit"
            @click="handleSubmitReport"
          >确认报工</van-button>
        </div>
      </div>
    </van-popup>

    <!-- 日期选择器 -->
    <van-popup v-model:show="showDatePicker" position="bottom" round>
      <van-date-picker
        v-model="datePickerValue"
        title="选择报工日期"
        :min-date="new Date(2024, 0, 1)"
        :max-date="new Date(2030, 11, 31)"
        @confirm="onDateConfirm"
        @cancel="showDatePicker = false"
      />
    </van-popup>

    <!-- 班次选择器 -->
    <van-popup v-model:show="showSchedulePicker" position="bottom" round>
      <van-picker
        title="选择班次"
        :columns="scheduleColumns"
        @confirm="onScheduleConfirm"
        @cancel="showSchedulePicker = false"
      />
    </van-popup>

    <!-- 操作员选择器 -->
    <van-popup v-model:show="showEmployeePicker" position="bottom" round>
      <van-picker
        title="选择操作员"
        :columns="employeeColumns"
        @confirm="onEmployeeConfirm"
        @cancel="showEmployeePicker = false"
      />
    </van-popup>

    <!-- 缺陷分类选择器 -->
    <van-popup v-model:show="showDefectClassPicker" position="bottom" round>
      <van-picker
        title="选择缺陷分类"
        :columns="defectClassColumns"
        @confirm="onDefectClassConfirm"
        @cancel="showDefectClassPicker = false"
      />
    </van-popup>

    <!-- 缺陷名称选择器 -->
    <van-popup v-model:show="showDefectPicker" position="bottom" round>
      <van-picker
        title="选择缺陷名称"
        :columns="filteredDefectColumns"
        @confirm="onDefectConfirm"
        @cancel="showDefectPicker = false"
      />
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showDialog } from 'vant'
import dayjs from 'dayjs'
import { getTasksByOrder } from '@/api/processTask'
import { createWorkReport, getSchedules, getEmployees, getDefectClasses, getDefects } from '@/api/workReport'

const route = useRoute()
const router = useRouter()
const orderNo = decodeURIComponent(route.params.orderNo as string)

const pageLoading = ref(true)
const submitting = ref(false)
const viewStepIndex = ref(0)
const reportPopupVisible = ref(false)

const orderInfo = ref<any>(null)
const tasks = ref<any[]>([])

// 下拉选项
const scheduleColumns = ref<any[]>([])
const employeeColumns = ref<any[]>([])
const schedulesRaw = ref<any[]>([])
const employeesRaw = ref<any[]>([])

// 缺陷数据
const defectClassList = ref<any[]>([])
const defectAllList = ref<any[]>([])
const defectClassColumns = ref<any[]>([])
const filteredDefectColumns = ref<any[]>([])

// Picker 显示状态
const showDatePicker = ref(false)
const showSchedulePicker = ref(false)
const showEmployeePicker = ref(false)
const showDefectClassPicker = ref(false)
const showDefectPicker = ref(false)
const moreInfoOpen = ref<string[]>([])

const today = dayjs()
const datePickerValue = ref([
  String(today.year()),
  String(today.month() + 1).padStart(2, '0'),
  String(today.date()).padStart(2, '0')
])

const form = reactive({
  qualified_quantity: '',
  unqualified_quantity: '',
  report_date: today.format('YYYY-MM-DD'),
  schedules_id: '',
  schedules_name: '',
  group_number: '',
  group_name: '',
  operator_number: '',
  operator_name: '',
  defect_class_number: '',
  defect_class_name: '',
  defect_number: '',
  defect_name: '',
  unqualified_reason: '',
  remark: ''
})

// 计算属性
const activeStepIndex = computed(() => {
  const idx = tasks.value.findIndex(t => t.can_report)
  return idx >= 0 ? idx : tasks.value.findIndex(t => t.task_status !== '已完成')
})

const completedTaskCount = computed(() => {
  return tasks.value.filter(t => t.task_status === '已完成').length
})

const currentTask = computed(() => {
  return tasks.value[viewStepIndex.value] || null
})

const taskPercent = computed(() => {
  if (!currentTask.value) return 0
  const planned = parseFloat(currentTask.value.planned_quantity) || 1
  const completed = parseFloat(currentTask.value.completed_quantity) || 0
  return Math.min(Math.round((completed / planned) * 100), 100)
})

const allCompleted = computed(() => {
  return tasks.value.length > 0 && tasks.value.every(t => t.task_status === '已完成')
})

const canSubmit = computed(() => {
  const qty = parseInt(form.qualified_quantity) || 0
  return qty > 0 && form.report_date
})

const hasUnqualified = computed(() => {
  return (parseInt(form.unqualified_quantity) || 0) > 0
})

const orderStatusClass = computed(() => {
  const m: Record<string, string> = {
    '已派发': 'status-tag--primary',
    '已备料': 'status-tag--success',
    '生产中': 'status-tag--warning',
    '已完成': 'status-tag--success'
  }
  return m[orderInfo.value?.plan_status] || 'status-tag--default'
})

const taskStatusColor = computed(() => {
  if (!currentTask.value) return ''
  const m: Record<string, string> = {
    '已完成': 'text-success',
    '进行中': 'text-primary',
    '未开始': 'text-muted'
  }
  return m[currentTask.value.task_status] || ''
})

const formatNum = (n: any) => {
  if (n == null) return '0'
  const num = parseFloat(n)
  return isNaN(num) ? '0' : Number(num.toFixed(4)).toString()
}

const onClickStep = (idx: number) => {
  viewStepIndex.value = idx
}

// 加载工序任务
const loadOrderTasks = async () => {
  try {
    const res: any = await getTasksByOrder(orderNo)
    if (res.success) {
      orderInfo.value = res.data.order
      tasks.value = res.data.tasks || []
      // 初始定位到第一个可报工的工序
      const firstCanReport = tasks.value.findIndex(t => t.can_report)
      if (firstCanReport >= 0) {
        viewStepIndex.value = firstCanReport
      } else {
        const firstNotDone = tasks.value.findIndex(t => t.task_status !== '已完成')
        viewStepIndex.value = firstNotDone >= 0 ? firstNotDone : 0
      }
    } else {
      showToast({ message: res.message || '加载失败', type: 'fail' })
    }
  } catch (e) {
    console.error('Failed to load order tasks:', e)
    showToast({ message: '加载失败', type: 'fail' })
  }
}

// 加载下拉选项
const loadOptions = async () => {
  try {
    const [schRes, empRes, dcRes, dfRes]: any[] = await Promise.all([
      getSchedules(), getEmployees(), getDefectClasses(), getDefects()
    ])

    if (schRes.success || schRes.data) {
      const items = schRes.data?.items || schRes.data || []
      schedulesRaw.value = items
      scheduleColumns.value = items.map((s: any) => ({
        text: s.schedules_name || s.name || '',
        value: s.schedules_id || s.id || ''
      }))
    }

    if (empRes.success || empRes.data) {
      const items = empRes.data?.items || empRes.data || []
      employeesRaw.value = items
      employeeColumns.value = items.map((e: any) => ({
        text: `${e.employee_name || e.real_name || ''} ${e.department_name ? '(' + e.department_name + ')' : ''}`.trim(),
        value: e.employee_number || e.username || ''
      }))
    }

    if (dcRes.success || dcRes.data) {
      const items = dcRes.data?.items || dcRes.data || []
      defectClassList.value = items
      defectClassColumns.value = items.map((c: any) => ({
        text: c.defect_class_name || c.defect_class_number,
        value: c.defect_class_number
      }))
    }

    if (dfRes.success || dfRes.data) {
      defectAllList.value = dfRes.data?.items || dfRes.data || []
    }
  } catch (e) {
    console.error('Failed to load options:', e)
  }
}

// 打开报工弹层
const openReportPopup = () => {
  form.qualified_quantity = ''
  form.unqualified_quantity = ''
  form.report_date = dayjs().format('YYYY-MM-DD')
  form.defect_class_number = ''
  form.defect_class_name = ''
  form.defect_number = ''
  form.defect_name = ''
  form.unqualified_reason = ''
  form.remark = ''
  reportPopupVisible.value = true
}

// Picker 确认回调
const onDateConfirm = ({ selectedValues }: any) => {
  form.report_date = selectedValues.join('-')
  showDatePicker.value = false
}

const onScheduleConfirm = ({ selectedOptions }: any) => {
  const opt = selectedOptions[0]
  if (opt) {
    form.schedules_id = opt.value
    form.schedules_name = opt.text
    // 尝试匹配班组
    const raw = schedulesRaw.value.find((s: any) => (s.schedules_id || s.id) === opt.value)
    if (raw) {
      form.group_number = raw.group_number || ''
      form.group_name = raw.group_name || ''
    }
  }
  showSchedulePicker.value = false
}

const onEmployeeConfirm = ({ selectedOptions }: any) => {
  const opt = selectedOptions[0]
  if (opt) {
    form.operator_number = opt.value
    form.operator_name = opt.text.replace(/\s*\(.*\)$/, '') // 去掉部门后缀
  }
  showEmployeePicker.value = false
}

const onDefectClassConfirm = ({ selectedOptions }: any) => {
  const opt = selectedOptions[0]
  if (opt) {
    form.defect_class_number = opt.value
    form.defect_class_name = opt.text
    // 切换分类时清空缺陷名称
    form.defect_number = ''
    form.defect_name = ''
    // 更新缺陷名称下拉数据
    filteredDefectColumns.value = defectAllList.value
      .filter((d: any) => d.defect_class_number === opt.value)
      .map((d: any) => ({ text: d.defect_name, value: d.defect_number }))
  }
  showDefectClassPicker.value = false
}

const onDefectConfirm = ({ selectedOptions }: any) => {
  const opt = selectedOptions[0]
  if (opt) {
    form.defect_number = opt.value
    form.defect_name = opt.text
  }
  showDefectPicker.value = false
}

const openDefectPicker = () => {
  if (!form.defect_class_number) {
    showToast({ message: '请先选择缺陷分类', type: 'fail' })
    return
  }
  filteredDefectColumns.value = defectAllList.value
    .filter((d: any) => d.defect_class_number === form.defect_class_number)
    .map((d: any) => ({ text: d.defect_name, value: d.defect_number }))
  showDefectPicker.value = true
}

// 提交报工
const handleSubmitReport = async () => {
  const task = currentTask.value
  if (!task) return

  const qty = parseInt(form.qualified_quantity) || 0
  const unqty = parseInt(form.unqualified_quantity) || 0

  if (qty <= 0) {
    showToast({ message: '合格数量必须大于0', type: 'fail' })
    return
  }

  const maxReport = parseFloat(task.max_reportable) || 0
  if (qty > maxReport) {
    showToast({ message: `合格数量不能超过可报数量 ${formatNum(maxReport)}`, type: 'fail' })
    return
  }

  if (unqty > 0 && !form.defect_class_number) {
    showToast({ message: '有不合格数量时必须选择缺陷分类', type: 'fail' })
    return
  }
  if (unqty > 0 && !form.defect_name) {
    showToast({ message: '有不合格数量时必须选择缺陷名称', type: 'fail' })
    return
  }

  try {
    await showDialog({
      title: '确认报工',
      message: `工序${task.step_number} ${task.standard_process_name || ''}\n合格: ${qty}  不合格: ${unqty}`,
      confirmButtonText: '确认'
    })
  } catch {
    return
  }

  submitting.value = true
  try {
    const reportData = {
      process_task_number: task.process_task_number,
      production_order_number: orderNo,
      step_number: task.step_number || 0,
      standard_process_name: task.standard_process_name || '',
      item_number: task.item_number || orderInfo.value?.item_number || '',
      item_name: task.item_name || orderInfo.value?.item_name || '',
      specifications: task.specifications || orderInfo.value?.specifications || '',
      basic_unit: task.basic_unit || orderInfo.value?.basic_unit || '',
      work_center_number: task.work_center_number || '',
      work_center_name: task.work_center_name || '',
      planned_quantity: task.planned_quantity || 0,
      qualified_quantity: qty,
      unqualified_quantity: unqty,
      total_quantity: qty + unqty,
      cumulative_quantity: (parseFloat(task.completed_quantity) || 0) + qty,
      report_date: form.report_date,
      schedules_id: form.schedules_id,
      schedules_name: form.schedules_name,
      group_number: form.group_number,
      group_name: form.group_name,
      operator_number: form.operator_number,
      operator_name: form.operator_name,
      defect_class_number: form.defect_class_number,
      defect_class_name: form.defect_class_name,
      defect_number: form.defect_number,
      defect_name: form.defect_name,
      unqualified_reason: form.defect_name
        ? ((form.defect_class_name || '') + '/' + form.defect_name)
        : (form.unqualified_reason || ''),
      remark: form.remark
    }

    const res: any = await createWorkReport(reportData)
    const reportNumber = res?.data?.work_report_number || ''
    showToast({ message: `报工成功${reportNumber ? '，单号: ' + reportNumber : ''}`, type: 'success' })
    reportPopupVisible.value = false

    // 重新加载并自动推进
    await loadOrderTasks()
  } catch (e: any) {
    const msg = e?.response?.data?.message || '报工失败'
    showToast({ message: msg, type: 'fail' })
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  pageLoading.value = true
  await Promise.all([loadOrderTasks(), loadOptions()])
  pageLoading.value = false
})
</script>

<style scoped>
.page-container {
  padding-bottom: 80px;
  background: var(--bg-page);
  min-height: 100vh;
}

.order-brief {
  text-align: center;
  margin-bottom: 8px;
}

.order-brief__number {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.order-brief__product {
  font-size: 14px;
  color: var(--text-secondary);
  margin-top: 4px;
}

/* 信息卡片 */
.info-card {
  margin: 12px 16px;
  padding: 14px 16px;
}

.info-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.info-card__number {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.info-card__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
}

.info-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.info-row__label {
  font-size: 12px;
  color: var(--text-muted);
}

.info-row__value {
  font-size: 13px;
  color: var(--text-primary);
}

/* 步骤条 */
.steps-wrapper {
  margin: 0 16px 12px;
  padding: 12px;
  background: var(--bg-card);
  border-radius: 8px;
  overflow-x: auto;
}

.steps-wrapper :deep(.van-steps) {
  padding: 0;
}

.step-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  cursor: pointer;
  min-width: 60px;
}

.step-label__name {
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
}

.step-label__tag {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  white-space: nowrap;
}

.step-label__tag--done {
  background: var(--success-light, #e8f5e9);
  color: var(--success);
}

.step-label__tag--progress {
  background: #e6f7ff;
  color: var(--primary);
}

.step-label__tag--pending {
  background: #f5f5f5;
  color: var(--text-muted);
}

.step-label__tag--blocked {
  background: #fff1f0;
  color: var(--danger, #ee0a24);
}

/* 当前工序 */
.current-task-section {
  padding: 0 16px;
}

.section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  padding: 8px 0;
}

.section-title__wc {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-muted);
}

/* 任务详情 */
.task-detail {
  padding: 14px 16px;
}

.task-detail__progress {
  margin-bottom: 12px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  margin-top: 6px;
  font-size: 12px;
  color: var(--text-secondary);
}

.progress-info b {
  font-weight: 600;
}

.task-detail__info {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.detail-label {
  font-size: 13px;
  color: var(--text-muted);
}

.detail-value {
  font-size: 13px;
  color: var(--text-primary);
}

.text-success { color: var(--success, #07c160) !important; }
.text-primary { color: var(--primary, #1989fa) !important; }
.text-muted { color: var(--text-muted) !important; }

/* 物料门控警告 */
.gate-warning {
  margin-top: 12px;
  padding: 10px 12px;
  background: #fff7e6;
  border-radius: 6px;
  font-size: 13px;
  color: #fa8c16;
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.gate-warning .van-icon {
  flex-shrink: 0;
  margin-top: 1px;
}

/* 底部操作栏 */
.bottom-action {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 10px 16px;
  padding-bottom: calc(10px + env(safe-area-inset-bottom));
  background: var(--bg-card);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
  z-index: 100;
}

/* 已完成 */
.done-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  font-size: 14px;
  color: var(--success);
}

.done-card__icon {
  font-size: 18px;
  font-weight: 700;
}

.complete-card {
  margin: 16px;
  padding: 24px 16px;
  text-align: center;
}

.complete-card__icon {
  font-size: 40px;
  display: block;
  margin-bottom: 8px;
}

.complete-card__text {
  font-size: 16px;
  font-weight: 600;
  color: var(--success);
  margin-bottom: 16px;
}

.complete-card__actions {
  display: flex;
  justify-content: center;
  gap: 12px;
}

/* ===== 报工弹出层 ===== */
.report-popup {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.report-popup__header {
  padding: 16px 16px 8px;
  flex-shrink: 0;
}

.report-popup__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.report-popup__hint {
  font-size: 13px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.report-popup__hint b {
  color: var(--primary, #1989fa);
}

.report-popup__body {
  flex: 1;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.report-popup__footer {
  flex-shrink: 0;
  padding: 12px 16px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  background: var(--bg-card);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
}
</style>
