// Set dressing for the 3D view: a jungle clearing. Weathered paving and grass tufts on the old roads,
// bushes and landmarks on the hedgerows, stone gates over the looters' doors, a temple ring round the
// vault, a river with bridges, a forest, and a cheering crowd of villagers and animals at the edge.
// PTD.Scenery3D.build(renderer) -> { update(timeSeconds, dt) }
window.PTD = window.PTD || {};

(function () {
  if (!window.THREE) return;
  const T = window.THREE;
  const TAU = Math.PI * 2;
  const W2T = (x, y, h) => new T.Vector3(x, h || 0, -y);
  const FELT_H = 24;   // must match render3d.js

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

  // ---------------------------------------------------------------- jungle kit
  // Unit primitives shared by everything below.
  const SPH = new T.SphereGeometry(1, 12, 8), CYL = new T.CylinderGeometry(1, 1, 1, 10), CONE = new T.ConeGeometry(1, 1, 10);
  const ICO = new T.IcosahedronGeometry(1, 1), BOX = new T.BoxGeometry(1, 1, 1);
  const TAIL = new T.TorusGeometry(1, 0.22, 6, 14, Math.PI * 1.3);

  // Bake a list of coloured parts into one vertex-coloured geometry (one draw call per creature type).
  // part = [geometry, colour, [x,y,z], [rx,ry,rz], [sx,sy,sz]]
  function bake(parts) {
    const pos = [], nor = [], col = [], idx = [];
    const m = new T.Matrix4(), nm = new T.Matrix3(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), c = new T.Color();
    let off = 0;
    for (const [g, hex, p, r, s] of parts) {
      m.compose(new T.Vector3(p[0], p[1], p[2]), q.setFromEuler(e.set((r || [])[0] || 0, (r || [])[1] || 0, (r || [])[2] || 0)), new T.Vector3(...(s || [1, 1, 1])));
      nm.getNormalMatrix(m); c.set(hex);
      const P = g.attributes.position, N = g.attributes.normal;
      for (let i = 0; i < P.count; i++) {
        v.fromBufferAttribute(P, i).applyMatrix4(m); pos.push(v.x, v.y, v.z);
        v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
        col.push(c.r, c.g, c.b);
      }
      if (g.index) for (const k of g.index.array) idx.push(k + off); else for (let k = 0; k < P.count; k++) idx.push(k + off);
      off += P.count;
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    out.setIndex(idx);
    out.computeBoundingSphere();
    return out;
  }
  const vcMat = () => M('vc', () => new T.MeshToonMaterial({ vertexColors: true, color: '#a8a8a8' }));   // vertex colours are authored bright; keep them under the bloom threshold
  const eyes = (y, z, dx, r) => [[SPH, '#ffffff', [-dx, y, z], 0, [r, r * 1.15, r * 0.6]], [SPH, '#ffffff', [dx, y, z], 0, [r, r * 1.15, r * 0.6]],
    [SPH, '#1a1a1a', [-dx, y, z + r * 0.45], 0, [r * 0.5, r * 0.6, r * 0.3]], [SPH, '#1a1a1a', [dx, y, z + r * 0.45], 0, [r * 0.5, r * 0.6, r * 0.3]]];

  // ---- the crowd: villagers and jungle animals, all modelled facing +z, standing on y = 0
  const SKINS = ['#f1c27d', '#c68642', '#8d5524', '#e0ac69', '#ffdbac'];
  function villager(k) {
    const skin = SKINS[k % SKINS.length], shirt = ['#e74c3c', '#3498db', '#f1c40f', '#9b59b6', '#1abc9c', '#e67e22'][k % 6];
    const pants = ['#2c3e50', '#6d4c41', '#34495e'][k % 3], cheer = k % 2 === 0;
    const p = [
      [CYL, pants, [-17, 40, 0], 0, [13, 80, 13]], [CYL, pants, [17, 40, 0], 0, [13, 80, 13]],
      [SPH, '#3b2a1a', [-17, 5, 8], 0, [15, 9, 21]], [SPH, '#3b2a1a', [17, 5, 8], 0, [15, 9, 21]],
      [SPH, shirt, [0, 118, 0], 0, [42, 54, 34]],
      [SPH, skin, [0, 206, 2], 0, [42, 41, 39]], [SPH, skin, [0, 200, 40], 0, [8, 8, 8]],
      ...eyes(214, 33, 14, 9),
      [SPH, '#7a2e1a', [0, 188, 36], [0.3, 0, 0], [12, 6, 5]],   // open, cheering mouth
    ];
    if (cheer) p.push([CYL, skin, [-46, 178, 0], [0, 0, 0.35], [10, 70, 10]], [CYL, skin, [46, 178, 0], [0, 0, -0.35], [10, 70, 10]],
      [SPH, skin, [-58, 214, 0], 0, [13, 13, 13]], [SPH, skin, [58, 214, 0], 0, [13, 13, 13]]);
    else p.push([CYL, skin, [-48, 110, 4], [0.3, 0, 0.25], [10, 66, 10]], [CYL, skin, [48, 110, 4], [0.3, 0, -0.25], [10, 66, 10]],
      [SPH, skin, [-54, 82, 16], 0, [12, 12, 12]], [SPH, skin, [54, 82, 16], 0, [12, 12, 12]]);
    const hat = k % 3;
    if (hat === 0) p.push([CYL, '#e8c872', [0, 240, 0], 0, [66, 5, 66]], [CONE, '#d9b45a', [0, 262, 0], 0, [36, 40, 36]], [CYL, '#c0392b', [0, 246, 0], 0, [37, 6, 37]]);   // straw hat
    else if (hat === 1) p.push([SPH, ['#2b1d12', '#5a3a22', '#111111'][k % 3], [0, 224, -6], 0, [44, 30, 42]]);                                                       // hair
    else p.push([SPH, '#2b1d12', [0, 222, -6], 0, [43, 28, 41]], [CYL, shirt, [0, 226, 0], 0, [44, 8, 44]], [BOX, '#f1c40f', [0, 270, -30], [0.4, 0, 0], [6, 50, 3]]);  // headband + feather
    if (k % 4 === 1) p.push([CYL, '#8d6e63', [62, 150, 10], 0, [3, 150, 3]], [BOX, shirt, [86, 205, 10], 0, [46, 30, 2]]);   // waving a little flag
    return p;
  }
  function monkey(k) {
    const fur = ['#7b4a2a', '#5e3a22', '#8a5a34'][k % 3], tan = '#e3bf8f';
    return [
      [SPH, fur, [0, 70, 0], 0, [42, 50, 38]], [SPH, tan, [0, 66, 18], 0, [28, 36, 24]],
      [SPH, fur, [-22, 26, 18], 0, [17, 14, 26]], [SPH, fur, [22, 26, 18], 0, [17, 14, 26]],
      [CYL, fur, [-38, 128, 0], [0, 0, 0.55], [9, 64, 9]], [CYL, fur, [38, 128, 0], [0, 0, -0.55], [9, 64, 9]],
      [SPH, tan, [-56, 158, 0], 0, [11, 11, 11]], [SPH, tan, [56, 158, 0], 0, [11, 11, 11]],
      [SPH, fur, [0, 140, 4], 0, [35, 32, 32]], [SPH, tan, [0, 132, 26], 0, [25, 20, 14]],
      [SPH, fur, [-34, 148, 0], 0, [13, 13, 6]], [SPH, fur, [34, 148, 0], 0, [13, 13, 6]],
      [SPH, tan, [-34, 148, 3], 0, [8, 8, 4]], [SPH, tan, [34, 148, 3], 0, [8, 8, 4]],
      ...eyes(146, 26, 11, 8), [SPH, '#4a2a1a', [0, 124, 38], 0, [10, 5, 4]],
      [TAIL, fur, [0, 70, -40], [Math.PI / 2, 0, 0.4], [40, 40, 40]],
    ];
  }
  function bird(k) {
    const toucan = k % 2 === 1, body = toucan ? '#1b1b1b' : ['#e74c3c', '#2ecc71', '#3498db'][k % 3];
    const p = [
      [CYL, '#6d4c41', [0, 90, 0], 0, [8, 180, 8]], [CYL, '#6d4c41', [0, 180, 0], [0, 0, Math.PI / 2], [6, 80, 6]],
      [SPH, body, [0, 212, 0], [0.25, 0, 0], [22, 34, 20]], [SPH, body, [0, 248, 6], 0, [18, 18, 18]],
      [SPH, toucan ? '#ffffff' : '#f1c40f', [0, 214, 14], 0, [14, 22, 10]],
      [SPH, toucan ? '#1b1b1b' : '#1f618d', [-19, 212, -2], [0, 0, 0.2], [8, 28, 16]], [SPH, toucan ? '#1b1b1b' : '#1f618d', [19, 212, -2], [0, 0, -0.2], [8, 28, 16]],
      [CONE, body, [0, 180, -16], [2.8, 0, 0], [9, 40, 9]],
      ...eyes(254, 15, 8, 6),
    ];
    if (toucan) p.push([CONE, '#ff8c1a', [0, 246, 40], [Math.PI / 2, 0, 0], [12, 44, 12]], [SPH, '#ffd23f', [0, 248, 22], 0, [12, 12, 12]]);
    else p.push([CONE, '#f1c40f', [0, 244, 24], [Math.PI / 2 + 0.3, 0, 0], [7, 16, 7]]);
    return p;
  }
  function elephant() {
    const g = '#9aa1a6', d = '#7f868b';
    return [
      [SPH, g, [0, 175, 0], 0, [110, 95, 140]],
      ...[[-60, 70], [60, 70], [-60, -70], [60, -70]].map(([x, z]) => [CYL, d, [x, 62, z], 0, [28, 125, 28]]),
      [SPH, g, [0, 215, 135], 0, [72, 70, 62]],
      [SPH, d, [-82, 220, 112], [0, 0.4, 0], [10, 66, 58]], [SPH, d, [82, 220, 112], [0, -0.4, 0], [10, 66, 58]],
      [SPH, '#e6a3a8', [-76, 220, 118], [0, 0.4, 0], [6, 50, 42]], [SPH, '#e6a3a8', [76, 220, 118], [0, -0.4, 0], [6, 50, 42]],
      [CYL, g, [0, 250, 190], [-0.5, 0, 0], [17, 95, 17]], [CYL, g, [0, 318, 218], [-1.1, 0, 0], [12, 55, 12]],   // trunk raised in a trumpet
      [CONE, '#fffbe8', [-26, 172, 182], [1.9, 0, 0], [8, 44, 8]], [CONE, '#fffbe8', [26, 172, 182], [1.9, 0, 0], [8, 44, 8]],
      ...eyes(238, 186, 32, 10),
      [CYL, d, [0, 150, -142], [0.5, 0, 0], [5, 60, 5]],
    ];
  }
  function giraffe() {
    const y = '#f4c64e', sp = '#a0612b';
    const p = [
      ...[[-26, 40], [26, 40], [-26, -44], [26, -44]].map(([x, z]) => [CYL, y, [x, 112, z], 0, [10, 225, 10]]),
      [SPH, y, [0, 250, 0], 0, [46, 44, 74]],
      [CYL, y, [0, 372, 44], [0.32, 0, 0], [17, 240, 17]],
      [SPH, y, [0, 488, 88], 0, [23, 21, 36]], [SPH, '#e9b77a', [0, 482, 116], 0, [15, 13, 12]],
      [CYL, sp, [-10, 518, 80], 0, [3, 26, 3]], [CYL, sp, [10, 518, 80], 0, [3, 26, 3]],
      [SPH, sp, [-10, 532, 80], 0, [6, 6, 6]], [SPH, sp, [10, 532, 80], 0, [6, 6, 6]],
      ...eyes(496, 104, 15, 7),
    ];
    for (let i = 0; i < 9; i++) p.push([SPH, sp, [Math.sin(i * 2.4) * 40, 250 + Math.cos(i * 1.7) * 26, -50 + i * 12], 0, [12, 10, 12]]);
    return p;
  }
  function frog() {
    return [[SPH, '#4caf50', [0, 26, 0], 0, [36, 26, 32]], [SPH, '#c5e1a5', [0, 22, 14], 0, [26, 18, 20]],
      [SPH, '#4caf50', [-16, 48, 12], 0, [13, 13, 13]], [SPH, '#4caf50', [16, 48, 12], 0, [13, 13, 13]], ...eyes(50, 22, 16, 8),
      [SPH, '#388e3c', [-28, 8, 20], 0, [16, 6, 14]], [SPH, '#388e3c', [28, 8, 20], 0, [16, 6, 14]]];
  }

  // ---- trees
  function broadleaf(k) {
    const t = '#6d4c41', greens = ['#3f8f3a', '#4ea345', '#2f7a33', '#5cb04e'], gr = (i) => greens[(k + i) % greens.length];
    return [[CYL, t, [0, 150, 0], 0, [26, 300, 26]], [CYL, t, [30, 250, 0], [0, 0, -0.6], [12, 120, 12]],
      [ICO, gr(0), [0, 330, 0], 0, [150, 120, 150]], [ICO, gr(1), [-95, 290, 40], 0, [100, 85, 100]], [ICO, gr(2), [90, 300, -30], 0, [105, 88, 105]], [ICO, gr(3), [10, 410, 10], 0, [95, 80, 95]]];
  }
  function palm(k) {
    const p = [], lean = 0.18 + (k % 3) * 0.08;
    let x = 0, y = 0;
    for (let i = 0; i < 6; i++) { const ang = lean * (i / 6); p.push([CYL, i % 2 ? '#8d6e4a' : '#7a5c3c', [x, y + 30, 0], [0, 0, -ang], [17 - i, 64, 17 - i]]); x += Math.sin(ang) * 60; y += Math.cos(ang) * 60; }
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * TAU;
      p.push([SPH, i % 2 ? '#3fa34d' : '#2e8b3e', [x + Math.cos(a) * 95, y - 10, Math.sin(a) * 95], [0, -a, -0.45], [110, 9, 28]]);
    }
    p.push([SPH, '#6b4a2a', [x + 12, y - 16, 8], 0, [14, 14, 14]], [SPH, '#6b4a2a', [x - 10, y - 18, -8], 0, [14, 14, 14]]);   // coconuts
    return p;
  }
  function bush(k) {
    const greens = ['#3f8f3a', '#4ea345', '#2f7a33', '#5cb04e', '#44973c'];
    const p = [[ICO, greens[k % 5], [0, 40, 0], 0, [70, 55, 70]], [ICO, greens[(k + 2) % 5], [-45, 30, 20], 0, [48, 40, 48]], [ICO, greens[(k + 3) % 5], [42, 32, -18], 0, [52, 42, 52]]];
    if (k % 3 === 0) for (let i = 0; i < 5; i++) p.push([SPH, ['#ff6fa8', '#ffd23f', '#ffffff'][(k + i) % 3], [Math.cos(i * 1.3) * 52, 60 + (i % 2) * 18, Math.sin(i * 1.3) * 52], 0, [9, 9, 9]]);
    return p;
  }

  // Many copies of a few baked variants, each variant one InstancedMesh.
  function herd(S, variants, spots, opts) {
    opts = opts || {};
    const groups = variants.map(() => []);
    spots.forEach((s, i) => groups[s.v != null ? s.v % variants.length : i % variants.length].push(s));
    const meshes = [];
    variants.forEach((parts, vi) => {
      const list = groups[vi]; if (!list.length) return;
      const mesh = new T.InstancedMesh(bake(parts), vcMat(), list.length);
      mesh.castShadow = opts.shadow !== false; mesh.receiveShadow = false;
      const d = new T.Object3D();
      list.forEach((s, i) => { d.position.set(s.x, s.y || 0, s.z); d.rotation.set(0, s.ry || 0, s.rz || 0); d.scale.setScalar(s.s || 1); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix); });
      mesh.instanceMatrix.needsUpdate = true; mesh.computeBoundingSphere();
      S.add(mesh); meshes.push({ mesh, list });
    });
    return meshes;
  }

  // A soft orange glow sprite that only shows at night (torches lighting up the dark).
  let haloTex = null;
  function nightHalo(size) {
    haloTex = haloTex || canvasTex(128, 128, (x) => { const g2 = x.createRadialGradient(64, 64, 0, 64, 64, 64); g2.addColorStop(0, 'rgba(255,190,110,1)'); g2.addColorStop(0.35, 'rgba(255,140,60,0.45)'); g2.addColorStop(1, 'rgba(255,120,40,0)'); x.fillStyle = g2; x.fillRect(0, 0, 128, 128); });
    const sp = new T.Sprite(new T.SpriteMaterial({ map: haloTex, color: new T.Color(1.6, 1.3, 1.0), transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending }));
    sp.scale.set(size, size, 1); return sp;
  }

  function build(r) {
    const S = r.scene, g = r.game, map = g.map, cell = map.cell, half = map.size * cell / 2;
    seed = 1234567;
    const updaters = [];
    const hi = r.quality === 'high';
    let cheer = () => {};
    const BAND = half - 16 * cell;                // inner edge of the empty strip round the board's border
    const inBand = (x, y) => Math.abs(x) > BAND || Math.abs(y) > BAND;

    // ------------------------------------------------------------ an old road: sunken, weathered paving stones
    {
      const rects = r.rectsOf(1);
      if (hi) {
        // old stones, many missing, the rest worn, tilted and sunk into the dirt road below
        const SW = 58, SD = 44, gap = 8;
        const spots = [];
        rects.forEach((q) => {
          const x0 = map.origin + q.x0 * cell, x1 = map.origin + q.x1 * cell, y0 = map.origin + q.y0 * cell, y1 = map.origin + q.y1 * cell;
          const r0 = Math.floor(y0 / (SD + gap)), r1 = Math.ceil(y1 / (SD + gap));
          for (let row = r0; row <= r1; row++) {
            const y = row * (SD + gap) + SD / 2;
            if (y < y0 + SD * 0.9 || y > y1 - SD * 0.9) continue;
            const off = (row & 1) ? (SW + gap) / 2 : 0;
            const c0 = Math.floor((x0 - off) / (SW + gap)), c1 = Math.ceil((x1 - off) / (SW + gap));
            for (let col = c0; col <= c1; col++) {
              const x = col * (SW + gap) + off + SW / 2;
              if (x < x0 + SW * 0.9 || x > x1 - SW * 0.9) continue;
              // big worn-away patches where the dirt shows through
              const patch = Math.sin(x * 0.0041 + Math.sin(y * 0.0023) * 2) * Math.cos(y * 0.0037 - x * 0.0011);
              if (patch > 0.25 || rnd() < 0.18) continue;
              spots.push([x, y]);
            }
          }
        });
        const stone = new T.SphereGeometry(1, 7, 3, 0, Math.PI * 2, 0, Math.PI / 2);
        const sm = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 0.85, envMapIntensity: 0.15 });
        const stones = new T.InstancedMesh(stone, sm, spots.length);
        const tones = ['#a39b8b', '#8f877a', '#b5ab95', '#9c8f78', '#7d776c', '#c2b49a', '#8a8f7a'].map(c => new T.Color(c));
        const d2 = new T.Object3D(), tc = new T.Color();
        spots.forEach(([x, y], i) => {
          d2.position.copy(W2T(x + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 8, -2 + rnd() * 2));
          d2.rotation.set((rnd() - 0.5) * 0.25, (rnd() - 0.5) * 0.9, (rnd() - 0.5) * 0.25);
          const k = 0.7 + rnd() * 0.35;
          d2.scale.set(SW / 2 * k, 6 + rnd() * 6, SD / 2 * k);
          d2.updateMatrix(); stones.setMatrixAt(i, d2.matrix);
          tc.copy(tones[Math.floor(rnd() * tones.length)]).multiplyScalar(0.85 + rnd() * 0.25);
          if (rnd() < 0.2) tc.lerp(new T.Color('#6f8f4a'), 0.35);   // moss
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
          const q = [[a.x + nx, a.y + ny], [a.x - nx, a.y - ny], [b.x - nx, b.y - ny], [b.x + nx, b.y + ny]].map(([x, y]) => W2T(x, y, hi ? 12 : 2.5));   // floats just over the paving
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

      // ragged grass tufts lean out over the road wherever a grassy bank meets it,
      // so no edge is a clean straight line
      const N = map.size, G = map.grid, tufts = [];
      const at = (cx, cy) => (cx < 0 || cy < 0 || cx >= N || cy >= N) ? 2 : G[cy * N + cx];
      const step = hi ? 34 : 60;
      for (let y = 1; y < N; y++) for (let x = 0; x < N; x++) {
        const a = at(x, y - 1), b = at(x, y);
        if (!((a === 0 && b === 1) || (a === 1 && b === 0))) continue;
        const wy = map.origin + y * cell, side = a === 0 ? -1 : 1;   // the bank is on the `side` of the edge, the road on the other
        for (let s = 0; s < cell; s += step) tufts.push([map.origin + x * cell + s + rnd() * step, wy + side * (3 + rnd() * 8), 0, -side]);
      }
      for (let x = 1; x < N; x++) for (let y = 0; y < N; y++) {
        const a = at(x - 1, y), b = at(x, y);
        if (!((a === 0 && b === 1) || (a === 1 && b === 0))) continue;
        const wx = map.origin + x * cell, side = a === 0 ? -1 : 1;
        for (let s = 0; s < cell; s += step) tufts.push([wx + side * (3 + rnd() * 8), map.origin + y * cell + s + rnd() * step, -side, 0]);
      }
      const tuftG = new T.ConeGeometry(1, 1, 4); tuftG.translate(0, 0.5, 0);
      const tm = new T.InstancedMesh(tuftG, new T.MeshToonMaterial({ color: '#b8b8b8' }), tufts.length * 2);
      const greens = ['#4f9e3a', '#5fb246', '#6cc04e', '#3f8a32', '#78c850'].map(c => new T.Color(c));
      const d = new T.Object3D();
      let k = 0;
      for (const [x, y, lx, ly] of tufts) for (let j = 0; j < 2; j++) {
        d.position.copy(W2T(x + (rnd() - 0.5) * 14, y + (rnd() - 0.5) * 14, FELT_H - 6));
        const lean = 0.5 + rnd() * 0.5;
        d.rotation.set(-ly * lean, rnd() * TAU, -lx * lean, 'XZY');
        const h = 26 + rnd() * 26; d.scale.set(9 + rnd() * 6, h, 9 + rnd() * 6);
        d.updateMatrix(); tm.setMatrixAt(k, d.matrix); tm.setColorAt(k, greens[Math.floor(rnd() * greens.length)]); k++;
      }
      tm.instanceMatrix.needsUpdate = true; tm.instanceColor.needsUpdate = true; tm.computeBoundingSphere();
      S.add(tm);
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
            d.position.copy(W2T(pt.x, pt.y, hi ? 14 : 3));
            d.rotation.set(0, Math.atan2(Math.cos(dir), -Math.sin(dir)) + Math.PI, 0);
            const alive = L.p.alive ? 1 : 0.0001;
            d.scale.set(alive, 1, alive);
            d.updateMatrix(); mesh.setMatrixAt(k++, d.matrix);
          }
        }
        mesh.instanceMatrix.needsUpdate = true;
      });
    }

    // ------------------------------------------------------------ bushes piled on the hedgerows
    {
      const spots = [], STEP = hi ? 120 : 170;
      for (const w of r.rectsOf(2)) {
        const x0 = map.origin + w.x0 * cell, x1 = map.origin + w.x1 * cell, y0 = map.origin + w.y0 * cell, y1 = map.origin + w.y1 * cell;
        for (let y = y0 + STEP / 2; y < y1; y += STEP) for (let x = x0 + STEP / 2; x < x1; x += STEP) {
          const px = x + (rnd() - 0.5) * STEP * 0.5, py = y + (rnd() - 0.5) * STEP * 0.5;
          if (Math.abs(px) < 720 && Math.abs(py) < 720) continue;   // the vault clearing
          if (inBand(px, py)) continue;                            // the crowd's strip
          spots.push({ x: px, z: -py, y: 50, ry: rnd() * TAU, s: 0.85 + rnd() * 0.6, v: Math.floor(rnd() * 6) });
        }
      }
      herd(S, [0, 1, 2, 3, 4, 5].map(bush), spots.slice(0, 9000), { shadow: hi });
      // a soft hedge line just outside the crowd, so the clearing fades into the jungle
      const rim = [];
      for (let s = -half; s <= half; s += 150) for (const [x, y] of [[s, half + 40], [s, -half - 40], [half + 40, s], [-half - 40, s]]) {
        if (Math.abs(s) < 260) continue;   // gaps for the trails to the bridges
        rim.push({ x: x + (rnd() - 0.5) * 50, z: -(y + (rnd() - 0.5) * 50), ry: rnd() * TAU, s: 1 + rnd() * 0.5, v: Math.floor(rnd() * 6) });
      }
      herd(S, [0, 1, 2, 3, 4, 5].map(bush), rim, { shadow: hi });
    }

    // ------------------------------------------------------------ landmarks on the biggest hedge blocks
    {
      const big = r.rectsOf(2).map(w => {
        const W = (w.x1 - w.x0) * cell, H = (w.y1 - w.y0) * cell;
        const cx = map.origin + w.x0 * cell + W / 2, cy = map.origin + w.y0 * cell + H / 2;
        return { W, H, cx, cy, area: W * H };
      }).filter(w => !inBand(w.cx, w.cy) && !(Math.abs(w.cx) < 900 && Math.abs(w.cy) < 900) && Math.min(w.W, w.H) >= 300).sort((a, b) => b.area - a.area).slice(0, 20);
      const trees = [], palms = [], tikis = [];
      big.forEach((w, i) => {
        const k = i % 4, at = { x: w.cx, z: -w.cy, ry: rr(0, TAU) };
        if (k === 0 || k === 2) trees.push(Object.assign(at, { y: 60, s: 1.2 + rnd() * 0.5, v: i }));
        else if (k === 1) palms.push(Object.assign(at, { y: 60, s: 1.4 + rnd() * 0.4, v: i }));
        else tikis.push(Object.assign(at, { y: 70, s: 1 + rnd() * 0.3, ry: Math.atan2(-w.cx, w.cy) + Math.PI, v: i }));
      });
      herd(S, [0, 1, 2].map(broadleaf), trees, { shadow: true });
      herd(S, [0, 1, 2].map(palm), palms, { shadow: true });
      // carved tiki heads: stacked stone with big brows, glowing eyes and a wide grin
      const tiki = (k) => {
        const st = ['#8d8a78', '#9a8f75', '#7f8574'][k % 3], dk = '#4e4a3e';
        return [[BOX, st, [0, 130, 0], 0, [150, 260, 130]], [BOX, PTD.Art.shade(st, 0.12), [0, 190, 68], 0, [150, 26, 18]],
          [SPH, '#ffd23f', [-36, 160, 66], 0, [20, 16, 6]], [SPH, '#ffd23f', [36, 160, 66], 0, [20, 16, 6]],
          [BOX, dk, [0, 120, 68], 0, [26, 60, 22]], [BOX, dk, [0, 70, 66], 0, [96, 26, 8]],
          [BOX, '#f4f1e8', [0, 74, 70], 0, [80, 10, 4]], [SPH, '#5a9a3a', [0, 266, 0], 0, [82, 26, 70]], [SPH, '#6cbf4a', [52, 250, 40], 0, [36, 22, 30]]];
      };
      herd(S, [0, 1, 2].map(tiki), tikis, { shadow: true });
    }

    // ------------------------------------------------------------ jungle gates over the looters' doors
    {
      const stoneM = M('gateStone', () => new T.MeshToonMaterial({ color: '#7f7765' }));
      const mossM = M('gateMoss', () => new T.MeshToonMaterial({ color: '#4a8030' }));
      const woodM = M('gateWood', () => new T.MeshToonMaterial({ color: '#7a5634' }));
      const flameM = glow('#ffb347', 3);
      const flames = [];
      const plank = canvasTex(512, 160, (x, W, H) => {
        const gr = x.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#a77548'); gr.addColorStop(1, '#6e4626');
        x.fillStyle = gr; PTD.Art.rr(x, 8, 12, W - 16, H - 24, 18); x.fill();
        x.strokeStyle = '#4a2c14'; x.lineWidth = 8; x.stroke();
        x.strokeStyle = 'rgba(60,30,10,0.35)'; x.lineWidth = 3;
        for (let i = 0; i < 5; i++) { x.beginPath(); x.moveTo(20, 40 + i * 20); x.bezierCurveTo(W * 0.3, 30 + i * 22, W * 0.7, 50 + i * 18, W - 20, 40 + i * 20); x.stroke(); }
        x.font = 'bold 84px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillStyle = '#3a200c'; x.fillText('LOOTERS', W / 2 + 3, H / 2 + 5);
        x.fillStyle = '#ffe2a8'; x.fillText('LOOTERS', W / 2, H / 2);
      });
      const done = new Set();
      for (const p of g.players) {
        const s = p.lane.path[0], key = Math.round(s.x / 500) + ',' + Math.round(s.y / 500);
        const gate = new T.Group(); gate.position.copy(W2T(s.x, s.y, 0));
        gate.rotation.y = Math.atan2(-s.x, s.y) + Math.PI;   // face the clearing's centre
        for (const side of [-1, 1]) {
          for (let b = 0; b < 3; b++) {                        // three rough stacked blocks, each a little askew
            const blk = new T.Mesh(BOX, stoneM); blk.scale.set(84 - b * 8, 120, 84 - b * 8);
            blk.position.set(side * 240, 60 + b * 122, 0); blk.rotation.y = (b - 1) * 0.12 * side; blk.castShadow = true; gate.add(blk);
          }
          const moss = new T.Mesh(SPH, mossM); moss.scale.set(52, 18, 48); moss.position.set(side * 240, 372, 0); gate.add(moss);
          const torch = new T.Mesh(CYL, woodM); torch.scale.set(8, 80, 8); torch.position.set(side * 240, 420, 46); gate.add(torch);
          const fl = new T.Mesh(SPH, flameM); fl.scale.set(18, 30, 18); fl.position.set(side * 240, 472, 46); gate.add(fl); flames.push(fl);
        }
        if (!done.has(key)) {
          const lintel = new T.Mesh(BOX, stoneM); lintel.scale.set(620, 70, 100); lintel.position.y = 400; lintel.rotation.z = 0.03; lintel.castShadow = true; gate.add(lintel);
          for (let v = 0; v < 6; v++) {                        // vines dripping off the lintel
            const pts = []; const x0 = -260 + v * 104;
            for (let k = 0; k <= 6; k++) pts.push(new T.Vector3(x0 + Math.sin(k + v) * 14, 400 - k * (22 + (v % 3) * 10), 52));
            const vine = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 16, 6, 5), mossM); gate.add(vine);
            const leaf = new T.Mesh(SPH, mossM); leaf.scale.set(18, 8, 14); leaf.position.copy(pts[6]); gate.add(leaf);
          }
          const sign = new T.Sprite(new T.SpriteMaterial({ map: plank, transparent: true, depthWrite: false }));   // sprite: always readable
          sign.scale.set(360, 112, 1); sign.position.set(0, 540, 0); gate.add(sign);
          done.add(key);
        }
        S.add(gate);
      }
      const halos = flames.map(f => { const h = nightHalo(240); f.parent.add(h); h.position.copy(f.position); return h; });
      updaters.push((t) => flames.forEach((f, i) => { const k = 1 + Math.sin(t * 13 + i * 2.1) * 0.12 + Math.sin(t * 29 + i) * 0.06; f.scale.set(18 * k, 30 * k * 1.1, 18 * k); halos[i].material.opacity = (r.day ? r.day.night : 0) * (0.55 + 0.15 * k); }));
    }

    // ------------------------------------------------------------ the old temple ring around the vault
    {
      const st = M('templeStone', () => new T.MeshToonMaterial({ color: '#867d6a' }));
      const moss = M('templeMoss', () => new T.MeshToonMaterial({ color: '#4c8432' }));
      const flames = [];
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU + TAU / 16, x = Math.cos(a) * 680, z = Math.sin(a) * 680;
        const h = k % 3 === 1 ? 210 : 380;   // a few have crumbled
        const col = new T.Mesh(CYL, st); col.scale.set(46, h, 46); col.position.set(x, h / 2, z); col.castShadow = true; S.add(col);
        const cap = new T.Mesh(BOX, st); cap.scale.set(110, 34, 110); cap.position.set(x, h + 17, z); cap.rotation.y = a; S.add(cap);
        const m = new T.Mesh(SPH, moss); m.scale.set(62, 20, 58); m.position.set(x, h + 38, z); S.add(m);
        if (k % 2 === 0) {
          const bowl = new T.Mesh(CYL, st); bowl.scale.set(36, 22, 36); bowl.position.set(x, h + 60, z); S.add(bowl);
          const f = new T.Mesh(SPH, glow('#ffa53a', 3)); f.scale.set(24, 40, 24); f.position.set(x, h + 100, z); S.add(f); flames.push(f);
        }
        const rubble = new T.Mesh(ICO, st); rubble.scale.set(40, 26, 36); rubble.position.set(x + 70, 12, z - 40); rubble.rotation.set(rnd(), rnd(), rnd()); S.add(rubble);
      }
      const halos = flames.map(f => { const h = nightHalo(420); S.add(h); h.position.copy(f.position); return h; });
      updaters.push((t) => flames.forEach((f, i) => { const k = 1 + Math.sin(t * 12 + i * 1.7) * 0.14; f.scale.set(24 * k, 40 * k * 1.1, 24 * k); halos[i].material.opacity = (r.day ? r.day.night : 0) * (0.6 + 0.2 * k); }));
    }

    // ------------------------------------------------------------ the land around the clearing
    const RIVER_D = 1500, RIVER_W = 560;
    const riverPath = (() => {
      // a rounded-square loop round the clearing, gently meandering
      const pts = [], n = 260, R = half + RIVER_D;
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU, c = Math.cos(a), s = Math.sin(a);
        const k = Math.pow(Math.pow(Math.abs(c), 8) + Math.pow(Math.abs(s), 8), -1 / 8);   // superellipse: square with soft corners
        const w = R + Math.sin(a * 6 + 1) * 180 + Math.sin(a * 11) * 70;
        pts.push(new T.Vector2(c * k * w, s * k * w));
      }
      return pts;
    })();
    {
      // ground: one big grassy plain with a tiling texture
      const grassTex = canvasTex(256, 256, (x, W) => {
        x.fillStyle = '#5a8f45'; x.fillRect(0, 0, W, W);
        let sd = 3; const rn = () => { sd = (sd * 16807) % 2147483647; return sd / 2147483647; };
        for (let i = 0; i < 1600; i++) { x.fillStyle = ['#4f8d3a', '#69aa4e', '#5a9440', '#73b356'][i % 4]; x.globalAlpha = 0.5; x.fillRect(rn() * W, rn() * W, 2 + rn() * 3, 5 + rn() * 6); }
        x.globalAlpha = 1;
        for (let i = 0; i < 26; i++) { x.fillStyle = ['#fff3a0', '#ffffff', '#ff9ec8'][i % 3]; x.beginPath(); x.arc(rn() * W, rn() * W, 2.2, 0, TAU); x.fill(); }
      });
      grassTex.wrapS = grassTex.wrapT = T.RepeatWrapping; grassTex.repeat.set(140, 140);
      const ground = new T.Mesh(new T.PlaneGeometry(130000, 130000), new T.MeshToonMaterial({ map: grassTex, color: '#b4c4a4' }));
      ground.rotation.x = -Math.PI / 2; ground.position.y = -6; ground.receiveShadow = true; S.add(ground);

      // the river: a sandy bank strip under a glossy, slowly flowing water strip
      const strip = (width, y, mat, uvLen) => {
        const pos = [], uv = [], idx = [], n = riverPath.length;
        let run = 0;
        for (let i = 0; i <= n; i++) {
          const p = riverPath[i % n], a = riverPath[(i + n - 1) % n], b = riverPath[(i + 1) % n];
          const tx = b.x - a.x, ty = b.y - a.y, L = Math.hypot(tx, ty) || 1, nx = -ty / L, ny = tx / L;
          if (i) run += Math.hypot(p.x - riverPath[(i - 1) % n].x, p.y - riverPath[(i - 1) % n].y);
          const ww = width * (1 + Math.sin(i * 0.37) * 0.12);
          pos.push(p.x + nx * ww / 2, y, -(p.y + ny * ww / 2), p.x - nx * ww / 2, y, -(p.y - ny * ww / 2));
          uv.push(0, run / uvLen, 1, run / uvLen);
          if (i < n) { const o = i * 2; idx.push(o, o + 1, o + 2, o + 1, o + 3, o + 2); }
        }
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx); geo.computeVertexNormals();
        const m = new T.Mesh(geo, mat); m.receiveShadow = true; S.add(m); return m;
      };
      strip(RIVER_W + 260, -4, new T.MeshToonMaterial({ color: '#b8a678' }), 400);
      strip(RIVER_W + 120, -3, new T.MeshToonMaterial({ color: '#97825a' }), 400);
      const ripple = canvasTex(128, 256, (x, W, H) => {
        x.fillStyle = '#ffffff'; x.fillRect(0, 0, W, H);
        x.strokeStyle = 'rgba(120,200,230,0.55)'; x.lineWidth = 3;
        for (let i = 0; i < 14; i++) { const y0 = i / 14 * H; x.beginPath(); x.moveTo(0, y0); x.bezierCurveTo(W * 0.3, y0 - 8, W * 0.7, y0 + 8, W, y0); x.stroke(); }
        x.fillStyle = 'rgba(255,255,255,0.9)';
        for (let i = 0; i < 18; i++) { x.beginPath(); x.ellipse((i * 37) % W, (i * 71) % H, 9, 3, 0, 0, TAU); x.fill(); }
      });
      ripple.wrapS = ripple.wrapT = T.RepeatWrapping;
      const waterM = new T.MeshStandardMaterial({ color: '#3fb0d0', map: ripple, roughness: 0.12, metalness: 0.15, envMapIntensity: 0.9, transparent: true, opacity: 0.93 });
      strip(RIVER_W, -1, waterM, 600);
      updaters.push((t, dt) => { ripple.offset.y -= dt * 0.08; });

      // wooden bridges where the trails cross, one in the middle of each side
      const plankM = M('plank', () => new T.MeshToonMaterial({ color: '#9a6b40' })), railM = M('rail', () => new T.MeshToonMaterial({ color: '#6e4a2a' }));
      const trailM = new T.MeshToonMaterial({ color: '#b48a5a' });
      for (let k = 0; k < 4; k++) {
        const a = k / 4 * TAU, i = Math.round(a / TAU * riverPath.length) % riverPath.length, p = riverPath[i];
        const br = new T.Group(); br.position.set(p.x, 0, -p.y); br.rotation.y = Math.atan2(Math.cos(a), -Math.sin(a)); S.add(br);
        const span = RIVER_W + 340, n = 18;
        for (let j = 0; j < n; j++) {
          const u = j / (n - 1) - 0.5, z = u * span, y = 8 + Math.cos(u * Math.PI) * 70;
          const pl = new T.Mesh(BOX, plankM); pl.scale.set(240, 12, span / n - 6); pl.position.set(0, y, z); pl.rotation.x = -Math.sin(u * Math.PI) * 0.35; pl.castShadow = true; br.add(pl);
          if (j % 3 === 0) for (const sx of [-1, 1]) { const post = new T.Mesh(CYL, railM); post.scale.set(8, 70, 8); post.position.set(sx * 118, y + 36, z); br.add(post); }
        }
        for (const sx of [-1, 1]) {
          const pts = []; for (let j = 0; j <= 12; j++) { const u = j / 12 - 0.5; pts.push(new T.Vector3(sx * 118, 78 + Math.cos(u * Math.PI) * 70, u * span)); }
          br.add(new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 24, 6, 6), railM));
        }
        // a dirt trail from the clearing's edge out over the bridge
        const trail = new T.Mesh(new T.PlaneGeometry(220, RIVER_D * 2 + 400), trailM); trail.rotation.x = -Math.PI / 2;
        trail.position.set(Math.cos(a) * (half + RIVER_D * 0.6), -5, -Math.sin(a) * (half + RIVER_D * 0.6)); trail.rotation.z = a + Math.PI / 2; trail.receiveShadow = true; S.add(trail);
      }

      // lily pads (with the odd frog) and things lurking in the water
      const pads = [], frogs = [], lurkers = [];
      for (let i = 0; i < riverPath.length; i += 6) {
        const p = riverPath[i], off = (rnd() - 0.5) * RIVER_W * 0.7;
        const a = Math.atan2(p.y, p.x);
        pads.push({ x: p.x + Math.cos(a) * off, z: -(p.y + Math.sin(a) * off), y: 1, ry: rnd() * TAU, s: 0.8 + rnd() * 0.6, v: i % 2 });
        if (i % 24 === 0) frogs.push({ x: p.x + Math.cos(a) * off, z: -(p.y + Math.sin(a) * off), y: 5, ry: Math.atan2(-p.x, p.y) + Math.PI, s: 1.3, v: 0, base: 5 });
      }
      const pad = (k) => [[CYL, k ? '#4caf50' : '#66bb6a', [0, 0, 0], 0, [70, 3, 70]], [CYL, '#ff8fb8', [20, 6, 10], 0, [k ? 0.1 : 14, 8, k ? 0.1 : 14]]];
      herd(S, [pad(0), pad(1)], pads, { shadow: false });
      const croc = () => [[SPH, '#3e6b2f', [0, 0, 0], 0, [34, 10, 110]], [SPH, '#4f7f3a', [-14, 10, 46], 0, [9, 9, 9]], [SPH, '#4f7f3a', [14, 10, 46], 0, [9, 9, 9]],
        [SPH, '#f1e27a', [-14, 14, 50], 0, [5, 5, 3]], [SPH, '#f1e27a', [14, 14, 50], 0, [5, 5, 3]], ...[-60, -20, 20].map(z => [CONE, '#355d28', [0, 8, z], 0, [8, 14, 8]])];
      const hippo = () => [[SPH, '#8a7a96', [0, 0, 0], 0, [60, 22, 74]], [SPH, '#9b8aa8', [0, 4, 56], 0, [44, 18, 30]], ...eyes(24, 30, 20, 9),
        [SPH, '#8a7a96', [-28, 28, 10], 0, [10, 12, 6]], [SPH, '#8a7a96', [28, 28, 10], 0, [10, 12, 6]], [SPH, '#5c4e66', [-12, 14, 82], 0, [5, 4, 4]], [SPH, '#5c4e66', [12, 14, 82], 0, [5, 4, 4]]];
      for (let i = 0; i < 6; i++) lurkers.push({ u: i / 6 + rnd() * 0.05, speed: (rnd() < 0.5 ? 1 : -1) * (0.004 + rnd() * 0.004), v: i % 2 });
      const lm = herd(S, [croc(), hippo()], lurkers.map(l => ({ x: 0, z: 0, v: l.v })), { shadow: false });
      const frogM = herd(S, [frog()], frogs, { shadow: false });
      const dd = new T.Object3D();
      updaters.push((t) => {
        // crocs and hippos drift along the river, bobbing
        let ci = [0, 0];
        for (const l of lurkers) {
          const u = ((l.u + t * l.speed) % 1 + 1) % 1, f = u * riverPath.length, i = Math.floor(f) % riverPath.length, j = (i + 1) % riverPath.length;
          const p = riverPath[i], q = riverPath[j], fr = f - Math.floor(f);
          const x = p.x + (q.x - p.x) * fr, y = p.y + (q.y - p.y) * fr;
          const head = Math.atan2(q.x - p.x, q.y - p.y) + (l.speed < 0 ? Math.PI : 0);
          dd.position.set(x, -2 + Math.sin(t * 1.3 + l.u * 9) * 3, -y); dd.rotation.set(0, head, 0); dd.scale.setScalar(1); dd.updateMatrix();
          const grp = lm[l.v];
          if (grp) grp.mesh.setMatrixAt(ci[l.v]++, dd.matrix);
        }
        lm.forEach(m => { m.mesh.instanceMatrix.needsUpdate = true; });
      });
      // frogs hop on their pads
      if (frogM[0]) updaters.push((t) => {
        const m = frogM[0];
        m.list.forEach((f, i) => { dd.position.set(f.x, f.base + Math.max(0, Math.sin(t * 2.2 + i * 1.9)) * 40, f.z); dd.rotation.set(0, f.ry, 0); dd.scale.setScalar(f.s); dd.updateMatrix(); m.mesh.setMatrixAt(i, dd.matrix); });
        m.mesh.instanceMatrix.needsUpdate = true;
      });

      // big animals stand between the clearing and the river; the jungle starts across the water
      const insideRiver = (x, y) => {
        const a = Math.atan2(y, x), i = Math.round(((a / TAU) % 1 + 1) % 1 * riverPath.length) % riverPath.length, p = riverPath[i];
        return Math.hypot(x, y) < Math.hypot(p.x, p.y) - RIVER_W / 2 - 160;
      };
      const tall = [];
      for (let i = 0; i < (hi ? 26 : 12); i++) {
        const side = i % 4, along = (rnd() - 0.5) * 2 * (half - 600), out = half + 380 + rnd() * 500;
        if (Math.abs(along) < 500) continue;
        const [x, y] = side === 0 ? [along, out] : side === 1 ? [out, along] : side === 2 ? [along, -out] : [-out, along];
        if (!insideRiver(x, y)) continue;
        tall.push({ x, z: -y, ry: Math.atan2(-x, y) + Math.PI, s: 0.9 + rnd() * 0.25, v: i % 3 === 0 ? 1 : 0 });
      }
      herd(S, [elephant(), giraffe()], tall, { shadow: true });

      const forest = [], palmsOut = [], bushesOut = [];
      for (let i = 0; i < (hi ? 1400 : 600); i++) {
        const a = rnd() * TAU, d = half + RIVER_D + RIVER_W + 200 + Math.pow(rnd(), 0.7) * 9000;
        const c = Math.cos(a), s = Math.sin(a), k = Math.pow(Math.pow(Math.abs(c), 8) + Math.pow(Math.abs(s), 8), -1 / 8);
        const x = c * k * d, y = s * k * d;
        const spot = { x, z: -y, y: -6, ry: rnd() * TAU, s: 1 + rnd() * 0.9, v: Math.floor(rnd() * 4) };
        (rnd() < 0.3 ? palmsOut : forest).push(spot);
      }
      for (let i = 0; i < (hi ? 240 : 90); i++) {          // shrubs and a few palms on the near bank
        const a = rnd() * TAU, d = half + 250 + rnd() * (RIVER_D - 600);
        const c = Math.cos(a), s = Math.sin(a), k = Math.pow(Math.pow(Math.abs(c), 8) + Math.pow(Math.abs(s), 8), -1 / 8);
        const x = c * k * d, y = s * k * d;
        if (!insideRiver(x, y)) continue;
        if (Math.abs(Math.abs(x) < Math.abs(y) ? x : y) < 300) continue;   // keep the trails clear
        (i % 9 === 0 ? palmsOut : bushesOut).push({ x, z: -y, y: -6, ry: rnd() * TAU, s: 0.9 + rnd() * 0.7, v: Math.floor(rnd() * 6) });
      }
      herd(S, [0, 1, 2, 3].map(broadleaf), forest, { shadow: false });
      herd(S, [0, 1, 2].map(palm), palmsOut, { shadow: false });
      herd(S, [0, 1, 2, 3, 4, 5].map(bush), bushesOut, { shadow: false });
      // distant hills fade into the haze
      const hills = new T.InstancedMesh(new T.SphereGeometry(1, 20, 10), new T.MeshToonMaterial({ color: '#4d8a4a' }), 30);
      const dh = new T.Object3D();
      for (let i = 0; i < 30; i++) {
        const a = i / 30 * TAU + rnd() * 0.15, R = 30000 + rnd() * 8000;
        dh.position.set(Math.cos(a) * R, -600, Math.sin(a) * R); dh.scale.set(5000 + rnd() * 4000, 2500 + rnd() * 3000, 5000 + rnd() * 3000); dh.updateMatrix(); hills.setMatrixAt(i, dh.matrix);
      }
      hills.instanceMatrix.needsUpdate = true; hills.computeBoundingSphere(); S.add(hills);
    }

    // ------------------------------------------------------------ the crowd: villagers and animals lining the clearing
    // They stand on the empty strip round the board's border, facing in, bobbing and cheering.
    {
      const spots = [], STEP = hi ? 240 : 400, mid = half - 8 * cell;
      for (let s = -half + 300; s <= half - 300; s += STEP) {
        for (let side = 0; side < 4; side++) {
          const along = s + (rnd() - 0.5) * STEP * 0.6, out = mid + (rnd() - 0.5) * 160;
          const [x, y] = side === 0 ? [along, out] : side === 1 ? [out, along] : side === 2 ? [along, -out] : [-out, along];
          if (map.cellAt(x, y) !== 2) continue;                                       // only on the empty strip
          const kind = rnd(), v = kind < 0.55 ? Math.floor(rnd() * 6) : kind < 0.8 ? 6 + Math.floor(rnd() * 3) : 9 + Math.floor(rnd() * 3);
          spots.push({ x, z: -y, ry: Math.atan2(-x, y) + Math.PI + (rnd() - 0.5) * 0.5, s: v < 6 ? 1.05 + rnd() * 0.2 : 1.1 + rnd() * 0.25, v, ph: rnd() * TAU, hop: 0 });
        }
      }
      const variants = [0, 1, 2, 3, 4, 5].map(villager).concat([0, 1, 2].map(monkey), [0, 1, 2].map(bird));
      const crowd = herd(S, variants, spots, { shadow: hi });
      const dc = new T.Object3D();
      let cheerT = 0;
      updaters.push((t, dt) => {
        cheerT = Math.max(0, cheerT - dt);
        for (const grp of crowd) {
          grp.list.forEach((s, i) => {
            // idle sway; now and then someone jumps; everyone jumps when the crowd cheers
            const jump = cheerT > 0 ? Math.max(0, Math.sin(t * 9 + s.ph * 3)) : (Math.sin(t * 0.7 + s.ph * 5) > 0.97 ? Math.max(0, Math.sin(t * 9 + s.ph)) : 0);
            const bird = s.v >= 9;
            dc.position.set(s.x, bird ? 0 : jump * 60, s.z);
            dc.rotation.set(0, s.ry + Math.sin(t * 1.3 + s.ph) * 0.12, Math.sin(t * 2 + s.ph) * 0.05);
            const sq = 1 + (bird ? 0 : jump * 0.06);
            dc.scale.set(s.s / Math.sqrt(sq), s.s * sq, s.s / Math.sqrt(sq));
            dc.updateMatrix(); grp.mesh.setMatrixAt(i, dc.matrix);
          });
          grp.mesh.instanceMatrix.needsUpdate = true;
        }
      });
      cheer = () => { cheerT = 2.2; };
    }

    // ------------------------------------------------------------ sky and clouds
    {
      // sky dome driven by the renderer's day clock: blue day, orange dusk, starry night with a moon
      const C = (c) => new T.Color(c);
      const PAL = { day: [C('#3f8ee6'), C('#9ad3ff'), C('#e9f6e8')], dusk: [C('#4a5fa8'), C('#f2a07a'), C('#ffd2a0')], night: [C('#050a1e'), C('#101c3e'), C('#26365e')] };
      const skyU = { top: { value: C('#3f8ee6') }, mid: { value: C('#9ad3ff') }, horizon: { value: C('#e9f6e8') }, sun: { value: new T.Vector3(-0.45, 0.55, 0.7).normalize() }, night: { value: 0 } };
      const sky = new T.Mesh(new T.SphereGeometry(60000, 48, 24), new T.ShaderMaterial({
        side: T.BackSide, depthWrite: false, fog: false, uniforms: skyU,
        vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sun; uniform float night; varying vec3 vDir;
          float hash(vec3 p){ return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
          void main(){
            float h = vDir.y;
            vec3 c = h > 0.0 ? mix(mix(horizon, mid, smoothstep(0.0, 0.25, h)), top, smoothstep(0.25, 0.9, h)) : horizon;
            float s = max(0.0, dot(vDir, sun));
            c += vec3(1.0, 0.9, 0.7) * (pow(s, 400.0) * 1.4 + pow(s, 10.0) * 0.22) * (1.0 - night);   // the sun and its glow
            float m = max(0.0, dot(vDir, -sun));
            c += vec3(0.85, 0.9, 1.0) * (smoothstep(0.9993, 0.9996, m) * 1.1 + pow(m, 60.0) * 0.12) * night;   // the moon
            vec3 q = floor(vDir * 420.0);
            float st = step(0.9975, hash(q)) * smoothstep(0.0, 0.25, h) * night;
            c += vec3(st) * (0.6 + 0.4 * hash(q + 7.0));                                               // stars
            gl_FragColor = vec4(c, 1.0);
          }`,
      }));
      sky.renderOrder = -10; sky.frustumCulled = false;
      S.add(sky);
      updaters.push(() => {
        const dy = r.day || { night: 0, dusk: 0 };
        for (let i = 0; i < 3; i++) {
          const u = [skyU.top, skyU.mid, skyU.horizon][i].value;
          u.copy(PAL.day[i]).lerp(PAL.dusk[i], dy.dusk * (1 - dy.night * 0.5)).lerp(PAL.night[i], dy.night);
        }
        if (r.sunDir) skyU.sun.value.copy(r.sunDir);
        skyU.night.value = dy.night;
      });
      updaters.push(() => { sky.position.copy(r.camera.position); });
      const puffs = [];
      const cloud = (cx, cy, cz, size, n) => {
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + rnd() * 0.6, d = size * (0.35 + rnd() * 0.75);
          const s = size * (0.45 + rnd() * 0.45) * (i === 0 ? 1.3 : 1);
          puffs.push([cx + Math.cos(a) * d, cy + rnd() * size * 0.35 - (i % 3 === 0 ? size * 0.12 : 0), cz + Math.sin(a) * d * 0.6, s, s * 0.72, s]);
        }
      };
      for (let i = 0; i < 26; i++) { const a = rnd() * Math.PI * 2, R = 42000 + rnd() * 10000; cloud(Math.cos(a) * R, 3000 + rnd() * 7000, Math.sin(a) * R, 3500 + rnd() * 3000, 8 + Math.floor(rnd() * 5)); }
      for (let i = 0; i < 12; i++) { const a = rnd() * Math.PI * 2, R = 16000 + rnd() * 14000; cloud(Math.cos(a) * R, 7000 + rnd() * 3000, Math.sin(a) * R, 1400 + rnd() * 1200, 6 + Math.floor(rnd() * 4)); }
      const cloudMat = new T.MeshToonMaterial({ color: new T.Color('#ffffff').multiplyScalar(0.5), emissive: new T.Color('#9cc2e8').multiplyScalar(0.12), fog: false });
      const clouds = new T.InstancedMesh(new T.SphereGeometry(1, 18, 12), cloudMat, puffs.length);
      const m4 = new T.Matrix4(), q = new T.Quaternion();
      puffs.forEach((p, i) => clouds.setMatrixAt(i, m4.compose(new T.Vector3(p[0], p[1], p[2]), q, new T.Vector3(p[3], p[4], p[5]))));
      clouds.instanceMatrix.needsUpdate = true;
      const cloudG = new T.Group(); cloudG.add(clouds); S.add(cloudG);
      const cloudDay = new T.Color('#ffffff').multiplyScalar(0.5), cloudNight = new T.Color('#2a3558'), cloudDusk = new T.Color('#ffb08a').multiplyScalar(0.55);
      updaters.push((t) => {
        cloudG.rotation.y = t * 0.004;
        const dy = r.day || { night: 0, dusk: 0 };
        cloudMat.color.copy(cloudDay).lerp(cloudDusk, dy.dusk * (1 - dy.night)).lerp(cloudNight, dy.night);
      });
    }

    return { update(t, dt) { for (const u of updaters) u(t, dt); }, cheer: () => cheer() };
  }

  // Painted ground detail for the board texture (3D only): wildflower clumps and fallen leaves on the
  // grass, darker trampled patches, and small stones scattered along the dirt roads.
  function decorateBoard(ctx, px, map, upp) {
    const toPx = (wx, wy) => [(wx - map.origin) / upp, px - (wy - map.origin) / upp];
    let s = 42;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    const W = map.size * map.cell;
    ctx.save();
    // soft darker clumps of long grass
    for (let i = 0; i < 700; i++) {
      const wx = map.origin + r() * W, wy = map.origin + r() * W;
      if (map.cellAt(wx, wy) !== 0) continue;
      const [x, y] = toPx(wx, wy), R = (40 + r() * 90) / upp;
      const gr = ctx.createRadialGradient(x, y, 0, x, y, R);
      gr.addColorStop(0, 'rgba(30,80,20,0.22)'); gr.addColorStop(1, 'rgba(30,80,20,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
    }
    // wildflower clumps: a few petals round a yellow eye
    const petals = ['#ffffff', '#ffd23f', '#ff8fb8', '#b48cff', '#ff6b6b'];
    for (let i = 0; i < 2600; i++) {
      const wx = map.origin + r() * W, wy = map.origin + r() * W;
      if (map.cellAt(wx, wy) !== 0) continue;
      const col = petals[Math.floor(r() * petals.length)], n = 2 + Math.floor(r() * 5);
      for (let k = 0; k < n; k++) {
        const [x, y] = toPx(wx + (r() - 0.5) * 70, wy + (r() - 0.5) * 70), R = (5 + r() * 4) / upp;
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, R, 0, TAU); ctx.fill();
        ctx.fillStyle = '#f5b700'; ctx.beginPath(); ctx.arc(x, y, R * 0.4, 0, TAU); ctx.fill();
      }
    }
    // fallen leaves under the hedges
    for (let i = 0; i < 1800; i++) {
      const wx = map.origin + r() * W, wy = map.origin + r() * W;
      if (map.cellAt(wx, wy) !== 2) continue;
      const [x, y] = toPx(wx, wy);
      ctx.fillStyle = ['#8a6a2a', '#a8742c', '#6f7d2a', '#b5893a'][i % 4];
      ctx.save(); ctx.translate(x, y); ctx.rotate(r() * TAU); ctx.beginPath(); ctx.ellipse(0, 0, 9 / upp, 4 / upp, 0, 0, TAU); ctx.fill(); ctx.restore();
    }
    // loose stones on the roads
    for (let i = 0; i < 2200; i++) {
      const wx = map.origin + r() * W, wy = map.origin + r() * W;
      if (map.cellAt(wx, wy) !== 1) continue;
      const [x, y] = toPx(wx, wy), R = (3 + r() * 6) / upp;
      ctx.fillStyle = 'rgba(60,40,20,0.35)'; ctx.beginPath(); ctx.ellipse(x + R * 0.4, y + R * 0.4, R, R * 0.75, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = ['#c9bda5', '#a89f8c', '#d8cdb5'][i % 3]; ctx.beginPath(); ctx.ellipse(x, y, R, R * 0.75, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  PTD.Scenery3D = { build, decorateBoard };
})();
