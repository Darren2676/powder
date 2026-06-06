const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

const HTML_PATH = path.join(__dirname, 'Seals MES System', 'docs', '方案B变体对等Mesh实施变更细节建议方案.html');
const PDF_OUTPUT = path.join(__dirname, '方案B变体对等Mesh实施变更细节建议方案.pdf');

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const htmlUrl = 'file:///' + HTML_PATH.replace(/\\/g, '/');
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
