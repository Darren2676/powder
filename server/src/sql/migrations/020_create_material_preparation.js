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

    // Create material_preparation table
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'material_preparation')
      CREATE TABLE material_preparation (
        preparation_number NVARCHAR(50) PRIMARY KEY,
        production_order_number NVARCHAR(50) DEFAULT '',
        production_number NVARCHAR(50) DEFAULT '',
        item_number NVARCHAR(50) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        bom_number NVARCHAR(50) DEFAULT '',
        bom_version NVARCHAR(20) DEFAULT '',
        planned_quantity DECIMAL(18,4) DEFAULT 0,
        bom_base_quantity DECIMAL(18,4) DEFAULT 1,
        total_material_types INT DEFAULT 0,
        preparation_status NVARCHAR(20) DEFAULT N'未领料',
        approval_status NVARCHAR(20) DEFAULT N'草稿',
        remark NVARCHAR(500) DEFAULT '',
        creation_date NVARCHAR(50) DEFAULT '',
        creation_man NVARCHAR(50) DEFAULT ''
      )
    `);
    console.log('Table material_preparation created.');

    // Create indexes for material_preparation
    const mpIndexes = [
      { name: 'IX_material_preparation_order', col: 'production_order_number' },
      { name: 'IX_material_preparation_item', col: 'item_number' },
      { name: 'IX_material_preparation_status', col: 'preparation_status' },
      { name: 'IX_material_preparation_approval', col: 'approval_status' }
    ];
    for (const idx of mpIndexes) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = '${idx.name}')
        CREATE INDEX ${idx.name} ON material_preparation(${idx.col})
      `);
    }
    console.log('Indexes for material_preparation created.');

    // Create material_preparation_detail table
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'material_preparation_detail')
      CREATE TABLE material_preparation_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        preparation_number NVARCHAR(50) NOT NULL,
        line_number INT DEFAULT 10,
        material_number NVARCHAR(50) DEFAULT '',
        material_name NVARCHAR(200) DEFAULT '',
        material_type NVARCHAR(50) DEFAULT '',
        unit NVARCHAR(20) DEFAULT '',
        bom_standard_quantity DECIMAL(18,4) DEFAULT 0,
        bom_wastage_rate DECIMAL(18,4) DEFAULT 0,
        bom_actual_quantity DECIMAL(18,4) DEFAULT 0,
        required_quantity DECIMAL(18,4) DEFAULT 0,
        adjusted_quantity DECIMAL(18,4) DEFAULT 0,
        issued_quantity DECIMAL(18,4) DEFAULT 0,
        step_number INT NULL,
        work_center_number NVARCHAR(50) DEFAULT '',
        work_center_name NVARCHAR(200) DEFAULT '',
        is_key_material INT DEFAULT 0,
        substitute_group NVARCHAR(50) DEFAULT '',
        substitute_priority INT DEFAULT 0,
        supply_type NVARCHAR(50) DEFAULT '',
        default_warehouse NVARCHAR(50) DEFAULT '',
        bom_path NVARCHAR(500) DEFAULT '',
        remark NVARCHAR(500) DEFAULT ''
      )
    `);
    console.log('Table material_preparation_detail created.');

    // Create indexes for material_preparation_detail
    const detailIndexes = [
      { name: 'IX_mp_detail_prep_number', col: 'preparation_number' },
      { name: 'IX_mp_detail_material', col: 'material_number' },
      { name: 'IX_mp_detail_step', col: 'step_number' }
    ];
    for (const idx of detailIndexes) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = '${idx.name}')
        CREATE INDEX ${idx.name} ON material_preparation_detail(${idx.col})
      `);
    }
    console.log('Indexes for material_preparation_detail created.');

    console.log('All tables and indexes created successfully!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await sequelize.close();
  }
}

run();
