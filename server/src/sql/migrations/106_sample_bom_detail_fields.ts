import sequelize from '../../config/database';

/**
 * 106: sample_bom_version_detail — 添加设计BOM明细缺失字段
 * 从 bom_detail 同步以下字段，确保"从设计BOM导入"时完整保留明细数据：
 * step_number, is_key_material, substitute_group, substitute_priority, supply_type, default_warehouse
 */
export async function runMigration(): Promise<void> {
  const columns = [
    { name: 'step_number', type: 'NVARCHAR(50)', default: "''" },
    { name: 'is_key_material', type: 'INT', default: '0' },
    { name: 'substitute_group', type: 'NVARCHAR(50)', default: "''" },
    { name: 'substitute_priority', type: 'INT', default: '0' },
    { name: 'supply_type', type: 'NVARCHAR(50)', default: "''" },
    { name: 'default_warehouse', type: 'NVARCHAR(50)', default: "''" },
  ];

  for (const col of columns) {
    const [check]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sample_bom_version_detail' AND COLUMN_NAME = '${col.name}'`
    );
    if (check[0].cnt === 0) {
      await sequelize.query(
        `ALTER TABLE sample_bom_version_detail ADD ${col.name} ${col.type} DEFAULT ${col.default}`
      );
      console.log(`  ✓ sample_bom_version_detail.${col.name} 已添加`);
    } else {
      console.log(`  → sample_bom_version_detail.${col.name} 已存在，跳过`);
    }
  }

  console.log('\nsample_bom_version_detail 字段补全迁移完成。');
}

// 直接运行
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(err => { console.error('迁移失败:', err); process.exit(1); });
}
