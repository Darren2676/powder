import sequelize from '../../config/database';

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('数据库连接成功');

    // 检查表是否已存在
    const [tables]: any = await sequelize.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'unit_conversion'`
    );

    if (tables.length > 0) {
      console.log('unit_conversion 表已存在，跳过创建');
    } else {
      await sequelize.query(`
        CREATE TABLE unit_conversion (
          id INT IDENTITY(1,1) PRIMARY KEY,
          from_unit_code NVARCHAR(20) NOT NULL,
          to_unit_code NVARCHAR(20) NOT NULL,
          conversion_rate DECIMAL(18,6) NOT NULL,
          remark NVARCHAR(200) DEFAULT '',
          CONSTRAINT FK_uc_from_unit FOREIGN KEY (from_unit_code) REFERENCES unit(unit_code),
          CONSTRAINT FK_uc_to_unit FOREIGN KEY (to_unit_code) REFERENCES unit(unit_code),
          CONSTRAINT UQ_unit_conversion UNIQUE (from_unit_code, to_unit_code)
        )
      `);
      console.log('unit_conversion 表创建成功');

      // 插入初始换算数据
      const initialData = [
        { from: 'KG', to: 'G', rate: 1000, remark: '1KG = 1000G' },
        { from: 'G', to: 'KG', rate: 0.001, remark: '1G = 0.001KG' },
      ];

      // 先查询现有单位，用unit_name匹配获取unit_code
      const [units]: any = await sequelize.query(`SELECT unit_code, unit_name FROM unit`);
      const unitMap = new Map(units.map((u: any) => [u.unit_name, u.unit_code]));

      for (const item of initialData) {
        const fromCode = unitMap.get(item.from);
        const toCode = unitMap.get(item.to);
        if (fromCode && toCode) {
          await sequelize.query(
            `INSERT INTO unit_conversion (from_unit_code, to_unit_code, conversion_rate, remark) VALUES (:from, :to, :rate, :remark)`,
            { replacements: { from: fromCode, to: toCode, rate: item.rate, remark: item.remark } }
          );
          console.log(`  插入换算: ${item.from} → ${item.to} = ${item.rate}`);
        } else {
          console.log(`  跳过: ${item.from} → ${item.to}（单位不存在）`);
        }
      }

      console.log('初始换算数据插入完成');
    }

    process.exit(0);
  } catch (error) {
    console.error('迁移失败:', error);
    process.exit(1);
  }
}

migrate();
