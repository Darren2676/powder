<template>
  <div class="shipping-list">
    <van-nav-bar title="发货单查询" left-arrow @click-left="router.push('/home')" />

    <van-search v-model="searchText" placeholder="搜索发货单号/客户/承运商" @search="handleSearch" />

    <van-tabs v-model:active="activeTab" @change="handleTabChange">
      <van-tab title="全部" name="" />
      <van-tab title="待发货" name="待发货" />
      <van-tab title="已发货" name="已发货" />
      <van-tab title="已签收" name="已签收" />
      <van-tab title="已取消" name="已取消" />
    </van-tabs>

    <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
      <van-list v-model:loading="loading" :finished="finished" finished-text="没有更多了" @load="onLoad">
        <van-empty v-if="!loading && list.length === 0" description="暂无发货单" />
        <div v-for="item in list" :key="item.shipping_order_number" class="ship-card" @click="goDetail(item)">
          <div class="ship-card__header">
            <span class="ship-card__no">{{ item.shipping_order_number }}</span>
            <van-tag :type="statusType(item.status)">{{ item.status }}</van-tag>
          </div>
          <div class="ship-card__body">
            <div class="ship-card__row">
              <span class="ship-card__label">客户</span>
              <span>{{ item.customer_name || '-' }}</span>
            </div>
            <div class="ship-card__row">
              <span class="ship-card__label">承运商</span>
              <span>{{ item.carrier || '-' }}</span>
            </div>
            <div class="ship-card__info">
              <span>创建: {{ formatDate(item.creation_date) }}</span>
              <span>发货: {{ formatDate(item.shipping_date) }}</span>
            </div>
          </div>
        </div>
      </van-list>
    </van-pull-refresh>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { getShippingOrders } from '@/api/salesOrder'

const router = useRouter()

const searchText = ref('')
const activeTab = ref('')
const list = ref<any[]>([])
const loading = ref(false)
const finished = ref(false)
const refreshing = ref(false)
const page = ref(1)
const pageSize = 20

function statusType(status: string): 'default' | 'success' | 'warning' | 'danger' | 'primary' {
  const map: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'primary'> = {
    '待发货': 'warning',
    '已发货': 'primary',
    '已签收': 'success',
    '已取消': 'danger'
  }
  return map[status] || 'default'
}

function formatDate(d: string | null | undefined): string {
  if (!d) return '-'
  return d.slice(0, 10)
}

async function fetchList(reset = false) {
  if (reset) { page.value = 1; list.value = []; finished.value = false }
  loading.value = true
  try {
    const params: any = { page: page.value, limit: pageSize }
    if (searchText.value) params.search = searchText.value
    if (activeTab.value) params.status = activeTab.value
    const res: any = await getShippingOrders(params)
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
const goDetail = (item: any) => router.push(`/shipping/${item.shipping_order_number}`)

onMounted(() => fetchList(true))
</script>

<style scoped>
.shipping-list { background: #f5f5f5; min-height: 100vh; }
.ship-card {
  margin: 8px 12px; padding: 12px; background: #fff; border-radius: 8px;
}
.ship-card__header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;
}
.ship-card__no { font-size: 15px; font-weight: 600; color: #333; }
.ship-card__body { font-size: 14px; color: #666; }
.ship-card__row { display: flex; gap: 8px; margin-bottom: 4px; }
.ship-card__label { color: #999; min-width: 48px; flex-shrink: 0; }
.ship-card__info {
  display: flex; gap: 16px; margin-top: 6px; font-size: 12px; color: #999;
}
</style>
