import sequelize from './config/database';

async function migrate() {
  try {
    console.log('开始设备状态+停机记录+保养计划+OEE 迁移...');

    // ============ Phase 1: equipment表新增字段 ============
    const newColumns = [
      { name: 'equipment_status', definition: "NVARCHAR(20) DEFAULT N'闲置'" },
      { name: 'location', definition: 'NVARCHAR(100) NULL' },
      { name: 'department', definition: 'NVARCHAR(100) NULL' },
      { name: 'daily_running_hours', definition: 'DECIMAL(4,1) DEFAULT 24.0' },
      { name: 'maintenance_cycle_days', definition: 'INT DEFAULT 30' },
      { name: 'last_maintenance_date', definition: 'DATE NULL' },
      { name: 'next_maintenance_date', definition: 'DATE NULL' },
      { name: 'total_running_hours', definition: 'DECIMAL(10,1) DEFAULT 0' },
      { name: 'last_status_change_time', definition: 'DATETIME NULL' },
    ];

    for (const col of newColumns) {
      try {
        await sequelize.query(`ALTER TABLE equipment ADD ${col.name} ${col.definition}`);
        console.log(`  equipment + ${col.name} OK`);
      } catch (err: any) {
        if (err.message?.includes('already exists') || err.original?.message?.includes('already exists')) {
          console.log(`  equipment.${col.name} already exists, skip`);
        } else {
          throw err;
        }
      }
    }

    // ============ Phase 1: equipment_downtime 表 ============
    try {
      await sequelize.query(`
        CREATE TABLE equipment_downtime (
          id INT IDENTITY(1,1) PRIMARY KEY,
          equipment_number NVARCHAR(50) NOT NULL,
          downtime_type NVARCHAR(20) NOT NULL,
          start_time DATETIME NOT NULL,
          end_time DATETIME NULL,
          duration_minutes INT NULL,
          fault_reason NVARCHAR(500) NULL,
          treatment NVARCHAR(500) NULL,
          replaced_parts NVARCHAR(500) NULL,
          cost DECIMAL(18,2) DEFAULT 0,
          performed_by NVARCHAR(50) NULL,
          approval_status NVARCHAR(20) DEFAULT N'未审核',
          remark NVARCHAR(500) NULL,
          created_by NVARCHAR(50) DEFAULT '',
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE()
        )
      `);
      console.log('  equipment_downtime table created');

      await sequelize.query('CREATE INDEX IX_downtime_equipment ON equipment_downtime(equipment_number)');
      await sequelize.query('CREATE INDEX IX_downtime_start ON equipment_downtime(start_time)');
      await sequelize.query('CREATE INDEX IX_downtime_type ON equipment_downtime(downtime_type)');
      await sequelize.query('CREATE INDEX IX_downtime_status ON equipment_downtime(approval_status)');
      console.log('  equipment_downtime indexes created');
    } catch (err: any) {
      if (err.message?.includes('already exists') || err.original?.message?.includes('already exists')) {
        console.log('  equipment_downtime already exists, skip');
      } else {
        throw err;
      }
    }

    // ============ Phase 2: equipment_maintenance_plan 表 ============
    try {
      await sequelize.query(`
        CREATE TABLE equipment_maintenance_plan (
          id INT IDENTITY(1,1) PRIMARY KEY,
          plan_number NVARCHAR(50) NOT NULL,
          equipment_number NVARCHAR(50) NOT NULL,
          maintenance_type NVARCHAR(20) NOT NULL,
          planned_date DATE NOT NULL,
          actual_date DATE NULL,
          maintenance_items NVARCHAR(2000) NULL,
          responsible_person NVARCHAR(50) NULL,
          plan_status NVARCHAR(20) DEFAULT N'待执行',
          completion_remark NVARCHAR(500) NULL,
          approval_status NVARCHAR(20) DEFAULT N'未审核',
          remark NVARCHAR(500) NULL,
          created_by NVARCHAR(50) DEFAULT '',
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE()
        )
      `);
      console.log('  equipment_maintenance_plan table created');

      await sequelize.query('CREATE INDEX IX_maint_plan_equipment ON equipment_maintenance_plan(equipment_number)');
      await sequelize.query('CREATE INDEX IX_maint_plan_date ON equipment_maintenance_plan(planned_date)');
      await sequelize.query('CREATE INDEX IX_maint_plan_status ON equipment_maintenance_plan(plan_status)');
      await sequelize.query('CREATE INDEX IX_maint_plan_type ON equipment_maintenance_plan(maintenance_type)');
      console.log('  equipment_maintenance_plan indexes created');
    } catch (err: any) {
      if (err.message?.includes('already exists') || err.original?.message?.includes('already exists')) {
        console.log('  equipment_maintenance_plan already exists, skip');
      } else {
        throw err;
      }
    }

    // ============ Phase 3: equipment_oee 表 ============
    try {
      await sequelize.query(`
        CREATE TABLE equipment_oee (
          id INT IDENTITY(1,1) PRIMARY KEY,
          equipment_number NVARCHAR(50) NOT NULL,
          record_date DATE NOT NULL,
          shift_id NVARCHAR(50) NULL,
          planned_time_minutes INT DEFAULT 0,
          downtime_minutes INT DEFAULT 0,
          actual_run_minutes INT DEFAULT 0,
          ideal_output DECIMAL(18,4) DEFAULT 0,
          actual_output DECIMAL(18,4) DEFAULT 0,
          good_output DECIMAL(18,4) DEFAULT 0,
          availability_rate DECIMAL(5,2) DEFAULT 0,
          performance_rate DECIMAL(5,2) DEFAULT 0,
          quality_rate DECIMAL(5,2) DEFAULT 0,
          oee_rate DECIMAL(5,2) DEFAULT 0,
          data_source NVARCHAR(20) DEFAULT N'自动',
          remark NVARCHAR(500) NULL,
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE()
        )
      `);
      console.log('  equipment_oee table created');

      await sequelize.query('CREATE INDEX IX_oee_equipment ON equipment_oee(equipment_number)');
      await sequelize.query('CREATE INDEX IX_oee_date ON equipment_oee(record_date)');
      console.log('  equipment_oee indexes created');

      // 添加唯一约束
      try {
        await sequelize.query('ALTER TABLE equipment_oee ADD CONSTRAINT UQ_oee_equipment_date_shift UNIQUE(equipment_number, record_date, shift_id)');
        console.log('  equipment_oee unique constraint added');
      } catch (err2: any) {
        if (err2.message?.includes('already exists') || err2.original?.message?.includes('already exists')) {
          console.log('  equipment_oee unique constraint already exists, skip');
        } else {
          console.log('  equipment_oee unique constraint warning:', err2.message);
        }
      }
    } catch (err: any) {
      if (err.message?.includes('already exists') || err.original?.message?.includes('already exists')) {
        console.log('  equipment_oee already exists, skip');
      } else {
        throw err;
      }
    }

    console.log('设备状态+停机记录+保养计划+OEE 迁移全部完成');
    process.exit(0);
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrate();
