<template>
  <div class="page-container">
    <van-nav-bar
      title="委外收回"
      left-arrow
      @click-left="router.back()"
      fixed
      placeholder
    >
      <template #right>
        <van-icon name="scan" size="24" @click="openScanner" />
      </template>
    </van-nav-bar>

    <!-- 扫码弹窗 -->
    <van-popup v-model:show="scannerVisible" position="bottom" round :style="{ height: '70%' }">
      <div class="scanner-container">
        <div class="scanner-header">
          <span class="scanner-title">扫描二维码</span>
          <van-icon name="cross" size="20" @click="closeScanner" />
        </div>
        <div id="qr-reader-receipt" class="scanner-view"></div>
        <div class="scanner-hint">将摄像头对准二维码</div>
      </div>
    </van-popup>

    <!-- 搜索区域 -->
    <div class="search-area">
      <van-search
        v-model="orderNumber"
        shape="round"
        placeholder="输入委外订单号"
        @search="loadOrder"
      >
        <template #action>
          <van-button size="small" type="primary" @click="loadOrder">查询</van-button>
        </template>
      </van-search>
    </div>

    <!-- 订单信息 -->
    <div v-if="orderInfo" class="order-info card">
      <van-cell-group inset>
        <van-cell title="委外订单号" :value="orderInfo.order_number" />
        <van-cell title="供应商" :value="orderInfo.supplier_name" />
        <van-cell title="产品" :value="`${orderInfo.item_name} (${orderInfo.specifications})`" />
        <van-cell title="计划数量" :value="formatNum(orderInfo.planned_quantity)" />
        <van-cell title="已收回数量" :value="formatNum(orderInfo.received_quantity)" />
        <van-cell title="收回状态">
          <template #value>
            <van-tag :type="getStatusType(orderInfo.receipt_status)">{{ orderInfo.receipt_status }}</van-tag>
          </template>
        </van-cell>
      </van-cell-group>
      
      <!-- 进度条 -->
      <div class="progress-bar">
        <div class="progress-label">收回进度</div>
        <van-progress
          :percentage="getProgressPercent()"
          stroke-width="8"
          :show-pivot="true"
          :pivot-text="`${orderInfo.received_quantity}/${orderInfo.planned_quantity}`"
        />
      </div>
    </div>

    <!-- 物料清单 -->
    <div v-if="orderInfo && orderInfo.items.length > 0" class="items-list">
      <div class="section-title">📋 物料清单</div>
      
      <van-cell-group inset v-for="item in orderInfo.items" :key="item.item_number">
        <van-cell :title="item.item_name" :label="`${item.item_number} | ${item.specifications}`">
          <template #value>
            <div class="item-quantity">
              <span class="label">应收:</span>
              <span class="value">{{ formatNum(item.planned_quantity) }}</span>
              <span class="label ml-2">实收:</span>
              <van-stepper
                v-model="item.received_qty"
                :max="item.remaining_quantity"
                :min="0"
                :step="1"
                integer
                theme="round"
                button-size="22"
                input-width="40"
                @change="onQuantityChange"
              />
            </div>
          </template>
        </van-cell>
      </van-cell-group>
    </div>

    <!-- 底部操作栏 -->
    <div v-if="orderInfo" class="bottom-bar">
      <van-button size="small" type="default" icon="photograph" @click="takePhoto">
        📸 拍照
      </van-button>
      <van-button type="primary" block :disabled="!canSubmit" @click="submitReceipt">
        确认收回 ({{ getTotalReceived() }}/{{ getTotalPlanned() }})
      </van-button>
    </div>

    <!-- 空状态 -->
    <van-empty v-if="!orderInfo && !loading" description="请输入或扫描委外订单号" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showLoadingToast, closeToast, showSuccessToast, showDialog } from 'vant'
import { Html5Qrcode } from 'html5-qrcode'
import axios from 'axios'

const router = useRouter()

// 数据
const orderNumber = ref('')
const orderInfo = ref<any>(null)
const loading = ref(false)
const scannerVisible = ref(false)
let qrReader: Html5Qrcode | null = null

// 加载订单
const loadOrder = async () => {
  if (!orderNumber.value) {
    showToast('请输入订单号')
    return
  }

  loading.value = true
  showLoadingToast({ message: '加载中...', forbidClick: true })

  try {
    const res = await axios.get(`/api/mobile/outsourcing/receipt/${orderNumber.value}`)
    if (res.data.success) {
      orderInfo.value = res.data.data
      // 初始化实收数量
      orderInfo.value.items.forEach((item: any) => {
        item.received_qty = 0
      })
      showSuccessToast('加载成功')
    } else {
      showToast(res.data.message || '加载失败')
    }
  } catch (error: any) {
    showToast(error.response?.data?.message || '加载失败')
  } finally {
    loading.value = false
    closeToast()
  }
}

// 扫码
const openScanner = () => {
  scannerVisible.value = true
  setTimeout(() => {
    qrReader = new Html5Qrcode('qr-reader-receipt')
    qrReader.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        onScanSuccess(decodedText)
        closeScanner()
      },
      () => {}
    )
  }, 300)
}

const closeScanner = () => {
  scannerVisible.value = false
  if (qrReader) {
    qrReader.stop().catch(() => {})
    qrReader = null
  }
}

const onScanSuccess = async (decodedText: string) => {
  try {
    const data = JSON.parse(decodedText)
    if (data.type === 'outsourcing_order' || data.t === 'os') {
      orderNumber.value = data.number || data.n
      await loadOrder()
    } else if (data.type === 'item' || data.t === 'item') {
      // 扫描物料条码
      const itemNumber = data.number || data.n
      const item = orderInfo.value?.items.find((i: any) => i.item_number === itemNumber)
      if (item) {
        item.received_qty = item.remaining_quantity
        showToast(`已填充 ${item.item_name} 数量`)
      } else {
        showToast('物料不在订单中')
      }
    } else {
      showToast('二维码格式错误')
    }
  } catch (e) {
    showToast('二维码解析失败')
  }
}

// 数量变化
const onQuantityChange = () => {
  // 可以在这里添加语音提示
}

// 计算属性
const canSubmit = computed(() => {
  if (!orderInfo.value) return false
  return getTotalReceived() > 0
})

const getTotalReceived = () => {
  if (!orderInfo.value) return 0
  return orderInfo.value.items.reduce((sum: number, item: any) => sum + (item.received_qty || 0), 0)
}

const getTotalPlanned = () => {
  if (!orderInfo.value) return 0
  return orderInfo.value.items.reduce((sum: number, item: any) => sum + item.remaining_quantity, 0)
}

const getProgressPercent = () => {
  if (!orderInfo.value) return 0
  return Math.round((orderInfo.value.received_quantity / orderInfo.value.planned_quantity) * 100)
}

const getStatusType = (status: string) => {
  const map: any = {
    '未收回': 'default',
    '部分收回': 'warning',
    '已收回': 'success'
  }
  return map[status] || 'default'
}

const formatNum = (num: number) => {
  return num ? num.toFixed(2) : '0'
}

// 提交收回
const submitReceipt = async () => {
  if (!orderInfo.value) return

  const items = orderInfo.value.items
    .filter((item: any) => item.received_qty > 0)
    .map((item: any) => ({
      item_number: item.item_number,
      received_quantity: item.received_qty
    }))

  if (items.length === 0) {
    showToast('请输入收回数量')
    return
  }

  try {
    await showDialog({
      title: '确认收回',
      message: `确认收回 ${getTotalReceived()} 件？\n收回后将自动创建质检单`,
      showCancelButton: true
    })

    showLoadingToast({ message: '提交中...', forbidClick: true })

    const res = await axios.post('/api/mobile/outsourcing/receipt', {
      order_number: orderInfo.value.order_number,
      items,
      remark: '移动端收回'
    })

    if (res.data.success) {
      showSuccessToast(res.data.message || '收回成功')
      setTimeout(() => {
        router.back()
      }, 1500)
    } else {
      showToast(res.data.message || '收回失败')
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      showToast(error.response?.data?.message || '收回失败')
    }
  } finally {
    closeToast()
  }
}

// 拍照
const takePhoto = () => {
  showToast('拍照功能开发中...')
  // TODO: 实现拍照功能
}

onUnmounted(() => {
  closeScanner()
})
</script>

<style scoped>
.page-container {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: 80px;
}

.search-area {
  padding: 12px;
  background: #fff;
}

.order-info {
  margin: 12px;
}

.progress-bar {
  padding: 16px;
}

.progress-label {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.items-list {
  padding: 0 12px;
}

.section-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  margin: 16px 0 12px;
}

.item-quantity {
  display: flex;
  align-items: center;
  gap: 4px;
}

.label {
  font-size: 12px;
  color: #666;
}

.value {
  font-size: 14px;
  font-weight: bold;
  color: #333;
  min-width: 40px;
}

.ml-2 {
  margin-left: 8px;
}

.bottom-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: 12px;
  background: #fff;
  box-shadow: 0 -2px 8px rgba(0, 0, 0, 0.1);
  display: flex;
  gap: 12px;
  align-items: center;
}

.bottom-bar .van-button:first-child {
  width: 100px;
}

.scanner-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.scanner-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #eee;
}

.scanner-title {
  font-size: 16px;
  font-weight: bold;
}

.scanner-view {
  flex: 1;
  width: 100%;
}

.scanner-hint {
  text-align: center;
  padding: 16px;
  color: #666;
  font-size: 14px;
}
</style>
