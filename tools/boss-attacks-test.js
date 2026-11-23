// Focused regression check for the boss-specific tower disruption rules.
const fs = require('fs'), path = require('path'), vm = require('vm');
const ctx = { console, Math, Date }; ctx.window = ctx; vm.createContext(ctx);
for (const file of ['mapdata', 'data', 'bosses', 'poker', 'game'])
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', file + '.js'), 'utf8'), ctx, { filename: file });

for (const index of [0, 1, 2, 4, 5]) {
  const game = new ctx.PTD.Game({ seed: 91, rivals: 0 });
  const tower = { id: 1, owner: 0, x: 0, y: 0, alive: true, kind: 'card', stats: { cd: 1, invuln: false }, cool: 0, stunT: 0 };
  game.towers.push(tower);
  game.bossAttack({ owner: 0, bossIdx: index, x: 0, y: 0 });
  const attack = ctx.PTD.BOSSES[index].attack;
  if (attack === 'smoke' && tower.smokeT !== 5) throw Error('Smoke did not blind the tower');
  if (['slam', 'hex', 'roots'].includes(attack) && !(tower.stunT > 0)) throw Error(attack + ' did not disable the tower');
  if (attack === 'hex' && tower.cool < 2) throw Error('Hex did not delay the next shot');
  if (attack === 'mortar' && game.shots.length !== 1) throw Error('Mortar did not launch');
}
console.log('Boss attacks: smoke, slam, hex, roots, mortar passed');
