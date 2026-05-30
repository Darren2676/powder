import sequelize from '../../config/database';

/**
 * 迁移：生产检验缺陷明细支持
 * - production_inspection 添加 defect_categories 字段
 * - 创建 production_inspection_defect 缺陷明细子表
 */
export async function up() {
  // 1. production_inspection 添加 defect_categories
  try {
    const [cols]: any = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_inspection' AND COLUMN_NAME = 'defect_categories'`
    );
    if (cols.length === 0) {
      await sequelize.query(`ALTER TABLE production_inspection ADD defect_categories NVARCHAR(500) DEFAULT ''`);
      console.log('[迁移094] production_inspection.defect_categories 已添加');
    } else {
      console.log('[迁移094] production_inspection.defect_categories 已存在，跳过');
    }
  } catch (e: any) { console.log('[迁移094] production_inspection defect_categories 跳过:', e.message); }

  // 2. 创建 production_inspection_defect 缺陷明细子表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='production_inspection_defect' AND xtype='U')
      CREATE TABLE production_inspection_defect (
        id INT IDENTITY(1,1) PRIMARY KEY,
        inspection_number NVARCHAR(50) NOT NULL,
        line_number INT DEFAULT 0,
        defect_class_name NVARCHAR(200) DEFAULT '',
        defect_name NVARCHAR(200) DEFAULT '',
        defect_reason_name NVARCHAR(200) DEFAULT '',
        unqualified_quantity DECIMAL(18,4) DEFAULT 0,
        inspect_result NVARCHAR(20) DEFAULT '',
        remark NVARCHAR(500) DEFAULT ''
      )
    `);
    console.log('[迁移094] production_inspection_defect 表创建成功');
  } catch (e: any) {
    console.log('[迁移094] production_inspection_defect 表迁移跳过或已存在:', e.message);
  }
}

export async function down() {
  try { await sequelize.query(`ALTER TABLE production_inspection DROP COLUMN IF EXISTS defect_categories`); } catch {}
  try { await sequelize.query(`DROP TABLE IF EXISTS production_inspection_defect`); } catch {}
  console.log('[迁移094] 回滚完成');
}
