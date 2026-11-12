// Captures d'écran de la démo (outil de développement) : node dev/shot.mjs <sortie> [largeur] [script JS à exécuter avant]
// docker compose run --rm -v /tmp/bq:/shots check node dev/shot.mjs /shots/a.png 375
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const [out = '/tmp/shot.png', width = '375', script = ''] = process.argv.slice(2);
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'bqshot-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const server = spawn('node', [path.join(DIR, 'server.js')], { env: { ...process.env, PORT: '8098', DATA_DIR: data }, stdio: 'ignore' });
const chrome = spawn(process.env.CHROME || 'chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', '--remote-debugging-port=9223', `--user-data-dir=${path.join(data, 'c')}`, 'about:blank'], { stdio: 'ignore', detached: true });
try {
  for (let i = 0; i < 40; i++) { try { await fetch('http://127.0.0.1:9223/json/version'); await fetch('http://127.0.0.1:8098/'); break; } catch { await sleep(250); } }
  const target = (await (await fetch('http://127.0.0.1:9223/json/list')).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let n = 0; const pending = {};
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } });
  const send = (method, params = {}) => new Promise((r) => { const id = ++n; pending[id] = r; ws.send(JSON.stringify({ id, method, params })); });
  await send('Emulation.setDeviceMetricsOverride', { width: Number(width), height: Number(width) < 640 ? 800 : 900, deviceScaleFactor: 1, mobile: Number(width) < 640 });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:8098/' });
  await sleep(1200);
  if (script) { const r = await send('Runtime.evaluate', { expression: script, awaitPromise: true, returnByValue: true }); console.log(r.result.exceptionDetails ? r.result.exceptionDetails.exception?.description : JSON.stringify(r.result.result.value)); await sleep(600); }
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
  ws.close();
} finally {
  try { process.kill(-chrome.pid, 'SIGKILL'); } catch {}
  server.kill();
  await sleep(300);
  fs.rmSync(data, { recursive: true, force: true });
}
