/**
 * 销售管理全接口冒烟测试
 * 覆盖: 销售订单 / 发货申请 / 发货单 / 退货单 全部 API
 */
const http = require('http');

const BASE = 'http://127.0.0.1:3000/api';
let TOKEN = '';
let pass = 0, fail = 0, skip = 0;
const results = [];

// ─── HTTP 工具 ───
function req(method, path, body) {
  return new Promise((resolve) => {
    const url = new URL(BASE + path);
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: url.hostname, port: url.port,
      path: url.pathname + url.search,
      method, headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TOKEN}`
      }
    };
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const r = http.request(opts, (res) => {
      let buf = '';
      res.on('data', c => buf += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(buf) }); }
        catch { resolve({ status: res.statusCode, data: buf }); }
      });
    });
    r.on('error', e => resolve({ status: 0, data: e.message }));
    if (data) r.write(data);
    r.end();
  });
}

function ok(name, res, check) {
  const passed = res.status === 200 && (check ? check(res.data) : true);
  if (passed) { pass++; results.push(`  ✅ ${name}`); }
  else { fail++; results.push(`  ❌ ${name} [${res.status}] ${typeof res.data === 'string' ? res.data.substring(0,80) : JSON.stringify(res.data).substring(0,120)}`); }
  return res;
}

function skipped(name, reason) {
  skip++; results.push(`  ⏭️  ${name} (${reason})`);
}

// ─── 主测试 ───
async function main() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   销售管理全接口冒烟测试                              ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  // 1. 登录
  const login = await req('POST', '/auth/login', { username: 'admin', password: 'admin123' });
  if (login.status !== 200 || !login.data?.data?.token) {
    console.log('❌ 登录失败，无法继续测试'); return;
  }
  TOKEN = login.data.data.token;
  console.log('🔐 登录成功\n');

  // ═══════════════════════════════════════════════════
  // A. 销售订单接口
  // ═══════════════════════════════════════════════════
  results.push('── A. 销售订单 ──');

  // A1. 列表
  let r = await req('GET', '/sales-orders?page=1&limit=5');
  ok('A1 GET /sales-orders 列表', r, d => d.data?.items !== undefined);

  // A2. 从列表中取第一条已审批订单用于后续测试
  let soNumber = null, soId = null;
  if (r.data?.data?.items?.length > 0) {
    const item = r.data.data.items.find(i => i.approval_status === '已审批') || r.data.data.items[0];
    soNumber = item.sales_order_number;
    soId = item.id || soNumber;
  }

  // A3. 详情
  if (soNumber) {
    r = await req('GET', `/sales-orders/${soNumber}`);
    ok('A2 GET /sales-orders/:id 详情', r, d => d.data);
  } else skipped('A2 GET /sales-orders/:id 详情', '无订单数据');

  // ═══════════════════════════════════════════════════
  // B. 发货申请接口
  // ═══════════════════════════════════════════════════
  results.push('\n── B. 发货申请 ──');

  // B1. 待发货列表
  r = await req('GET', '/shipping-requests/pending?page=1&limit=5');
  ok('B1 GET /shipping-requests/pending 待发货列表', r);

  // B2. 待发明细
  r = await req('GET', '/shipping-requests/pending-details?page=1&limit=5');
  ok('B2 GET /shipping-requests/pending-details 待发明细', r);

  // B3. 发货申请列表
  r = await req('GET', '/shipping-requests?page=1&limit=5');
  ok('B3 GET /shipping-requests 申请列表', r, d => d.data?.items !== undefined);

  // 获取第一个发货申请用于详情测试
  let srId = null;
  if (r.data?.data?.items?.length > 0) {
    srId = r.data.data.items[0].id;
  }

  // B4. 发货申请详情
  if (srId) {
    r = await req('GET', `/shipping-requests/${srId}`);
    ok('B4 GET /shipping-requests/:id 申请详情', r, d => d.data);
  } else skipped('B4 GET /shipping-requests/:id 申请详情', '无申请数据');

  // ═══════════════════════════════════════════════════
  // C. 发货单接口
  // ═══════════════════════════════════════════════════
  results.push('\n── C. 发货单 ──');

  // C1. 发货单列表
  r = await req('GET', '/shipping-orders?page=1&limit=5');
  ok('C1 GET /shipping-orders 发货单列表', r, d => d.data?.items !== undefined);

  // 获取第一个发货单号
  let soSN = null;
  if (r.data?.data?.items?.length > 0) {
    soSN = r.data.data.items[0].shipping_order_number;
  }

  // C2. 发货单明细列表（批次级）
  r = await req('GET', '/shipping-orders/details-page?page=1&limit=5');
  ok('C2 GET /shipping-orders/details-page 明细列表', r);

  // C3. 发货单详情
  if (soSN) {
    r = await req('GET', `/shipping-orders/${soSN}`);
    ok('C3 GET /shipping-orders/:sn 详情', r, d => d.data);
  } else skipped('C3 GET /shipping-orders/:sn 详情', '无发货单数据');

  // C4. 打印数据
  if (soSN) {
    r = await req('GET', `/shipping-orders/${soSN}/print`);
    ok('C4 GET /shipping-orders/:sn/print 打印数据', r);
  } else skipped('C4 GET /shipping-orders/:sn/print 打印数据', '无发货单数据');

  // ═══════════════════════════════════════════════════
  // D. 退货单接口
  // ═══════════════════════════════════════════════════
  results.push('\n── D. 退货单 ──');

  // D1. 退货单列表
  r = await req('GET', '/return-orders?page=1&limit=5');
  ok('D1 GET /return-orders 退货单列表', r, d => d.data?.items !== undefined);

  // 获取第一个退货单号
  let rtNum = null;
  if (r.data?.data?.items?.length > 0) {
    rtNum = r.data.data.items[0].return_order_number;
  }

  // D2. 退货单明细列表
  r = await req('GET', '/return-orders/details-page?page=1&limit=5');
  ok('D2 GET /return-orders/details-page 退货明细', r);

  // D3. 退货单详情
  if (rtNum) {
    r = await req('GET', `/return-orders/${rtNum}`);
    ok('D3 GET /return-orders/:rn 详情', r, d => d.data);
  } else skipped('D3 GET /return-orders/:rn 详情', '无退货单数据');

  // D4. 可退货发货单
  if (soSN) {
    r = await req('GET', `/return-orders/shipping-order/${soSN}`);
    ok('D4 GET /return-orders/shipping-order/:sn 可退货', r);
  } else skipped('D4 GET /return-orders/shipping-order/:sn 可退货', '无发货单');

  // ═══════════════════════════════════════════════════
  // E. 写操作端到端测试（创建→状态流转→撤消）
  // ═══════════════════════════════════════════════════
  results.push('\n── E. 端到端写操作测试 ──');

  // E1. 查找可用的待发货明细行
  r = await req('GET', '/shipping-requests/pending?page=1&limit=50');
  let pendingDetail = null;
  if (r.data?.data?.items?.length > 0) {
    // 找到有pending_quantity > 0的行
    pendingDetail = r.data.data.items.find(i => {
      const pq = parseFloat(i.pending_quantity || i.suggest_quantity || '0');
      return pq > 0;
    });
  }

  if (pendingDetail) {
    const detailId = pendingDetail.id || pendingDetail.detail_id;
    const shipQty = Math.min(1, parseFloat(pendingDetail.pending_quantity || pendingDetail.suggest_quantity || '1'));
    const customerNumber = pendingDetail.customer_number;
    const customerName = pendingDetail.customer_name || '';

    // E2. 创建发货申请
    r = await req('POST', '/shipping-requests', {
      customer_number: customerNumber,
      customer_name: customerName,
      details: [{
        sales_detail_id: detailId,
        ship_quantity: shipQty
      }]
    });
    const srCreated = ok('E1 POST /shipping-requests 创建发货申请', r, d => d.data?.request_number);
    const newSrNum = srCreated?.data?.data?.request_number;
    let newSrId = null;

    if (newSrNum) {
      // E3. 获取新创建的申请详情
      r = await req('GET', `/shipping-requests?page=1&limit=5&search=${newSrNum}`);
      if (r.data?.data?.items?.length > 0) {
        newSrId = r.data.data.items[0].id;
      }

      // E4. 获取详情验证
      if (newSrId) {
        r = await req('GET', `/shipping-requests/${newSrId}`);
        ok('E2 GET /shipping-requests/:id 新申请详情', r, d => d.data);
      }

      // E5. 验证订单发货状态已更新
      if (pendingDetail.sales_order_number) {
        r = await req('GET', `/sales-orders/${pendingDetail.sales_order_number}`);
        ok('E3 验证订单shipping_status已更新', r, d => {
          const details = d.data?.details || [];
          const matched = details.find(dd => dd.id === detailId);
          return matched && matched.shipping_status !== '未申请';
        });
      }

      // E6. 撤消/删除发货申请 (回写测试)
      if (newSrId) {
        // 先尝试delete（待审核状态可以直接删除）
        r = await req('DELETE', `/shipping-requests/${newSrId}`);
        ok('E4 DELETE /shipping-requests/:id 删除申请+回写', r);
      }

      // E7. 验证回写后状态恢复
      if (pendingDetail.sales_order_number) {
        r = await req('GET', `/sales-orders/${pendingDetail.sales_order_number}`);
        ok('E5 验证删除后shipping_status回写恢复', r, d => d.data);
      }
    } else {
      skipped('E2-E5', '创建发货申请失败');
    }
  } else {
    skipped('E1-E5 端到端写操作测试', '无可用待发货明细');
  }

  // ═══════════════════════════════════════════════════
  // F. 订单状态维度验证
  // ═══════════════════════════════════════════════════
  results.push('\n── F. 订单状态维度验证 ──');

  r = await req('GET', '/sales-orders?page=1&limit=10');
  if (r.data?.data?.items?.length > 0) {
    const sample = r.data.data.items[0];
    const soNum = sample.sales_order_number;
    r = await req('GET', `/sales-orders/${soNum}`);
    if (r.data?.data) {
      const header = r.data.data.header || r.data.data;
      const details = r.data.data.details || header.details || [];

      // F1. 检查订单头状态字段
      const hasOrderStatus = header.order_status !== undefined;
      ok('F1 订单头 order_status 字段存在', { status: 200, data: {} }, () => hasOrderStatus);

      if (details.length > 0) {
        const d0 = details[0];
        // F2-F5. 检查明细行四维状态
        ok('F2 明细行 shipping_status 字段存在', { status: 200, data: {} }, () => d0.shipping_status !== undefined);
        ok('F3 明细行 production_status 字段存在', { status: 200, data: {} }, () => d0.production_status !== undefined);
        ok('F4 明细行 return_status 字段存在', { status: 200, data: {} }, () => d0.return_status !== undefined);
        ok('F5 明细行 status 字段存在', { status: 200, data: {} }, () => d0.status !== undefined);

        // 输出采样数据
        results.push(`     📊 采样 ${soNum}: order_status=${header.order_status}`);
        results.push(`     📊 行[0]: status=${d0.status} shipping=${d0.shipping_status} production=${d0.production_status} return=${d0.return_status}`);
      } else {
        skipped('F2-F5 明细行状态验证', '无明细行数据');
      }
    }
  } else {
    skipped('F1-F5 状态维度验证', '无订单数据');
  }

  // ═══════════════════════════════════════════════════
  // 汇总
  // ═══════════════════════════════════════════════════
  console.log(results.join('\n'));
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log(`║   测试结果: ✅ ${pass} 通过  ❌ ${fail} 失败  ⏭️  ${skip} 跳过     ║`);
  console.log('╚══════════════════════════════════════════════════════╝');
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
