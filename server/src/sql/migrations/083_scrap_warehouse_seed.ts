import sequelize from '../../config/database';

/**
 * 083: 补全报废仓库 warehouse 记录（按工厂编码创建）
 * 确保 warehouse 表为每个工厂存在「报废仓库」记录，
 * 使用新编码体系: SC-N-01（宁国）、SC-G-01（广州）。
 */
export async function runMigration(): Promise<void> {
  // 获取所有工厂
  const [factories]: any = await sequelize.query(
    `SELECT id, factory_code, factory_name FROM factory ORDER BY id`
  );
  if (factories.length === 0) {
    // 无工厂记录时，创建一个无 factory_id 的通用报废仓（兼容旧版）
    const [existing]: any = await sequelize.query(
      `SELECT warehouse_number FROM warehouse WHERE warehouse_type = N'报废仓库'`
    );
    if (existing.length === 0) {
      await sequelize.query(`
        INSERT INTO warehouse (
          warehouse_number, warehouse_name, warehouse_type, [condition],
          supplier_number, customer_number, enable_location, default_location,
          is_system_warehouse, is_in_balance, remark,
          creation_date, creation_man, last_updater, last_updated_at
        ) VALUES (
          N'SC-XX-01', N'报废仓库', N'报废仓库', N'启用',
          N'', N'', N'否', N'',
          N'是', N'是', N'系统自动创建-报废仓',
          GETDATE(), N'SYSTEM', N'SYSTEM', GETDATE()
        )
      `);
      console.log('  ✓ 报废仓库已创建 (SC-XX-01, 无工厂绑定)');
    } else {
      console.log(`  → 报废仓库已存在 (${existing[0].warehouse_number})，跳过`);
    }
    console.log('083: 报废仓库 seed 完成');
    return;
  }

  // 为每个工厂创建报废仓库
  const factoryCodeMap: Record<number, string> = { 14: 'N', 15: 'G' }; // 宁国=N, 广州=G
  for (const f of factories) {
    const fc = factoryCodeMap[f.id] || (f.factory_code || '').toUpperCase();
    const whNumber = `SC-${fc}-01`;
    const [existing]: any = await sequelize.query(
      `SELECT warehouse_number FROM warehouse WHERE warehouse_number = N'${whNumber}' OR (warehouse_type = N'报废仓库' AND factory_id = ${f.id})`
    );
    if (existing.length === 0) {
      await sequelize.query(`
        INSERT INTO warehouse (
          warehouse_number, warehouse_name, warehouse_type, [condition], factory_id,
          supplier_number, customer_number, enable_location, default_location,
          is_system_warehouse, is_in_balance, remark,
          creation_date, creation_man, last_updater, last_updated_at
        ) VALUES (
          N'${whNumber}', N'报废仓库', N'报废仓库', N'启用', ${f.id},
          N'', N'', N'否', N'',
          N'是', N'是', N'系统自动创建-报废仓(${f.factory_name})',
          GETDATE(), N'SYSTEM', N'SYSTEM', GETDATE()
        )
      `);
      console.log(`  ✓ 报废仓库已创建 (${whNumber}, 工厂: ${f.factory_name})`);
    } else {
      console.log(`  → 报废仓库已存在 (${existing[0].warehouse_number})，跳过`);
    }
  }

  console.log('083: 报废仓库 seed 完成');
}

// 直接运行此文件时执行（umzug 导入时也会调用 .runMigration()）
runMigration().then(() => process.exit(0)).catch(err => { console.error('083 迁移失败:', err); process.exit(1); });
