// production 域路由
import type { RouteRecordRaw } from 'vue-router';

const OrderList = () => import('@/views/production/Order/List.vue');
const GanttChart = () => import('@/views/production/Gantt/Index.vue');
const DispatchPrint = () => import('@/views/production/DispatchPrint/Index.vue');
const ProcessTaskList = () => import('@/views/production/ProcessTask/List.vue');
const MaterialPreparationList = () => import('@/views/production/MaterialPreparation/List.vue');
const MaterialPreparationByProcess = () => import('@/views/production/MaterialPreparation/ByProcess.vue');
const MaterialIssue = () => import('@/views/production/MaterialPreparation/MaterialIssue.vue');
const MaterialIssueByProcess = () => import('@/views/production/MaterialPreparation/MaterialIssueByProcess.vue');
const BackflushTaskList = () => import('@/views/production/MaterialPreparation/BackflushTask.vue');
const WorkReportList = () => import('@/views/production/WorkReport/List.vue');
const ContinuousReport = () => import('@/views/production/WorkReport/ContinuousReport.vue');
const OutsourcingReqList = () => import('@/views/production/OutsourcingReq/List.vue');
const OutsourcingOrderList = () => import('@/views/production/OutsourcingOrder/List.vue');
const OutsourcingIssueList = () => import('@/views/production/OutsourcingIssue/List.vue');
const OutsourcingReceiptList = () => import('@/views/production/OutsourcingReceipt/List.vue');
const OutsourcingInspectionList = () => import('@/views/production/OutsourcingInspection/List.vue');
const WipByOrder = () => import('@/views/production/WIP/ByOrder.vue');
const WipByWorkCenter = () => import('@/views/production/WIP/ByWorkCenter.vue');
const WipLinesideTransactions = () => import('@/views/production/WIP/LinesideTransactions.vue');
const OutsourcingPriceList = () => import('@/views/production/OutsourcingPrice/List.vue');
const PieceRateWageList = () => import('@/views/production/PieceRateWage/List.vue');

export const productionRoutes: RouteRecordRaw[] = [
  { path: 'orders', name: 'OrderList', component: OrderList, meta: {"title":"生产单管理"} },
  { path: 'gantt', name: 'GanttChart', component: GanttChart, meta: {"title":"排产甘特图"} },
  { path: 'dispatch-print', name: 'DispatchPrint', component: DispatchPrint, meta: {"title":"调度单打印"} },
  { path: 'process-tasks', name: 'ProcessTaskList', component: ProcessTaskList, meta: {"title":"工序任务管理"} },
  { path: 'material-preparations', name: 'MaterialPreparationList', component: MaterialPreparationList, meta: {"title":"生产单备料"} },
  { path: 'material-preparation-by-process', name: 'MaterialPreparationByProcess', component: MaterialPreparationByProcess, meta: {"title":"按工序备料"} },
  { path: 'material-issue', name: 'MaterialIssue', component: MaterialIssue, meta: {"title":"生产备料"} },
  { path: 'material-issue-by-process', name: 'MaterialIssueByProcess', component: MaterialIssueByProcess, meta: {"title":"按工序备料"} },
  { path: 'backflush-tasks', name: 'BackflushTaskList', component: BackflushTaskList, meta: {"title":"倒冲任务清单"} },
  { path: 'work-reports', name: 'WorkReportList', component: WorkReportList, meta: {"title":"工序报工"} },
  { path: 'continuous-report', name: 'ContinuousReport', component: ContinuousReport, meta: {"title":"连续报工"} },
  { path: 'outsourcing-reqs', name: 'OutsourcingReqList', component: OutsourcingReqList, meta: {"title":"工序委外申请"} },
  { path: 'outsourcing-orders', name: 'OutsourcingOrderList', component: OutsourcingOrderList, meta: {"title":"工序委外管理"} },
  { path: 'outsourcing-issue', name: 'OutsourcingIssueList', component: OutsourcingIssueList, meta: {"title":"委外发料"} },
  { path: 'outsourcing-receipt', name: 'OutsourcingReceiptList', component: OutsourcingReceiptList, meta: {"title":"委外回收"} },
  { path: 'outsourcing-inspection', name: 'OutsourcingInspectionList', component: OutsourcingInspectionList, meta: {"title":"委外质检"} },
  { path: 'wip-by-order', name: 'WipByOrder', component: WipByOrder, meta: {"title":"WIP报告(按生产单)"} },
  { path: 'wip-by-work-center', name: 'WipByWorkCenter', component: WipByWorkCenter, meta: {"title":"WIP报告(按工作中心)"} },
  { path: 'wip-lineside-transactions', name: 'WipLinesideTransactions', component: WipLinesideTransactions, meta: {"title":"线边仓流水"} },
  { path: 'outsourcing-prices', name: 'OutsourcingPriceList', component: OutsourcingPriceList, meta: {"title":"委外价目表"} },
  { path: 'piece-rate-wages', name: 'PieceRateWageList', component: PieceRateWageList, meta: {"title":"计件工资管理"} },
];
