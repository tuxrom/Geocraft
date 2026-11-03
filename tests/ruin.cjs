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
  const pos = await page.evaluate(async () => {
    const g = __geo;
    const B = (await import('/src/data/blocks.ts')).B;
    const { CHUNK_VOL } = await import('/src/core/constants.ts');
    let best = null;
    for (let cx = -14; cx <= 14 && !best; cx++) for (let cz = -14; cz <= 14 && !best; cz++) {
      if (Math.abs(cx) + Math.abs(cz) < 3) continue;
      const b = g.world.terrain.generate(cx, cz);
      for (let i = 0; i < CHUNK_VOL; i++) if (b[i] === B.altar) { const x = i & 15, z = (i >> 4) & 15, y = i >> 8; best = [cx * 16 + x, y, cz * 16 + z]; break; }
    }
    g.sky.frozen = true; g.sky.time = 0.3;
    g.settings.creative = true; g.applySettings();
    g.player.teleport(best[0] + 14, best[1] + 8, best[2] + 14);
    g.player.flying = true;
    g.player.yaw = Math.PI * 0.25; g.player.pitch = -0.4;
    return best;
  });
  console.log('autel en', pos);
  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'tests/out/ruin.png' });
  await browser.close();
})();
