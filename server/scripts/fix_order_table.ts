import sequelize from '../src/config/database';

(async () => {
  try {
    await sequelize.authenticate();
    
    // 查看当前列
    const [cols]: any = await sequelize.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_order' ORDER BY ORDINAL_POSITION");
    const colNames = cols.map((c: any) => c.COLUMN_NAME);
    console.log('当前列:', colNames.join(', '));
    
    // 如果有 production_task_number 但没有 production_order_number，则重命名
    if (colNames.includes('production_task_number') && !colNames.includes('production_order_number')) {
      await sequelize.query("EXEC sp_rename 'production_order.production_task_number', 'production_order_number', 'COLUMN'");
      console.log('已重命名 production_task_number -> production_order_number');
    }
    
    // 更新数据中的编号前缀 T -> P
    await sequelize.query("UPDATE production_order SET production_order_number = REPLACE(production_order_number, 'T2', 'P2') WHERE production_order_number LIKE 'T%'");
    console.log('编号前缀已从 T 更新为 P');
    
    // 验证
    const [cols2]: any = await sequelize.query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'production_order' ORDER BY ORDINAL_POSITION");
    console.log('更新后列:', cols2.map((c: any) => c.COLUMN_NAME).join(', '));
    
    const [sample]: any = await sequelize.query('SELECT TOP 3 production_order_number FROM production_order');
    console.log('样本:', sample.map((r: any) => r.production_order_number));
    
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
