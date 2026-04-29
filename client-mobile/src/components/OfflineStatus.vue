<template>
  <div class="offline-banner" v-if="!isOnline">
    <van-icon name="warning-o" />
    <span>网络不可用 · 离线模式</span>
  </div>
  <div class="sync-banner" v-if="isOnline && pendingCount > 0">
    <van-loading v-if="isSyncing" size="14" />
    <van-icon v-else name="replay" @click="manualSync" />
    <span v-if="isSyncing">正在同步 {{ pendingCount }} 条离线操作...</span>
    <span v-else>{{ pendingCount }} 条操作待同步（点击重试）</span>
  </div>
</template>

<script setup lang="ts">
import { useNetworkStatus } from '@/composables/useNetworkStatus'

const { isOnline, pendingCount, isSyncing, manualSync } = useNetworkStatus()
</script>

<style scoped>
.offline-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  background: #ee0a24;
  color: #fff;
  font-size: 13px;
  line-height: 1;
}

.sync-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 16px;
  background: #ff976a;
  color: #fff;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}
</style>
