import sequelize from '../../config/database';

/**
 * 090: 采购发票表迁移
 * - purchase_invoice 主表
 * - purchase_invoice_line 明细表
 * - stock_in_detail 增加 invoice_status 字段
 * - purchase_order_detail 增加 invoice_status 字段
 */
export async function runMigration(): Promise<void> {
  // purchase_invoice 主表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'purchase_invoice')
      CREATE TABLE purchase_invoice (
        invoice_number NVARCHAR(30) NOT NULL PRIMARY KEY,
        invoice_code NVARCHAR(30) DEFAULT '',
        invoice_no NVARCHAR(30) DEFAULT '',
        invoice_type NVARCHAR(30) DEFAULT '',
        supplier_number NVARCHAR(50) DEFAULT '',
        supplier_name NVARCHAR(200) DEFAULT '',
        invoice_title NVARCHAR(200) DEFAULT '',
        tax_id NVARCHAR(30) DEFAULT '',
        invoice_address NVARCHAR(200) DEFAULT '',
        invoice_phone NVARCHAR(30) DEFAULT '',
        bank_name NVARCHAR(100) DEFAULT '',
        bank_account_number NVARCHAR(50) DEFAULT '',
        invoice_date DATE NULL,
        tax_rate DECIMAL(5,2) DEFAULT 0,
        amount_without_tax DECIMAL(18,2) DEFAULT 0,
        tax_amount DECIMAL(18,2) DEFAULT 0,
        amount_with_tax DECIMAL(18,2) DEFAULT 0,
        currency_code NVARCHAR(10) DEFAULT 'CNY',
        remark NVARCHAR(500) DEFAULT '',
        approval_status NVARCHAR(20) DEFAULT N'草稿',
        created_by NVARCHAR(50) DEFAULT '',
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('090: purchase_invoice 表已创建');
  } catch (e: any) { console.log('purchase_invoice 表迁移跳过:', e.message || e) }

  // purchase_invoice_line 明细表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'purchase_invoice_line')
      CREATE TABLE purchase_invoice_line (
        id INT IDENTITY(1,1) PRIMARY KEY,
        invoice_number NVARCHAR(30) NOT NULL,
        line_number INT DEFAULT 0,
        stock_in_number NVARCHAR(30) DEFAULT '',
        stock_in_detail_id INT DEFAULT 0,
        purchase_order_number NVARCHAR(30) DEFAULT '',
        purchase_detail_id INT DEFAULT 0,
        item_number NVARCHAR(100) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        stock_in_quantity DECIMAL(18,4) DEFAULT 0,
        invoice_quantity DECIMAL(18,4) DEFAULT 0,
        unit_price DECIMAL(18,4) DEFAULT 0,
        amount_without_tax DECIMAL(18,2) DEFAULT 0,
        tax_rate DECIMAL(5,2) DEFAULT 0,
        tax_amount DECIMAL(18,2) DEFAULT 0,
        amount_with_tax DECIMAL(18,2) DEFAULT 0,
        remark NVARCHAR(500) DEFAULT ''
      )
    `);
    console.log('090: purchase_invoice_line 表已创建');
  } catch (e: any) { console.log('purchase_invoice_line 表迁移跳过:', e.message || e) }

  // stock_in_detail 增加 invoice_status 字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'stock_in_detail' AND COLUMN_NAME = 'invoice_status')
      ALTER TABLE stock_in_detail ADD invoice_status NVARCHAR(20) DEFAULT N'未开票'
    `);
    console.log('090: stock_in_detail.invoice_status 字段已添加');
  } catch (e: any) { console.log('stock_in_detail.invoice_status 迁移跳过:', e.message || e) }

  // purchase_order_detail 增加 invoice_status 字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'purchase_order_detail' AND COLUMN_NAME = 'invoice_status')
      ALTER TABLE purchase_order_detail ADD invoice_status NVARCHAR(20) DEFAULT N'未开票'
    `);
    console.log('090: purchase_order_detail.invoice_status 字段已添加');
  } catch (e: any) { console.log('purchase_order_detail.invoice_status 迁移跳过:', e.message || e) }

  console.log('090: 采购发票表迁移完成');
}

// 直接运行此文件时执行
runMigration().then(() => process.exit(0)).catch(err => { console.error('090 迁移失败:', err); process.exit(1); });
