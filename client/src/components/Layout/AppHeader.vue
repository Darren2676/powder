<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notification';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined
} from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';

const emit = defineEmits<{
  toggleCollapsed: [];
}>();

const router = useRouter();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();

const notificationDrawerVisible = ref(false);

const currentUser = computed(() => authStore.user);
const unreadCount = computed(() => notificationStore.unreadCount);

onMounted(() => {
  // Start polling for notification updates
  notificationStore.startPolling();
});

const handleLogout = async () => {
  await authStore.logout();
  notificationStore.stopPolling();
  router.push('/login');
  message.success('已退出登录');
};

const showNotifications = () => {
  notificationDrawerVisible.value = true;
};
</script>

<template>
  <a-layout-header class="app-header">
    <!-- Left: Toggle Button -->
    <div>
      <a-button type="text" @click="emit('toggleCollapsed')">
        <MenuUnfoldOutlined v-if="false" />
        <MenuFoldOutlined v-if="true" />
      </a-button>
    </div>

    <!-- Right: Notification and User Menu -->
    <div style="display: flex; align-items: center; gap: 16px;">
      <!-- Notification Bell -->
      <a-badge :count="unreadCount" :overflow-count="99">
        <a-button type="text" shape="circle" @click="showNotifications">
          <template #icon>
            <BellOutlined style="font-size: 18px;" />
          </template>
        </a-button>
      </a-badge>

      <!-- User Dropdown -->
      <a-dropdown>
        <a-button type="text" style="height: auto; padding: 4px 12px;">
          <a-space>
            <a-avatar :size="32">
              <template #icon>
                <UserOutlined />
              </template>
            </a-avatar>
            <span>{{ currentUser?.real_name || currentUser?.username }}</span>
          </a-space>
        </a-button>
        <template #overlay>
          <a-menu>
            <a-menu-item key="profile" disabled>
              <UserOutlined />
              <span>个人信息</span>
            </a-menu-item>
            <a-menu-item key="settings" disabled>
              <SettingOutlined />
              <span>设置</span>
            </a-menu-item>
            <a-menu-divider />
            <a-menu-item key="logout" @click="handleLogout">
              <LogoutOutlined />
              <span>退出登录</span>
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>
    </div>
  </a-layout-header>

  <!-- Notification Drawer (placeholder) -->
  <a-drawer
    v-model:open="notificationDrawerVisible"
    title="通知"
    placement="right"
    :width="400"
  >
    <a-empty description="暂无通知" />
  </a-drawer>
</template>

<style scoped>
.app-header {
  background: #fff;
  padding: 0 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  height: 48px;
  line-height: 48px;
}
</style>
