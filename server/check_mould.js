require('ts-node/register');
const sequelize = require('./src/config/database').default;

(async () => {
  try {
    const [rows] = await sequelize.query(
      "SELECT item_number, item_name FROM mould WHERE item_number = 'MJC100809-2'"
    );
    console.log('Mould:', JSON.stringify(rows, null, 2));

    const [mapRows] = await sequelize.query(
      "SELECT * FROM mfg_bom_mould_mapping WHERE item_number = 'C100809' AND mould_number = 'MJC100809-2'"
    );
    console.log('Mapping:', JSON.stringify(mapRows, null, 2));

    const [headerRows] = await sequelize.query(
      "SELECT mfg_bom_number, mfg_bom_name, item_number, mould_number FROM mfg_bom_header WHERE mfg_bom_number = 'C100809-2'"
    );
    console.log('Header:', JSON.stringify(headerRows, null, 2));

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
