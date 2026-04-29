const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'localhost', port: 3000, path, method, headers: { 'Content-Type': 'application/json' } };
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    if (body) opts.headers['Content-Length'] = Buffer.byteLength(body);
    const r = http.request(opts, res => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, data: JSON.parse(d) }); } catch { resolve({ status: res.statusCode, data: d }); } });
    });
    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  console.log('=== 发货预警API冒烟测试 ===\n');

  // 1. 登录
  const login = await req('POST', '/api/auth/login', JSON.stringify({ username: 'admin', password: 'admin123' }));
  const token = login.data?.data?.token;
  if (!token) { console.log('FAIL: 登录失败'); process.exit(1); }
  console.log('1. 登录成功');

  // 2. 默认未来3天预警 (days=2 表示今天+明天+后天)
  const r1 = await req('GET', '/api/sales-report/shipping-warning?page=1&limit=5&days=2', null, token);
  console.log(`2. 默认查询 status=${r1.status} success=${r1.data.success}`);
  console.log(`   KPI: total=${r1.data.data?.kpi?.total} today=${r1.data.data?.kpi?.todayCount} tomorrow=${r1.data.data?.kpi?.tomorrowCount} dayAfter=${r1.data.data?.kpi?.dayAfterCount}`);
  console.log(`   items: ${r1.data.data?.items?.length} / total: ${r1.data.data?.total}`);
  if (r1.data.data?.items?.[0]) {
    const item = r1.data.data.items[0];
    console.log(`   首行: ${item.sales_order_number} | ${item.item_number} | 订${item.order_quantity} 发${item.shipped_quantity} 待${item.pending_quantity} | 交付${item.promised_delivery_date} 剩余${item.remaining_days}天`);
  }

  // 3. 仅今天到期 (days=0)
  const r2 = await req('GET', '/api/sales-report/shipping-warning?page=1&limit=5&days=0', null, token);
  console.log(`3. 仅今天 status=${r2.status} total=${r2.data.data?.total}`);

  // 4. 未来7天预警 (days=6)
  const r3 = await req('GET', '/api/sales-report/shipping-warning?page=1&limit=5&days=6', null, token);
  console.log(`4. 7天预警 status=${r3.status} total=${r3.data.data?.total}`);

  // 5. 搜索
  const r4 = await req('GET', '/api/sales-report/shipping-warning?page=1&limit=5&days=6&search=SO', null, token);
  console.log(`5. 搜索SO status=${r4.status} total=${r4.data.data?.total}`);

  // 验证
  const allPass = [r1, r2, r3, r4].every(r => r.status === 200 && r.data.success);
  console.log(`\n=== 结果: ${allPass ? 'ALL PASS' : 'HAS FAILURE'} ===`);
})();
