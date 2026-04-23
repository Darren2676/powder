<template>
  <div class="page-container">
    <van-nav-bar
      title="报工历史"
      left-arrow
      @click-left="router.back()"
      fixed
      placeholder
    />

    <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
      <van-list
        v-model:loading="loading"
        :finished="finished"
        finished-text="没有更多了"
        @load="loadMore"
        :immediate-check="false"
      >
        <div class="history-list">
          <div v-for="report in reports" :key="report.work_report_number" class="history-item card">
            <div class="history-item__header">
              <span class="history-item__number">{{ report.work_report_number }}</span>
              <span :class="['status-tag', approvalClass(report.approval_status)]">{{ report.approval_status }}</span>
            </div>
            <div class="history-item__body">
              <div class="history-item__product">
                {{ report.item_name || '-' }} → {{ report.standard_process_name || '' }}
              </div>
              <div class="history-item__grid">
                <div class="info-item">
                  <span class="info-label">合格</span>
                  <span class="info-value" style="color: var(--success); font-weight: 600;">{{ report.qualified_quantity || 0 }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">不合格</span>
                  <span class="info-value" style="color: var(--danger); font-weight: 600;">{{ report.unqualified_quantity || 0 }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">报工日期</span>
                  <span class="info-value">{{ report.report_date || '-' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">操作员</span>
                  <span class="info-value">{{ report.operator_name || '-' }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-if="!loading && reports.length === 0" class="empty-state">
          <div class="empty-state__icon">📋</div>
          <div class="empty-state__text">暂无报工记录</div>
        </div>
      </van-list>
    </van-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getWorkReports } from '@/api/workReport'

const router = useRouter()
const reports = ref<any[]>([])
const loading = ref(false)
const refreshing = ref(false)
const finished = ref(false)
const page = ref(1)
const limit = 20

const approvalClass = (s: string) => {
  const m: Record<string, string> = { '已审批': 'status-tag--success', '待审批': 'status-tag--warning', '草稿': 'status-tag--default' }
  return m[s] || 'status-tag--default'
}

const fetchReports = async (isRefresh = false) => {
  if (isRefresh) {
    page.value = 1
    finished.value = false
  }
  loading.value = true
  try {
    const res: any = await getWorkReports({ page: page.value, limit })
    if (res.success) {
      const items = res.data?.items || res.data || []
      if (isRefresh) {
        reports.value = items
      } else {
        reports.value.push(...items)
      }
      const total = res.data?.total ?? 0
      if (reports.value.length >= total || items.length < limit) {
        finished.value = true
      }
    }
  } catch (e) {
    console.error('Failed to load reports:', e)
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const loadMore = () => {
  page.value++
  fetchReports()
}

const onRefresh = () => {
  fetchReports(true)
}

onMounted(() => {
  fetchReports(true)
})
</script>

<style scoped>
.page-container {
  padding-bottom: 16px;
}

.history-list {
  padding: 12px 16px;
}

.history-item {
  padding: 14px 16px;
}

.history-item__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.history-item__number {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.history-item__product {
  font-size: 14px;
  color: var(--text-primary);
  margin-bottom: 8px;
}

.history-item__grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 16px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-label {
  font-size: 12px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.info-value {
  font-size: 13px;
  color: var(--text-secondary);
}
</style>
