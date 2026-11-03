const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(() => localStorage.setItem('geocraft.settings.v1', JSON.stringify({ helpSeen: true, platform: 'pc', showFps: true })));
  await page.reload();
  await page.waitForTimeout(3500);
  await page.click('text=Jouer');
  await page.waitForTimeout(2500);
  const res = await page.evaluate(async () => {
    const mobsM = await import('/src/game/mobs.ts');
    const itemsM = await import('/src/data/items.ts');
    const g = __geo;
    g.sky.frozen = true; g.sky.time = 0.25;
    const out = [];
    g.player.teleport(4, 47.5, 4); g.player.yaw = 0; g.player.pitch = -0.26;
    for (const kd of itemsM.KINDS) {
      g.inv.slots[0] = { id: `w_${kd.id}_cuivre`, n: 1 };
      g.inv.selected = 0;
      g.mobs.clear(); g.proj.clear();
      const dirx = 0, dirz = -1;
      const mk = () => { const f = new mobsM.Fraction(3, 4, false, 'propre', 4 + dirx * 3.5, 47, 4 + dirz * 3.5, 20); g.mobs.add(f); return f; };
      const f1 = mk(), f2 = new mobsM.Fraction(2, 3, false, 'propre', 6, 47, 0.5, 20), f3 = new mobsM.Fraction(1, 2, false, 'propre', 2, 47, 0.5, 20);
      g.mobs.add(f2); g.mobs.add(f3);
      g.combat.cd = 0;
      try { g.combat.primary(); } catch (e) { out.push([kd.id, 'ERREUR ' + e.message]); continue; }
      await new Promise((r) => setTimeout(r, 700));
      const hp = g.mobs.list.filter((m) => m.kind === 'fraction').reduce((s, m) => s + m.hp, 0);
      out.push([kd.id, 'pv restants ' + hp.toFixed(1), 'mobs ' + g.mobs.list.length]);
    }
    return out;
  });
  for (const r of res) console.log(r.join(' | '));
  console.log('erreurs:', errs.length ? errs.join('\n') : 'aucune');
  await browser.close();
})();
