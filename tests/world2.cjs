// Statistiques du monde : biomes, lacs, volcans, villages, châteaux, maisons, temps de génération
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForTimeout(2500);
  const res = await page.evaluate(async () => {
    const gen = await import('/src/world/gen.ts');
    const out = {};
    for (const seed of [1, 2024, 777]) {
      const t = new gen.Terrain(seed);
      const bio = [0, 0, 0, 0, 0, 0];
      let water = 0, tot = 0;
      const R = 1500;
      for (let x = -R; x <= R; x += 20) for (let z = -R; z <= R; z += 20) {
        const h = t.height(x, z); bio[t.biome(x, z, h)]++; tot++; if (h <= 38) water++;
      }
      let vol = 0, vil = 0, cas = 0, houses = 0;
      const first = {};
      for (let i = -5; i < 5; i++) for (let j = -5; j < 5; j++) if (t.volcanoCell(i, j)) { vol++; first.volcan ??= t.volcanoCell(i, j); }
      for (let i = -5; i < 5; i++) for (let j = -5; j < 5; j++) { const v = t.village(i, j); if (v) { vil++; houses += v.houses.length; first.village ??= [v.x, v.y, v.z]; } }
      for (let i = -4; i < 4; i++) for (let j = -4; j < 4; j++) { const c = t.castle(i, j); if (c) { cas++; first.chateau ??= [c.x, c.base, c.z]; } }
      const t0 = performance.now(); let n = 0;
      for (let cx = -6; cx < 6; cx++) for (let cz = -6; cz < 6; cz++) { t.generate(cx + 30, cz + 30); n++; }
      const pct = (k) => (bio[k] / tot * 100).toFixed(0) + '%';
      out[seed] = { plaines: pct(0), forêt: pct(1), désert: pct(2), montagnes: pct(3), jungle: pct(4), volcan: pct(5), lacs: (water / tot * 100).toFixed(0) + '%',
        volcansSur100cellules: vol, villages: vil + ' (' + houses + ' maisons)', chateaux: cas, msParChunk: ((performance.now() - t0) / n).toFixed(1), exemples: first };
    }
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
})();
