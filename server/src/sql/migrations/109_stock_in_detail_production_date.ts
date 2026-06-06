/**
 * 109: stock_in_detail 增加 production_date (生产日期)
 * 采购入库单明细支持录入生产日期，用于有效期管理
 */
import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  try {
    const [check]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'stock_in_detail' AND COLUMN_NAME = 'production_date'`
    )
    if (check[0]?.cnt > 0) {
      console.log('[迁移] stock_in_detail.production_date 已存在，跳过')
      return
    }
    await sequelize.query(
      `ALTER TABLE stock_in_detail ADD production_date DATETIME NULL`
    )
    console.log('[迁移] stock_in_detail.production_date 添加成功')
  } catch (e: any) {
    console.log('[迁移] stock_in_detail.production_date 迁移失败:', e?.message || e)
  }
}

// 直接运行
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(err => { console.error('迁移失败:', err); process.exit(1) })
}
