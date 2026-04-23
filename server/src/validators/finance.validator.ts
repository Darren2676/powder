import { validateBody } from './index';

// ==================== 会计期间 ====================

// 生成会计期间
export const validateGenerateAccountingPeriod = validateBody([
  { field: 'fiscal_year', label: '会计年度', required: true, type: 'number' },
]);

// 更新会计期间备注
export const validateUpdateAccountingPeriod = validateBody([]);

// 更新会计期间日期
export const validateUpdatePeriodDates = validateBody([
  { field: 'start_date', label: '开始日期', required: true, maxLength: 20 },
  { field: 'end_date', label: '结束日期', required: true, maxLength: 20 },
]);
