// Génère les captures du README dans docs/screenshots (serveur de dev sur 5173).
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
  page.on('pageerror', (e) => console.log('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('geocraft.settings.v1', JSON.stringify({ helpSeen: true, platform: 'pc' })); indexedDB.deleteDatabase('geocraft'); });
  await page.reload();
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'docs/screenshots/titre.png' });
  await page.click('text=Jouer');
  await page.waitForTimeout(3000);
  await page.evaluate(() => { const g = __geo; g.sky.frozen = true; g.sky.time = 0.25; g.player.teleport(10.5, 47.2, 11.8); g.player.yaw = 0; g.player.pitch = -0.1; });
  await page.waitForTimeout(1500);
  await page.keyboard.press('f');
  await page.waitForTimeout(500);
  await page.evaluate(() => { const g = __geo; g.inv.add('b_log', 12); g.inv.add('b_dirt', 20); g.inv.add('b_stone', 30); g.inv.add('res_cuivre', 8); g.inv.add('res_fer', 4); });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/screenshots/boutique.png' });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const g = __geo;
    g.settings.creative = true; g.applySettings();
    g.player.teleport(4, 47, 20); g.player.yaw = 0; g.player.pitch = 0.3;
    g.summonBoss(4, 40, -4);
  });
  await page.waitForTimeout(4500);
  await page.screenshot({ path: 'docs/screenshots/boss.png' });
  await browser.close();
})();
