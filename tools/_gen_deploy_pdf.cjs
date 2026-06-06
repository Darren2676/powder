const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const MD_PATH = path.join(__dirname, 'Seals MES System', 'docs', '异地分布式部署方案.html');
const PDF_OUTPUT = path.join(__dirname, '异地分布式部署方案.pdf');
const PLAN_MD = 'C:\\Users\\Darre\\AppData\\Roaming\\Qoder\\SharedClientCache\\cache\\plans\\异地分布式部署方案_b8f271df.md';

// ---------- simple markdown → HTML converter ----------
function mdToHtml(md) {
  const lines = md.split('\n');
  const out = [];
  let inCode = false, codeBuf = [], codeLang = '';
  let inTable = false, tableRows = [];

  function flushCode() {
    if (codeBuf.length === 0) return;
    out.push('<pre>' + escapeHtml(codeBuf.join('\n')) + '</pre>');
    codeBuf = [];
    inCode = false;
  }

  function flushTable() {
    if (tableRows.length === 0) return;
    let html = '<table>\n';
    tableRows.forEach((row, i) => {
      html += '<tr>';
      row.forEach(cell => {
        html += (i === 0 ? '<th>' : '<td>') + cell + (i === 0 ? '</th>' : '</td>');
      });
      html += '</tr>\n';
    });
    html += '</table>';
    out.push(html);
    tableRows = [];
    inTable = false;
  }

  function parseInline(s) {
    // bold
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // inline code
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    return s;
  }

  function parseTableRow(line) {
    return line.split('|').map(c => c.trim()).filter(c => c !== '');
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    // code block toggle
    if (line.startsWith('```')) {
      if (inCode) { flushCode(); }
      else { inCode = true; codeLang = line.slice(3).trim(); }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }

    // table
    if (line.startsWith('|') && line.endsWith('|')) {
      if (line.includes('---')) continue; // separator row
      if (!inTable) { tableRows = []; inTable = true; }
      tableRows.push(parseTableRow(line));
      // peek ahead: if next line is not a table row, flush
      const next = i + 1 < lines.length ? lines[i + 1].trim() : '';
      if (!next.startsWith('|') || !next.endsWith('|')) { flushTable(); }
      continue;
    }

    // headers
    if (line.startsWith('# ')) { out.push('<h1>' + parseInline(line.slice(2)) + '</h1>'); continue; }
    if (line.startsWith('## ')) { out.push('<h2>' + parseInline(line.slice(3)) + '</h2>'); continue; }
    if (line.startsWith('### ')) { out.push('<h3>' + parseInline(line.slice(4)) + '</h3>'); continue; }
    if (line.startsWith('#### ')) { out.push('<h4>' + parseInline(line.slice(5)) + '</h4>'); continue; }

    // hr
    if (line === '---') { out.push('<hr>'); continue; }

    // unordered list
    if (line.startsWith('- ')) { out.push('<li>' + parseInline(line.slice(2)) + '</li>'); continue; }

    // blockquote-like (sync flow)
    if (line.startsWith('> ')) { out.push('<p style="padding-left:16px;border-left:3px solid #1890ff;color:#555;">' + parseInline(line.slice(2)) + '</p>'); continue; }

    // empty
    if (line === '') continue;

    // ordinary paragraph
    out.push('<p>' + parseInline(line) + '</p>');
  }

  flushCode();
  flushTable();

  // wrap consecutive <li> in <ul>
  const wrapped = [];
  let ulBuf = [];
  function flushUl() {
    if (ulBuf.length) { wrapped.push('<ul>\n' + ulBuf.join('\n') + '\n</ul>'); ulBuf = []; }
  }
  for (const el of out) {
    if (el.startsWith('<li>')) { ulBuf.push(el); }
    else { flushUl(); wrapped.push(el); }
  }
  flushUl();

  return wrapped.join('\n');
}

function escapeHtml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------- main ----------
(async () => {
  const md = fs.readFileSync(PLAN_MD, 'utf-8');
  const bodyHtml = mdToHtml(md);

  const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Seals MES System 异地分布式部署方案</title>
<style>
  @page { size: A4; margin: 18mm 16mm 18mm 16mm; }
  body {
    font-family: "Microsoft YaHei", "SimHei", "PingFang SC", sans-serif;
    font-size: 12.5px;
    line-height: 1.65;
    color: #1a1a1a;
    max-width: 100%; padding: 0; margin: 0;
  }
  h1 { font-size: 21px; text-align: center; margin: 0 0 20px 0; padding-bottom: 10px; border-bottom: 2px solid #1890ff; color: #0d1a26; }
  h2 { font-size: 16px; margin: 24px 0 10px 0; padding: 5px 0 5px 10px; border-left: 4px solid #1890ff; background: #f0f5ff; color: #0d1a26; page-break-after: avoid; }
  h3 { font-size: 13.5px; margin: 18px 0 7px 0; color: #1a3a5c; page-break-after: avoid; }
  h4 { font-size: 12.5px; margin: 12px 0 5px 0; color: #2a4a6c; }
  p { margin: 5px 0; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11.5px; page-break-inside: avoid; }
  th { background: #1890ff; color: #fff; padding: 6px 7px; text-align: left; font-weight: 600; }
  td { padding: 5px 7px; border: 1px solid #d9d9d9; }
  tr:nth-child(even) td { background: #fafafa; }
  pre { background: #f5f5f5; border: 1px solid #e0e0e0; border-radius: 3px; padding: 10px 12px; font-size: 11px; line-height: 1.45; overflow-x: auto; white-space: pre-wrap; word-break: break-all; font-family: Consolas, "Courier New", monospace; page-break-inside: avoid; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 11px; background: #f0f0f0; padding: 1px 3px; border-radius: 2px; }
  pre code { background: none; padding: 0; }
  ul, ol { margin: 5px 0; padding-left: 20px; }
  li { margin: 2px 0; }
  strong { color: #cf1322; }
  hr { border: none; border-top: 1px solid #e0e0e0; margin: 18px 0; }
  .footer { text-align: center; font-size: 10px; color: #999; margin-top: 24px; padding-top: 8px; border-top: 1px solid #e0e0e0; }
</style>
</head>
<body>
${bodyHtml}
<div class="footer">Seals MES System — 异地分布式部署方案 &nbsp;|&nbsp; 宁国市睿信信息技术有限责任公司</div>
</body>
</html>`;

  // save html for reference
  fs.writeFileSync(MD_PATH, fullHtml, 'utf-8');
  console.log('HTML saved to:', MD_PATH);

  // generate PDF
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const htmlUrl = 'file:///' + MD_PATH.replace(/\\/g, '/');
  await page.goto(htmlUrl, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 800));
  await page.pdf({
    path: PDF_OUTPUT,
    format: 'A4',
    margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' },
    printBackground: true,
    displayHeaderFooter: false
  });
  await browser.close();

  const stat = fs.statSync(PDF_OUTPUT);
  console.log('PDF generated:', PDF_OUTPUT, `(${(stat.size / 1024).toFixed(1)} KB)`);
})();
