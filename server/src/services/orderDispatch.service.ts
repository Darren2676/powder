/**
 * 生产调度服务 - 桶导出（向后兼容）
 * 业务逻辑已拆分至 orderDispatch/ 子目录：
 *   - conflictCheck.ts        排产冲突检查
 *   - taskAndMaterialGen.ts   工序任务生成 + 备料单生成
 *   - dispatch.ts             拆分/派发/一键派发/从生产单生成任务
 */
export { checkSchedulingConflicts } from './orderDispatch/conflictCheck';
export { generateProcessTasks, generateMaterialPreparation } from './orderDispatch/taskAndMaterialGen';
export { splitOrdersCore, dispatchOrdersCore, dispatchAndGenerateCore, generateFromOrderCore } from './orderDispatch/dispatch';
