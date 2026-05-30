const puppeteer = require('puppeteer')
const path = require('path')

;(async () => {
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  })
  const page = await browser.newPage()

  const htmlPath = path.resolve(__dirname, '开发环境系统监控指南.html')
  await page.goto('file:///' + htmlPath.replace(/\\/g, '/'), { waitUntil: 'networkidle0' })

  const pdfPath = path.resolve(__dirname, '开发环境系统监控指南.pdf')
  await page.pdf({
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' }
  })

  console.log('PDF generated:', pdfPath)
  await browser.close()
})().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
