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

    // Create material_inventory table
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'material_inventory')
      CREATE TABLE material_inventory (
        id INT IDENTITY(1,1) PRIMARY KEY,
        item_number NVARCHAR(100) NOT NULL,
        item_name NVARCHAR(200) DEFAULT '',
        item_type NVARCHAR(50) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        warehouse_number NVARCHAR(50) NOT NULL,
        warehouse_name NVARCHAR(200) DEFAULT '',
        quantity DECIMAL(18,4) DEFAULT 0,
        safety_stock_quantity DECIMAL(18,4) DEFAULT 0,
        last_updated DATETIME DEFAULT GETDATE(),
        creation_date DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('Table material_inventory created.');

    // Unique constraint
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_material_inv_item_wh')
      CREATE UNIQUE INDEX UQ_material_inv_item_wh ON material_inventory(item_number, warehouse_number)
    `);

    // Indexes for material_inventory
    const invIndexes = [
      { name: 'IX_material_inv_item_type', col: 'item_type' },
      { name: 'IX_material_inv_warehouse', col: 'warehouse_number' }
    ];
    for (const idx of invIndexes) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = '${idx.name}')
        CREATE INDEX ${idx.name} ON material_inventory(${idx.col})
      `);
    }
    console.log('Indexes for material_inventory created.');

    // Create material_inventory_transaction table
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'material_inventory_transaction')
      CREATE TABLE material_inventory_transaction (
        id INT IDENTITY(1,1) PRIMARY KEY,
        transaction_number NVARCHAR(50) NOT NULL,
        transaction_type NVARCHAR(20) DEFAULT '',
        source_type NVARCHAR(50) DEFAULT '',
        source_number NVARCHAR(50) DEFAULT '',
        item_number NVARCHAR(100) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        item_type NVARCHAR(50) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        warehouse_number NVARCHAR(50) DEFAULT '',
        warehouse_name NVARCHAR(200) DEFAULT '',
        quantity DECIMAL(18,4) DEFAULT 0,
        before_quantity DECIMAL(18,4) DEFAULT 0,
        after_quantity DECIMAL(18,4) DEFAULT 0,
        batch_number NVARCHAR(100) DEFAULT '',
        supplier_number NVARCHAR(50) DEFAULT '',
        supplier_name NVARCHAR(200) DEFAULT '',
        operator NVARCHAR(100) DEFAULT '',
        operation_date DATETIME DEFAULT GETDATE(),
        remark NVARCHAR(500) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('Table material_inventory_transaction created.');

    // Indexes for material_inventory_transaction
    const txnIndexes = [
      { name: 'IX_mat_inv_txn_number', col: 'transaction_number' },
      { name: 'IX_mat_inv_txn_item', col: 'item_number' },
      { name: 'IX_mat_inv_txn_warehouse', col: 'warehouse_number' },
      { name: 'IX_mat_inv_txn_type', col: 'transaction_type' },
      { name: 'IX_mat_inv_txn_source_type', col: 'source_type' },
      { name: 'IX_mat_inv_txn_date', col: 'creation_date' },
      { name: 'IX_mat_inv_txn_batch', col: 'batch_number' }
    ];
    for (const idx of txnIndexes) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = '${idx.name}')
        CREATE INDEX ${idx.name} ON material_inventory_transaction(${idx.col})
      `);
    }
    console.log('Indexes for material_inventory_transaction created.');

    console.log('All material warehouse tables and indexes created successfully!');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    await sequelize.close();
  }
}

run();
