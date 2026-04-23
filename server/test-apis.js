const http = require('http');

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/api${path}`,
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) options.headers['Authorization'] = `Bearer ${token}`;
    const req = http.request(options, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  // Login
  const login = await request('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  const token = login.data.token;
  console.log('1. Login OK');

  // Test status update - set to running
  const r1 = await request('PUT', '/equipments/LH001/status', { equipment_status: '运行' }, token);
  console.log('2. Status->运行:', r1.success, r1.message);

  // Test status overview
  const r2 = await request('GET', '/equipments/status-overview', null, token);
  console.log('3. Status overview:', r2.success, JSON.stringify(r2.data));

  // Test status change to fault
  const r3 = await request('PUT', '/equipments/LH001/status', { equipment_status: '故障', fault_reason: '测试故障' }, token);
  console.log('4. Status->故障:', r3.success, r3.message);

  // Test downtime records
  const r4 = await request('GET', '/equipment-downtime?page=1&limit=5', null, token);
  console.log('5. Downtime records:', r4.success, 'Total:', r4.data?.pagination?.total);

  // Restore to idle
  const r5 = await request('PUT', '/equipments/LH001/status', { equipment_status: '闲置' }, token);
  console.log('6. Status->闲置:', r5.success, r5.message);

  // Test maintenance settings
  const r6 = await request('PUT', '/equipments/LH001/maintenance-settings', { maintenance_cycle_days: 30, daily_running_hours: 20 }, token);
  console.log('7. Maintenance settings:', r6.success, r6.message);

  // Auto-generate maintenance plans
  const r7 = await request('POST', '/equipment-maintenance-plan/auto-generate', {}, token);
  console.log('8. Auto-generate plans:', r7.success, r7.message);

  // Get maintenance plans
  const r8 = await request('GET', '/equipment-maintenance-plan?page=1&limit=5', null, token);
  console.log('9. Maintenance plans:', r8.success, 'Total:', r8.data?.pagination?.total);

  // OEE dashboard
  const r9 = await request('GET', '/equipment-oee/dashboard', null, token);
  console.log('10. OEE dashboard:', r9.success, 'OEE:', r9.data?.summary?.avg_oee);

  // Equipment list with new fields
  const r10 = await request('GET', '/equipments?page=1&limit=1', null, token);
  const item = r10.data?.items?.[0];
  console.log('11. Equipment fields:', { status: item?.equipment_status, cycle: item?.maintenance_cycle_days, hours: item?.daily_running_hours, next: item?.next_maintenance_date });

  console.log('\n=== All tests done ===');
}

test().catch(e => console.error('Test error:', e.message));
