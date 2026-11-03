const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
  const page = await ctx.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await page.waitForTimeout(6000);
  console.log(await page.evaluate(async () => { const k = await caches.keys(); const c = await caches.open(k[0]); return (await c.keys()).map(r => r.url.replace(location.origin, '')); }));
  await ctx.setOffline(true);
  const p2 = await ctx.newPage();
  p2.on('console', m => console.log('c:', m.text().slice(0, 150)));
  p2.on('requestfailed', r => console.log('fail', r.url(), r.failure()?.errorText));
  const r = await p2.goto('http://127.0.0.1:4173/').catch(e => console.log('goto err', e.message.slice(0, 100)));
  await p2.waitForTimeout(4000);
  console.log('status', r && r.status(), await p2.evaluate(() => document.body.innerHTML.slice(0, 80) + ' | ' + typeof __geo));
  await browser.close();
})();
