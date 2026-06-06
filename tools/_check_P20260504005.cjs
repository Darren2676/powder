const { Sequelize } = require('sequelize');
async function main() {
  const sequelize = new Sequelize('SEALSMES', 'sa', 'cowork', {
    host: '127.0.0.1', port: 1433, dialect: 'mssql',
    dialectOptions: { options: { encrypt: false, trustServerCertificate: true } },
    logging: false
  });
  try {
    await sequelize.authenticate();

    const orderNo = 'P20260504005';

    // 1. 生产单信息
    console.log('=== 生产单信息 ===');
    const [orders] = await sequelize.query(`SELECT production_order_number, item_number, item_name, planned_quantity, plan_status, approval_status FROM production_order WHERE production_order_number = :no`, { replacements: { no: orderNo } });
    console.log(orders[0]);

    // 2. 按工序备料单
    console.log('\n=== 备料单 ===');
    const [preps] = await sequelize.query(`SELECT preparation_number, item_number, preparation_status, approval_status FROM material_preparation WHERE production_order_number = :no`, { replacements: { no: orderNo } });
    preps.forEach(p => console.log(p));

    // 3. 工序任务
    console.log('\n=== 工序任务 ===');
    const [tasks] = await sequelize.query(`SELECT process_task_number, step_number, standard_process_name, task_status, planned_quantity, completed_quantity, inspect_status FROM process_task WHERE production_order_number = :no ORDER BY step_number`, { replacements: { no: orderNo } });
    tasks.forEach(t => console.log(t));

    // 4. 报工记录
    console.log('\n=== 报工记录 ===');
    const [reports] = await sequelize.query(`SELECT w.process_task_number, w.step_number, w.qualified_quantity, w.unqualified_quantity, w.total_quantity, w.cumulative_quantity, w.report_status, w.creation_date, w.id FROM work_report w INNER JOIN process_task t ON w.process_task_number = t.process_task_number WHERE t.production_order_number = :no ORDER BY w.creation_date`, { replacements: { no: orderNo } });
    if (reports.length === 0) {
      console.log('(无报工记录)');
    } else {
      reports.forEach(r => console.log(r));
    }

    // 5. 备料单明细
    console.log('\n=== 备料单明细 ===');
    for (const p of preps) {
      const [details] = await sequelize.query(`SELECT material_number, material_name, step_number, required_quantity, issued_quantity FROM material_preparation_detail WHERE preparation_number = :pn ORDER BY line_number`, { replacements: { pn: p.preparation_number } });
      details.forEach(d => console.log(d));
    }

  } catch(e) { console.error(e); }
  await sequelize.close();
}
main();
