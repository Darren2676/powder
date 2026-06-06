import sequelize from '../config/database';
import User from './User';
import Factory from './Factory';
import UserFactoryAccess from './UserFactoryAccess';

// User <-> Notification (保留通知功能)
import Notification from './Notification';

User.hasMany(Notification, {
  foreignKey: 'user_id',
  as: 'notifications',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

Notification.belongsTo(User, {
  foreignKey: 'user_id',
  as: 'user',
  onDelete: 'NO ACTION',
  onUpdate: 'NO ACTION'
});

// ==================== Umzug 迁移框架 ====================
import { runPendingMigrations, getMigrationStatus } from '../config/umzug';

export const initDatabase = async () => {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');
    
    await sequelize.sync();
    console.log('数据库同步完成');

    // 手动执行待迁移项（避免 umzug process.exit 问题）
    try {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('process_task') AND name = 'is_backflush')
        BEGIN
          ALTER TABLE process_task ADD is_backflush BIT NOT NULL DEFAULT 0;
          PRINT 'is_backflush 字段已添加';
        END
      `);
      console.log('[手动迁移] process_task.is_backflush 检查完成');
    } catch (e) {
      console.warn('[手动迁移] is_backflush 跳过:', (e as any).message);
    }

    // stock_in 表添加 accounting_period 列（报废入库单会计期间）
    try {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'stock_in' AND COLUMN_NAME = 'accounting_period')
        BEGIN
          ALTER TABLE stock_in ADD accounting_period NVARCHAR(7) DEFAULT '';
          PRINT 'stock_in.accounting_period 字段已添加';
        END
      `);
      console.log('[手动迁移] stock_in.accounting_period 检查完成');
    } catch (e) {
      console.warn('[手动迁移] stock_in.accounting_period 跳过:', (e as any).message);
    }

    // nonconforming_product 表添加 defect_line_id 列（关联缺陷明细行）
    try {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'nonconforming_product' AND COLUMN_NAME = 'defect_line_id')
        BEGIN
          ALTER TABLE nonconforming_product ADD defect_line_id INT NULL;
          PRINT 'nonconforming_product.defect_line_id 字段已添加';
        END
      `);
      console.log('[手动迁移] nonconforming_product.defect_line_id 检查完成');
    } catch (e) {
      console.warn('[手动迁移] nonconforming_product.defect_line_id 跳过:', (e as any).message);
    }

    // [迁移089] 质量特性启用字段
    try {
      // item_master
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'item_master' AND COLUMN_NAME = 'enable_quality_chars')
        BEGIN
          ALTER TABLE item_master ADD enable_quality_chars NVARCHAR(10) DEFAULT N'N';
        END
      `);
      // incoming_inspect_plan
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'incoming_inspect_plan' AND COLUMN_NAME = 'enable_quality_chars')
        BEGIN
          ALTER TABLE incoming_inspect_plan ADD enable_quality_chars NVARCHAR(10) DEFAULT N'N';
        END
      `);
      // purchase_quality_inspection
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'purchase_quality_inspection' AND COLUMN_NAME = 'enable_quality_chars')
        BEGIN
          ALTER TABLE purchase_quality_inspection ADD enable_quality_chars NVARCHAR(10) DEFAULT N'N';
        END
      `);
      console.log('[手动迁移] enable_quality_chars 字段检查完成');
    } catch (e) {
      console.warn('[手动迁移] enable_quality_chars 跳过:', (e as any).message);
    }

    // 重置所有来料启用质量特性为不启用
    try {
      await sequelize.query(`UPDATE item_master SET enable_quality_chars = N'N' WHERE ISNULL(enable_quality_chars, N'N') != N'N'`);
      await sequelize.query(`UPDATE incoming_inspect_plan SET enable_quality_chars = N'N' WHERE ISNULL(enable_quality_chars, N'N') != N'N'`);
      await sequelize.query(`UPDATE purchase_quality_inspection SET enable_quality_chars = N'N' WHERE ISNULL(enable_quality_chars, N'N') != N'N'`);
      console.log('[手动迁移] 来料启用质量特性已全部重置为不启用');
    } catch (e) {
      console.warn('[手动迁移] 来料启用质量特性重置跳过:', (e as any).message);
    }

    // [迁移094] 生产检验质量特性启用字段
    try {
      // item_master 添加 enable_prod_quality_chars（生产检验专用，区别于来料的 enable_quality_chars）
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'item_master' AND COLUMN_NAME = 'enable_prod_quality_chars')
        BEGIN
          ALTER TABLE item_master ADD enable_prod_quality_chars NVARCHAR(10) DEFAULT N'N';
        END
      `);
      // inspection_spec 添加 enable_quality_chars
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'inspection_spec' AND COLUMN_NAME = 'enable_quality_chars')
        BEGIN
          ALTER TABLE inspection_spec ADD enable_quality_chars NVARCHAR(10) DEFAULT N'N';
        END
      `);
      // inspection_plan 添加 enable_quality_chars
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'inspection_plan' AND COLUMN_NAME = 'enable_quality_chars')
        BEGIN
          ALTER TABLE inspection_plan ADD enable_quality_chars NVARCHAR(10) DEFAULT N'N';
        END
      `);
      // production_inspection 添加 enable_quality_chars
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_inspection' AND COLUMN_NAME = 'enable_quality_chars')
        BEGIN
          ALTER TABLE production_inspection ADD enable_quality_chars NVARCHAR(10) DEFAULT N'N';
        END
      `);
      console.log('[手动迁移] 生产检验 enable_quality_chars 字段检查完成');
    } catch (e) {
      console.warn('[手动迁移] 生产检验 enable_quality_chars 跳过:', (e as any).message);
    }

    // 重置所有生产启用质量特性为不启用
    try {
      await sequelize.query(`UPDATE item_master SET enable_prod_quality_chars = N'N' WHERE ISNULL(enable_prod_quality_chars, N'N') != N'N'`);
      await sequelize.query(`UPDATE inspection_spec SET enable_quality_chars = N'N' WHERE ISNULL(enable_quality_chars, N'N') != N'N'`);
      await sequelize.query(`UPDATE inspection_plan SET enable_quality_chars = N'N' WHERE ISNULL(enable_quality_chars, N'N') != N'N'`);
      await sequelize.query(`UPDATE production_inspection SET enable_quality_chars = N'N' WHERE ISNULL(enable_quality_chars, N'N') != N'N'`);
      console.log('[手动迁移] 生产启用质量特性已全部重置为不启用');
    } catch (e) {
      console.warn('[手动迁移] 生产启用质量特性重置跳过:', (e as any).message);
    }

    // ===== 销售发票表 =====
    try {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'sales_invoice')
        CREATE TABLE sales_invoice (
          invoice_number NVARCHAR(30) NOT NULL PRIMARY KEY,
          invoice_code NVARCHAR(20) DEFAULT '',
          invoice_no NVARCHAR(20) DEFAULT '',
          invoice_type NVARCHAR(20) DEFAULT '',
          customer_number NVARCHAR(30) DEFAULT '',
          customer_name NVARCHAR(100) DEFAULT '',
          invoice_title NVARCHAR(200) DEFAULT '',
          tax_id NVARCHAR(30) DEFAULT '',
          invoice_address NVARCHAR(200) DEFAULT '',
          invoice_phone NVARCHAR(30) DEFAULT '',
          bank_name NVARCHAR(100) DEFAULT '',
          bank_account_number NVARCHAR(50) DEFAULT '',
          invoice_date DATE NULL,
          tax_rate DECIMAL(5,2) DEFAULT 0,
          amount_without_tax DECIMAL(18,2) DEFAULT 0,
          tax_amount DECIMAL(18,2) DEFAULT 0,
          amount_with_tax DECIMAL(18,2) DEFAULT 0,
          currency_code NVARCHAR(10) DEFAULT 'CNY',
          remark NVARCHAR(500) DEFAULT '',
          approval_status NVARCHAR(20) DEFAULT N'草稿',
          created_by NVARCHAR(50) DEFAULT '',
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE()
        )
      `);
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'sales_invoice_line')
        CREATE TABLE sales_invoice_line (
          id INT IDENTITY(1,1) PRIMARY KEY,
          invoice_number NVARCHAR(30) NOT NULL,
          line_number INT DEFAULT 0,
          shipping_order_number NVARCHAR(30) DEFAULT '',
          shipping_detail_id INT DEFAULT 0,
          sales_order_number NVARCHAR(30) DEFAULT '',
          sales_detail_id INT DEFAULT 0,
          item_number NVARCHAR(30) DEFAULT '',
          item_name NVARCHAR(100) DEFAULT '',
          specifications NVARCHAR(100) DEFAULT '',
          basic_unit NVARCHAR(10) DEFAULT '',
          ship_quantity DECIMAL(18,2) DEFAULT 0,
          invoice_quantity DECIMAL(18,2) DEFAULT 0,
          unit_price DECIMAL(18,4) DEFAULT 0,
          amount_without_tax DECIMAL(18,2) DEFAULT 0,
          tax_rate DECIMAL(5,2) DEFAULT 0,
          tax_amount DECIMAL(18,2) DEFAULT 0,
          amount_with_tax DECIMAL(18,2) DEFAULT 0,
          remark NVARCHAR(200) DEFAULT ''
        )
      `);
      // 索引
      try { await sequelize.query('CREATE INDEX IX_sales_invoice_customer ON sales_invoice(customer_number)'); } catch{}
      try { await sequelize.query('CREATE INDEX IX_sales_invoice_line_invoice ON sales_invoice_line(invoice_number)'); } catch{}
      try { await sequelize.query('CREATE INDEX IX_sales_invoice_line_shipping_detail ON sales_invoice_line(shipping_detail_id)'); } catch{}
      try { await sequelize.query('CREATE INDEX IX_sales_invoice_line_sales_detail ON sales_invoice_line(sales_detail_id)'); } catch{}
      try { await sequelize.query('CREATE INDEX IX_sales_invoice_line_shipping_order ON sales_invoice_line(shipping_order_number)'); } catch{}
      console.log('[手动迁移] sales_invoice + sales_invoice_line 表检查完成');
    } catch (e) {
      console.warn('[手动迁移] sales_invoice 跳过:', (e as any).message);
    }

    // ===== shipping_order_detail.invoice_status =====
    try {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'shipping_order_detail' AND COLUMN_NAME = 'invoice_status')
        ALTER TABLE shipping_order_detail ADD invoice_status NVARCHAR(20) DEFAULT N'未开票';
      `);
      // ===== sales_order_detail.invoice_status =====
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_order_detail' AND COLUMN_NAME = 'invoice_status')
        ALTER TABLE sales_order_detail ADD invoice_status NVARCHAR(20) DEFAULT N'未开票';
      `);
      console.log('[手动迁移] invoice_status 字段检查完成');
    } catch (e) {
      console.warn('[手动迁移] invoice_status 跳过:', (e as any).message);
    }

    // ===== [迁移090] 采购发票表 =====
    try {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'purchase_invoice')
        CREATE TABLE purchase_invoice (
          invoice_number NVARCHAR(30) NOT NULL PRIMARY KEY,
          invoice_code NVARCHAR(30) DEFAULT '',
          invoice_no NVARCHAR(30) DEFAULT '',
          invoice_type NVARCHAR(30) DEFAULT '',
          supplier_number NVARCHAR(50) DEFAULT '',
          supplier_name NVARCHAR(200) DEFAULT '',
          invoice_title NVARCHAR(200) DEFAULT '',
          tax_id NVARCHAR(30) DEFAULT '',
          invoice_address NVARCHAR(200) DEFAULT '',
          invoice_phone NVARCHAR(30) DEFAULT '',
          bank_name NVARCHAR(100) DEFAULT '',
          bank_account_number NVARCHAR(50) DEFAULT '',
          invoice_date DATE NULL,
          tax_rate DECIMAL(5,2) DEFAULT 0,
          amount_without_tax DECIMAL(18,2) DEFAULT 0,
          tax_amount DECIMAL(18,2) DEFAULT 0,
          amount_with_tax DECIMAL(18,2) DEFAULT 0,
          currency_code NVARCHAR(10) DEFAULT 'CNY',
          remark NVARCHAR(500) DEFAULT '',
          approval_status NVARCHAR(20) DEFAULT N'草稿',
          created_by NVARCHAR(50) DEFAULT '',
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE()
        )
      `);
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'purchase_invoice_line')
        CREATE TABLE purchase_invoice_line (
          id INT IDENTITY(1,1) PRIMARY KEY,
          invoice_number NVARCHAR(30) NOT NULL,
          line_number INT DEFAULT 0,
          stock_in_number NVARCHAR(30) DEFAULT '',
          stock_in_detail_id INT DEFAULT 0,
          purchase_order_number NVARCHAR(30) DEFAULT '',
          purchase_detail_id INT DEFAULT 0,
          item_number NVARCHAR(100) DEFAULT '',
          item_name NVARCHAR(200) DEFAULT '',
          specifications NVARCHAR(200) DEFAULT '',
          basic_unit NVARCHAR(50) DEFAULT '',
          stock_in_quantity DECIMAL(18,4) DEFAULT 0,
          invoice_quantity DECIMAL(18,4) DEFAULT 0,
          unit_price DECIMAL(18,4) DEFAULT 0,
          amount_without_tax DECIMAL(18,2) DEFAULT 0,
          tax_rate DECIMAL(5,2) DEFAULT 0,
          tax_amount DECIMAL(18,2) DEFAULT 0,
          amount_with_tax DECIMAL(18,2) DEFAULT 0,
          remark NVARCHAR(500) DEFAULT ''
        )
      `);
      // stock_in_detail.invoice_status
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'stock_in_detail' AND COLUMN_NAME = 'invoice_status')
        ALTER TABLE stock_in_detail ADD invoice_status NVARCHAR(20) DEFAULT N'未开票'
      `);
      // purchase_order_detail.invoice_status
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'purchase_order_detail' AND COLUMN_NAME = 'invoice_status')
        ALTER TABLE purchase_order_detail ADD invoice_status NVARCHAR(20) DEFAULT N'未开票'
      `);
      console.log('[手动迁移] 090 采购发票表检查完成');
    } catch (e) {
      console.warn('[手动迁移] 090 采购发票表跳过:', (e as any).message);
    }

    // ===== sales_order_detail.tax_rate =====
    try {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_order_detail' AND COLUMN_NAME = 'tax_rate')
        ALTER TABLE sales_order_detail ADD tax_rate DECIMAL(10,4) DEFAULT 0;
      `);
      console.log('[手动迁移] sales_order_detail.tax_rate 字段检查完成');
    } catch (e) {
      console.warn('[手动迁移] sales_order_detail.tax_rate 跳过:', (e as any).message);
    }

    // ===== sales_invoice_line.tax_inclusive_price =====
    try {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'sales_invoice_line' AND COLUMN_NAME = 'tax_inclusive_price')
        ALTER TABLE sales_invoice_line ADD tax_inclusive_price DECIMAL(18,4) DEFAULT 0;
      `);
      console.log('[手动迁移] sales_invoice_line.tax_inclusive_price 字段检查完成');
    } catch (e) {
      console.warn('[手动迁移] sales_invoice_line.tax_inclusive_price 跳过:', (e as any).message);
    }

    // ===== 重算发货明细行开票状态（历史数据修复）=====
    try {
      // 重算 shipping_order_detail.invoice_status
      await sequelize.query(`
        UPDATE sod SET sod.invoice_status = CASE
          WHEN ISNULL(inv.invoiced_qty, 0) >= sod.quantity THEN N'已开票'
          WHEN ISNULL(inv.invoiced_qty, 0) > 0 THEN N'部分开票'
          ELSE N'未开票'
        END
        FROM shipping_order_detail sod
        LEFT JOIN (
          SELECT sil.shipping_detail_id, SUM(sil.invoice_quantity) as invoiced_qty
          FROM sales_invoice_line sil
          INNER JOIN sales_invoice si ON si.invoice_number = sil.invoice_number
          WHERE si.approval_status = N'已审批'
          GROUP BY sil.shipping_detail_id
        ) inv ON inv.shipping_detail_id = sod.id
      `);
      // 重算 sales_order_detail.invoice_status
      await sequelize.query(`
        UPDATE sod SET sod.invoice_status = CASE
          WHEN ISNULL(inv.invoiced_qty, 0) >= sod.order_quantity THEN N'已开票'
          WHEN ISNULL(inv.invoiced_qty, 0) > 0 THEN N'部分开票'
          ELSE N'未开票'
        END
        FROM sales_order_detail sod
        LEFT JOIN (
          SELECT sil.sales_detail_id, SUM(sil.invoice_quantity) as invoiced_qty
          FROM sales_invoice_line sil
          INNER JOIN sales_invoice si ON si.invoice_number = sil.invoice_number
          WHERE si.approval_status = N'已审批'
          GROUP BY sil.sales_detail_id
        ) inv ON inv.sales_detail_id = sod.id
      `);
      console.log('[手动迁移] 开票状态全量重算完成');
    } catch (e) {
      console.warn('[手动迁移] 开票状态重算跳过:', (e as any).message);
    }

    // ===== [多工厂] factory 工厂定义表 =====
    try {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'factory')
        CREATE TABLE factory (
          id INT IDENTITY(1,1) PRIMARY KEY,
          factory_code NVARCHAR(10) NOT NULL,
          factory_name NVARCHAR(100) NOT NULL,
          factory_short NVARCHAR(20) DEFAULT '',
          address NVARCHAR(200) DEFAULT '',
          contact_name NVARCHAR(50) DEFAULT '',
          contact_phone NVARCHAR(30) DEFAULT '',
          is_headquarters BIT DEFAULT 0,
          status NVARCHAR(10) DEFAULT N'启用',
          created_at DATETIME DEFAULT GETDATE(),
          updated_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT UQ_factory_code UNIQUE (factory_code)
        )
      `);
      console.log('[多工厂迁移] factory 表检查完成');
    } catch (e) {
      console.warn('[多工厂迁移] factory 表跳过:', (e as any).message);
    }

    // 种子数据：两个工厂（N=宁国工厂, G=广州工厂）
    try {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM factory WHERE factory_code = 'N')
        INSERT INTO factory (factory_code, factory_name, factory_short, is_headquarters, status, created_at, updated_at) VALUES ('N', N'宁国工厂', N'宁国', 1, N'启用', GETDATE(), GETDATE());
      `);
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM factory WHERE factory_code = 'G')
        INSERT INTO factory (factory_code, factory_name, factory_short, is_headquarters, status, created_at, updated_at) VALUES ('G', N'广州工厂', N'广州', 0, N'启用', GETDATE(), GETDATE());
      `);
      console.log('[多工厂迁移] 工厂种子数据检查完成');
    } catch (e) {
      console.warn('[多工厂迁移] 工厂种子数据跳过:', (e as any).message);
    }

    // ===== [多工厂] users.default_factory_id =====
    try {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'default_factory_id')
        BEGIN
          ALTER TABLE users ADD default_factory_id INT NULL;
          PRINT 'users.default_factory_id 字段已添加';
        END
      `);
      // 已有用户归入宁国工厂（factory_id=1）
      await sequelize.query(`
        IF EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'users' AND COLUMN_NAME = 'default_factory_id')
        UPDATE users SET default_factory_id = (SELECT id FROM factory WHERE factory_code = 'N') WHERE default_factory_id IS NULL;
      `);
      console.log('[多工厂迁移] users.default_factory_id 检查完成');
    } catch (e) {
      console.warn('[多工厂迁移] users.default_factory_id 跳过:', (e as any).message);
    }

    // ===== [多工厂] user_factory_access 表 =====
    try {
      await sequelize.query(`
        IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'user_factory_access')
        CREATE TABLE user_factory_access (
          id INT IDENTITY(1,1) PRIMARY KEY,
          user_id INT NOT NULL,
          factory_id INT NOT NULL,
          access_level NVARCHAR(20) DEFAULT 'read',
          is_default BIT DEFAULT 0,
          created_by INT NULL,
          created_at DATETIME DEFAULT GETDATE(),
          CONSTRAINT UQ_user_factory UNIQUE (user_id, factory_id)
        )
      `);
      console.log('[多工厂迁移] user_factory_access 表检查完成');
    } catch (e) {
      console.warn('[多工厂迁移] user_factory_access 表跳过:', (e as any).message);
    }

    // ===== [多工厂] 业务表 factory_id 字段批量迁移 =====
    // 决策3: 物料/BOM 不隔离（item_master, bom_*, routing_* 等不加 factory_id）
    try {
      const transactionalTables = [
        // ── 销售域 ──
        'sales_order', 'sales_order_detail',
        'sales_forecast', 'sales_forecast_detail',
        'shipping_order', 'shipping_order_detail', 'shipping_order_batch',
        'shipping_request', 'shipping_request_detail',
        'sales_invoice', 'sales_invoice_line',
        'return_order', 'return_order_detail', 'return_order_batch',
        'sales_price_list', 'sales_price_list_detail',
        // ── 计划域 ──
        'production_plan', 'forecast_consumption', 'plan_status',
        // ── 生产域 ──
        'production_order',
        'production_inbound_order', 'production_inbound_order_detail',
        'semi_production_inbound_order', 'semi_production_inbound_order_detail',
        'process_task', 'work_report',
        'backflush_task', 'backflush_deduction_log',
        'rework_order',
        'piece_rate_wage_header', 'piece_rate_wage_detail',
        'production_material_cost_snapshot',
        // ── 采购域 ──
        'purchase_order', 'purchase_order_detail',
        'purchase_req', 'purchase_req_detail',
        'purchase_invoice', 'purchase_invoice_line',
        'purchase_receiving_notice', 'purchase_receiving_notice_detail',
        'purchase_return', 'purchase_return_detail',
        'purchase_price_list', 'purchase_price_list_detail',
        // ── 仓储域 ──
        'stock_in', 'stock_in_detail',
        'material_batch_inventory',
        'finished_goods_inventory', 'finished_batch_inventory',
        'packing_box_inventory', 'packing_order',
        'stock_count', 'stock_count_detail',
        'batch_traceability',
        'scrap_disposal', 'scrap_disposal_detail',
        // ── 质量域 ──
        'purchase_quality_inspection', 'purchase_quality_inspection_detail', 'purchase_inspection_defect',
        'production_inspection', 'production_inspection_defect', 'production_inspection_item',
        'incoming_inspect_plan', 'inspection_plan', 'inspection_spec',
        'nonconforming_product',
        'sample_request', 'sample_request_item', 'sample_request_lab',
        'sample_inspection_report', 'sample_inspection_report_item',
        // ── 外包域 ──
        'outsourcing_order',
        'outsourcing_req', 'outsourcing_req_detail',
        'outsourcing_material_issue', 'outsourcing_material_issue_detail',
        'outsourcing_receipt', 'outsourcing_receipt_detail',
        'outsourcing_return_stockin', 'outsourcing_return_stockin_detail',
        'outsourcing_settlement',
        'outsourcing_inspection', 'outsourcing_inspection_detail',
        'outsourcing_price_list', 'outsourcing_price_list_detail',
        // ── 财务域 ──
        'expense_claim', 'expense_claim_item',
        // ── 设备域 ──
        'equipment_downtime', 'equipment_maintenance_plan', 'equipment_oee',
        // ── 工程变更域 ──
        'engineering_change_lifecycle', 'engineering_change_log',
        // ── 鑫合韵集成 ──
        'xhy_inspect_line', 'xhy_inspect_record',
        'xhy_inventory_transaction', 'xhy_inventory_transaction_detail',
        // ── 其他 ──
        'abnormal_io_request', 'abnormal_io_request_detail',
      ];

      let addedCount = 0;
      let skippedCount = 0;

      for (const tableName of transactionalTables) {
        try {
          // 检查表是否存在
          const tableCheck: any = await sequelize.query(
            `SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = :tn`,
            { replacements: { tn: tableName }, type: 'SELECT' }
          );
          if (tableCheck.length === 0) continue; // 表不存在则跳过

          // 添加 factory_id 字段
          await sequelize.query(`
            IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}' AND COLUMN_NAME = 'factory_id')
            BEGIN
              ALTER TABLE [${tableName}] ADD factory_id INT NULL;
              PRINT '${tableName}.factory_id 已添加';
            END
          `);

          // 尝试创建索引（加速按工厂过滤）
          try {
            await sequelize.query(`
              IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_${tableName}_factory_id' AND OBJECT_NAME(object_id) = '${tableName}')
              CREATE INDEX IX_${tableName}_factory_id ON [${tableName}](factory_id);
            `);
          } catch { /* 索引可能已存在 */ }

          addedCount++;
        } catch (e: any) {
          skippedCount++;
        }
      }

      console.log(`[多工厂迁移] 业务表 factory_id: ${addedCount} 张表已处理, ${skippedCount} 张跳过`);
    } catch (e) {
      console.warn('[多工厂迁移] 业务表 factory_id 批量迁移跳过:', (e as any).message);
    }

    // ===== [多工厂] factory_id DEFAULT 约束（安全网：未注入时默认宁国工厂=1） =====
    try {
      const defaultTables = [
        'sales_order', 'purchase_order', 'production_order', 'process_task',
        'stock_in', 'material_batch_inventory', 'finished_goods_inventory',
        'shipping_order', 'purchase_quality_inspection', 'production_inspection',
        'work_report', 'expense_claim', 'purchase_req', 'sales_forecast',
        'production_plan', 'return_order', 'scrap_disposal', 'stock_count',
        'outsourcing_order', 'outsourcing_req', 'outsourcing_receipt',
        'inspection_plan', 'inspection_spec', 'incoming_inspect_plan', 'nonconforming_product', 'backflush_task',
        'rework_order', 'batch_traceability', 'packing_order',
        'purchase_receiving_notice', 'purchase_return', 'equipment_downtime',
        'engineering_change_lifecycle', 'abnormal_io_request'
      ];

      let defaultCount = 0;
      for (const tableName of defaultTables) {
        try {
          // 检查表和列是否都存在
          const colCheck: any = await sequelize.query(
            `SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tableName}' AND COLUMN_NAME = 'factory_id'`,
            { type: 'SELECT' }
          );
          if (colCheck.length === 0) continue;

          // 添加 DEFAULT 约束（如果不存在）
          const constraintName = `DF_${tableName}_factory_id`;
          await sequelize.query(`
            IF NOT EXISTS (SELECT 1 FROM sys.default_constraints WHERE name = '${constraintName}')
            BEGIN
              ALTER TABLE [${tableName}] ADD CONSTRAINT ${constraintName} DEFAULT 1 FOR factory_id;
            END
          `);
          defaultCount++;
        } catch { /* 约束可能已存在 */ }
      }
      console.log(`[多工厂迁移] factory_id DEFAULT 约束: ${defaultCount} 张表已处理`);
    } catch (e) {
      console.warn('[多工厂迁移] factory_id DEFAULT 约束跳过:', (e as any).message);
    }

    // 暂时禁用 umzug 迁移（迁移脚本中有 process.exit() 会导致服务器退出）
    // TODO: 修复所有迁移脚本中的 process.exit() 调用后重新启用
    console.log('[迁移] 跳过 umzug 迁移（已修复 process.exit 问题后启用）');
    // const status = await getMigrationStatus();
    // console.log(`[迁移] 已执行: ${status.executed.length}, 待执行: ${status.pending.length}`);
    // if (status.pending.length > 0) {
    //   await runPendingMigrations();
    // }

  } catch (error) {
    console.error('数据库初始化失败:', error);
    throw error;
  }
};

export {
  sequelize,
  User,
  Notification,
  Factory,
  UserFactoryAccess
};
