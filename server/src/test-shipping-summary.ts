import sequelize from './config/database';

async function test() {
  try {
    // Test count query
    const countResult: any = await sequelize.query(`
      SELECT COUNT(*) as total
      FROM sales_order so
      INNER JOIN sales_order_detail sod ON sod.sales_order_number = so.sales_order_number
      WHERE so.approval_status = N'已审批'
        AND sod.status NOT IN (N'已取消')
        AND so.order_date >= :start_date AND so.order_date < DATEADD(day, 1, CAST(:end_date AS DATE))
    `, { replacements: { start_date: '2025-01-01', end_date: '2026-03-31' } });

    console.log('countResult type:', typeof countResult, Array.isArray(countResult));
    console.log('countResult:', JSON.stringify(countResult, null, 2));
    console.log('countResult[0]:', countResult[0]);
    console.log('countResult[0] type:', typeof countResult[0], Array.isArray(countResult[0]));

    if (Array.isArray(countResult[0])) {
      console.log('countResult[0][0]:', countResult[0][0]);
      console.log('total:', countResult[0][0]?.total);
    } else {
      console.log('total:', countResult[0]?.total);
    }

    // Test main query
    const items: any = await sequelize.query(`
      SELECT TOP 3
        so.sales_order_number,
        so.customer_name,
        sod.line_number,
        sod.item_number,
        sod.order_quantity,
        ISNULL(shipped_sub.shipped_qty, 0) as shipped_qty
      FROM sales_order so
      INNER JOIN sales_order_detail sod ON sod.sales_order_number = so.sales_order_number
      OUTER APPLY (
        SELECT SUM(sd.quantity) as shipped_qty
        FROM shipping_order_detail sd
        INNER JOIN shipping_order sh ON sh.shipping_order_number = sd.shipping_order_number
        WHERE sd.sales_detail_id = sod.id
      ) shipped_sub
      WHERE so.approval_status = N'已审批'
        AND sod.status NOT IN (N'已取消')
    `);

    console.log('\nitems type:', typeof items, Array.isArray(items));
    console.log('items length:', items.length);
    console.log('items[0] type:', typeof items[0], Array.isArray(items[0]));
    console.log('first row:', JSON.stringify(Array.isArray(items[0]) ? items[0][0] : items[0], null, 2));

    process.exit(0);
  } catch (err) {
    console.error('Test failed:', err);
    process.exit(1);
  }
}

test();
