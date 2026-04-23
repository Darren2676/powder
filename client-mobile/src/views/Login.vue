<template>
  <div class="login-page">
    <div class="login-header">
      <div class="login-logo">
        <div class="logo-icon">MES</div>
      </div>
      <h1 class="login-title">睿信MES</h1>
      <p class="login-subtitle">生产执行管理系统 · 移动端</p>
    </div>

    <div class="login-form">
      <van-cell-group inset>
        <van-field
          v-model="username"
          label="账号"
          placeholder="请输入用户名"
          left-icon="user-o"
          :rules="[{ required: true, message: '请填写用户名' }]"
          @keyup.enter="handleLogin"
        />
        <van-field
          v-model="password"
          type="password"
          label="密码"
          placeholder="请输入密码"
          left-icon="lock"
          :rules="[{ required: true, message: '请填写密码' }]"
          @keyup.enter="handleLogin"
        />
      </van-cell-group>

      <div class="login-action">
        <van-button
          type="primary"
          block
          round
          size="large"
          :loading="authStore.loading"
          loading-text="登录中..."
          @click="handleLogin"
        >
          登 录
        </van-button>
      </div>
    </div>

    <div class="login-footer">
      <p>橡胶密封件生产管理系统</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAuthStore } from '@/store/auth'

const router = useRouter()
const authStore = useAuthStore()

const username = ref('')
const password = ref('')

const handleLogin = async () => {
  if (!username.value.trim()) {
    showToast('请输入用户名')
    return
  }
  if (!password.value) {
    showToast('请输入密码')
    return
  }

  const ok = await authStore.login(username.value.trim(), password.value)
  if (ok) {
    router.replace('/home')
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, #1989fa 0%, #1456b8 100%);
  padding: 0 24px;
}

.login-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 80px;
  padding-bottom: 40px;
}

.login-logo {
  margin-bottom: 16px;
}

.logo-icon {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 1px;
}

.login-title {
  font-size: 28px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 6px;
}

.login-subtitle {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

.login-form {
  flex: 1;
}

.login-form :deep(.van-cell-group--inset) {
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
}

.login-form :deep(.van-field__left-icon) {
  color: var(--primary);
}

.login-action {
  margin-top: 28px;
}

.login-action .van-button {
  height: 48px;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 4px;
  box-shadow: 0 4px 16px rgba(25, 137, 250, 0.4);
}

.login-footer {
  text-align: center;
  padding: 24px 0;
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
}

.login-footer p {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}
</style>
