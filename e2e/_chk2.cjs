const { Connection, Request } = require('tedious');
const c = new Connection({
  server: '127.0.0.1',
  authentication: { type: 'default', options: { userName: 'sa', password: 'cowork' } },
  options: { port: 1433, database: 'PowderMom', encrypt: false, trustServerCertificate: true, rowCollectionOnRequestCompletion: true, useColumnNames: true }
});
c.connect(e => {
  if (e) { console.error(e); process.exit(1); }
  const sql = `SELECT TABLE_NAME, COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE COLUMN_NAME = 'factory_id' AND TABLE_NAME IN (N'material_inventory', N'finished_batch_inventory', N'material_batch_inventory', N'mrp_run', N'mrp_run_detail', N'mrp_run_plan') ORDER BY TABLE_NAME`;
  const r = new Request(sql, (err2, rc, rows) => {
    if (err2) console.error(err2);
    else rows.forEach(r => console.log(r.TABLE_NAME.value + ' => ' + r.COLUMN_NAME.value));
    c.close();
  });
  c.execSql(r);
});