const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const htmlPath = path.resolve(__dirname, '系统名称变更记录.html');
  const pdfPath = path.resolve(__dirname, '系统名称变更记录.pdf');

  console.log('启动浏览器...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  console.log('加载 HTML 页面...');
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), {
    waitUntil: 'networkidle0',
    timeout: 60000
  });

  console.log('等待页面渲染...');
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('生成 PDF...');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' },
    displayHeaderFooter: false
  });
  console.log('PDF 已生成:', pdfPath);

  await browser.close();
  console.log('完成!');
})();
