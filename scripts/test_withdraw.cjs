const http = require('http');

function makeRequest(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const body = data ? JSON.stringify(data) : '';
    if (body) headers['Content-Length'] = Buffer.byteLength(body);
    
    const req = http.request({ hostname: 'localhost', port: 3000, path, method, headers }, (res) => {
      let chunks = '';
      res.on('data', c => chunks += c);
      res.on('end', () => {
        console.log(`${method} ${path} -> ${res.statusCode}`);
        try {
          resolve({ status: res.statusCode, data: JSON.parse(chunks) });
        } catch {
          console.log('Raw response (first 200 chars):', chunks.substring(0, 200));
          resolve({ status: res.statusCode, data: chunks });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  try {
    // 1. Login
    const login = await makeRequest('POST', '/api/v1/auth/login', { username: 'admin', password: 'admin123' });
    if (login.status !== 200 || !login.data.data?.token) {
      console.log('Login failed:', JSON.stringify(login.data).substring(0, 300));
      return;
    }
    const token = login.data.data.token;
    console.log('Login OK');

    // 2. Check the stock-in record exists
    const detail = await makeRequest('GET', '/api/v1/stock-ins/SI-20260518-001', null, token);
    console.log('Stock-in detail status:', detail.status);
    if (detail.data?.data?.header) {
      console.log('Header approval_status:', detail.data.data.header.approval_status);
      console.log('Header purchase_order_number:', detail.data.data.header.purchase_order_number);
      console.log('Details count:', detail.data.data.details?.length);
      if (detail.data.data.details) {
        for (const d of detail.data.data.details) {
          console.log(`  Detail: item=${d.item_number}, batch=${d.batch_number}, inspect_status=${d.inspect_status}, inspection_number=${d.inspection_number}`);
        }
      }
    } else {
      console.log('Detail response:', JSON.stringify(detail.data).substring(0, 500));
    }

    // 3. Try withdraw
    console.log('\n--- Attempting withdraw ---');
    const withdraw = await makeRequest('POST', '/api/v1/stock-ins/SI-20260518-001/withdraw', {}, token);
    console.log('Withdraw result:', JSON.stringify(withdraw.data).substring(0, 500));
  } catch (e) {
    console.log('FATAL ERROR:', e.message);
  }
})();
