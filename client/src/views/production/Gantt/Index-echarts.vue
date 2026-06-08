<script setup lang="ts">
import { ref, computed, onMounted, onActivated, watch } from 'vue'
import { useRoute } from 'vue-router'
import { message } from 'ant-design-vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { CustomChart } from 'echarts/charts'
import {
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DataZoomComponent,
  LegendComponent
} from 'echarts/components'
import { getGanttData } from '@/api/production/order'
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

use([
  CanvasRenderer,
  CustomChart,
  TitleComponent,
  TooltipComponent,
  GridComponent,
  DataZoomComponent,
  LegendComponent
])

interface GanttTask {
  production_order_number: string
  production_number: string
  item_number: string
  item_name: string
  specifications: string
  planned_quantity: number
  mould_number: string
  actual_cavity_count: string
  actual_hole_count: string
  actual_daily_output: string
  production_date: string
  schedule_id: string
  planned_completion_time: string
  plan_status: string
}

interface EquipmentGroup {
  equipment_number: string
  equipment_name: string
  tasks: GanttTask[]
}

const loading = ref(false)
const equipments = ref<EquipmentGroup[]>([])
const scheduleList = ref<any[]>([])
const factoryList = ref<any[]>([])
const filterFactory = ref<number | undefined>(undefined)
const ganttChartRef = ref<any>(null)
const isFullscreen = ref(false)
const route = useRoute()

// 日期范围控制
const dateRange = ref<[any, any]>([
  dayjs().startOf('week'),
  dayjs().endOf('week').add(1, 'week')
])

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

const getScheduleName = (scheduleId: string | null) => {
  if (!scheduleId) return ''
  const schedule = scheduleList.value.find((s: any) => s.schedules_id === scheduleId)
  return schedule ? (schedule.schedules_name || scheduleId) : scheduleId
}

const fetchData = async () => {
  loading.value = true
  try {
    const startDate = dayjs(dateRange.value[0]).format('YYYY-MM-DD')
    const endDate = dayjs(dateRange.value[1]).format('YYYY-MM-DD')
    const res = await getGanttData({ startDate, endDate, factory_id: filterFactory.value || undefined })
    if (res.success) {
      equipments.value = res.data.equipments || []
    }
  } catch {
    message.error('获取甘特图数据失败')
  } finally {
    loading.value = false
  }
}

const loadFactories = async () => {
  try {
    const res: any = await getFactories({ limit: 9999 })
    if (res.success) { factoryList.value = res.data.items || [] }
  } catch { /* ignore */ }
}

const loadSchedules = async () => {
  try {
    const res = await getSchedules({ page: 1, limit: 100 })
    if (res.success) {
      scheduleList.value = res.data.items || []
    }
  } catch { /* ignore */ }
}

// 快速切换日期范围
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

// 构建ECharts甘特图配置
const chartOption = computed(() => {
  if (equipments.value.length === 0) return {}

  // 收集所有班次ID
  const allScheduleIds = new Set<string>()
  equipments.value.forEach(e => {
    e.tasks.forEach(t => {
      if (t.schedule_id) allScheduleIds.add(t.schedule_id)
    })
  })
  // 排序班次（确保顺序一致）
  const scheduleIds = Array.from(allScheduleIds).sort()
  // 如果没有班次数据，用空字符串作为默认
  if (scheduleIds.length === 0) scheduleIds.push('')

  // Y轴: 设备 + 班次 组合，只保留有实际任务的组合
  interface YRow { label: string; equipIndex: number; scheduleId: string; isFirstOfEquip: boolean; equipName: string; shiftLabel: string }
  const yRows: YRow[] = []
  equipments.value.forEach((e, eIdx) => {
    const equipLabel = e.equipment_name || e.equipment_number
    // 只取该设备实际用到的班次
    const usedIds = new Set<string>()
    e.tasks.forEach(t => usedIds.add(t.schedule_id || ''))
    const sortedUsedIds = Array.from(usedIds).sort()

    sortedUsedIds.forEach((sid, sIdx) => {
      const shiftLabel = sid ? getScheduleName(sid) : '未分配'
      const isFirst = sIdx === 0
      const label = isFirst
        ? (sortedUsedIds.length > 1 ? `${equipLabel}  ${shiftLabel}` : equipLabel)
        : `  ${shiftLabel}`
      yRows.push({ label, equipIndex: eIdx, scheduleId: sid, isFirstOfEquip: isFirst, equipName: equipLabel, shiftLabel })
    })
  })
  const reversedRows = [...yRows].reverse()
  const yCategories = reversedRows.map(r => r.label)

  // 计算设备分组分隔线位置
  const equipSeparatorLines: any[] = []
  for (let i = 1; i < reversedRows.length; i++) {
    if (reversedRows[i].equipIndex !== reversedRows[i - 1].equipIndex) {
      equipSeparatorLines.push({
        yAxis: i - 0.5,
        lineStyle: { color: '#d9d9d9', width: 1, type: 'solid' }
      })
    }
  }

  // X轴: 日期范围
  const start = dayjs(dateRange.value[0])
  const end = dayjs(dateRange.value[1])
  const startTs = start.valueOf()
  const endTs = end.add(1, 'day').valueOf()

  // 构建数据
  const data: any[] = []

  reversedRows.forEach((row, yIndex) => {
    const equip = equipments.value[row.equipIndex]
    equip.tasks.forEach(task => {
      if (!task.production_date) return
      // 仅匹配当前班次行
      const taskSchedule = task.schedule_id || ''
      if (taskSchedule !== row.scheduleId) return

      const taskDate = dayjs(task.production_date)
      const taskStart = taskDate.startOf('day').valueOf()
      const taskEnd = taskDate.endOf('day').valueOf()

      const color = statusColorMap[task.plan_status] || '#1890ff'
      const scheduleName = getScheduleName(task.schedule_id)

      data.push({
        value: [yIndex, taskStart, taskEnd],
        itemStyle: { color },
        task: {
          ...task,
          scheduleName
        }
      })
    })
  })

  const chartHeight = Math.max(yCategories.length * 32, 200)

  return {
    tooltip: {
      trigger: 'item',
      confine: false,
      appendTo: () => document.body,
      backgroundColor: 'rgba(255, 255, 255, 0.96)',
      borderColor: '#e8e8e8',
      borderWidth: 1,
      padding: [12, 16],
      extraCssText: 'z-index: 99999; box-shadow: 0 4px 12px rgba(0,0,0,0.15); max-width: 360px;',
      textStyle: { color: '#333', fontSize: 13 },
      formatter: (params: any) => {
        const t = params.data?.task
        if (!t) return ''
        const cavity = Number(t.actual_cavity_count) || 0
        const hole = Number(t.actual_hole_count) || 0
        const dailyOutput = (cavity > 0 && hole > 0) ? cavity * hole : (t.actual_daily_output || '-')
        return `
          <div style="font-weight:600;margin-bottom:8px;font-size:14px;color:#1890ff">${t.production_order_number}</div>
          <div style="display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:13px">
            <span style="color:#999">产品</span><span>${t.item_name || '-'}${t.specifications ? ' (' + t.specifications + ')' : ''}</span>
            <span style="color:#999">计划数量</span><span>${t.planned_quantity || '-'}</span>
            <span style="color:#999">模具</span><span>${t.mould_number || '-'}</span>
            <span style="color:#999">模腔/模穴</span><span>${t.actual_cavity_count || '-'} / ${t.actual_hole_count || '-'}</span>
            <span style="color:#999">实际班产</span><span>${dailyOutput}</span>
            <span style="color:#999">生产日期</span><span>${t.production_date ? dayjs(t.production_date).format('YYYY-MM-DD') : '-'}</span>
            <span style="color:#999">班次</span><span>${t.scheduleName || '-'}</span>
            <span style="color:#999">状态</span><span style="color:${statusColorMap[t.plan_status] || '#333'};font-weight:500">${t.plan_status}</span>
          </div>
        `
      }
    },
    grid: {
      left: 140,
      right: 40,
      top: 20,
      bottom: 60,
      containLabel: false
    },
    xAxis: {
      type: 'time',
      min: startTs,
      max: endTs,
      axisLabel: {
        formatter: (val: number) => dayjs(val).format('MM-DD'),
        fontSize: 12,
        color: '#666'
      },
      axisTick: { alignWithLabel: true },
      splitLine: {
        show: true,
        lineStyle: { color: '#f0f0f0', type: 'dashed' }
      },
      axisLine: { lineStyle: { color: '#d9d9d9' } }
    },
    yAxis: {
      type: 'category',
      data: yCategories,
      axisLabel: {
        fontSize: 12,
        width: 130,
        overflow: 'truncate',
        formatter: (value: string) => {
          // 班次子行（以空格开头）用灰色，设备行用黑色粗体
          if (value.startsWith('  ')) {
            return `{shift|${value.trim()}}`
          }
          return `{equip|${value}}`
        },
        rich: {
          equip: { fontSize: 12, fontWeight: 'bold', color: '#262626', width: 130, align: 'right' },
          shift: { fontSize: 11, color: '#8c8c8c', width: 130, align: 'right' }
        }
      },
      axisTick: { show: false },
      axisLine: { lineStyle: { color: '#d9d9d9' } },
      splitLine: {
        show: true,
        interval: (index: number) => {
          // 在设备分组之间显示实线分隔
          const row = reversedRows[index]
          return row ? row.isFirstOfEquip : false
        },
        lineStyle: { color: '#e8e8e8' }
      }
    },
    dataZoom: [
      {
        type: 'slider',
        xAxisIndex: 0,
        bottom: 10,
        height: 24,
        borderColor: '#d9d9d9',
        backgroundColor: '#fafafa',
        fillerColor: 'rgba(24, 144, 255, 0.15)',
        handleStyle: { color: '#1890ff' },
        textStyle: { fontSize: 11 },
        labelFormatter: (val: string) => dayjs(val).format('MM-DD')
      }
    ],
    series: [
      {
        type: 'custom',
        renderItem: (params: any, api: any) => {
          const yIndex = api.value(0)
          const start = api.coord([api.value(1), yIndex])
          const end = api.coord([api.value(2), yIndex])
          const height = api.size([0, 1])[1] * 0.6

          const rectShape = {
            x: start[0],
            y: start[1] - height / 2,
            width: Math.max(end[0] - start[0], 8),
            height: height
          }

          return {
            type: 'group',
            children: [
              {
                type: 'rect',
                shape: { ...rectShape, r: 4 },
                style: {
                  fill: api.visual('color'),
                  opacity: 0.85
                },
                emphasis: {
                  style: { opacity: 1, shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.15)' }
                }
              },
              {
                type: 'text',
                style: {
                  x: rectShape.x + rectShape.width / 2,
                  y: rectShape.y + rectShape.height / 2,
                  text: rectShape.width > 50 ? params.dataIndex < data.length ? (data[params.dataIndex]?.task?.item_number || '') : '' : '',
                  fill: '#fff',
                  fontSize: 10,
                  fontWeight: 500,
                  align: 'center',
                  verticalAlign: 'middle',
                  truncate: { outerWidth: rectShape.width - 8 }
                }
              }
            ]
          }
        },
        data: data,
        encode: {
          x: [1, 2],
          y: 0
        }
      }
    ],
    _chartHeight: chartHeight
  }
})

const chartHeight = computed(() => {
  const opt = chartOption.value as any
  return opt._chartHeight ? `${opt._chartHeight}px` : '400px'
})

// 统计信息
const stats = computed(() => {
  const totalEquipments = equipments.value.length
  const totalTasks = equipments.value.reduce((sum, e) => sum + e.tasks.length, 0)
  const statusCount: Record<string, number> = {}
  equipments.value.forEach(e => {
    e.tasks.forEach(t => {
      statusCount[t.plan_status] = (statusCount[t.plan_status] || 0) + 1
    })
  })
  return { totalEquipments, totalTasks, statusCount }
})

onMounted(async () => {
  await loadSchedules()
  await loadFactories()
  await fetchData()
})

// 路由激活时自动刷新数据（确保从其他页面切换回来时获取最新数据）
onActivated(async () => {
  await fetchData()
})

// 监听路由变化，防止组件复用时数据不刷新
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
        <span class="toolbar-stat">{{ stats.totalEquipments }} 台设备</span>
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
    </div>

    <!-- 甘特图主体 -->
    <div class="gantt-chart-wrapper" v-if="!loading && equipments.length > 0">
      <v-chart
        ref="ganttChartRef"
        :option="chartOption"
        :style="{ width: '100%', height: chartHeight }"
        autoresize
      />
    </div>

    <!-- 空状态 -->
    <div class="gantt-empty" v-else-if="!loading && equipments.length === 0">
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
.legend-label {
  color: #595959;
}
.legend-count {
  color: #1890ff;
  font-weight: 600;
  font-size: 14px;
}

.gantt-chart-wrapper {
  border: 1px solid #f0f0f0;
  border-radius: 6px;
  overflow: visible;
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
</style>

<!-- 全局样式：确保ECharts tooltip在最顶层 -->
<style>
body > div[class*="echarts"],
body > div[style*="position: absolute"] {
  z-index: 99999 !important;
}
div[class*="echarts"] > div:last-child {
  z-index: 99999 !important;
}
</style>
