const { Connection, Request } = require('tedious');
const CONFIG = {
  server: '127.0.0.1',
  authentication: { type: 'default', options: { userName: 'sa', password: 'cowork' } },
  options: { port: 1433, database: 'SEALSMES', encrypt: false, trustServerCertificate: true, rowCollectionOnRequestCompletion: true, useColumnNames: true }
};

async function query(sql) {
  const conn = new Connection(CONFIG);
  await new Promise((resolve, reject) => conn.connect(err => err ? reject(err) : resolve()));
  try {
    return await new Promise((resolve, reject) => {
      const req = new Request(sql, (err, rowCount, rows) => {
        if (err) return reject(err);
        resolve((rows || []).map(r => { const o = {}; for (const k of Object.keys(r)) o[k] = r[k].value; return o; }));
      });
      conn.execSql(req);
    });
  } finally { conn.close(); }
}

(async () => {
  try {
    console.log('=== Purchase Quality Inspections (recent) ===');
    console.log(JSON.stringify(await query("SELECT TOP 5 inspection_number, stock_in_number, item_number, batch_number, inspect_status, inspect_result, qualified_quantity, unqualified_quantity FROM purchase_quality_inspection ORDER BY creation_date DESC"), null, 2));

    console.log('\n=== Stock In Details (recent) ===');
    console.log(JSON.stringify(await query("SELECT TOP 5 stock_in_number, line_number, item_number, batch_number, warehouse_number, inspect_status FROM stock_in_detail ORDER BY line_number DESC"), null, 2));

    console.log('\n=== Material Batch Inventory in 待检仓 ===');
    console.log(JSON.stringify(await query("SELECT TOP 10 batch_number, item_number, item_name, warehouse_number, warehouse_name, quantity, status FROM material_batch_inventory WHERE warehouse_number = '09' ORDER BY inbound_date DESC"), null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
