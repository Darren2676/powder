// 业务状态常量集中管理
// 所有 controller 中禁止直接硬编码状态字符串，统一从此文件引用

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

// 采购状态
export const PURCHASE_STATUS = {
  NOT_RECEIVED: '未到货',
  PARTIAL_RECEIVED: '部分到货',
  RECEIVED: '已到货',
} as const

// 完成状态（生产单综合完成判定）
export const COMPLETION_STATUS = {
  NOT_COMPLETED: '未完成',
  COMPLETED: '已完成',
} as const

// 手工关闭审批状态
export const MANUAL_CLOSE_STATUS = {
  PENDING: '待审批',
  APPROVED: '已批准',
  EXECUTED: '已执行',
  REJECTED: '已拒绝',
  WITHDRAWN: '已撤回',
} as const

// 关闭原因分类
export const CLOSE_REASON = {
  // 销售订单
  SO_SHIP: { code: 'SO_SHIP', label: '发货异常', desc: '部分/无法发货' },
  SO_PROD: { code: 'SO_PROD', label: '生产异常', desc: '生产未完成/中断' },
  SO_RETURN: { code: 'SO_RETURN', label: '退货异常', desc: '退货处理中' },
  SO_OTHER: { code: 'SO_OTHER', label: '其他原因', desc: '客户取消/商务决策' },
  // 生产订单
  PO_EXEC: { code: 'PO_EXEC', label: '执行异常', desc: '生产中断/工序卡住' },
  PO_INBOUND: { code: 'PO_INBOUND', label: '入库异常', desc: '未入库/部分入库' },
  PO_QUALITY: { code: 'PO_QUALITY', label: '质量异常', desc: '检验不合格/返修' },
  PO_OTHER: { code: 'PO_OTHER', label: '其他原因', desc: '计划取消/工艺变更' },
  // 采购订单
  PUR_RECV: { code: 'PUR_RECV', label: '收货异常', desc: '未到货/部分到货/逾期' },
  PUR_QUALITY: { code: 'PUR_QUALITY', label: '质量异常', desc: '检验不合格/待检' },
  PUR_OTHER: { code: 'PUR_OTHER', label: '其他原因', desc: '供应商放弃/商务取消' },
} as const
