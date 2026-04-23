-- piece_rate_price: 计件单价管理表
IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'piece_rate_price')
BEGIN
  CREATE TABLE piece_rate_price (
      id INT IDENTITY(1,1) PRIMARY KEY,
      item_number NVARCHAR(50) NOT NULL DEFAULT '',
      item_name NVARCHAR(200) DEFAULT '',
      standard_process_number NVARCHAR(50) NOT NULL DEFAULT '',
      standard_process_name NVARCHAR(200) DEFAULT '',
      item_category NVARCHAR(100) DEFAULT '',
      approval_status NVARCHAR(20) DEFAULT N'草稿',
      equipment_number NVARCHAR(50) DEFAULT '',
      equipment_name NVARCHAR(200) DEFAULT '',
      employee_number NVARCHAR(50) DEFAULT '',
      employee_name NVARCHAR(200) DEFAULT '',
      custom_field NVARCHAR(500) DEFAULT '',
      qualified_piece_rate DECIMAL(18,6) DEFAULT 0,
      defective_piece_rate DECIMAL(18,6) DEFAULT 0,
      effective_date DATE NULL,
      expiration_date DATE NULL,
      drawing_number NVARCHAR(100) DEFAULT '',
      version NVARCHAR(50) DEFAULT '',
      specifications NVARCHAR(200) DEFAULT '',
      material_type NVARCHAR(200) DEFAULT '',
      creation_date NVARCHAR(20) DEFAULT '',
      creation_man NVARCHAR(50) DEFAULT ''
  );
  CREATE INDEX idx_prp_item ON piece_rate_price(item_number);
  CREATE INDEX idx_prp_process ON piece_rate_price(standard_process_number);
  CREATE INDEX idx_prp_approval ON piece_rate_price(approval_status);
  CREATE INDEX idx_prp_effective ON piece_rate_price(effective_date, expiration_date);
END
