import sequelize from '../src/config/database';

(async () => {
  try {
    // 检查表是否存在
    const [r]: any = await sequelize.query(
      "SELECT COUNT(*) as cnt FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'production_material_cost_snapshot'"
    );
    const exists = r[0].cnt > 0;
    console.log('Table exists:', exists);

    if (!exists) {
      console.log('Creating table...');
      await sequelize.query(`
        CREATE TABLE production_material_cost_snapshot (
          id INT IDENTITY(1,1) PRIMARY KEY,
          snapshot_number NVARCHAR(30) NOT NULL,
          production_order_number NVARCHAR(30) NOT NULL,
          preparation_number NVARCHAR(30) NOT NULL,
          issue_number NVARCHAR(30) NOT NULL,
          material_number NVARCHAR(50) NOT NULL,
          material_name NVARCHAR(200),
          material_type NVARCHAR(50),
          unit NVARCHAR(20),
          issued_quantity DECIMAL(18,4) NOT NULL,
          standard_cost DECIMAL(18,4),
          material_cost DECIMAL(18,4),
          cost_list_number NVARCHAR(30),
          cost_list_name NVARCHAR(100),
          has_cost BIT DEFAULT 0,
          step_number INT,
          work_center_name NVARCHAR(100),
          source_type NVARCHAR(20) NOT NULL DEFAULT '领料',
          source_number NVARCHAR(30) NOT NULL,
          creation_date DATETIME DEFAULT GETDATE(),
          creation_man NVARCHAR(50),
          remark NVARCHAR(500)
        )
      `);
      await sequelize.query('CREATE INDEX idx_pmcs_production_order ON production_material_cost_snapshot(production_order_number)');
      await sequelize.query('CREATE INDEX idx_pmcs_issue_number ON production_material_cost_snapshot(issue_number)');
      await sequelize.query('CREATE INDEX idx_pmcs_source ON production_material_cost_snapshot(source_type, source_number)');
      console.log('Table created successfully');
    }

    const [d]: any = await sequelize.query('SELECT COUNT(*) as cnt FROM production_material_cost_snapshot');
    console.log('Current row count:', d[0].cnt);

    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
})();
