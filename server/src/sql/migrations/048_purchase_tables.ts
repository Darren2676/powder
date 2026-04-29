/**
 * 采购域表迁移
 * - purchase_req + detail
 * - purchase_order + detail
 * - stock_in + detail
 * - purchase_quality_inspection + detail + 不合格品处理字段
 * - stock_in_detail 检验关联字段
 * - purchase_req.production_number
 */

import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  // purchase_req 主表 + 明细表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_req' AND xtype='U')
      CREATE TABLE purchase_req (
        purchase_req_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        request_date DATE NULL,
        request_department NVARCHAR(100) DEFAULT '',
        requester NVARCHAR(100) DEFAULT '',
        request_reason NVARCHAR(20) DEFAULT N'其他',
        source_number NVARCHAR(50) DEFAULT '',
        approval_status NVARCHAR(20) DEFAULT N'草稿',
        order_status NVARCHAR(20) DEFAULT N'未执行',
        [condition] NVARCHAR(20) DEFAULT N'启用',
        remark NVARCHAR(500) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE(),
        creation_man NVARCHAR(100) DEFAULT ''
      )
    `)
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_req_detail' AND xtype='U')
      CREATE TABLE purchase_req_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        purchase_req_number NVARCHAR(50) NOT NULL,
        line_number INT DEFAULT 10,
        item_number NVARCHAR(100) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        request_quantity DECIMAL(18,4) DEFAULT 0,
        ordered_quantity DECIMAL(18,4) DEFAULT 0,
        expected_date DATE NULL,
        suggested_supplier_number NVARCHAR(50) DEFAULT '',
        suggested_supplier_name NVARCHAR(200) DEFAULT '',
        status NVARCHAR(20) DEFAULT N'未执行',
        remark NVARCHAR(500) DEFAULT ''
      )
    `)
  } catch (e) { console.log('purchase_req 表迁移跳过或已存在') }

  // purchase_order 主表 + 明细表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_order' AND xtype='U')
      CREATE TABLE purchase_order (
        purchase_order_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        supplier_number NVARCHAR(50) DEFAULT '',
        supplier_name NVARCHAR(200) DEFAULT '',
        procurement_manager NVARCHAR(100) DEFAULT '',
        linkman NVARCHAR(100) DEFAULT '',
        contacts NVARCHAR(50) DEFAULT '',
        order_date DATE NULL,
        delivery_date DATE NULL,
        approval_status NVARCHAR(20) DEFAULT N'草稿',
        order_status NVARCHAR(20) DEFAULT N'待执行',
        total_amount DECIMAL(18,4) DEFAULT 0,
        [condition] NVARCHAR(20) DEFAULT N'启用',
        source_req_number NVARCHAR(50) DEFAULT '',
        remark NVARCHAR(500) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE(),
        creation_man NVARCHAR(100) DEFAULT ''
      )
    `)
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_order_detail' AND xtype='U')
      CREATE TABLE purchase_order_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        purchase_order_number NVARCHAR(50) NOT NULL,
        line_number INT DEFAULT 10,
        item_number NVARCHAR(100) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        order_quantity DECIMAL(18,4) DEFAULT 0,
        unit_price DECIMAL(18,4) DEFAULT 0,
        total_amount DECIMAL(18,4) DEFAULT 0,
        received_quantity DECIMAL(18,4) DEFAULT 0,
        delivery_date DATE NULL,
        receive_status NVARCHAR(20) DEFAULT N'未到货',
        source_req_number NVARCHAR(50) DEFAULT '',
        source_req_detail_id INT DEFAULT 0,
        remark NVARCHAR(500) DEFAULT ''
      )
    `)
  } catch (e) { console.log('purchase_order 表迁移跳过或已存在') }

  // stock_in 主表 + 明细表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='stock_in' AND xtype='U')
      CREATE TABLE stock_in (
        stock_in_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        purchase_order_number NVARCHAR(50) DEFAULT '',
        supplier_number NVARCHAR(50) DEFAULT '',
        supplier_name NVARCHAR(200) DEFAULT '',
        warehouse_number NVARCHAR(50) DEFAULT '',
        warehouse_name NVARCHAR(200) DEFAULT '',
        stock_in_date DATE NULL,
        stock_in_type NVARCHAR(20) DEFAULT N'采购入库',
        approval_status NVARCHAR(20) DEFAULT N'草稿',
        [condition] NVARCHAR(20) DEFAULT N'启用',
        operator NVARCHAR(100) DEFAULT '',
        remark NVARCHAR(500) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE(),
        creation_man NVARCHAR(100) DEFAULT ''
      )
    `)
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='stock_in_detail' AND xtype='U')
      CREATE TABLE stock_in_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        stock_in_number NVARCHAR(50) NOT NULL,
        line_number INT DEFAULT 10,
        purchase_order_number NVARCHAR(50) DEFAULT '',
        purchase_detail_id INT DEFAULT 0,
        item_number NVARCHAR(100) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        order_quantity DECIMAL(18,4) DEFAULT 0,
        received_quantity DECIMAL(18,4) DEFAULT 0,
        stock_in_quantity DECIMAL(18,4) DEFAULT 0,
        qualified_quantity DECIMAL(18,4) DEFAULT 0,
        unqualified_quantity DECIMAL(18,4) DEFAULT 0,
        batch_number NVARCHAR(50) DEFAULT '',
        remark NVARCHAR(500) DEFAULT ''
      )
    `)
  } catch (e) { console.log('stock_in 表迁移跳过或已存在') }

  // purchase_quality_inspection 主表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_quality_inspection' AND xtype='U')
      CREATE TABLE purchase_quality_inspection (
        inspection_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        stock_in_number NVARCHAR(50) DEFAULT '',
        purchase_order_number NVARCHAR(50) DEFAULT '',
        supplier_number NVARCHAR(50) DEFAULT '',
        supplier_name NVARCHAR(200) DEFAULT '',
        item_number NVARCHAR(100) DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        received_quantity DECIMAL(18,4) DEFAULT 0,
        sample_quantity DECIMAL(18,4) DEFAULT 0,
        qualified_quantity DECIMAL(18,4) DEFAULT 0,
        unqualified_quantity DECIMAL(18,4) DEFAULT 0,
        inspect_plan_name NVARCHAR(100) DEFAULT '',
        inspect_method NVARCHAR(50) DEFAULT '',
        inspect_spec_name NVARCHAR(100) DEFAULT '',
        inspector_name NVARCHAR(200) DEFAULT '',
        inspect_date DATE NULL,
        inspect_result NVARCHAR(20) DEFAULT '',
        inspect_status NVARCHAR(20) DEFAULT N'待检验',
        batch_number NVARCHAR(50) DEFAULT '',
        defect_class_name NVARCHAR(200) DEFAULT '',
        defect_name NVARCHAR(200) DEFAULT '',
        defect_reason_name NVARCHAR(200) DEFAULT '',
        remark NVARCHAR(500) DEFAULT '',
        creation_date DATETIME DEFAULT GETDATE(),
        creation_man NVARCHAR(100) DEFAULT ''
      )
    `)
  } catch (e) { console.log('purchase_quality_inspection 表迁移跳过或已存在') }

  // purchase_quality_inspection_detail 明细表
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_quality_inspection_detail' AND xtype='U')
      CREATE TABLE purchase_quality_inspection_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        inspection_number NVARCHAR(50) NOT NULL,
        sort_order INT DEFAULT 0,
        char_name NVARCHAR(100) DEFAULT '',
        char_category NVARCHAR(100) DEFAULT '',
        data_type NVARCHAR(20) DEFAULT '',
        upper_limit DECIMAL(18,4) NULL,
        standard_value DECIMAL(18,4) NULL,
        lower_limit DECIMAL(18,4) NULL,
        actual_value NVARCHAR(200) DEFAULT '',
        is_qualified NVARCHAR(10) DEFAULT '',
        inspect_requirement NVARCHAR(500) DEFAULT '',
        remark NVARCHAR(500) DEFAULT ''
      )
    `)
  } catch (e) { console.log('purchase_quality_inspection_detail 表迁移跳过或已存在') }

  // purchase_quality_inspection 不合格品处理字段
  try {
    const defectCols = [
      { name: 'defect_handling', type: 'NVARCHAR(20)', def: "N''" },
      { name: 'handling_quantity', type: 'DECIMAL(18,4)', def: '0' },
      { name: 'handling_remark', type: 'NVARCHAR(500)', def: "N''" },
      { name: 'return_order_number', type: 'NVARCHAR(50)', def: "N''" },
      { name: 'special_warehouse', type: 'NVARCHAR(100)', def: "N''" }
    ]
    for (const col of defectCols) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='purchase_quality_inspection' AND COLUMN_NAME='${col.name}')
        ALTER TABLE purchase_quality_inspection ADD ${col.name} ${col.type} DEFAULT ${col.def}
      `)
    }
  } catch (e: any) { console.log('purchase_quality_inspection 不合格品处理字段迁移跳过:', e.message || e) }

  // stock_in_detail 检验关联字段
  try {
    const siCols = [
      { name: 'inspection_number', type: 'NVARCHAR(50)', def: "N''" },
      { name: 'inspect_status', type: 'NVARCHAR(20)', def: "N''" }
    ]
    for (const col of siCols) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='stock_in_detail' AND COLUMN_NAME='${col.name}')
        ALTER TABLE stock_in_detail ADD ${col.name} ${col.type} DEFAULT ${col.def}
      `)
    }
  } catch (e: any) { console.log('stock_in_detail 检验关联字段迁移跳过:', e.message || e) }

  // purchase_req 增加 production_number 字段
  try {
    const [cols]: any = await sequelize.query(`
      SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('purchase_req') AND name = 'production_number'
    `)
    if (cols.length === 0) {
      await sequelize.query(`ALTER TABLE purchase_req ADD production_number NVARCHAR(500) DEFAULT ''`)
    }
  } catch (e) { console.log('purchase_req.production_number 迁移跳过或已完成') }
}
