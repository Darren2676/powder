<template>
  <div class="home-page">
    <div class="home-header">
      <span class="greeting">{{ greeting }}，</span>
      <span class="user-name">{{ authStore.user?.real_name || authStore.user?.username || '' }}</span>
    </div>

    <div class="action-grid">
      <div class="action-btn" @click="goCreate">
        <van-icon name="add-o" class="action-btn__icon" />
        <span class="action-btn__text">新建订单</span>
      </div>
      <div class="action-btn action-btn--list" @click="goList">
        <van-icon name="orders-o" class="action-btn__icon" />
        <span class="action-btn__text">订单列表</span>
      </div>
      <div class="action-btn action-btn--ship" @click="goShipping">
        <van-icon name="logistics" class="action-btn__icon" />
        <span class="action-btn__text">发货单查询</span>
      </div>
      <div class="action-btn action-btn--summary" @click="goSummary">
        <van-icon name="chart-trending-o" class="action-btn__icon" />
        <span class="action-btn__text">发货汇总表</span>
      </div>
    </div>

    <div class="todo-section">
      <h3>待办事项</h3>
      <van-cell-group inset>
        <van-cell title="待审批订单" :value="pendingCount + ' 条'" is-link to="/orders?tab=待审批" />
        <van-cell title="已审批订单" :value="approvedCount + ' 条'" is-link to="/orders?tab=已审批" />
      </van-cell-group>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth'
import { getSalesOrders } from '@/api/salesOrder'

const router = useRouter()
const authStore = useAuthStore()

const pendingCount = ref(0)
const approvedCount = ref(0)

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

const goCreate = () => router.push('/order-create')
const goList = () => router.push('/orders')
const goShipping = () => router.push('/shipping')
const goSummary = () => router.push('/shipping-summary')

async function fetchStats() {
  try {
    const [res1, res2]: any[] = await Promise.all([
      getSalesOrders({ approval_status: '待审批', limit: 1 }),
      getSalesOrders({ approval_status: '已审批', limit: 1 })
    ])
    pendingCount.value = res1?.data?.pagination?.total ?? 0
    approvedCount.value = res2?.data?.pagination?.total ?? 0
  } catch {}
}

onMounted(fetchStats)
</script>

<style scoped>
.home-page { padding: 16px; }
.home-header { margin-bottom: 24px; padding: 12px 0; }
.greeting { font-size: 18px; color: #666; }
.user-name { font-size: 18px; font-weight: 600; }

.action-grid { display: flex; gap: 12px; margin-bottom: 24px; }
.action-btn {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 24px 12px; border-radius: 12px; background: #1989fa; color: #fff; cursor: pointer;
}
.action-btn--list { background: #07c160; }
.action-btn--ship { background: #ff976a; }
.action-btn--summary { background: #7b68ee; }
.action-btn__icon { font-size: 32px; margin-bottom: 8px; }
.action-btn__text { font-size: 14px; }

.todo-section h3 { font-size: 16px; margin: 0 0 12px 8px; color: #333; }
</style>
