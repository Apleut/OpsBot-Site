// combined headless + cross-browser test suite for opsbot site
const puppeteer = require('puppeteer')
const { chromium, firefox, webkit } = require('playwright')
const path = require('path')

const file = `file://${path.resolve(__dirname, '../OpsBot-Site', 'index.html')}`

// network throttle settings - simulates a decent home connection
const throttle = {
  offline: false,
  downloadThroughput: (10 * 1024 * 1024) / 8, // 10 mbps down
  uploadThroughput: (2 * 1024 * 1024) / 8,     // 2 mbps up
  latency: 40                                   // 40ms rtt
}

// grab performance timing from inside the page
async function getTiming(page) {
  return page.evaluate(() => {
    const t = performance.timing
    return {
      ttfp: t.responseStart - t.navigationStart,
      domLoaded: t.domContentLoadedEventEnd - t.navigationStart,
      fullLoad: t.loadEventEnd - t.navigationStart,
    }
  })
}

// puppeteer test - true chromeheadless via the chromeheadlessshell binary
async function testPuppeteer() {
  console.log('\n--- ChromeHeadless (Puppeteer) ---')

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox']
  })

  const page = await browser.newPage()

  // apply throttle via cdp
  const client = await page.createCDPSession()
  await client.send('Network.emulateNetworkConditions', throttle)

  const start = Date.now()
  await page.goto(file)

  const timing = await getTiming(page)
  const wallTime = Date.now() - start

  console.log('timing:    ', timing)
  console.log('wall time: ', wallTime + 'ms')

  await page.screenshot({
    path: path.resolve(__dirname, 'screenshot-chromeheadless.png'),
    fullPage: false
  })
  console.log('screenshot saved: screenshot-chromeheadless.png')

  await browser.close()
}

// playwright test - one browser type at a time
async function testPlaywright(browserType, name) {
  console.log(`\n--- ${name} (Playwright) ---`)

  const browser = await browserType.launch({ headless: true })
  const context = await browser.newContext()
  const page = await context.newPage()

  // cdp throttle only works on chromium
  if (name === 'Chromium') {
    const client = await page.context().newCDPSession(page)
    await client.send('Network.emulateNetworkConditions', throttle)
  }

  const start = Date.now()
  // wait for full load not just dom
  await page.goto(file, { waitUntil: 'load' })

  // small buffer so loadEventEnd gets stamped before we read it
  await page.waitForTimeout(50)

  const timing = await getTiming(page)
  const wallTime = Date.now() - start

  console.log('timing:    ', timing)
  console.log('wall time: ', wallTime + 'ms')

  await page.screenshot({
    path: path.resolve(__dirname, `screenshot-${name.toLowerCase()}.png`),
    fullPage: false
  })
  console.log(`screenshot saved: screenshot-${name.toLowerCase()}.png`)

  await browser.close()
}

async function main() {
  // puppeteer chromeheadless first
  await testPuppeteer()

  // then playwright cross-browser
  await testPlaywright(chromium, 'Chromium')
  await testPlaywright(firefox, 'Firefox')
  await testPlaywright(webkit, 'WebKit')

  console.log('\ndone')
}

main().catch(err => {
  console.error('test failed:', err)
  process.exit(1)
})