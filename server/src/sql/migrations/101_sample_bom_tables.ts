import sequelize from '../../config/database';

/**
 * 101: 样件BOM与检测报告 - 数据库变更
 * 1. 新建 sample_bom_header 样件BOM主表
 * 2. 新建 sample_bom_version 样件BOM版本表
 * 3. 新建 sample_bom_version_detail 样件BOM版本明细表
 * 4. 新建 sample_inspection_report 样件检测报告表
 * 5. 新建 sample_inspection_report_item 检测报告明细表
 */
export async function runMigration(): Promise<void> {

  // ========== 1. sample_bom_header ==========
  const [tc1]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'sample_bom_header'`
  );
  if (tc1[0].cnt === 0) {
    await sequelize.query(`
      CREATE TABLE sample_bom_header (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        sample_bom_number NVARCHAR(30) NOT NULL,
        sample_request_number NVARCHAR(30) NOT NULL DEFAULT '',
        bom_name NVARCHAR(100) DEFAULT '',
        item_number NVARCHAR(50) DEFAULT '',
        item_name NVARCHAR(100) DEFAULT '',
        current_version INT DEFAULT 0,
        final_version INT NULL,
        base_quantity DECIMAL(18,4) DEFAULT 1,
        base_unit NVARCHAR(20) DEFAULT '',
        status NVARCHAR(20) DEFAULT N'试制中',
        remark NVARCHAR(500) DEFAULT '',
        created_by NVARCHAR(50) DEFAULT '',
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('  ✓ sample_bom_header 表已创建');
  } else {
    console.log('  → sample_bom_header 表已存在，跳过');
  }

  // 唯一约束 + 索引
  const [uc1]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM sys.indexes WHERE name = 'UQ_sample_bom_number' AND object_id = OBJECT_ID('sample_bom_header')`
  );
  if (uc1[0].cnt === 0) {
    await sequelize.query('CREATE UNIQUE INDEX UQ_sample_bom_number ON sample_bom_header(sample_bom_number)');
    console.log('  ✓ UQ_sample_bom_number 唯一索引已创建');
  }
  const [ix1]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM sys.indexes WHERE name = 'IX_sample_bom_request' AND object_id = OBJECT_ID('sample_bom_header')`
  );
  if (ix1[0].cnt === 0) {
    await sequelize.query('CREATE INDEX IX_sample_bom_request ON sample_bom_header(sample_request_number)');
    console.log('  ✓ IX_sample_bom_request 索引已创建');
  }

  // ========== 2. sample_bom_version ==========
  const [tc2]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'sample_bom_version'`
  );
  if (tc2[0].cnt === 0) {
    await sequelize.query(`
      CREATE TABLE sample_bom_version (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        sample_bom_number NVARCHAR(30) NOT NULL DEFAULT '',
        version_number INT NOT NULL DEFAULT 1,
        version_remark NVARCHAR(200) DEFAULT '',
        status NVARCHAR(20) DEFAULT N'草稿',
        inspection_result NVARCHAR(20) NULL,
        created_by NVARCHAR(50) DEFAULT '',
        created_at DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('  ✓ sample_bom_version 表已创建');
  } else {
    console.log('  → sample_bom_version 表已存在，跳过');
  }

  const [uc2]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM sys.indexes WHERE name = 'UQ_sample_bom_ver' AND object_id = OBJECT_ID('sample_bom_version')`
  );
  if (uc2[0].cnt === 0) {
    await sequelize.query('CREATE UNIQUE INDEX UQ_sample_bom_ver ON sample_bom_version(sample_bom_number, version_number)');
    console.log('  ✓ UQ_sample_bom_ver 唯一索引已创建');
  }

  // ========== 3. sample_bom_version_detail ==========
  const [tc3]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'sample_bom_version_detail'`
  );
  if (tc3[0].cnt === 0) {
    await sequelize.query(`
      CREATE TABLE sample_bom_version_detail (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        sample_bom_number NVARCHAR(30) NOT NULL DEFAULT '',
        version_number INT NOT NULL DEFAULT 1,
        line_number INT NOT NULL DEFAULT 0,
        material_number NVARCHAR(50) DEFAULT '',
        material_name NVARCHAR(100) DEFAULT '',
        material_type NVARCHAR(30) DEFAULT '',
        standard_quantity DECIMAL(18,4) DEFAULT 0,
        unit NVARCHAR(20) DEFAULT '',
        wastage_rate DECIMAL(5,2) DEFAULT 0,
        actual_quantity DECIMAL(18,4) DEFAULT 0,
        remark NVARCHAR(200) DEFAULT ''
      )
    `);
    console.log('  ✓ sample_bom_version_detail 表已创建');
  } else {
    console.log('  → sample_bom_version_detail 表已存在，跳过');
  }

  const [ix3]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM sys.indexes WHERE name = 'IX_sbv_detail' AND object_id = OBJECT_ID('sample_bom_version_detail')`
  );
  if (ix3[0].cnt === 0) {
    await sequelize.query('CREATE INDEX IX_sbv_detail ON sample_bom_version_detail(sample_bom_number, version_number, line_number)');
    console.log('  ✓ IX_sbv_detail 索引已创建');
  }

  // ========== 4. sample_inspection_report ==========
  const [tc4]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'sample_inspection_report'`
  );
  if (tc4[0].cnt === 0) {
    await sequelize.query(`
      CREATE TABLE sample_inspection_report (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        report_number NVARCHAR(30) NOT NULL,
        sample_bom_number NVARCHAR(30) NOT NULL DEFAULT '',
        version_number INT NOT NULL DEFAULT 1,
        inspection_date DATE NULL,
        inspector NVARCHAR(50) DEFAULT '',
        inspection_result NVARCHAR(20) DEFAULT N'待定',
        conclusion NVARCHAR(500) DEFAULT '',
        status NVARCHAR(20) DEFAULT N'草稿',
        created_by NVARCHAR(50) DEFAULT '',
        created_at DATETIME DEFAULT GETDATE(),
        updated_at DATETIME DEFAULT GETDATE()
      )
    `);
    console.log('  ✓ sample_inspection_report 表已创建');
  } else {
    console.log('  → sample_inspection_report 表已存在，跳过');
  }

  const [uc4]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM sys.indexes WHERE name = 'UQ_sample_insp_report_num' AND object_id = OBJECT_ID('sample_inspection_report')`
  );
  if (uc4[0].cnt === 0) {
    await sequelize.query('CREATE UNIQUE INDEX UQ_sample_insp_report_num ON sample_inspection_report(report_number)');
    console.log('  ✓ UQ_sample_insp_report_num 唯一索引已创建');
  }
  const [uc4b]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM sys.indexes WHERE name = 'UQ_sample_insp_bom_ver' AND object_id = OBJECT_ID('sample_inspection_report')`
  );
  if (uc4b[0].cnt === 0) {
    await sequelize.query('CREATE UNIQUE INDEX UQ_sample_insp_bom_ver ON sample_inspection_report(sample_bom_number, version_number)');
    console.log('  ✓ UQ_sample_insp_bom_ver 唯一索引已创建');
  }

  // ========== 5. sample_inspection_report_item ==========
  const [tc5]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'sample_inspection_report_item'`
  );
  if (tc5[0].cnt === 0) {
    await sequelize.query(`
      CREATE TABLE sample_inspection_report_item (
        id BIGINT IDENTITY(1,1) PRIMARY KEY,
        report_number NVARCHAR(30) NOT NULL DEFAULT '',
        char_name NVARCHAR(50) NOT NULL DEFAULT '',
        inspect_requirement NVARCHAR(200) DEFAULT '',
        data_type NVARCHAR(20) DEFAULT N'数值',
        upper_limit DECIMAL(18,4) NULL,
        standard_value NVARCHAR(100) NULL,
        lower_limit DECIMAL(18,4) NULL,
        measured_value NVARCHAR(100) NULL,
        is_qualified NVARCHAR(5) NULL,
        sort_order INT DEFAULT 0,
        remark NVARCHAR(200) DEFAULT ''
      )
    `);
    console.log('  ✓ sample_inspection_report_item 表已创建');
  } else {
    console.log('  → sample_inspection_report_item 表已存在，跳过');
  }

  const [ix5]: any = await sequelize.query(
    `SELECT COUNT(*) as cnt FROM sys.indexes WHERE name = 'IX_sir_item' AND object_id = OBJECT_ID('sample_inspection_report_item')`
  );
  if (ix5[0].cnt === 0) {
    await sequelize.query('CREATE INDEX IX_sir_item ON sample_inspection_report_item(report_number, sort_order)');
    console.log('  ✓ IX_sir_item 索引已创建');
  }

  console.log('\n样件BOM与检测报告 迁移完成。');
}

// 直接运行
if (require.main === module) {
  runMigration()
    .then(() => process.exit(0))
    .catch(err => { console.error('迁移失败:', err); process.exit(1); });
}
