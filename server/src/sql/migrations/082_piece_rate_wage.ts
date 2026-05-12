// 计件工资管理：piece_rate_wage_header + piece_rate_wage_detail
import { QueryInterface } from 'sequelize';
import sequelize from '../../config/database';

export async function up(queryInterface: QueryInterface, seq: any): Promise<void> {
  // 1. 创建 piece_rate_wage_header 表
  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'piece_rate_wage_header')
    BEGIN
      CREATE TABLE piece_rate_wage_header (
        wage_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        wage_name NVARCHAR(100) NOT NULL DEFAULT '',
        period_type NVARCHAR(10) NOT NULL DEFAULT N'月',
        period_start DATE NOT NULL,
        period_end DATE NOT NULL,
        total_qualified_wage DECIMAL(18,2) DEFAULT 0,
        total_defective_wage DECIMAL(18,2) DEFAULT 0,
        total_wage DECIMAL(18,2) DEFAULT 0,
        detail_count INT DEFAULT 0,
        calculation_status NVARCHAR(20) DEFAULT N'未计算',
        approval_status NVARCHAR(20) DEFAULT N'草稿',
        remark NVARCHAR(500) DEFAULT '',
        creation_date NVARCHAR(20) DEFAULT '',
        creation_man NVARCHAR(50) DEFAULT ''
      );
      CREATE INDEX idx_prwh_status ON piece_rate_wage_header(approval_status);
      CREATE INDEX idx_prwh_period ON piece_rate_wage_header(period_start, period_end);
      CREATE INDEX idx_prwh_period_type ON piece_rate_wage_header(period_type);
    END
  `);

  // 2. 创建 piece_rate_wage_detail 表
  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'piece_rate_wage_detail')
    BEGIN
      CREATE TABLE piece_rate_wage_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        wage_number NVARCHAR(50) NOT NULL,
        line_number INT DEFAULT 0,
        work_report_number NVARCHAR(50) NOT NULL DEFAULT '',
        process_task_number NVARCHAR(50) DEFAULT '',
        production_order_number NVARCHAR(50) DEFAULT '',
        item_number NVARCHAR(50) NOT NULL DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        standard_process_number NVARCHAR(50) DEFAULT '',
        standard_process_name NVARCHAR(200) DEFAULT '',
        equipment_number NVARCHAR(50) DEFAULT '',
        equipment_name NVARCHAR(200) DEFAULT '',
        employee_number NVARCHAR(50) DEFAULT '',
        employee_name NVARCHAR(200) DEFAULT '',
        report_date NVARCHAR(50) DEFAULT '',
        qualified_quantity DECIMAL(18,4) DEFAULT 0,
        unqualified_quantity DECIMAL(18,4) DEFAULT 0,
        qualified_piece_rate DECIMAL(18,6) DEFAULT 0,
        defective_piece_rate DECIMAL(18,6) DEFAULT 0,
        qualified_wage DECIMAL(18,2) DEFAULT 0,
        defective_wage DECIMAL(18,2) DEFAULT 0,
        line_wage DECIMAL(18,2) DEFAULT 0,
        price_list_number NVARCHAR(50) DEFAULT '',
        price_list_line_number INT DEFAULT 0
      );
      CREATE INDEX idx_prwd_header ON piece_rate_wage_detail(wage_number);
      CREATE INDEX idx_prwd_employee ON piece_rate_wage_detail(employee_number);
      CREATE INDEX idx_prwd_work_report ON piece_rate_wage_detail(work_report_number);
    END
  `);

  console.log('[Migration 082] piece_rate_wage_header + detail created');
}

export async function down(): Promise<void> {
  await sequelize.query(`DROP TABLE IF EXISTS piece_rate_wage_detail`);
  await sequelize.query(`DROP TABLE IF EXISTS piece_rate_wage_header`);
}
