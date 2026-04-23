import { validateBody } from './index';

// 注册
export const validateRegister = validateBody([
  { field: 'username', label: '用户名', required: true, minLength: 2, maxLength: 50 },
  { field: 'phone', label: '手机号', required: true },
  { field: 'password', label: '密码', required: true, minLength: 6 },
  { field: 'real_name', label: '姓名', required: true },
]);

// 登录
export const validateLogin = validateBody([
  { field: 'username', label: '用户名', required: true },
  { field: 'password', label: '密码', required: true },
]);

// 修改密码
export const validateChangePassword = validateBody([
  { field: 'oldPassword', label: '原密码', required: true },
  { field: 'newPassword', label: '新密码', required: true, minLength: 6 },
]);
