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
  await page.evaluate(async () => {
    const M = await import('/src/game/mobs.ts');
    const g = __geo;
    g.sky.frozen = true; g.sky.time = 0.25;
    g.player.teleport(4, 47.0, 8); g.player.yaw = 0; g.player.pitch = -0.5;
    window.__f = new M.Fraction(2, 3, false, 'propre', 4, 47, 6, 9); g.mobs.add(window.__f);
  });
  await page.waitForTimeout(800);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(400);
  console.log(JSON.stringify(await page.evaluate(() => ({ m0: __geo.input.mouse[0], lock: __geo.input.locked, en: __geo.input.enabled, cd: __geo.combat.cd, tgt: __geo.combat.target && __geo.combat.target.dist, hit: __geo.interaction.hit && __geo.interaction.hit.dist, held: __geo.inv.held && __geo.inv.held.id, screen: __geo.screenOpen, pitch: __geo.player.pitch, hp: __f.hp, mpos: __f.pos.toArray() }))));
  await browser.close();
})();
