const { Sequelize } = require('sequelize');
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '1433'),
    dialect: 'mssql',
    logging: false,
    dialectOptions: {
      options: { encrypt: false, trustServerCertificate: true }
    }
  }
);

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Connected to database.');

    // Create material_issue table
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'material_issue')
      CREATE TABLE material_issue (
        issue_number NVARCHAR(50) PRIMARY KEY,
        preparation_number NVARCHAR(50) DEFAULT '',
        production_order_number NVARCHAR(50) DEFAULT '',
        production_number NVARCHAR(50) DEFAULT '',
        item_number NVARCHAR(50) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        planned_quantity DECIMAL(18,4) DEFAULT 0,
        total_issue_items INT DEFAULT 0,
        issue_status NVARCHAR(20) DEFAULT N'已领料',
        remark NVARCHAR(500) DEFAULT '',
        creation_date NVARCHAR(50) DEFAULT '',
        creation_man NVARCHAR(50) DEFAULT ''
      )
    `);
    console.log('Table material_issue created.');

    // Create indexes for material_issue
    const miIndexes = [
      { name: 'IX_material_issue_prep_number', col: 'preparation_number' },
      { name: 'IX_material_issue_order', col: 'production_order_number' },
      { name: 'IX_material_issue_date', col: 'creation_date' }
    ];
    for (const idx of miIndexes) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = '${idx.name}')
        CREATE INDEX ${idx.name} ON material_issue(${idx.col})
      `);
    }
    console.log('Indexes for material_issue created.');

    // Create material_issue_detail table
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'material_issue_detail')
      CREATE TABLE material_issue_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        issue_number NVARCHAR(50) NOT NULL,
        preparation_detail_id INT DEFAULT 0,
        line_number INT DEFAULT 10,
        material_number NVARCHAR(50) DEFAULT '',
        material_name NVARCHAR(200) DEFAULT '',
        material_type NVARCHAR(50) DEFAULT '',
        unit NVARCHAR(20) DEFAULT '',
        required_quantity DECIMAL(18,4) DEFAULT 0,
        actual_quantity DECIMAL(18,4) DEFAULT 0,
        batch_number NVARCHAR(100) DEFAULT '',
        step_number INT NULL,
        work_center_name NVARCHAR(200) DEFAULT '',
        is_key_material INT DEFAULT 0,
        default_warehouse NVARCHAR(50) DEFAULT '',
        remark NVARCHAR(500) DEFAULT ''
      )
    `);
    console.log('Table material_issue_detail created.');

    // Create indexes for material_issue_detail
    const detailIndexes = [
      { name: 'IX_mi_detail_issue_number', col: 'issue_number' },
      { name: 'IX_mi_detail_prep_detail', col: 'preparation_detail_id' },
      { name: 'IX_mi_detail_material', col: 'material_number' }
    ];
    for (const idx of detailIndexes) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = '${idx.name}')
        CREATE INDEX ${idx.name} ON material_issue_detail(${idx.col})
      `);
    }
    console.log('Indexes for material_issue_detail created.');

    console.log('All tables and indexes created successfully!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await sequelize.close();
  }
}

run();
