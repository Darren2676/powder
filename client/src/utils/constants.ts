// Status mapping
export const STATUS_MAP: Record<string, string> = {
  pending: '待处理',
  in_progress: '处理中',
  completed: '已完成',
  closed: '已关闭'
};

// Priority mapping
export const PRIORITY_MAP: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急'
};

// Role mapping
export const ROLE_MAP: Record<string, string> = {
  admin: '管理员',
  manager: '经理',
  staff: '员工',
  sales: '销售人员'
};

// Status colors for Ant Design tags
export const STATUS_COLORS: Record<string, string> = {
  pending: 'default',
  in_progress: 'processing',
  completed: 'success',
  closed: 'default'
};

// Priority colors for Ant Design tags
export const PRIORITY_COLORS: Record<string, string> = {
  low: 'green',
  medium: 'blue',
  high: 'orange',
  urgent: 'red'
};

// Role colors for Ant Design tags
export const ROLE_COLORS: Record<string, string> = {
  admin: 'red',
  manager: 'orange',
  staff: 'blue',
  sales: 'green'
};

// Notification type mapping
export const NOTIFICATION_TYPE_MAP: Record<string, string> = {
  assigned: '工单分配',
  commented: '新评论',
  status_changed: '状态变更',
  due_soon: '即将到期'
};

// Notification type colors
export const NOTIFICATION_TYPE_COLORS: Record<string, string> = {
  assigned: 'blue',
  commented: 'green',
  status_changed: 'orange',
  due_soon: 'red'
};

// User status mapping
export const USER_STATUS_MAP: Record<string, string> = {
  active: '激活',
  inactive: '停用',
  disabled: '禁用'
};

// User status colors
export const USER_STATUS_COLORS: Record<string, string> = {
  active: 'success',
  inactive: 'default',
  disabled: 'error'
};

// Date format
export const DATE_FORMAT = 'YYYY-MM-DD';
export const DATETIME_FORMAT = 'YYYY-MM-DD HH:mm:ss';
export const TIME_FORMAT = 'HH:mm:ss';

// Pagination defaults
export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZE_OPTIONS = ['10', '20', '50', '100'];
