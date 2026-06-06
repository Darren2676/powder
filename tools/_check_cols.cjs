const { Sequelize } = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'mssql',
  host: '127.0.0.1', port: 1433,
  database: 'XYMES', username: 'sa', password: '',
  logging: false,
  dialectOptions: { options: { encrypt: false, trustServerCertificate: true } }
});

async function main() {
  await sequelize.authenticate();
  console.log('DB connected');
  
  // Check outsourcing_order columns
  console.log('\n=== outsourcing_order columns ===');
  const [r1] = await sequelize.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='outsourcing_order' ORDER BY ORDINAL_POSITION");
  r1.forEach(c => console.log(' ', c.COLUMN_NAME));
  
  // Check outsourcing_receipt columns  
  console.log('\n=== outsourcing_receipt columns ===');
  const [r2] = await sequelize.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='outsourcing_receipt' ORDER BY ORDINAL_POSITION");
  r2.forEach(c => console.log(' ', c.COLUMN_NAME));
  
  // Check outsourcing_receipt_detail columns
  console.log('\n=== outsourcing_receipt_detail columns ===');
  const [r3] = await sequelize.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='outsourcing_receipt_detail' ORDER BY ORDINAL_POSITION");
  r3.forEach(c => console.log(' ', c.COLUMN_NAME));
  
  // Check outsourcing_material_issue columns
  console.log('\n=== outsourcing_material_issue columns ===');
  const [r4] = await sequelize.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='outsourcing_material_issue' ORDER BY ORDINAL_POSITION");
  r4.forEach(c => console.log(' ', c.COLUMN_NAME));
  
  await sequelize.close();
}

main().catch(e => console.error(e.message));
