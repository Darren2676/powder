<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { UserOutlined, LockOutlined } from '@ant-design/icons-vue';
import type { Rule } from 'ant-design-vue/es/form';

const router = useRouter();
const authStore = useAuthStore();

const loading = ref(false);

interface LoginForm {
  username: string;
  password: string;
}

const formState = reactive<LoginForm>({
  username: '',
  password: ''
});

const rules: Record<string, Rule[]> = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 50, message: '用户名长度应在3-50个字符之间', trigger: 'blur' }
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, message: '密码至少6个字符', trigger: 'blur' }
  ]
};

const handleSubmit = async () => {
  loading.value = true;
  try {
    const success = await authStore.login(formState);
    if (success) {
      router.push('/');
    }
  } finally {
    loading.value = false;
  }
};

const goToRegister = () => {
  router.push('/register');
};
</script>

<template>
  <div class="login-container">
    <a-card class="login-card" title="">
      <div class="login-header">
        <h1>睿信橡胶密封件MES系统</h1>
        <p>欢迎登录</p>
      </div>

      <a-form
        :model="formState"
        :rules="rules"
        layout="vertical"
        @finish="handleSubmit"
      >
        <a-form-item name="username" label="用户名">
          <a-input
            v-model:value="formState.username"
            size="large"
            placeholder="请输入用户名"
          >
            <template #prefix>
              <UserOutlined />
            </template>
          </a-input>
        </a-form-item>

        <a-form-item name="password" label="密码">
          <a-input-password
            v-model:value="formState.password"
            size="large"
            placeholder="请输入密码"
          >
            <template #prefix>
              <LockOutlined />
            </template>
          </a-input-password>
        </a-form-item>

        <a-form-item>
          <a-button
            type="primary"
            html-type="submit"
            size="large"
            :loading="loading"
            block
          >
            登录
          </a-button>
        </a-form-item>

        <div class="login-footer">
          还没有账号?
          <a @click="goToRegister">立即注册</a>
        </div>
      </a-form>
    </a-card>
  </div>
</template>

<style scoped>
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.login-card {
  width: 100%;
  max-width: 400px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  border-radius: 8px;
}

.login-header {
  text-align: center;
  margin-bottom: 32px;
}

.login-header h1 {
  font-size: 28px;
  font-weight: bold;
  color: #1890ff;
  margin-bottom: 8px;
}

.login-header p {
  font-size: 16px;
  color: #666;
  margin: 0;
}

.login-footer {
  text-align: center;
  margin-top: 16px;
  color: #666;
}

.login-footer a {
  color: #1890ff;
  cursor: pointer;
  margin-left: 4px;
}

.login-footer a:hover {
  text-decoration: underline;
}
</style>
