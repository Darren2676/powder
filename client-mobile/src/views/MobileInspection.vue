<template>
  <div class="page-container">
    <van-nav-bar
      title="移动质检"
      left-arrow
      @click-left="router.back()"
      fixed
      placeholder
    >
      <template #right>
        <van-icon
          :name="speechEnabled ? 'volume-o' : 'volume-cross-o'"
          size="22"
          :color="speechEnabled ? '#1989fa' : '#999'"
          @click="toggleSpeechEnabled"
        />
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
    <van-popup v-model:show="scannerVisible" position="bottom" round :style="{ height: '70%' }">
      <div class="scanner-container">
        <div class="scanner-header">
          <span class="scanner-title">扫描任务单</span>
          <van-icon name="cross" size="20" @click="closeScanner" />
        </div>
        <div id="qr-reader-inspection" class="scanner-view"></div>
        <div class="scanner-hint">将摄像头对准生产任务单二维码</div>
      </div>
    </van-popup>

    <!-- 搜索区域 -->
    <div class="search-area">
      <van-search
        v-model="taskNumber"
        shape="round"
        placeholder="输入生产任务单号"
        @search="loadTask"
      >
        <template #action>
          <van-button size="small" type="primary" @click="loadTask">查询</van-button>
        </template>
      </van-search>
    </div>

    <!-- 任务信息 -->
    <div v-if="taskInfo" class="task-info card">
      <van-cell-group inset>
        <van-cell title="任务单号" :value="taskInfo.task_number" />
        <van-cell title="生产单号" :value="taskInfo.production_order_number" />
        <van-cell title="工序" :value="taskInfo.process_name" />
        <van-cell title="产品" :value="taskInfo.item_name" />
        <van-cell title="计划数量" :value="formatNum(taskInfo.planned_quantity)" />
        <van-cell title="已报工" :value="formatNum(taskInfo.reported_quantity)" />
      </van-cell-group>
    </div>

    <!-- 质检录入表单 -->
    <div v-if="taskInfo" class="inspection-form">
      <div class="section-title">📝 质检结果录入</div>
      
      <van-cell-group inset>
        <van-field
          v-model="inspectionForm.qualified_quantity"
          label="合格数量"
          type="number"
          placeholder="请输入合格数量"
          :rules="[{ required: true, message: '请输入合格数量' }]"
        />
        <van-field
          v-model="inspectionForm.unqualified_quantity"
          label="不合格数量"
          type="number"
          placeholder="请输入不合格数量"
        />
        <van-field
          v-model="inspectionForm.defect_description"
          label="缺陷描述"
          type="textarea"
          rows="2"
          placeholder="请描述缺陷情况（如有）"
        />
        <van-field
          v-model="inspectionForm.remark"
          label="备注"
          type="textarea"
          rows="2"
          placeholder="其他备注信息"
        />
      </van-cell-group>

      <!-- 质检判定 -->
      <div class="judgment-section">
        <div class="section-subtitle">质检判定</div>
        <van-radio-group v-model="inspectionForm.judgment" direction="horizontal">
          <van-radio name="合格">合格</van-radio>
          <van-radio name="不合格">不合格</van-radio>
          <van-radio name="特采">特采</van-radio>
        </van-radio-group>
      </div>
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
    <div v-if="taskInfo" class="bottom-bar">
      <van-button size="small" type="default" icon="photograph" @click="takePhoto">
        📸 拍照
      </van-button>
      <van-button type="primary" block :disabled="!canSubmit" @click="submitInspection">
        提交质检
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
    <van-empty v-if="!taskInfo && !loading" description="请输入或扫描任务单号" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { showToast, showLoadingToast, closeToast, showSuccessToast, showDialog } from 'vant'
import { Html5Qrcode } from 'html5-qrcode'
import axios from 'axios'
import {
  getSpeechEnabled,
  setSpeechEnabled,
  speakSuccess,
  speakScanFailed,
  speakWarning,
} from '@/utils/speech'
import { setCachedData, getCachedData, enqueueRequest } from '@/utils/offlineDB'
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const router = useRouter()
const { isOnline } = useNetworkStatus()

// 数据
const taskNumber = ref('')
const taskInfo = ref<any>(null)
const loading = ref(false)
const scannerVisible = ref(false)
const cameraVisible = ref(false)
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

// 质检表单
const inspectionForm = ref({
  qualified_quantity: '',
  unqualified_quantity: '',
  defect_description: '',
  remark: '',
  judgment: '合格',
})

// 加载任务单
const loadTask = async () => {
  if (!taskNumber.value) {
    showToast('请输入任务单号')
    return
  }

  loading.value = true
  showLoadingToast({ message: '加载中...', forbidClick: true })

  try {
    const res = await axios.get(`/api/v1/mobile/inspection/task/${taskNumber.value}`)
    if (res.data.success) {
      taskInfo.value = res.data.data
      await setCachedData(`inspection_task_${taskNumber.value}`, res.data.data, 24 * 60 * 60 * 1000)
      showSuccessToast('加载成功')
      speakSuccess('任务单加载成功')
    } else {
      showToast(res.data.message || '加载失败')
      speakScanFailed('任务单加载失败')
    }
  } catch (error: any) {
    if (!isOnline.value) {
      const cached = await getCachedData(`inspection_task_${taskNumber.value}`)
      if (cached) {
        taskInfo.value = cached
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
  setTimeout(() => {
    qrReader = new Html5Qrcode('qr-reader-inspection')
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
  if (qrReader) {
    qrReader.stop().catch(() => {})
    qrReader = null
  }
}

const onScanSuccess = async (decodedText: string) => {
  try {
    const data = JSON.parse(decodedText)
    if (data.type === 'process_task' || data.t === 'task') {
      taskNumber.value = data.number || data.n
      closeScanner()
      await loadTask()
    } else {
      speakScanFailed('二维码格式错误')
      showToast('请扫描任务单二维码')
      closeScanner()
    }
  } catch (e) {
    // 如果不是JSON，可能是纯文本任务单号
    taskNumber.value = decodedText
    closeScanner()
    await loadTask()
  }
}

// 计算属性
const canSubmit = computed(() => {
  if (!taskInfo.value) return false
  return inspectionForm.value.qualified_quantity !== ''
})

const formatNum = (num: number) => {
  return num ? num.toFixed(2) : '0'
}

// 提交质检（支持离线入队）
const submitInspection = async () => {
  if (!taskInfo.value) return

  const qualifiedQty = parseFloat(inspectionForm.value.qualified_quantity) || 0
  const unqualifiedQty = parseFloat(inspectionForm.value.unqualified_quantity) || 0

  if (qualifiedQty + unqualifiedQty <= 0) {
    showToast('请输入质检数量')
    return
  }

  try {
    await showDialog({
      title: '确认提交',
      message: `合格: ${qualifiedQty} | 不合格: ${unqualifiedQty}，确认提交？`,
      showCancelButton: true,
    })

    showLoadingToast({ message: '提交中...', forbidClick: true })

    const payload = {
      task_number: taskInfo.value.task_number,
      production_order_number: taskInfo.value.production_order_number,
      process_number: taskInfo.value.process_number,
      item_number: taskInfo.value.item_number,
      qualified_quantity: qualifiedQty,
      unqualified_quantity: unqualifiedQty,
      defect_description: inspectionForm.value.defect_description,
      remark: inspectionForm.value.remark,
      judgment: inspectionForm.value.judgment,
      photos: photos.value.length > 0 ? photos.value.map((p) => p.preview) : undefined,
    }

    if (!isOnline.value) {
      await enqueueRequest({
        method: 'POST',
        url: '/mobile/inspection',
        body: JSON.stringify(payload),
        description: `质检录入 ${taskInfo.value.task_number}`,
      })
      showSuccessToast('已加入离线队列')
      speakSuccess('已加入离线队列，网络恢复后自动同步')
      setTimeout(() => router.back(), 1500)
      return
    }

    const res = await axios.post('/api/v1/mobile/inspection', payload)

    if (res.data.success) {
      showSuccessToast('质检提交成功')
      speakSuccess('质检提交成功')
      setTimeout(() => {
        router.back()
      }, 1500)
    } else {
      showToast(res.data.message || '提交失败')
      speakScanFailed('质检提交失败')
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      if (!isOnline.value || error.code === 'ERR_NETWORK') {
        const payload = {
          task_number: taskInfo.value.task_number,
          production_order_number: taskInfo.value.production_order_number,
          process_number: taskInfo.value.process_number,
          item_number: taskInfo.value.item_number,
          qualified_quantity: parseFloat(inspectionForm.value.qualified_quantity) || 0,
          unqualified_quantity: parseFloat(inspectionForm.value.unqualified_quantity) || 0,
          defect_description: inspectionForm.value.defect_description,
          remark: inspectionForm.value.remark,
          judgment: inspectionForm.value.judgment,
        }
        await enqueueRequest({
          method: 'POST',
          url: '/mobile/inspection',
          body: JSON.stringify(payload),
          description: `质检录入 ${taskInfo.value.task_number}`,
        })
        showSuccessToast('已加入离线队列')
        speakSuccess('已加入离线队列')
        setTimeout(() => router.back(), 1500)
      } else {
        showToast(error.response?.data?.message || '提交失败')
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
  const file = new File([blob], `inspection_${Date.now()}.jpg`, { type: 'image/jpeg' })

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

.search-area {
  padding: 12px;
  background: #fff;
}

.task-info {
  margin: 12px;
}

.inspection-form {
  padding: 0 12px;
}

.section-title {
  font-size: 16px;
  font-weight: bold;
  color: #333;
  margin: 16px 0 12px;
}

.section-subtitle {
  font-size: 14px;
  color: #666;
  margin: 12px 0 8px;
  padding-left: 16px;
}

.judgment-section {
  padding: 12px 16px;
  background: #fff;
  margin: 12px;
  border-radius: 8px;
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

.bottom-bar .van-button:first-child {
  width: 100px;
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
