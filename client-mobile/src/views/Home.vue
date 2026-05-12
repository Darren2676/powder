<template>
  <div class="home-page">
    <div class="home-header">
      <span class="greeting">{{ greeting }}，</span>
      <span class="user-name">{{ authStore.user?.real_name || authStore.user?.username || '' }}</span>
    </div>

    <div class="home-content">
      <div class="action-grid">
        <div class="scan-btn" @click="goScanPrep">
          <van-icon name="scan" class="scan-btn__icon" />
          <span class="scan-btn__text">扫码备料</span>
        </div>
        <div class="scan-btn scan-btn--report" @click="goScanReport">
          <van-icon name="notes-o" class="scan-btn__icon" />
          <span class="scan-btn__text">扫码报工</span>
        </div>
      </div>
      
      <div class="action-grid action-grid--secondary">
        <div class="scan-btn scan-btn--issue" @click="goOutsourcingIssue">
          <van-icon name="send-o" class="scan-btn__icon" />
          <span class="scan-btn__text">委外发料</span>
        </div>
        <div class="scan-btn scan-btn--receipt" @click="goOutsourcingReceipt">
          <van-icon name="revoke" class="scan-btn__icon" />
          <span class="scan-btn__text">委外收回</span>
        </div>
      </div>
      
      <div class="action-grid action-grid--secondary">
        <div class="scan-btn scan-btn--inspection" @click="goInspection">
          <van-icon name="certificate" class="scan-btn__icon" />
          <span class="scan-btn__text">移动质检</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/store/auth'

const router = useRouter()
const authStore = useAuthStore()

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 12) return '上午好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

const goScanPrep = () => {
  router.push('/process-prep')
}

const goPrepIssue = () => {
  router.push('/process-prep')
}

const goScanReport = () => {
  router.push('/scan-report')
}

const goOutsourcingIssue = () => {
  router.push('/outsourcing/issue-scan')
}

const goOutsourcingReceipt = () => {
  router.push('/outsourcing/receipt-scan')
}

const goInspection = () => {
  router.push('/inspection')
}
</script>

<style scoped>
.home-page {
  background: var(--bg-page);
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.home-header {
  background: linear-gradient(160deg, #1989fa 0%, #1456b8 100%);
  padding: 24px 20px;
  padding-top: calc(24px + env(safe-area-inset-top));
  color: #fff;
}

.greeting {
  font-size: 14px;
  opacity: 0.85;
}

.user-name {
  font-size: 20px;
  font-weight: 600;
}

.home-content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-grid {
  display: flex;
  gap: 28px;
  align-items: center;
  justify-content: center;
}

.scan-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 130px;
  height: 130px;
  border-radius: 50%;
  background: linear-gradient(145deg, #1989fa, #1456b8);
  color: #fff;
  box-shadow: 0 6px 24px rgba(25, 137, 250, 0.4);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  user-select: none;
}

.scan-btn:active {
  transform: scale(0.94);
  box-shadow: 0 3px 12px rgba(25, 137, 250, 0.3);
}

.scan-btn--issue {
  background: linear-gradient(145deg, #ff6b35, #e85d04);
  box-shadow: 0 6px 24px rgba(255, 107, 53, 0.4);
}
.scan-btn--issue:active {
  box-shadow: 0 3px 12px rgba(255, 107, 53, 0.3);
}

.scan-btn--report {
  background: linear-gradient(145deg, #07c160, #059a48);
  box-shadow: 0 6px 24px rgba(7, 193, 96, 0.4);
}

.scan-btn--report:active {
  box-shadow: 0 3px 12px rgba(7, 193, 96, 0.3);
}

.action-grid--secondary {
  margin-top: 32px;
}

.scan-btn--receipt {
  background: linear-gradient(145deg, #7232dd, #5b21b6);
  box-shadow: 0 6px 24px rgba(114, 50, 221, 0.4);
}

.scan-btn--receipt:active {
  box-shadow: 0 3px 12px rgba(114, 50, 221, 0.3);
}

.scan-btn--inspection {
  background: linear-gradient(145deg, #faad14, #d48806);
  box-shadow: 0 6px 24px rgba(250, 173, 20, 0.4);
}

.scan-btn--inspection:active {
  box-shadow: 0 3px 12px rgba(250, 173, 20, 0.3);
}

.scan-btn__icon {
  font-size: 40px;
  margin-bottom: 8px;
}

.scan-btn__text {
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 1px;
}
</style>
