/**
 * 生产调度服务 - 桶文件
 * 重新导出所有公共API，保持与原 orderDispatch.service.ts 完全兼容的导入路径
 */
export { checkSchedulingConflicts } from './conflictCheck';
export { generateProcessTasks, generateMaterialPreparation } from './taskAndMaterialGen';
export { splitOrdersCore, dispatchOrdersCore, dispatchAndGenerateCore, generateFromOrderCore } from './dispatch';
