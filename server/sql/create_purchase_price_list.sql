-- 采购价目表主表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_price_list' AND xtype='U')
CREATE TABLE purchase_price_list (
    price_list_number NVARCHAR(30) NOT NULL PRIMARY KEY,
    price_list_name NVARCHAR(100) NOT NULL DEFAULT '',
    supplier_number NVARCHAR(50) NOT NULL DEFAULT '',
    supplier_name NVARCHAR(100) DEFAULT '',
    supplier_category NVARCHAR(50) DEFAULT '',
    effective_date DATE NULL,
    expiration_date DATE NULL,
    price_type NVARCHAR(10) DEFAULT N'含税',
    currency NVARCHAR(20) DEFAULT N'CNY',
    approval_status NVARCHAR(20) DEFAULT N'草稿',
    remark NVARCHAR(500) DEFAULT '',
    creation_date NVARCHAR(20) DEFAULT '',
    creation_man NVARCHAR(50) DEFAULT ''
);

-- 采购价目表明细表
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='purchase_price_list_detail' AND xtype='U')
CREATE TABLE purchase_price_list_detail (
    id INT IDENTITY(1,1) PRIMARY KEY,
    price_list_number NVARCHAR(30) NOT NULL,
    line_number INT DEFAULT 10,
    item_number NVARCHAR(50) NOT NULL DEFAULT '',
    item_name NVARCHAR(100) DEFAULT '',
    item_category NVARCHAR(50) DEFAULT '',
    specifications NVARCHAR(200) DEFAULT '',
    tax_inclusive_price DECIMAL(18,6) DEFAULT 0,
    tax_exclusive_price DECIMAL(18,6) DEFAULT 0,
    tax_rate DECIMAL(5,2) DEFAULT 0,
    enable_tiered_pricing BIT DEFAULT 0,
    start_quantity DECIMAL(18,4) DEFAULT 0,
    end_quantity DECIMAL(18,4) NULL,
    pricing_unit NVARCHAR(20) DEFAULT '',
    max_price_inclusive DECIMAL(18,6) DEFAULT 0,
    max_price_exclusive DECIMAL(18,6) DEFAULT 0,
    min_price_inclusive DECIMAL(18,6) DEFAULT 0,
    min_price_exclusive DECIMAL(18,6) DEFAULT 0,
    remark NVARCHAR(500) DEFAULT ''
);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_ppld_number')
CREATE INDEX idx_ppld_number ON purchase_price_list_detail(price_list_number);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name='idx_ppld_item')
CREATE INDEX idx_ppld_item ON purchase_price_list_detail(item_number);
