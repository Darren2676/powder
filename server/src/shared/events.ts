/**
 * 核心领域事件定义
 * 所有跨模块业务触发的事件类型和 Payload 接口
 */

// ==================== 报工相关事件 ====================

export interface WorkReportCreatedPayload {
  /** 工序任务编号 */
  process_task_number: string;
  /** 报工单编号 */
  work_report_number: string;
  /** 合格数量 */
  qualified_quantity: number;
  /** 不合格数量 */
  unqualified_quantity: number;
  /** 报工总数量 */
  total_quantity: number;
  /** 操作人 */
  username: string;
  /** 数据库事务对象 */
  transaction?: any;
}

export interface WorkReportUpdatedPayload {
  /** 工序任务编号 */
  process_task_number: string;
  /** 报工单编号 */
  work_report_number: string;
  /** 合格数量变化量（新值 - 旧值） */
  qualified_delta: number;
  /** 操作人 */
  username: string;
  /** 数据库事务对象 */
  transaction?: any;
}

// ==================== 工序任务状态变更事件 ====================

export interface TaskStatusChangedPayload {
  /** 工序任务编号 */
  process_task_number: string;
  /** 生产单编号 */
  production_order_number: string;
  /** 工序序号 */
  step_number: number;
  /** 原状态 */
  old_status: string;
  /** 新状态 */
  new_status: string;
  /** 完成数量变化量 */
  completed_delta: number;
  /** 数据库事务对象 */
  transaction?: any;
}

// ==================== 生产检验相关事件 ====================

export interface InspectionCreatedPayload {
  /** 检验单编号 */
  inspection_number: string;
  /** 工序任务编号 */
  process_task_number: string;
  /** 生产单编号 */
  production_order_number: string;
  /** 报工单编号 */
  work_report_number: string;
  /** 检验类型：自检/专检 */
  inspect_type: string;
  /** 检验数量 */
  total_quantity: number;
  /** 数据库事务对象 */
  transaction?: any;
}

export interface InspectionFinishedPayload {
  /** 检验单编号 */
  inspection_number: string;
  /** 工序任务编号 */
  process_task_number: string;
  /** 生产单编号 */
  production_order_number: string;
  /** 检验结果：合格/不合格 */
  inspection_result: string;
  /** 合格数量 */
  qualified_quantity: number;
  /** 不合格数量 */
  unqualified_quantity: number;
  /** 数据库事务对象 */
  transaction?: any;
}

// ==================== 入库相关事件 ====================

export interface StockInCreatedPayload {
  /** 入库单编号 */
  stock_in_number: string;
  /** 入库类型：生产入库/退货入库/报废入库 */
  stock_in_type: string;
  /** 生产单编号（生产入库时） */
  production_order_number?: string;
  /** 入库明细 */
  items: Array<{
    item_number: string;
    item_name: string;
    quantity: number;
    warehouse_number: string;
  }>;
  /** 数据库事务对象 */
  transaction?: any;
}

// ==================== 生产单状态变更事件 ====================

export interface ProductionOrderStatusChangedPayload {
  /** 生产单编号 */
  production_order_number: string;
  /** 原状态 */
  old_status: string;
  /** 新状态 */
  new_status: string;
  /** 数据库事务对象 */
  transaction?: any;
}

// ==================== 事件名称常量 ====================

export const EVENT_NAMES = {
  WORK_REPORT_CREATED: 'WorkReportCreated',
  WORK_REPORT_UPDATED: 'WorkReportUpdated',
  TASK_STATUS_CHANGED: 'TaskStatusChanged',
  INSPECTION_CREATED: 'InspectionCreated',
  INSPECTION_FINISHED: 'InspectionFinished',
  STOCK_IN_CREATED: 'StockInCreated',
  PRODUCTION_ORDER_STATUS_CHANGED: 'ProductionOrderStatusChanged',
} as const;

export type EventName = (typeof EVENT_NAMES)[keyof typeof EVENT_NAMES];
