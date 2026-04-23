import { ref, onMounted } from 'vue';
import { getPasswordPolicy } from '@/api/system/security';
import type { PasswordPolicy } from '@/api/system/security';

export function usePasswordPolicy() {
  const policy = ref<PasswordPolicy | null>(null);
  const loading = ref(false);

  const loadPolicy = async () => {
    loading.value = true;
    try {
      const res: any = await getPasswordPolicy();
      if (res.success) {
        policy.value = res.data;
      }
    } catch (e) {
      console.error('Failed to load password policy:', e);
    } finally {
      loading.value = false;
    }
  };

  const validatePassword = (password: string): string[] => {
    if (!policy.value) return [];
    const errors: string[] = [];
    const p = policy.value;

    if (password.length < p.password_min_length) {
      errors.push(`密码长度不能少于${p.password_min_length}个字符`);
    }
    if (p.password_require_uppercase && !/[A-Z]/.test(password)) {
      errors.push('密码必须包含大写字母');
    }
    if (p.password_require_lowercase && !/[a-z]/.test(password)) {
      errors.push('密码必须包含小写字母');
    }
    if (p.password_require_number && !/\d/.test(password)) {
      errors.push('密码必须包含数字');
    }
    if (p.password_require_special && !/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      errors.push('密码必须包含特殊字符');
    }

    return errors;
  };

  const getPolicyDescription = (): string[] => {
    if (!policy.value) return [];
    const desc: string[] = [];
    const p = policy.value;

    desc.push(`最少${p.password_min_length}个字符`);
    if (p.password_require_uppercase) desc.push('包含大写字母');
    if (p.password_require_lowercase) desc.push('包含小写字母');
    if (p.password_require_number) desc.push('包含数字');
    if (p.password_require_special) desc.push('包含特殊字符');

    return desc;
  };

  onMounted(() => {
    loadPolicy();
  });

  return {
    policy,
    loading,
    loadPolicy,
    validatePassword,
    getPolicyDescription
  };
}
