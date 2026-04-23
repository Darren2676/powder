<template>
  <div class="page-container">
    <van-nav-bar
      title="扫码报工"
      left-arrow
      @click-left="router.back()"
      fixed
      placeholder
    />

    <!-- 搜索区域 -->
    <div class="search-area">
      <div class="search-row">
        <van-search
          v-model="searchText"
          shape="round"
          placeholder="输入生产单号..."
          @search="onSearch"
          @clear="onClear"
          class="search-input"
        />
        <van-button class="scan-btn" type="primary" icon="scan" round @click="openScanner">
          扫码
        </van-button>
      </div>
    </div>

    <!-- 扫码弹窗 -->
    <van-popup v-model:show="scannerVisible" position="bottom" round :style="{ height: '70%' }" @closed="onScannerClosed">
      <div class="scanner-container">
        <div class="scanner-header">
          <span class="scanner-title">扫描生产调度单二维码</span>
          <van-icon name="cross" size="20" @click="closeScanner" />
        </div>
        <div id="qr-reader-report" class="scanner-view"></div>
        <div class="scanner-hint">请将摄像头对准生产调度单上的二维码</div>
      </div>
    </van-popup>

    <!-- 列表区域 -->
    <div class="order-list">
      <van-pull-refresh v-model="refreshing" @refresh="onRefresh">
        <van-list
          v-model:loading="loading"
          :finished="finished"
          finished-text="没有更多了"
          @load="loadMore"
          :immediate-check="false"
        >
          <div
            v-for="order in orders"
            :key="order.production_order_number"
            class="order-card card"
            @click="goOrderReport(order)"
          >
            <div class="order-card__header">
              <span class="order-card__number">{{ order.production_order_number }}</span>
              <span :class="['status-tag', statusClass(order.plan_status)]">{{ order.plan_status }}</span>
            </div>
            <div class="order-card__body">
              <div class="order-card__product">
                <span class="product-name">{{ order.item_name || '-' }}</span>
                <span v-if="order.specifications" class="product-spec">{{ order.specifications }}</span>
              </div>
              <div class="order-card__info">
                <div class="info-item">
                  <span class="info-label">计划数量</span>
                  <span class="info-value num-highlight">{{ formatNum(order.planned_quantity) }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">生产日期</span>
                  <span class="info-value">{{ formatDate(order.production_date) }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">工序进度</span>
                  <span class="info-value">
                    <b :style="{ color: order.task_count > 0 && order.completed_task_count >= order.task_count ? 'var(--success)' : 'var(--primary)' }">{{ order.completed_task_count || 0 }}</b>/{{ order.task_count || 0 }}道
                  </span>
                </div>
                <div class="info-item">
                  <span class="info-label">产品编号</span>
                  <span class="info-value">{{ order.item_number || '-' }}</span>
                </div>
              </div>
            </div>
            <div class="order-card__footer">
              <van-button size="small" type="primary" block round @click.stop="goOrderReport(order)">
                开始报工
              </van-button>
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="!loading && orders.length === 0" class="empty-state">
            <div class="empty-state__icon">📋</div>
            <div class="empty-state__text">暂无可报工的生产单</div>
            <div class="empty-state__hint">显示已派发、已备料、生产中的生产单</div>
          </div>
        </van-list>
      </van-pull-refresh>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { Html5Qrcode } from 'html5-qrcode'
import { getOrdersForReport } from '@/api/processTask'

const router = useRouter()

const searchText = ref('')
const orders = ref<any[]>([])
const loading = ref(false)
const finished = ref(false)
const refreshing = ref(false)
const page = ref(1)
const limit = 15

// 扫码相关
const scannerVisible = ref(false)
let html5QrCode: Html5Qrcode | null = null

const formatNum = (n: any) => {
  if (n == null) return '-'
  const num = parseFloat(n)
  return isNaN(num) ? '-' : num.toLocaleString('zh-CN')
}

const formatDate = (d: any) => {
  if (!d) return '-'
  const s = String(d)
  // 处理 YYYY/MM/DD 或 YYYY-MM-DD 格式
  return s.length >= 10 ? s.substring(0, 10).replace(/\//g, '-') : s
}

const statusClass = (s: string) => {
  const m: Record<string, string> = {
    '已派发': 'status-tag--primary',
    '已备料': 'status-tag--success',
    '生产中': 'status-tag--warning'
  }
  return m[s] || 'status-tag--default'
}

const fetchOrders = async (isRefresh = false) => {
  if (isRefresh) {
    page.value = 1
    finished.value = false
  }

  loading.value = true
  try {
    const res: any = await getOrdersForReport({
      page: page.value,
      limit,
      search: searchText.value || undefined
    })

    if (res.success) {
      const items = res.data?.items || res.data || []
      if (isRefresh) {
        orders.value = items
      } else {
        orders.value.push(...items)
      }

      const total = res.data?.pagination?.total ?? 0
      if (orders.value.length >= total || items.length < limit) {
        finished.value = true
      }
    }
  } catch (e) {
    console.error('Failed to load orders:', e)
  } finally {
    loading.value = false
    refreshing.value = false
  }
}

const loadMore = () => {
  page.value++
  fetchOrders()
}

const onRefresh = () => {
  fetchOrders(true)
}

const onSearch = () => {
  fetchOrders(true)
}

const onClear = () => {
  searchText.value = ''
  fetchOrders(true)
}

// 扫码功能
const openScanner = async () => {
  scannerVisible.value = true
  await nextTick()
  setTimeout(() => startScanner(), 300)
}

const startScanner = async () => {
  try {
    html5QrCode = new Html5Qrcode('qr-reader-report')
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        onScanSuccess(decodedText)
      },
      () => {}
    )
  } catch (err) {
    console.error('Scanner error:', err)
    showToast({ message: '无法启动摄像头，请检查权限', type: 'fail' })
    scannerVisible.value = false
  }
}

const onScanSuccess = (decodedText: string) => {
  stopScanner()
  scannerVisible.value = false

  let orderNo = decodedText.trim()
  try {
    const parsed = JSON.parse(orderNo)
    if (parsed.production_order_number) {
      orderNo = parsed.production_order_number
    } else if (parsed.orderNo) {
      orderNo = parsed.orderNo
    }
  } catch {
    // 不是JSON，使用原文本
  }

  if (orderNo) {
    showToast({ message: `已识别: ${orderNo}`, type: 'success' })
    router.push(`/scan-report/${encodeURIComponent(orderNo)}`)
  } else {
    showToast({ message: '无法识别二维码内容', type: 'fail' })
  }
}

const stopScanner = async () => {
  if (html5QrCode) {
    try {
      const state = html5QrCode.getState()
      if (state === 2) {
        await html5QrCode.stop()
      }
    } catch {
      // ignore
    }
    html5QrCode = null
  }
}

const closeScanner = () => {
  stopScanner()
  scannerVisible.value = false
}

const onScannerClosed = () => {
  stopScanner()
}

const goOrderReport = (order: any) => {
  router.push(`/scan-report/${encodeURIComponent(order.production_order_number)}`)
}

onMounted(() => {
  fetchOrders(true)
})

onBeforeUnmount(() => {
  stopScanner()
})
</script>

<style scoped>
.page-container {
  background: var(--bg-page);
  min-height: 100vh;
}

.search-area {
  padding: 8px 16px;
  background: var(--bg-card);
}

.search-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-input {
  flex: 1;
  min-width: 0;
}

.search-input :deep(.van-search) {
  padding: 0;
  background: transparent;
}

.scan-btn {
  flex-shrink: 0;
  height: 36px;
  font-size: 13px;
  padding: 0 14px;
}

.scan-btn :deep(.van-icon) {
  margin-right: 2px;
}

.scanner-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.scanner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px;
  font-size: 16px;
  font-weight: 600;
}

.scanner-title {
  color: var(--text-primary);
}

.scanner-view {
  flex: 1;
  margin: 0 16px;
  border-radius: 8px;
  overflow: hidden;
  background: #000;
}

.scanner-hint {
  text-align: center;
  padding: 16px;
  font-size: 13px;
  color: var(--text-muted);
}

.order-list {
  padding: 12px 16px;
}

.order-card {
  padding: 14px 16px;
  cursor: pointer;
  transition: transform 0.15s ease;
}

.order-card:active {
  transform: scale(0.98);
}

.order-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.order-card__number {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-primary);
}

.order-card__body {
  margin-bottom: 12px;
}

.order-card__product {
  margin-bottom: 8px;
}

.product-name {
  font-size: 14px;
  color: var(--text-primary);
  font-weight: 500;
}

.product-spec {
  margin-left: 8px;
  font-size: 12px;
  color: var(--text-muted);
  background: #f5f5f5;
  padding: 1px 6px;
  border-radius: 3px;
}

.order-card__info {
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

.order-card__footer {
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}

.empty-state__hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 4px;
}
</style>
