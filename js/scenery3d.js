// Set dressing for the 3D view: marquee lights, lane chevrons, clutter on the walls,
// lit spawn arches, a jackpot vault plaza, and a furnished casino around the table.
// PTD.Scenery3D.build(renderer) -> { update(timeSeconds, dt) }
window.PTD = window.PTD || {};

(function () {
  if (!window.THREE) return;
  const T = window.THREE;
  const TAU = Math.PI * 2;
  const W2T = (x, y, h) => new T.Vector3(x, h || 0, -y);
  const FELT_H = 44, WALL_H = 150, RIM_TOP = 160;

  // deterministic random so the scene is the same every game
  let seed = 1234567;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const rr = (a, b) => a + rnd() * (b - a);

  const mats = {};
  function M(key, make) { if (!mats[key]) { mats[key] = make(); mats[key].userData.shared = true; } return mats[key]; }
  const std = (c, o) => M('s' + c + JSON.stringify(o || {}), () => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.55 }, o || {})));
  const glow = (c, k) => M('g' + c + k, () => new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k || 2.5) }));

  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
    return t;
  }
  function neonText(text, color, w, h) {
    return canvasTex(w || 512, h || 128, (x, W, H) => {
      x.fillStyle = 'rgba(0,0,0,0)'; x.fillRect(0, 0, W, H);
      x.font = 'bold ' + Math.round(H * 0.62) + 'px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.shadowColor = color; x.shadowBlur = H * 0.25;
      x.lineWidth = H * 0.05; x.strokeStyle = color; x.strokeText(text, W / 2, H / 2);
      x.fillStyle = '#ffffff'; x.fillText(text, W / 2, H / 2);
    });
  }

  // Instanced helper: add(position, rotationY, scale[3], color?)
  function instanced(scene, geo, mat, max, colored) {
    const mesh = new T.InstancedMesh(geo, mat, max);
    mesh.count = 0;
    mesh.castShadow = true; mesh.receiveShadow = true;
    if (colored) mesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(max * 3), 3);
    const d = new T.Object3D(), col = new T.Color();
    scene.add(mesh);
    return {
      mesh,
      add(p, ry, s, c, rx, rz) {
        if (mesh.count >= max) return;
        d.position.copy(p); d.rotation.set(rx || 0, ry || 0, rz || 0); d.scale.set(s[0], s[1], s[2]); d.updateMatrix();
        mesh.setMatrixAt(mesh.count, d.matrix);
        if (colored) { col.set(c); mesh.setColorAt(mesh.count, col); }
        mesh.count++;
      },
      done() { mesh.instanceMatrix.needsUpdate = true; if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true; mesh.computeBoundingSphere(); },
    };
  }

  function build(r) {
    const S = r.scene, g = r.game, map = g.map, cell = map.cell, half = map.size * cell / 2;
    seed = 1234567;
    const updaters = [];

    // ------------------------------------------------------------ cartoon cobblestone paths
    {
      const tile = canvasTex(512, 512, (x, W) => {
        x.fillStyle = '#5a3418'; x.fillRect(0, 0, W, W);                       // mortar
        const stones = ['#e9bf73', '#dca062', '#f4d391', '#cf8c55', '#e8b274', '#ddbd86', '#c9a27a'];
        let sd = 7; const rn = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
        const rows = 8, h = W / rows;
        for (let r = 0; r < rows; r++) {
          let cx = r % 2 ? -h * 0.5 : 0;
          while (cx < W) {
            const w = h * (0.9 + rn() * 0.7), y = r * h;
            const col = stones[Math.floor(rn() * stones.length)];
            const draw = (ox) => {
              const X = cx + 5 + ox, Y = y + 5, Wd = w - 10, Hd = h - 10, R = 14;
              x.beginPath(); x.moveTo(X + R, Y); x.arcTo(X + Wd, Y, X + Wd, Y + Hd, R); x.arcTo(X + Wd, Y + Hd, X, Y + Hd, R);
              x.arcTo(X, Y + Hd, X, Y, R); x.arcTo(X, Y, X + Wd, Y, R); x.closePath();
              const sg = x.createLinearGradient(X, Y, X, Y + Hd);
              sg.addColorStop(0, col); sg.addColorStop(1, PTD.Art.shade(col, -0.18));
              x.fillStyle = sg; x.fill();
              x.lineWidth = 6; x.strokeStyle = 'rgba(255,255,255,0.45)';             // cartoon highlight
              x.beginPath(); x.moveTo(X + R, Y + 4); x.lineTo(X + Wd - R, Y + 4); x.stroke();
              x.strokeStyle = 'rgba(0,0,0,0.35)';                                      // and shadow edge
              x.beginPath(); x.moveTo(X + R, Y + Hd - 3); x.lineTo(X + Wd - R, Y + Hd - 3); x.stroke();
            };
            draw(0); if (cx + w > W) draw(-W);                                         // wrap for seamless tiling
            cx += w;
          }
        }
      });
      tile.wrapS = tile.wrapT = T.RepeatWrapping;
      const roadMat = new T.MeshStandardMaterial({ map: tile, color: '#e6dccb', roughness: 0.8, envMapIntensity: 0.2 });
      roadMat.onBeforeCompile = (sh) => {
        sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
          { vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vMapUv = vec2(wp.x, -wp.z) / 300.0; }`);
      };
      const rects = r.rectsOf(1);
      const roads = new T.InstancedMesh(new T.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), roadMat, rects.length);
      const d = new T.Object3D();
      rects.forEach((q, i) => {
        const w = (q.x1 - q.x0) * cell, h = (q.y1 - q.y0) * cell;
        d.position.copy(W2T(map.origin + q.x0 * cell + w / 2, map.origin + q.y0 * cell + h / 2, 1.5));
        d.scale.set(w, 1, h); d.updateMatrix(); roads.setMatrixAt(i, d.matrix);
      });
      roads.receiveShadow = true;
      S.add(roads);

      // Toy-playset cobbles: real rounded stones (one instanced draw) in running-bond rows over the
      // paths, each a slightly different golden tone, size and tilt. The flat path underneath turns
      // into dark mortar. High quality only; the flat cobble texture stays for lower settings.
      if (r.quality === 'high') {
        roadMat.color.set('#5e4430');   // the flat path darkens into mortar between the stones
        const SW = 58, SD = 44, gap = 6;
        const spots = [];
        rects.forEach((q) => {
          const x0 = map.origin + q.x0 * cell, x1 = map.origin + q.x1 * cell, y0 = map.origin + q.y0 * cell, y1 = map.origin + q.y1 * cell;
          const r0 = Math.floor(y0 / (SD + gap)), r1 = Math.ceil(y1 / (SD + gap));
          for (let row = r0; row <= r1; row++) {
            const y = row * (SD + gap) + SD / 2;
            if (y < y0 + SD * 0.45 || y > y1 - SD * 0.45) continue;
            const off = (row & 1) ? (SW + gap) / 2 : 0;
            const c0 = Math.floor((x0 - off) / (SW + gap)), c1 = Math.ceil((x1 - off) / (SW + gap));
            for (let col = c0; col <= c1; col++) {
              const x = col * (SW + gap) + off + SW / 2;
              if (x < x0 + SW * 0.45 || x > x1 - SW * 0.45) continue;
              spots.push([x, y]);
            }
          }
        });
        const stone = new T.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2);   // ~40 triangles a stone
        const sm = new T.MeshStandardMaterial({ color: '#c9b8a0', roughness: 0.65, envMapIntensity: 0.25 });
        const stones = new T.InstancedMesh(stone, sm, spots.length);
        const tones = ['#f2c66d', '#e8a955', '#ffd98a', '#e3a05c', '#f5b867', '#ecc584', '#d99a5e'].map(c => new T.Color(c));
        const d2 = new T.Object3D(), tc = new T.Color();
        spots.forEach(([x, y], i) => {
          d2.position.copy(W2T(x + (rnd() - 0.5) * 5, y + (rnd() - 0.5) * 4, 1.5));
          d2.rotation.set((rnd() - 0.5) * 0.08, (rnd() - 0.5) * 0.25, (rnd() - 0.5) * 0.08);
          const k = 0.92 + rnd() * 0.14;
          d2.scale.set(SW / 2 * k, 9 + rnd() * 5, SD / 2 * k);
          d2.updateMatrix(); stones.setMatrixAt(i, d2.matrix);
          tc.copy(tones[Math.floor(rnd() * tones.length)]).multiplyScalar(0.92 + rnd() * 0.16);
          stones.setColorAt(i, tc);
        });
        stones.receiveShadow = true;
        S.add(stones);
      }

      // each lane gets a soft ribbon of its owner's colour down the middle, sized to the road
      const RIB = 34 * (128 + 64 * (PTD.RULES.roadWiden || 0)) / 192;
      for (const pl of g.players) {
        const pts = pl.lane.path, pos = [];
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i], dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
          const nx = -dy / L * RIB, ny = dx / L * RIB;
          const q = [[a.x + nx, a.y + ny], [a.x - nx, a.y - ny], [b.x - nx, b.y - ny], [b.x + nx, b.y + ny]].map(([x, y]) => W2T(x, y, r.quality === 'high' ? 17 : 2.5));   // floats just over the 3D cobbles
          pos.push(...q[0].toArray(), ...q[1].toArray(), ...q[2].toArray(), ...q[0].toArray(), ...q[2].toArray(), ...q[3].toArray());
        }
        const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        const mine = pl === g.human && pl.human;
        const ribbon = new T.Mesh(geo, new T.MeshBasicMaterial({ color: new T.Color(pl.color).multiplyScalar(mine ? 1.5 : 1), transparent: true, opacity: mine ? 0.6 : 0.3, depthWrite: false, side: T.DoubleSide }));
        S.add(ribbon);
        // your own lane pulses, and a "YOU" sign in your colour bobs over your looter door
        if (mine) {
          const s = pts[0];
          const sign = new T.Sprite(new T.SpriteMaterial({ map: neonText('YOU', pl.color, 512, 160), transparent: true, depthWrite: false, depthTest: false }));
          sign.scale.set(820, 256, 1); sign.renderOrder = 8; S.add(sign);
          const arrow = new T.Sprite(new T.SpriteMaterial({ map: neonText('▼', pl.color, 128, 128), transparent: true, depthWrite: false, depthTest: false }));
          arrow.scale.set(220, 220, 1); arrow.renderOrder = 8; S.add(arrow);
          updaters.push((t) => {
            ribbon.material.opacity = 0.5 + Math.sin(t * 3) * 0.18;
            const bob = Math.sin(t * 2.4) * 30;
            sign.position.copy(W2T(s.x, s.y, 900 + bob));
            arrow.position.copy(W2T(s.x, s.y, 690 + bob * 1.4));
            sign.visible = arrow.visible = pl.alive;
          });
        }
      }

      // gold curbs wherever the raised felt meets a path
      const N = map.size, G = map.grid, runs = [];
      const at = (cx, cy) => (cx < 0 || cy < 0 || cx >= N || cy >= N) ? 2 : G[cy * N + cx];
      for (let y = 1; y < N; y++) {            // horizontal boundaries between row y-1 and y
        let start = -1;
        for (let x = 0; x <= N; x++) {
          const a = x < N ? at(x, y - 1) : 9, b = x < N ? at(x, y) : 9;
          const edge = (a === 0 && b === 1) || (a === 1 && b === 0);
          if (edge && start < 0) start = x;
          if (!edge && start >= 0) { runs.push([start, y, x - start, 0]); start = -1; }
        }
      }
      for (let x = 1; x < N; x++) {            // vertical boundaries between column x-1 and x
        let start = -1;
        for (let y = 0; y <= N; y++) {
          const a = y < N ? at(x - 1, y) : 9, b = y < N ? at(x, y) : 9;
          const edge = (a === 0 && b === 1) || (a === 1 && b === 0);
          if (edge && start < 0) start = y;
          if (!edge && start >= 0) { runs.push([x, start, y - start, 1]); start = -1; }
        }
      }
      const curb = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), std('#d9a82e', { metalness: 0.9, roughness: 0.25 }), runs.length);
      runs.forEach(([cx, cy, n, vert], i) => {
        const len = n * cell + 14;
        if (!vert) { d.position.copy(W2T(map.origin + (cx + n / 2) * cell, map.origin + cy * cell, FELT_H + 4)); d.scale.set(len, 10, 14); }
        else { d.position.copy(W2T(map.origin + cx * cell, map.origin + (cy + n / 2) * cell, FELT_H + 4)); d.scale.set(14, 10, len); }
        d.updateMatrix(); curb.setMatrixAt(i, d.matrix);
      });
      curb.castShadow = true;
      S.add(curb);
    }

    // ------------------------------------------------------------ giant flat props lying on the felt
    // (decals only: towers can still be built right on top of them)
    {
      const open = [];
      for (let i = 0; i < 4000 && open.length < 26; i++) {
        const x = rr(-5400, 5400), y = rr(-5400, 5400);
        if (Math.abs(x) < 900 && Math.abs(y) < 900) continue;
        let ok = true;
        for (let dx = -260; dx <= 260 && ok; dx += 130) for (let dy = -260; dy <= 260 && ok; dy += 130) if (map.cellAt(x + dx, y + dy) !== 0) ok = false;
        if (ok && open.every(o => Math.hypot(o[0] - x, o[1] - y) > 1100)) open.push([x, y]);
      }
      const decal = (tex, w, h, x, y, rot, op) => {
        const m = new T.Mesh(new T.PlaneGeometry(w, h).rotateX(-Math.PI / 2), new T.MeshStandardMaterial({ map: tex, color: '#8a8780', transparent: true, opacity: (op || 0.9) * 0.85, depthWrite: false, roughness: 0.8, envMapIntensity: 0.1, polygonOffset: true, polygonOffsetFactor: -2 }));
        m.position.copy(W2T(x, y, FELT_H + 0.6)); m.rotation.y = rot; m.receiveShadow = true; S.add(m);
      };
      const bigCard = (suit, rank) => {
        const src = PTD.Art.cardSprite(suit, rank);
        return canvasTex(216, 280, (x) => { x.drawImage(src, 10, 6, 108, 140, 0, 0, 216, 280); });
      };
      const chipTex = (col) => canvasTex(256, 256, (x) => {
        x.fillStyle = col; x.beginPath(); x.arc(128, 128, 124, 0, TAU); x.fill();
        x.strokeStyle = '#f4efe2'; x.lineWidth = 22; x.setLineDash([34, 30]); x.beginPath(); x.arc(128, 128, 104, 0, TAU); x.stroke(); x.setLineDash([]);
        x.fillStyle = 'rgba(255,255,255,0.25)'; x.beginPath(); x.arc(128, 128, 70, 0, TAU); x.fill();
        x.fillStyle = '#f4efe2'; x.font = 'bold 64px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('BLB', 128, 132);
      });
      const diceTex = (n) => canvasTex(256, 256, (x) => {
        x.fillStyle = '#fafafa'; PTD.Art.rr(x, 8, 8, 240, 240, 40); x.fill();
        x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 8; x.stroke();
        const pip = { 1: [[128, 128]], 3: [[70, 70], [128, 128], [186, 186]], 5: [[70, 70], [186, 70], [128, 128], [70, 186], [186, 186]], 6: [[70, 64], [186, 64], [70, 128], [186, 128], [70, 192], [186, 192]] }[n];
        x.fillStyle = n === 1 ? '#c0392b' : '#111'; pip.forEach(([a, b]) => { x.beginPath(); x.arc(a, b, 22, 0, TAU); x.fill(); });
      });
      const chipCols = ['#c0392b', '#1f618d', '#1e8449', '#7d3c98', '#111111'];
      open.forEach(([x, y], i) => {
        const k = i % 4, rot = rr(0, TAU);
        if (k === 0) decal(bigCard(i % 4, 14 - (i % 5)), 360, 470, x, y, rot, 0.92);
        else if (k === 1) decal(chipTex(chipCols[i % chipCols.length]), 420, 420, x, y, rot, 0.85);
        else if (k === 2) { decal(diceTex([1, 3, 5, 6][i % 4]), 240, 240, x - 140, y, rot, 0.95); decal(diceTex([6, 5, 3, 1][i % 4]), 240, 240, x + 150, y + 60, rot + 0.5, 0.95); }
        else { for (let c = 0; c < 3; c++) decal(bigCard((i + c) % 4, 10 + c), 300, 390, x + c * 90 - 90, y + c * 20, rot + (c - 1) * 0.25, 0.9); }
      });
    }

    // ------------------------------------------------------------ coloured spotlights sweeping the table
    {
      const pools = [];
      const poolTex = canvasTex(128, 128, (x) => {
        const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64);
        gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.55, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
      });
      ['#ff4fa0', '#4fd2ff', '#ffd34d', '#9b6bff'].forEach((c, i) => {
        const pool = new T.Mesh(new T.PlaneGeometry(1500, 1500).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: poolTex, color: new T.Color(c).multiplyScalar(0.32), transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
        pool.position.y = FELT_H + 3; S.add(pool);
        const beam = new T.Mesh(new T.ConeGeometry(620, 4200, 24, 1, true), new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(0.03), transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, fog: false }));
        S.add(beam);
        pools.push({ pool, beam, ph: i * 1.7, r: 2600 + i * 700, sp: 0.07 + i * 0.02 });
      });
      updaters.push((t) => {
        for (const p of pools) {
          const a = t * p.sp + p.ph, x = Math.cos(a) * p.r, z = Math.sin(a * 1.3) * p.r;
          p.pool.position.x = x; p.pool.position.z = z;
          p.beam.position.set(x, FELT_H + 2100, z);
        }
      });
    }

    // ------------------------------------------------------------ landmarks on the biggest wall blocks
    {
      const big = r.rectsOf(2).map(w => {
        const W = (w.x1 - w.x0) * cell, H = (w.y1 - w.y0) * cell;
        const cx = map.origin + w.x0 * cell + W / 2, cy = map.origin + w.y0 * cell + H / 2;
        const edge = w.x0 === 0 || w.y0 === 0 || w.x1 === map.size || w.y1 === map.size;
        return { W, H, cx, cy, edge, area: W * H };
      }).filter(w => !w.edge && !(Math.abs(w.cx) < 700 && Math.abs(w.cy) < 700) && Math.min(w.W, w.H) >= 300).sort((a, b) => b.area - a.area);
      const top = WALL_H + 4;
      const gold = std('#e6b422', { metalness: 0.95, roughness: 0.2 });
      const kinds = ['champagne', 'chips', 'dice', 'slot', 'roulette', 'chips', 'dice', 'champagne'];
      big.slice(0, 16).forEach((w, i) => {
        const g2 = new T.Group(); g2.position.copy(W2T(w.cx, w.cy, top)); g2.rotation.y = rr(0, TAU); S.add(g2);
        const k = kinds[i % kinds.length];
        if (k === 'champagne') {
          const glass = M('champ', () => new T.MeshPhysicalMaterial({ color: '#fff6d8', roughness: 0.05, transparent: true, opacity: 0.45, clearcoat: 1 }));
          const fizz = glow('#ffe7a0', 1.2);
          for (let lvl = 0; lvl < 4; lvl++) {
            const n = 4 - lvl;
            for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
              const gl = new T.Mesh(new T.CylinderGeometry(26, 8, 50, 12, 1, true), glass);
              gl.position.set((a - (n - 1) / 2) * 56, 30 + lvl * 62, (b - (n - 1) / 2) * 56); g2.add(gl);
              const wine = new T.Mesh(new T.CylinderGeometry(22, 9, 30, 12), fizz); wine.position.copy(gl.position).y -= 6; g2.add(wine);
            }
          }
        } else if (k === 'chips') {
          const cols = ['#c0392b', '#1f618d', '#1e8449', '#111111', '#7d3c98'];
          for (let st = 0; st < 5; st++) {
            const h = 6 + Math.floor(rnd() * 14), ox = Math.cos(st / 5 * TAU) * 70, oz = Math.sin(st / 5 * TAU) * 70;
            for (let c = 0; c < h; c++) { const ch = new T.Mesh(new T.CylinderGeometry(46, 46, 12, 24), std(cols[st])); ch.position.set(ox + rr(-2, 2), 6 + c * 12.5, oz + rr(-2, 2)); ch.castShadow = true; g2.add(ch); }
          }
        } else if (k === 'dice') {
          for (let d2 = 0; d2 < 2; d2++) {
            const die = new T.Mesh(new T.BoxGeometry(150, 150, 150), std(d2 ? '#c0392b' : '#fafafa', { roughness: 0.2 }));
            die.position.set(d2 * 190 - 95, 75, d2 * 40); die.rotation.set(0, d2 * 0.7, 0); die.castShadow = true; g2.add(die);
            for (let q = 0; q < 5; q++) { const pip = new T.Mesh(new T.SphereGeometry(14, 8, 6), std(d2 ? '#ffffff' : '#111111')); pip.position.set(d2 * 190 - 95 + [-40, 40, 0, -40, 40][q], 151, d2 * 40 + [-40, -40, 0, 40, 40][q]); g2.add(pip); }
          }
          updaters.push((t) => { g2.children[0].rotation.y = Math.sin(t * 0.7 + i) * 0.1; });
        } else if (k === 'slot') {
          const cab = new T.Mesh(new T.BoxGeometry(220, 380, 160), std('#7a1020', { roughness: 0.3, metalness: 0.3 })); cab.position.y = 190; cab.castShadow = true; g2.add(cab);
          const topper = new T.Mesh(new T.CylinderGeometry(110, 110, 160, 24, 1, false, 0, Math.PI), gold); topper.rotation.z = Math.PI / 2; topper.rotation.y = Math.PI / 2; topper.position.y = 380; g2.add(topper);
          const reels = [];
          const sym = canvasTex(64, 256, (x) => { const s2 = ['7', '♠', 'BAR', '♥', '$']; s2.forEach((c, k2) => { x.fillStyle = k2 % 2 ? '#fff8e0' : '#fff'; x.fillRect(0, k2 * 51, 64, 51); x.fillStyle = ['#c0392b', '#111', '#1f618d', '#c0392b', '#1e8449'][k2]; x.font = 'bold ' + (c.length > 1 ? 18 : 34) + 'px Georgia'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(c, 32, k2 * 51 + 26); }); });
          sym.wrapT = T.RepeatWrapping;
          for (let k2 = 0; k2 < 3; k2++) {
            const reel = new T.Mesh(new T.CylinderGeometry(34, 34, 52, 20), new T.MeshBasicMaterial({ map: sym }));
            reel.rotation.z = Math.PI / 2; reel.position.set((k2 - 1) * 58, 250, 70); g2.add(reel); reels.push(reel);
          }
          const lever = new T.Mesh(new T.CylinderGeometry(6, 6, 150, 8), gold); lever.position.set(128, 260, 0); g2.add(lever);
          const knob = new T.Mesh(new T.SphereGeometry(18, 12, 8), std('#c0392b', { roughness: 0.2 })); knob.position.set(128, 340, 0); g2.add(knob);
          updaters.push((t, dt) => { reels.forEach((rl, k2) => { rl.rotation.x += dt * (6 + k2 * 2) * (Math.sin(t * 0.5 + i) > 0 ? 1 : 0.05); }); });
        } else if (k === 'roulette') {
          const bowl = new T.Mesh(new T.CylinderGeometry(230, 250, 40, 37), std('#4a2414', { roughness: 0.3 })); bowl.position.y = 20; g2.add(bowl);
          const disk = new T.Mesh(new T.CylinderGeometry(200, 200, 44, 37), M('roulette2', () => new T.MeshStandardMaterial({ map: canvasTex(256, 256, (x) => { for (let n = 0; n < 37; n++) { x.fillStyle = n === 0 ? '#1e8449' : n % 2 ? '#c0392b' : '#111111'; x.beginPath(); x.moveTo(128, 128); x.arc(128, 128, 128, n / 37 * TAU, (n + 1) / 37 * TAU); x.fill(); } }), roughness: 0.3 })));
          disk.position.y = 24; g2.add(disk);
          const ball = new T.Mesh(new T.SphereGeometry(12, 10, 8), std('#ffffff', { roughness: 0.1 })); g2.add(ball);
          updaters.push((t, dt) => { disk.rotation.y += dt * 1.2; ball.position.set(Math.cos(-t * 3) * 175, 50, Math.sin(-t * 3) * 175); });
        }
      });
    }

    // ------------------------------------------------------------ marquee bulbs on the rim
    {
      const pts = [];
      const inset = half + 210, step = 170;
      for (let s = -inset; s <= inset; s += step) { pts.push([s, inset]); pts.push([s, -inset]); pts.push([inset, s]); pts.push([-inset, s]); }
      const bulbs = new T.InstancedMesh(new T.SphereGeometry(22, 10, 8), new T.MeshBasicMaterial({ color: 0xffffff }), pts.length);
      bulbs.instanceColor = new T.InstancedBufferAttribute(new Float32Array(pts.length * 3), 3);
      const d = new T.Object3D();
      pts.forEach(([x, y], i) => { d.position.copy(W2T(x, y, RIM_TOP + 22)); d.updateMatrix(); bulbs.setMatrixAt(i, d.matrix); });
      // order bulbs around the perimeter so the chase runs in a loop
      const order = pts.map(([x, y], i) => ({ i, a: Math.atan2(y, x) })).sort((a, b) => a.a - b.a).map((o, k) => [o.i, k]);
      S.add(bulbs);
      const on = new T.Color('#ffe08a').multiplyScalar(3.2), off = new T.Color('#5a4320');
      updaters.push((t) => {
        const head = Math.floor(t * 14);
        for (const [i, k] of order) bulbs.setColorAt(i, ((k + head) % 6) < 3 ? on : off);
        bulbs.instanceColor.needsUpdate = true;
      });
    }

    // ------------------------------------------------------------ lane chevrons flowing to the vault
    {
      const chev = new T.Shape();
      chev.moveTo(-34, -18); chev.lineTo(0, 16); chev.lineTo(34, -18); chev.lineTo(34, -4); chev.lineTo(0, 30); chev.lineTo(-34, -4); chev.closePath();
      const cg = new T.ShapeGeometry(chev); cg.rotateX(-Math.PI / 2);
      const lanes = [];
      let total = 0;
      for (const p of g.players) { const n = Math.floor(p.lane.len / 230); lanes.push({ p, n }); total += n; }
      const mesh = new T.InstancedMesh(cg, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending }), total);
      mesh.instanceColor = new T.InstancedBufferAttribute(new Float32Array(total * 3), 3);
      let k = 0;
      for (const L of lanes) { const c = new T.Color(L.p.color).multiplyScalar(1.6); for (let i = 0; i < L.n; i++) mesh.setColorAt(k++, c); }
      mesh.instanceColor.needsUpdate = true;
      mesh.frustumCulled = false;
      S.add(mesh);
      const d = new T.Object3D();
      updaters.push((t) => {
        let k = 0;
        for (const L of lanes) {
          const lane = L.p.lane, off = (t * 160) % 230;
          for (let i = 0; i < L.n; i++) {
            const pt = g.pointAt(lane, i * 230 + off);
            const dir = pt.dir != null ? pt.dir : 0;
            d.position.copy(W2T(pt.x, pt.y, 3));
            d.rotation.set(0, Math.atan2(Math.cos(dir), -Math.sin(dir)) + Math.PI, 0);
            const alive = L.p.alive ? 1 : 0.0001;
            d.scale.set(alive, 1, alive);
            d.updateMatrix(); mesh.setMatrixAt(k++, d.matrix);
          }
        }
        mesh.instanceMatrix.needsUpdate = true;
      });
    }

    // ------------------------------------------------------------ clutter on top of the walls
    {
      const walls = r.rectsOf(2).filter(w => {
        const cx = map.origin + (w.x0 + w.x1) / 2 * cell, cy = map.origin + (w.y0 + w.y1) / 2 * cell;
        const edge = w.x0 === 0 || w.y0 === 0 || w.x1 === map.size || w.y1 === map.size;
        return !(Math.abs(cx) < 700 && Math.abs(cy) < 700) && !(edge && (w.x1 - w.x0 > 300 || w.y1 - w.y0 > 300)) && (w.x1 - w.x0) * (w.y1 - w.y0) >= 4;
      });
      const chipColors = ['#c0392b', '#1f618d', '#1e8449', '#111111', '#f4efe2', '#7d3c98', '#d4a62a'];
      const chipSide = std('#ffffff', { roughness: 0.35 });
      const chips = instanced(S, new T.CylinderGeometry(1, 1, 1, 18), chipSide, 1400, true);
      const cards = instanced(S, new T.BoxGeometry(1, 1, 1), std('#fbf8f1', { roughness: 0.4 }), 500);
      const dice = instanced(S, new T.BoxGeometry(1, 1, 1), std('#f5f5f5', { roughness: 0.25 }), 300, true);
      const pips = instanced(S, new T.SphereGeometry(1, 6, 4), std('#111111'), 1200);
      const gold = instanced(S, new T.BoxGeometry(1, 1, 1), std('#e6b422', { metalness: 0.95, roughness: 0.2 }), 300);
      const cash = instanced(S, new T.BoxGeometry(1, 1, 1), std('#5f8f4e', { roughness: 0.8 }), 300);
      const band = instanced(S, new T.BoxGeometry(1, 1, 1), std('#e8d6a0', { roughness: 0.6 }), 300);
      const glassG = new T.LatheGeometry([new T.Vector2(0, 0), new T.Vector2(16, 0), new T.Vector2(3, 3), new T.Vector2(3, 34), new T.Vector2(26, 58), new T.Vector2(27, 60)], 16);
      const glass = instanced(S, glassG, M('glass', () => new T.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.05, transmission: 0.0, transparent: true, opacity: 0.35, metalness: 0.1, clearcoat: 1 })), 150);
      const drink = instanced(S, new T.ConeGeometry(1, 1, 16), glow('#ff6f91', 1.1), 150);
      for (const w of walls) {
        const W = (w.x1 - w.x0) * cell, H = (w.y1 - w.y0) * cell;
        const cx = map.origin + w.x0 * cell + W / 2, cy = map.origin + w.y0 * cell + H / 2;
        const n = Math.max(1, Math.min(6, Math.floor(W * H / 60000)));
        for (let i = 0; i < n; i++) {
          const x = cx + rr(-W / 2 + 45, W / 2 - 45), y = cy + rr(-H / 2 + 45, H / 2 - 45);
          const kind = rnd();
          const top = WALL_H + 6;
          if (kind < 0.35) {          // chip stack
            const c = chipColors[Math.floor(rnd() * chipColors.length)], h = Math.floor(rr(3, 12));
            for (let k = 0; k < h; k++) chips.add(W2T(x + rr(-1.5, 1.5), y + rr(-1.5, 1.5), top + 4 + k * 8), rnd() * TAU, [26, 7.6, 26], c);
          } else if (kind < 0.55) {   // fanned cards
            for (let k = 0; k < 5; k++) cards.add(W2T(x + k * 10, y + k * 4, top + 1 + k * 0.8), rr(-0.3, 0.3) + k * 0.18, [52, 1.2, 70]);
          } else if (kind < 0.68) {   // a pair of dice
            for (let k = 0; k < 2; k++) {
              const p = W2T(x + k * 42, y + rr(-10, 10), top + 15), ry = rnd() * TAU;
              dice.add(p, ry, [30, 30, 30], k ? '#c0392b' : '#f5f5f5');
              for (let q = 0; q < 3; q++) pips.add(new T.Vector3(p.x + Math.cos(ry) * (q - 1) * 8, top + 31, p.z - Math.sin(ry) * (q - 1) * 8), 0, [3.4, 1.5, 3.4]);
            }
          } else if (kind < 0.8) {    // gold bars
            for (let k = 0; k < 3; k++) gold.add(W2T(x + (k % 2) * 46 - (k > 1 ? 23 : 0), y, top + 10 + (k > 1 ? 20 : 0)), 0.1, [42, 18, 22]);
          } else if (kind < 0.92) {   // banded cash
            for (let k = 0; k < 3; k++) { const p = W2T(x, y, top + 6 + k * 12); cash.add(p, 0.3 + k * 0.1, [64, 11, 30]); band.add(p, 0.3 + k * 0.1, [14, 12, 31]); }
          } else {                    // cocktail
            glass.add(W2T(x, y, top), 0, [1, 1, 1]);
            drink.add(W2T(x, y, top + 46), 0, [20, 22, 20], null, Math.PI);
          }
        }
      }
      [chips, cards, dice, pips, gold, cash, band, glass, drink].forEach(i => i.done());
    }

    // ------------------------------------------------------------ lit casino arches over the spawn doors
    {
      const bulbM = new T.MeshBasicMaterial({ color: new T.Color('#ffe08a').multiplyScalar(2.8) });
      const bulbG = new T.SphereGeometry(10, 8, 6);
      const done = new Set();
      for (const p of g.players) {
        const s = p.lane.path[0], key = Math.round(s.x / 500) + ',' + Math.round(s.y / 500);
        const arch = new T.Group(); arch.position.copy(W2T(s.x, s.y, 0));
        arch.rotation.y = Math.atan2(-s.x, s.y) + Math.PI;   // face the table centre
        const gold = std('#c9a043', { metalness: 0.9, roughness: 0.25 });
        for (const side of [-1, 1]) {
          const col = new T.Mesh(new T.CylinderGeometry(22, 26, 360, 16), std('#8f877a', { roughness: 0.45, envMapIntensity: 0.4 }));
          col.position.set(side * 230, 180, 0); col.castShadow = true; arch.add(col);
          const cap = new T.Mesh(new T.BoxGeometry(70, 26, 70), gold); cap.position.set(side * 230, 372, 0); arch.add(cap);
        }
        if (!done.has(key)) {
          const span = new T.Mesh(new T.TorusGeometry(230, 20, 10, 40, Math.PI), gold);
          span.position.y = 380; span.castShadow = true; arch.add(span);
          for (let k = 0; k <= 16; k++) { const a = k / 16 * Math.PI; const b = new T.Mesh(bulbG, bulbM); b.position.set(Math.cos(a) * 230, 380 + Math.sin(a) * 230, 22); arch.add(b); }
          const sign = new T.Sprite(new T.SpriteMaterial({ map: neonText('LOOTERS', '#ff3d6e'), transparent: true, depthWrite: false }));   // sprite: always readable
          sign.scale.set(320, 80, 1); sign.position.set(0, 520, 0); arch.add(sign);
          done.add(key);
        }
        S.add(arch);
      }
    }

    // ------------------------------------------------------------ jackpot plaza around the vault
    {
      const marble = std('#efe8da', { roughness: 0.3 });
      const gold = std('#d4a62a', { metalness: 0.95, roughness: 0.2 });
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU + TAU / 16;
        const col = new T.Mesh(new T.CylinderGeometry(26, 30, 420, 16), marble);
        col.position.set(Math.cos(a) * 640, 210, Math.sin(a) * 640); col.castShadow = true; S.add(col);
        const cap = new T.Mesh(new T.CylinderGeometry(44, 34, 30, 16), gold); cap.position.set(Math.cos(a) * 640, 430, Math.sin(a) * 640); S.add(cap);
        const flame = new T.Mesh(new T.SphereGeometry(18, 12, 8), glow('#ffcf6b', 3)); flame.position.set(Math.cos(a) * 640, 462, Math.sin(a) * 640); S.add(flame);
      }
      const ring = new T.Mesh(new T.TorusGeometry(640, 14, 8, 80), gold); ring.rotation.x = Math.PI / 2; ring.position.y = 446; S.add(ring);
      const sign = new T.Group(); sign.position.y = 760; S.add(sign);
      const tex = neonText('JACKPOT', '#ffd34d', 1024, 220);
      for (let k = 0; k < 4; k++) {
        const pl = new T.Mesh(new T.PlaneGeometry(760, 165), new T.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: T.DoubleSide, color: new T.Color(1.6, 1.4, 1.0) }));
        pl.position.set(Math.cos(k / 4 * TAU) * 220, 0, Math.sin(k / 4 * TAU) * 220); pl.rotation.y = -k / 4 * TAU + Math.PI / 2; sign.add(pl);
      }
      updaters.push((t) => { sign.rotation.y = t * 0.3; sign.position.y = 760 + Math.sin(t * 1.3) * 20; });
    }

    // ------------------------------------------------------------ sky, clouds and the floating table
    {
      // gradient sky dome with a soft sun glow
      const sky = new T.Mesh(new T.SphereGeometry(60000, 48, 24), new T.ShaderMaterial({
        side: T.BackSide, depthWrite: false, fog: false,
        uniforms: { top: { value: new T.Color('#2f7fe0') }, mid: { value: new T.Color('#8cc9ff') }, horizon: { value: new T.Color('#e4f4ff') }, sun: { value: new T.Vector3(-0.45, 0.55, 0.7).normalize() } },
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sun; varying vec3 vDir;
          void main(){
            float h = vDir.y;
            vec3 c = h > 0.0 ? mix(mix(horizon, mid, smoothstep(0.0, 0.25, h)), top, smoothstep(0.25, 0.9, h)) : mix(horizon, vec3(0.42, 0.7, 1.0), smoothstep(0.0, -0.35, h));   // open sky below the table too
            float s = max(0.0, dot(vDir, sun));
            c += vec3(1.0, 0.93, 0.75) * (pow(s, 400.0) * 1.2 + pow(s, 12.0) * 0.18);
            gl_FragColor = vec4(c, 1.0);
          }`,
      }));
      sky.renderOrder = -10; sky.frustumCulled = false;
      S.add(sky);
      updaters.push(() => { sky.position.copy(r.camera.position); });

      // puffy cartoon clouds: clusters of spheres, all in one instanced draw
      const puffs = [];
      const cloud = (cx, cy, cz, size, n) => {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd() * 0.6, d = size * (0.35 + rnd() * 0.75);
          const s = size * (0.45 + rnd() * 0.45) * (i === 0 ? 1.3 : 1);
          puffs.push([cx + Math.cos(a) * d, cy + rnd() * size * 0.35 - (i % 3 === 0 ? size * 0.12 : 0), cz + Math.sin(a) * d * 0.6, s, s * 0.72, s]);
        }
      };
      const edge = half + 700;
      for (let i = 0; i < 30; i++) {               // scattered clouds drifting below the table
        const a = (i / 30) * Math.PI * 2 + rnd() * 0.2, R = edge + 2500 + rnd() * 18000;
        cloud(Math.cos(a) * R, -3800 - rnd() * 4000, Math.sin(a) * R, 1100 + rnd() * 1300, 6 + Math.floor(rnd() * 4));
      }
      for (let i = 0; i < 10; i++) {               // tucked right under the table so it sits on a bed of cloud
        const a = (i / 10) * Math.PI * 2, R = edge * (0.55 + rnd() * 0.35);
        cloud(Math.cos(a) * R, -3700 - rnd() * 400, Math.sin(a) * R, 1300 + rnd() * 500, 9);   // small enough to stay under the board
      }
      for (let i = 0; i < 26; i++) {               // big clouds out on the horizon
        const a = rnd() * Math.PI * 2, R = 44000 + rnd() * 10000;
        cloud(Math.cos(a) * R, -2000 + rnd() * 7000, Math.sin(a) * R, 3500 + rnd() * 3000, 8 + Math.floor(rnd() * 5));
      }
      // kept below the bloom threshold so sunlit clouds read white without glowing over the board
      const cloudMat = new T.MeshToonMaterial({ color: new T.Color('#ffffff').multiplyScalar(0.48), emissive: new T.Color('#9cc2e8').multiplyScalar(0.12), fog: false });
      const clouds = new T.InstancedMesh(new T.SphereGeometry(1, 18, 12), cloudMat, puffs.length);
      const m4 = new T.Matrix4(), q = new T.Quaternion();
      puffs.forEach((p, i) => clouds.setMatrixAt(i, m4.compose(new T.Vector3(p[0], p[1], p[2]), q, new T.Vector3(p[3], p[4], p[5]))));
      clouds.instanceMatrix.needsUpdate = true;
      const cloudG = new T.Group(); cloudG.add(clouds); S.add(cloudG);
      updaters.push((t) => { cloudG.rotation.y = t * 0.004; });

      // the table's thick edge: lacquered skirt, gold trim and a tapering base under it all
      const W = map.size * cell + 840;   // board plus the rim on both sides
      const lacq = std('#7a3b1c', { roughness: 0.45 });
      const skirt = new T.Mesh(new T.BoxGeometry(W + 60, 520, W + 60), lacq); skirt.position.y = -1100; S.add(skirt);
      const trim = new T.Mesh(new T.BoxGeometry(W + 90, 70, W + 90), std('#e1b12c', { metalness: 0.85, roughness: 0.25 })); trim.position.y = -880; S.add(trim);
      const trim2 = new T.Mesh(new T.BoxGeometry(W + 90, 50, W + 90), std('#e1b12c', { metalness: 0.85, roughness: 0.25 })); trim2.position.y = -1360; S.add(trim2);
      const base = new T.Mesh(new T.CylinderGeometry(W * 0.71, W * 0.42, 1500, 4, 1), std('#4a2312', { roughness: 0.55 }));
      base.rotation.y = Math.PI / 4; base.position.y = -2130; S.add(base);
      const foot = new T.Mesh(new T.CylinderGeometry(W * 0.42, W * 0.3, 300, 4, 1), std('#e1b12c', { metalness: 0.85, roughness: 0.3 }));
      foot.rotation.y = Math.PI / 4; foot.position.y = -3010; S.add(foot);
      // gold studs along the skirt
      const studs = [];
      for (let k = 0; k < 4; k++) for (let i = 0; i < 28; i++) {
        const u = (i + 0.5) / 28 * W - W / 2, o = W / 2 + 32;
        studs.push(k === 0 ? [u, o] : k === 1 ? [u, -o] : k === 2 ? [o, u] : [-o, u]);
      }
      const studM = new T.InstancedMesh(new T.SphereGeometry(38, 12, 8), std('#ffd34d', { metalness: 0.9, roughness: 0.2 }), studs.length);
      studs.forEach(([x, z], i) => studM.setMatrixAt(i, m4.compose(new T.Vector3(x, -1100, z), q, new T.Vector3(1, 1, 1))));
      studM.instanceMatrix.needsUpdate = true; S.add(studM);
    }

    return { update(t, dt) { for (const u of updaters) u(t, dt); } };
  }

  // Printed table markings drawn onto the board texture (3D only): gold filigree,
  // suit emblems and a BLB seal on open felt.
  function decorateBoard(ctx, px, map, upp) {
    const toPx = (wx, wy) => [(wx - map.origin) / upp, px - (wy - map.origin) / upp];
    ctx.save();
    const seal = (wx, wy, r) => {
      const [x, y] = toPx(wx, wy), R = r / upp;
      const glow = ctx.createRadialGradient(x, y, R * 0.2, x, y, R * 1.15);
      glow.addColorStop(0, 'rgba(255,240,170,0.28)'); glow.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(x, y, R * 1.15, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(240,190,70,0.75)'; ctx.lineWidth = Math.max(1, 12 / upp);
      ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, R * 0.82, 0, TAU); ctx.stroke();
      ctx.fillStyle = 'rgba(245,200,80,0.6)';
      ctx.font = 'bold ' + Math.round(R * 0.62) + 'px Georgia, serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('BLB', x, y + R * 0.04);
      ctx.font = Math.round(R * 0.22) + 'px Georgia, serif';
      ['♠', '♥', '♦', '♣'].forEach((s, i) => { const a = i / 4 * TAU - Math.PI / 4; ctx.fillText(s, x + Math.cos(a) * R * 0.91, y + Math.sin(a) * R * 0.91); });
    };
    // quilted felt: each diamond gets a soft raised highlight, creased edges and gold stitching
    const q = 420 / upp;
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    for (let i = -2; i < px / q + 2; i++) for (let j = -2; j < px / q * 2 + 2; j++) {
      const cx = i * q + (j % 2 ? q / 2 : 0), cy = j * q / 2;
      const gr = ctx.createRadialGradient(cx - q * 0.12, cy - q * 0.16, q * 0.05, cx, cy, q * 0.55);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.0)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)');
      ctx.fillStyle = gr;
      ctx.beginPath(); ctx.moveTo(cx, cy - q / 2); ctx.lineTo(cx + q / 2, cy); ctx.lineTo(cx, cy + q / 2); ctx.lineTo(cx - q / 2, cy); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = 'rgba(0,40,20,0.35)'; ctx.lineWidth = Math.max(1, 8 / upp);
    for (let k = -px; k < px * 2; k += q) {
      ctx.beginPath(); ctx.moveTo(k + q / 2, 0); ctx.lineTo(k + q / 2 + px, px); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(k + q / 2, 0); ctx.lineTo(k + q / 2 - px, px); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,214,110,0.45)'; ctx.lineWidth = Math.max(1, 4 / upp); ctx.setLineDash([10 / upp, 9 / upp]);
    for (let k = -px; k < px * 2; k += q) {
      ctx.beginPath(); ctx.moveTo(k + q / 2 + 16 / upp, 0); ctx.lineTo(k + q / 2 + px + 16 / upp, px); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(k + q / 2 + 16 / upp, 0); ctx.lineTo(k + q / 2 - px + 16 / upp, px); ctx.stroke();
    }
    ctx.setLineDash([]);
    // big seals in the open felt between lanes on each side of the vault
    [[-2300, 2300], [2300, 2300], [2300, -2300], [-2300, -2300]].forEach(([x, y]) => seal(x, y, 700));
    // scattered suit emblems on open felt
    let s = 42;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    ctx.font = Math.round(120 / upp) + 'px Georgia, serif';
    for (let i = 0; i < 260; i++) {
      const wx = map.origin + r() * map.size * map.cell, wy = map.origin + r() * map.size * map.cell;
      if (map.cellAt(wx, wy) !== 0) continue;
      const [x, y] = toPx(wx, wy);
      ctx.fillStyle = ['rgba(10,40,30,0.22)', 'rgba(255,70,90,0.26)', 'rgba(255,90,70,0.26)', 'rgba(10,40,30,0.22)'][i % 4];
      ctx.fillText(['♠', '♥', '♦', '♣'][i % 4], x, y);
    }
    // gold filigree border around the playfield
    const [x0, y0] = toPx(-5700, 5700), [x1, y1] = toPx(5700, -5700);
    ctx.strokeStyle = 'rgba(214,170,72,0.45)'; ctx.lineWidth = Math.max(1, 14 / upp);
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.lineWidth = Math.max(1, 6 / upp);
    ctx.strokeRect(x0 + 40 / upp, y0 + 40 / upp, x1 - x0 - 80 / upp, y1 - y0 - 80 / upp);
    ctx.restore();
  }

  PTD.Scenery3D = { build, decorateBoard };
})();
