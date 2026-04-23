// 业务状态常量集中管理
// 所有 Vue 组件中禁止直接硬编码状态字符串，统一从此文件引用

// 审核状态
export const APPROVAL_STATUS = {
  APPROVED: '已审核',
  UNAPPROVED: '未审核',
} as const

// 启用/禁用状态
export const CONDITION_STATUS = {
  ENABLED: '启用',
  DISABLED: '禁用',
} as const

// 单据状态
export const ORDER_STATUS = {
  DRAFT: '草稿',
  SUBMITTED: '已提交',
  APPROVED: '已审核',
  OPEN: '已开启',
  CLOSED: '已关闭',
  UNEXECUTED: '未执行',
} as const

// 员工状态
export const EMPLOYEE_STATUS = {
  INACTIVE: '未激活',
  ENABLED: '启用',
  DISABLED: '禁用',
} as const

// 员工状态颜色（Ant Design Tag color）
export const EMPLOYEE_STATUS_COLORS: Record<string, string> = {
  '未激活': 'default',
  '启用': 'green',
  '禁用': 'red',
}

// 审核状态颜色（Ant Design Tag color）
export const APPROVAL_STATUS_COLORS: Record<string, string> = {
  '已审核': 'blue',
  '未审核': 'default',
}

// 启用状态颜色（Ant Design Tag color）
export const CONDITION_STATUS_COLORS: Record<string, string> = {
  '启用': 'green',
  '禁用': 'red',
}
