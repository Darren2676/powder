import sequelize from '../../../config/database';
import dayjs from 'dayjs';

// ==================== 编号生成 ====================
export const generateSampleRequestNumber = async (transaction?: any): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `SR-${today}-`;
  const opts: any = { replacements: { prefix: `${prefix}%` } };
  if (transaction) opts.transaction = transaction;
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 request_number FROM sample_request WHERE request_number LIKE :prefix ORDER BY request_number DESC`,
    opts
  );
  let seq = 1;
  if (rows.length > 0) {
    const lastSeq = parseInt(rows[0].request_number.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// ==================== 流程状态常量 ====================
export const REQUEST_STATUS = {
  DRAFT: '草稿',
  PENDING_RD: '待研发',
  IN_RD: '研发中',
  COMPLETED: '已完成',
} as const;

// ==================== 状态校验 ====================
export const validateStatusTransition = (current: string, target: string): boolean => {
  const transitions: Record<string, string[]> = {
    [REQUEST_STATUS.DRAFT]: [REQUEST_STATUS.PENDING_RD],           // 草稿→提交
    [REQUEST_STATUS.PENDING_RD]: [REQUEST_STATUS.DRAFT, REQUEST_STATUS.IN_RD], // 待研发→撤回/接收
    [REQUEST_STATUS.IN_RD]: [REQUEST_STATUS.COMPLETED],            // 研发中→完成
  };
  return transitions[current]?.includes(target) ?? false;
};

// ==================== 样品需求类型默认项 ====================
export const DEFAULT_ITEM_TYPES = [
  { item_type: '样板', unit: '片', is_requested: false, quantity: null, sort_order: 1 },
  { item_type: '样粉', unit: '公斤', is_requested: false, quantity: null, sort_order: 2 },
  { item_type: '相溶性测试', unit: '次', is_requested: false, quantity: null, sort_order: 3 },
  { item_type: '测试报告', unit: '份', is_requested: false, quantity: null, sort_order: 4 },
  { item_type: '其他', unit: '', is_requested: false, quantity: null, sort_order: 5 },
];
