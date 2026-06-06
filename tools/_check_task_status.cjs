const { Sequelize } = require('sequelize');
async function main() {
  const sequelize = new Sequelize('SEALSMES', 'sa', 'cowork', {
    host: '127.0.0.1', port: 1433, dialect: 'mssql',
    dialectOptions: { options: { encrypt: false, trustServerCertificate: true } },
    logging: false
  });
  try {
    await sequelize.authenticate();

    // 查工序任务完整字段
    const [tasks] = await sequelize.query(`
      SELECT process_task_number, step_number, standard_process_name, task_status, approval_status,
             planned_quantity, completed_quantity, excess_reporting_ratio, inspect_status
      FROM process_task WHERE production_order_number = 'P20260504005' ORDER BY step_number
    `);
    console.log('工序任务详情:');
    tasks.forEach(t => console.log(t));

    // 查 production_order 完整状态
    const [orders] = await sequelize.query(`
      SELECT production_order_number, plan_status, actual_daily_output
      FROM production_order WHERE production_order_number = 'P20260504005'
    `);
    console.log('\n生产单状态:', orders[0]);

    // 查 work_report 表是否有任何数据
    const [wr] = await sequelize.query('SELECT TOP 5 work_report_number, process_task_number, production_order_number, approval_status FROM work_report ORDER BY creation_date DESC');
    console.log('\nwork_report 最新记录:');
    wr.forEach(w => console.log(w));

    // 查 material_issue_line 领料记录
    const [issues] = await sequelize.query(`
      SELECT TOP 5 issue_number, production_order_number, approval_status, creation_date
      FROM material_issue WHERE production_order_number = 'P20260504005' ORDER BY creation_date DESC
    `);
    console.log('\n领料记录:');
    issues.forEach(i => console.log(i));

    // 查 P20260504003 的报工记录(之前测试过的订单)
    const [prev] = await sequelize.query(`
      SELECT work_report_number, process_task_number, qualified_quantity, approval_status, creation_date
      FROM work_report WHERE production_order_number = 'P20260504003'
    `);
    console.log('\nP20260504003 报工记录:');
    prev.forEach(p => console.log(p));

  } catch(e) { console.error('ERROR:', e.message || e); }
  await sequelize.close();
}
main();
