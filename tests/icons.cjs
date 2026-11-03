const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 560 } });
  page.on('pageerror', (e) => console.log('PAGEERROR: ' + e.message));
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForTimeout(3000);
  await page.evaluate(async () => {
    const icons = await import('/src/gfx/icons.ts');
    const items = await import('/src/data/items.ts');
    document.body.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:fixed;inset:0;background:#6b6b6b;display:flex;flex-wrap:wrap;gap:6px;padding:8px;z-index:9999;overflow:hidden';
    const ids = [];
    for (const k of items.KINDS) ids.push(`w_${k.id}_${['fer', 'diamant', 'cristal', 'cuivre'][ids.length % 4]}`);
    ids.push('res_cuivre', 'res_fer', 'res_or', 'res_diamant', 'res_cristal', 'food_pomme', 'b_grass', 'b_stone', 'b_stairs_wood', 'b_glass', 'b_altar', 'b_prism', 'b_pyramid', 'b_dome', 'b_door', 'b_ladder');
    for (const id of ids) {
      const im = icons.itemImg(id);
      im.style.cssText = 'width:96px;height:96px;background:#8b8b8b;image-rendering:pixelated';
      wrap.append(im);
    }
    document.body.append(wrap);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'tests/out/icons.png' });
  await browser.close();
})();
