const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const logs = [];
  page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForTimeout(3000);
  await page.evaluate(() => {
    const t0 = performance.now();
    window.__ev = [];
    document.addEventListener('pointerlockchange', () => __ev.push(['lockchange', Math.round(performance.now() - t0), !!document.pointerLockElement]));
    document.addEventListener('pointerlockerror', () => __ev.push(['lockerror', Math.round(performance.now() - t0)]));
  });
  await page.click('text=Jouer');
  await page.waitForTimeout(500);
  console.log(JSON.stringify(await page.evaluate(() => ({ ev: __ev, mode: __geo.mode, locked: __geo.input.locked, ple: !!document.pointerLockElement }))));
  await page.waitForTimeout(6000);
  console.log(JSON.stringify(await page.evaluate(() => ({ ev: __ev, mode: __geo.mode, locked: __geo.input.locked }))));
  await browser.close();
})();
