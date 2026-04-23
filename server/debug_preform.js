const { Sequelize } = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'mssql', host: '127.0.0.1', port: 1433,
  database: 'SEALSMES', username: 'sa', password: 'cowork',
  logging: false,
  dialectOptions: { options: { encrypt: false, trustServerCertificate: true } }
});

async function main() {
  await sequelize.authenticate();

  var r1 = await sequelize.query("SELECT item_number, item_name, item_type FROM item_master WHERE item_number = 'C100501-Y'");
  console.log('=== item_master ===');
  console.log(JSON.stringify(r1[0], null, 2));

  var r2 = await sequelize.query("SELECT * FROM preform_ext WHERE item_number = 'C100501-Y'");
  console.log('\n=== preform_ext ===');
  console.log(JSON.stringify(r2[0], null, 2));
  console.log('Record count:', r2[0].length);

  if (r2[0].length === 0) {
    console.log('\nNo preform_ext record! This is why updates fail.');
    console.log('Inserting blank record...');
    await sequelize.query("INSERT INTO preform_ext (item_number, rubber_compound_number, standard_pass_rate, formed_part_materia_consumption) VALUES ('C100501-Y', '', '', '')");
    var r3 = await sequelize.query("SELECT * FROM preform_ext WHERE item_number = 'C100501-Y'");
    console.log('After insert:', JSON.stringify(r3[0], null, 2));
  }

  console.log('\n=== preform_ext all records ===');
  var r4 = await sequelize.query("SELECT * FROM preform_ext");
  console.log(JSON.stringify(r4[0], null, 2));

  await sequelize.close();
}
main().catch(e => { console.error(e.message); process.exit(1); });
