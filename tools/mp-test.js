// Two-browser multiplayer test: page A hosts the public table, page B joins, both play a hand.
// usage: node tools/mp-test.js <outdir> [url]   (defaults to the local index.html)
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const out = path.resolve(process.argv[2] || 'shots');
fs.mkdirSync(out, { recursive: true });
const url = process.argv[3] || 'file:///' + path.resolve(__dirname, '..', 'index.html').split(path.sep).join('/');
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=9334', '--user-data-dir=' + path.join(out, 'mp-profile'), 'about:blank']);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function page(targetUrl) {
  const t = await (await fetch('http://127.0.0.1:9334/json/new?' + encodeURIComponent('about:blank'), { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise(r => ws.onopen = r);
  let id = 0; const pend = {}; const errors = [];
  ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && pend[d.id]) { pend[d.id](d); delete pend[d.id]; }
    if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') errors.push(d.params.args.map(a => a.value || a.description).join(' '));
    if (d.method === 'Runtime.exceptionThrown') errors.push(d.params.exceptionDetails.exception?.description || d.params.exceptionDetails.text); };
  const send = (method, params) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1400, height: 820, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: targetUrl }); await sleep(2000);
  return {
    errors,
    ev: async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) return 'EXC ' + (r.result.exceptionDetails.exception?.description || ''); return r.result.result.value; },
    shot: async (name) => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.result.data, 'base64')); },
  };
}

const waitFor = async (p, expr, ms) => { const end = Date.now() + ms; while (Date.now() < end) { if (await p.ev(expr)) return true; await sleep(300); } return false; };
const dealAll = `(()=>{const {game}=PTD.current; const me=game.human; let n=0; for(const s of me.spots){ if(n>=5) break; if(game.canDealAt(me,s.x,s.y)){ game.deal(me,s.x,s.y); n++; } } return n})()`;

(async () => {
  for (let i = 0; i < 30; i++) { try { await fetch('http://127.0.0.1:9334/json/version'); break; } catch (e) { await sleep(200); } }
  const A = await page(url), B = await page(url);
  await A.ev(`document.getElementById('in-name').value='Merv'; document.getElementById('btn-public').click()`);
  console.log('A hosting:', await waitFor(A, `document.getElementById('lobby-code').textContent==='TABLE' && !!document.querySelector('#lobby-host-opts:not(.hidden)')`, 20000));
  await B.ev(`document.getElementById('in-name').value='Adam'; document.getElementById('btn-public').click()`);
  console.log('B joined:', await waitFor(B, `document.querySelectorAll('#lobby-seats .seat').length===2`, 20000));
  console.log('A sees 2:', await waitFor(A, `document.querySelectorAll('#lobby-seats .seat').length===2`, 5000));
  await A.shot('mp-01-host-lobby'); await B.shot('mp-02-guest-lobby');
  await B.ev(`document.getElementById('btn-guest-start').click()`);   // guest asks to start
  console.log('A started:', await waitFor(A, `!!(PTD.current && PTD.current.game && PTD.current.game.phase==='hand')`, 8000));
  console.log('B started:', await waitFor(B, `!!(PTD.current && PTD.current.game && PTD.current.game.remote)`, 8000));
  console.log('B debug', await B.ev(`(()=>{const g=PTD.current.game,me=g.human; const s=me.spots[0]; return {id:me.id, seat:g.opts.localSeat, dl:me.dealsLeft, alive:me.alive, folded:me.folded, ph:g.phase, spots:me.spots.length, canAct:g.canAct(me), build:g.map.canBuild(s.x,s.y), deal: String(g.deal).slice(0,40)}})()`));
  console.log('host view of B', await A.ev(`(()=>{const p=PTD.current.game.players[1]; return [p.dealsLeft, p.human, p.ai.step, p.hand.length]})()`));
  console.log('B players', await B.ev(`PTD.current.game.players.map(p=>p.dealsLeft)`));
  console.log('A dealt', await A.ev(dealAll));
  console.log('B dealt', await B.ev(dealAll));
  await sleep(1500);
  console.log('B hand on host:', await A.ev(`PTD.current.game.players[1].hand.map(t=>t.title)`));
  console.log('B hand on B:', await B.ev(`PTD.current.game.human.hand.map(t=>t.title)`));
  // B combines best (or swaps), both ready
  console.log('B combine:', await B.ev(`(()=>{const g=PTD.current.game,p=g.human; const b=PTD.Poker.best(p.hand.map(t=>({suit:t.suit,rank:t.rank}))); if(!b) return 'no combo'; b.idx.forEach(i=>g.toggleSelect(p,p.hand[i])); g.combine(p); return b.combo.title})()`));
  await sleep(1200);
  console.log('B result on host:', await A.ev(`PTD.current.game.players[1].handTitle`));
  await A.ev(`PTD.current.game.ready(PTD.current.game.human)`); await B.ev(`PTD.current.game.ready()`);
  console.log('wave on B:', await waitFor(B, `PTD.current.game.phase==='spawn' && PTD.current.game.creeps.length>0`, 10000));
  await sleep(6000);
  await A.shot('mp-03-host-wave'); await B.shot('mp-04-guest-wave');
  console.log('B view:', await B.ev(`(()=>{const g=PTD.current.game; return {phase:g.phase, level:g.level, creeps:g.creeps.length, towers:g.towers.length, gold:g.players.map(p=>p.name+':'+p.gold)}})()`));
  console.log('errors A:', A.errors.length ? A.errors : 'none', ' errors B:', B.errors.length ? B.errors : 'none');
  chrome.kill(); process.exit(0);
})().catch(e => { console.error(e); chrome.kill(); process.exit(1); });
