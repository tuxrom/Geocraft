const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(() => localStorage.setItem('geocraft.settings.v1', JSON.stringify({ helpSeen: true, platform: 'pc' })));
  await page.reload();
  await page.waitForTimeout(3500);
  await page.click('text=Jouer');
  await page.waitForTimeout(2500);
  await page.evaluate(async () => {
    const M = await import('/src/game/mobs.ts');
    const g = __geo;
    g.sky.frozen = true; g.sky.time = 0.75;
    g.player.teleport(4, 47.0, 8); g.player.yaw = 0; g.player.pitch = -0.5;
    window.__f = new M.Fraction(2, 3, false, 'propre', 4, 47, 6, 9); g.mobs.add(window.__f);
  });
  await page.waitForTimeout(500);
  await page.evaluate(() => { __geo.input.mouse[0] = true; __geo.input.mousePressed[0] = true; });
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(400);
    console.log(JSON.stringify(await page.evaluate(() => ({ hp: __f.hp, dead: __f.dead, php: __geo.player.health, mobs: __geo.mobs.list.length }))));
  }
  await page.evaluate(() => { __geo.input.mouse[0] = false; });
  // apparition naturelle de nuit
  await page.evaluate(() => { __geo.mobs.clear(); __geo.player.teleport(4, 47.0, 8); });
  await page.waitForTimeout(12000);
  console.log('spawn naturel', JSON.stringify(await page.evaluate(() => ({ n: __geo.mobs.list.length, kinds: __geo.mobs.list.map((m) => m.kind), php: __geo.player.health }))));
  await page.screenshot({ path: 'tests/out/m3-night.png' });
  console.log('erreurs:', errs.length ? errs.join('\n') : 'aucune');
  await browser.close();
})();
