<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppSidebar from './AppSidebar.vue';
import AppHeader from './AppHeader.vue';
import { useAuthStore } from '@/store/auth';
import { useMenuStore } from '@/store/menu';

const collapsed = ref(false);
const authStore = useAuthStore();
const menuStore = useMenuStore();

const toggleCollapsed = () => {
  collapsed.value = !collapsed.value;
};

// 初始化：已登录时，确保菜单树和权限已加载
onMounted(async () => {
  if (authStore.isLoggedIn) {
    // 始终从服务器刷新菜单树，避免旧缓存问题
    await menuStore.fetchMenuTree();
  }
});
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
        <span v-if="!collapsed" class="logo-text">睿信塑粉MOM系统</span>
      </div>
      <AppSidebar :collapsed="collapsed" />
    </a-layout-sider>

    <!-- Main Layout -->
    <a-layout>
      <!-- Header -->
      <AppHeader @toggle-collapsed="toggleCollapsed" />

      <!-- Content -->
      <a-layout-content style="margin: 8px; padding: 16px; background: #f7f8fa; min-height: 280px;">
        <router-view />
      </a-layout-content>

      <!-- Footer -->
      <a-layout-footer class="app-footer">
        睿信塑粉MOM系统 ©2026 Created by 宁国市睿信信息技术有限责任公司
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
  gap: 6px;
  color: #fff;
  font-size: 13px;
  font-weight: bold;
  background: #2a6cb8;
  border-bottom: 1px solid rgba(255, 255, 255, 0.15);
  padding: 0 8px;
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
  background: #f7f8fa;
  padding: 12px 50px;
  font-size: 13px;
}
</style>
