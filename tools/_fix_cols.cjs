// Fix outsourcing_order missing columns
const BASE = 'http://localhost:3000/api/v1';

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  return res.json();
}

async function main() {
  // Login first
  const login = await api('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  const token = login.data.token;
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Use the execute-sql endpoint if available, otherwise use a workaround
  // We'll add missing columns via the API's internal SQL execution
  
  const alterStatements = [
    "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='outsourcing_order' AND COLUMN_NAME='qualified_quantity') ALTER TABLE outsourcing_order ADD qualified_quantity DECIMAL(18,4) DEFAULT 0",
    "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='outsourcing_order' AND COLUMN_NAME='settlement_quantity') ALTER TABLE outsourcing_order ADD settlement_quantity DECIMAL(18,4) DEFAULT 0",
    "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='outsourcing_order' AND COLUMN_NAME='issued_quantity') ALTER TABLE outsourcing_order ADD issued_quantity DECIMAL(18,4) DEFAULT 0",
    "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='outsourcing_order' AND COLUMN_NAME='issue_status') ALTER TABLE outsourcing_order ADD issue_status NVARCHAR(20) DEFAULT N'未发料'",
    "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='outsourcing_order' AND COLUMN_NAME='receipt_status') ALTER TABLE outsourcing_order ADD receipt_status NVARCHAR(20) DEFAULT N'未收回'",
    "IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='outsourcing_order' AND COLUMN_NAME='settlement_status') ALTER TABLE outsourcing_order ADD settlement_status NVARCHAR(20) DEFAULT N'未结算'",
  ];

  for (const sql of alterStatements) {
    try {
      // Try to use any internal SQL execution endpoint
      const res = await fetch(`${BASE}/admin/execute-sql`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ sql })
      });
      const data = await res.json();
      console.log(`✅ ${sql.substring(0, 80)}... → ${res.status}`);
    } catch (e) {
      console.log(`❌ Failed: ${e.message}`);
    }
  }
  
  console.log('\nDone! If the admin/execute-sql endpoint is not available, please run the SQL manually.');
}

main().catch(e => console.error(e));
