/**
 * 生产单综合合格率字段迁移
 * - production_order 增加 yield_rate 字段
 */

import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_order' AND COLUMN_NAME = 'yield_rate')
      ALTER TABLE production_order ADD yield_rate DECIMAL(5,2) DEFAULT NULL
    `)
    console.log('production_order.yield_rate 字段迁移完成')
  } catch (e) { console.log('production_order.yield_rate 字段迁移跳过或已存在', (e as Error).message) }
}
