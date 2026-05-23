const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const htmlPath = path.resolve(__dirname, '生产单派发到入库撤销全流程逻辑流程图.html');
  const pdfPath = path.resolve(__dirname, '生产单派发到入库撤销全流程逻辑流程图.pdf');

  console.log('Loading HTML:', htmlPath);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), {
    waitUntil: 'networkidle0',
    timeout: 60000
  });

  // Wait extra time for mermaid rendering
  await new Promise(r => setTimeout(r, 5000));

  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '30px', bottom: '30px', left: '40px', right: '40px' },
    displayHeaderFooter: true,
    headerTemplate: '<div style="font-size:10px;text-align:right;width:100%;padding-right:20px;color:#aaa;">生产单派发→备料→报工→检验→入库→撤销全流程 | Seals MES</div>',
    footerTemplate: '<div style="font-size:10px;text-align:center;width:100%;color:#aaa;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
  });

  await browser.close();
  console.log('PDF generated:', pdfPath);
})();