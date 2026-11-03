// Test du build de production servi par nginx (par défaut http://127.0.0.1:18080)
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://127.0.0.1:18080/';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  const failed = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('requestfailed', (r) => failed.push(r.url()));
  page.on('response', (r) => { if (r.status() >= 400) failed.push(r.status() + ' ' + r.url()); });
  await page.goto(URL);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'tests/out/prod-title.png' });
  await page.click('text=Jouer');
  await page.waitForTimeout(6000);
  const st = await page.evaluate(() => ({
    fonts: document.fonts.check('12px "Press Start 2P"'),
    hasGeo: typeof window.__geo !== 'undefined',
    mode: window.__geo && window.__geo.mode,
    locked: window.__geo && window.__geo.input.locked,
    chunks: window.__geo && window.__geo.world.stats(),
  }));
  console.log(JSON.stringify(st));
  await page.screenshot({ path: 'tests/out/prod-play.png' });
  console.log('requêtes en échec :', failed.length ? failed.join('\n') : 'aucune');
  console.log('erreurs :', errs.length ? errs.join('\n') : 'aucune');
  await browser.close();
})();
