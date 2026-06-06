const axios = require('axios');
const BASE = 'http://localhost:3000/api/v1';
async function test() {
  const loginRes = await axios.post(`${BASE}/auth/login`, { username: 'admin', password: 'admin123' });
  const token = loginRes.data.data.token;
  const headers = { Authorization: `Bearer ${token}` };
  console.log('1. Login OK');
  const createRes = await axios.post(`${BASE}/piece-rate-prices`, {
    price_list_name: 'test approval',
    effective_date: '2026-07-01', expiration_date: '2026-12-31',
    details: [{ item_number: 'T001', item_name: 'T', standard_process_number: 'P001', standard_process_name: 'P', qualified_piece_rate: 2 }]
  }, { headers });
  const newNum = createRes.data.data.price_list_number;
  console.log('2. Create OK:', newNum);
  try {
    const submitRes = await axios.post(`${BASE}/approval/submit`, { module: 'piece_rate_price_header', record_id: newNum }, { headers });
    console.log('3. Submit OK:', submitRes.data.success);
  } catch (e) { console.error('3. Submit FAILED:', e.response?.data || e.message); }
  const d1 = await axios.get(`${BASE}/piece-rate-prices/${encodeURIComponent(newNum)}`, { headers });
  console.log('4. Status:', d1.data.data.header.approval_status);
  try {
    const approveRes = await axios.post(`${BASE}/approval/approve`, { module: 'piece_rate_price_header', record_id: newNum }, { headers });
    console.log('5. Approve OK:', approveRes.data.success);
  } catch (e) { console.error('5. Approve FAILED:', e.response?.data || e.message); }
  const d2 = await axios.get(`${BASE}/piece-rate-prices/${encodeURIComponent(newNum)}`, { headers });
  console.log('6. Status:', d2.data.data.header.approval_status);
  try {
    const revRes = await axios.post(`${BASE}/approval/reverse`, { module: 'piece_rate_price_header', record_id: newNum }, { headers });
    console.log('7. Reverse OK:', revRes.data.success);
  } catch (e) { console.error('7. Reverse FAILED:', e.response?.data || e.message); }
  await axios.delete(`${BASE}/piece-rate-prices/${encodeURIComponent(newNum)}`, { headers });
  console.log('8. Delete OK');
}
test().catch(e => { console.error('FAIL:', e.response?.data || e.message); process.exit(1); });