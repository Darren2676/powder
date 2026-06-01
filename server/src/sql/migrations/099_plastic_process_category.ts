import sequelize from '../../config/database';

export async function up() {
  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'plastic_process_category')
    BEGIN
      CREATE TABLE plastic_process_category (
        id INT IDENTITY(1,1) PRIMARY KEY,
        category_code NVARCHAR(20) NOT NULL,
        category_name NVARCHAR(100) NOT NULL,
        remark NVARCHAR(500) NULL,
        approval_status NVARCHAR(20) NOT NULL DEFAULT N'草稿',
        creation_date NVARCHAR(20) NULL,
        creation_man NVARCHAR(50) NULL
      );

      -- 初始数据
      INSERT INTO plastic_process_category (category_code, category_name, remark, approval_status, creation_date)
      VALUES (N'01', N'预混工艺', NULL, N'草稿', CONVERT(NVARCHAR(20), GETDATE(), 120));
      INSERT INTO plastic_process_category (category_code, category_name, remark, approval_status, creation_date)
      VALUES (N'02', N'挤出工艺', NULL, N'草稿', CONVERT(NVARCHAR(20), GETDATE(), 120));
      INSERT INTO plastic_process_category (category_code, category_name, remark, approval_status, creation_date)
      VALUES (N'03', N'研磨工艺', NULL, N'草稿', CONVERT(NVARCHAR(20), GETDATE(), 120));
    END
  `);
  console.log('[迁移] 099 塑粉工艺分类表创建完成');
}

export async function down() {
  await sequelize.query(`IF EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'plastic_process_category') DROP TABLE plastic_process_category`);
}
