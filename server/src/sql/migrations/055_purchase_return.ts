/**
 * 采购退货/换货表迁移
 * - purchase_return 退货主表
 * - purchase_return_detail 退货明细表
 */

import sequelize from '../../config/database'

export async function up(): Promise<void> {
  await runMigration()
}

export async function runMigration(): Promise<void> {
  // 采购退货主表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_return' AND xtype='U')
      CREATE TABLE purchase_return (
        return_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        purchase_order_number NVARCHAR(50) DEFAULT '',
        supplier_number NVARCHAR(50) DEFAULT '',
        supplier_name NVARCHAR(200) DEFAULT '',
        return_type NVARCHAR(20) DEFAULT N'退货退款',
        return_reason NVARCHAR(200) DEFAULT '',
        warehouse_number NVARCHAR(50) DEFAULT '',
        warehouse_name NVARCHAR(200) DEFAULT '',
        approval_status NVARCHAR(20) DEFAULT N'草稿',
        return_status NVARCHAR(20) DEFAULT N'待退货',
        exchange_status NVARCHAR(20) DEFAULT N'待换货',
        total_return_quantity DECIMAL(18,4) DEFAULT 0,
        total_return_amount DECIMAL(18,4) DEFAULT 0,
        remark NVARCHAR(500) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE(),
        creation_man NVARCHAR(100) DEFAULT ''
      )
    `)
  } catch (e) { console.log('purchase_return 表迁移跳过或已存在') }

  // 采购退货明细表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_return_detail' AND xtype='U')
      CREATE TABLE purchase_return_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        return_number NVARCHAR(50) NOT NULL,
        line_number INT DEFAULT 10,
        purchase_detail_id INT DEFAULT 0,
        stock_in_number NVARCHAR(50) DEFAULT '',
        item_number NVARCHAR(100) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        received_quantity DECIMAL(18,4) DEFAULT 0,
        return_quantity DECIMAL(18,4) DEFAULT 0,
        unit_price DECIMAL(18,4) DEFAULT 0,
        return_amount DECIMAL(18,4) DEFAULT 0,
        exchange_quantity DECIMAL(18,4) DEFAULT 0,
        exchange_status NVARCHAR(20) DEFAULT N'待换货',
        remark NVARCHAR(500) DEFAULT ''
      )
    `)
  } catch (e) { console.log('purchase_return_detail 表迁移跳过或已存在') }

  console.log('采购退货表迁移完成')
}
