import { Game } from './core/Game.js';

const game = new Game(document.getElementById('app'));
game.boot().catch((e) => {
  console.error(e);
  document.getElementById('ui').innerHTML = `<div class="fatal">Drowned Earth could not start.<br><small>${String(e.message || e)}</small></div>`;
});
