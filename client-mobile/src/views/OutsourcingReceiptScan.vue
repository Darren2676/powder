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
        <div class="nav-right">
          <van-icon
            :name="speechEnabled ? 'volume-o' : 'volume-cross-o'"
            size="22"
            :color="speechEnabled ? '#1989fa' : '#999'"
            @click="toggleSpeechEnabled"
            class="nav-icon"
          />
          <van-icon name="scan" size="24" @click="openScanner" class="nav-icon" />
        </div>
      </template>
    </van-nav-bar>

    <!-- 网络状态提示 -->
    <van-notice-bar
      v-if="!isOnline"
      mode="closeable"
      type="warning"
      left-icon="warning-o"
      text="当前处于离线模式，数据将在网络恢复后自动同步"
    />

    <!-- 扫码弹窗 -->
    <van-popup v-model:show="scannerVisible" position="bottom" round :style="{ height: '75%' }">
      <div class="scanner-container">
        <div class="scanner-header">
          <span class="scanner-title">
            {{ batchMode ? '📦 批量扫码模式' : '扫描二维码' }}
          </span>
          <div class="scanner-actions">
            <van-tag
              :type="batchMode ? 'success' : 'default'"
              size="medium"
              @click="batchMode = !batchMode"
              class="batch-toggle"
            >
              {{ batchMode ? '批量中' : '单扫' }}
            </van-tag>
            <van-icon name="cross" size="20" @click="closeScanner" />
          </div>
        </div>
        <div id="qr-reader-receipt" class="scanner-view"></div>
        <div class="scanner-hint">
          {{ batchMode ? '连续扫描多个物料二维码，点击完成结束' : '将摄像头对准二维码' }}
        </div>
        <div v-if="batchMode && scannedItems.length > 0" class="batch-list">
          <div class="batch-title">已扫描 {{ scannedItems.length }} 个</div>
          <van-tag
            v-for="(item, idx) in scannedItems"
            :key="idx"
            type="primary"
            class="batch-tag"
            closeable
            @close="removeScannedItem(idx)"
          >
            {{ item.item_name }}
          </van-tag>
        </div>
        <van-button
          v-if="batchMode"
          type="primary"
          block
          round
          class="batch-done"
          @click="applyBatchScan"
        >
          完成扫描 ({{ scannedItems.length }})
        </van-button>
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
      <div class="section-title">
        📋 物料清单
        <van-tag v-if="!isOnline" type="warning" size="medium">离线缓存</van-tag>
      </div>
      
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

    <!-- 照片预览区域 -->
    <div v-if="photos.length > 0" class="photos-section">
      <div class="section-title">📷 已拍照片 ({{ photos.length }})</div>
      <div class="photo-grid">
        <div v-for="(photo, idx) in photos" :key="idx" class="photo-item">
          <img :src="photo.preview" alt="photo" />
          <van-icon name="clear" class="photo-remove" @click="removePhoto(idx)" />
        </div>
      </div>
    </div>

    <!-- 底部操作栏 -->
    <div v-if="orderInfo" class="bottom-bar">
      <van-button size="small" type="default" icon="photograph" @click="takePhoto">
        📸 拍照
      </van-button>
      <van-button size="small" type="default" icon="printer" @click="printLabel">
        🏷️ 标签
      </van-button>
      <van-button type="primary" block :disabled="!canSubmit" @click="submitReceipt">
        确认收回 ({{ getTotalReceived() }}/{{ getTotalPlanned() }})
      </van-button>
    </div>

    <!-- 拍照弹窗 -->
    <van-popup v-model:show="cameraVisible" position="bottom" round :style="{ height: '60%' }">
      <div class="camera-container">
        <div class="camera-header">
          <span>拍照存档</span>
          <van-icon name="cross" size="20" @click="cameraVisible = false" />
        </div>
        <video ref="videoRef" autoplay playsinline class="camera-video"></video>
        <div class="camera-actions">
          <van-button type="primary" round block @click="capturePhoto">
            <van-icon name="photograph" /> 拍照
          </van-button>
        </div>
      </div>
    </van-popup>

    <!-- 空状态 -->
    <van-empty v-if="!orderInfo && !loading" description="请输入或扫描委外订单号" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showLoadingToast, closeToast, showSuccessToast, showDialog } from 'vant'
import { Html5Qrcode } from 'html5-qrcode'
import axios from 'axios'
import {
  getSpeechEnabled,
  setSpeechEnabled,
  speakScanSuccess,
  speakScanFailed,
  speakSuccess,
  speakWarning,
} from '@/utils/speech'
import { setCachedData, getCachedData, enqueueRequest } from '@/utils/offlineDB'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const router = useRouter()
const { isOnline } = useNetworkStatus()

// 数据
const orderNumber = ref('')
const orderInfo = ref<any>(null)
const loading = ref(false)
const scannerVisible = ref(false)
const cameraVisible = ref(false)
const batchMode = ref(false)
const scannedItems = ref<any[]>([])
const photos = ref<{ file: File; preview: string }[]>([])
const videoRef = ref<HTMLVideoElement | null>(null)
let qrReader: Html5Qrcode | null = null
let stream: MediaStream | null = null

// 语音开关
const speechEnabled = ref(getSpeechEnabled())
const toggleSpeechEnabled = () => {
  speechEnabled.value = !speechEnabled.value
  setSpeechEnabled(speechEnabled.value)
  showToast(speechEnabled.value ? '语音播报已开启' : '语音播报已关闭')
}

// 加载订单（带离线缓存）
const loadOrder = async () => {
  if (!orderNumber.value) {
    showToast('请输入订单号')
    return
  }

  loading.value = true
  showLoadingToast({ message: '加载中...', forbidClick: true })

  try {
    const res = await axios.get(`/api/v1/mobile/outsourcing/receipt/${orderNumber.value}`)
    if (res.data.success) {
      orderInfo.value = res.data.data
      orderInfo.value.items.forEach((item: any) => {
        item.received_qty = 0
      })
      await setCachedData(`receipt_order_${orderNumber.value}`, res.data.data, 24 * 60 * 60 * 1000)
      showSuccessToast('加载成功')
      speakSuccess('订单加载成功')
    } else {
      showToast(res.data.message || '加载失败')
      speakScanFailed('订单加载失败')
    }
  } catch (error: any) {
    if (!isOnline.value) {
      const cached = await getCachedData(`receipt_order_${orderNumber.value}`)
      if (cached) {
        orderInfo.value = cached
        orderInfo.value.items.forEach((item: any) => {
          item.received_qty = 0
        })
        showToast('已加载离线缓存数据')
        speakWarning('使用离线缓存数据')
      } else {
        showToast('离线模式，无缓存数据')
        speakScanFailed('无缓存数据')
      }
    } else {
      showToast(error.response?.data?.message || '加载失败')
    }
  } finally {
    loading.value = false
    closeToast()
  }
}

// 扫码
const openScanner = () => {
  scannerVisible.value = true
  scannedItems.value = []
  setTimeout(() => {
    qrReader = new Html5Qrcode('qr-reader-receipt')
    qrReader.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        onScanSuccess(decodedText)
      },
      () => {}
    )
  }, 300)
}

const closeScanner = () => {
  scannerVisible.value = false
  batchMode.value = false
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
      closeScanner()
      await loadOrder()
    } else if (data.type === 'item' || data.t === 'item') {
      const itemNumber = data.number || data.n
      const item = orderInfo.value?.items.find((i: any) => i.item_number === itemNumber)
      if (item) {
        if (batchMode.value) {
          if (!scannedItems.value.find((s) => s.item_number === itemNumber)) {
            scannedItems.value.push({ ...item, scan_qty: item.remaining_quantity })
            speakScanSuccess(item.item_name)
            showToast(`${item.item_name} 已添加`)
          } else {
            showToast('该物料已扫描')
          }
        } else {
          item.received_qty = item.remaining_quantity
          closeScanner()
          speakScanSuccess(item.item_name)
          showToast(`已填充 ${item.item_name} 数量`)
        }
      } else {
        speakScanFailed('物料不在订单中')
        showToast('物料不在订单中')
        if (!batchMode.value) closeScanner()
      }
    } else {
      speakScanFailed('二维码格式错误')
      showToast('二维码格式错误')
      if (!batchMode.value) closeScanner()
    }
  } catch (e) {
    speakScanFailed('二维码解析失败')
    showToast('二维码解析失败')
    if (!batchMode.value) closeScanner()
  }
}

const removeScannedItem = (idx: number) => {
  scannedItems.value.splice(idx, 1)
}

const applyBatchScan = () => {
  scannedItems.value.forEach((scanned) => {
    const item = orderInfo.value?.items.find((i: any) => i.item_number === scanned.item_number)
    if (item) {
      item.received_qty = scanned.scan_qty
    }
  })
  speakSuccess(`批量填充 ${scannedItems.value.length} 个物料`)
  showToast(`已填充 ${scannedItems.value.length} 个物料`)
  closeScanner()
}

// 数量变化
const onQuantityChange = () => {}

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
    '已收回': 'success',
  }
  return map[status] || 'default'
}

const formatNum = (num: number) => {
  return num ? num.toFixed(2) : '0'
}

// 提交收回（支持离线入队）
const submitReceipt = async () => {
  if (!orderInfo.value) return

  const items = orderInfo.value.items
    .filter((item: any) => item.received_qty > 0)
    .map((item: any) => ({
      item_number: item.item_number,
      received_quantity: item.received_qty,
    }))

  if (items.length === 0) {
    showToast('请输入收回数量')
    return
  }

  try {
    await showDialog({
      title: '确认收回',
      message: `确认收回 ${getTotalReceived()} 件？`,
      showCancelButton: true,
    })

    showLoadingToast({ message: '提交中...', forbidClick: true })

    const payload = {
      order_number: orderInfo.value.order_number,
      items,
      remark: '移动端收回',
      photos: photos.value.length > 0 ? photos.value.map((p) => p.preview) : undefined,
    }

    if (!isOnline.value) {
      await enqueueRequest({
        method: 'POST',
        url: '/mobile/outsourcing/receipt',
        body: JSON.stringify(payload),
        description: `委外收回 ${orderInfo.value.order_number}`,
      })
      showSuccessToast('已加入离线队列')
      speakSuccess('已加入离线队列，网络恢复后自动同步')
      setTimeout(() => router.back(), 1500)
      return
    }

    const res = await axios.post('/api/v1/mobile/outsourcing/receipt', payload)

    if (res.data.success) {
      showSuccessToast('收回成功')
      speakSuccess('收回成功')
      setTimeout(() => {
        router.back()
      }, 1500)
    } else {
      showToast(res.data.message || '收回失败')
      speakScanFailed('收回失败')
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      if (!isOnline.value || error.code === 'ERR_NETWORK') {
        const payload = {
          order_number: orderInfo.value.order_number,
          items: orderInfo.value.items
            .filter((item: any) => item.received_qty > 0)
            .map((item: any) => ({
              item_number: item.item_number,
              received_quantity: item.received_qty,
            })),
          remark: '移动端收回',
        }
        await enqueueRequest({
          method: 'POST',
          url: '/mobile/outsourcing/receipt',
          body: JSON.stringify(payload),
          description: `委外收回 ${orderInfo.value.order_number}`,
        })
        showSuccessToast('已加入离线队列')
        speakSuccess('已加入离线队列')
        setTimeout(() => router.back(), 1500)
      } else {
        showToast(error.response?.data?.message || '收回失败')
      }
    }
  } finally {
    closeToast()
  }
}

// 拍照
const takePhoto = async () => {
  cameraVisible.value = true
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false,
    })
    if (videoRef.value) {
      videoRef.value.srcObject = stream
    }
  } catch (err) {
    showToast('无法访问摄像头')
    cameraVisible.value = false
  }
}

const capturePhoto = () => {
  if (!videoRef.value || !stream) return

  const canvas = document.createElement('canvas')
  canvas.width = videoRef.value.videoWidth
  canvas.height = videoRef.value.videoHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  ctx.drawImage(videoRef.value, 0, 0)
  const dataUrl = canvas.toDataURL('image/jpeg', 0.8)

  const byteString = atob(dataUrl.split(',')[1])
  const mimeString = dataUrl.split(',')[0].split(':')[1].split(';')[0]
  const ab = new ArrayBuffer(byteString.length)
  const ia = new Uint8Array(ab)
  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i)
  }
  const blob = new Blob([ab], { type: mimeString })
  const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' })

  photos.value.push({ file, preview: dataUrl })

  stream.getTracks().forEach((track) => track.stop())
  stream = null
  cameraVisible.value = false

  showToast('拍照成功')
  speakSuccess('拍照成功')
}

const removePhoto = (idx: number) => {
  photos.value.splice(idx, 1)
}

// 打印标签
const printLabel = async () => {
  if (!orderInfo.value) return
  try {
    showLoadingToast({ message: '生成标签...', forbidClick: true })
    const res = await axios.post(
      '/api/v1/mobile/outsourcing/print-label',
      {
        type: 'receipt',
        order_number: orderInfo.value.order_number,
        item_number: orderInfo.value.item_number,
        item_name: orderInfo.value.item_name,
        supplier_name: orderInfo.value.supplier_name,
        planned_quantity: orderInfo.value.planned_quantity,
      }
    )

    // 在新窗口打开标签页面
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(res.data)
      printWindow.document.close()
    }

    closeToast()
    showSuccessToast('标签已生成')
    speakSuccess('标签已生成，请在弹窗中打印')
  } catch (error: any) {
    closeToast()
    showToast('标签生成失败')
    speakScanFailed('标签生成失败')
  }
}

onUnmounted(() => {
  closeScanner()
  if (stream) {
    stream.getTracks().forEach((track) => track.stop())
  }
})
</script>

<style scoped>
.page-container {
  min-height: 100vh;
  background: #f7f8fa;
  padding-bottom: 80px;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 16px;
}

.nav-icon {
  cursor: pointer;
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
  display: flex;
  align-items: center;
  gap: 8px;
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
  gap: 8px;
  align-items: center;
}

.bottom-bar .van-button:first-child,
.bottom-bar .van-button:nth-child(2) {
  width: 80px;
  flex-shrink: 0;
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

.scanner-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.batch-toggle {
  cursor: pointer;
}

.scanner-view {
  flex: 1;
  width: 100%;
  min-height: 200px;
}

.scanner-hint {
  text-align: center;
  padding: 12px;
  color: #666;
  font-size: 14px;
}

.batch-list {
  padding: 0 16px 12px;
  max-height: 120px;
  overflow-y: auto;
}

.batch-title {
  font-size: 14px;
  color: #666;
  margin-bottom: 8px;
}

.batch-tag {
  margin: 4px;
}

.batch-done {
  margin: 0 16px 16px;
}

.camera-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.camera-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  border-bottom: 1px solid #eee;
}

.camera-video {
  flex: 1;
  width: 100%;
  object-fit: cover;
}

.camera-actions {
  padding: 16px;
}

.photos-section {
  padding: 0 12px;
  margin-bottom: 12px;
}

.photo-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.photo-item {
  position: relative;
  width: 80px;
  height: 80px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #eee;
}

.photo-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.photo-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  color: #ff4444;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  font-size: 18px;
}
</style>
