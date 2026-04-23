<template>
  <div class="page-container">
    <!-- 顶部导航 -->
    <van-nav-bar
      :title="orderNumber"
      left-arrow
      @click-left="router.back()"
      fixed
      placeholder
    />

    <!-- 加载状态 -->
    <div v-if="loading" style="padding: 40px 0;">
      <van-loading type="spinner" vertical>加载中...</van-loading>
    </div>

    <template v-else-if="overview">
      <!-- 基本信息卡片 -->
      <div class="card info-card">
        <div class="info-card__header">
          <h3 class="info-card__title">{{ overview.order.item_name || '-' }}</h3>
          <span :class="['status-tag', approvalClass(overview.order.approval_status)]">
            {{ overview.order.approval_status }}
          </span>
        </div>
        <div class="info-card__grid">
          <div class="info-row">
            <span class="info-row__label">产品编号</span>
            <span class="info-row__value">{{ overview.order.item_number || '-' }}</span>
          </div>
          <div class="info-row">
            <span class="info-row__label">规格</span>
            <span class="info-row__value">{{ overview.order.specifications || '-' }}</span>
          </div>
          <div class="info-row">
            <span class="info-row__label">计划数量</span>
            <span class="info-row__value num-highlight">{{ formatNum(overview.order.planned_quantity) }}</span>
          </div>
          <div class="info-row">
            <span class="info-row__label">计划完成</span>
            <span class="info-row__value">{{ overview.order.planned_completion_time || '-' }}</span>
          </div>
          <div class="info-row">
            <span class="info-row__label">计划状态</span>
            <span :class="['info-row__value', planColor(overview.order.plan_status)]">{{ overview.order.plan_status || '-' }}</span>
          </div>
          <div class="info-row">
            <span class="info-row__label">生产计划号</span>
            <span class="info-row__value">{{ overview.order.production_number || '-' }}</span>
          </div>
        </div>
      </div>

      <!-- 快捷操作卡片 -->
      <div class="action-cards">
        <div class="action-card card" @click="goMaterial">
          <div class="action-card__icon" style="background: var(--primary-light); color: var(--primary);">📦</div>
          <div class="action-card__info">
            <div class="action-card__title">备料</div>
            <div class="action-card__desc" v-if="overview.preparation">
              {{ overview.preparation.preparation_number ? '已有备料单' : '暂无备料单' }}
              <template v-if="overview.preparation.total_material_types"> · {{ overview.preparation.total_material_types }}种物料</template>
            </div>
            <div class="action-card__desc" v-else>暂无备料单</div>
          </div>
          <van-icon name="arrow" color="#ccc" />
        </div>
        <div class="action-card card" @click="goTasks">
          <div class="action-card__icon" style="background: var(--warning-light); color: var(--warning);">📝</div>
          <div class="action-card__info">
            <div class="action-card__title">报工</div>
            <div class="action-card__desc">
              {{ overview.summary?.total_tasks || 0 }}道工序 · 完成{{ overview.summary?.overall_progress || 0 }}%
            </div>
          </div>
          <van-icon name="arrow" color="#ccc" />
        </div>
      </div>

      <!-- 按工序备料入口（仅已派发时显示） -->
      <div v-if="overview.order.plan_status === '已派发'" class="action-cards" style="margin-top: 0;">
        <div class="action-card card" @click="goProcessPrep" style="flex: 1;">
          <div class="action-card__icon" style="background: #e8f5e9; color: #4caf50;">🔧</div>
          <div class="action-card__info">
            <div class="action-card__title">按工序备料</div>
            <div class="action-card__desc">逐工序领料，步骤引导式操作</div>
          </div>
          <van-icon name="arrow" color="#ccc" />
        </div>
      </div>

      <!-- 总进度 -->
      <div class="card progress-card" v-if="overview.summary">
        <div class="progress-card__header">
          <span>总体进度</span>
          <span class="num-highlight">{{ overview.summary.overall_progress }}%</span>
        </div>
        <div class="progress-bar" style="height: 8px;">
          <div
            :class="['progress-bar__inner', overview.summary.overall_progress >= 100 ? 'progress-bar__inner--success' : '']"
            :style="{ width: Math.min(overview.summary.overall_progress, 100) + '%' }"
          ></div>
        </div>
        <div class="progress-card__summary">
          <span>已完成 {{ overview.summary.completed_tasks }}/{{ overview.summary.total_tasks }} 道工序</span>
        </div>
      </div>

      <!-- 工序任务列表 -->
      <div class="section-title">工序任务一览</div>
      <div class="task-list">
        <div v-for="task in overview.tasks" :key="task.process_task_number" class="task-item card" @click="goReportTask(task)">
          <div class="task-item__left">
            <div class="task-item__step">
              <span class="step-num">{{ task.step_number }}</span>
            </div>
          </div>
          <div class="task-item__center">
            <div class="task-item__name">{{ task.standard_process_name || '工序' + task.step_number }}</div>
            <div class="task-item__progress">
              <div class="progress-bar" style="height: 4px; flex: 1;">
                <div
                  :class="['progress-bar__inner', taskProgress(task) >= 100 ? 'progress-bar__inner--success' : '']"
                  :style="{ width: Math.min(taskProgress(task), 100) + '%' }"
                ></div>
              </div>
              <span class="task-item__qty">{{ formatNum(task.completed_quantity) }}/{{ formatNum(task.planned_quantity) }}</span>
            </div>
          </div>
          <div class="task-item__right">
            <span :class="['status-tag', taskStatusClass(task.task_status)]">{{ task.task_status }}</span>
            <van-button v-if="task.max_reportable > 0" size="mini" type="primary" plain round @click.stop="goReportTask(task)">报工</van-button>
          </div>
        </div>

        <div v-if="!overview.tasks || overview.tasks.length === 0" class="empty-state" style="padding: 30px;">
          <div class="empty-state__text">暂无工序任务</div>
        </div>
      </div>
    </template>

    <!-- 加载失败 -->
    <div v-else class="empty-state">
      <div class="empty-state__icon">😔</div>
      <div class="empty-state__text">加载失败</div>
      <van-button size="small" type="primary" plain @click="loadData" style="margin-top: 12px;">重新加载</van-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getOrderOverview } from '@/api/order'

const route = useRoute()
const router = useRouter()
const orderNumber = decodeURIComponent(route.params.id as string)

const loading = ref(true)
const overview = ref<any>(null)

const approvalClass = (s: string) => {
  const m: Record<string, string> = { '已审批': 'status-tag--success', '待审批': 'status-tag--warning', '草稿': 'status-tag--default' }
  return m[s] || 'status-tag--default'
}

const planColor = (s: string) => {
  const m: Record<string, string> = { '进行中': 'text-primary', '已完成': 'text-success' }
  return m[s] || ''
}

const taskStatusClass = (s: string) => {
  const m: Record<string, string> = { '已完成': 'status-tag--success', '进行中': 'status-tag--primary', '未开始': 'status-tag--default' }
  return m[s] || 'status-tag--default'
}

const taskProgress = (t: any) => {
  const planned = parseFloat(t.planned_quantity) || 1
  const done = parseFloat(t.completed_quantity) || 0
  return Math.round((done / planned) * 100)
}

const formatNum = (n: any) => {
  if (n == null) return '0'
  const num = parseFloat(n)
  return isNaN(num) ? '0' : num.toLocaleString('zh-CN')
}

const loadData = async () => {
  loading.value = true
  try {
    const res: any = await getOrderOverview(orderNumber)
    if (res.success) {
      overview.value = res.data
    }
  } catch (e) {
    console.error('Failed to load overview:', e)
  } finally {
    loading.value = false
  }
}

const goMaterial = () => {
  if (overview.value?.preparation?.preparation_number) {
    router.push(`/material/${encodeURIComponent(overview.value.preparation.preparation_number)}`)
  } else {
    router.push(`/material/${encodeURIComponent(orderNumber)}?from=order`)
  }
}

const goTasks = () => {
  // 滚动到工序任务区域
  document.querySelector('.task-list')?.scrollIntoView({ behavior: 'smooth' })
}

const goReportTask = (task: any) => {
  router.push(`/report/${encodeURIComponent(task.process_task_number)}`)
}

const goProcessPrep = () => {
  router.push(`/process-prep/${encodeURIComponent(orderNumber)}`)
}

onMounted(() => {
  loadData()
  // 检查URL参数是否有tab指示
  const tab = route.query.tab as string
  if (tab === 'material') {
    setTimeout(() => goMaterial(), 500)
  }
})
</script>

<style scoped>
.page-container {
  padding: 12px 16px;
  padding-bottom: 24px;
}

.info-card {
  padding: 16px;
}

.info-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.info-card__title {
  font-size: 18px;
  font-weight: 600;
  color: var(--text-primary);
}

.info-card__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
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
  font-size: 14px;
  color: var(--text-primary);
}

.text-primary { color: var(--primary) !important; }
.text-success { color: var(--success) !important; }

/* 快捷操作 */
.action-cards {
  display: flex;
  gap: 12px;
  margin-bottom: 0;
}

.action-card {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.action-card:active {
  transform: scale(0.97);
}

.action-card__icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.action-card__info {
  flex: 1;
  min-width: 0;
}

.action-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.action-card__desc {
  font-size: 11px;
  color: var(--text-muted);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 进度卡片 */
.progress-card {
  padding: 14px 16px;
}

.progress-card__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 500;
}

.progress-card__summary {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-muted);
}

/* 区域标题 */
.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
  padding: 16px 0 8px;
}

/* 工序任务 */
.task-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.task-item:active {
  transform: scale(0.98);
}

.task-item__left {
  flex-shrink: 0;
}

.step-num {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--primary-light);
  color: var(--primary);
  font-size: 14px;
  font-weight: 700;
}

.task-item__center {
  flex: 1;
  min-width: 0;
}

.task-item__name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 6px;
}

.task-item__progress {
  display: flex;
  align-items: center;
  gap: 8px;
}

.task-item__qty {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.task-item__right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}
</style>
