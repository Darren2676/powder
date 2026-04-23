/**
 * 物料主数据详情页分区字段迁移脚本
 * 为 item_master 表添加库存、生产计划、供应链、质量检验分区字段
 * 
 * Run: npx ts-node src/sql/migrations/037_item_master_detail_fields.ts
 */

import sequelize from '../../config/database'

async function migrateItemMasterDetailFields() {
  console.log('Starting item_master detail fields migration...')

  try {
    await sequelize.authenticate()
    console.log('Database connection established.')

    // ========== 库存基础分区字段 ==========
    console.log('Adding inventory fields...')
    
    const inventoryFields = [
      { name: 'batch_management', type: "NVARCHAR(10) DEFAULT N'N'", desc: '批次管理' },
      { name: 'stagnation_days', type: 'INT DEFAULT 999', desc: '呆滞日期' },
      { name: 'lock_inventory', type: "NVARCHAR(10) DEFAULT N'N'", desc: '启用锁库' },
      { name: 'default_warehouse', type: "NVARCHAR(50) DEFAULT ''", desc: '默认仓库' },
      { name: 'standard_cost', type: 'DECIMAL(18,4) DEFAULT 0', desc: '标准成本' },
      { name: 'actual_cost', type: 'DECIMAL(18,4) DEFAULT 0', desc: '实际成本' },
      { name: 'rounding_method', type: "NVARCHAR(20) DEFAULT N'不取整'", desc: '取整方式' },
      { name: 'abc_class', type: "NVARCHAR(10) DEFAULT ''", desc: 'ABC分类' },
      { name: 'inventory_unit', type: "NVARCHAR(50) DEFAULT ''", desc: '库存单位' },
      { name: 'outbound_method', type: "NVARCHAR(50) DEFAULT N'无限制'", desc: '出库方式' }
    ]

    for (const field of inventoryFields) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
                       WHERE TABLE_NAME = 'item_master' AND COLUMN_NAME = '${field.name}')
        BEGIN
          ALTER TABLE item_master ADD ${field.name} ${field.type}
          PRINT 'Added column: ${field.name} (${field.desc})'
        END
        ELSE
        BEGIN
          PRINT 'Column already exists: ${field.name}'
        END
      `)
    }
    console.log('Inventory fields added.')

    // ========== 生产&计划分区字段 ==========
    console.log('Adding production & planning fields...')
    
    const productionFields = [
      { name: 'daily_capacity', type: 'DECIMAL(18,4) DEFAULT 0', desc: '日产能' },
      { name: 'default_routing', type: "NVARCHAR(50) DEFAULT ''", desc: '默认工艺' },
      { name: 'defect_rate', type: 'DECIMAL(5,4) DEFAULT 0', desc: '次品率' },
      { name: 'conversion_batch_size', type: 'DECIMAL(18,4) DEFAULT 0', desc: '转换批量大小' },
      { name: 'planning_strategy', type: "NVARCHAR(50) DEFAULT N'其他'", desc: '计划策略' },
      { name: 'increment_size', type: 'DECIMAL(18,4) DEFAULT 0', desc: '增量大小' },
      { name: 'planning_batch_size', type: 'DECIMAL(18,4) DEFAULT 0', desc: '计划批量大小' },
      { name: 'production_unit', type: "NVARCHAR(50) DEFAULT ''", desc: '生产单位' }
    ]

    for (const field of productionFields) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
                       WHERE TABLE_NAME = 'item_master' AND COLUMN_NAME = '${field.name}')
        BEGIN
          ALTER TABLE item_master ADD ${field.name} ${field.type}
          PRINT 'Added column: ${field.name} (${field.desc})'
        END
        ELSE
        BEGIN
          PRINT 'Column already exists: ${field.name}'
        END
      `)
    }
    console.log('Production & planning fields added.')

    // ========== 供应链分区字段 ==========
    console.log('Adding supply chain fields...')
    
    const supplyFields = [
      { name: 'configurable_item', type: "NVARCHAR(10) DEFAULT N'N'", desc: '可配置物料' },
      { name: 'market_price_tax', type: 'DECIMAL(18,4) DEFAULT 0', desc: '市场价含税' },
      { name: 'sales_unit', type: "NVARCHAR(50) DEFAULT ''", desc: '销售单位' },
      { name: 'sales_tax_rate', type: 'DECIMAL(5,2) DEFAULT 0', desc: '销项税率' },
      { name: 'sales_price_list', type: "NVARCHAR(50) DEFAULT ''", desc: '销售价目表' },
      { name: 'over_delivery_rate', type: 'DECIMAL(5,2) DEFAULT 0', desc: '超额发货比例' },
      { name: 'purchase_unit', type: "NVARCHAR(50) DEFAULT ''", desc: '采购单位' }
    ]

    for (const field of supplyFields) {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
                       WHERE TABLE_NAME = 'item_master' AND COLUMN_NAME = '${field.name}')
        BEGIN
          ALTER TABLE item_master ADD ${field.name} ${field.type}
          PRINT 'Added column: ${field.name} (${field.desc})'
        END
        ELSE
        BEGIN
          PRINT 'Column already exists: ${field.name}'
        END
      `)
    }
    console.log('Supply chain fields added.')

    // ========== 质量检验分区字段 ==========
    console.log('Adding quality inspection fields...')
    
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
                     WHERE TABLE_NAME = 'item_master' AND COLUMN_NAME = 'incoming_inspection')
      BEGIN
        ALTER TABLE item_master ADD incoming_inspection NVARCHAR(10) DEFAULT N'N'
        PRINT 'Added column: incoming_inspection (收料检验)'
      END
      ELSE
      BEGIN
        PRINT 'Column already exists: incoming_inspection'
      END
    `)
    console.log('Quality inspection fields added.')

    console.log('\nMigration completed successfully!')
    console.log('Summary:')
    console.log('  - Inventory fields: 10')
    console.log('  - Production & planning fields: 8')
    console.log('  - Supply chain fields: 7')
    console.log('  - Quality inspection fields: 1')
    console.log('  - Total: 26 new fields added to item_master')

  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  } finally {
    await sequelize.close()
  }
}

// Run if called directly
migrateItemMasterDetailFields()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))

export { migrateItemMasterDetailFields }
