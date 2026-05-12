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
    // 1. Stock In records
    console.log('\n=== Stock In ===');
    console.log(JSON.stringify(await query('SELECT TOP 5 stock_in_number, purchase_order_number, warehouse_number, warehouse_name, stock_in_type, approval_status FROM stock_in ORDER BY creation_date DESC'), null, 2));

    // 2. Stock In Detail
    console.log('\n=== Stock In Detail ===');
    console.log(JSON.stringify(await query('SELECT TOP 5 stock_in_number, line_number, item_number, item_name, stock_in_quantity, warehouse_number, inspection_number, inspect_status FROM stock_in_detail ORDER BY line_number DESC'), null, 2));

    // 3. All purchase orders (not just approved)
    console.log('\n=== All Purchase Orders ===');
    console.log(JSON.stringify(await query('SELECT TOP 10 purchase_order_number, supplier_number, supplier_name, approval_status, order_status FROM purchase_order ORDER BY creation_date DESC'), null, 2));

    // 4. Purchase Order Detail for PUR-20260505-001
    console.log('\n=== PO Detail PUR-20260505-001 ===');
    console.log(JSON.stringify(await query("SELECT id, purchase_order_number, line_number, item_number, item_name, specifications, basic_unit, order_quantity, received_quantity, receive_status FROM purchase_order_detail WHERE purchase_order_number = 'PUR-20260505-001'"), null, 2));

    // 5. Item master count by incoming_inspection
    console.log('\n=== Item Master incoming_inspection distribution ===');
    console.log(JSON.stringify(await query("SELECT incoming_inspection, COUNT(*) as cnt FROM item_master GROUP BY incoming_inspection"), null, 2));

    // 6. Items with incoming_inspection IS NULL or empty
    console.log('\n=== Items with NULL/empty incoming_inspection ===');
    console.log(JSON.stringify(await query("SELECT TOP 5 item_number, item_name, specifications, basic_unit, incoming_inspection, default_warehouse, item_type FROM item_master WHERE incoming_inspection IS NULL OR incoming_inspection = ''"), null, 2));

    // 7. Item types distribution
    console.log('\n=== Item type distribution ===');
    console.log(JSON.stringify(await query("SELECT item_type, COUNT(*) as cnt FROM item_master GROUP BY item_type ORDER BY cnt DESC"), null, 2));

    // 8. Items that are raw materials (原材料)
    console.log('\n=== Raw material items (原材料) ===');
    console.log(JSON.stringify(await query("SELECT TOP 10 item_number, item_name, specifications, basic_unit, incoming_inspection, default_warehouse, item_type FROM item_master WHERE item_type = N'原材料'"), null, 2));

    // 9. Outsourcing Order table columns check
    console.log('\n=== Outsourcing Order columns ===');
    console.log(JSON.stringify(await query("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'outsourcing_order' ORDER BY ORDINAL_POSITION"), null, 2));

    // 10. Outsourcing Receipt columns
    console.log('\n=== Outsourcing Receipt columns ===');
    console.log(JSON.stringify(await query("SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'outsourcing_receipt' ORDER BY ORDINAL_POSITION"), null, 2));

  } catch (err) {
    console.error('Error:', err.message);
  }
})();
