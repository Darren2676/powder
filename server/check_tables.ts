import sequelize from './src/config/database';

(async () => {
  try {
    const tables = ['employee', 'schedules', '[team]', 'workshop', 'productionline'];
    const tableNames = ['employee', 'schedules', 'team', 'workshop', 'productionline'];
    
    for (let i = 0; i < tableNames.length; i++) {
      const tbl = tableNames[i];
      console.log(`\n=== ${tbl} 表结构 ===`);
      try {
        const [cols]: any = await sequelize.query(
          `SELECT COLUMN_NAME, DATA_TYPE, CHARACTER_MAXIMUM_LENGTH FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${tbl}' ORDER BY ORDINAL_POSITION`
        );
        cols.forEach((col: any) => {
          console.log(`${col.COLUMN_NAME}: ${col.DATA_TYPE}${col.CHARACTER_MAXIMUM_LENGTH ? `(${col.CHARACTER_MAXIMUM_LENGTH})` : ''}`);
        });
        const [cnt]: any = await sequelize.query(`SELECT COUNT(*) as cnt FROM ${tables[i]}`);
        console.log(`数据量: ${cnt[0].cnt}`);
      } catch(e: any) {
        console.log(`Error: ${e.message}`);
      }
    }
    
    process.exit(0);
  } catch(e: any) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();
