// Cards, deck and hand evaluation.
window.PTD = window.PTD || {};

PTD.Poker = (function () {
  function newDeck(rng) {
    const deck = [];
    for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) deck.push({ suit: s, rank: r });
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  function rating(type, rank) { return type * 60 + rank; }

  // Straight high card for exactly five cards, or 0. Handles the A-2-3-4-5 wheel.
  function straightHigh(ranks) {
    const u = Array.from(new Set(ranks)).sort((a, b) => a - b);
    if (u.length !== 5) return 0;
    if (u[4] - u[0] === 4) return u[4];
    if (u[4] === 14 && u[0] === 2 && u[3] === 5) return 5;
    return 0;
  }

  // Combo formed by exactly these cards, or null. Mirrors the original "Validate" rules:
  // every selected card must be part of the combo.
  function evaluate(cards) {
    const n = cards.length;
    if (n < 2 || n > 5) return null;
    const counts = {};
    for (const c of cards) counts[c.rank] = (counts[c.rank] || 0) + 1;
    const groups = Object.keys(counts).map(Number).map(r => ({ r, c: counts[r] }))
      .sort((a, b) => b.c - a.c || b.r - a.r);
    const ranks = cards.map(c => c.rank);
    let type = 0, rank = 0;
    if (n === 2 && groups.length === 1) { type = 1; rank = groups[0].r; }
    else if (n === 3 && groups.length === 1) { type = 3; rank = groups[0].r; }
    else if (n === 4 && groups.length === 1) { type = 7; rank = groups[0].r; }
    else if (n === 4 && groups.length === 2 && groups[0].c === 2) { type = 2; rank = Math.max(groups[0].r, groups[1].r); }
    else if (n === 5) {
      const flush = cards.every(c => c.suit === cards[0].suit);
      const sh = straightHigh(ranks);
      if (flush && sh) { type = 8; rank = sh; }
      else if (groups.length === 2 && groups[0].c === 3) { type = 6; rank = groups[0].r; }
      else if (flush) { type = 5; rank = Math.max.apply(null, ranks); }
      else if (sh) { type = 4; rank = sh; }
    }
    if (!type) return null;
    return { type, rank, rating: rating(type, rank), title: PTD.comboTitle(type, rank) };
  }

  // Best combo available among any subset of the hand. Returns {combo, idx[]} or null.
  function best(hand) {
    let top = null;
    const n = hand.length;
    for (let mask = 1; mask < (1 << n); mask++) {
      const pick = [], idx = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) { pick.push(hand[i]); idx.push(i); }
      if (pick.length < 2) continue;
      const e = evaluate(pick);
      if (e && (!top || e.rating > top.combo.rating)) top = { combo: e, idx };
    }
    return top;
  }

  // Which cards an AI (or the hint) would throw away. Returns indices, max 4.
  function suggestDiscard(hand) {
    const b = best(hand);
    if (b && b.combo.type >= 4) return [];
    const keep = new Set(b ? b.idx : []);
    if (!b || b.combo.type === 1) {
      // Chasing a flush or straight beats holding a lone pair.
      const bySuit = [[], [], [], []];
      hand.forEach((c, i) => bySuit[c.suit].push(i));
      const four = bySuit.find(s => s.length === 4);
      if (four) return hand.map((_, i) => i).filter(i => four.indexOf(i) < 0);
      const sorted = hand.map((c, i) => ({ r: c.rank, i })).sort((a, b) => a.r - b.r);
      for (let skip = 0; skip < 5; skip++) {
        const rest = sorted.filter((_, k) => k !== skip);
        const u = new Set(rest.map(x => x.r));
        if (u.size === 4 && rest[3].r - rest[0].r === 3) return [sorted[skip].i];
      }
      if (!b) {
        let hi = 0;
        hand.forEach((c, i) => { if (c.rank > hand[hi].rank) hi = i; });
        keep.add(hi);
      }
    }
    const out = [];
    hand.forEach((_, i) => { if (!keep.has(i)) out.push(i); });
    return out.slice(0, 4);
  }

  // Cards forming a given combo type, used when a tipped dealer "helps" a player.
  function makeTipHand(type, rng) {
    const ri = (a, b) => a + Math.floor(rng() * (b - a + 1));
    const suitsShuffled = () => [0, 1, 2, 3].sort(() => rng() - 0.5);
    const rankNot = (ex) => { let r; do { r = ri(2, 14); } while (ex.indexOf(r) >= 0); return r; };
    const cards = [];
    switch (type) {
      case 1: { const r = ri(2, 14), s = suitsShuffled(); cards.push({ suit: s[0], rank: r }, { suit: s[1], rank: r }); break; }
      case 2: { const a = ri(2, 14), b = rankNot([a]); const s1 = suitsShuffled(), s2 = suitsShuffled();
        cards.push({ suit: s1[0], rank: a }, { suit: s1[1], rank: a }, { suit: s2[0], rank: b }, { suit: s2[1], rank: b }); break; }
      case 3: { const r = ri(2, 14), s = suitsShuffled(); for (let i = 0; i < 3; i++) cards.push({ suit: s[i], rank: r }); break; }
      case 4: { const hi = ri(5, 14); for (let i = 0; i < 5; i++) { let r = hi - i; if (r === 1) r = 14; cards.push({ suit: ri(0, 3), rank: r }); }
        if (cards.every(c => c.suit === cards[0].suit)) cards[0].suit = (cards[0].suit + 1) % 4; break; }
      case 5: { const s = ri(0, 3); let used;
        do { used = []; for (let i = 0; i < 5; i++) used.push(rankNot(used)); } while (straightHigh(used));
        for (const r of used) cards.push({ suit: s, rank: r }); break; }
      case 6: { const a = ri(2, 14), b = rankNot([a]); const s1 = suitsShuffled(), s2 = suitsShuffled();
        for (let i = 0; i < 3; i++) cards.push({ suit: s1[i], rank: a }); cards.push({ suit: s2[0], rank: b }, { suit: s2[1], rank: b }); break; }
      case 7: { const r = ri(2, 14); for (let s = 0; s < 4; s++) cards.push({ suit: s, rank: r }); break; }
      case 8: { const hi = ri(5, 14), s = ri(0, 3); for (let i = 0; i < 5; i++) { let r = hi - i; if (r === 1) r = 14; cards.push({ suit: s, rank: r }); } break; }
    }
    return cards;
  }

  return { newDeck, evaluate, best, suggestDiscard, makeTipHand, rating };
})();
