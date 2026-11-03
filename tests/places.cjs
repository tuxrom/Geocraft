// Captures d'un village, d'un château, d'un volcan et d'une jungle (serveur de dev sur 5173)
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1100, height: 620 } });
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto('http://127.0.0.1:5173/');
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('geocraft.settings.v1', JSON.stringify({ helpSeen: true, platform: 'pc', renderDistance: 6, creative: true })); indexedDB.deleteDatabase('geocraft'); });
  await page.reload();
  await page.waitForTimeout(3500);
  await page.click('text=Jouer');
  await page.waitForTimeout(2500);
  const spots = await page.evaluate(() => {
    const t = __geo.world.terrain;
    const near = (list) => list.filter(Boolean).sort((a, b) => Math.hypot(a[0], a[2]) - Math.hypot(b[0], b[2]))[0];
    const vils = [], cas = [], vol = [];
    for (let i = -6; i < 6; i++) for (let j = -6; j < 6; j++) {
      const v = t.village(i, j); if (v) vils.push([v.x, v.y, v.z]);
      const c = t.castle(i, j); if (c) cas.push([c.x, c.base, c.z]);
      const o = t.volcanoCell(i, j); if (o) vol.push([o.cx, o.top, o.cz, o.R]);
    }
    let jungle = null;
    for (let r = 100; r < 3000 && !jungle; r += 40) for (let a = 0; a < 6.28 && !jungle; a += 0.2) {
      const x = Math.round(Math.cos(a) * r), z = Math.round(Math.sin(a) * r);
      const h = t.height(x, z);
      if (h > 41 && t.biome(x, z, h) === 4 && t.biome(x + 30, z, t.height(x + 30, z)) === 4) jungle = [x, h, z];
    }
    return { village: near(vils), castle: near(cas), volcano: near(vol), jungle };
  });
  console.log(JSON.stringify(spots));
  const shot = async (name, p, dx, dy, dz, yaw, pitch, time = 0.28) => {
    await page.evaluate(([p, dx, dy, dz, yaw, pitch, time]) => {
      const g = __geo; g.sky.frozen = true; g.sky.time = time;
      g.player.flying = true; g.player.teleport(p[0] + dx, p[1] + dy, p[2] + dz); g.player.yaw = yaw; g.player.pitch = pitch;
    }, [p, dx, dy, dz, yaw, pitch, time]);
    await page.waitForTimeout(9000);
    await page.screenshot({ path: `tests/out/lieu-${name}.png` });
  };
  const only = process.argv[2];
  if (spots.village && !only) await shot('village', spots.village, 26, 18, 26, Math.PI / 4, -0.45);
  if (spots.castle && !only) await shot('chateau', spots.castle, 30, 22, 30, Math.PI / 4, -0.45);
  if (spots.volcano) await shot('volcan', spots.volcano, spots.volcano[3] * 0.8, 2, 0, Math.PI / 2, -0.22, 0.47);
  if (spots.jungle) await shot('jungle', spots.jungle, 0, 30, 0, 0.5, -0.5);
  console.log('profs village:', await page.evaluate(() => __geo.mobs.list.filter((m) => m.kind === 'npc').length));
  console.log('erreurs:', errs.length ? errs.join('\n') : 'aucune');
  await browser.close();
})();
