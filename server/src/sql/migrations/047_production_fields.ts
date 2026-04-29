/**
 * 生产域字段迁移
 * - Production_plan source_order_number/source_line_number
 * - production_order inbound/baseline/MRP 字段
 * - work_report 缺陷字段
 * - production_order planned_quantity 类型变更
 * - material_preparation_detail.standard_process_name
 */

import sequelize from '../../config/database'

export async function runMigration(): Promise<void> {
  // Production_plan 增加 source_order_number 和 source_line_number 字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Production_plan' AND COLUMN_NAME = 'source_order_number')
      BEGIN
        ALTER TABLE Production_plan ADD source_order_number NVARCHAR(50) DEFAULT ''
      END;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Production_plan' AND COLUMN_NAME = 'source_line_number')
      BEGIN
        ALTER TABLE Production_plan ADD source_line_number INT NULL
      END
    `)
  } catch (e) { console.log('Production_plan source 字段迁移跳过或已存在') }

  // production_order 增加 inbound_quantity 和 inbound_status 字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_order' AND COLUMN_NAME = 'inbound_quantity')
      BEGIN
        ALTER TABLE production_order ADD inbound_quantity DECIMAL(18,4) DEFAULT 0
      END;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_order' AND COLUMN_NAME = 'inbound_status')
      BEGIN
        ALTER TABLE production_order ADD inbound_status NVARCHAR(20) DEFAULT N'未入库'
      END
    `)
  } catch (e) { console.log('production_order inbound 字段迁移跳过或已存在') }

  // production_order 增加 baseline 字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_order' AND COLUMN_NAME = 'baseline_production_date')
      BEGIN
        ALTER TABLE production_order ADD baseline_production_date DATETIME NULL
      END;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_order' AND COLUMN_NAME = 'baseline_planned_completion_time')
      BEGIN
        ALTER TABLE production_order ADD baseline_planned_completion_time DATETIME NULL
      END
    `)
  } catch (e) { console.log('production_order baseline 字段迁移跳过或已存在') }

  // production_order 增加模具MRP重算相关字段
  try {
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_order' AND COLUMN_NAME = 'parent_production_order_number')
      BEGIN
        ALTER TABLE production_order ADD parent_production_order_number NVARCHAR(50) NULL
      END;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_order' AND COLUMN_NAME = 'is_semi_product')
      BEGIN
        ALTER TABLE production_order ADD is_semi_product BIT DEFAULT 0
      END;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_order' AND COLUMN_NAME = 'source_type')
      BEGIN
        ALTER TABLE production_order ADD source_type NVARCHAR(50) DEFAULT ''
      END;
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_order' AND COLUMN_NAME = 'source_mould_number')
      BEGIN
        ALTER TABLE production_order ADD source_mould_number NVARCHAR(50) DEFAULT ''
      END
    `)
  } catch (e) { console.log('production_order 模具MRP字段迁移跳过或已存在') }

  // work_report 表增加缺陷相关字段
  try {
    const defectCols = [
      { name: 'defect_class_number', type: 'NVARCHAR(50)' },
      { name: 'defect_class_name', type: 'NVARCHAR(200)' },
      { name: 'defect_number', type: 'NVARCHAR(50)' },
      { name: 'defect_name', type: 'NVARCHAR(200)' }
    ]
    for (const col of defectCols) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'work_report' AND COLUMN_NAME = '${col.name}')
        ALTER TABLE work_report ADD ${col.name} ${col.type} DEFAULT ''
      `)
    }
  } catch (e) { console.log('work_report 缺陷字段迁移跳过或已存在') }

  // production_order planned_quantity bigint -> decimal(18,4)
  try {
    const [colCheck]: any = await sequelize.query(`
      SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'production_order' AND COLUMN_NAME = 'planned_quantity' AND DATA_TYPE = 'bigint'
    `)
    if (colCheck.length > 0) {
      await sequelize.query(`ALTER TABLE production_order ALTER COLUMN planned_quantity DECIMAL(18,4)`)
    }
  } catch (e) { console.log('production_order.planned_quantity 类型迁移跳过或已完成') }

  // material_preparation_detail 增加 standard_process_name 字段
  try {
    const [cols]: any = await sequelize.query(`
      SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('material_preparation_detail') AND name = 'standard_process_name'
    `)
    if (cols.length === 0) {
      await sequelize.query(`ALTER TABLE material_preparation_detail ADD standard_process_name NVARCHAR(200) DEFAULT ''`)
    }
  } catch (e) { console.log('material_preparation_detail.standard_process_name 迁移跳过或已完成') }
}
