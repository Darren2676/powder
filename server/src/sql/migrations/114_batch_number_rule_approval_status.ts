/**
 * 114: 产品批次号产生规则 — 添加审核状态字段
 *
 * 变更内容：
 * 1. batch_number_rule_config 表添加 approval_status 列（未审核/已审核）
 */
import sequelize from '@/config/database';

export async function up(): Promise<void> {
  console.log('114: 产品批次号产生规则 — 添加审核状态字段 开始...');

  const [colCheck]: any = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'batch_number_rule_config' AND COLUMN_NAME = 'approval_status'`
  );
  if (colCheck.length === 0) {
    await sequelize.query(
      `ALTER TABLE batch_number_rule_config ADD approval_status NVARCHAR(10) DEFAULT N'未审核'`
    );
    // 存量数据默认为未审核
    await sequelize.query(
      `UPDATE batch_number_rule_config SET approval_status = N'未审核' WHERE approval_status IS NULL`
    );
    console.log('  ✓ approval_status 列已添加，存量数据已设为未审核');
  } else {
    console.log('  → approval_status 列已存在，跳过');
  }

  console.log('114: 产品批次号产生规则 — 添加审核状态字段 完成');
}

export async function down(): Promise<void> {
  const [colCheck]: any = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'batch_number_rule_config' AND COLUMN_NAME = 'approval_status'`
  );
  if (colCheck.length > 0) {
    await sequelize.query(`ALTER TABLE batch_number_rule_config DROP COLUMN approval_status`);
    console.log('  ✓ approval_status 列已删除');
  }
  console.log('114: 回滚完成');
}
