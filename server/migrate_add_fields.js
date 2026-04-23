var fs = require('fs');
fs.writeFileSync('migrate_log.txt', 'start\n');

var sequelize = require('./dist/config/database').default;
fs.appendFileSync('migrate_log.txt', 'loaded\n');

sequelize.authenticate()
  .then(function() {
    fs.appendFileSync('migrate_log.txt', 'connected\n');
    return sequelize.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_order' AND COLUMN_NAME = 'customer_po_number'");
  })
  .then(function(r) {
    fs.appendFileSync('migrate_log.txt', 'check1: ' + JSON.stringify(r[0]) + '\n');
    if (r[0].length === 0) {
      return sequelize.query("ALTER TABLE sales_order ADD customer_po_number NVARCHAR(100) DEFAULT ''");
    }
    return Promise.resolve();
  })
  .then(function() {
    fs.appendFileSync('migrate_log.txt', 'col1 done\n');
    return sequelize.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_order_detail' AND COLUMN_NAME = 'promised_delivery_date'");
  })
  .then(function(r) {
    fs.appendFileSync('migrate_log.txt', 'check2: ' + JSON.stringify(r[0]) + '\n');
    if (r[0].length === 0) {
      return sequelize.query("ALTER TABLE sales_order_detail ADD promised_delivery_date DATE NULL");
    }
    return Promise.resolve();
  })
  .then(function() {
    fs.appendFileSync('migrate_log.txt', 'done\n');
    process.exit(0);
  })
  .catch(function(err) {
    fs.appendFileSync('migrate_log.txt', 'error: ' + err.message + '\n');
    process.exit(1);
  });
console.log('Starting migration...');
const sequelize = require('./dist/config/database').default;

sequelize.authenticate()
  .then(function() {
    console.log('Database connected');
    return sequelize.query("IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_order' AND COLUMN_NAME = 'customer_po_number') ALTER TABLE sales_order ADD customer_po_number NVARCHAR(100) DEFAULT ''");
  })
  .then(function() {
    console.log('Added customer_po_number to sales_order');
    return sequelize.query("IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_order_detail' AND COLUMN_NAME = 'promised_delivery_date') ALTER TABLE sales_order_detail ADD promised_delivery_date DATE NULL");
  })
  .then(function() {
    console.log('Added promised_delivery_date to sales_order_detail');
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch(function(err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  });
const sequelize = require('./dist/config/database').default;

async function run() {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    await sequelize.query(
      "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_order' AND COLUMN_NAME = 'customer_po_number') ALTER TABLE sales_order ADD customer_po_number NVARCHAR(100) DEFAULT ''"
    );
    console.log('Added customer_po_number to sales_order');

    await sequelize.query(
      "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_order_detail' AND COLUMN_NAME = 'promised_delivery_date') ALTER TABLE sales_order_detail ADD promised_delivery_date DATE NULL"
    );
    console.log('Added promised_delivery_date to sales_order_detail');

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  }
}

run();
const sequelize = require('./dist/config/database').default;

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected');

    // Add customer_po_number to sales_order table
    await sequelize.query(
      `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_order' AND COLUMN_NAME = 'customer_po_number')
       ALTER TABLE sales_order ADD customer_po_number NVARCHAR(100) DEFAULT ''`
    );
    console.log('Added customer_po_number to sales_order');

    // Add promised_delivery_date to sales_order_detail table
    await sequelize.query(
      `IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_order_detail' AND COLUMN_NAME = 'promised_delivery_date')
       ALTER TABLE sales_order_detail ADD promised_delivery_date DATE NULL`
    );
    console.log('Added promised_delivery_date to sales_order_detail');

    console.log('Migration completed successfully');
    process.exit(0);
  } catch (err) {
    console.error('Migration error:', err.message);
    process.exit(1);
  }
})();
