<script setup lang="ts">
import { ref } from 'vue';
import AppSidebar from './AppSidebar.vue';
import AppHeader from './AppHeader.vue';

const collapsed = ref(false);

const toggleCollapsed = () => {
  collapsed.value = !collapsed.value;
};
</script>

<template>
  <a-layout style="min-height: 100vh;">
    <!-- Sidebar -->
    <a-layout-sider
      v-model:collapsed="collapsed"
      :trigger="null"
      collapsible
      :width="220"
      style="box-shadow: 2px 0 8px rgba(0, 0, 0, 0.15);"
    >
      <div class="logo">
        <img src="@/assets/logo.jpg" alt="Logo" class="logo-img" />
        <span v-if="!collapsed" class="logo-text">睿信橡胶密封件MES系统</span>
      </div>
      <AppSidebar :collapsed="collapsed" />
    </a-layout-sider>

    <!-- Main Layout -->
    <a-layout>
      <!-- Header -->
      <AppHeader @toggle-collapsed="toggleCollapsed" />

      <!-- Content -->
      <a-layout-content style="margin: 8px; padding: 16px; background: #f0f2f5; min-height: 280px;">
        <router-view />
      </a-layout-content>

      <!-- Footer -->
      <a-layout-footer class="app-footer">
        睿信橡胶密封件MES系统 ©2026 Created by 宁国睿信信息技术有限责任公司
      </a-layout-footer>
    </a-layout>
  </a-layout>
</template>

<style scoped>
.logo {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #fff;
  font-size: 16px;
  font-weight: bold;
  background: rgba(255, 255, 255, 0.1);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding: 0 12px;
  overflow: hidden;
}

.logo-img {
  width: 30px;
  height: 30px;
  object-fit: contain;
  flex-shrink: 0;
}

.logo-text {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.app-footer {
  text-align: center;
  background: #f0f2f5;
  padding: 12px 50px;
  font-size: 13px;
}
</style>
