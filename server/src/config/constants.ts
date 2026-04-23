// 系统常量集中管理

// 审核状态
export const APPROVAL_STATUS = {
  APPROVED: '已审核',
  PENDING: '未审核',
} as const

// 启用状态
export const ENABLE_STATUS = {
  ENABLED: '启用',
  DISABLED: '禁用',
} as const

// 默认分页
export const DEFAULT_PAGE = 1
export const DEFAULT_PAGE_SIZE = 20

// 默认管理员
export const DEFAULT_ADMIN = {
  USERNAME: 'admin',
  PASSWORD: 'admin123',
  ROLE: 'admin',
}
