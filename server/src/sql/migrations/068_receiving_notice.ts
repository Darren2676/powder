/**
 * 068: 采购收货通知表
 * - purchase_receiving_notice 主表
 * - purchase_receiving_notice_detail 明细表
 */
import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  // 收货通知主表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_receiving_notice' AND xtype='U')
      CREATE TABLE purchase_receiving_notice (
        receiving_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        purchase_order_number NVARCHAR(50) NOT NULL DEFAULT '',
        supplier_number NVARCHAR(50) DEFAULT '',
        supplier_name NVARCHAR(200) DEFAULT '',
        delivery_note NVARCHAR(100) DEFAULT '',
        receiving_date DATE NULL,
        operator NVARCHAR(100) DEFAULT '',
        approval_status NVARCHAR(20) DEFAULT N'待确认',
        remark NVARCHAR(500) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE(),
        creation_man NVARCHAR(100) DEFAULT ''
      )
    `)

    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_receiving_notice_detail' AND xtype='U')
      CREATE TABLE purchase_receiving_notice_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        receiving_number NVARCHAR(50) NOT NULL,
        line_number INT DEFAULT 10,
        purchase_order_number NVARCHAR(50) DEFAULT '',
        purchase_detail_id INT DEFAULT 0,
        item_number NVARCHAR(100) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        order_quantity DECIMAL(18,4) DEFAULT 0,
        received_quantity DECIMAL(18,4) DEFAULT 0,
        receiving_quantity DECIMAL(18,4) DEFAULT 0,
        qualified_quantity DECIMAL(18,4) DEFAULT 0,
        unqualified_quantity DECIMAL(18,4) DEFAULT 0,
        batch_number NVARCHAR(50) DEFAULT '',
        remark NVARCHAR(500) DEFAULT ''
      )
    `)

    console.log('purchase_receiving_notice 表迁移成功')
  } catch (e) { console.log('purchase_receiving_notice 表迁移跳过或已存在:', (e as any)?.message) }
}

// 直接运行时执行
runMigration().then(() => process.exit(0)).catch(err => { console.error('068 迁移失败:', err); process.exit(1); });
