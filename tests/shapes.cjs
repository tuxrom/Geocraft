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
  await page.evaluate(async () => {
    const m = await import('/src/data/blocks.ts');
    const w = __geo.world, B = m.B;
    const y = 47, z0 = -6;
    const put = (x, yy, zz, id) => w.setBlock(x, yy, zz, id);
    // ligne de formes devant le joueur (qui est en 4.5,47,4.5 regarde vers -z/-x)
    const names = ['pyramid', 'prism', 'prism_r1', 'dome', 'stairs_wood', 'stairs_stone_r1', 'crenel', 'roof', 'door', 'door_open0', 'ladder', 'glass', 'altar'];
    names.forEach((n, i) => { put(-8 + i * 2, y, z0, B[n]); put(-8 + i * 2, y - 1, z0, B.stone_bricks); });
    __geo.player.teleport(4, 48, 2); __geo.player.yaw = 0.55; __geo.player.pitch = -0.2;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/out/shapes1.png' });
  await page.evaluate(() => { __geo.player.teleport(-8, 49, -2); __geo.player.yaw = 0; __geo.player.pitch = -0.45; });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'tests/out/shapes2.png' });
  await browser.close();
})();
