import app from './src/app';
import http from 'http';

const server = http.createServer(app);
server.listen(3001, () => {
  console.log('Test server on 3001');
  
  // Test POST /api/materials
  const req = http.request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/materials',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, (res) => {
    let data = '';
    res.on('data', (chunk) => data += chunk);
    res.on('end', () => {
      console.log(`POST /api/materials => ${res.statusCode}: ${data.substring(0, 200)}`);
      
      // Test GET /api/materials
      const req2 = http.request({
        hostname: 'localhost',
        port: 3001,
        path: '/api/materials',
        method: 'GET'
      }, (res2) => {
        let data2 = '';
        res2.on('data', (chunk) => data2 += chunk);
        res2.on('end', () => {
          console.log(`GET /api/materials => ${res2.statusCode}: ${data2.substring(0, 200)}`);
          server.close();
          process.exit(0);
        });
      });
      req2.end();
    });
  });
  req.write(JSON.stringify({ item_number: 'test001' }));
  req.end();
});
