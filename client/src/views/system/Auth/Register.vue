<script setup lang="ts">
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/store/auth';
import { usePasswordPolicy } from '@/composables/usePasswordPolicy';
import { UserOutlined, LockOutlined, MailOutlined, PhoneOutlined, HomeOutlined, IdcardOutlined } from '@ant-design/icons-vue';
import type { Rule } from 'ant-design-vue/es/form';

const router = useRouter();
const authStore = useAuthStore();
const { validatePassword: validatePwdPolicy, getPolicyDescription } = usePasswordPolicy();

const loading = ref(false);

interface RegisterForm {
  username: string;
  email?: string;
  password: string;
  confirmPassword: string;
  real_name: string;
  department?: string;
  phone: string;
}

const formState = reactive<RegisterForm>({
  username: '',
  email: '',
  password: '',
  confirmPassword: '',
  real_name: '',
  department: '',
  phone: ''
});

const validatePassword = async (_rule: Rule, value: string) => {
  if (value === '') {
    return Promise.reject('请输入密码');
  }
  const policyErrors = validatePwdPolicy(value);
  if (policyErrors.length > 0) {
    return Promise.reject(policyErrors[0]);
  }
  if (value.length < 6) {
    return Promise.reject('密码至少6个字符');
  }
  if (formState.confirmPassword !== '' && value !== formState.confirmPassword) {
    return Promise.reject('两次输入的密码不一致');
  }
  return Promise.resolve();
};

const validateConfirmPassword = async (_rule: Rule, value: string) => {
  if (value === '') {
    return Promise.reject('请再次输入密码');
  }
  if (value !== formState.password) {
    return Promise.reject('两次输入的密码不一致');
  }
  return Promise.resolve();
};

const rules: Record<string, Rule[]> = {
  username: [
    { required: true, message: '请输入用户名', trigger: 'blur' },
    { min: 3, max: 50, message: '用户名长度应在3-50个字符之间', trigger: 'blur' }
  ],
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { pattern: /^1[3-9]\d{9}$/, message: '请输入有效的手机号', trigger: 'blur' }
  ],
  password: [
    { required: true, validator: validatePassword, trigger: 'change' }
  ],
  confirmPassword: [
    { required: true, validator: validateConfirmPassword, trigger: 'change' }
  ],
  real_name: [
    { required: true, message: '请输入真实姓名', trigger: 'blur' }
  ]
};

const handleSubmit = async () => {
  loading.value = true;
  try {
    const { confirmPassword, ...registerData } = formState;
    const success = await authStore.register(registerData);
    if (success) {
      router.push('/');
    }
  } finally {
    loading.value = false;
  }
};

const goToLogin = () => {
  router.push('/login');
};
</script>

<template>
  <div class="register-container">
    <a-card class="register-card" title="">
      <div class="register-header">
        <h1>睿信橡胶密封件MES系统</h1>
        <p>创建新账号</p>
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
            placeholder="请输入用户名"
          >
            <template #prefix>
              <UserOutlined />
            </template>
          </a-input>
        </a-form-item>

        <a-form-item name="phone" label="手机号">
          <a-input
            v-model:value="formState.phone"
            placeholder="请输入手机号"
          >
            <template #prefix>
              <PhoneOutlined />
            </template>
          </a-input>
        </a-form-item>

        <a-form-item name="real_name" label="真实姓名">
          <a-input
            v-model:value="formState.real_name"
            placeholder="请输入真实姓名"
          >
            <template #prefix>
              <IdcardOutlined />
            </template>
          </a-input>
        </a-form-item>

        <a-form-item name="password" label="密码">
          <a-input-password
            v-model:value="formState.password"
            placeholder="请输入密码"
          >
            <template #prefix>
              <LockOutlined />
            </template>
          </a-input-password>
          <div v-if="getPolicyDescription().length > 0" style="margin-top: 4px; font-size: 12px; color: #999;">
            密码要求: {{ getPolicyDescription().join(', ') }}
          </div>
        </a-form-item>

        <a-form-item name="confirmPassword" label="确认密码">
          <a-input-password
            v-model:value="formState.confirmPassword"
            placeholder="请再次输入密码"
          >
            <template #prefix>
              <LockOutlined />
            </template>
          </a-input-password>
        </a-form-item>

        <a-form-item name="department" label="部门(选填)">
          <a-input
            v-model:value="formState.department"
            placeholder="请输入部门"
          >
            <template #prefix>
              <HomeOutlined />
            </template>
          </a-input>
        </a-form-item>

        <a-form-item name="email" label="邮箱(选填)">
          <a-input
            v-model:value="formState.email"
            type="email"
            placeholder="请输入邮箱"
          >
            <template #prefix>
              <MailOutlined />
            </template>
          </a-input>
        </a-form-item>

        <a-form-item>
          <a-button
            type="primary"
            html-type="submit"
            size="large"
            :loading="loading"
            block
          >
            注册
          </a-button>
        </a-form-item>

        <div class="register-footer">
          已有账号?
          <a @click="goToLogin">立即登录</a>
        </div>
      </a-form>
    </a-card>
  </div>
</template>

<style scoped>
.register-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  padding: 20px;
}

.register-card {
  width: 100%;
  max-width: 500px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  max-height: 90vh;
  overflow-y: auto;
}

.register-header {
  text-align: center;
  margin-bottom: 24px;
}

.register-header h1 {
  font-size: 28px;
  font-weight: bold;
  color: #1890ff;
  margin-bottom: 8px;
}

.register-header p {
  font-size: 16px;
  color: #666;
  margin: 0;
}

.register-footer {
  text-align: center;
  margin-top: 16px;
  color: #666;
}

.register-footer a {
  color: #1890ff;
  cursor: pointer;
  margin-left: 4px;
}

.register-footer a:hover {
  text-decoration: underline;
}
</style>
