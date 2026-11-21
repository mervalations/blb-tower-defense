// Online multiplayer. The host's browser runs the real simulation; clients send their
// actions to the host and draw the snapshots it streams back. Connections are WebRTC
// peer-to-peer via PeerJS (its free public broker only introduces the browsers).
window.PTD = window.PTD || {};

PTD.Net = (function () {
  const PEERJS_URL = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
  const PREFIX = 'pokertd-v1-';
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const SNAP_HZ = 12;

  function loadPeerJs() {
    if (window.Peer) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = PEERJS_URL;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the networking library. Are you online?'));
      document.head.appendChild(s);
    });
  }

  function newCode() {
    let c = '';
    for (let i = 0; i < 5; i++) c += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
    return c;
  }

  const r = (v) => Math.round(v);

  // ---------- serialisation helpers ----------
  function towerRec(t) {
    return [t.id, t.owner, t.x, t.y, t.kind === 'card' ? 0 : 1, t.kind === 'card' ? t.suit : t.type, t.rank,
      t.inHand ? 1 : 0, t.kills, r(t.dmgDone), t.fresh != null ? +t.fresh.toFixed(2) : -1];
  }
  function creepRec(c) {
    const flags = (c.slowF < 1 ? 1 : 0) | (c.stunT > 0 ? 2 : 0) | (c.bleed ? 4 : 0) | (c.wait > 0 ? 8 : 0);
    return [c.id, c.owner, r(c.x), r(c.y), r(c.dir * 100), r(c.hp), c.maxHp, c.level, c.bossIdx == null ? -1 : c.bossIdx, flags];
  }
  function playerRec(p) {
    return [p.gold, p.alive ? 1 : 0, p.folded ? 1 : 0, p.dealsLeft, p.swapped ? 1 : 0, p.combined ? 1 : 0, p.tips,
      p.rating, p.handTitle, p.handWins, p.kills, p.leaks, p.ready ? 1 : 0, p.hand.filter(t => t.alive).map(t => t.id), p.human ? 1 : 0, p.name];
  }

  // Events the UI cares about, flattened to ids so they survive JSON.
  function serEvent(type, d) {
    const pid = (p) => (p ? p.id : -1);
    switch (type) {
      case 'handStart': return { round: d.round, ante: d.ante };
      case 'deal': case 'swap': case 'tip': case 'tipWorked': case 'tipFailed': case 'fold': case 'defeat': return { p: pid(d.player) };
      case 'combine': return { p: pid(d.player), type: d.combo.type, title: d.combo.title };
      case 'handResult': return { w: d.winners.map(pid), bonus: d.bonus, title: d.title };
      case 'waveStart': return { level: d.level };
      case 'kill': return { o: pid(d.owner), boss: d.boss, b: d.creep && d.creep.bossIdx != null ? d.creep.bossIdx : -1 };
      case 'leak': return { p: pid(d.player), loss: d.loss };
      case 'bossAttack': return { o: d.creep.owner, b: d.creep.bossIdx, c: d.creep.id, tw: d.tower.id, tx: d.tower.x, ty: d.tower.y };
      case 'towerDestroyed': return { o: d.tower.owner };
      case 'gameOver': return { w: d.winners.map(pid), reason: d.reason };
      case 'shot': return { tw: d.tower.id, c: d.target ? d.target.id : -1, fx: d.fx };
      case 'allFolded': case 'waveCleared': return {};
    }
    return null;
  }

  // =====================================================================
  // Host
  // =====================================================================
  class Host {
    constructor(name, hooks, code) {
      this.hooks = hooks;          // { onLobby(seats), onError(msg), onDrop(name), onEvent, onStartRequest }
      this.fixedCode = !!code;     // public table uses a well-known code
      this.code = code || newCode();
      this.seats = [{ name, human: true, conn: null }];
      this.game = null;
      this.events = [];
      this.snapT = 0;
      this.lastTowerSig = '';
      this.towerT = 0;
    }

    open() {
      return loadPeerJs().then(() => new Promise((resolve, reject) => {
        this.peer = new Peer(PREFIX + this.code);
        this.peer.on('open', () => resolve(this.code));
        this.peer.on('error', (e) => {
          if (e.type === 'unavailable-id' && !this.fixedCode) { this.code = newCode(); this.peer.destroy(); this.open().then(resolve, reject); return; }
          if (e.type === 'unavailable-id') { reject(new Error('Someone else just opened this table. Try Play Online again.')); return; }
          this.hooks.onError && this.hooks.onError('Network: ' + (e.message || e.type));
          reject(e);
        });
        this.peer.on('connection', (conn) => this.accept(conn));
      }));
    }

    accept(conn) {
      conn.on('data', (m) => this.onMessage(conn, m));
      conn.on('close', () => this.drop(conn));
      conn.on('error', () => this.drop(conn));
    }

    onMessage(conn, m) {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'hello') {
        if (this.game) { conn.send({ t: 'reject', msg: 'A game is already running at that table. Try again when it ends, or open a Private Table.' }); return; }
        if (this.seats.length >= 8) { conn.send({ t: 'reject', msg: 'The table is full (8 seats).' }); return; }
        this.seats.push({ name: String(m.name || 'Friend').slice(0, 14), human: true, conn });
        this.broadcastLobby();
        return;
      }
      if (m.t === 'start' && !this.game) { this.hooks.onStartRequest && this.hooks.onStartRequest(); return; }
      if (m.t === 'act' && this.game) {
        const seat = this.seats.findIndex(s => s.conn === conn);
        if (seat > 0) this.apply(this.game.players[seat], m);
      }
    }

    apply(p, m) {
      const g = this.game;
      const select = (ids) => {
        const order = new Map((ids || []).map((id, i) => [id, i + 1]));
        for (const t of p.hand) { t.selected = order.has(t.id); t.selOrder = order.get(t.id) || 0; }
      };
      switch (m.a) {
        case 'deal': g.deal(p, +m.x, +m.y); break;
        case 'tip': g.tip(p); break;
        case 'swap': select(m.sel); g.requestNew(p); break;
        case 'combine': select(m.sel); g.combine(p, p.hand.find(t => t.id === m.anchor)); break;
        case 'fold': g.fold(p); break;
        case 'ready': g.ready(p); break;
      }
    }

    drop(conn) {
      const seat = this.seats.findIndex(s => s.conn === conn);
      if (seat <= 0) return;
      const s = this.seats[seat];
      s.conn = null;
      if (!this.game) { this.seats.splice(seat, 1); this.broadcastLobby(); return; }
      // Mid-game: a computer player takes over that seat.
      const p = this.game.players[seat];
      p.human = false;
      p.ai = { step: p.dealsLeft === 5 ? 0 : p.dealsLeft > 0 ? 1 : 2, t: 0.5 };
      p.name = s.name + ' (bot)';
      this.hooks.onDrop && this.hooks.onDrop(s.name);
    }

    kick(seat) {
      const s = this.seats[seat];
      if (!s || seat === 0 || this.game) return;
      if (s.conn) { s.conn.send({ t: 'reject', msg: 'The host removed you from the table.' }); setTimeout(() => s.conn && s.conn.close(), 200); }
      this.seats.splice(seat, 1);
      this.broadcastLobby();
    }

    lobbyInfo() { return this.seats.map((s, i) => ({ name: s.name, seat: i })); }

    broadcastLobby(extra) {
      const info = this.lobbyInfo();
      this.seats.forEach((s, i) => { if (s.conn && s.conn.open) s.conn.send(Object.assign({ t: 'lobby', seats: info, you: i }, extra || {})); });
      this.hooks.onLobby && this.hooks.onLobby(info);
    }

    // Starts the match. `bots` = number of computer seats added after the humans.
    start(opts) {
      const seats = this.seats.map(s => ({ name: s.name, human: true }));
      for (let i = 0; i < opts.bots && seats.length < 8; i++) seats.push({ human: false });
      const seed = (Math.random() * 1e9) | 0;
      const setup = { seed, mode: opts.mode, seats };
      this.game = new PTD.Game(Object.assign({}, setup, { localSeat: 0, onEvent: (t, d) => this.onGameEvent(t, d) }));
      this.seats.forEach((s, i) => { if (s.conn && s.conn.open) s.conn.send({ t: 'start', setup, you: i }); });
      return this.game;
    }

    onGameEvent(type, d) {
      this.hooks.onEvent && this.hooks.onEvent(type, d);
      const e = serEvent(type, d);
      if (e) { e.k = type; this.events.push(e); }
    }

    // Call every frame after game.update().
    tick(dt) {
      if (!this.game) return;
      this.snapT -= dt; this.towerT -= dt;
      if (this.snapT > 0 && this.game.phase !== 'over') return;
      this.snapT = 1 / SNAP_HZ;
      const g = this.game;
      const alive = g.towers.filter(t => t.alive);
      const sig = alive.length + ':' + (alive.length ? alive[alive.length - 1].id : 0) + ':' + g.phase + ':' + alive.reduce((a, t) => a + (t.inHand ? 1 : 0), 0);
      const snap = {
        t: 's', ph: g.phase, tm: +g.timer.toFixed(2), lv: g.level, time: +g.time.toFixed(2),
        pl: g.players.map(playerRec),
        cr: g.creeps.filter(c => c.alive).map(creepRec),
        fx: [], ev: this.events,
      };
      if (sig !== this.lastTowerSig || this.towerT <= 0) {
        snap.tw = alive.map(towerRec);
        this.lastTowerSig = sig; this.towerT = 1;
      }
      for (const f of g.fx) {
        if (f._sent) continue;
        f._sent = true;
        const o = { kind: f.kind, x: r(f.x), y: r(f.y), life: f.life };
        if (f.text != null) o.text = f.text;
        if (f.color) o.color = f.color;
        if (f.n) o.n = f.n;
        if (f.r) o.r = f.r;
        if (f.pts) o.pts = f.pts.map(p => ({ x: r(p.x), y: r(p.y) }));
        snap.fx.push(o);
      }
      if (g.result) snap.res = { w: g.result.winners.map(p => p.id), reason: g.result.reason };
      this.events = [];
      for (const s of this.seats) if (s.conn && s.conn.open) s.conn.send(snap);
    }

    close() { try { this.peer && this.peer.destroy(); } catch (e) { /* already closed */ } }
  }

  // =====================================================================
  // Client
  // =====================================================================
  class Client {
    constructor(name, code, hooks) {
      this.name = name; this.code = code.toUpperCase().trim();
      this.hooks = hooks;          // { onLobby(seats, you), onStart(game), onEvent(type, d), onError(msg), onClosed() }
      this.game = null;
      this.sel = new Set();
    }

    open() {
      return loadPeerJs().then(() => new Promise((resolve, reject) => {
        this.peer = new Peer();
        const fail = (msg) => { this.hooks.onError && this.hooks.onError(msg); reject(new Error(msg)); };
        this.peer.on('error', (e) => {
          if (e.type === 'peer-unavailable') { const err = new Error('No table found with code ' + this.code + '.'); err.code = 'no-table'; if (!this.quietMissing) this.hooks.onError && this.hooks.onError(err.message); reject(err); return; }
          fail('Network: ' + (e.message || e.type));
        });
        this.peer.on('open', () => {
          const conn = this.conn = this.peer.connect(PREFIX + this.code, { reliable: true, serialization: 'json' });
          conn.on('open', () => { conn.send({ t: 'hello', name: this.name }); resolve(); });
          conn.on('data', (m) => this.onMessage(m));
          conn.on('close', () => this.hooks.onClosed && this.hooks.onClosed());
          conn.on('error', () => this.hooks.onClosed && this.hooks.onClosed());
        });
      }));
    }

    onMessage(m) {
      if (!m || typeof m !== 'object') return;
      if (m.t === 'lobby') { this.seat = m.you; this.hooks.onLobby && this.hooks.onLobby(m.seats, m.you); }
      else if (m.t === 'reject') { this.hooks.onError && this.hooks.onError(m.msg); }
      else if (m.t === 'start') { this.seat = m.you; this.startMirror(m.setup); }
      else if (m.t === 's' && this.game) {
        try { this.applySnap(m); } catch (e) { console.error('[PokerTD] bad snapshot', e); }
      }
    }

    send(a) { if (this.conn && this.conn.open) this.conn.send(Object.assign({ t: 'act' }, a)); }

    requestStart() { if (this.conn && this.conn.open) this.conn.send({ t: 'start' }); }

    // The client keeps a normal Game object as a mirror: its query methods (canDealAt,
    // canCombine, towerAt, ...) work off mirrored state, and its actions are sent to the host.
    startMirror(setup) {
      const g = this.game = new PTD.Game(Object.assign({}, setup, { localSeat: this.seat }));
      g.remote = true;
      g.phase = 'hand';
      const self = this;
      const me = () => g.human;
      g.update = (dt) => self.clientUpdate(dt);
      g.deal = (p, x, y) => { if (!g.canDealAt(p, x, y)) return null; self.send({ a: 'deal', x, y }); p.dealsLeft--; g.map.setOcc(x, y, 1); return true; };   // optimistic; next tower snapshot is authoritative
      g.tip = (p) => { if (!g.canAct(p) || p.dealsLeft < 5) return { ok: false, msg: 'You can only tip before your first card is dealt.' }; if (p.gold <= PTD.RULES.tipCost) return { ok: false, msg: 'You need more than ' + PTD.RULES.tipCost + ' gold to tip.' }; self.send({ a: 'tip' }); return { ok: true }; };
      g.requestNew = (p) => { if (!g.canRequest(p)) return false; self.send({ a: 'swap', sel: g.selected(p).map(t => t.id) }); self.sel.clear(); p.swapped = true; return true; };
      g.combine = (p) => { if (!g.canCombine(p)) return null; const sel = g.selected(p); self.send({ a: 'combine', sel: sel.map(t => t.id), anchor: sel[0].id }); self.sel.clear(); p.combined = true; return true; };
      g.fold = (p) => { if (!g.canFold(p)) return false; self.send({ a: 'fold' }); p.folded = true; return true; };
      g.ready = () => { if (g.phase !== 'hand') return; self.send({ a: 'ready' }); me().ready = true; };
      const baseToggle = g.toggleSelect.bind(g);
      self.selOrderOf = new Map();
      g.toggleSelect = (p, t) => { const ok = baseToggle(p, t); if (ok) { if (t.selected) { self.sel.add(t.id); self.selOrderOf.set(t.id, t.selOrder); } else { self.sel.delete(t.id); self.selOrderOf.delete(t.id); } } return ok; };
      g.towerById = new Map();
      g.creepById = new Map();
      this.hooks.onStart && this.hooks.onStart(g);
    }

    applySnap(s) {
      const g = this.game;
      const prevPhase = g.phase;
      g.phase = s.ph; g.timer = s.tm; g.level = s.lv; g.time = s.time;
      if (s.tw) this.applyTowers(s.tw);
      s.pl.forEach((rec, i) => {
        const p = g.players[i];
        [p.gold] = rec;
        p.alive = !!rec[1]; p.folded = !!rec[2]; p.dealsLeft = rec[3]; p.swapped = !!rec[4]; p.combined = !!rec[5];
        p.tips = rec[6]; p.rating = rec[7]; p.handTitle = rec[8]; p.handWins = rec[9]; p.kills = rec[10]; p.leaks = rec[11];
        p.ready = !!rec[12]; p.human = !!rec[14]; p.name = rec[15];
        p.hand = rec[13].map(id => g.towerById.get(id)).filter(Boolean);
      });
      if (prevPhase !== 'hand' && g.phase === 'hand') this.sel.clear();
      // creeps: keep objects alive across snapshots so projectiles can follow them
      const seen = new Set();
      for (const c of s.cr) {
        const [id, owner, x, y, dir, hp, maxHp, level, bossIdx, flags] = c;
        let o = g.creepById.get(id);
        if (!o) {
          const def = PTD.LEVELS[level - 1];
          o = { id, owner, x, y, tx: x, ty: y, dir: dir / 100, def, level, boss: bossIdx >= 0, bossIdx: bossIdx >= 0 ? bossIdx : null,
            radius: bossIdx >= 0 ? 85 : 42, phaseOff: (id * 1.7) % 6.28, alive: true, slowF: 1, stunT: 0, bleed: false };
          g.creepById.set(id, o);
        }
        o.tx = x; o.ty = y; o.dir = dir / 100; o.hp = hp; o.maxHp = maxHp;
        o.slowF = flags & 1 ? 0.7 : 1; o.stunT = flags & 2 ? 1 : 0; o.bleed = !!(flags & 4); o.wait = flags & 8 ? 1 : 0;
        seen.add(id);
      }
      for (const [id, o] of g.creepById) if (!seen.has(id)) { o.alive = false; g.creepById.delete(id); }
      g.creeps = [...g.creepById.values()];
      for (const f of s.fx) { f.t = 0; g.fx.push(f); }
      for (const e of s.ev) this.replayEvent(e);
      if (s.res && !g.result) g.result = { winners: s.res.w.map(i => g.players[i]), reason: s.res.reason };
    }

    applyTowers(list) {
      const g = this.game;
      const next = new Map();
      for (const rec of list) {
        const [id, owner, x, y, isCombo, sv, rank, inHand, kills, dmg, fresh] = rec;
        let t = g.towerById.get(id);
        if (!t) {
          t = { id, owner, x, y, alive: true, kind: isCombo ? 'combo' : 'card', rank };
          if (isCombo) t.type = sv; else t.suit = sv;
          t.stats = PTD.towerStats(t);
          t.title = t.kind === 'card' ? PTD.cardTitle(t.suit, t.rank) : PTD.comboTitle(t.type, t.rank);
          t.scale = t.kind === 'card' ? 1 : 0.8 + (t.rank / 14) * 0.35;
        }
        t.inHand = !!inHand; t.kills = kills; t.dmgDone = dmg; t.fresh = fresh >= 0 ? fresh : null;
        t.selected = this.sel.has(id) && t.inHand && owner === this.seat;
        t.selOrder = t.selected ? (t.selOrder || this.selOrderOf.get(id) || 0) : 0;
        next.set(id, t);
      }
      for (const [id, t] of g.towerById) if (!next.has(id)) t.alive = false;
      g.towerById = next;
      g.towers = [...next.values()];
      g.map.occ.fill(0);
      for (const t of g.towers) g.map.setOcc(t.x, t.y, 1);
    }

    replayEvent(e) {
      const g = this.game, P = (i) => g.players[i];
      const d = {};
      switch (e.k) {
        case 'handStart': d.round = e.round; d.ante = e.ante; d.def = g.nextLevelDef(); break;
        case 'deal': case 'swap': case 'tip': case 'tipWorked': case 'tipFailed': case 'fold': case 'defeat': d.player = P(e.p); break;
        case 'combine': d.player = P(e.p); d.combo = { type: e.type, title: e.title }; break;
        case 'handResult': d.winners = e.w.map(P); d.bonus = e.bonus; d.title = e.title; break;
        case 'waveStart': { d.level = e.level; d.def = PTD.LEVELS[e.level - 1]; const b = PTD.levelBosses(d.def); d.bosses = b ? b.map(i => PTD.BOSSES[i]) : null; break; }
        case 'kill': d.owner = P(e.o); d.boss = e.boss; d.creep = { bossIdx: e.b }; break;
        case 'leak': d.player = P(e.p); d.loss = e.loss; break;
        case 'bossAttack': {
          const c = g.creepById.get(e.c);
          d.creep = { owner: e.o, bossIdx: e.b };
          d.tower = { owner: e.o };
          if (c) g.shots.push({ x: c.x, y: c.y + 80, sx: c.x, sy: c.y + 80, tx: e.tx, ty: e.ty, speed: 700, fx: 'mortar', arc: true });
          break;
        }
        case 'towerDestroyed': d.tower = { owner: e.o }; break;
        case 'gameOver': d.winners = e.w.map(P); d.reason = e.reason; g.phase = 'over'; g.result = { winners: d.winners, reason: e.reason }; break;
        case 'shot': {
          const t = g.towerById.get(e.tw), c = g.creepById.get(e.c);
          if (t && c && e.fx !== 'chain') {
            const st = t.stats;
            g.shots.push({ x: t.x, y: t.y + 30, target: c, tx: c.x, ty: c.y, speed: st.speed || 900, fx: e.fx, tower: t });
          }
          d.fx = e.fx; d.tower = { owner: t ? t.owner : -1 };
          break;
        }
      }
      this.hooks.onEvent && this.hooks.onEvent(e.k, d);
    }

    // Between snapshots: glide creeps to their latest positions and fly the cosmetic shots.
    clientUpdate(dt) {
      const g = this.game;
      if (g.phase === 'hand' || g.phase === 'intermission') g.timer = Math.max(0, g.timer - dt);
      const k = Math.min(1, dt * SNAP_HZ * 1.2);
      for (const c of g.creeps) { c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; }
      const keep = [];
      for (const sh of g.shots) {
        if (sh.target && sh.target.alive) { sh.tx = sh.target.x; sh.ty = sh.target.y; }
        else if (sh.target && !sh.arc) continue;
        const dx = sh.tx - sh.x, dy = sh.ty - sh.y, d = Math.hypot(dx, dy), step = sh.speed * dt;
        if (d <= step) continue;
        sh.x += dx / d * step; sh.y += dy / d * step;
        keep.push(sh);
      }
      g.shots = keep;
      g.updateFx(dt);
    }

    close() { try { this.peer && this.peer.destroy(); } catch (e) { /* already closed */ } }
  }

  return { Host, Client, loadPeerJs };
})();
