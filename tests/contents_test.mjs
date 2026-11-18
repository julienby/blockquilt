// Contrat HTTP de l'application de référence (dev/app.js) : droits, représentations, ETag / If-Match.
// Lance dev/server.js sur un dossier jetable. node tests/contents_test.mjs → exit 1 si une étape échoue.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Blocks = createRequire(import.meta.url)('../blockquilt.js');
const PORT = 8097;
const BASE = `http://127.0.0.1:${PORT}/`;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'bqcontents-'));
let failed = 0;
const ok = (cond, label) => { console.log((cond ? 'ok   ' : 'FAIL ') + label); if (!cond) failed++; };
const server = spawn('node', [path.join(ROOT, 'dev/server.js')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: data }, stdio: 'ignore' });
const as = (who, headers = {}) => ({ ...(who ? { Authorization: 'Bearer demo-' + who } : {}), ...headers });
const get = (p, who, accept = 'text/markdown', more = {}) => fetch(BASE + p, { headers: as(who, { Accept: accept, ...more }) });
const put = (p, who, body, ifMatch, more = {}) => fetch(BASE + p, { method: 'PUT', headers: as(who, { 'Content-Type': 'text/markdown; charset=utf-8', ...(ifMatch ? { 'If-Match': ifMatch } : {}), ...more }), body });

try {
  for (let i = 0; i < 40; i++) { try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }

  ok((await get('contents', null)).status === 401 && (await get('contents', null, 'text/markdown', { Authorization: 'Bearer faux' })).status === 401, 'sans jeton ou jeton inconnu : 401');
  const list = await (await get('contents', 'user1', 'application/json')).json();
  ok(list.map((c) => c.id).join() === 'guide-1a,guide-1b' && list[0].title === 'Guide 1A — Arrivée' && list[0].href === 'contents/guide-1a', 'user1 voit 1A et 1B (JSON : id, titre, lien)');
  ok((await (await get('contents', 'user2', 'application/json')).json()).map((c) => c.id).join() === 'guide-2a', 'user2 ne voit que 2A');
  const ul = await (await get('contents', 'user1', 'text/html', { 'HX-Request': 'true' })).text();
  ok(ul.startsWith('<ul') && ul.includes('href="contents/guide-1b"') && !ul.includes('<html'), 'liste en HTML : fragment de liens pour htmx');

  const r = await get('contents/guide-1a', 'user1');
  const md = await r.text();
  const tag = r.headers.get('etag');
  ok(r.headers.get('content-type').startsWith('text/markdown') && md.startsWith('---\ntitle: Guide 1A') && tag === `"${Blocks.hash(md)}"`, 'GET Markdown : le texte et son ETag');
  ok((await get('contents/guide-1a', 'user1', 'text/markdown', { 'If-None-Match': tag })).status === 304, 'If-None-Match : 304 si inchangé');
  const html = await (await get('contents/guide-1a', 'user1', 'text/html', { 'HX-Request': 'true' })).text();
  ok(html.startsWith('<article class="bq-content">') && html.includes('<h1 id="arrivee">'), 'GET HTML : le rendu Blocks.toHtml (fragment pour htmx)');
  ok((await (await get('contents/guide-1a', 'user1', 'text/html')).text()).includes('<!doctype html>'), 'GET HTML sans htmx : page complète');
  ok((await get('contents/guide-2a', 'user1')).status === 403 && (await get('contents/inconnu', 'user1')).status === 403, 'contenu d’un autre (ou inexistant) : 403');
  ok((await get('contents/..%2Fdocument', 'user1')).status === 404, 'identifiant invalide : 404');

  ok((await put('contents/guide-1a', 'user1', md + '\nAjout.\n')).status === 428, 'PUT sans If-Match : 428');
  ok((await put('contents/guide-1a', 'user1', md, '"00000000"')).status === 412, 'PUT avec un ETag périmé : 412, rien d’écrit');
  ok((await put('contents/guide-2a', 'user1', 'x', '*')).status === 403, 'PUT sur le contenu d’un autre : 403');
  ok((await put('contents/guide-1a', 'user1', ' \n', tag)).status === 422, 'PUT vide : 422');
  const next = Blocks.combine(md, 'Ajouté par l’IA.', 'append');
  const w = await put('contents/guide-1a', 'user1', next.replace(/\n/g, '\r\n'), tag, { 'X-Via': 'Claude' });
  ok(w.status === 204 && w.headers.get('etag') === `"${Blocks.hash(next)}"`, 'PUT avec le bon ETag : 204 et nouvel ETag (fins de ligne Windows remises en \\n)');
  ok((await put('contents/guide-1a', 'user1', md, tag)).status === 412, 'second PUT avec l’ancien ETag : 412 (pas d’écrasement)');
  const after = await get('contents/guide-1a', 'user1', 'application/json');
  const c = await after.json();
  ok(c.markdown === next && c.updatedBy === 'user1 (via Claude)' && decodeURIComponent(after.headers.get('x-updated-by')) === 'user1 (via Claude)', 'auteur noté : la personne du jeton, et par quoi elle est passée');

  // Page de l'application : utilisateur choisi par cookie, contenu ouvert dans l'éditeur.
  const login = await fetch(BASE + 'app?login=demo-user2', { redirect: 'manual' });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  ok(login.status === 303 && cookie === 'bq_token=demo-user2' && login.headers.get('set-cookie').includes('HttpOnly'), 'app : connexion par cookie HttpOnly');
  const page = await (await fetch(BASE + 'app', { headers: { Cookie: cookie } })).text();
  ok(page.includes('Bienvenue au chalet') && page.includes('contentUrl: "contents/guide-2a", version: "\\"'), 'app : le premier contenu de user2 dans l’éditeur, avec son adresse et sa version');
  ok((await (await fetch(BASE + 'app?c=guide-1a', { headers: { Cookie: cookie } })).text()).includes('n\'a pas accès'), 'app : contenu d’un autre refusé');
  ok((await (await fetch(BASE + 'contents', { headers: { Cookie: cookie, Accept: 'application/json' } })).json()).length === 1, 'le cookie vaut jeton pour le navigateur');

  // Fichiers servis : seulement ceux de l'éditeur (liste blanche).
  const status = async (p) => (await fetch(BASE + p)).status;
  const served = await Promise.all(['blockquilt.js', 'blockquilt-editor.js', 'blockquilt-content.js', 'blockquilt.css', 'blockquilt-content.css', 'emoji.json', 'editor/ai.js', 'fonts/newsreader.woff2'].map(status));
  ok(served.every((s) => s === 200), 'fichiers de l’éditeur servis : ' + served.join(' '));
  const hidden = await Promise.all(['.env', '.gitignore', 'README.md', 'PLAN.md', 'tailwind.config.js', 'ai/blockquilt-ai.js', 'mcp/SKILL.md', 'dev/app.js', 'editor/../.env', 'fonts/OFL-newsreader.txt'].map(status));
  ok(hidden.every((s) => s === 404), 'autres fichiers (.env, docs, serveurs) : 404 : ' + hidden.join(' '));

  // Photos : JPEG, PNG, WebP ou GIF reconnus à leur contenu, 5 Mo au plus.
  const upload = (bytes, type) => { const f = new FormData(); f.set('photo', new Blob([bytes], { type }), 'x'); return fetch(BASE + 'api/upload', { method: 'POST', body: f }); };
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
  const up = await upload(png, 'image/jpeg');
  const { id } = await up.json();
  const media = await fetch(BASE + 'media/' + id);
  ok(up.status === 200 && media.headers.get('content-type') === 'image/png', 'photo PNG : gardée, servie avec le type de son contenu (pas celui déclaré)');
  ok((await upload('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>', 'image/svg+xml')).status === 422, 'SVG envoyé : 422');
  ok((await upload('pas une image', 'image/png')).status === 422, 'contenu qui n’est pas une image : 422');
  ok((await upload(Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]), 'image/png')).status === 413, 'photo de plus de 5 Mo : 413');
  const big = new FormData(); big.set('text', 'a'.repeat(2 * 1024 * 1024));
  ok((await fetch(BASE + 'api/save', { method: 'POST', body: big })).status === 413, 'enregistrement de plus de 1 Mo : 413');
} catch (error) {
  ok(false, error.message);
} finally {
  server.kill();
  fs.rmSync(data, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
