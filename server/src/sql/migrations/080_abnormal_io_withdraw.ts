/**
 * 080: abnormal_io_request 添加撤消相关字段
 * - withdraw_operator: 撤消操作人
 * - withdraw_date: 撤消时间
 */
import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'abnormal_io_request' AND COLUMN_NAME = 'withdraw_operator')
      BEGIN
        ALTER TABLE abnormal_io_request ADD withdraw_operator NVARCHAR(100) DEFAULT ''
      END
    `)
    console.log('abnormal_io_request.withdraw_operator 字段添加成功')
  } catch (e: any) {
    console.log('withdraw_operator 迁移跳过或已存在:', e?.message || e)
  }

  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'abnormal_io_request' AND COLUMN_NAME = 'withdraw_date')
      BEGIN
        ALTER TABLE abnormal_io_request ADD withdraw_date DATETIME NULL
      END
    `)
    console.log('abnormal_io_request.withdraw_date 字段添加成功')
  } catch (e: any) {
    console.log('withdraw_date 迁移跳过或已存在:', e?.message || e)
  }
}
