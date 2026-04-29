/**
 * 主数据域字段迁移
 * - mfg_bom_header.mould_number, mfg_bom_mould_mapping
 * - item_master: safety_stock/creation_date/purchase_lead_time
 * - 基础数据表 approval_status 字段
 * - employee: department + status
 * - storage_location + warehouse_manager
 * - warehouse 新字段
 * - customer 新字段 + address + attachment
 * - supplier 新字段 + address + attachment
 * - logistics_company + attachment
 * - defect_reason + defect_class + defect
 * - stock_count + detail + 时间字段
 * - return_order_detail: qualified_qty/unqualified_qty
 * - outsourcing_order
 * - item_attachment
 * - accounting_period
 * - routing_detail_material + is_backflush
 * - routing_detail + process_task 检验配置/统一检验/附件/技术要求/备注
 * - production_inspection + item
 * - routing_header bom_number/is_primary
 * - 菜单权限迁移
 */

import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  // mfg_bom_header 增加 mould_number 字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'mfg_bom_header' AND COLUMN_NAME = 'mould_number')
      BEGIN
        ALTER TABLE mfg_bom_header ADD mould_number NVARCHAR(50) NULL
      END
    `)
  } catch (e) { console.log('mfg_bom_header mould_number 字段迁移跳过或已存在') }

  // mfg_bom_mould_mapping 模具BOM映射表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='mfg_bom_mould_mapping' AND xtype='U')
      CREATE TABLE mfg_bom_mould_mapping (
        id INT IDENTITY(1,1) PRIMARY KEY,
        item_number NVARCHAR(50) NOT NULL,
        mould_number NVARCHAR(50) NOT NULL,
        mfg_bom_number NVARCHAR(50) NOT NULL,
        is_default BIT DEFAULT 0,
        approval_status NVARCHAR(20) DEFAULT '未审核',
        creation_date DATETIME DEFAULT GETDATE()
      )
    `)
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_bom_mould_unique' AND object_id=OBJECT_ID('mfg_bom_mould_mapping'))
      CREATE UNIQUE INDEX idx_bom_mould_unique ON mfg_bom_mould_mapping(item_number, mould_number)
    `)
    try {
      await sequelize.query(`
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE name='approval_status' AND object_id=OBJECT_ID('mfg_bom_mould_mapping'))
        ALTER TABLE mfg_bom_mould_mapping ADD approval_status NVARCHAR(20) DEFAULT '未审核'
      `)
    } catch (colErr) { /* ignore */ }
  } catch (e) { console.log('mfg_bom_mould_mapping 表迁移跳过或已存在') }

  // item_master 增加安全库存字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'item_master' AND COLUMN_NAME = 'safety_stock_enabled')
        ALTER TABLE item_master ADD safety_stock_enabled NVARCHAR(10) DEFAULT N'N';
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'item_master' AND COLUMN_NAME = 'safety_stock_qty')
        ALTER TABLE item_master ADD safety_stock_qty DECIMAL(18,4) DEFAULT 0
    `)
  } catch (e) { console.log('item_master 安全库存字段迁移跳过或已存在') }

  // item_master 增加 creation_date 字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'item_master' AND COLUMN_NAME = 'creation_date')
      BEGIN
        ALTER TABLE item_master ADD creation_date DATETIME NULL
      END
    `)
    await sequelize.query(`UPDATE item_master SET creation_date = GETDATE() WHERE creation_date IS NULL`)
  } catch (e: any) { console.log('item_master creation_date 迁移跳过:', e.message || e) }

  // item_master 增加 purchase_lead_time_days 字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'item_master' AND COLUMN_NAME = 'purchase_lead_time_days')
      BEGIN
        ALTER TABLE item_master ADD purchase_lead_time_days INT NULL DEFAULT 0
      END
    `)
  } catch (e: any) { console.log('item_master purchase_lead_time_days 迁移跳过:', e.message || e) }

  // defect_reason 缺陷原因表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='defect_reason' AND xtype='U')
      CREATE TABLE defect_reason (
        defect_reason_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        defect_reason_name NVARCHAR(200) DEFAULT '',
        remark NVARCHAR(500) DEFAULT ''
      )
    `)
  } catch (e) { console.log('defect_reason 表迁移跳过或已存在') }

  // defect_reason 列名修正
  try {
    await sequelize.query(`
      IF EXISTS (
        SELECT * FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_NAME = 'defect_reason' AND COLUMN_NAME = 'defect_reason'
      )
      EXEC sp_rename 'defect_reason.defect_reason', 'defect_reason_name', 'COLUMN'
    `)
  } catch (e) { console.log('defect_reason 列名修正跳过或已完成') }

  // defect_class 缺陷分类表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='defect_class' AND xtype='U')
      CREATE TABLE defect_class (
        defect_class_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        defect_class_name NVARCHAR(200) DEFAULT ''
      )
    `)
  } catch (e) { console.log('defect_class 表迁移跳过或已存在') }

  // defect 缺陷管理表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='defect' AND xtype='U')
      CREATE TABLE defect (
        defect_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        defect_name NVARCHAR(200) DEFAULT '',
        defect_class_number NVARCHAR(50) DEFAULT '',
        defect_class_name NVARCHAR(200) DEFAULT '',
        defect_reason_name NVARCHAR(200) DEFAULT '',
        defect_level NVARCHAR(50) DEFAULT ''
      )
    `)
  } catch (e) { console.log('defect 表迁移跳过或已存在') }

  // stock_count 盘点单
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='stock_count' AND xtype='U')
      BEGIN
        CREATE TABLE stock_count (
          id INT IDENTITY(1,1) PRIMARY KEY,
          count_number NVARCHAR(30) NOT NULL,
          count_period NVARCHAR(7) NOT NULL,
          warehouse_number NVARCHAR(50) NOT NULL,
          warehouse_name NVARCHAR(200) DEFAULT '',
          count_type NVARCHAR(20) NOT NULL,
          status NVARCHAR(20) DEFAULT N'盘点中',
          total_items INT DEFAULT 0,
          total_batches INT DEFAULT 0,
          matched_batches INT DEFAULT 0,
          surplus_batches INT DEFAULT 0,
          shortage_batches INT DEFAULT 0,
          total_surplus_qty DECIMAL(18,4) DEFAULT 0,
          total_shortage_qty DECIMAL(18,4) DEFAULT 0,
          count_man NVARCHAR(100) DEFAULT '',
          count_date DATETIME DEFAULT GETDATE(),
          reviewer NVARCHAR(100) DEFAULT '',
          review_date DATETIME NULL,
          review_remark NVARCHAR(500) DEFAULT '',
          confirmed_by NVARCHAR(100) DEFAULT '',
          confirmed_date DATETIME NULL,
          confirm_remark NVARCHAR(500) DEFAULT '',
          remark NVARCHAR(500) DEFAULT '',
          creation_date DATETIME DEFAULT GETDATE(),
          last_updated DATETIME DEFAULT GETDATE(),
          CONSTRAINT UQ_stock_count_number UNIQUE (count_number)
        );
        CREATE INDEX IX_stock_count_warehouse ON stock_count(warehouse_number, count_period);
        CREATE INDEX IX_stock_count_status ON stock_count(status);
      END
    `)
  } catch (e) { console.log('stock_count 表迁移跳过或已存在') }

  // stock_count_detail 盘点单明细
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='stock_count_detail' AND xtype='U')
      BEGIN
        CREATE TABLE stock_count_detail (
          id INT IDENTITY(1,1) PRIMARY KEY,
          count_number NVARCHAR(30) NOT NULL,
          line_number INT NOT NULL,
          item_number NVARCHAR(100) NOT NULL,
          item_name NVARCHAR(200) DEFAULT '',
          specifications NVARCHAR(200) DEFAULT '',
          basic_unit NVARCHAR(50) DEFAULT '',
          product_drawing_number NVARCHAR(100) DEFAULT '',
          batch_number NVARCHAR(50) NOT NULL,
          batch_inventory_id INT DEFAULT 0,
          system_quantity DECIMAL(18,4) DEFAULT 0,
          actual_quantity DECIMAL(18,4) NULL,
          difference_quantity DECIMAL(18,4) DEFAULT 0,
          count_status NVARCHAR(20) DEFAULT N'未盘',
          production_order_number NVARCHAR(50) DEFAULT '',
          inbound_date DATETIME NULL,
          remark NVARCHAR(200) DEFAULT ''
        );
        CREATE UNIQUE INDEX UQ_stock_count_detail_line ON stock_count_detail(count_number, line_number);
        CREATE INDEX IX_stock_count_detail_item ON stock_count_detail(item_number);
        CREATE INDEX IX_stock_count_detail_batch ON stock_count_detail(batch_number);
      END
    `)
  } catch (e) { console.log('stock_count_detail 表迁移跳过或已存在') }

  // stock_count created_time/completed_time 字段
  try {
    const scFields = [
      { col: 'created_time', def: 'DATETIME NULL' },
      { col: 'completed_time', def: 'DATETIME NULL' }
    ]
    for (const f of scFields) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'stock_count' AND COLUMN_NAME = '${f.col}')
        BEGIN
          ALTER TABLE stock_count ADD ${f.col} ${f.def}
        END
      `)
    }
    await sequelize.query(`UPDATE stock_count SET created_time = creation_date WHERE created_time IS NULL`)
  } catch (e) { console.log('stock_count 时间字段迁移跳过或已存在') }

  // return_order_detail qualified_qty / unqualified_qty
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'return_order_detail' AND COLUMN_NAME = 'qualified_qty')
        ALTER TABLE return_order_detail ADD qualified_qty DECIMAL(18,4) DEFAULT 0;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'return_order_detail' AND COLUMN_NAME = 'unqualified_qty')
        ALTER TABLE return_order_detail ADD unqualified_qty DECIMAL(18,4) DEFAULT 0
    `)
  } catch (e) { console.log('return_order_detail qty列迁移跳过或已存在') }

  // 基础数据表增加 approval_status 字段
  try {
    const approvalTables = ['customer', 'supplier', 'employee', 'logistics_company', 'schedules', 'team', 'workshop', 'productionline', 'warehouse', 'storage_location', 'unit', 'item_master', 'materia_property', 'material_class', 'product_class', 'standard_process', 'work_center', 'customer_material_mapping', 'defect_reason', 'defect_class', 'defect', 'quality_characteristic', 'inspection_spec', 'incoming_inspect_spec', 'inspection_plan', 'incoming_inspect_plan', 'equipment', 'mould']
    for (const tbl of approvalTables) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tbl}' AND COLUMN_NAME = 'approval_status')
        ALTER TABLE [${tbl}] ADD approval_status NVARCHAR(20) DEFAULT N'未审核'
      `)
    }
    for (const tbl of approvalTables) {
      await sequelize.query(`UPDATE [${tbl}] SET approval_status = N'未审核' WHERE approval_status IS NULL OR LTRIM(RTRIM(approval_status)) = ''`)
    }
  } catch (e) { console.log('approval_status 迁移跳过或已存在') }

  // employee status 字段
  try {
    const [cols]: any = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'employee' AND COLUMN_NAME = 'status'`
    )
    if (cols.length === 0) {
      await sequelize.query(`ALTER TABLE [employee] ADD [status] NVARCHAR(20) NOT NULL DEFAULT N'未激活'`)
    }
  } catch (e) { console.log('employee status 迁移跳过或已存在') }

  // employee department 列
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('employee') AND name = 'department')
      BEGIN
        ALTER TABLE employee ADD department NVARCHAR(100) NULL DEFAULT ''
      END
    `)
  } catch (e) { console.log('employee department 列迁移跳过或已存在') }

  // storage_location 库位管理表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='storage_location' AND xtype='U')
      CREATE TABLE storage_location (
        id INT IDENTITY(1,1) PRIMARY KEY,
        location_number NVARCHAR(50) NOT NULL,
        location_name NVARCHAR(200) DEFAULT '',
        warehouse_name NVARCHAR(200) DEFAULT '',
        zone NVARCHAR(50) DEFAULT '',
        cabinet NVARCHAR(50) DEFAULT '',
        layer NVARCHAR(50) DEFAULT '',
        grid NVARCHAR(50) DEFAULT '',
        location_column NVARCHAR(50) DEFAULT '',
        is_default NVARCHAR(10) DEFAULT N'否',
        created_by NVARCHAR(100) DEFAULT '',
        updated_by NVARCHAR(100) DEFAULT '',
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE(),
        CONSTRAINT UQ_storage_location_number UNIQUE (location_number)
      )
    `)
  } catch (e) { console.log('storage_location 表迁移跳过或已存在') }

  // storage_location 增加 warehouse_number 字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'storage_location' AND COLUMN_NAME = 'warehouse_number')
      ALTER TABLE storage_location ADD warehouse_number NVARCHAR(50) DEFAULT ''
    `)
  } catch (e) { console.log('storage_location warehouse_number 迁移跳过或已存在') }

  // warehouse 新字段
  try {
    const warehouseNewCols = [
      { name: 'supplier_number', type: 'NVARCHAR(50)', def: "''" },
      { name: 'customer_number', type: 'NVARCHAR(50)', def: "''" },
      { name: 'enable_location', type: 'NVARCHAR(10)', def: "N'否'" },
      { name: 'default_location', type: 'NVARCHAR(50)', def: "''" },
      { name: 'is_system_warehouse', type: 'NVARCHAR(10)', def: "N'否'" },
      { name: 'is_in_balance', type: 'NVARCHAR(10)', def: "N'是'" },
      { name: 'remark', type: 'NVARCHAR(500)', def: "''" },
      { name: 'last_updater', type: 'NVARCHAR(100)', def: "''" },
      { name: 'last_updated_at', type: 'DATETIME', def: 'NULL' }
    ]
    for (const col of warehouseNewCols) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'warehouse' AND COLUMN_NAME = '${col.name}')
        ALTER TABLE warehouse ADD ${col.name} ${col.type} DEFAULT ${col.def}
      `)
    }
    await sequelize.query(`UPDATE warehouse SET enable_location = N'否' WHERE enable_location IS NULL OR LTRIM(RTRIM(enable_location)) = ''`)
  } catch (e) { console.log('warehouse 新字段迁移跳过或已存在') }

  // warehouse_manager 子表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='warehouse_manager' AND xtype='U')
      BEGIN
        CREATE TABLE warehouse_manager (
          id INT IDENTITY(1,1) PRIMARY KEY,
          warehouse_number NVARCHAR(50) NOT NULL,
          manager_name NVARCHAR(100) NOT NULL,
          created_at DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX IX_warehouse_manager_wh ON warehouse_manager(warehouse_number);
      END
    `)
  } catch (e) { console.log('warehouse_manager 表迁移跳过或已存在') }

  // customer 新字段
  try {
    const customerNewCols = [
      { name: 'condition', type: 'NVARCHAR(20)', def: "N'启用'" },
      { name: 'created_by', type: 'NVARCHAR(100)', def: "''" },
      { name: 'created_at', type: 'DATETIME', def: 'GETDATE()' },
      { name: 'updated_at', type: 'DATETIME', def: 'GETDATE()' }
    ]
    for (const col of customerNewCols) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'customer' AND COLUMN_NAME = '${col.name}')
        ALTER TABLE customer ADD ${col.name} ${col.type} DEFAULT ${col.def}
      `)
    }
    await sequelize.query(`UPDATE customer SET condition = N'启用' WHERE condition IS NULL OR LTRIM(RTRIM(condition)) = ''`)
  } catch (e) { console.log('customer 新字段迁移跳过或已存在') }

  // customer_address 子表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='customer_address' AND xtype='U')
      BEGIN
        CREATE TABLE customer_address (
          id INT IDENTITY(1,1) PRIMARY KEY,
          customer_number NVARCHAR(50) NOT NULL,
          address_type NVARCHAR(50) DEFAULT N'公司地址',
          region NVARCHAR(200) DEFAULT '',
          detail_address NVARCHAR(500) DEFAULT '',
          receiver NVARCHAR(100) DEFAULT '',
          mobile NVARCHAR(50) DEFAULT '',
          telephone NVARCHAR(50) DEFAULT '',
          fax NVARCHAR(50) DEFAULT '',
          created_at DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX IX_customer_address_cust ON customer_address(customer_number);
      END
    `)
  } catch (e) { console.log('customer_address 表迁移跳过或已存在') }

  // customer_attachment 子表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='customer_attachment' AND xtype='U')
      BEGIN
        CREATE TABLE customer_attachment (
          id INT IDENTITY(1,1) PRIMARY KEY,
          customer_number NVARCHAR(50) NOT NULL,
          file_name NVARCHAR(200) NOT NULL,
          file_path NVARCHAR(500) NOT NULL,
          file_size INT DEFAULT 0,
          uploaded_by NVARCHAR(100) DEFAULT '',
          uploaded_at DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX IX_customer_attachment_cust ON customer_attachment(customer_number);
      END
    `)
  } catch (e) { console.log('customer_attachment 表迁移跳过或已存在') }

  // supplier 新字段
  try {
    const supplierNewCols = [
      { name: 'classification', type: 'NVARCHAR(50)', def: "''" },
      { name: 'country', type: 'NVARCHAR(100)', def: "''" },
      { name: 'currency_code', type: 'NVARCHAR(20)', def: "''" },
      { name: 'purchase_tax_rate', type: 'DECIMAL(18,4)', def: '0' },
      { name: 'industry', type: 'NVARCHAR(100)', def: "''" },
      { name: 'supplier_manager', type: 'NVARCHAR(100)', def: "''" },
      { name: 'region', type: 'NVARCHAR(200)', def: "''" },
      { name: 'zip_code', type: 'NVARCHAR(20)', def: "''" },
      { name: 'mobile', type: 'NVARCHAR(50)', def: "''" },
      { name: 'fax', type: 'NVARCHAR(50)', def: "''" },
      { name: 'email', type: 'NVARCHAR(100)', def: "''" },
      { name: 'contact_remark', type: 'NVARCHAR(500)', def: "''" },
      { name: 'bank_account_name', type: 'NVARCHAR(200)', def: "''" },
      { name: 'bank_name', type: 'NVARCHAR(200)', def: "''" },
      { name: 'bank_account_number', type: 'NVARCHAR(100)', def: "''" },
      { name: 'invoice_address', type: 'NVARCHAR(500)', def: "''" },
      { name: 'invoice_phone', type: 'NVARCHAR(50)', def: "''" },
      { name: 'invoice_title', type: 'NVARCHAR(200)', def: "''" },
      { name: 'tax_id', type: 'NVARCHAR(100)', def: "''" },
      { name: 'payment_terms', type: 'NVARCHAR(100)', def: "''" },
      { name: 'condition', type: 'NVARCHAR(20)', def: "N'启用'" },
      { name: 'created_by', type: 'NVARCHAR(100)', def: "''" },
      { name: 'created_at', type: 'DATETIME', def: 'GETDATE()' },
      { name: 'updated_at', type: 'DATETIME', def: 'GETDATE()' }
    ]
    for (const col of supplierNewCols) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'supplier' AND COLUMN_NAME = '${col.name}')
        ALTER TABLE supplier ADD ${col.name} ${col.type} DEFAULT ${col.def}
      `)
    }
    await sequelize.query(`UPDATE supplier SET condition = N'启用' WHERE condition IS NULL OR LTRIM(RTRIM(condition)) = ''`)
  } catch (e) { console.log('supplier 新字段迁移跳过或已存在') }

  // supplier_address 子表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='supplier_address' AND xtype='U')
      BEGIN
        CREATE TABLE supplier_address (
          id INT IDENTITY(1,1) PRIMARY KEY,
          supplier_number NVARCHAR(50) NOT NULL,
          address_type NVARCHAR(50) DEFAULT N'公司地址',
          region NVARCHAR(200) DEFAULT '',
          detail_address NVARCHAR(500) DEFAULT '',
          contact_person NVARCHAR(100) DEFAULT '',
          mobile NVARCHAR(50) DEFAULT '',
          telephone NVARCHAR(50) DEFAULT '',
          fax NVARCHAR(50) DEFAULT '',
          created_at DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX IX_supplier_address_sup ON supplier_address(supplier_number);
      END
    `)
  } catch (e) { console.log('supplier_address 表迁移跳过或已存在') }

  // supplier_attachment 子表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='supplier_attachment' AND xtype='U')
      BEGIN
        CREATE TABLE supplier_attachment (
          id INT IDENTITY(1,1) PRIMARY KEY,
          supplier_number NVARCHAR(50) NOT NULL,
          file_name NVARCHAR(200) NOT NULL,
          file_path NVARCHAR(500) NOT NULL,
          file_size INT DEFAULT 0,
          uploaded_by NVARCHAR(100) DEFAULT '',
          uploaded_at DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX IX_supplier_attachment_sup ON supplier_attachment(supplier_number);
      END
    `)
  } catch (e) { console.log('supplier_attachment 表迁移跳过或已存在') }

  // logistics_company 主表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='logistics_company' AND xtype='U')
      BEGIN
        CREATE TABLE logistics_company (
          id INT IDENTITY(1,1) PRIMARY KEY,
          company_number NVARCHAR(50) NOT NULL UNIQUE,
          company_name NVARCHAR(200) NOT NULL,
          contact_person NVARCHAR(100) DEFAULT '',
          mobile NVARCHAR(50) DEFAULT '',
          telephone NVARCHAR(50) DEFAULT '',
          remark NVARCHAR(MAX) DEFAULT '',
          condition NVARCHAR(20) DEFAULT N'启用',
          created_by NVARCHAR(100) DEFAULT '',
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX IX_logistics_company_number ON logistics_company(company_number);
      END
    `)
  } catch (e) { console.log('logistics_company 表迁移跳过或已存在') }

  // logistics_company_attachment 子表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='logistics_company_attachment' AND xtype='U')
      BEGIN
        CREATE TABLE logistics_company_attachment (
          id INT IDENTITY(1,1) PRIMARY KEY,
          company_number NVARCHAR(50) NOT NULL,
          file_name NVARCHAR(200) NOT NULL,
          file_path NVARCHAR(500) NOT NULL,
          file_size INT DEFAULT 0,
          uploaded_by NVARCHAR(100) DEFAULT '',
          uploaded_at DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX IX_lc_attachment_company ON logistics_company_attachment(company_number);
      END
    `)
  } catch (e) { console.log('logistics_company_attachment 表迁移跳过或已存在') }

  // outsourcing_order 委外订单表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='outsourcing_order' AND xtype='U')
      CREATE TABLE outsourcing_order (
        outsourcing_order_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        process_task_number NVARCHAR(50) DEFAULT '',
        production_order_number NVARCHAR(50) DEFAULT '',
        production_number NVARCHAR(50) DEFAULT '',
        process_route_number NVARCHAR(50) DEFAULT '',
        step_number INT DEFAULT 0,
        standard_process_number NVARCHAR(50) DEFAULT '',
        standard_process_name NVARCHAR(100) DEFAULT '',
        work_center_number NVARCHAR(50) DEFAULT '',
        work_center_name NVARCHAR(100) DEFAULT '',
        item_number NVARCHAR(100) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        planned_quantity DECIMAL(18,4) DEFAULT 0,
        received_quantity DECIMAL(18,4) DEFAULT 0,
        supplier_number NVARCHAR(100) DEFAULT '',
        supplier_name NVARCHAR(200) DEFAULT '',
        unit_price DECIMAL(18,4) DEFAULT 0,
        total_amount DECIMAL(18,4) DEFAULT 0,
        order_date NVARCHAR(20) DEFAULT '',
        expected_return_date NVARCHAR(20) DEFAULT '',
        actual_return_date NVARCHAR(20) NULL,
        approval_status NVARCHAR(20) DEFAULT N'草稿',
        order_status NVARCHAR(20) DEFAULT N'待发出',
        remark NVARCHAR(500) DEFAULT '',
        creation_date NVARCHAR(50) DEFAULT '',
        creation_man NVARCHAR(100) DEFAULT ''
      )
    `)
  } catch (e) { console.log('outsourcing_order 表迁移跳过或已完成') }

  // item_attachment 物料附件表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='item_attachment' AND xtype='U')
      BEGIN
        CREATE TABLE item_attachment (
          id INT IDENTITY(1,1) PRIMARY KEY,
          item_number NVARCHAR(50) NOT NULL,
          category NVARCHAR(20) NOT NULL,
          original_name NVARCHAR(500) DEFAULT '',
          stored_name NVARCHAR(200) NOT NULL,
          file_size INT DEFAULT 0,
          mime_type NVARCHAR(100) DEFAULT '',
          uploader NVARCHAR(100) DEFAULT '',
          creation_date DATETIME DEFAULT GETDATE()
        );
        CREATE INDEX IX_item_attachment_item ON item_attachment(item_number);
        CREATE INDEX IX_item_attachment_category ON item_attachment(item_number, category);
      END
    `)
  } catch (e) { console.log('item_attachment 表迁移跳过或已存在') }

  // accounting_period 会计期间表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='accounting_period' AND xtype='U')
      BEGIN
        CREATE TABLE accounting_period (
          id INT IDENTITY(1,1) PRIMARY KEY,
          period_code NVARCHAR(20) NOT NULL,
          period_name NVARCHAR(100) DEFAULT '',
          fiscal_year INT NOT NULL,
          period_number INT NOT NULL,
          start_date DATE NOT NULL,
          end_date DATE NOT NULL,
          status NVARCHAR(20) DEFAULT N'未开启',
          closed_by NVARCHAR(100) DEFAULT '',
          closed_date DATETIME NULL,
          remark NVARCHAR(500) DEFAULT '',
          creation_date DATETIME DEFAULT GETDATE(),
          creation_man NVARCHAR(100) DEFAULT '',
          CONSTRAINT UQ_accounting_period_code UNIQUE (period_code)
        );
        CREATE INDEX IX_accounting_period_year ON accounting_period(fiscal_year);
        CREATE INDEX IX_accounting_period_status ON accounting_period(status);
      END
    `)
  } catch (e) { console.log('accounting_period 表迁移跳过或已存在') }

  // routing_detail_material 工序物料子表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='routing_detail_material' AND xtype='U')
      CREATE TABLE routing_detail_material (
        id INT IDENTITY(1,1) PRIMARY KEY,
        routing_detail_id INT NOT NULL,
        material_number VARCHAR(50) DEFAULT '',
        material_name NVARCHAR(200) DEFAULT '',
        quantity DECIMAL(18,4) DEFAULT 0,
        unit VARCHAR(20) DEFAULT '',
        wastage_rate DECIMAL(18,4) DEFAULT 0,
        remark NVARCHAR(500) DEFAULT ''
      )
    `)
  } catch (e) { console.log('routing_detail_material 表迁移跳过或已存在') }

  // routing_detail_material.is_backflush 字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM sys.columns
        WHERE object_id = OBJECT_ID('routing_detail_material') AND name = 'is_backflush')
      ALTER TABLE routing_detail_material ADD is_backflush BIT DEFAULT 0 NOT NULL
    `)
  } catch (e) { console.log('routing_detail_material is_backflush 迁移跳过') }

  // routing_detail 检验配置字段
  try {
    const inspectFields = [
      { name: 'enable_self_inspect', type: "NVARCHAR(10) DEFAULT N'否'" },
      { name: 'enable_special_inspect', type: "NVARCHAR(10) DEFAULT N'否'" },
      { name: 'self_inspect_plan_name', type: "NVARCHAR(100) DEFAULT ''" },
      { name: 'special_inspect_plan_name', type: "NVARCHAR(100) DEFAULT ''" },
      { name: 'self_inspect_spec_name', type: "NVARCHAR(100) DEFAULT ''" },
      { name: 'special_inspect_spec_name', type: "NVARCHAR(100) DEFAULT ''" },
    ]
    for (const f of inspectFields) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('routing_detail') AND name = '${f.name}')
        ALTER TABLE routing_detail ADD ${f.name} ${f.type}
      `)
    }
  } catch (e) { console.log('routing_detail 检验字段迁移跳过或已完成') }

  // process_task 检验配置字段
  try {
    const inspectFields = [
      { name: 'enable_self_inspect', type: "NVARCHAR(10) DEFAULT N'否'" },
      { name: 'enable_special_inspect', type: "NVARCHAR(10) DEFAULT N'否'" },
      { name: 'self_inspect_plan_name', type: "NVARCHAR(100) DEFAULT ''" },
      { name: 'special_inspect_plan_name', type: "NVARCHAR(100) DEFAULT ''" },
      { name: 'self_inspect_spec_name', type: "NVARCHAR(100) DEFAULT ''" },
      { name: 'special_inspect_spec_name', type: "NVARCHAR(100) DEFAULT ''" },
    ]
    for (const f of inspectFields) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('process_task') AND name = '${f.name}')
        ALTER TABLE process_task ADD ${f.name} ${f.type}
      `)
    }
  } catch (e) { console.log('process_task 检验字段迁移跳过或已完成') }

  // routing_detail 统一检验字段（inspect_type 三态设计）
  try {
    const newInspectFields = [
      { name: 'inspect_type', type: "NVARCHAR(20) DEFAULT N'无需检'" },
      { name: 'inspect_plan_name', type: "NVARCHAR(100) DEFAULT ''" },
      { name: 'inspect_spec_name', type: "NVARCHAR(100) DEFAULT ''" },
    ]
    for (const f of newInspectFields) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('routing_detail') AND name = '${f.name}')
        ALTER TABLE routing_detail ADD ${f.name} ${f.type}
      `)
    }
  } catch (e) { console.log('routing_detail 统一检验字段迁移跳过或已完成') }

  // process_task 统一检验字段 + 检验状态
  try {
    const newInspectFields = [
      { name: 'inspect_type', type: "NVARCHAR(20) DEFAULT N'无需检'" },
      { name: 'inspect_plan_name', type: "NVARCHAR(100) DEFAULT ''" },
      { name: 'inspect_spec_name', type: "NVARCHAR(100) DEFAULT ''" },
      { name: 'inspect_status', type: "NVARCHAR(20) DEFAULT N'无需检'" },
    ]
    for (const f of newInspectFields) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('process_task') AND name = '${f.name}')
        ALTER TABLE process_task ADD ${f.name} ${f.type}
      `)
    }
  } catch (e) { console.log('process_task 统一检验字段迁移跳过或已完成') }

  // 历史数据迁移：旧检验字段 → 新统一检验字段
  try {
    await sequelize.query(`
      UPDATE routing_detail SET
        inspect_type = CASE
          WHEN enable_self_inspect = N'是' AND (enable_special_inspect IS NULL OR enable_special_inspect = N'否') THEN N'自检'
          WHEN (enable_self_inspect IS NULL OR enable_self_inspect = N'否') AND enable_special_inspect = N'是' THEN N'专检'
          WHEN enable_self_inspect = N'是' AND enable_special_inspect = N'是' THEN N'自检'
          ELSE N'无需检'
        END,
        inspect_plan_name = CASE
          WHEN enable_self_inspect = N'是' AND (enable_special_inspect IS NULL OR enable_special_inspect = N'否') THEN ISNULL(self_inspect_plan_name, '')
          WHEN (enable_self_inspect IS NULL OR enable_self_inspect = N'否') AND enable_special_inspect = N'是' THEN ISNULL(special_inspect_plan_name, '')
          WHEN enable_self_inspect = N'是' AND enable_special_inspect = N'是' THEN ISNULL(self_inspect_plan_name, '')
          ELSE ''
        END,
        inspect_spec_name = CASE
          WHEN enable_self_inspect = N'是' AND (enable_special_inspect IS NULL OR enable_special_inspect = N'否') THEN ISNULL(self_inspect_spec_name, '')
          WHEN (enable_self_inspect IS NULL OR enable_self_inspect = N'否') AND enable_special_inspect = N'是' THEN ISNULL(special_inspect_spec_name, '')
          WHEN enable_self_inspect = N'是' AND enable_special_inspect = N'是' THEN ISNULL(self_inspect_spec_name, '')
          ELSE ''
        END
      WHERE inspect_type = N'无需检' OR inspect_type IS NULL OR inspect_type = ''
    `)
    await sequelize.query(`
      UPDATE process_task SET
        inspect_type = CASE
          WHEN enable_self_inspect = N'是' AND (enable_special_inspect IS NULL OR enable_special_inspect = N'否') THEN N'自检'
          WHEN (enable_self_inspect IS NULL OR enable_self_inspect = N'否') AND enable_special_inspect = N'是' THEN N'专检'
          WHEN enable_self_inspect = N'是' AND enable_special_inspect = N'是' THEN N'自检'
          ELSE N'无需检'
        END,
        inspect_plan_name = CASE
          WHEN enable_self_inspect = N'是' AND (enable_special_inspect IS NULL OR enable_special_inspect = N'否') THEN ISNULL(self_inspect_plan_name, '')
          WHEN (enable_self_inspect IS NULL OR enable_self_inspect = N'否') AND enable_special_inspect = N'是' THEN ISNULL(special_inspect_plan_name, '')
          WHEN enable_self_inspect = N'是' AND enable_special_inspect = N'是' THEN ISNULL(self_inspect_plan_name, '')
          ELSE ''
        END,
        inspect_spec_name = CASE
          WHEN enable_self_inspect = N'是' AND (enable_special_inspect IS NULL OR enable_special_inspect = N'否') THEN ISNULL(self_inspect_spec_name, '')
          WHEN (enable_self_inspect IS NULL OR enable_self_inspect = N'否') AND enable_special_inspect = N'是' THEN ISNULL(special_inspect_spec_name, '')
          WHEN enable_self_inspect = N'是' AND enable_special_inspect = N'是' THEN ISNULL(self_inspect_spec_name, '')
          ELSE ''
        END,
        inspect_status = N'无需检'
      WHERE inspect_type = N'无需检' OR inspect_type IS NULL OR inspect_type = ''
    `)
  } catch (e) { console.log('历史数据迁移跳过或已完成', e) }

  // routing_detail + process_task 专检检验人字段
  try {
    const inspectorFields = [
      { table: 'routing_detail', name: 'inspector_number', type: "NVARCHAR(50) DEFAULT ''" },
      { table: 'routing_detail', name: 'inspector_name', type: "NVARCHAR(100) DEFAULT ''" },
      { table: 'process_task', name: 'inspector_number', type: "NVARCHAR(50) DEFAULT ''" },
      { table: 'process_task', name: 'inspector_name', type: "NVARCHAR(100) DEFAULT ''" },
    ]
    for (const f of inspectorFields) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('${f.table}') AND name = '${f.name}')
        ALTER TABLE ${f.table} ADD ${f.name} ${f.type}
      `)
    }
  } catch (e) { console.log('专检检验人字段迁移跳过或已完成') }

  // routing_detail + process_task 附件信息/技术要求/备注字段
  try {
    const extraFields = [
      { table: 'routing_detail', name: 'attachment_info', type: "NVARCHAR(MAX) DEFAULT ''" },
      { table: 'routing_detail', name: 'technical_requirement', type: "NVARCHAR(500) DEFAULT ''" },
      { table: 'routing_detail', name: 'remark', type: "NVARCHAR(500) DEFAULT ''" },
      { table: 'process_task', name: 'attachment_info', type: "NVARCHAR(MAX) DEFAULT ''" },
      { table: 'process_task', name: 'technical_requirement', type: "NVARCHAR(500) DEFAULT ''" },
      { table: 'process_task', name: 'remark', type: "NVARCHAR(500) DEFAULT ''" },
    ]
    for (const f of extraFields) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('${f.table}') AND name = '${f.name}')
        ALTER TABLE ${f.table} ADD ${f.name} ${f.type}
      `)
    }
  } catch (e) { console.log('附件信息/技术要求/备注字段迁移跳过或已完成') }

  // production_inspection 检验记录表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='production_inspection' AND xtype='U')
      CREATE TABLE production_inspection (
        inspection_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        work_report_number NVARCHAR(50) DEFAULT '',
        process_task_number NVARCHAR(50) DEFAULT '',
        production_order_number NVARCHAR(50) DEFAULT '',
        step_number INT DEFAULT 0,
        standard_process_name NVARCHAR(100) DEFAULT '',
        item_number NVARCHAR(100) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        inspect_type NVARCHAR(20) DEFAULT '',
        inspection_plan_name NVARCHAR(100) DEFAULT '',
        inspection_spec_name NVARCHAR(100) DEFAULT '',
        total_quantity DECIMAL(18,4) DEFAULT 0,
        qualified_quantity DECIMAL(18,4) DEFAULT 0,
        unqualified_quantity DECIMAL(18,4) DEFAULT 0,
        inspection_result NVARCHAR(20) DEFAULT N'待检',
        inspector_number NVARCHAR(50) DEFAULT '',
        inspector_name NVARCHAR(100) DEFAULT '',
        inspection_date NVARCHAR(20) DEFAULT '',
        defect_handling NVARCHAR(20) DEFAULT '',
        rework_step_number INT NULL,
        scrap_type NVARCHAR(20) DEFAULT '',
        scrap_quantity DECIMAL(18,4) DEFAULT 0,
        concession_quantity DECIMAL(18,4) DEFAULT 0,
        status NVARCHAR(20) DEFAULT N'待检',
        remark NVARCHAR(500) DEFAULT '',
        creation_date NVARCHAR(20) DEFAULT '',
        creation_man NVARCHAR(50) DEFAULT ''
      )
    `)
  } catch (e) { console.log('production_inspection 表迁移跳过或已完成') }

  // production_inspection_item 检验明细项表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='production_inspection_item' AND xtype='U')
      CREATE TABLE production_inspection_item (
        id INT IDENTITY(1,1) PRIMARY KEY,
        inspection_number NVARCHAR(50) NOT NULL,
        char_name NVARCHAR(100) DEFAULT '',
        inspect_requirement NVARCHAR(200) DEFAULT '',
        data_type NVARCHAR(50) DEFAULT '',
        upper_limit DECIMAL(18,4) NULL,
        standard_value DECIMAL(18,4) NULL,
        lower_limit DECIMAL(18,4) NULL,
        actual_value NVARCHAR(200) DEFAULT '',
        item_result NVARCHAR(20) DEFAULT '',
        sort_order INT DEFAULT 0,
        remark NVARCHAR(500) DEFAULT ''
      )
    `)
  } catch (e) { console.log('production_inspection_item 表迁移跳过或已完成') }

  // routing_header bom_number/is_primary
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'routing_header' AND COLUMN_NAME = 'bom_number')
      BEGIN
        ALTER TABLE routing_header ADD bom_number NVARCHAR(50)
      END
    `)
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'routing_header' AND COLUMN_NAME = 'is_primary')
      BEGIN
        ALTER TABLE routing_header ADD is_primary NVARCHAR(10) DEFAULT N'否'
      END
    `)
  } catch (e) { console.log('routing_header 字段迁移跳过或已存在') }

  // 菜单迁移：工序管理/工作中心/工艺路线移到产品数据下
  try {
    const [productData]: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'product-data'`
    )
    if (productData.length > 0) {
      const productDataId = productData[0].id
      await sequelize.query(
        `UPDATE permission SET parent_id = :pid, sort_order = 5 WHERE permission_code = 'procedures'`,
        { replacements: { pid: productDataId } }
      )
      await sequelize.query(
        `UPDATE permission SET parent_id = :pid, sort_order = 6 WHERE permission_code = 'work-centers'`,
        { replacements: { pid: productDataId } }
      )
      await sequelize.query(
        `UPDATE permission SET parent_id = :pid, sort_order = 7 WHERE permission_code = 'routing-masters'`,
        { replacements: { pid: productDataId } }
      )
    }
  } catch (e) { console.log('菜单迁移跳过') }

  // 生产检验管理菜单项
  try {
    const [existing]: any = await sequelize.query(
      `SELECT id FROM permission WHERE permission_code = 'production-inspections'`
    )
    if (existing.length === 0) {
      const [qualityParent]: any = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = 'quality'`
      )
      const parentId = qualityParent.length > 0 ? qualityParent[0].id : null
      await sequelize.query(
        `INSERT INTO permission (permission_name, permission_code, permission_type, parent_id, menu_key, route_path, sort_order)
         VALUES (N'生产检验管理', 'production-inspections', 'page', :parentId, 'production-inspections', '/production-inspections', 4)`,
        { replacements: { parentId } }
      )
      const [newPerm]: any = await sequelize.query(`SELECT id FROM permission WHERE permission_code = 'production-inspections'`)
      const [adminRole]: any = await sequelize.query(`SELECT id FROM role WHERE role_code = 'admin'`)
      if (newPerm.length > 0 && adminRole.length > 0) {
        await sequelize.query(
          `INSERT INTO role_permission (role_id, permission_id) VALUES (:rid, :pid)`,
          { replacements: { rid: adminRole[0].id, pid: newPerm[0].id } }
        )
      }
    }
  } catch (e) { console.log('生产检验菜单迁移跳过') }
}
