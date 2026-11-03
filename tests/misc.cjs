const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('geocraft.settings.v1', JSON.stringify({ helpSeen: true })); indexedDB.deleteDatabase('geocraft'); });
  await page.reload();
  await page.waitForTimeout(3500);
  await page.click('text=Jouer');
  await page.waitForTimeout(2500);
  // --- glisser-déposer dans l'inventaire
  await page.keyboard.press('e');
  await page.waitForTimeout(500);
  const slots = page.locator('.slot');
  const n = await slots.count();
  const boxA = await slots.nth(27).boundingBox(); // barre rapide, case 1
  const boxB = await slots.nth(30).boundingBox(); // case 4
  await page.mouse.move(boxA.x + 20, boxA.y + 20);
  await page.mouse.down();
  await page.mouse.move(boxB.x + 20, boxB.y + 20, { steps: 8 });
  await page.waitForTimeout(450);
  await page.mouse.up();
  await page.waitForTimeout(200);
  console.log('glisser-déposer', n, JSON.stringify(await page.evaluate(() => __geo.inv.slots.slice(0, 5).map((s) => s && s.id))));
  await page.screenshot({ path: 'tests/out/misc-inv.png' });
  await page.keyboard.press('e');
  await page.waitForTimeout(400);
  // --- options
  await page.evaluate(() => { __geo.openPause(); });
  await page.waitForTimeout(300);
  await page.click('text=Options');
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'tests/out/misc-options.png' });
  await page.click('text=Terminé');
  await page.waitForTimeout(200);
  await page.evaluate(() => __geo.resume());
  await page.waitForTimeout(500);
  // --- lac et caverne
  const spots = await page.evaluate(async () => {
    const g = __geo;
    const B = (await import('/src/data/blocks.ts')).B;
    const T = g.world.terrain;
    let lake = null, cave = null;
    for (let x = -300; x < 300 && !lake; x += 8) for (let z = -300; z < 300 && !lake; z += 8) {
      const h = T.height(x, z);
      if (h <= 33 && T.height(x + 6, z) <= 34 && T.height(x - 6, z) <= 34) lake = [x, 38, z];
    }
    const { bidx } = await import('/src/core/constants.ts');
    for (let cx = -8; cx <= 8 && !cave; cx++) for (let cz = -8; cz <= 8 && !cave; cz++) {
      const b = T.generate(cx, cz);
      for (let y = 14; y < 30 && !cave; y++) for (let z = 2; z < 14 && !cave; z++) for (let x = 2; x < 14 && !cave; x++) {
        if (b[bidx(x, y, z)] === 0 && b[bidx(x, y + 1, z)] === 0 && b[bidx(x, y + 2, z)] === 0 && b[bidx(x, y - 1, z)] === B.stone && b[bidx(x + 1, y, z)] === 0 && b[bidx(x - 1, y, z)] === 0) cave = [cx * 16 + x + 0.5, y, cz * 16 + z + 0.5];
      }
    }
    g.sky.frozen = true; g.sky.time = 0.25;
    g.settings.creative = true; g.applySettings();
    return { lake, cave };
  });
  console.log(JSON.stringify(spots));
  if (spots.lake) {
    await page.evaluate((l) => { const g = __geo; g.player.flying = true; g.player.teleport(l[0], 44, l[2]); g.player.yaw = 0.6; g.player.pitch = -0.35; }, spots.lake);
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'tests/out/misc-lake.png' });
  }
  if (spots.cave) {
    await page.evaluate((c) => { const g = __geo; g.player.flying = false; g.settings.creative = false; g.applySettings(); g.player.teleport(c[0], c[1], c[2]); g.player.yaw = 0.3; g.player.pitch = -0.1; }, spots.cave);
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'tests/out/misc-cave.png' });
  }
  console.log('erreurs:', errs.length ? errs.join('\n') : 'aucune');
  await browser.close();
})();
