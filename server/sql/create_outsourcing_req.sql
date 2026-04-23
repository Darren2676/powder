-- ============================================================
-- 工序委外申请系统 - 数据库迁移脚本
-- ============================================================

-- Step 1: 创建委外申请单头表
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('outsourcing_req') AND type = 'U')
BEGIN
  CREATE TABLE outsourcing_req (
    outsourcing_req_number NVARCHAR(50) NOT NULL PRIMARY KEY,
    production_order_number NVARCHAR(50) NULL,
    production_number NVARCHAR(50) NULL,
    item_number NVARCHAR(50) NULL,
    item_name NVARCHAR(200) NULL,
    specifications NVARCHAR(200) NULL,
    basic_unit NVARCHAR(20) NULL,
    planned_quantity DECIMAL(18,4) DEFAULT 0,
    approval_status NVARCHAR(20) DEFAULT N'草稿',
    order_status NVARCHAR(20) DEFAULT N'未执行',
    remark NVARCHAR(500) NULL,
    creation_date NVARCHAR(30) NULL,
    creation_man NVARCHAR(50) NULL
  );

  CREATE INDEX idx_osr_production_order ON outsourcing_req (production_order_number);
  CREATE INDEX idx_osr_approval_status ON outsourcing_req (approval_status);
END
GO

-- Step 2: 创建委外申请明细表
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('outsourcing_req_detail') AND type = 'U')
BEGIN
  CREATE TABLE outsourcing_req_detail (
    id INT IDENTITY(1,1) PRIMARY KEY,
    outsourcing_req_number NVARCHAR(50) NOT NULL,
    line_number INT NULL,
    process_task_number NVARCHAR(50) NULL,
    step_number INT NULL,
    standard_process_number NVARCHAR(50) NULL,
    standard_process_name NVARCHAR(100) NULL,
    work_center_number NVARCHAR(50) NULL,
    work_center_name NVARCHAR(100) NULL,
    planned_quantity DECIMAL(18,4) DEFAULT 0,
    ordered_quantity DECIMAL(18,4) DEFAULT 0,
    suggested_supplier_number NVARCHAR(50) NULL,
    suggested_supplier_name NVARCHAR(200) NULL,
    status NVARCHAR(20) DEFAULT N'未执行',
    remark NVARCHAR(500) NULL
  );

  CREATE INDEX idx_osr_detail_req ON outsourcing_req_detail (outsourcing_req_number);
  CREATE INDEX idx_osr_detail_task ON outsourcing_req_detail (process_task_number);
END
GO

-- Step 3: 为委外订单表增加来源追溯字段
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_order') AND name = 'source_req_number')
BEGIN
  ALTER TABLE outsourcing_order ADD source_req_number NVARCHAR(50) NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('outsourcing_order') AND name = 'source_req_detail_id')
BEGIN
  ALTER TABLE outsourcing_order ADD source_req_detail_id INT NULL;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_oo_source_req' AND object_id = OBJECT_ID('outsourcing_order'))
BEGIN
  CREATE INDEX idx_oo_source_req ON outsourcing_order (source_req_number);
END
GO
