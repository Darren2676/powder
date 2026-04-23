-- ============================================================
-- MRP 物料需求计划系统 - 数据库迁移脚本
-- ============================================================

-- 1. item_master: 新增提前期字段
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('item_master') AND name = 'lead_time_days')
BEGIN
  ALTER TABLE item_master ADD lead_time_days INT DEFAULT 0;
  PRINT N'已新增 item_master.lead_time_days 字段';
END
GO

-- 2. Production_plan: 新增MRP状态追踪
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Production_plan') AND name = 'mrp_status')
BEGIN
  ALTER TABLE Production_plan ADD mrp_status NVARCHAR(20) NULL;
  PRINT N'已新增 Production_plan.mrp_status 字段';
END
GO

-- 3. 创建 mrp_run 表 (MRP运行记录)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'mrp_run')
BEGIN
  CREATE TABLE mrp_run (
    id                     INT IDENTITY(1,1) PRIMARY KEY,
    mrp_run_number         NVARCHAR(30) NOT NULL UNIQUE,
    run_date               DATETIME DEFAULT GETDATE(),
    run_by                 NVARCHAR(50),
    run_status             NVARCHAR(20) DEFAULT N'已计算',
    plan_count             INT DEFAULT 0,
    result_count           INT DEFAULT 0,
    production_order_count INT DEFAULT 0,
    purchase_req_count     INT DEFAULT 0,
    remark                 NVARCHAR(500),
    creation_date          NVARCHAR(30),
    creation_man           NVARCHAR(50)
  );
  PRINT N'已创建 mrp_run 表';
END
GO

-- 4. 创建 mrp_run_plan 表 (MRP关联的生产计划)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'mrp_run_plan')
BEGIN
  CREATE TABLE mrp_run_plan (
    id                      INT IDENTITY(1,1) PRIMARY KEY,
    mrp_run_number          NVARCHAR(30) NOT NULL,
    production_number       NVARCHAR(30) NOT NULL,
    item_number             NVARCHAR(50),
    item_name               NVARCHAR(100),
    planned_quantity        DECIMAL(18,4),
    planned_completion_time DATETIME
  );
  PRINT N'已创建 mrp_run_plan 表';
END
GO

-- 5. 创建 mrp_run_detail 表 (MRP计算结果明细)
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'mrp_run_detail')
BEGIN
  CREATE TABLE mrp_run_detail (
    id                       INT IDENTITY(1,1) PRIMARY KEY,
    mrp_run_number           NVARCHAR(30) NOT NULL,
    source_production_number NVARCHAR(30),
    bom_level                INT DEFAULT 0,
    parent_item_number       NVARCHAR(50),
    item_number              NVARCHAR(50),
    item_name                NVARCHAR(100),
    specifications           NVARCHAR(200),
    basic_unit               NVARCHAR(20),
    item_type                NVARCHAR(20),
    business_scope           NVARCHAR(50),
    mfg_bom_number           NVARCHAR(30),
    gross_requirement        DECIMAL(18,4),
    on_hand_inventory        DECIMAL(18,4),
    wip_quantity             DECIMAL(18,4),
    in_transit_po            DECIMAL(18,4),
    pending_pr               DECIMAL(18,4),
    safety_stock             DECIMAL(18,4),
    net_requirement          DECIMAL(18,4),
    planned_start_date       DATE,
    planned_due_date         DATE,
    lead_time_days           INT DEFAULT 0,
    action_type              NVARCHAR(20),
    result_status            NVARCHAR(20) DEFAULT N'待确认',
    generated_order_number   NVARCHAR(60),
    produce_quantity         DECIMAL(18,4),
    purchase_quantity        DECIMAL(18,4),
    bom_path                 NVARCHAR(500)
  );
  PRINT N'已创建 mrp_run_detail 表';
END
GO
