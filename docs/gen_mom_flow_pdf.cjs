const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const htmlPath = path.resolve(__dirname, '塑粉MOM系统-生产运营管理-业务逻辑流程图.html');
  const pdfPath = path.resolve(__dirname, '塑粉MOM系统-生产运营管理-业务逻辑流程图.pdf');

  console.log('Loading HTML:', htmlPath);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), {
    waitUntil: 'networkidle0',
    timeout: 120000
  });

  // Wait extra time for mermaid rendering (large number of diagrams)
  console.log('Waiting for Mermaid diagrams to render...');
  await new Promise(r => setTimeout(r, 8000));

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' },
    displayHeaderFooter: true,
    headerTemplate: '<div style="font-size:10px;text-align:right;width:100%;padding-right:20px;color:#aaa;">睿信塑粉MOM系统 · 生产运营管理业务逻辑流程图 | Seals MES</div>',
    footerTemplate: '<div style="font-size:10px;text-align:center;width:100%;color:#aaa;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
  });

  await browser.close();
  console.log('PDF generated:', pdfPath);
})().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
