// Tower models for the 3D renderer.
// Single cards get a tower per suit (the original map's four card towers); combined hands
// get a structure per hand type that grows grander with the hand. Every tower carries its
// playing card(s) so you can read it at a glance.
// PTD.Towers3D.build(tower, ownerColor, helpers) -> { root, head, banner, orbit, anim(t, dt, firing), height }
window.PTD = window.PTD || {};

(function () {
  if (!window.THREE) return;
  const T = window.THREE;
  const TAU = Math.PI * 2;

  // ------------------------------------------------------------------ shared bits
  const G = {};
  const geo = (k, f) => G[k] || (G[k] = f());
  const M = {};
  function mat(key, make) { if (!M[key]) { M[key] = make(); M[key].userData.shared = true; } return M[key]; }
  const std = (c, o) => mat('s' + c + JSON.stringify(o || {}), () => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.6, metalness: 0 }, o || {})));
  const metal = (c, r) => std(c, { metalness: 0.95, roughness: r == null ? 0.25 : r });
  const stone = (c) => std(c ? T.Color.prototype.set.call(new T.Color(), c).offsetHSL(0, 0.05, 0.08).getStyle() : '#8a8178', { roughness: 0.85 });
  const wood = (c) => std(c ? T.Color.prototype.set.call(new T.Color(), c).offsetHSL(0, 0.1, 0.06).getStyle() : '#8a5530', { roughness: 0.55 });
  const glow = (c, k) => mat('g' + c + k, () => { const m = new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k || 2.5) }); return m; });
  const glass = (c, o) => mat('gl' + c + o, () => new T.MeshStandardMaterial({ color: c, roughness: 0.05, metalness: 0.2, transparent: true, opacity: o || 0.35, depthWrite: false }));
  const add = (o) => mat('a' + o.c + o.k + (o.o || 1), () => new T.MeshBasicMaterial({ color: new T.Color(o.c).multiplyScalar(o.k || 1.5), transparent: true, opacity: o.o || 1, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));

  const BOX = () => geo('box', () => new T.BoxGeometry(1, 1, 1));
  const CYL = (n) => geo('cyl' + (n || 20), () => new T.CylinderGeometry(1, 1, 1, n || 20));
  const CONE = (n) => geo('cone' + (n || 20), () => new T.ConeGeometry(1, 1, n || 20));
  const SPH = () => geo('sph', () => new T.SphereGeometry(1, 24, 16));
  const TOR = (t) => geo('tor' + t, () => new T.TorusGeometry(1, t || 0.12, 10, 40));
  const OCT = () => geo('oct', () => new T.OctahedronGeometry(1, 0));
  const HEX = () => geo('hex', () => new T.CylinderGeometry(1, 1.08, 1, 6));

  function P(parent, g, m, s, p, r) {
    const o = new T.Mesh(g, m);
    if (s) o.scale.set(s[0], s[1], s[2]);
    if (p) o.position.set(p[0], p[1], p[2]);
    if (r) o.rotation.set(r[0], r[1], r[2]);
    o.castShadow = true; o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  function group(parent, p, keep) { const g = new T.Group(); if (p) g.position.set(p[0], p[1], p[2]); if (keep) g.userData.keep = true; parent.add(g); return g; }

  // ------------------------------------------------------------------ cartoon look
  // Three flat bands of light (toon shading) and a thick dark outline around every solid part.
  let toonRamp = null;
  function ramp() {
    if (toonRamp) return toonRamp;
    toonRamp = new T.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1, T.RGBAFormat);
    toonRamp.minFilter = toonRamp.magFilter = T.NearestFilter; toonRamp.generateMipmaps = false; toonRamp.needsUpdate = true;
    return toonRamp;
  }
  const toonCache = new Map();
  function toon(m) {
    if (!m || !m.isMeshStandardMaterial || m.transparent) return m;
    if (toonCache.has(m.uuid)) return toonCache.get(m.uuid);
    const own = !m.userData.shared;   // a per-object clone stays per-object
    // metals keep a little extra brightness so gold still reads as gold
    // toon materials skip PBR energy loss, so scale down to stay under the bloom threshold
    const c = m.color.clone().multiplyScalar(m.metalness > 0.5 ? 0.62 : 0.5);
    const t = new T.MeshToonMaterial({ color: c, map: m.map || null, gradientMap: ramp(), emissive: m.emissive ? m.emissive.clone() : new T.Color(0), emissiveMap: m.emissiveMap || null });
    if (own) return t;
    t.userData.shared = true;
    toonCache.set(m.uuid, t);
    return t;
  }
  const outlineMats = {};
  // width is in world units, whatever the object's scale
  function outline(width) {
    const w = width || 6;
    if (outlineMats[w]) return outlineMats[w];
    const outlineMat = outlineMats[w] = new T.MeshBasicMaterial({ color: 0x120a06, side: T.BackSide });
    outlineMat.onBeforeCompile = (sh) => {
      sh.uniforms.ow = { value: w };
      sh.vertexShader = 'uniform float ow;\n' + sh.vertexShader.replace('#include <begin_vertex>',
        '#include <begin_vertex>\n transformed += normalize(normal) * ow / max(0.001, length(modelMatrix[0].xyz));');
    };
    outlineMat.userData.shared = true;
    return outlineMat;
  }
  // opts: { width, onlyShadowCasters, skip(mesh) }
  function cartoonize(root, opts) {
    opts = opts || {};
    const solids = [];
    root.traverse(o => { if (o.isMesh && !o.userData.isOutline) solids.push(o); });
    for (const o of solids) {
      if (opts.skip && opts.skip(o)) continue;
      if (Array.isArray(o.material)) { o.material = o.material.map(toon); continue; }
      const basic = o.material.isMeshBasicMaterial;
      o.material = toon(o.material);
      if (basic || o.material.transparent || o.material.blending === T.AdditiveBlending) continue;
      if (opts.onlyShadowCasters && !o.castShadow) continue;
      const hull = new T.Mesh(o.geometry, outline(opts.width));
      hull.userData.isOutline = true; hull.userData.towerId = o.userData.towerId;
      hull.castShadow = false; hull.raycast = () => {};
      o.add(hull);
    }
  }

  // Merge every non-animated mesh under root into one mesh per material: a 30-part
  // tower becomes ~5 draw calls, which keeps hundreds of towers smooth.
  function mergeStatic(root, towerId) {
    root.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(root.matrixWorld).invert();
    const buckets = new Map();
    const dead = [];
    root.traverse((o) => {
      if (!o.isMesh || Array.isArray(o.material)) return;
      for (let p = o; p && p !== root; p = p.parent) if (p.userData.keep) return;
      const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
      g.applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const key = o.material.uuid;
      if (!buckets.has(key)) buckets.set(key, { mat: o.material, geos: [], shadow: false });
      const b = buckets.get(key); b.geos.push(g); b.shadow = b.shadow || o.castShadow;
      dead.push(o);
    });
    dead.forEach(o => o.parent.remove(o));
    for (const b of buckets.values()) {
      let n = 0; b.geos.forEach(g => { n += g.attributes.position.count; });
      const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
      let k = 0;
      for (const g of b.geos) {
        const c = g.attributes.position.count;
        pos.set(g.attributes.position.array, k * 3);
        if (g.attributes.normal) nor.set(g.attributes.normal.array, k * 3);
        if (g.attributes.uv) uv.set(g.attributes.uv.array, k * 2);
        k += c; g.dispose();
      }
      const mg = new T.BufferGeometry();
      mg.setAttribute('position', new T.BufferAttribute(pos, 3));
      mg.setAttribute('normal', new T.BufferAttribute(nor, 3));
      mg.setAttribute('uv', new T.BufferAttribute(uv, 2));
      mg.computeBoundingSphere();
      mg.userData.flatNormals = true;
      const mesh = new T.Mesh(mg, b.mat);
      mesh.castShadow = b.shadow; mesh.receiveShadow = true;
      mesh.userData.towerId = towerId; mesh.userData.ownGeo = true;
      root.add(mesh);
    }
    root.traverse(o => { if (o.isMesh) o.userData.towerId = towerId; });
  }

  // ------------------------------------------------------------------ card art
  const texCache = {};
  function faceTex(suit, rank) {
    const k = suit + '_' + rank;
    if (texCache[k]) return texCache[k];
    const src = PTD.Art.cardSprite(suit, rank);
    const c = document.createElement('canvas'); c.width = 216; c.height = 280;
    c.getContext('2d').drawImage(src, 10, 6, 108, 140, 0, 0, 216, 280);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 8;
    return (texCache[k] = t);
  }
  function backTex() {
    if (texCache.back) return texCache.back;
    const c = document.createElement('canvas'); c.width = 216; c.height = 280;
    const x = c.getContext('2d');
    PTD.Art.rr(x, 0, 0, 216, 280, 20); x.fillStyle = '#fbf8f1'; x.fill();
    PTD.Art.rr(x, 12, 12, 192, 256, 12); x.fillStyle = '#8e1b2b'; x.fill();
    x.strokeStyle = 'rgba(255,215,110,0.5)'; x.lineWidth = 2;
    for (let i = -280; i < 280; i += 18) { x.beginPath(); x.moveTo(12 + i, 12); x.lineTo(268 + i, 268); x.stroke(); x.beginPath(); x.moveTo(204 - i, 12); x.lineTo(-52 - i, 268); x.stroke(); }
    x.fillStyle = '#ffd34d'; x.font = 'bold 54px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('BLB', 108, 140);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
    return (texCache.back = t);
  }
  function cardMesh(suit, rank, w) {
    const g = new T.Group();
    const face = new T.Mesh(geo('cardPlane', () => new T.PlaneGeometry(1, 1.3)), mat('cf' + suit + '_' + rank, () => new T.MeshStandardMaterial({ map: faceTex(suit, rank), roughness: 0.35, metalness: 0.05, emissive: new T.Color('#222'), emissiveMap: faceTex(suit, rank) })));
    const back = new T.Mesh(geo('cardPlane', () => new T.PlaneGeometry(1, 1.3)), mat('cb', () => new T.MeshStandardMaterial({ map: backTex(), roughness: 0.35 })));
    back.rotation.y = Math.PI;
    face.scale.setScalar(w); back.scale.setScalar(w);
    face.castShadow = back.castShadow = true;
    g.add(face); g.add(back);
    return g;
  }

  // Cards a combo is "made of", for the orbit (deterministic per tower so it never flickers).
  function comboCards(t) {
    const r = t.rank, s0 = t.id % 4, out = [];
    const rk = (v) => (v < 2 ? 14 : v);
    switch (t.type) {
      case 1: out.push([s0, r], [(s0 + 1) % 4, r]); break;
      case 2: out.push([s0, r], [(s0 + 2) % 4, r], [(s0 + 1) % 4, r === 2 ? 3 : r - 1], [(s0 + 3) % 4, r === 2 ? 3 : r - 1]); break;
      case 3: for (let i = 0; i < 3; i++) out.push([(s0 + i) % 4, r]); break;
      case 4: for (let i = 0; i < 5; i++) out.push([(s0 + i) % 4, rk(r - i)]); break;
      case 5: for (let i = 0; i < 5; i++) out.push([s0, r - i * 2 < 2 ? 14 - i : r - i * 2]); break;
      case 6: for (let i = 0; i < 3; i++) out.push([(s0 + i) % 4, r]); out.push([s0, r === 2 ? 3 : 2], [(s0 + 1) % 4, r === 2 ? 3 : 2]); break;
      case 7: for (let i = 0; i < 4; i++) out.push([i, r]); break;
      case 8: for (let i = 0; i < 5; i++) out.push([s0, rk(r - i)]); break;
    }
    return out;
  }

  // ------------------------------------------------------------------ pieces
  function plinth(root, ownerColor, radius, h) {
    P(root, HEX(), stone('#4a4640'), [radius, h, radius], [0, h / 2, 0]);
    P(root, HEX(), stone('#5e5852'), [radius * 0.86, 6, radius * 0.86], [0, h + 3, 0]);
    const ring = P(root, TOR(0.08), glow(ownerColor, 2.2), [radius * 0.93, radius * 0.93, radius * 0.93], [0, h * 0.55, 0], [Math.PI / 2, 0, 0]);
    ring.castShadow = false;
    return h + 6;
  }
  function chipStack(root, y, color, n, radius) {
    const side = mat('chipS' + color, () => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 16;
      const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, 256, 16);
      x.fillStyle = '#f4efe2'; for (let i = 0; i < 8; i++) x.fillRect(i * 32 + 6, 0, 12, 16);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
      return new T.MeshStandardMaterial({ map: t, roughness: 0.3, metalness: 0.1 });
    });
    const face = std(color, { roughness: 0.3 });
    for (let i = 0; i < n; i++) {
      const c = new T.Mesh(CYL(32), [side, face, face]);
      c.scale.set(radius, 11, radius); c.position.set(((i * 37) % 5) - 2, y + 6 + i * 11.5, ((i * 53) % 5) - 2); c.rotation.y = i * 0.7;
      c.castShadow = c.receiveShadow = true;
      root.add(c);
    }
    return y + n * 11.5 + 4;
  }

  // ------------------------------------------------------------------ single-card towers
  function clubsTower(root, y, col) {
    // wooden archer post with a crossbow
    for (const [dx, dz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) P(root, BOX(), wood('#7a4b2a'), [9, 120, 9], [dx * 28, y + 58, dz * 28], [dz * 0.08, 0, -dx * 0.08]);
    for (let k = 0; k < 2; k++) P(root, BOX(), wood('#5c3a21'), [66, 5, 5], [0, y + 40 + k * 40, 30], [0, 0, (k ? 1 : -1) * 0.6]);
    P(root, BOX(), wood('#8a5a33'), [84, 8, 84], [0, y + 120, 0]);
    for (const s of [-1, 1]) { P(root, BOX(), wood('#6b4226'), [84, 14, 4], [0, y + 131, s * 40]); P(root, BOX(), wood('#6b4226'), [4, 14, 84], [s * 40, y + 131, 0]); }
    P(root, CONE(4), std('#2e5e3a', { roughness: 0.7 }), [70, 46, 70], [0, y + 178, 0], [0, Math.PI / 4, 0]);
    const head = group(root, [0, y + 142, 0], true);
    P(head, BOX(), wood('#4a2c18'), [10, 10, 58], [0, 0, 14]);
    P(head, TOR(0.1), wood('#2b1a0f'), [30, 30, 30], [0, 0, 32], [0, 0, 0]).scale.z = 8;
    P(head, CYL(8), metal('#cfd6dd'), [2.5, 50, 2.5], [0, 4, 26], [Math.PI / 2, 0, 0]);
    P(head, CONE(8), metal('#cfd6dd'), [5, 10, 5], [0, 4, 53], [Math.PI / 2, 0, 0]);
    return { head, top: y + 200 };
  }
  function diamondsTower(root, y, col) {
    // tesla spire: copper coils and a floating crystal
    P(root, CYL(24), stone('#3d3a44'), [36, 30, 36], [0, y + 15, 0]);
    for (let i = 0; i < 6; i++) P(root, TOR(0.28), metal('#b87333', 0.3), [24 - i * 1.5, 24 - i * 1.5, 24 - i * 1.5], [0, y + 40 + i * 14, 0], [Math.PI / 2, 0, 0]);
    P(root, CYL(12), metal('#2c2c34'), [10, 100, 10], [0, y + 80, 0]);
    const spin = group(root, [0, y + 165, 0], true);
    P(spin, OCT(), mat('crystal' + col, () => new T.MeshStandardMaterial({ color: '#7fc4ff', emissive: new T.Color('#3d8bff').multiplyScalar(2.2), roughness: 0.1, metalness: 0.2 })), [22, 38, 22]);
    for (let k = 0; k < 3; k++) P(spin, OCT(), glow('#9fd0ff', 2.5), [5, 9, 5], [Math.cos(k / 3 * TAU) * 40, 0, Math.sin(k / 3 * TAU) * 40]);
    const halo = P(spin, TOR(0.05), add({ c: '#6fb3ff', k: 2, o: 0.8 }), [34, 34, 34], [0, 0, 0], [Math.PI / 2, 0, 0]); halo.castShadow = false;
    return { spin, top: y + 215 };
  }
  function heartsTower(root, y, col) {
    // fluted stone brazier with live flames
    P(root, CYL(16), stone('#8a7f76'), [24, 90, 24], [0, y + 45, 0]);
    for (let k = 0; k < 8; k++) P(root, BOX(), stone('#776d64'), [5, 90, 5], [Math.cos(k / 8 * TAU) * 24, y + 45, Math.sin(k / 8 * TAU) * 24]);
    P(root, CYL(16), stone('#6e655d'), [34, 10, 34], [0, y + 95, 0]);
    const bowl = new T.Mesh(geo('bowl', () => new T.SphereGeometry(1, 24, 12, 0, TAU, Math.PI / 2, Math.PI / 2)), metal('#8c5a2b', 0.4));
    bowl.scale.set(46, 30, 46); bowl.position.y = y + 128; bowl.rotation.x = Math.PI; bowl.castShadow = true; root.add(bowl);
    P(root, CYL(24), glow('#ff5a1f', 2.2), [40, 3, 40], [0, y + 126, 0]);
    const flame = group(root, [0, y + 128, 0], true);
    const f1 = P(flame, CONE(12), add({ c: '#ff4d1a', k: 2.4, o: 0.9 }), [30, 70, 30], [0, 35, 0]);
    const f2 = P(flame, CONE(12), add({ c: '#ffb02e', k: 2.8, o: 0.9 }), [18, 52, 18], [0, 28, 0]);
    const f3 = P(flame, CONE(10), add({ c: '#fff2b0', k: 3, o: 0.9 }), [9, 30, 9], [0, 18, 0]);
    [f1, f2, f3].forEach(f => { f.castShadow = false; });
    return { flame, top: y + 230 };
  }
  function spadesTower(root, y, col) {
    // iron siege cannon on a stone bunker
    P(root, BOX(), stone('#55524f'), [92, 46, 92], [0, y + 23, 0]);
    for (let k = 0; k < 4; k++) P(root, BOX(), stone('#4a4744'), [18, 14, 18], [Math.cos(k / 4 * TAU + Math.PI / 4) * 46, y + 53, Math.sin(k / 4 * TAU + Math.PI / 4) * 46]);
    const head = group(root, [0, y + 70, 0], true);
    P(head, CYL(20), metal('#2b2d33', 0.4), [36, 26, 36]);
    P(head, SPH(), metal('#35373e', 0.35), [30, 22, 30], [0, 10, 0]);
    P(head, CYL(16), metal('#1d1f24', 0.3), [11, 96, 11], [0, 12, 50], [Math.PI / 2 - 0.12, 0, 0]);
    P(head, TOR(0.3), metal('#c9a043', 0.3), [12, 12, 12], [0, 18, 96], [0.12, 0, 0]);
    P(head, CYL(8), metal('#c9a043', 0.3), [37, 5, 37], [0, 0, 0]);
    return { head, top: y + 150 };
  }

  // ------------------------------------------------------------------ combo towers
  function aimHead(parent, y, col, barrels, len, metalCol) {
    const head = group(parent, [0, y, 0], true);
    P(head, SPH(), metal(metalCol || '#30343c', 0.3), [32, 26, 32]);
    P(head, SPH(), glow(col, 3), [14, 14, 14], [0, 12, 20]);
    for (let b = 0; b < barrels; b++) {
      const off = barrels === 1 ? 0 : (b - (barrels - 1) / 2) * 20;
      P(head, CYL(12), metal('#1e2127', 0.3), [7, len, 7], [off, 0, 24 + len / 2], [Math.PI / 2, 0, 0]);
      P(head, CYL(12), glow(col, 3), [9, 7, 9], [off, 0, 26 + len], [Math.PI / 2, 0, 0]);
    }
    return head;
  }

  const COMBO = {
    1(root, y, col, t) {   // twin-pillar gate
      for (const s of [-1, 1]) { P(root, CYL(12), stone('#ddd6c8'), [11, 70, 11], [s * 34, y + 35, 0]); P(root, SPH(), metal('#d4a62a'), [13, 13, 13], [s * 34, y + 76, 0]); }
      P(root, BOX(), stone('#cfc7b8'), [86, 12, 26], [0, y + 74, 0]);
      return { head: aimHead(root, y + 100, col, 2, 50), top: y + 150 };
    },
    2(root, y, col) {      // bastion with a shield dome
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + Math.PI / 4; P(root, BOX(), stone('#bdb5a6'), [20, 80, 20], [Math.cos(a) * 52, y + 40, Math.sin(a) * 52]); P(root, CONE(4), metal('#d17a22'), [16, 22, 16], [Math.cos(a) * 52, y + 91, Math.sin(a) * 52], [0, Math.PI / 4, 0]); }
      const head = aimHead(root, y + 70, col, 2, 56);
      const dome = group(root, [0, y + 40, 0], true);
      const sh = new T.Mesh(geo('dome', () => new T.SphereGeometry(1, 32, 16, 0, TAU, 0, Math.PI / 2)), add({ c: '#6fd0ff', k: 1.2, o: 0.22 }));
      sh.scale.set(82, 90, 82); dome.add(sh);
      return { head, dome, top: y + 140 };
    },
    3(root, y, col) {      // tripod gatling
      for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; P(root, CYL(8), metal('#3a3f47'), [6, 96, 6], [Math.cos(a) * 30, y + 44, Math.sin(a) * 30], [Math.sin(a) * 0.35, 0, -Math.cos(a) * 0.35]); }
      P(root, CYL(16), metal('#2a2e35'), [26, 16, 26], [0, y + 90, 0]);
      const head = group(root, [0, y + 112, 0], true);
      P(head, BOX(), metal('#2f343c', 0.3), [40, 34, 46]);
      const spin = group(head, [0, 0, 40], true);
      for (let b = 0; b < 3; b++) { const a = b / 3 * TAU; P(spin, CYL(10), metal('#14161a', 0.25), [6, 80, 6], [Math.cos(a) * 11, Math.sin(a) * 11, 30], [Math.PI / 2, 0, 0]); }
      P(spin, CYL(16), glow(col, 2.6), [17, 6, 17], [0, 0, 72], [Math.PI / 2, 0, 0]);
      return { head, barrelSpin: spin, top: y + 160 };
    },
    4(root, y, col) {      // ring spire
      P(root, CONE(8), stone('#d9d1ea'), [40, 230, 40], [0, y + 115, 0]);
      const rings = [];
      for (let i = 0; i < 5; i++) { const g = group(root, [0, y + 40 + i * 40, 0], true); P(g, TOR(0.09), metal('#c39bff', 0.2), [44 - i * 5, 44 - i * 5, 44 - i * 5], [0, 0, 0], [Math.PI / 2 + 0.3, 0, 0]); rings.push(g); }
      const orb = group(root, [0, y + 250, 0], true);
      P(orb, SPH(), glow('#c77dff', 3.2), [22, 22, 22]);
      P(orb, TOR(0.06), add({ c: '#e0b0ff', k: 2, o: 0.7 }), [36, 36, 36], [0, 0, 0], [Math.PI / 2, 0, 0]).castShadow = false;
      return { rings, spin: orb, top: y + 290 };
    },
    5(root, y, col) {      // alchemist cauldron
      const pot = new T.Mesh(geo('pot', () => new T.SphereGeometry(1, 28, 16, 0, TAU, Math.PI * 0.25, Math.PI * 0.75)), metal('#2b2b30', 0.45));
      pot.scale.set(62, 54, 62); pot.position.y = y + 54; pot.castShadow = true; root.add(pot);
      for (let k = 0; k < 3; k++) { const a = k / 3 * TAU; P(root, CYL(8), metal('#1f1f24'), [6, 40, 6], [Math.cos(a) * 44, y + 14, Math.sin(a) * 44]); }
      P(root, TOR(0.15), metal('#c9a043', 0.3), [52, 52, 52], [0, y + 92, 0], [Math.PI / 2, 0, 0]);
      P(root, CYL(32), glow('#4dff7a', 2.2), [48, 4, 48], [0, y + 88, 0]);
      const bubbles = group(root, [0, y + 92, 0], true);
      for (let i = 0; i < 7; i++) P(bubbles, SPH(), add({ c: '#7dff9a', k: 1.8, o: 0.8 }).clone(), [7, 7, 7], [(i % 3 - 1) * 16, i * 9, ((i * 5) % 3 - 1) * 16]).castShadow = false;
      for (let k = 0; k < 5; k++) {   // suit banners all of one suit
        const a = k / 5 * TAU;
        P(root, CYL(6), wood('#5c3a21'), [3, 150, 3], [Math.cos(a) * 74, y + 75, Math.sin(a) * 74]);
        P(root, BOX(), std('#16a085', { roughness: 0.8 }), [26, 34, 2], [Math.cos(a) * 74 + Math.cos(a + Math.PI / 2) * 14, y + 132, Math.sin(a) * 74 + Math.sin(a + Math.PI / 2) * 14], [0, -a, 0]);
      }
      return { bubbles, top: y + 200 };
    },
    6(root, y, col) {      // frost keep: walls, gable roof, chimney, icy windows, roof cannon
      P(root, BOX(), stone('#cfd8dc'), [110, 80, 96], [0, y + 40, 0]);
      for (const s of [-1, 1]) for (const z of [-1, 1]) P(root, BOX(), glow('#9fe3ff', 2.2), [16, 22, 2], [s * 28, y + 48, z * 49]);
      P(root, BOX(), wood('#3e4e5e'), [26, 40, 2], [0, y + 22, 49]);
      const roof = new T.Mesh(geo('roof', () => { const g = new T.CylinderGeometry(1, 1, 1, 3); g.rotateZ(Math.PI / 2); return g; }), std('#2c3e50', { roughness: 0.5, metalness: 0.3 }));
      roof.scale.set(122, 70, 70); roof.position.y = y + 105; roof.castShadow = true; root.add(roof);
      P(root, BOX(), stone('#b0bec5'), [18, 50, 18], [36, y + 125, -20]);
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; P(root, OCT(), mat('ice', () => new T.MeshStandardMaterial({ color: '#bfefff', emissive: new T.Color('#5fd0ff').multiplyScalar(0.8), roughness: 0.05, transparent: true, opacity: 0.85 })), [10, 30, 10], [Math.cos(a) * 72, y + 18, Math.sin(a) * 72], [0, a, 0.3]); }
      return { head: aimHead(root, y + 150, '#9fe3ff', 2, 70, '#5d7385'), top: y + 205 };
    },
    7(root, y, col) {      // titan hammer temple
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU + Math.PI / 4; P(root, CYL(10), stone('#e8e2d4'), [16, 150, 16], [Math.cos(a) * 56, y + 75, Math.sin(a) * 56]); P(root, BOX(), metal('#c9a043', 0.3), [26, 10, 26], [Math.cos(a) * 56, y + 154, Math.sin(a) * 56]); }
      P(root, BOX(), stone('#d6cfbf'), [140, 18, 140], [0, y + 166, 0]);
      P(root, BOX(), metal('#c9a043', 0.3), [146, 6, 146], [0, y + 177, 0]);
      const hammer = group(root, [0, y + 150, 0], true);
      P(hammer, CYL(10), metal('#3b3f46', 0.3), [9, 70, 9], [0, -35, 0]);
      P(hammer, BOX(), metal('#2c3e50', 0.35), [70, 44, 44], [0, -80, 0]);
      P(hammer, BOX(), glow(col === '#2c3e50' ? '#7aa2ff' : col, 2.4), [72, 8, 46], [0, -80, 0]);
      return { hammer, head: aimHead(root, y + 210, '#7aa2ff', 2, 64), top: y + 260 };
    },
    8(root, y, col) {      // royal citadel
      const gold = metal('#e6b422', 0.18), ivory = stone('#f3ecdc');
      P(root, CYL(8), ivory, [70, 170, 70], [0, y + 85, 0]);
      for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; P(root, BOX(), ivory, [20, 24, 14], [Math.cos(a) * 66, y + 182, Math.sin(a) * 66], [0, -a, 0]); }
      for (let k = 0; k < 4; k++) { const a = k / 4 * TAU; P(root, CYL(10), ivory, [20, 210, 20], [Math.cos(a) * 82, y + 105, Math.sin(a) * 82]); P(root, CONE(10), gold, [24, 46, 24], [Math.cos(a) * 82, y + 232, Math.sin(a) * 82]); }
      P(root, CYL(32), gold, [74, 8, 74], [0, y + 172, 0]);
      for (let i = 0; i < 4; i++) P(root, BOX(), glow('#ffe066', 2), [10, 26, 2], [Math.cos(i / 4 * TAU) * 71, y + 120, Math.sin(i / 4 * TAU) * 71], [0, -i / 4 * TAU + Math.PI / 2, 0]);
      const crown = group(root, [0, y + 250, 0], true);
      P(crown, CYL(24), gold, [42, 22, 42]);
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; P(crown, CONE(8), gold, [9, 36, 9], [Math.cos(a) * 40, 26, Math.sin(a) * 40]); P(crown, SPH(), glow(['#ff4d4d', '#3d8bff', '#2fa35c', '#ffffff'][k % 4], 3), [6, 6, 6], [Math.cos(a) * 41, 6, Math.sin(a) * 41]); }
      const beam = new T.Mesh(CYL(24), add({ c: '#ffd34d', k: 0.8, o: 0.16 }));
      beam.scale.set(48, 2400, 48); beam.position.y = y + 1400; beam.castShadow = false;
      const beamG = group(root, [0, 0, 0], true); beamG.add(beam);
      return { spin: crown, head: aimHead(root, y + 205, '#ffe066', 2, 70, '#b8860b'), top: y + 310 };
    },
  };
  // How big each hand's tower is drawn (gameplay footprint is the same for all).
  const COMBO_SCALE = [1, 1.0, 1.12, 1.2, 1.32, 1.42, 1.55, 1.72, 2.0];

  // ------------------------------------------------------------------ build
  function build(t, ownerColor) {
    const root = new T.Group();
    const parts = { head: null };
    let top, scale;
    if (t.kind === 'card') {
      const y = plinth(root, ownerColor, 54, 16);
      const col = PTD.SUITS[t.suit].color;
      const b = [clubsTower, diamondsTower, heartsTower, spadesTower][t.suit](root, y, col);
      Object.assign(parts, b);
      top = b.top;
      scale = 0.95 + (t.rank / 14) * 0.2;
    } else {
      const C = PTD.COMBOS[t.type];
      const y0 = plinth(root, ownerColor, 62, 14);
      const y = chipStack(root, y0, C.color, 2 + Math.min(4, t.type), 58);
      const b = COMBO[t.type](root, y, C.color, t);
      Object.assign(parts, b);
      top = b.top;
      scale = COMBO_SCALE[t.type] * (0.95 + (t.rank / 14) * 0.12);
    }
    mergeStatic(root, t.id);
    cartoonize(root);

    // the card itself floats above the tower; combos get their hand orbiting instead
    const banner = group(root, [0, top + 46, 0], true);
    if (t.kind === 'card') {
      banner.add(cardMesh(t.suit, t.rank, 62));
    } else {
      const cards = comboCards(t);
      const orbit = group(root, [0, top + 30, 0], true);
      const R = 52 + cards.length * 6;
      cards.forEach(([s, r], i) => {
        const cm = cardMesh(s, r, 34);
        const a = i / cards.length * TAU;
        cm.position.set(Math.cos(a) * R, Math.sin(i * 1.7) * 6, Math.sin(a) * R);
        cm.rotation.y = -a + Math.PI / 2;
        orbit.add(cm);
      });
      parts.orbit = orbit;
    }
    root.traverse(o => { if (o.isMesh) o.userData.towerId = t.id; });
    root.scale.setScalar(scale);

    const anim = (time, dt, firing) => {
      if (parts.spin) parts.spin.rotation.y += dt * (t.type === 8 ? 0.8 : 1.6);
      if (parts.flame) { const f = 1 + Math.sin(time * 17) * 0.08 + Math.sin(time * 29) * 0.05; parts.flame.scale.set(1 / f, f, 1 / f); parts.flame.rotation.y += dt * 2; }
      if (parts.rings) parts.rings.forEach((g, i) => { g.rotation.y += dt * (i % 2 ? 1.4 : -1.1); });
      if (parts.bubbles) parts.bubbles.children.forEach((b, i) => { b.position.y = ((time * 30 + i * 9) % 60); b.material.opacity = 1 - b.position.y / 60; });
      if (parts.dome) { const k = 1 + Math.sin(time * 2) * 0.03; parts.dome.scale.set(k, k, k); }
      if (parts.barrelSpin) parts.barrelSpin.rotation.z += dt * (firing ? 22 : 2);
      if (parts.hammer) parts.hammer.position.y = (parts.hammerY || (parts.hammerY = parts.hammer.position.y)) + (firing ? -18 : Math.sin(time * 1.2) * 6);
      if (parts.orbit) parts.orbit.rotation.y += dt * (0.4 + t.type * 0.06);
    };
    return { root, head: parts.head, banner, anim, scale, height: (top + 90) * scale };
  }

  PTD.Towers3D = { build, COMBO_SCALE };
  PTD.Toon = { toon, outline, cartoonize };
})();
