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
  const out = await page.evaluate(async () => {
    const g = __geo;
    const B = (await import('/src/data/blocks.ts')).B;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const res = {};
    g.sky.frozen = true; g.sky.time = 0.25;
    g.inv.add('b_door', 2); g.inv.add('b_ladder', 12); g.inv.add('b_stone_bricks', 10);
    const slot = (id) => g.inv.slots.findIndex((s) => s && s.id === id);
    g.player.teleport(30.5, 47, 30.5); g.player.yaw = 0;
    await sleep(800);
    const gy = g.world.surfaceY(30, 27);
    g.world.setBlock(30, gy + 1, 27, B.stone_bricks);
    g.world.setBlock(30, gy + 2, 27, B.stone_bricks);
    g.inv.selected = slot('b_door'); g.hud.refresh();
    g.player.pitch = -0.1;
    await sleep(500);
    res.mur = g.interaction.hit && [g.interaction.hit.x, g.interaction.hit.y, g.interaction.hit.z, g.interaction.hit.nz];
    g.input.mousePressed[2] = true;
    await sleep(300);
    res.porte = [g.world.getBlock(30, gy + 1, 28), g.world.getBlock(30, gy + 2, 28)];
    // clic droit sur la porte (la vise) : bascule
    g.inv.selected = slot('b_ladder'); g.hud.refresh();
    g.player.pitch = -0.05;
    await sleep(400);
    res.visePorte = g.interaction.hit && [g.interaction.hit.x, g.interaction.hit.y, g.interaction.hit.z];
    g.input.mousePressed[2] = true;
    await sleep(300);
    res.aprèsToggle = [g.world.getBlock(30, gy + 1, 28), g.world.getBlock(30, gy + 2, 28)];
    // échelle contre le mur : vise la face du mur depuis une position voisine
    g.player.teleport(31.5, gy + 1, 29.5); g.player.yaw = 0; g.player.pitch = 0.0;
    await sleep(400);
    const h2 = g.interaction.hit;
    res.viseMur2 = h2 && [h2.x, h2.y, h2.z, h2.nx, h2.nz];
    // chute
    g.settings.creative = false; g.applySettings();
    g.player.health = 20; g.player.invuln = 0;
    g.player.teleport(40.5, 62, 40.5);
    const trace = [];
    for (let i = 0; i < 14; i++) { await sleep(500); trace.push([g.player.body.y.toFixed(1), g.player.health, g.player.body.onGround]); }
    res.chute = trace;
    return res;
  });
  console.log(JSON.stringify(out));
  console.log('erreurs:', errs.length ? errs.join('\n') : 'aucune');
  await browser.close();
})();
