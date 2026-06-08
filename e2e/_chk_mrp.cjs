const { Connection, Request, TYPES } = require('tedious');
const c = new Connection({
  server: '127.0.0.1',
  authentication: { type: 'default', options: { userName: 'sa', password: 'cowork' } },
  options: { port: 1433, database: 'PowderMom', encrypt: false, trustServerCertificate: true, rowCollectionOnRequestCompletion: true, useColumnNames: true }
});
c.connect(e => {
  if (e) { console.error(e); process.exit(1); }
  const sql = `SELECT TABLE_NAME, COLUMN_NAME, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME IN (N'mrp_run', N'mrp_run_detail', N'mrp_run_plan') ORDER BY TABLE_NAME, ORDINAL_POSITION`;
  const r = new Request(sql, (err2, rc, rows) => {
    if (err2) console.error(err2);
    else {
      let cur = '';
      rows.forEach(r => {
        const tbl = r.TABLE_NAME.value;
        const col = r.COLUMN_NAME.value;
        const nul = r.IS_NULLABLE.value;
        if (tbl !== cur) { cur = tbl; console.log('\n=== ' + tbl + ' ==='); }
        console.log('  ' + col + ' | nullable=' + nul);
      });
    }
    c.close();
  });
  c.execSql(r);
});