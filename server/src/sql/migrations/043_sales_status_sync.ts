/**
 * 销售订单状态闭环迁移
 * 1. production_status: '已加入计划' → '待排产' 重命名
 * 2. return_status: 基于 shipped_quantity / refunded_quantity 回填
 * 3. status(行状态): 基于 shipping_status 回填已完成
 * 4. production_status: 基于 production_order.plan_status 回填生产状态
 * 
 * 运行: npx ts-node src/sql/migrations/043_sales_status_sync.ts
 */
import sequelize from '../../config/database';

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // === 1. 将历史数据 '已加入计划' 更名为 '待排产' ===
    console.log('\n--- 步骤1: production_status 重命名 ---');
    const [r1]: any = await sequelize.query(`
      UPDATE sales_order_detail SET production_status = N'待排产'
      WHERE production_status = N'已加入计划'
    `);
    console.log(`  已加入计划 → 待排产: 影响 ${r1} 行`);

    // === 2. 基于现有 shipped_quantity / refunded_quantity 回填 return_status ===
    console.log('\n--- 步骤2: return_status 回填 ---');

    const [r2a]: any = await sequelize.query(`
      UPDATE sales_order_detail SET return_status = N'未退货'
      WHERE ISNULL(shipped_quantity, 0) > 0 AND ISNULL(refunded_quantity, 0) = 0
        AND return_status = N'未申请'
    `);
    console.log(`  未退货 (有发货无退货): 影响 ${r2a} 行`);

    const [r2b]: any = await sequelize.query(`
      UPDATE sales_order_detail SET return_status = N'部分退货'
      WHERE ISNULL(refunded_quantity, 0) > 0
        AND ISNULL(refunded_quantity, 0) < ISNULL(shipped_quantity, 0)
    `);
    console.log(`  部分退货: 影响 ${r2b} 行`);

    const [r2c]: any = await sequelize.query(`
      UPDATE sales_order_detail SET return_status = N'全部退货'
      WHERE ISNULL(refunded_quantity, 0) > 0
        AND ISNULL(refunded_quantity, 0) >= ISNULL(shipped_quantity, 0)
    `);
    console.log(`  全部退货: 影响 ${r2c} 行`);

    // === 3. 基于 shipping_status 回填行状态 ===
    console.log('\n--- 步骤3: status(行状态) 回填 ---');
    const [r3]: any = await sequelize.query(`
      UPDATE sales_order_detail SET status = N'已完成'
      WHERE shipping_status IN (N'全部发货', N'超额发货')
        AND status != N'已完成' AND status != N'已作废'
    `);
    console.log(`  已完成 (全部/超额发货): 影响 ${r3} 行`);

    // === 4. 基于 production_order.plan_status 回填 production_status ===
    console.log('\n--- 步骤4: production_status 回填(基于生产单) ---');

    // 生产完成
    const [r4a]: any = await sequelize.query(`
      UPDATE sod SET sod.production_status = N'生产完成'
      FROM sales_order_detail sod
      INNER JOIN Production_plan pp ON pp.source_order_number = sod.sales_order_number
        AND pp.source_line_number = sod.line_number
      INNER JOIN production_order po ON po.production_number = pp.production_number
      WHERE po.plan_status = N'已完成' AND sod.production_status NOT IN (N'生产完成')
    `);
    console.log(`  生产完成: 影响 ${r4a} 行`);

    // 生产中
    const [r4b]: any = await sequelize.query(`
      UPDATE sod SET sod.production_status = N'生产中'
      FROM sales_order_detail sod
      INNER JOIN Production_plan pp ON pp.source_order_number = sod.sales_order_number
        AND pp.source_line_number = sod.line_number
      INNER JOIN production_order po ON po.production_number = pp.production_number
      WHERE po.plan_status = N'生产中' AND sod.production_status NOT IN (N'生产中', N'生产完成')
    `);
    console.log(`  生产中: 影响 ${r4b} 行`);

    // 待生产 (已备料)
    const [r4c]: any = await sequelize.query(`
      UPDATE sod SET sod.production_status = N'待生产'
      FROM sales_order_detail sod
      INNER JOIN Production_plan pp ON pp.source_order_number = sod.sales_order_number
        AND pp.source_line_number = sod.line_number
      INNER JOIN production_order po ON po.production_number = pp.production_number
      WHERE po.plan_status = N'已备料' AND sod.production_status NOT IN (N'待生产', N'生产中', N'生产完成')
    `);
    console.log(`  待生产 (已备料): 影响 ${r4c} 行`);

    // 计划中 (已派发)
    const [r4d]: any = await sequelize.query(`
      UPDATE sod SET sod.production_status = N'计划中'
      FROM sales_order_detail sod
      INNER JOIN Production_plan pp ON pp.source_order_number = sod.sales_order_number
        AND pp.source_line_number = sod.line_number
      INNER JOIN production_order po ON po.production_number = pp.production_number
      WHERE po.plan_status = N'已派发' AND sod.production_status NOT IN (N'计划中', N'待生产', N'生产中', N'生产完成')
    `);
    console.log(`  计划中 (已派发): 影响 ${r4d} 行`);

    // === 5. 订单头状态汇总 ===
    console.log('\n--- 步骤5: order_status 汇总 ---');
    const [r5]: any = await sequelize.query(`
      UPDATE so SET so.order_status = N'已完成'
      FROM sales_order so
      WHERE so.order_status NOT IN (N'已完成', N'已取消')
        AND NOT EXISTS (
          SELECT 1 FROM sales_order_detail sod
          WHERE sod.sales_order_number = so.sales_order_number
            AND sod.status NOT IN (N'已完成', N'已作废')
        )
        AND EXISTS (
          SELECT 1 FROM sales_order_detail sod2
          WHERE sod2.sales_order_number = so.sales_order_number
        )
    `);
    console.log(`  订单已完成: 影响 ${r5} 行`);

    console.log('\n迁移完成！');
    process.exit(0);
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
