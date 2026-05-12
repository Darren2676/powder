/**
 * 065: 创建库存流水批次明细扩展表
 * - inventory_transaction_batch: 记录每条库存流水涉及的各批次号和数量
 * - 解决 inventory_transaction.batch_number nvarchar(50) 多批次拼接截断问题
 */
import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='inventory_transaction_batch' AND xtype='U')
      CREATE TABLE inventory_transaction_batch (
        id INT IDENTITY(1,1) PRIMARY KEY,
        transaction_number NVARCHAR(50) NOT NULL,
        batch_number NVARCHAR(50) NOT NULL,
        quantity DECIMAL(18,4) DEFAULT 0,
        creation_date DATETIME DEFAULT GETDATE()
      )
    `)
    console.log('inventory_transaction_batch 表创建成功')
  } catch (e: any) {
    console.log('inventory_transaction_batch 表迁移跳过或已存在:', e?.message || e)
  }

  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_itb_transaction' AND object_id = OBJECT_ID('inventory_transaction_batch'))
      CREATE INDEX IX_itb_transaction ON inventory_transaction_batch (transaction_number)
    `)
    console.log('IX_itb_transaction 索引创建成功')
  } catch (e: any) {
    console.log('IX_itb_transaction 索引迁移跳过或已存在:', e?.message || e)
  }
}

/**
 * 回滚（可选）：
 * DROP TABLE IF EXISTS inventory_transaction_batch;
 */
