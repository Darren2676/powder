/**
 * 110: 仓库编码体系重构 — 每工厂独立仓库编码 (RM-N-01 格式)
 *
 * 变更内容：
 * 1. warehouse 表添加 factory_id 列
 * 2. 创建 warehouse_number_mapping 映射表（旧编号 → 新编号）
 * 3. 为宁国工厂(id=14)和广州工厂(id=15)各创建一套仓库
 * 4. 将所有旧编号引用的业务数据更新为新编号
 * 5. 删除旧编号的仓库记录
 */
import sequelize from '@/config/database';
import { QueryTypes } from 'sequelize';

export async function up(): Promise<void> {
  console.log('110: 仓库编码体系重构开始...');

  // ============================================================
  // 第一步：warehouse 表添加 factory_id 列
  // ============================================================
  const [factoryIdCol]: any = await sequelize.query(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'warehouse' AND COLUMN_NAME = 'factory_id'`
  );
  if (factoryIdCol.length === 0) {
    await sequelize.query(`ALTER TABLE warehouse ADD factory_id INT NULL`);
    console.log('  ✓ warehouse.factory_id 列已添加');
  } else {
    console.log('  → factory_id 列已存在，跳过');
  }

  // ============================================================
  // 第二步：创建映射表 warehouse_number_mapping
  // ============================================================
  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'warehouse_number_mapping')
    CREATE TABLE warehouse_number_mapping (
      old_number NVARCHAR(50) NOT NULL,
      new_number NVARCHAR(50) NOT NULL,
      factory_id INT NOT NULL,
      factory_code NVARCHAR(10) NOT NULL,
      warehouse_type NVARCHAR(50),
      CONSTRAINT pk_wh_mapping PRIMARY KEY (old_number, factory_id)
    )
  `);
  console.log('  ✓ warehouse_number_mapping 映射表已创建');

  // ============================================================
  // 第三步：定义旧编号 → 新编号映射
  // ============================================================
  // 宁国工厂 (id=14, code='N')
  const ningGuoMappings: Array<{ old: string; new: string; type: string; name: string }> = [
    { old: '01',       new: 'FG-N-01', type: '成品仓库',  name: '成品仓库' },
    { old: '02',       new: 'SF-N-01', type: '半成品仓',  name: '成型件库' },
    { old: '03',       new: 'RM-N-02', type: '原材料仓',  name: '胶料库' },
    { old: '04',       new: 'RM-N-01', type: '原材料仓',  name: '原材料仓库' },
    { old: '05',       new: 'RM-N-03', type: '原材料仓',  name: '骨架库' },
    { old: '06',       new: 'SF-N-02', type: '半成品仓',  name: '已涂胶骨架库' },
    { old: '07',       new: 'RM-N-04', type: '原材料仓',  name: '化工原材料' },
    { old: '08',       new: 'SC-N-01', type: '报废仓库',  name: '报废仓库' },
    { old: '09',       new: 'QC-N-01', type: '待检仓',    name: '待检仓' },
    { old: '10',       new: 'WB-N-01', type: '线边仓库',  name: '车间仓库' },
    { old: '11',       new: 'GP-N-01', type: '普通仓库',  name: '通用仓库' },
    { old: 'INSP-001', new: 'QC-N-01', type: '待检仓',    name: '待检仓(系统)' },
  ];

  // 广州工厂 (id=15, code='G') — 与宁国对等创建
  const guangZhouMappings: Array<{ old: string; new: string; type: string; name: string }> = [
    { old: 'FG-G',     new: 'FG-G-01', type: '成品仓库',  name: '成品仓库' },
    { old: 'SF-G',     new: 'SF-G-01', type: '半成品仓',  name: '成型件库' },
    { old: 'RM-G-01',  new: 'RM-G-01', type: '原材料仓',  name: '原材料仓库' },
    { old: 'RM-G-02',  new: 'RM-G-02', type: '原材料仓',  name: '胶料库' },
    { old: 'RM-G-03',  new: 'RM-G-03', type: '原材料仓',  name: '骨架库' },
    { old: 'RM-G-04',  new: 'RM-G-04', type: '原材料仓',  name: '化工原材料' },
    { old: 'SF-G-02',  new: 'SF-G-02', type: '半成品仓',  name: '已涂胶骨架库' },
    { old: 'SC-G-01',  new: 'SC-G-01', type: '报废仓库',  name: '报废仓库' },
    { old: 'QC-G-01',  new: 'QC-G-01', type: '待检仓',    name: '待检仓' },
    { old: 'WB-G-01',  new: 'WB-G-01', type: '线边仓库',  name: '车间仓库' },
    { old: 'GP-G-01',  new: 'GP-G-01', type: '普通仓库',  name: '通用仓库' },
  ];

  // ============================================================
  // 第四步：写入映射表
  // ============================================================
  for (const m of ningGuoMappings) {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM warehouse_number_mapping WHERE old_number = :old AND factory_id = 14)
      INSERT INTO warehouse_number_mapping (old_number, new_number, factory_id, factory_code, warehouse_type)
      VALUES (:old, :new, 14, N'N', :type)
    `, { replacements: { old: m.old, new: m.new, type: m.type } });
  }
  for (const m of guangZhouMappings) {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM warehouse_number_mapping WHERE old_number = :old AND factory_id = 15)
      INSERT INTO warehouse_number_mapping (old_number, new_number, factory_id, factory_code, warehouse_type)
      VALUES (:old, :new, 15, N'G', :type)
    `, { replacements: { old: m.old, new: m.new, type: m.type } });
  }
  console.log('  ✓ 映射数据写入完成');

  // ============================================================
  // 第五步：为宁国工厂更新现有仓库记录的 warehouse_number + factory_id
  // ============================================================
  // 先给现有记录设置 factory_id = 14 (宁国)
  await sequelize.query(`UPDATE warehouse SET factory_id = 14 WHERE factory_id IS NULL`);
  console.log('  ✓ 现有仓库 factory_id 已设为14(宁国)');

  // 更新宁国仓库编号为新编码
  for (const m of ningGuoMappings) {
    // INSP-001 与 09 合并到 QC-N-01，需特殊处理
    if (m.old === 'INSP-001') {
      // 删除 INSP-001 记录（功能合并到 QC-N-01）
      await sequelize.query(`DELETE FROM warehouse WHERE warehouse_number = N'INSP-001'`);
      continue;
    }
    const [existing]: any = await sequelize.query(
      `SELECT warehouse_number FROM warehouse WHERE warehouse_number = :old`,
      { replacements: { old: m.old } }
    );
    if (existing.length > 0) {
      await sequelize.query(`
        UPDATE warehouse SET warehouse_number = :new, warehouse_type = :type
        WHERE warehouse_number = :old
      `, { replacements: { new: m.new, old: m.old, type: m.type } });
      console.log(`  ✓ ${m.old} → ${m.new}`);
    }
  }

  // ============================================================
  // 第六步：为广州工厂创建仓库记录
  // ============================================================
  for (const m of guangZhouMappings) {
    const [existing]: any = await sequelize.query(
      `SELECT warehouse_number FROM warehouse WHERE warehouse_number = :new`,
      { replacements: { new: m.new } }
    );
    if (existing.length === 0) {
      await sequelize.query(`
        INSERT INTO warehouse (warehouse_number, warehouse_name, warehouse_type, [condition], factory_id,
          is_system_warehouse, is_in_balance, creation_date, creation_man)
        VALUES (:new, :name, :type, N'启用', 15,
          CASE WHEN :type IN (N'待检仓', N'报废仓库') THEN N'是' ELSE N'否' END,
          N'是', GETDATE(), N'系统迁移')
      `, { replacements: { new: m.new, name: m.name, type: m.type } });
      console.log(`  ✓ 创建广州仓库 ${m.new}`);
    }
  }

  // ============================================================
  // 第七步：批量更新所有业务表中的 warehouse_number 引用
  // ============================================================
  const tablesToUpdate = [
    'material_batch_inventory',
    'material_inventory',
    'material_inventory_transaction',
    'finished_batch_inventory',
    'finished_goods_inventory',
    'inventory_transaction',
    'stock_in',
    'stock_in_detail',
    'stock_out',
    'stock_out_detail',
    'lineside_inventory_transaction',
    'backflush_task',
    'warehouse_manager',
    'process_task',
    'production_order',
    'shipping_request',
    'shipping_request_detail',
    'purchase_receiving_notice',
    'purchase_receiving_notice_detail',
    'material_preparation',
    'material_preparation_detail',
    'work_report',
  ];

  // 只更新宁国工厂的旧编号映射（广州工厂是新建的，不会有旧编号数据）
  const ningGuoOnlyMappings = ningGuoMappings.filter(m => m.old !== 'INSP-001');

  for (const table of tablesToUpdate) {
    // 检查表是否存在且有 warehouse_number 列
    const [cols]: any = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${table}' AND COLUMN_NAME = 'warehouse_number'`
    );
    if (cols.length === 0) continue;

    let updateCount = 0;
    for (const m of ningGuoOnlyMappings) {
      const [result]: any = await sequelize.query(`
        UPDATE ${table} SET warehouse_number = :new WHERE warehouse_number = :old
      `, { replacements: { new: m.new, old: m.old } });
      updateCount += (result as any)?.affectedRows ?? 0;
    }
    if (updateCount > 0) {
      console.log(`  ✓ ${table}: ${updateCount} 行已更新`);
    }
  }

  // 特殊处理：warehouse_manager 表按旧编号更新
  for (const m of ningGuoOnlyMappings) {
    await sequelize.query(`
      UPDATE warehouse_manager SET warehouse_number = :new WHERE warehouse_number = :old
    `, { replacements: { new: m.new, old: m.old } });
  }
  // 清理 INSP-001 的 warehouse_manager
  await sequelize.query(`DELETE FROM warehouse_manager WHERE warehouse_number = N'INSP-001'`);

  console.log('110: 仓库编码体系重构完成');
}

export async function down(): Promise<void> {
  console.log('110: 回滚仓库编码体系重构...');

  // 恢复宁国仓库旧编号
  const ningGuoMappings: Array<{ old: string; new: string }> = [
    { old: '01',       new: 'FG-N-01' },
    { old: '02',       new: 'SF-N-01' },
    { old: '03',       new: 'RM-N-02' },
    { old: '04',       new: 'RM-N-01' },
    { old: '05',       new: 'RM-N-03' },
    { old: '06',       new: 'SF-N-02' },
    { old: '07',       new: 'RM-N-04' },
    { old: '08',       new: 'SC-N-01' },
    { old: '09',       new: 'QC-N-01' },
    { old: '10',       new: 'WB-N-01' },
    { old: '11',       new: 'GP-N-01' },
  ];

  // 恢复 warehouse 表
  for (const m of ningGuoMappings) {
    await sequelize.query(`UPDATE warehouse SET warehouse_number = :old WHERE warehouse_number = :new`,
      { replacements: { old: m.old, new: m.new } });
  }

  // 删除广州工厂仓库
  await sequelize.query(`DELETE FROM warehouse WHERE factory_id = 15 AND warehouse_number LIKE '%-G-%'`);

  // 恢复业务表
  const tablesToRollback = [
    'material_batch_inventory', 'material_inventory', 'material_inventory_transaction',
    'finished_batch_inventory', 'finished_goods_inventory', 'inventory_transaction',
    'stock_in', 'stock_in_detail', 'stock_out', 'stock_out_detail',
    'lineside_inventory_transaction', 'backflush_task', 'warehouse_manager',
  ];
  for (const table of tablesToRollback) {
    const [cols]: any = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${table}' AND COLUMN_NAME = 'warehouse_number'`
    );
    if (cols.length === 0) continue;
    for (const m of ningGuoMappings) {
      await sequelize.query(`UPDATE ${table} SET warehouse_number = :old WHERE warehouse_number = :new`,
        { replacements: { old: m.old, new: m.new } });
    }
  }

  // 删除映射表和 factory_id 列
  await sequelize.query(`DROP TABLE IF EXISTS warehouse_number_mapping`);
  await sequelize.query(`ALTER TABLE warehouse DROP COLUMN IF EXISTS factory_id`);

  console.log('110: 回滚完成');
}