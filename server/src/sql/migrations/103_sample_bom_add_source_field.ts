import sequelize from '../../config/database';

/**
 * 103: 样件BOM — 增加 source_design_bom_number 字段
 * 记录从哪个设计BOM导入创建，便于追溯
 */
export async function runMigration(): Promise<void> {
  // 检查字段是否已存在
  const [colCheck]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_NAME = 'sample_bom_header' AND COLUMN_NAME = 'source_design_bom_number'`
  );
  if (colCheck[0].cnt === 0) {
    await sequelize.query(
      `ALTER TABLE sample_bom_header ADD source_design_bom_number NVARCHAR(50) DEFAULT ''`
    );
    console.log('  ✓ sample_bom_header.source_design_bom_number 字段已添加');
  } else {
    console.log('  → source_design_bom_number 字段已存在，跳过');
  }

  console.log('\n样件BOM来源字段迁移完成。');
}

// 直接运行
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(err => { console.error('迁移失败:', err); process.exit(1); });
}
