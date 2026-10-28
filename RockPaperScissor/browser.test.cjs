/* Optional integration check: NODE_PATH must include a Playwright installation.
   Uses installed Chrome, serves the repository read-only, writes previews here. */
const { chromium } = require('playwright');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const server = http.createServer(async (req, res) => {
  try {
    let name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    if (name.endsWith('/')) name += 'index.html';
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    const data = await fs.readFile(file);
    res.setHeader('Content-Type', { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript', '.svg': 'image/svg+xml' }[path.extname(file)] || 'application/octet-stream');
    res.end(data);
  } catch { res.writeHead(404); res.end('Not found'); }
});
(async () => {
  await new Promise(resolve => server.listen(4174, '127.0.0.1', resolve));
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const context = await browser.newContext({ viewport: { width: 1512, height: 1100 }, permissions: ['clipboard-read', 'clipboard-write'] });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('http://127.0.0.1:4174/RockPaperScissor/');
    assert.equal(await page.locator('dialog[open]').count(), 0, 'details are hidden on arrival');
    await page.waitForTimeout(2800);
    await page.locator('#pauseBtn').click();
    await page.screenshot({ path: path.join(__dirname, 'desktop-preview.png'), fullPage: true });
    const time = await page.locator('#elapsed').textContent();
    await page.waitForTimeout(300); assert.equal(await page.locator('#elapsed').textContent(), time, 'pause freezes simulation time');
    await page.locator('[data-drawer="settingsDrawer"]').click();
    assert.equal(await page.locator('#settingsDrawer').isVisible(), true);
    await page.locator('#settingsDrawer').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
    await page.screenshot({ path: path.join(__dirname, 'drawer-preview.png'), fullPage: true });
    for (let i = 0; i < 10; i++) await page.locator('#stepBtn').click();
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#settingsDrawer').isVisible(), false, 'Escape closes the drawer');
    assert.equal(await page.locator('[data-drawer="settingsDrawer"]').evaluate(el => el === document.activeElement), true, 'focus returns to drawer trigger');
    assert.notEqual(await page.locator('#elapsed').textContent(), time, 'single stepping advances time');
    const before = Number(await page.locator('#alive').textContent());
    await page.locator('.brush').first().click(); const box = await page.locator('#simulationCanvas').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(Number(await page.locator('#alive').textContent()), before + 6, 'brush injects agents while paused');
    await page.locator('#disturbBtn').click(); assert.match(await page.locator('#events').textContent(), /outside force/);
    await page.locator('[data-drawer="settingsDrawer"]').click();
    await page.locator('#eliminateBtn').click(); await page.locator('#ruleSet').selectOption('3'); await page.locator('#preset').selectOption('scatter');
    await page.locator('#resetBtn').click();
    assert.equal(await page.locator('dialog[open]').count(), 0, 'applying settings returns to arena');
    assert.equal(await page.locator('.brush').count(), 3); assert.equal(await page.locator('#lawList li').count(), 3);
    assert.equal(await page.locator('#contactLabel').textContent(), 'ELIMINATIONS');
    await page.waitForTimeout(1800); await page.locator('#pauseBtn').click();
    assert(Number(await page.locator('#alive').textContent()) < 150, 'elimination reduces population');
    await page.locator('[data-drawer="statsDrawer"]').click();
    assert((await page.locator('#historyCanvas').boundingBox()).width > 0, 'history renders inside open statistics drawer');
    const downloadPromise = page.waitForEvent('download'); await page.locator('#exportBtn').click(); const download = await downloadPromise;
    assert.match(download.suggestedFilename(), /\.csv$/);
    await page.locator('#statsDrawer .drawer-close').click();
    await page.locator('[data-drawer="settingsDrawer"]').click();
    await page.locator('#shareBtn').click();
    const link = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(link, /clans=3/); assert.match(link, /mode=eliminate/);
    await page.goto(link); await page.locator('#pauseBtn').click();
    assert.equal(await page.locator('#ruleSet').inputValue(), '3'); assert.equal(await page.locator('#preset').inputValue(), 'scatter');
    await page.locator('[data-drawer="rulesDrawer"]').click();
    await page.locator('.rule-node').first().click(); assert.equal(await page.locator('.rule-node').first().getAttribute('aria-pressed'), 'true');
    await page.locator('#clearLaw').click();
    assert.equal(await page.locator('.rule-node').first().getAttribute('aria-pressed'), 'false');
    await page.keyboard.press('Escape');
    await page.locator('[data-drawer="settingsDrawer"]').click();
    await page.mouse.click(12, 300);
    assert.equal(await page.locator('#settingsDrawer').isVisible(), false, 'backdrop closes drawer');
    for (const width of [320, 390, 768, 1024, 1512]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(100);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `no horizontal overflow at ${width}px`);
      await page.locator('[data-drawer="settingsDrawer"]').click();
      await page.locator('#settingsDrawer').evaluate(el => Promise.all(el.getAnimations().map(animation => animation.finished)));
      const drawerBox = await page.locator('#settingsDrawer').boundingBox();
      assert(drawerBox.width <= width + .5 && drawerBox.x >= -.5 && drawerBox.x + drawerBox.width <= width + .5, `drawer fits at ${width}px: ${JSON.stringify(drawerBox)}`);
      await page.locator('#settingsDrawer .drawer-close').click();
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://127.0.0.1:4174/RockPaperScissor/'); await page.locator('#pauseBtn').click();
    await page.screenshot({ path: path.join(__dirname, 'mobile-preview.png'), fullPage: true });
    await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload();
    assert.equal(await page.locator('#statusText').textContent(), 'EXPERIMENT PAUSED');
    assert.equal(await page.locator('#trails').isChecked(), false);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('http://127.0.0.1:4174/RockPaperScissor/?formation=siege&population=250&speed=3');
    await page.locator('#result:not([hidden])').waitFor({ timeout: 20000 });
    assert.match(await page.locator('#resultTitle').textContent(), /Rock reigns/);
    await page.locator('.brush').nth(1).click();
    const arena = await page.locator('#simulationCanvas').boundingBox();
    await page.mouse.click(arena.x + arena.width / 2, arena.y + arena.height / 2);
    assert.equal(await page.locator('#result').isHidden(), true);
    assert.equal(await page.locator('#statusText').textContent(), 'LIVE EXPERIMENT');
    assert.deepEqual(errors, [], 'no browser exceptions');
    console.log('Passed: minimal landing view, drawer focus/escape/backdrop, browser runtime, pause, stepping, reinforcements, disturbance, classic mode, elimination, CSV, sharing, rule map, five responsive widths, reduced motion, winner declaration and post-win intervention.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => server.close());
