<template>
  <OfflineStatus />
  <router-view />
</template>

<script setup lang="ts">
import OfflineStatus from '@/components/OfflineStatus.vue'

// 注册 PWA Service Worker
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true })
  }).catch(() => {
    // PWA registration not available (dev mode or not built)
  })
}
</script>
