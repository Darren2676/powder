import { validateBody } from './index';

// 创建用户
export const validateCreateUser = validateBody([
  { field: 'username', label: '用户名', required: true, maxLength: 50 },
  { field: 'email', label: '邮箱', required: false, type: 'email' },
]);

// 更新用户
export const validateUpdateUser = validateBody([
  { field: 'username', label: '用户名', required: false, maxLength: 50 },
]);

// 创建部门
export const validateCreateDepartment = validateBody([
  { field: 'dept_code', label: '部门编码', required: true, maxLength: 50 },
  { field: 'dept_name', label: '部门名称', required: true, maxLength: 100 },
  { field: 'parent_id', label: '父部门ID', required: false, type: 'number' },
  { field: 'sort_order', label: '排序号', required: false, type: 'number' },
]);

// 更新部门
export const validateUpdateDepartment = validateBody([
  { field: 'dept_code', label: '部门编码', required: true, maxLength: 50 },
  { field: 'dept_name', label: '部门名称', required: true, maxLength: 100 },
  { field: 'parent_id', label: '父部门ID', required: false, type: 'number' },
  { field: 'sort_order', label: '排序号', required: false, type: 'number' },
]);

// 创建通知
export const validateCreateNotification = validateBody([
  { field: 'notification_title', label: '通知标题', required: true, maxLength: 200 },
]);

// 创建用户偏好
export const validateCreateUserPreference = validateBody([
  { field: 'user_id', label: '用户ID', required: true },
]);

// 更新用户偏好
export const validateUpdateUserPreference = validateBody([]);

// 创建审批流
export const validateCreateApproval = validateBody([
  { field: 'document_type', label: '单据类型', required: true, maxLength: 50 },
]);

// 创建工作流定义
export const validateCreateWorkflow = validateBody([
  { field: 'name', label: '流程名称', required: true, maxLength: 100 },
]);

// 更新工作流定义
export const validateUpdateWorkflow = validateBody([
  { field: 'name', label: '流程名称', required: true, maxLength: 100 },
]);

// 创建工作流实例
export const validateCreateWorkflowInstance = validateBody([
  { field: 'definition_id', label: '流程定义ID', required: true },
  { field: 'document_number', label: '单据编号', required: true, maxLength: 50 },
]);
