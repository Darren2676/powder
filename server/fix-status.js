require('ts-node').register();
const seq = require('./src/config/database').default;
(async () => {
  await seq.authenticate();
  console.log('connected');
  const tables = ['schedules','[group]','workshop','productionline','storage_location','unit'];
  for (const t of tables) {
    await seq.query(`UPDATE ${t} SET status = :val WHERE status IS NULL`, { replacements: { val: '启用' } });
    console.log(t + ': done');
  }
  process.exit(0);
})();
