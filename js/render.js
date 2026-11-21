// Draws the world. World coordinates are the original map's (y up); the camera flips them.
window.PTD = window.PTD || {};

PTD.Renderer = class {
  constructor(canvas, game) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.game = game;
    this.board = PTD.Art.boardCanvas(game.map, game.players, 8);
    this.cam = { x: 0, y: 0, zoom: 0.12 };
    this.resize();
  }

  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.dpr = dpr;
    this.W = this.canvas.clientWidth; this.H = this.canvas.clientHeight;
    this.canvas.width = Math.round(this.W * dpr); this.canvas.height = Math.round(this.H * dpr);
  }

  clampZoom(z) { return Math.max(0.045, Math.min(0.7, z)); }

  fitPlayer(p) {
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (const q of p.lane.path) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); }
    const pad = 500;
    minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    const usableH = this.H - 210, usableW = this.W - 300;
    this.cam.zoom = this.clampZoom(Math.min(usableW / (maxX - minX), usableH / (maxY - minY)));
    this.cam.x = (minX + maxX) / 2 + 110 / this.cam.zoom;
    this.cam.y = (minY + maxY) / 2 - 40 / this.cam.zoom;
  }

  screenToWorld(sx, sy) {
    return { x: (sx - this.W / 2) / this.cam.zoom + this.cam.x, y: -(sy - this.H / 2) / this.cam.zoom + this.cam.y };
  }

  worldToScreen(wx, wy) {
    return { x: (wx - this.cam.x) * this.cam.zoom + this.W / 2, y: -(wy - this.cam.y) * this.cam.zoom + this.H / 2 };
  }

  zoomAt(sx, sy, factor) {
    const before = this.screenToWorld(sx, sy);
    this.cam.zoom = this.clampZoom(this.cam.zoom * factor);
    const after = this.screenToWorld(sx, sy);
    this.cam.x += before.x - after.x; this.cam.y += before.y - after.y;
  }

  draw(ui) {
    const g = this.game, x = this.ctx, z = this.cam.zoom, d = this.dpr;
    const time = performance.now() / 1000;
    x.setTransform(d, 0, 0, d, 0, 0);
    x.fillStyle = '#120d10'; x.fillRect(0, 0, this.W, this.H);
    x.setTransform(d * z, 0, 0, -d * z, d * (this.W / 2 - this.cam.x * z), d * (this.H / 2 + this.cam.y * z));
    x.imageSmoothingEnabled = true;

    // board
    const B = this.board, size = g.map.size * g.map.cell;
    x.save(); x.scale(1, -1);
    x.drawImage(B.canvas, g.map.origin, -(g.map.origin + size), size, size);
    x.restore();

    // visible world rect for culling
    const tl = this.screenToWorld(0, 0), br = this.screenToWorld(this.W, this.H);
    const vis = (px, py, m) => px > tl.x - m && px < br.x + m && py < tl.y + m && py > br.y - m;

    // build ghost
    if (ui.ghost) {
      const gh = ui.ghost;
      x.fillStyle = gh.ok ? 'rgba(120,255,160,0.18)' : 'rgba(255,80,80,0.22)';
      x.fillRect(gh.x - 64, gh.y - 64, 128, 128);
      x.strokeStyle = gh.ok ? 'rgba(120,255,160,0.9)' : 'rgba(255,80,80,0.9)';
      x.lineWidth = 3 / z; x.strokeRect(gh.x - 64, gh.y - 64, 128, 128);
      if (gh.ok) this.rangeCircle(gh.x, gh.y, 400, 'rgba(255,255,255,0.35)');
    }
    // range for inspected / hovered tower
    const focus = ui.inspect && ui.inspect.alive ? ui.inspect : ui.hoverTower;
    if (focus) this.rangeCircle(focus.x, focus.y, focus.stats.range, 'rgba(255,230,140,0.55)');

    // towers (back to front: higher y first)
    const towers = g.towers.filter(t => t.alive && vis(t.x, t.y, 200)).sort((a, b) => b.y - a.y);
    const me = g.human;
    for (const t of towers) {
      const own = t.owner === me.id;
      if (t.inHand && own && g.phase === 'hand') {
        x.fillStyle = t.selected ? 'rgba(255,214,64,0.55)' : 'rgba(255,255,255,0.12)';
        x.beginPath(); x.arc(t.x, t.y, 82, 0, Math.PI * 2); x.fill();
        if (t.selected) { x.strokeStyle = '#ffd640'; x.lineWidth = 4 / z + 4; x.stroke(); }
      }
      // owner colour base
      x.fillStyle = g.players[t.owner].color; x.globalAlpha = 0.55;
      x.beginPath(); x.ellipse(t.x, t.y - 34, 58, 18, 0, 0, Math.PI * 2); x.fill();
      x.globalAlpha = 1;
      const lift = t.selected ? 28 : 0;
      const pop = t.fresh != null ? Math.max(0, 1 - (g.time - t.fresh) * 3) : 0;
      x.save();
      x.translate(t.x, t.y + lift);
      x.scale(1, -1);
      if (t.kind === 'card') {
        const spr = PTD.Art.cardSprite(t.suit, t.rank);
        const s = 1 + pop * 0.3 + (t.flash > 0 ? 0.04 : 0);
        x.drawImage(spr, -52 * s, -100 * s, 104 * s, 130 * s);
      } else {
        const spr = PTD.Art.comboSprite(t.type, t.rank);
        const s = t.scale * (1 + pop * 0.4);
        if (t.type === 8) {
          x.fillStyle = 'rgba(255,215,64,' + (0.18 + 0.1 * Math.sin(time * 5)) + ')';
          x.beginPath(); x.arc(0, -20, 110 * s, 0, Math.PI * 2); x.fill();
        }
        x.drawImage(spr, -72 * s, -128 * s, 144 * s, 162 * s);
      }
      x.restore();
    }

    // creeps
    const creeps = g.creeps.filter(c => c.alive && vis(c.x, c.y, 200)).sort((a, b) => b.y - a.y);
    for (const c of creeps) {
      if (c.boss) PTD.Art.drawBoss(x, c, time); else PTD.Art.drawLooter(x, c, time);
      if (c.bleed) { x.fillStyle = 'rgba(255,215,64,0.8)'; x.beginPath(); x.arc(c.x + c.radius * 0.6, c.y + c.radius * 0.9, 12, 0, Math.PI * 2); x.fill(); }
      if (c.stunT > 0) { x.strokeStyle = '#fff'; x.lineWidth = 6; x.beginPath(); x.arc(c.x, c.y + c.radius * 1.2, 22, time * 8, time * 8 + 4); x.stroke(); }
    }
    // health bars on top
    for (const c of creeps) {
      const w = c.boss ? 200 : 90, h = c.boss ? 20 : 12, y = c.y + c.radius * (c.boss ? 2.0 : 1.35);
      x.fillStyle = 'rgba(0,0,0,0.7)'; x.fillRect(c.x - w / 2 - 3, y - 3, w + 6, h + 6);
      const f = Math.max(0, c.hp / c.maxHp);
      x.fillStyle = f > 0.5 ? '#46d17a' : f > 0.25 ? '#f2c12e' : '#ef4b4b';
      x.fillRect(c.x - w / 2, y, w * f, h);
      x.fillStyle = g.players[c.owner].color; x.fillRect(c.x - w / 2 - 3, y - 3, 8, h + 6);
    }

    // projectiles
    for (const sh of g.shots) this.drawShot(sh, time);
    // effects
    for (const f of g.fx) this.drawFx(f);

    x.setTransform(d, 0, 0, d, 0, 0);
  }

  rangeCircle(cx, cy, r, color) {
    const x = this.ctx;
    x.strokeStyle = color; x.lineWidth = 3 / this.cam.zoom;
    x.setLineDash([24 / this.cam.zoom, 12 / this.cam.zoom]);
    x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.stroke();
    x.setLineDash([]);
    x.fillStyle = color.replace(/[\d.]+\)$/, '0.06)');
    x.fill();
  }

  drawShot(sh, time) {
    const x = this.ctx;
    let px = sh.x, py = sh.y;
    if (sh.arc) {
      const tot = Math.hypot(sh.tx - sh.sx, sh.ty - sh.sy) || 1;
      const prog = 1 - Math.hypot(sh.tx - sh.x, sh.ty - sh.y) / tot;
      py += Math.sin(prog * Math.PI) * 500;
      x.fillStyle = 'rgba(0,0,0,0.3)'; x.beginPath(); x.ellipse(sh.x, sh.y, 30, 12, 0, 0, Math.PI * 2); x.fill();
    }
    const glow = (r, inner, outer) => {
      const gr = x.createRadialGradient(px, py, 1, px, py, r);
      gr.addColorStop(0, inner); gr.addColorStop(1, outer);
      x.fillStyle = gr; x.beginPath(); x.arc(px, py, r, 0, Math.PI * 2); x.fill();
    };
    switch (sh.fx) {
      case 'fire': glow(34, '#fff3b0', 'rgba(255,90,20,0)'); break;
      case 'shell': x.fillStyle = '#2b2f36'; x.beginPath(); x.arc(px, py, 16, 0, Math.PI * 2); x.fill(); break;
      case 'orb': glow(30, '#f1d6ff', 'rgba(150,60,220,0)'); break;
      case 'poison': glow(28, '#d9ffb0', 'rgba(40,180,90,0)'); break;
      case 'frost': glow(34, '#ffffff', 'rgba(120,200,255,0)'); break;
      case 'royal': glow(40, '#fffbe0', 'rgba(255,200,0,0)'); break;
      case 'mortar': x.fillStyle = '#1b1b1b'; x.beginPath(); x.arc(px, py, 34, 0, Math.PI * 2); x.fill();
        x.fillStyle = '#ff7b00'; x.beginPath(); x.arc(px + 12, py + 12, 8 + 4 * Math.sin(time * 30), 0, Math.PI * 2); x.fill(); break;
      default: {
        const a = Math.atan2(sh.ty - sh.y, sh.tx - sh.x);
        x.strokeStyle = sh.fx === 'bash' ? '#dfe6ee' : '#fff1c4'; x.lineWidth = sh.fx === 'bash' ? 14 : 7; x.lineCap = 'round';
        x.beginPath(); x.moveTo(px - Math.cos(a) * 40, py - Math.sin(a) * 40); x.lineTo(px, py); x.stroke();
      }
    }
  }

  drawFx(f) {
    const x = this.ctx, k = f.t / f.life;
    switch (f.kind) {
      case 'text': {
        x.save(); x.translate(f.x, f.y + k * 90); x.scale(1, -1);
        x.globalAlpha = 1 - k * k;
        const fs = Math.max(34, 15 / this.cam.zoom);
        x.font = 'bold ' + fs + 'px Arial, sans-serif'; x.textAlign = 'center';
        x.lineWidth = fs * 0.16; x.strokeStyle = 'rgba(0,0,0,0.85)'; x.strokeText(f.text, 0, 0);
        x.fillStyle = f.color; x.fillText(f.text, 0, 0);
        x.restore(); break;
      }
      case 'coins': {
        x.fillStyle = '#ffd34d';
        for (let i = 0; i < f.n; i++) {
          const a = i * 2.399 + f.x * 0.01, sp = 160 + (i % 3) * 60;
          const px = f.x + Math.cos(a) * sp * k, py = f.y + Math.sin(a) * sp * k * 0.6 + (k - k * k) * 260;
          x.globalAlpha = 1 - k;
          x.beginPath(); x.arc(px, py, 14, 0, Math.PI * 2); x.fill();
        }
        x.globalAlpha = 1; break;
      }
      case 'ring': {
        const r = (f.r || 260) * (0.3 + k * 0.7);
        x.strokeStyle = f.color; x.globalAlpha = 1 - k; x.lineWidth = 16 * (1 - k) + 2;
        x.beginPath(); x.arc(f.x, f.y, r, 0, Math.PI * 2); x.stroke(); x.globalAlpha = 1; break;
      }
      case 'spark': {
        x.strokeStyle = f.color; x.globalAlpha = 1 - k; x.lineWidth = 6;
        for (let i = 0; i < 6; i++) {
          const a = i * Math.PI / 3 + f.x;
          x.beginPath(); x.moveTo(f.x + Math.cos(a) * 20, f.y + Math.sin(a) * 20);
          x.lineTo(f.x + Math.cos(a) * (30 + k * 60), f.y + Math.sin(a) * (30 + k * 60)); x.stroke();
        }
        x.globalAlpha = 1; break;
      }
      case 'bolt': {
        x.strokeStyle = f.color; x.lineWidth = 10 * (1 - k) + 3; x.globalAlpha = 1 - k * 0.5;
        x.beginPath();
        for (let i = 0; i < f.pts.length - 1; i++) {
          const a = f.pts[i], b = f.pts[i + 1];
          if (i === 0) x.moveTo(a.x, a.y);
          for (let s = 1; s <= 5; s++) {
            const t = s / 5, j = s < 5 ? (Math.random() - 0.5) * 70 : 0;
            x.lineTo(a.x + (b.x - a.x) * t + j, a.y + (b.y - a.y) * t + j);
          }
        }
        x.stroke(); x.globalAlpha = 1; break;
      }
      case 'boom': {
        const r = f.r * (0.4 + k);
        const gr = x.createRadialGradient(f.x, f.y, 1, f.x, f.y, r);
        gr.addColorStop(0, 'rgba(255,240,180,' + (1 - k) + ')'); gr.addColorStop(0.5, 'rgba(255,120,40,' + (0.8 * (1 - k)) + ')'); gr.addColorStop(1, 'rgba(80,20,0,0)');
        x.fillStyle = gr; x.beginPath(); x.arc(f.x, f.y, r, 0, Math.PI * 2); x.fill(); break;
      }
    }
  }
};
