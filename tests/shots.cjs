const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => console.log('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForTimeout(3500);
  await page.click('text=Jouer');
  await page.waitForTimeout(2500);
  const shots = [
    ['a', 4.5, 47, 4.5, Math.PI * 0.25, 0],
    ['b', 4.5, 47, 4.5, Math.PI * 1.25, 0],
    ['c', 4.5, 47, 4.5, Math.PI * 0.25, -0.5],
  ];
  for (const [n, x, y, z, yaw, pitch] of shots) {
    await page.evaluate(([x, y, z, yaw, pitch]) => { __geo.player.teleport(x, y, z); __geo.player.yaw = yaw; __geo.player.pitch = pitch; }, [x, y, z, yaw, pitch]);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `tests/out/s-${n}.png` });
  }
  await browser.close();
})();
