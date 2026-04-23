/**
 * 创建批次管理相关表：
 * 1. material_batch_inventory   - 物料批次库存表
 * 2. finished_batch_inventory   - 成品批次库存表
 * 3. batch_traceability         - 批次追溯关联表
 * 4. batch_number_sequence      - 批次号序列表
 * 5. ALTER inventory_transaction 添加 batch_number 字段
 * 6. 数据迁移：现有汇总库存 -> 初始批次记录
 */
const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 1433,
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
    console.log('数据库连接成功');

    // ==================== 1. material_batch_inventory ====================
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='material_batch_inventory' AND xtype='U')
      CREATE TABLE material_batch_inventory (
        id INT IDENTITY(1,1) PRIMARY KEY,
        batch_number NVARCHAR(50) NOT NULL,
        item_number NVARCHAR(100) NOT NULL,
        item_name NVARCHAR(200) DEFAULT '',
        item_type NVARCHAR(50) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        warehouse_number NVARCHAR(50) NOT NULL,
        warehouse_name NVARCHAR(200) DEFAULT '',
        quantity DECIMAL(18,4) DEFAULT 0,
        initial_quantity DECIMAL(18,4) DEFAULT 0,
        supplier_number NVARCHAR(50) DEFAULT '',
        supplier_name NVARCHAR(200) DEFAULT '',
        production_order_number NVARCHAR(50) DEFAULT '',
        inbound_date DATETIME DEFAULT GETDATE(),
        status NVARCHAR(20) DEFAULT N'正常',
        creation_date DATETIME DEFAULT GETDATE(),
        last_updated DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('material_batch_inventory 表创建成功');

    // 唯一约束
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_mbi_batch_item_wh' AND object_id = OBJECT_ID('material_batch_inventory'))
      CREATE UNIQUE INDEX UQ_mbi_batch_item_wh ON material_batch_inventory (batch_number, item_number, warehouse_number)
    `);

    // FIFO 核心索引
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_mbi_fifo' AND object_id = OBJECT_ID('material_batch_inventory'))
      CREATE INDEX IX_mbi_fifo ON material_batch_inventory (item_number, warehouse_number, inbound_date)
    `);

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_mbi_batch' AND object_id = OBJECT_ID('material_batch_inventory'))
      CREATE INDEX IX_mbi_batch ON material_batch_inventory (batch_number)
    `);

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_mbi_status' AND object_id = OBJECT_ID('material_batch_inventory'))
      CREATE INDEX IX_mbi_status ON material_batch_inventory (status)
    `);

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_mbi_prod_order' AND object_id = OBJECT_ID('material_batch_inventory'))
      CREATE INDEX IX_mbi_prod_order ON material_batch_inventory (production_order_number)
    `);
    console.log('material_batch_inventory 索引创建成功');

    // ==================== 2. finished_batch_inventory ====================
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='finished_batch_inventory' AND xtype='U')
      CREATE TABLE finished_batch_inventory (
        id INT IDENTITY(1,1) PRIMARY KEY,
        batch_number NVARCHAR(50) NOT NULL,
        item_number NVARCHAR(100) NOT NULL,
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        product_drawing_number NVARCHAR(100) DEFAULT '',
        warehouse_number NVARCHAR(50) NOT NULL,
        warehouse_name NVARCHAR(200) DEFAULT '',
        quantity DECIMAL(18,4) DEFAULT 0,
        initial_quantity DECIMAL(18,4) DEFAULT 0,
        production_order_number NVARCHAR(50) DEFAULT '',
        inbound_date DATETIME DEFAULT GETDATE(),
        status NVARCHAR(20) DEFAULT N'正常',
        creation_date DATETIME DEFAULT GETDATE(),
        last_updated DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('finished_batch_inventory 表创建成功');

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_fbi_batch_item_wh' AND object_id = OBJECT_ID('finished_batch_inventory'))
      CREATE UNIQUE INDEX UQ_fbi_batch_item_wh ON finished_batch_inventory (batch_number, item_number, warehouse_number)
    `);

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_fbi_fifo' AND object_id = OBJECT_ID('finished_batch_inventory'))
      CREATE INDEX IX_fbi_fifo ON finished_batch_inventory (item_number, warehouse_number, inbound_date)
    `);

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_fbi_batch' AND object_id = OBJECT_ID('finished_batch_inventory'))
      CREATE INDEX IX_fbi_batch ON finished_batch_inventory (batch_number)
    `);

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_fbi_prod_order' AND object_id = OBJECT_ID('finished_batch_inventory'))
      CREATE INDEX IX_fbi_prod_order ON finished_batch_inventory (production_order_number)
    `);
    console.log('finished_batch_inventory 索引创建成功');

    // ==================== 3. batch_traceability ====================
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='batch_traceability' AND xtype='U')
      CREATE TABLE batch_traceability (
        id INT IDENTITY(1,1) PRIMARY KEY,
        finished_batch_number NVARCHAR(50) NOT NULL,
        finished_item_number NVARCHAR(100) DEFAULT '',
        finished_item_name NVARCHAR(200) DEFAULT '',
        production_order_number NVARCHAR(50) DEFAULT '',
        material_batch_number NVARCHAR(50) NOT NULL,
        material_item_number NVARCHAR(100) DEFAULT '',
        material_item_name NVARCHAR(200) DEFAULT '',
        material_quantity DECIMAL(18,4) DEFAULT 0,
        issue_number NVARCHAR(50) DEFAULT '',
        link_type NVARCHAR(20) DEFAULT N'领料',
        creation_date DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('batch_traceability 表创建成功');

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_bt_finished' AND object_id = OBJECT_ID('batch_traceability'))
      CREATE INDEX IX_bt_finished ON batch_traceability (finished_batch_number)
    `);

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_bt_material' AND object_id = OBJECT_ID('batch_traceability'))
      CREATE INDEX IX_bt_material ON batch_traceability (material_batch_number)
    `);

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_bt_order' AND object_id = OBJECT_ID('batch_traceability'))
      CREATE INDEX IX_bt_order ON batch_traceability (production_order_number)
    `);
    console.log('batch_traceability 索引创建成功');

    // ==================== 4. batch_number_sequence ====================
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='batch_number_sequence' AND xtype='U')
      CREATE TABLE batch_number_sequence (
        id INT IDENTITY(1,1) PRIMARY KEY,
        prefix NVARCHAR(30) NOT NULL,
        current_seq INT DEFAULT 0,
        last_updated DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('batch_number_sequence 表创建成功');

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'UQ_bns_prefix' AND object_id = OBJECT_ID('batch_number_sequence'))
      CREATE UNIQUE INDEX UQ_bns_prefix ON batch_number_sequence (prefix)
    `);
    console.log('batch_number_sequence 索引创建成功');

    // ==================== 5. ALTER inventory_transaction 添加 batch_number ====================
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'inventory_transaction' AND COLUMN_NAME = 'batch_number')
      BEGIN
        ALTER TABLE inventory_transaction ADD batch_number NVARCHAR(50) DEFAULT ''
      END
    `);
    console.log('inventory_transaction 添加 batch_number 字段成功');

    // ==================== 6. 数据迁移：现有汇总库存 -> 初始批次记录 ====================
    // 物料库存迁移
    const [matRows] = await sequelize.query(
      `SELECT id, item_number, item_name, item_type, specifications, basic_unit,
              warehouse_number, warehouse_name, quantity, creation_date
       FROM material_inventory WHERE quantity > 0`
    );
    let matCount = 0;
    for (const row of matRows) {
      const batchNo = `INIT-${row.id}`;
      const [exist] = await sequelize.query(
        `SELECT id FROM material_batch_inventory WHERE batch_number = :bn AND item_number = :in AND warehouse_number = :wn`,
        { replacements: { bn: batchNo, in: row.item_number, wn: row.warehouse_number } }
      );
      if (exist.length === 0) {
        await sequelize.query(`
          INSERT INTO material_batch_inventory (batch_number, item_number, item_name, item_type, specifications, basic_unit,
            warehouse_number, warehouse_name, quantity, initial_quantity, inbound_date, status, creation_date, last_updated)
          VALUES (:bn, :item_number, :item_name, :item_type, :specifications, :basic_unit,
            :wn, :wn_name, :qty, :qty, :cd, N'正常', GETDATE(), GETDATE())
        `, {
          replacements: {
            bn: batchNo, item_number: row.item_number, item_name: row.item_name || '',
            item_type: row.item_type || '', specifications: row.specifications || '',
            basic_unit: row.basic_unit || '', wn: row.warehouse_number,
            wn_name: row.warehouse_name || '', qty: row.quantity,
            cd: row.creation_date || new Date()
          }
        });
        matCount++;
      }
    }
    console.log(`物料批次库存迁移完成: ${matCount} 条记录`);

    // 成品库存迁移
    const [fgRows] = await sequelize.query(
      `SELECT id, item_number, item_name, specifications, basic_unit,
              product_drawing_number, warehouse_number, warehouse_name, quantity, creation_date
       FROM finished_goods_inventory WHERE quantity > 0`
    );
    let fgCount = 0;
    for (const row of fgRows) {
      const batchNo = `INIT-FG-${row.id}`;
      const [exist] = await sequelize.query(
        `SELECT id FROM finished_batch_inventory WHERE batch_number = :bn AND item_number = :in AND warehouse_number = :wn`,
        { replacements: { bn: batchNo, in: row.item_number, wn: row.warehouse_number } }
      );
      if (exist.length === 0) {
        await sequelize.query(`
          INSERT INTO finished_batch_inventory (batch_number, item_number, item_name, specifications, basic_unit,
            product_drawing_number, warehouse_number, warehouse_name, quantity, initial_quantity,
            inbound_date, status, creation_date, last_updated)
          VALUES (:bn, :item_number, :item_name, :specifications, :basic_unit,
            :pdn, :wn, :wn_name, :qty, :qty, :cd, N'正常', GETDATE(), GETDATE())
        `, {
          replacements: {
            bn: batchNo, item_number: row.item_number, item_name: row.item_name || '',
            specifications: row.specifications || '', basic_unit: row.basic_unit || '',
            pdn: row.product_drawing_number || '', wn: row.warehouse_number,
            wn_name: row.warehouse_name || '', qty: row.quantity,
            cd: row.creation_date || new Date()
          }
        });
        fgCount++;
      }
    }
    console.log(`成品批次库存迁移完成: ${fgCount} 条记录`);

    console.log('\n全部迁移完成！');
    process.exit(0);
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

run();
