import sequelize from '../../config/database';

const tables = [
  'schedules',
  '[team]',
  'workshop',
  'productionline',
  'storage_location',
  'unit'
];

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('DB connected');

    for (const table of tables) {
      const rawName = table.replace(/[\[\]]/g, '');
      const [cols]: any = await sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${rawName}' AND COLUMN_NAME = 'status'`
      );
      if (cols.length > 0) {
        console.log(`${table}: status column exists, skip`);
      } else {
        await sequelize.query(`ALTER TABLE ${table} ADD status NVARCHAR(20) DEFAULT N'启用'`);
        console.log(`${table}: added status column`);
      }
    }

    for (const table of tables) {
      const rawName = table.replace(/[\[\]]/g, '');
      const [cols]: any = await sequelize.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '${rawName}' AND COLUMN_NAME = 'status'`
      );
      console.log(`verify ${rawName}: ${cols.length > 0 ? 'OK' : 'MISSING'}`);
    }

    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
