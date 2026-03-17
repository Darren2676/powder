import sequelize from './config/database';

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    const [cols]: any = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'item_master' AND COLUMN_NAME = 'business_scope'`
    );

    if (cols.length > 0) {
      console.log('business_scope 字段已存在，跳过');
    } else {
      await sequelize.query(`ALTER TABLE item_master ADD business_scope NVARCHAR(50) DEFAULT ''`);
      console.log('business_scope 字段添加成功');
    }

    process.exit(0);
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  }
}

migrate();
