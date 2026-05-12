const { Connection, Request, TYPES } = require('tedious');
const CONFIG = { server: '127.0.0.1', authentication: { type: 'default', options: { userName: 'sa', password: 'cowork' } }, options: { port: 1433, database: 'SEALSMES', encrypt: false, trustServerCertificate: true, rowCollectionOnRequestCompletion: true, useColumnNames: true } };
function q(sql, params={}) { return new Promise((resolve, reject) => { const conn = new Connection(CONFIG); conn.connect(err => { if (err) return reject(err); const req = new Request(sql, (err, rc, rows) => { conn.close(); if (err) return reject(err); resolve((rows||[]).map(r => { const o={}; for (const k of Object.keys(r)) o[k]=r[k].value; return o; })); }); for (const k of Object.keys(params)) req.addParameter(k, params[k].type, params[k].value); conn.execSql(req); }); }); }
(async () => {
  try {
    // 1. Items with approved BOM
    console.log('=== Items with Approved BOM ===');
    const bomItems = await q("SELECT TOP 10 bh.bom_number, bh.item_number, bh.item_name, bh.approval_status as bom_approval, im.business_scope, im.item_type, im.incoming_inspection FROM bom_header bh JOIN item_master im ON bh.item_number = im.item_number WHERE bh.approval_status = N'已审批' ORDER BY bh.bom_number");
    bomItems.forEach(r => console.log(JSON.stringify(r)));

    // 2. Items with approved Routing
    console.log('\n=== Items with Approved Routing ===');
    const routingItems = await q("SELECT TOP 10 rh.routing_number, rh.item_number, rh.item_name, rh.approval_status as routing_approval, rh.default_backflush_warehouse FROM routing_header rh WHERE rh.approval_status = N'已审批' ORDER BY rh.routing_number");
    routingItems.forEach(r => console.log(JSON.stringify(r)));

    // 3. BOM details (components)
    if (bomItems.length > 0) {
      console.log('\n=== BOM Details for ' + bomItems[0].item_number + ' ===');
      const boms = await q("SELECT bd.item_number, bd.item_name, bd.component_item_number, bd.component_item_name, bd.component_quantity, bd.component_unit, im.business_scope as comp_scope, im.item_type as comp_type FROM bom_detail bd JOIN item_master im ON bd.component_item_number = im.item_number WHERE bd.bom_number = @bn ORDER BY bd.line_number", { bn: { type: TYPES.NVarChar, value: bomItems[0].bom_number } });
      boms.forEach(r => console.log(JSON.stringify(r)));
    }

    // 4. Routing details (process steps)
    if (routingItems.length > 0) {
      console.log('\n=== Routing Details for ' + routingItems[0].item_number + ' ===');
      const steps = await q("SELECT step_number, standard_process_name, work_center_number, work_center_name, is_outsourced, is_backflush FROM routing_detail WHERE routing_number = @rn ORDER BY step_number", { rn: { type: TYPES.NVarChar, value: routingItems[0].routing_number } });
      steps.forEach(r => console.log(JSON.stringify(r)));
    }

    // 5. Warehouses
    console.log('\n=== Warehouses ===');
    const whs = await q("SELECT warehouse_number, warehouse_name, warehouse_type FROM warehouse WHERE condition = N'启用' OR condition IS NULL ORDER BY warehouse_number");
    whs.forEach(r => console.log(JSON.stringify(r)));

    // 6. Existing production orders
    console.log('\n=== Recent Production Orders ===');
    const pos = await q("SELECT TOP 10 production_order_number, item_number, item_name, planned_quantity, plan_status, approval_status, inbound_status, production_number FROM production_order ORDER BY production_order_number DESC");
    pos.forEach(r => console.log(JSON.stringify(r)));

    // 7. Existing process tasks
    console.log('\n=== Recent Process Tasks ===');
    const pts = await q("SELECT TOP 10 process_task_number, production_order_number, item_number, step_number, standard_process_name, planned_quantity, completed_quantity, task_status, is_backflush FROM process_task ORDER BY process_task_number DESC");
    pts.forEach(r => console.log(JSON.stringify(r)));

    // 8. Material preparation records
    console.log('\n=== Recent Material Preparations ===');
    const mps = await q("SELECT TOP 5 preparation_number, production_order_number, preparation_status, approval_status FROM material_preparation ORDER BY preparation_number DESC");
    mps.forEach(r => console.log(JSON.stringify(r)));

    // 9. Items with both BOM and Routing (for production)
    console.log('\n=== Items with Both BOM+Routing (production candidates) ===');
    const prodItems = await q("SELECT TOP 5 im.item_number, im.item_name, im.business_scope, im.item_type, bh.bom_number, rh.routing_number FROM item_master im JOIN bom_header bh ON im.item_number = bh.item_number AND bh.approval_status = N'已审批' JOIN routing_header rh ON im.item_number = rh.item_number AND rh.approval_status = N'已审批' WHERE im.business_scope LIKE N'%生产%' ORDER BY im.item_number");
    prodItems.forEach(r => console.log(JSON.stringify(r)));

    // 10. Purchase requisitions
    console.log('\n=== Recent Purchase Requisitions ===');
    const prs = await q("SELECT TOP 5 purchase_req_number, source_number, production_number, approval_status, order_status FROM purchase_req ORDER BY purchase_req_number DESC");
    prs.forEach(r => console.log(JSON.stringify(r)));

    // 11. Sales order with items that have BOM+Routing
    console.log('\n=== Sales Orders ===');
    const sos = await q("SELECT TOP 5 sales_order_number, customer_number, customer_name, approval_status, order_status FROM sales_order ORDER BY sales_order_number DESC");
    sos.forEach(r => console.log(JSON.stringify(r)));

    // 12. Customers
    console.log('\n=== Customers ===');
    const custs = await q("SELECT TOP 5 customer_number, customer_name FROM customer ORDER BY customer_number");
    custs.forEach(r => console.log(JSON.stringify(r)));

    // 13. Finished goods inventory
    console.log('\n=== Finished Goods Inventory ===');
    const fgi = await q("SELECT TOP 10 item_number, warehouse_number, quantity, quality_status FROM finished_goods_inventory WHERE quantity > 0 ORDER BY quantity DESC");
    fgi.forEach(r => console.log(JSON.stringify(r)));

    // 14. Safety stock
    console.log('\n=== Safety Stock Settings ===');
    const ss = await q("SELECT TOP 5 item_number, safety_stock FROM item_master WHERE safety_stock IS NOT NULL AND safety_stock > 0 ORDER BY safety_stock DESC");
    ss.forEach(r => console.log(JSON.stringify(r)));

    process.exit(0);
  } catch(e) { console.error(e); process.exit(1); }
})();
