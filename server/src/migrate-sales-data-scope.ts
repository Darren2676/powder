/**
 * 销售数据范围权限迁移脚本
 * 1. customer 表新增 head_of_sales_id (外键指向 users.id)
 * 2. sales_order 表新增 head_of_sales_id
 * 3. 根据 head_of_sales 文本字段回填 head_of_sales_id
 * 4. 新增 sales 角色
 */
import { Sequelize } from 'sequelize';
import sequelize from './config/database';

async function migrate() {
  console.log('===== 销售数据范围权限迁移开始 =====');

  // 1. customer 表新增 head_of_sales_id
  try {
    await sequelize.query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'customer' AND COLUMN_NAME = 'head_of_sales_id'
      )
      ALTER TABLE customer ADD head_of_sales_id INT NULL;
    `);
    console.log('  customer.head_of_sales_id 字段已添加');
  } catch (e: any) {
    console.log('  customer.head_of_sales_id 字段可能已存在:', e.message);
  }

  // 2. sales_order 表新增 head_of_sales_id
  try {
    await sequelize.query(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'sales_order' AND COLUMN_NAME = 'head_of_sales_id'
      )
      ALTER TABLE sales_order ADD head_of_sales_id INT NULL;
    `);
    console.log('  sales_order.head_of_sales_id 字段已添加');
  } catch (e: any) {
    console.log('  sales_order.head_of_sales_id 字段可能已存在:', e.message);
  }

  // 3. 数据回填：根据 head_of_sales 文本匹配 users.real_name
  const [custResult]: any = await sequelize.query(`
    UPDATE c SET c.head_of_sales_id = u.id
    FROM customer c
    INNER JOIN users u ON u.real_name = c.head_of_sales
    WHERE c.head_of_sales IS NOT NULL AND c.head_of_sales <> '' AND c.head_of_sales_id IS NULL;
  `);
  console.log('  customer 回填完成');

  const [orderResult]: any = await sequelize.query(`
    UPDATE so SET so.head_of_sales_id = c.head_of_sales_id
    FROM sales_order so
    INNER JOIN customer c ON c.customer_number = so.customer_number
    WHERE c.head_of_sales_id IS NOT NULL AND so.head_of_sales_id IS NULL;
  `);
  console.log('  sales_order 回填完成');

  // 4. 新增 sales 角色
  const [existingSalesRole]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM role WHERE role_code = 'sales'`
  );
  if (existingSalesRole[0].cnt === 0) {
    await sequelize.query(`
      INSERT INTO role (role_name, role_code, description, is_system, sort_order)
      VALUES (N'销售人员', 'sales', N'仅可查看自己负责的客户及销售数据', 1, 4);
    `);
    console.log('  sales 角色已创建');

    // 为 sales 角色分配与 staff 相同的权限
    const [staffRole]: any = await sequelize.query(
      `SELECT id FROM role WHERE role_code = 'staff'`
    );
    const [salesRole]: any = await sequelize.query(
      `SELECT id FROM role WHERE role_code = 'sales'`
    );
    if (staffRole.length && salesRole.length) {
      await sequelize.query(`
        INSERT INTO role_permission (role_id, permission_id)
        SELECT :salesRid, permission_id
        FROM role_permission
        WHERE role_id = :staffRid
        AND permission_id NOT IN (
          SELECT permission_id FROM role_permission WHERE role_id = :salesRid
        );
      `, { replacements: { salesRid: salesRole[0].id, staffRid: staffRole[0].id } });
      console.log('  sales 角色权限已同步（与 staff 一致）');
    }
  } else {
    console.log('  sales 角色已存在，跳过');
  }

  console.log('===== 迁移完成 =====');
  process.exit(0);
}

migrate().catch(err => {
  console.error('迁移失败:', err);
  process.exit(1);
});
