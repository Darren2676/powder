const fs = require('fs');
const path = require('path');

const mdPath = path.join(__dirname, 'Seals MES系统软件保护方案.md');
const htmlPath = path.join(__dirname, 'Seals MES系统软件保护方案.html');
const pdfPath = path.join(__dirname, 'Seals MES系统软件保护方案.pdf');

const md = fs.readFileSync(mdPath, 'utf-8');

function mdToHtml(text) {
  let html = text;
  
  // Code blocks (must be first to protect content inside)
  const codeBlocks = [];
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push(`<pre><code class="lang-${lang}">${escapeHtml(code.trim())}</code></pre>`);
    return `%%CODEBLOCK_${idx}%%`;
  });

  // Inline code
  const inlineCodes = [];
  html = html.replace(/`([^`]+)`/g, (match, code) => {
    const idx = inlineCodes.length;
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `%%INLINE_${idx}%%`;
  });

  // Headers
  html = html.replace(/^#### (.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  // Blockquotes
  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Tables
  const lines = html.split('\n');
  let inTable = false;
  let tableRows = [];
  let result = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('|') && line.endsWith('|')) {
      if (line.match(/^\|[\s\-:|]+\|$/)) continue;
      const cells = line.split('|').slice(1, -1);
      if (!inTable) { inTable = true; tableRows = []; }
      tableRows.push(cells);
    } else {
      if (inTable) {
        result.push(renderTable(tableRows));
        inTable = false;
        tableRows = [];
      }
      result.push(lines[i]);
    }
  }
  if (inTable) result.push(renderTable(tableRows));
  html = result.join('\n');

  // Checkboxes
  html = html.replace(/^- \[x\] (.+)$/gm, '<li style="list-style:none">&#9745; $1</li>');
  html = html.replace(/^- \[ \] (.+)$/gm, '<li style="list-style:none">&#9744; $1</li>');
  
  // List items
  html = html.replace(/^- (.+)$/gm, '<li>$1</li>');

  // Restore code blocks
  codeBlocks.forEach((block, idx) => {
    html = html.replace(`%%CODEBLOCK_${idx}%%`, block);
  });
  inlineCodes.forEach((code, idx) => {
    html = html.replace(`%%INLINE_${idx}%%`, code);
  });

  return html;
}

function escapeHtml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderTable(rows) {
  if (rows.length === 0) return '';
  let html = '<table>';
  html += '<thead><tr>';
  for (const cell of rows[0]) {
    html += `<th>${cell.trim()}</th>`;
  }
  html += '</tr></thead>';
  if (rows.length > 1) {
    html += '<tbody>';
    for (let i = 1; i < rows.length; i++) {
      html += '<tr>';
      for (const cell of rows[i]) {
        html += `<td>${cell.trim()}</td>`;
      }
      html += '</tr>';
    }
    html += '</tbody>';
  }
  html += '</table>';
  return html;
}

const body = mdToHtml(md);

const fullHtml = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Seals MES 系统软件保护方案</title>
<style>
  @page { size: A4; margin: 15mm 12mm; }
  body { font-family: "Microsoft YaHei", "SimHei", sans-serif; font-size: 11pt; line-height: 1.6; color: #333; max-width: 210mm; margin: 0 auto; padding: 10px; }
  h1 { font-size: 20pt; text-align: center; border-bottom: 2px solid #1890ff; padding-bottom: 10px; margin-bottom: 20px; color: #1890ff; }
  h2 { font-size: 15pt; border-left: 4px solid #1890ff; padding-left: 10px; margin-top: 25px; margin-bottom: 10px; color: #1890ff; }
  h3 { font-size: 13pt; margin-top: 18px; margin-bottom: 8px; color: #096dd9; }
  h4 { font-size: 12pt; margin-top: 12px; margin-bottom: 6px; color: #0050b3; }
  table { border-collapse: collapse; width: 100%; margin: 10px 0; font-size: 10pt; }
  th { background: #e6f7ff; border: 1px solid #91d5ff; padding: 6px 8px; text-align: left; font-weight: 600; white-space: nowrap; }
  td { border: 1px solid #d9d9d9; padding: 5px 8px; }
  tr:nth-child(even) { background: #fafafa; }
  blockquote { border-left: 3px solid #1890ff; padding: 5px 15px; margin: 10px 0; background: #f0f5ff; color: #555; font-size: 10pt; }
  pre { background: #282c34; color: #abb2bf; padding: 12px; border-radius: 4px; font-size: 9pt; overflow-x: auto; border: 1px solid #3e4451; }
  code { font-family: Consolas, "Courier New", monospace; font-size: 9.5pt; }
  p code { background: #f2f4f5; color: #c7254e; padding: 1px 4px; border-radius: 3px; font-size: 9.5pt; }
  hr { border: none; border-top: 1px solid #d9d9d9; margin: 15px 0; }
  li { margin: 3px 0 3px 20px; }
  strong { color: #262626; }
  p { margin: 5px 0; }
</style>
</head>
<body>
${body}
</body>
</html>`;

fs.writeFileSync(htmlPath, fullHtml, 'utf-8');
console.log('HTML generated:', htmlPath);

const { execSync } = require('child_process');

try {
  const edgePaths = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];

  let edgePath = null;
  for (const p of edgePaths) {
    if (fs.existsSync(p)) { edgePath = p; break; }
  }

  if (!edgePath) {
    console.log('Edge not found, skipping PDF generation');
  } else {
    const cmd = `"${edgePath}" --headless --disable-gpu --no-sandbox --print-to-pdf="${pdfPath}" --print-to-pdf-no-header "${htmlPath}"`;
    execSync(cmd, { timeout: 30000 });

    if (fs.existsSync(pdfPath)) {
      const stat = fs.statSync(pdfPath);
      console.log('PDF generated:', pdfPath, `(${(stat.size / 1024).toFixed(1)} KB)`);
    } else {
      console.log('PDF file not found after generation');
    }
  }
} catch (e) {
  console.error('PDF generation error:', e.message);
}
