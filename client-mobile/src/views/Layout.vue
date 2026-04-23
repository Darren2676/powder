<template>
  <div class="layout">
    <router-view />
    <van-tabbar v-model="activeTab" route safe-area-inset-bottom>
      <van-tabbar-item icon="wap-home-o" to="/home">首页</van-tabbar-item>
      <van-tabbar-item icon="orders-o" to="/tasks" :badge="taskBadge || ''">任务</van-tabbar-item>
      <van-tabbar-item icon="user-o" to="/profile">我的</van-tabbar-item>
    </van-tabbar>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const activeTab = ref(0)
const taskBadge = ref('')
</script>

<style scoped>
.layout {
  min-height: 100vh;
  padding-bottom: 50px;
}

:deep(.van-tabbar) {
  box-shadow: 0 -1px 12px rgba(0, 0, 0, 0.06);
}
</style>
