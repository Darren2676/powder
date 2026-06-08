<script setup lang="ts">
import { ref, onMounted, onUnmounted, onActivated, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import { gantt } from 'dhtmlx-gantt'
import 'dhtmlx-gantt/codebase/dhtmlxgantt.css'
import { getGanttData, updateGanttTask } from '@/api/production/order'
import { getEquipments } from '@/api/equipment/equipment'
import { getSchedules } from '@/api/master-data/schedule'
import { getFactories } from '@/api/system/factory'
import dayjs from 'dayjs'
import {
  ReloadOutlined,
  LeftOutlined,
  RightOutlined,
  BarChartOutlined,
  CalendarOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined
} from '@ant-design/icons-vue'

const route = useRoute()
const loading = ref(false)
const isFullscreen = ref(false)
const ganttContainer = ref<HTMLDivElement | null>(null)

// 日期范围控制
const dateRange = ref<[any, any]>([
  dayjs().startOf('month'),
  dayjs().endOf('month')
])

// 筛选条件
const filterEquipment = ref<string | undefined>(undefined)
const filterItemNumber = ref('')
const filterFactory = ref<number | undefined>(undefined)
const factoryList = ref<any[]>([])

// 数据
const scheduleList = ref<any[]>([])
const equipmentList = ref<any[]>([])
const ganttData = ref<any[]>([])

// 编辑弹窗
const editModalVisible = ref(false)
const editModalLoading = ref(false)
const editForm = ref<any>({})

// 事件 ID 记录（用于卸载时清理）
let dblClickEventId: any = null
let beforeDragEventId: any = null
let afterDragEventId: any = null

const statusColorMap: Record<string, string> = {
  '未开始': '#d9d9d9',
  '已派发': '#1890ff',
  '已备料': '#faad14',
  '生产中': '#52c41a',
  '已完成': '#8c8c8c'
}

const statusList = [
  { label: '未开始', color: '#d9d9d9' },
  { label: '已派发', color: '#1890ff' },
  { label: '已备料', color: '#faad14' },
  { label: '生产中', color: '#52c41a' },
  { label: '已完成', color: '#8c8c8c' }
]

// 统计信息
const stats = computed(() => {
  const totalTasks = ganttData.value.length
  const statusCount: Record<string, number> = {}
  ganttData.value.forEach((t: any) => {
    statusCount[t.plan_status] = (statusCount[t.plan_status] || 0) + 1
  })
  return { totalTasks, statusCount }
})

// 获取班次名称
const getScheduleName = (scheduleId: string | null) => {
  if (!scheduleId) return ''
  const schedule = scheduleList.value.find((s: any) => s.schedules_id === scheduleId)
  return schedule ? (schedule.schedules_name || scheduleId) : scheduleId
}

// 加载班次列表
const loadSchedules = async () => {
  try {
    const res = await getSchedules({ page: 1, limit: 100 })
    if (res.success) {
      scheduleList.value = res.data.items || []
    }
  } catch { /* ignore */ }
}

// 加载设备列表
const loadEquipments = async () => {
  try {
    const res = await getEquipments({ page: 1, limit: 1000 })
    if (res.success) {
      equipmentList.value = res.data.items || []
    }
  } catch { /* ignore */ }
}

// 获取甘特图数据
const fetchData = async () => {
  loading.value = true
  try {
    const startDate = dayjs(dateRange.value[0]).format('YYYY-MM-DD')
    const endDate = dayjs(dateRange.value[1]).format('YYYY-MM-DD')
    const res = await getGanttData({
      startDate,
      endDate,
      equipmentNumber: filterEquipment.value,
      search: filterItemNumber.value || undefined,
      factory_id: filterFactory.value || undefined
    })
    if (res.success) {
      ganttData.value = res.data.data || []
      gantt.clearAll()
      if (ganttData.value.length === 0) {
        gantt.message({ text: '当前筛选条件下暂无数据', expire: 3000 })
      } else {
        gantt.parse({ data: ganttData.value, links: [] })
        // 强制重绘：容器可能从隐藏变为显示，需重新计算尺寸
        setTimeout(() => {
          gantt.setSizes()
          gantt.render()
        }, 100)
      }
    }
  } catch {
    message.error('获取甘特图数据失败')
  } finally {
    loading.value = false
  }
}

// 日期范围操作
const goThisWeek = () => {
  dateRange.value = [dayjs().startOf('week'), dayjs().endOf('week')]
  fetchData()
}
const goThisMonth = () => {
  dateRange.value = [dayjs().startOf('month'), dayjs().endOf('month')]
  fetchData()
}
const goPrev = () => {
  const diff = dayjs(dateRange.value[1]).diff(dayjs(dateRange.value[0]), 'day')
  dateRange.value = [
    dayjs(dateRange.value[0]).subtract(diff + 1, 'day'),
    dayjs(dateRange.value[1]).subtract(diff + 1, 'day')
  ]
  fetchData()
}
const goNext = () => {
  const diff = dayjs(dateRange.value[1]).diff(dayjs(dateRange.value[0]), 'day')
  dateRange.value = [
    dayjs(dateRange.value[0]).add(diff + 1, 'day'),
    dayjs(dateRange.value[1]).add(diff + 1, 'day')
  ]
  fetchData()
}
const handleDateChange = (_: any, dateStrings: [string, string]) => {
  if (dateStrings[0] && dateStrings[1]) {
    dateRange.value = [dayjs(dateStrings[0]), dayjs(dateStrings[1])]
    fetchData()
  }
}

const toggleFullscreen = () => {
  isFullscreen.value = !isFullscreen.value
}

// 打开编辑弹窗
const openEditModal = (task: any) => {
  editForm.value = {
    production_order_number: task.production_order_number,
    item_number: task.item_number,
    planned_quantity: task.planned_quantity,
    equipment_number: task.owner || task.equipment_number,
    schedule_id: task.schedule_id
  }
  editModalVisible.value = true
}

// 保存编辑
const handleEditSave = async () => {
  editModalLoading.value = true
  try {
    const eq = equipmentList.value.find((e: any) => e.equipment_number === editForm.value.equipment_number)
    const res = await updateGanttTask(editForm.value.production_order_number, {
      planned_quantity: editForm.value.planned_quantity,
      equipment_number: editForm.value.equipment_number || null,
      equipment_name: eq?.equipment_name || null,
      schedule_id: editForm.value.schedule_id || null
    } as any)
    if (res.success) {
      message.success('更新成功')
      editModalVisible.value = false
      await fetchData()
    } else {
      message.error(res.message || '更新失败')
    }
  } catch {
    message.error('更新失败')
  } finally {
    editModalLoading.value = false
  }
}

// 初始化甘特图
const initGantt = () => {
  if (!ganttContainer.value) return

  gantt.config.date_format = '%Y-%m-%d'
  gantt.config.row_height = 36
  gantt.config.bar_height = 24
  gantt.config.readonly = false
  gantt.config.drag_resize = true
  gantt.config.drag_move = true
  gantt.config.drag_progress = false
  gantt.config.drag_links = false
  gantt.config.select_task = false

  // 时间刻度
  gantt.config.scale_height = 50
  gantt.config.subscales = [
    { unit: 'day', step: 1, date: '%m-%d' }
  ]
  gantt.config.date_scale = '%Y年%m月'

  // 列配置
  gantt.config.columns = [
    { name: 'text', label: '产品信息', tree: true, width: 180, resize: true },
    {
      name: 'owner',
      label: '设备',
      align: 'center',
      width: 120,
      resize: true,
      template: (task: any) => task.equipment_name || task.owner || '-'
    },
    { name: 'start_date', label: '生产日期', align: 'center', width: 90, resize: true },
    { name: 'end_date', label: '完成日期', align: 'center', width: 90, resize: true },
    { name: 'planned_quantity', label: '计划数量', align: 'center', width: 80, resize: true },
    { name: 'plan_status', label: '状态', align: 'center', width: 70, resize: true }
  ]

  const dateToStr = gantt.date.date_to_str('%Y-%m-%d')

  // Tooltip 自定义
  gantt.templates.tooltip_text = (start: Date, end: Date, task: any) => {
    const cavity = Number(task.actual_cavity_count) || 0
    const hole = Number(task.actual_hole_count) || 0
    const dailyOutput = (cavity > 0 && hole > 0) ? cavity * hole : (task.actual_daily_output || '-')
    const scheduleName = getScheduleName(task.schedule_id)
    let html = `
      <div style="font-weight:600;margin-bottom:8px;font-size:14px;color:#1890ff">${task.production_order_number}</div>
      <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13px">
        <span style="color:#999">产品</span><span>${task.item_name || '-'}${task.specifications ? ' (' + task.specifications + ')' : ''}</span>
        <span style="color:#999">产品编号</span><span>${task.item_number || '-'}</span>
        <span style="color:#999">计划数量</span><span>${task.planned_quantity || '-'}</span>
        <span style="color:#999">模具</span><span>${task.mould_number || '-'}</span>
        <span style="color:#999">模腔/模穴</span><span>${task.actual_cavity_count || '-'} / ${task.actual_hole_count || '-'}</span>
        <span style="color:#999">实际班产</span><span>${dailyOutput}</span>
        <span style="color:#999">生产日期</span><span>${task.start_date ? dayjs(task.start_date).format('YYYY-MM-DD') : '-'}</span>
        <span style="color:#999">班次</span><span>${scheduleName || '-'}</span>
        <span style="color:#999">状态</span><span style="color:${statusColorMap[task.plan_status] || '#333'};font-weight:500">${task.plan_status}</span>
      </div>
    `
    // Baseline 信息
    if (task.baseline_start_date && task.baseline_end_date) {
      const hasDeviation = task.baseline_start_date !== dateToStr(start) || task.baseline_end_date !== dateToStr(end)
      if (hasDeviation) {
        html += `
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee">
            <div style="font-weight:600;color:#faad14;font-size:13px;margin-bottom:4px">排期偏差</div>
            <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12px;color:#666">
              <span>原始开始</span><span>${task.baseline_start_date}</span>
              <span>原始结束</span><span>${task.baseline_end_date}</span>
            </div>
          </div>
        `
      } else {
        html += `
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid #eee;font-size:12px;color:#8c8c8c">
            原始计划：${task.baseline_start_date} ~ ${task.baseline_end_date}（无偏差）
          </div>
        `
      }
    }
    return html
  }

  // Baseline 偏差可视化：橙色虚线边框
  gantt.templates.task_class = (start: Date, end: Date, task: any) => {
    if (task.baseline_start_date && task.baseline_end_date) {
      const s = dateToStr(start)
      const e = dateToStr(end)
      if (task.baseline_start_date !== s || task.baseline_end_date !== e) {
        return 'gantt-task-has-baseline'
      }
    }
    return ''
  }

  // 双击编辑
  dblClickEventId = gantt.attachEvent('onTaskDblClick', (id: string | number) => {
    const task = gantt.getTask(id)
    const allowedStatuses = ['未开始', '已派发']
    if (!allowedStatuses.includes(task.plan_status)) {
      message.warning(`当前状态为"${task.plan_status}"，仅"未开始"或"已派发"状态的任务可编辑`)
      return false
    }
    openEditModal(task)
    return false
  })

  // 拖拽前校验状态
  beforeDragEventId = gantt.attachEvent('onBeforeTaskDrag', (id: string | number, mode: string) => {
    if (mode === 'resize' || mode === 'move' || mode === 'progress') {
      const task = gantt.getTask(id)
      const allowedStatuses = ['未开始', '已派发']
      if (!allowedStatuses.includes(task.plan_status)) {
        message.warning(`当前状态为"${task.plan_status}"，仅"未开始"或"已派发"状态的任务可调整排期`)
        return false
      }
    }
    return true
  })

  // 拖拽后保存
  afterDragEventId = gantt.attachEvent('onAfterTaskDrag', (id: string | number, mode: string) => {
    if (mode === 'resize' || mode === 'move') {
      const task = gantt.getTask(id)
      // 异步保存，不阻塞 UI
      updateGanttTask(task.production_order_number, {
        production_date: task.start_date ? dayjs(task.start_date).format('YYYY-MM-DD') : undefined,
        planned_completion_time: task.end_date ? dayjs(task.end_date).format('YYYY-MM-DD') : undefined,
        equipment_number: task.owner || undefined,
        schedule_id: task.schedule_id || undefined
      } as any).then((res: any) => {
        if (res.success) {
          message.success('排期调整已保存')
        } else {
          message.error(res.message || '排期调整失败')
          fetchData()
        }
      }).catch(() => {
        message.error('排期调整失败')
        fetchData()
      })
    }
  })

  gantt.init(ganttContainer.value)
}

const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch { /* ignore */ }
}

onMounted(async () => {
  await loadSchedules()
  await loadEquipments()
  await loadFactories()
  initGantt()
  await fetchData()
})

onUnmounted(() => {
  if (dblClickEventId) gantt.detachEvent(dblClickEventId)
  if (beforeDragEventId) gantt.detachEvent(beforeDragEventId)
  if (afterDragEventId) gantt.detachEvent(afterDragEventId)
  gantt.clearAll()
})

onActivated(async () => {
  await fetchData()
})

watch(() => route.path, (newPath) => {
  if (newPath === '/gantt') {
    fetchData()
  }
})
</script>

<template>
  <div :class="['gantt-page', { 'gantt-fullscreen': isFullscreen }]">
    <!-- 顶部工具栏 -->
    <div class="gantt-toolbar">
      <div class="toolbar-left">
        <BarChartOutlined style="font-size: 20px; color: #1890ff" />
        <span class="toolbar-title">生产排产甘特图</span>
        <a-divider type="vertical" />
        <span class="toolbar-stat">{{ stats.totalTasks }} 个任务</span>
      </div>
      <div class="toolbar-right">
        <a-select
          v-model:value="filterFactory"
          size="small"
          style="width: 120px"
          placeholder="选择工厂"
          allow-clear
          @change="fetchData"
        >
          <a-select-option
            v-for="f in factoryList"
            :key="f.id"
            :value="f.id"
          >
            {{ f.factory_short || f.factory_name }}
          </a-select-option>
        </a-select>
        <a-select
          v-model:value="filterEquipment"
          size="small"
          style="width: 140px"
          placeholder="选择设备"
          allow-clear
          @change="fetchData"
        >
          <a-select-option
            v-for="eq in equipmentList"
            :key="eq.equipment_number"
            :value="eq.equipment_name || eq.equipment_number"
          >
            {{ eq.equipment_name || eq.equipment_number }}
          </a-select-option>
        </a-select>
        <a-input-search
          v-model:value="filterItemNumber"
          size="small"
          style="width: 160px"
          placeholder="物料编号"
          allow-clear
          @search="fetchData"
        />
        <a-divider type="vertical" />
        <a-button size="small" @click="goPrev"><LeftOutlined /></a-button>
        <a-button size="small" @click="goThisWeek">本周</a-button>
        <a-button size="small" @click="goThisMonth">本月</a-button>
        <a-button size="small" @click="goNext"><RightOutlined /></a-button>
        <a-range-picker
          :value="dateRange"
          size="small"
          style="width: 230px"
          @change="handleDateChange"
        />
        <a-button size="small" @click="fetchData" :loading="loading">
          <ReloadOutlined />
        </a-button>
        <a-button size="small" @click="toggleFullscreen">
          <FullscreenExitOutlined v-if="isFullscreen" />
          <FullscreenOutlined v-else />
        </a-button>
      </div>
    </div>

    <!-- 图例 -->
    <div class="gantt-legend">
      <div class="legend-item" v-for="s in statusList" :key="s.label">
        <span class="legend-dot" :style="{ backgroundColor: s.color }"></span>
        <span class="legend-label">{{ s.label }}</span>
        <span class="legend-count">{{ stats.statusCount[s.label] || 0 }}</span>
      </div>
      <div class="legend-item">
        <span class="legend-outline"></span>
        <span class="legend-label">有排期偏差</span>
      </div>
    </div>

    <!-- 甘特图主体 -->
    <div
      class="gantt-chart-container"
      ref="ganttContainer"
      v-show="!loading && ganttData.length > 0"
    ></div>

    <!-- 空状态 -->
    <div class="gantt-empty" v-if="!loading && ganttData.length === 0">
      <a-empty description="当前日期范围内没有排产数据">
        <template #image>
          <CalendarOutlined style="font-size: 64px; color: #d9d9d9" />
        </template>
        <a-button type="primary" @click="goThisMonth">查看本月</a-button>
      </a-empty>
    </div>

    <!-- 加载状态 -->
    <div class="gantt-loading" v-if="loading">
      <a-spin size="large" tip="加载排产数据中..." />
    </div>

    <!-- 编辑弹窗 -->
    <a-modal
      v-model:open="editModalVisible"
      title="编辑任务信息"
      :confirm-loading="editModalLoading"
      @ok="handleEditSave"
      width="480px"
    >
      <a-form layout="vertical" style="margin-top: 16px">
        <a-form-item label="生产单号">
          <span style="color: #8c8c8c">{{ editForm.production_order_number }}</span>
        </a-form-item>
        <a-form-item label="产品编号">
          <span style="color: #8c8c8c">{{ editForm.item_number }}</span>
        </a-form-item>
        <a-form-item label="计划数量">
          <a-input-number
            v-model:value="editForm.planned_quantity"
            :min="0"
            style="width: 100%"
            placeholder="请输入计划数量"
          />
        </a-form-item>
        <a-form-item label="设备">
          <a-select
            v-model:value="editForm.equipment_number"
            style="width: 100%"
            placeholder="请选择设备"
            allow-clear
          >
            <a-select-option
              v-for="eq in equipmentList"
              :key="eq.equipment_number"
              :value="eq.equipment_number"
            >
              {{ eq.equipment_name || eq.equipment_number }}
            </a-select-option>
          </a-select>
        </a-form-item>
        <a-form-item label="班次">
          <a-select
            v-model:value="editForm.schedule_id"
            style="width: 100%"
            placeholder="请选择班次"
            allow-clear
          >
            <a-select-option
              v-for="sc in scheduleList"
              :key="sc.schedules_id"
              :value="sc.schedules_id"
            >
              {{ sc.schedules_name || sc.schedules_id }}
            </a-select-option>
          </a-select>
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.gantt-page {
  background: #fff;
  border-radius: 8px;
  padding: 20px;
  min-height: calc(100vh - 120px);
}
.gantt-fullscreen {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  border-radius: 0;
  overflow-y: auto;
  padding: 20px;
  background: #fff;
}

.gantt-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  flex-wrap: wrap;
  gap: 8px;
}
.toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}
.toolbar-title {
  font-size: 18px;
  font-weight: 600;
  color: #262626;
}
.toolbar-stat {
  font-size: 13px;
  color: #8c8c8c;
}
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.gantt-legend {
  display: flex;
  gap: 20px;
  margin-bottom: 16px;
  padding: 10px 16px;
  background: #fafafa;
  border-radius: 6px;
  flex-wrap: wrap;
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 3px;
}
.legend-outline {
  width: 14px;
  height: 14px;
  border: 2px dashed #faad14;
  border-radius: 3px;
}
.legend-label {
  color: #595959;
}
.legend-count {
  color: #1890ff;
  font-weight: 600;
  font-size: 14px;
}

.gantt-chart-container {
  width: 100%;
  height: calc(100vh - 280px);
  min-height: 400px;
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  overflow: hidden;
}

.gantt-empty {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

.gantt-loading {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 400px;
}

/* Baseline 偏差：橙色虚线边框 */
:deep(.gantt_task_line.gantt-task-has-baseline) {
  outline: 2px dashed #faad14;
  outline-offset: 2px;
}
:deep(.gantt_grid_scale) {
  background-color: #fafafa;
}
:deep(.gantt_grid_data) {
  background-color: #fff;
}
</style>
