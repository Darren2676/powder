-- Step 1.1: routing_detail 增加委外开关
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('routing_detail') AND name = 'is_outsourced')
BEGIN
  ALTER TABLE routing_detail ADD is_outsourced BIT NOT NULL DEFAULT 0;
END
GO

-- Step 1.2: process_task 增加委外标记
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('process_task') AND name = 'is_outsourced')
BEGIN
  ALTER TABLE process_task ADD is_outsourced BIT NOT NULL DEFAULT 0;
END
GO

-- Step 1.3: 创建委外订单表
IF NOT EXISTS (SELECT 1 FROM sys.objects WHERE object_id = OBJECT_ID('outsourcing_order') AND type = 'U')
BEGIN
  CREATE TABLE outsourcing_order (
    outsourcing_order_number NVARCHAR(50) NOT NULL PRIMARY KEY,
    process_task_number NVARCHAR(50) NOT NULL,
    production_order_number NVARCHAR(50) NULL,
    production_number NVARCHAR(50) NULL,
    process_route_number NVARCHAR(50) NULL,
    step_number INT NULL,
    standard_process_number NVARCHAR(50) NULL,
    standard_process_name NVARCHAR(100) NULL,
    work_center_number NVARCHAR(50) NULL,
    work_center_name NVARCHAR(100) NULL,
    item_number NVARCHAR(50) NULL,
    item_name NVARCHAR(200) NULL,
    specifications NVARCHAR(200) NULL,
    basic_unit NVARCHAR(20) NULL,
    planned_quantity DECIMAL(18,4) DEFAULT 0,
    received_quantity DECIMAL(18,4) DEFAULT 0,
    supplier_number NVARCHAR(50) NULL,
    supplier_name NVARCHAR(200) NULL,
    unit_price DECIMAL(18,4) DEFAULT 0,
    total_amount DECIMAL(18,4) DEFAULT 0,
    order_date NVARCHAR(20) NULL,
    expected_return_date NVARCHAR(20) NULL,
    actual_return_date NVARCHAR(20) NULL,
    approval_status NVARCHAR(20) DEFAULT N'草稿',
    order_status NVARCHAR(20) DEFAULT N'待发出',
    remark NVARCHAR(500) NULL,
    creation_date NVARCHAR(30) NULL,
    creation_man NVARCHAR(50) NULL
  );

  CREATE INDEX idx_oo_process_task ON outsourcing_order (process_task_number);
  CREATE INDEX idx_oo_production_order ON outsourcing_order (production_order_number);
  CREATE INDEX idx_oo_supplier ON outsourcing_order (supplier_number);
  CREATE INDEX idx_oo_order_status ON outsourcing_order (order_status);
END
GO
