const { Sequelize } = require('d:\\rubber\\Seals MES System\\server\\node_modules\\sequelize');
const seq = new Sequelize('SEALSMES', 'sa', 'cowork', { host: '127.0.0.1', port: 1433, dialect: 'mssql', dialectOptions: { options: { encrypt: false, trustServerCertificate: true } }, logging: false });
(async () => {
  const [r] = await seq.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='shipping_order_detail'");
  r.forEach(c => console.log(c.COLUMN_NAME));
  const [r2] = await seq.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='sales_order_detail'");
  console.log('---sales_order_detail---');
  r2.forEach(c => console.log(c.COLUMN_NAME));
  await seq.close();
  process.exit(0);
})();
