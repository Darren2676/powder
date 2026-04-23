import sequelize from '../../config/database';

async function migrateStatusDefaults() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    const tables = [
      { table: 'schedules', name: '班次' },
      { table: '[team]', name: '班组' },
      { table: 'workshop', name: '车间' },
      { table: 'productionline', name: '生产线' },
      { table: 'storage_location', name: '库位' },
      { table: 'unit', name: '单位' }
    ];

    for (const t of tables) {
      const [result]: any = await sequelize.query(
        `UPDATE ${t.table} SET status = N'启用' WHERE status IS NULL`
      );
      console.log(`${t.name}表: 已将 NULL 状态更新为 '启用'`);
    }

    console.log('所有表 status 默认值更新完成');
    process.exit(0);
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrateStatusDefaults();
