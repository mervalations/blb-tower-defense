// Game rules and balance data.
// Numbers are taken from the original Poker TD 2.2 map (timers, gold, tower stats,
// creep HP, bounties, leak costs, dealer tip odds). Names and visuals are original.
window.PTD = window.PTD || {};

PTD.RULES = {
  startGold: 25,
  playTime: 45,            // seconds for the "Play a Hand" phase
  spawnInterval: 2,        // seconds between creeps
  creepsPerLevel: 12,
  creepSpeed: 270,         // world units / second
  tipCost: 10,
  tipMax: 9,
  handBonusBase: 5,
  anteBase: 5,
  bossHpMult: 1.8,         // solo modes: bosses keep their punch after the HP curve flattens them
  bossSpeed: 0.85,         // bosses lumber a little slower so you can see them             // solo modes: every hand pays each player anteBase + levels reached        // winner gets base + base * floor((round+1)/6) * modeMult
  fallTime: 2.4,           // seconds a club-footed boss lies face-down after tripping (falls every 8 s)
  intermission: 2,
  towerFootprint: 128,
  snap: 64,
  roadWiden: 2,            // paths are drawn 2 grid cells (64 units) wider on each side than the original map
};

// HP curve for the solo modes (see Game.creepHp). Tuned with tools/sim.js; PTD_CURVE overrides it there.
const CURVE = +(typeof process !== 'undefined' && process.env && process.env.PTD_CURVE) || 0.67;
// Looter health multiplier for levels 1-5 in the solo modes (Classic keeps the original).
PTD.EARLY_EASE = [0.22, 0.35, 0.5, 0.65, 0.82];

PTD.MODES = [
  { key: 'amateur', name: 'Amateur', hpMult: 0.75, curve: CURVE, bonusMult: 1, bountyMult: 2, ante: true, desc: 'Weaker looters. Learn the ropes.' },
  { key: 'pro', name: 'Professional', hpMult: 1.0, curve: CURVE, bonusMult: 1, bountyMult: 2, ante: true, desc: 'The intended solo challenge.' },
  { key: 'tourney', name: 'Tournament', hpMult: 1.0, curve: CURVE, bonusMult: 2, bountyMult: 2, ante: true, desc: 'Professional, but winning a hand pays double.' },
  { key: 'classic', name: 'Classic 2.2', hpMult: 1.0, curve: 0, bonusMult: 1, bountyMult: 1, ante: false, desc: 'Exact looter health from the original map. Brutal solo.' },
];

PTD.PLAYERS = [
  { key: 'Red', color: '#e5484d', name: 'You' },
  { key: 'Blue', color: '#3e7bfa', name: 'Lucky Lou' },
  { key: 'Teal', color: '#12b5a6', name: 'Dice Dana' },
  { key: 'Purple', color: '#9b5de5', name: 'Velvet Vic' },
  { key: 'Yellow', color: '#f2c12e', name: 'Sunny Sal' },
  { key: 'Orange', color: '#f2862e', name: 'Rusty Rae' },
  { key: 'Green', color: '#3fbf5f', name: 'Clover Cal' },
  { key: 'Pink', color: '#ef6fb1', name: 'Rosie Ray' },
];

// Four-colour deck so suits read at a glance on the board.
PTD.SUITS = [
  { key: 'clubs', sym: '♣', name: 'Clubs', color: '#2fa35c', ink: '#1d7a42' },
  { key: 'diamonds', sym: '♦', name: 'Diamonds', color: '#3d8bff', ink: '#1f5fc4' },
  { key: 'hearts', sym: '♥', name: 'Hearts', color: '#ef4b4b', ink: '#c42727' },
  { key: 'spades', sym: '♠', name: 'Spades', color: '#3a3f4b', ink: '#1b1e25' },
];

PTD.RANK_LABEL = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
PTD.RANK_NAME = { 2: '2', 3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10', 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
PTD.RANK_PLURAL = { 2: "2's", 3: "3's", 4: "4's", 5: "5's", 6: "6's", 7: "7's", 8: "8's", 9: "9's", 10: "10's", 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' };

// Combo types, ordered worst to best. `size` = exact number of cards to combine.
PTD.COMBOS = [
  null,
  { key: 'pair', name: 'Pair', size: 2, color: '#c9a227' },
  { key: 'twopair', name: 'Two Pair', size: 4, color: '#d17a22' },
  { key: 'trips', name: 'Three of a Kind', size: 3, color: '#c0392b' },
  { key: 'straight', name: 'Straight', size: 5, color: '#8e44ad' },
  { key: 'flush', name: 'Flush', size: 5, color: '#16a085' },
  { key: 'fullhouse', name: 'Full House', size: 5, color: '#2980b9' },
  { key: 'quads', name: 'Four of a Kind', size: 4, color: '#2c3e50' },
  { key: 'sflush', name: 'Straight Flush', size: 5, color: '#f1c40f' },
];

// Boss indices for a level (a level can hold a tag team), or null.
PTD.levelBosses = function (def) {
  if (!def || def.boss == null) return null;
  return Array.isArray(def.boss) ? def.boss : [def.boss];
};

PTD.comboTitle = function (type, rank) {
  const r = PTD.RANK_PLURAL[rank], n = PTD.RANK_NAME[rank];
  switch (type) {
    case 1: return 'Pair of ' + r;
    case 2: return 'Two Pair - ' + n + ' High';
    case 3: return 'Three of a Kind - ' + r;
    case 4: return 'Straight - ' + n + ' High';
    case 5: return 'Flush - ' + n + ' High';
    case 6: return 'Full House - ' + r;
    case 7: return 'Four of a Kind - ' + r;
    case 8: return 'Straight Flush - ' + n + ' High';
  }
  return '?';
};

PTD.cardTitle = function (suit, rank) {
  return PTD.RANK_NAME[rank] + ' of ' + PTD.SUITS[suit].name;
};

// Tower stats. dmg = base + dice x d(sides). cd = seconds between attacks. range in world units.
// fx: special behaviour handled by the combat code.
PTD.towerStats = function (t) {
  const r = t.rank;
  if (t.kind === 'card') {
    switch (t.suit) {
      case 0: return { base: r - 1, dice: 0, sides: 0, cd: 1.8, range: 400, fx: 'arrow', speed: 1100, desc: 'Steady single-target shots.' };
      case 1: return { base: r + 2, dice: 0, sides: 0, cd: 1.6, range: 400, fx: 'chain', speed: 0, desc: 'Lightning arcs to 2 extra looters.' };
      case 2: return { base: r + 2, dice: 1, sides: 6, cd: 1.8, range: 400, fx: 'fire', magic: true, speed: 750, desc: 'Magic fireball. Spell-immune looters ignore it.' };
      case 3: return { base: r + 2, dice: 1, sides: 4, cd: 1.8, range: 600, fx: 'shell', speed: 900, desc: 'Long-range heavy shot.' };
    }
  }
  switch (t.type) {
    case 1: return { base: 14 + r, dice: 0, sides: 0, cd: 1.2, range: 500, fx: 'arrow', speed: 1200, desc: 'Fast, reliable shots.' };
    case 2: return { base: 26 + r, dice: 0, sides: 0, cd: 1.0, range: 500, fx: 'arrow', speed: 1200, invuln: true, desc: 'Cannot be destroyed by the final boss.' };
    case 3: return { base: 32 + r, dice: 0, sides: 0, cd: 0.7, range: 600, fx: 'arrow', speed: 1300, desc: 'Rapid fire with good range.' };
    case 4: return { base: 38 + r, dice: 0, sides: 0, cd: 0.5, range: 700, fx: 'orb', speed: 900, bounce: r === 2 ? 2 : 0, desc: 'Very fast attacks.' };
    case 5: return { base: 38 + r, dice: 1, sides: 11, cd: 1.0, range: 700, fx: 'poison', speed: 900, desc: 'Poison slows looters and deals damage over time.' };
    case 6: return { base: 40 + 2 * r, dice: 2, sides: 8, cd: 0.8, range: 700, fx: 'frost', speed: 900, desc: 'Frost blast that splashes and slows.' };
    case 7: return { base: 56 + 2 * r, dice: 0, sides: 0, cd: 1.0, range: 700, fx: 'bash', speed: 1000, desc: 'Big hits with a chance to stun.' };
    case 8: return { base: r === 14 ? 140 : 96 + 2 * r, dice: 2, sides: 16, cd: 1.0, range: 900, fx: 'royal', speed: 1100, desc: 'Critical strikes, and marked looters keep bleeding gold.' };
  }
};

// Levels: five blocks of five waves, each block ending in a boss (30 levels total).
// hp / bounty / leak cost are the original values. Looks are original.
// theme: which looter crew walks this round (js/crews3d.js); each wave mixes 3 crew members + a leader.
// look: body colour, accent, accessory id for the 2D view (see art.js)
PTD.LEVELS = [
  { name: 'Pirate Crew', theme: 'pirates', hp: 150, bounty: 1, leak: 1, look: ['#8b5a2b', '#c0392b', 'hat'] },
  { name: 'Ninja Clan', theme: 'ninjas', hp: 425, bounty: 1, leak: 1, look: ['#2c3e50', '#e74c3c', 'mask'] },
  { name: 'Zombie Horde', theme: 'zombies', hp: 800, bounty: 1, leak: 1, look: ['#7fae5a', '#5d4037', 'fangs'] },
  { name: 'Space Aliens', theme: 'aliens', hp: 900, bounty: 1, leak: 1, look: ['#7ed957', '#9b59b6', 'ears'] },
  { name: 'Cave Clan', theme: 'cavemen', hp: 1000, bounty: 1, leak: 1, look: ['#c68e6e', '#8d6e63', 'hood'] },
  { boss: 0, hp: 6000, bounty: 10, leak: 5, immune: true, evasion: 0.15 },
  { name: 'Robot Squad', theme: 'robots', hp: 2000, bounty: 2, leak: 5, look: ['#95a5a6', '#3498db', 'gear'] },
  { name: 'Wizard Circle', theme: 'wizards', hp: 2200, bounty: 2, leak: 5, immune: true, look: ['#5b3fa0', '#f5d76e', 'hood'] },
  { name: 'Cowboy Posse', theme: 'cowboys', hp: 2700, bounty: 2, leak: 5, look: ['#a1673f', '#2d2d2d', 'hat'] },
  { name: 'Mummy Tomb', theme: 'mummies', hp: 4600, bounty: 2, leak: 5, look: ['#e8dcc0', '#c9b98a', 'mask'] },
  { name: 'Clown Troupe', theme: 'clowns', hp: 5000, bounty: 2, leak: 5, look: ['#e74c3c', '#f1c40f', 'hat'] },
  { boss: 1, hp: 16000, bounty: 20, leak: 20, immune: true },
  { name: 'Viking Raiders', theme: 'vikings', hp: 3800, bounty: 3, leak: 10, look: ['#7f8c8d', '#d4a017', 'horns'] },
  { name: 'Ghost Gang', theme: 'ghosts', hp: 6800, bounty: 3, leak: 10, look: ['#ecf0f1', '#9fb7d0', 'hood'] },
  { name: 'Dino Riders', theme: 'dinos', hp: 8500, bounty: 3, leak: 10, immune: true, look: ['#58a55c', '#e67e22', 'fin'] },
  { name: 'Knight Order', theme: 'knights', hp: 8000, bounty: 3, leak: 10, look: ['#bdc3c7', '#2980b9', 'helm'] },
  { name: 'Astronauts', theme: 'astronauts', hp: 10000, bounty: 3, leak: 10, look: ['#ecf0f1', '#e67e22', 'helm'] },
  { boss: 2, hp: 32000, bounty: 30, leak: 40, immune: true },
  { name: 'Garden Gnomes', theme: 'gnomes', hp: 12000, bounty: 4, leak: 20, look: ['#2e86de', '#e74c3c', 'hat'] },
  { name: 'Luchadores', theme: 'luchadores', hp: 12000, bounty: 4, leak: 20, look: ['#8e44ad', '#f1c40f', 'mask'] },
  { name: 'Vampire Coven', theme: 'vampires', hp: 14600, bounty: 4, leak: 20, evasion: 0.2, look: ['#2d2d3a', '#c0392b', 'fangs'] },
  { name: 'Yeti Pack', theme: 'yetis', hp: 15400, bounty: 4, leak: 20, look: ['#f4f6f7', '#85c1e9', 'ears'] },
  { name: 'Chef Brigade', theme: 'chefs', hp: 18000, bounty: 4, leak: 20, immune: true, look: ['#ffffff', '#e74c3c', 'hat'] },
  { boss: 3, hp: 42000, bounty: 40, leak: 60, immune: true, evasion: 0.15 },
  { name: 'Deep-Sea Divers', theme: 'divers', hp: 15200, bounty: 5, leak: 30, look: ['#d4a017', '#2e86c1', 'helm'] },
  { name: 'Mad Scientists', theme: 'scientists', hp: 16000, bounty: 5, leak: 30, immune: true, look: ['#ecf0f1', '#27ae60', 'gear'] },
  { name: 'Gladiators', theme: 'gladiators', hp: 18000, bounty: 5, leak: 30, immune: true, look: ['#c0392b', '#d4a017', 'helm'] },
  { name: 'Jungle Explorers', theme: 'explorers', hp: 20000, bounty: 5, leak: 30, look: ['#c8a165', '#2e7d32', 'hat'] },
  { name: 'Disco Crew', theme: 'disco', hp: 21000, bounty: 5, leak: 30, look: ['#e84393', '#f1c40f', 'shell'] },
  { boss: [4, 5], hpEach: 0.6, hp: 60000, bounty: 50, leak: 100, immune: true, evasion: 0.15, final: true },
];

// Dealer tip odds. Row = number of 10-gold tips (1..9). A roll of 1..100 is bucketed by
// TIP_CURVE and the bucket picks a combo type (1 = pair ... 8 = straight flush).
PTD.TIP_MATRIX = [
  null,
  [4, 3, 2, 1, 1, 2, 3, 4],
  [5, 4, 3, 2, 2, 3, 4, 5],
  [5, 5, 4, 3, 3, 4, 5, 5],
  [6, 5, 4, 3, 3, 4, 5, 6],
  [7, 6, 5, 4, 4, 5, 6, 7],
  [7, 7, 6, 5, 5, 6, 7, 7],
  [8, 7, 6, 5, 5, 6, 7, 8],
  [8, 8, 7, 6, 6, 7, 8, 8],
  [8, 8, 8, 7, 7, 8, 8, 8],
];
PTD.TIP_CURVE = [5, 15, 30, 50, 70, 85, 95, 100];
