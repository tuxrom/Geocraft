const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForTimeout(3000);
  const res = await page.evaluate(async () => {
    const gen = await import('/src/world/gen.ts');
    const blocks = await import('/src/data/blocks.ts');
    const out = {};
    for (const seed of [1, 2024, 777]) {
      const t = new gen.Terrain(seed);
      const bio = [0, 0, 0, 0];
      let water = 0, tot = 0, minH = 999, maxH = 0;
      for (let x = -600; x <= 600; x += 12) for (let z = -600; z <= 600; z += 12) {
        const h = t.height(x, z);
        bio[t.biome(x, z, h)]++;
        tot++; if (h <= 38) water++;
        minH = Math.min(minH, h); maxH = Math.max(maxH, h);
      }
      const ruins = [];
      const ores = {};
      const t0 = performance.now();
      let n = 0;
      for (let cx = -30; cx <= 30; cx++) for (let cz = -30; cz <= 30; cz++) {
        if (Math.abs(cx) + Math.abs(cz) < 3) continue;
        const k = cx * 7919 + cz;
        // génération complète seulement sur un échantillon
        if (Math.abs(cx) > 12 || Math.abs(cz) > 12) {
          continue;
        }
        const b = t.generate(cx, cz);
        n++;
        for (let i = 0; i < b.length; i++) {
          const v = b[i];
          if (v === blocks.B.altar) ruins.push([cx, cz]);
          if (v >= blocks.B.copper_ore && v <= blocks.B.euclid_ore) ores[v] = (ores[v] || 0) + 1;
        }
      }
      out[seed] = { biomes: { plaines: bio[0], forêt: bio[1], désert: bio[2], montagnes: bio[3] }, eauPourcent: (water / tot * 100).toFixed(1), hauteurs: [minH, maxH], ruines: ruins.length, minerais: ores, msParChunk: ((performance.now() - t0) / n).toFixed(1) };
    }
    return out;
  });
  console.log(JSON.stringify(res, null, 1));
  await browser.close();
})();
