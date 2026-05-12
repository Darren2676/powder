const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const htmlPath = path.resolve(__dirname, '备料出库记录删除操作指南.html');
  const pdfPath = path.resolve(__dirname, '备料出库记录删除操作指南.pdf');
  
  console.log('Loading HTML:', htmlPath);
  
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), {
    waitUntil: 'networkidle0',
    timeout: 30000
  });
  
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '30px', bottom: '30px', left: '40px', right: '40px' },
    displayHeaderFooter: true,
    headerTemplate: '<div style="font-size:10px;text-align:right;width:100%;padding-right:20px;color:#aaa;">备料出库记录删除操作指南 | Seals MES</div>',
    footerTemplate: '<div style="font-size:10px;text-align:center;width:100%;color:#aaa;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
  });
  
  await browser.close();
  console.log('PDF generated:', pdfPath);
})();
