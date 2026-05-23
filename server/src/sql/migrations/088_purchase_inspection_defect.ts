import { Sequelize } from 'sequelize';

export const up = async (sequelize: Sequelize): Promise<void> => {
  // 创建采购检验单缺陷明细子表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_inspection_defect' AND xtype='U')
      CREATE TABLE purchase_inspection_defect (
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
    console.log('[088] purchase_inspection_defect 表创建成功');
  } catch (e: any) {
    console.log('[088] purchase_inspection_defect 表迁移跳过或已存在:', e.message || e);
  }
};

export const down = async (sequelize: Sequelize): Promise<void> => {
  try {
    await sequelize.query(`DROP TABLE IF EXISTS purchase_inspection_defect`);
  } catch { /* ignore */ }
};
