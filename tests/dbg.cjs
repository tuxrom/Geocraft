const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('console', (m) => { if (!m.text().includes('vite')) console.log(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => console.log('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(() => localStorage.setItem('geocraft.settings.v1', JSON.stringify({ helpSeen: true, platform: 'pc' })));
  await page.reload();
  await page.waitForTimeout(3500);
  await page.click('text=Jouer');
  await page.waitForTimeout(2500);
  await page.evaluate(() => { __geo.player.pitch = -1.4; });
  await page.waitForTimeout(300);
  await page.mouse.down({ button: 'left' });
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500);
    console.log(JSON.stringify(await page.evaluate(() => ({ prog: __geo.interaction.progress, drops: __geo.fx.drops.map(d => [d.id, d.body.x.toFixed(1), d.body.y.toFixed(1), d.body.z.toFixed(1)]), py: __geo.player.body.y, dirt: __geo.inv.count('b_dirt') }))));
  }
  await browser.close();
})();
