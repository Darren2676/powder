import sequelize from '../../config/database';

/**
 * 107: 有效期管理
 * - item_master 新增 enable_shelf_life (启用有效期) 和 shelf_life_days (有效天数)
 * - material_batch_inventory 新增 production_date (生产日期)
 * - finished_batch_inventory 新增 production_date (生产日期)
 * - semi_production_inbound_order_detail 新增 production_date (生产日期)
 */
export async function runMigration(): Promise<void> {
  // 1. item_master 新增字段
  const itemMasterCols = [
    { name: 'enable_shelf_life', type: 'NVARCHAR(10)', default: "N'N'" },
    { name: 'shelf_life_days', type: 'INT', default: '0' },
  ];

  for (const col of itemMasterCols) {
    const [check]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'item_master' AND COLUMN_NAME = '${col.name}'`
    );
    if (check[0].cnt === 0) {
      await sequelize.query(`ALTER TABLE item_master ADD ${col.name} ${col.type} DEFAULT ${col.default}`);
      console.log(`  ✓ item_master.${col.name} 已添加`);
    } else {
      console.log(`  → item_master.${col.name} 已存在，跳过`);
    }
  }

  // 2. 批次库存表新增 production_date
  const batchTables = [
    'material_batch_inventory',
    'finished_batch_inventory',
    'semi_production_inbound_order_detail',
  ];

  for (const table of batchTables) {
    const [check]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${table}' AND COLUMN_NAME = 'production_date'`
    );
    if (check[0].cnt === 0) {
      await sequelize.query(`ALTER TABLE ${table} ADD production_date DATETIME NULL`);
      console.log(`  ✓ ${table}.production_date 已添加`);
    } else {
      console.log(`  → ${table}.production_date 已存在，跳过`);
    }
  }

  console.log('\n有效期管理字段迁移完成。');
}

// 直接运行
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(err => { console.error('迁移失败:', err); process.exit(1); });
}
