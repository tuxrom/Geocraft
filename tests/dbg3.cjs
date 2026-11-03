const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(() => localStorage.setItem('geocraft.settings.v1', JSON.stringify({ helpSeen: true })));
  await page.reload();
  await page.waitForTimeout(3500);
  await page.click('text=Jouer');
  await page.waitForTimeout(2500);
  await page.evaluate(() => { __geo.player.pitch = -0.1; });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `tests/out/hand1.png`, clip: { x: 640, y: 300, width: 640, height: 420 } });
  await page.evaluate(() => { __geo.inv.add('b_pyramid', 2); __geo.inv.selected = 2; __geo.hud.refresh(); });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `tests/out/hand2.png`, clip: { x: 640, y: 300, width: 640, height: 420 } });
  await browser.close();
})();
