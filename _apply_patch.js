const fs = require('fs');
const vue = 'client/src/views/DispatchPrint/Index.vue';
const code = fs.readFileSync('_detail_print_code.txt', 'utf8');
let c = fs.readFileSync(vue, 'utf8');

// Detect line ending
const crlf = c.includes('\r\n');
const eol = crlf ? '\r\n' : '\n';
console.log('Line ending:', crlf ? 'CRLF' : 'LF');

// 1. Insert detail print code before onMounted
const marker = 'onMounted(async';
const idx = c.indexOf(marker);
if (idx === -1) { console.log('ERROR: onMounted not found'); process.exit(1); }
// Normalize code to same line endings
let codeNorm = code.replace(/\r\n/g, '\n');
if (crlf) codeNorm = codeNorm.replace(/\n/g, '\r\n');
c = c.substring(0, idx) + codeNorm + eol + eol + c.substring(idx);
console.log('Step 1: Inserted detail print functions');

// 2. Replace button
const btnTextOld = '\u6279\u91CF\u6253\u5370'; // 批量打印
const btnIdx = c.indexOf(btnTextOld);
if (btnIdx === -1) { console.log('ERROR: button text not found'); process.exit(1); }
// Find the <a-button before it
const btnStart = c.lastIndexOf('<a-button', btnIdx);
const btnEnd = c.indexOf('</a-button>', btnIdx) + '</a-button>'.length;
const oldBtn = c.substring(btnStart, btnEnd);
console.log('Step 2: Found button block, length:', oldBtn.length);

// Build new buttons with same line endings
const lines = [
  '<a-button',
  '          :disabled="selectedRowKeys.length === 0"',
  '          :loading="detailPrintLoading"',
  '          @click="handleDetailPrint"',
  '        >',
  '          <FileTextOutlined />',
  '          \u8BE6\u7EC6\u6253\u5370 ({{ selectedRowKeys.length }})',
  '        </a-button>',
  '        <a-button',
  '          type="primary"',
  '          :disabled="selectedRowKeys.length === 0"',
  '          @click="handlePrint"',
  '        >',
  '          <PrinterOutlined />',
  '          \u5217\u8868\u6253\u5370 ({{ selectedRowKeys.length }})',
  '        </a-button>'
];
const newBtns = lines.join(eol);
c = c.substring(0, btnStart) + newBtns + c.substring(btnEnd);
console.log('Step 2: Replaced buttons');

fs.writeFileSync(vue, c, 'utf8');
const verify = fs.readFileSync(vue, 'utf8');
console.log('Verify handleDetailPrint:', verify.includes('handleDetailPrint'));
console.log('Verify triggerDetailPrint:', verify.includes('triggerDetailPrint'));
console.log('Verify detail button:', verify.includes('\u8BE6\u7EC6\u6253\u5370'));
console.log('Verify list button:', verify.includes('\u5217\u8868\u6253\u5370'));
console.log('New file size:', verify.length);
