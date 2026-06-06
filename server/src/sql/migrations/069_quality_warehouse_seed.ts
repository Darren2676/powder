import sequelize from '../../config/database';

/**
 * 069: 补全待检仓 warehouse 记录（按工厂编码创建）
 * 确保 warehouse 表为每个工厂存在「待检仓」记录，
 * 使用新编码体系: QC-N-01（宁国）、QC-G-01（广州）。
 */
export async function runMigration(): Promise<void> {
  // 获取所有工厂
  const [factories]: any = await sequelize.query(
    `SELECT id, factory_code, factory_name FROM factory ORDER BY id`
  );
  if (factories.length === 0) {
    // 无工厂记录时，创建一个无 factory_id 的通用待检仓（兼容旧版）
    const [existing]: any = await sequelize.query(
      `SELECT warehouse_number FROM warehouse WHERE warehouse_type = N'待检仓'`
    );
    if (existing.length === 0) {
      await sequelize.query(`
        INSERT INTO warehouse (
          warehouse_number, warehouse_name, warehouse_type, [condition],
          supplier_number, customer_number, enable_location, default_location,
          is_system_warehouse, is_in_balance, remark,
          creation_date, creation_man, last_updater, last_updated_at
        ) VALUES (
          N'QC-XX-01', N'待检仓', N'待检仓', N'启用',
          N'', N'', N'否', N'',
          N'是', N'是', N'系统自动创建-来料检验待检仓',
          GETDATE(), N'SYSTEM', N'SYSTEM', GETDATE()
        )
      `);
      console.log('  ✓ 待检仓已创建 (QC-XX-01, 无工厂绑定)');
    } else {
      console.log(`  → 待检仓已存在 (${existing[0].warehouse_number})，跳过`);
    }
    console.log('069: 待检仓 seed 完成');
    return;
  }

  // 为每个工厂创建待检仓
  const factoryCodeMap: Record<number, string> = { 14: 'N', 15: 'G' }; // 宁国=N, 广州=G
  for (const f of factories) {
    const fc = factoryCodeMap[f.id] || (f.factory_code || '').toUpperCase();
    const whNumber = `QC-${fc}-01`;
    const [existing]: any = await sequelize.query(
      `SELECT warehouse_number FROM warehouse WHERE warehouse_number = N'${whNumber}' OR (warehouse_type = N'待检仓' AND factory_id = ${f.id})`
    );
    if (existing.length === 0) {
      await sequelize.query(`
        INSERT INTO warehouse (
          warehouse_number, warehouse_name, warehouse_type, [condition], factory_id,
          supplier_number, customer_number, enable_location, default_location,
          is_system_warehouse, is_in_balance, remark,
          creation_date, creation_man, last_updater, last_updated_at
        ) VALUES (
          N'${whNumber}', N'待检仓', N'待检仓', N'启用', ${f.id},
          N'', N'', N'否', N'',
          N'是', N'是', N'系统自动创建-来料检验待检仓(${f.factory_name})',
          GETDATE(), N'SYSTEM', N'SYSTEM', GETDATE()
        )
      `);
      console.log(`  ✓ 待检仓已创建 (${whNumber}, 工厂: ${f.factory_name})`);
    } else {
      console.log(`  → 待检仓已存在 (${existing[0].warehouse_number})，跳过`);
    }
  }

  console.log('069: 待检仓 seed 完成');
}

// 直接运行此文件时执行（umzug 导入时也会调用 .runMigration()）
runMigration().then(() => process.exit(0)).catch(err => { console.error('069 迁移失败:', err); process.exit(1); });

