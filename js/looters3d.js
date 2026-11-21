// Detailed 3D looter characters for the 3D renderer.
// PTD.Looters3D.build(def) -> { rig, anim(t, moving, dt), flash: [materials], detail: [objects] }
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

  // ------------------------------------------------------------------ faces
  function eyes(ctx, head, o) {
    const y = o.y || 0.05, z = o.z || 0.27, sp = o.sp || 0.12, s = o.size || 0.085;
    for (const side of [-1, 1]) {
      ctx.eyes.push(part(head, sph(), gloss('#ffffff'), [s, s * (o.tall || 1.1), s * 0.7], [side * sp, y, z]));
      const iris = part(head, sph(), gloss(o.iris || '#3b2a1a'), [s * 0.62, s * 0.66, s * 0.4], [side * sp, y, z + s * 0.5]);
      ctx.detail.push(iris); ctx.eyes.push(iris);
      ctx.detail.push(part(head, sph(), gloss('#050505'), [s * 0.32, s * 0.36, s * 0.3], [side * sp, y, z + s * 0.62]));
      ctx.detail.push(part(head, lowSph(), glow('#ffffff', 1.5), [s * 0.12, s * 0.12, s * 0.1], [side * sp + s * 0.2, y + s * 0.25, z + s * 0.72]));
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
    part(head, sph(), ctx.skinM, [0.3, 0.33, 0.3], [0, 0, 0]).castShadow = true;
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
      if (!o.robe) {
        part(hip, cap(), bottom, [0.105, 0.3, 0.105], [0, -0.4, 0]).castShadow = true;
        part(hip, sph(), shoes, [0.13, 0.085, 0.21], [0, -0.85, 0.06]);
      } else part(hip, sph(), shoes, [0.12, 0.08, 0.19], [0, -0.85, 0.07]);
      legs.push(hip);
    }
    const torso = part(rig, cap(), ctx.topM, [0.3 * (o.wide || 1), 0.24, 0.24], [0, 1.33, 0]);
    torso.castShadow = true;
    if (o.robe) part(rig, cone(), ctx.topM, [0.48, 1.05, 0.42], [0, 0.6, 0]).castShadow = true;
    if (o.belt) part(rig, cyl(), mat(o.belt, { roughness: 0.4 }), [0.31 * (o.wide || 1), 0.07, 0.25], [0, 1.06, 0]);
    if (o.vest) part(rig, cap(), fabric(o.vest), [0.305 * (o.wide || 1), 0.2, 0.245], [0, 1.36, -0.012]).scale.z = 0.235;
    if (o.coat) { part(rig, cone(), fabric(o.coat), [0.4 * (o.wide || 1), 0.95, 0.33], [0, 1.05, -0.02]).castShadow = true; }
    if (o.shirtV) part(rig, cone(), fabric(o.shirtV), [0.11, 0.3, 0.02], [0, 1.47, 0.24], [Math.PI, 0, 0]);
    if (o.tie) part(rig, cone(), gloss(o.tie), [0.04, 0.24, 0.02], [0, 1.38, 0.255], [Math.PI, 0, 0]);
    if (o.chain) ctx.detail.push(part(rig, tor(), metal('#e1b12c'), [0.17, 0.2, 0.17], [0, 1.5, 0.12], [1.2, 0, 0]));
    if (o.poncho) part(rig, cone(), fabric(o.poncho), [0.46, 0.55, 0.4], [0, 1.4, 0]).castShadow = true;
    if (o.cape) part(rig, geo('capeG', () => new T.CylinderGeometry(0.34, 0.6, 1.2, 16, 1, true, Math.PI * 0.55, Math.PI * 0.9)), mat(o.cape, { side: T.DoubleSide, roughness: 0.8 }), [1, 1, 1], [0, 1.05, 0], [0, Math.PI, 0]);
    for (const s of [-1, 1]) {
      const sh = pivot(rig, [s * 0.36 * (o.wide || 1), 1.55, 0]);
      part(sh, cap(), o.robe || o.coat ? fabric(o.coat || o.top) : ctx.topM, [0.075, 0.2, 0.075], [0, -0.24, 0]);
      const hand = part(sh, sph(), o.glove ? mat(o.glove) : ctx.skinM, [0.085, 0.085, 0.085], [0, -0.52, 0.02]);
      arms.push(sh);
      if (s === 1) ctx.rightHand = hand;
    }
    if (o.knuckles) ctx.detail.push(part(arms[1], tor(), metal('#b08d57'), [0.07, 0.07, 0.1], [0, -0.52, 0.08], [0, Math.PI / 2, 0]));
    const head = pivot(rig, [0, 2.02, 0]);
    head.scale.setScalar(1.32);   // bobble-head proportions, like the bosses
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
    part(g, sph(), burlap, [0.36 * s, 0.4 * s, 0.32 * s]).castShadow = true;
    part(g, cyl(), burlap, [0.1 * s, 0.14 * s, 0.1 * s], [0, 0.42 * s, 0]);
    part(g, tor(), mat('#7a5a2c'), [0.1 * s, 0.1 * s, 0.1 * s], [0, 0.42 * s, 0], [Math.PI / 2, 0, 0]);
    const lbl = new T.Mesh(geo('dollarPlane', () => new T.PlaneGeometry(0.34, 0.34)), mat('#ffffff', { map: dollar(), transparent: true, roughness: 0.9 }));
    lbl.position.set(0, 0, -0.325 * s); lbl.rotation.y = Math.PI; lbl.scale.setScalar(s); g.add(lbl);
    ctx.detail.push(lbl);
    // a couple of coins peeking out of the top
    for (let i = 0; i < 2; i++) ctx.detail.push(part(g, cyl(), metal('#ffcf40'), [0.07 * s, 0.015 * s, 0.07 * s], [(i - 0.5) * 0.08 * s, 0.53 * s, 0], [0.4 + i * 0.5, 0, 0.3]));
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
  function hat(ctx, kind, c, band) {
    const h = ctx.head;
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

  function moth(ctx) {
    const rig = ctx.rig;
    const fuzz = ctx.skinM;
    const body = pivot(rig, [0, 1.3, 0]);
    part(body, sph(), fuzz, [0.24, 0.45, 0.24], [0, 0, -0.1], [-0.6, 0, 0]).castShadow = true;
    part(body, sph(), fabric('#fff7cc'), [0.27, 0.18, 0.25], [0, 0.25, 0.08]);
    const head = pivot(body, [0, 0.42, 0.18]);
    part(head, sph(), fuzz, [0.2, 0.19, 0.19]);
    for (const s of [-1, 1]) {
      part(head, sph(), gloss('#1a1a1a'), [0.09, 0.11, 0.08], [s * 0.12, 0.02, 0.12]);
      const ant = pivot(head, [s * 0.06, 0.16, 0.08]);
      part(ant, cyl(), mat('#5a4500'), [0.012, 0.35, 0.012], [s * 0.06, 0.16, 0.05], [0.4, 0, -s * 0.4]);
      for (let f = 0; f < 4; f++) ctx.detail.push(part(ant, box(), fabric('#8a6d00'), [0.12 - f * 0.02, 0.012, 0.03], [s * (0.04 + f * 0.03), 0.1 + f * 0.06, 0.03 + f * 0.02], [0.4, 0, -s * 0.4]));
    }
    const wings = [];
    const wingMat = mat('#f1c40f', { side: T.DoubleSide, roughness: 0.6, transparent: true, opacity: 0.92 });
    const spot = glow('#ffefa0', 1.3);
    for (const s of [-1, 1]) {
      const w = pivot(body, [s * 0.15, 0.1, -0.05]);
      part(w, geo('wingU', () => new T.CircleGeometry(0.55, 24)), wingMat, [1, 0.75, 1], [s * 0.5, 0.25, 0], [0, s * 0.2, 0]);
      part(w, geo('wingL', () => new T.CircleGeometry(0.38, 20)), wingMat, [1, 0.8, 1], [s * 0.35, -0.35, 0], [0, s * 0.2, 0]);
      ctx.detail.push(part(w, geo('wingSpot', () => new T.CircleGeometry(0.12, 16)), spot, [1, 1, 1], [s * 0.55, 0.3, 0.01], [0, s * 0.2, 0]));
      wings.push(w);
    }
    ctx.mothBody = body;
    sack(ctx, [0, 0.55, 0.05], 0.7);
    return { wings };
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

  // ------------------------------------------------------------------ catalogue
  // Each looter (by level name) -> body plan, head, colours, outfit and props.
  const SPECS = {
    'Sneak Mouse': { pattern: ['stripes', '#ecf0f1'], body: 'biped', head: 'rodent', fur: '#9aa0a6', top: '#2c3e50', bottom: '#1f2a36', mask: '#111111', hat: ['beanie', '#1c1c1c'], tail: 'thin', tailC: '#f4a6b8' },
    'Alley Rat': { pattern: ['check', '#5c3a21'], body: 'biped', head: 'rodent', fur: '#7d6b5d', top: '#8e5b3a', vest: '#5c3a21', bottom: '#3b3b3b', hat: ['bandana', '#c0392b'], tail: 'thin', tailC: '#d98c8c', ear: 0.15 },
    'Coin Crab': { body: 'crab', shell: '#e0703a' },
    'Sock Goblin': { body: 'biped', head: 'goblin', skin: '#6dbb63', top: '#8d6e63', belt: '#4e342e', bottom: '#5d4037', hat: ['sock', '#f7f7f7', '#e74c3c'] },
    'Rag Raccoon': { pattern: ['stripes', '#2c3e50'], body: 'biped', head: 'rodent', fur: '#6b6f78', inner: '#2b2b2b', nose: '#111111', top: '#7f8c8d', bottom: '#4a4a4a', mask: '#1f2228', tail: 'ringed', tailC: '#6b6f78', ear: 0.14 },
    'Jackal Pup': { pattern: ['dots', '#e67e22'], body: 'biped', head: 'canine', fur: '#c9944a', top: '#3b2a1a', bottom: '#5a4632', chain: true, tail: 'bushy', tailC: '#b07d3a' },
    'Pocket Weasel': { body: 'biped', head: 'canine', fur: '#a0522d', muzzle: '#ffe8c2', coat: '#2f2f2f', top: '#444', bottom: '#2b2b2b', mask: '#111', tail: 'bushy', tailC: '#8b4513', hat: ['fedora', '#3a3a3a'] },
    'Brute Twins': { pattern: ['stripes', '#e74c3c'], body: 'biped', head: 'human', skin: '#8a6fd1', top: '#ecf0f1', bottom: '#2c3e50', wide: 1.35, chain: true, hair: '#1a1a1a', angry: true, horns: true, knuckles: true },
    'Card Shark': { pattern: ['pinstripe', '#2c3e50'], body: 'biped', head: 'shark', skin: '#5b8fb9', top: '#ecf0f1', vest: '#1b2631', bottom: '#1b2631', tie: '#c0392b', hat: ['visor'], tail: 'fin', prop: 'coin' },
    'Iron Knuckle': { pattern: ['stripes', '#2c3e50'], body: 'biped', head: 'human', skin: '#e0ac8a', top: '#d35400', bottom: '#d35400', belt: '#2c3e50', hat: ['helm', '#7f8c8d'], knuckles: true, angry: true, beard: '#3b2a1a' },
    'Velvet Fox': { pattern: ['dots', '#f5d76e'], body: 'biped', head: 'canine', fur: '#d9622b', muzzle: '#fff3e0', top: '#5b2c6f', vest: '#7d3c98', bottom: '#2c2c2c', tail: 'bushy', tailC: '#d9622b', tie: '#f5d76e' },
    'Silk Viper': { body: 'snake', skin: '#2e9e6b', accent: '#f1c40f' },
    'Masked Bandit': { body: 'biped', head: 'human', skin: '#d8a27a', top: '#34495e', bottom: '#1c2833', cape: '#111111', faceMask: '#111111', hat: ['cowboy', '#111111'], belt: '#5d4037', angry: true },
    'Fortune Teller': { body: 'biped', head: 'human', skin: '#c68e6e', top: '#8e44ad', robe: true, hat: ['hood', '#6c3483'], prop: 'crystal', hair: '#2b1d12', iris: '#9b59b6' },
    'Gold Moth': { body: 'moth', skin: '#e6b800' },
    'Clockwork Fixer': { pattern: ['check', '#8a6d3b'], body: 'biped', head: 'human', skin: '#e0ac8a', top: '#b08d57', bottom: '#5d4037', belt: '#3e2723', goggles: '#7fdfff', gear: true, prop: 'wrench', mustache: '#5d4037', hair: '#5d4037' },
    'Heartbreaker': { pattern: ['dots', '#ffffff'], body: 'biped', head: 'human', skin: '#f0c8a8', top: '#e84393', bottom: '#2d3436', hat: ['hood', '#fd79a8'], hearts: true, grin: true, hair: '#6d214f' },
    'Desperado': { pattern: ['check', '#5d4037'], body: 'biped', head: 'human', skin: '#c68e6e', top: '#a1673f', poncho: '#c0392b', bottom: '#5d4037', hat: ['cowboy', '#6e4b2a', '#2d2d2d'], beard: '#2b1d12', angry: true },
    'Loan Shark': { body: 'biped', head: 'shark', skin: '#476f95', top: '#f8f9f9', coat: '#ecf0f1', bottom: '#f8f9f9', shirtV: '#2c3e50', chain: true, tail: 'fin', prop: 'coin' },
    'Snake-Oil Seller': { body: 'biped', head: 'human', skin: '#d8b48a', top: '#6a8f3a', coat: '#4d6b27', bottom: '#2f3b1c', hat: ['top', '#2a2a2a', '#e8d27a'], prop: 'bottle', mustache: '#3b2a1a', grin: true },
    'Shell Gamer': { pattern: ['argyle', '#4aa3a2'], body: 'biped', head: 'human', skin: '#e0ac8a', top: '#fdf6e3', vest: '#4aa3a2', bottom: '#2c3e50', hat: ['fedora', '#4aa3a2', '#1d3c3c'], prop: 'cups', grin: true, hair: '#2b1d12' },
    'Silver Tongue': { body: 'biped', head: 'human', skin: '#e8cfc0', top: '#bdc3c7', robe: true, hat: ['hood', '#95a5a6'], grin: true, iris: '#7f8c8d', chain: true },
    'Vault Cracker': { body: 'biped', head: 'human', skin: '#d8a27a', top: '#2f3640', bottom: '#2f3640', glove: '#111111', hat: ['helm', '#e1b12c'], lamp: true, prop: 'stethoscope', faceMask: '#1e272e' },
    'Tycoon': { pattern: ['pinstripe', '#e1b12c'], body: 'biped', head: 'human', skin: '#f0c8a8', top: '#273c75', coat: '#1e2a5a', bottom: '#273c75', shirtV: '#ffffff', tie: '#e1b12c', wide: 1.3, hat: ['top', '#111111', '#e1b12c'], prop: 'cane', monocle: true, mustache: '#ecf0f1', hair: '#ecf0f1' },
    'Tax Collector': { pattern: ['pinstripe', '#ced6e0'], body: 'biped', head: 'human', skin: '#e8cfc0', top: '#57606f', coat: '#4b5260', bottom: '#2f3542', shirtV: '#ffffff', tie: '#2f3542', hat: ['bowler', '#2f3542'], prop: 'clipboard', iris: '#2c3e50', angry: true },
  };

  // How each looter moves, and the little move it does now and then.
  const GAIT = {
    sneak: { f: 10, step: 0.45, bob: 0.03, lean: 0.28, crouch: 0.12, sway: 0, arms: 0.25 },
    scurry: { f: 15, step: 0.6, bob: 0.07, lean: 0.2, crouch: 0.04, sway: 0.04, arms: 0.7 },
    swagger: { f: 7, step: 0.55, bob: 0.05, lean: -0.04, crouch: 0, sway: 0.16, arms: 0.45 },
    stomp: { f: 6, step: 0.75, bob: 0.1, lean: 0.08, crouch: 0.02, sway: 0.1, arms: 0.8 },
    strut: { f: 7.5, step: 0.6, bob: 0.06, lean: -0.1, crouch: 0, sway: 0.05, arms: 0.2 },
    glide: { f: 4, step: 0, bob: 0.08, lean: 0.05, crouch: -0.06, sway: 0.06, arms: 0.15 },
    march: { f: 8, step: 0.6, bob: 0.04, lean: 0, crouch: 0, sway: 0, arms: 0.6, snap: true },
  };
  const STYLE = {
    'Sneak Mouse': ['sneak', 'look'], 'Alley Rat': ['scurry', 'look'], 'Sock Goblin': ['scurry', 'laugh'], 'Rag Raccoon': ['scurry', 'look'],
    'Jackal Pup': ['scurry', 'hop'], 'Pocket Weasel': ['sneak', 'look'], 'Brute Twins': ['stomp', 'flex'], 'Card Shark': ['swagger', 'coin'],
    'Iron Knuckle': ['stomp', 'flex'], 'Velvet Fox': ['swagger', 'laugh'], 'Masked Bandit': ['sneak', 'look'], 'Fortune Teller': ['glide', 'raise'],
    'Clockwork Fixer': ['march', 'raise'], 'Heartbreaker': ['swagger', 'wave'], 'Desperado': ['strut', 'look'], 'Loan Shark': ['swagger', 'coin'],
    'Snake-Oil Seller': ['strut', 'shake'], 'Shell Gamer': ['swagger', 'shake'], 'Silver Tongue': ['glide', 'laugh'], 'Vault Cracker': ['sneak', 'look'],
    'Tycoon': ['strut', 'twirl'], 'Tax Collector': ['strut', 'raise'],
  };

  function build(def) {
    const spec = SPECS[def.name] || { body: 'biped', head: 'human', skin: '#e0ac8a', top: (def.look || ['#888'])[0] };
    const rig = new T.Group();
    const ctx = { rig, spec, detail: [], flash: [], eyes: [], ears: [] };
    const base = spec.fur || spec.skin || spec.shell || '#e0ac8a';
    ctx.skinM = skin(base).clone(); ctx.flash.push(ctx.skinM);
    ctx.furM = mat(spec.fur || base, { roughness: 0.95 }).clone(); ctx.flash.push(ctx.furM);
    if (spec.fur) ctx.skinM = ctx.furM;
    let parts = {};
    const model = MODELS[modelKey(def.name)];
    if (model) parts = fromModel(ctx, model);
    else if (spec.body === 'crab') parts = crab(ctx, spec.shell);
    else if (spec.body === 'moth') parts = moth(ctx);
    else if (spec.body === 'snake') parts = snake(ctx);
    else {
      parts = biped(ctx, spec);
      const h = ctx.head;
      if (spec.head === 'rodent') rodentHead(ctx, h, spec);
      else if (spec.head === 'canine') canineHead(ctx, h, spec);
      else if (spec.head === 'shark') sharkHead(ctx, h, spec);
      else if (spec.head === 'goblin') goblinHead(ctx, h, spec);
      else humanHead(ctx, h, spec);
      if (spec.mask) mask(ctx, spec.mask);
      if (spec.faceMask) faceMask(ctx, spec.faceMask);
      if (spec.goggles) goggles(ctx, spec.goggles);
      if (spec.hat) hat(ctx, spec.hat[0], spec.hat[1], spec.hat[2]);
      if (spec.horns) for (const s of [-1, 1]) part(h, cone(), gloss('#fdfefe'), [0.06, 0.18, 0.06], [s * 0.2, 0.3, 0], [0, 0, -s * 0.5]);
      if (spec.hearts) for (const s of [-1, 1]) part(h, sph(), glow('#ff4d94', 1.6), [0.07, 0.06, 0.03], [s * 0.11, 0.06, 0.31]);
      if (spec.monocle) ctx.detail.push(part(h, tor(), metal('#e1b12c'), [0.06, 0.06, 0.06], [0.11, 0.06, 0.3]));
      if (spec.lamp) { part(h, cyl(), glow('#fff6c4', 3), [0.06, 0.05, 0.06], [0, 0.22, 0.28], [Math.PI / 2, 0, 0]); const l = new T.SpotLight(0xfff0c0, 0.8, 600, 0.5, 0.6, 0); l.position.set(0, 0.22, 0.3); l.target.position.set(0, -1.5, 2.5); h.add(l); h.add(l.target); }
      if (spec.gear) { const g = part(rig, tor(), metal('#b08d57'), [0.28, 0.28, 0.4], [0, 1.4, -0.32]); for (let k = 0; k < 8; k++) part(g, box(), metal('#b08d57'), [0.35, 0.35, 0.2], [Math.cos(k / 8 * TAU) * 1.15, Math.sin(k / 8 * TAU) * 1.15, 0], [0, 0, k / 8 * TAU]); ctx.gearObj = g; }
      if (spec.prop) prop(ctx, spec.prop);
      if (spec.tail) tail(ctx, spec.tail, spec.tailC || base);
      if (!spec.gear) sack(ctx);
    }

    const [gaitName, quirkName] = STYLE[def.name] || ['strut', 'look'];
    const gait = GAIT[spec.robe ? 'glide' : gaitName];
    const armHold = spec.body === 'biped' ? -2.5 : 0;   // left arm reaches back over the shoulder to hold the sack
    const eyeY = ctx.eyes.map(e => e.scale.y);
    const earZ = ctx.ears.map(e => e.rotation.z);
    const sackY = ctx.sackG ? ctx.sackG.position.y : 0;
    // every looter also gets one random extra party trick
    const small = gaitName === 'scurry' || gaitName === 'sneak';
    const extras = small ? ['dance', 'juggle', 'trip', 'cartwheel'] : ['dance', 'juggle', 'trip', 'count'];
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
        stars.position.y = spec.body === 'biped' ? 2.45 : 1.6;
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
        let rArm = spec.prop ? -0.6 + sw * 0.15 : -sw * gait.arms;
        let rArmZ = 0;
        const bob = moving ? Math.abs(Math.sin(ph)) * gait.bob : Math.sin(t * 2) * 0.01;
        rig.position.y = bob - gait.crouch + (gait === GAIT.glide ? 0.06 + Math.sin(t * 2.2) * 0.05 : 0);
        rig.rotation.x = gait.lean - (st.hit || 0) * 0.45;                    // lean, or flinch back when hit
        rig.rotation.z = moving ? Math.sin(ph * 0.5) * gait.sway : 0;
        const squash = 1 - (st.hit || 0) * 0.12 + (moving ? Math.abs(Math.sin(ph)) * 0.03 : 0);
        rig.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));
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
      PTD.Toon.cartoonize(rig, { width: 2.6, onlyShadowCasters: true, style: { bright: 0.78, rim: '#ffd9a0' } });
      const swap = new Map();
      for (const [o, m] of before) if (o.material !== m) swap.set(m, o.material);
      ctx.flash = ctx.flash.map(m => swap.get(m) || m).filter(m => m.emissive);
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
      part(hip, cap(), dark, [0.17, 0.32, 0.17], [0, -0.38, 0]).castShadow = true;
      part(hip, cyl(), fabric('#2a1a10'), [0.19, 0.28, 0.19], [0, -0.78, 0]);
      if (club) {
        const ankle = pivot(hip, [0, -0.88, 0]);
        ankle.rotation.set(0.35, -s2 * 0.85, -s2 * 0.6);          // toes curl in and point down, sole faces inward
        part(ankle, sph(), fabric('#2a1a10'), [0.25, 0.16, 0.38], [0, -0.04, 0.15]).castShadow = true;
        part(ankle, sph(), fabric('#2a1a10'), [0.16, 0.13, 0.16], [0, -0.02, 0.42]);   // knobbly curled toe
        feet.push(ankle);
      } else part(hip, sph(), fabric('#2a1a10'), [0.18, 0.12, 0.27], [0, -0.92, 0.1]);
      part(hip, cyl(), gold, [0.2, 0.04, 0.2], [0, -0.64, 0]);
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
      part(torso, sph(), jacket, [0.6 * W, 0.52, 0.44], [0, 0.12, 0]).castShadow = true;
      part(torso, sph(), jacket, [0.5 * W, 0.45, 0.46], [0, -0.22, 0.06]).castShadow = true;
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
      part(sh, cap(), muscle ? skinM : jacket, [muscle ? 0.17 : 0.13, 0.28, muscle ? 0.17 : 0.13], [0, -0.32, 0]).castShadow = true;
      if (muscle) part(sh, sph(), skinM, [0.2, 0.18, 0.2], [0, -0.12, 0]);   // biceps
      part(sh, sph(), mat('#f4f4f4'), [0.17, 0.17, 0.17], [0, -0.7, 0.03]).castShadow = true;
      part(sh, tor(), gold, [0.06, 0.06, 0.06], [0, -0.7, 0.16]);
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
    // head: the face picture on a big round head, with a jewelled crown
    const head = pivot(rig, [0, 2.3, 0]);
    head.scale.setScalar(1.55);
    part(head, sph(), skinM, [0.34, 0.34, 0.34]).castShadow = true;
    const faceMat = new T.MeshBasicMaterial({ color: 0xffffff });
    const face = part(head, geo('bossFace', () => new T.CircleGeometry(0.3, 40)), faceMat, [1, 1, 1], [0, 0, 0.345]);
    face.castShadow = false;
    part(head, tor(), gold, [0.305, 0.305, 0.25], [0, 0, 0.345]);
    const crown = pivot(head, [0, 0.33, 0]);
    part(crown, cyl(), gold, [0.22, 0.1, 0.22]);
    for (let k = 0; k < 5; k++) {
      part(crown, cone(), gold, [0.05, 0.18, 0.05], [Math.cos(k / 5 * TAU) * 0.21, 0.13, Math.sin(k / 5 * TAU) * 0.21]);
      part(crown, sph(), glow(['#ff4d4d', '#3d8bff', '#2fa35c', '#ffffff', '#c39bff'][k], 2.2), [0.035, 0.035, 0.035], [Math.cos(k / 5 * TAU) * 0.225, 0.02, Math.sin(k / 5 * TAU) * 0.225]);
      if (style === 'staff') part(crown, cone(), mat('#66bb6a'), [0.06, 0.16, 0.02], [Math.cos(k / 5 * TAU + 0.6) * 0.24, 0.1, Math.sin(k / 5 * TAU + 0.6) * 0.24], [0, -k / 5 * TAU, 0.4]);
    }
    if (style === 'cigar') { part(head, cyl(), mat('#6b3e1f'), [0.025, 0.2, 0.025], [0.12, -0.17, 0.33], [0, 0, 1.2]); part(head, sph(), glow('#ff5a1f', 3), [0.03, 0.03, 0.03], [0.21, -0.21, 0.35]); }
    if (muscle) part(head, cyl(), fabric('#e74c3c'), [0.345, 0.05, 0.345], [0, 0.18, 0]);   // headband
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
    if (PTD.Toon) PTD.Toon.cartoonize(rig, { width: 3.5, skip: (m) => m === face, style: { bright: 0.5, rim: '#7a5a30' } });
    if (PTD.Toon && stage) PTD.Toon.cartoonize(stage, { width: 3.5, style: { bright: 0.5, rim: '#7a5a30' } });
    const flash = [];
    rig.traverse(o => { if (o.isMesh && o.material && o.material.emissive && !o.material.userData.shared && flash.indexOf(o.material) < 0) flash.push(o.material); });
    return { rig, anim, flash: flash.slice(0, 6), head, faceMat, face, palms, stage };
  }

  PTD.Looters3D = { build, buildBoss, SPECS, loadModels, MODELS };
})();
