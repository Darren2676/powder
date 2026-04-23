-- 销售价目表主表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='sales_price_list' AND xtype='U')
CREATE TABLE sales_price_list (
  price_list_number  NVARCHAR(50)   PRIMARY KEY,
  price_list_name    NVARCHAR(200)  NOT NULL DEFAULT '',
  customer_number    NVARCHAR(50)   NOT NULL DEFAULT '',
  customer_name      NVARCHAR(200)  NOT NULL DEFAULT '',
  customer_category  NVARCHAR(100)  NOT NULL DEFAULT '',
  effective_date     DATE           NULL,
  expiration_date    DATE           NULL,
  price_type         NVARCHAR(20)   NOT NULL DEFAULT N'含税',
  currency           NVARCHAR(10)   NOT NULL DEFAULT 'CNY',
  approval_status    NVARCHAR(20)   NOT NULL DEFAULT N'草稿',
  remark             NVARCHAR(500)  NOT NULL DEFAULT '',
  creation_date      NVARCHAR(50)   NOT NULL DEFAULT '',
  creation_man       NVARCHAR(50)   NOT NULL DEFAULT ''
);

-- 销售价目表明细表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='sales_price_list_detail' AND xtype='U')
CREATE TABLE sales_price_list_detail (
  id                    INT IDENTITY(1,1) PRIMARY KEY,
  price_list_number     NVARCHAR(50)   NOT NULL DEFAULT '',
  line_number           INT            NOT NULL DEFAULT 0,
  item_number           NVARCHAR(50)   NOT NULL DEFAULT '',
  item_name             NVARCHAR(200)  NOT NULL DEFAULT '',
  item_category         NVARCHAR(100)  NOT NULL DEFAULT '',
  specifications        NVARCHAR(500)  NOT NULL DEFAULT '',
  tax_inclusive_price    DECIMAL(18,6)  NOT NULL DEFAULT 0,
  tax_exclusive_price   DECIMAL(18,6)  NOT NULL DEFAULT 0,
  tax_rate              DECIMAL(8,2)   NOT NULL DEFAULT 0,
  enable_tiered_pricing BIT            NOT NULL DEFAULT 0,
  start_quantity        DECIMAL(18,4)  NOT NULL DEFAULT 0,
  end_quantity          DECIMAL(18,4)  NULL,
  pricing_unit          NVARCHAR(20)   NOT NULL DEFAULT '',
  min_price_inclusive    DECIMAL(18,6)  NOT NULL DEFAULT 0,
  min_price_exclusive   DECIMAL(18,6)  NOT NULL DEFAULT 0,
  remark                NVARCHAR(500)  NOT NULL DEFAULT ''
);

-- 索引
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_spld_number' AND object_id = OBJECT_ID('sales_price_list_detail'))
CREATE INDEX idx_spld_number ON sales_price_list_detail(price_list_number);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_spld_item' AND object_id = OBJECT_ID('sales_price_list_detail'))
CREATE INDEX idx_spld_item ON sales_price_list_detail(item_number);
