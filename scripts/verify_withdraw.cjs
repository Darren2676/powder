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
      res.on('end', () => { resolve({ status: res.statusCode, data: JSON.parse(chunks) }); });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

(async () => {
  try {
    const login = await makeRequest('POST', '/api/v1/auth/login', { username: 'admin', password: 'admin123' });
    const token = login.data.data.token;

    // 1. 验证入库单状态
    const detail = await makeRequest('GET', '/api/v1/stock-ins/SI-20260518-001', null, token);
    if (detail.data?.data?.header) {
      const h = detail.data.data.header;
      console.log('1. 入库单状态:', h.approval_status, '(应为"已撤回")');
      const d = detail.data.data.details?.[0];
      if (d) {
        console.log('2. 明细批次号:', d.batch_number || '(空)', '(应为空)');
        console.log('3. 明细检验状态:', d.inspect_status || '(空)', '(应为空)');
      }
    }

    // 2. 验证采购订单状态
    const poRes = await makeRequest('GET', '/api/v1/purchase-orders/PUR-20260517-003', null, token);
    if (poRes.data?.data) {
      const po = Array.isArray(poRes.data.data) ? poRes.data.data[0] : poRes.data.data;
      console.log('4. PO状态:', po.order_status || po.data?.order_status, '(应为"待执行")');
    }

    console.log('\n验证完毕');
  } catch (e) { console.log('ERROR:', e.message); }
})();