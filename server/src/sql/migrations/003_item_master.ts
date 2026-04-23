import { Sequelize } from 'sequelize';
import dotenv from 'dotenv';

dotenv.config();

const sequelize = new Sequelize({
  dialect: 'mssql',
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME || 'XYMES',
  username: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || '',
  logging: false,
  dialectOptions: { options: { encrypt: false, trustServerCertificate: true } }
});

async function migrate() {
  const transaction = await sequelize.transaction();
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // ========== 1. 创建 item_master 主表 ==========
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='item_master' AND xtype='U')
      CREATE TABLE item_master (
        item_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        item_name NVARCHAR(200) DEFAULT '',
        item_type NVARCHAR(20) NOT NULL,
        item_class_number NVARCHAR(50) DEFAULT '',
        item_class_name NVARCHAR(200) DEFAULT '',
        item_properties NVARCHAR(200) DEFAULT '',
        basic_unit NVARCHAR(50) DEFAULT '',
        specifications NVARCHAR(200) DEFAULT '',
        remark NVARCHAR(500) DEFAULT ''
      )
    `, { transaction });
    console.log('item_master 表创建成功');

    // ========== 2. 创建 product_ext 成品扩展表 ==========
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='product_ext' AND xtype='U')
      CREATE TABLE product_ext (
        item_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        product_drawing_number NVARCHAR(50) DEFAULT '',
        rubber_compound_number NVARCHAR(50) DEFAULT '',
        batch_production_quota NVARCHAR(50) DEFAULT '',
        standard_pass_rate NVARCHAR(50) DEFAULT '',
        FOREIGN KEY (item_number) REFERENCES item_master(item_number)
      )
    `, { transaction });
    console.log('product_ext 表创建成功');

    // ========== 3. 创建 material_ext 原材料扩展表 ==========
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='material_ext' AND xtype='U')
      CREATE TABLE material_ext (
        item_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        supplier_number NVARCHAR(50) DEFAULT '',
        supplier_name NVARCHAR(200) DEFAULT '',
        FOREIGN KEY (item_number) REFERENCES item_master(item_number)
      )
    `, { transaction });
    console.log('material_ext 表创建成功');

    // ========== 4. 创建 semi_product_ext 半成品扩展表 ==========
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='semi_product_ext' AND xtype='U')
      CREATE TABLE semi_product_ext (
        item_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        source_bom_number NVARCHAR(50) DEFAULT '',
        FOREIGN KEY (item_number) REFERENCES item_master(item_number)
      )
    `, { transaction });
    console.log('semi_product_ext 表创建成功');

    // ========== 5. 创建 packaging_ext 包材扩展表 ==========
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='packaging_ext' AND xtype='U')
      CREATE TABLE packaging_ext (
        item_number NVARCHAR(50) NOT NULL PRIMARY KEY,
        packaging_remark NVARCHAR(500) DEFAULT '',
        FOREIGN KEY (item_number) REFERENCES item_master(item_number)
      )
    `, { transaction });
    console.log('packaging_ext 表创建成功');

    // ========== 6. 迁移 product 数据 ==========
    const [productExists]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM sysobjects WHERE name='product' AND xtype='U'`, { transaction }
    );
    if (productExists[0].cnt > 0) {
      // 检查 item_master 是否已有产品数据（幂等）
      const [existingProducts]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM item_master WHERE item_type = N'成品'`, { transaction }
      );
      if (existingProducts[0].cnt === 0) {
        await sequelize.query(`
          INSERT INTO item_master (item_number, item_name, item_type, item_class_number, item_class_name, item_properties, basic_unit, specifications, remark)
          SELECT item_number, ISNULL(item_name,''), N'成品',
            ISNULL(product_class_number,''), ISNULL(product_class_name,''),
            ISNULL(product_properties,''), ISNULL(basic_unit,''),
            ISNULL(specifications,''), ''
          FROM product
        `, { transaction });

        await sequelize.query(`
          INSERT INTO product_ext (item_number, product_drawing_number, rubber_compound_number, batch_production_quota, standard_pass_rate)
          SELECT item_number,
            ISNULL(product_drawing_number,''), ISNULL(rubber_compound_number,''),
            ISNULL(batch_production_quota,''), ISNULL(standard_pass_rate,'')
          FROM product
        `, { transaction });

        const [productCount]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM product`, { transaction });
        console.log(`产品数据迁移成功: ${productCount[0].cnt} 条`);
      } else {
        console.log('产品数据已存在，跳过迁移');
      }
    } else {
      console.log('product 表不存在，跳过产品迁移');
    }

    // ========== 7. 迁移 material 数据 ==========
    const [materialExists]: any = await sequelize.query(
      `SELECT COUNT(*) as cnt FROM sysobjects WHERE name='material' AND xtype='U'`, { transaction }
    );
    if (materialExists[0].cnt > 0) {
      const [existingMaterials]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM item_master WHERE item_type = N'原材料'`, { transaction }
      );
      if (existingMaterials[0].cnt === 0) {
        // 检测编号冲突
        const [conflicts]: any = await sequelize.query(`
          SELECT m.item_number FROM material m
          INNER JOIN item_master im ON m.item_number = im.item_number
        `, { transaction });

        if (conflicts.length > 0) {
          console.log(`发现 ${conflicts.length} 个编号冲突，冲突物料将加 M- 前缀:`);
          for (const c of conflicts) {
            console.log(`  冲突: ${c.item_number} → M-${c.item_number}`);
          }
        }

        // 迁移无冲突的物料
        await sequelize.query(`
          INSERT INTO item_master (item_number, item_name, item_type, item_class_number, item_class_name, item_properties, basic_unit, specifications, remark)
          SELECT item_number, ISNULL(item_name,''), N'原材料',
            ISNULL(material_class_number,''), ISNULL(material_class_name,''),
            ISNULL(material_properties,''), ISNULL(basic_unit,''), '', ''
          FROM material
          WHERE item_number NOT IN (SELECT item_number FROM item_master)
        `, { transaction });

        await sequelize.query(`
          INSERT INTO material_ext (item_number, supplier_number, supplier_name)
          SELECT item_number, ISNULL(supplier_number,''), ISNULL(supplier_name,'')
          FROM material
          WHERE item_number NOT IN (SELECT im.item_number FROM item_master im INNER JOIN material_ext me ON im.item_number = me.item_number)
            AND item_number IN (SELECT item_number FROM item_master WHERE item_type = N'原材料')
        `, { transaction });

        // 迁移冲突的物料（加 M- 前缀）
        if (conflicts.length > 0) {
          await sequelize.query(`
            INSERT INTO item_master (item_number, item_name, item_type, item_class_number, item_class_name, item_properties, basic_unit, specifications, remark)
            SELECT 'M-' + item_number, ISNULL(item_name,''), N'原材料',
              ISNULL(material_class_number,''), ISNULL(material_class_name,''),
              ISNULL(material_properties,''), ISNULL(basic_unit,''), '', ''
            FROM material
            WHERE item_number IN (SELECT item_number FROM product)
              AND ('M-' + item_number) NOT IN (SELECT item_number FROM item_master)
          `, { transaction });

          await sequelize.query(`
            INSERT INTO material_ext (item_number, supplier_number, supplier_name)
            SELECT 'M-' + item_number, ISNULL(supplier_number,''), ISNULL(supplier_name,'')
            FROM material
            WHERE item_number IN (SELECT item_number FROM product)
              AND ('M-' + item_number) IN (SELECT item_number FROM item_master)
              AND ('M-' + item_number) NOT IN (SELECT item_number FROM material_ext)
          `, { transaction });
        }

        const [materialCount]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM material`, { transaction });
        console.log(`物料数据迁移成功: ${materialCount[0].cnt} 条`);
      } else {
        console.log('物料数据已存在，跳过迁移');
      }
    } else {
      console.log('material 表不存在，跳过物料迁移');
    }

    // ========== 8. 创建索引 ==========
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_item_master_item_type' AND object_id = OBJECT_ID('item_master'))
      CREATE INDEX IX_item_master_item_type ON item_master(item_type)
    `, { transaction });
    await sequelize.query(`
      IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'IX_item_master_item_name' AND object_id = OBJECT_ID('item_master'))
      CREATE INDEX IX_item_master_item_name ON item_master(item_name)
    `, { transaction });
    console.log('索引创建成功');

    // ========== 9. 备份原表 ==========
    if (productExists[0].cnt > 0) {
      const [bakExists]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM sysobjects WHERE name='product_bak' AND xtype='U'`, { transaction }
      );
      if (bakExists[0].cnt === 0) {
        await sequelize.query(`EXEC sp_rename 'product', 'product_bak'`, { transaction });
        console.log('product → product_bak 备份完成');
      } else {
        console.log('product_bak 已存在，跳过备份');
      }
    }

    if (materialExists[0].cnt > 0) {
      const [bakExists]: any = await sequelize.query(
        `SELECT COUNT(*) as cnt FROM sysobjects WHERE name='material_bak' AND xtype='U'`, { transaction }
      );
      if (bakExists[0].cnt === 0) {
        await sequelize.query(`EXEC sp_rename 'material', 'material_bak'`, { transaction });
        console.log('material → material_bak 备份完成');
      } else {
        console.log('material_bak 已存在，跳过备份');
      }
    }

    // ========== 10. 验证 ==========
    const [masterCount]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM item_master`, { transaction });
    const [extPCount]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM product_ext`, { transaction });
    const [extMCount]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM material_ext`, { transaction });
    console.log(`\n迁移验证:`);
    console.log(`  item_master 总数: ${masterCount[0].cnt}`);
    console.log(`  product_ext 总数: ${extPCount[0].cnt}`);
    console.log(`  material_ext 总数: ${extMCount[0].cnt}`);

    await transaction.commit();
    console.log('\n迁移全部完成!');
    await sequelize.close();
  } catch (err) {
    await transaction.rollback();
    console.error('迁移失败，已回滚:', err);
    process.exit(1);
  }
}

migrate();
