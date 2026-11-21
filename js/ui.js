// HUD, menus, input and the main loop.
(function () {
  const $ = (id) => document.getElementById(id);
  const canvas = $('stage');   // input surface; the active renderer draws into #view (2D) or #view3d
  const A = PTD.Audio;

  let game = null, demo = null, renderer = null, net = null;   // net: PTD.Net.Host or Client while online
  const ui = { shellWarned: 0, ghost: null, hoverTower: null, inspect: null, speed: 1, paused: false, foldArmed: 0, keys: {}, winners: new Set() };
  const settings = { mode: 1, rivals: 3, name: 'You', gfx: 'ultra', invertMouse: true };
  try { Object.assign(settings, JSON.parse(localStorage.getItem('ptd.settings') || '{}')); } catch (e) { /* storage optional */ }
  const saveSettings = () => { try { localStorage.setItem('ptd.settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } };

  // ---------- menu ----------
  function buildSeg(el, items, current, onPick) {
    el.innerHTML = '';
    items.forEach((it) => {
      const b = document.createElement('button');
      b.textContent = it.label;
      if (it.value === current) b.classList.add('on');
      b.onclick = () => { [...el.children].forEach(c => c.classList.remove('on')); b.classList.add('on'); onPick(it.value); };
      el.appendChild(b);
    });
  }
  function refreshModeDesc() { $('mode-desc').textContent = PTD.MODES[settings.mode].desc; }
  buildSeg($('in-mode'), PTD.MODES.map((m, i) => ({ label: m.name, value: i })), settings.mode, v => { settings.mode = v; refreshModeDesc(); });
  buildSeg($('in-rivals'), [0, 1, 2, 3, 4, 5, 6, 7].map(n => ({ label: n ? String(n) : 'Solo', value: n })), settings.rivals, v => { settings.rivals = v; });
  $('in-name').value = settings.name;
  refreshModeDesc();
  const GFX = [{ label: '3D Ultra', value: 'ultra' }, { label: '3D Fast', value: 'fast' }, { label: 'Classic 2D', value: '2d' }];
  buildSeg($('in-gfx'), GFX, settings.gfx, v => { settings.gfx = v; saveSettings(); if (!game) startDemo(); });
  $('in-invert').checked = !!settings.invertMouse;
  $('in-invert').onchange = () => { settings.invertMouse = $('in-invert').checked; saveSettings(); };

  // Picks the renderer for the current graphics setting (falls back to 2D without WebGL2).
  function makeRenderer(g) {
    if (renderer && renderer.dispose) renderer.dispose();
    const use3d = settings.gfx !== '2d' && PTD.Renderer3D && PTD.Renderer3D.supported();
    $('view').classList.toggle('off', use3d);
    $('view3d').classList.toggle('off', !use3d);
    if (!use3d) return new PTD.Renderer($('view'), g);
    PTD.Renderer3D.quality = settings.gfx === 'fast' ? 'low' : 'high';
    return new PTD.Renderer3D($('view3d'), g);
  }

  $('btn-start').onclick = () => {
    A.unlock();
    settings.name = ($('in-name').value || 'You').trim().slice(0, 14);
    saveSettings();
    startGame();
  };
  $('btn-howto').onclick = () => $('guide').classList.remove('hidden');
  $('btn-help').onclick = () => { $('guide').classList.remove('hidden'); };
  $('btn-guide-close').onclick = () => $('guide').classList.add('hidden');
  $('btn-again').onclick = () => { leaveOnline(); $('over').classList.add('hidden'); $('hud').classList.add('hidden'); $('menu').classList.remove('hidden'); startDemo(); };

  function startDemo() {
    game = null;
    demo = new PTD.Game({ allAI: true, rivals: 7, mode: 0, seed: (Math.random() * 1e9) | 0 });
    demo.start();
    renderer = makeRenderer(demo);
    renderer.cam.zoom = renderer.clampZoom(Math.min(renderer.W, renderer.H) / 7000);
  }

  function startGame() {
    beginPlay(new PTD.Game({ mode: settings.mode, rivals: settings.rivals, playerName: settings.name, onEvent }), true);
  }

  // Shared by single player, the online host (start=true) and online clients (mirror, start=false).
  function beginPlay(g, start) {
    demo = null;
    ui.inspect = null; ui.ghost = null; ui.winners = new Set(); ui.speed = 1; ui.paused = false;
    $('btn-speed').textContent = '1x';
    game = g;
    renderer = makeRenderer(game);
    renderer.fitPlayer(game.human);
    PTD.current = { game, renderer, ui };   // handy for debugging from the console
    $('menu').classList.add('hidden');
    $('lobby').classList.add('hidden');
    $('hud').classList.remove('hidden');
    document.body.classList.toggle('online-client', net instanceof PTD.Net.Client);
    if (start) game.start();
    lastHandSig = '';
    // ?test in the address shows level-skip buttons (single player or when hosting)
    $('testbar').classList.toggle('hidden', !/[?&]test(=|&|$)/.test(location.search) || net instanceof PTD.Net.Client);
    A.music.setMood('lounge');
    if (renderer.playIntro) { renderer.playIntro(game.human); banner('BLB Tower Defense', 'Click to skip the fly-in', 3800); }
  }

  // ---------- events from the simulation ----------
  function onEvent(type, d) {
    const me = game && game.human;
    if (renderer && renderer.event && game) renderer.event(type, d);
    switch (type) {
      case 'handStart':
        A.music.setMood('lounge');
        ui.winners = new Set();
        if (d.ante && me && me.alive) { toast('The table pays an ante: +' + d.ante + ' gold'); A.play('coin'); }
        A.play('hand');
        break;
      case 'deal': if (d.player === me) A.play('deal'); break;
      case 'swap': if (d.player === me) A.play('swap'); break;
      case 'combine':
        if (d.player === me) A.play('combine');
        else if (d.combo.type >= 5) toast(d.player.name + ' made ' + d.combo.title + '!');
        break;
      case 'tip': if (d.player === me) A.play('tip'); break;
      case 'tipWorked': if (d.player === me) toast('The dealer winks at you. Something good is coming...'); break;
      case 'tipFailed': if (d.player === me) toast('The dealer pocketed your tip. No luck this time.', true); break;
      case 'handResult': {
        d.winners.forEach(w => ui.winners.add(w.id));
        if (d.winners.length) {
          const names = d.winners.map(w => w === me ? 'You' : w.name).join(' & ');
          const verb = d.winners.length === 1 && d.winners[0] === me ? 'win' : (d.winners.length > 1 ? 'tie' : 'wins');
          banner(names + ' ' + verb + ' the hand', d.title + '  &middot;  +' + d.bonus + ' gold', 2200);
          if (d.winners.indexOf(me) >= 0) A.play('win');
        } else banner('No one won that round', '', 1800);
        break;
      }
      case 'waveStart': {
        A.music.setMood(d.bosses ? 'boss' : 'action');
        if (d.bosses) {
          const faces = d.bosses.map(b => b.image ? '<img class="boss-face" src="' + b.image + '" alt="">' : '').join(' ');
          const hp = Math.round(game.creepHp(d.def) * (d.def.hpEach || 1) * (game.mode.curve ? PTD.RULES.bossHpMult : 1));
          banner(faces + '<div>' + d.bosses.map(b => esc(b.name)).join(' &amp; ') + '</div>', d.bosses[0].title + '  &middot;  ' + fmt(hp) + ' HP' + (d.bosses.length > 1 ? ' each' : '') + (d.def.final ? '  &middot;  destroys towers!' : ''), 1900, true);
          A.play('boss');
          A.clip(d.bosses[0].intro);
        } else {
          banner('Level ' + d.level, 'Here come the ' + d.def.name + '!', 1600);
          A.play('wave');
        }
        break;
      }
      case 'allFolded': toast('Everyone folded. No looters this round.'); break;
      case 'kill':
        if (d.owner === me) A.play('coin');
        if (d.boss && d.owner === me) { const b = PTD.BOSSES[d.creep ? d.creep.bossIdx : -1]; A.clip((b && b.defeat) || 'back-shots'); }
        break;
      case 'leak': if (d.player === me) { A.play('leak'); flashGold(); } break;
      case 'defeat': if (d.player !== me) toast(d.player.name + ' went broke!'); break;
      case 'bossAttack': if (d.creep.owner === me.id && performance.now() > ui.shellWarned) { ui.shellWarned = performance.now() + 8000; A.clip(PTD.BOSS_ATTACK_SFX); toast(PTD.BOSSES[d.creep.bossIdx].name + ' is shelling your towers!', true); } break;
      case 'towerDestroyed': if (d.tower.owner === me.id) A.play('boom'); break;
      case 'gameOver': A.music.setMood('lounge'); setTimeout(() => showOver(d), 900); break;
      case 'shot': if (d.tower.owner === me.id) A.play('shot', d.fx); break;
    }
  }

  // ---------- HUD ----------
  const fmt = (n) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n);
  let bannerTimer = 0;
  function banner(title, sub, ms, boss) {
    const b = $('banner');
    b.innerHTML = '<h2>' + title + '</h2>' + (sub ? '<p>' + sub + '</p>' : '');
    b.classList.toggle('boss', !!boss);
    b.classList.remove('hidden');
    b.style.animation = 'none'; void b.offsetWidth; b.style.animation = '';
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => b.classList.add('hidden'), ms || 2000);
  }
  function toast(msg, bad) {
    const t = document.createElement('div');
    t.className = 'toast' + (bad ? ' bad' : '');
    t.textContent = msg;
    $('toast').appendChild(t);
    setTimeout(() => t.remove(), 3300);
    while ($('toast').children.length > 4) $('toast').firstChild.remove();
  }
  function flashGold() {
    const el = $('tb-gold');
    el.style.color = '#ff5a5a';
    setTimeout(() => { el.style.color = ''; }, 250);
  }

  const PHASE = { hand: 'Play a Hand', spawn: 'Looters!', intermission: 'Wave Cleared', over: 'Game Over', ready: '' };
  let lastHandSig = '', lastLb = 0;

  function levelText(def) {
    if (!def) return 'Final tally';
    const bosses = PTD.levelBosses(def);
    if (bosses) return 'BOSS: ' + bosses.map(i => PTD.BOSSES[i].name).join(' & ') + ' (' + fmt(Math.round(game.creepHp(def) * (def.hpEach || 1) * (game.mode.curve ? PTD.RULES.bossHpMult : 1))) + ' HP' + (bosses.length > 1 ? ' each' : '') + ')';
    const tags = [];
    if (def.immune) tags.push('spell immune');
    if (def.evasion) tags.push('evasive');
    return def.name + ' (' + PTD.RULES.creepsPerLevel + ') · ' + fmt(game.creepHp(def)) + ' HP · leak -' + def.leak + (tags.length ? ' · ' + tags.join(', ') : '');
  }

  // While your boss is on the board, its voice line comes back 5 seconds after it last finished.
  function bossVoice(g, me) {
    const b = g.phase === 'spawn' && g.creeps.find(c => c.boss && c.alive && c.owner === me.id);
    if (!b) { ui.voiceIdle = 0; return; }
    const now = performance.now();
    if (A.busy()) { ui.voiceIdle = now; return; }
    if (!ui.voiceIdle) ui.voiceIdle = now;
    if (now - ui.voiceIdle >= 5000) { A.clip(PTD.BOSSES[b.bossIdx].intro); ui.voiceIdle = now; }
  }

  function updateHud() {
    const g = game, me = g.human;
    bossVoice(g, me);
    const showLevel = g.phase === 'hand' ? g.level + 1 : g.level;
    $('tb-level').textContent = Math.min(30, Math.max(1, showLevel)) + ' / 30';
    $('tb-phase').textContent = ui.paused ? 'Paused' : PHASE[g.phase] || '';
    $('tb-timer').textContent = g.phase === 'hand' ? Math.max(0, Math.ceil(g.timer)) : '';
    $('tb-next-label').textContent = g.phase === 'hand' ? 'Next' : 'Wave';
    $('tb-next').textContent = g.phase === 'hand' ? levelText(g.nextLevelDef()) : levelText(g.levelDef());
    $('tb-gold').textContent = me.gold;

    const now = performance.now();
    if (now - lastLb > 200) { lastLb = now; updateLeaderboard(); }

    const inHand = g.phase === 'hand' && me.alive;
    $('act-tip').disabled = !(inHand && !me.folded && me.dealsLeft === 5 && me.gold > PTD.RULES.tipCost && me.tips < PTD.RULES.tipMax);
    $('act-tip').querySelector('small').textContent = me.tips ? 'T · tipped ' + me.tips + 'x' : 'T · 10 gold';
    $('act-swap').disabled = !g.canRequest(me);
    const combo = g.selectionCombo(me);
    $('act-combine').disabled = !g.canCombine(me);
    $('act-combine').querySelector('small').textContent = combo && g.canCombine(me) ? combo.title : 'C';
    $('act-fold').disabled = !g.canFold(me);
    $('act-fold').querySelector('small').textContent = ui.foldArmed > now ? 'press again!' : 'Esc';
    $('act-ready').disabled = !(g.phase === 'hand' && me.alive && !me.ready);
    $('hint').innerHTML = hintText();
    updateHandCards();
    updateInspect();
  }

  function hintText() {
    const g = game, p = g.human;
    if (!p.alive) return 'You went broke. Watching the rest of the game...';
    if (g.phase === 'spawn') return 'Defend your stash! Kills pay <b>+' + g.levelDef().bounty * (g.mode.bountyMult || 1) + '</b>, each leak costs <b>-' + g.levelDef().leak + '</b> gold.';
    if (g.phase === 'intermission') return 'Wave cleared. Next hand coming up...';
    if (g.phase !== 'hand') return '';
    if (p.ready) return 'Ready! Waiting for the other gamblers...';
    if (p.folded) return 'You folded. No looters for you this round. Press <b>Ready</b>.';
    const carpet = '<b style="color:' + p.color + '">carpet</b>';
    if (p.dealsLeft === 5) return 'Click the felt next to your ' + carpet + ' to deal 5 cards. Want better odds? <b>Tip the dealer</b> first.';
    if (p.dealsLeft > 0) return 'Deal ' + p.dealsLeft + ' more card' + (p.dealsLeft > 1 ? 's' : '') + '. Each card is a tower.';
    if (p.combined) return 'Locked in: <b>' + p.handTitle + '</b>. Press <b>Ready</b> when you\'re set.';
    const combo = g.selectionCombo(p);
    if (combo) return 'Selected <b>' + combo.title + '</b>. Press <b>Combine</b> to turn your whole hand into one tower!';
    const best = PTD.Poker.best(p.hand.map(t => ({ suit: t.suit, rank: t.rank })));
    const holding = best ? ' You\'re holding <b>' + best.combo.title + '</b>.' : '';
    if (!p.swapped) {
      const n = g.selected(p).length;
      // reminder: an uncombined hand keeps only its highest card
      if (n) return 'Press <b>Swap</b> to replace ' + Math.min(4, n) + ' card' + (n > 1 ? 's' : '') + ', or select a poker hand.' + holding;
      return 'Select up to 4 cards to <b>Swap</b>, or select a poker hand to <b>Combine</b> (click cards, or press 1-5).' + holding;
    }
    return best ? 'Select your <b>' + best.combo.title + '</b> and press <b>Combine</b>.' : 'No poker hand this time. Only your highest card will stay as a tower. Press <b>Ready</b>.';
  }

  function updateLeaderboard() {
    const g = game;
    const rows = g.players.slice().sort((a, b) => (b.alive - a.alive) || b.gold - a.gold);
    $('lb-rows').innerHTML = rows.map(p => {
      let sub = '';
      if (!p.alive) sub = 'broke';
      else if (g.phase === 'hand') sub = p.folded ? 'folded' : p.combined ? p.handTitle : p.dealsLeft > 0 ? 'dealing...' : 'thinking...';
      else sub = p.handTitle || '';
      if (ui.winners.has(p.id)) sub = '★ ' + sub;
      const cls = 'lb-row' + (p.human ? ' me' : '') + (p.alive ? '' : ' dead') + (ui.winners.has(p.id) ? ' win' : '');
      return '<div class="' + cls + '"><span class="lb-dot" style="background:' + p.color + '"></span><span class="lb-name">' + esc(p.name) + '</span><span class="lb-gold">' + p.gold + '</span><span class="lb-hand">' + esc(sub) + '</span></div>';
    }).join('');
  }

  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function updateHandCards() {
    const g = game, p = g.human;
    const showHand = g.phase === 'hand' || g.phase === 'spawn' || g.phase === 'intermission';
    const cards = showHand ? p.hand.filter(t => t.alive) : [];
    const sig = cards.map(t => t.id + (t.selected ? 's' : '')).join(',') + '|' + p.dealsLeft + '|' + g.phase;
    if (sig === lastHandSig) return;
    lastHandSig = sig;
    const box = $('hand-cards');
    box.innerHTML = '';
    let n = 0;
    for (const t of cards) {
      const el = document.createElement('div');
      if (t.kind === 'combo') {
        el.className = 'hcard combo';
        el.innerHTML = '<div>Combined<br><b>' + esc(t.title) + '</b></div>';
      } else {
        n++;
        el.className = 'hcard' + (t.selected ? ' sel' : '');
        const cv = document.createElement('canvas');
        cv.width = 128; cv.height = 160;
        const cx = cv.getContext('2d');
        cx.drawImage(PTD.Art.cardSprite(t.suit, t.rank), 0, -4);
        el.appendChild(cv);
        const k = document.createElement('span'); k.className = 'key'; k.textContent = n; el.appendChild(k);
        el.onclick = () => { if (g.toggleSelect(p, t)) { A.play('select'); ui.inspect = t; } };
        el.onmouseenter = () => { ui.hoverTower = t; };
        el.onmouseleave = () => { if (ui.hoverTower === t) ui.hoverTower = null; };
      }
      box.appendChild(el);
    }
    const empty = g.phase === 'hand' && !p.folded ? p.dealsLeft : 0;
    for (let i = 0; i < empty; i++) {
      const el = document.createElement('div');
      el.className = 'hcard empty'; el.textContent = 'deal';
      box.appendChild(el);
    }
  }

  function updateInspect() {
    const t = ui.inspect && ui.inspect.alive ? ui.inspect : null;
    const el = $('inspect');
    if (!t) { el.classList.add('hidden'); return; }
    const s = t.stats, owner = game.players[t.owner];
    const hi = s.base + s.dice * s.sides, lo = s.base + s.dice;
    el.classList.remove('hidden');
    el.innerHTML = '<h4 style="color:' + owner.color + '">' + esc(t.title) + '</h4>' +
      '<div class="row">Owner <b>' + esc(owner.name) + '</b></div>' +
      '<div class="row">Damage <b>' + (s.dice ? lo + '-' + hi : s.base) + '</b></div>' +
      '<div class="row">Attack every <b>' + s.cd + 's</b></div>' +
      '<div class="row">Range <b>' + s.range + '</b></div>' +
      '<div class="row">Kills <b>' + t.kills + '</b> &middot; Damage dealt <b>' + fmt(Math.round(t.dmgDone)) + '</b></div>' +
      '<p>' + s.desc + '</p>';
  }

  function showOver(r) {
    const g = game;
    const me = g.human;
    let title, sub;
    r.humanWon = r.winners.indexOf(me) >= 0;
    if (r.humanWon && g.players.length === 1) { title = 'You beat the house!'; sub = 'You survived all 30 levels with ' + me.gold + ' gold.'; A.play('win'); }
    else if (r.humanWon) { title = 'You broke the bank!'; sub = 'Biggest stash at the table. ' + (r.winners.length > 1 ? '(Shared win.)' : ''); A.play('win'); }
    else if (r.reason === 'broke') { title = 'Busted'; sub = 'The looters cleaned out your stash on level ' + g.level + '.'; A.play('lose'); }
    else { title = 'The house wins'; sub = r.winners.map(w => w.name).join(' & ') + ' finished with the biggest stash.'; A.play('lose'); }
    $('over-title').textContent = title;
    $('over-sub').textContent = sub;
    const rows = g.players.slice().sort((a, b) => b.gold - a.gold);
    $('over-table').innerHTML = '<tr><th>#</th><th>Gambler</th><th>Gold</th><th>Hands won</th><th>Kills</th><th>Leaks</th></tr>' +
      rows.map((p, i) => '<tr' + (p === me ? ' style="background:rgba(255,255,255,0.06)"' : '') + '><td>' + (i + 1) + '</td><td><span class="lb-dot" style="display:inline-block;background:' + p.color + '"></span> ' + esc(p.name) + (p.alive ? '' : ' (broke)') + '</td><td class="g">' + p.gold + '</td><td>' + p.handWins + '</td><td>' + p.kills + '</td><td>' + p.leaks + '</td></tr>').join('');
    $('over').classList.remove('hidden');
  }

  // ---------- actions ----------
  function act(name) {
    if (!game || ui.paused) return;
    const g = game, me = g.human;
    let ok = false;
    switch (name) {
      case 'tip': { const r = g.tip(me); ok = r.ok; if (!ok) toast(r.msg, true); break; }
      case 'swap': ok = g.requestNew(me); break;
      case 'combine': ok = !!g.combine(me); break;
      case 'fold': {
        if (!g.canFold(me)) break;
        const now = performance.now();
        if (ui.foldArmed > now) { ok = g.fold(me); ui.foldArmed = 0; if (ok) toast('You folded this hand.'); }
        else { ui.foldArmed = now + 2000; toast('Press Fold again to throw away this hand and skip the round.'); return; }
        break;
      }
      case 'ready': ok = g.phase === 'hand'; g.ready(me); break;
    }
    if (!ok) A.play('error');
  }
  $('act-tip').onclick = () => act('tip');
  $('act-swap').onclick = () => act('swap');
  $('act-combine').onclick = () => act('combine');
  $('act-fold').onclick = () => act('fold');
  $('act-ready').onclick = () => act('ready');

  const SPEEDS = [1, 2, 3];
  function cycleSpeed(dir) {
    const i = SPEEDS.indexOf(ui.speed);
    ui.speed = SPEEDS[Math.max(0, Math.min(SPEEDS.length - 1, i + dir))];
    $('btn-speed').textContent = ui.speed + 'x';
  }
  $('btn-speed').onclick = () => { ui.speed = ui.speed === 3 ? 1 : ui.speed + 1; $('btn-speed').textContent = ui.speed + 'x'; };
  $('btn-pause').onclick = () => { ui.paused = !ui.paused; };
  function showSound(st) {
    const b = $('btn-mute');
    b.style.opacity = st === 'off' ? 0.4 : 1;
    b.innerHTML = st === 'all' ? '&#9835;' : st === 'sfx' ? '&#128264;' : '&#128263;';
    b.title = { all: 'Music and sound on (M)', sfx: 'Sound effects only (M)', off: 'Muted (M)' }[st];
  }
  $('btn-mute').onclick = () => { A.unlock(); const st = A.cycle(); settings.sound = st; saveSettings(); showSound(st); };
  if (settings.sound) A.setState(settings.sound);
  showSound(A.state);
  $('btn-center').onclick = () => { if (game) renderer.fitPlayer(game.human); };

  // ---------- test tools ----------
  document.querySelectorAll('#testbar [data-lvl]').forEach(b => {
    b.onclick = () => { if (!game || game.remote) return; game.jumpTo(+b.dataset.lvl); toast('Jumped to the hand before level ' + b.dataset.lvl + '. Press Ready to start it.'); };
  });
  $('test-next').onclick = () => { if (game && !game.remote) { game.jumpTo(Math.min(30, game.level + (game.phase === 'hand' ? 2 : 1))); toast('Skipped ahead to level ' + (game.level + 1) + '.'); } };
  $('test-gold').onclick = () => { if (game && !game.remote) { game.human.gold += 500; A.play('coin'); } };

  // ---------- pointer ----------
  const drag = { down: false, button: 0, sx: 0, sy: 0, moved: false, camX: 0, camY: 0 };
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  canvas.addEventListener('pointerdown', e => {
    A.unlock();
    drag.down = true; drag.button = e.button; drag.sx = e.clientX; drag.sy = e.clientY; drag.moved = false;
    drag.camX = renderer.cam.x; drag.camY = renderer.cam.y; drag.lx = e.clientX; drag.ly = e.clientY;
    if (renderer.skipIntro) renderer.skipIntro();
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (drag.down) {
      const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
      if (!drag.moved && Math.hypot(dx, dy) > 6) drag.moved = true;
      if (drag.moved) {
        const inv = settings.invertMouse ? -1 : 1;
        const mx = (e.clientX - drag.lx) * inv, my = (e.clientY - drag.ly) * inv;
        if (drag.button === 2 && renderer.rotateBy) renderer.rotateBy(mx * 0.006, -my * 0.12);
        else if (renderer.panBy) renderer.panBy(mx, my);
        else { renderer.cam.x = drag.camX - dx * inv / renderer.cam.zoom; renderer.cam.y = drag.camY + dy * inv / renderer.cam.zoom; }
      }
      drag.lx = e.clientX; drag.ly = e.clientY;
    }
    hover(e.clientX, e.clientY);
  });
  canvas.addEventListener('pointerup', e => {
    if (drag.down && !drag.moved && drag.button === 0) click(e.clientX, e.clientY);
    drag.down = false;
  });
  canvas.addEventListener('pointerleave', () => { ui.ghost = null; ui.hoverTower = null; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); renderer.zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });

  function hover(sx, sy) {
    if (!game) return;
    const w = renderer.screenToWorld(sx, sy);
    const g = game, me = g.human;
    const t = (renderer.pickTower && renderer.pickTower(sx, sy)) || g.towerAt(w.x, w.y);
    ui.hoverTower = t;
    if (g.phase === 'hand' && me.alive && !me.folded && me.dealsLeft > 0 && !t) {
      const s = g.map.snap(w.x, w.y);
      ui.ghost = { x: s.x, y: s.y, ok: g.canDealAt(me, s.x, s.y) };
    } else ui.ghost = null;
  }

  function click(sx, sy) {
    if (!game || ui.paused) return;
    const g = game, me = g.human;
    const w = renderer.screenToWorld(sx, sy);
    const t = (renderer.pickTower && renderer.pickTower(sx, sy)) || g.towerAt(w.x, w.y);
    if (t) {
      if (t.owner === me.id && t.inHand && g.toggleSelect(me, t)) A.play('select');
      ui.inspect = t;
      return;
    }
    ui.inspect = null;
    if (g.phase === 'hand' && me.alive && !me.folded && me.dealsLeft > 0) {
      const s = g.map.snap(w.x, w.y);
      if (g.deal(me, s.x, s.y)) hover(sx, sy);
      else { A.play('error'); toast("Can't deal there. Use open felt, not the carpet.", true); }
    }
  }

  // ---------- keyboard ----------
  window.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    ui.keys[e.key.toLowerCase()] = true;
    if (!game) return;
    const k = e.key.toLowerCase();
    if (renderer.skipIntro) renderer.skipIntro();
    if (k === ' ') { e.preventDefault(); act('ready'); }
    else if (k === 'r') act('swap');
    else if (k === 'c') act('combine');
    else if (k === 't') act('tip');
    else if (k === 'escape') { if (!$('guide').classList.contains('hidden')) $('guide').classList.add('hidden'); else act('fold'); }
    else if (k === 'p') ui.paused = !ui.paused;
    else if (k === 'm') $('btn-mute').onclick();
    else if (k === 'h') renderer.fitPlayer(game.human);
    else if (k === '+' || k === '=') cycleSpeed(1);
    else if (k === '-') cycleSpeed(-1);
    else if (k >= '1' && k <= '5') {
      const cards = game.human.hand.filter(t => t.alive && t.kind === 'card');
      const t = cards[+k - 1];
      if (t && game.toggleSelect(game.human, t)) { A.play('select'); ui.inspect = t; }
    }
  });
  window.addEventListener('keyup', e => { ui.keys[e.key.toLowerCase()] = false; });
  window.addEventListener('resize', () => renderer && renderer.resize());

  // ---------- online ----------
  const PUBLIC_TABLE = 'TABLE';
  const onlineOpts = { mode: 1, bots: 2 };
  buildSeg($('in-mode-online'), PTD.MODES.map((m, i) => ({ label: m.name, value: i })), onlineOpts.mode, v => { onlineOpts.mode = v; });

  function leaveOnline() {
    if (net) net.close();
    net = null;
    document.body.classList.remove('online-client');
  }

  function backToMenu() {
    leaveOnline();
    $('lobby').classList.add('hidden');
    $('hud').classList.add('hidden');
    $('menu').classList.remove('hidden');
    if (game) startDemo();
  }

  function playerName(fromJoin) {
    const v = (fromJoin ? $('in-name-join').value : $('in-name').value) || settings.name || 'You';
    settings.name = v.trim().slice(0, 14);
    $('in-name').value = $('in-name-join').value = settings.name;
    saveSettings();
    return settings.name;
  }

  function inviteLink(code) {
    if (location.protocol === 'file:') return '';
    return location.origin + location.pathname + '?table=' + code;
  }

  // view: 'join' (code entry), 'room' (seated at a table)
  function lobbyShow(view, isHost, code) {
    $('menu').classList.add('hidden');
    $('lobby').classList.remove('hidden');
    $('lobby-join').classList.toggle('hidden', view !== 'join');
    $('lobby-room').classList.toggle('hidden', view !== 'room');
    $('lobby-host-opts').classList.toggle('hidden', !isHost);
    $('lobby-wait').classList.toggle('hidden', view !== 'room' || isHost);
    $('lobby-status').textContent = '';
    if (code) {
      $('lobby-code').textContent = code;
      const link = inviteLink(code);
      $('btn-copy-link').classList.toggle('hidden', !link);
      $('lobby-help').innerHTML = code === PUBLIC_TABLE
        ? 'This is the public table. Friends who press <b>Play Online</b> land here too.'
        : 'Send friends the invite link' + (link ? '' : ' (works once the game is online)') + ', or the code. They press <b>Join with Code</b> and type it in.';
    }
  }

  function renderSeats(seats, you, isHost) {
    $('lobby-seats').innerHTML = '';
    seats.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'seat';
      const tags = [];
      if (i === 0) tags.push('host');
      if (i === you) tags.push('you');
      row.innerHTML = '<span class="lb-dot" style="background:' + PTD.PLAYERS[i].color + '"></span><span>' + esc(s.name) + '</span><span class="tag">' + tags.join(' &middot; ') + '</span>';
      if (isHost && i > 0) {
        const k = document.createElement('button');
        k.textContent = 'Remove';
        k.onclick = () => net.kick(i);
        row.appendChild(k);
      }
      $('lobby-seats').appendChild(row);
    });
    $('lobby-count').textContent = seats.length + (seats.length === 1 ? ' gambler' : ' gamblers') + ' at the table';
    if (isHost) {
      const free = 8 - seats.length;
      onlineOpts.bots = Math.min(onlineOpts.bots, free);
      buildSeg($('in-bots'), Array.from({ length: free + 1 }, (_, n) => ({ label: String(n), value: n })), onlineOpts.bots, v => { onlineOpts.bots = v; });
    }
  }

  function hostTable(code) {
    A.unlock();
    leaveOnline();
    lobbyShow('room', true, code || '.....');
    $('lobby-title').textContent = code === PUBLIC_TABLE ? 'Public Table' : 'Your Table';
    $('lobby-status').textContent = 'Opening the table...';
    const host = net = new PTD.Net.Host(playerName(), {
      onLobby: (seats) => renderSeats(seats, 0, true),
      onError: (msg) => { $('lobby-status').textContent = msg; },
      onEvent: (t, d) => onEvent(t, d),
      onDrop: (name) => toast(name + ' disconnected. A computer took their seat.', true),
      onStartRequest: () => startHosted(),
    }, code);
    return host.open().then((c) => {
      lobbyShow('room', true, c);
      renderSeats(host.lobbyInfo(), 0, true);
    });
  }

  function startHosted() {
    if (!(net instanceof PTD.Net.Host) || net.game) return;
    beginPlay(net.start({ mode: onlineOpts.mode, bots: onlineOpts.bots }), true);
  }

  function joinTable(code, fromJoin) {
    A.unlock();
    leaveOnline();
    $('lobby-status').textContent = 'Connecting...';
    const client = net = new PTD.Net.Client(playerName(fromJoin), code, {
      onLobby: (seats, you) => {
        lobbyShow('room', false, code);
        $('lobby-title').textContent = code === PUBLIC_TABLE ? 'Public Table' : 'At the Table';
        renderSeats(seats, you, false);
      },
      onStart: (g) => { g.onEvent = onEvent; beginPlay(g, false); },
      onEvent: (t, d) => onEvent(t, d),
      onError: (msg) => { $('lobby-status').textContent = msg; },
      onClosed: () => {
        if (net !== client) return;
        if (game) { banner('The host left the game', 'Back to the menu in a moment...', 3000); setTimeout(backToMenu, 3000); }
        else $('lobby-status').textContent = 'Lost connection to the host.';
      },
    });
    return client.open();
  }

  // Public table: the first person to arrive hosts it, everyone after joins.
  $('btn-public').onclick = () => {
    lobbyShow('room', false, PUBLIC_TABLE);
    $('lobby-title').textContent = 'Public Table';
    $('lobby-status').textContent = 'Finding the table...';
    const attempt = joinTable(PUBLIC_TABLE);
    net.quietMissing = true;
    attempt.catch((e) => {
      if (e && e.code === 'no-table') return hostTable(PUBLIC_TABLE).catch((e2) => { $('lobby-status').textContent = e2.message || 'Could not open the table.'; });
    });
  };
  $('btn-host').onclick = () => { hostTable().catch((e) => { $('lobby-status').textContent = e.message || 'Could not open the table.'; }); };
  $('btn-join').onclick = () => {
    leaveOnline();
    lobbyShow('join');
    $('lobby-title').textContent = 'Join with Code';
    $('in-name-join').value = settings.name;
    $('in-code').value = '';
    setTimeout(() => $('in-code').focus(), 50);
  };
  $('btn-join-go').onclick = () => {
    const code = $('in-code').value.trim().toUpperCase();
    if (code.length !== 5) { $('lobby-status').textContent = 'Room codes are 5 letters.'; return; }
    joinTable(code, true).catch(() => { /* onError shows the reason */ });
  };
  $('in-code').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btn-join-go').onclick(); });
  $('btn-lobby-start').onclick = () => {
    if (net instanceof PTD.Net.Host) startHosted();
    else if (net instanceof PTD.Net.Client) { net.requestStart(); $('lobby-status').textContent = 'Asked the host to start...'; }
  };
  $('btn-guest-start').onclick = $('btn-lobby-start').onclick;

  const copy = (text, btn, label) => {
    try { navigator.clipboard.writeText(text); btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = label; }, 1500); } catch (e) { /* clipboard blocked */ }
  };
  $('btn-copy').onclick = () => copy($('lobby-code').textContent, $('btn-copy'), 'Copy code');
  $('btn-copy-link').onclick = () => copy(inviteLink($('lobby-code').textContent), $('btn-copy-link'), 'Copy invite link');
  $('btn-lobby-leave').onclick = backToMenu;

  // Opening an invite link (?table=CODE) goes straight to the join screen with the code filled in.
  function autoJoinFromLink() {
    const m = /[?&]table=([A-Za-z0-9]{5})/.exec(location.search);
    if (!m) return;
    $('btn-join').onclick();
    $('in-code').value = m[1].toUpperCase();
    setTimeout(() => $('in-name-join').focus(), 60);
  }

  // ---------- loop ----------
  // Simulation and drawing are split: drawing runs on animation frames, while the
  // simulation can also be driven by a worker timer so an online host keeps the game
  // running for everyone when its tab is in the background (rAF stops there).
  let lastSim = performance.now();
  function simulate(now) {
    const dt = Math.min(0.05, (now - lastSim) / 1000);
    lastSim = now;
    const g = game || demo;
    if (!g) return dt;
    if (!ui.paused || !game) {
      const steps = !game ? 2 : (net instanceof PTD.Net.Client ? 1 : ui.speed);
      for (let i = 0; i < steps; i++) g.update(dt);
    }
    if (net instanceof PTD.Net.Host) net.tick(dt);
    if (demo && demo.phase === 'over') startDemo();
    return dt;
  }

  try {
    const src = 'setInterval(function(){postMessage(0)},33)';
    const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    worker.onmessage = () => {
      if (!(net instanceof PTD.Net.Host) || !document.hidden) return;
      const now = performance.now();
      // catch up in 50 ms slices so long gaps don't skip collisions
      while (now - lastSim > 60) simulate(lastSim + 50);
      simulate(now);
    };
  } catch (e) { /* no workers: the host just has to keep the tab visible */ }

  function frame(now) {
    const dt = simulate(now);
    const g = game || demo;
    if (g) {
      const pan = 900 * dt / Math.max(0.3, renderer.cam.zoom * 4);
      if (game && renderer.panBy) {
        const px = 900 * dt;
        if (ui.keys['a'] || ui.keys['arrowleft']) renderer.panBy(px, 0);
        if (ui.keys['d'] || ui.keys['arrowright']) renderer.panBy(-px, 0);
        if (ui.keys['w'] || ui.keys['arrowup']) renderer.panBy(0, px);
        if (ui.keys['s'] || ui.keys['arrowdown']) renderer.panBy(0, -px);
        if (ui.keys['q']) renderer.rotateBy(dt * 1.4, 0);
        if (ui.keys['e']) renderer.rotateBy(-dt * 1.4, 0);
      } else if (game) {
        if (ui.keys['a'] || ui.keys['arrowleft']) renderer.cam.x -= pan;
        if (ui.keys['d'] || ui.keys['arrowright']) renderer.cam.x += pan;
        if (ui.keys['w'] || ui.keys['arrowup']) renderer.cam.y += pan;
        if (ui.keys['s'] || ui.keys['arrowdown']) renderer.cam.y -= pan;
      } else {
        const t = now / 1000;
        renderer.cam.x = Math.sin(t * 0.05) * 2600; renderer.cam.y = Math.cos(t * 0.037) * 2600;
        if (renderer.rotateBy) renderer.cam.yaw = t * 0.06;   // slow orbit behind the menu
      }
      renderer.draw(game ? ui : {});
      if (game) updateHud();
    }
    requestAnimationFrame(frame);
  }

  startDemo();
  requestAnimationFrame(frame);
  autoJoinFromLink();
})();
