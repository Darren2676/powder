/**
 * 发货申请表迁移
 * - shipping_request + shipping_request_detail
 */

import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='shipping_request' AND xtype='U')
      CREATE TABLE shipping_request (
        request_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        customer_number NVARCHAR(50) DEFAULT '',
        customer_name NVARCHAR(200) DEFAULT '',
        request_date DATETIME DEFAULT GETDATE(),
        status NVARCHAR(20) DEFAULT N'待审核',
        remark NVARCHAR(500) DEFAULT '',
        creation_man NVARCHAR(100) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE()
      )
    `)
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='shipping_request_detail' AND xtype='U')
      CREATE TABLE shipping_request_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        request_number NVARCHAR(50) NOT NULL,
        line_number INT DEFAULT 10,
        sales_order_number NVARCHAR(50) DEFAULT '',
        sales_detail_id INT DEFAULT 0,
        item_number NVARCHAR(100) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        product_drawing_number NVARCHAR(100) DEFAULT '',
        order_quantity DECIMAL(18,4) DEFAULT 0,
        shipped_quantity DECIMAL(18,4) DEFAULT 0,
        ship_quantity DECIMAL(18,4) DEFAULT 0,
        delivery_date DATE NULL,
        remark NVARCHAR(500) DEFAULT ''
      )
    `)
  } catch (e) { console.log('shipping_request 表迁移跳过或已存在') }
}
