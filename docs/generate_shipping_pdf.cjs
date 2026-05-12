const puppeteer = require('puppeteer');
const path = require('path');

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const htmlPath = path.join(__dirname, '..', '..', 'sales_shipping_flow.html');
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });

  // Wait for mermaid to render all diagrams
  await page.waitForFunction(() => window.diagramReady === true, { timeout: 60000 });
  await new Promise(r => setTimeout(r, 5000));

  // Wait for all mermaid SVGs
  await page.waitForSelector('.mermaid svg', { timeout: 60000 });

  // Get total page height
  const bodyHandle = await page.$('body');
  const { height } = await bodyHandle.boundingBox();

  const pdfPath = path.join(__dirname, '..', '..', 'sales_shipping_flow.pdf');
  await page.pdf({
    path: pdfPath,
    width: '1400px',
    height: Math.ceil(height) + 80 + 'px',
    printBackground: true,
    margin: { top: 40, right: 40, bottom: 40, left: 40 }
  });

  await browser.close();
  console.log('PDF generated:', pdfPath);
})();
