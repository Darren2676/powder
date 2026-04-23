<template>
  <div class="page-container task-page">
    <!-- 页面标题 -->
    <div class="page-header">
      <h2 class="page-header__title">我的任务</h2>
    </div>

    <!-- 筛选 -->
    <div class="filter-area">
      <van-tabs v-model:active="filterStatus" @change="onFilterChange" shrink>
        <van-tab title="全部" name="" />
        <van-tab :title="`未开始 ${countByStatus('未开始')}`" name="未开始" />
        <van-tab :title="`进行中 ${countByStatus('进行中')}`" name="进行中" />
        <van-tab :title="`已完成 ${countByStatus('已完成')}`" name="已完成" />
      </van-tabs>
    </div>

    <!-- 任务列表 -->
    <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
      <van-list
        v-model:loading="loadingMore"
        :finished="finished"
        finished-text="没有更多了"
        @load="loadMore"
        :immediate-check="false"
      >
        <div class="task-list">
          <div v-for="task in tasks" :key="task.process_task_number" class="task-card card" @click="goReport(task)">
            <div class="task-card__header">
              <span class="task-card__number">{{ task.process_task_number }}</span>
              <span :class="['status-tag', statusClass(task.task_status)]">{{ task.task_status }}</span>
            </div>
            <div class="task-card__body">
              <div class="task-card__product">
                {{ task.item_name || '-' }}
                <span class="task-card__step">→ {{ task.step_number ? '第' + task.step_number + '道' : '' }} {{ task.standard_process_name || '' }}</span>
              </div>
              <div class="task-card__progress">
                <div class="progress-bar" style="height: 4px; flex: 1;">
                  <div
                    :class="['progress-bar__inner', taskProgress(task) >= 100 ? 'progress-bar__inner--success' : '']"
                    :style="{ width: Math.min(taskProgress(task), 100) + '%' }"
                  ></div>
                </div>
                <span class="task-card__qty">{{ formatNum(task.completed_quantity) }}/{{ formatNum(task.planned_quantity) }} {{ taskProgress(task) }}%</span>
              </div>
              <div class="task-card__meta">
                <span v-if="task.work_center_name">{{ task.work_center_name }}</span>
                <span v-if="task.production_order_number">单号: {{ task.production_order_number }}</span>
              </div>
            </div>
            <div class="task-card__footer" v-if="task.task_status !== '已完成'">
              <van-button size="small" type="primary" round @click.stop="goReport(task)">📝 报工</van-button>
            </div>
          </div>
        </div>

        <div v-if="!loadingMore && tasks.length === 0" class="empty-state">
          <div class="empty-state__icon">📋</div>
          <div class="empty-state__text">暂无工序任务</div>
        </div>
      </van-list>
    </van-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getProcessTasks } from '@/api/processTask'

const router = useRouter()

const filterStatus = ref('')
const tasks = ref<any[]>([])
const allTasks = ref<any[]>([])
const loadingMore = ref(false)
const refreshing = ref(false)
const finished = ref(false)
const page = ref(1)
const limit = 20

const statusClass = (s: string) => {
  const m: Record<string, string> = { '已完成': 'status-tag--success', '进行中': 'status-tag--primary', '未开始': 'status-tag--default' }
  return m[s] || 'status-tag--default'
}

const taskProgress = (t: any) => {
  const p = parseFloat(t.planned_quantity) || 1
  const d = parseFloat(t.completed_quantity) || 0
  return Math.round((d / p) * 100)
}

const formatNum = (n: any) => {
  if (n == null) return '0'
  const num = parseFloat(n)
  return isNaN(num) ? '0' : num.toLocaleString('zh-CN')
}

const countByStatus = (status: string) => {
  return allTasks.value.filter(t => t.task_status === status).length
}

const fetchTasks = async (isRefresh = false) => {
  if (isRefresh) {
    page.value = 1
    finished.value = false
  }
  loadingMore.value = true
  try {
    const res: any = await getProcessTasks({
      page: page.value,
      limit,
      task_status: filterStatus.value || undefined
    })
    if (res.success) {
      const items = res.data?.items || res.data || []
      if (isRefresh) {
        tasks.value = items
      } else {
        tasks.value.push(...items)
      }
      const total = res.data?.total ?? 0
      if (tasks.value.length >= total || items.length < limit) {
        finished.value = true
      }
    }
  } catch (e) {
    console.error('Failed to load tasks:', e)
  } finally {
    loadingMore.value = false
    refreshing.value = false
  }
}

// 加载所有任务用于计数
const fetchAllForCount = async () => {
  try {
    const res: any = await getProcessTasks({ page: 1, limit: 999 })
    if (res.success) {
      allTasks.value = res.data?.items || res.data || []
    }
  } catch (e) { /* ignore */ }
}

const loadMore = () => {
  page.value++
  fetchTasks()
}

const onRefresh = () => {
  fetchTasks(true)
  fetchAllForCount()
}

const onFilterChange = () => {
  fetchTasks(true)
}

const goReport = (task: any) => {
  router.push(`/report/${encodeURIComponent(task.process_task_number)}`)
}

onMounted(() => {
  fetchTasks(true)
  fetchAllForCount()
})
</script>

<style scoped>
.task-page {
  padding-bottom: 16px;
}

.page-header {
  padding: 16px 16px 8px;
  padding-top: calc(16px + env(safe-area-inset-top));
}

.page-header__title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-primary);
}

.filter-area {
  padding: 0 16px;
  margin-bottom: 4px;
}

.task-list {
  padding: 8px 16px;
}

.task-card {
  padding: 14px 16px;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.task-card:active {
  transform: scale(0.98);
}

.task-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.task-card__number {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.task-card__product {
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.task-card__step {
  color: var(--primary);
  font-weight: 500;
}

.task-card__progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.task-card__qty {
  font-size: 12px;
  color: var(--text-muted);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.task-card__meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-muted);
}

.task-card__footer {
  border-top: 1px solid var(--border-color);
  padding-top: 10px;
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
}
</style>
