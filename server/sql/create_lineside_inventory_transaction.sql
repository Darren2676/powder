-- 线边仓库存流水表 (审计日志)
-- WIP余额通过 process_task.completed_quantity 链式差值计算，此表仅记录流水审计
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'lineside_inventory_transaction')
BEGIN
  CREATE TABLE lineside_inventory_transaction (
    id                        INT IDENTITY(1,1) PRIMARY KEY,
    transaction_number        NVARCHAR(30) NOT NULL,
    transaction_type          NVARCHAR(20) NOT NULL,     -- '入线边' / '出线边'
    source_type               NVARCHAR(30) NOT NULL,     -- '领料入线' / '报工转出' / '报工转入' / '成品入库'
    source_number             NVARCHAR(50) DEFAULT '',    -- 关联单号(领料号/报工号/入库流水号)
    production_order_number   NVARCHAR(50) NOT NULL,
    item_number               NVARCHAR(50) NOT NULL,
    item_name                 NVARCHAR(200) DEFAULT '',
    specifications            NVARCHAR(200) DEFAULT '',
    basic_unit                NVARCHAR(20) DEFAULT '',
    step_number               INT NOT NULL,
    work_center_number        NVARCHAR(50) NOT NULL,
    work_center_name          NVARCHAR(200) DEFAULT '',
    quantity                  DECIMAL(18,4) NOT NULL,     -- 数量(正数)
    direction                 NVARCHAR(10) NOT NULL,      -- 'IN' / 'OUT'
    before_quantity           DECIMAL(18,4) DEFAULT 0,
    after_quantity            DECIMAL(18,4) DEFAULT 0,
    operator                  NVARCHAR(50) DEFAULT '',
    operation_date            DATETIME DEFAULT GETDATE(),
    remark                    NVARCHAR(500) DEFAULT '',
    creation_date             DATETIME DEFAULT GETDATE()
  );

  CREATE UNIQUE INDEX UQ_lineside_txn_number ON lineside_inventory_transaction(transaction_number);
  CREATE INDEX IX_lineside_txn_order ON lineside_inventory_transaction(production_order_number, step_number);
  CREATE INDEX IX_lineside_txn_wc ON lineside_inventory_transaction(work_center_number);
  CREATE INDEX IX_lineside_txn_date ON lineside_inventory_transaction(operation_date DESC);
  CREATE INDEX IX_lineside_txn_type ON lineside_inventory_transaction(transaction_type);

  PRINT 'Table lineside_inventory_transaction created successfully.';
END
ELSE
BEGIN
  PRINT 'Table lineside_inventory_transaction already exists, skipping.';
END
