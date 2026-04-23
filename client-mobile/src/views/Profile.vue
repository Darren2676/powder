<template>
  <div class="page-container profile-page">
    <div class="profile-header">
      <div class="avatar">
        <span class="avatar-text">{{ avatarText }}</span>
      </div>
      <h3 class="profile-name">{{ authStore.user?.real_name || authStore.user?.username || '未登录' }}</h3>
      <p class="profile-role">{{ roleText }}</p>
    </div>

    <van-cell-group inset class="menu-group">
      <van-cell title="报工历史" icon="clock-o" is-link @click="router.push('/history')" />
    </van-cell-group>

    <van-cell-group inset class="menu-group">
      <van-cell title="当前版本" icon="info-o" :value="'v1.0.0'" />
    </van-cell-group>

    <div class="logout-area">
      <van-button type="danger" plain block round @click="handleLogout">退出登录</van-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { showDialog } from 'vant'
import { useAuthStore } from '@/store/auth'

const router = useRouter()
const authStore = useAuthStore()

const avatarText = computed(() => {
  const name = authStore.user?.real_name || authStore.user?.username || ''
  return name.slice(0, 1).toUpperCase()
})

const roleText = computed(() => {
  const m: Record<string, string> = { admin: '系统管理员', manager: '管理人员', staff: '操作员' }
  return m[authStore.user?.role] || '操作员'
})

const handleLogout = async () => {
  try {
    await showDialog({
      title: '确认退出',
      message: '确定要退出登录吗？',
      confirmButtonText: '退出',
      confirmButtonColor: 'var(--danger)'
    })
    await authStore.logout()
    router.replace('/login')
  } catch {
    // 取消
  }
}
</script>

<style scoped>
.profile-page {
  padding: 0 16px 24px;
}

.profile-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 40px 0 24px;
  padding-top: calc(40px + env(safe-area-inset-top));
}

.avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--primary), #67b3ff);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  box-shadow: 0 4px 16px rgba(25, 137, 250, 0.3);
}

.avatar-text {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
}

.profile-name {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.profile-role {
  font-size: 13px;
  color: var(--text-muted);
}

.menu-group {
  margin-bottom: 12px;
  border-radius: var(--radius-md) !important;
  overflow: hidden;
}

.logout-area {
  margin-top: 32px;
  padding: 0 16px;
}
</style>
