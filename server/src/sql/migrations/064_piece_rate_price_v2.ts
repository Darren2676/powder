// 计件单价编号管理：从平铺记录改为header+detail文档管理模式
import { QueryInterface } from 'sequelize';
import sequelize from '../../config/database';

export async function up(queryInterface: QueryInterface, seq: any): Promise<void> {
  // 1. 创建 piece_rate_price_header 表
  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'piece_rate_price_header')
    BEGIN
      CREATE TABLE piece_rate_price_header (
        price_list_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        price_list_name NVARCHAR(100) NOT NULL,
        effective_date DATE NOT NULL,
        expiration_date DATE NOT NULL,
        approval_status NVARCHAR(20) DEFAULT N'草稿',
        remark NVARCHAR(500) DEFAULT '',
        creation_date NVARCHAR(20) DEFAULT '',
        creation_man NVARCHAR(50) DEFAULT ''
      );
      CREATE INDEX idx_prph_status ON piece_rate_price_header(approval_status);
      CREATE INDEX idx_prph_dates ON piece_rate_price_header(effective_date, expiration_date);
    END
  `);

  // 2. 创建 piece_rate_price_detail 表
  await sequelize.query(`
    IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'piece_rate_price_detail')
    BEGIN
      CREATE TABLE piece_rate_price_detail (
        id INT IDENTITY(1,1) PRIMARY KEY,
        price_list_number NVARCHAR(50) NOT NULL,
        line_number INT DEFAULT 0,
        item_number NVARCHAR(50) NOT NULL DEFAULT '',
        item_name NVARCHAR(200) DEFAULT '',
        standard_process_number NVARCHAR(50) NOT NULL DEFAULT '',
        standard_process_name NVARCHAR(200) DEFAULT '',
        item_category NVARCHAR(100) DEFAULT '',
        equipment_number NVARCHAR(50) DEFAULT '',
        equipment_name NVARCHAR(200) DEFAULT '',
        employee_number NVARCHAR(50) DEFAULT '',
        employee_name NVARCHAR(200) DEFAULT '',
        custom_field NVARCHAR(500) DEFAULT '',
        qualified_piece_rate DECIMAL(18,6) DEFAULT 0,
        defective_piece_rate DECIMAL(18,6) DEFAULT 0,
        drawing_number NVARCHAR(100) DEFAULT '',
        version NVARCHAR(50) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        material_type NVARCHAR(200) DEFAULT ''
      );
      CREATE INDEX idx_prpd_header ON piece_rate_price_detail(price_list_number);
    END
  `);

  // 3. 迁移旧数据：按 effective_date+expiration_date+approval_status 分组，每组生成一个编号
  const [groups]: any = await sequelize.query(`
    SELECT effective_date, expiration_date, approval_status,
           MIN(creation_man) as creation_man, MIN(creation_date) as creation_date
    FROM piece_rate_price
    WHERE effective_date IS NOT NULL AND expiration_date IS NOT NULL
    GROUP BY effective_date, expiration_date, approval_status
    ORDER BY effective_date
  `);

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const dateStr = g.effective_date ? g.effective_date.toISOString().slice(0, 10).replace(/-/g, '') : '00000000';
    const seq = String(i + 1).padStart(3, '0');
    const priceListNumber = `PR-${dateStr}-${seq}`;
    const priceListName = `计件单价表_${dateStr}`;
    const status = g.approval_status || '草稿';
    const creator = g.creation_man || '';
    const createDate = g.creation_date || '';

    // 插入表头
    await sequelize.query(`
      IF NOT EXISTS (SELECT 1 FROM piece_rate_price_header WHERE price_list_number = :num)
      INSERT INTO piece_rate_price_header (price_list_number, price_list_name, effective_date, expiration_date, approval_status, remark, creation_date, creation_man)
      VALUES (:num, :name, :eff, :exp, :status, '', :cdate, :cman)
    `, {
      replacements: {
        num: priceListNumber,
        name: priceListName,
        eff: g.effective_date,
        exp: g.expiration_date,
        status,
        cdate: createDate,
        cman: creator
      }
    });

    // 迁移对应明细
    await sequelize.query(`
      INSERT INTO piece_rate_price_detail (price_list_number, line_number,
        item_number, item_name, standard_process_number, standard_process_name,
        item_category, equipment_number, equipment_name,
        employee_number, employee_name, custom_field,
        qualified_piece_rate, defective_piece_rate,
        drawing_number, version, specifications, material_type)
      SELECT :num,
        ROW_NUMBER() OVER (ORDER BY item_number, standard_process_number),
        item_number, item_name, standard_process_number, standard_process_name,
        item_category, equipment_number, equipment_name,
        employee_number, employee_name, custom_field,
        qualified_piece_rate, defective_piece_rate,
        drawing_number, version, specifications, material_type
      FROM piece_rate_price
      WHERE effective_date = :eff AND expiration_date = :exp AND approval_status = :status
    `, {
      replacements: {
        num: priceListNumber,
        eff: g.effective_date,
        exp: g.expiration_date,
        status
      }
    });
  }

  console.log(`[Migration 064] piece_rate_price_header + detail created, ${groups.length} groups migrated`);
}

export async function down(): Promise<void> {
  await sequelize.query(`DROP TABLE IF EXISTS piece_rate_price_detail`);
  await sequelize.query(`DROP TABLE IF EXISTS piece_rate_price_header`);
}
