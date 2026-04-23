import sequelize from './config/database';

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // 阶段1：mould 表新增寿命跟踪字段
    const alters = [
      `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('mould') AND name = 'total_strokes') ALTER TABLE mould ADD total_strokes INT NOT NULL DEFAULT 0`,
      `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('mould') AND name = 'max_strokes') ALTER TABLE mould ADD max_strokes INT NOT NULL DEFAULT 0`,
      `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('mould') AND name = 'life_status') ALTER TABLE mould ADD life_status NVARCHAR(20) NOT NULL DEFAULT N'正常'`,
      `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('mould') AND name = 'last_maintenance_date') ALTER TABLE mould ADD last_maintenance_date DATE NULL`,
      `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('mould') AND name = 'next_maintenance_date') ALTER TABLE mould ADD next_maintenance_date DATE NULL`,
      `IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('mould') AND name = 'maintenance_cycle_days') ALTER TABLE mould ADD maintenance_cycle_days INT NOT NULL DEFAULT 90`,
    ];

    for (const sql of alters) {
      await sequelize.query(sql);
    }
    console.log('mould 表寿命字段迁移完成');

    // 阶段2：创建 mould_maintenance 表
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'mould_maintenance')
      CREATE TABLE mould_maintenance (
        id INT IDENTITY(1,1) PRIMARY KEY,
        mould_number NVARCHAR(100) NOT NULL,
        maintenance_type NVARCHAR(20) NOT NULL,
        maintenance_date DATE NOT NULL,
        description NVARCHAR(500) DEFAULT '',
        fault_reason NVARCHAR(500) DEFAULT '',
        replaced_parts NVARCHAR(500) DEFAULT '',
        cost DECIMAL(12,2) DEFAULT 0,
        performed_by NVARCHAR(100) DEFAULT '',
        strokes_at_maintenance INT DEFAULT 0,
        strokes_reset BIT DEFAULT 0,
        reset_strokes_to INT DEFAULT 0,
        remark NVARCHAR(500) DEFAULT '',
        created_by NVARCHAR(100) DEFAULT '',
        updated_by NVARCHAR(100) DEFAULT '',
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('mould_maintenance 表创建完成');

    // 创建索引
    const indexes = [
      `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_mould_maintenance_mould' AND object_id = OBJECT_ID('mould_maintenance')) CREATE INDEX idx_mould_maintenance_mould ON mould_maintenance(mould_number)`,
      `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_mould_maintenance_date' AND object_id = OBJECT_ID('mould_maintenance')) CREATE INDEX idx_mould_maintenance_date ON mould_maintenance(maintenance_date)`,
      `IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_mould_maintenance_type' AND object_id = OBJECT_ID('mould_maintenance')) CREATE INDEX idx_mould_maintenance_type ON mould_maintenance(maintenance_type)`,
    ];
    for (const sql of indexes) {
      await sequelize.query(sql);
    }
    console.log('mould_maintenance 索引创建完成');

    process.exit(0);
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
