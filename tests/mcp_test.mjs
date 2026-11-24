// Serveur MCP générique (mcp/blockquilt-mcp.js) sur l'application de référence : HTTP (/mcp) et stdio.
// node tests/mcp_test.mjs → exit 1 si une étape échoue.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Blocks = createRequire(import.meta.url)('../blockquilt.js');
const PORT = 8096;
const BASE = `http://127.0.0.1:${PORT}/`;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'bqmcp-'));
let failed = 0;
const ok = (cond, label) => { console.log((cond ? 'ok   ' : 'FAIL ') + label); if (!cond) failed++; };
const server = spawn('node', [path.join(ROOT, 'dev/server.js')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: data }, stdio: 'ignore' });
let n = 0;
const rpc = async (who, method, params) => {
  const r = await fetch(BASE + 'mcp', { method: 'POST', headers: { Authorization: 'Bearer demo-' + who, 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method, params }) });
  return r.json();
};
const call = async (who, name, args = {}) => { const r = await rpc(who, 'tools/call', { name, arguments: args }); return { text: r.result.content[0].text, error: !!r.result.isError }; };
const file = (id) => fs.readFileSync(path.join(data, 'contents', id + '.md'), 'utf8');
const blocksOf = (text) => [...text.matchAll(/^\[(\d+) · ([0-9a-f]{8}) · (\w+)\]$/gm)].map((m) => ({ n: Number(m[1]), hash: m[2], type: m[3] }));

try {
  for (let i = 0; i < 40; i++) { try { await fetch(BASE); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }

  const init = await rpc('user1', 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'essai', version: '1' } });
  ok(init.result.protocolVersion === '2025-06-18' && init.result.capabilities.tools && init.result.serverInfo.name === 'blockquilt', 'initialize : version du protocole, outils');
  ok((await fetch(BASE + 'mcp', { method: 'POST', body: '{}' })).status === 401, 'HTTP sans jeton : 401');
  ok((await fetch(BASE + 'mcp', { method: 'POST', headers: { Authorization: 'Bearer demo-user1' }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) })).status === 202, 'notification : 202 sans corps');
  const list = await rpc('user1', 'tools/list', {});
  ok(list.result.tools.map((t) => t.name).join() === 'get_format,list_contents,read_content,edit_block,write_content,lint' && list.result.tools.every((t) => t.inputSchema?.type === 'object'), 'tools/list : 6 outils avec leur schéma');
  ok((await call('user1', 'get_format')).text.includes('> [!tip]'), 'get_format : FORMAT.md');

  const l1 = await call('user1', 'list_contents');
  ok(l1.text.includes('guide-1a') && l1.text.includes('guide-1b') && !l1.text.includes('guide-2a'), 'list_contents : user1 voit 1A et 1B, pas 2A');
  ok((await call('user2', 'list_contents')).text.startsWith('guide-2a'), 'list_contents : user2 voit 2A');
  const no = await call('user1', 'read_content', { id: 'guide-2a' });
  ok(no.error && no.text.includes('Pas d’accès'), 'read_content d’un contenu d’un autre : refusé');

  const read = await call('user1', 'read_content', { id: 'guide-1a' });
  const bl = blocksOf(read.text);
  ok(/^contenu guide-1a · version "[0-9a-f]{8}"/.test(read.text) && read.text.includes('title: Guide 1A') && bl.map((b) => b.type).join() === 'h1,tip,h2,text,h2,text', 'read_content : version, frontmatter, blocs numérotés avec empreinte et type');
  const before = file('guide-1a');
  const stale = await call('user1', 'edit_block', { id: 'guide-1a', block: 4, hash: 'deadbeef', markdown: 'X' });
  ok(stale.error && stale.text.includes('a changé') && file('guide-1a') === before, 'edit_block avec une empreinte périmée : refusé, rien d’écrit');
  const bad = await call('user1', 'edit_block', { id: 'guide-1a', block: 4, hash: bl[3].hash, markdown: '> [!note]\n> inconnu' });
  ok(bad.error && bad.text.includes('Type d’encadré inconnu') && file('guide-1a') === before, 'edit_block avec un Markdown hors format : refusé avec la ligne, rien d’écrit');
  const done = await call('user1', 'edit_block', { id: 'guide-1a', block: 4, hash: bl[3].hash, markdown: 'La boîte à clés est **à gauche** de la porte bleue. Code : **1515**.' });
  ok(!done.error && file('guide-1a') === before.replace('à droite', '**à gauche**'), 'edit_block replace : seul ce bloc change');
  const after = await call('user1', 'edit_block', { id: 'guide-1a', block: 2, hash: blocksOf(done.text)[1].hash, mode: 'after', markdown: '> [!info]\n> Parking gratuit.' });
  ok(!after.error && file('guide-1a').includes('portail.\n\n> [!info]\n> Parking gratuit.\n\n## Clés'), 'edit_block after : bloc inséré dessous');
  ok(JSON.parse(fs.readFileSync(path.join(data, 'contents', 'guide-1a.json'), 'utf8')).by === 'user1 (via MCP)', 'auteur : user1 (via MCP)');

  const v = /version ("[0-9a-f]{8}")/.exec((await call('user1', 'read_content', { id: 'guide-1b' })).text)[1];
  const app = await call('user1', 'write_content', { id: 'guide-1b', mode: 'append', markdown: '## Merci\n\nÀ bientôt !' });
  ok(!app.error && file('guide-1b').endsWith('> Départ avant 11 h.\n\n## Merci\n\nÀ bientôt !\n'), 'write_content append : à la fin');
  const pre = await call('user1', 'write_content', { id: 'guide-1b', mode: 'prepend', markdown: '> [!tip]\n> Laissez les draps.' });
  ok(!pre.error && file('guide-1b').includes('---\n\n> [!tip]\n> Laissez les draps.\n\n# Départ'), 'write_content prepend : sous le frontmatter');
  const oldV = await call('user1', 'write_content', { id: 'guide-1b', mode: 'replace', markdown: '# Tout neuf', version: v });
  ok(oldV.error && oldV.text.includes('a changé') && file('guide-1b').includes('Laissez les draps'), 'write_content replace avec une version périmée : refusé');
  ok((await call('user1', 'write_content', { id: 'guide-1b', mode: 'replace', markdown: '# Tout neuf' })).error, 'write_content replace sans version : refusé');
  const v2 = /version ("[0-9a-f]{8}")/.exec((await call('user1', 'read_content', { id: 'guide-1b' })).text)[1];
  ok(!(await call('user1', 'write_content', { id: 'guide-1b', mode: 'replace', markdown: '# Tout neuf\n\nEn une ligne.', version: v2 })).error && file('guide-1b') === '---\ntitle: Guide 1B — Départ\nicon: 🧳\n---\n\n# Tout neuf\n\nEn une ligne.\n', 'write_content replace avec la version lue : frontmatter gardé');
  ok((await call('user2', 'write_content', { id: 'guide-1a', mode: 'append', markdown: 'Intrus.' })).error && !file('guide-1a').includes('Intrus'), 'write_content sur le contenu d’un autre : refusé');
  ok(Blocks.lint(file('guide-1a')).length === 0 && Blocks.lint(file('guide-1b')).length === 0, 'ce que l’IA a écrit : l’éditeur le relit sans bloc source');
  ok((await call('user1', 'lint', { markdown: ':::html\n<p>x</p>' })).text.includes('non fermé'), 'lint : problème signalé');
  ok((await fetch(BASE + 'mcp', { method: 'POST', headers: { Authorization: 'Bearer demo-user1' }, body: 'x'.repeat(3 * 1024 * 1024) })).status === 413, 'HTTP : demande de plus de 2 Mo refusée (413)');

  // stdio (Claude Code en local) : BQ_URL + BQ_TOKEN, un message par ligne ; l'auteur prend le nom du client.
  const child = spawn('node', [path.join(ROOT, 'mcp/blockquilt-mcp.js')], { env: { ...process.env, BQ_URL: BASE, BQ_TOKEN: 'demo-user2' } });
  const lines = [];
  let buf = '';
  child.stdout.on('data', (d) => { buf += d; let i; while ((i = buf.indexOf('\n')) >= 0) { lines.push(JSON.parse(buf.slice(0, i))); buf = buf.slice(i + 1); } });
  const say = (m) => child.stdin.write(JSON.stringify(m) + '\n');
  say({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'claude-code', version: '1' } } });
  say({ jsonrpc: '2.0', method: 'notifications/initialized' });
  say({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'write_content', arguments: { id: 'guide-2a', mode: 'append', markdown: 'Bonne montagne !' } } });
  for (let i = 0; i < 40 && lines.length < 2; i++) await new Promise((r) => setTimeout(r, 100));
  child.kill();
  ok(lines.length === 2 && lines[0].result.serverInfo.name === 'blockquilt' && !lines[1].result.isError, 'stdio : initialize puis un outil, une réponse par ligne, aucune pour la notification');
  ok(file('guide-2a').endsWith('Bonne montagne !\n') && JSON.parse(fs.readFileSync(path.join(data, 'contents', 'guide-2a.json'), 'utf8')).by === 'user2 (via claude-code)', 'stdio : écrit avec le jeton de user2, auteur « via claude-code »');
} catch (error) {
  ok(false, error.stack);
} finally {
  server.kill();
  fs.rmSync(data, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
