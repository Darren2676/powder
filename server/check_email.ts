const seq = require('./src/config/database').default;
const { QueryTypes } = require('sequelize');
(async () => {
  const rows = await seq.query(
    `SELECT c.name, c.is_nullable, t.name AS type_name, c.max_length
     FROM sys.columns c
     INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
     WHERE c.object_id = OBJECT_ID('users') AND c.name = 'email'`,
    { type: QueryTypes.SELECT }
  );
  console.log('email column:', JSON.stringify(rows));
  process.exit(0);
})();
