/**
 * 创建报废仓处置相关表
 * 运行: node src/sql/migrations/050_create_scrap_disposal.js
 */
require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '1433'),
    dialect: 'mssql',
    logging: false,
    dialectOptions: {
      options: {
        encrypt: false,
        trustServerCertificate: true
      }
    }
  }
);

async function createTables() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // 1. 报废处置单头
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'scrap_disposal')
      BEGIN
        CREATE TABLE scrap_disposal (
          id INT IDENTITY(1,1) PRIMARY KEY,
          disposal_number NVARCHAR(50) NOT NULL,
          warehouse_number NVARCHAR(50) DEFAULT '',
          warehouse_name NVARCHAR(200) DEFAULT '',
          disposal_reason NVARCHAR(500) DEFAULT '',
          remark NVARCHAR(500) DEFAULT '',
          status NVARCHAR(20) DEFAULT N'待确认',
          operator NVARCHAR(100) DEFAULT '',
          creation_date DATETIME DEFAULT GETDATE(),
          confirmed_by NVARCHAR(100) DEFAULT '',
          confirmed_date DATETIME NULL,
          confirm_remark NVARCHAR(500) DEFAULT '',
          accounting_period NVARCHAR(7) DEFAULT '',
          CONSTRAINT UQ_sd_disposal_number UNIQUE (disposal_number)
        );
        CREATE INDEX IX_sd_status ON scrap_disposal(status);
        CREATE INDEX IX_sd_creation_date ON scrap_disposal(creation_date);
        PRINT '表 scrap_disposal 创建成功';
      END
      ELSE
        PRINT '表 scrap_disposal 已存在';
    `);

    // 2. 报废处置明细行
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'scrap_disposal_detail')
      BEGIN
        CREATE TABLE scrap_disposal_detail (
          id INT IDENTITY(1,1) PRIMARY KEY,
          disposal_number NVARCHAR(50) NOT NULL,
          line_number INT DEFAULT 10,
          item_number NVARCHAR(100) NOT NULL,
          item_name NVARCHAR(200) DEFAULT '',
          specifications NVARCHAR(200) DEFAULT '',
          basic_unit NVARCHAR(50) DEFAULT '',
          product_drawing_number NVARCHAR(100) DEFAULT '',
          quantity DECIMAL(18,4) DEFAULT 0,
          batch_number NVARCHAR(50) DEFAULT '',
          remark NVARCHAR(500) DEFAULT ''
        );
        CREATE INDEX IX_sdd_disposal ON scrap_disposal_detail(disposal_number);
        CREATE INDEX IX_sdd_item ON scrap_disposal_detail(item_number);
        PRINT '表 scrap_disposal_detail 创建成功';
      END
      ELSE
        PRINT '表 scrap_disposal_detail 已存在';
    `);

    // 3. 添加菜单权限
    // 查找报废仓处置应挂在哪个父菜单下（仓库管理域）
    const warehouseMenusResult = await sequelize.query(
      `SELECT id, parent_id FROM permission WHERE permission_code = 'fg-abnormal-io'`
    );
    const warehouseMenus = warehouseMenusResult[0];

    if (warehouseMenus.length > 0) {
      // 在"其他出入库"同级别下添加"报废仓处置"菜单
      const parentId = warehouseMenus[0].parent_id;
      const existingMenuResult = await sequelize.query(
        `SELECT id FROM permission WHERE permission_code = 'scrap-disposal'`
      );
      const existingMenu = existingMenuResult[0];

      if (existingMenu.length === 0) {
        // 获取当前同级最大sort_order
        const maxSortResult = await sequelize.query(
          `SELECT ISNULL(MAX(sort_order), 0) as max_sort FROM permission WHERE parent_id = :parentId`,
          { replacements: { parentId } }
        );
        const maxSort = maxSortResult[0];
        const nextSort = (maxSort[0]?.max_sort || 0) + 1;

        await sequelize.query(`
          INSERT INTO permission (name, permission_code, type, route, icon, parent_id, sort_order, status, component)
          VALUES (N'报废仓处置', N'scrap-disposal', N'menu', N'/scrap-disposal', N'scissor', :parentId, :sortOrder, 1, N'warehouse/ScrapDisposal/List.vue')
        `, { replacements: { parentId, sortOrder: nextSort } });
        console.log('菜单权限"报废仓处置"添加成功');
      } else {
        console.log('菜单权限"报废仓处置"已存在');
      }
    } else {
      console.log('未找到仓库管理父菜单，跳过菜单权限添加');
    }

    console.log('所有操作完成');
  } catch (error) {
    console.error('操作失败:', error);
  } finally {
    await sequelize.close();
  }
}

createTables();
