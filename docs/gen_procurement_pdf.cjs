const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const htmlPath = path.resolve(__dirname, '采购收货检验退货操作手册.html');
  const pdfPath = path.resolve(__dirname, '采购收货检验退货操作手册.pdf');

  console.log('启动浏览器...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  console.log('加载 HTML 页面...');
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), {
    waitUntil: 'networkidle0',
    timeout: 30000
  });

  // 等待渲染完成
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log('生成 PDF...');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '14mm', right: '14mm' },
    displayHeaderFooter: false
  });
  console.log('PDF 已生成:', pdfPath);

  await browser.close();
  console.log('完成!');
})();
