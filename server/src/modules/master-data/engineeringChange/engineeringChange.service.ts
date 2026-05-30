import sequelize from '../../../config/database';
import { Transaction } from 'sequelize';

// ==================== 状态机 ====================
export const LIFECYCLE_STATUS = {
  IN_PROGRESS: '进行中',
  COMPLETED: '已完成',
  CLOSED: '已关闭',
} as const;

export const LIFECYCLE_STATUS_VALUES = Object.values(LIFECYCLE_STATUS);

// 允许的状态流转：进行中↔已完成↔已关闭，并允许任意逆向回退到进行中
export const validateLifecycleTransition = (current: string, target: string): boolean => {
  if (!LIFECYCLE_STATUS_VALUES.includes(target as any)) return false;
  // 允许向前推进：进行中→已完成→已关闭
  // 允许逆向回退：任何状态→进行中
  if (target === LIFECYCLE_STATUS.IN_PROGRESS) return true;
  const order: Record<string, number> = {
    [LIFECYCLE_STATUS.IN_PROGRESS]: 0,
    [LIFECYCLE_STATUS.COMPLETED]: 1,
    [LIFECYCLE_STATUS.CLOSED]: 2,
  };
  return (order[target] ?? -1) - (order[current] ?? -1) === 1;
};

// ==================== 变更类型字典 ====================
export const CHANGE_TYPES = ['样件通过', '客户要求变更', '工艺调整', '其他'];

// ==================== 同步主表冗余字段 ====================
/**
 * 重新计算并写回主表的 change_count / latest_change_type / latest_change_at
 */
export const refreshLifecycleAggregates = async (lifecycleId: number, transaction?: Transaction) => {
  const [rows]: any = await sequelize.query(
    `SELECT COUNT(*) AS cnt, MAX(change_date) AS max_date
       FROM engineering_change_log WHERE lifecycle_id = :id`,
    { replacements: { id: lifecycleId }, transaction }
  );
  const cnt = rows?.[0]?.cnt ?? 0;

  let latestType: string | null = null;
  let latestAt: any = null;
  if (cnt > 0) {
    const [latest]: any = await sequelize.query(
      `SELECT TOP 1 change_type, change_date, created_at
         FROM engineering_change_log
        WHERE lifecycle_id = :id
        ORDER BY change_date DESC, id DESC`,
      { replacements: { id: lifecycleId }, transaction }
    );
    if (latest?.[0]) {
      latestType = latest[0].change_type ?? null;
      latestAt = latest[0].change_date ?? latest[0].created_at ?? null;
    }
  }

  await sequelize.query(
    `UPDATE engineering_change_lifecycle
        SET change_count = :cnt,
            latest_change_type = :latestType,
            latest_change_at = :latestAt,
            updated_at = GETDATE()
      WHERE id = :id`,
    {
      replacements: { id: lifecycleId, cnt, latestType, latestAt },
      transaction,
    }
  );
};

/**
 * 获取下一个 change_seq（按 lifecycle 累加）
 */
export const nextChangeSeq = async (lifecycleId: number, transaction?: Transaction): Promise<number> => {
  const [rows]: any = await sequelize.query(
    `SELECT ISNULL(MAX(change_seq), 0) AS max_seq
       FROM engineering_change_log WHERE lifecycle_id = :id`,
    { replacements: { id: lifecycleId }, transaction }
  );
  return (rows?.[0]?.max_seq ?? 0) + 1;
};
