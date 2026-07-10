const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

// Simple markdown to HTML converter for the document
function mdToHtml(md) {
  let html = md;

  // Headings
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  // Merge consecutive blockquotes
  html = html.replace(/<\/blockquote>\n<blockquote>/g, '<br/>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr/>');

  // Tables
  const tableRegex = /^\|(.+)\|\n\|[-| :]+\|\n((?:\|.+\|\n?)*)/gm;
  html = html.replace(tableRegex, (match, header, body) => {
    const headers = header.split('|').filter(h => h.trim()).map(h => `<th>${h.trim()}</th>`).join('');
    const rows = body.trim().split('\n').map(row => {
      const cells = row.split('|').filter(c => c.trim()).map(c => `<td>${c.trim()}</td>`).join('');
      return `<tr>${cells}</tr>`;
    }).join('');
    return `<table><thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
  });

  // Code blocks (fenced)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, '<pre class="code-block"><code>$2</code></pre>');

  // Paragraphs (lines that aren't tags)
  const lines = html.split('\n');
  let result = [];
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip empty lines
    if (!line.trim()) {
      if (inList) {
        result.push('</ul>');
        inList = false;
      }
      result.push('');
      continue;
    }
    // Skip already-processed tags
    if (/^<(h[1-4]|table|pre|hr|blockquote|ul|li|div|code|strong|em|br)/.test(line.trim())) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(line);
      continue;
    }
    // List items
    if (/^[-*] /.test(line)) {
      if (!inList) { result.push('<ul>'); inList = true; }
      result.push(`<li>${line.replace(/^[-*] /, '')}</li>`);
      continue;
    }
    // Numbered list
    if (/^\d+\. /.test(line)) {
      if (inList) { result.push('</ul>'); inList = false; }
      result.push(`<p>${line}</p>`);
      continue;
    }
    // Regular paragraph
    if (inList) { result.push('</ul>'); inList = false; }
    result.push(`<p>${line}</p>`);
  }
  if (inList) result.push('</ul>');

  html = result.join('\n');

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  // Merge consecutive blockquotes properly
  html = html.replace(/<blockquote>(.+?)<\/blockquote>\s*<blockquote>(.+?)<\/blockquote>/g, '<blockquote>$1<br/>$2</blockquote>');

  return html;
}

(async () => {
  const mdPath = path.resolve(__dirname, '塑粉MOM系统-生产运营管理方案与实施计划.md');
  const pdfPath = path.resolve(__dirname, '塑粉MOM系统-生产运营管理方案与实施计划.pdf');

  console.log('Reading MD:', mdPath);
  const mdContent = fs.readFileSync(mdPath, 'utf-8');
  const bodyHtml = mdToHtml(mdContent);

  const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>睿信塑粉MOM系统 — 生产运营管理方案与实施计划</title>
<style>
  :root { --primary: #1890ff; --text: #2c3e50; --text2: #666; --border: #e8e8e8; --bg: #f5f7fa; }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    background: #fff; color: var(--text); line-height: 1.9;
    padding: 40px 60px; max-width: 960px; margin: 0 auto;
  }
  h1 { font-size: 24px; color: var(--primary); border-bottom: 3px solid var(--primary); padding-bottom: 12px; margin-bottom: 8px; }
  h2 { font-size: 19px; color: var(--primary); border-left: 4px solid var(--primary); padding-left: 12px; margin: 28px 0 14px; }
  h3 { font-size: 16px; color: #555; margin: 20px 0 10px; }
  h4 { font-size: 15px; color: #333; margin: 16px 0 8px; }
  p { margin: 8px 0; }
  blockquote {
    background: #f0f5ff; border-left: 4px solid var(--primary); padding: 12px 18px;
    margin: 14px 0; color: #555; font-size: 14px;
  }
  hr { border: none; border-top: 1px solid var(--border); margin: 24px 0; }
  code { background: #f5f5f5; padding: 1px 6px; border-radius: 3px; font-size: 13px; color: #d4380d; }
  pre.code-block {
    background: #1e1e1e; color: #d4d4d4; padding: 16px 20px; border-radius: 6px;
    overflow-x: auto; font-size: 13px; line-height: 1.6; margin: 12px 0;
    white-space: pre-wrap; word-break: break-all;
  }
  table {
    width: 100%; border-collapse: collapse; margin: 14px 0; font-size: 14px;
  }
  th { background: #f0f5ff; color: var(--primary); font-weight: 600; }
  th, td { border: 1px solid var(--border); padding: 8px 12px; text-align: left; }
  tr:nth-child(even) { background: #fafafa; }
  ul { padding-left: 24px; margin: 8px 0; }
  li { margin: 4px 0; }
  strong { color: #1a1a1a; }
  em { color: #555; }
  @media print {
    body { padding: 20px 30px; }
  }
</style>
</head>
<body>
${bodyHtml}
</body>
</html>`;

  // Write temp HTML
  const tempHtmlPath = path.resolve(__dirname, '_temp_mom_doc.html');
  fs.writeFileSync(tempHtmlPath, fullHtml, 'utf-8');
  console.log('Generated temp HTML:', tempHtmlPath);

  console.log('Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  await page.goto('file:///' + tempHtmlPath.replace(/\\/g, '/'), {
    waitUntil: 'networkidle0',
    timeout: 60000
  });

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div style="font-size:10px;text-align:right;width:100%;padding-right:20px;color:#aaa;">睿信塑粉MOM系统 · 生产运营管理方案与实施计划 | Seals MES</div>',
    footerTemplate: '<div style="font-size:10px;text-align:center;width:100%;color:#aaa;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
  });

  await browser.close();

  // Clean up temp file
  fs.unlinkSync(tempHtmlPath);
  console.log('PDF generated:', pdfPath);
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
