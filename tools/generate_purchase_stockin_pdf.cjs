const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

(async () => {
  const htmlPath = path.resolve(__dirname, 'Seals MES System/docs/采购入库业务全流程逻辑流程图.html');
  const pdfPath = path.resolve(__dirname, 'Seals MES System/docs/采购入库业务全流程逻辑流程图.pdf');
  const mermaidPath = path.resolve(__dirname, 'node_modules/mermaid/dist/mermaid.min.js');

  console.log('启动浏览器...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--allow-file-access-from-files']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });

  page.on('console', msg => {
    if (msg.type() === 'error' || msg.text().includes('mermaid')) {
      console.log('[PAGE]', msg.type(), msg.text().substring(0, 200));
    }
  });

  // 读取HTML内容并替换mermaid脚本标签
  let htmlContent = fs.readFileSync(htmlPath, 'utf-8');
  // 移除mermaid script标签，我们将手动注入
  htmlContent = htmlContent.replace(/<script src="[^"]*mermaid[^"]*"><\/script>/g, '');
  htmlContent = htmlContent.replace(/<script>mermaid\.initialize\([^)]*\);<\/script>/g, '');

  console.log('加载 HTML 页面...');
  await page.setContent(htmlContent, { waitUntil: 'networkidle0', timeout: 60000 });

  // 注入 mermaid 库
  console.log('注入 Mermaid 库...');
  await page.addScriptTag({ path: mermaidPath });

  // 初始化并运行 mermaid
  console.log('初始化 Mermaid...');
  await page.evaluate(() => {
    window.mermaid.initialize({ startOnLoad: false, theme: 'default' });
  });

  // 运行 mermaid 渲染
  console.log('渲染 Mermaid 图表...');
  await page.evaluate(async () => {
    await window.mermaid.run({ querySelector: '.mermaid' });
  });

  // 等待渲染完成
  await new Promise(resolve => setTimeout(resolve, 5000));

  // 检查渲染状态
  const svgCount = await page.evaluate(() => {
    return document.querySelectorAll('.mermaid svg').length;
  });
  console.log('已渲染 SVG 数量:', svgCount);

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

  await browser.close();
  console.log('完成!');
})();
