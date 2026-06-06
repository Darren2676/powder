<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { useNotificationStore } from '@/store/notification';
import { useFactoryStore } from '@/store/factory';
import { getNotifications, markAsRead, markAllAsRead } from '@/api/system/notification';
import {
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  CheckOutlined,
  DownOutlined,
  SwapOutlined,
  ShopOutlined
} from '@ant-design/icons-vue';
import { message } from 'ant-design-vue';
import dayjs from 'dayjs';

const emit = defineEmits<{
  toggleCollapsed: [];
}>();

const router = useRouter();
const authStore = useAuthStore();
const notificationStore = useNotificationStore();
const factoryStore = useFactoryStore();

// ── 工厂切换相关 ──
const currentFactoryName = computed(() => {
  if (factoryStore.viewMode === 'all') return '全部工厂';
  if (!factoryStore.currentFactory) return '未分配';
  return factoryStore.currentFactory.factory_short || factoryStore.currentFactory.factory_name;
});

const isHQRole = computed(() => {
  const role = authStore.user?.role || '';
  return role.startsWith('headquarters_');
});

const handleSwitchFactory = async (factoryId: number) => {
  const success = await factoryStore.switchFactory(factoryId);
  if (success) {
    message.success(`已切换至 ${factoryStore.currentFactory?.factory_name}`);
    // 切换后刷新当前页面数据
    window.location.reload();
  } else {
    message.error('工厂切换失败');
  }
};

const handleViewAllFactories = () => {
  factoryStore.setViewMode('all');
  message.success('已切换至全部工厂视图');
  window.location.reload();
};

const handleFactoryMenuItemClick = async (factoryId: number) => {
  // 如果当前在全部视图模式，先切换到单工厂模式
  if (factoryStore.viewMode === 'all') {
    factoryStore.setViewMode('single');
  }
  await handleSwitchFactory(factoryId);
};

const notificationDrawerVisible = ref(false);
const unreadNotifications = ref<any[]>([]);
const readNotifications = ref<any[]>([]);
const notifLoading = ref(false);
const loadMoreLoading = ref(false);
const readPage = ref(1);
const readHasMore = ref(true);
const showAllRead = ref(false);

const currentUser = computed(() => authStore.user);
const unreadCount = computed(() => notificationStore.unreadCount);

// 合并显示列表：未读在前，已读在后
const notifications = computed(() => {
  const oneDayAgo = dayjs().subtract(1, 'day').startOf('day');
  const visibleRead = showAllRead.value
    ? readNotifications.value
    : readNotifications.value.filter((n: any) => dayjs(n.created_at).isAfter(oneDayAgo));
  return [...unreadNotifications.value, ...visibleRead];
});

// 是否有被隐藏的旧已读消息
const hasHiddenOldRead = computed(() => {
  if (showAllRead.value) return false;
  const oneDayAgo = dayjs().subtract(1, 'day').startOf('day');
  return readNotifications.value.some((n: any) => !dayjs(n.created_at).isAfter(oneDayAgo));
});

onMounted(() => {
  notificationStore.startPolling();
});

const fetchNotifications = async () => {
  notifLoading.value = true;
  readPage.value = 1;
  readHasMore.value = true;
  showAllRead.value = false;
  try {
    // 并行请求：未读全部 + 已读第一页
    const [unreadRes, readRes]: any[] = await Promise.all([
      getNotifications({ page: 1, limit: 200, is_read: 'false' } as any),
      getNotifications({ page: 1, limit: 20, is_read: 'true' } as any)
    ]);
    if (unreadRes.success) {
      unreadNotifications.value = unreadRes.data?.items || unreadRes.data?.rows || [];
    }
    if (readRes.success) {
      const items = readRes.data?.items || readRes.data?.rows || [];
      readNotifications.value = items;
      const total = readRes.data?.total || readRes.data?.count || items.length;
      readHasMore.value = items.length < total;
    }
  } catch { /* ignore */ }
  finally { notifLoading.value = false; }
};

const loadMoreRead = async () => {
  loadMoreLoading.value = true;
  try {
    readPage.value++;
    const res: any = await getNotifications({ page: readPage.value, limit: 20, is_read: 'true' } as any);
    if (res.success) {
      const items = res.data?.items || res.data?.rows || [];
      readNotifications.value.push(...items);
      const total = res.data?.total || res.data?.count || 0;
      readHasMore.value = readNotifications.value.length < total;
    }
  } catch { /* ignore */ }
  finally { loadMoreLoading.value = false; }
};

const handleShowAllRead = () => {
  showAllRead.value = true;
};

const handleLogout = async () => {
  try {
    await authStore.logout();
  } catch (e) {
    console.error('Logout error:', e);
  }
  notificationStore.stopPolling();
  // 使用 window.location.href 而非 router.push，确保退出后可靠跳转到登录页
  // router.push 可能在 token 清除后因路由守卫或未处理的 Promise rejection 而失败
  window.location.href = '/login';
};

const showNotifications = () => {
  notificationDrawerVisible.value = true;
  fetchNotifications();
};

const handleMarkRead = async (id: number) => {
  try {
    await markAsRead(id);
    // 从未读移到已读
    const idx = unreadNotifications.value.findIndex((n: any) => n.id === id);
    if (idx !== -1) {
      const item = unreadNotifications.value.splice(idx, 1)[0];
      item.is_read = true;
      readNotifications.value.unshift(item);
    }
    notificationStore.fetchUnreadCount();
  } catch { /* ignore */ }
};

const handleMarkAllRead = async () => {
  try {
    await markAllAsRead();
    // 全部从未读移到已读
    const items = unreadNotifications.value.map((n: any) => ({ ...n, is_read: true }));
    readNotifications.value.unshift(...items);
    unreadNotifications.value = [];
    notificationStore.fetchUnreadCount();
    message.success('已全部标记为已读');
  } catch { /* ignore */ }
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

      <!-- Factory Switcher -->
      <a-dropdown v-if="factoryStore.factories.length > 0" :trigger="['click']">
        <a-button type="text" class="factory-btn">
          <ShopOutlined style="margin-right: 4px;" />
          <span>{{ currentFactoryName }}</span>
          <SwapOutlined style="margin-left: 4px; font-size: 12px;" />
        </a-button>
        <template #overlay>
          <a-menu>
            <!-- 总部角色：全部工厂视图选项 -->
            <template v-if="isHQRole">
              <a-menu-item
                key="view-all"
                @click="handleViewAllFactories"
                :style="{ fontWeight: factoryStore.viewMode === 'all' ? 'bold' : 'normal' }"
              >
                <ShopOutlined />
                <span>全部工厂（总部视图）</span>
                <a-tag v-if="factoryStore.viewMode === 'all'" color="blue" style="margin-left: 8px;">当前</a-tag>
              </a-menu-item>
              <a-menu-divider />
            </template>
            <!-- 工厂列表 -->
            <a-menu-item
              v-for="f in factoryStore.factories"
              :key="f.id"
              @click="handleFactoryMenuItemClick(f.id)"
              :style="{ fontWeight: factoryStore.currentFactory?.id === f.id && factoryStore.viewMode === 'single' ? 'bold' : 'normal' }"
            >
              <span>{{ f.factory_short || f.factory_name }} ({{ f.factory_code }})</span>
              <a-tag v-if="factoryStore.currentFactory?.id === f.id && factoryStore.viewMode === 'single'" color="green" style="margin-left: 8px;">当前</a-tag>
            </a-menu-item>
          </a-menu>
        </template>
      </a-dropdown>

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

  <!-- Notification Drawer -->
  <a-drawer
    v-model:open="notificationDrawerVisible"
    title="通知消息"
    placement="right"
    :width="300"
    :bodyStyle="{ padding: '8px 0' }"
  >
    <template #extra>
      <a-button type="link" size="small" @click="handleMarkAllRead" :disabled="unreadNotifications.length === 0">
        <CheckOutlined /> 全部已读
      </a-button>
    </template>
    <a-spin :spinning="notifLoading">
      <div v-if="notifications.length">
        <div
          v-for="item in notifications"
          :key="item.id"
          class="notif-item"
          :class="{ 'notif-unread': !item.is_read }"
        >
          <div class="notif-header">
            <span class="notif-title" :style="{ fontWeight: item.is_read ? 'normal' : 'bold' }">{{ item.title }}</span>
            <a-button v-if="!item.is_read" type="link" size="small" style="padding: 0; height: auto; font-size: 12px; flex-shrink: 0;" @click="handleMarkRead(item.id)">标记已读</a-button>
            <a-tag v-else color="default" style="margin: 0; font-size: 11px; line-height: 18px; flex-shrink: 0;">已读</a-tag>
          </div>
          <div class="notif-content">{{ item.content }}</div>
          <div class="notif-time">{{ item.created_at }}</div>
        </div>
        <div class="notif-load-more">
          <a-button v-if="hasHiddenOldRead" type="link" size="small" @click="handleShowAllRead">
            <DownOutlined /> 查看1天前的已读消息
          </a-button>
          <a-button v-if="showAllRead && readHasMore" type="link" size="small" :loading="loadMoreLoading" @click="loadMoreRead">
            <DownOutlined /> 加载更多
          </a-button>
          <span v-if="showAllRead && !readHasMore && readNotifications.length > 0" class="notif-no-more">没有更多消息了</span>
        </div>
      </div>
      <a-empty v-else description="暂无通知" />
    </a-spin>
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

.notif-item {
  padding: 8px 12px;
  border-bottom: 1px solid #f0f0f0;
  border-left: 3px solid transparent;
}

.notif-item.notif-unread {
  background: #f6fbff;
  border-left-color: #1890ff;
}

.notif-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 4px;
}

.notif-title {
  font-size: 13px;
  line-height: 1.4;
  flex: 1;
  word-break: break-all;
}

.notif-content {
  font-size: 12px;
  color: #666;
  margin-top: 4px;
  line-height: 1.4;
  word-break: break-all;
}

.notif-time {
  font-size: 11px;
  color: #999;
  margin-top: 3px;
}

.notif-load-more {
  text-align: center;
  padding: 10px 0;
}

.notif-no-more {
  font-size: 12px;
  color: #bbb;
}
</style>
