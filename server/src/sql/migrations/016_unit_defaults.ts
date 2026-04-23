import sequelize from '../../config/database';

async function migrate() {
  try {
    await sequelize.authenticate();
    console.log('DB connected');

    const [cols]: any = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'unit'`
    );
    const names = cols.map((c: any) => c.COLUMN_NAME);
    console.log('Current columns:', names.join(', '));

    if (!names.includes('default_product')) {
      await sequelize.query(`ALTER TABLE unit ADD default_product BIT DEFAULT 0`);
      console.log('Added default_product');
    }
    if (!names.includes('default_semi')) {
      await sequelize.query(`ALTER TABLE unit ADD default_semi BIT DEFAULT 0`);
      console.log('Added default_semi');
    }
    if (!names.includes('default_material')) {
      await sequelize.query(`ALTER TABLE unit ADD default_material BIT DEFAULT 0`);
      console.log('Added default_material');
    }

    const [verify]: any = await sequelize.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'unit'`
    );
    console.log('Final columns:', verify.map((c: any) => c.COLUMN_NAME).join(', '));

    const [sample]: any = await sequelize.query(`SELECT TOP 1 * FROM unit`);
    console.log('Sample:', JSON.stringify(sample[0]));

    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

migrate();
