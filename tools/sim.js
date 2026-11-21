// Headless balance check: node tools/sim.js [games] [mode]
// Runs full games with every seat controlled by the AI and prints a summary.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Date, process };
ctx.window = ctx; vm.createContext(ctx);
for (const f of ['mapdata', 'data', 'bosses', 'poker', 'game'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', f + '.js'), 'utf8'), ctx, { filename: f });
const games = +(process.argv[2] || 3), mode = +(process.argv[3] || 1);
for (let g = 0; g < games; g++) {
  const leaksByLevel = {};
  const game = new ctx.PTD.Game({ seed: 1000 + g, mode, rivals: 3, allAI: true, onEvent: (t, d) => {
    if (t === 'leak') leaksByLevel[d.creep.level] = (leaksByLevel[d.creep.level] || 0) + 1;
  } });
  game.start();
  let steps = 0;
  while (game.phase !== 'over' && steps < 60 * 60 * 120) { game.update(1 / 30); steps++; }
  const ps = game.players.map(p => `${p.key}:${p.gold}g k${p.kills} l${p.leaks} ${p.alive ? '' : 'DEAD'}`).join(' | ');
  console.log(`game ${g}: level ${game.level} phase ${game.phase} t=${Math.round(game.time)}s towers=${game.towers.filter(t => t.alive).length}`);
  console.log('  ', ps);
  console.log('   leaks by level', JSON.stringify(leaksByLevel));
}
