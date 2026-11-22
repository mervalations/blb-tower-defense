// 3D renderer (Three.js). Same public API as PTD.Renderer so the UI and netcode don't care
// which one is active: cam {x, y, zoom}, screenToWorld, worldToScreen, zoomAt, clampZoom,
// fitPlayer, resize, draw(ui), plus pickTower and event for 3D-only extras.
// World mapping: game (x, y) on the ground plane -> three (x, height, -y).
window.PTD = window.PTD || {};

(function () {
  if (!window.THREE) return;
  const T = window.THREE;
  const TAU = Math.PI * 2;
  const W2T = (x, y, h) => new T.Vector3(x, h || 0, -y);
  const sound = (name, arg) => { if (PTD.Audio) PTD.Audio.play(name, arg); };
  const fmtDmg = (n) => n >= 10000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(Math.round(n));
  const FELT_H = 44;   // buildable felt is raised; lanes are channels cut into the table

  // ---------------------------------------------------------------- shared resources
  const cache = { mats: {}, tex: {}, geo: {}, text: new Map() };

  function canvasTex(c, srgb) {
    const t = new T.CanvasTexture(c);
    if (srgb !== false) t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }
  function mat(key, make) {
    if (!cache.mats[key]) { cache.mats[key] = make(); cache.mats[key].userData.shared = true; }
    return cache.mats[key];
  }
  function geo(key, make) { return cache.geo[key] || (cache.geo[key] = make()); }
  function std(color, opts) {
    const key = 'std' + color + JSON.stringify(opts || {});
    return mat(key, () => new T.MeshStandardMaterial(Object.assign({ color, roughness: 0.6, metalness: 0.05 }, opts || {})));
  }
  // Emissive "light" material: colours above 1.0 feed the bloom pass.
  function glowMat(color, boost) {
    return mat('glow' + color + boost, () => { const m = new T.MeshBasicMaterial({ color }); m.color.multiplyScalar(boost || 2.5); return m; });
  }

  function glowTexture() {
    if (cache.tex.glow) return cache.tex.glow;
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.25, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.6, 'rgba(255,255,255,0.18)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    return (cache.tex.glow = canvasTex(c, false));
  }

  function textTexture(text, color, size) {
    const key = text + '|' + color + '|' + (size || 0);
    if (cache.text.has(key)) return cache.text.get(key);
    const c = document.createElement('canvas');
    const fs = size || 56;
    const x = c.getContext('2d');
    x.font = 'bold ' + fs + 'px Arial, sans-serif';
    const w = Math.ceil(x.measureText(text).width) + 20;
    c.width = w; c.height = fs + 20;
    x.font = 'bold ' + fs + 'px Arial, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = fs * 0.18; x.strokeStyle = 'rgba(0,0,0,0.9)'; x.strokeText(text, w / 2, c.height / 2);
    x.fillStyle = color; x.fillText(text, w / 2, c.height / 2);
    const t = canvasTex(c);
    t.userData = { aspect: w / c.height };
    if (cache.text.size > 300) cache.text.clear();
    cache.text.set(key, t);
    return t;
  }

  // Card face: crop the 2D card sprite (no drop shadow) into a texture.
  function cardFace(suit, rank) {
    const key = 'card' + suit + '_' + rank;
    if (cache.tex[key]) return cache.tex[key];
    const src = PTD.Art.cardSprite(suit, rank);
    const c = document.createElement('canvas'); c.width = 216; c.height = 280;
    c.getContext('2d').drawImage(src, 10, 6, 108, 140, 0, 0, 216, 280);
    return (cache.tex[key] = canvasTex(c));
  }
  function cardBack() {
    if (cache.tex.back) return cache.tex.back;
    const c = document.createElement('canvas'); c.width = 216; c.height = 280;
    const x = c.getContext('2d');
    PTD.Art.rr(x, 0, 0, 216, 280, 20); x.fillStyle = '#fbf8f1'; x.fill();
    PTD.Art.rr(x, 12, 12, 192, 256, 12); x.fillStyle = '#8e1b2b'; x.fill();
    x.strokeStyle = 'rgba(255,215,110,0.5)'; x.lineWidth = 2;
    for (let i = -280; i < 280; i += 18) { x.beginPath(); x.moveTo(12 + i, 12); x.lineTo(12 + i + 256, 268); x.stroke(); x.beginPath(); x.moveTo(204 - i, 12); x.lineTo(204 - i - 256, 268); x.stroke(); }
    x.fillStyle = '#ffd34d'; x.font = 'bold 54px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.lineWidth = 6; x.strokeStyle = '#4a0c14'; x.strokeText('BLB', 108, 140); x.fillText('BLB', 108, 140);
    return (cache.tex.back = canvasTex(c));
  }
  function chipSideTexture(color) {
    const key = 'chip' + color;
    if (cache.tex[key]) return cache.tex[key];
    const c = document.createElement('canvas'); c.width = 256; c.height = 16;
    const x = c.getContext('2d');
    x.fillStyle = color; x.fillRect(0, 0, 256, 16);
    x.fillStyle = '#f4efe2';
    for (let i = 0; i < 8; i++) x.fillRect(i * 32 + 6, 0, 12, 16);
    const t = canvasTex(c); t.wrapS = T.RepeatWrapping;
    return (cache.tex[key] = t);
  }
  function chipTopTexture(color, rank) {
    const key = 'chiptop' + color + rank;
    if (cache.tex[key]) return cache.tex[key];
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = color; x.beginPath(); x.arc(64, 64, 64, 0, TAU); x.fill();
    x.strokeStyle = '#f4efe2'; x.lineWidth = 9; x.setLineDash([18, 14]);
    x.beginPath(); x.arc(64, 64, 52, 0, TAU); x.stroke(); x.setLineDash([]);
    x.fillStyle = PTD.Art.shade(color, 0.3); x.beginPath(); x.arc(64, 64, 36, 0, TAU); x.fill();
    x.fillStyle = '#ffffff'; x.font = 'bold 40px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(PTD.RANK_LABEL[rank], 64, 66);
    return (cache.tex[key] = canvasTex(c));
  }
  function woodTexture() {
    if (cache.tex.wood) return cache.tex.wood;
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d');
    x.fillStyle = '#4a2414'; x.fillRect(0, 0, 512, 128);
    for (let i = 0; i < 90; i++) {
      const y = Math.random() * 128, a = 0.05 + Math.random() * 0.12;
      x.strokeStyle = Math.random() < 0.5 ? 'rgba(20,6,2,' + a + ')' : 'rgba(150,80,40,' + a + ')';
      x.lineWidth = 0.6 + Math.random() * 2.2;
      x.beginPath(); x.moveTo(0, y);
      for (let px = 0; px <= 512; px += 32) x.lineTo(px, y + Math.sin(px * 0.02 + i) * 3 + Math.sin(px * 0.007 + i * 2) * 5);
      x.stroke();
    }
    const t = canvasTex(c); t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(6, 1);
    return (cache.tex.wood = t);
  }

  // A tiny sunny sky (blue above, bright horizon, green-ish ground, a sun) baked into an
  // environment map so metal, gold and lacquer reflect the daytime world around the table.
  function buildEnvironment(gl) {
    if (cache.env) return cache.env;
    const env = new T.Scene();
    const dome = new T.Mesh(new T.SphereGeometry(50, 32, 16), new T.ShaderMaterial({ side: T.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float h = vP.y; vec3 c = h > 0.0 ? mix(vec3(0.85, 0.93, 1.0), vec3(0.25, 0.5, 0.9), smoothstep(0.0, 0.8, h)) : mix(vec3(0.85, 0.93, 1.0), vec3(0.35, 0.45, 0.3), smoothstep(0.0, -0.3, h)); gl_FragColor = vec4(c * 0.3, 1.0); }' }));   // dim: reflections tint, the sun and sky lights do the lighting
    env.add(dome);
    const sun = new T.Mesh(new T.CircleGeometry(6, 24), new T.MeshBasicMaterial({ color: new T.Color(0xfff2d0).multiplyScalar(2.5), side: T.DoubleSide }));
    sun.position.set(-20, 26, 30); sun.lookAt(0, 0, 0); env.add(sun);
    const pm = new T.PMREMGenerator(gl);
    cache.env = pm.fromScene(env, 0.035).texture;
    pm.dispose();
    return cache.env;
  }

  // Tufted casino velvet: diamond pleats with a gold button at every corner (tiles seamlessly).
  function velvetTexture() {
    if (cache.tex.velvet) return cache.tex.velvet;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#5c0818'; x.fillRect(0, 0, 256, 256);
    const puff = (cx, cy) => {
      const g = x.createRadialGradient(cx - 14, cy - 18, 6, cx, cy, 92);
      g.addColorStop(0, '#e8475c'); g.addColorStop(0.45, '#b5172f'); g.addColorStop(1, '#4f0614');
      x.fillStyle = g; x.beginPath(); x.moveTo(cx, cy - 64); x.lineTo(cx + 64, cy); x.lineTo(cx, cy + 64); x.lineTo(cx - 64, cy); x.closePath(); x.fill();
    };
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) if (!((i + j) % 2)) puff(i * 64, j * 64);
    x.strokeStyle = 'rgba(40,0,8,0.55)'; x.lineWidth = 3;
    for (let k = -256; k <= 512; k += 128) { x.beginPath(); x.moveTo(k + 64, 0); x.lineTo(k + 64 + 256, 256); x.stroke(); x.beginPath(); x.moveTo(k + 64, 0); x.lineTo(k + 64 - 256, 256); x.stroke(); }
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      if (!((i + j) % 2)) continue;
      const bx = i * 64, by = j * 64;
      const g = x.createRadialGradient(bx - 2, by - 2, 1, bx, by, 6);
      g.addColorStop(0, '#fff6c8'); g.addColorStop(0.5, '#f1c232'); g.addColorStop(1, '#8a5d08');
      x.fillStyle = g; x.beginPath(); x.arc(bx, by, 6, 0, TAU); x.fill();
    }
    const t = canvasTex(c); t.wrapS = t.wrapT = T.RepeatWrapping;
    return (cache.tex.velvet = t);
  }

  function toonRamp() {
    if (cache.tex.ramp) return cache.tex.ramp;
    const t = new T.DataTexture(new Uint8Array([150, 150, 150, 255, 210, 210, 210, 255, 255, 255, 255, 255]), 3, 1, T.RGBAFormat);
    t.minFilter = t.magFilter = T.NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    return (cache.tex.ramp = t);
  }



  // ---------------------------------------------------------------- post-processing
  // Small hand-rolled HDR bloom: bright-pass -> separable blur at 1/2 and 1/4 res ->
  // composite with ACES tone mapping, vignette and a damage flash.
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const BRIGHT_FS = `uniform sampler2D tDiffuse; uniform float threshold; varying vec2 vUv;
    void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b));
      float k = smoothstep(threshold, threshold + 0.6, l); gl_FragColor = vec4(c * k, 1.0); }`;
  const BLUR_FS = `uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
    void main(){ vec3 s = texture2D(tDiffuse, vUv).rgb * 0.227;
      s += texture2D(tDiffuse, vUv + dir * 1.385).rgb * 0.316; s += texture2D(tDiffuse, vUv - dir * 1.385).rgb * 0.316;
      s += texture2D(tDiffuse, vUv + dir * 3.231).rgb * 0.070; s += texture2D(tDiffuse, vUv - dir * 3.231).rgb * 0.070;
      gl_FragColor = vec4(s, 1.0); }`;
  // Screen-space ambient occlusion from the depth buffer: soft contact shadows wherever
  // things meet (towers on the felt, looters' feet, the base of walls).
  const AO_FS = `uniform sampler2D tDepth; uniform mat4 proj; uniform mat4 projInv; uniform float radius; uniform vec2 res; varying vec2 vUv;
    vec3 viewPos(vec2 uv){ float d = texture2D(tDepth, uv).x; vec4 p = projInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0); return p.xyz / p.w; }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      float d0 = texture2D(tDepth, vUv).x;
      if (d0 >= 0.99999) { gl_FragColor = vec4(1.0); return; }
      vec3 P = viewPos(vUv);
      vec3 px = viewPos(vUv + vec2(1.0 / res.x, 0.0)) - P, py = viewPos(vUv + vec2(0.0, 1.0 / res.y)) - P;
      vec3 N = normalize(cross(px, py));
      float a0 = hash(vUv * res) * 6.2831;
      vec3 rv = vec3(cos(a0), sin(a0), 0.0);
      vec3 Tn = normalize(rv - N * dot(rv, N)); vec3 B = cross(N, Tn);
      float occ = 0.0;
      for (int i = 0; i < 14; i++) {
        float fi = float(i);
        float r = (fi + 1.0) / 14.0; r = mix(0.12, 1.0, r * r);
        float a = fi * 2.39996; float z = 0.25 + 0.75 * fract(fi * 0.618);
        vec3 k = vec3(cos(a) * sqrt(1.0 - z * z), sin(a) * sqrt(1.0 - z * z), z);
        vec3 S = P + (Tn * k.x + B * k.y + N * k.z) * radius * r;
        vec4 q = proj * vec4(S, 1.0); vec2 uv = q.xy / q.w * 0.5 + 0.5;
        float sz = viewPos(uv).z;
        float range = smoothstep(0.0, 1.0, radius / abs(P.z - sz));
        occ += (sz >= S.z + radius * 0.04 ? 1.0 : 0.0) * range;
      }
      gl_FragColor = vec4(vec3(1.0 - min(1.0, occ / 14.0 * 1.5)), 1.0); }`;
  const AOBLUR_FS = `uniform sampler2D tDiffuse; uniform vec2 dir; varying vec2 vUv;
    void main(){ float s = 0.0;
      for (int i = -3; i <= 3; i++) s += texture2D(tDiffuse, vUv + dir * float(i) * 1.5).r * (1.0 - abs(float(i)) / 4.5);
      gl_FragColor = vec4(vec3(s / 4.333), 1.0); }`;
  const COMP_FS = `uniform sampler2D tScene; uniform sampler2D tB1; uniform sampler2D tB2; uniform float strength;
    uniform sampler2D tAO; uniform float aoK; uniform sampler2D tSoft; uniform float tilt;
    uniform float exposure; uniform float flash; uniform vec3 flashColor; varying vec2 vUv;
    vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
    void main(){
      vec3 base = texture2D(tScene, vUv).rgb;
      float far = tilt * smoothstep(0.62, 0.98, vUv.y);           // a touch of depth-of-field on the far side of the table
      base = mix(base, texture2D(tSoft, vUv).rgb, far);
      float ao = mix(1.0, texture2D(tAO, vUv).r, aoK);
      base *= ao * ao;
      vec3 c = base + (texture2D(tB1, vUv).rgb * 0.7 + texture2D(tB2, vUv).rgb * 1.0) * strength;
      c = aces(c * exposure);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float sat = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
      c = mix(vec3(l), c, 1.08 + 0.17 * (1.0 - sat));             // vivid, cartoon colour: dull colours get the biggest boost
      c = clamp((c - 0.5) * 1.07 + 0.5, 0.0, 1.0);                 // contrast
      c = clamp(c, 0.0, 1.0);

      vec2 d = vUv - 0.5; float v = smoothstep(0.85, 0.25, length(d * vec2(1.1, 1.0)));
      c *= mix(0.82, 1.0, v);
      c = mix(c, flashColor, flash * (1.0 - v) * 0.9);
      vec3 o = pow(c, vec3(1.0 / 2.2));
      float n = fract(sin(dot(vUv * 913.7, vec2(12.9898, 78.233))) * 43758.5453);
      o += (n - 0.5) * 0.012;                                      // fine film grain, applied after gamma
      gl_FragColor = vec4(o, 1.0); }`;

  class Post {
    constructor(gl) {
      this.gl = gl;
      this.scene = new T.Scene();
      this.cam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.quad = new T.Mesh(new T.PlaneGeometry(2, 2));
      this.scene.add(this.quad);
      const sh = (fs, uniforms) => new T.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
      this.bright = sh(BRIGHT_FS, { tDiffuse: { value: null }, threshold: { value: 2.3 } });   // only true glows bloom; sunlit whites stay crisp
      this.blur = sh(BLUR_FS, { tDiffuse: { value: null }, dir: { value: new T.Vector2() } });
      this.ao = sh(AO_FS, { tDepth: { value: null }, proj: { value: new T.Matrix4() }, projInv: { value: new T.Matrix4() }, radius: { value: 80 }, res: { value: new T.Vector2() } });
      this.aoBlur = sh(AOBLUR_FS, { tDiffuse: { value: null }, dir: { value: new T.Vector2() } });
      this.comp = sh(COMP_FS, { tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, strength: { value: 1.0 },
        tAO: { value: null }, aoK: { value: 0 }, tSoft: { value: null }, tilt: { value: 0 },
        exposure: { value: 0.95 }, flash: { value: 0 }, flashColor: { value: new T.Color(0.9, 0.05, 0.05) } });
      this.bloom = true; this.aoOn = true; this.aoRadius = 80; this.tiltK = 0;
      this.white = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1); this.white.needsUpdate = true;
    }
    setSize(w, h) {
      const mk = (a, b, ms) => new T.WebGLRenderTarget(Math.max(1, a), Math.max(1, b), { type: T.HalfFloatType, samples: ms || 0 });
      [this.rt, this.h1, this.h2, this.q1, this.q2, this.a1, this.a2, this.s1, this.s2].forEach(r => r && r.dispose());
      this.rt = mk(w, h, 4);
      this.rt.depthTexture = new T.DepthTexture(w, h); this.rt.depthTexture.type = T.UnsignedIntType;
      this.a1 = mk(w >> 1, h >> 1); this.a2 = mk(w >> 1, h >> 1);
      this.s1 = mk(w >> 1, h >> 1); this.s2 = mk(w >> 1, h >> 1);
      this.h1 = mk(w >> 1, h >> 1); this.h2 = mk(w >> 1, h >> 1);
      this.q1 = mk(w >> 2, h >> 2); this.q2 = mk(w >> 2, h >> 2);
    }
    pass(m, target) { this.quad.material = m; this.gl.setRenderTarget(target); this.gl.render(this.scene, this.cam); }
    blurInto(src, a, b) {
      const u = this.blur.uniforms;
      u.tDiffuse.value = src.texture; u.dir.value.set(1 / a.width, 0); this.pass(this.blur, b);
      u.tDiffuse.value = b.texture; u.dir.value.set(0, 1 / a.height); this.pass(this.blur, a);
    }
    render(scene, camera) {
      const gl = this.gl;
      gl.setRenderTarget(this.rt); gl.render(scene, camera);
      const u = this.comp.uniforms;
      if (this.aoOn) {
        const a = this.ao.uniforms;
        a.tDepth.value = this.rt.depthTexture; a.proj.value.copy(camera.projectionMatrix); a.projInv.value.copy(camera.projectionMatrixInverse);
        a.radius.value = this.aoRadius; a.res.value.set(this.a1.width, this.a1.height);
        this.pass(this.ao, this.a1);
        const b = this.aoBlur.uniforms;
        b.tDiffuse.value = this.a1.texture; b.dir.value.set(1 / this.a1.width, 0); this.pass(this.aoBlur, this.a2);
        b.tDiffuse.value = this.a2.texture; b.dir.value.set(0, 1 / this.a1.height); this.pass(this.aoBlur, this.a1);
        u.tAO.value = this.a1.texture; u.aoK.value = 0.85;
      } else { u.tAO.value = this.white; u.aoK.value = 0; }
      if (this.tiltK > 0.01) {
        const bl = this.blur.uniforms;
        bl.tDiffuse.value = this.rt.texture; bl.dir.value.set(1.6 / this.s1.width, 0); this.pass(this.blur, this.s2);
        bl.tDiffuse.value = this.s2.texture; bl.dir.value.set(0, 1.6 / this.s1.height); this.pass(this.blur, this.s1);
        u.tSoft.value = this.s1.texture; u.tilt.value = this.tiltK;
      } else { u.tSoft.value = this.rt.texture; u.tilt.value = 0; }
      if (this.bloom) {
        this.bright.uniforms.tDiffuse.value = this.rt.texture; this.pass(this.bright, this.h1);
        this.blurInto(this.h1, this.h1, this.h2);
        this.blurInto(this.h1, this.q1, this.q2);
        this.blurInto(this.q1, this.q1, this.q2);
      }
      u.tScene.value = this.rt.texture; u.tB1.value = this.h1.texture; u.tB2.value = this.q1.texture;
      u.strength.value = this.bloom ? 0.75 : 0.0;
      this.pass(this.comp, null);
    }
  }

  // ---------------------------------------------------------------- the renderer
  let shared = null;   // one WebGL context for the page; scenes are rebuilt per game

  class Renderer3D {
    static supported() {
      try { const c = document.createElement('canvas'); return !!(window.WebGL2RenderingContext && c.getContext('webgl2')); } catch (e) { return false; }
    }

    constructor(canvas, game) {
      this.canvas = canvas;
      this.game = game;
      if (!shared || shared.canvas !== canvas) {
        const gl = new T.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
        gl.useLegacyLights = true;
        gl.shadowMap.enabled = true;
        gl.shadowMap.type = T.PCFSoftShadowMap;
        gl.toneMapping = T.NoToneMapping;
        shared = { canvas, gl, post: new Post(gl) };
      }
      this.gl = shared.gl; this.post = shared.post;
      this.cam = { x: 0, y: 0, zoom: 0.12, yaw: 0, tilt: 0 };
      this.view = { x: 0, y: 0, zoom: 0.12, yaw: 0, tilt: 0 };      // smoothed camera actually rendered
      this.camera = new T.PerspectiveCamera(42, 1, 20, 90000);
      this.raycaster = new T.Raycaster();
      this.ground = new T.Plane(new T.Vector3(0, 1, 0), -FELT_H);   // clicks land on the felt surface
      this.shake = 0; this.flash = 0; this.cine = null;
      this.towerObjs = new Map(); this.creepObjs = new Map(); this.shotObjs = new Map(); this.fxObjs = new Map();
      this.particles = []; this.dying = []; this.frame = 0; this.slowFrames = 0; this.floaters = []; this.textCache = new Map();
      this.quality = (PTD.Renderer3D.quality || 'high');
      this.groundH = this.quality === 'high' ? 10 : 0;   // looters walk on top of the 3D cobbles
      this.buildScene();
      this.resize();
    }

    // ------------------------------------------------ scene
    buildScene() {
      const g = this.game, map = g.map;
      const S = this.scene = new T.Scene();
      S.background = new T.Color(0xcfe8ff);   // the sky dome (scenery3d) covers this
      S.fog = new T.Fog(0xa9d4ff, 9000, 30000);
      S.environment = buildEnvironment(this.gl);

      // light: sunny key light with shadows + sky/ground fill
      S.add(new T.HemisphereLight(0xcfe6ff, 0xa58fd0, 1.05));
      const key = this.key = new T.DirectionalLight(0xffefd2, 1.4);
      key.castShadow = this.quality === 'high';
      key.shadow.mapSize.set(this.quality === 'high' ? 4096 : 1024, this.quality === 'high' ? 4096 : 1024);
      key.shadow.bias = -0.0004; key.shadow.normalBias = 4;
      const sc = key.shadow.camera; sc.near = 100; sc.far = 9000;
      S.add(key); S.add(key.target);

      // the table: board texture on felt and a mahogany rim; it floats in the sky (scenery3d adds the edge and clouds)
      const size = map.size * map.cell;
      const bc = PTD.Art.boardCanvas(map, g.players, 6);
      if (PTD.Scenery3D) PTD.Scenery3D.decorateBoard(bc.canvas.getContext('2d'), bc.px, map, 6);
      const board = this.boardTex = canvasTex(bc.canvas);
      const top = new T.Mesh(new T.PlaneGeometry(size, size), new T.MeshToonMaterial({ map: board, color: '#d8f0d8', gradientMap: toonRamp() }));
      top.rotation.x = -Math.PI / 2; top.receiveShadow = true;
      S.add(top);
      const wood = mat('lacquer', () => new T.MeshToonMaterial({ color: '#c97a3e', map: woodTexture(), gradientMap: toonRamp() }));
      const half = size / 2, rimW = 420, rimH = 160;
      [[0, half + rimW / 2, size + rimW * 2, rimW], [0, -half - rimW / 2, size + rimW * 2, rimW], [half + rimW / 2, 0, rimW, size], [-half - rimW / 2, 0, rimW, size]].forEach(([x, y, w, d]) => {
        const m = new T.Mesh(new T.BoxGeometry(w, rimH + 900, d), wood);
        m.position.copy(W2T(x, y, rimH / 2 - 450)); m.receiveShadow = true; S.add(m);
      });

      this.buildFelt(board);
      this.buildWalls();
      this.buildVault();
      this.buildPortals();
      this.buildDust();
      this.scenery = PTD.Scenery3D ? PTD.Scenery3D.build(this) : null;
      if (PTD.Looters3D && !PTD.Looters3D.loading) { PTD.Looters3D.loading = true; PTD.Looters3D.loadModels(); }

      // hover / placement helpers
      this.ghost = new T.Mesh(new T.BoxGeometry(124, 8, 124), new T.MeshBasicMaterial({ color: 0x66ff99, transparent: true, opacity: 0.35, depthWrite: false }));
      this.ghost.visible = false; S.add(this.ghost);
      this.rangeRing = new T.Mesh(new T.RingGeometry(0.975, 1, 96), new T.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.8, depthWrite: false, side: T.DoubleSide }));
      this.rangeRing.rotation.x = -Math.PI / 2; this.rangeRing.visible = false; S.add(this.rangeRing);
      this.rangeFill = new T.Mesh(new T.CircleGeometry(1, 64), new T.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.07, depthWrite: false }));
      this.rangeFill.rotation.x = -Math.PI / 2; this.rangeFill.visible = false; S.add(this.rangeFill);
    }

    // Merge grid cells of one class into rectangles (row runs extended upward).
    rectsOf(cls) {
      const map = this.game.map, N = map.size;
      const rects = [], open = new Map();
      for (let y = 0; y < N; y++) {
        const next = new Map();
        let x = 0;
        while (x < N) {
          if (map.grid[y * N + x] !== cls) { x++; continue; }
          let e = x; while (e < N && map.grid[y * N + e] === cls) e++;
          const k = x + ',' + e, r = open.get(k);
          if (r) { r.y1 = y + 1; next.set(k, r); } else { const nr = { x0: x, x1: e, y0: y, y1: y + 1 }; rects.push(nr); next.set(k, nr); }
          x = e;
        }
        open.clear(); for (const [k, v] of next) open.set(k, v);
      }
      return rects;
    }

    // The felt you build on is a raised plateau; its top samples the board texture by
    // world position so the pattern lines up with the lanes below.
    buildFelt(boardTex) {
      const map = this.game.map, cell = map.cell, size = map.size * cell, org = map.origin;
      const rects = this.rectsOf(0);
      const m = new T.MeshToonMaterial({ map: boardTex, color: '#d8f0d8', gradientMap: toonRamp() });
      m.onBeforeCompile = (sh) => {
        sh.vertexShader = 'varying float vSide;\n' + sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
          { vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
            vMapUv = vec2((wp.x - (${org.toFixed(1)})) / ${size.toFixed(1)}, (-wp.z - (${org.toFixed(1)})) / ${size.toFixed(1)});
            vSide = 1.0 - step(0.5, abs(normal.y)); }`);
        // the plateau's sides are plain dark felt rather than a stretched copy of the edge pixels
        sh.fragmentShader = 'varying float vSide;\n' + sh.fragmentShader.replace('#include <map_fragment>',
          '#include <map_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.42, 0.2), vSide);');
      };
      const mesh = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), m, rects.length);
      const d = new T.Object3D();
      rects.forEach((r, i) => {
        const w = (r.x1 - r.x0) * cell, h = (r.y1 - r.y0) * cell;
        d.position.copy(W2T(org + r.x0 * cell + w / 2, org + r.y0 * cell + h / 2, FELT_H / 2));
        d.scale.set(w, FELT_H, h); d.updateMatrix(); mesh.setMatrixAt(i, d.matrix);
      });
      mesh.castShadow = mesh.receiveShadow = true;
      this.scene.add(mesh);
    }

    // Walls (unwalkable cells) become raised mahogany blocks, merged into row runs.
    buildWalls() {
      const map = this.game.map, N = map.size, cell = map.cell;
      const rects = [];
      const open = new Map();   // key "x0,x1" -> rect being extended upward
      for (let y = 0; y < N; y++) {
        const runs = [];
        let x = 0;
        while (x < N) {
          if (map.grid[y * N + x] !== 2) { x++; continue; }
          let e = x; while (e < N && map.grid[y * N + e] === 2) e++;
          runs.push([x, e]); x = e;
        }
        const next = new Map();
        for (const [a, b] of runs) {
          const k = a + ',' + b;
          const r = open.get(k);
          if (r) { r.y1 = y + 1; next.set(k, r); open.delete(k); }
          else { const nr = { x0: a, x1: b, y0: y, y1: y + 1 }; rects.push(nr); next.set(k, nr); }
        }
        open.clear(); for (const [k, v] of next) open.set(k, v);
      }
      const keep = rects.filter(r => {
        const cx = map.origin + (r.x0 + r.x1) / 2 * cell, cy = map.origin + (r.y0 + r.y1) / 2 * cell;
        const edge = r.x0 === 0 || r.y0 === 0 || r.x1 === N || r.y1 === N;
        return !(Math.abs(cx) < 700 && Math.abs(cy) < 700) && !(edge && (r.x1 - r.x0 > 300 || r.y1 - r.y0 > 300));
      });
      const H = 130;
      // polished mahogany sides, a gold trim band, and a plump tufted-velvet cushion on top
      const lacquer = mat('lacquerWall', () => new T.MeshToonMaterial({ color: '#b0502c', map: woodTexture(), gradientMap: toonRamp() }));
      const velvet = mat('velvetTop', () => {
        const m = new T.MeshStandardMaterial({ map: velvetTexture(), color: '#dcc4c8', roughness: 0.85, envMapIntensity: 0.4 });
        m.onBeforeCompile = (sh) => {
          sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
            { vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0); vMapUv = vec2(wp.x, -wp.z) / 340.0; }`);
        };
        return m;
      });
      const goldTrim = std('#f0b92a', { metalness: 0.9, roughness: 0.22, emissive: new T.Color('#3a2400') });
      const body = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), lacquer, keep.length);
      const trim = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), goldTrim, keep.length);
      const cap = new T.InstancedMesh(geo('pillow', () => {
        // unit cushion: a rounded-square slab with a domed top (puffed in the middle, tucked at the edges)
        const g = new T.BoxGeometry(1, 1, 1, 16, 2, 16), p = g.attributes.position;
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
          const ex = Math.abs(x) * 2, ez = Math.abs(z) * 2, edge = Math.max(ex, ez);
          const puff = Math.cos(Math.min(1, ex) * Math.PI / 2) * Math.cos(Math.min(1, ez) * Math.PI / 2);
          const tuck = 1 - 0.1 * Math.pow(edge, 6);
          p.setXYZ(i, x * tuck, y > 0 ? y + puff * 0.9 : y, z * tuck);
        }
        g.computeVertexNormals();
        return g;
      }), velvet, keep.length);
      const d = new T.Object3D();
      keep.forEach((r, i) => {
        const w = (r.x1 - r.x0) * cell, h = (r.y1 - r.y0) * cell;
        const cx = map.origin + r.x0 * cell + w / 2, cy = map.origin + r.y0 * cell + h / 2;
        d.position.copy(W2T(cx, cy, H / 2)); d.scale.set(w, H, h); d.updateMatrix(); body.setMatrixAt(i, d.matrix);
        d.position.y = H + 6; d.scale.set(w + 14, 14, h + 14); d.updateMatrix(); trim.setMatrixAt(i, d.matrix);
        d.position.y = H + 22; d.scale.set(Math.max(10, w - 10), 20, Math.max(10, h - 10)); d.updateMatrix(); cap.setMatrixAt(i, d.matrix);
      });
      body.castShadow = body.receiveShadow = true; cap.receiveShadow = true; trim.castShadow = true;
      this.scene.add(body); this.scene.add(trim); this.scene.add(cap);
    }

    buildVault() {
      const S = this.scene, grp = this.vault = new T.Group();
      const gold = std('#d4a62a', { metalness: 0.9, roughness: 0.25, emissive: new T.Color('#3a2600') });
      const base = new T.Mesh(new T.CylinderGeometry(470, 520, 120, 48), std('#2b2118', { metalness: 0.4, roughness: 0.4 }));
      base.position.y = 60; base.castShadow = base.receiveShadow = true; grp.add(base);
      const door = new T.Mesh(new T.CylinderGeometry(400, 420, 90, 48), gold);
      door.position.y = 165; door.castShadow = true; grp.add(door);
      const dial = this.vaultDial = new T.Group(); dial.position.y = 215; grp.add(dial);
      const ring = new T.Mesh(new T.TorusGeometry(260, 22, 16, 64), gold); ring.rotation.x = Math.PI / 2; dial.add(ring);
      for (let k = 0; k < 8; k++) {
        const spoke = new T.Mesh(new T.CylinderGeometry(14, 14, 520, 10), gold);
        spoke.rotation.z = Math.PI / 2; spoke.rotation.y = k * Math.PI / 4; dial.add(spoke);
      }
      const hub = new T.Mesh(new T.SphereGeometry(70, 24, 16), glowMat('#ffd34d', 2.2)); hub.position.y = 10; dial.add(hub);
      // coin piles around the vault
      const coinGeo = geo('coin', () => new T.CylinderGeometry(26, 26, 7, 20));
      const coins = new T.InstancedMesh(coinGeo, gold, 160);
      const dd = new T.Object3D();
      for (let i = 0; i < 160; i++) {
        const a = Math.random() * TAU, r = 520 + Math.random() * 140;
        dd.position.set(Math.cos(a) * r, 4 + Math.random() * 30, Math.sin(a) * r);
        dd.rotation.set(Math.random() * 0.6, Math.random() * TAU, Math.random() * 0.6); dd.updateMatrix(); coins.setMatrixAt(i, dd.matrix);
      }
      coins.castShadow = true; grp.add(coins);
      const light = new T.PointLight(0xffc85a, 1.4, 2600, 0); light.position.y = 500; grp.add(light);
      S.add(grp);
    }

    buildPortals() {
      this.portals = [];
      for (const p of this.game.players) {
        const s = p.lane.path[0];
        const grp = new T.Group(); grp.position.copy(W2T(s.x, s.y, 0));
        const col = new T.Color(p.color);
        const ring = new T.Mesh(new T.TorusGeometry(110, 14, 12, 48), glowMat(p.color, 3));
        ring.position.y = 150; grp.add(ring);
        const inner = new T.Mesh(new T.CircleGeometry(100, 40), new T.MeshBasicMaterial({ color: col.clone().multiplyScalar(0.6), transparent: true, opacity: 0.55, side: T.DoubleSide, depthWrite: false, blending: T.AdditiveBlending }));
        inner.position.y = 150; grp.add(inner);
        const pad = new T.Mesh(new T.CylinderGeometry(150, 170, 16, 32), std('#1a1a22', { metalness: 0.6, roughness: 0.3 }));
        pad.position.y = 8; pad.receiveShadow = true; grp.add(pad);
        const light = new T.PointLight(col, 0.9, 1400, 0); light.position.y = 200; grp.add(light);
        this.scene.add(grp);
        this.portals.push({ grp, ring, inner });
      }
    }

    buildDust() {
      const n = 900, pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 13000; pos[i * 3 + 1] = Math.random() * 3000; pos[i * 3 + 2] = (Math.random() - 0.5) * 13000; }
      const geom = new T.BufferGeometry(); geom.setAttribute('position', new T.BufferAttribute(pos, 3));
      const m = new T.PointsMaterial({ map: glowTexture(), color: 0xffd9a0, size: 26, transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending });
      this.dust = new T.Points(geom, m);
      this.scene.add(this.dust);
    }

    // ------------------------------------------------ towers
    makeTower(t) {
      const grp = new T.Group();
      grp.position.copy(W2T(t.x, t.y, FELT_H));
      const owner = this.game.players[t.owner];
      const m = PTD.Towers3D.build(t, owner.color);
      grp.add(m.root);
      if (t.kind === 'combo' && this.frame > 30) this.pillar(t.x, t.y, PTD.COMBOS[t.type].color);   // a hand just got combined
      // gold ring under a selected hand card
      const sel = new T.Mesh(geo('selRing', () => new T.TorusGeometry(70, 6, 8, 48)), glowMat('#ffd640', 2.6));
      sel.rotation.x = Math.PI / 2; sel.position.y = 4; sel.visible = false; grp.add(sel);
      const o = { grp, born: performance.now(), kind: t.kind, head: m.head, banner: m.banner, anim: m.anim, sel, height: m.height,
        bannerY: m.banner.position.y, yaw: (t.id * 1.3) % TAU, fireT: -1 };
      if (t.kind === 'combo') {
        const tag = new T.Sprite(new T.SpriteMaterial({ map: textTexture(PTD.comboTitle(t.type, t.rank), '#ffffff', 40), transparent: true, depthWrite: false, depthTest: false }));
        tag.scale.set(46 * tag.material.map.userData.aspect, 46, 1); tag.position.y = m.height + 40; tag.visible = false; tag.renderOrder = 9;
        grp.add(tag); o.tag = tag;
      }
      this.scene.add(grp);
      return o;
    }

    syncTowers(ui, now, dt) {
      const g = this.game, seen = new Set(), me = g.human;
      const focus = ui.inspect && ui.inspect.alive ? ui.inspect : ui.hoverTower;
      const aimNow = this.frame % 5 === 0;
      const camYaw = Math.atan2(this.camera.position.x - this.view.x, this.camera.position.z + this.view.y);
      const time = now / 1000;
      for (const t of g.towers) {
        if (!t.alive) continue;
        seen.add(t.id);
        let o = this.towerObjs.get(t.id);
        if (!o) { o = this.makeTower(t); this.towerObjs.set(t.id, o); }
        const age = (now - o.born) / 1000;
        const pop = age < 0.7 ? 1 - Math.pow(1 - age / 0.7, 3) * Math.cos(age * 13) * 0.55 : 1;
        o.grp.scale.setScalar(Math.max(0.05, pop));
        // the floating card always turns to face you; selected cards lift and glow
        const lift = t.selected ? 34 : 0;
        o.banner.position.y += ((o.bannerY + lift + Math.sin(time * 1.6 + t.id) * 5) - o.banner.position.y) * Math.min(1, dt * 10);
        o.banner.rotation.y = camYaw + Math.sin(time * 0.9 + t.id) * 0.18;
        o.sel.visible = !!t.selected;
        if (o.sel.visible) o.sel.rotation.z += dt * 2;
        const firing = (t.flash > 0) || (now - o.fireT < 160);
        if (o.head) {
          if (aimNow) o.target = this.nearestCreep(t);
          if (o.target && o.target.alive) o.yawWant = Math.atan2(o.target.x - t.x, -(o.target.y - t.y));
          else o.yawWant = (o.yawWant || o.yaw) + dt * 0.25;
          const d = (o.yawWant - o.yaw + Math.PI * 3) % TAU - Math.PI;
          o.yaw += d * Math.min(1, dt * 8);
          o.head.rotation.y = o.yaw;
          o.head.position.z = firing ? -5 : o.head.position.z * 0.8;   // recoil
        }
        const stunned = t.stunT > 0;
        if (stunned && !o.dizzy) o.dizzy = this.makeDizzy(o);
        if (o.dizzy) {
          o.dizzy.visible = stunned;
          if (stunned) {
            o.dizzy.rotation.y += dt * 4;
            o.dizzy.position.y = o.height * 1.02 + Math.sin(time * 6) * 6;
            o.grp.rotation.z = Math.sin(time * 9 + t.id) * 0.05;   // wobbling, knocked silly
          } else o.grp.rotation.z = 0;
        }
        o.anim(time, dt, firing && !stunned);
        if (firing) o.kick = 1;
        o.kick = Math.max(0, (o.kick || 0) - dt * 5);
        const sq = 1 - Math.sin(o.kick * Math.PI) * 0.1, idle = 1 + Math.sin(time * 2.2 + t.id) * 0.012;
        o.grp.scale.set(o.grp.scale.x / Math.sqrt(sq), o.grp.scale.y * sq * idle, o.grp.scale.z / Math.sqrt(sq));
        if (o.tag) o.tag.visible = focus === t;
      }
      for (const [id, o] of this.towerObjs) {
        if (seen.has(id)) continue;
        this.burst(o.grp.position.clone().setY(FELT_H + 80), '#ffb070', 18, 320);
        this.scene.remove(o.grp);
        o.grp.traverse(n => { if (n.isMesh && n.userData.ownGeo) n.geometry.dispose(); });
        this.towerObjs.delete(id);
      }
    }

    // A ring of spinning cartoon stars over a paralyzed tower.
    makeDizzy(o) {
      const g = new T.Group();
      const tex = textTexture('\u2605', '#ffe066', 64);
      const m = mat('dizzyStar', () => new T.SpriteMaterial({ map: tex, depthWrite: false }));
      for (let i = 0; i < 4; i++) {
        const s = new T.Sprite(m); const a = i / 4 * TAU;
        s.position.set(Math.cos(a) * 85, (i % 2) * 16, Math.sin(a) * 85); s.scale.set(72, 72, 1);
        g.add(s);
      }
      g.visible = false; o.grp.add(g);
      return g;
    }

    nearestCreep(t) {
      const r2 = t.stats.range * t.stats.range;
      let best = null, bd = r2;
      for (const c of this.game.creeps) {
        if (!c.alive) continue;
        const dx = c.x - t.x, dy = c.y - t.y, d2 = dx * dx + dy * dy;
        if (d2 < bd) { bd = d2; best = c; }
      }
      return best;
    }

    // ------------------------------------------------ looters
    makeLooter(c) {
      const R = c.radius;
      const root = new T.Group();
      const ch = PTD.Looters3D.build(c.def, c.variant || 0);
      const S = R * 2.5 * (c.variant === 3 ? 1.3 : 1);   // crew leaders walk in a size bigger
      const holder = new T.Group(); holder.scale.setScalar(S); holder.add(ch.rig); root.add(holder);
      this.addHealthBar(root, S * 2.4, c.variant === 3 ? 130 : 100, false);
      root.userData = { rig: holder, anim: ch.anim, flash: ch.flash, detail: ch.detail, lastHp: c.hp, hitT: 0, owner: c.owner, leader: c.variant === 3 };
      this.scene.add(root);
      return root;
    }

    makeBoss(c) {
      const b = PTD.BOSSES[c.bossIdx] || PTD.BOSSES[0];
      const R = c.radius;
      const root = new T.Group();
      const holder = new T.Group(); holder.scale.setScalar(R * 2.0); root.add(holder);   // about 2.5x a looter's height
      const m = PTD.Looters3D.buildBoss(b);
      holder.add(m.rig);
      if (m.stage) holder.add(m.stage);   // intro props (arm-wrestling table and challenger)
      const aura = new T.Mesh(geo('aura', () => new T.RingGeometry(1.2, 1.6, 48)), new T.MeshBasicMaterial({ color: new T.Color('#ffcf40').multiplyScalar(0.8), transparent: true, opacity: 0.35, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
      aura.rotation.x = -Math.PI / 2; aura.position.y = 0.03; holder.add(aura);
      this.addHealthBar(root, R * 8.4, 340, true);
      root.userData = { rig: holder, flash: m.flash, headG: m.head, face: m.face, faceMat: m.faceMat, boss: b, aura, lastHp: c.hp, hitT: 0, faceReady: false, anim: m.anim, palms: m.palms, owner: c.owner, bobble: m.bobble };
      this.scene.add(root);
      return root;
    }

    applyBossFace(ud) {
      if (ud.faceReady) return;
      const im = PTD.Art.bossFace(ud.boss);
      if (im && ud.bobble) {
        const k = 'bobble' + ud.boss.name;
        if (!cache.tex[k]) cache.tex[k] = canvasTex(PTD.Looters3D.faceComposite(im));
        ud.faceMat.map = ud.faceMat.emissiveMap = cache.tex[k]; ud.faceMat.needsUpdate = true; ud.faceReady = true;
      } else if (im) {
        const t = new T.Texture(im); t.colorSpace = T.SRGBColorSpace; t.needsUpdate = true;
        ud.faceMat.map = t; ud.faceMat.needsUpdate = true; ud.faceReady = true;
      } else if (!ud.boss.image && !ud.drawn) {
        const c = document.createElement('canvas'); c.width = c.height = 128;
        const x = c.getContext('2d'); x.fillStyle = '#f0c8a0'; x.fillRect(0, 0, 128, 128);
        x.fillStyle = '#111'; PTD.Art.rr(x, 22, 46, 36, 18, 6); x.fill(); PTD.Art.rr(x, 70, 46, 36, 18, 6); x.fill();
        x.strokeStyle = '#7a2a1a'; x.lineWidth = 6; x.beginPath(); x.arc(64, 78, 22, 0.3, Math.PI - 0.3); x.stroke();
        ud.faceMat.map = canvasTex(c); ud.faceMat.needsUpdate = true; ud.drawn = true; ud.faceReady = true;
      }
    }

    // Framed bar with a pale "recent damage" segment that drains after the fill.
    addHealthBar(root, y, w, always) {
      const hBar = w > 100 ? 18 : 11;
      const grp = new T.Group(); grp.position.y = y; root.add(grp);
      const frame = new T.Sprite(mat('hpFrame', () => new T.SpriteMaterial({ color: 0xfff1c9, depthWrite: false })));
      frame.scale.set(w + 12, hBar + 10, 1); grp.add(frame);
      const bg = new T.Sprite(mat('hpBg', () => new T.SpriteMaterial({ color: 0x1a1016, depthWrite: false })));
      bg.scale.set(w + 4, hBar + 3, 1); bg.position.z = 0.05; grp.add(bg);
      const trail = new T.Sprite(mat('hpTrail', () => new T.SpriteMaterial({ color: 0xffe9a8, depthWrite: false })));
      trail.center.set(0, 0.5); trail.scale.set(w, hBar, 1); trail.position.set(-w / 2, 0, 0.08); grp.add(trail);
      const fill = new T.Sprite(new T.SpriteMaterial({ color: 0x46d17a, depthWrite: false }));
      fill.center.set(0, 0.5); fill.scale.set(w, hBar, 1); fill.position.set(-w / 2, 0, 0.1); grp.add(fill);
      grp.visible = !!always;
      root.userData_hp = { grp, fill, trail, w, trailF: 1, always: !!always };
    }

    syncCreeps(now, dt) {
      const g = this.game, seen = new Set(), t = now / 1000;
      for (const c of g.creeps) {
        if (!c.alive) continue;
        seen.add(c.id);
        let o = this.creepObjs.get(c.id);
        if (!o) { o = c.boss ? this.makeBoss(c) : this.makeLooter(c); this.creepObjs.set(c.id, o); o.position.copy(W2T(c.x, c.y, this.groundH)); }
        const ud = o.userData;
        const tgt = W2T(c.x, c.y, this.groundH);
        o.position.lerp(tgt, Math.min(1, dt * 20));
        // Boss entrance: drop in from the sky spinning, bounce on landing with a shockwave.
        if (c.boss && ud.enterT == null) ud.enterT = 0;
        if (c.boss && ud.enterT < 1.3) {
          ud.enterT += dt;
          const k = Math.min(1, ud.enterT / 1.3);
          const bounce = (u) => { const n = 7.5625, d = 2.75; if (u < 1 / d) return n * u * u; if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75; if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375; return n * (u -= 2.625 / d) * u + 0.984375; };
          o.position.y = (1 - bounce(k)) * 1600;
          o.rotation.y = (1 - k) * Math.PI * 4;
          const sc = 0.55 + 0.45 * k; o.scale.set(sc, sc, sc);
          if (!ud.landed && k > 0.37) {   // first touchdown of the bounce
            ud.landed = true;
            this.shake = Math.max(this.shake, 150);
            if (this.mine(c)) sound('land');
            this.game.fx.push({ kind: 'ring', x: c.x, y: c.y, t: 0, life: 0.9, color: '#ffcf40', r: 750 });
            this.burst(W2T(c.x, c.y, 40), '#ffcf40', 34, 560, 0.8);
            this.burst(W2T(c.x, c.y, 20), '#d9c3a0', 20, 300, 0.9);
          }
          if (k >= 1) { o.position.y = 0; o.rotation.y = 0; o.scale.set(1, 1, 1); }
        }
        const want = Math.atan2(Math.cos(c.dir), -Math.sin(c.dir));   // face the walking direction
        let d = (want - ud.rig.rotation.y + Math.PI * 3) % TAU - Math.PI;
        ud.rig.rotation.y += d * Math.min(1, dt * 10);
        const moving = !(c.wait > 0) && !(c.stunT > 0) && !(c.fallT > 0);
        if (c.hp < ud.lastHp - 0.5) {
          ud.hitT = 0.12;
          const hitY = c.boss ? c.radius * 3.5 : c.radius * 2.2;
          if (now - (ud.sparkT || 0) > 90 && this.view.zoom > 0.07) { ud.sparkT = now; this.burst(o.position.clone().setY(hitY), '#fff3c4', 3, 240, 0.16); }
          // damage numbers on your own lane, added up so fast towers don't spam
          const me = g.human;
          if (me && c.owner === me.id) { ud.dmgAcc = (ud.dmgAcc || 0) + (ud.lastHp - c.hp); sound('hit'); }
        }
        ud.lastHp = c.hp;
        ud.dmgT = (ud.dmgT || 0) - dt;
        if (ud.dmgAcc >= 1 && ud.dmgT <= 0 && this.view.zoom > 0.07) {
          ud.dmgT = 0.32;
          this.floater(o.position.clone().setY((c.boss ? c.radius * 9 : c.radius * 6) + Math.random() * 30), fmtDmg(ud.dmgAcc), c.boss ? '#ffd34d' : '#ffffff', c.boss ? 64 : 46);
          ud.dmgAcc = 0;
        }
        ud.hitT = Math.max(0, ud.hitT - dt);
        let intro = null;
        if (c.boss && c.wait > 0) {
          ud.introT = (ud.introT || 0) + dt; intro = ud.introT;
          const aw = ud.boss && ud.boss.introMove === 'armwrestle';   // arm-wrestle slam lands later than the ground-pound
          if (!ud.slammed && intro >= (aw ? 3.15 : 2.25)) {   // ground-pound shockwave
            ud.slammed = true; this.shake = Math.max(this.shake, 170);
            if (this.mine(c)) sound('slam');
            this.game.fx.push({ kind: 'ring', x: c.x, y: c.y, t: 0, life: 0.8, color: '#ffffff', r: 900 });
            this.burst(W2T(c.x, c.y, 30), '#d9c3a0', 26, 420, 0.8);
          }
          if (!ud.flexed && intro >= (aw ? 3.3 : 2.4)) { ud.flexed = true; this.burst(o.position.clone().setY(c.radius * 5), '#ffe066', 22, 300, 0.9); }
        }
        let fall = null;
        if (c.fallT > 0) {
          fall = 1 - c.fallT / PTD.RULES.fallTime;
          if (!ud.thudded && fall >= 0.22) {   // face-plant: screen shake and a puff of dust
            ud.thudded = true; this.shake = Math.max(this.shake, 90);
            if (this.mine(c)) sound('thud');
            this.burst(W2T(c.x, c.y, 30), '#d9c3a0', 18, 300, 0.7);
          }
        } else ud.thudded = false;
        let slime = null;
        if (ud.boss && ud.boss.slime && !(c.wait > 0)) {   // cosmetic: every 8 s he blasts white slime from both palms
          ud.slimeT = (ud.slimeT == null ? 8 : ud.slimeT) - dt;
          if (ud.slimeT <= 0) { ud.slimeT += 8; ud.slimeFor = 1.3; if (this.mine(c)) sound('splat'); }
          if (ud.slimeFor > 0) {
            ud.slimeFor -= dt; slime = 1 - ud.slimeFor / 1.3;
            if (slime > 0.12) this.slimeSpray(ud, ud.rig.rotation.y);
          }
        }
        ud.anim(t + c.phaseOff, moving, dt, { speed: c.slowF || 1, hit: ud.hitT / 0.12, stun: c.stunT > 0, slow: c.slowF < 1, intro, fall, slime });
        // little dust puffs at their feet, and the odd gold glint from the loot
        ud.fxT = (ud.fxT || Math.random() * 0.4) - dt;
        if (moving && ud.fxT <= 0 && this.particles.length < 700 && this.view.zoom > 0.08) {
          ud.fxT = 0.28 + Math.random() * 0.2;
          const puff = this.glowSprite('#b8a48a', 30 + Math.random() * 20, 0.35);
          puff.material.blending = T.NormalBlending;
          puff.position.set(o.position.x + (Math.random() - 0.5) * 30, 12, o.position.z + (Math.random() - 0.5) * 30);
          this.scene.add(puff);
          this.particles.push({ obj: puff, t: 0, life: 0.6, fade: true, v: new T.Vector3((Math.random() - 0.5) * 40, 40, (Math.random() - 0.5) * 40), grav: 0, shrink: false });
          if (Math.random() < 0.3) {
            const gl = this.glowSprite('#ffe27a', 26, 1);
            gl.position.set(o.position.x, c.radius * 2.4, o.position.z);
            this.scene.add(gl);
            this.particles.push({ obj: gl, t: 0, life: 0.35, fade: true, shrink: true, base: 26 });
          }
        }
        const fr = ud.hitT > 0 ? 0.9 : c.slowF < 1 ? 0.05 : 0, fg = ud.hitT > 0 ? 0.9 : c.slowF < 1 ? 0.18 : 0, fb = ud.hitT > 0 ? 0.9 : c.slowF < 1 ? 0.45 : 0;
        for (const m of ud.flash) m.emissive.setRGB(fr, fg, fb);
        if (ud.detail) { const show = this.view.zoom > 0.085; if (ud.detailOn !== show) { ud.detailOn = show; for (const d of ud.detail) d.visible = show; } }
        if (ud.headG) {
          this.applyBossFace(ud);
          const camYaw = Math.atan2(this.camera.position.x - o.position.x, this.camera.position.z - o.position.z);
          ud.headG.rotation.y = camYaw - ud.rig.rotation.y;
          // bobblehead spring: the walk rhythm and every hit set the big head wobbling
          const bb = ud.bob || (ud.bob = { a: 0, v: 0, b: 0, w: 0 });
          const walking = !(c.wait > 0) && !(c.stunT > 0) && !(c.fallT > 0);
          const h = Math.min(dt, 0.05);
          bb.v += (-bb.a * 140 - bb.v * 6 + (walking ? Math.sin(t * 11) * 3.2 : 0) + (ud.hitT > 0.1 ? (Math.random() - 0.5) * 90 : 0)) * h; bb.a += bb.v * h;
          bb.w += (-bb.b * 120 - bb.w * 6 + (walking ? Math.cos(t * 5.5) * 2.2 : 0)) * h; bb.b += bb.w * h;
          ud.headG.rotation.z = Math.max(-0.35, Math.min(0.35, bb.a));
          ud.headG.rotation.x = Math.max(-0.25, Math.min(0.25, bb.b));
          ud.aura.rotation.z += dt;
          ud.aura.material.opacity = 0.35 + 0.25 * Math.sin(t * 4);
        }
        const hp = o.userData_hp, f = Math.max(0, c.hp / c.maxHp);
        hp.grp.visible = hp.always || f < 0.999;
        hp.fill.scale.x = Math.max(0.001, hp.w * f);
        hp.trailF = f >= hp.trailF ? f : Math.max(f, hp.trailF - dt * (0.25 + (hp.trailF - f) * 2));
        hp.trail.scale.x = Math.max(0.001, hp.w * hp.trailF);
        hp.fill.material.color.set(f > 0.5 ? '#46d17a' : f > 0.25 ? '#f2c12e' : '#ef4b4b');
      }
      for (const [id, o] of this.creepObjs) {
        if (seen.has(id)) continue;
        const big = !!o.userData.headG;
        const me = this.game.human;
        if (me && o.userData.owner === me.id && !big) sound(o.userData.leader ? 'leaderPop' : 'pop');
        const at = o.position.clone();
        this.poof(at.clone().setY(70), big ? 14 : 7, big ? 1.8 : 1);
        this.burst(at.clone().setY(110), '#ffe066', big ? 18 : 7, big ? 520 : 300, 0.5);
        this.burst(at.clone().setY(90), '#ffffff', big ? 10 : 4, 260, 0.3);
        if (o.userData_hp) o.userData_hp.grp.visible = false;
        this.dying.push({ o, t: 0, spin: (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 8), dx: (Math.random() - 0.5) * 260, dz: (Math.random() - 0.5) * 260, x0: at.x, z0: at.z });
        this.creepObjs.delete(id);
      }
      // defeated looters squash, then get launched spinning into the air and pop away
      this.dying = this.dying.filter(d => {
        d.t += dt;
        const o = d.o;
        if (d.t < 0.08) { const k = d.t / 0.08; o.scale.set(1 + 0.35 * k, 1 - 0.4 * k, 1 + 0.35 * k); return true; }
        const k = (d.t - 0.08) / 0.6;
        if (k >= 1) { this.scene.remove(o); this.disposeLooter(o); return false; }
        o.rotation.y += dt * d.spin; o.rotation.z = k * 1.2 * Math.sign(d.spin);
        o.position.set(d.x0 + d.dx * k, Math.sin(k * Math.PI * 0.85) * 420, d.z0 + d.dz * k);
        const s = k < 0.15 ? 0.65 + k / 0.15 * 0.55 : 1.2 * (1 - (k - 0.15) / 0.85);
        o.scale.setScalar(Math.max(0.01, s));
        return true;
      });
    }

    // ------------------------------------------------ shots and effects
    glowSprite(color, size, opacity) {
      const s = new T.Sprite(new T.SpriteMaterial({ map: glowTexture(), color: new T.Color(color).multiplyScalar(2.2), transparent: true, opacity: opacity == null ? 1 : opacity, depthWrite: false, blending: T.AdditiveBlending }));
      s.scale.set(size, size, 1);
      return s;
    }

    syncShots(dt) {
      const g = this.game, seen = new Set();
      const COL = { fire: ['#ff7a2a', 70], shell: ['#9aa4b8', 46], orb: ['#c77dff', 64], poison: ['#7dff8a', 60], frost: ['#9fe3ff', 72], royal: ['#ffe066', 90], mortar: ['#ff8a3d', 110], bash: ['#e8eef6', 50], arrow: ['#ffe7a8', 40] };
      for (const sh of g.shots) {
        seen.add(sh);
        let o = this.shotObjs.get(sh);
        const [col, baseSize] = COL[sh.fx] || COL.arrow;
        const tw = sh.tower && sh.tower.id != null ? sh.tower : null;
        const size = baseSize * (tw && tw.kind === 'combo' ? 1 + tw.type * 0.16 : 1);
        if (!o && tw) { const to = this.towerObjs.get(tw.id); if (to) to.fireT = performance.now(); }
        if (!o) {
          o = this.glowSprite(col, size); this.scene.add(o); this.shotObjs.set(sh, o);
          o.userData.trail = [];
          if (sh.fx !== 'mortar') this.burst(W2T(sh.x, sh.y, 110 + FELT_H), col, 3, 120, 0.18);
        }
        let h = 150 + FELT_H;
        if (tw) { const to = this.towerObjs.get(tw.id); if (to) { const tot = Math.hypot(sh.tx - tw.x, sh.ty - tw.y) || 1; const k = Math.min(1, Math.hypot(sh.x - tw.x, sh.y - tw.y) / tot); h = to.height * 0.55 * (1 - k) + 80 * k; } }
        if (sh.arc) {
          const tot = Math.hypot(sh.tx - sh.sx, sh.ty - sh.sy) || 1;
          const prog = 1 - Math.hypot(sh.tx - sh.x, sh.ty - sh.y) / tot;
          h = 120 + Math.sin(prog * Math.PI) * 900;
        }
        o.position.copy(W2T(sh.x, sh.y, h));
        const tr = o.userData.trail;
        if (this.frame % 2 === 0) {
          const ghost = this.glowSprite(col, size * 0.6, 0.6); ghost.position.copy(o.position); this.scene.add(ghost);
          this.particles.push({ obj: ghost, t: 0, life: 0.22, fade: true, shrink: true, base: size * 0.6 });
          tr.push(ghost);
        }
      }
      for (const [sh, o] of this.shotObjs) {
        if (seen.has(sh)) continue;
        const col = (COL[sh.fx] || COL.arrow)[0];
        this.burst(o.position, col, sh.fx === 'mortar' ? 22 : 6, sh.fx === 'mortar' ? 420 : 160, 0.3);
        this.scene.remove(o); o.material.dispose();
        this.shotObjs.delete(sh);
      }
    }

    // Sparks share one material per colour and shrink out instead of fading (no per-particle material).
    sharedGlow(color) {
      return mat('glowS' + color, () => { const m = new T.SpriteMaterial({ map: glowTexture(), color: new T.Color(color).multiplyScalar(2.2), transparent: true, depthWrite: false, blending: T.AdditiveBlending }); m.userData.shared = true; return m; });
    }
    burst(pos, color, n, speed, life) {
      if (this.particles.length > 900) return;
      const m = this.sharedGlow(color);
      for (let i = 0; i < n; i++) {
        const s = new T.Sprite(m), size = 26 + Math.random() * 22;
        s.scale.set(size, size, 1);
        s.position.copy(pos);
        const a = Math.random() * TAU, up = Math.random();
        this.particles.push({ obj: s, t: 0, life: (life || 0.45) * (0.7 + Math.random() * 0.6), shrink: true, base: size, shrinkAll: true,
          v: new T.Vector3(Math.cos(a) * speed * (0.4 + Math.random()), speed * (0.3 + up), Math.sin(a) * speed * (0.4 + Math.random())), grav: 900 });
        this.scene.add(s);
      }
    }

    // soft cloud puffs (normal blending) for deaths and landings
    poof(pos, n, scale) {
      if (this.particles.length > 900) return;
      for (let i = 0; i < n; i++) {
        const s = this.glowSprite('#ece6dc', (60 + Math.random() * 50) * (scale || 1), 0.8);
        s.material.blending = T.NormalBlending; s.material.color.set('#f4efe6');
        s.position.copy(pos).add(new T.Vector3((Math.random() - 0.5) * 60, Math.random() * 40, (Math.random() - 0.5) * 60));
        const a = Math.random() * TAU, sp = 90 + Math.random() * 120;
        this.particles.push({ obj: s, t: 0, life: 0.55 + Math.random() * 0.3, fade: true, grow: 1.8, base: s.scale.x,
          v: new T.Vector3(Math.cos(a) * sp, 60 + Math.random() * 80, Math.sin(a) * sp), grav: -40 });
        this.scene.add(s);
      }
    }

    // pop-in floating text drawn by the renderer itself (damage numbers, banners on the board)
    floater(pos, text, color, h) {
      if (this.floaters.length > 60) return;
      const key = text + color;
      let tex = this.textCache.get(key);
      if (!tex) { if (this.textCache.size > 300) { for (const t of this.textCache.values()) t.dispose(); this.textCache.clear(); } tex = textTexture(text, color, 56); this.textCache.set(key, tex); }
      const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
      s.position.copy(pos); s.renderOrder = 11;
      this.scene.add(s);
      this.floaters.push({ s, t: 0, life: 0.85, h: h || 50, aspect: tex.userData.aspect, y0: pos.y, dx: (Math.random() - 0.5) * 60 });
    }
    updateFloaters(dt) {
      this.floaters = this.floaters.filter(f => {
        f.t += dt;
        const k = f.t / f.life;
        if (k >= 1) { this.scene.remove(f.s); f.s.material.dispose(); return false; }
        const pop = k < 0.12 ? 0.4 + (k / 0.12) * 0.9 : k < 0.22 ? 1.3 - (k - 0.12) / 0.1 * 0.3 : 1;
        f.s.scale.set(f.h * f.aspect * pop, f.h * pop, 1);
        f.s.position.y = f.y0 + (1 - Math.pow(1 - k, 3)) * 140;
        f.s.position.x += f.dx * dt;
        f.s.material.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1;
        return true;
      });
    }

    // free a looter's own (cloned) materials once it's gone; geometry is shared and stays
    disposeLooter(o) {
      o.traverse(n => { if (n.material && !n.material.userData.shared) n.material.dispose(); });
    }

    // tall light pillar + ring when a hand gets combined into a tower
    pillar(x, y, color) {
      const m = new T.Mesh(geo('pillarG', () => new T.CylinderGeometry(1, 1, 1, 24, 1, true)),
        new T.MeshBasicMaterial({ color: new T.Color(color).multiplyScalar(2.4), transparent: true, opacity: 0.55, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
      m.scale.set(110, 2600, 110); m.position.copy(W2T(x, y, FELT_H + 1300));
      this.scene.add(m);
      this.particles.push({ obj: m, t: 0, life: 1.3, fade: true, pillar: true, base: 110 });
      this.game.fx.push({ kind: 'ring', x, y, t: 0, life: 0.8, color, r: 520 });
      this.burst(W2T(x, y, FELT_H + 120), color, 24, 520, 0.7);
      this.burst(W2T(x, y, FELT_H + 60), '#ffffff', 10, 300, 0.4);
    }

    // confetti over whatever the camera is looking at
    confetti(n) {
      const cols = ['#ff4d6d', '#ffd34d', '#4dd2ff', '#7dff8a', '#c77dff', '#ffffff'];
      const g = geo('confG', () => new T.PlaneGeometry(1, 1.6));
      const span = 900 / Math.max(0.15, this.view.zoom * 3);
      for (let i = 0; i < n; i++) {
        const m = new T.Mesh(g, mat('conf' + (i % cols.length), () => new T.MeshBasicMaterial({ color: cols[i % cols.length], side: T.DoubleSide })));
        const s = 14 + Math.random() * 14; m.scale.set(s, s, s);
        m.position.copy(W2T(this.view.x + (Math.random() - 0.5) * span * 2, this.view.y + (Math.random() - 0.5) * span * 1.4, 900 + Math.random() * 900));
        this.particles.push({ obj: m, t: 0, life: 3.5 + Math.random() * 1.5, v: new T.Vector3((Math.random() - 0.5) * 120, -120 - Math.random() * 160, (Math.random() - 0.5) * 120), grav: 0, spin: new T.Vector3(3 + Math.random() * 6, 3 + Math.random() * 6, 0), flutter: Math.random() * TAU });
        this.scene.add(m);
      }
    }

    // gooey white blobs shot forward from each palm; they splat flat into puddles where they land
    slimeSpray(ud, yaw) {
      if (this.particles.length > 850 || !ud.palms) return;
      const g = geo('slimeBlob', () => new T.SphereGeometry(1, 10, 8));
      const m = mat('slimeMat', () => new T.MeshStandardMaterial({ color: '#f4f6f2', roughness: 0.12, metalness: 0, emissive: new T.Color('#30302c') }));
      const fx = Math.sin(yaw), fz = Math.cos(yaw), v = new T.Vector3();
      for (const palm of ud.palms) {
        palm.getWorldPosition(v);
        for (let i = 0; i < 2; i++) {
          const b = new T.Mesh(g, m), base = 9 + Math.random() * 10, sp = 650 + Math.random() * 350;
          b.position.copy(v); b.scale.setScalar(base);
          this.particles.push({ obj: b, t: 0, life: 1.6 + Math.random() * 0.6, base, shrink: true, splat: true, grav: 1500,
            v: new T.Vector3(fx * sp + (Math.random() - 0.5) * 140, 220 + Math.random() * 200, fz * sp + (Math.random() - 0.5) * 140) });
          this.scene.add(b);
        }
      }
    }

    coinShower(pos, n) {
      const coinGeo = geo('coin', () => new T.CylinderGeometry(26, 26, 7, 20));
      const gold = mat('coinMat', () => new T.MeshStandardMaterial({ color: '#ffcf40', metalness: 0.9, roughness: 0.25, emissive: new T.Color('#2a1a00') }));
      for (let i = 0; i < n; i++) {
        if (this.particles.length > 900) return;
        const m = new T.Mesh(coinGeo, gold);
        m.position.copy(pos);
        const a = Math.random() * TAU, sp = 160 + Math.random() * 260;
        this.particles.push({ obj: m, t: 0, life: 1.0 + Math.random() * 0.3, v: new T.Vector3(Math.cos(a) * sp, 520 + Math.random() * 380, Math.sin(a) * sp), grav: 1700, spin: new T.Vector3(Math.random() * 12, Math.random() * 12, 0), bounce: true });
        this.scene.add(m);
      }
    }

    syncFx() {
      const g = this.game, seen = new Set();
      for (const f of g.fx) {
        seen.add(f);
        let o = this.fxObjs.get(f);
        const k = f.t / f.life;
        if (!o) {
          o = this.makeFx(f);
          this.fxObjs.set(f, o || false);
        }
        if (!o) continue;
        switch (f.kind) {
          case 'text': { const pop = k < 0.1 ? 0.5 + k / 0.1 * 0.7 : k < 0.2 ? 1.2 - (k - 0.1) / 0.1 * 0.2 : 1; o.scale.set(o.userData.w * pop, o.userData.h * pop, 1);
            o.position.y = 230 + (1 - Math.pow(1 - k, 3)) * 170; o.material.opacity = k > 0.6 ? 1 - (k - 0.6) / 0.4 : 1; break; }
          case 'ring': { const r = (f.r || 260) * (0.3 + k * 0.7); o.scale.set(r, r, r); o.material.opacity = (1 - k) * 0.9; break; }
          case 'bolt': o.children.forEach(s => { s.material.opacity = 1 - k; }); break;
          case 'boom': { const s = f.r * (1 + k * 2.2); o.scale.set(s, s, 1); o.material.opacity = 1 - k; break; }
        }
      }
      for (const [f, o] of this.fxObjs) {
        if (seen.has(f)) continue;
        if (o) { this.scene.remove(o); o.traverse(n => { if (n.material && !n.material.userData.shared) n.material.dispose(); }); }
        this.fxObjs.delete(f);
      }
    }

    makeFx(f) {
      const S = this.scene, me = this.game.human;
      switch (f.kind) {
        case 'text': {
          const tex = textTexture(f.text, f.color || '#ffffff', 56);
          const s = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
          const h = 70; s.scale.set(h * tex.userData.aspect, h, 1); s.userData.w = h * tex.userData.aspect; s.userData.h = h;
          s.position.copy(W2T(f.x, f.y, 230)); s.renderOrder = 10;
          S.add(s); return s;
        }
        case 'coins':
          this.coinShower(W2T(f.x, f.y, 90), Math.min(Math.ceil((f.n || 6) / 2), 14));
          this.burst(W2T(f.x, f.y, 90), '#ffd34d', 3, 160, 0.3);
          if ((f.n || 0) > 10) this.shake = Math.max(this.shake, 40);
          return null;
        case 'ring': {
          const m = new T.Mesh(geo('fxRing', () => new T.RingGeometry(0.85, 1, 64)), new T.MeshBasicMaterial({ color: new T.Color(f.color).multiplyScalar(2.5), transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide }));
          m.rotation.x = -Math.PI / 2; m.position.copy(W2T(f.x, f.y, 6));
          S.add(m); return m;
        }
        case 'spark': this.burst(W2T(f.x, f.y, 90), f.color, 7, 260, 0.3); return null;
        case 'bolt': {
          const grp = new T.Group();
          for (let i = 0; i < f.pts.length - 1; i++) {
            const a = f.pts[i], b = f.pts[i + 1], len = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(3, Math.round(len / 34));
            for (let s = 0; s <= n; s++) {
              const tt = s / n, j = s > 0 && s < n ? (Math.random() - 0.5) * 60 : 0;
              const sp = this.glowSprite(f.color, 44, 1);
              sp.position.copy(W2T(a.x + (b.x - a.x) * tt + j, a.y + (b.y - a.y) * tt + j, 100 + (Math.random() - 0.5) * 30));
              grp.add(sp);
            }
          }
          S.add(grp); return grp;
        }
        case 'boom': {
          const s = this.glowSprite('#ff8a3d', f.r, 1); s.position.copy(W2T(f.x, f.y, 120)); S.add(s);
          this.burst(W2T(f.x, f.y, 80), '#ffb060', 26, 520, 0.6);
          this.shake = Math.max(this.shake, 90);
          return s;
        }
      }
      return null;
    }

    updateParticles(dt) {
      const keep = [];
      for (const p of this.particles) {
        p.t += dt;
        const k = p.t / p.life;
        if (k >= 1) { this.scene.remove(p.obj); if (p.obj.material && !p.obj.material.userData.shared && (p.obj.isSprite || p.pillar)) p.obj.material.dispose(); continue; }
        if (p.v) {
          p.v.y -= (p.grav || 0) * dt;
          p.obj.position.addScaledVector(p.v, dt);
          if (p.splat && p.obj.position.y < 4) { p.obj.position.y = 4; p.v.set(0, 0, 0); p.grav = 0; p.flat = true; }
          if (p.bounce && p.obj.position.y < 4) { p.obj.position.y = 4; p.v.y *= -0.35; p.v.x *= 0.6; p.v.z *= 0.6; }
        }
        if (p.spin) { p.obj.rotation.x += p.spin.x * dt; p.obj.rotation.z += p.spin.y * dt; }
        if (p.fade && p.obj.material) p.obj.material.opacity = 1 - k;
        if (p.shrink) { const sc = p.base * (1 - k * (p.shrinkAll ? 1 : 0.7)); if (p.obj.isSprite) p.obj.scale.set(sc, sc, 1); else p.obj.scale.setScalar(sc); }
        if (p.grow) { const sc = p.base * (1 + k * (p.grow - 1)); p.obj.scale.set(sc, sc, 1); }
        if (p.pillar) { const r = p.base * (1 - k * 0.8); p.obj.scale.x = r; p.obj.scale.z = r; }
        if (p.flutter != null) { p.obj.position.x += Math.sin(p.t * 3 + p.flutter) * 60 * dt; p.v.y = -120 - Math.abs(Math.sin(p.t * 2 + p.flutter)) * 80; }
        if (p.flat) p.obj.scale.set(p.base * 2.2 * (1 - k * 0.5), p.base * 0.25, p.base * 2.2 * (1 - k * 0.5));   // splatted puddle
        keep.push(p);
      }
      this.particles = keep;
    }

    // ------------------------------------------------ camera
    clampZoom(z) { return Math.max(0.04, Math.min(0.9, z)); }

    distFor(zoom) { return this.H / (2 * zoom * Math.tan(this.camera.fov * Math.PI / 360)); }

    placeCamera(v) {
      const z = this.clampZoom(v.zoom);
      const n = (Math.log(z) - Math.log(0.04)) / (Math.log(0.9) - Math.log(0.04));   // 0 far .. 1 close
      const pitch = Math.max(14, Math.min(85, 62 - n * 26 + (v.tilt || 0))) * Math.PI / 180;   // closer = lower, more cinematic
      const dist = this.distFor(z);
      const tx = v.x, tz = -v.y, yaw = v.yaw || 0;
      const sh = this.shake, flat = Math.cos(pitch) * dist, st = performance.now() / 1000;
      const nx = Math.sin(st * 37) * 0.6 + Math.sin(st * 61 + 1.3) * 0.4, ny = Math.sin(st * 43 + 2.1) * 0.6 + Math.sin(st * 71) * 0.4;   // smooth shake, not white noise
      this.camera.position.set(tx + Math.sin(yaw) * flat + nx * sh * 0.5, Math.sin(pitch) * dist + ny * sh * 0.5, tz + Math.cos(yaw) * flat);
      this.camera.lookAt(tx, 0, tz);
      // fog starts just past what we're looking at, however far out the camera is
      this.scene.fog.near = dist * 1.05; this.scene.fog.far = dist * 3.2;
      // keep the shadow box around what we're looking at
      const span = Math.min(6500, dist * 0.9 + 600);
      const sc = this.key.shadow.camera;
      sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.updateProjectionMatrix();
      this.key.position.set(tx - 1800, 3800, tz + 1400);
      this.key.target.position.set(tx, 0, tz);
    }

    fitPlayer(p) {
      let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
      for (const q of p.lane.path) { minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x); minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y); }
      const pad = 400;
      const z = Math.min((this.W - 300) / (maxX - minX + pad * 2), (this.H - 210) / (maxY - minY + pad * 2)) * 1.15;
      this.cam.zoom = this.clampZoom(z);
      this.cam.x = (minX + maxX) / 2 + 100 / this.cam.zoom;
      this.cam.y = (minY + maxY) / 2 - 200;
      this.cam.yaw = 0; this.cam.tilt = 0;
      if (!this.view.init) { Object.assign(this.view, this.cam); this.view.init = true; }
    }

    zoomAt(sx, sy, factor) {
      const before = this.screenToWorld(sx, sy);
      this.cam.zoom = this.clampZoom(this.cam.zoom * factor);
      Object.assign(this.view, { zoom: this.cam.zoom, x: this.cam.x, y: this.cam.y });
      this.placeCamera(this.view); this.camera.updateMatrixWorld();
      const after = this.screenToWorld(sx, sy);
      this.cam.x += before.x - after.x; this.cam.y += before.y - after.y;
      this.view.x = this.cam.x; this.view.y = this.cam.y;
    }

    // Pan by screen pixels, respecting the camera's rotation.
    panBy(dx, dy) {
      const z = this.cam.zoom, c = Math.cos(this.cam.yaw), s = Math.sin(this.cam.yaw);
      this.cam.x += (-c * dx - s * dy) / z;
      this.cam.y += (-s * dx + c * dy) / z;
    }

    rotateBy(dYaw, dTilt) {
      this.cam.yaw += dYaw;
      this.cam.tilt = Math.max(-30, Math.min(22, (this.cam.tilt || 0) + (dTilt || 0)));
    }

    // Opening shot: circle high over the casino, then swoop down to the player's lane.
    playIntro(p) {
      this.fitPlayer(p);
      const end = Object.assign({}, this.cam);
      this.cine = { t: 0, dur: 5.2, intro: true, end, start: { x: 0, y: 0, zoom: 0.05, yaw: end.yaw - Math.PI * 1.1, tilt: -18 } };
      Object.assign(this.view, this.cine.start);
    }

    skipIntro() { if (this.cine && this.cine.intro) this.cine.t = this.cine.dur; }

    screenToWorld(sx, sy) {
      const ndc = new T.Vector2((sx / this.W) * 2 - 1, -(sy / this.H) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const hit = new T.Vector3();
      if (!this.raycaster.ray.intersectPlane(this.ground, hit)) return { x: this.cam.x, y: this.cam.y };
      return { x: hit.x, y: -hit.z };
    }

    worldToScreen(wx, wy) {
      const v = W2T(wx, wy, 0).project(this.camera);
      return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H };
    }

    pickTower(sx, sy) {
      const ndc = new T.Vector2((sx / this.W) * 2 - 1, -(sy / this.H) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      const objs = [];
      for (const o of this.towerObjs.values()) objs.push(o.grp);
      const hits = this.raycaster.intersectObjects(objs, true);
      for (const h of hits) {
        let n = h.object;
        while (n && n.userData.towerId == null) n = n.parent;
        if (n) { const id = n.userData.towerId; return this.game.towers.find(t => t.id === id && t.alive) || null; }
      }
      return null;
    }

    mine(c) { const me = this.game.human; return !!me && c.owner === me.id; }

    // Cinematic touches driven by game events (called from the UI's event handler).
    event(type, d) {
      const me = this.game.human;
      if (type === 'waveStart' && d.bosses && me && me.alive) {
        const s = me.lane.path[0];
        const back = { x: this.cam.x, y: this.cam.y, zoom: this.cam.zoom, yaw: this.cam.yaw, tilt: this.cam.tilt };
        this.cine = { t: 0, dur: 6.5, back, follow: true, to: { x: s.x + 300, y: s.y - 600, zoom: 0.42, yaw: this.cam.yaw, tilt: -8 } };
        this.bossLanded = false;
      } else if (type === 'leak' && d.player === me) { this.flash = 0.55; this.shake = Math.max(this.shake, 60); }
      else if (type === 'kill' && d.boss) { this.shake = Math.max(this.shake, 110); }
      else if (type === 'waveCleared' && me && me.alive) {
        const v = me.lane.path[me.lane.path.length - 1];   // coin fountain at your vault
        this.coinShower(W2T(v.x, v.y, 200), 22); this.burst(W2T(v.x, v.y, 260), '#ffd34d', 26, 620, 0.8);
        this.game.fx.push({ kind: 'ring', x: v.x, y: v.y, t: 0, life: 1.0, color: '#ffd34d', r: 900 });
      } else if (type === 'gameOver' && me && d.winners && d.winners.indexOf(me) >= 0) { this.confetti(220); this.coinShower(W2T(this.view.x, this.view.y, 400), 30); }
      else if (type === 'towerDestroyed' && d.tower && d.tower.owner === me.id) { this.shake = Math.max(this.shake, 120); this.flash = 0.35; }
    }

    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 1.75 : 1);
      this.W = this.canvas.clientWidth || window.innerWidth; this.H = this.canvas.clientHeight || window.innerHeight;
      this.gl.setPixelRatio(dpr);
      this.gl.setSize(this.W, this.H, false);
      this.post.setSize(Math.round(this.W * dpr), Math.round(this.H * dpr));
      this.camera.aspect = this.W / this.H; this.camera.updateProjectionMatrix();
    }

    // ------------------------------------------------ frame
    draw(ui) {
      const now = performance.now();
      const dt = Math.min(0.05, (now - (this.lastNow || now)) / 1000);
      this.lastNow = now;
      this.frame++;
      const g = this.game;

      // camera: smooth follow, optional boss cinematic
      const mix = (a, b, e) => ({ x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, yaw: (a.yaw || 0) + ((b.yaw || 0) - (a.yaw || 0)) * e,
        tilt: (a.tilt || 0) + ((b.tilt || 0) - (a.tilt || 0)) * e, zoom: Math.exp(Math.log(a.zoom) + (Math.log(b.zoom) - Math.log(a.zoom)) * e) });
      const smooth = (s) => s * s * (3 - 2 * s);
      if (this.cine) {
        const c = this.cine; c.t += dt;
        if (c.intro) {
          // orbit for the first 45%, then ease down into the lane view
          const k = Math.min(1, c.t / c.dur);
          const orbitEnd = Object.assign({}, c.start, { yaw: c.end.yaw - 0.35, zoom: 0.065, tilt: -10 });
          Object.assign(this.view, k < 0.45 ? mix(c.start, orbitEnd, k / 0.45) : mix(orbitEnd, c.end, smooth((k - 0.45) / 0.55)));
        } else {
          if (c.follow) {
            // track the boss as it steps out, and slam a shockwave down when it appears
            const me = this.game.human;
            const b = this.game.creeps.find(cr => cr.boss && cr.alive && cr.owner === me.id);
            if (b) {
              c.to.x += ((b.x + 250) - c.to.x) * Math.min(1, dt * 3); c.to.y += ((b.y - 550) - c.to.y) * Math.min(1, dt * 3);

            }
          }
          const k = c.t < 1.2 ? c.t / 1.2 : c.t > c.dur - 1.2 ? Math.max(0, (c.dur - c.t) / 1.2) : 1;
          Object.assign(this.view, mix(c.back, c.to, smooth(k)));
        }
        if (c.t >= c.dur) { if (c.intro) Object.assign(this.view, this.cam); this.cine = null; }
      } else {
        const f = Math.min(1, dt * 12);
        this.view.x += (this.cam.x - this.view.x) * f; this.view.y += (this.cam.y - this.view.y) * f;
        this.view.zoom = Math.exp(Math.log(this.view.zoom) + (Math.log(this.cam.zoom) - Math.log(this.view.zoom)) * f);
        this.view.yaw += (this.cam.yaw - this.view.yaw) * f;
        this.view.tilt += ((this.cam.tilt || 0) - (this.view.tilt || 0)) * f;
      }
      this.shake *= Math.pow(0.02, dt);
      this.flash = Math.max(0, this.flash - dt * 1.4);
      this.placeCamera(this.view);

      this.syncTowers(ui || {}, now, dt);
      this.syncCreeps(now, dt);
      this.syncShots(dt);
      this.syncFx();
      this.updateParticles(dt);
      this.updateFloaters(dt);

      // ambient animation
      const t = now / 1000;
      this.vaultDial.rotation.y = t * 0.25;
      for (const p of this.portals) { p.ring.rotation.z = t * 1.5; p.inner.material.opacity = 0.35 + 0.2 * Math.sin(t * 3); p.grp.children[0].rotation.y = t; }
      if (this.scenery) this.scenery.update(t, dt);
      this.dust.rotation.y = t * 0.01;
      this.dust.position.y = Math.sin(t * 0.2) * 40;

      // ghost + range
      const gh = ui && ui.ghost;
      this.ghost.visible = !!gh;
      if (gh) {
        this.ghost.position.copy(W2T(gh.x, gh.y, FELT_H + 4));
        this.ghost.material.color.set(gh.ok ? '#66ff99' : '#ff5555');
      }
      const focus = ui && (ui.inspect && ui.inspect.alive ? ui.inspect : ui.hoverTower);
      const rr = focus ? { x: focus.x, y: focus.y, r: focus.stats.range } : gh && gh.ok ? { x: gh.x, y: gh.y, r: 400 } : null;
      this.rangeRing.visible = this.rangeFill.visible = !!rr;
      if (rr) {
        this.rangeRing.position.copy(W2T(rr.x, rr.y, FELT_H + 8)); this.rangeRing.scale.setScalar(rr.r);
        this.rangeFill.position.copy(W2T(rr.x, rr.y, FELT_H + 7)); this.rangeFill.scale.setScalar(rr.r);
      }

      this.post.comp.uniforms.flash.value = this.flash;
      this.post.bloom = this.quality === 'high';
      this.post.aoOn = this.quality === 'high';
      {   // occlusion reach and far-side softness follow the camera height
        const camH = Math.max(1, this.camera.position.y);
        this.post.aoRadius = Math.min(300, Math.max(50, camH * 0.045));
        this.post.tiltK = this.quality === 'high' ? 0.55 : 0;
      }
      this.post.render(this.scene, this.camera);

      // automatic quality drop on slow machines
      if (dt > 0.034) this.slowFrames++; else this.slowFrames = Math.max(0, this.slowFrames - 1);
      if (this.quality === 'high' && this.slowFrames > 150) {
        this.quality = PTD.Renderer3D.quality = 'low';
        this.key.castShadow = false;
        this.resize();
      }
    }

    dispose() {
      for (const o of this.towerObjs.values()) this.scene.remove(o.grp);
      if (this.boardTex) this.boardTex.dispose();
      this.scene.clear();
    }
  }

  Renderer3D.quality = 'high';
  PTD.Renderer3D = Renderer3D;
})();
