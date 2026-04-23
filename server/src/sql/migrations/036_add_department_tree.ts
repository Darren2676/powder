/**
 * 部门树结构迁移脚本
 * 为 departments 表添加 parent_id 和 sort_order 字段，支持树形结构
 * 
 * Run: npx ts-node src/sql/migrations/036_add_department_tree.ts
 */

import sequelize from '../../config/database'

async function migrateDepartmentTree() {
  console.log('Starting department tree migration...')

  try {
    await sequelize.authenticate()
    console.log('Database connection established.')

    // 1. 添加 parent_id 字段
    console.log('Adding parent_id column to departments table...')
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
                     WHERE TABLE_NAME = 'departments' AND COLUMN_NAME = 'parent_id')
      BEGIN
        ALTER TABLE departments ADD parent_id INT NULL
      END
    `)
    console.log('parent_id column added.')

    // 2. 添加 sort_order 字段
    console.log('Adding sort_order column to departments table...')
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS 
                     WHERE TABLE_NAME = 'departments' AND COLUMN_NAME = 'sort_order')
      BEGIN
        ALTER TABLE departments ADD sort_order INT DEFAULT 0
      END
    `)
    console.log('sort_order column added.')

    // 3. 添加外键约束（如果尚不存在）
    console.log('Adding foreign key constraint...')
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS 
                     WHERE CONSTRAINT_NAME = 'FK_departments_parent')
      BEGIN
        ALTER TABLE departments ADD CONSTRAINT FK_departments_parent 
          FOREIGN KEY (parent_id) REFERENCES departments(id)
      END
    `)
    console.log('Foreign key constraint added.')

    // 4. 创建索引
    console.log('Creating indexes...')
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes 
                     WHERE name = 'IX_departments_parent' AND object_id = OBJECT_ID('departments'))
      BEGIN
        CREATE INDEX IX_departments_parent ON departments(parent_id)
      END
    `)
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM sys.indexes 
                     WHERE name = 'IX_departments_sort' AND object_id = OBJECT_ID('departments'))
      BEGIN
        CREATE INDEX IX_departments_sort ON departments(sort_order)
      END
    `)
    console.log('Indexes created.')

    // 5. 初始化现有数据（将所有现有部门的 parent_id 设为 NULL，作为根部门）
    console.log('Initializing existing data...')
    await sequelize.query(`
      UPDATE departments SET parent_id = NULL WHERE parent_id IS NULL
    `)
    console.log('Existing data initialized.')

    console.log('Department tree migration completed successfully!')

  } catch (error) {
    console.error('Migration failed:', error)
    throw error
  } finally {
    await sequelize.close()
  }
}

// Run if called directly
migrateDepartmentTree()
  .then(() => process.exit(0))
  .catch(() => process.exit(1))

export { migrateDepartmentTree }
