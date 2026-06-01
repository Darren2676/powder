const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-setuid-sandbox'] });
  const page = await browser.newPage();
  
  const htmlPath = path.join(__dirname, '异地分布式部署方案.html');
  const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
  
  await page.goto(fileUrl, { waitUntil: 'networkidle0' });
  
  const pdfPath = path.join(__dirname, '异地分布式部署方案.pdf');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '18mm', bottom: '18mm', left: '16mm', right: '16mm' }
  });
  
  await browser.close();
  console.log('PDF generated:', pdfPath);
})();
