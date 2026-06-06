const { Sequelize } = require('sequelize');
async function main() {
  const sequelize = new Sequelize('SEALSMES', 'sa', 'cowork', {
    host: '127.0.0.1', port: 1433, dialect: 'mssql',
    dialectOptions: { options: { encrypt: false, trustServerCertificate: true } },
    logging: false
  });
  try {
    await sequelize.authenticate();

    // 查询 work_report 表结构
    const [cols] = await sequelize.query(`SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'work_report' ORDER BY ORDINAL_POSITION`);
    console.log('work_report 表字段:');
    cols.forEach(c => console.log(`  ${c.COLUMN_NAME} (${c.DATA_TYPE}, ${c.IS_NULLABLE === 'YES' ? '可空' : '非空'})`));

    // 查询 work_report 的约束
    const [constraints] = await sequelize.query(`
      SELECT COL_NAME(fc.parent_object_id, fc.parent_column_id) as column_name, OBJECT_NAME(fc.parent_object_id) as table_name
      FROM sys.foreign_key_columns fc
      WHERE OBJECT_NAME(fc.referenced_object_id) = 'process_task'
    `);
    console.log('\nwork_report 外键约束:');
    constraints.forEach(c => console.log(`  ${c.table_name}.${c.column_name}`));

  } catch(e) { console.error('ERROR:', e.message || e); }
  await sequelize.close();
}
main();
