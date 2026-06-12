/**
 * 113: Production_plan 表添加 batch_number 列
 *
 * 变更内容：
 * 1. Production_plan 表添加 batch_number 列（计划派发时自动生成的产品批次号）
 */
import sequelize from '@/config/database';

export async function up(): Promise<void> {
  console.log('113: Production_plan 表添加 batch_number 列 开始...');

  const [colCheck]: any = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Production_plan' AND COLUMN_NAME = 'batch_number'`
  );
  if (colCheck.length === 0) {
    await sequelize.query(`ALTER TABLE Production_plan ADD batch_number NVARCHAR(50) DEFAULT NULL`);
    console.log('  ✓ Production_plan.batch_number 列已添加');
  } else {
    console.log('  → batch_number 列已存在，跳过');
  }

  console.log('113: Production_plan 表添加 batch_number 列 完成');
}

export async function down(): Promise<void> {
  console.log('113 回滚: 删除 Production_plan.batch_number 列...');
  const [colCheck]: any = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Production_plan' AND COLUMN_NAME = 'batch_number'`
  );
  if (colCheck.length > 0) {
    await sequelize.query(`ALTER TABLE Production_plan DROP COLUMN batch_number`);
    console.log('  ✓ batch_number 列已删除');
  }
}
