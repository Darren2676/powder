const { Connection, Request } = require('tedious');
const CONFIG = {
  server: '127.0.0.1',
  authentication: { type: 'default', options: { userName: 'sa', password: 'cowork' } },
  options: { port: 1433, database: 'SEALSMES', encrypt: false, trustServerCertificate: true, rowCollectionOnRequestCompletion: true, useColumnNames: true }
};
async function q(s) {
  const c = new Connection(CONFIG);
  await new Promise((r, j) => c.connect(e => e ? j(e) : r()));
  try {
    return await new Promise((r, j) => {
      const req = new Request(s, (e, rc, rows) => { if (e) return j(e); r((rows || []).map(row => { const o = {}; for (const k of Object.keys(row)) o[k] = row[k].value; return o; })); });
      c.execSql(req);
    });
  } finally { c.close(); }
}
(async () => {
  console.log('=== Raw material warehouse query ===');
  console.log(JSON.stringify(await q("SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE warehouse_type = N'原料' OR warehouse_name LIKE N'%原料%'"), null, 2));
  console.log('=== Inspection warehouse query ===');
  console.log(JSON.stringify(await q("SELECT TOP 1 warehouse_number, warehouse_name FROM warehouse WHERE warehouse_name = N'待检仓' OR warehouse_type = N'待检仓'"), null, 2));
})();
