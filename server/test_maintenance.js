require('ts-node').register();
var seq = require('./src/config/database').default;

async function test() {
  try {
    // Test 1: simple count
    const [count] = await seq.query('SELECT COUNT(*) as cnt FROM mould_maintenance');
    console.log('Count result:', JSON.stringify(count));

    // Test 2: with alias
    const [count2] = await seq.query('SELECT COUNT(*) as total FROM mould_maintenance mm');
    console.log('Count with alias:', JSON.stringify(count2));

    // Test 3: JOIN query
    const [items] = await seq.query(`
      SELECT mm.*, m.item_name AS mould_name
      FROM mould_maintenance mm
      LEFT JOIN mould m ON mm.mould_number = m.item_number
      WHERE 1=1
      ORDER BY mm.maintenance_date DESC, mm.id DESC
      OFFSET 0 ROWS FETCH NEXT 10 ROWS ONLY
    `);
    console.log('Items:', JSON.stringify(items));
  } catch (err) {
    console.error('Error:', err.message);
    if (err.parent) {
      console.error('Parent:', err.parent.message);
      if (err.parent.errors) {
        err.parent.errors.forEach((e, i) => console.error(`Error ${i}:`, e.message));
      }
    }
  }
  process.exit(0);
}
test();
