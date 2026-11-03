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
  const res = await page.evaluate(async () => {
    const mobsM = await import('/src/game/mobs.ts');
    const g = __geo;
    g.sky.frozen = true; g.sky.time = 0.25;
    g.player.teleport(4, 47.0, 4); g.player.yaw = 0; g.player.pitch = -0.26;
    await new Promise((r) => setTimeout(r, 500));
    const out = [];
    for (const kind of ['droite', 'equerre']) {
      g.inv.slots[0] = { id: `w_${kind}_cuivre`, n: 1 }; g.inv.selected = 0;
      g.mobs.clear(); g.proj.clear();
      const f = new mobsM.Fraction(3, 4, false, 'propre', 4, 47, 0.5, 20); g.mobs.add(f);
      g.combat.cd = 0;
      g.combat.primary();
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 100));
        out.push([kind, i, 'hp ' + f.hp.toFixed(1), 'proj ' + g.proj.list.map((p) => p.pos.toArray().map((v) => v.toFixed(1)).join(',') + (p.dead ? 'x' : '')).join(' '), 'mob ' + f.pos.toArray().map((v) => v.toFixed(1)).join(',')]);
      }
    }
    return out;
  });
  for (const r of res) console.log(r.join(' | '));
  await browser.close();
})();
