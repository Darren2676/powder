const http = require('http');
const { Connection, Request: SqlRequest, TYPES } = require('tedious');

// 直接查数据库
const config = {
  server: 'localhost',
  authentication: { type: 'default', options: { userName: 'sa', password: 'Sa123456' } },
  options: { database: 'SealsMES', encrypt: false, trustServerCertificate: true, rowCollectionOnDone: true }
};

const connection = new Connection(config);
connection.on('connect', (err) => {
  if (err) { console.log('DB connect error:', err.message); return; }
  console.log('DB connected');
  
  // 查 stock_in_detail 列名
  const req1 = new SqlRequest(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'stock_in_detail'`, (err, rowCount) => {
    if (err) console.log('Query1 error:', err.message);
  });
  req1.on('done', (rowCount, more, rows) => {
    console.log('\nstock_in_detail columns:');
    rows.forEach(r => console.log('  ', r[0].value));
    
    // 查 purchase_quality_inspection 列名
    const req2 = new SqlRequest(`SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'purchase_quality_inspection'`, (err) => {
      if (err) console.log('Query2 error:', err.message);
    });
    req2.on('done', (rowCount, more, rows) => {
      console.log('\npurchase_quality_inspection columns:');
      rows.forEach(r => console.log('  ', r[0].value));
      
      // 查看 SI-20260518-001 的明细
      const req3 = new SqlRequest(`SELECT id, item_number, batch_number, inspect_status, inspection_number, qualified_quantity, stock_in_quantity, purchase_detail_id FROM stock_in_detail WHERE stock_in_number = 'SI-20260518-001'`, (err) => {
        if (err) console.log('Query3 error:', err.message);
      });
      req3.on('done', (rowCount, more, rows) => {
        console.log('\nSI-20260518-001 details:');
        rows.forEach(r => {
          const vals = r.map(col => col.value);
          console.log('  ', vals.join(' | '));
        });
        
        // 查检验单状态
        const req4 = new SqlRequest(`SELECT inspection_number, inspect_status FROM purchase_quality_inspection WHERE inspection_number = 'QI-20260518-001'`, (err) => {
          if (err) console.log('Query4 error:', err.message);
        });
        req4.on('done', (rowCount, more, rows) => {
          console.log('\nInspection status:');
          rows.forEach(r => console.log('  ', r.map(col => col.value).join(' | ')));
          connection.close();
        });
        connection.execSql(req4);
      });
      connection.execSql(req3);
    });
    connection.execSql(req2);
  });
  connection.execSql(req1);
});
connection.connect();