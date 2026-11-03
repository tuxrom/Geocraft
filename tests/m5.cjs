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
  await page.evaluate(() => {
    const g = __geo;
    g.sky.frozen = true; g.sky.time = 0.3;
    g.settings.creative = true; g.applySettings();
    g.player.teleport(4, 47, 20); g.player.yaw = 0; g.player.pitch = 0.3;
    g.summonBoss(4, 40, -4);
  });
  await page.waitForTimeout(3500);
  await page.screenshot({ path: 'tests/out/m5-boss1.png' });
  const st = () => page.evaluate(() => {
    const g = __geo;
    const b = g.mobs.list.find((m) => m.kind === 'boss');
    return { boss: !!b, phase: b && b.phase, roots: g.mobs.list.filter((m) => m.kind === 'root').map((r) => r.hp.toFixed(0)), bar: b && (b.hp / b.maxHp).toFixed(2), proj: g.proj.list.length, total: g.mobs.list.length };
  });
  console.log('début', JSON.stringify(await st()));
  for (let ph = 0; ph < 3; ph++) {
    await page.evaluate(async () => {
      const g = __geo;
      for (const r of g.mobs.list.filter((m) => m.kind === 'root')) r.hurt(9999, { src: 'test' }, g.mobCtx);
    });
    await page.waitForTimeout(ph === 2 ? 6000 : 3500);
    console.log('après phase', ph, JSON.stringify(await st()));
    if (ph === 0) await page.screenshot({ path: 'tests/out/m5-boss2.png' });
  }
  console.log('butin', await page.evaluate(() => __geo.fx.drops.map((d) => d.id + 'x' + d.n).join(' ')));
  console.log('erreurs:', errs.length ? errs.join('\n') : 'aucune');
  await browser.close();
})();
