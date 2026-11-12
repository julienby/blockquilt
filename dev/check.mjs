// Essai dans un vrai navigateur (Chromium headless piloté en CDP, Node seul).
// Lance dev/server.js sur un dossier de données jetable, puis rejoue un parcours complet sur la démo.
// Exit 1 si une étape échoue. Lancé par `docker compose run --rm check`.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8099;
const CDP = 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'blockquilt-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const ok = (cond, label) => { console.log((cond ? 'ok   ' : 'FAIL ') + label); if (!cond) failed++; };

const server = spawn('node', [path.join(DIR, 'server.js')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: data }, stdio: 'ignore' });
const chrome = spawn(process.env.CHROME || 'chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${CDP}`, `--user-data-dir=${path.join(data, 'chrome')}`, 'about:blank'], { stdio: 'ignore', detached: true });
const exited = (child) => new Promise((r) => (child.exitCode !== null || child.signalCode !== null ? r() : child.once('exit', r)));
// Chromium lance des processus enfants : on arrête tout son groupe.
const stop = async () => { try { process.kill(-chrome.pid, 'SIGKILL'); } catch {} server.kill(); await Promise.all([exited(chrome), exited(server)]); };

const waitFor = async (test, label, tries = 40) => {
  for (let i = 0; i < tries; i++) { if (await test().catch(() => false)) return true; await sleep(250); }
  throw new Error('attente trop longue : ' + label);
};

try {
  await waitFor(async () => (await fetch(BASE + '/')).ok, 'serveur');
  await waitFor(async () => (await fetch(`http://127.0.0.1:${CDP}/json/version`)).ok, 'chromium');
  const target = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let n = 0;
  const pending = {};
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } });
  const send = (method, params = {}) => new Promise((r) => { const id = ++n; pending[id] = r; ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => {
    const m = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (m.result.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || 'erreur JS');
    return m.result.result.value;
  };
  const open = async () => {
    await send('Page.navigate', { url: BASE + '/' });
    await waitFor(() => ev(`document.readyState === 'complete' && document.querySelectorAll('#ehg [data-id]').length > 0`), 'chargement de la démo');
  };
  // Type et texte de chaque bloc, dans l'ordre.
  const cards = () => ev(`[...document.querySelectorAll('#ehg [data-id]')].map((a) => (a.querySelector('[data-convert]')?.value ?? 'media') + ':' + (a.querySelector('[data-body]')?.textContent ?? ''))`);
  const mergeButtons = () => ev(`[...document.querySelectorAll('[data-merge]')].map((b) => b.dataset.merge)`);

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 900, deviceScaleFactor: 1, mobile: true });
  await open();

  let c = await cards();
  ok(c.length === 6, `démo : 6 blocs affichés (${c.length})`);
  ok(JSON.stringify(await mergeButtons()) === '["1","2","4","5"]', 'Fusionner : entre deux blocs texte, jamais sous un titre');

  await ev(`document.querySelector('[data-merge="1"]').click()`);
  c = await cards();
  ok(c.length === 5 && c[0].startsWith('tip:') && c[0].includes('porte bleue'), 'fusion : l’astuce garde son type et reçoit la liste');

  await ev(`(() => {
    const body = [...document.querySelectorAll('#ehg [data-body]')].find((b) => b.textContent.includes('Réseau'));
    body.focus();
    const r = document.createRange(); r.setStartAfter(body.querySelector('br')); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  })()`);
  ok(await ev(`!document.querySelector('[data-pill]').hidden`), 'clic droit : la barre de style s’ouvre');
  const bar = await ev(`(() => { const r = document.querySelector('[data-pill]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()`);
  ok(bar, 'barre de style : tient dans un écran de 375 px');
  await ev(`document.querySelector('[data-split]').click()`);
  c = await cards();
  ok(c.length === 6 && c.some((x) => x === 'text:Réseau : maison-wifi'), 'scission : la suite part dans un nouveau bloc');

  // Photo : un PNG d'un pixel envoyé par le champ fichier de l'éditeur.
  const png = path.join(data, 'pixel.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const { root } = (await send('DOM.getDocument')).result;
  const { nodeId } = (await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[data-file]' })).result;
  await send('DOM.setFileInputFiles', { nodeId, files: [png] });
  await waitFor(async () => (await cards()).length === 7, 'bloc photo');
  ok(true, 'photo : envoyée, un bloc photo apparaît');

  await ev(`document.querySelector('[data-status]').click()`);
  const doc = path.join(data, 'document.md');
  await waitFor(() => ev(`document.querySelector('[data-toast-text]').textContent === 'Sauvegardé'`), 'enregistrement');
  const md = fs.readFileSync(doc, 'utf8');
  ok(md.startsWith('## 🏡 Arrivée'), 'enregistrement : titre de la rubrique');
  ok(md.includes('> 💡 Garez-vous à gauche du portail.\n> - porte bleue\n> - code **1515**'), 'enregistrement : astuce fusionnée en Markdown');
  ok(md.includes('La clé est dans la boîte aux lettres.\n\nRéseau : maison-wifi'), 'enregistrement : deux blocs après la scission');
  if (failed) console.log('--- document.md ---\n' + md + '\n---');
  const media = /\]\(media\/([a-f0-9]{12})\)/.exec(md);
  ok(media !== null, 'enregistrement : la photo est dans le texte');
  const img = media ? await fetch(`${BASE}/media/${media[1]}`) : null;
  ok(img?.ok && img.headers.get('content-type') === 'image/png', 'photo : servie par /media/<id>');

  await open();
  ok((await cards()).length === 7, 'rechargement : le document enregistré revient, 7 blocs');

  await ev(`document.querySelector('[data-mode="guest"]').click()`);
  await waitFor(() => ev(`document.querySelector('[data-canvas]').textContent.includes('Garez-vous')`), 'aperçu');
  ok(true, 'aperçu : le fragment du serveur s’affiche');

  ws.close();
} catch (error) {
  ok(false, error.message);
} finally {
  await stop();
  fs.rmSync(data, { recursive: true, force: true, maxRetries: 10 });
}
process.exit(failed ? 1 : 0);
