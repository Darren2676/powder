import sequelize from '../../config/database';
import * as fs from 'fs';

(async () => {
  const out: string[] = [];
  const log = (s: string) => { out.push(s); };
  try {
    const [bd]: any = await sequelize.query(
      `SELECT * FROM bom_detail WHERE bom_number = :bn`,
      { replacements: { bn: '110103' } }
    );
    log('bom_detail for 110103: ' + bd.length);
    if (bd.length > 0) log(JSON.stringify(bd, null, 2));

    const [mpd]: any = await sequelize.query(
      `SELECT * FROM material_preparation_detail WHERE preparation_number = 'MP-20260405-001'`
    );
    log('material_preparation_detail for MP-20260405-001: ' + mpd.length);

    fs.writeFileSync('chk-out.txt', out.join('\n'), 'utf8');
    process.exit(0);
  } catch (e: any) {
    fs.writeFileSync('chk-out.txt', 'ERROR: ' + e.message + '\n' + out.join('\n'), 'utf8');
    process.exit(1);
  }
})();
