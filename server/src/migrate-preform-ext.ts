import sequelize from './config/database';

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    const [tables]: any = await sequelize.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'preform_ext'`
    );

    if (tables.length > 0) {
      console.log('preform_ext 表已存在，跳过创建');
    } else {
      await sequelize.query(`
        CREATE TABLE preform_ext (
          item_number NVARCHAR(50) PRIMARY KEY,
          rubber_compound_number NVARCHAR(50) DEFAULT '',
          standard_pass_rate NVARCHAR(50) DEFAULT '',
          CONSTRAINT FK_preform_ext_item FOREIGN KEY (item_number) REFERENCES item_master(item_number)
        )
      `);
      console.log('preform_ext 表创建成功');
    }

    process.exit(0);
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  }
}

migrate();
