import sequelize from '../../config/database';

/**
 * 069: 补全待检仓 warehouse 记录
 * 确保 warehouse 表存在「待检仓」记录（warehouse_type='待检仓'），
 * 供来料检验入库分流和检验合格后仓移使用。
 */
export async function runMigration(): Promise<void> {
  // 1. 待检仓（来料检验使用）
  const [existing]: any = await sequelize.query(
    `SELECT warehouse_number FROM warehouse WHERE warehouse_name = N'待检仓' OR warehouse_type = N'待检仓'`
  );

  if (existing.length === 0) {
    await sequelize.query(`
      INSERT INTO warehouse (
        warehouse_number, warehouse_name, warehouse_type, [condition],
        supplier_number, customer_number, enable_location, default_location,
        is_system_warehouse, is_in_balance, remark,
        creation_date, creation_man, last_updater, last_updated_at
      ) VALUES (
        N'INSP-001', N'待检仓', N'待检仓', N'启用',
        N'', N'', N'否', N'',
        N'是', N'是', N'系统自动创建-来料检验待检仓',
        GETDATE(), N'SYSTEM', N'SYSTEM', GETDATE()
      )
    `);
    console.log('  ✓ 待检仓已创建 (INSP-001)');
  } else {
    console.log(`  → 待检仓已存在 (${existing[0].warehouse_number})，跳过 INSERT`);
  }

  // 2. 确保已有待检仓记录的 warehouse_type 字段补全
  await sequelize.query(`
    UPDATE warehouse SET warehouse_type = N'待检仓'
    WHERE warehouse_name = N'待检仓' AND (warehouse_type IS NULL OR warehouse_type = N'')
  `);

  console.log('069: 待检仓 seed 完成');
}

// 直接运行此文件时执行（umzug 导入时也会调用 .runMigration()）
runMigration().then(() => process.exit(0)).catch(err => { console.error('069 迁移失败:', err); process.exit(1); });

