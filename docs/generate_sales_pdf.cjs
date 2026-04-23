const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const htmlPath = path.resolve(__dirname, '销售管理-从订单到发货到退货全流程方案-可视化.html');
  const pdfPath = path.resolve(__dirname, '销售管理-从订单到发货到退货全流程方案-可视化.pdf');
  const screenshotPath = path.resolve(__dirname, '销售管理-从订单到发货到退货全流程方案-可视化.png');

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

  // 等待 mermaid 渲染完成
  console.log('等待 Mermaid 图表渲染...');
  await new Promise(resolve => setTimeout(resolve, 8000));

  // 生成 PDF
  console.log('生成 PDF...');
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '16mm', bottom: '16mm', left: '12mm', right: '12mm' },
    displayHeaderFooter: false
  });
  console.log('PDF 已生成:', pdfPath);

  // 生成全页截图
  console.log('生成全页截图...');
  await page.screenshot({
    path: screenshotPath,
    fullPage: true,
    type: 'png'
  });
  console.log('截图已生成:', screenshotPath);

  await browser.close();
  console.log('完成!');
})();
