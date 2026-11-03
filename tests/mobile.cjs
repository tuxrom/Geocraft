// Test de la version mobile + PWA sur un build servi par `vite preview` (http://127.0.0.1:4173)
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://127.0.0.1:4173/';
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  await page.goto(URL);
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'tests/out/mob-choice.png' });
  await page.getByText('Mobile', { exact: false }).first().tap();
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tests/out/mob-title.png' });
  await page.getByText('Jouer').tap();
  await page.waitForTimeout(4000);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: p[2] ?? i })) });
  console.log('état', JSON.stringify(await page.evaluate(() => ({ mode: __geo.mode, locked: __geo.input.locked, touch: __geo.input.touch, help: !!document.querySelector('#help'), rd: __geo.settings.renderDistance }))));
  const compris = page.getByText('Compris');
  if (await compris.count()) { await compris.tap(); await page.waitForTimeout(500); }
  await page.screenshot({ path: 'tests/out/mob-play.png' });
  // joystick : appui à gauche puis glissé vers le haut (avancer)
  const p0 = await page.evaluate(() => [__geo.player.body.x, __geo.player.body.z]);
  await touch('touchStart', [[120, 280, 1]]);
  await touch('touchMove', [[120, 230, 1]]);
  await touch('touchMove', [[120, 215, 1]]);
  await page.waitForTimeout(1500);
  const mid = await page.evaluate(() => ({ ax: __geo.input.axisX, ay: __geo.input.axisY, spr: __geo.player.sprinting }));
  await page.screenshot({ path: 'tests/out/mob-joy.png' });
  await touch('touchEnd', []);
  await page.waitForTimeout(300);
  const p1 = await page.evaluate(() => [__geo.player.body.x, __geo.player.body.z]);
  console.log('joystick', JSON.stringify(mid), 'déplacement', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]).toFixed(2));
  // regard : glissé à droite
  const y0 = await page.evaluate(() => __geo.player.yaw);
  await touch('touchStart', [[600, 150, 2]]);
  await touch('touchMove', [[680, 150, 2]]);
  await touch('touchMove', [[760, 130, 2]]);
  await touch('touchEnd', []);
  console.log('regard', ((await page.evaluate(() => __geo.player.yaw)) - y0).toFixed(3));
  // saut et attaque (boutons)
  const jump = page.locator('.tc-btn.jump');
  const jb = await jump.boundingBox();
  await touch('touchStart', [[jb.x + 20, jb.y + 20, 3]]);
  await page.waitForTimeout(200);
  console.log('saut en l\'air', await page.evaluate(() => !__geo.player.body.onGround));
  await touch('touchEnd', []);
  // barre rapide
  await page.evaluate(() => { __geo.inv.add('b_planks', 5); });
  const slot2 = page.locator('.hslot').nth(2);
  await slot2.tap();
  console.log('slot choisi', await page.evaluate(() => __geo.inv.selected));
  // pose d'un bloc : regarde le sol puis POSER
  await page.evaluate(() => { __geo.player.pitch = -0.6; });
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => __geo.inv.count('b_planks'));
  await page.locator('.tc-btn.use').tap();
  await page.waitForTimeout(300);
  console.log('hit', await page.evaluate(() => JSON.stringify(__geo.interaction.hit && [__geo.interaction.hit.x, __geo.interaction.hit.y, __geo.interaction.hit.z]) + ' held=' + (__geo.inv.held && __geo.inv.held.id))); console.log('planches posées', before - (await page.evaluate(() => __geo.inv.count('b_planks'))));
  // inventaire
  await page.locator('.tc-btn.t1').tap();
  await page.waitForTimeout(500);
  console.log('inventaire', await page.evaluate(() => __geo.screens.open));
  await page.screenshot({ path: 'tests/out/mob-inv.png' });
  await page.getByText('X', { exact: true }).tap();
  await page.waitForTimeout(400);
  console.log('fermé', await page.evaluate(() => !__geo.screens.open + ' locked=' + __geo.input.locked));
  // PWA
  const pwa = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    const keys = await caches.keys();
    const n = keys.length ? (await (await caches.open(keys[0])).keys()).length : 0;
    const man = await (await fetch('manifest.webmanifest')).json();
    return { sw: !!reg, active: !!(reg && reg.active), caches: keys, entrées: n, manifest: man.name + ' ' + man.display };
  });
  console.log('pwa', JSON.stringify(pwa));
  await page.waitForTimeout(2000);
  // hors ligne
  await ctx.setOffline(true);
  const p2 = await ctx.newPage();
  await p2.goto(URL);
  await p2.waitForTimeout(5000);
  console.log('hors ligne : titre affiché', await p2.evaluate(() => typeof __geo !== 'undefined' && __geo.mode));
  await p2.screenshot({ path: 'tests/out/mob-offline.png' });
  console.log('erreurs:', errs.length ? errs.join('\n') : 'aucune');
  await browser.close();
})();
