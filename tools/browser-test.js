// Drives headless Chrome to play-test the game and save screenshots.
// usage: node tools/browser-test.js <outdir>
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const out = path.resolve(process.argv[2] || 'shots');
fs.mkdirSync(out, { recursive: true });
const url = 'file:///' + path.resolve(__dirname, '..', 'index.html').split(path.sep).join('/');
const prof = path.join(out, 'profile');
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9333', '--window-size=1600,900', '--user-data-dir=' + prof, '--autoplay-policy=no-user-gesture-required', 'about:blank']);
const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  let target;
  for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch('http://127.0.0.1:9333/json')).json()).find(t => t.type === 'page'); } catch (e) {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}; const errors = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text);
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map(a => a.value || a.description).join(' ')); };
  const send = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error'); return r.result.result.value; };
  const shot = async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.result.data, 'base64')); console.log('shot', name); };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1600, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url }); await sleep(2500);
  await shot('01-menu');
  const steps = JSON.parse(fs.readFileSync(path.join(__dirname, 'browser-steps.json'), 'utf8'));
  for (const s of steps) {
    if (s.eval) { const v = await ev(s.eval); if (v !== undefined) console.log(s.label || 'eval', '=>', JSON.stringify(v)); }
    if (s.click) { for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await send('Input.dispatchMouseEvent', { type, x: s.click[0], y: s.click[1], button: 'left', clickCount: 1 }); }
    if (s.key) { await send('Input.dispatchKeyEvent', { type: 'keyDown', key: s.key, code: s.code || s.key, text: s.text }); await send('Input.dispatchKeyEvent', { type: 'keyUp', key: s.key, code: s.code || s.key }); }
    if (s.wait) await sleep(s.wait);
    if (s.shot) await shot(s.shot);
  }
  console.log('errors:', errors.length ? errors : 'none');
  ws.close(); chrome.kill();
  process.exit(0);
})().catch(e => { console.error(e); chrome.kill(); process.exit(1); });
