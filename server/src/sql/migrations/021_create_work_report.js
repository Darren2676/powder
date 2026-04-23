const { Sequelize } = require('sequelize');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const sequelize = new Sequelize(
  process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASSWORD,
  { host: process.env.DB_HOST, port: parseInt(process.env.DB_PORT || '1433'), dialect: 'mssql', logging: false, dialectOptions: { options: { encrypt: false, trustServerCertificate: true } } }
);

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Connected.');

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'work_report')
      CREATE TABLE work_report (
        work_report_number NVARCHAR(50) PRIMARY KEY,
        process_task_number NVARCHAR(50) DEFAULT '',
        production_order_number NVARCHAR(50) DEFAULT '',
        step_number INT NULL,
        standard_process_name NVARCHAR(100) DEFAULT '',
        item_number NVARCHAR(50) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        work_center_number NVARCHAR(50) DEFAULT '',
        work_center_name NVARCHAR(200) DEFAULT '',
        planned_quantity DECIMAL(18,4) DEFAULT 0,
        qualified_quantity DECIMAL(18,4) DEFAULT 0,
        unqualified_quantity DECIMAL(18,4) DEFAULT 0,
        total_quantity DECIMAL(18,4) DEFAULT 0,
        cumulative_quantity DECIMAL(18,4) DEFAULT 0,
        report_date NVARCHAR(50) DEFAULT '',
        schedules_id NVARCHAR(50) DEFAULT '',
        schedules_name NVARCHAR(100) DEFAULT '',
        team_number NVARCHAR(50) DEFAULT '',
        team_name NVARCHAR(100) DEFAULT '',
        operator_number NVARCHAR(50) DEFAULT '',
        operator_name NVARCHAR(100) DEFAULT '',
        actual_start_time NVARCHAR(50) DEFAULT '',
        actual_end_time NVARCHAR(50) DEFAULT '',
        actual_hours DECIMAL(18,2) DEFAULT 0,
        unqualified_reason NVARCHAR(500) DEFAULT '',
        approval_status NVARCHAR(20) DEFAULT N'草稿',
        remark NVARCHAR(500) DEFAULT '',
        creation_date NVARCHAR(50) DEFAULT '',
        creation_man NVARCHAR(50) DEFAULT ''
      )
    `);
    console.log('Table work_report created.');

    const indexes = [
      { name: 'IX_work_report_task', col: 'process_task_number' },
      { name: 'IX_work_report_order', col: 'production_order_number' },
      { name: 'IX_work_report_date', col: 'report_date' },
      { name: 'IX_work_report_approval', col: 'approval_status' },
      { name: 'IX_work_report_operator', col: 'operator_number' }
    ];
    for (const idx of indexes) {
      await sequelize.query(`IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = '${idx.name}') CREATE INDEX ${idx.name} ON work_report(${idx.col})`);
    }
    console.log('Indexes created. Done!');
  } catch (err) { console.error('Error:', err.message); }
  finally { await sequelize.close(); }
}
run();
