import './style.css';
import { Game } from './game/game';

const game = new Game();
(window as unknown as { __geo: Game }).__geo = game;
game.init().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:0;left:0;color:#f88;z-index:9999">${String(e?.stack ?? e)}</pre>`);
});

// PWA : service worker en production uniquement (le serveur de développement reste sans cache).
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then((reg) => {
      const urls = performance.getEntriesByType('resource').map((r) => r.name).filter((u) => u.startsWith(location.origin));
      reg.active?.postMessage({ type: 'cache', urls });
    }).catch(() => undefined);
  });
}
