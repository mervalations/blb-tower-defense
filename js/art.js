// Original procedural art: board, card towers, chip-stack combo towers, looters, bosses.
window.PTD = window.PTD || {};

PTD.Art = (function () {
  const cache = {};

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (v) => Math.max(0, Math.min(255, Math.round(amt < 0 ? v * (1 + amt) : v + (255 - v) * amt)));
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }

  // ---------- card tower (sprite is 128x160 px; drawn at 100x125 world units) ----------
  function cardSprite(suit, rank) {
    const key = 'c' + suit + '_' + rank;
    if (cache[key]) return cache[key];
    const S = PTD.SUITS[suit], lab = PTD.RANK_LABEL[rank];
    const c = canvas(128, 160), x = c.getContext('2d');
    // shadow
    x.fillStyle = 'rgba(0,0,0,0.35)';
    x.beginPath(); x.ellipse(66, 146, 54, 12, 0, 0, Math.PI * 2); x.fill();
    // card body
    rr(x, 10, 6, 108, 140, 12);
    x.fillStyle = '#fbf8f1'; x.fill();
    x.lineWidth = 4; x.strokeStyle = S.color; x.stroke();
    rr(x, 18, 14, 92, 124, 8);
    x.lineWidth = 1.5; x.strokeStyle = shade(S.color, 0.55); x.stroke();
    // corner index
    x.fillStyle = S.ink; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold ' + (lab.length > 1 ? 26 : 30) + 'px Georgia, serif';
    x.fillText(lab, 33, 32);
    x.font = '22px Georgia, serif'; x.fillText(S.sym, 33, 56);
    x.save(); x.translate(95, 120); x.rotate(Math.PI);
    x.font = 'bold ' + (lab.length > 1 ? 26 : 30) + 'px Georgia, serif'; x.fillText(lab, 0, -8);
    x.restore();
    // centre pip
    x.font = '64px Georgia, serif'; x.fillStyle = S.color;
    x.fillText(S.sym, 66, 86);
    cache[key] = c;
    return c;
  }

  const COMBO_TAG = [null, 'PAIR', '2 PAIR', 'TRIPS', 'STRAIGHT', 'FLUSH', 'FULL', 'QUADS', 'ROYAL'];

  // ---------- combo tower: a stack of casino chips (sprite 160x180) ----------
  function comboSprite(type, rank) {
    const key = 'k' + type + '_' + rank;
    if (cache[key]) return cache[key];
    const col = PTD.COMBOS[type].color;
    const c = canvas(160, 180), x = c.getContext('2d');
    const cx = 80, layers = 2 + Math.min(6, type);
    x.fillStyle = 'rgba(0,0,0,0.4)';
    x.beginPath(); x.ellipse(cx + 4, 160, 66, 18, 0, 0, Math.PI * 2); x.fill();
    for (let i = 0; i < layers; i++) {
      const y = 150 - i * 9;
      x.fillStyle = shade(col, -0.35);
      x.beginPath(); x.ellipse(cx, y + 4, 60, 17, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = i % 2 ? shade(col, -0.1) : col;
      x.beginPath(); x.ellipse(cx, y, 60, 17, 0, 0, Math.PI * 2); x.fill();
      // edge stripes
      x.strokeStyle = 'rgba(255,255,255,0.85)'; x.lineWidth = 3;
      for (let k = 0; k < 6; k++) {
        const a = (k / 6) * Math.PI + 0.25;
        const ex = cx + Math.cos(a) * 60, ey = y + Math.sin(a) * 17;
        x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex, ey + 4); x.stroke();
      }
    }
    const top = 150 - (layers - 1) * 9;
    // top face
    x.fillStyle = col;
    x.beginPath(); x.ellipse(cx, top, 60, 17, 0, 0, Math.PI * 2); x.fill();
    x.save();
    x.translate(cx, top); x.scale(1, 17 / 60);
    x.strokeStyle = 'rgba(255,255,255,0.9)'; x.lineWidth = 7; x.setLineDash([14, 12]);
    x.beginPath(); x.arc(0, 0, 52, 0, Math.PI * 2); x.stroke();
    x.setLineDash([]);
    x.fillStyle = shade(col, 0.25);
    x.beginPath(); x.arc(0, 0, 38, 0, Math.PI * 2); x.fill();
    x.restore();
    // floating medallion with rank
    const my = top - 34;
    x.fillStyle = 'rgba(0,0,0,0.25)';
    x.beginPath(); x.arc(cx + 3, my + 4, 30, 0, Math.PI * 2); x.fill();
    const g = x.createRadialGradient(cx - 10, my - 10, 4, cx, my, 30);
    g.addColorStop(0, type === 8 ? '#fff6c4' : '#ffffff');
    g.addColorStop(1, type === 8 ? '#e0a800' : shade(col, 0.6));
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, my, 30, 0, Math.PI * 2); x.fill();
    x.lineWidth = 4; x.strokeStyle = type === 8 ? '#a87b00' : shade(col, -0.3); x.stroke();
    x.fillStyle = type === 8 ? '#6b4b00' : shade(col, -0.45);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 30px Georgia, serif';
    x.fillText(PTD.RANK_LABEL[rank], cx, my + 1);
    if (type === 8) {
      // crown
      x.fillStyle = '#ffd43b'; x.strokeStyle = '#a87b00'; x.lineWidth = 2;
      x.beginPath();
      x.moveTo(cx - 24, my - 30); x.lineTo(cx - 24, my - 50); x.lineTo(cx - 12, my - 38);
      x.lineTo(cx, my - 56); x.lineTo(cx + 12, my - 38); x.lineTo(cx + 24, my - 50); x.lineTo(cx + 24, my - 30);
      x.closePath(); x.fill(); x.stroke();
    }
    // tag ribbon
    const tag = COMBO_TAG[type];
    x.font = 'bold 15px Arial, sans-serif';
    const tw = x.measureText(tag).width + 16;
    rr(x, cx - tw / 2, 160, tw, 19, 6);
    x.fillStyle = 'rgba(15,15,20,0.85)'; x.fill();
    x.fillStyle = type === 8 ? '#ffd43b' : '#ffffff';
    x.fillText(tag, cx, 170);
    cache[key] = c;
    return c;
  }

  // ---------- board ----------
  // Renders the whole map into one canvas at `upp` world units per pixel.
  function boardCanvas(map, players, upp) {
    const px = Math.round(map.size * map.cell / upp);
    const c = canvas(px, px), x = c.getContext('2d');
    const img = x.createImageData(px, px), d = img.data;
    const cellPx = map.cell / upp, N = map.size;
    const g = map.grid;
    const at = (cx, cy) => (cx < 0 || cy < 0 || cx >= N || cy >= N) ? 2 : g[cy * N + cx];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let py = 0; py < px; py++) {
      const wy = (px - 1 - py) * upp + map.origin;          // screen row 0 = top of map
      const cy = Math.floor((wy - map.origin) / map.cell);
      for (let pxl = 0; pxl < px; pxl++) {
        const wx = pxl * upp + map.origin;
        const cx = Math.floor((wx - map.origin) / map.cell);
        const v = at(cx, cy);
        const n = rnd() * 10 - 5;
        let r, gg, b;
        if (v === 0) {
          // casino felt with a faint diamond lattice
          const lat = ((Math.abs(((wx + wy) % 512 + 512) % 512 - 256) < 6) || (Math.abs(((wx - wy) % 512 + 512) % 512 - 256) < 6)) ? 8 : 0;
          r = 52 + n + lat; gg = 150 + n + lat * 1.5; b = 82 + n + lat;
        } else if (v === 1) {
          // carpet runner; gold trim where it meets the felt
          const fx = (wx - map.origin) / map.cell - cx, fy = (wy - map.origin) / map.cell - cy;
          const edge = (fx < 0.22 && at(cx - 1, cy) === 0) || (fx > 0.78 && at(cx + 1, cy) === 0) ||
                       (fy < 0.22 && at(cx, cy - 1) === 0) || (fy > 0.78 && at(cx, cy + 1) === 0);
          if (edge) { r = 214 + n; gg = 170 + n; b = 72 + n; }
          else {
            const pat = ((Math.floor(wx / 64) + Math.floor(wy / 64)) & 1) ? 5 : 0;
            r = 46 + n * 0.5 + pat; gg = 42 + n * 0.5 + pat; b = 50 + n * 0.5 + pat;
          }
        } else {
          const centre = Math.abs(wx) < 700 && Math.abs(wy) < 700;
          if (centre) { r = 60 + n; gg = 48 + n; b = 30 + n; }
          else { const grain = Math.sin(wy * 0.02 + Math.sin(wx * 0.003) * 3) * 4; r = 38 + n * 0.6 + grain; gg = 26 + n * 0.5 + grain * 0.7; b = 22 + n * 0.5 + grain * 0.5; }
        }
        const i = (py * px + pxl) * 4;
        d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
    const toPx = (wx, wy) => [(wx - map.origin) / upp, px - (wy - map.origin) / upp];
    // vignette
    const vg = x.createRadialGradient(px / 2, px / 2, px * 0.2, px / 2, px / 2, px * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)');
    x.fillStyle = vg; x.fillRect(0, 0, px, px);
    // lane colour runners
    for (const p of players) {
      x.save();
      x.strokeStyle = p.color; x.globalAlpha = 0.5; x.lineWidth = 64 * (128 + 64 * (PTD.RULES.roadWiden || 0)) / 192 / upp; x.lineJoin = 'round'; x.lineCap = 'round';
      x.beginPath();
      p.lane.path.forEach((pt, i) => { const q = toPx(pt.x, pt.y); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); });
      x.stroke();
      x.globalAlpha = 0.9; x.strokeStyle = '#ffffff'; x.setLineDash([30 / upp, 130 / upp]); x.lineWidth = 10 / upp;
      x.stroke();
      x.restore();
      // spawn door
      const s = toPx(p.lane.path[0].x, p.lane.path[0].y);
      x.fillStyle = p.color; x.globalAlpha = 0.9;
      x.beginPath(); x.arc(s[0], s[1], 90 / upp, 0, Math.PI * 2); x.fill();
      x.globalAlpha = 1; x.fillStyle = '#111';
      x.beginPath(); x.arc(s[0], s[1], 60 / upp, 0, Math.PI * 2); x.fill();
    }
    // the vault
    const v = toPx(0, 0), R = 420 / upp;
    const vgd = x.createRadialGradient(v[0] - R * 0.3, v[1] - R * 0.3, R * 0.1, v[0], v[1], R);
    vgd.addColorStop(0, '#fff1b8'); vgd.addColorStop(0.6, '#d4a62a'); vgd.addColorStop(1, '#7a5a10');
    x.fillStyle = vgd; x.beginPath(); x.arc(v[0], v[1], R, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#5a400a'; x.lineWidth = 20 / upp; x.stroke();
    x.lineWidth = 14 / upp;
    for (let k = 0; k < 8; k++) {
      const a = k * Math.PI / 4;
      x.beginPath(); x.moveTo(v[0] + Math.cos(a) * R * 0.25, v[1] + Math.sin(a) * R * 0.25);
      x.lineTo(v[0] + Math.cos(a) * R * 0.8, v[1] + Math.sin(a) * R * 0.8); x.stroke();
    }
    x.fillStyle = '#5a400a'; x.beginPath(); x.arc(v[0], v[1], R * 0.22, 0, Math.PI * 2); x.fill();
    x.fillStyle = '#ffe48a'; x.font = 'bold ' + Math.round(140 / upp) + 'px Georgia, serif';
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('$', v[0], v[1] + 4 / upp);
    return { canvas: c, upp, px };
  }

  // ---------- looters ----------
  function drawLooter(x, c, time) {
    const look = c.def.look || ['#888', '#fff', ''];
    const body = look[0], acc = look[1], kind = look[2];
    const R = c.radius;
    const bob = Math.sin(time * 10 + c.phaseOff) * R * 0.08;
    const face = Math.cos(c.dir) >= 0 ? 1 : -1;
    x.save();
    x.translate(c.x, c.y);
    x.scale(1, -1);                    // world y up -> draw y down
    // shadow
    x.fillStyle = 'rgba(0,0,0,0.35)';
    x.beginPath(); x.ellipse(0, R * 0.85, R * 0.9, R * 0.3, 0, 0, Math.PI * 2); x.fill();
    x.translate(0, bob);
    if (c.slowF < 1) { x.fillStyle = 'rgba(140,210,255,0.35)'; x.beginPath(); x.arc(0, 0, R * 1.25, 0, Math.PI * 2); x.fill(); }
    // loot sack
    x.fillStyle = '#c8a46a';
    x.beginPath(); x.arc(-face * R * 0.75, -R * 0.1, R * 0.5, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#7a5a2c'; x.lineWidth = R * 0.08; x.stroke();
    x.fillStyle = '#7a5a2c'; x.font = 'bold ' + Math.round(R * 0.55) + 'px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('$', -face * R * 0.75, -R * 0.08);
    // body
    if (kind === 'wings') {
      x.fillStyle = shade(acc, -0.1);
      x.beginPath(); x.ellipse(-R * 0.7, -R * 0.4, R * 0.6, R * 0.35, -0.5, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.ellipse(R * 0.7, -R * 0.4, R * 0.6, R * 0.35, 0.5, 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = body;
    x.beginPath(); x.ellipse(0, 0, R * 0.78, R * 0.85, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = shade(body, -0.4); x.lineWidth = R * 0.07; x.stroke();
    x.fillStyle = shade(body, 0.35);
    x.beginPath(); x.ellipse(0, R * 0.25, R * 0.45, R * 0.42, 0, 0, Math.PI * 2); x.fill();
    // accessories
    x.fillStyle = acc; x.strokeStyle = shade(acc, -0.4); x.lineWidth = R * 0.05;
    switch (kind) {
      case 'ears':
        for (const s of [-1, 1]) { x.fillStyle = body; x.beginPath(); x.ellipse(s * R * 0.48, -R * 0.78, R * 0.25, R * 0.32, s * 0.4, 0, Math.PI * 2); x.fill();
          x.fillStyle = acc; x.beginPath(); x.ellipse(s * R * 0.48, -R * 0.76, R * 0.13, R * 0.19, s * 0.4, 0, Math.PI * 2); x.fill(); }
        break;
      case 'mask':
        x.fillStyle = acc; rr(x, -R * 0.66, -R * 0.42, R * 1.32, R * 0.32, R * 0.14); x.fill(); break;
      case 'hat':
        x.fillStyle = acc; x.fillRect(-R * 0.85, -R * 0.82, R * 1.7, R * 0.16);
        rr(x, -R * 0.48, -R * 1.35, R * 0.96, R * 0.6, R * 0.1); x.fill(); break;
      case 'hood':
        x.fillStyle = acc; x.globalAlpha = 0.9; x.beginPath(); x.arc(0, -R * 0.2, R * 0.86, Math.PI, 0); x.fill(); x.globalAlpha = 1; break;
      case 'helm':
        x.fillStyle = acc; x.beginPath(); x.arc(0, -R * 0.3, R * 0.8, Math.PI, 0); x.fill();
        x.fillRect(-R * 0.08, -R * 1.25, R * 0.16, R * 0.3); break;
      case 'horns':
        for (const s of [-1, 1]) { x.beginPath(); x.moveTo(s * R * 0.35, -R * 0.7); x.lineTo(s * R * 0.7, -R * 1.25); x.lineTo(s * R * 0.6, -R * 0.62); x.fill(); }
        break;
      case 'fin':
        x.fillStyle = shade(body, -0.25); x.beginPath(); x.moveTo(-R * 0.2, -R * 0.8); x.lineTo(R * 0.15, -R * 1.4); x.lineTo(R * 0.35, -R * 0.75); x.fill(); break;
      case 'claws':
        for (const s of [-1, 1]) { x.beginPath(); x.arc(s * R * 0.95, -R * 0.1, R * 0.28, 0, Math.PI * 2); x.fill(); } break;
      case 'sock':
        x.fillStyle = acc; rr(x, -R * 0.3, -R * 1.3, R * 0.6, R * 0.6, R * 0.15); x.fill(); break;
      case 'fangs':
        x.fillStyle = '#fff'; for (const s of [-1, 1]) { x.beginPath(); x.moveTo(s * R * 0.18, R * 0.05); x.lineTo(s * R * 0.08, R * 0.3); x.lineTo(s * R * 0.03, R * 0.05); x.fill(); } break;
      case 'gear':
        x.save(); x.translate(0, -R * 0.95); x.rotate(time * 3);
        for (let k = 0; k < 6; k++) { x.rotate(Math.PI / 3); x.fillRect(-R * 0.07, -R * 0.32, R * 0.14, R * 0.18); }
        x.beginPath(); x.arc(0, 0, R * 0.2, 0, Math.PI * 2); x.fill(); x.restore(); break;
      case 'shell':
        x.fillStyle = acc; x.beginPath(); x.arc(0, -R * 0.95, R * 0.3, 0, Math.PI * 2); x.fill(); break;
    }
    // eyes
    const ey = kind === 'mask' ? -R * 0.26 : -R * 0.25;
    for (const s of [-1, 1]) {
      x.fillStyle = '#fff'; x.beginPath(); x.arc(s * R * 0.25 + face * R * 0.08, ey, R * 0.15, 0, Math.PI * 2); x.fill();
      x.fillStyle = '#111'; x.beginPath(); x.arc(s * R * 0.25 + face * R * 0.13, ey, R * 0.075, 0, Math.PI * 2); x.fill();
    }
    // feet
    const step = Math.sin(time * 10 + c.phaseOff) * R * 0.18;
    x.fillStyle = shade(body, -0.35);
    x.beginPath(); x.ellipse(-R * 0.35 + step, R * 0.82, R * 0.22, R * 0.12, 0, 0, Math.PI * 2); x.fill();
    x.beginPath(); x.ellipse(R * 0.35 - step, R * 0.82, R * 0.22, R * 0.12, 0, 0, Math.PI * 2); x.fill();
    x.restore();
  }

  const faceImgs = {};
  function bossFace(b) {
    if (!b.image) return null;
    if (!faceImgs[b.image]) { const im = new Image(); im.src = (PTD.BOSS_FACES && PTD.BOSS_FACES[b.image]) || b.image; faceImgs[b.image] = im; }
    const im = faceImgs[b.image];
    return im.complete && im.naturalWidth ? im : null;
  }

  function drawBoss(x, c, time) {
    const b = PTD.BOSSES[c.bossIdx];
    const R = c.radius;
    const bob = Math.sin(time * 6 + c.phaseOff) * R * 0.06;
    x.save();
    x.translate(c.x, c.y);
    x.scale(1, -1);
    x.fillStyle = 'rgba(0,0,0,0.4)';
    x.beginPath(); x.ellipse(0, R * 0.95, R, R * 0.3, 0, 0, Math.PI * 2); x.fill();
    // aura
    const pulse = 0.5 + 0.5 * Math.sin(time * 4);
    x.fillStyle = 'rgba(255,215,64,' + (0.12 + pulse * 0.1) + ')';
    x.beginPath(); x.arc(0, 0, R * 1.5, 0, Math.PI * 2); x.fill();
    x.translate(0, bob);
    // cape
    x.fillStyle = '#5b0f14';
    x.beginPath(); x.moveTo(-R * 0.8, -R * 0.2); x.quadraticCurveTo(0, R * 1.5, R * 0.8, -R * 0.2); x.fill();
    // suit body
    x.fillStyle = b.color;
    rr(x, -R * 0.62, -R * 0.05, R * 1.24, R * 0.95, R * 0.3); x.fill();
    x.fillStyle = '#f5f5f5';
    x.beginPath(); x.moveTo(-R * 0.18, -R * 0.05); x.lineTo(0, R * 0.45); x.lineTo(R * 0.18, -R * 0.05); x.fill();
    x.fillStyle = '#c0392b';
    x.beginPath(); x.moveTo(-R * 0.14, R * 0.02); x.lineTo(R * 0.14, R * 0.02); x.lineTo(0, R * 0.12); x.fill();
    // head
    const hy = -R * 0.55, hr = R * 0.52;
    const im = bossFace(b);
    x.save();
    x.beginPath(); x.arc(0, hy, hr, 0, Math.PI * 2); x.closePath();
    if (im) {
      x.clip();
      x.drawImage(im, -hr, hy - hr, hr * 2, hr * 2);
    } else {
      x.fillStyle = '#f0c8a0'; x.fill();
      // shades and grin
      x.fillStyle = '#111';
      rr(x, -hr * 0.75, hy - hr * 0.25, hr * 0.65, hr * 0.32, hr * 0.12); x.fill();
      rr(x, hr * 0.1, hy - hr * 0.25, hr * 0.65, hr * 0.32, hr * 0.12); x.fill();
      x.fillRect(-hr * 0.15, hy - hr * 0.18, hr * 0.3, hr * 0.06);
      x.strokeStyle = '#7a2a1a'; x.lineWidth = hr * 0.1;
      x.beginPath(); x.arc(0, hy + hr * 0.25, hr * 0.35, 0.2, Math.PI - 0.2); x.stroke();
      x.fillStyle = '#ffd43b'; x.fillRect(hr * 0.05, hy + hr * 0.42, hr * 0.14, hr * 0.12);
    }
    x.restore();
    x.lineWidth = R * 0.06; x.strokeStyle = '#1a1a1a';
    x.beginPath(); x.arc(0, hy, hr, 0, Math.PI * 2); x.stroke();
    // crown
    x.fillStyle = '#ffd43b'; x.strokeStyle = '#a87b00'; x.lineWidth = R * 0.04;
    const cy = hy - hr * 0.85;
    x.beginPath();
    x.moveTo(-hr * 0.6, cy); x.lineTo(-hr * 0.7, cy - hr * 0.55); x.lineTo(-hr * 0.3, cy - hr * 0.25);
    x.lineTo(0, cy - hr * 0.7); x.lineTo(hr * 0.3, cy - hr * 0.25); x.lineTo(hr * 0.7, cy - hr * 0.55); x.lineTo(hr * 0.6, cy);
    x.closePath(); x.fill(); x.stroke();
    x.restore();
  }

  return { cardSprite, comboSprite, boardCanvas, drawLooter, drawBoss, bossFace, rr, shade };
})();
