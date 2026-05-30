<template>
  <div class="shipping-summary">
    <van-nav-bar title="发货按订单汇总表" left-arrow @click-left="router.push('/home')" />

    <!-- 日期范围选择 -->
    <div class="date-filter">
      <van-cell title="开始日期" :value="startDate || '请选择'" is-link @click="showStartPicker = true" />
      <van-cell title="结束日期" :value="endDate || '请选择'" is-link @click="showEndPicker = true" />
      <div class="date-filter__btns">
        <van-button size="small" type="primary" @click="fetchList(true)">查询</van-button>
        <van-button size="small" @click="resetDate">重置</van-button>
      </div>
    </div>

    <!-- 搜索 -->
    <van-search v-model="searchText" placeholder="搜索订单号/客户/物料" @search="handleSearch" />

    <!-- 汇总卡片列表 -->
    <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
      <van-list v-model:loading="loading" :finished="finished" finished-text="没有更多了" @load="onLoad">
        <van-empty v-if="!loading && list.length === 0" description="暂无数据" />
        <div v-for="item in list" :key="item._row_num" class="summary-card">
          <div class="summary-card__header">
            <span class="summary-card__order">{{ item.sales_order_number }}</span>
            <span class="summary-card__date">{{ fmtDate(item.order_date) }}</span>
          </div>
          <div class="summary-card__body">
            <div class="summary-card__row">
              <span class="summary-card__label">客户</span>
              <span>{{ item.customer_name || '-' }}</span>
            </div>
            <div class="summary-card__row">
              <span class="summary-card__label">物料</span>
              <span>{{ item.item_number }} - {{ item.item_name }}</span>
            </div>
            <div class="summary-card__row" v-if="item.specifications">
              <span class="summary-card__label">规格</span>
              <span>{{ item.specifications }}</span>
            </div>
            <div class="summary-card__nums">
              <div class="summary-card__num">
                <div class="summary-card__num-val">{{ item.order_quantity }}</div>
                <div class="summary-card__num-label">订单数量</div>
              </div>
              <div class="summary-card__num summary-card__num--green">
                <div class="summary-card__num-val">{{ item.shipped_qty }}</div>
                <div class="summary-card__num-label">已发数量</div>
              </div>
              <div class="summary-card__num summary-card__num--red">
                <div class="summary-card__num-val">{{ item.returned_qty }}</div>
                <div class="summary-card__num-label">已退数量</div>
              </div>
              <div class="summary-card__num summary-card__num--blue">
                <div class="summary-card__num-val">{{ item.net_shipped_qty }}</div>
                <div class="summary-card__num-label">实发数量</div>
              </div>
            </div>
            <div class="summary-card__rates">
              <span>发货率: <b :class="rateClass(Number(item.ship_rate))">{{ item.ship_rate }}%</b></span>
              <span>退货率: <b :class="returnRateClass(Number(item.return_rate))">{{ item.return_rate }}%</b></span>
            </div>
          </div>
        </div>
      </van-list>
    </van-pull-refresh>

    <!-- 日期选择器 -->
    <van-popup v-model:show="showStartPicker" position="bottom" round>
      <van-date-picker v-model="startDateVal" title="开始日期" @confirm="onStartConfirm" @cancel="showStartPicker = false" />
    </van-popup>
    <van-popup v-model:show="showEndPicker" position="bottom" round>
      <van-date-picker v-model="endDateVal" title="结束日期" @confirm="onEndConfirm" @cancel="showEndPicker = false" />
    </van-popup>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import dayjs from 'dayjs'
import { getShippingByOrderSummary } from '@/api/salesOrder'

const router = useRouter()

// 日期范围
const startDate = ref(dayjs().subtract(3, 'month').format('YYYY-MM-DD'))
const endDate = ref(dayjs().format('YYYY-MM-DD'))
const showStartPicker = ref(false)
const showEndPicker = ref(false)
const startDateVal = ref(startDate.value.split('-'))
const endDateVal = ref(endDate.value.split('-'))

function onStartConfirm({ selectedValues }: any) {
  startDate.value = selectedValues.join('-')
  showStartPicker.value = false
}
function onEndConfirm({ selectedValues }: any) {
  endDate.value = selectedValues.join('-')
  showEndPicker.value = false
}
function resetDate() {
  startDate.value = dayjs().subtract(3, 'month').format('YYYY-MM-DD')
  endDate.value = dayjs().format('YYYY-MM-DD')
  startDateVal.value = startDate.value.split('-')
  endDateVal.value = endDate.value.split('-')
  fetchList(true)
}

// 列表
const searchText = ref('')
const list = ref<any[]>([])
const loading = ref(false)
const finished = ref(false)
const refreshing = ref(false)
const page = ref(1)
const pageSize = 20

function fmtDate(d: string | null | undefined): string {
  if (!d) return '-'
  return d.slice(0, 10)
}

function rateClass(rate: number): string {
  if (rate >= 100) return 'rate-success'
  if (rate >= 80) return 'rate-processing'
  if (rate >= 50) return 'rate-warning'
  return 'rate-default'
}

function returnRateClass(rate: number): string {
  if (rate === 0) return 'rate-default'
  if (rate < 3) return 'rate-success'
  if (rate <= 10) return 'rate-warning'
  return 'rate-error'
}

async function fetchList(reset = false) {
  if (reset) { page.value = 1; list.value = []; finished.value = false }
  loading.value = true
  try {
    const params: any = {
      page: page.value,
      limit: pageSize,
      start_date: startDate.value,
      end_date: endDate.value
    }
    if (searchText.value) params.search = searchText.value
    const res: any = await getShippingByOrderSummary(params)
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

onMounted(() => fetchList(true))
</script>

<style scoped>
.shipping-summary { background: #f5f5f5; min-height: 100vh; }

.date-filter { background: #fff; padding: 8px 16px; }
.date-filter__btns { display: flex; gap: 8px; margin-top: 8px; }

.summary-card {
  margin: 8px 12px; padding: 12px; background: #fff; border-radius: 8px;
}
.summary-card__header {
  display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;
}
.summary-card__order { font-size: 15px; font-weight: 600; color: #333; }
.summary-card__date { font-size: 12px; color: #999; }
.summary-card__body { font-size: 14px; color: #666; }
.summary-card__row { display: flex; gap: 8px; margin-bottom: 4px; }
.summary-card__label { color: #999; min-width: 36px; flex-shrink: 0; }

.summary-card__nums {
  display: flex; gap: 0; margin: 10px 0 8px; background: #f7f8fa; border-radius: 8px; overflow: hidden;
}
.summary-card__num {
  flex: 1; text-align: center; padding: 8px 4px;
}
.summary-card__num-val { font-size: 16px; font-weight: 700; color: #333; }
.summary-card__num--green .summary-card__num-val { color: #52c41a; }
.summary-card__num--red .summary-card__num-val { color: #ff4d4f; }
.summary-card__num--blue .summary-card__num-val { color: #1677ff; }
.summary-card__num-label { font-size: 11px; color: #999; margin-top: 2px; }

.summary-card__rates {
  display: flex; gap: 16px; font-size: 13px; color: #666;
}
.rate-success { color: #52c41a; }
.rate-processing { color: #1677ff; }
.rate-warning { color: #fa8c16; }
.rate-default { color: #8c8c8c; }
.rate-error { color: #ff4d4f; }
</style>
