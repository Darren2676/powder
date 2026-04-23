import sequelize from '../../config/database';

async function migrateBomTree() {
  try {
    console.log('开始执行BOM多层管理迁移...');

    // 1. 为 bom_detail 添加 child_bom_number 列
    const [cols]: any = await sequelize.query(`
      SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'bom_detail' AND COLUMN_NAME = 'child_bom_number'
    `);
    if (cols.length === 0) {
      await sequelize.query(`ALTER TABLE bom_detail ADD child_bom_number VARCHAR(50) DEFAULT NULL`);
      console.log('已添加 bom_detail.child_bom_number 列');
    } else {
      console.log('bom_detail.child_bom_number 列已存在，跳过');
    }

    // 2. 为 bom_detail(material_number) 创建索引
    const [idx1]: any = await sequelize.query(`
      SELECT name FROM sys.indexes WHERE name = 'IX_bom_detail_material_number' AND object_id = OBJECT_ID('bom_detail')
    `);
    if (idx1.length === 0) {
      await sequelize.query(`CREATE INDEX IX_bom_detail_material_number ON bom_detail(material_number)`);
      console.log('已创建索引 IX_bom_detail_material_number');
    } else {
      console.log('索引 IX_bom_detail_material_number 已存在，跳过');
    }

    // 3. 为 bom_header(item_number) 创建索引
    const [idx2]: any = await sequelize.query(`
      SELECT name FROM sys.indexes WHERE name = 'IX_bom_header_item_number' AND object_id = OBJECT_ID('bom_header')
    `);
    if (idx2.length === 0) {
      await sequelize.query(`CREATE INDEX IX_bom_header_item_number ON bom_header(item_number)`);
      console.log('已创建索引 IX_bom_header_item_number');
    } else {
      console.log('索引 IX_bom_header_item_number 已存在，跳过');
    }

    console.log('BOM多层管理迁移完成！');
    process.exit(0);
  } catch (err) {
    console.error('迁移失败:', err);
    process.exit(1);
  }
}

migrateBomTree();
