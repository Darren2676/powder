/**
 * 081: production_inbound_order 添加撤回相关字段
 * - status: 入库单状态（正常/已撤回）
 * - withdraw_operator: 撤回操作人
 * - withdraw_date: 撤回时间
 */
import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_inbound_order' AND COLUMN_NAME = 'status')
      BEGIN
        ALTER TABLE production_inbound_order ADD status NVARCHAR(20) DEFAULT N'正常'
      END
    `)
    console.log('production_inbound_order.status 字段添加成功')
  } catch (e: any) {
    console.log('status 迁移跳过或已存在:', e?.message || e)
  }

  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_inbound_order' AND COLUMN_NAME = 'withdraw_operator')
      BEGIN
        ALTER TABLE production_inbound_order ADD withdraw_operator NVARCHAR(100) DEFAULT ''
      END
    `)
    console.log('production_inbound_order.withdraw_operator 字段添加成功')
  } catch (e: any) {
    console.log('withdraw_operator 迁移跳过或已存在:', e?.message || e)
  }

  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_inbound_order' AND COLUMN_NAME = 'withdraw_date')
      BEGIN
        ALTER TABLE production_inbound_order ADD withdraw_date DATETIME NULL
      END
    `)
    console.log('production_inbound_order.withdraw_date 字段添加成功')
  } catch (e: any) {
    console.log('withdraw_date 迁移跳过或已存在:', e?.message || e)
  }
}
