// Detailed 3D looter characters for the 3D renderer.
// PTD.Looters3D.build(def, variant) -> { rig, anim(t, moving, dt), flash: [materials], detail: [objects] }
// def.theme picks a crew from PTD.CREWS (js/crews3d.js); variant 0..2 is a crew member, 3 the leader.
// Characters are modelled about 2.4 units tall; the renderer scales them to the looter's radius.
window.PTD = window.PTD || {};

(function () {
  if (!window.THREE) return;
  const T = window.THREE;
  const TAU = Math.PI * 2;

  const G = {};
  const geo = (k, f) => G[k] || (G[k] = f());
  const sph = () => geo('s', () => new T.SphereGeometry(1, 20, 14));
  const lowSph = () => geo('ls', () => new T.SphereGeometry(1, 10, 8));
  const cap = () => geo('c', () => new T.CapsuleGeometry(1, 1, 6, 14));
  const cyl = () => geo('cy', () => new T.CylinderGeometry(1, 1, 1, 18));
  const cone = () => geo('co', () => new T.ConeGeometry(1, 1, 14));
  const box = () => geo('b', () => new T.BoxGeometry(1, 1, 1));
  const tor = () => geo('t', () => new T.TorusGeometry(1, 0.18, 8, 24));
  const disc = () => geo('d', () => new T.CylinderGeometry(1, 1, 0.12, 20));
  const OCTA = () => geo('oc', () => new T.OctahedronGeometry(1, 0));
  const wood = (c) => mat(c, { roughness: 0.6 });

  const M = {};
  function mat(color, opts) {
    const k = color + JSON.stringify(opts || {});
    if (!M[k]) {
      M[k] = new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.7, metalness: 0 }, opts || {}));
      M[k].userData.shared = true;
    }
    return M[k];
  }
  const fabric = (c) => mat(c, { roughness: 0.9 });
  const skin = (c) => mat(c, { roughness: 0.55 });
  const metal = (c) => mat(c, { roughness: 0.28, metalness: 0.85 });
  const gloss = (c) => mat(c, { roughness: 0.15, metalness: 0.1 });
  const glow = (c, k) => { const key = 'glow' + c + k; if (!M[key]) { M[key] = new T.MeshBasicMaterial({ color: new T.Color(c).multiplyScalar(k || 2.5) }); M[key].userData.shared = true; } return M[key]; };

  let dollarTex = null;
  function dollar() {
    if (dollarTex) return dollarTex;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#6b4a1e'; x.font = 'bold 50px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('$', 32, 36);
    dollarTex = new T.CanvasTexture(c); dollarTex.colorSpace = T.SRGBColorSpace;
    return dollarTex;
  }

  // ------------------------------------------------------------------ sculpted part kit
  // Vinyl-toy parts sculpted in Blender (tools/blender/kit.py -> js/kit.js). Each piece is a set of
  // meshes by colour role (main + sole/lace/band/trim/cuff/metal/dark/light/glass/glow), centred on its
  // pivot with largest half-extent 1, and carries baked ambient occlusion in its vertex colours.
  const KIT = {};
  (function decodeKit() {
    const D = PTD.KIT_DATA;
    if (!D) return;
    const bin = atob(D.b), buf = new ArrayBuffer(bin.length), u8 = new Uint8Array(buf);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const pad = (n) => (n + 3) & ~3;
    for (const name in D.m) {
      KIT[name] = D.m[name].map(([role, nv, ni, off]) => {
        const p16 = new Int16Array(buf, off, nv * 3);
        const uvOff = pad(off + nv * 6), aoOff = uvOff + nv * 4, idxOff = pad(aoOff + nv);
        const uv16 = new Uint16Array(buf, uvOff, nv * 2), ao8 = new Uint8Array(buf, aoOff, nv), idx = new Uint16Array(buf, idxOff, ni);
        const pos = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), col = new Uint8Array(nv * 3);
        for (let i = 0; i < nv * 3; i++) pos[i] = p16[i] / 32767;
        for (let i = 0; i < nv * 2; i++) uv[i] = uv16[i] / 65535;
        for (let i = 0; i < nv; i++) col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = ao8[i];
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.BufferAttribute(pos, 3));
        g.setAttribute('uv', new T.BufferAttribute(uv, 2));
        g.setAttribute('color', new T.BufferAttribute(col, 3, true));
        g.setIndex(new T.BufferAttribute(idx.slice(), 1));
        g.computeVertexNormals();
        g.computeBoundingSphere();
        return { role, geo: g };
      });
    }
  })();
  const hasKit = (name) => !!KIT[name];

  // ------------------------------------------------------------------ Blender models
  // Hand-built looters made in Blender (tools/blender/looters.py) and embedded by
  // tools/embed-models.py. Parts are named after the joints the animation drives.
  const MODELS = {};
  const modelKey = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
  function loadModels(done) {
    const data = PTD.MODEL_DATA || {};
    const keys = Object.keys(data);
    if (!keys.length || !T.GLTFLoader) { if (done) done(); return; }
    const loader = new T.GLTFLoader();
    let left = keys.length;
    keys.forEach(k => {
      const bin = atob(data[k]), buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      loader.parse(buf.buffer, '', (gltf) => { MODELS[k] = gltf.scene; if (--left === 0 && done) done(); },
        (e) => { console.warn('[BLB] model failed', k, e); if (--left === 0 && done) done(); });
    });
  }
  function fromModel(ctx, src) {
    const m = src.clone(true);
    // each looter gets its own material copies so hit flashes stay individual
    m.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); if (o.geometry.attributes.color) o.material.vertexColors = true; } });
    ctx.rig.add(m);
    const get = (n) => m.getObjectByName(n);
    const legs = [get('LegL'), get('LegR')], arms = [get('ArmL'), get('ArmR')];
    ctx.head = get('Head');
    ctx.sackG = get('Sack');
    ctx.tail = get('Tail');
    ctx.eyes = [get('EyeL'), get('EyeR')].filter(Boolean);
    ctx.ears = [get('EarL'), get('EarR')].filter(Boolean);
    const body = get('Body');
    ['Body', 'Head', 'Sack', 'LegL', 'LegR', 'ArmL', 'ArmR'].forEach(n => { const o = get(n); if (o) o.traverse(x => { if (x.isMesh) x.castShadow = true; }); });
    if (body) body.traverse(x => { if (x.isMesh) ctx.flash.push(x.material); });
    return { legs, arms };
  }

  // Outfit patterns: a canvas texture tinted with the outfit colour.
  const patterns = {};
  function patterned(base, kind, accent) {
    const key = base + kind + accent;
    if (patterns[key]) return patterns[key];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, 128, 128);
    x.fillStyle = accent;
    if (kind === 'stripes') for (let i = 0; i < 128; i += 32) x.fillRect(0, i, 128, 14);
    else if (kind === 'dots') for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { x.beginPath(); x.arc(16 + i * 32 + (j % 2) * 16, 16 + j * 32, 7, 0, TAU); x.fill(); }
    else if (kind === 'argyle') { for (let i = -1; i < 3; i++) for (let j = -1; j < 3; j++) { x.beginPath(); x.moveTo(i * 64 + 32, j * 64); x.lineTo(i * 64 + 64, j * 64 + 32); x.lineTo(i * 64 + 32, j * 64 + 64); x.lineTo(i * 64, j * 64 + 32); x.closePath(); if ((i + j) % 2 === 0) x.fill(); } }
    else if (kind === 'check') { x.globalAlpha = 0.55; for (let i = 0; i < 128; i += 32) { x.fillRect(i, 0, 16, 128); x.fillRect(0, i, 128, 16); } }
    else if (kind === 'pinstripe') for (let i = 0; i < 128; i += 16) x.fillRect(i, 0, 2, 128);
    else if (kind === 'stars') { for (let i = 0; i < 6; i++) { const cx = (i * 47) % 128, cy = (i * 71) % 128; x.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 4 : 10, a = k / 10 * TAU - Math.PI / 2; x.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } x.fill(); } }
    else if (kind === 'wraps') { x.globalAlpha = 0.8; for (let i = 0; i < 128; i += 18) { x.save(); x.translate(64, i); x.rotate((i % 36 ? 1 : -1) * 0.12); x.fillRect(-80, 0, 160, 3); x.restore(); } }
    else if (kind === 'sequins') for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.globalAlpha = (i * 3 + j * 5) % 7 / 7 * 0.8 + 0.2; x.beginPath(); x.arc(8 + i * 16 + (j % 2) * 8, 8 + j * 16, 5, 0, TAU); x.fill(); }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(2, 2);
    const m = new T.MeshStandardMaterial({ map: t, roughness: 0.9 });
    m.userData.shared = true;
    return (patterns[key] = m);
  }

  // part(parent, geometry, material, [sx,sy,sz], [x,y,z], [rx,ry,rz])
  function part(parent, g, m, s, p, r) {
    const o = new T.Mesh(g, m);
    if (s) o.scale.set(s[0], s[1], s[2]);
    if (p) o.position.set(p[0], p[1], p[2]);
    if (r) o.rotation.set(r[0], r[1], r[2]);
    parent.add(o);
    return o;
  }
  function pivot(parent, p) { const g = new T.Group(); g.position.set(p[0], p[1], p[2]); parent.add(g); return g; }

  // Kit part: kp(parent, piece, mats, size, pos, rot)
  //   mats: a material (for the 'main' role) or { main, sole, band, ... } - missing roles use ROLE defaults
  //   size: number = uniform scale; [hx, hy, hz] = stretch the piece's bounds to these half-extents
  //         (so it fills exactly the space the old primitive did)
  const ROLE = {
    sole: () => gloss('#f6f1e6'), lace: () => gloss('#ffffff'), cuff: () => mat('#ffffff', { roughness: 0.5 }),
    metal: () => metal('#e1b12c'), dark: () => mat('#3b2a1a', { roughness: 0.6 }), light: () => metal('#d9e1e8'),
    glass: () => glass('#bfefff', 0.5), glow: () => glow('#fff36b', 2.2), band: () => fabric('#1f1f24'),
    trim: (m) => m && m.color ? mat('#' + m.color.clone().multiplyScalar(0.72).getHexString(), { roughness: 0.8 }) : fabric('#333'),
  };
  const kitBounds = {};
  function kitBox(name) {
    if (kitBounds[name]) return kitBounds[name];
    const b = new T.Box3();
    for (const p of KIT[name]) { if (!p.geo.boundingBox) p.geo.computeBoundingBox(); b.union(p.geo.boundingBox); }
    return (kitBounds[name] = b);
  }
  function kp(parent, name, mats, size, pos, rot) {
    const g = new T.Group();
    const m0 = mats && mats.isMaterial ? { main: mats } : (mats || {});
    for (const { role, geo: gg } of KIT[name]) {
      const m = m0[role] || (ROLE[role] ? ROLE[role](m0.main) : null) || m0.main || fabric('#888');
      const mesh = new T.Mesh(gg, m);
      mesh.castShadow = true;
      g.add(mesh);
    }
    if (Array.isArray(size)) {
      const b = kitBox(name), sz = new T.Vector3(); b.getSize(sz);
      g.scale.set(size[0] / (sz.x / 2), size[1] / (sz.y / 2), size[2] / (sz.z / 2));
    } else g.scale.setScalar(size || 1);
    if (pos) g.position.set(pos[0], pos[1], pos[2]);
    if (rot) g.rotation.set(rot[0], rot[1], rot[2]);
    parent.add(g);
    return g;
  }
  // hats and hair are sculpted around a head of radius 1; this puts them on a head of radius r
  const kpHead = (h, name, mats, r, pos, rot) => kp(h, name, mats, r * (PTD.KIT_DATA.k[name] ? 1 / PTD.KIT_DATA.k[name] : 1), pos || [0, 0, 0], rot);

  // ------------------------------------------------------------------ faces
  function eyes(ctx, head, o) {
    const y = o.y || 0.05, z = o.z || 0.27, sp = o.sp || 0.12, s = (o.size || 0.085) * 1.25;   // big cartoon eyes
    for (const side of [-1, 1]) {
      ctx.eyes.push(part(head, sph(), gloss('#ffffff'), [s, s * (o.tall || 1.1), s * 0.7], [side * sp, y, z]));
      const iris = part(head, sph(), gloss(o.iris || '#3b2a1a'), [s * 0.66, s * 0.72, s * 0.4], [side * sp, y - s * 0.08, z + s * 0.5]);
      ctx.detail.push(iris); ctx.eyes.push(iris);
      ctx.detail.push(part(head, sph(), gloss('#050505'), [s * 0.4, s * 0.45, s * 0.3], [side * sp, y - s * 0.08, z + s * 0.62]));
      ctx.detail.push(part(head, lowSph(), glow('#ffffff', 1.5), [s * 0.16, s * 0.16, s * 0.1], [side * sp + s * 0.2, y + s * 0.2, z + s * 0.74]));
      if (o.brow) ctx.detail.push(part(head, box(), mat(o.brow), [s * 1.6, s * 0.28, s * 0.4], [side * sp, y + s * 1.35, z - 0.01], [0, 0, side * (o.angry ? 0.35 : -0.1)]));
    }
  }
  function mouth(ctx, head, y, z, grin) {
    ctx.detail.push(part(head, tor(), mat('#3a1010'), [0.07, 0.07, 0.07], [0, y, z], [0, 0, grin ? Math.PI : 0]));
  }
  // cartoon extras on any face: a cheeky grin with teeth and rosy cheeks
  function cheeky(ctx, head, y, z, sp) {
    const m = part(head, sph(), mat('#4a0f0f'), [0.09, 0.045, 0.03], [0, y, z]);
    ctx.detail.push(m);
    ctx.detail.push(part(head, box(), gloss('#ffffff'), [0.1, 0.025, 0.02], [0, y + 0.015, z + 0.012]));
    if (Math.random() < 0.5) ctx.detail.push(part(head, box(), gloss('#ffd34d'), [0.025, 0.026, 0.021], [0.03, y + 0.015, z + 0.014]));   // a gold tooth
    for (const s of [-1, 1]) ctx.detail.push(part(head, sph(), mat('#ff8fa3', { transparent: true, opacity: 0.55 }), [0.06, 0.035, 0.02], [s * sp, y + 0.08, z - 0.02]));
  }

  function humanHead(ctx, head, o) {
    if (hasKit('head')) kp(head, 'head', ctx.skinM, [0.31, 0.34, 0.31], [0, -0.01, 0]);
    else part(head, sph(), ctx.skinM, [0.3, 0.33, 0.3], [0, 0, 0]).castShadow = true;
    part(head, sph(), ctx.skinM, [0.055, 0.07, 0.06], [0, -0.02, 0.3]);                    // nose
    for (const s of [-1, 1]) part(head, sph(), ctx.skinM, [0.05, 0.08, 0.04], [s * 0.3, 0, 0]);   // ears
    eyes(ctx, head, { y: 0.06, z: 0.25, sp: 0.11, size: 0.085, iris: o.iris || '#4a3020', brow: o.hair || '#2b1d12', angry: o.angry });
    cheeky(ctx, head, -0.13, 0.28, 0.17);
    if (o.hair) part(head, sph(), fabric(o.hair), [0.31, 0.2, 0.31], [0, 0.17, -0.03]);
    if (o.beard) part(head, sph(), fabric(o.beard), [0.24, 0.16, 0.16], [0, -0.2, 0.17]);
    if (o.mustache) ctx.detail.push(part(head, cap(), fabric(o.mustache), [0.03, 0.12, 0.03], [0, -0.08, 0.3], [0, 0, Math.PI / 2]));
  }

  function rodentHead(ctx, head, o) {
    part(head, sph(), ctx.furM, [0.29, 0.27, 0.3]).castShadow = true;
    part(head, cone(), ctx.furM, [0.17, 0.32, 0.17], [0, -0.05, 0.32], [Math.PI / 2, 0, 0]);
    part(head, sph(), gloss(o.nose || '#f08aa0'), [0.055, 0.05, 0.05], [0, -0.05, 0.49]);
    for (const s of [-1, 1]) {
      const ear = pivot(head, [s * 0.2, 0.25, -0.02]);
      ctx.ears.push(ear);
      part(ear, disc(), ctx.furM, [o.ear || 0.19, 1, o.ear || 0.19], [0, 0, 0], [Math.PI / 2, 0, s * 0.3]);
      part(ear, disc(), skin(o.inner || '#f4a6b8'), [(o.ear || 0.19) * 0.65, 0.8, (o.ear || 0.19) * 0.65], [0, 0, 0.012], [Math.PI / 2, 0, s * 0.3]);
      for (let w = 0; w < 3; w++) ctx.detail.push(part(head, cyl(), mat('#eeeeee'), [0.004, 0.3, 0.004], [s * 0.16, -0.06 + w * 0.03, 0.4], [0, 0, s * (1.35 + w * 0.15)]));
    }
    eyes(ctx, head, { y: 0.08, z: 0.22, sp: 0.12, size: 0.085, iris: '#111111', tall: 1.2, brow: '#2b2b2b', angry: true });
    cheeky(ctx, head, -0.16, 0.36, 0.17);
  }

  function canineHead(ctx, head, o) {
    part(head, sph(), ctx.furM, [0.3, 0.29, 0.3]).castShadow = true;
    part(head, cap(), ctx.furM, [0.12, 0.17, 0.12], [0, -0.07, 0.3], [Math.PI / 2, 0, 0]);
    part(head, sph(), mat(o.muzzle || '#f1e6d6'), [0.13, 0.08, 0.14], [0, -0.13, 0.32]);
    part(head, sph(), gloss('#151515'), [0.055, 0.045, 0.05], [0, -0.04, 0.49]);
    for (const s of [-1, 1]) {
      ctx.ears.push(part(head, cone(), ctx.furM, [0.1, 0.24, 0.06], [s * 0.17, 0.32, -0.02], [0, 0, -s * 0.25]));
      part(head, cone(), skin(o.inner || '#e8b7a0'), [0.055, 0.16, 0.03], [s * 0.17, 0.3, 0.015], [0, 0, -s * 0.25]);
    }
    eyes(ctx, head, { y: 0.08, z: 0.22, sp: 0.12, size: 0.08, iris: o.iris || '#7a4a12', brow: o.brow || '#3b2a1a', angry: true });
    cheeky(ctx, head, -0.2, 0.36, 0.18);
  }

  function sharkHead(ctx, head, o) {
    part(head, sph(), ctx.skinM, [0.3, 0.3, 0.42], [0, 0, 0.05]).castShadow = true;
    part(head, sph(), skin(o.belly || '#eef3f7'), [0.24, 0.16, 0.34], [0, -0.13, 0.1]);
    part(head, cone(), ctx.skinM, [0.09, 0.3, 0.2], [0, 0.32, -0.05], [-0.35, 0, 0]);
    for (let i = 0; i < 7; i++) {
      const a = (i / 6 - 0.5) * 1.6;
      ctx.detail.push(part(head, cone(), gloss('#ffffff'), [0.025, 0.06, 0.025], [Math.sin(a) * 0.17, -0.12, 0.3 + Math.cos(a) * 0.08], [Math.PI, 0, 0]));
    }
    eyes(ctx, head, { y: 0.06, z: 0.22, sp: 0.2, size: 0.055, iris: '#111111' });
    for (const s of [-1, 1]) for (let g = 0; g < 3; g++) ctx.detail.push(part(head, box(), mat('#2c3e50'), [0.008, 0.1, 0.03], [s * 0.29, -0.02, -0.05 - g * 0.06]));
  }

  function goblinHead(ctx, head, o) {
    part(head, sph(), ctx.skinM, [0.31, 0.3, 0.3]).castShadow = true;
    part(head, sph(), ctx.skinM, [0.08, 0.12, 0.1], [0, -0.03, 0.31]);
    for (const s of [-1, 1]) part(head, cone(), ctx.skinM, [0.08, 0.38, 0.05], [s * 0.36, 0.08, -0.02], [0, 0, -s * 1.25]);
    eyes(ctx, head, { y: 0.07, z: 0.24, sp: 0.12, size: 0.075, iris: '#f1c40f', brow: '#2d4a20', angry: true });
    mouth(ctx, head, -0.15, 0.26, true);
    for (const s of [-1, 1]) ctx.detail.push(part(head, cone(), gloss('#fffbe0'), [0.022, 0.06, 0.022], [s * 0.05, -0.17, 0.28]));
  }

  // ------------------------------------------------------------------ bodies
  // Upright two-legged body. Returns anim parts.
  function biped(ctx, o) {
    const rig = ctx.rig;
    const top = o.pattern ? patterned(o.top, o.pattern[0], o.pattern[1]) : fabric(o.top), bottom = fabric(o.bottom || '#3a3a46'), shoes = mat(o.shoes || '#2a1d14', { roughness: 0.45 });
    ctx.flash.push(ctx.topM = top.clone());
    const legs = [], arms = [];
    for (const s of [-1, 1]) {
      const hip = pivot(rig, [s * 0.16, 0.95, 0]);
      if (o.boxy) {
        part(hip, box(), bottom, [0.2, 0.62, 0.2], [0, -0.42, 0]).castShadow = true;
        part(hip, box(), shoes, [0.24, 0.14, 0.32], [0, -0.85, 0.05]);
      } else if (!o.robe) {
        if (hasKit('leg')) kp(hip, 'leg', { main: bottom }, [0.14, 0.37, 0.14], [0, -0.42, 0]);
        else part(hip, cap(), bottom, [0.13, 0.24, 0.13], [0, -0.42, 0]).castShadow = true;
        if (o.flares) part(hip, cone(), bottom, [0.17, 0.32, 0.17], [0, -0.7, 0]);
        if (o.bigShoes) part(hip, sph(), shoes, [0.17, 0.1, 0.36], [0, -0.85, 0.16]).castShadow = true;
        else if (o.flippers) part(hip, sph(), gloss(o.shoes || '#2c3e50'), [0.16, 0.04, 0.4], [0, -0.9, 0.18]);
        else if (hasKit('sneaker')) {
          const dark = new T.Color(o.shoes || '#2a1d14'); const boots = o.boots != null ? o.boots : (dark.r + dark.g + dark.b) < 0.45;
          if (boots) kp(hip, 'boot', { main: shoes, trim: shoes, sole: mat('#2a1a10', { roughness: 0.5 }) }, [0.17, 0.22, 0.27], [0, -0.74, 0.06]);
          else kp(hip, 'sneaker', { main: shoes }, [0.17, 0.13, 0.3], [0, -0.83, 0.09]);
        } else part(hip, sph(), shoes, [0.17, 0.12, 0.27], [0, -0.83, 0.08]).castShadow = true;
      } else part(hip, sph(), shoes, [0.15, 0.1, 0.24], [0, -0.84, 0.08]).castShadow = true;
      legs.push(hip);
    }
    const torso = o.boxy ? part(rig, box(), ctx.topM, [0.64 * (o.wide || 1), 0.7, 0.46], [0, 1.33, 0])
      : hasKit('torso') ? kp(rig, 'torso', { main: ctx.topM, trim: ROLE.trim(ctx.topM) }, [0.38 * (o.wide || 1), 0.47, 0.34], [0, 1.3, 0])
      : part(rig, sph(), ctx.topM, [0.37 * (o.wide || 1), 0.46, 0.33], [0, 1.3, 0]);
    torso.castShadow = true;
    if (o.robe) part(rig, cone(), ctx.topM, [0.48, 1.05, 0.42], [0, 0.6, 0]).castShadow = true;
    if (o.belt) part(rig, cyl(), mat(o.belt, { roughness: 0.4 }), [0.335 * (o.wide || 1), 0.08, 0.295], [0, 1.06, 0]);
    if (o.vest) for (const s of [-1, 1]) part(rig, sph(), fabric(o.vest), [0.22 * (o.wide || 1), 0.4, 0.3], [s * 0.15 * (o.wide || 1), 1.33, 0.03]);   // open vest panels
    if (o.coat) { part(rig, cone(), fabric(o.coat), [0.4 * (o.wide || 1), 0.95, 0.33], [0, 1.05, -0.02]).castShadow = true; }
    if (o.shirtV) part(rig, cone(), fabric(o.shirtV), [0.11, 0.3, 0.02], [0, 1.5, 0.3], [Math.PI - 0.35, 0, 0]);
    if (o.tie) part(rig, cone(), gloss(o.tie), [0.05, 0.28, 0.02], [0, 1.42, 0.335], [Math.PI - 0.25, 0, 0]);
    if (o.chain) ctx.detail.push(part(rig, tor(), metal('#e1b12c'), [0.19, 0.22, 0.19], [0, 1.52, 0.18], [1.2, 0, 0]));
    if (o.poncho) part(rig, cone(), fabric(o.poncho), [0.46, 0.55, 0.4], [0, 1.4, 0]).castShadow = true;
    if (o.cape) part(rig, geo('capeG', () => new T.CylinderGeometry(0.34, 0.6, 1.2, 16, 1, true, Math.PI * 0.55, Math.PI * 0.9)), mat(o.cape, { side: T.DoubleSide, roughness: 0.8 }), [1, 1, 1], [0, 1.05, -0.04]);   // arc covers the back
    for (const s of [-1, 1]) {
      const sh = pivot(rig, [s * 0.36 * (o.wide || 1), 1.55, 0]);
      if (o.boxy) part(sh, box(), ctx.topM, [0.15, 0.44, 0.15], [0, -0.25, 0]);
      else {
        const armM = o.robe || o.coat ? fabric(o.coat || o.top) : ctx.topM;
        if (hasKit('sleeve')) kp(sh, 'sleeve', { main: armM, trim: ROLE.trim(armM) }, [0.085 * (o.armW || 1), 0.3, 0.085 * (o.armW || 1)], [0, -0.24, 0]);
        else part(sh, cap(), armM, [0.075 * (o.armW || 1), 0.2, 0.075 * (o.armW || 1)], [0, -0.24, 0]);
      }
      const handM = o.glove ? mat(o.glove) : ctx.skinM;
      const hand = hasKit('mitt') ? kp(sh, s === 1 && o.prop ? 'fist' : 'mitt', { main: handM, cuff: o.glove ? mat('#ffffff', { roughness: 0.5 }) : handM }, 0.17, [0, -0.5, 0.02], [0, s === 1 ? 0 : Math.PI, 0])
        : part(sh, sph(), handM, [0.12, 0.12, 0.12], [0, -0.52, 0.02]);   // big cartoon mitts
      hand.castShadow = true;
      arms.push(sh);
      if (s === 1) ctx.rightHand = hand;
    }
    if (o.knuckles) ctx.detail.push(part(arms[1], tor(), metal('#b08d57'), [0.07, 0.07, 0.1], [0, -0.52, 0.08], [0, Math.PI / 2, 0]));
    const head = pivot(rig, [0, 2.1, 0]);
    head.scale.setScalar(1.6);    // big bobble head: cartoon proportions
    part(rig, cyl(), ctx.skinM, [0.09, 0.15, 0.09], [0, 1.78, 0]);
    ctx.head = head;
    return { legs, arms, torso };
  }

  // Loot sack slung over the left shoulder.
  function sack(ctx, at, scale) {
    const g = pivot(ctx.rig, at || [-0.05, 1.45, -0.42]);
    ctx.sackG = g;
    const s = scale || 1;
    const burlap = mat('#c8a46a', { roughness: 0.95 });
    if (hasKit('sack')) kp(g, 'sack', { main: burlap, dark: mat('#7a5a2c'), metal: metal('#ffcf40') }, 0.5 * s, [0, 0.02 * s, 0], [0, Math.PI, 0]);
    else {
      part(g, sph(), burlap, [0.36 * s, 0.4 * s, 0.32 * s]).castShadow = true;
      part(g, cyl(), burlap, [0.1 * s, 0.14 * s, 0.1 * s], [0, 0.42 * s, 0]);
      part(g, tor(), mat('#7a5a2c'), [0.1 * s, 0.1 * s, 0.1 * s], [0, 0.42 * s, 0], [Math.PI / 2, 0, 0]);
    }
    const lbl = new T.Mesh(geo('dollarPlane', () => new T.PlaneGeometry(0.34, 0.34)), mat('#ffffff', { map: dollar(), transparent: true, roughness: 0.9 }));
    lbl.position.set(0, 0, -0.325 * s); lbl.rotation.y = Math.PI; lbl.scale.setScalar(s); g.add(lbl);
    ctx.detail.push(lbl);
    // a couple of coins peeking out of the top
    if (!hasKit('sack')) for (let i = 0; i < 2; i++) ctx.detail.push(part(g, cyl(), metal('#ffcf40'), [0.07 * s, 0.015 * s, 0.07 * s], [(i - 0.5) * 0.08 * s, 0.53 * s, 0], [0.4 + i * 0.5, 0, 0.3]));
    return g;
  }

  function tail(ctx, kind, color) {
    const base = pivot(ctx.rig, [0, 1.0, -0.22]);
    if (kind === 'thin') {
      const curve = new T.CatmullRomCurve3([new T.Vector3(0, 0, 0), new T.Vector3(0, -0.2, -0.35), new T.Vector3(0, 0.05, -0.7), new T.Vector3(0, 0.3, -0.85)]);
      part(base, new T.TubeGeometry(curve, 16, 0.03, 6), skin(color));
    } else if (kind === 'ringed') {
      for (let i = 0; i < 6; i++) part(base, sph(), fabric(i % 2 ? '#1f2228' : color), [0.13 - i * 0.008, 0.13 - i * 0.008, 0.1], [0, -0.05 + i * 0.07, -0.12 - i * 0.12]);
    } else if (kind === 'bushy') {
      part(base, sph(), fabric(color), [0.17, 0.17, 0.42], [0, 0.05, -0.38], [0.5, 0, 0]);
      part(base, sph(), fabric('#fff3e0'), [0.1, 0.1, 0.15], [0, 0.25, -0.74], [0.5, 0, 0]);
    } else if (kind === 'fin') {
      part(base, cone(), ctx.skinM, [0.06, 0.4, 0.2], [0, 0.1, -0.3], [-1.2, 0, 0]);
    }
    ctx.tail = base;
  }

  // Hats and other headwear on ctx.head.
  const KIT_HATS = { top: 'h_top', bowler: 'h_bowler', cowboy: 'h_cowboy', fedora: 'h_fedora', beanie: 'h_beanie', bandana: 'h_bandana', helm: 'h_helm' };
  function hat(ctx, kind, c, band) {
    const h = ctx.head;
    const kh = KIT_HATS[kind];
    if (kh && hasKit(kh)) {
      const m = kind === 'helm' ? metal(c) : fabric(c);
      kpHead(h, kh, { main: m, band: kind === 'helm' ? metal(band || '#e1b12c') : fabric(band || (kind === 'beanie' ? c : kind === 'bandana' ? '#ffffff' : '#1f1f24')) }, 0.32, [0, 0, 0]);
      return;
    }
    switch (kind) {
      case 'top': part(h, cyl(), fabric(c), [0.36, 0.03, 0.36], [0, 0.27, 0]); part(h, cyl(), fabric(c), [0.2, 0.36, 0.2], [0, 0.45, 0]);
        if (band) part(h, cyl(), fabric(band), [0.205, 0.06, 0.205], [0, 0.32, 0]); break;
      case 'bowler': part(h, cyl(), fabric(c), [0.34, 0.025, 0.34], [0, 0.24, 0]); part(h, sph(), fabric(c), [0.25, 0.2, 0.25], [0, 0.27, 0]); break;
      case 'cowboy': part(h, cyl(), fabric(c), [0.5, 0.025, 0.5], [0, 0.25, 0], [0.08, 0, 0]); part(h, sph(), fabric(c), [0.23, 0.22, 0.25], [0, 0.32, 0]);
        if (band) part(h, cyl(), fabric(band), [0.235, 0.05, 0.25], [0, 0.29, 0]); break;
      case 'fedora': part(h, cyl(), fabric(c), [0.38, 0.025, 0.38], [0, 0.25, 0]); part(h, cyl(), fabric(c), [0.22, 0.2, 0.22], [0, 0.34, 0]);
        part(h, cyl(), fabric(band || '#111'), [0.225, 0.05, 0.225], [0, 0.29, 0]); break;
      case 'beanie': part(h, sph(), fabric(c), [0.32, 0.2, 0.32], [0, 0.17, 0]); part(h, sph(), fabric(band || c), [0.07, 0.07, 0.07], [0, 0.36, 0]); break;
      case 'visor': part(h, cyl(), gloss('#2ecc71'), [0.22, 0.02, 0.22], [0, 0.18, 0.2], [0.25, 0, 0]); part(h, cyl(), fabric('#1e8449'), [0.31, 0.05, 0.31], [0, 0.2, 0]); break;
      case 'hood': part(h, sph(), fabric(c), [0.38, 0.38, 0.36], [0, 0.05, -0.06]).castShadow = true; break;
      case 'helm': part(h, sph(), metal(c), [0.34, 0.25, 0.34], [0, 0.12, 0]); part(h, box(), metal(c), [0.05, 0.12, 0.2], [0, 0.36, 0]); break;
      case 'sock': part(h, cap(), fabric(c), [0.16, 0.2, 0.16], [0, 0.32, -0.05], [-0.4, 0, 0]);
        for (let i = 0; i < 3; i++) part(h, cyl(), fabric(band || '#e74c3c'), [0.165, 0.035, 0.165], [0, 0.27 + i * 0.09, -0.04 - i * 0.035], [-0.4, 0, 0]); break;
      case 'bandana': part(h, sph(), fabric(c), [0.31, 0.15, 0.31], [0, 0.15, 0]); part(h, cone(), fabric(c), [0.06, 0.18, 0.03], [0.05, 0.1, -0.3], [0.3, 0, 0.6]); break;
    }
  }
  function mask(ctx, c) { part(ctx.head, cyl(), fabric(c), [0.31, 0.09, 0.31], [0, 0.07, 0.005]); }
  function faceMask(ctx, c) { part(ctx.head, sph(), fabric(c), [0.31, 0.17, 0.3], [0, -0.12, 0.03]); }
  function goggles(ctx, lens) {
    for (const s of [-1, 1]) {
      part(ctx.head, tor(), metal('#8a6d3b'), [0.07, 0.07, 0.07], [s * 0.11, 0.07, 0.29]);
      part(ctx.head, disc(), glow(lens || '#7fdfff', 1.6), [0.06, 0.5, 0.06], [s * 0.11, 0.07, 0.29], [Math.PI / 2, 0, 0]);
    }
    part(ctx.head, cyl(), fabric('#3b2a1a'), [0.315, 0.04, 0.315], [0, 0.07, 0]);
  }

  function prop(ctx, kind) {
    const hd = ctx.rightHand; if (!hd) return;
    const p = pivot(hd.parent, [hd.position.x, hd.position.y, hd.position.z + 0.08]);
    ctx.propG = p;
    switch (kind) {
      case 'crystal': part(p, sph(), glow('#c39bff', 2.2), [0.16, 0.16, 0.16], [0, 0.1, 0.06]); part(p, cyl(), metal('#d4a62a'), [0.1, 0.05, 0.1], [0, -0.04, 0.06]);
        { const l = new T.PointLight(0xb388ff, 0.6, 300, 0); l.position.set(0, 0.1, 0.06); p.add(l); } break;
      case 'bottle': part(p, cyl(), mat('#2ecc71', { transparent: true, opacity: 0.75, roughness: 0.1 }), [0.07, 0.2, 0.07], [0, 0.05, 0.05]); part(p, cyl(), glow('#7dff8a', 1.8), [0.05, 0.12, 0.05], [0, 0.03, 0.05]); part(p, cyl(), mat('#7a5a2c'), [0.03, 0.06, 0.03], [0, 0.18, 0.05]); break;
      case 'cane': part(p, cyl(), gloss('#111111'), [0.02, 0.9, 0.02], [0, -0.35, 0.05]); part(p, sph(), metal('#e1b12c'), [0.05, 0.05, 0.05], [0, 0.1, 0.05]); break;
      case 'clipboard': part(p, box(), mat('#a0522d'), [0.22, 0.3, 0.02], [0, 0, 0.1], [0.3, 0, 0]); part(p, box(), mat('#fdfdfd'), [0.18, 0.24, 0.022], [0, -0.01, 0.105], [0.3, 0, 0]); break;
      case 'cups': for (let i = 0; i < 3; i++) part(p, cone(), mat('#d35400'), [0.06, 0.1, 0.06], [(i - 1) * 0.1, 0.06, 0.06], [Math.PI, 0, 0]); break;
      case 'coin': part(p, cyl(), metal('#ffcf40'), [0.11, 0.02, 0.11], [0, 0.04, 0.05], [Math.PI / 2, 0, 0]); break;
      case 'wrench': part(p, box(), metal('#95a5a6'), [0.04, 0.4, 0.04], [0, 0.05, 0.05]); part(p, tor(), metal('#95a5a6'), [0.06, 0.06, 0.06], [0, 0.27, 0.05]); break;
      case 'stethoscope': part(ctx.rig, tor(), mat('#111'), [0.14, 0.18, 0.14], [0, 1.5, 0.12], [1.2, 0, 0]); part(ctx.rig, disc(), metal('#bdc3c7'), [0.05, 0.4, 0.05], [0.06, 1.3, 0.27], [Math.PI / 2, 0, 0]); break;
    }
  }

  // ------------------------------------------------------------------ non-bipeds
  function crab(ctx, shell) {
    const rig = ctx.rig, m = ctx.skinM;
    const body = part(rig, sph(), m, [0.75, 0.35, 0.55], [0, 0.6, 0]); body.castShadow = true;
    const legs = [];
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
      const lp = pivot(rig, [s * 0.55, 0.55, (i - 1) * 0.25]);
      part(lp, cap(), m, [0.05, 0.25, 0.05], [s * 0.25, -0.15, 0], [0, 0, s * 1.0]);
      legs.push(lp);
    }
    const claws = [];
    for (const s of [-1, 1]) {
      const cp = pivot(rig, [s * 0.6, 0.75, 0.4]);
      part(cp, cap(), m, [0.07, 0.15, 0.07], [0, 0, 0.1], [Math.PI / 2.4, 0, 0]);
      part(cp, sph(), m, [0.2, 0.15, 0.24], [0, 0.08, 0.35]);
      const pin = pivot(cp, [0, 0.14, 0.45]);
      part(pin, cone(), m, [0.06, 0.2, 0.06], [0, 0, 0.05], [Math.PI / 2, 0, 0]);
      claws.push(pin);
    }
    for (const s of [-1, 1]) {
      part(rig, cyl(), m, [0.025, 0.25, 0.025], [s * 0.15, 0.95, 0.3]);
      part(rig, sph(), gloss('#ffffff'), [0.07, 0.07, 0.07], [s * 0.15, 1.1, 0.3]);
      ctx.detail.push(part(rig, sph(), gloss('#111'), [0.035, 0.035, 0.035], [s * 0.15, 1.11, 0.36]));
    }
    // coin stack on its back
    for (let i = 0; i < 5; i++) part(rig, cyl(), metal('#ffcf40'), [0.17, 0.03, 0.17], [((i * 7) % 3 - 1) * 0.02, 0.95 + i * 0.065, -0.1]);
    return { crabLegs: legs, claws };
  }

  function snake(ctx) {
    const rig = ctx.rig, m = ctx.skinM, belly = fabric(ctx.spec.accent);
    const segs = [];
    for (let i = 0; i < 9; i++) {
      const r = 0.27 - i * 0.022;
      const sg = pivot(rig, [0, r, -i * 0.3]);
      part(sg, sph(), m, [r, r, r * 1.3]).castShadow = i < 3;
      part(sg, sph(), belly, [r * 0.8, r * 0.5, r * 1.2], [0, -r * 0.45, 0.02]);
      segs.push(sg);
    }
    const neck = pivot(rig, [0, 0.55, 0.15]);
    part(neck, cap(), m, [0.17, 0.3, 0.17], [0, 0, 0], [0.5, 0, 0]);
    const head = pivot(rig, [0, 0.95, 0.32]);
    part(head, sph(), m, [0.26, 0.2, 0.34]).castShadow = true;
    eyes(ctx, head, { y: 0.08, z: 0.2, sp: 0.13, size: 0.06, iris: '#f1c40f', tall: 1.5, brow: '#1d4d32', angry: true });
    ctx.snakeHead = head;
    for (const s of [-1, 1]) ctx.detail.push(part(head, cone(), gloss('#ffffff'), [0.025, 0.08, 0.025], [s * 0.07, -0.13, 0.26], [Math.PI, 0, 0]));
    const tongue = part(head, box(), gloss('#e74c3c'), [0.03, 0.01, 0.2], [0, -0.07, 0.38]);
    ctx.head = head;
    hat(ctx, 'fedora', '#2c2c2c', '#f1c40f');
    sack(ctx, [0, 0.45, -0.75], 0.75);
    return { segs, tongue };
  }

  // ------------------------------------------------------------------ themed crew kit
  // Extra heads, headwear, props, add-ons and bodies used by the crews in js/crews3d.js.
  const tri = () => geo('tri', () => new T.CylinderGeometry(1, 1, 1, 3));
  const glass = (c, o) => mat(c, { transparent: true, opacity: o || 0.3, roughness: 0.05, depthWrite: false });

  function alienHead(ctx, head, o) {
    part(head, sph(), ctx.skinM, [0.4, 0.36, 0.36], [0, 0.06, 0]).castShadow = true;
    part(head, sph(), ctx.skinM, [0.2, 0.16, 0.2], [0, -0.2, 0.06]);
    const n = o.eyes3 ? [-0.17, 0, 0.17] : [-0.14, 0.14];
    for (const x of n) {
      const e = part(head, sph(), gloss('#0b0b12'), [o.eyes3 ? 0.075 : 0.11, 0.07, 0.05], [x, x === 0 ? 0.16 : 0.05, 0.31], [0, 0, x * -2.6]);
      ctx.eyes.push(e);
      ctx.detail.push(part(head, lowSph(), glow('#ffffff', 1.5), [0.02, 0.02, 0.01], [x + 0.03, (x === 0 ? 0.16 : 0.05) + 0.03, 0.355]));
    }
    ctx.detail.push(part(head, tor(), mat('#2a0f2a'), [0.04, 0.025, 0.03], [0, -0.17, 0.27], [0, 0, Math.PI]));
    for (const s of [-1, 1]) {
      const ant = pivot(head, [s * 0.12, 0.36, 0]);
      ctx.ears.push(ant);
      part(ant, cyl(), ctx.skinM, [0.015, 0.25, 0.015], [s * 0.04, 0.11, 0], [0, 0, -s * 0.3]);
      part(ant, sph(), glow(o.antC || '#fff36b', 2), [0.05, 0.05, 0.05], [s * 0.08, 0.24, 0]);
    }
  }
  function robotHead(ctx, head, o) {
    part(head, box(), ctx.skinM, [0.5, 0.42, 0.44]).castShadow = true;
    part(head, box(), mat('#1b2330'), [0.4, 0.16, 0.02], [0, 0.05, 0.22]);
    for (const s of [-1, 1]) {
      const e = part(head, cyl(), glow(o.eyeC || '#5ef2ff', 2.4), [0.055, 0.02, 0.055], [s * 0.1, 0.05, 0.235], [Math.PI / 2, 0, 0]);
      ctx.eyes.push(e);
      part(head, cyl(), metal('#7f8c8d'), [0.07, 0.06, 0.07], [s * 0.26, 0, 0], [0, 0, Math.PI / 2]);   // ear bolts
    }
    for (let i = 0; i < 4; i++) ctx.detail.push(part(head, box(), mat('#1b2330'), [0.05, 0.03, 0.02], [(i - 1.5) * 0.07, -0.12, 0.225]));
    part(head, cyl(), metal('#95a5a6'), [0.015, 0.18, 0.015], [0, 0.29, 0]);
    ctx.ears.push(part(head, sph(), glow(o.eyeC || '#5ef2ff', 2), [0.045, 0.045, 0.045], [0, 0.4, 0]));
  }
  function zombieHead(ctx, head, o) {
    part(head, sph(), ctx.skinM, [0.3, 0.33, 0.3]).castShadow = true;
    part(head, sph(), ctx.skinM, [0.05, 0.065, 0.06], [0.02, -0.03, 0.3]);
    // mismatched eyes: one big and staring, one droopy
    ctx.eyes.push(part(head, sph(), gloss('#f3f7d0'), [0.1, 0.11, 0.06], [-0.11, 0.07, 0.25]));
    ctx.detail.push(part(head, sph(), gloss('#111'), [0.025, 0.025, 0.02], [-0.12, 0.06, 0.31]));
    ctx.eyes.push(part(head, sph(), gloss('#f3f7d0'), [0.07, 0.04, 0.05], [0.12, 0.04, 0.26]));
    ctx.detail.push(part(head, box(), mat('#3d5a2a'), [0.1, 0.02, 0.02], [0.12, 0.07, 0.28], [0, 0, -0.25]));   // droopy lid
    ctx.detail.push(part(head, sph(), mat('#3a1010'), [0.08, 0.06, 0.03], [0, -0.15, 0.27]));                  // gaping mouth
    for (let i = 0; i < 4; i++) ctx.detail.push(part(head, box(), mat('#2b2b2b'), [0.006, 0.05, 0.01], [0.04 + i * 0.035, 0.22, 0.2]));   // stitches
    ctx.detail.push(part(head, box(), mat('#2b2b2b'), [0.14, 0.006, 0.01], [0.09, 0.22, 0.2]));
    if (o.brain !== false) part(head, sph(), mat('#f5a3b5', { roughness: 0.5 }), [0.13, 0.08, 0.12], [-0.08, 0.27, 0.02]);
    if (o.hair) part(head, sph(), fabric(o.hair), [0.31, 0.16, 0.31], [0.05, 0.2, -0.05]);
    if (o.bolts) for (const s of [-1, 1]) part(head, cyl(), metal('#95a5a6'), [0.03, 0.12, 0.03], [s * 0.3, -0.12, 0], [0, 0, Math.PI / 2]);
  }
  function clownHead(ctx, head, o) {
    part(head, sph(), ctx.skinM, [0.3, 0.32, 0.3]).castShadow = true;
    part(head, sph(), glow('#ff2a2a', 1.1), [0.08, 0.08, 0.08], [0, -0.02, 0.31]);                             // red nose
    for (const s of [-1, 1]) part(head, OCTA(), mat('#2e86de'), [0.05, 0.08, 0.01], [s * 0.11, 0.06, 0.275]);  // diamond eye paint
    eyes(ctx, head, { y: 0.06, z: 0.27, sp: 0.11, size: 0.07, iris: '#2e86de', brow: '#111' });
    ctx.detail.push(part(head, tor(), mat('#e74c3c'), [0.14, 0.1, 0.06], [0, -0.13, 0.25], [0, 0, Math.PI]));    // huge painted grin
  }
  function vampireHead(ctx, head, o) {
    humanHead(ctx, head, Object.assign({}, o, { hair: null, iris: '#c0392b', angry: true }));
    part(head, sph(), fabric(o.hair || '#111'), [0.31, 0.19, 0.31], [0, 0.18, -0.04]);
    part(head, cone(), fabric(o.hair || '#111'), [0.06, 0.1, 0.02], [0, 0.22, 0.28], [Math.PI, 0, 0]);         // widow's peak
    for (const s of [-1, 1]) {
      ctx.detail.push(part(head, cone(), gloss('#ffffff'), [0.018, 0.05, 0.018], [s * 0.035, -0.17, 0.29], [Math.PI, 0, 0]));   // fangs
      part(head, cone(), ctx.skinM, [0.04, 0.12, 0.03], [s * 0.31, 0.06, 0], [0, 0, -s * 1.1]);                                 // pointy ears
    }
  }
  function yetiHead(ctx, head, o) {
    part(head, sph(), ctx.furM, [0.36, 0.34, 0.34]).castShadow = true;
    part(head, sph(), skin(o.face || '#9fb3c8'), [0.24, 0.22, 0.1], [0, -0.02, 0.27]);
    for (const s of [-1, 1]) part(head, cone(), gloss('#f5efe0'), [0.05, 0.16, 0.05], [s * 0.25, 0.3, 0], [0, 0, -s * 0.6]);
    eyes(ctx, head, { y: 0.07, z: 0.33, sp: 0.09, size: 0.065, iris: '#2c3e50', brow: '#5d6d7e', angry: true });
    ctx.detail.push(part(head, sph(), mat('#3a1010'), [0.1, 0.04, 0.03], [0, -0.12, 0.34]));
    for (const s of [-1, 1]) ctx.detail.push(part(head, cone(), gloss('#ffffff'), [0.02, 0.05, 0.02], [s * 0.05, -0.1, 0.36], [Math.PI, 0, 0]));
  }
  function gnomeHead(ctx, head, o) {
    humanHead(ctx, head, Object.assign({}, o, { beard: null }));
    part(head, sph(), skin('#f29c9c'), [0.09, 0.08, 0.08], [0, -0.03, 0.32]);                                      // big round nose
    part(head, cone(), fabric(o.beard || '#ffffff'), [0.27, 0.5, 0.2], [0, -0.32, 0.15], [Math.PI + 0.25, 0, 0]).castShadow = true;
    part(head, sph(), fabric(o.beard || '#ffffff'), [0.28, 0.14, 0.2], [0, -0.1, 0.18]);
  }
  function mummyHead(ctx, head, o) {
    part(head, sph(), ctx.skinM, [0.3, 0.33, 0.3]).castShadow = true;
    ctx.eyes.push(part(head, sph(), glow('#ffe066', 1.8), [0.05, 0.035, 0.03], [-0.1, 0.06, 0.28]));
    ctx.eyes.push(part(head, sph(), mat('#1b1b1b'), [0.05, 0.02, 0.03], [0.1, 0.06, 0.28]));
    for (let i = 0; i < 2; i++) ctx.detail.push(part(head, box(), ctx.skinM, [0.3, 0.035, 0.02], [0.04, 0.16 - i * 0.24, 0.29], [0, 0, 0.3 - i * 0.6]));   // loose wraps
  }
  function diverHead(ctx, head, o) {
    const brass = metal('#c99a2e');
    part(head, sph(), brass, [0.42, 0.42, 0.42]).castShadow = true;
    part(head, cyl(), brass, [0.36, 0.12, 0.36], [0, -0.38, 0]);
    part(head, disc(), mat('#0e2a3a', { roughness: 0.2 }), [0.19, 0.4, 0.19], [0, 0.02, 0.39], [Math.PI / 2, 0, 0]);
    eyes(ctx, head, { y: 0.04, z: 0.4, sp: 0.07, size: 0.055, iris: '#111', brow: null });
    part(head, tor(), brass, [0.2, 0.2, 0.25], [0, 0.02, 0.41]);
    part(head, disc(), glass('#bfe9ff', 0.25), [0.19, 0.3, 0.19], [0, 0.02, 0.47], [Math.PI / 2, 0, 0]);
    for (const s of [-1, 1]) { part(head, tor(), brass, [0.09, 0.09, 0.12], [s * 0.37, 0.04, 0.05], [0, Math.PI / 2, 0]); part(head, disc(), mat('#0e2a3a'), [0.08, 0.3, 0.08], [s * 0.4, 0.04, 0.05], [0, 0, Math.PI / 2]); }
    part(head, cyl(), brass, [0.06, 0.1, 0.06], [0, 0.44, 0]);
    part(head, new T.TubeGeometry(new T.CatmullRomCurve3([new T.Vector3(0, 0.1, -0.38), new T.Vector3(0, -0.2, -0.65), new T.Vector3(0, -0.7, -0.6)]), 10, 0.035, 6), mat('#3b3b3b'));   // air hose
  }

  function crewHat(ctx, kind, c, band) {
    const h = ctx.head;
    if (kind === 'tricorn' && hasKit('h_tricorn')) {
      kpHead(h, 'h_tricorn', { main: fabric(c), band: metal(band || '#e1b12c') }, 0.32);
      part(h, sph(), gloss('#f7f7f7'), [0.06, 0.06, 0.02], [0, 0.38, 0.27]);                                     // skull badge
      return;
    }
    if (kind === 'viking' && hasKit('h_helm')) {
      kpHead(h, 'h_helm', { main: metal(c), band: metal(band || c) }, 0.32);
      for (const s of [-1, 1]) kp(h, 'horn', gloss('#fbf3dc'), 0.2, [s * 0.3, 0.16, 0], [0, s === 1 ? 0 : Math.PI, 0.1 * s]);
      return;
    }
    if (kind === 'knight' && hasKit('h_helm')) {
      kpHead(h, 'h_helm', { main: metal(c), band: metal(c) }, 0.33);
      part(h, sph(), fabric(band || '#c0392b'), [0.07, 0.24, 0.2], [0, 0.5, -0.08], [-0.4, 0, 0]).castShadow = true;   // plume
      return;
    }
    if (kind === 'toque' && hasKit('h_toque')) { kpHead(h, 'h_toque', fabric(c || '#ffffff'), 0.31); return; }
    if (kind === 'wizard' && hasKit('h_wizard')) {
      const w = kpHead(h, 'h_wizard', { main: fabric(c), band: fabric(band || '#f5d76e') }, 0.32);
      for (let i = 0; i < 3; i++) ctx.detail.push(part(h, OCTA(), glow(band || '#f5d76e', 1.8), [0.04, 0.04, 0.02], [Math.cos(i * 2.1) * 0.12, 0.42 + i * 0.13, Math.sin(i * 2.1) * 0.1 + 0.06 - i * 0.05]));
      return w;
    }
    switch (kind) {
      case 'tricorn':
        part(h, tri(), fabric(c), [0.46, 0.06, 0.46], [0, 0.25, 0], [0, Math.PI, 0]).castShadow = true;
        part(h, sph(), fabric(c), [0.26, 0.18, 0.26], [0, 0.3, 0]);
        if (band) part(h, tri(), metal(band), [0.47, 0.02, 0.47], [0, 0.28, 0], [0, Math.PI, 0]);
        part(h, sph(), gloss('#f7f7f7'), [0.06, 0.06, 0.02], [0, 0.36, 0.24]);                                     // skull badge
        break;
      case 'viking':
        part(h, sph(), metal(c), [0.34, 0.26, 0.34], [0, 0.13, 0]).castShadow = true;
        part(h, cyl(), metal(band || c), [0.345, 0.05, 0.345], [0, 0.12, 0]);
        part(h, box(), metal(band || c), [0.04, 0.16, 0.03], [0, 0.03, 0.33]);
        for (const s of [-1, 1]) part(h, cone(), gloss('#fbf3dc'), [0.07, 0.3, 0.07], [s * 0.33, 0.32, 0], [0, 0, -s * 1.0]).castShadow = true;
        break;
      case 'bubble':
        part(h, sph(), glass('#d8f3ff', 0.22), [0.46, 0.46, 0.46], [0, 0.02, 0]);
        part(h, tor(), metal('#bdc3c7'), [0.33, 0.33, 0.45], [0, -0.33, 0], [Math.PI / 2, 0, 0]);
        ctx.detail.push(part(h, sph(), glow('#ffffff', 1.3), [0.06, 0.12, 0.02], [-0.22, 0.22, 0.33], [0, 0, 0.5]));   // glare
        break;
      case 'toque':
        part(h, cyl(), fabric(c || '#ffffff'), [0.26, 0.14, 0.26], [0, 0.3, 0]);
        part(h, sph(), fabric(c || '#ffffff'), [0.33, 0.22, 0.33], [0, 0.5, 0]).castShadow = true;
        for (const s of [-1, 1]) part(h, sph(), fabric(c || '#ffffff'), [0.18, 0.16, 0.18], [s * 0.17, 0.48, 0.05]);
        break;
      case 'wizard': {
        part(h, cyl(), fabric(c), [0.48, 0.02, 0.48], [0, 0.26, 0]);
        const tip = pivot(h, [0, 0.27, 0]); tip.rotation.x = -0.25;
        part(tip, cone(), fabric(c), [0.27, 0.75, 0.27], [0, 0.37, 0]).castShadow = true;
        for (let i = 0; i < 3; i++) ctx.detail.push(part(tip, OCTA(), glow(band || '#f5d76e', 1.8), [0.04, 0.04, 0.02], [Math.cos(i * 2.1) * 0.13, 0.15 + i * 0.17, Math.sin(i * 2.1) * 0.13 + 0.04]));
        break;
      }
      case 'knight':
        part(h, sph(), metal(c), [0.35, 0.3, 0.35], [0, 0.11, -0.01]).castShadow = true;
        for (const s of [-1, 1]) part(h, box(), metal(c), [0.06, 0.24, 0.16], [s * 0.3, -0.07, 0.12]);
        part(h, box(), metal(c), [0.04, 0.2, 0.04], [0, 0.07, 0.33]);
        part(h, sph(), fabric(band || '#c0392b'), [0.07, 0.24, 0.2], [0, 0.48, -0.08], [-0.4, 0, 0]).castShadow = true;   // plume
        break;
      case 'ninja':
        part(h, sph(), fabric(c), [0.325, 0.345, 0.325], [0, 0.02, -0.01]).castShadow = true;
        // fall through to add the headband
      case 'headband': {
        part(h, cyl(), fabric(band || '#e74c3c'), [0.335, 0.055, 0.335], [0, 0.15, 0]);
        const tails = pivot(h, [0, 0.15, -0.32]); ctx.ears.push(tails);
        for (const s of [-1, 1]) part(tails, box(), fabric(band || '#e74c3c'), [0.05, 0.02, 0.28], [s * 0.04, -0.05, -0.12], [0.5, s * 0.3, 0]);
        break;
      }
      case 'luchador':
        part(h, sph(), fabric(c), [0.312, 0.342, 0.312], [0, 0, 0]).castShadow = true;
        for (const s of [-1, 1]) {
          part(h, sph(), fabric(band || '#f1c40f'), [0.1, 0.11, 0.03], [s * 0.11, 0.06, 0.275], [0, 0, -s * 0.5]);
          part(h, cone(), fabric(band || '#f1c40f'), [0.05, 0.16, 0.02], [s * 0.2, 0.14, 0.23], [0, -s * 0.6, -s * 0.9]);   // flame flicks
        }
        part(h, box(), fabric(band || '#f1c40f'), [0.04, 0.14, 0.34], [0, 0.3, -0.02]);
        break;
      case 'gladiator':
        part(h, sph(), metal(c), [0.34, 0.28, 0.34], [0, 0.12, 0]).castShadow = true;
        for (const s of [-1, 1]) part(h, box(), metal(c), [0.05, 0.22, 0.14], [s * 0.29, -0.06, 0.14]);
        part(h, box(), fabric(band || '#c0392b'), [0.06, 0.2, 0.48], [0, 0.44, -0.02]).castShadow = true;
        break;
      case 'afro':
        part(h, sph(), fabric(c), [0.41, 0.33, 0.4], [0, 0.22, -0.1]).castShadow = true;
        ctx.detail.push(part(h, box(), gloss('#e74c3c'), [0.12, 0.03, 0.02], [0.2, 0.44, 0.16], [0, 0, 0.6]));   // afro pick
        break;
      case 'cavehair':
        part(h, sph(), fabric(c), [0.33, 0.2, 0.33], [0, 0.17, -0.02]);
        for (let i = 0; i < 6; i++) part(h, cone(), fabric(c), [0.07, 0.2, 0.07], [Math.cos(i) * 0.18, 0.32, Math.sin(i) * 0.18 - 0.03], [Math.sin(i) * 0.5, 0, -Math.cos(i) * 0.5]);
        part(h, cyl(), gloss('#f7f2e0'), [0.025, 0.36, 0.025], [0, 0.36, 0.05], [0, 0, Math.PI / 2]);
        for (const s of [-1, 1]) part(h, sph(), gloss('#f7f2e0'), [0.045, 0.045, 0.045], [s * 0.18, 0.36, 0.05]);
        break;
      case 'clownwig':
        for (const s of [-1, 1]) part(h, sph(), fabric(c), [0.2, 0.2, 0.2], [s * 0.3, 0.1, -0.05]).castShadow = true;
        part(h, sph(), ctx.skinM, [0.3, 0.12, 0.3], [0, 0.24, 0]);
        part(h, cyl(), fabric(band || '#2ecc71'), [0.12, 0.12, 0.12], [0.05, 0.36, 0], [0, 0, 0.2]);           // tiny hat
        part(h, cyl(), fabric(band || '#2ecc71'), [0.18, 0.015, 0.18], [0.04, 0.3, 0], [0, 0, 0.2]);
        break;
      case 'gnome': {
        const tip = pivot(h, [0, 0.2, -0.02]); tip.rotation.x = -0.35;
        part(tip, cone(), fabric(c), [0.32, 0.85, 0.32], [0, 0.4, 0]).castShadow = true;
        ctx.ears.push(tip);
        break;
      }
      case 'pith':
        part(h, sph(), fabric(c), [0.36, 0.24, 0.37], [0, 0.17, 0]).castShadow = true;
        part(h, cyl(), fabric(c), [0.46, 0.02, 0.48], [0, 0.16, 0]);
        part(h, cyl(), fabric(band || '#5d4037'), [0.365, 0.05, 0.375], [0, 0.2, 0]);
        break;
      case 'nemes':
        part(h, sph(), patterned(c, 'stripes', band || '#2e86de'), [0.34, 0.3, 0.33], [0, 0.1, -0.02]).castShadow = true;
        for (const s of [-1, 1]) part(h, box(), patterned(c, 'stripes', band || '#2e86de'), [0.12, 0.45, 0.06], [s * 0.27, -0.25, 0.06]);
        part(h, cone(), metal('#e1b12c'), [0.04, 0.1, 0.03], [0, 0.32, 0.3]);                                     // cobra crest
        break;
      case 'wildhair':
        for (let i = 0; i < 7; i++) part(h, cone(), fabric(c), [0.08, 0.24, 0.08], [Math.cos(i * 0.9) * 0.24, 0.12 + (i % 2) * 0.05, Math.sin(i * 0.9) * 0.2 - 0.06], [Math.sin(i * 0.9) * -0.9, 0, -Math.cos(i * 0.9) * 0.9]);
        part(h, sph(), ctx.skinM, [0.29, 0.12, 0.29], [0, 0.25, 0]);   // shiny bald top
        break;
      case 'crown':
        part(h, cyl(), metal('#e1b12c'), [0.22, 0.1, 0.22], [0, 0.32, 0]);
        for (let k = 0; k < 5; k++) part(h, cone(), metal('#e1b12c'), [0.05, 0.14, 0.05], [Math.cos(k / 5 * TAU) * 0.2, 0.43, Math.sin(k / 5 * TAU) * 0.2]);
        break;
      default: hat(ctx, kind, c, band);
    }
  }

  function crewProp(ctx, kind, o) {
    const hd = ctx.rightHand; if (!hd) return false;
    const p = pivot(hd.parent, [hd.position.x, hd.position.y, hd.position.z + 0.08]);
    ctx.propG = p;
    const W = wood('#8b5a2b'), steel = metal('#cfd6dc'), gold = metal('#e1b12c');
    const KP = {
      cutlass: ['p_cutlass', 0.72, { light: steel, metal: gold, dark: mat('#3b2a1a') }],
      sword: ['p_sword', 0.92, { light: steel, metal: gold, dark: mat('#3b2a1a') }],
      club: ['p_club', 0.75, W],
      wand: ['p_wand', 0.48, { dark: mat('#2b1d12'), glow: glow(o.wandC || '#fff36b', 2.4) }],
      trident: ['p_trident', 1.05, { dark: W, metal: gold }],
      raygun: ['p_raygun', 0.34, { main: metal('#c0c0c0'), metal: glow('#7dff8a', 1.6), glow: glow('#7dff8a', 2.4) }],
      shuriken: ['p_shuriken', 0.16, { light: steel, dark: mat('#333333') }],
      flask: ['p_flask', 0.3, { glass: glass('#bfffcf', 0.45), dark: mat('#7a5a2c'), glow: glow(o.flaskC || '#7dff8a', 1.8) }],
    };
    if (KP[kind] && hasKit(KP[kind][0])) {
      const [nm, size, mats] = KP[kind];
      kp(p, nm, mats, size, kind === 'shuriken' ? [0, 0.12, 0.03] : kind === 'raygun' ? [0, 0.06, 0.04] : [0, 0, 0], kind === 'raygun' ? [0, 0, 0] : null);
      return true;
    }
    if (kind === 'rollingpin' && hasKit('p_rollingpin')) { kp(p, 'p_rollingpin', { main: wood('#d9a066'), dark: W }, 0.42, [-0.36, 0.12, 0.04], [0, 0, -Math.PI / 2]); return true; }
    switch (kind) {
      case 'cutlass': part(p, cyl(), gold, [0.03, 0.14, 0.03], [0, 0, 0]); part(p, tor(), gold, [0.07, 0.07, 0.07], [0, 0.08, 0.02], [0, Math.PI / 2, 0]);
        part(p, box(), steel, [0.05, 0.55, 0.012], [0.03, 0.38, 0], [0, 0, -0.12]); break;
      case 'sword': part(p, cyl(), mat('#3b2a1a'), [0.03, 0.16, 0.03], [0, 0, 0]); part(p, box(), gold, [0.24, 0.04, 0.05], [0, 0.09, 0]);
        part(p, box(), steel, [0.055, 0.75, 0.015], [0, 0.48, 0]); part(p, cone(), steel, [0.04, 0.08, 0.01], [0, 0.89, 0]); break;
      case 'club': part(p, cone(), W, [0.13, 0.7, 0.13], [0, 0.3, 0], [Math.PI, 0, 0]); for (let i = 0; i < 4; i++) part(p, cone(), gloss('#f7f2e0'), [0.03, 0.08, 0.03], [Math.cos(i * 1.6) * 0.11, 0.5, Math.sin(i * 1.6) * 0.11], [Math.sin(i * 1.6) * 1.3, 0, -Math.cos(i * 1.6) * 1.3]); break;
      case 'axe': part(p, cyl(), W, [0.025, 0.8, 0.025], [0, 0.25, 0]); part(p, cyl(), steel, [0.18, 0.02, 0.18], [0.1, 0.55, 0], [Math.PI / 2, 0, 0]); break;
      case 'hammer': part(p, cyl(), W, [0.03, 0.7, 0.03], [0, 0.2, 0]); part(p, box(), metal('#7f8c8d'), [0.3, 0.16, 0.16], [0, 0.58, 0]); break;
      case 'spear': part(p, cyl(), W, [0.022, 1.3, 0.022], [0, 0.2, 0]); part(p, cone(), steel, [0.05, 0.2, 0.05], [0, 0.94, 0]); break;
      case 'trident': case 'harpoon': part(p, cyl(), W, [0.022, 1.2, 0.022], [0, 0.2, 0]);
        if (kind === 'trident') { for (const s of [-1, 0, 1]) part(p, cone(), gold, [0.025, 0.16, 0.025], [s * 0.08, 0.92, 0]); part(p, box(), gold, [0.2, 0.03, 0.03], [0, 0.82, 0]); }
        else { part(p, cone(), steel, [0.05, 0.2, 0.05], [0, 0.9, 0]); for (const s of [-1, 1]) part(p, cone(), steel, [0.02, 0.08, 0.02], [s * 0.04, 0.8, 0], [0, 0, s * 2.6]); }
        break;
      case 'wand': part(p, cyl(), mat('#2b1d12'), [0.016, 0.42, 0.016], [0, 0.17, 0.02]); part(p, OCTA(), glow(o.wandC || '#fff36b', 2.4), [0.07, 0.07, 0.03], [0, 0.42, 0.02]); break;
      case 'orbstaff': part(p, cyl(), W, [0.025, 1.3, 0.025], [0, 0.15, 0]); part(p, sph(), glow(o.wandC || '#7fdfff', 2.2), [0.13, 0.13, 0.13], [0, 0.88, 0]);
        part(p, tor(), gold, [0.1, 0.1, 0.1], [0, 0.82, 0], [Math.PI / 2, 0, 0]); break;
      case 'lasso': part(p, tor(), mat('#c8a46a'), [0.28, 0.28, 0.4], [0, 0.4, 0], [Math.PI / 2, 0, 0]); part(p, cyl(), mat('#c8a46a'), [0.012, 0.3, 0.012], [0, 0.15, 0]); break;
      case 'shuriken': for (let k = 0; k < 4; k++) part(p, cone(), steel, [0.04, 0.12, 0.012], [Math.cos(k * TAU / 4) * 0.07, 0.12 + Math.sin(k * TAU / 4) * 0.07, 0.03], [0, 0, k * TAU / 4 - Math.PI / 2]); part(p, cyl(), mat('#333'), [0.035, 0.02, 0.035], [0, 0.12, 0.03], [Math.PI / 2, 0, 0]); break;
      case 'raygun': part(p, box(), metal('#c0c0c0'), [0.08, 0.1, 0.2], [0, 0.03, 0.06]); part(p, cyl(), metal('#c0c0c0'), [0.03, 0.18, 0.03], [0, 0.05, 0.22], [Math.PI / 2, 0, 0]);
        for (let i = 0; i < 3; i++) part(p, tor(), glow('#7dff8a', 1.6), [0.045, 0.045, 0.045], [0, 0.05, 0.18 + i * 0.05]); part(p, sph(), glow('#7dff8a', 2.4), [0.035, 0.035, 0.035], [0, 0.05, 0.32]); break;
      case 'rollingpin': part(p, cyl(), wood('#d9a066'), [0.07, 0.42, 0.07], [0, 0.12, 0.04], [0, 0, Math.PI / 2]); for (const s of [-1, 1]) part(p, cyl(), W, [0.025, 0.12, 0.025], [s * 0.27, 0.12, 0.04], [0, 0, Math.PI / 2]); break;
      case 'pan': part(p, cyl(), mat('#1b1b1b'), [0.025, 0.28, 0.025], [0, 0.15, 0]); part(p, cyl(), mat('#2b2b2b', { metalness: 0.5, roughness: 0.4 }), [0.2, 0.04, 0.2], [0, 0.42, 0.05], [1.2, 0, 0]);
        part(p, sph(), mat('#ffd34d'), [0.07, 0.02, 0.07], [0, 0.44, 0.08], [1.2, 0, 0]); break;   // fried egg
      case 'cleaver': part(p, cyl(), mat('#3b2a1a'), [0.03, 0.16, 0.03], [0, 0, 0]); part(p, box(), steel, [0.22, 0.2, 0.012], [0.07, 0.17, 0]); break;
      case 'ladle': part(p, cyl(), steel, [0.015, 0.5, 0.015], [0, 0.2, 0]); part(p, sph(), steel, [0.09, 0.06, 0.09], [0, 0.47, 0.03]); break;
      case 'flask': part(p, sph(), glass('#bfffcf', 0.55), [0.11, 0.11, 0.11], [0, 0.08, 0.04]); part(p, sph(), glow(o.flaskC || '#7dff8a', 1.8), [0.085, 0.07, 0.085], [0, 0.06, 0.04]);
        part(p, cyl(), glass('#bfffcf', 0.55), [0.035, 0.12, 0.035], [0, 0.22, 0.04]); part(p, cyl(), mat('#7a5a2c'), [0.04, 0.04, 0.04], [0, 0.3, 0.04]); break;
      case 'brainjar': part(p, cyl(), glass('#c7f7ff', 0.4), [0.14, 0.24, 0.14], [0, 0.14, 0.04]); part(p, sph(), mat('#f5a3b5'), [0.1, 0.08, 0.09], [0, 0.13, 0.04]);
        part(p, cyl(), metal('#7f8c8d'), [0.15, 0.04, 0.15], [0, 0.27, 0.04]); break;
      case 'net': part(p, cyl(), W, [0.02, 0.7, 0.02], [0, 0.25, 0]); part(p, tor(), mat('#7a5a2c'), [0.18, 0.18, 0.18], [0, 0.72, 0], [0.3, 0, 0]);
        part(p, cone(), mat('#f4f1e8', { transparent: true, opacity: 0.6, side: T.DoubleSide }), [0.17, 0.3, 0.17], [0, 0.6, -0.05], [Math.PI + 0.3, 0, 0]); break;
      case 'machete': part(p, cyl(), mat('#3b2a1a'), [0.03, 0.14, 0.03], [0, 0, 0]); part(p, box(), steel, [0.08, 0.5, 0.012], [0, 0.34, 0], [0, 0, 0.08]); break;
      case 'lantern': part(p, cyl(), mat('#2b2b2b'), [0.012, 0.12, 0.012], [0, 0.0, 0.03]); part(p, box(), metal('#5d4a2a'), [0.13, 0.18, 0.13], [0, -0.14, 0.03]);
        part(p, sph(), glow(o.lampC || '#ffcf5a', 2.2), [0.06, 0.08, 0.06], [0, -0.14, 0.03]); break;
      case 'shovel': part(p, cyl(), W, [0.022, 0.8, 0.022], [0, 0.2, 0]); part(p, box(), steel, [0.16, 0.2, 0.02], [0, 0.66, 0]); break;
      case 'pickaxe': part(p, cyl(), W, [0.022, 0.7, 0.022], [0, 0.2, 0]); part(p, geo('pickG', () => new T.TorusGeometry(0.22, 0.03, 6, 12, Math.PI)), steel, [1, 1, 1], [0, 0.48, 0]); break;
      case 'mallet': part(p, cyl(), wood('#f1c40f'), [0.03, 0.6, 0.03], [0, 0.22, 0]); part(p, cyl(), mat('#e74c3c'), [0.17, 0.32, 0.17], [0, 0.6, 0], [0, 0, Math.PI / 2]);
        for (const s of [-1, 1]) part(p, cyl(), mat('#ffffff'), [0.175, 0.04, 0.175], [s * 0.12, 0.6, 0], [0, 0, Math.PI / 2]); break;
      case 'balloon': part(p, cyl(), mat('#eeeeee'), [0.004, 0.6, 0.004], [0, 0.3, 0]); part(p, sph(), gloss(o.balloonC || '#e84393'), [0.16, 0.2, 0.16], [0, 0.75, 0]).castShadow = true; break;
      case 'pie': part(p, cyl(), wood('#d9a066'), [0.14, 0.04, 0.14], [0, 0.06, 0.06]); part(p, sph(), mat('#ffffff'), [0.13, 0.06, 0.13], [0, 0.09, 0.06]); part(p, sph(), glow('#ff4d4d', 1.2), [0.025, 0.025, 0.025], [0, 0.15, 0.06]); break;
      case 'flag': part(p, cyl(), metal('#bdc3c7'), [0.015, 1.0, 0.015], [0, 0.3, 0]); part(p, box(), fabric(o.flagC || '#e74c3c'), [0.02, 0.22, 0.34], [0, 0.66, -0.17]); break;
      case 'goblet': part(p, cyl(), metal('#c0c0c0'), [0.012, 0.1, 0.012], [0, 0.05, 0.03]); part(p, cone(), metal('#c0c0c0'), [0.07, 0.1, 0.07], [0, 0.14, 0.03], [Math.PI, 0, 0]); part(p, cyl(), mat('#7f0000'), [0.06, 0.01, 0.06], [0, 0.18, 0.03]); break;
      case 'mic': part(p, cyl(), mat('#1b1b1b'), [0.025, 0.18, 0.025], [0, 0.06, 0.03]); part(p, sph(), metal('#bdc3c7'), [0.055, 0.055, 0.055], [0, 0.18, 0.03]); break;
      case 'discoball': part(p, cyl(), mat('#eeeeee'), [0.006, 0.2, 0.006], [0, 0.1, 0]); part(p, sph(), metal('#e8ecf2'), [0.19, 0.19, 0.19], [0, 0.38, 0]).castShadow = true;
        for (let i = 0; i < 6; i++) ctx.detail.push(part(p, box(), glow(['#ff6bcb', '#7fdfff', '#fff36b'][i % 3], 2), [0.04, 0.04, 0.01], [Math.cos(i) * 0.15, 0.38 + Math.sin(i * 2) * 0.1, Math.sin(i) * 0.15])); break;
      case 'banana': part(p, geo('banG', () => new T.TorusGeometry(0.14, 0.035, 6, 12, Math.PI * 0.8)), mat('#f7d54a'), [1, 1, 1], [0, 0.12, 0.04], [0, 0, 0.6]); break;
      default: return false;
    }
    return true;
  }

  // add-ons that sit on the body rather than in the hand
  function crewExtras(ctx, o) {
    const rig = ctx.rig, h = ctx.head, wide = o.wide || 1;
    if (o.eyepatch) { part(h, disc(), mat('#111'), [0.075, 0.4, 0.075], [0.11, 0.06, 0.3], [Math.PI / 2, 0, 0]); part(h, cyl(), mat('#111'), [0.31, 0.02, 0.31], [0, 0.12, 0], [0.25, 0, 0.1]); }
    if (o.shades) { for (const s of [-1, 1]) part(h, box(), gloss('#111'), [0.13, 0.08, 0.03], [s * 0.11, 0.06, 0.31]); part(h, box(), gloss('#111'), [0.08, 0.02, 0.02], [0, 0.08, 0.31]); }
    if (o.bowtie) for (const s of [-1, 1]) part(rig, cone(), gloss(o.bowtie), [0.07, 0.09, 0.05], [s * 0.06, 1.66, 0.25], [0, 0, s * Math.PI / 2]);
    if (o.scarf) { part(rig, tor(), fabric(o.scarf), [0.2, 0.2, 0.3], [0, 1.72, 0], [Math.PI / 2, 0, 0]); part(rig, box(), fabric(o.scarf), [0.08, 0.3, 0.03], [0.1, 1.55, 0.22], [0, 0, 0.15]); }
    if (o.apron) part(rig, box(), fabric(o.apron), [0.42 * wide, 0.6, 0.03], [0, 1.1, 0.31], [-0.15, 0, 0]);
    if (o.chestplate) part(rig, sph(), metal(o.chestplate), [0.39 * wide, 0.36, 0.35], [0, 1.4, 0.02]).castShadow = true;
    if (o.bandolier) { part(rig, box(), mat('#5d4037'), [0.07, 0.85, 0.03], [0, 1.33, 0.33], [0, 0, 0.7]); for (let i = 0; i < 4; i++) ctx.detail.push(part(rig, cyl(), metal('#e1b12c'), [0.02, 0.07, 0.02], [-0.18 + i * 0.12, 1.2 + i * 0.1, 0.35], [0, 0, 0.7])); }
    if (o.badge) part(rig, OCTA(), metal('#e1b12c'), [0.08, 0.08, 0.02], [-0.15, 1.45, 0.32]);
    if (o.championBelt) { part(rig, cyl(), mat('#1b1b1b'), [0.345 * wide, 0.11, 0.3], [0, 1.06, 0]); part(rig, sph(), metal('#e1b12c'), [0.17, 0.12, 0.05], [0, 1.06, 0.3]); }
    if (o.tanks) for (const s of [-1, 1]) part(rig, cap(), gloss(o.tanks), [0.11, 0.17, 0.11], [s * 0.12, 1.4, -0.38]).castShadow = true;
    if (o.parrot) {
      const b = pivot(rig, [0.38 * wide, 1.75, 0]); ctx.parrot = b;
      part(b, sph(), mat('#2ecc71'), [0.1, 0.14, 0.1], [0, 0.1, 0]).castShadow = true;
      part(b, sph(), mat('#e74c3c'), [0.08, 0.08, 0.08], [0, 0.25, 0.03]);
      part(b, cone(), mat('#f1c40f'), [0.03, 0.08, 0.03], [0, 0.23, 0.12], [Math.PI / 2, 0, 0]);
      part(b, box(), mat('#2e86de'), [0.06, 0.02, 0.2], [0, 0.02, -0.12], [0.6, 0, 0]);
      for (const s of [-1, 1]) ctx.detail.push(part(b, sph(), gloss('#111'), [0.018, 0.018, 0.018], [s * 0.05, 0.28, 0.07]));
    }
    if (o.shield) {
      const sh = pivot(ctx.arms[0], [-0.1, -0.35, 0]);
      part(sh, cyl(), fabric(o.shield[0]), [0.3, 0.04, 0.3], [0, 0, 0], [0, 0, Math.PI / 2]).castShadow = true;
      part(sh, cyl(), metal(o.shield[1] || '#d4a017'), [0.31, 0.03, 0.31], [0.005, 0, 0], [0, 0, Math.PI / 2]);
      part(sh, cyl(), fabric(o.shield[0]), [0.27, 0.035, 0.27], [-0.008, 0, 0], [0, 0, Math.PI / 2]);
      part(sh, sph(), metal(o.shield[1] || '#d4a017'), [0.07, 0.07, 0.07], [-0.03, 0, 0]);
    }
    if (o.furry) for (let i = 0; i < 6; i++) part(rig, cone(), ctx.furM, [0.08, 0.16, 0.06], [Math.cos(i * 1.1) * 0.3 * wide, 1.05 + (i % 3) * 0.2, Math.sin(i * 1.1) * 0.24], [Math.PI, 0, Math.cos(i * 1.1) * 0.6]);
    if (o.ballchain) { part(rig, cyl(), metal('#5d6d7e'), [0.012, 0.5, 0.012], [0.15, 0.25, -0.2], [0.9, 0, 0]); part(rig, sph(), metal('#2c3e50'), [0.16, 0.16, 0.16], [0.15, 0.1, -0.55]).castShadow = true; }
  }

  // Ghost: a floating sheet with stubby arms. Hidden leg pivots keep the shared walk code happy.
  function ghost(ctx, o) {
    const rig = ctx.rig, sheet = ctx.skinM;
    sheet.transparent = true; sheet.opacity = 0.9;
    part(rig, geo('ghostG', () => new T.CylinderGeometry(0.36, 0.62, 1.5, 18, 1, true)), sheet, [1, 1, 1], [0, 0.95, 0]).castShadow = true;
    part(rig, sph(), sheet, [0.4, 0.42, 0.4], [0, 1.72, 0]).castShadow = true;
    for (let i = 0; i < 9; i++) part(rig, sph(), sheet, [0.13, 0.13, 0.13], [Math.cos(i / 9 * TAU) * 0.58, 0.22, Math.sin(i / 9 * TAU) * 0.58]);
    const head = pivot(rig, [0, 1.72, 0]);
    ctx.head = head;
    eyes(ctx, head, { y: 0.06, z: 0.33, sp: 0.13, size: 0.1, iris: '#111', tall: 1.4 });
    ctx.detail.push(part(head, sph(), mat('#1b1b2a'), [0.08, 0.1, 0.03], [0, -0.16, 0.37]));
    const legs = [pivot(rig, [-0.1, 0.9, 0]), pivot(rig, [0.1, 0.9, 0])], arms = [];
    for (const s of [-1, 1]) {
      const sh = pivot(rig, [s * 0.42, 1.45, 0]);
      part(sh, cap(), sheet, [0.09, 0.18, 0.09], [0, -0.22, 0]);
      const hand = part(sh, sph(), sheet, [0.1, 0.1, 0.1], [0, -0.45, 0.02]);
      arms.push(sh); if (s === 1) ctx.rightHand = hand;
    }
    ctx.ghostTail = rig.children[0];
    return { legs, arms };
  }

  // Dino rider: a stomping raptor with a little rider in the saddle; the rider wears the hat.
  function dinoRider(ctx, o) {
    const rig = ctx.rig;
    const hide = mat(o.dinoC || '#58a55c', { roughness: 0.6 }).clone(); ctx.flash.push(hide);
    const belly = mat(o.dinoBelly || '#d4e6a5', { roughness: 0.7 });
    const big = o.dinoBig ? 1.2 : 1;
    const body = pivot(rig, [0, 1.0 * big, 0]);
    part(body, sph(), hide, [0.42 * big, 0.38 * big, 0.68 * big], [0, 0, 0]).castShadow = true;
    part(body, sph(), belly, [0.34 * big, 0.28 * big, 0.55 * big], [0, -0.12 * big, 0.06]);
    part(body, cone(), hide, [0.2 * big, 0.9 * big, 0.2 * big], [0, 0.05, -0.85 * big], [-Math.PI / 2 - 0.15, 0, 0]).castShadow = true;   // tail
    for (let i = 0; i < 5; i++) part(body, cone(), mat(o.dinoBelly || '#d4e6a5'), [0.05, 0.12, 0.08], [0, 0.36 * big - i * 0.02, -0.25 - i * 0.18], [-0.3, 0, 0]);   // back spikes
    const neck = pivot(body, [0, 0.25 * big, 0.5 * big]);
    part(neck, cap(), hide, [0.15 * big, 0.2 * big, 0.15 * big], [0, 0.15, 0.1], [0.7, 0, 0]);
    const dh = pivot(neck, [0, 0.38 * big, 0.3 * big]);
    part(dh, sph(), hide, [0.22 * big, 0.2 * big, 0.36 * big], [0, 0, 0.1]).castShadow = true;
    part(dh, sph(), belly, [0.17 * big, 0.08 * big, 0.3 * big], [0, -0.12 * big, 0.14]);
    for (let i = 0; i < 6; i++) ctx.detail.push(part(dh, cone(), gloss('#ffffff'), [0.02, 0.05, 0.02], [(i % 2 ? 1 : -1) * 0.1 * big, -0.08 * big, 0.1 + Math.floor(i / 2) * 0.09], [Math.PI, 0, 0]));
    for (const s of [-1, 1]) {
      ctx.eyes.push(part(dh, sph(), gloss('#fffbe0'), [0.06, 0.07, 0.05], [s * 0.13 * big, 0.08 * big, 0.18]));
      ctx.detail.push(part(dh, sph(), gloss('#111'), [0.03, 0.045, 0.03], [s * 0.15 * big, 0.08 * big, 0.21]));
    }
    ctx.dinoHead = neck;
    const legs = [];
    for (const s of [-1, 1]) {
      const hip = pivot(rig, [s * 0.3 * big, 0.95 * big, -0.05]);
      part(hip, cap(), hide, [0.16 * big, 0.3 * big, 0.16 * big], [0, -0.35 * big, 0]).castShadow = true;
      part(hip, sph(), hide, [0.16 * big, 0.08, 0.28 * big], [0, -0.87 * big, 0.1]);
      for (let k = -1; k <= 1; k++) ctx.detail.push(part(hip, cone(), gloss('#f7f2e0'), [0.025, 0.07, 0.025], [k * 0.07, -0.88 * big, 0.36 * big], [Math.PI / 2, 0, 0]));
      legs.push(hip);
    }
    // the rider
    const seat = pivot(rig, [0, 1.38 * big, -0.05]);
    part(seat, cyl(), mat('#7a4a2a'), [0.3, 0.06, 0.34], [0, 0, 0]);
    const top = o.pattern ? patterned(o.top, o.pattern[0], o.pattern[1]) : fabric(o.top || '#b07d3a');
    part(seat, cap(), top, [0.22, 0.16, 0.17], [0, 0.4, 0]).castShadow = true;
    for (const s of [-1, 1]) part(seat, cap(), fabric(o.bottom || '#5d4037'), [0.08, 0.16, 0.08], [s * 0.22, 0.02, 0.12], [1.2, 0, s * 0.3]);
    const arms = [];
    for (const s of [-1, 1]) {
      const sh = pivot(seat, [s * 0.26, 0.55, 0]);
      part(sh, cap(), top, [0.06, 0.15, 0.06], [0, -0.18, 0]);
      const hand = part(sh, sph(), ctx.skinM, [0.07, 0.07, 0.07], [0, -0.38, 0.02]);
      arms.push(sh); if (s === 1) ctx.rightHand = hand;
    }
    part(seat, cyl(), ctx.skinM, [0.07, 0.1, 0.07], [0, 0.73, 0]);
    const head = pivot(seat, [0, 0.98, 0]); head.scale.setScalar(1.15);
    ctx.head = head;
    ctx.sackAt = [0, 1.55 * big, -0.55];
    return { legs, arms };
  }

  // Leader marker: a small spinning gold crown floating above the head.
  function leaderCrown(ctx) {
    const c = pivot(ctx.rig, [0, 3.25, 0]);
    part(c, cyl(), glow('#ffd34d', 1.6), [0.2, 0.08, 0.2]);
    for (let k = 0; k < 5; k++) part(c, cone(), glow('#ffd34d', 1.6), [0.05, 0.13, 0.05], [Math.cos(k / 5 * TAU) * 0.19, 0.1, Math.sin(k / 5 * TAU) * 0.19]);
    ctx.crown = c;
  }

  // How each looter moves (spec.gait) and the little move it does now and then (spec.quirk).
  const GAIT = {
    sneak: { f: 10, step: 0.45, bob: 0.03, lean: 0.28, crouch: 0.12, sway: 0, arms: 0.25 },
    scurry: { f: 15, step: 0.6, bob: 0.07, lean: 0.2, crouch: 0.04, sway: 0.04, arms: 0.7 },
    swagger: { f: 7, step: 0.55, bob: 0.05, lean: -0.04, crouch: 0, sway: 0.16, arms: 0.45 },
    stomp: { f: 6, step: 0.75, bob: 0.1, lean: 0.08, crouch: 0.02, sway: 0.1, arms: 0.8 },
    strut: { f: 7.5, step: 0.6, bob: 0.06, lean: -0.1, crouch: 0, sway: 0.05, arms: 0.2 },
    glide: { f: 4, step: 0, bob: 0.08, lean: 0.05, crouch: -0.06, sway: 0.06, arms: 0.15 },
    march: { f: 8, step: 0.6, bob: 0.04, lean: 0, crouch: 0, sway: 0, arms: 0.6, snap: true },
    shamble: { f: 4.5, step: 0.35, bob: 0.04, lean: 0.18, crouch: 0.06, sway: 0.2, arms: 0.1 },
    waddle: { f: 12, step: 0.3, bob: 0.06, lean: 0, crouch: 0.06, sway: 0.25, arms: 0.4 },
    bounce: { f: 7, step: 0.5, bob: 0.24, lean: 0, crouch: 0, sway: 0.05, arms: 0.6 },
  };

  // spec for a crew member: base look merged with the member's (or leader's) overrides
  function crewSpec(def, variant) {
    const crew = PTD.CREWS && PTD.CREWS[def.theme];
    if (!crew) return null;
    const m = variant === 3 ? crew.leader : crew.crew[(variant || 0) % crew.crew.length];
    return Object.assign({ body: 'biped', head: 'human', gait: 'strut', quirk: 'look' }, crew.base, m);
  }

  function build(def, variant) {
    const spec = crewSpec(def, variant) || { body: 'biped', head: 'human', skin: '#e0ac8a', top: (def.look || ['#888'])[0], gait: 'strut', quirk: 'look' };
    const rig = new T.Group();
    const ctx = { rig, spec, detail: [], flash: [], eyes: [], ears: [] };
    const base = spec.fur || spec.skin || spec.shell || '#e0ac8a';
    ctx.skinM = (spec.wraps ? patterned(base, 'wraps', spec.wrapC || '#b8a67a') : skin(base)).clone(); ctx.flash.push(ctx.skinM);
    ctx.furM = mat(spec.fur || base, { roughness: 0.95 }).clone(); ctx.flash.push(ctx.furM);
    if (spec.fur) ctx.skinM = ctx.furM;
    let parts = {};
    const humanoid = spec.body === 'biped' || spec.body === 'ghost' || spec.body === 'dino';
    if (spec.body === 'crab') parts = crab(ctx, spec.shell);
    else if (spec.body === 'snake') parts = snake(ctx);
    else {
      parts = spec.body === 'ghost' ? ghost(ctx, spec) : spec.body === 'dino' ? dinoRider(ctx, spec) : biped(ctx, spec);
      ctx.arms = parts.arms;
      const h = ctx.head;
      if (spec.body !== 'ghost') {
        const heads = { rodent: rodentHead, canine: canineHead, shark: sharkHead, goblin: goblinHead, alien: alienHead, robot: robotHead, zombie: zombieHead,
          clown: clownHead, vampire: vampireHead, yeti: yetiHead, gnome: gnomeHead, mummy: mummyHead, diver: diverHead };
        (heads[spec.head] || humanHead)(ctx, h, spec);
      }
      if (spec.mask) mask(ctx, spec.mask);
      if (spec.faceMask) faceMask(ctx, spec.faceMask);
      if (spec.goggles) goggles(ctx, spec.goggles);
      if (spec.hat) crewHat(ctx, spec.hat[0], spec.hat[1], spec.hat[2]);
      if (spec.horns) for (const s of [-1, 1]) part(h, cone(), gloss('#fdfefe'), [0.06, 0.18, 0.06], [s * 0.2, 0.3, 0], [0, 0, -s * 0.5]);
      if (spec.monocle) ctx.detail.push(part(h, tor(), metal('#e1b12c'), [0.06, 0.06, 0.06], [0.11, 0.06, 0.3]));
      crewExtras(ctx, spec);
      if (spec.prop && !crewProp(ctx, spec.prop, spec)) prop(ctx, spec.prop);
      if (spec.tail) tail(ctx, spec.tail, spec.tailC || base);
      if (!spec.noSack && !spec.tanks) sack(ctx, ctx.sackAt);
    }
    if (spec.scale) rig.scale.setScalar(spec.scale);
    if (variant === 3) leaderCrown(ctx);

    const gaitName = spec.gait, quirkName = spec.quirk;
    const gait = GAIT[spec.robe || spec.body === 'ghost' ? 'glide' : gaitName] || GAIT.strut;
    // left arm reaches back over the shoulder to hold the sack; shamblers reach forward instead
    const armHold = spec.armsFwd ? -1.45 : spec.body === 'dino' ? -1.1 : humanoid && !spec.noSack && !spec.tanks ? -2.5 : -0.2;
    const baseScale = rig.scale.x;
    const eyeY = ctx.eyes.map(e => e.scale.y);
    const earZ = ctx.ears.map(e => e.rotation.z);
    const sackY = ctx.sackG ? ctx.sackG.position.y : 0;
    // every looter also gets one random extra party trick
    const small = gaitName === 'scurry' || gaitName === 'sneak' || gaitName === 'bounce';
    const extras = spec.body === 'dino' ? ['juggle', 'count'] : spec.body === 'ghost' ? ['dance', 'juggle'] : small ? ['dance', 'juggle', 'trip', 'cartwheel'] : ['dance', 'juggle', 'trip', 'count'];
    const extra = extras[Math.floor(Math.random() * extras.length)];
    let quirk = 0, quirkDur = 1.2, active = quirkName, quirkT = 2 + Math.random() * 5, blinkT = 1 + Math.random() * 3, stars = null, coins = null;
    function juggleCoins(on, t) {
      if (on && !coins) {
        coins = new T.Group(); coins.position.set(0.25, 2.75, 0.25);
        for (let k = 0; k < 3; k++) coins.add(new T.Mesh(cyl(), metal('#ffcf40')));
        coins.children.forEach(c => c.scale.set(0.09, 0.02, 0.09));
        rig.add(coins);
      }
      if (coins) { coins.visible = on; if (on) coins.children.forEach((c, k) => { const a = t * 9 + k * TAU / 3; c.position.set(Math.cos(a) * 0.22, Math.abs(Math.sin(a)) * 0.45, 0); c.rotation.x = t * 15; }); }
    }

    function setStars(on, t) {
      if (on && !stars) {
        stars = new T.Group();
        for (let k = 0; k < 3; k++) { const st = new T.Mesh(geo('star', () => new T.OctahedronGeometry(0.07, 0)), glow('#ffe066', 2.4)); st.position.set(Math.cos(k / 3 * TAU) * 0.35, 0, Math.sin(k / 3 * TAU) * 0.35); stars.add(st); }
        stars.position.y = humanoid ? 2.9 : 1.6;
        rig.add(stars);
      }
      if (stars) { stars.visible = on; if (on) stars.rotation.y = t * 6; }
    }

    // st: { speed (0..1 slow factor), hit (0..1 just got hit), stun, slow }
    function anim(t, moving, dt, st) {
      st = st || {};
      const speed = st.speed || 1;
      const ph = t * gait.f * speed;
      const sw = moving ? (gait.snap ? Math.sign(Math.sin(ph)) * Math.min(1, Math.abs(Math.sin(ph)) * 3) : Math.sin(ph)) : 0;
      // quirks fire every few seconds and play for ~1.2s
      quirkT -= dt;
      if (quirkT <= 0 && !st.stun) {
        active = Math.random() < 0.5 ? quirkName : extra;
        quirkDur = active === quirkName ? 1.2 : 1.8;
        quirk = quirkDur; quirkT = 3.5 + Math.random() * 5;
      }
      quirk = Math.max(0, quirk - dt);
      const prog = quirk > 0 ? (quirkDur - quirk) / quirkDur : 0;            // 0 -> 1 through the trick
      const q = quirk > 0 ? Math.sin(prog * Math.PI) : 0;                     // 0 -> 1 -> 0 envelope

      if (parts.legs) {
        const legAmp = gait.step * (st.stun ? 0 : 1);
        parts.legs[0].rotation.x = sw * legAmp; parts.legs[1].rotation.x = -sw * legAmp;
        parts.arms[0].rotation.x = armHold + sw * 0.1; parts.arms[0].rotation.z = -0.25;
        let rArm = spec.armsFwd ? -1.45 + sw * 0.12 : spec.prop ? -0.6 + sw * 0.15 : -sw * gait.arms;
        let rArmZ = 0;
        const bob = moving ? Math.abs(Math.sin(ph)) * gait.bob * 1.6 : Math.sin(t * 2) * 0.015;
        rig.position.y = bob - gait.crouch + (gait === GAIT.glide ? 0.06 + Math.sin(t * 2.2) * 0.05 : 0);
        rig.rotation.x = gait.lean - (st.hit || 0) * 0.45;                    // lean, or flinch back when hit
        rig.rotation.z = moving ? Math.sin(ph * 0.5) * gait.sway : 0;
        const land = moving ? Math.abs(Math.sin(ph)) : 0;   // stretch on the way up, squash as each foot lands
        const squash = 1 - (st.hit || 0) * 0.15 + (moving ? (land - 0.5) * 0.14 : 0);
        rig.scale.set(baseScale / Math.sqrt(squash), baseScale * squash, baseScale / Math.sqrt(squash));
        if (ctx.head) { ctx.head.rotation.z = sw * 0.06; ctx.head.rotation.y = 0; ctx.head.rotation.x = 0; }
        switch (active) {
          case 'dance': rig.rotation.y = prog * TAU * 2 * (q > 0 ? 1 : 0); parts.arms[0].rotation.x = armHold * (1 - q) - q * 2.8; rArmZ = Math.sin(t * 16) * 0.5 * q;
            parts.legs[0].rotation.x += Math.sin(t * 20) * 0.6 * q; parts.legs[1].rotation.x -= Math.sin(t * 20) * 0.6 * q; rig.position.y += Math.abs(Math.sin(t * 20)) * 0.12 * q; break;
          case 'juggle': rArm = -2.0 * q + rArm * (1 - q); rArmZ = Math.sin(t * 18) * 0.25 * q; if (ctx.head) ctx.head.rotation.x = -0.4 * q; break;
          case 'trip': rig.rotation.x += Math.min(1, prog * 3) * (1 - Math.max(0, prog - 0.6) / 0.4) * 1.25; rig.position.y -= q * 0.35; rArm = -1.6 * q; break;
          case 'count': if (ctx.head) ctx.head.rotation.x = 0.45 * q; rArm = -1.5 * q + rArm * (1 - q); rArmZ = Math.sin(t * 24) * 0.12 * q; break;
          case 'cartwheel': rig.rotation.z = prog * TAU * (q > 0 ? 1 : 0); rig.position.y += q * 0.5; break;
          default: if (active !== 'dance') rig.rotation.y = 0;
        }
        juggleCoins(active === 'juggle' && q > 0.05, t);
        if (active !== 'dance') rig.rotation.y = 0;
        switch (active) {
          case 'look': if (ctx.head) ctx.head.rotation.y = q * (quirkT % 2 > 1 ? 1.3 : -1.3); break;
          case 'laugh': if (ctx.head) ctx.head.rotation.x = -q * 0.5; rig.position.y += Math.abs(Math.sin(t * 22)) * 0.05 * q; break;
          case 'hop': rig.position.y += q * 0.35; break;
          case 'flex': parts.arms[0].rotation.x = armHold * (1 - q) - q * 1.4; rArm = -q * 1.4 + rArm * (1 - q); rArmZ = q * 0.9; break;
          case 'wave': rArm = -2.6 * q + rArm * (1 - q); rArmZ = Math.sin(t * 14) * 0.4 * q; break;
          case 'raise': rArm = -2.2 * q + rArm * (1 - q); break;
          case 'coin': rArm = -1.6 * q + rArm * (1 - q); if (ctx.propG) { ctx.propG.position.y = parts.arms[1].children[1].position.y + q * 0.5; ctx.propG.rotation.x = t * 18 * (q > 0 ? 1 : 0); } break;
          case 'shake': rArm = -1.2 + Math.sin(t * 30) * 0.3 * q; break;
          case 'twirl': if (ctx.propG) ctx.propG.rotation.y = q > 0 ? t * 14 : 0; rArm = -1.0 * q + rArm * (1 - q); break;
        }
        parts.arms[1].rotation.x = rArm; parts.arms[1].rotation.z = -rArmZ;
        // secondary motion: the head lags the bounce, ears flop, the sack bounces
        if (ctx.head && moving) ctx.head.rotation.x += Math.cos(ph) * 0.09;
        ctx.ears.forEach((e, i) => { e.rotation.z = earZ[i] + (moving ? Math.sin(ph + 1.2) * 0.3 : Math.sin(t * 3 + i) * 0.08) * (i % 2 ? -1 : 1); });
        if (ctx.sackG) { ctx.sackG.rotation.z = sw * 0.18; ctx.sackG.position.y = sackY + (moving ? Math.abs(Math.sin(ph + 0.8)) * 0.07 : 0); ctx.sackG.rotation.x = moving ? Math.sin(ph) * 0.12 : 0; }
        if ((st.hit || 0) > 0.5) rig.rotation.z += (Math.random() - 0.5) * 0.25;   // stumble
        if (st.stun && ctx.head) ctx.head.rotation.y = t * 9;
        if (st.slow) rig.position.x = (Math.random() - 0.5) * 0.025;            // shivering
        else rig.position.x = 0;
      }
      if (ctx.tail) ctx.tail.rotation.y = Math.sin(t * (moving ? 9 : 4)) * 0.5;
      if (ctx.dinoHead) ctx.dinoHead.rotation.x = (moving ? Math.sin(ph) * 0.12 : Math.sin(t * 1.5) * 0.05) - q * 0.6;   // head bob, roar on quirk
      if (ctx.ghostTail) ctx.ghostTail.rotation.y = Math.sin(t * 3) * 0.15;
      if (ctx.parrot) ctx.parrot.rotation.y = Math.sin(t * 2.3) * 0.6;
      if (ctx.crown) { ctx.crown.rotation.y = t * 2; ctx.crown.position.y = 3.25 + Math.sin(t * 3) * 0.06; }
      if (ctx.gearObj) ctx.gearObj.rotation.z += dt * 3 * (1 + q * 4);
      if (parts.crabLegs) {
        parts.crabLegs.forEach((l, i) => { l.rotation.x = Math.sin(ph * 1.6 + i * 1.3) * 0.5; });
        rig.rotation.z = moving ? Math.sin(ph * 0.8) * 0.08 : 0;                // scuttle
        parts.claws.forEach((c, i) => { c.rotation.x = q > 0 ? Math.abs(Math.sin(t * 20 + i)) * 0.9 : Math.max(0, Math.sin(t * 4 + i * 2)) * 0.5; });
      }
      if (parts.wings) {
        const f = Math.sin(t * 18) * 0.7;
        parts.wings[0].rotation.y = f; parts.wings[1].rotation.y = -f;
        rig.position.y = 0.35 + Math.sin(t * 3) * 0.12 + q * 0.5;
        rig.rotation.x = -q * TAU * ((1.2 - quirk) / 1.2) * (q > 0 ? 1 : 0);   // loop-the-loop
      }
      if (parts.segs) {
        parts.segs.forEach((sg, i) => { sg.position.x = Math.sin(t * 6 * speed - i * 0.7) * 0.18 * (i / 8 + 0.2); });
        parts.tongue.visible = Math.sin(t * 5) > 0.6;
        if (ctx.snakeHead) ctx.snakeHead.position.y = 0.95 + q * 0.45;           // rears up
      }
      // blinking
      blinkT -= dt;
      const shut = blinkT < 0.12;
      if (blinkT <= 0) blinkT = 2 + Math.random() * 4;
      const startled = (st.hit || 0) > 0.2 ? 1.4 : 1;                              // eyes pop when hit
      ctx.eyes.forEach((e, i) => { e.scale.y = shut && startled === 1 ? eyeY[i] * 0.12 : eyeY[i] * startled; });
      setStars(!!st.stun, t);
    }

    // Cartoon look: toon shading everywhere, outlines on the big shapes only (keeps 100+ looters cheap).
    if (PTD.Toon) {
      const before = new Map();
      rig.traverse(o => { if (o.isMesh) before.set(o, o.material); });
      rig.updateMatrixWorld(true);
      const big = (o) => { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); const sc = new T.Vector3(); o.matrixWorld.decompose(new T.Vector3(), new T.Quaternion(), sc); return o.geometry.boundingSphere.radius * Math.max(sc.x, sc.y, sc.z) > 0.07 && ctx.detail.indexOf(o) < 0; };
      PTD.Toon.cartoonize(rig, { width: 3.2, outlineIf: big, style: { bright: 0.6, rim: '#bfe4ff' } });
      const swap = new Map();
      for (const [o, m] of before) if (o.material !== m) { if (!swap.has(m)) swap.set(m, new Set()); swap.get(m).add(o.material); }
      ctx.flash = [...new Set(ctx.flash.flatMap(m => swap.has(m) ? [...swap.get(m)] : [m]))].filter(m => m.emissive);
    }
    return { rig, anim, flash: ctx.flash, detail: ctx.detail };
  }

  // Bosses: barrel-chested showmen. Every boss shares the build (gold epaulettes, chain and
  // medallion, big gloves, boots, a swaying cape, orbiting cards) plus a signature style:
  // cigar, shield, scepter, martini, staff or muscle. The face picture sits on the head,
  // which the renderer turns toward the camera.
  function cardPlane(suit, rank, w) {
    const key = 'bc' + suit + rank;
    if (!M[key]) {
      const src = PTD.Art.cardSprite(suit, rank);
      const c = document.createElement('canvas'); c.width = 108; c.height = 140;
      c.getContext('2d').drawImage(src, 10, 6, 108, 140, 0, 0, 108, 140);
      const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace;
      M[key] = new T.MeshBasicMaterial({ map: t, side: T.DoubleSide }); M[key].userData.shared = true;
    }
    const m = new T.Mesh(geo('bcard', () => new T.PlaneGeometry(1, 1.3)), M[key]);
    m.scale.setScalar(w);
    return m;
  }

  function buildBoss(boss) {
    const style = boss.style || 'cigar';
    const muscle = style === 'muscle';
    const rig = new T.Group();
    const ctx = { rig, detail: [], flash: [], eyes: [], ears: [] };
    const skinM = mat('#f0c8a0', { roughness: 0.55 });
    const suit = style === 'cigar' ? patterned(boss.color, 'pinstripe', '#f4d03f') : fabric(boss.color);
    const jacket = suit.clone();
    const gold = metal('#e6b422'), dark = fabric('#1b1b22');
    const W = muscle ? 1.35 : 1.15;

    // legs and boots (feet: 'club' twists both boots sharply inward onto their outer edges)
    const club = boss.feet === 'club';
    const legs = [], feet = [];
    for (const s2 of [-1, 1]) {
      const hip = pivot(rig, [s2 * 0.24 * W, 0.95, 0]);
      const kitLegs = hasKit('leg') && hasKit('boot');
      if (kitLegs) kp(hip, 'leg', { main: dark, trim: dark }, [0.19, 0.42, 0.19], [0, -0.4, 0]);
      else {
        part(hip, cap(), dark, [0.17, 0.32, 0.17], [0, -0.38, 0]).castShadow = true;
        part(hip, cyl(), fabric('#2a1a10'), [0.19, 0.28, 0.19], [0, -0.78, 0]);
      }
      if (club) {
        const ankle = pivot(hip, [0, -0.88, 0]);
        ankle.rotation.set(0.35, -s2 * 0.85, -s2 * 0.6);          // toes curl in and point down, sole faces inward
        part(ankle, sph(), fabric('#2a1a10'), [0.25, 0.16, 0.38], [0, -0.04, 0.15]).castShadow = true;
        part(ankle, sph(), fabric('#2a1a10'), [0.16, 0.13, 0.16], [0, -0.02, 0.42]);   // knobbly curled toe
        feet.push(ankle);
      } else if (hasKit('boot')) kp(hip, 'boot', { main: gloss('#1c120c'), trim: gold, sole: mat('#2a1a10') }, [0.22, 0.28, 0.32], [0, -0.82, 0.06]);
      else part(hip, sph(), fabric('#2a1a10'), [0.18, 0.12, 0.27], [0, -0.92, 0.1]);
      if (!hasKit('boot') || club) part(hip, cyl(), gold, [0.2, 0.04, 0.2], [0, -0.64, 0]);
      if (club) hip.rotation.z = -s2 * 0.13;   // pigeon-toed: knees knock in, feet tucked toward each other
      legs.push(hip);
    }
    // torso: barrel chest and belly
    const torso = pivot(rig, [0, 1.3, 0]);
    if (muscle) {
      part(torso, sph(), skinM, [0.66, 0.5, 0.42], [0, 0.15, 0]).castShadow = true;
      part(torso, sph(), jacket, [0.6, 0.42, 0.4], [0, -0.1, 0.02]).castShadow = true;            // gold tank top
      for (let r2 = 0; r2 < 3; r2++) for (const s2 of [-1, 1]) part(torso, sph(), skinM, [0.085, 0.07, 0.04], [s2 * 0.1, 0.05 - r2 * 0.13, 0.4]);   // abs
      for (const s2 of [-1, 1]) part(torso, sph(), skinM, [0.2, 0.15, 0.08], [s2 * 0.2, 0.3, 0.36]);   // pecs
    } else {
      if (hasKit('torso')) kp(torso, 'torso', { main: jacket, trim: gold }, [0.62 * W, 0.68, 0.5], [0, -0.04, 0.02]);
      else {
        part(torso, sph(), jacket, [0.6 * W, 0.52, 0.44], [0, 0.12, 0]).castShadow = true;
        part(torso, sph(), jacket, [0.5 * W, 0.45, 0.46], [0, -0.22, 0.06]).castShadow = true;
      }
      part(torso, cone(), fabric('#ffffff'), [0.17, 0.42, 0.03], [0, 0.18, 0.43], [Math.PI, 0, 0]);
      if (style === 'martini') { for (const s2 of [-1, 1]) part(torso, cone(), gloss('#111'), [0.08, 0.14, 0.05], [s2 * 0.07, 0.36, 0.45], [0, 0, s2 * Math.PI / 2]); }
      else part(torso, cone(), gloss('#c0392b'), [0.05, 0.34, 0.02], [0, 0.15, 0.46], [Math.PI, 0, 0]);
      for (let k = 0; k < 3; k++) part(torso, sph(), gold, [0.03, 0.03, 0.02], [0.09, 0.05 - k * 0.12, 0.44]);   // buttons
    }
    ctx.flash.push(jacket);
    // gold epaulettes with fringe
    for (const s2 of [-1, 1]) {
      part(torso, cyl(), gold, [0.2, 0.05, 0.16], [s2 * 0.6 * W, 0.42, 0]);
      for (let k = 0; k < 5; k++) part(torso, cyl(), gold, [0.012, 0.09, 0.012], [s2 * 0.6 * W + (k - 2) * 0.07, 0.34, 0.1]);
    }
    // chain, medallion, belt and buckle
    part(torso, tor(), gold, [0.3, 0.36, 0.3], [0, 0.3, 0.2], [1.1, 0, 0]);
    const medal = part(torso, cyl(), glow('#ffd34d', 1.4), [0.13, 0.03, 0.13], [0, 0.0, 0.47], [Math.PI / 2, 0, 0]);
    const lbl = new T.Mesh(geo('dollarPlane', () => new T.PlaneGeometry(0.34, 0.34)), mat('#ffffff', { map: dollar(), transparent: true }));
    lbl.position.set(0, 0.0, 0.495); lbl.scale.setScalar(0.6); torso.add(lbl);
    part(torso, cyl(), fabric('#1b1b1b'), [0.52 * W, 0.08, 0.46], [0, -0.48, 0.03]);
    part(torso, box(), gold, [0.22, 0.16, 0.05], [0, -0.48, 0.48]);
    // arms with big gloves and rings
    const arms = [], palms = [];
    for (const s2 of [-1, 1]) {
      const sh = pivot(torso, [s2 * 0.64 * W, 0.32, 0]);
      palms.push(pivot(sh, [0, -0.86, 0.04]));   // where hand blasts (boss.slime) come out
      if (hasKit('sleeve')) kp(sh, 'sleeve', { main: muscle ? skinM : jacket, trim: muscle ? skinM : gold }, [muscle ? 0.19 : 0.15, 0.42, muscle ? 0.19 : 0.15], [0, -0.32, 0]);
      else part(sh, cap(), muscle ? skinM : jacket, [muscle ? 0.17 : 0.13, 0.28, muscle ? 0.17 : 0.13], [0, -0.32, 0]).castShadow = true;
      if (muscle) part(sh, sph(), skinM, [0.2, 0.18, 0.2], [0, -0.12, 0]);   // biceps
      if (hasKit('fist')) kp(sh, 'fist', { main: gloss('#f6f4ef'), cuff: gold }, 0.24, [0, -0.66, 0.03], [0, s2 === 1 ? 0 : Math.PI, 0]);
      else {
        part(sh, sph(), mat('#f4f4f4'), [0.17, 0.17, 0.17], [0, -0.7, 0.03]).castShadow = true;
        part(sh, tor(), gold, [0.06, 0.06, 0.06], [0, -0.7, 0.16]);
      }
      arms.push(sh);
    }
    // swaying cape in strips
    const cape = [];
    if (!muscle) {
      const capeM = mat(style === 'staff' ? '#2e7d32' : '#7a0f1f', { side: T.DoubleSide, roughness: 0.8 });
      for (let k = 0; k < 4; k++) {
        const strip = pivot(torso, [(k - 1.5) * 0.28 * W, 0.4, -0.42]);
        part(strip, box(), capeM, [0.29 * W, 1.45, 0.03], [0, -0.72, 0]).castShadow = true;
        part(strip, box(), gold, [0.29 * W, 0.05, 0.035], [0, -1.43, 0]);
        if (style === 'staff') for (let l = 0; l < 3; l++) part(strip, cone(), mat('#66bb6a'), [0.08, 0.16, 0.02], [0, -0.4 - l * 0.35, -0.03], [0, 0, Math.PI]);
        cape.push(strip);
      }
    }
    // head: a bobblehead - the boss's photo wrapped onto the front of a sculpted 3D head, blended
    // into a matching skin tone, with sculpted hair - or (without the kit) the photo on a round head
    const head = pivot(rig, [0, 2.3, 0]);
    head.scale.setScalar(1.55);
    const bobble = hasKit('bhead');
    let faceMat, face;
    if (bobble) {
      faceMat = new T.MeshLambertMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.32 });
      faceMat.userData.shared = true;   // keeps its own glow: excluded from the hit-flash list
      const hg = kp(head, 'bhead', faceMat, 0.44, [0, 0.03, 0.02]);
      face = hg.children[0];
      const hair = boss.hair || ['short', '#3b2a1a'];
      if (hair[0] !== 'none' && hasKit('hair_' + hair[0])) kpHead(head, 'hair_' + hair[0], mat(hair[1], { roughness: 0.75 }), 0.44 * PTD.KIT_DATA.k.bhead, [0, 0.06, 0.0]);
    } else {
      part(head, sph(), skinM, [0.34, 0.34, 0.34]).castShadow = true;
      faceMat = new T.MeshBasicMaterial({ color: 0xffffff });
      face = part(head, geo('bossFace', () => new T.CircleGeometry(0.3, 40)), faceMat, [1, 1, 1], [0, 0, 0.345]);
      face.castShadow = false;
      part(head, tor(), gold, [0.305, 0.305, 0.25], [0, 0, 0.345]);
    }
    const crown = pivot(head, [0, bobble ? 0.52 : 0.33, 0]);
    part(crown, cyl(), gold, [0.22, 0.1, 0.22]);
    for (let k = 0; k < 5; k++) {
      part(crown, cone(), gold, [0.05, 0.18, 0.05], [Math.cos(k / 5 * TAU) * 0.21, 0.13, Math.sin(k / 5 * TAU) * 0.21]);
      part(crown, sph(), glow(['#ff4d4d', '#3d8bff', '#2fa35c', '#ffffff', '#c39bff'][k], 2.2), [0.035, 0.035, 0.035], [Math.cos(k / 5 * TAU) * 0.225, 0.02, Math.sin(k / 5 * TAU) * 0.225]);
      if (style === 'staff') part(crown, cone(), mat('#66bb6a'), [0.06, 0.16, 0.02], [Math.cos(k / 5 * TAU + 0.6) * 0.24, 0.1, Math.sin(k / 5 * TAU + 0.6) * 0.24], [0, -k / 5 * TAU, 0.4]);
    }
    if (style === 'cigar') { const o = bobble ? [0.03, -0.1, 0.07] : [0, 0, 0]; part(head, cyl(), mat('#6b3e1f'), [0.025, 0.2, 0.025], [0.12 + o[0], -0.17 + o[1], 0.33 + o[2]], [0, 0, 1.2]); part(head, sph(), glow('#ff5a1f', 3), [0.03, 0.03, 0.03], [0.21 + o[0], -0.21 + o[1], 0.35 + o[2]]); }
    if (muscle) part(head, cyl(), fabric('#e74c3c'), bobble ? [0.43, 0.06, 0.43] : [0.345, 0.05, 0.345], [0, bobble ? 0.3 : 0.18, bobble ? -0.02 : 0], [bobble ? -0.12 : 0, 0, 0]);   // headband
    // signature prop in the right fist
    const hand = pivot(arms[1], [0, -0.7, 0.12]);
    switch (style) {
      case 'shield': { const sh2 = part(hand, cyl(), fabric('#1f618d'), [0.38, 0.06, 0.38], [0.1, 0, 0.1], [Math.PI / 2, 0, 0.3]); part(sh2, cyl(), fabric('#f4efe2'), [0.75, 1.05, 0.75]); part(sh2, cyl(), fabric('#1f618d'), [0.55, 1.1, 0.55]); break; }
      case 'scepter': part(hand, cyl(), gold, [0.035, 0.9, 0.035], [0, 0.3, 0]); part(hand, OCTA(), glow('#c39bff', 2.6), [0.1, 0.16, 0.1], [0, 0.8, 0]); break;
      case 'martini': part(hand, cone(), mat('#ffffff', { transparent: true, opacity: 0.6, roughness: 0.05 }), [0.14, 0.14, 0.14], [0, 0.18, 0], [Math.PI, 0, 0]); part(hand, cyl(), mat('#ffffff'), [0.01, 0.12, 0.01], [0, 0.06, 0]); part(hand, sph(), mat('#6a8f3a'), [0.03, 0.03, 0.03], [0.02, 0.2, 0]); break;
      case 'staff': part(hand, cyl(), wood('#7a4b2a'), [0.04, 1.4, 0.04], [0, 0.2, 0]); for (let l = 0; l < 4; l++) part(hand, cone(), mat('#66bb6a'), [0.08, 0.18, 0.02], [Math.cos(l) * 0.1, 0.9 + l * 0.05, Math.sin(l) * 0.1], [0.3, l, 0]); break;
      case 'muscle': part(hand, cyl(), metal('#9aa0a6'), [0.03, 0.6, 0.03], [0, 0, 0], [0, 0, Math.PI / 2]); for (const s2 of [-1, 1]) part(hand, sph(), metal('#2c2c34'), [0.16, 0.16, 0.16], [s2 * 0.3, 0, 0]); break;
      default: for (let k = 0; k < 4; k++) part(hand, box(), mat('#5f8f4e'), [0.22, 0.01, 0.1], [0, 0.05 + k * 0.012, 0], [0, k * 0.25 - 0.4, 0]);   // fanned cash
    }
    // bag: 'tote' hangs a canvas tote bag from the left fist
    let bagPivot = null;
    if (boss.bag === 'tote') {
      const lh = bagPivot = pivot(arms[0], [0, -0.74, 0.05]); lh.scale.setScalar(1.4);
      const canvasM = fabric('#e8dcc0'), strapM = fabric('#8a6a3a');
      for (const s2 of [-1, 1]) part(lh, box(), strapM, [0.035, 0.42, 0.02], [s2 * 0.12, -0.18, 0], [0, 0, -s2 * 0.32]);   // straps up into the fist
      part(lh, box(), canvasM, [0.5, 0.52, 0.16], [0, -0.62, 0]).castShadow = true;                                     // the bag
      part(lh, box(), fabric('#c9b994'), [0.5, 0.05, 0.165], [0, -0.38, 0]);                                              // folded hem
      part(lh, box(), mat('#2b2b2b'), [0.06, 0.1, 0.02], [0.17, -0.5, 0.085]);                                            // little logo tag
      for (let k = 0; k < 3; k++) part(lh, sph(), [mat('#d35400'), mat('#27ae60'), mat('#f1c40f')][k], [0.08, 0.08, 0.08], [(k - 1) * 0.12, -0.34, 0]);   // stuff poking out
    }
    // playing cards orbiting the boss
    const orbit = pivot(rig, [0, 1.6, 0]);
    for (let k = 0; k < 4; k++) { const cp = cardPlane(k, 14, 0.36); cp.position.set(Math.cos(k / 4 * TAU) * 1.2, Math.sin(k) * 0.15, Math.sin(k / 4 * TAU) * 1.2); cp.rotation.y = -k / 4 * TAU; orbit.add(cp); }

    // introMove 'armwrestle': a table and a challenger pop up in front of the boss during the
    // entrance. The stage sits beside the rig (the renderer adds it to the same holder), so the
    // boss's lean doesn't tip the table. Wrestling arm is arms[0] (x < 0); the shield stays free.
    let stage = null, lock = null, opp = null, oppBody = null, oppArm = null;
    const AW = boss.introMove === 'armwrestle';
    const LX = -0.64 * W, LZ = 1.18, OZ = LZ + 1.06;          // where the hands meet; challenger's spot
    if (AW) {
      stage = new T.Group(); stage.visible = false;
      const table = pivot(stage, [LX, 0, LZ]);
      const woodM = wood('#8d5a2b');
      part(table, cyl(), woodM, [0.42, 0.06, 0.42], [0, 0.82, 0]).castShadow = true;
      part(table, cyl(), woodM, [0.07, 0.8, 0.07], [0, 0.4, 0]);
      part(table, cyl(), woodM, [0.3, 0.05, 0.3], [0, 0.025, 0]);
      lock = pivot(table, [0, 0.85, 0]);                     // the locked forearms, hinged at the table top
      part(lock, cyl(), jacket, [0.06, 0.36, 0.06], [0.05, 0.18, -0.03]);
      part(lock, cyl(), skinM, [0.055, 0.36, 0.055], [-0.05, 0.18, 0.03]);
      part(lock, sph(), mat('#f4f4f4'), [0.13, 0.13, 0.13], [0.02, 0.38, -0.02]);
      part(lock, sph(), skinM, [0.11, 0.11, 0.11], [-0.03, 0.38, 0.04]);
      // the challenger: an anonymous gym bro in a grey tank top, facing the boss
      opp = pivot(stage, [LX + 0.46, 0, OZ]); opp.rotation.y = Math.PI; opp.scale.setScalar(0.9);
      oppBody = pivot(opp, [0, 0, 0]);
      const tank = fabric('#8e9aa6'), shorts = fabric('#2c3e50');
      for (const s2 of [-1, 1]) part(oppBody, cap(), shorts, [0.15, 0.3, 0.15], [s2 * 0.2, 0.55, 0]).castShadow = true;
      part(oppBody, sph(), tank, [0.42, 0.5, 0.34], [0, 1.25, 0]).castShadow = true;
      part(oppBody, sph(), skinM, [0.26, 0.26, 0.26], [0, 1.95, 0]).castShadow = true;
      part(oppBody, cyl(), fabric('#e74c3c'), [0.265, 0.05, 0.265], [0, 2.05, 0]);   // sweatband
      for (const s2 of [-1, 1]) part(oppBody, sph(), mat('#111'), [0.035, 0.05, 0.02], [s2 * 0.09, 1.98, 0.24]);
      for (const s2 of [-1, 1]) {
        const sh = pivot(oppBody, [s2 * 0.46, 1.55, 0]);
        part(sh, cap(), skinM, [0.11, 0.25, 0.11], [0, -0.32, 0]).castShadow = true;
        part(sh, sph(), skinM, [0.11, 0.11, 0.11], [0, -0.66, 0]);
        if (s2 > 0) oppArm = sh; else sh.rotation.z = -0.25;
      }
    }

    let quirk = 0, quirkT = 2.5;
    const smooth = (u) => u * u * (3 - 2 * u);
    const anim = (t, moving, dt, st) => {
      st = st || {};
      orbit.rotation.y += dt * 1.1;
      cape.forEach((c, k) => { c.rotation.x = 0.15 + Math.sin(t * 4 + k * 0.8) * 0.12 + (moving ? 0.2 : 0); });
      // ---- intro choreography while the boss shows off at the door
      if (st.intro != null) {
        const it = st.intro;
        if (AW && it >= 1.3) {
          const e = (u) => smooth(Math.max(0, Math.min(1, u)));
          // props pop up after he lands and shrink away just before he sets off
          stage.visible = true;
          stage.scale.setScalar(Math.max(0.001, e((it - 1.3) / 0.25) * (1 - e((it - 4.05) / 0.35))));
          const SLAM = 3.15;
          if (it < SLAM) {
            // lock in, struggle, nearly lose, roar back, then slam
            let th;
            if (it < 2.3) th = Math.sin(t * 9) * 0.08;
            else if (it < 2.7) th = -0.85 * e((it - 2.3) / 0.4) + Math.sin(t * 25) * 0.05;   // he's losing!
            else if (it < 3.0) th = -0.85 + 1.25 * e((it - 2.7) / 0.3);                   // ...comeback
            else th = 0.4 + 1.05 * e((it - 3.0) / 0.15);                                   // SLAM
            lock.rotation.x = th;
            const lean = 0.35 * e((it - 1.3) / 0.3), strain = Math.sin(t * 30) * 0.03;
            rig.position.y = 0; rig.rotation.x = lean + strain;
            torso.scale.setScalar(1 + 0.05 * Math.abs(Math.sin(t * 12)));
            torso.rotation.y = 0.15 + strain;
            arms[0].rotation.x = -0.75 * e((it - 1.3) / 0.3) - th * 0.35; arms[0].rotation.z = 0.12;
            arms[1].rotation.x = -0.5; arms[1].rotation.z = 0.5;                       // shield arm braced out
            legs[0].rotation.x = -0.45; legs[1].rotation.x = 0.3;
            opp.position.set(LX + 0.46, 0, OZ);
            oppBody.rotation.set(0.35 + strain, 0, 0);
            oppArm.rotation.x = -0.75 + th * 0.35;
          } else {
            // the challenger gets launched backwards, tumbling; the boss flexes and laughs
            const k = Math.min(1, (it - SLAM) / 0.9);
            lock.rotation.x = 1.45;
            opp.position.set(LX + 0.46, Math.sin(k * Math.PI) * 1.3, OZ + k * 2.6);
            oppBody.rotation.set(0.35 - k * 6.5, 0, 0);
            oppArm.rotation.x = -2.6;
            torso.rotation.y = 0;
            const f = it - SLAM + 2.25;   // reuse the regular flex / laugh timings
            let lA, rA, lZ = 0, rZ = 0, y = 0, lean = 0;
            if (f < 3.4) { const kk = smooth(Math.min(1, (f - 2.25) / 0.3)); lA = rA = -2.4 * kk; lZ = -1.1 * kk; rZ = 1.1 * kk; torso.scale.setScalar(1 + 0.08 * kk * (1 + Math.sin(t * 10) * 0.3)); }
            else { torso.scale.setScalar(1); rA = -1.55; lA = -0.4; lZ = 0.6; y = Math.abs(Math.sin(t * 14)) * 0.05; lean = -0.1; }
            legs[0].rotation.x = 0; legs[1].rotation.x = 0;
            arms[0].rotation.x = lA; arms[1].rotation.x = rA; arms[0].rotation.z = lZ; arms[1].rotation.z = rZ;
            rig.position.y = y; rig.rotation.x = lean;
          }
          crown.rotation.y += dt;
          return;
        }
        let lA = 0, rA = 0, lZ = 0, rZ = 0, y = 0, lean = 0, legBend = 0;
        if (it < 1.3) { lA = rA = -2.8; lZ = -0.5; rZ = 0.5; legBend = 0.5; }                         // falling, arms flailing up
        else if (it < 2.0) { const k = smooth((it - 1.3) / 0.7); y = -0.3 * k; legBend = 0.9 * k; lA = rA = -0.6 * k; lean = 0.3 * k; }   // crouch
        else if (it < 2.25) { const k = (it - 2.0) / 0.25; y = -0.3 + Math.sin(k * Math.PI) * 1.2; lA = rA = -2.9; legBend = 0.2; }        // leap and slam
        else if (it < 3.4) { const k = smooth(Math.min(1, (it - 2.25) / 0.3)); lA = rA = -2.4 * k; lZ = -1.1 * k; rZ = 1.1 * k; torso.scale.setScalar(1 + 0.08 * k * (1 + Math.sin(t * 10) * 0.3)); }   // flex
        else { torso.scale.setScalar(1); rA = -1.55; lA = -0.4; lZ = 0.6; y = Math.abs(Math.sin(t * 14)) * 0.05; lean = -0.1; }          // point at you and laugh
        legs[0].rotation.x = -legBend; legs[1].rotation.x = -legBend;
        arms[0].rotation.x = lA; arms[1].rotation.x = rA; arms[0].rotation.z = lZ; arms[1].rotation.z = rZ;
        rig.position.y = y; rig.rotation.x = lean;
        crown.rotation.y += dt * (it > 2.25 && it < 3.4 ? 12 : 1);
        return;
      }
      torso.scale.setScalar(1);
      if (stage) stage.visible = false;
      // ---- tripped over his own feet: st.fall runs 0..1 while the game holds him in place
      if (st.fall != null) {
        const f = st.fall, ease = (u) => smooth(Math.max(0, Math.min(1, u)));
        let pitch, flail = 0, kick = 0;
        if (f < 0.12) { pitch = 0.5 * ease(f / 0.12); flail = 1; }                                // stumble forward, arms windmilling
        else if (f < 0.22) { const k = (f - 0.12) / 0.1; pitch = 0.5 + 1.05 * k * k; flail = 1; }    // timber! face-first slam
        else if (f < 0.75) { pitch = 1.55 - Math.abs(Math.sin((f - 0.22) * 40)) * 0.03 * (1 - (f - 0.22) / 0.53); kick = 1; }   // lie there kicking
        else { pitch = 1.55 * (1 - ease((f - 0.75) / 0.25)); }                                      // haul himself back up
        rig.rotation.set(pitch, 0, f > 0.22 && f < 0.75 ? Math.sin(t * 6) * 0.06 : 0);
        rig.position.y = Math.sin(Math.min(pitch, 1.55)) * 0.42;   // keep the belly on top of the ground, not through it
        const wind = flail ? Math.sin(t * 22) * 1.2 : 0;
        arms[0].rotation.x = flail ? -2.2 + wind : -2.9 * (kick ? 1 : 1 - ease((f - 0.75) / 0.25)); arms[0].rotation.z = flail ? -0.9 : -0.5;
        arms[1].rotation.x = flail ? -2.2 - wind : -2.9 * (kick ? 1 : 1 - ease((f - 0.75) / 0.25)); arms[1].rotation.z = flail ? 0.9 : 0.5;
        legs[0].rotation.x = kick ? -0.6 + Math.sin(t * 16) * 0.5 : 0;
        legs[1].rotation.x = kick ? -0.6 - Math.sin(t * 16) * 0.5 : 0;
        torso.rotation.y = 0;
        rig.scale.set(1, 1, 1);
        crown.rotation.y += dt * (kick ? 8 : 0.6);   // the crown spins like stars round his head
        return;
      }
      // ---- heavy stomping walk, with a fist-pump taunt now and then
      const ph = t * 5.5 * (st.speed || 1);
      const sw = moving ? Math.sin(ph) : 0;
      quirkT -= dt; if (quirkT <= 0) { quirk = 1.4; quirkT = 3 + Math.random() * 4; }
      quirk = Math.max(0, quirk - dt);
      const q = quirk > 0 ? Math.sin((1.4 - quirk) / 1.4 * Math.PI) : 0;
      legs[0].rotation.x = sw * 0.75; legs[1].rotation.x = -sw * 0.75;
      arms[0].rotation.x = -sw * 0.7 * (1 - q) - q * 2.6; arms[0].rotation.z = -q * 0.4;
      arms[1].rotation.x = sw * 0.7 * (1 - q) - 0.3; arms[1].rotation.z = 0;
      rig.position.y = moving ? Math.abs(Math.sin(ph)) * 0.14 : 0;
      rig.rotation.x = 0.06 - (st.hit || 0) * 0.3;
      rig.rotation.z = moving ? Math.sin(ph * 0.5) * (club ? 0.22 : 0.1) : 0;   // club feet: big side-to-side waddle
      if (club) feet.forEach((f, k) => { f.rotation.y = -(k ? 1 : -1) * (0.85 + (moving ? Math.sin(ph + k * Math.PI) * 0.2 : 0)); });
      torso.rotation.y = sw * 0.15;
      if (st.slime != null) {   // slime blast: both arms thrust straight ahead, palms shaking with the force
        const k = Math.min(1, st.slime * 6), jit = Math.sin(t * 40) * 0.06;
        arms[0].rotation.x = arms[1].rotation.x = -1.5 * k + jit; arms[0].rotation.z = 0.25 * k; arms[1].rotation.z = -0.25 * k;
        rig.rotation.x -= 0.12 * k;   // leans back from the recoil
      }
      const sq = 1 - (st.hit || 0) * 0.1;
      rig.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
      crown.rotation.y += dt * 0.6;
      medal.rotation.z = Math.sin(t * 3) * 0.3;
      if (bagPivot) { bagPivot.rotation.x = -arms[0].rotation.x - rig.rotation.x + (moving ? Math.sin(t * 5.5) * 0.15 : 0); bagPivot.rotation.z = -arms[0].rotation.z; }   // tote dangles straight down
    };
    if (PTD.Toon) PTD.Toon.cartoonize(rig, { width: 3.0, skip: (m) => m === face && !bobble, style: { bright: 0.5, rim: '#7a5a30' } });
    if (PTD.Toon && stage) PTD.Toon.cartoonize(stage, { width: 3.5, style: { bright: 0.5, rim: '#7a5a30' } });
    const flash = [];
    rig.traverse(o => { if (o.isMesh && o.material && o.material.emissive && !o.material.userData.shared && flash.indexOf(o.material) < 0) flash.push(o.material); });
    return { rig, anim, flash: flash.slice(0, 6), head, faceMat, face, palms, stage, bobble };
  }

  // Bobblehead face texture: the photo inside a soft oval, fading into a skin tone sampled from the
  // cheeks, so the picture blends into the sculpted head instead of looking pasted on.
  function faceComposite(img) {
    const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
    const x = c.getContext('2d');
    const s = document.createElement('canvas'); s.width = s.height = 32;
    const sx = s.getContext('2d'); sx.drawImage(img, 0, 0, 32, 32);
    const px = sx.getImageData(0, 0, 32, 32).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (const [cx, cy] of [[9, 17], [10, 19], [22, 17], [21, 19], [16, 9]]) { const i = (cy * 32 + cx) * 4; r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
    const skinC = 'rgb(' + Math.round(r / n) + ',' + Math.round(g / n) + ',' + Math.round(b / n) + ')';
    x.fillStyle = skinC; x.fillRect(0, 0, N, N);
    // the photo, slightly zoomed so the face fills the front of the head
    const f = document.createElement('canvas'); f.width = f.height = N;
    const fx = f.getContext('2d');
    fx.drawImage(img, -N * 0.17, -N * 0.12, N * 1.34, N * 1.34);
    fx.globalCompositeOperation = 'destination-in';
    const gr = fx.createRadialGradient(N / 2, N * 0.5, N * 0.2, N / 2, N * 0.5, N * 0.5);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.8, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    fx.setTransform(0.9, 0, 0, 1.0, N * 0.05, 0);
    fx.fillStyle = gr; fx.fillRect(-N, -N, N * 3, N * 3);
    x.drawImage(f, 0, 0);
    return c;
  }

  PTD.Looters3D = { build, buildBoss, loadModels, MODELS, KIT, faceComposite };
})();
