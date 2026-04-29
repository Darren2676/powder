<template>
  <div class="page-container">
    <van-nav-bar
      title="快速报工"
      left-arrow
      @click-left="router.back()"
      fixed
      placeholder
    />

    <div v-if="loadingTask" style="padding: 40px 0;">
      <van-loading type="spinner" vertical>加载任务信息...</van-loading>
    </div>

    <template v-else-if="task">
      <!-- 任务信息卡片 -->
      <div class="card task-info">
        <div class="task-info__header">
          <span class="task-info__number">{{ task.process_task_number }}</span>
          <span :class="['status-tag', statusClass(task.task_status)]">{{ task.task_status }}</span>
        </div>
        <div class="task-info__grid">
          <div class="info-row">
            <span class="info-row__label">产品</span>
            <span class="info-row__value">{{ task.item_name || '-' }}</span>
          </div>
          <div class="info-row">
            <span class="info-row__label">工序</span>
            <span class="info-row__value">{{ task.step_number ? '第' + task.step_number + '道 ' : '' }}{{ task.standard_process_name || '-' }}</span>
          </div>
          <div class="info-row">
            <span class="info-row__label">工作中心</span>
            <span class="info-row__value">{{ task.work_center_name || task.work_center_number || '-' }}</span>
          </div>
          <div class="info-row">
            <span class="info-row__label">生产单</span>
            <span class="info-row__value">{{ task.production_order_number || '-' }}</span>
          </div>
        </div>

        <!-- 进度 -->
        <div class="task-progress">
          <div class="progress-header">
            <span>完工进度</span>
            <span class="num-highlight">{{ progressPercent }}%</span>
          </div>
          <div class="progress-bar" style="height: 8px;">
            <div
              :class="['progress-bar__inner', progressPercent >= 100 ? 'progress-bar__inner--success' : '']"
              :style="{ width: Math.min(progressPercent, 100) + '%' }"
            ></div>
          </div>
          <div class="progress-footer">
            <span>计划: {{ formatNum(task.planned_quantity) }}</span>
            <span>已完成: {{ formatNum(task.completed_quantity) }}</span>
            <span style="color: var(--primary); font-weight: 600;">剩余可报: {{ formatNum(maxReportable) }}</span>
          </div>
        </div>
      </div>

      <!-- 报工表单 -->
      <div class="card form-card">
        <van-cell-group>
          <van-field
            v-model="form.qualified_quantity"
            type="digit"
            label="合格数量"
            placeholder="请输入合格数量"
            required
            :rules="[{ required: true, message: '请输入合格数量' }]"
            input-align="right"
          >
            <template #extra>
              <span class="unit-text">{{ task.basic_unit || '个' }}</span>
            </template>
          </van-field>

          <van-field
            v-model="form.unqualified_quantity"
            type="digit"
            label="不合格数量"
            placeholder="0"
            input-align="right"
          >
            <template #extra>
              <span class="unit-text">{{ task.basic_unit || '个' }}</span>
            </template>
          </van-field>

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
            is-link
            readonly
            label="报工日期"
            placeholder="选择日期"
            input-align="right"
            @click="showDatePicker = true"
          />

          <van-field
            v-model="form.schedules_name"
            is-link
            readonly
            label="班次"
            placeholder="选择班次"
            input-align="right"
            @click="showSchedulePicker = true"
          />

          <van-field
            v-model="form.operator_name"
            is-link
            readonly
            label="操作员"
            placeholder="选择操作员"
            input-align="right"
            @click="showEmployeePicker = true"
          />
        </van-cell-group>

        <!-- 折叠区域 -->
        <van-collapse v-model="activeCollapse">
          <van-collapse-item title="更多信息（选填）" name="extra">
            <van-cell-group :border="false">
              <van-field v-model="form.unqualified_reason" label="不合格原因" type="textarea" rows="2" placeholder="如有不合格品请填写原因" autosize />
              <van-field v-model="form.actual_start_time" label="开始时间" placeholder="选填" input-align="right" />
              <van-field v-model="form.actual_end_time" label="结束时间" placeholder="选填" input-align="right" />
              <van-field v-model="form.remark" label="备注" type="textarea" rows="2" placeholder="选填" autosize />
            </van-cell-group>
          </van-collapse-item>
        </van-collapse>
      </div>

      <!-- 提交按钮 -->
      <div class="submit-area">
        <van-button
          type="primary"
          block
          round
          size="large"
          :loading="submitting"
          loading-text="提交中..."
          @click="handleSubmit"
        >
          📝 确认报工
        </van-button>
      </div>
    </template>

    <!-- 日期选择 -->
    <van-popup v-model:show="showDatePicker" position="bottom" round>
      <van-date-picker
        v-model="datePickerValue"
        title="选择日期"
        :min-date="minDate"
        :max-date="maxDate"
        @confirm="onDateConfirm"
        @cancel="showDatePicker = false"
      />
    </van-popup>

    <!-- 班次选择 -->
    <van-popup v-model:show="showSchedulePicker" position="bottom" round>
      <van-picker
        :columns="scheduleColumns"
        @confirm="onScheduleConfirm"
        @cancel="showSchedulePicker = false"
      />
    </van-popup>

    <!-- 操作员选择 -->
    <van-popup v-model:show="showEmployeePicker" position="bottom" round>
      <van-picker
        :columns="employeeColumns"
        @confirm="onEmployeeConfirm"
        @cancel="showEmployeePicker = false"
      />
    </van-popup>

    <!-- 缺陷分类选择 -->
    <van-popup v-model:show="showDefectClassPicker" position="bottom" round>
      <van-picker
        title="选择缺陷分类"
        :columns="defectClassColumns"
        @confirm="onDefectClassConfirm"
        @cancel="showDefectClassPicker = false"
      />
    </van-popup>

    <!-- 缺陷名称选择 -->
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
import { ref, computed, onMounted, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast, showDialog } from 'vant'
import { getProcessTasks } from '@/api/processTask'
import { createWorkReport, getSchedules, getGroups, getEmployees, getDefectClasses, getDefects } from '@/api/workReport'
import dayjs from 'dayjs'

const route = useRoute()
const router = useRouter()
const taskNumber = decodeURIComponent(route.params.taskId as string)

const loadingTask = ref(true)
const submitting = ref(false)
const task = ref<any>(null)

const showDatePicker = ref(false)
const showSchedulePicker = ref(false)
const showEmployeePicker = ref(false)
const showDefectClassPicker = ref(false)
const showDefectPicker = ref(false)
const activeCollapse = ref<string[]>([])

const today = dayjs()
const datePickerValue = ref([today.format('YYYY'), today.format('MM'), today.format('DD')])
const minDate = new Date(2024, 0, 1)
const maxDate = new Date(2030, 11, 31)

const scheduleColumns = ref<any[]>([])
const employeeColumns = ref<any[]>([])
const scheduleMap = ref<Record<string, any>>({})
const employeeMap = ref<Record<string, any>>({})

// 缺陷数据
const defectClassList = ref<any[]>([])
const defectAllList = ref<any[]>([])
const defectClassColumns = ref<any[]>([])
const filteredDefectColumns = ref<any[]>([])

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
  actual_start_time: '',
  actual_end_time: '',
  remark: ''
})

const hasUnqualified = computed(() => {
  return (parseInt(form.unqualified_quantity) || 0) > 0
})

const maxReportable = computed(() => {
  if (!task.value) return 0
  const planned = parseFloat(task.value.planned_quantity) || 0
  const done = parseFloat(task.value.completed_quantity) || 0
  return Math.max(planned - done, 0)
})

const progressPercent = computed(() => {
  if (!task.value) return 0
  const planned = parseFloat(task.value.planned_quantity) || 1
  const done = parseFloat(task.value.completed_quantity) || 0
  return Math.round((done / planned) * 100)
})

const statusClass = (s: string) => {
  const m: Record<string, string> = { '已完成': 'status-tag--success', '进行中': 'status-tag--primary', '未开始': 'status-tag--default' }
  return m[s] || 'status-tag--default'
}

const formatNum = (n: any) => {
  if (n == null) return '0'
  const num = parseFloat(n)
  return isNaN(num) ? '0' : num.toLocaleString('zh-CN')
}

// 加载工序任务信息
const loadTask = async () => {
  loadingTask.value = true
  try {
    const res: any = await getProcessTasks({ search: taskNumber, limit: 1 })
    if (res.success) {
      const items = res.data?.items || res.data || []
      const found = items.find((t: any) => t.process_task_number === taskNumber)
      task.value = found || items[0] || null
    }
  } catch (e) {
    console.error('Failed to load task:', e)
  } finally {
    loadingTask.value = false
  }
}

// 加载下拉选项
const loadOptions = async () => {
  try {
    const [schRes, empRes, dcRes, dfRes]: any[] = await Promise.all([
      getSchedules(), getEmployees(), getDefectClasses(), getDefects()
    ])
    if (schRes.success) {
      const items = schRes.data?.items || schRes.data || []
      scheduleColumns.value = items.map((s: any) => ({
        text: s.schedules_name || s.schedules_id,
        value: s.schedules_id
      }))
      items.forEach((s: any) => { scheduleMap.value[s.schedules_id] = s })
    }
    if (empRes.success) {
      const items = empRes.data?.items || empRes.data || []
      employeeColumns.value = items.map((e: any) => ({
        text: (e.employee_name || e.employee_number) + (e.department ? ` (${e.department})` : ''),
        value: e.employee_number
      }))
      items.forEach((e: any) => { employeeMap.value[e.employee_number] = e })
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

const onDateConfirm = ({ selectedValues }: any) => {
  form.report_date = selectedValues.join('-')
  showDatePicker.value = false
}

const onScheduleConfirm = ({ selectedOptions }: any) => {
  const opt = selectedOptions[0]
  if (opt) {
    form.schedules_id = opt.value
    form.schedules_name = opt.text
    // 尝试填充班组
    const sch = scheduleMap.value[opt.value]
    if (sch?.group_number) {
      form.group_number = sch.group_number
      form.group_name = sch.group_name || ''
    }
  }
  showSchedulePicker.value = false
}

const onEmployeeConfirm = ({ selectedOptions }: any) => {
  const opt = selectedOptions[0]
  if (opt) {
    form.operator_number = opt.value
    const emp = employeeMap.value[opt.value]
    form.operator_name = emp?.employee_name || opt.text
  }
  showEmployeePicker.value = false
}

const onDefectClassConfirm = ({ selectedOptions }: any) => {
  const opt = selectedOptions[0]
  if (opt) {
    form.defect_class_number = opt.value
    form.defect_class_name = opt.text
    form.defect_number = ''
    form.defect_name = ''
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

const handleSubmit = async () => {
  const qty = parseInt(form.qualified_quantity) || 0
  const unqty = parseInt(form.unqualified_quantity) || 0

  if (qty <= 0) {
    showToast('请输入合格数量')
    return
  }

  if (qty > maxReportable.value) {
    showToast(`合格数量不能超过剩余可报数 ${maxReportable.value}`)
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

  if (!form.report_date) {
    showToast('请选择报工日期')
    return
  }

  // 确认提交
  try {
    await showDialog({
      title: '确认报工',
      message: `工序: ${task.value?.standard_process_name || ''}\n合格: ${qty}${task.value?.basic_unit || '个'}\n不合格: ${unqty}${task.value?.basic_unit || '个'}`,
      confirmButtonText: '确认提交'
    })
  } catch {
    return // 取消
  }

  submitting.value = true
  try {
    const reportData: any = {
      process_task_number: taskNumber,
      production_order_number: task.value?.production_order_number || '',
      step_number: task.value?.step_number || 0,
      standard_process_name: task.value?.standard_process_name || '',
      item_number: task.value?.item_number || '',
      item_name: task.value?.item_name || '',
      specifications: task.value?.specifications || '',
      basic_unit: task.value?.basic_unit || '',
      work_center_number: task.value?.work_center_number || '',
      work_center_name: task.value?.work_center_name || '',
      planned_quantity: task.value?.planned_quantity || 0,
      qualified_quantity: qty,
      unqualified_quantity: unqty,
      total_quantity: qty + unqty,
      cumulative_quantity: (parseFloat(task.value?.completed_quantity) || 0) + qty,
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
      actual_start_time: form.actual_start_time,
      actual_end_time: form.actual_end_time,
      unqualified_reason: form.defect_name
        ? ((form.defect_class_name || '') + '/' + form.defect_name)
        : (form.unqualified_reason || ''),
      remark: form.remark
    }

    const res: any = await createWorkReport(reportData)
    if (res.success) {
      showToast({ message: '报工成功', type: 'success' })
      setTimeout(() => router.back(), 800)
    } else {
      showToast({ message: res.message || '报工失败', type: 'fail' })
    }
  } catch (e: any) {
    console.error('Submit error:', e)
  } finally {
    submitting.value = false
  }
}

onMounted(() => {
  loadTask()
  loadOptions()
})
</script>

<style scoped>
.page-container {
  padding: 12px 16px;
  padding-bottom: 100px;
}

.task-info {
  padding: 16px;
}

.task-info__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.task-info__number {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.task-info__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 16px;
  margin-bottom: 14px;
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

.task-progress {
  background: #f8f9fd;
  border-radius: 8px;
  padding: 12px;
}

.progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 500;
}

.progress-footer {
  display: flex;
  justify-content: space-between;
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

.form-card {
  overflow: hidden;
}

.form-card :deep(.van-cell) {
  padding: 12px 16px;
}

.unit-text {
  font-size: 13px;
  color: var(--text-muted);
  margin-left: 4px;
}

.submit-area {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px 16px;
  padding-bottom: calc(12px + env(safe-area-inset-bottom));
  background: var(--bg-card);
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
}

.submit-area .van-button {
  height: 48px;
  font-size: 16px;
  font-weight: 600;
}
</style>
