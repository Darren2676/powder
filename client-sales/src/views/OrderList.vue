<template>
  <div class="order-list">
    <van-nav-bar title="销售订单" left-arrow @click-left="router.push('/home')" />

    <van-search v-model="searchText" placeholder="搜索订单号/客户名" @search="handleSearch" />

    <van-tabs v-model:active="activeTab" @change="handleTabChange">
      <van-tab title="全部" name="" />
      <van-tab title="草稿" name="草稿" />
      <van-tab title="待审批" name="待审批" />
      <van-tab title="已审批" name="已审批" />
      <van-tab title="已完成" name="已完成" />
    </van-tabs>

    <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
      <van-list v-model:loading="loading" :finished="finished" finished-text="没有更多了" @load="onLoad">
        <van-empty v-if="!loading && list.length === 0" description="暂无订单" />
        <div v-for="item in list" :key="item.sales_order_number" class="order-card" @click="goDetail(item)">
          <div class="order-card__header">
            <span class="order-card__no">{{ item.sales_order_number }}</span>
            <van-tag :type="statusType(item.approval_status)">{{ item.approval_status }}</van-tag>
          </div>
          <div class="order-card__body">
            <div>{{ item.customer_name || '-' }}</div>
            <div class="order-card__info">
              <span>订单日期: {{ item.order_date || '-' }}</span>
              <span>交货日期: {{ item.delivery_date || '-' }}</span>
            </div>
          </div>
        </div>
      </van-list>
    </van-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { getSalesOrders } from '@/api/salesOrder'

const router = useRouter()
const route = useRoute()

const searchText = ref('')
const activeTab = ref('')
const list = ref<any[]>([])
const loading = ref(false)
const finished = ref(false)
const refreshing = ref(false)
const page = ref(1)
const pageSize = 20

function statusType(status: string): 'default' | 'success' | 'warning' | 'danger' | 'primary' {
  const map: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'primary'> = { '草稿': 'default', '待审批': 'warning', '已审批': 'success', '已撤回': 'danger', '已完成': 'primary' }
  return map[status] || 'default'
}

async function fetchList(reset = false) {
  if (reset) { page.value = 1; list.value = []; finished.value = false }
  loading.value = true
  try {
    const params: any = { page: page.value, limit: pageSize }
    if (searchText.value) params.search = searchText.value
    if (activeTab.value) params.approval_status = activeTab.value
    const res: any = await getSalesOrders(params)
    if (res.success) {
      const items = res.data.items || []
      if (reset) list.value = items
      else list.value.push(...items)
      finished.value = items.length < pageSize
      page.value++
    }
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const onLoad = () => fetchList()
const onRefresh = () => { refreshing.value = true; fetchList(true) }
const handleSearch = () => fetchList(true)
const handleTabChange = () => fetchList(true)
const goDetail = (item: any) => router.push(`/order/${item.sales_order_number}`)

onMounted(() => {
  const tab = route.query.tab as string
  if (tab) activeTab.value = tab
  fetchList(true)
})
</script>

<style scoped>
.order-list { background: #f5f5f5; min-height: 100vh; }
.order-card {
  margin: 8px 12px; padding: 12px; background: #fff; border-radius: 8px;
}
.order-card__header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.order-card__no { font-size: 15px; font-weight: 600; color: #333; }
.order-card__body { font-size: 14px; color: #666; }
.order-card__info { display: flex; gap: 16px; margin-top: 6px; font-size: 12px; color: #999; }
</style>
