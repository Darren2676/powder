const http = require('http');
async function login() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ username: 'admin', password: 'admin123' });
    const req = http.request({ hostname: 'localhost', port: 3000, path: '/api/v1/auth/login', method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>{ try { resolve(JSON.parse(b).data?.token); } catch(e) { reject(e); } }); });
    req.on('error', reject);
    req.write(data); req.end();
  });
}
function api(token, method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: 'localhost', port: 3000, path, method, headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token, ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}) } }, res => { let b=''; res.on('data',c=>b+=c); res.on('end',()=>{ try { resolve({ status: res.statusCode, data: JSON.parse(b) }); } catch(e) { resolve({ status: res.statusCode, text: b }); } }); });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
(async () => {
  const token = await login();
  console.log('Token obtained');

  // 尝试对PT-20260504-116(硫化)创建报工
  const result = await api(token, 'POST', '/api/v1/work-reports', {
    process_task_number: 'PT-20260504-116',
    qualified_quantity: 10,
    unqualified_quantity: 0,
    report_date: '2026/05/04',
    schedules_id: 'S001',
    schedules_name: '白班',
    operator_name: '测试',
    remark: 'API测试报工'
  });
  console.log('\n创建报工结果:', JSON.stringify(result, null, 2));
})();
