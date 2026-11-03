import './style.css';
import { Game } from './game/game';

const game = new Game();
(window as unknown as { __geo: Game }).__geo = game;
game.init().catch((e) => {
  console.error(e);
  document.body.insertAdjacentHTML('beforeend', `<pre style="position:fixed;top:0;left:0;color:#f88;z-index:9999">${String(e?.stack ?? e)}</pre>`);
});
