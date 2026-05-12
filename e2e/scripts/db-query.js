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
    console.log('\n=== Items with incoming_inspection=Y ===');
    console.log(JSON.stringify(await query("SELECT TOP 5 item_number, item_name, specifications, basic_unit, incoming_inspection, default_warehouse FROM item_master WHERE incoming_inspection = 'Y'"), null, 2));

    console.log('\n=== Items with incoming_inspection=N ===');
    console.log(JSON.stringify(await query("SELECT TOP 5 item_number, item_name, specifications, basic_unit, incoming_inspection, default_warehouse FROM item_master WHERE incoming_inspection = 'N'"), null, 2));

    console.log('\n=== Warehouses ===');
    console.log(JSON.stringify(await query('SELECT TOP 20 warehouse_number, warehouse_name, warehouse_type FROM warehouse'), null, 2));

    console.log('\n=== Suppliers ===');
    console.log(JSON.stringify(await query('SELECT TOP 5 supplier_number, supplier_name FROM supplier'), null, 2));

    console.log('\n=== Approved Purchase Orders with Details ===');
    console.log(JSON.stringify(await query("SELECT TOP 5 po.purchase_order_number, po.supplier_number, po.supplier_name, po.approval_status, po.order_status, pod.item_number, pod.item_name, pod.specifications, pod.basic_unit, pod.order_quantity, pod.received_quantity FROM purchase_order po JOIN purchase_order_detail pod ON po.purchase_order_number = pod.purchase_order_number WHERE po.approval_status = N'已审批' ORDER BY po.creation_date DESC"), null, 2));

    console.log('\n=== Approved Outsourcing Orders ===');
    console.log(JSON.stringify(await query("SELECT TOP 5 outsourcing_order_number, process_task_number, item_number, item_name, specifications, basic_unit, planned_quantity, supplier_number, supplier_name, approval_status, order_status FROM outsourcing_order WHERE approval_status = N'已审批' ORDER BY creation_date DESC"), null, 2));

    console.log('\n=== Outsourcing Receipts ===');
    console.log(JSON.stringify(await query('SELECT TOP 5 receipt_number, outsourcing_order_number, status, inspection_status FROM outsourcing_receipt ORDER BY creation_date DESC'), null, 2));

    console.log('\n=== Active Process Tasks ===');
    console.log(JSON.stringify(await query("SELECT TOP 5 process_task_number, production_order_number, item_number, item_name, planned_quantity, completed_quantity, task_status, step_number, work_center_number FROM process_task WHERE task_status IN (N'进行中', N'未开始') ORDER BY process_task_number DESC"), null, 2));

    console.log('\n=== Material Batch Inventory (with stock) ===');
    console.log(JSON.stringify(await query("SELECT TOP 5 batch_number, item_number, item_name, warehouse_number, warehouse_name, quantity, item_type, status FROM material_batch_inventory WHERE quantity > 0 AND status = N'正常' ORDER BY inbound_date DESC"), null, 2));

    console.log('\n=== Purchase Quality Inspection ===');
    console.log(JSON.stringify(await query('SELECT TOP 3 inspection_number, item_number, inspect_status, inspect_result FROM purchase_quality_inspection ORDER BY creation_date DESC'), null, 2));

    console.log('\n=== Outsourcing Inspection ===');
    console.log(JSON.stringify(await query('SELECT TOP 3 inspection_number, receipt_number, inspection_status, inspection_result FROM outsourcing_inspection ORDER BY creation_date DESC'), null, 2));

    console.log('\n=== Outsourcing Order (all statuses) ===');
    console.log(JSON.stringify(await query('SELECT TOP 10 outsourcing_order_number, process_task_number, item_number, approval_status, order_status FROM outsourcing_order ORDER BY creation_date DESC'), null, 2));

    console.log('\n=== Purchase Receiving Notices ===');
    console.log(JSON.stringify(await query('SELECT TOP 5 receiving_number, purchase_order_number, approval_status FROM purchase_receiving_notice ORDER BY creation_date DESC'), null, 2));
  } catch (err) {
    console.error('Error:', err.message);
  }
})();
