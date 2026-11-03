const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(() => localStorage.setItem('geocraft.settings.v1', JSON.stringify({ helpSeen: true, platform: 'pc' })));
  await page.reload();
  await page.waitForTimeout(3500);
  await page.click('text=Jouer');
  await page.waitForTimeout(2500);
  for (const pitch of [0, -0.3, 0.5]) {
    await page.evaluate((p) => { __geo.player.pitch = p; }, pitch);
    await page.waitForTimeout(500);
    console.log(JSON.stringify(await page.evaluate(() => ({ pitch: __geo.player.pitch, rx: __geo.camera.rotation.x, cy: __geo.camera.position.y, mode: __geo.mode }))));
    await page.screenshot({ path: `tests/out/p-${pitch}.png` });
  }
  await browser.close();
})();
