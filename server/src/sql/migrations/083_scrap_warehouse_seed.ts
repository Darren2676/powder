import sequelize from '../../config/database';

/**
 * 083: 补全报废仓库 warehouse 记录
 * 确保 warehouse 表存在「报废仓库」记录（warehouse_number='08', warehouse_type='报废仓库'），
 * 供报废入库单和报废仓处置使用。
 */
export async function runMigration(): Promise<void> {
  // 1. 检查是否已存在报废仓库
  const [existing]: any = await sequelize.query(
    `SELECT warehouse_number, warehouse_type FROM warehouse WHERE warehouse_name = N'报废仓库' OR warehouse_type = N'报废仓库' OR warehouse_number = N'08'`
  );

  if (existing.length === 0) {
    await sequelize.query(`
      INSERT INTO warehouse (
        warehouse_number, warehouse_name, warehouse_type, [condition],
        supplier_number, customer_number, enable_location, default_location,
        is_system_warehouse, is_in_balance, remark,
        creation_date, creation_man, last_updater, last_updated_at
      ) VALUES (
        N'08', N'报废仓库', N'报废仓库', N'启用',
        N'', N'', N'否', N'',
        N'是', N'是', N'系统自动创建-报废仓',
        GETDATE(), N'SYSTEM', N'SYSTEM', GETDATE()
      )
    `);
    console.log('  ✓ 报废仓库已创建 (08)');
  } else {
    console.log(`  → 报废仓库已存在 (${existing[0].warehouse_number})，跳过 INSERT`);
  }

  // 2. 确保已有报废仓库记录的 warehouse_type 字段补全
  await sequelize.query(`
    UPDATE warehouse SET warehouse_type = N'报废仓库'
    WHERE warehouse_number = N'08' AND (warehouse_type IS NULL OR warehouse_type = N'' OR warehouse_type <> N'报废仓库')
  `);

  // 3. 确保仓库名称一致
  await sequelize.query(`
    UPDATE warehouse SET warehouse_name = N'报废仓库'
    WHERE warehouse_number = N'08' AND warehouse_name <> N'报废仓库'
  `);

  console.log('083: 报废仓库 seed 完成');
}

// 直接运行此文件时执行（umzug 导入时也会调用 .runMigration()）
runMigration().then(() => process.exit(0)).catch(err => { console.error('083 迁移失败:', err); process.exit(1); });
