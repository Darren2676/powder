const { Connection, Request, TYPES } = require('tedious');
const CONFIG = { server: '127.0.0.1', authentication: { type: 'default', options: { userName: 'sa', password: 'cowork' } }, options: { port: 1433, database: 'SEALSMES', encrypt: false, trustServerCertificate: true, rowCollectionOnRequestCompletion: true, useColumnNames: true } };
function q(sql, params={}) { return new Promise((resolve, reject) => { const conn = new Connection(CONFIG); conn.connect(err => { if (err) return reject(err); const req = new Request(sql, (err, rc, rows) => { conn.close(); if (err) return reject(err); resolve((rows||[]).map(r => { const o={}; for (const k of Object.keys(r)) o[k]=r[k].value; return o; })); }); for (const k of Object.keys(params)) req.addParameter(k, params[k].type, params[k].value); conn.execSql(req); }); }); }
(async () => {
  try {
    console.log('=== Items with Approved Routing ===');
    const r1 = await q("SELECT TOP 10 process_route_number, process_route_name, item_number, item_name, approval_status, default_backflush_warehouse, production_automatic_inventory_entry_rules FROM routing_header WHERE approval_status = N'\u5DF2\u5BA1\u6279' ORDER BY process_route_number");
    r1.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== Routing Details for C100809 ===');
    const r2 = await q("SELECT process_route_number, step_number, standard_process_name, work_center_number, work_center_name, is_outsourced, flowing_backward, default_repository FROM routing_detail WHERE process_route_number IN (SELECT process_route_number FROM routing_header WHERE item_number = 'C100809' AND approval_status = N'\u5DF2\u5BA1\u6279') ORDER BY process_route_number, step_number");
    r2.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== Routing Details for 110103 ===');
    const r3 = await q("SELECT process_route_number, step_number, standard_process_name, work_center_number, work_center_name, is_outsourced, flowing_backward, default_repository FROM routing_detail WHERE process_route_number IN (SELECT process_route_number FROM routing_header WHERE item_number = '110103' AND approval_status = N'\u5DF2\u5BA1\u6279') ORDER BY process_route_number, step_number");
    r3.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== BOM Details for C100809 ===');
    const r4 = await q("SELECT bd.line_number, bd.component_item_number, bd.component_item_name, bd.standard_quantity, bd.unit, bd.supply_type, bd.default_warehouse, im.business_scope as comp_scope, im.item_type as comp_type FROM bom_detail bd JOIN item_master im ON bd.component_item_number = im.item_number WHERE bd.bom_number = (SELECT TOP 1 bom_number FROM bom_header WHERE item_number = 'C100809' AND approval_status = N'\u5DF2\u5BA1\u6279') ORDER BY bd.line_number");
    r4.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== Warehouses ===');
    const r5 = await q("SELECT warehouse_number, warehouse_name, warehouse_type FROM warehouse ORDER BY warehouse_number");
    r5.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== Recent Production Orders ===');
    const r6 = await q("SELECT TOP 5 production_order_number, item_number, item_name, planned_quantity, plan_status, approval_status, inbound_status, production_number FROM production_order ORDER BY production_order_number DESC");
    r6.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== Items with Both BOM+Routing ===');
    const r7 = await q("SELECT TOP 10 im.item_number, im.item_name, im.business_scope, im.item_type, bh.bom_number, rh.process_route_number FROM item_master im JOIN bom_header bh ON im.item_number = bh.item_number AND bh.approval_status = N'\u5DF2\u5BA1\u6279' JOIN routing_header rh ON im.item_number = rh.item_number AND rh.approval_status = N'\u5DF2\u5BA1\u6279' WHERE im.business_scope LIKE N'%\u751F\u4EA7%' ORDER BY im.item_number");
    r7.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== Recent Purchase Requisitions ===');
    const r8 = await q("SELECT TOP 5 purchase_req_number, source_number, production_number, approval_status, order_status FROM purchase_req ORDER BY purchase_req_number DESC");
    r8.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== Customers ===');
    const r9 = await q("SELECT TOP 5 customer_number, customer_name FROM customer ORDER BY customer_number");
    r9.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== Finished Goods Inventory ===');
    const r10 = await q("SELECT TOP 10 item_number, warehouse_number, quantity, quality_status FROM finished_goods_inventory WHERE quantity > 0 ORDER BY quantity DESC");
    r10.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== Material Preparations ===');
    const r11 = await q("SELECT TOP 5 preparation_number, production_order_number, preparation_status, approval_status FROM material_preparation ORDER BY preparation_number DESC");
    r11.forEach(r => console.log(JSON.stringify(r)));

    console.log('\n=== Recent Work Reports ===');
    const r12 = await q("SELECT TOP 5 work_report_number, process_task_number, production_order_number, qualified_quantity, unqualified_quantity, approval_status FROM work_report ORDER BY work_report_number DESC");
    r12.forEach(r => console.log(JSON.stringify(r)));

    process.exit(0);
  } catch(e) { console.error(e); process.exit(1); }
})();
