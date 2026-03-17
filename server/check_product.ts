import sequelize from './src/config/database';

(async () => {
  try {
    const [columns]: any = await sequelize.query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'product'"
    );
    console.log('=== Product 表字段 ===');
    console.log(columns.map((c: any) => c.COLUMN_NAME).join(', '));
    
    const [count]: any = await sequelize.query('SELECT COUNT(*) as cnt FROM product');
    console.log('\n=== 数据总数 ===');
    console.log(count[0].cnt);
    
    const [sample]: any = await sequelize.query('SELECT TOP 3 * FROM product');
    console.log('\n=== 前3条数据 ===');
    console.log(JSON.stringify(sample, null, 2));
    
    process.exit(0);
  } catch(e: any) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
