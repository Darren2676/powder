const { Connection, Request, TYPES } = require('tedious');

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
        resolve((rows || []).map(r => { const obj = {}; for (const k of Object.keys(r)) obj[k] = r[k].value; return obj; }));
      });
      conn.execSql(req);
    });
  } finally { conn.close(); }
}

async function main() {
  try {
    // Check inspection batch_number
    const rows = await query(
      `SELECT inspection_number, batch_number, inspect_status, item_number, stock_in_number
       FROM purchase_quality_inspection
       WHERE inspection_number LIKE 'QI-2026%'
       ORDER BY creation_date DESC`
    );
    console.log('Inspections:');
    for (const r of rows) {
      console.log(`  ${r.inspection_number} batch="${r.batch_number}" status="${r.inspect_status}" item="${r.item_number}" SI="${r.stock_in_number}"`);
    }

    // Check stock_in_detail batch_number
    const sidRows = await query(
      `SELECT stock_in_number, item_number, batch_number, inspection_number, inspect_status
       FROM stock_in_detail
       WHERE stock_in_number LIKE 'SI-20260518%'
       ORDER BY stock_in_number DESC`
    );
    console.log('Stock-in details:');
    for (const r of sidRows) {
      console.log(`  ${r.stock_in_number} item="${r.item_number}" batch="${r.batch_number}" insp="${r.inspection_number}" status="${r.inspect_status}"`);
    }

    // Check warehouses
    const whRows = await query(
      `SELECT warehouse_number, warehouse_name, warehouse_type FROM warehouse ORDER BY warehouse_number`
    );
    console.log('Warehouses:');
    for (const r of whRows) {
      console.log(`  ${r.warehouse_number} name="${r.warehouse_name}" type="${r.warehouse_type}"`);
    }

    // Check material_batch_inventory in待检仓
    const mbRows = await query(
      `SELECT batch_number, item_number, warehouse_number, quantity, status
       FROM material_batch_inventory
       WHERE warehouse_number = '09' AND quantity > 0
       ORDER BY inbound_date DESC`
    );
    console.log('待检仓 batches:');
    for (const r of mbRows) {
      console.log(`  batch="${r.batch_number}" item="${r.item_number}" qty="${r.quantity}" status="${r.status}"`);
    }
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

main();