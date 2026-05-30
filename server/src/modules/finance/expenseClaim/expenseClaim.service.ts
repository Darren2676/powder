import sequelize from '../../../config/database';
import { Transaction } from 'sequelize';
import dayjs from 'dayjs';

// ==================== 常量 ====================
export const APPROVAL_STATUS = {
  DRAFT: '草稿',
  PENDING: '待审批',
  IN_APPROVAL: '审批中',
  APPROVED: '已审批',
  REJECTED: '已驳回',
  WITHDRAWN: '已撤回',
} as const;

export const APPROVAL_STATUS_VALUES = Object.values(APPROVAL_STATUS);

export const CLAIM_TYPES = ['差旅费', '日常报销', '招待费', '其他'];

export const EXPENSE_CATEGORIES = ['交通费', '住宿费', '出差补贴', '餐饮费', '其他'];

// ==================== 编号生成 ====================
export const generateClaimNumber = async (transaction?: Transaction): Promise<string> => {
  const today = dayjs().format('YYYYMMDD');
  const prefix = `RE-${today}-`;
  const [rows]: any = await sequelize.query(
    `SELECT MAX(claim_number) as max_num FROM expense_claim WHERE claim_number LIKE :prefix`,
    { replacements: { prefix: `${prefix}%` }, ...(transaction ? { transaction } : {}) }
  );
  let seq = 1;
  if (rows[0]?.max_num) {
    const lastSeq = parseInt(rows[0].max_num.substring(prefix.length));
    if (!isNaN(lastSeq)) seq = lastSeq + 1;
  }
  return `${prefix}${String(seq).padStart(3, '0')}`;
};

// ==================== 状态校验 ====================
/**
 * 校验状态流转是否合法
 */
export const validateStatusTransition = (
  current: string,
  action: 'submit' | 'approve' | 'reject' | 'withdraw' | 'reverse'
): boolean => {
  switch (action) {
    case 'submit':
      return current === APPROVAL_STATUS.DRAFT || current === APPROVAL_STATUS.REJECTED;
    case 'approve':
      return current === APPROVAL_STATUS.PENDING || current === APPROVAL_STATUS.IN_APPROVAL;
    case 'reject':
      return current === APPROVAL_STATUS.PENDING || current === APPROVAL_STATUS.IN_APPROVAL;
    case 'withdraw':
      return current === APPROVAL_STATUS.PENDING || current === APPROVAL_STATUS.IN_APPROVAL;
    case 'reverse':
      return current === APPROVAL_STATUS.APPROVED;
    default:
      return false;
  }
};

// ==================== 金额汇总 ====================
/**
 * 重新计算并写回主表的 total_amount / return_amount / supplement_amount
 */
export const refreshClaimAmounts = async (claimNumber: string, transaction?: Transaction) => {
  const [sumResult]: any = await sequelize.query(
    `SELECT ISNULL(SUM(amount), 0) AS total FROM expense_claim_item WHERE claim_number = :cn`,
    { replacements: { cn: claimNumber }, transaction }
  );
  const totalAmount = sumResult[0]?.total || 0;

  // 读取预支金额
  const [header]: any = await sequelize.query(
    `SELECT advance_amount FROM expense_claim WHERE claim_number = :cn`,
    { replacements: { cn: claimNumber }, transaction }
  );
  const advanceAmount = header[0]?.advance_amount || 0;

  let returnAmount = 0;
  let supplementAmount = 0;
  if (totalAmount >= advanceAmount) {
    supplementAmount = totalAmount - advanceAmount;
  } else {
    returnAmount = advanceAmount - totalAmount;
  }

  await sequelize.query(
    `UPDATE expense_claim
        SET total_amount = :total,
            return_amount = :ret,
            supplement_amount = :sup,
            updated_at = GETDATE()
      WHERE claim_number = :cn`,
    { replacements: { cn: claimNumber, total: totalAmount, ret: returnAmount, sup: supplementAmount }, transaction }
  );
};

// ==================== 审批步骤管理 ====================
/**
 * 创建审批步骤（提交时调用）
 */
export const createApprovalSteps = async (
  claimNumber: string,
  steps: Array<{ step_number: number; step_name: string; approver_id: number; approver_name: string }>,
  transaction?: Transaction
) => {
  // 先清空旧步骤
  await sequelize.query(
    `DELETE FROM expense_claim_approval_step WHERE claim_number = :cn`,
    { replacements: { cn: claimNumber }, transaction }
  );
  for (const step of steps) {
    await sequelize.query(
      `INSERT INTO expense_claim_approval_step
        (claim_number, step_number, step_name, approver_id, approver_name, status)
       VALUES (:cn, :step, :name, :aid, :aname, N'待审批')`,
      {
        replacements: { cn: claimNumber, step: step.step_number, name: step.step_name, aid: step.approver_id, aname: step.approver_name },
        transaction,
      }
    );
  }
};

/**
 * 重置所有审批步骤为待审批（重新提交时）
 */
export const resetApprovalSteps = async (claimNumber: string, transaction?: Transaction) => {
  await sequelize.query(
    `UPDATE expense_claim_approval_step
        SET status = N'待审批', approved_at = NULL, remark = NULL
      WHERE claim_number = :cn`,
    { replacements: { cn: claimNumber }, transaction }
  );
};

/**
 * 获取当前待审批步骤
 */
export const getCurrentStep = async (claimNumber: string, transaction?: Transaction): Promise<any> => {
  const [rows]: any = await sequelize.query(
    `SELECT TOP 1 * FROM expense_claim_approval_step
      WHERE claim_number = :cn AND status = N'待审批'
      ORDER BY step_number ASC`,
    { replacements: { cn: claimNumber }, transaction }
  );
  return rows[0] || null;
};

/**
 * 获取总步骤数
 */
export const getTotalSteps = async (claimNumber: string, transaction?: Transaction): Promise<number> => {
  const [rows]: any = await sequelize.query(
    `SELECT MAX(step_number) AS total FROM expense_claim_approval_step WHERE claim_number = :cn`,
    { replacements: { cn: claimNumber }, transaction }
  );
  return rows[0]?.total || 0;
};

/**
 * 审批通过当前步骤，推进主表状态
 */
export const advanceApproval = async (
  claimNumber: string,
  stepId: number,
  userId: number,
  username: string,
  remark: string | undefined,
  transaction?: Transaction
) => {
  // 通过当前步骤
  await sequelize.query(
    `UPDATE expense_claim_approval_step
        SET status = N'已通过', approved_at = GETDATE(), remark = :remark
      WHERE id = :sid`,
    { replacements: { sid: stepId, remark: remark || null }, transaction }
  );

  // 检查是否还有待审批步骤
  const [pending]: any = await sequelize.query(
    `SELECT TOP 1 step_number FROM expense_claim_approval_step
      WHERE claim_number = :cn AND status = N'待审批'
      ORDER BY step_number ASC`,
    { replacements: { cn: claimNumber }, transaction }
  );

  if (pending.length > 0) {
    // 还有下一步 → 审批中
    await sequelize.query(
      `UPDATE expense_claim SET approval_status = N'审批中', current_step = :step, updated_at = GETDATE() WHERE claim_number = :cn`,
      { replacements: { cn: claimNumber, step: pending[0].step_number }, transaction }
    );
  } else {
    // 全部通过 → 已审批
    await sequelize.query(
      `UPDATE expense_claim SET approval_status = N'已审批', current_step = 0, updated_at = GETDATE() WHERE claim_number = :cn`,
      { replacements: { cn: claimNumber }, transaction }
    );
  }

  // 写入审批日志
  await sequelize.query(
    `INSERT INTO approval_log (module, record_id, action, from_status, to_status, operator_id, operator_name, remark)
     VALUES ('expense_claim', :cn, 'approve', N'审批中', N'审批中', :uid, :uname, :remark)`,
    { replacements: { cn: claimNumber, uid: userId, uname: username, remark: remark || '审批通过' }, transaction }
  );
};
