const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('geocraft.settings.v1', JSON.stringify({ helpSeen: true })); indexedDB.deleteDatabase('geocraft'); });
  await page.reload();
  await page.waitForTimeout(3500);
  await page.click('text=Jouer');
  await page.waitForTimeout(2500);
  const seed1 = await page.evaluate(() => __geo.world.seed);
  await page.evaluate(() => {
    const g = __geo;
    g.world.setBlock(12, 60, 12, 14); // un bloc de diamant dans le ciel
    g.world.setBlock(13, 60, 12, 16);
    g.inv.add('res_diamant', 7);
    g.player.teleport(-20.5, 50, 30.5);
    g.player.health = 13;
    g.sky.time = 0.4;
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => __geo.saveNow());
  await page.waitForTimeout(500);
  console.log('sauvegardé, seed', seed1);
  await page.reload();
  await page.waitForTimeout(3500);
  console.log('titre', await page.evaluate(() => document.querySelector('.btn.green')?.textContent));
  await page.click('text=Continuer');
  await page.waitForTimeout(3500);
  const st = await page.evaluate(() => ({
    seed: __geo.world.seed, block: __geo.world.getBlock(12, 60, 12), block2: __geo.world.getBlock(13, 60, 12),
    diamants: __geo.inv.count('res_diamant'), pos: [__geo.player.body.x, __geo.player.body.z].map((v) => v.toFixed(1)),
    hp: __geo.player.health, t: __geo.sky.time.toFixed(2), mode: __geo.mode,
  }));
  console.log('après rechargement', JSON.stringify(st));
  // nouveau monde
  await page.evaluate(() => __geo.openPause());
  await page.waitForTimeout(500);
  page.once('dialog', (d) => d.accept());
  await page.click('text=Repartir d’un monde neuf');
  await page.waitForTimeout(5000);
  console.log('nouveau monde', JSON.stringify(await page.evaluate(() => ({ seed: __geo.world.seed, mode: __geo.mode, inv: __geo.inv.slots.filter(Boolean).map((s) => s.id), block: __geo.world.getBlock(12, 60, 12) }))));
  console.log('erreurs:', errs.length ? errs.join('\n') : 'aucune');
  await browser.close();
})();
