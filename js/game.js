// Core simulation: phases, players, dealing, combat, AI rivals.
// No DOM access here so the whole game can also run headless (see tools/sim.js).
window.PTD = window.PTD || {};

PTD.MapGrid = class {
  constructor(md) {
    this.size = md.size; this.cell = md.cell; this.origin = md.origin;
    this.grid = new Uint8Array(this.size * this.size);   // 0 ground, 1 road, 2 wall
    this.occ = new Uint8Array(this.size * this.size);    // tower occupancy
    const code = { a: 0, b: 1, c: 2 };
    md.rows.forEach((row, y) => {
      let x = 0;
      const re = /([abc])(\d+)/g; let m;
      while ((m = re.exec(row))) {
        const v = code[m[1]], n = +m[2];
        for (let i = 0; i < n; i++) this.grid[y * this.size + x++] = v;
      }
    });
    this.widenRoads(PTD.RULES.roadWiden || 0);
    this.lanes = md.lanes;
  }
  // Grow every road by n cells on each side (turns the bordering felt into road).
  widenRoads(n) {
    const N = this.size, g = this.grid;
    for (let pass = 0; pass < n; pass++) {
      const src = g.slice();
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        if (src[y * N + x] !== 0) continue;
        let road = false;
        for (let dy = -1; dy <= 1 && !road; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < N && yy < N && src[yy * N + xx] === 1) { road = true; break; }
        }
        if (road) g[y * N + x] = 1;
      }
    }
  }
  cellAt(wx, wy) {
    const cx = Math.floor((wx - this.origin) / this.cell), cy = Math.floor((wy - this.origin) / this.cell);
    if (cx < 0 || cy < 0 || cx >= this.size || cy >= this.size) return 2;
    return this.grid[cy * this.size + cx];
  }
  snap(wx, wy) {
    const s = PTD.RULES.snap;
    return { x: Math.round(wx / s) * s, y: Math.round(wy / s) * s };
  }
  // Footprint is 4x4 cells (128 units) centred on a 64-unit grid point.
  footprint(x, y) {
    const c0 = Math.round((x - 64 - this.origin) / this.cell), r0 = Math.round((y - 64 - this.origin) / this.cell);
    return { c0, r0 };
  }
  canBuild(x, y, ignoreOcc) {
    const { c0, r0 } = this.footprint(x, y);
    if (c0 < 0 || r0 < 0 || c0 + 4 > this.size || r0 + 4 > this.size) return false;
    for (let r = r0; r < r0 + 4; r++) for (let c = c0; c < c0 + 4; c++) {
      const i = r * this.size + c;
      if (this.grid[i] !== 0) return false;
      if (!ignoreOcc && this.occ[i]) return false;
    }
    return true;
  }
  setOcc(x, y, v) {
    const { c0, r0 } = this.footprint(x, y);
    for (let r = r0; r < r0 + 4; r++) for (let c = c0; c < c0 + 4; c++) this.occ[r * this.size + c] = v;
  }
};

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

PTD.Game = class {
  constructor(opts) {
    this.opts = opts;
    this.rng = mulberry32(opts.seed || (Date.now() & 0xffffffff));
    this.mode = PTD.MODES[opts.mode == null ? 1 : opts.mode];
    this.map = new PTD.MapGrid(window.MAPDATA);
    this.onEvent = opts.onEvent || function () {};
    this.players = [];
    // seats: [{name, human}] for online games; otherwise seat 0 is the local human plus `rivals` AIs.
    const seats = opts.seats || [{ name: opts.playerName, human: !opts.allAI }].concat(
      Array.from({ length: Math.max(0, Math.min(7, opts.rivals == null ? 3 : opts.rivals)) }, () => ({ human: false })));
    const count = seats.length;
    for (let i = 0; i < count; i++) {
      const pd = PTD.PLAYERS[i];
      const ln = this.map.lanes[pd.key];
      const path = ln.path.map(p => ({ x: p[0], y: p[1] }));
      const cum = [0];
      for (let k = 1; k < path.length; k++) cum.push(cum[k - 1] + Math.hypot(path[k].x - path[k - 1].x, path[k].y - path[k - 1].y));
      this.players.push({
        id: i, key: pd.key, color: pd.color, name: seats[i].name || (i === 0 ? 'You' : pd.name),
        human: !!seats[i].human, alive: true, gold: PTD.RULES.startGold, ready: false,
        lane: { path, cum, len: cum[cum.length - 1], vault: { x: ln.vault[0], y: ln.vault[1] } },
        hand: [], dealsLeft: 0, swapped: false, combined: false, folded: false, tips: 0, tipQueue: [],
        deck: [], rating: 0, handTitle: '', handWins: 0, kills: 0, leaks: 0, earned: 0, lost: 0,
        ai: { step: 0, t: 0 },
      });
    }
    this.human = this.players[opts.localSeat || 0];   // the player this screen belongs to
    this.towers = []; this.creeps = []; this.shots = []; this.fx = [];
    this.nextId = 1;
    this.level = 0;           // levels completed/started, like the original's round counter
    this.phase = 'ready';
    this.timer = 0;
    this.time = 0;
    this.spawned = 0; this.toSpawn = 0; this.spawnT = 0;
    this.result = null;
    this.buildSpotTables();
  }

  emit(type, data) { this.onEvent(type, data || {}); }
  ri(a, b) { return a + Math.floor(this.rng() * (b - a + 1)); }
  levelDef(n) { return PTD.LEVELS[(n || this.level) - 1]; }
  nextLevelDef() { return PTD.LEVELS[this.level]; }

  // ---------- AI build-spot scoring ----------
  buildSpotTables() {
    for (const p of this.players) {
      const samples = [];
      const L = p.lane;
      for (let d = 0; d < L.len; d += 64) samples.push(this.pointAt(L, d));
      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (const s of samples) { minX = Math.min(minX, s.x); maxX = Math.max(maxX, s.x); minY = Math.min(minY, s.y); maxY = Math.max(maxY, s.y); }
      const spots = [];
      for (let x = Math.floor((minX - 500) / 64) * 64; x <= maxX + 500; x += 64) {
        for (let y = Math.floor((minY - 500) / 64) * 64; y <= maxY + 500; y += 64) {
          if (!this.map.canBuild(x, y, true)) continue;
          let score = 0;
          for (const s of samples) { const dx = s.x - x, dy = s.y - y; if (dx * dx + dy * dy < 450 * 450) score++; }
          if (score > 0) spots.push({ x, y, score });
        }
      }
      spots.sort((a, b) => b.score - a.score);
      p.spots = spots.slice(0, 1500);
    }
  }
  spotScore(p, x, y) {
    let best = 0;
    for (const s of p.spots) if (s.x === x && s.y === y) { best = s.score; break; }
    return best;
  }

  pointAt(L, d) {
    const path = L.path, cum = L.cum;
    if (d <= 0) return { x: path[0].x, y: path[0].y };
    if (d >= L.len) { const e = path[path.length - 1]; return { x: e.x, y: e.y }; }
    let k = 1; while (cum[k] < d) k++;
    const t = (d - cum[k - 1]) / (cum[k] - cum[k - 1]);
    return { x: path[k - 1].x + (path[k].x - path[k - 1].x) * t, y: path[k - 1].y + (path[k].y - path[k - 1].y) * t, dir: Math.atan2(path[k].y - path[k - 1].y, path[k].x - path[k - 1].x) };
  }

  // ---------- phases ----------
  start() { this.beginHand(); }

  alivePlayers() { return this.players.filter(p => p.alive); }

  beginHand() {
    this.phase = 'hand';
    this.timer = PTD.RULES.playTime;
    for (const t of this.towers) { t.inHand = false; t.selected = false; }
    for (const p of this.players) {
      p.hand = []; p.dealsLeft = p.alive ? 5 : 0; p.swapped = false; p.combined = false;
      p.folded = false; p.ready = false; p.rating = 0; p.handTitle = ''; p.combo = null; p.tipQueue = [];
      p.deck = PTD.Poker.newDeck(this.rng);
      p.ai = { step: 0, t: 0.6 + this.rng() * 0.8 };
    }
    // The table pays an ante each hand so there's gold to tip the dealer with.
    const ante = this.mode.ante ? PTD.RULES.anteBase + this.level : 0;
    if (ante) for (const p of this.alivePlayers()) { p.gold += ante; p.earned += ante; }
    this.emit('handStart', { round: this.level + 1, def: this.nextLevelDef(), ante });
  }

  // Testing helper: clear the board of looters and deal the hand that leads into `levelNum`.
  jumpTo(levelNum) {
    if (this.phase === 'over') return;
    this.level = Math.max(0, Math.min(PTD.LEVELS.length - 1, levelNum - 1));
    for (const c of this.creeps) c.alive = false;
    this.creeps = []; this.shots = [];
    this.spawned = this.toSpawn = 0;
    this.beginHand();
    this.emit('jump', { level: levelNum });
  }

  ready(p) {
    if (this.phase === 'hand') (p || this.human).ready = true;
  }

  humansDone() {
    return this.players.every(p => !p.human || !p.alive || p.ready);
  }

  endHand() {
    let top = 0;
    const contenders = [];
    for (const p of this.alivePlayers()) {
      if (p.folded) { p.handTitle = 'Folded'; continue; }
      if (!p.combined) {
        let hi = null;
        for (const t of p.hand) if (t.alive && (!hi || t.rank > hi.rank)) hi = t;
        p.rating = hi ? hi.rank : 0;
        p.handTitle = hi ? 'High card: ' + PTD.RANK_NAME[hi.rank] : 'No cards';
        // No combination: only the highest card stays on the board as a tower.
        for (const t of p.hand) if (t.alive && t !== hi) this.removeTower(t);
        p.hand = hi ? [hi] : [];
      }
      contenders.push(p);
      top = Math.max(top, p.rating);
    }
    const winners = top > 0 ? contenders.filter(p => p.rating === top) : [];
    const bonus = PTD.RULES.handBonusBase + PTD.RULES.handBonusBase * Math.floor((this.level + 1) / 6) * this.mode.bonusMult;
    for (const w of winners) { w.gold += bonus; w.handWins++; w.earned += bonus; }
    this.emit('handResult', { winners, bonus, title: winners.length ? winners[0].handTitle : '' });
    for (const t of this.towers) t.selected = false;
    this.towers = this.towers.filter(t => t.alive);
    this.startSpawn();
  }

  startSpawn() {
    this.level++;
    const def = this.levelDef();
    this.phase = 'spawn';
    this.spawned = 0;
    const bosses = PTD.levelBosses(def);
    this.toSpawn = bosses ? bosses.length : PTD.RULES.creepsPerLevel;
    this.spawnT = 0;
    const active = this.alivePlayers().filter(p => !p.folded);
    this.emit('waveStart', { level: this.level, def, bosses: bosses ? bosses.map(i => PTD.BOSSES[i]) : null });
    if (!active.length) { this.spawned = this.toSpawn; this.emit('allFolded'); }
  }

  spawnOne() {
    const def = this.levelDef();
    const bosses = PTD.levelBosses(def);
    const bossIdx = bosses ? bosses[this.spawned] : null;
    const isBoss = bossIdx != null;
    for (const p of this.alivePlayers()) {
      if (p.folded) continue;
      const start = p.lane.path[0];
      const hp = Math.round(this.creepHp(def) * (isBoss && def.hpEach ? def.hpEach : 1) * (isBoss && this.mode.curve ? PTD.RULES.bossHpMult : 1));
      this.creeps.push({
        id: this.nextId++, owner: p.id, def, level: this.level, x: start.x, y: start.y, dir: 0,
        dist: 0, hp, maxHp: hp, speed: PTD.RULES.creepSpeed * (isBoss ? PTD.RULES.bossSpeed : 1), slowT: 0, slowF: 1, stunT: 0,
        poisonT: 0, poisonDps: 0, bleed: false, alive: true,
        boss: isBoss, bossIdx, wait: isBoss ? 4.5 : 0, atkT: 3, phaseOff: this.rng() * 6.28,
        radius: isBoss ? 85 : 42,
        // club-footed bosses (Smooth) trip and fall flat every 8 seconds, lying there for RULES.fallTime
        trips: isBoss && !!(PTD.BOSSES && PTD.BOSSES[bossIdx] && PTD.BOSSES[bossIdx].feet === 'club'), tripT: 8, fallT: 0,
      });
    }
  }

  // Classic mode uses the original HP. Other modes flatten the curve so a solo player
  // can keep up: hp = 150 * (originalHp / 150) ^ curve.
  creepHp(def) {
    const m = this.mode;
    const base = m.curve ? 150 * Math.pow(def.hp / 150, m.curve) : def.hp;
    // An uncombined hand leaves a single tower, so the first waves ease in while you build up.
    const lvl = PTD.LEVELS.indexOf(def);
    const ease = m.curve && lvl >= 0 && lvl < PTD.EARLY_EASE.length ? PTD.EARLY_EASE[lvl] : 1;
    return Math.max(1, Math.round(base * m.hpMult * ease));
  }

  finish() {
    const alive = this.alivePlayers();
    let top = -1;
    for (const p of alive) top = Math.max(top, p.gold);
    const winners = alive.filter(p => p.gold === top);
    this.phase = 'over';
    this.result = { winners, reason: 'end' };
    this.emit('gameOver', this.result);
  }

  defeat(p) {
    if (!p.alive) return;
    p.alive = false; p.gold = 0;
    for (const t of this.towers) if (t.owner === p.id && t.alive) this.removeTower(t);
    for (const c of this.creeps) if (c.owner === p.id) c.alive = false;
    this.emit('defeat', { player: p });
    // Game over once every human is broke (spectating AIs isn't much of a game).
    if (p.human && !this.players.some(q => q.human && q.alive)) {
      this.phase = 'over';
      this.result = { winners: [], reason: 'broke' };
      this.emit('gameOver', this.result);
      return;
    }
    const alive = this.alivePlayers();
    if (alive.length <= 1 && this.players.length > 1) {
      this.phase = 'over';
      this.result = { winners: alive, reason: 'last' };
      this.emit('gameOver', this.result);
    }
  }

  // ---------- player actions ----------
  canAct(p) { return this.phase === 'hand' && p.alive && !p.folded; }

  canDealAt(p, x, y) {
    if (!this.canAct(p) || p.dealsLeft <= 0) return false;
    return this.map.canBuild(x, y);
  }

  drawCard(p) {
    if (p.tipQueue.length) return p.tipQueue.shift();
    return p.deck.pop();
  }

  tip(p) {
    if (!this.canAct(p) || p.dealsLeft < 5 || p.tips >= PTD.RULES.tipMax) return { ok: false, msg: 'You can only tip before your first card is dealt.' };
    if (p.gold <= PTD.RULES.tipCost) return { ok: false, msg: 'You need more than ' + PTD.RULES.tipCost + ' gold to tip.' };
    p.gold -= PTD.RULES.tipCost; p.lost += PTD.RULES.tipCost;
    p.tips++;
    this.emit('tip', { player: p });
    return { ok: true };
  }

  // On the first deal a tipped dealer may stack the deck (original "Check Dealer Tip").
  resolveTip(p) {
    if (!p.tips) return;
    const tips = Math.min(p.tips, 9);
    p.tips = 0;
    if (tips < this.ri(1, 4)) { this.emit('tipFailed', { player: p }); return; }
    const roll = this.ri(1, 100);
    let col = 0; while (roll > PTD.TIP_CURVE[col]) col++;
    const type = PTD.TIP_MATRIX[tips][col];
    const combo = PTD.Poker.makeTipHand(type, this.rng);
    const same = (a, b) => a.suit === b.suit && a.rank === b.rank;
    p.deck = p.deck.filter(c => !combo.some(k => same(k, c)));
    const cards = combo.slice();
    while (cards.length < 5) cards.push(p.deck.pop());
    for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(this.rng() * (i + 1)); const t = cards[i]; cards[i] = cards[j]; cards[j] = t; }
    p.tipQueue = cards;
    this.emit('tipWorked', { player: p, type });
  }

  deal(p, x, y) {
    if (!this.canDealAt(p, x, y)) return null;
    if (p.dealsLeft === 5) this.resolveTip(p);
    const card = this.drawCard(p);
    const t = this.addTower(p, x, y, { kind: 'card', suit: card.suit, rank: card.rank });
    t.inHand = true;
    p.hand.push(t);
    p.dealsLeft--;
    this.emit('deal', { player: p, tower: t });
    return t;
  }

  addTower(p, x, y, spec) {
    const t = Object.assign({
      id: this.nextId++, owner: p.id, x, y, alive: true, cool: 0, kills: 0, dmgDone: 0,
      selected: false, inHand: false, born: this.time, type: 0,
    }, spec);
    t.stats = PTD.towerStats(t);
    t.title = t.kind === 'card' ? PTD.cardTitle(t.suit, t.rank) : PTD.comboTitle(t.type, t.rank);
    t.scale = t.kind === 'card' ? 1 : 0.8 + (t.rank / 14) * 0.35;
    this.map.setOcc(x, y, 1);
    this.towers.push(t);
    return t;
  }

  removeTower(t) {
    t.alive = false;
    this.map.setOcc(t.x, t.y, 0);
  }

  toggleSelect(p, t) {
    if (!this.canAct(p) || !t || t.owner !== p.id || !t.inHand || t.kind !== 'card') return false;
    t.selected = !t.selected;
    t.selOrder = t.selected ? (this.selSeq = (this.selSeq || 0) + 1) : 0;
    return true;
  }

  // Selected hand cards in the order they were clicked; the first one anchors a combine.
  selected(p) {
    return p.hand.filter(t => t.alive && t.selected && t.kind === 'card').sort((a, b) => (a.selOrder || 0) - (b.selOrder || 0));
  }

  canRequest(p) {
    const n = this.selected(p).length;
    return this.canAct(p) && p.dealsLeft === 0 && !p.swapped && !p.combined && n >= 1;
  }

  requestNew(p) {
    if (!this.canRequest(p)) return false;
    let sel = this.selected(p);
    if (sel.length === 5) sel.splice(Math.floor(this.rng() * 5), 1);   // max 4 replaced
    for (const old of sel) {
      const card = p.deck.pop();
      this.removeTower(old);
      const t = this.addTower(p, old.x, old.y, { kind: 'card', suit: card.suit, rank: card.rank });
      t.inHand = true; t.fresh = this.time;
      p.hand[p.hand.indexOf(old)] = t;
    }
    for (const t of p.hand) t.selected = false;
    this.towers = this.towers.filter(t => t.alive);
    p.swapped = true;
    this.emit('swap', { player: p, count: sel.length });
    return true;
  }

  selectionCombo(p) { return PTD.Poker.evaluate(this.selected(p)); }

  canCombine(p) {
    return this.canAct(p) && p.dealsLeft === 0 && !p.combined && !!this.selectionCombo(p);
  }

  combine(p, anchor) {
    if (!this.canCombine(p)) return null;
    const sel = this.selected(p);
    const combo = PTD.Poker.evaluate(sel);
    const at = anchor && sel.indexOf(anchor) >= 0 ? anchor : sel[0];
    // Combining uses up the whole hand: every card goes, only the combined tower is left.
    for (const t of p.hand) if (t.alive) this.removeTower(t);
    const tower = this.addTower(p, at.x, at.y, { kind: 'combo', type: combo.type, rank: combo.rank });
    tower.inHand = true; tower.fresh = this.time;
    p.hand = [tower];
    for (const t of p.hand) t.selected = false;
    this.towers = this.towers.filter(t => t.alive);
    p.combined = true; p.combo = combo; p.rating = combo.rating; p.handTitle = combo.title;
    this.emit('combine', { player: p, tower, combo });
    return tower;
  }

  canFold(p) { return this.canAct(p) && !p.combined; }

  fold(p) {
    if (!this.canFold(p)) return false;
    for (const t of p.hand) this.removeTower(t);
    this.towers = this.towers.filter(t => t.alive);
    p.hand = []; p.dealsLeft = 0; p.folded = true;
    this.emit('fold', { player: p });
    return true;
  }

  // ---------- AI ----------
  aiStep(p, dt) {
    if (!p.alive || p.human || p.folded) return;
    const ai = p.ai;
    ai.t -= dt;
    if (ai.t > 0) return;
    if (ai.step === 0) {
      // Tip now and then when the bank allows it.
      if (p.gold >= 45 && this.rng() < 0.3) {
        const n = Math.min(4, Math.floor((p.gold - 25) / 10));
        for (let i = 0; i < n; i++) this.tip(p);
      }
      ai.step = 1; ai.t = 0.3;
    } else if (ai.step === 1) {
      if (p.dealsLeft > 0) {
        const free = [];
        for (const s of p.spots) { if (this.map.canBuild(s.x, s.y)) { free.push(s); if (free.length >= 6) break; } }
        const s = free[Math.floor(this.rng() * free.length)];
        if (!s || !this.deal(p, s.x, s.y)) p.dealsLeft = 0;
        ai.t = 0.35 + this.rng() * 0.4;
      } else { ai.step = 2; ai.t = 0.8; }
    } else if (ai.step === 2) {
      const cards = p.hand.map(t => ({ suit: t.suit, rank: t.rank }));
      const drop = cards.length === 5 ? PTD.Poker.suggestDiscard(cards) : [];
      if (drop.length) { drop.forEach((i, k) => { p.hand[i].selected = true; p.hand[i].selOrder = k + 1; }); this.requestNew(p); }
      ai.step = 3; ai.t = 0.8;
    } else if (ai.step === 3) {
      const cards = p.hand.map(t => ({ suit: t.suit, rank: t.rank }));
      const b = PTD.Poker.best(cards);
      if (b) {
        let anchor = null, bestScore = -1;
        for (const i of b.idx) { const t = p.hand[i]; t.selected = true; t.selOrder = i + 1; const sc = this.spotScore(p, t.x, t.y); if (sc > bestScore) { bestScore = sc; anchor = t; } }
        this.combine(p, anchor);
      }
      ai.step = 4;
    }
  }

  aiDone() {
    return this.players.every(p => !p.alive || p.human || p.folded || p.ai.step >= 4);
  }

  // ---------- combat ----------
  roll(s) {
    let d = s.base;
    for (let i = 0; i < s.dice; i++) d += 1 + Math.floor(this.rng() * s.sides);
    return d;
  }

  damage(c, amount, opts) {
    if (!c.alive) return 0;
    opts = opts || {};
    if (opts.magic && c.def.immune) { this.floatText(c.x, c.y + 60, 'immune', '#b8c4d6'); return 0; }
    if (!opts.noEvade && c.def.evasion && this.rng() < c.def.evasion) { this.floatText(c.x, c.y + 60, 'miss', '#d6d6d6'); return 0; }
    c.hp -= amount;
    if (opts.tower) opts.tower.dmgDone += amount;
    if (c.hp <= 0) this.kill(c, opts.tower);
    return amount;
  }

  kill(c, tower) {
    if (!c.alive) return;
    c.alive = false;
    const owner = this.players[c.owner];
    const b = c.def.bounty * (this.mode.bountyMult || 1);
    owner.gold += b; owner.earned += b; owner.kills++;
    if (tower) tower.kills++;
    this.fx.push({ kind: 'coins', x: c.x, y: c.y, t: 0, life: 0.8, n: c.boss ? 18 : 6, color: owner.color });
    this.floatText(c.x, c.y + 50, '+' + b, '#ffd34d');
    this.emit('kill', { creep: c, owner, boss: c.boss });
  }

  leak(c) {
    c.alive = false;
    const p = this.players[c.owner];
    const loss = c.def.leak;
    p.gold = Math.max(0, p.gold - loss); p.leaks++; p.lost += loss;
    this.floatText(c.x, c.y + 60, '-' + loss, '#ff5a5a');
    this.fx.push({ kind: 'ring', x: p.lane.vault.x, y: p.lane.vault.y, t: 0, life: 0.6, color: '#ff4d4d' });
    this.emit('leak', { creep: c, player: p, loss });
    if (p.gold <= 0) this.defeat(p);
  }

  floatText(x, y, text, color) {
    if (this.fx.length > 600) return;
    this.fx.push({ kind: 'text', x, y, text, color, t: 0, life: 1.0 });
  }

  findTarget(t) {
    const r2 = t.stats.range * t.stats.range;
    let best = null, bd = -1;
    for (const c of this.creeps) {
      if (!c.alive || c.wait > 0) continue;
      const dx = c.x - t.x, dy = c.y - t.y;
      if (dx * dx + dy * dy > r2) continue;
      const prog = c.dist / this.players[c.owner].lane.len;
      if (prog > bd) { bd = prog; best = c; }
    }
    return best;
  }

  nearby(x, y, radius, exclude) {
    const out = [];
    const r2 = radius * radius;
    for (const c of this.creeps) {
      if (!c.alive || c.wait > 0 || (exclude && exclude.indexOf(c) >= 0)) continue;
      const dx = c.x - x, dy = c.y - y, d2 = dx * dx + dy * dy;
      if (d2 <= r2) out.push({ c, d2 });
    }
    return out.sort((a, b) => a.d2 - b.d2).map(o => o.c);
  }

  fire(t, c) {
    const s = t.stats;
    const dmg = this.roll(s);
    t.flash = 0.15;
    t.aim = Math.atan2(c.y - t.y, c.x - t.x);
    if (s.fx === 'chain') {
      const hit = [c];
      const pts = [{ x: t.x, y: t.y + 40 }, { x: c.x, y: c.y }];
      this.damage(c, dmg, { tower: t });
      let last = c, amt = dmg;
      for (let i = 0; i < 2; i++) {
        const next = this.nearby(last.x, last.y, 320, hit)[0];
        if (!next) break;
        amt = Math.round(amt * 0.7);
        hit.push(next); pts.push({ x: next.x, y: next.y });
        this.damage(next, amt, { tower: t, magic: true, noEvade: true });
        last = next;
      }
      this.fx.push({ kind: 'bolt', pts, t: 0, life: 0.18, color: '#9fd0ff' });
      this.emit('shot', { fx: 'chain', tower: t });
      return;
    }
    this.shots.push({ x: t.x, y: t.y + 30, target: c, tx: c.x, ty: c.y, speed: s.speed, dmg, fx: s.fx, tower: t, magic: !!s.magic, bounce: s.bounce || 0, hit: [] });
    this.emit('shot', { fx: s.fx, tower: t, target: c });
  }

  impact(sh) {
    const c = sh.target, t = sh.tower, s = t.stats;
    if (sh.fx === 'mortar') {
      if (sh.targetTower && sh.targetTower.alive) {
        this.removeTower(sh.targetTower);
        this.fx.push({ kind: 'boom', x: sh.tx, y: sh.ty, t: 0, life: 0.7, r: 200, color: '#ff8a3d' });
        this.emit('towerDestroyed', { tower: sh.targetTower });
      }
      return;
    }
    if (!c || !c.alive) return;
    let dmg = sh.dmg;
    const opts = { tower: t, magic: sh.magic };
    switch (sh.fx) {
      case 'royal':
        if (this.rng() < 0.2) { dmg = Math.round(dmg * 2.5); this.floatText(c.x, c.y + 90, dmg + '!', '#ffe066'); }
        if (this.damage(c, dmg, opts) > 0) c.bleed = true;
        this.fx.push({ kind: 'spark', x: c.x, y: c.y, t: 0, life: 0.35, color: '#ffe066' });
        return;
      case 'bash':
        if (this.damage(c, dmg, opts) > 0 && this.rng() < 0.2) { c.stunT = Math.max(c.stunT, 1.0); this.floatText(c.x, c.y + 80, 'stun', '#ffffff'); }
        this.fx.push({ kind: 'spark', x: c.x, y: c.y, t: 0, life: 0.3, color: '#cfd8e3' });
        return;
      case 'poison':
        if (this.damage(c, dmg, opts) > 0) { c.poisonT = 3; c.poisonDps = 8; c.slowT = Math.max(c.slowT, 3); c.slowF = Math.min(c.slowF, 0.7); }
        return;
      case 'frost': {
        const hits = this.nearby(c.x, c.y, 170);
        for (const o of hits) {
          const got = this.damage(o, o === c ? dmg : Math.round(dmg * 0.5), Object.assign({}, opts, { noEvade: o !== c }));
          if (got > 0) { o.slowT = Math.max(o.slowT, 2); o.slowF = Math.min(o.slowF, 0.75); }
        }
        this.fx.push({ kind: 'ring', x: c.x, y: c.y, t: 0, life: 0.4, color: '#a8e6ff', r: 170 });
        return;
      }
      case 'orb':
        this.damage(c, dmg, opts);
        if (sh.bounce > 0) {
          sh.hit.push(c);
          const next = this.nearby(c.x, c.y, 400, sh.hit)[0];
          if (next) this.shots.push({ x: c.x, y: c.y, target: next, tx: next.x, ty: next.y, speed: sh.speed, dmg: Math.round(dmg * 0.8), fx: 'orb', tower: t, bounce: sh.bounce - 1, hit: sh.hit });
        }
        return;
      default:
        this.damage(c, dmg, opts);
        if (sh.fx === 'fire' || sh.fx === 'shell') this.fx.push({ kind: 'spark', x: c.x, y: c.y, t: 0, life: 0.3, color: sh.fx === 'fire' ? '#ff8a3d' : '#c8c8c8' });
    }
  }

  bossAttack(c) {
    const p = this.players[c.owner];
    const mine = this.towers.filter(t => t.alive && t.owner === p.id && !t.stats.invuln);
    if (!mine.length) return;
    const quads = mine.filter(t => t.kind === 'combo' && t.type === 7);
    const pool = quads.length ? quads : mine;
    const target = pool[Math.floor(this.rng() * pool.length)];
    this.shots.push({ x: c.x, y: c.y + 80, tx: target.x, ty: target.y, speed: 700, fx: 'mortar', targetTower: target, tower: { stats: {} }, arc: true, sx: c.x, sy: c.y + 80 });
    this.emit('bossAttack', { creep: c, tower: target });
  }

  // ---------- main update ----------
  update(dt) {
    if (this.phase === 'over' || this.phase === 'ready') { this.updateFx(dt); return; }
    this.time += dt;
    if (this.phase === 'hand') {
      this.timer -= dt;
      for (const p of this.players) this.aiStep(p, dt);
      if (this.timer <= 0 || (this.humansDone() && this.aiDone())) this.endHand();
    } else if (this.phase === 'spawn') {
      if (this.spawned < this.toSpawn) {
        this.spawnT -= dt;
        if (this.spawnT <= 0) { this.spawnOne(); this.spawned++; this.spawnT = PTD.RULES.spawnInterval; }
      }
      this.updateCreeps(dt);
      this.updateTowers(dt);
      this.updateShots(dt);
      if (this.phase === 'spawn' && this.spawned >= this.toSpawn && !this.creeps.some(c => c.alive)) {
        this.phase = 'intermission';
        this.timer = PTD.RULES.intermission;
        this.emit('waveCleared', { level: this.level });
      }
    } else if (this.phase === 'intermission') {
      this.updateShots(dt);
      this.timer -= dt;
      if (this.timer <= 0) {
        this.shots = [];
        if (this.level >= PTD.LEVELS.length) this.finish();
        else this.beginHand();
      }
    }
    this.updateFx(dt);
  }

  updateCreeps(dt) {
    for (const c of this.creeps) {
      if (!c.alive) continue;
      if (c.bleed) { c.hp = Math.max(1, c.hp - 20 * dt); }
      if (c.poisonT > 0) { c.poisonT -= dt; c.hp -= c.poisonDps * dt; if (c.hp <= 0) { this.kill(c, null); continue; } }
      if (c.wait > 0) { c.wait -= dt; continue; }
      if (c.trips) {
        c.tripT -= dt;
        if (c.tripT <= 0) { c.tripT += 8; c.fallT = PTD.RULES.fallTime; this.floatText(c.x, c.y + 120, 'TRIPPED!', '#ffffff'); }
        if (c.fallT > 0) { c.fallT -= dt; continue; }
      }
      if (c.stunT > 0) { c.stunT -= dt; continue; }
      if (c.slowT > 0) { c.slowT -= dt; if (c.slowT <= 0) c.slowF = 1; }
      const L = this.players[c.owner].lane;
      c.dist += c.speed * c.slowF * dt;
      const pt = this.pointAt(L, c.dist);
      c.x = pt.x; c.y = pt.y; if (pt.dir != null) c.dir = pt.dir;
      if (c.dist >= L.len) { this.leak(c); continue; }
      if (c.def.final) {
        c.atkT -= dt;
        if (c.atkT <= 0) { c.atkT = 3; if (this.rng() < 0.5 && c.dist < L.len * 0.9) this.bossAttack(c); }
      }
    }
    if (this.creeps.length > 64 && this.creeps.some(c => !c.alive)) this.creeps = this.creeps.filter(c => c.alive);
  }

  updateTowers(dt) {
    for (const t of this.towers) {
      if (!t.alive) continue;
      if (t.flash > 0) t.flash -= dt;
      t.cool -= dt;
      if (t.cool > 0) continue;
      const c = this.findTarget(t);
      if (c) { this.fire(t, c); t.cool = t.stats.cd; } else t.cool = 0;
    }
  }

  updateShots(dt) {
    const keep = [];
    for (const sh of this.shots) {
      if (sh.target && sh.target.alive) { sh.tx = sh.target.x; sh.ty = sh.target.y; }
      const dx = sh.tx - sh.x, dy = sh.ty - sh.y, d = Math.hypot(dx, dy), step = sh.speed * dt;
      if (d <= step || d < 1) { sh.x = sh.tx; sh.y = sh.ty; this.impact(sh); continue; }
      if (!sh.arc && sh.target && !sh.target.alive) continue;
      sh.x += dx / d * step; sh.y += dy / d * step;
      keep.push(sh);
    }
    this.shots = keep;
    if (this.towers.length > 50 && this.towers.some(t => !t.alive)) this.towers = this.towers.filter(t => t.alive);
  }

  updateFx(dt) {
    let w = 0;
    for (const f of this.fx) { f.t += dt; if (f.t < f.life) this.fx[w++] = f; }
    this.fx.length = w;
  }

  towerAt(x, y) {
    for (let i = this.towers.length - 1; i >= 0; i--) {
      const t = this.towers[i];
      if (t.alive && Math.abs(t.x - x) <= 64 && Math.abs(t.y - y) <= 64) return t;
    }
    return null;
  }
};
