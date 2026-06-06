/**
 * 数据库助手 - 使用 tedious 直连 SQL Server 进行断言
 */
import { Connection, Request, TYPES } from 'tedious';

const CONFIG = {
  server: '127.0.0.1',
  authentication: {
    type: 'default',
    options: { userName: 'sa', password: 'cowork' }
  },
  options: {
    port: 1433,
    database: 'PowderMom',
    encrypt: false,
    trustServerCertificate: true,
    rowCollectionOnRequestCompletion: true,
    useColumnNames: true
  }
};

export async function query<T = any>(sql: string, params: Record<string, { type: any; value: any }> = {}): Promise<T[]> {
  const conn = new Connection(CONFIG as any);
  await new Promise<void>((resolve, reject) => {
    conn.connect((err) => (err ? reject(err) : resolve()));
  });

  try {
    return await new Promise<T[]>((resolve, reject) => {
      const req = new Request(sql, (err, rowCount, rows) => {
        if (err) return reject(err);
        const result = (rows || []).map((r: any) => {
          const obj: any = {};
          for (const k of Object.keys(r)) obj[k] = r[k].value;
          return obj;
        });
        resolve(result);
      });
      for (const key of Object.keys(params)) {
        req.addParameter(key, params[key].type, params[key].value);
      }
      conn.execSql(req);
    });
  } finally {
    conn.close();
  }
}

export const T = TYPES;

/**
 * 查询最新创建的销售订单
 */
export async function getLatestSalesOrder(customerNumber: string) {
  const rows = await query<any>(
    `SELECT TOP 1 sales_order_number, customer_number, customer_name, head_of_sales,
            linkman, contacts, approval_status, order_status, remark, creation_date
     FROM sales_order
     WHERE customer_number = @cust
     ORDER BY creation_date DESC`,
    { cust: { type: T.NVarChar, value: customerNumber } }
  );
  return rows[0];
}

/**
 * 查询销售订单明细
 */
export async function getSalesOrderDetails(salesOrderNumber: string) {
  return await query<any>(
    `SELECT id, line_number, item_number, item_name, specifications, basic_unit,
            order_quantity, unit_price, total_amount, status, shipping_status,
            production_status, return_status, shipped_quantity, refunded_quantity, remark
     FROM sales_order_detail
     WHERE sales_order_number = @son
     ORDER BY line_number`,
    { son: { type: T.NVarChar, value: salesOrderNumber } }
  );
}

/**
 * 清理测试订单（仅限测试专用备注的订单）
 */
export async function cleanupTestOrders(testMarker: string) {
  const orders = await query<any>(
    `SELECT sales_order_number FROM sales_order WHERE remark = @mk`,
    { mk: { type: T.NVarChar, value: testMarker } }
  );
  for (const o of orders) {
    await query(
      `DELETE FROM sales_order_detail WHERE sales_order_number = @son`,
      { son: { type: T.NVarChar, value: o.sales_order_number } }
    );
    await query(
      `DELETE FROM sales_order WHERE sales_order_number = @son`,
      { son: { type: T.NVarChar, value: o.sales_order_number } }
    );
  }
  return orders.length;
}

// ==================== 生产计划 ====================

/** 根据 item_number 查最新的 MPS 导入生产计划 */
export async function getLatestProductionPlan(itemNumber: string, _sourceOrderNumber?: string) {
  // MPS 导入的计划 source_order_number 硬编码为 'MPS'，按 production_number 降序取最新
  const rows = await query<any>(
    `SELECT TOP 1 production_number, item_number, item_name, planned_quantity,
            planned_completion_time, plan_status, approval_status, mrp_status,
            source_order_number, remark
     FROM Production_plan
     WHERE item_number = @item AND source_order_number = N'MPS'
     ORDER BY production_number DESC`,
    { item: { type: T.NVarChar, value: itemNumber } }
  );
  return rows[0];
}

// ==================== MRP ====================

export async function getMrpRun(mrpRunNumber: string) {
  const rows = await query<any>(
    `SELECT mrp_run_number, run_date, run_by, run_status, plan_count, remark
     FROM mrp_run WHERE mrp_run_number = @no`,
    { no: { type: T.NVarChar, value: mrpRunNumber } }
  );
  return rows[0];
}

export async function getMrpRunDetails(mrpRunNumber: string) {
  return await query<any>(
    `SELECT id, bom_level, item_number, item_name, item_type, business_scope,
            gross_requirement, on_hand_inventory, wip_quantity, in_transit_po,
            pending_pr, safety_stock, net_requirement, action_type,
            planned_start_date, planned_due_date
     FROM mrp_run_detail
     WHERE mrp_run_number = @no
     ORDER BY bom_level, id`,
    { no: { type: T.NVarChar, value: mrpRunNumber } }
  );
}

// ==================== 生产单 / 采购申请 ====================

export async function getProductionOrdersBySourcePlan(productionNumber: string) {
  return await query<any>(
    `SELECT production_order_number, production_number, item_number, item_name,
            planned_quantity, approval_status, plan_status
     FROM production_order
     WHERE production_number = @pn
     ORDER BY production_order_number DESC`,
    { pn: { type: T.NVarChar, value: productionNumber } }
  );
}

export async function getPurchaseReqsBySourcePlan(productionNumber: string) {
  return await query<any>(
    `SELECT purchase_req_number, production_number, request_date, approval_status, order_status, remark
     FROM purchase_req
     WHERE production_number = @pn
     ORDER BY purchase_req_number DESC`,
    { pn: { type: T.NVarChar, value: productionNumber } }
  );
}

export async function getPurchaseReqDetails(purchaseReqNumber: string) {
  return await query<any>(
    `SELECT id, line_number, item_number, item_name, request_quantity, ordered_quantity, expected_date, status
     FROM purchase_req_detail WHERE purchase_req_number = @no
     ORDER BY line_number`,
    { no: { type: T.NVarChar, value: purchaseReqNumber } }
  );
}

/** 查询采购申请主表（含审批/执行状态） */
export async function getPurchaseReq(purchaseReqNumber: string) {
  const rows = await query<any>(
    `SELECT purchase_req_number, approval_status, order_status, remark
     FROM purchase_req WHERE purchase_req_number = @no`,
    { no: { type: T.NVarChar, value: purchaseReqNumber } }
  );
  return rows[0] || null;
}

/** 查询采购订单主表+明细 */
export async function getPurchaseOrder(purchaseOrderNumber: string) {
  const [headers, details] = await Promise.all([
    query<any>(
      `SELECT purchase_order_number, supplier_number, supplier_name, approval_status, order_status, source_req_number
       FROM purchase_order WHERE purchase_order_number = @no`,
      { no: { type: T.NVarChar, value: purchaseOrderNumber } }
    ),
    query<any>(
      `SELECT id, line_number, item_number, item_name, order_quantity, source_req_number, source_req_detail_id
       FROM purchase_order_detail WHERE purchase_order_number = @no
       ORDER BY line_number`,
      { no: { type: T.NVarChar, value: purchaseOrderNumber } }
    )
  ]);
  return { header: headers[0] || null, details };
}

/** 按来源申请号查询最新采购订单 */
export async function getLatestPurchaseOrderByReq(reqNumber: string) {
  const rows = await query<any>(
    `SELECT TOP 1 purchase_order_number, supplier_number, supplier_name, approval_status, order_status, source_req_number
     FROM purchase_order WHERE source_req_number = @no
     ORDER BY purchase_order_number DESC`,
    { no: { type: T.NVarChar, value: reqNumber } }
  );
  return rows[0] || null;
}

/** 清理测试采购申请+关联采购订单 */
export async function cleanupTestPurchaseReqs(testMarker: string) {
  // 先找关联的采购订单
  const reqRows = await query<any>(
    `SELECT purchase_req_number FROM purchase_req WHERE remark = @m`,
    { m: { type: T.NVarChar, value: testMarker } }
  );
  for (const r of reqRows) {
    // 删除关联采购订单明细+主表
    const poRows = await query<any>(
      `SELECT purchase_order_number FROM purchase_order WHERE source_req_number = @rn`,
      { rn: { type: T.NVarChar, value: r.purchase_req_number } }
    );
    for (const po of poRows) {
      await query(`DELETE FROM purchase_order_detail WHERE purchase_order_number = @pon`, { pon: { type: T.NVarChar, value: po.purchase_order_number } });
      await query(`DELETE FROM purchase_order WHERE purchase_order_number = @pon`, { pon: { type: T.NVarChar, value: po.purchase_order_number } });
    }
    await query(`DELETE FROM purchase_req_detail WHERE purchase_req_number = @rn`, { rn: { type: T.NVarChar, value: r.purchase_req_number } });
    await query(`DELETE FROM purchase_req WHERE purchase_req_number = @rn`, { rn: { type: T.NVarChar, value: r.purchase_req_number } });
  }
}

// ==================== 清理：全链路测试数据 ====================

/** 清理某物料所有 source_order_number='MPS' 且未被执行生产的残留计划（带连带 MRP），用于测试环境閒置变干净 */
export async function cleanupResidualMPSPlansByItem(itemNumber: string) {
  const result = { plans: 0, mrpRuns: 0, prodOrders: 0, purchaseReqs: 0 };

  // 1. 拿到所有目标物料的 MPS 残留计划（任何状态都清，因为测试数据应当自包含）
  const plans = await query<any>(
    `SELECT production_number FROM Production_plan
     WHERE item_number = @item AND source_order_number = N'MPS'`,
    { item: { type: T.NVarChar, value: itemNumber } }
  );

  for (const p of plans) {
    const pn = p.production_number;

    // 1.1 由该计划派生的生产单
    const pos = await query<any>(
      `SELECT production_order_number FROM production_order WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: pn } }
    );
    for (const po of pos) {
      await query(`DELETE FROM production_order WHERE production_order_number = @no`,
        { no: { type: T.NVarChar, value: po.production_order_number } });
      result.prodOrders++;
    }

    // 1.2 由该计划派生的采购申请
    const prs = await query<any>(
      `SELECT purchase_req_number FROM purchase_req WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: pn } }
    );
    for (const pr of prs) {
      await query(`DELETE FROM purchase_req_detail WHERE purchase_req_number = @no`,
        { no: { type: T.NVarChar, value: pr.purchase_req_number } });
      await query(`DELETE FROM purchase_req WHERE purchase_req_number = @no`,
        { no: { type: T.NVarChar, value: pr.purchase_req_number } });
      result.purchaseReqs++;
    }

    // 1.3 涉及的 MRP 运算
    const runs = await query<any>(
      `SELECT DISTINCT mrp_run_number FROM mrp_run_plan WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: pn } }
    );
    for (const r of runs) {
      await query(`DELETE FROM mrp_run_detail WHERE mrp_run_number = @no`,
        { no: { type: T.NVarChar, value: r.mrp_run_number } });
      await query(`DELETE FROM mrp_run_plan WHERE mrp_run_number = @no`,
        { no: { type: T.NVarChar, value: r.mrp_run_number } });
      await query(`DELETE FROM mrp_run WHERE mrp_run_number = @no`,
        { no: { type: T.NVarChar, value: r.mrp_run_number } });
      result.mrpRuns++;
    }

    // 1.4 计划本体
    await query(`DELETE FROM Production_plan WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: pn } });
    result.plans++;
  }

  return result;
}

/** 清理某客户新近的测试用售单（remark 以指定前缀开头） */
export async function cleanupResidualTestSalesOrders(customerNumber: string, remarkPrefix: string) {
  const orders = await query<any>(
    `SELECT sales_order_number FROM sales_order
     WHERE customer_number = @cn AND remark LIKE @prefix + N'%'`,
    {
      cn: { type: T.NVarChar, value: customerNumber },
      prefix: { type: T.NVarChar, value: remarkPrefix },
    }
  );
  let count = 0;
  for (const o of orders) {
    await query(`DELETE FROM sales_order_detail WHERE sales_order_number = @son`,
      { son: { type: T.NVarChar, value: o.sales_order_number } });
    await query(`DELETE FROM sales_order WHERE sales_order_number = @son`,
      { son: { type: T.NVarChar, value: o.sales_order_number } });
    count++;
  }
  return count;
}

export interface CleanupContext {
  salesOrderNumber?: string;
  productionNumber?: string;
}

/** 深度清理：根据提供的上下文，从生产计划开始级联清理 MRP/生产单/采购申请，最后删销售订单 */
export async function cleanupFullChainByContext(ctx: CleanupContext) {
  const result = { salesOrders: 0, plans: 0, mrpRuns: 0, prodOrders: 0, purchaseReqs: 0 };

  // 1. 生产计划级联清理
  if (ctx.productionNumber) {
    const pn = ctx.productionNumber;

    // 1.1 生产单
    const pos = await query<any>(
      `SELECT production_order_number FROM production_order WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: pn } }
    );
    for (const po of pos) {
      await query(`DELETE FROM production_order WHERE production_order_number = @no`,
        { no: { type: T.NVarChar, value: po.production_order_number } });
      result.prodOrders++;
    }

    // 1.2 采购申请
    const prs = await query<any>(
      `SELECT purchase_req_number FROM purchase_req WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: pn } }
    );
    for (const pr of prs) {
      await query(`DELETE FROM purchase_req_detail WHERE purchase_req_number = @no`,
        { no: { type: T.NVarChar, value: pr.purchase_req_number } });
      await query(`DELETE FROM purchase_req WHERE purchase_req_number = @no`,
        { no: { type: T.NVarChar, value: pr.purchase_req_number } });
      result.purchaseReqs++;
    }

    // 1.3 MRP
    const runs = await query<any>(
      `SELECT DISTINCT mrp_run_number FROM mrp_run_plan WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: pn } }
    );
    for (const r of runs) {
      await query(`DELETE FROM mrp_run_detail WHERE mrp_run_number = @no`,
        { no: { type: T.NVarChar, value: r.mrp_run_number } });
      await query(`DELETE FROM mrp_run_plan WHERE mrp_run_number = @no`,
        { no: { type: T.NVarChar, value: r.mrp_run_number } });
      await query(`DELETE FROM mrp_run WHERE mrp_run_number = @no`,
        { no: { type: T.NVarChar, value: r.mrp_run_number } });
      result.mrpRuns++;
    }

    // 1.4 生产计划
    await query(`DELETE FROM Production_plan WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: pn } });
    result.plans++;
  }

  // 2. 销售订单
  if (ctx.salesOrderNumber) {
    const son = ctx.salesOrderNumber;
    await query(`DELETE FROM sales_order_detail WHERE sales_order_number = @son`,
      { son: { type: T.NVarChar, value: son } });
    await query(`DELETE FROM sales_order WHERE sales_order_number = @son`,
      { son: { type: T.NVarChar, value: son } });
    result.salesOrders++;
  }

  return result;
}

/** 深度清理：销售订单 → 生产计划 → MRP → 生产单 → 采购申请（按 remark 标识） */
export async function cleanupFullChainByMarker(testMarker: string) {
  // 1. 定位测试订单
  const orders = await query<any>(
    `SELECT sales_order_number FROM sales_order WHERE remark = @mk`,
    { mk: { type: T.NVarChar, value: testMarker } }
  );
  const result = { salesOrders: 0, plans: 0, mrpRuns: 0, prodOrders: 0, purchaseReqs: 0 };

  for (const o of orders) {
    const son = o.sales_order_number;

    // 2. 找到源自该订单的生产计划
    const plans = await query<any>(
      `SELECT production_number FROM Production_plan WHERE source_order_number = @son`,
      { son: { type: T.NVarChar, value: son } }
    );

    for (const p of plans) {
      const pn = p.production_number;

      // 3. 清理源自该计划的生产单
      const pos = await query<any>(
        `SELECT production_order_number FROM production_order WHERE production_number = @pn`,
        { pn: { type: T.NVarChar, value: pn } }
      );
      for (const po of pos) {
        await query(`DELETE FROM production_order WHERE production_order_number = @no`,
          { no: { type: T.NVarChar, value: po.production_order_number } });
        result.prodOrders++;
      }

      // 4. 清理源自该计划的采购申请
      const prs = await query<any>(
        `SELECT purchase_req_number FROM purchase_req WHERE production_number = @pn`,
        { pn: { type: T.NVarChar, value: pn } }
      );
      for (const pr of prs) {
        await query(`DELETE FROM purchase_req_detail WHERE purchase_req_number = @no`,
          { no: { type: T.NVarChar, value: pr.purchase_req_number } });
        await query(`DELETE FROM purchase_req WHERE purchase_req_number = @no`,
          { no: { type: T.NVarChar, value: pr.purchase_req_number } });
        result.purchaseReqs++;
      }

      // 5. 清理 MRP 运算 (引用该计划的)
      const runs = await query<any>(
        `SELECT DISTINCT mrp_run_number FROM mrp_run_plan WHERE production_number = @pn`,
        { pn: { type: T.NVarChar, value: pn } }
      );
      for (const r of runs) {
        await query(`DELETE FROM mrp_run_detail WHERE mrp_run_number = @no`,
          { no: { type: T.NVarChar, value: r.mrp_run_number } });
        await query(`DELETE FROM mrp_run_plan WHERE mrp_run_number = @no`,
          { no: { type: T.NVarChar, value: r.mrp_run_number } });
        await query(`DELETE FROM mrp_run WHERE mrp_run_number = @no`,
          { no: { type: T.NVarChar, value: r.mrp_run_number } });
        result.mrpRuns++;
      }

      // 6. 清理生产计划
      await query(`DELETE FROM Production_plan WHERE production_number = @pn`,
        { pn: { type: T.NVarChar, value: pn } });
      result.plans++;
    }

    // 7. 清理销售订单
    await query(`DELETE FROM sales_order_detail WHERE sales_order_number = @son`,
      { son: { type: T.NVarChar, value: son } });
    await query(`DELETE FROM sales_order WHERE sales_order_number = @son`,
      { son: { type: T.NVarChar, value: son } });
    result.salesOrders++;
  }

  return result;
}

// ==================== 成品装箱管理 ====================

/** 查询装箱单头 */
export async function getPackingOrder(packingNumber: string) {
  const rows = await query<any>(
    `SELECT packing_number, warehouse_number, warehouse_name, item_number, item_name,
            specifications, basic_unit, total_quantity, total_labels, total_boxes,
            status, operator, remark, creation_date, confirmation_date
     FROM packing_order WHERE packing_number = @pn`,
    { pn: { type: T.NVarChar, value: packingNumber } }
  );
  return rows[0];
}

/** 查询装箱单所有标签 */
export async function getPackingLabels(packingNumber: string) {
  return await query<any>(
    `SELECT id, packing_number, batch_number, item_number, item_name, specifications,
            basic_unit, label_quantity, standard_qty, is_full, box_number, label_sequence, label_printed
     FROM packing_bag_label WHERE packing_number = @pn ORDER BY label_sequence`,
    { pn: { type: T.NVarChar, value: packingNumber } }
  );
}

/** 查询装箱单所有箱 */
export async function getPackingBoxes(packingNumber: string) {
  return await query<any>(
    `SELECT box_number, packing_number, box_sequence, item_number, item_name, specifications,
            standard_bag_qty, actual_bag_qty, total_quantity, is_full, label_printed,
            warehouse_number, warehouse_name, status, batch_numbers
     FROM packing_box WHERE packing_number = @pn ORDER BY box_sequence`,
    { pn: { type: T.NVarChar, value: packingNumber } }
  );
}

/** 查询箱装库存记录 */
export async function getPackingBoxInventory(packingNumber: string) {
  return await query<any>(
    `SELECT id, box_number, packing_number, item_number, item_name, specifications, basic_unit,
            warehouse_number, warehouse_name, total_quantity, batch_numbers, status,
            inbound_date, outbound_date
     FROM packing_box_inventory WHERE packing_number = @pn`,
    { pn: { type: T.NVarChar, value: packingNumber } }
  );
}

/** 查询成品批次库存（FIFO） */
export async function getFinishedBatchInventory(itemNumber: string, warehouseNumber: string) {
  return await query<any>(
    `SELECT batch_number, item_number, item_name, warehouse_number, warehouse_name,
            quantity, initial_quantity, quality_status, inbound_date, status,
            production_order_number
     FROM finished_batch_inventory
     WHERE item_number = @item AND warehouse_number = @wh AND quantity > 0
     ORDER BY inbound_date ASC`,
    {
      item: { type: T.NVarChar, value: itemNumber },
      wh: { type: T.NVarChar, value: warehouseNumber },
    }
  );
}

/** 查询成品汇总库存 */
export async function getFinishedGoodsInventory(itemNumber: string, warehouseNumber: string) {
  const rows = await query<any>(
    `SELECT item_number, warehouse_number, quantity, quality_status
     FROM finished_goods_inventory
     WHERE item_number = @item AND warehouse_number = @wh AND quality_status = N'合格品'`,
    {
      item: { type: T.NVarChar, value: itemNumber },
      wh: { type: T.NVarChar, value: warehouseNumber },
    }
  );
  return rows[0];
}

/** 查询库存流水 */
export async function getInventoryTransactions(sourceType: string, sourceNumber: string) {
  return await query<any>(
    `SELECT transaction_number, transaction_type, source_type, source_number,
            item_number, item_name, warehouse_number, quantity,
            before_quantity, after_quantity, operator, creation_date
     FROM inventory_transaction
     WHERE source_type = @st AND source_number = @sn
     ORDER BY creation_date DESC`,
    {
      st: { type: T.NVarChar, value: sourceType },
      sn: { type: T.NVarChar, value: sourceNumber },
    }
  );
}

/** 查询产品内/外包装规格 */
export async function getProductPackingConfig(itemNumber: string) {
  const rows = await query<any>(
    `SELECT item_number, inner_pack_qty, outer_pack_qty, inner_pack_unit, outer_pack_unit
     FROM product_ext WHERE item_number = @item`,
    { item: { type: T.NVarChar, value: itemNumber } }
  );
  return rows[0];
}

/** 级联清理装箱单数据 */
export async function cleanupPackingOrderData(packingNumber: string) {
  // 1. 查找关联的库存流水
  const txns = await query<any>(
    `SELECT transaction_number FROM inventory_transaction WHERE source_number = @pn`,
    { pn: { type: T.NVarChar, value: packingNumber } }
  );
  // 2. 删除库存流水批次明细
  for (const t of txns) {
    await query(`DELETE FROM inventory_transaction_batch WHERE transaction_number = @tn`,
      { tn: { type: T.NVarChar, value: t.transaction_number } });
  }
  // 3. 删除库存流水
  await query(`DELETE FROM inventory_transaction WHERE source_number = @pn`,
    { pn: { type: T.NVarChar, value: packingNumber } });

  // 4. 查找装箱单的箱号，清理箱级流水和箱装库存
  const boxes = await query<any>(
    `SELECT box_number FROM packing_box WHERE packing_number = @pn`,
    { pn: { type: T.NVarChar, value: packingNumber } }
  );
  for (const b of boxes) {
    const bn = b.box_number;
    const boxTxns = await query<any>(
      `SELECT transaction_number FROM inventory_transaction WHERE source_number = @bn`,
      { bn: { type: T.NVarChar, value: bn } }
    );
    for (const t of boxTxns) {
      await query(`DELETE FROM inventory_transaction_batch WHERE transaction_number = @tn`,
        { tn: { type: T.NVarChar, value: t.transaction_number } });
    }
    await query(`DELETE FROM inventory_transaction WHERE source_number = @bn`,
      { bn: { type: T.NVarChar, value: bn } });
  }

  // 5. 删除箱装库存
  await query(`DELETE FROM packing_box_inventory WHERE packing_number = @pn`,
    { pn: { type: T.NVarChar, value: packingNumber } });
  // 6. 删除标签
  await query(`DELETE FROM packing_bag_label WHERE packing_number = @pn`,
    { pn: { type: T.NVarChar, value: packingNumber } });
  // 7. 删除箱
  await query(`DELETE FROM packing_box WHERE packing_number = @pn`,
    { pn: { type: T.NVarChar, value: packingNumber } });
  // 8. 删除装箱单
  await query(`DELETE FROM packing_order WHERE packing_number = @pn`,
    { pn: { type: T.NVarChar, value: packingNumber } });

  return { transactions: txns.length, boxes: boxes.length };
}

/** 按 remark 前缀清理残留装箱单 */
export async function cleanupResidualPackingOrders(itemNumber: string, remarkPrefix: string) {
  const orders = await query<any>(
    `SELECT packing_number FROM packing_order
     WHERE item_number = @item AND remark LIKE @prefix + N'%'`,
    {
      item: { type: T.NVarChar, value: itemNumber },
      prefix: { type: T.NVarChar, value: remarkPrefix },
    }
  );
  let count = 0;
  for (const o of orders) {
    await cleanupPackingOrderData(o.packing_number);
    count++;
  }
  return count;
}

// ==================== 来料检验 ====================

/** 查找需检验物料 (incoming_inspection='Y') */
export async function findInspectionRequiredItem() {
  const rows = await query<any>(
    `SELECT TOP 1 item_number, item_name, specifications, basic_unit, incoming_inspection, default_warehouse
     FROM item_master WHERE incoming_inspection = 'Y'`
  );
  return rows[0] || null;
}

/** 查找免检物料 (incoming_inspection IS NULL 或 != 'Y') */
export async function findNonInspectionItem() {
  const rows = await query<any>(
    `SELECT TOP 1 item_number, item_name, specifications, basic_unit, incoming_inspection, default_warehouse, item_type
     FROM item_master
     WHERE (incoming_inspection IS NULL OR incoming_inspection <> 'Y')
       AND item_type IN (N'原材料', N'骨架', N'预成型件')`
  );
  return rows[0] || null;
}

/** 查找供应商 */
export async function findSupplier() {
  const rows = await query<any>(
    `SELECT TOP 1 supplier_number, supplier_name FROM supplier`
  );
  return rows[0] || null;
}

/** 查找适合委外的需检验工序任务 */
export async function findInspectionRequiredProcessTask() {
  const rows = await query<any>(
    `SELECT TOP 1 pt.process_task_number, pt.production_order_number, pt.production_number,
            pt.item_number, pt.item_name, pt.specifications, pt.basic_unit,
            pt.planned_quantity, pt.step_number, pt.work_center_number, pt.work_center_name
     FROM process_task pt
     INNER JOIN item_master im ON pt.item_number = im.item_number
     WHERE im.incoming_inspection = 'Y'
       AND pt.task_status IN (N'未开始', N'进行中')
       AND NOT EXISTS (SELECT 1 FROM outsourcing_order WHERE process_task_number = pt.process_task_number)`
  );
  return rows[0] || null;
}

/** 查找适合委外的免检工序任务 */
export async function findNonInspectionProcessTask() {
  const rows = await query<any>(
    `SELECT TOP 1 pt.process_task_number, pt.production_order_number, pt.production_number,
            pt.item_number, pt.item_name, pt.specifications, pt.basic_unit,
            pt.planned_quantity, pt.step_number, pt.work_center_number, pt.work_center_name
     FROM process_task pt
     INNER JOIN item_master im ON pt.item_number = im.item_number
     WHERE (im.incoming_inspection IS NULL OR im.incoming_inspection <> 'Y')
       AND pt.task_status IN (N'未开始', N'进行中')
       AND NOT EXISTS (SELECT 1 FROM outsourcing_order WHERE process_task_number = pt.process_task_number)`
  );
  return rows[0] || null;
}

/** 查询采购检验单 */
export async function getPurchaseInspection(inspectionNumber: string) {
  const rows = await query<any>(
    `SELECT inspection_number, stock_in_number, purchase_order_number,
            supplier_number, supplier_name, item_number, item_name,
            specifications, basic_unit, received_quantity, sample_quantity,
            qualified_quantity, unqualified_quantity, inspect_plan_name,
            inspect_method, inspect_spec_name, inspector_name, inspect_date,
            inspect_result, inspect_status, batch_number,
            defect_class_name, defect_name, defect_reason_name,
            remark, creation_date, creation_man
     FROM purchase_quality_inspection WHERE inspection_number = @id`,
    { id: { type: T.NVarChar, value: inspectionNumber } }
  );
  return rows[0];
}

/** 按入库单+物料查采购检验单 */
export async function getPurchaseInspectionByStockIn(stockInNumber: string, itemNumber: string) {
  const rows = await query<any>(
    `SELECT TOP 1 inspection_number, stock_in_number, item_number, item_name,
            received_quantity, qualified_quantity, unqualified_quantity,
            inspect_result, inspect_status, batch_number
     FROM purchase_quality_inspection
     WHERE stock_in_number = @si AND item_number = @item`,
    {
      si: { type: T.NVarChar, value: stockInNumber },
      item: { type: T.NVarChar, value: itemNumber },
    }
  );
  return rows[0];
}

/** 查询委外检验单 */
export async function getOutsourcingInspection(inspectionNumber: string) {
  const rows = await query<any>(
    `SELECT inspection_number, receipt_number, outsourcing_order_number,
            inspection_date, inspection_status, inspection_result,
            qualified_quantity, unqualified_quantity, remark,
            creation_date, creation_man
     FROM outsourcing_inspection WHERE inspection_number = @id`,
    { id: { type: T.NVarChar, value: inspectionNumber } }
  );
  return rows[0];
}

/** 按收货单查委外检验单 */
export async function getOutsourcingInspectionByReceipt(receiptNumber: string) {
  const rows = await query<any>(
    `SELECT TOP 1 inspection_number, receipt_number, outsourcing_order_number,
            inspection_status, inspection_result,
            qualified_quantity, unqualified_quantity
     FROM outsourcing_inspection WHERE receipt_number = @rn`,
    { rn: { type: T.NVarChar, value: receiptNumber } }
  );
  return rows[0];
}

/** 查询物料批次库存 */
export async function getMaterialBatchInventory(itemNumber: string, warehouseNumber: string) {
  return await query<any>(
    `SELECT batch_number, item_number, item_name, item_type, specifications, basic_unit,
            warehouse_number, warehouse_name, quantity, initial_quantity,
            supplier_number, supplier_name, production_order_number,
            inbound_date, status
     FROM material_batch_inventory
     WHERE item_number = @item AND warehouse_number = @wh AND quantity > 0 AND status = N'正常'
     ORDER BY inbound_date ASC`,
    {
      item: { type: T.NVarChar, value: itemNumber },
      wh: { type: T.NVarChar, value: warehouseNumber },
    }
  );
}

/** 查询物料汇总库存 */
export async function getMaterialInventorySummary(itemNumber: string, warehouseNumber: string) {
  const rows = await query<any>(
    `SELECT item_number, item_name, item_type, specifications, basic_unit,
            warehouse_number, warehouse_name, quantity, last_updated
     FROM material_inventory
     WHERE item_number = @item AND warehouse_number = @wh`,
    {
      item: { type: T.NVarChar, value: itemNumber },
      wh: { type: T.NVarChar, value: warehouseNumber },
    }
  );
  return rows[0];
}

/** 查询物料库存流水 */
export async function getMaterialTransactions(sourceNumber: string) {
  return await query<any>(
    `SELECT transaction_number, transaction_type, source_type, source_number,
            item_number, item_name, item_type, specifications, basic_unit,
            warehouse_number, warehouse_name, quantity,
            before_quantity, after_quantity, batch_number,
            supplier_number, supplier_name, operator, operation_date, remark, creation_date
     FROM material_inventory_transaction
     WHERE source_number = @sn
     ORDER BY creation_date DESC`,
    { sn: { type: T.NVarChar, value: sourceNumber } }
  );
}

/** 查询工序任务 */
export async function getProcessTask(processTaskNumber: string) {
  const rows = await query<any>(
    `SELECT process_task_number, production_order_number, production_number,
            item_number, item_name, specifications, basic_unit,
            planned_quantity, completed_quantity, task_status,
            step_number, work_center_number, work_center_name,
            process_route_number, standard_process_number, standard_process_name
     FROM process_task WHERE process_task_number = @id`,
    { id: { type: T.NVarChar, value: processTaskNumber } }
  );
  return rows[0];
}

/** 按委外订单查收货单 */
export async function getOutsourcingReceiptByOrder(outsourcingOrderNumber: string) {
  const rows = await query<any>(
    `SELECT TOP 1 receipt_number, outsourcing_order_number, receipt_date,
            warehouse_number, warehouse_name, handler, status, inspection_status,
            total_quantity, qualified_quantity, unqualified_quantity,
            inspection_warehouse_number, inspection_warehouse_name,
            next_step_warehouse_number, next_step_warehouse_name,
            next_step_number, next_work_center_number, next_work_center_name,
            remark, creation_date, creation_man
     FROM outsourcing_receipt
     WHERE outsourcing_order_number = @oo
     ORDER BY creation_date DESC`,
    { oo: { type: T.NVarChar, value: outsourcingOrderNumber } }
  );
  return rows[0];
}

/** 查询入库单 */
export async function getStockIn(stockInNumber: string) {
  const rows = await query<any>(
    `SELECT stock_in_number, purchase_order_number, supplier_number, supplier_name,
            warehouse_number, warehouse_name, stock_in_date, stock_in_type,
            approval_status, operator, remark, creation_date, creation_man
     FROM stock_in WHERE stock_in_number = @si`,
    { si: { type: T.NVarChar, value: stockInNumber } }
  );
  return rows[0];
}

/** 查询入库单明细 */
export async function getStockInDetail(stockInNumber: string) {
  return await query<any>(
    `SELECT stock_in_number, line_number, item_number, item_name, specifications, basic_unit,
            order_quantity, received_quantity, stock_in_quantity,
            qualified_quantity, unqualified_quantity, batch_number,
            warehouse_number, warehouse_name, inspection_number, inspect_status, remark
     FROM stock_in_detail WHERE stock_in_number = @si ORDER BY line_number`,
    { si: { type: T.NVarChar, value: stockInNumber } }
  );
}

/** 清理采购链测试数据 */
export async function cleanupPurchaseTestData(purchaseOrderNumber: string) {
  // 1. 查找关联的入库单
  const stockIns = await query<any>(
    `SELECT stock_in_number FROM stock_in WHERE purchase_order_number = @po`,
    { po: { type: T.NVarChar, value: purchaseOrderNumber } }
  );

  for (const si of stockIns) {
    const sin = si.stock_in_number;
    // 清理库存流水
    await query(`DELETE FROM material_inventory_transaction WHERE source_number = @sn`,
      { sn: { type: T.NVarChar, value: sin } });
    // 清理检验流水（按检验单号）
    const inspections = await query<any>(
      `SELECT inspection_number FROM purchase_quality_inspection WHERE stock_in_number = @si`,
      { si: { type: T.NVarChar, value: sin } }
    );
    for (const ins of inspections) {
      await query(`DELETE FROM material_inventory_transaction WHERE source_number = @sn`,
        { sn: { type: T.NVarChar, value: ins.inspection_number } });
    }
  }

  // 2. 清理物料批次库存 + 汇总（按入库单号的批次）
  for (const si of stockIns) {
    const details = await query<any>(
      `SELECT batch_number, item_number, warehouse_number FROM stock_in_detail WHERE stock_in_number = @si`,
      { si: { type: T.NVarChar, value: si.stock_in_number } }
    );
    for (const d of details) {
      if (d.batch_number) {
        await query(`DELETE FROM material_batch_inventory WHERE batch_number = @bn`,
          { bn: { type: T.NVarChar, value: d.batch_number } });
      }
    }
  }

  // 3. 清理检验单
  for (const si of stockIns) {
    const sin = si.stock_in_number;
    await query(`DELETE FROM purchase_quality_inspection_detail WHERE inspection_number IN (
      SELECT inspection_number FROM purchase_quality_inspection WHERE stock_in_number = @si)`,
      { si: { type: T.NVarChar, value: sin } });
    await query(`DELETE FROM purchase_quality_inspection WHERE stock_in_number = @si`,
      { si: { type: T.NVarChar, value: sin } });
  }

  // 4. 清理入库单
  for (const si of stockIns) {
    await query(`DELETE FROM stock_in_detail WHERE stock_in_number = @si`,
      { si: { type: T.NVarChar, value: si.stock_in_number } });
    await query(`DELETE FROM stock_in WHERE stock_in_number = @si`,
      { si: { type: T.NVarChar, value: si.stock_in_number } });
  }

  // 5. 清理收货通知
  const rns = await query<any>(
    `SELECT receiving_number FROM purchase_receiving_notice WHERE purchase_order_number = @po`,
    { po: { type: T.NVarChar, value: purchaseOrderNumber } }
  );
  for (const rn of rns) {
    await query(`DELETE FROM purchase_receiving_notice_detail WHERE receiving_number = @rn`,
      { rn: { type: T.NVarChar, value: rn.receiving_number } });
    await query(`DELETE FROM purchase_receiving_notice WHERE receiving_number = @rn`,
      { rn: { type: T.NVarChar, value: rn.receiving_number } });
  }

  // 6. 清理采购订单
  await query(`DELETE FROM purchase_order_detail WHERE purchase_order_number = @po`,
    { po: { type: T.NVarChar, value: purchaseOrderNumber } });
  await query(`DELETE FROM purchase_order WHERE purchase_order_number = @po`,
    { po: { type: T.NVarChar, value: purchaseOrderNumber } });
}

/** 清理委外链测试数据 */
export async function cleanupOutsourcingTestData(outsourcingOrderNumber: string) {
  const oo = outsourcingOrderNumber;

  // 1. 清理库存流水（按委外订单号关联的收货单号）
  const receipts = await query<any>(
    `SELECT receipt_number FROM outsourcing_receipt WHERE outsourcing_order_number = @oo`,
    { oo: { type: T.NVarChar, value: oo } }
  );
  for (const r of receipts) {
    await query(`DELETE FROM material_inventory_transaction WHERE source_number = @rn`,
      { rn: { type: T.NVarChar, value: r.receipt_number } });
  }
  // 清理检验相关流水
  const inspections = await query<any>(
    `SELECT inspection_number FROM outsourcing_inspection WHERE outsourcing_order_number = @oo`,
    { oo: { type: T.NVarChar, value: oo } }
  );
  for (const ins of inspections) {
    await query(`DELETE FROM material_inventory_transaction WHERE source_number = @sn`,
      { sn: { type: T.NVarChar, value: ins.inspection_number } });
  }

  // 2. 清理回收入库单
  const stockins = await query<any>(
    `SELECT stockin_number FROM outsourcing_return_stockin WHERE outsourcing_order_number = @oo`,
    { oo: { type: T.NVarChar, value: oo } }
  );
  for (const s of stockins) {
    await query(`DELETE FROM outsourcing_return_stockin_detail WHERE stockin_number = @si`,
      { si: { type: T.NVarChar, value: s.stockin_number } });
  }
  await query(`DELETE FROM outsourcing_return_stockin WHERE outsourcing_order_number = @oo`,
    { oo: { type: T.NVarChar, value: oo } });

  // 3. 清理检验单
  for (const ins of inspections) {
    await query(`DELETE FROM outsourcing_inspection_detail WHERE inspection_number = @id`,
      { id: { type: T.NVarChar, value: ins.inspection_number } });
  }
  await query(`DELETE FROM outsourcing_inspection WHERE outsourcing_order_number = @oo`,
    { oo: { type: T.NVarChar, value: oo } });

  // 4. 清理收货单
  for (const r of receipts) {
    await query(`DELETE FROM outsourcing_receipt_detail WHERE receipt_number = @rn`,
      { rn: { type: T.NVarChar, value: r.receipt_number } });
  }
  await query(`DELETE FROM outsourcing_receipt WHERE outsourcing_order_number = @oo`,
    { oo: { type: T.NVarChar, value: oo } });

  // 5. 清理发料单
  const issues = await query<any>(
    `SELECT issue_number FROM outsourcing_material_issue WHERE outsourcing_order_number = @oo`,
    { oo: { type: T.NVarChar, value: oo } }
  );
  for (const iss of issues) {
    await query(`DELETE FROM outsourcing_material_issue_detail WHERE issue_number = @in`,
      { in: { type: T.NVarChar, value: iss.issue_number } });
  }
  await query(`DELETE FROM outsourcing_material_issue WHERE outsourcing_order_number = @oo`,
    { oo: { type: T.NVarChar, value: oo } });

  // 6. 清理委外订单
  await query(`DELETE FROM outsourcing_order WHERE outsourcing_order_number = @oo`,
    { oo: { type: T.NVarChar, value: oo } });
}

/** 重置工序任务完成量 */
export async function resetProcessTaskQty(processTaskNumber: string, originalQty: number, originalStatus: string) {
  await query(
    `UPDATE process_task SET completed_quantity = @qty, task_status = @status WHERE process_task_number = @id`,
    {
      qty: { type: T.Decimal, value: originalQty },
      status: { type: T.NVarChar, value: originalStatus },
      id: { type: T.NVarChar, value: processTaskNumber },
    }
  );
}

// ==================== 生产全链路 ====================

/** 直接创建生产计划（跳过MPS，用于E2E测试） */
export async function createProductionPlanDirect(itemNumber: string, plannedQuantity: number, remark: string) {
  const itemRows = await query<any>(
    `SELECT item_name FROM item_master WHERE item_number = @item`,
    { item: { type: T.NVarChar, value: itemNumber } }
  );
  const itemName = itemRows[0]?.item_name || '';

  // 生成 production_number: PP-YYYYMMDD-NNN
  const today = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const prefix = `PP-${today}-`;
  const maxRows = await query<any>(
    `SELECT MAX(production_number) as max_pn FROM Production_plan WHERE production_number LIKE @prefix + '%'`,
    { prefix: { type: T.NVarChar, value: prefix } }
  );
  let seq = 1;
  if (maxRows[0]?.max_pn) {
    const match = maxRows[0].max_pn.match(/(\d+)$/);
    if (match) seq = parseInt(match[1]) + 1;
  }
  const productionNumber = `${prefix}${String(seq).padStart(3, '0')}`;

  await query(
    `INSERT INTO Production_plan (production_number, item_number, item_name, planned_quantity,
      planned_completion_time, plan_status, approval_status, source_order_number, remark)
     VALUES (@pn, @item, @itemName, @qty, @due, N'待加入任务', N'草稿', N'E2E-TEST', @remark)`,
    {
      pn: { type: T.NVarChar, value: productionNumber },
      item: { type: T.NVarChar, value: itemNumber },
      itemName: { type: T.NVarChar, value: itemName },
      qty: { type: T.Decimal, value: plannedQuantity },
      due: { type: T.NVarChar, value: new Date().toISOString().split('T')[0] },
      remark: { type: T.NVarChar, value: remark },
    }
  );
  return productionNumber;
}

/** 查询生产单状态 */
export async function getProductionOrderByNumber(orderNumber: string) {
  const rows = await query<any>(
    `SELECT production_order_number, production_number, item_number, item_name,
            planned_quantity, plan_status, approval_status, inbound_status,
            inbound_quantity, completion_status, is_semi_product
     FROM production_order WHERE production_order_number = @id`,
    { id: { type: T.NVarChar, value: orderNumber } }
  );
  return rows[0];
}

/** 查询生产单所有工序任务 */
export async function getProcessTasksByOrder(orderNumber: string) {
  return await query<any>(
    `SELECT process_task_number, production_order_number, step_number,
            standard_process_name, planned_quantity, completed_quantity,
            task_status, approval_status, is_backflush, work_center_name
     FROM process_task
     WHERE production_order_number = @id
     ORDER BY step_number`,
    { id: { type: T.NVarChar, value: orderNumber } }
  );
}

/** 查询备料单头+明细 */
export async function getMaterialPreparationByOrder(orderNumber: string) {
  const headers = await query<any>(
    `SELECT preparation_number, production_order_number, item_number, item_name,
            preparation_status, approval_status, total_material_types
     FROM material_preparation
     WHERE production_order_number = @id`,
    { id: { type: T.NVarChar, value: orderNumber } }
  );
  const result: any[] = [];
  for (const h of headers) {
    const details = await query<any>(
      `SELECT id, preparation_number, line_number, material_number, material_name,
              required_quantity, issued_quantity, step_number, default_warehouse
       FROM material_preparation_detail
       WHERE preparation_number = @pn ORDER BY line_number`,
      { pn: { type: T.NVarChar, value: h.preparation_number } }
    );
    result.push({ ...h, details });
  }
  return result;
}

/** 查询倒冲任务 */
export async function getBackflushTasksByOrder(orderNumber: string) {
  return await query<any>(
    `SELECT id, production_order_number, item_number, item_name, material_number,
            material_name, required_quantity, deducted_quantity, deduction_status,
            warehouse_number, warehouse_name
     FROM backflush_task
     WHERE production_order_number = @id`,
    { id: { type: T.NVarChar, value: orderNumber } }
  );
}

/** 查询报工记录 */
export async function getWorkReportsByOrder(orderNumber: string) {
  return await query<any>(
    `SELECT work_report_number, process_task_number, production_order_number,
            step_number, qualified_quantity, unqualified_quantity,
            report_date, approval_status
     FROM work_report
     WHERE production_order_number = @id
     ORDER BY report_date`,
    { id: { type: T.NVarChar, value: orderNumber } }
  );
}

/** 种子物料批次库存（用于领料前确保有库存） */
export async function seedMaterialInventory(itemNumber: string, warehouseNumber: string, quantity: number) {
  const itemRows = await query<any>(
    `SELECT item_name, item_type, specifications, basic_unit FROM item_master WHERE item_number = @item`,
    { item: { type: T.NVarChar, value: itemNumber } }
  );
  if (!itemRows[0]) return;
  const item = itemRows[0];

  const whRows = await query<any>(
    `SELECT warehouse_name FROM warehouse WHERE warehouse_number = @wh`,
    { wh: { type: T.NVarChar, value: warehouseNumber } }
  );
  const whName = whRows[0]?.warehouse_name || '';

  const batchNumber = `SEED-${itemNumber}-${Date.now()}`;

  // 插入批次库存
  await query(
    `INSERT INTO material_batch_inventory
     (batch_number, item_number, item_name, item_type, specifications, basic_unit,
      warehouse_number, warehouse_name, quantity, initial_quantity, status, inbound_date)
     VALUES (@bn, @item, @itemName, @itemType, @spec, @unit, @wh, @whName, @qty, @qty, N'正常', GETDATE())`,
    {
      bn: { type: T.NVarChar, value: batchNumber },
      item: { type: T.NVarChar, value: itemNumber },
      itemName: { type: T.NVarChar, value: item.item_name },
      itemType: { type: T.NVarChar, value: item.item_type || '' },
      spec: { type: T.NVarChar, value: item.specifications || '' },
      unit: { type: T.NVarChar, value: item.basic_unit || '' },
      wh: { type: T.NVarChar, value: warehouseNumber },
      whName: { type: T.NVarChar, value: whName },
      qty: { type: T.Decimal, value: quantity },
    }
  );

  // 更新/插入汇总库存
  const existing = await query<any>(
    `SELECT item_number FROM material_inventory
     WHERE item_number = @item AND warehouse_number = @wh`,
    { item: { type: T.NVarChar, value: itemNumber }, wh: { type: T.NVarChar, value: warehouseNumber } }
  );
  if (existing.length > 0) {
    await query(
      `UPDATE material_inventory SET quantity = quantity + @qty, last_updated = GETDATE()
       WHERE item_number = @item AND warehouse_number = @wh`,
      { item: { type: T.NVarChar, value: itemNumber }, wh: { type: T.NVarChar, value: warehouseNumber }, qty: { type: T.Decimal, value: quantity } }
    );
  } else {
    await query(
      `INSERT INTO material_inventory (item_number, item_name, item_type, specifications, basic_unit,
        warehouse_number, warehouse_name, quantity, last_updated)
       VALUES (@item, @itemName, @itemType, @spec, @unit, @wh, @whName, @qty, GETDATE())`,
      {
        item: { type: T.NVarChar, value: itemNumber },
        itemName: { type: T.NVarChar, value: item.item_name },
        itemType: { type: T.NVarChar, value: item.item_type || '' },
        spec: { type: T.NVarChar, value: item.specifications || '' },
        unit: { type: T.NVarChar, value: item.basic_unit || '' },
        wh: { type: T.NVarChar, value: warehouseNumber },
        whName: { type: T.NVarChar, value: whName },
        qty: { type: T.Decimal, value: quantity },
      }
    );
  }

  return batchNumber;
}

/** 查询BOM明细 */
export async function getBomDetails(bomNumber: string) {
  return await query<any>(
    `SELECT line_number, material_number, material_name, material_type,
            standard_quantity, unit, wastage_rate, actual_quantity,
            is_key_material, supply_type, default_warehouse, step_number
     FROM bom_detail
     WHERE bom_number = @bn ORDER BY line_number`,
    { bn: { type: T.NVarChar, value: bomNumber } }
  );
}

/** 按source_number或purchase_req_number查采购申请 */
export async function getPurchaseReqBySource(sourceNumber: string) {
  const rows = await query<any>(
    `SELECT TOP 1 purchase_req_number, source_number, production_number,
            approval_status, order_status, remark
     FROM purchase_req
     WHERE source_number = @sn OR production_number = @pn OR purchase_req_number = @pn
     ORDER BY purchase_req_number DESC`,
    { sn: { type: T.NVarChar, value: sourceNumber }, pn: { type: T.NVarChar, value: sourceNumber } }
  );
  return rows[0];
}

/** 批量审批工序任务（dispatch后工序任务为草稿，需批量改为已审批才能报工） */
export async function batchApproveProcessTasks(orderNumber: string) {
  await query(
    `UPDATE process_task SET approval_status = N'已审批' WHERE production_order_number = @id`,
    { id: { type: T.NVarChar, value: orderNumber } }
  );
}

/** 生产全链路级联清理 */
export async function cleanupProductionChain(ctx: {
  productionNumber?: string;
  productionOrderNumbers?: string[];
  purchaseReqNumbers?: string[];
  purchaseOrderNumbers?: string[];
  mrpRunNumber?: string;
  testMarker?: string;
}) {
  const result = { productionOrders: 0, processTasks: 0, workReports: 0,
    materialIssues: 0, materialPreparations: 0, backflushTasks: 0,
    purchaseOrders: 0, purchaseReqs: 0, mrpRuns: 0, productionPlans: 0,
    inventoryTxns: 0, finishedBatches: 0 };

  // 收集所有生产单号
  let orderNumbers = ctx.productionOrderNumbers || [];
  if (ctx.productionNumber && orderNumbers.length === 0) {
    const pos = await query<any>(
      `SELECT production_order_number FROM production_order WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: ctx.productionNumber } }
    );
    orderNumbers = pos.map((p: any) => p.production_order_number);
  }

  for (const on of orderNumbers) {
    // 1. 报工记录
    await query(`DELETE FROM work_report WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });
    result.workReports++;

    // 2. 领料单
    const issues = await query<any>(
      `SELECT issue_number FROM material_issue WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } }
    );
    for (const iss of issues) {
      await query(`DELETE FROM material_issue_detail WHERE issue_number = @in`, { in: { type: T.NVarChar, value: iss.issue_number } });
      await query(`DELETE FROM material_inventory_transaction WHERE source_number = @sn`, { sn: { type: T.NVarChar, value: iss.issue_number } });
    }
    await query(`DELETE FROM material_issue WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });
    result.materialIssues += issues.length;

    // 3. 备料单
    const preps = await query<any>(
      `SELECT preparation_number FROM material_preparation WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } }
    );
    for (const p of preps) {
      await query(`DELETE FROM material_preparation_detail WHERE preparation_number = @pn`, { pn: { type: T.NVarChar, value: p.preparation_number } });
    }
    await query(`DELETE FROM material_preparation WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });
    result.materialPreparations += preps.length;

    // 4. 倒冲任务
    await query(`DELETE FROM backflush_task WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });

    // 5. 工序任务
    await query(`DELETE FROM process_task WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });
    result.processTasks++;

    // 6. 成品批次库存 + 库存流水
    const fbi = await query<any>(
      `SELECT batch_number FROM finished_batch_inventory WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } }
    );
    for (const fb of fbi) {
      await query(`DELETE FROM finished_batch_inventory WHERE batch_number = @bn`, { bn: { type: T.NVarChar, value: fb.batch_number } });
      await query(`DELETE FROM inventory_transaction WHERE source_number = @sn`, { sn: { type: T.NVarChar, value: fb.batch_number } });
      result.inventoryTxns++;
    }
    result.finishedBatches += fbi.length;

    // 7. 生产入库单（通过 detail 找 inbound_order_number）
    const pios = await query<any>(
      `SELECT DISTINCT inbound_order_number FROM production_inbound_order_detail WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } }
    );
    for (const pio of pios) {
      await query(`DELETE FROM production_inbound_order_detail WHERE inbound_order_number = @ion`, { ion: { type: T.NVarChar, value: pio.inbound_order_number } });
      await query(`DELETE FROM production_inbound_order WHERE inbound_order_number = @ion`, { ion: { type: T.NVarChar, value: pio.inbound_order_number } });
    }

    // 8. 生产单本体
    await query(`DELETE FROM production_order WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });
    result.productionOrders++;
  }

  // 9. 采购订单（由采购申请转单生成的）
  for (const po of ctx.purchaseOrderNumbers || []) {
    await query(`DELETE FROM purchase_order_detail WHERE purchase_order_number = @id`, { id: { type: T.NVarChar, value: po } });
    await query(`DELETE FROM purchase_order WHERE purchase_order_number = @id`, { id: { type: T.NVarChar, value: po } });
    result.purchaseOrders++;
  }

  // 10. 采购申请
  for (const pr of ctx.purchaseReqNumbers || []) {
    await query(`DELETE FROM purchase_req_detail WHERE purchase_req_number = @id`, { id: { type: T.NVarChar, value: pr } });
    await query(`DELETE FROM purchase_req WHERE purchase_req_number = @id`, { id: { type: T.NVarChar, value: pr } });
    result.purchaseReqs++;
  }

  // 11. MRP运算
  if (ctx.mrpRunNumber) {
    await query(`DELETE FROM mrp_run_detail WHERE mrp_run_number = @id`, { id: { type: T.NVarChar, value: ctx.mrpRunNumber } });
    await query(`DELETE FROM mrp_run_plan WHERE mrp_run_number = @id`, { id: { type: T.NVarChar, value: ctx.mrpRunNumber } });
    await query(`DELETE FROM mrp_run WHERE mrp_run_number = @id`, { id: { type: T.NVarChar, value: ctx.mrpRunNumber } });
    result.mrpRuns++;
  }

  // 12. 生产计划
  if (ctx.productionNumber) {
    await query(`DELETE FROM Production_plan WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: ctx.productionNumber } });
    result.productionPlans++;
  }

  return result;
}

// ==================== 销售发货退货 ====================

/** 查询发货申请头 */
export async function getShippingRequest(requestNumber: string) {
  const rows = await query<any>(
    `SELECT request_number, customer_number, customer_name, request_date, status, remark, creation_man, creation_date
     FROM shipping_request WHERE request_number = @rn`,
    { rn: { type: T.NVarChar, value: requestNumber } }
  );
  return rows[0];
}

/** 查询发货申请明细 */
export async function getShippingRequestDetails(requestNumber: string) {
  return await query<any>(
    `SELECT id, request_number, line_number, sales_order_number, sales_detail_id,
            item_number, item_name, specifications, basic_unit,
            order_quantity, shipped_quantity, ship_quantity, delivered_quantity,
            delivery_date, remark
     FROM shipping_request_detail WHERE request_number = @rn ORDER BY line_number`,
    { rn: { type: T.NVarChar, value: requestNumber } }
  );
}

/** 查询发货单头 */
export async function getShippingOrder(shippingOrderNumber: string) {
  const rows = await query<any>(
    `SELECT id, shipping_order_number, customer_number, customer_name,
            warehouse_number, warehouse_name, shipping_date, status,
            carrier, tracking_number, freight, shipping_address,
            contact_person, contact_phone, request_number, remark,
            creation_man, creation_date
     FROM shipping_order WHERE shipping_order_number = @son`,
    { son: { type: T.NVarChar, value: shippingOrderNumber } }
  );
  return rows[0];
}

/** 查询发货单明细 */
export async function getShippingOrderDetails(shippingOrderNumber: string) {
  return await query<any>(
    `SELECT id, shipping_order_number, line_number, request_number,
            sales_order_number, sales_detail_id, item_number, item_name,
            specifications, basic_unit, quantity, remark
     FROM shipping_order_detail WHERE shipping_order_number = @son ORDER BY line_number`,
    { son: { type: T.NVarChar, value: shippingOrderNumber } }
  );
}

/** 查询发货单批次 */
export async function getShippingOrderBatches(shippingOrderNumber: string) {
  return await query<any>(
    `SELECT id, shipping_order_number, detail_id, item_number, batch_number, quantity
     FROM shipping_order_batch WHERE shipping_order_number = @son`,
    { son: { type: T.NVarChar, value: shippingOrderNumber } }
  );
}

/** 查询退货单头 */
export async function getReturnOrder(returnOrderNumber: string) {
  const rows = await query<any>(
    `SELECT id, return_order_number, type, shipping_order_number,
            customer_number, customer_name, warehouse_number, warehouse_name,
            status, reason, remark, confirm_remark,
            creation_man, creation_date, confirmed_by, confirmed_date,
            approval_status, inbound_status
     FROM return_order WHERE return_order_number = @rn`,
    { rn: { type: T.NVarChar, value: returnOrderNumber } }
  );
  return rows[0];
}

/** 查询退货单明细 */
export async function getReturnOrderDetails(returnOrderNumber: string) {
  return await query<any>(
    `SELECT id, return_order_number, line_number, shipping_order_detail_id,
            sales_order_number, sales_detail_id, item_number, item_name,
            specifications, basic_unit, shipped_quantity, return_quantity,
            remark, quality_status, qualified_qty, unqualified_qty
     FROM return_order_detail WHERE return_order_number = @rn ORDER BY line_number`,
    { rn: { type: T.NVarChar, value: returnOrderNumber } }
  );
}

/** 按id查销售订单明细（用于状态断言） */
export async function getSalesOrderDetailById(detailId: number) {
  const rows = await query<any>(
    `SELECT id, sales_order_number, line_number, item_number, item_name,
            order_quantity, shipped_quantity, refunded_quantity,
            shipping_status, return_status, status, production_status
     FROM sales_order_detail WHERE id = @id`,
    { id: { type: T.Int, value: detailId } }
  );
  return rows[0];
}

/** 种子成品库存（用于发货前确保有库存） */
export async function seedFinishedInventory(itemNumber: string, warehouseNumber: string, quantity: number) {
  const itemRows = await query<any>(
    `SELECT item_name, specifications, basic_unit FROM item_master WHERE item_number = @item`,
    { item: { type: T.NVarChar, value: itemNumber } }
  );
  if (!itemRows[0]) return null;
  const item = itemRows[0];

  const whRows = await query<any>(
    `SELECT warehouse_name FROM warehouse WHERE warehouse_number = @wh`,
    { wh: { type: T.NVarChar, value: warehouseNumber } }
  );
  const whName = whRows[0]?.warehouse_name || '';

  const batchNumber = `SEED-FIN-${itemNumber}-${Date.now()}`;

  // 插入成品批次库存
  await query(
    `INSERT INTO finished_batch_inventory
     (batch_number, item_number, item_name, warehouse_number, warehouse_name,
      quantity, initial_quantity, quality_status, inbound_date, status)
     VALUES (@bn, @item, @itemName, @wh, @whName, @qty, @qty, N'合格品', GETDATE(), N'正常')`,
    {
      bn: { type: T.NVarChar, value: batchNumber },
      item: { type: T.NVarChar, value: itemNumber },
      itemName: { type: T.NVarChar, value: item.item_name },
      wh: { type: T.NVarChar, value: warehouseNumber },
      whName: { type: T.NVarChar, value: whName },
      qty: { type: T.Decimal, value: quantity },
    }
  );

  // 更新/插入成品汇总库存
  const existing = await query<any>(
    `SELECT item_number FROM finished_goods_inventory
     WHERE item_number = @item AND warehouse_number = @wh AND quality_status = N'合格品'`,
    { item: { type: T.NVarChar, value: itemNumber }, wh: { type: T.NVarChar, value: warehouseNumber } }
  );
  if (existing.length > 0) {
    await query(
      `UPDATE finished_goods_inventory SET quantity = quantity + @qty
       WHERE item_number = @item AND warehouse_number = @wh AND quality_status = N'合格品'`,
      { item: { type: T.NVarChar, value: itemNumber }, wh: { type: T.NVarChar, value: warehouseNumber }, qty: { type: T.Decimal, value: quantity } }
    );
  } else {
    await query(
      `INSERT INTO finished_goods_inventory (item_number, item_name, warehouse_number, warehouse_name, quantity, quality_status)
       VALUES (@item, @itemName, @wh, @whName, @qty, N'合格品')`,
      {
        item: { type: T.NVarChar, value: itemNumber },
        itemName: { type: T.NVarChar, value: item.item_name },
        wh: { type: T.NVarChar, value: warehouseNumber },
        whName: { type: T.NVarChar, value: whName },
        qty: { type: T.Decimal, value: quantity },
      }
    );
  }

  return batchNumber;
}

/** 级联清理发货退货链数据 */
export async function cleanupShippingReturnChain(ctx: {
  salesOrderNumber?: string;
  shippingRequestNumbers?: string[];
  shippingOrderNumbers?: string[];
  returnOrderNumbers?: string[];
  packingNumbers?: string[];
}) {
  const result = { salesOrders: 0, shippingRequests: 0, shippingOrders: 0,
    returnOrders: 0, packingOrders: 0, inventoryTxns: 0 };

  // 1. 退货单
  for (const rn of ctx.returnOrderNumbers || []) {
    // 退货入库的库存流水
    const inboundTxns = await query<any>(
      `SELECT transaction_number FROM inventory_transaction WHERE source_number = @rn`,
      { rn: { type: T.NVarChar, value: rn } }
    );
    for (const t of inboundTxns) {
      await query(`DELETE FROM inventory_transaction_batch WHERE transaction_number = @tn`,
        { tn: { type: T.NVarChar, value: t.transaction_number } });
    }
    await query(`DELETE FROM inventory_transaction WHERE source_number = @rn`,
      { rn: { type: T.NVarChar, value: rn } });
    result.inventoryTxns += inboundTxns.length;

    await query(`DELETE FROM return_order_batch WHERE return_order_number = @rn`, { rn: { type: T.NVarChar, value: rn } });
    await query(`DELETE FROM return_order_detail WHERE return_order_number = @rn`, { rn: { type: T.NVarChar, value: rn } });
    await query(`DELETE FROM return_order WHERE return_order_number = @rn`, { rn: { type: T.NVarChar, value: rn } });
    result.returnOrders++;
  }

  // 2. 发货单
  for (const son of ctx.shippingOrderNumbers || []) {
    // 发货出库的库存流水
    const outboundTxns = await query<any>(
      `SELECT transaction_number FROM inventory_transaction WHERE source_number = @sn`,
      { sn: { type: T.NVarChar, value: son } }
    );
    for (const t of outboundTxns) {
      await query(`DELETE FROM inventory_transaction_batch WHERE transaction_number = @tn`,
        { tn: { type: T.NVarChar, value: t.transaction_number } });
    }
    await query(`DELETE FROM inventory_transaction WHERE source_number = @sn`,
      { sn: { type: T.NVarChar, value: son } });
    result.inventoryTxns += outboundTxns.length;

    await query(`DELETE FROM shipping_order_batch WHERE shipping_order_number = @son`, { son: { type: T.NVarChar, value: son } });
    await query(`DELETE FROM shipping_order_detail WHERE shipping_order_number = @son`, { son: { type: T.NVarChar, value: son } });
    await query(`DELETE FROM shipping_order WHERE shipping_order_number = @son`, { son: { type: T.NVarChar, value: son } });
    result.shippingOrders++;
  }

  // 3. 发货申请
  for (const srn of ctx.shippingRequestNumbers || []) {
    await query(`DELETE FROM shipping_request_detail WHERE request_number = @rn`, { rn: { type: T.NVarChar, value: srn } });
    await query(`DELETE FROM shipping_request WHERE request_number = @rn`, { rn: { type: T.NVarChar, value: srn } });
    result.shippingRequests++;
  }

  // 4. 装箱单
  for (const pn of ctx.packingNumbers || []) {
    await cleanupPackingOrderData(pn);
    result.packingOrders++;
  }

  // 5. 销售订单
  if (ctx.salesOrderNumber) {
    const son = ctx.salesOrderNumber;
    await query(`DELETE FROM sales_order_detail WHERE sales_order_number = @son`, { son: { type: T.NVarChar, value: son } });
    await query(`DELETE FROM sales_order WHERE sales_order_number = @son`, { son: { type: T.NVarChar, value: son } });
    result.salesOrders++;
  }

  return result;
}

// ==================== 销售预测 ====================

/** 查询预测单头 */
export async function getSalesForecast(forecastNumber: string) {
  const rows = await query<any>(
    `SELECT forecast_number, customer_number, customer_name, forecast_date,
            approval_status, [condition], remark, creation_date, creation_man
     FROM sales_forecast WHERE forecast_number = @fn`,
    { fn: { type: T.NVarChar, value: forecastNumber } }
  );
  return rows[0];
}

/** 查询预测明细 */
export async function getSalesForecastDetails(forecastNumber: string) {
  return await query<any>(
    `SELECT id, forecast_number, line_number, item_number, item_name, specifications,
            basic_unit, product_drawing_number, start_date, end_date,
            forecast_quantity, consumed_quantity, remaining_quantity,
            consumption_status, status, remark
     FROM sales_forecast_detail
     WHERE forecast_number = @fn
     ORDER BY line_number`,
    { fn: { type: T.NVarChar, value: forecastNumber } }
  );
}

/** 通用查询生产计划（不限source_order_number） */
export async function getProductionPlan(productionNumber: string) {
  const rows = await query<any>(
    `SELECT production_number, item_number, item_name, basic_unit, specifications,
            product_drawing_number, rubber_compound_number, batch_production_quota,
            planned_quantity, shifts_number, planned_completion_time,
            plan_status, approval_status, mrp_status,
            source_order_number, source_line_number,
            customer_item_number, customer_item_description, remark
     FROM Production_plan WHERE production_number = @pn`,
    { pn: { type: T.NVarChar, value: productionNumber } }
  );
  return rows[0];
}

/** 级联清理：销售预测+订单 → MPS → 计划 → MRP → 工单 → 备料/工序 → 采购申请 */
export async function cleanupMpsMrpProductionChain(ctx: {
  forecastNumbers?: string[];
  salesOrderNumber?: string;
  productionNumbers?: string[];
  productionOrderNumbers?: string[];
  purchaseReqNumbers?: string[];
  mrpRunNumbers?: string[];
}) {
  const result = { forecasts: 0, salesOrders: 0, plans: 0, mrpRuns: 0,
    prodOrders: 0, purchaseReqs: 0, processTasks: 0, materialPreparations: 0 };

  // 1. 收集所有生产计划号
  const planNumbers = new Set<string>(ctx.productionNumbers || []);

  // 2. 收集所有生产单号
  const orderNumbers = new Set<string>(ctx.productionOrderNumbers || []);
  for (const pn of planNumbers) {
    const pos = await query<any>(
      `SELECT production_order_number FROM production_order WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: pn } }
    );
    for (const po of pos) orderNumbers.add(po.production_order_number);
  }

  // 3. 清理每个生产单的关联数据
  for (const on of orderNumbers) {
    // 3.1 工序任务
    await query(`DELETE FROM process_task WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });
    result.processTasks++;

    // 3.2 备料单
    const preps = await query<any>(
      `SELECT preparation_number FROM material_preparation WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } }
    );
    for (const p of preps) {
      await query(`DELETE FROM material_preparation_detail WHERE preparation_number = @pn`, { pn: { type: T.NVarChar, value: p.preparation_number } });
    }
    await query(`DELETE FROM material_preparation WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });
    result.materialPreparations += preps.length;

    // 3.3 报工记录
    await query(`DELETE FROM work_report WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });

    // 3.4 倒冲任务
    await query(`DELETE FROM backflush_task WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });

    // 3.5 生产入库单
    const pios = await query<any>(
      `SELECT DISTINCT inbound_order_number FROM production_inbound_order_detail WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } }
    );
    for (const pio of pios) {
      await query(`DELETE FROM production_inbound_order_detail WHERE inbound_order_number = @ion`, { ion: { type: T.NVarChar, value: pio.inbound_order_number } });
      await query(`DELETE FROM production_inbound_order WHERE inbound_order_number = @ion`, { ion: { type: T.NVarChar, value: pio.inbound_order_number } });
    }

    // 3.6 成品批次库存
    const fbi = await query<any>(
      `SELECT batch_number FROM finished_batch_inventory WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } }
    );
    for (const fb of fbi) {
      await query(`DELETE FROM finished_batch_inventory WHERE batch_number = @bn`, { bn: { type: T.NVarChar, value: fb.batch_number } });
      await query(`DELETE FROM inventory_transaction WHERE source_number = @sn`, { sn: { type: T.NVarChar, value: fb.batch_number } });
    }

    // 3.7 领料单
    const issues = await query<any>(
      `SELECT issue_number FROM material_issue WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } }
    );
    for (const iss of issues) {
      await query(`DELETE FROM material_issue_detail WHERE issue_number = @in_`, { in_: { type: T.NVarChar, value: iss.issue_number } });
      await query(`DELETE FROM material_inventory_transaction WHERE source_number = @sn`, { sn: { type: T.NVarChar, value: iss.issue_number } });
    }
    await query(`DELETE FROM material_issue WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });

    // 3.8 生产单本体
    await query(`DELETE FROM production_order WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });
    result.prodOrders++;
  }

  // 4. 采购申请
  for (const pr of ctx.purchaseReqNumbers || []) {
    await query(`DELETE FROM purchase_req_detail WHERE purchase_req_number = @id`, { id: { type: T.NVarChar, value: pr } });
    await query(`DELETE FROM purchase_req WHERE purchase_req_number = @id`, { id: { type: T.NVarChar, value: pr } });
    result.purchaseReqs++;
  }
  // 通过计划号找采购申请
  for (const pn of planNumbers) {
    const prs = await query<any>(
      `SELECT purchase_req_number FROM purchase_req WHERE production_number = @pn AND purchase_req_number NOT LIKE N'MRP_TEMP%'`,
      { pn: { type: T.NVarChar, value: pn } }
    );
    for (const pr of prs) {
      await query(`DELETE FROM purchase_req_detail WHERE purchase_req_number = @id`, { id: { type: T.NVarChar, value: pr.purchase_req_number } });
      await query(`DELETE FROM purchase_req WHERE purchase_req_number = @id`, { id: { type: T.NVarChar, value: pr.purchase_req_number } });
      result.purchaseReqs++;
    }
  }

  // 5. MRP运算
  for (const mrn of ctx.mrpRunNumbers || []) {
    await query(`DELETE FROM mrp_run_detail WHERE mrp_run_number = @id`, { id: { type: T.NVarChar, value: mrn } });
    await query(`DELETE FROM mrp_run_plan WHERE mrp_run_number = @id`, { id: { type: T.NVarChar, value: mrn } });
    await query(`DELETE FROM mrp_run WHERE mrp_run_number = @id`, { id: { type: T.NVarChar, value: mrn } });
    result.mrpRuns++;
  }
  // 通过计划号找MRP
  for (const pn of planNumbers) {
    const runs = await query<any>(
      `SELECT DISTINCT mrp_run_number FROM mrp_run_plan WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: pn } }
    );
    for (const r of runs) {
      await query(`DELETE FROM mrp_run_detail WHERE mrp_run_number = @id`, { id: { type: T.NVarChar, value: r.mrp_run_number } });
      await query(`DELETE FROM mrp_run_plan WHERE mrp_run_number = @id`, { id: { type: T.NVarChar, value: r.mrp_run_number } });
      await query(`DELETE FROM mrp_run WHERE mrp_run_number = @id`, { id: { type: T.NVarChar, value: r.mrp_run_number } });
      result.mrpRuns++;
    }
  }

  // 6. 生产计划
  for (const pn of planNumbers) {
    await query(`DELETE FROM Production_plan WHERE production_number = @pn`, { pn: { type: T.NVarChar, value: pn } });
    result.plans++;
  }

  // 7. 销售订单
  if (ctx.salesOrderNumber) {
    const son = ctx.salesOrderNumber;
    await query(`DELETE FROM sales_order_detail WHERE sales_order_number = @son`, { son: { type: T.NVarChar, value: son } });
    await query(`DELETE FROM sales_order WHERE sales_order_number = @son`, { son: { type: T.NVarChar, value: son } });
    result.salesOrders++;
  }

  // 8. 销售预测
  for (const fn of ctx.forecastNumbers || []) {
    await query(`DELETE FROM sales_forecast_detail WHERE forecast_number = @fn`, { fn: { type: T.NVarChar, value: fn } });
    await query(`DELETE FROM sales_forecast WHERE forecast_number = @fn`, { fn: { type: T.NVarChar, value: fn } });
    result.forecasts++;
  }

  return result;
}

// ==================== 盘点管理 ====================

/** 查询盘点单头 */
export async function getStockCount(countNumber: string) {
  const rows = await query<any>(
    `SELECT id, count_number, count_period, warehouse_number, warehouse_name, count_type,
            status, total_items, total_batches, matched_batches, surplus_batches, shortage_batches,
            total_surplus_qty, total_shortage_qty, count_man, count_date, remark,
            reviewer, review_date, review_remark,
            confirmed_by, confirmed_date, confirm_remark,
            created_time, completed_time, creation_date, last_updated
     FROM stock_count WHERE count_number = @cn`,
    { cn: { type: T.NVarChar, value: countNumber } }
  );
  return rows[0];
}

/** 查询盘点单明细 */
export async function getStockCountDetails(countNumber: string) {
  return await query<any>(
    `SELECT id, count_number, line_number, item_number, item_name, specifications,
            basic_unit, product_drawing_number, batch_number, batch_inventory_id,
            system_quantity, actual_quantity, difference_quantity, count_status,
            production_order_number, inbound_date, quality_status, remark
     FROM stock_count_detail WHERE count_number = @cn ORDER BY line_number`,
    { cn: { type: T.NVarChar, value: countNumber } }
  );
}

/** 按物料+仓库查所有库存流水（用于一致性比对） */
export async function getAllInventoryTransactions(itemNumber: string, warehouseNumber: string) {
  return await query<any>(
    `SELECT transaction_number, transaction_type, source_type, source_number,
            item_number, item_name, warehouse_number, warehouse_name, quantity,
            before_quantity, after_quantity, batch_number, operator, operation_date,
            remark, quality_status, creation_date
     FROM inventory_transaction
     WHERE item_number = @item AND warehouse_number = @wh
     ORDER BY creation_date DESC`,
    {
      item: { type: T.NVarChar, value: itemNumber },
      wh: { type: T.NVarChar, value: warehouseNumber },
    }
  );
}

/** 级联清理盘点+库存+销售发货退货链数据 */
export async function cleanupInventoryStocktakingChain(ctx: {
  stockCountNumbers?: string[];
  salesOrderNumber?: string;
  shippingRequestNumbers?: string[];
  shippingOrderNumbers?: string[];
  returnOrderNumbers?: string[];
  packingNumbers?: string[];
}) {
  const result = { stockCounts: 0, inventoryTxns: 0, ...await cleanupShippingReturnChain(ctx) };

  // 1. 盘点单（需先删明细，再删主表）
  for (const cn of ctx.stockCountNumbers || []) {
    // 盘点确认产生的库存流水（source_number = count_number）
    const txns = await query<any>(
      `SELECT transaction_number FROM inventory_transaction WHERE source_number = @cn`,
      { cn: { type: T.NVarChar, value: cn } }
    );
    for (const t of txns) {
      await query(`DELETE FROM inventory_transaction_batch WHERE transaction_number = @tn`,
        { tn: { type: T.NVarChar, value: t.transaction_number } });
    }
    await query(`DELETE FROM inventory_transaction WHERE source_number = @cn`,
      { cn: { type: T.NVarChar, value: cn } });
    result.inventoryTxns += txns.length;

    await query(`DELETE FROM stock_count_detail WHERE count_number = @cn`,
      { cn: { type: T.NVarChar, value: cn } });
    await query(`DELETE FROM stock_count WHERE count_number = @cn`,
      { cn: { type: T.NVarChar, value: cn } });
    result.stockCounts++;
  }

  return result;
}

// ==================== 生产执行+检验 ====================

/** 扩展版工序任务查询(含inspect_type/inspect_status) */
export async function getProcessTasksByOrderFull(orderNumber: string) {
  return await query<any>(
    `SELECT process_task_number, production_order_number, step_number,
            standard_process_name, planned_quantity, completed_quantity,
            task_status, approval_status, is_backflush, work_center_name,
            inspect_type, inspect_status, inspect_plan_name
     FROM process_task
     WHERE production_order_number = @id
     ORDER BY step_number`,
    { id: { type: T.NVarChar, value: orderNumber } }
  );
}

/** 按工单查询生产检验记录 */
export async function getProductionInspectionsByOrder(orderNumber: string) {
  return await query<any>(
    `SELECT inspection_number, work_report_number, process_task_number,
            production_order_number, step_number, inspect_type,
            total_quantity, qualified_quantity, unqualified_quantity,
            inspection_result, status, defect_handling, nonconforming_number,
            inspection_plan_name, inspector_name, inspection_date
     FROM production_inspection
     WHERE production_order_number = @id
     ORDER BY step_number, creation_date`,
    { id: { type: T.NVarChar, value: orderNumber } }
  );
}

/** 查询单个NC记录 */
export async function getNonconformingProduct(ncNumber: string) {
  const rows = await query<any>(
    `SELECT nonconforming_number, production_order_number, source_number,
            step_number, item_number, item_name,
            unqualified_quantity, handling_method, handling_status,
            concession_quantity, scrap_type, scrap_quantity,
            rework_step_number, rework_order_number,
            handling_remark, operator, handling_date,
            creation_date, creation_man
     FROM nonconforming_product
     WHERE nonconforming_number = @nc`,
    { nc: { type: T.NVarChar, value: ncNumber } }
  );
  return rows[0];
}

/** 查询单个报工记录 */
export async function getWorkReportByNumber(workReportNumber: string) {
  const rows = await query<any>(
    `SELECT work_report_number, process_task_number, production_order_number,
            step_number, qualified_quantity, unqualified_quantity,
            report_date, approval_status, remark
     FROM work_report
     WHERE work_report_number = @wrn`,
    { wrn: { type: T.NVarChar, value: workReportNumber } }
  );
  return rows[0];
}

/** 查询返修单 */
export async function getReworkOrder(reworkOrderNumber: string) {
  const rows = await query<any>(
    `SELECT rework_order_number, nonconforming_number, production_order_number,
            process_task_number, step_number, rework_step_number,
            rework_quantity, status, rework_remark,
            completion_date, creation_date, creation_man
     FROM rework_order
     WHERE rework_order_number = @rn`,
    { rn: { type: T.NVarChar, value: reworkOrderNumber } }
  );
  return rows[0];
}

/** 生产执行链路级联清理（含检验/NC/返修） */
export async function cleanupProductionExecutionChain(ctx: {
  productionNumber?: string;
  productionOrderNumbers?: string[];
  purchaseReqNumbers?: string[];
  mrpRunNumber?: string;
  testMarker?: string;
}) {
  const result = { productionOrders: 0, processTasks: 0, workReports: 0,
    materialIssues: 0, materialPreparations: 0, backflushTasks: 0,
    purchaseOrders: 0, purchaseReqs: 0, mrpRuns: 0, productionPlans: 0,
    inventoryTxns: 0, finishedBatches: 0,
    inspections: 0, ncProducts: 0, reworkOrders: 0, stockIns: 0 };

  // 收集所有生产单号
  let orderNumbers = ctx.productionOrderNumbers || [];
  if (ctx.productionNumber && orderNumbers.length === 0) {
    const pos = await query<any>(
      `SELECT production_order_number FROM production_order WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: ctx.productionNumber } }
    );
    orderNumbers = pos.map((p: any) => p.production_order_number);
  }

  for (const on of orderNumbers) {
    // 1. 返修单
    const reworks = await query<any>(
      `SELECT rework_order_number FROM rework_order WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } }
    );
    for (const r of reworks) {
      await query(`DELETE FROM rework_order WHERE rework_order_number = @rn`,
        { rn: { type: T.NVarChar, value: r.rework_order_number } });
      result.reworkOrders++;
    }

    // 2. NC单
    const ncs = await query<any>(
      `SELECT nonconforming_number FROM nonconforming_product WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } }
    );
    for (const nc of ncs) {
      await query(`DELETE FROM nonconforming_product WHERE nonconforming_number = @ncn`,
        { ncn: { type: T.NVarChar, value: nc.nonconforming_number } });
      result.ncProducts++;
    }

    // 3. 生产检验明细 + 主表
    const inspections = await query<any>(
      `SELECT inspection_number FROM production_inspection WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } }
    );
    for (const ins of inspections) {
      await query(`DELETE FROM production_inspection_item WHERE inspection_number = @insn`,
        { insn: { type: T.NVarChar, value: ins.inspection_number } });
      result.inspections++;
    }
    await query(`DELETE FROM production_inspection WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } });

    // 4. 报工记录
    await query(`DELETE FROM work_report WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });
    result.workReports++;

    // 5. 领料单
    const issues = await query<any>(
      `SELECT issue_number FROM material_issue WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } }
    );
    for (const iss of issues) {
      await query(`DELETE FROM material_issue_detail WHERE issue_number = @in_`, { in_: { type: T.NVarChar, value: iss.issue_number } });
      await query(`DELETE FROM material_inventory_transaction WHERE source_number = @sn`, { sn: { type: T.NVarChar, value: iss.issue_number } });
    }
    await query(`DELETE FROM material_issue WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });
    result.materialIssues += issues.length;

    // 6. 备料单
    const preps = await query<any>(
      `SELECT preparation_number FROM material_preparation WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } }
    );
    for (const p of preps) {
      await query(`DELETE FROM material_preparation_detail WHERE preparation_number = @pn`, { pn: { type: T.NVarChar, value: p.preparation_number } });
    }
    await query(`DELETE FROM material_preparation WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });
    result.materialPreparations += preps.length;

    // 7. 倒冲任务
    await query(`DELETE FROM backflush_task WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });

    // 8. 工序任务
    await query(`DELETE FROM process_task WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });
    result.processTasks++;

    // 9. 成品批次库存 + 库存流水
    const fbi = await query<any>(
      `SELECT batch_number FROM finished_batch_inventory WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } }
    );
    for (const fb of fbi) {
      await query(`DELETE FROM finished_batch_inventory WHERE batch_number = @bn`, { bn: { type: T.NVarChar, value: fb.batch_number } });
      await query(`DELETE FROM inventory_transaction WHERE source_number = @sn`, { sn: { type: T.NVarChar, value: fb.batch_number } });
      result.inventoryTxns++;
    }
    result.finishedBatches += fbi.length;

    // 10. 报废入库单(由NC报废产生) - 删除近2小时内的报废入库单
    const allScrapIns = await query<any>(
      `SELECT stock_in_number FROM stock_in WHERE stock_in_type = N'报废入库'
       AND creation_date >= DATEADD(HOUR, -2, GETDATE())`
    );
    for (const si of allScrapIns) {
      await query(`DELETE FROM stock_in_detail WHERE stock_in_number = @sin`, { sin: { type: T.NVarChar, value: si.stock_in_number } });
      await query(`DELETE FROM stock_in WHERE stock_in_number = @sin`, { sin: { type: T.NVarChar, value: si.stock_in_number } });
      result.stockIns++;
    }

    // 11. 生产入库单
    const pios = await query<any>(
      `SELECT DISTINCT inbound_order_number FROM production_inbound_order_detail WHERE production_order_number = @id`,
      { id: { type: T.NVarChar, value: on } }
    );
    for (const pio of pios) {
      await query(`DELETE FROM production_inbound_order_detail WHERE inbound_order_number = @ion`, { ion: { type: T.NVarChar, value: pio.inbound_order_number } });
      await query(`DELETE FROM production_inbound_order WHERE inbound_order_number = @ion`, { ion: { type: T.NVarChar, value: pio.inbound_order_number } });
    }

    // 12. 生产单本体
    await query(`DELETE FROM production_order WHERE production_order_number = @id`, { id: { type: T.NVarChar, value: on } });
    result.productionOrders++;
  }

  // 13. 采购申请
  for (const pr of ctx.purchaseReqNumbers || []) {
    await query(`DELETE FROM purchase_req_detail WHERE purchase_req_number = @id`, { id: { type: T.NVarChar, value: pr } });
    await query(`DELETE FROM purchase_req WHERE purchase_req_number = @id`, { id: { type: T.NVarChar, value: pr } });
    result.purchaseReqs++;
  }

  // 14. MRP运算
  if (ctx.mrpRunNumber) {
    await query(`DELETE FROM mrp_run_detail WHERE mrp_run_number = @id`, { id: { type: T.NVarChar, value: ctx.mrpRunNumber } });
    await query(`DELETE FROM mrp_run_plan WHERE mrp_run_number = @id`, { id: { type: T.NVarChar, value: ctx.mrpRunNumber } });
    await query(`DELETE FROM mrp_run WHERE mrp_run_number = @id`, { id: { type: T.NVarChar, value: ctx.mrpRunNumber } });
    result.mrpRuns++;
  }

  // 15. 生产计划
  if (ctx.productionNumber) {
    await query(`DELETE FROM Production_plan WHERE production_number = @pn`,
      { pn: { type: T.NVarChar, value: ctx.productionNumber } });
    result.productionPlans++;
  }

  return result;
}

// ==================== 其他出入库 ====================
export async function getAbnormalIORequest(requestNumber: string) {
  const rows = await query<{
    id: number; request_number: string; type: string; status: string;
    warehouse_number: string; warehouse_name: string;
    target_warehouse_number: string; target_warehouse_name: string;
    reason: string; withdraw_operator: string;
  }>(
    `SELECT id, request_number, type, status, warehouse_number, warehouse_name,
       target_warehouse_number, target_warehouse_name, reason, withdraw_operator
     FROM abnormal_io_request WHERE request_number = @rn`,
    { rn: { type: T.NVarChar, value: requestNumber } }
  );
  return rows[0] || null;
}

export async function getAbnormalIODetails(requestNumber: string) {
  return query<{
    id: number; request_number: string; line_number: number;
    item_number: string; item_name: string; quantity: number;
    system_quantity: number; actual_quantity: number; difference_quantity: number;
  }>(
    `SELECT id, request_number, line_number, item_number, item_name,
       quantity, system_quantity, actual_quantity, difference_quantity
     FROM abnormal_io_request_detail WHERE request_number = @rn ORDER BY line_number`,
    { rn: { type: T.NVarChar, value: requestNumber } }
  );
}

export async function getAbnormalIOTransactions(requestNumber: string) {
  return query<{
    transaction_number: string; transaction_type: string; source_type: string;
    item_number: string; warehouse_number: string; quantity: number;
    before_quantity: number; after_quantity: number; status: string;
    void_operator: string;
  }>(
    `SELECT transaction_number, transaction_type, source_type, item_number,
       warehouse_number, quantity, before_quantity, after_quantity, status, void_operator
     FROM inventory_transaction WHERE source_number = @rn`,
    { rn: { type: T.NVarChar, value: requestNumber } }
  );
}

export async function cleanupAbnormalIOData(requestNumber: string) {
  await query(
    `DELETE FROM inventory_transaction_batch WHERE transaction_number IN
       (SELECT transaction_number FROM inventory_transaction WHERE source_number = @rn)`,
    { rn: { type: T.NVarChar, value: requestNumber } }
  );
  await query(
    `DELETE FROM inventory_transaction WHERE source_number = @rn`,
    { rn: { type: T.NVarChar, value: requestNumber } }
  );
  await query(
    `DELETE FROM abnormal_io_request_detail WHERE request_number = @rn`,
    { rn: { type: T.NVarChar, value: requestNumber } }
  );
  await query(
    `DELETE FROM abnormal_io_request WHERE request_number = @rn`,
    { rn: { type: T.NVarChar, value: requestNumber } }
  );
}

/** 查找有成品批次库存的物料 */
export async function findFinishedItemWithBatches(warehouseNumber = '01') {
  const rows = await query<{ item_number: string; item_name: string; total_qty: number }>(
    `SELECT TOP 1 fbi.item_number, fbi.item_name,
       SUM(fbi.quantity) as total_qty
     FROM finished_batch_inventory fbi
     WHERE fbi.warehouse_number = @wn AND fbi.quantity > 0 AND fbi.status = N'正常'
     GROUP BY fbi.item_number, fbi.item_name
     HAVING SUM(fbi.quantity) >= 5
     ORDER BY total_qty DESC`,
    { wn: { type: T.NVarChar, value: warehouseNumber } }
  );
  return rows[0] || null;
}

/** 查找另一个有库存的仓库（用于调拨测试） */
export async function findAnotherWarehouseWithInventory(excludeWarehouse: string) {
  const rows = await query<{ warehouse_number: string; warehouse_name: string }>(
    `SELECT TOP 1 warehouse_number, warehouse_name FROM (
       SELECT fgi.warehouse_number, fgi.warehouse_name, SUM(fgi.quantity) as total
       FROM finished_goods_inventory fgi
       WHERE fgi.warehouse_number <> @wn
       GROUP BY fgi.warehouse_number, fgi.warehouse_name
       HAVING SUM(fgi.quantity) > 0
     ) t ORDER BY total DESC`,
    { wn: { type: T.NVarChar, value: excludeWarehouse } }
  );
  return rows[0] || null;
}

// ==================== 生产入库撤回 ====================

/** 查询生产入库单头 */
export async function getProductionInboundOrder(inboundOrderNumber: string) {
  const rows = await query<{
    inbound_order_number: string; warehouse_number: string; warehouse_name: string;
    operator: string; remark: string; status: string; withdraw_operator: string;
    withdraw_date: Date | null; creation_date: Date;
  }>(
    `SELECT inbound_order_number, warehouse_number, warehouse_name, operator, remark,
       status, withdraw_operator, withdraw_date, creation_date
     FROM production_inbound_order WHERE inbound_order_number = @ion`,
    { ion: { type: T.NVarChar, value: inboundOrderNumber } }
  );
  return rows[0] || null;
}

/** 查询生产入库单明细 */
export async function getProductionInboundOrderDetails(inboundOrderNumber: string) {
  return await query<{
    id: number; inbound_order_number: string; line_number: number;
    production_order_number: string; item_number: string; item_name: string;
    specifications: string; basic_unit: string; inbound_quantity: number;
    batch_number: string; transaction_number: string;
  }>(
    `SELECT id, inbound_order_number, line_number, production_order_number,
       item_number, item_name, specifications, basic_unit, inbound_quantity,
       batch_number, transaction_number
     FROM production_inbound_order_detail
     WHERE inbound_order_number = @ion
     ORDER BY line_number`,
    { ion: { type: T.NVarChar, value: inboundOrderNumber } }
  );
}

/** 查询成品库存流水（按source_number） */
export async function getInventoryTransactionsBySource(sourceNumber: string) {
  return await query<{
    transaction_number: string; transaction_type: string; source_type: string;
    source_number: string; item_number: string; item_name: string;
    warehouse_number: string; quantity: number;
    before_quantity: number; after_quantity: number;
    batch_number: string; status: string; void_operator: string;
  }>(
    `SELECT transaction_number, transaction_type, source_type, source_number,
       item_number, item_name, warehouse_number, quantity,
       before_quantity, after_quantity, batch_number, status, void_operator
     FROM inventory_transaction WHERE source_number = @sn`,
    { sn: { type: T.NVarChar, value: sourceNumber } }
  );
}

/** 查询倒冲扣减日志 */
export async function getBackflushDeductionLogs(productionOrderNumber: string) {
  return await query<{
    id: number; production_order_number: string; material_number: string;
    material_name: string; warehouse_number: string; deduction_quantity: number;
    inbound_quantity: number; transaction_number: string; batch_deductions: string;
    backflush_task_id: number; status: string; deduction_date: Date;
  }>(
    `SELECT id, production_order_number, material_number, material_name,
       warehouse_number, deduction_quantity, inbound_quantity,
       transaction_number, batch_deductions, backflush_task_id, status, deduction_date
     FROM backflush_deduction_log
     WHERE production_order_number = @pon
     ORDER BY deduction_date DESC`,
    { pon: { type: T.NVarChar, value: productionOrderNumber } }
  );
}

/** 查询倒冲任务 */
export async function getBackflushTasksByOrderFull(orderNumber: string) {
  return await query<{
    id: number; production_order_number: string; item_number: string; item_name: string;
    material_number: string; material_name: string; required_quantity: number;
    deducted_quantity: number; deduction_status: string;
    warehouse_number: string; warehouse_name: string;
  }>(
    `SELECT id, production_order_number, item_number, item_name, material_number,
       material_name, required_quantity, deducted_quantity, deduction_status,
       warehouse_number, warehouse_name
     FROM backflush_task WHERE production_order_number = @pon`,
    { pon: { type: T.NVarChar, value: orderNumber } }
  );
}

/** 查询物料库存流水（按transaction_number） */
export async function getMaterialTransactionByTxNum(transactionNumber: string) {
  const rows = await query<{
    transaction_number: string; transaction_type: string; source_type: string;
    source_number: string; item_number: string; item_name: string;
    warehouse_number: string; quantity: number; batch_number: string;
    status: string; void_operator: string;
  }>(
    `SELECT transaction_number, transaction_type, source_type, source_number,
       item_number, item_name, warehouse_number, quantity, batch_number,
       status, void_operator
     FROM material_inventory_transaction WHERE transaction_number = @tn`,
    { tn: { type: T.NVarChar, value: transactionNumber } }
  );
  return rows[0] || null;
}

/** 查询批次追溯记录 */
export async function getBatchTraceability(productionOrderNumber: string) {
  return await query<{
    id: number; finished_batch_number: string; material_batch_number: string;
    production_order_number: string; item_number: string; material_number: string;
  }>(
    `SELECT id, finished_batch_number, material_batch_number,
       production_order_number, item_number, material_number
     FROM batch_traceability WHERE production_order_number = @pon`,
    { pon: { type: T.NVarChar, value: productionOrderNumber } }
  );
}

/** 查找可用的生产单（已审批+已派发+有备料+有倒冲任务+未入库） */
export async function findAvailableProductionOrderForInbound() {
  const rows = await query<{
    production_order_number: string; item_number: string; item_name: string;
    planned_quantity: number; inbound_status: string; inbound_quantity: number;
  }>(
    `SELECT TOP 1 po.production_order_number, po.item_number, po.item_name,
       po.planned_quantity, po.inbound_status, po.inbound_quantity
     FROM production_order po
     WHERE po.approval_status = N'已审批'
       AND po.inbound_status = N'未入库'
       AND po.inbound_quantity = 0
       AND EXISTS (SELECT 1 FROM process_task pt WHERE pt.production_order_number = po.production_order_number AND pt.approval_status = N'已审批')
       AND EXISTS (SELECT 1 FROM material_preparation mp WHERE mp.production_order_number = po.production_order_number)
       AND EXISTS (SELECT 1 FROM backflush_task bt WHERE bt.production_order_number = po.production_order_number)
     ORDER BY po.production_order_number DESC`
  );
  return rows[0] || null;
}

/** 查找可用的生产单（无倒冲任务，即无需倒冲扣减的场景） */
export async function findAvailableProductionOrderNoBackflush() {
  const rows = await query<{
    production_order_number: string; item_number: string; item_name: string;
    planned_quantity: number; inbound_status: string; inbound_quantity: number;
  }>(
    `SELECT TOP 1 po.production_order_number, po.item_number, po.item_name,
       po.planned_quantity, po.inbound_status, po.inbound_quantity
     FROM production_order po
     WHERE po.approval_status = N'已审批'
       AND po.inbound_status = N'未入库'
       AND po.inbound_quantity = 0
       AND EXISTS (SELECT 1 FROM process_task pt WHERE pt.production_order_number = po.production_order_number AND pt.approval_status = N'已审批')
       AND NOT EXISTS (SELECT 1 FROM backflush_task bt WHERE bt.production_order_number = po.production_order_number)
     ORDER BY po.production_order_number DESC`
  );
  return rows[0] || null;
}

/** 查询仓库信息 */
export async function getWarehouse(warehouseNumber: string) {
  const rows = await query<{
    warehouse_number: string; warehouse_name: string;
  }>(
    `SELECT warehouse_number, warehouse_name FROM warehouse WHERE warehouse_number = @wn`,
    { wn: { type: T.NVarChar, value: warehouseNumber } }
  );
  return rows[0] || null;
}

/** 清理生产入库撤回测试数据 */
export async function cleanupProductionInboundWithdrawData(inboundOrderNumber: string) {
  // 1. 查找入库单头（获取 item_number / warehouse_number）
  const header = await query<any>(
    `SELECT item_number, warehouse_number FROM production_inbound_order WHERE inbound_order_number = @ion`,
    { ion: { type: T.NVarChar, value: inboundOrderNumber } }
  );
  const itemNumber = header[0]?.item_number;
  const warehouseNumber = header[0]?.warehouse_number;

  // 2. 查找入库单关联的生产单
  const details = await query<any>(
    `SELECT production_order_number, batch_number, transaction_number
     FROM production_inbound_order_detail WHERE inbound_order_number = @ion`,
    { ion: { type: T.NVarChar, value: inboundOrderNumber } }
  );

  // 3. 清理批次追溯
  for (const d of details) {
    if (d.production_order_number) {
      await query(`DELETE FROM batch_traceability WHERE production_order_number = @pon`,
        { pon: { type: T.NVarChar, value: d.production_order_number } });
    }
  }

  // 4. 清理库存流水批次
  for (const d of details) {
    if (d.transaction_number) {
      await query(`DELETE FROM inventory_transaction_batch WHERE transaction_number = @tn`,
        { tn: { type: T.NVarChar, value: d.transaction_number } });
    }
  }

  // 5. 清理成品库存流水
  for (const d of details) {
    if (d.batch_number) {
      await query(`DELETE FROM inventory_transaction WHERE source_number = @bn`,
        { bn: { type: T.NVarChar, value: d.batch_number } });
    }
  }

  // 6. 清理成品批次库存
  for (const d of details) {
    if (d.batch_number) {
      await query(`DELETE FROM finished_batch_inventory WHERE batch_number = @bn`,
        { bn: { type: T.NVarChar, value: d.batch_number } });
    }
  }

  // 7. 回退生产单入库状态
  for (const d of details) {
    if (d.production_order_number) {
      await query(
        `UPDATE production_order SET inbound_quantity = 0, inbound_status = N'未入库'
         WHERE production_order_number = @pon`,
        { pon: { type: T.NVarChar, value: d.production_order_number } }
      );
    }
  }

  // 8. 清理倒冲扣减日志 + 回退倒冲任务
  for (const d of details) {
    if (d.production_order_number) {
      const logs = await query<any>(
        `SELECT id, backflush_task_id, transaction_number FROM backflush_deduction_log
         WHERE production_order_number = @pon`,
        { pon: { type: T.NVarChar, value: d.production_order_number } }
      );
      for (const log of logs) {
        // 标记物料流水作废
        if (log.transaction_number) {
          await query(`DELETE FROM material_inventory_transaction WHERE transaction_number = @tn`,
            { tn: { type: T.NVarChar, value: log.transaction_number } });
        }
        // 回退倒冲任务
        if (log.backflush_task_id) {
          await query(
            `UPDATE backflush_task SET deducted_quantity = 0, deduction_status = N'待扣减' WHERE id = @id`,
            { id: { type: T.Int, value: log.backflush_task_id } }
          );
        }
      }
      await query(`DELETE FROM backflush_deduction_log WHERE production_order_number = @pon`,
        { pon: { type: T.NVarChar, value: d.production_order_number } });
    }
  }

  // 9. 删除入库单明细 + 头
  await query(`DELETE FROM production_inbound_order_detail WHERE inbound_order_number = @ion`,
    { ion: { type: T.NVarChar, value: inboundOrderNumber } });
  await query(`DELETE FROM production_inbound_order WHERE inbound_order_number = @ion`,
    { ion: { type: T.NVarChar, value: inboundOrderNumber } });

  // 10. 重算成品汇总库存
  await resyncFinishedGoodsInventory(itemNumber, warehouseNumber);
}

/** 按生产单号强制清理所有生产入库相关数据（用于测试前置清理） */
export async function forceCleanupProductionInboundByPON(productionOrderNumber: string) {
  const T = TYPES;

  // 1. 获取生产单的物料号
  const poRows = await query<any>(
    `SELECT item_number FROM production_order WHERE production_order_number = @pon`,
    { pon: { type: T.NVarChar, value: productionOrderNumber } }
  );
  if (poRows.length === 0) return;
  const itemNumber = poRows[0].item_number;

  // 2. 找到所有关联入库单
  const inboundOrders = await query<any>(
    `SELECT DISTINCT inbound_order_number FROM production_inbound_order_detail WHERE production_order_number = @pon`,
    { pon: { type: T.NVarChar, value: productionOrderNumber } }
  );

  for (const io of inboundOrders) {
    const ion = io.inbound_order_number;
    // 获取明细中的批次号和流水号
    const details = await query<any>(
      `SELECT batch_number, transaction_number FROM production_inbound_order_detail WHERE inbound_order_number = @ion`,
      { ion: { type: T.NVarChar, value: ion } }
    );

    // 删除批次追溯
    for (const d of details) {
      if (d.batch_number) {
        await query(`DELETE FROM batch_traceability WHERE production_order_number = @pon AND finished_batch_number = @bn`,
          { pon: { type: T.NVarChar, value: productionOrderNumber }, bn: { type: T.NVarChar, value: d.batch_number } })
          .catch(() => { /* ignore */ });
      }
    }

    // 删除库存流水批次
    for (const d of details) {
      if (d.transaction_number) {
        await query(`DELETE FROM inventory_transaction_batch WHERE transaction_number = @tn`,
          { tn: { type: T.NVarChar, value: d.transaction_number } })
          .catch(() => { /* ignore */ });
      }
    }

    // 删除库存流水（按 source_number = batch_number）
    for (const d of details) {
      if (d.batch_number) {
        await query(`DELETE FROM inventory_transaction WHERE source_number = @bn`,
          { bn: { type: T.NVarChar, value: d.batch_number } })
          .catch(() => { /* ignore */ });
      }
    }

    // 删除成品批次库存
    for (const d of details) {
      if (d.batch_number) {
        await query(`DELETE FROM finished_batch_inventory WHERE batch_number = @bn`,
          { bn: { type: T.NVarChar, value: d.batch_number } })
          .catch(() => { /* ignore */ });
      }
    }

    // 删除入库单明细 + 头
    await query(`DELETE FROM production_inbound_order_detail WHERE inbound_order_number = @ion`,
      { ion: { type: T.NVarChar, value: ion } });
    await query(`DELETE FROM production_inbound_order WHERE inbound_order_number = @ion`,
      { ion: { type: T.NVarChar, value: ion } });
  }

  // 3. 清理残留的库存流水（source_number = PON）
  const remainingTxns = await query<any>(
    `SELECT transaction_number FROM inventory_transaction WHERE source_number = @pon`,
    { pon: { type: T.NVarChar, value: productionOrderNumber } }
  );
  for (const t of remainingTxns) {
    await query(`DELETE FROM inventory_transaction_batch WHERE transaction_number = @tn`,
      { tn: { type: T.NVarChar, value: t.transaction_number } })
      .catch(() => { /* ignore */ });
  }
  if (remainingTxns.length > 0) {
    await query(`DELETE FROM inventory_transaction WHERE source_number = @pon`,
      { pon: { type: T.NVarChar, value: productionOrderNumber } });
  }

  // 4. 清理残留的成品批次库存
  const remainingBatches = await query<any>(
    `SELECT batch_number FROM finished_batch_inventory WHERE production_order_number = @pon`,
    { pon: { type: T.NVarChar, value: productionOrderNumber } }
  );
  for (const b of remainingBatches) {
    await query(`DELETE FROM inventory_transaction WHERE source_number = @bn`,
      { bn: { type: T.NVarChar, value: b.batch_number } })
      .catch(() => { /* ignore */ });
    await query(`DELETE FROM finished_batch_inventory WHERE batch_number = @bn`,
      { bn: { type: T.NVarChar, value: b.batch_number } });
  }

  // 5. 清理倒冲扣减日志
  const logs = await query<any>(
    `SELECT id, backflush_task_id, transaction_number FROM backflush_deduction_log WHERE production_order_number = @pon`,
    { pon: { type: T.NVarChar, value: productionOrderNumber } }
  );
  for (const log of logs) {
    if (log.transaction_number) {
      await query(`DELETE FROM material_inventory_transaction WHERE transaction_number = @tn`,
        { tn: { type: T.NVarChar, value: log.transaction_number } })
        .catch(() => { /* ignore */ });
    }
    if (log.backflush_task_id) {
      await query(`UPDATE backflush_task SET deducted_quantity = 0, deduction_status = N'待扣减' WHERE id = @id`,
        { id: { type: T.Int, value: log.backflush_task_id } })
        .catch(() => { /* ignore */ });
    }
    await query(`DELETE FROM backflush_deduction_log WHERE id = @id`,
      { id: { type: T.Int, value: log.id } })
      .catch(() => { /* ignore */ });
  }

  // 6. 清理批次追溯
  await query(`DELETE FROM batch_traceability WHERE production_order_number = @pon`,
    { pon: { type: T.NVarChar, value: productionOrderNumber } })
    .catch(() => { /* ignore */ });

  // 7. 重置生产单入库状态
  await query(
    `UPDATE production_order SET inbound_quantity = 0, inbound_status = N'未入库' WHERE production_order_number = @pon`,
    { pon: { type: T.NVarChar, value: productionOrderNumber } }
  );

  // 8. 重算成品汇总库存
  // 从 production_inbound_order 获取仓库号
  await resyncFinishedGoodsInventory(itemNumber, '01');

  return {
    inboundOrders: inboundOrders.length,
    transactions: remainingTxns.length,
    batches: remainingBatches.length,
    deductionLogs: logs.length
  };
}

/** 重算成品汇总库存（模拟 syncFinishedGoodsSummary 的SQL逻辑） */
export async function resyncFinishedGoodsInventory(itemNumber: string, warehouseNumber: string) {
  const T = TYPES;

  for (const qs of ['合格品', '不合格品']) {
    // 散装批次库存
    const batchSum = await query<any>(
      `SELECT ISNULL(SUM(quantity), 0) as total_qty FROM finished_batch_inventory
       WHERE item_number = @item AND warehouse_number = @wh AND quality_status = @qs AND status != N'冻结'`,
      { item: { type: T.NVarChar, value: itemNumber }, wh: { type: T.NVarChar, value: warehouseNumber }, qs: { type: T.NVarChar, value: qs } }
    );
    const batchQty = Number(batchSum[0]?.total_qty) || 0;

    // 箱装库存
    const boxSum = await query<any>(
      `SELECT ISNULL(SUM(total_quantity), 0) as total_qty FROM packing_box_inventory
       WHERE item_number = @item AND warehouse_number = @wh AND status = N'在库'`,
      { item: { type: T.NVarChar, value: itemNumber }, wh: { type: T.NVarChar, value: warehouseNumber } }
    );
    const boxQty = Number(boxSum[0]?.total_qty) || 0;

    const totalQty = batchQty + boxQty;

    const existing = await query<any>(
      `SELECT id FROM finished_goods_inventory
       WHERE item_number = @item AND warehouse_number = @wh AND quality_status = @qs`,
      { item: { type: T.NVarChar, value: itemNumber }, wh: { type: T.NVarChar, value: warehouseNumber }, qs: { type: T.NVarChar, value: qs } }
    );

    if (existing.length > 0) {
      await query(
        `UPDATE finished_goods_inventory SET quantity = @qty, last_updated = GETDATE() WHERE id = @id`,
        { qty: { type: T.Decimal, value: totalQty }, id: { type: T.Int, value: existing[0].id } }
      );
    }
  }
}

// ==================== 销售发票 ====================

/** 查询销售发票主表 */
export async function getSalesInvoice(invoiceNumber: string) {
  const rows = await query<any>(
    `SELECT invoice_number, invoice_code, invoice_no, invoice_type,
            customer_number, customer_name, invoice_title, tax_id,
            invoice_address, invoice_phone, bank_name, bank_account_number,
            invoice_date, tax_rate, amount_without_tax, tax_amount, amount_with_tax,
            currency_code, remark, approval_status, created_by, created_at, updated_at
     FROM sales_invoice WHERE invoice_number = @no`,
    { no: { type: T.NVarChar, value: invoiceNumber } }
  );
  return rows[0] || null;
}

/** 查询销售发票明细行 */
export async function getSalesInvoiceLines(invoiceNumber: string) {
  return await query<any>(
    `SELECT id, invoice_number, line_number, shipping_order_number, shipping_detail_id,
            sales_order_number, sales_detail_id, item_number, item_name,
            specifications, basic_unit, ship_quantity, invoice_quantity,
            unit_price, amount_without_tax, tax_rate, tax_amount, amount_with_tax, remark
     FROM sales_invoice_line WHERE invoice_number = @no ORDER BY line_number`,
    { no: { type: T.NVarChar, value: invoiceNumber } }
  );
}

/** 查询发货明细行开票状态 */
export async function getShippingDetailInvoiceStatus(detailId: number) {
  const rows = await query<any>(
    `SELECT id, invoice_status, quantity FROM shipping_order_detail WHERE id = @id`,
    { id: { type: T.Int, value: detailId } }
  );
  return rows[0] || null;
}

/** 查询销售订单明细行开票状态 */
export async function getSalesDetailInvoiceStatus(detailId: number) {
  const rows = await query<any>(
    `SELECT id, invoice_status, order_quantity FROM sales_order_detail WHERE id = @id`,
    { id: { type: T.Int, value: detailId } }
  );
  return rows[0] || null;
}

/** 清理销售发票数据 */
export async function cleanupSalesInvoiceData(invoiceNumbers: string[]) {
  let count = 0;
  for (const inv of invoiceNumbers) {
    await query(`DELETE FROM sales_invoice_line WHERE invoice_number = @no`, { no: { type: T.NVarChar, value: inv } });
    await query(`DELETE FROM sales_invoice WHERE invoice_number = @no`, { no: { type: T.NVarChar, value: inv } });
    count++;
  }
  return count;
}

// ==================== 备料退料补料与成本快照 DB 助手 ====================

/** 查询备料明细行（含已领量） */
export async function getMaterialPreparationDetails(preparationNumber: string) {
  return await query<any>(
    `SELECT id, preparation_number, line_number, material_number, material_name,
          required_quantity, issued_quantity, step_number, default_warehouse
   FROM material_preparation_detail
   WHERE preparation_number = @pn ORDER BY line_number`,
    { pn: { type: T.NVarChar, value: preparationNumber } }
  );
}

/** 查询领料单（含 source_type） */
export async function getMaterialIssueByNumber(issueNumber: string) {
  const rows = await query<any>(
    `SELECT issue_number, production_order_number, preparation_number,
            issue_status, source_type, total_issue_items, remark
     FROM material_issue WHERE issue_number = @id`,
    { id: { type: T.NVarChar, value: issueNumber } }
  );
  return rows[0];
}

/** 查询领料单明细 */
export async function getMaterialIssueDetails(issueNumber: string) {
  return await query<any>(
    `SELECT id, issue_number, line_number, material_number, material_name,
            actual_quantity, batch_number, step_number, default_warehouse
     FROM material_issue_detail WHERE issue_number = @id ORDER BY line_number`,
    { id: { type: T.NVarChar, value: issueNumber } }
  );
}

/** 查询退料单 */
export async function getMaterialReturnByNumber(returnNumber: string) {
  const rows = await query<any>(
    `SELECT return_number, production_order_number, preparation_number,
            issue_number, return_status, total_return_items, remark
     FROM material_return WHERE return_number = @id`,
    { id: { type: T.NVarChar, value: returnNumber } }
  );
  return rows[0];
}

/** 查询退料单明细 */
export async function getMaterialReturnDetails(returnNumber: string) {
  return await query<any>(
    `SELECT id, return_number, line_number, material_number, material_name,
            return_quantity, batch_number, step_number, default_warehouse
     FROM material_return_detail WHERE return_number = @id ORDER BY line_number`,
    { id: { type: T.NVarChar, value: returnNumber } }
  );
}

/** 查询生产单的材料成本快照 */
export async function getCostSnapshotsByOrder(orderNumber: string) {
  return await query<any>(
    `SELECT snapshot_number, production_order_number, preparation_number,
            issue_number, material_number, material_name,
            issued_quantity, standard_cost, material_cost,
            source_type, source_number, cost_list_number
     FROM production_material_cost_snapshot
     WHERE production_order_number = @id
     ORDER BY snapshot_number`,
    { id: { type: T.NVarChar, value: orderNumber } }
  );
}

/** 查询物料库存量 */
export async function getMaterialInventoryQty(itemNumber: string, warehouseNumber: string) {
  const rows = await query<any>(
    `SELECT quantity FROM material_inventory
     WHERE item_number = @item AND warehouse_number = @wh`,
    { item: { type: T.NVarChar, value: itemNumber }, wh: { type: T.NVarChar, value: warehouseNumber } }
  );
  return rows[0]?.quantity ? parseFloat(rows[0].quantity) : 0;
}

/** 查询备料单状态 */
export async function getMaterialPreparationStatus(preparationNumber: string) {
  const rows = await query<any>(
    `SELECT preparation_number, preparation_status FROM material_preparation
     WHERE preparation_number = @pn`,
    { pn: { type: T.NVarChar, value: preparationNumber } }
  );
  return rows[0]?.preparation_status;
}

/** 清理退料单数据 */
export async function cleanupMaterialReturns(returnNumbers: string[]) {
  let count = 0;
  for (const rn of returnNumbers) {
    await query(`DELETE FROM production_material_cost_snapshot WHERE source_number = @no AND source_type = N'退料'`, { no: { type: T.NVarChar, value: rn } });
    await query(`DELETE FROM material_return_detail WHERE return_number = @no`, { no: { type: T.NVarChar, value: rn } });
    await query(`DELETE FROM material_return WHERE return_number = @no`, { no: { type: T.NVarChar, value: rn } });
    count++;
  }
  return count;
}

// ==================== 仓库流水 DB 助手 ====================

/** 查询物料库存流水（按来源编号，含 source_type 过滤） */
export async function getInventoryTxnsBySource(sourceNumber: string, sourceType?: string) {
  const sql = sourceType
    ? `SELECT transaction_number, transaction_type, source_type, source_number,
              item_number, item_name, warehouse_number, warehouse_name,
              quantity, before_quantity, after_quantity, batch_number, operator, remark
       FROM material_inventory_transaction
       WHERE source_number = @sn AND source_type = @st
       ORDER BY transaction_number`
    : `SELECT transaction_number, transaction_type, source_type, source_number,
              item_number, item_name, warehouse_number, warehouse_name,
              quantity, before_quantity, after_quantity, batch_number, operator, remark
       FROM material_inventory_transaction
       WHERE source_number = @sn
       ORDER BY transaction_number`;
  const params: Record<string, { type: any; value: any }> = { sn: { type: T.NVarChar, value: sourceNumber } };
  if (sourceType) params.st = { type: T.NVarChar, value: sourceType };
  return await query<any>(sql, params);
}

/** 查询物料库存流水（按物料+仓库） */
export async function getInventoryTxnsByItem(itemNumber: string, warehouseNumber: string, sinceDate?: string) {
  const sql = sinceDate
    ? `SELECT transaction_number, transaction_type, source_type, source_number,
              item_number, item_name, warehouse_number, warehouse_name,
              quantity, before_quantity, after_quantity, batch_number, operator,
              operation_date, remark
       FROM material_inventory_transaction
       WHERE item_number = @item AND warehouse_number = @wh AND operation_date >= @since
       ORDER BY operation_date DESC, transaction_number DESC`
    : `SELECT TOP 50 transaction_number, transaction_type, source_type, source_number,
              item_number, item_name, warehouse_number, warehouse_name,
              quantity, before_quantity, after_quantity, batch_number, operator,
              operation_date, remark
       FROM material_inventory_transaction
       WHERE item_number = @item AND warehouse_number = @wh
       ORDER BY operation_date DESC, transaction_number DESC`;
  const params: Record<string, { type: any; value: any }> = {
    item: { type: T.NVarChar, value: itemNumber },
    wh: { type: T.NVarChar, value: warehouseNumber },
  };
  if (sinceDate) params.since = { type: T.NVarChar, value: sinceDate };
  return await query<any>(sql, params);
}

/** 查询线边仓流水（按来源编号） */
export async function getLinesideTxnsBySource(sourceNumber: string, sourceType?: string) {
  const sql = sourceType
    ? `SELECT transaction_number, transaction_type, source_type, source_number,
              production_order_number, item_number, item_name,
              step_number, work_center_name, quantity, direction, operator, remark
       FROM lineside_inventory_transaction
       WHERE source_number = @sn AND source_type = @st
       ORDER BY transaction_number`
    : `SELECT transaction_number, transaction_type, source_type, source_number,
              production_order_number, item_number, item_name,
              step_number, work_center_name, quantity, direction, operator, remark
       FROM lineside_inventory_transaction
       WHERE source_number = @sn
       ORDER BY transaction_number`;
  const params: Record<string, { type: any; value: any }> = { sn: { type: T.NVarChar, value: sourceNumber } };
  if (sourceType) params.st = { type: T.NVarChar, value: sourceType };
  return await query<any>(sql, params);
}

/** 查询线边仓流水（按生产单） */
export async function getLinesideTxnsByOrder(orderNumber: string) {
  return await query<any>(
    `SELECT transaction_number, transaction_type, source_type, source_number,
            production_order_number, item_number, item_name,
            step_number, work_center_name, quantity, direction, operator, remark
     FROM lineside_inventory_transaction
     WHERE production_order_number = @on
     ORDER BY transaction_number`,
    { on: { type: T.NVarChar, value: orderNumber } }
  );
}

/** 查询物料批次库存（含ID，去重用） */
export async function getMaterialBatchInventoryWithId(itemNumber: string, warehouseNumber: string) {
  return await query<any>(
    `SELECT id, batch_number, item_number, item_name, warehouse_number, warehouse_name,
            quantity, initial_quantity, status
     FROM material_batch_inventory
     WHERE item_number = @item AND warehouse_number = @wh AND status = N'正常'
     ORDER BY inbound_date`,
    { item: { type: T.NVarChar, value: itemNumber }, wh: { type: T.NVarChar, value: warehouseNumber } }
  );
}

/** 查询物料汇总库存记录 */
export async function getMaterialInventoryRecord(itemNumber: string, warehouseNumber: string) {
  const rows = await query<any>(
    `SELECT id, item_number, item_name, warehouse_number, warehouse_name, quantity, last_updated
     FROM material_inventory
     WHERE item_number = @item AND warehouse_number = @wh`,
    { item: { type: T.NVarChar, value: itemNumber }, wh: { type: T.NVarChar, value: warehouseNumber } }
  );
  return rows[0];
}

/** 查找可用的成品生产单（已审批+已派发+未入库+物料类型为成品+有工序） */
export async function findFinishedProductOrderForAutoInbound() {
  const rows = await query<{
    production_order_number: string; item_number: string; item_name: string;
    item_type: string; planned_quantity: number;
  }>(
    `SELECT TOP 1 po.production_order_number, po.item_number, po.item_name,
       im.item_type, po.planned_quantity
     FROM production_order po
     JOIN item_master im ON po.item_number = im.item_number
     WHERE po.approval_status = N'已审批'
       AND po.plan_status IN (N'已派发', N'已备料', N'生产中')
       AND im.item_type = N'成品'
       AND (po.inbound_status IS NULL OR po.inbound_status = N'未入库')
       AND EXISTS (SELECT 1 FROM process_task pt WHERE pt.production_order_number = po.production_order_number AND pt.approval_status = N'已审批')
     ORDER BY po.production_order_number DESC`
  );
  return rows[0] || null;
}

/** 查找可用的非成品生产单（已审批+已派发+未入库+物料类型非成品+有工序） */
export async function findNonFinishedProductOrderForAutoInbound() {
  const rows = await query<{
    production_order_number: string; item_number: string; item_name: string;
    item_type: string; planned_quantity: number;
  }>(
    `SELECT TOP 1 po.production_order_number, po.item_number, po.item_name,
       im.item_type, po.planned_quantity
     FROM production_order po
     JOIN item_master im ON po.item_number = im.item_number
     WHERE po.approval_status = N'已审批'
       AND po.plan_status IN (N'已派发', N'已备料', N'生产中')
       AND im.item_type != N'成品'
       AND (po.inbound_status IS NULL OR po.inbound_status = N'未入库')
       AND EXISTS (SELECT 1 FROM process_task pt WHERE pt.production_order_number = po.production_order_number AND pt.approval_status = N'已审批')
     ORDER BY po.production_order_number DESC`
  );
  return rows[0] || null;
}

/** 获取成品入库单详情 */
export async function getProductionInboundOrderDetailsByOrder(productionOrderNumber: string) {
  const rows = await query<any>(
    `SELECT * FROM production_inbound_order_detail WHERE production_order_number = @pon`,
    { pon: { type: T.NVarChar, value: productionOrderNumber } }
  );
  return rows;
}

/** 获取半成品入库单详情 */
export async function getSemiProductionInboundOrderDetailsByOrder(productionOrderNumber: string) {
  const rows = await query<any>(
    `SELECT * FROM semi_production_inbound_order_detail WHERE production_order_number = @pon`,
    { pon: { type: T.NVarChar, value: productionOrderNumber } }
  );
  return rows;
}

/** 获取成品入库单主表 */
export async function getProductionInboundOrderByNumber(inboundOrderNumber: string) {
  const rows = await query<any>(
    `SELECT * FROM production_inbound_order WHERE inbound_order_number = @ion`,
    { ion: { type: T.NVarChar, value: inboundOrderNumber } }
  );
  return rows[0] || null;
}

/** 获取半成品入库单主表 */
export async function getSemiProductionInboundOrderByNumber(inboundOrderNumber: string) {
  const rows = await query<any>(
    `SELECT * FROM semi_production_inbound_order WHERE inbound_order_number = @ion`,
    { ion: { type: T.NVarChar, value: inboundOrderNumber } }
  );
  return rows[0] || null;
}
