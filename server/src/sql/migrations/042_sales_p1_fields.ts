/**
 * P1 销售管理字段迁移
 * 1. shipping_order 增加 request_number 字段（关联发货申请）
 * 2. shipping_request_detail 增加 delivered_quantity 字段（追踪已发货数量）
 * 
 * 运行: npx ts-node src/sql/migrations/042_sales_p1_fields.ts
 */
import sequelize from '../../config/database';

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // 1. shipping_order 增加 request_number 字段
    await sequelize.query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'shipping_order' AND COLUMN_NAME = 'request_number'
      )
      BEGIN
        ALTER TABLE shipping_order ADD request_number NVARCHAR(50) DEFAULT '';
        CREATE INDEX IX_so_request_number ON shipping_order(request_number);
        PRINT 'shipping_order.request_number 字段添加成功';
      END
      ELSE
        PRINT 'shipping_order.request_number 已存在';
    `);

    // 2. shipping_request_detail 增加 delivered_quantity 字段
    await sequelize.query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'shipping_request_detail' AND COLUMN_NAME = 'delivered_quantity'
      )
      BEGIN
        ALTER TABLE shipping_request_detail ADD delivered_quantity DECIMAL(18,4) DEFAULT 0;
        PRINT 'shipping_request_detail.delivered_quantity 字段添加成功';
      END
      ELSE
        PRINT 'shipping_request_detail.delivered_quantity 已存在';
    `);

    // 3. 回填 delivered_quantity：基于现有已发货单数据计算
    await sequelize.query(`
      UPDATE srd SET srd.delivered_quantity = ISNULL(t.total_delivered, 0)
      FROM shipping_request_detail srd
      LEFT JOIN (
        SELECT sod.request_number, sod.sales_detail_id, SUM(sod.quantity) as total_delivered
        FROM shipping_order_detail sod
        INNER JOIN shipping_order so ON so.shipping_order_number = sod.shipping_order_number
        WHERE so.status != N'已取消'
        GROUP BY sod.request_number, sod.sales_detail_id
      ) t ON t.request_number = srd.request_number AND t.sales_detail_id = srd.sales_detail_id
    `);
    console.log('delivered_quantity 回填完成');

    console.log('P1 字段迁移全部完成');
  } catch (error) {
    console.error('迁移失败:', error);
  } finally {
    await sequelize.close();
  }
}

migrate();
