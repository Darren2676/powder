const { Sequelize } = require('sequelize');
async function main() {
  const sequelize = new Sequelize('SEALSMES', 'sa', 'cowork', {
    host: '127.0.0.1', port: 1433, dialect: 'mssql',
    dialectOptions: { options: { encrypt: false, trustServerCertificate: true } },
    logging: false
  });
  try {
    await sequelize.authenticate();

    // 检查 work_report 表是否存在及结构
    const [tables] = await sequelize.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'work_report'`);
    if (tables.length === 0) {
      console.log('work_report 表不存在!');
      const [all] = await sequelize.query(`SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME LIKE '%work%report%' OR TABLE_NAME LIKE '%work%' ORDER BY TABLE_NAME`);
      console.log('可能的表:', all.map(t => t.TABLE_NAME));
    } else {
      console.log('work_report 表存在');
      // 查所有报工记录总数
      const [cnt] = await sequelize.query('SELECT COUNT(*) as cnt FROM work_report');
      console.log('报工记录总数:', cnt[0].cnt);
      
      // 直接查 P20260504005 的报工记录
      const [reports] = await sequelize.query(`
        SELECT w.id, w.process_task_number, w.step_number, w.standard_process_name, w.qualified_quantity, w.unqualified_quantity, w.report_status, w.creation_date
        FROM work_report w
        WHERE w.production_order_number = 'P20260504005'
        ORDER BY w.creation_date
      `);
      if (reports.length === 0) console.log('P20260504005 无报工记录');
      else reports.forEach(r => console.log(r));

      // 查最新几条报工记录（任意生产单）
      const [recent] = await sequelize.query('SELECT TOP 5 id, process_task_number, production_order_number, step_number, qualified_quantity, report_status, creation_date FROM work_report ORDER BY id DESC');
      console.log('\n最新5条报工记录:');
      recent.forEach(r => console.log(r));
    }

  } catch(e) { console.error('ERROR:', e.message || e); }
  await sequelize.close();
}
main();
