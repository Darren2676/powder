/**
 * 手动执行迁移 092 和 093：创建退料表 + material_issue 增加 source_type
 * 
 * 执行方式: npx tsx server/scripts/run-migration-092-093.ts
 */

import sequelize from '../src/config/database';

async function main() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // ========== 迁移 092：创建 material_return 表 ==========
    const [mrTable]: any = await sequelize.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'material_return'`
    );
    if (mrTable.length === 0) {
      console.log('创建 material_return 表...');
      await sequelize.query(`
        CREATE TABLE material_return (
          id INT IDENTITY(1,1) PRIMARY KEY,
          return_number NVARCHAR(30) NOT NULL,
          production_order_number NVARCHAR(30) NOT NULL,
          preparation_number NVARCHAR(30) NOT NULL,
          issue_number NVARCHAR(30) NOT NULL,
          return_status NVARCHAR(20) NOT NULL DEFAULT '已退料',
          total_return_items INT DEFAULT 0,
          remark NVARCHAR(500),
          creation_date DATETIME DEFAULT GETDATE(),
          creation_man NVARCHAR(50)
        )
      `);
      console.log('material_return 表创建成功');
    } else {
      console.log('material_return 表已存在，跳过');
    }

    const [mrdTable]: any = await sequelize.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'material_return_detail'`
    );
    if (mrdTable.length === 0) {
      console.log('创建 material_return_detail 表...');
      await sequelize.query(`
        CREATE TABLE material_return_detail (
          id INT IDENTITY(1,1) PRIMARY KEY,
          return_number NVARCHAR(30) NOT NULL,
          line_number INT,
          material_number NVARCHAR(50) NOT NULL,
          material_name NVARCHAR(200),
          material_type NVARCHAR(50),
          unit NVARCHAR(20),
          return_quantity DECIMAL(18,4) NOT NULL,
          batch_number NVARCHAR(50),
          step_number INT,
          work_center_name NVARCHAR(100),
          default_warehouse NVARCHAR(30),
          remark NVARCHAR(500)
        )
      `);
      console.log('material_return_detail 表创建成功');
    } else {
      console.log('material_return_detail 表已存在，跳过');
    }

    // 索引
    const [mrIdx1]: any = await sequelize.query(
      `SELECT name FROM sys.indexes WHERE name = 'idx_mr_production_order'`
    );
    if (mrIdx1.length === 0) {
      await sequelize.query(`CREATE INDEX idx_mr_production_order ON material_return(production_order_number)`);
      console.log('索引 idx_mr_production_order 创建成功');
    }

    const [mrIdx2]: any = await sequelize.query(
      `SELECT name FROM sys.indexes WHERE name = 'idx_mr_issue_number'`
    );
    if (mrIdx2.length === 0) {
      await sequelize.query(`CREATE INDEX idx_mr_issue_number ON material_return(issue_number)`);
      console.log('索引 idx_mr_issue_number 创建成功');
    }

    const [mrdIdx1]: any = await sequelize.query(
      `SELECT name FROM sys.indexes WHERE name = 'idx_mrd_return_number'`
    );
    if (mrdIdx1.length === 0) {
      await sequelize.query(`CREATE INDEX idx_mrd_return_number ON material_return_detail(return_number)`);
      console.log('索引 idx_mrd_return_number 创建成功');
    }

    // ========== 迁移 093：material_issue 增加 source_type ==========
    const [colCheck]: any = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'material_issue' AND COLUMN_NAME = 'source_type'`
    );
    if (colCheck.length === 0) {
      console.log('添加 material_issue.source_type 字段...');
      await sequelize.query(`ALTER TABLE material_issue ADD source_type NVARCHAR(20) DEFAULT '领料'`);
      console.log('source_type 字段添加成功');
    } else {
      console.log('source_type 字段已存在，跳过');
    }

    // 回填 source_type
    const [nullRows]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM material_issue WHERE source_type IS NULL OR source_type = ''`
    );
    const count = nullRows[0].cnt;
    if (count > 0) {
      await sequelize.query(`UPDATE material_issue SET source_type = N'领料' WHERE source_type IS NULL OR source_type = ''`);
      console.log(`回填 source_type='领料': ${count} 条记录`);
    } else {
      console.log('source_type 无需回填');
    }

    console.log('\n迁移 092+093 执行完成!');
    process.exit(0);
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

main();
