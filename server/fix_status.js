require('ts-node').register();
var seq = require('./src/config/database').default;
seq.authenticate().then(function() {
  console.log('connected');
  var tables = ['schedules','[group]','workshop','productionline','storage_location','unit'];
  var p = Promise.resolve();
  tables.forEach(function(t) {
    p = p.then(function() {
      return seq.query('UPDATE ' + t + ' SET status = :val WHERE status IS NULL OR status = :bad', {replacements: {val: '启用', bad: '/u542f/u7528'}}).then(function() {
        console.log(t + ': done');
      });
    });
  });
  return p;
}).then(function() {
  console.log('all done');
  process.exit(0);
}).catch(function(e) {
  console.error(e);
  process.exit(1);
});
