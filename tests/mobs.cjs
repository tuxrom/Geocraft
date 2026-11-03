const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(() => localStorage.setItem('geocraft.settings.v1', JSON.stringify({ helpSeen: true })));
  await page.reload();
  await page.waitForTimeout(3500);
  await page.click('text=Jouer');
  await page.waitForTimeout(2500);
  await page.evaluate(async () => {
    const M = await import('/src/game/mobs.ts');
    const g = __geo;
    g.sky.frozen = true; g.sky.time = 0.62;
    g.settings.creative = true; g.applySettings();
    g.player.teleport(4, 47.0, 8); g.player.yaw = 0; g.player.pitch = -0.1;
    const specs = [[1, 2, false, 'propre'], [7, 3, false, 'impropre'], [3, 10, false, 'decimale'], [13, 17, false, 'irreductible'], [3, 5, true, 'negative']];
    specs.forEach((s, i) => g.mobs.add(new M.Fraction(s[0], s[1], s[2], s[3], 0 + i * 2.2, 47, -3, undefined)));
    const v = new M.VectorMob(4, 50, -2, 1); g.mobs.add(v);
    window.__v = v;
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: 'tests/out/mobs1.png' });
  // charge du vecteur
  await page.evaluate(() => { __geo.settings.creative = false; __geo.applySettings(); __v.state = 'aim'; __v.t = 0.2; });
  await page.waitForTimeout(900);
  await page.screenshot({ path: 'tests/out/mobs2.png' });
  console.log('erreurs:', errs.length ? errs.join('\n') : 'aucune');
  await browser.close();
})();
