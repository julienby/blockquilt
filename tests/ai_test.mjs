// Relais IA (ai/blockquilt-ai.js) contre un faux fournisseur compatible OpenAI. node tests/ai_test.mjs → exit 1 si rouge.
import http from 'node:http';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createAi } = require('../ai/blockquilt-ai.js');
let failed = 0;
const ok = (cond, label) => { console.log((cond ? 'ok   ' : 'FAIL ') + label); if (!cond) failed++; };

// Faux fournisseur : garde la dernière requête, répond ce qu'on lui dit.
let last = null;
let answer = { status: 200, body: { choices: [{ message: { content: '```markdown\n> [!tip]\n> Réponse.\n```' } }] } };
const upstream = http.createServer(async (req, res) => {
  const parts = []; for await (const p of req) parts.push(p);
  last = { url: req.url, auth: req.headers.authorization, title: req.headers['x-title'], body: JSON.parse(Buffer.concat(parts).toString('utf8')) };
  res.writeHead(answer.status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(answer.body));
});
await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${upstream.address().port}/v1/`;
const uses = [
  { id: 'corriger', label: 'Corriger', instruction: 'Corrige l’orthographe.' },
  { id: 'resumer', label: 'Résumer', instruction: 'Résume.', model: 'petit/modele', scopes: ['document'], params: { reasoning: { effort: 'high' } } },
];
const ai = createAi({ baseUrl, apiKey: 'cle-secrete', model: 'grand/modele', uses, headers: { 'X-Title': 'essai' }, params: { reasoning: { effort: 'low' }, temperature: 0.2 } });

// Relais monté sur un serveur, comme dans une application.
const app = http.createServer((req, res) => ai.handler(req, res));
await new Promise((r) => app.listen(0, '127.0.0.1', r));
const APP = `http://127.0.0.1:${app.address().port}/`;
const post = (fields) => { const f = new FormData(); for (const [k, v] of Object.entries(fields)) f.set(k, v); return fetch(APP, { method: 'POST', body: f }).then(async (r) => ({ status: r.status, ...(await r.json()) })); };

try {
  const list = await (await fetch(APP)).json();
  ok(JSON.stringify(list) === JSON.stringify({ uses: [{ id: 'corriger', label: 'Corriger', scopes: ['document', 'block'] }, { id: 'resumer', label: 'Résumer', scopes: ['document'] }] }), 'GET : les usages (id, libellé, portée), sans consigne ni modèle');

  const r1 = await post({ scope: 'block', use: 'corriger', instruction: 'plus court', text: '# Doc\r\n\r\nTexte.', block: 'Texte.' });
  ok(r1.status === 200 && r1.markdown === '> [!tip]\n> Réponse.\n', 'POST : Markdown du modèle, bloc de code autour retiré, fin de ligne');
  ok(last.url === '/v1/chat/completions' && last.auth === 'Bearer cle-secrete' && last.title === 'essai', 'appel compatible OpenAI : /chat/completions, clé côté serveur, en-têtes en plus');
  ok(last.body.model === 'grand/modele' && last.body.messages[0].role === 'system' && last.body.messages[0].content.includes('Tâche : Corrige l’orthographe.') && last.body.messages[0].content.includes('> [!tip]'), 'consigne système : tâche de l’usage + FORMAT.md ; modèle par défaut');
  ok(last.body.max_tokens === 16000 && last.body.reasoning.effort === 'low' && last.body.temperature === 0.2, 'paramètres en plus (réflexion…) et longueur maximale de 16 000');
  const user = last.body.messages[1].content;
  ok(user.includes('Bloc à modifier :\n\nTexte.') && user.includes('Consigne : plus court') && user.includes('# Doc\n\nTexte.') && user.endsWith('remplacent ce bloc.'), 'message : document pour le contexte, bloc, consigne précisée ; \\r\\n remis en \\n');
  await post({ scope: 'document', use: 'resumer', text: 'Texte.' });
  ok(last.body.model === 'petit/modele' && last.body.messages[1].content.endsWith('frontmatter compris.') && !last.body.messages[1].content.includes('Consigne'), 'usage avec son propre modèle, sur le document');
  ok(last.body.reasoning.effort === 'high' && last.body.temperature === 0.2, 'paramètres d’un usage : devant ceux de tous les usages');

  ok((await post({ scope: 'block', use: 'resumer', text: 'T', block: 'T' })).status === 400, 'usage hors de sa portée : 400');
  ok((await post({ scope: 'document', use: 'inconnu', text: 'T' })).error === 'Usage inconnu : inconnu', 'usage inconnu : 400');
  ok((await post({ scope: 'document', text: 'T' })).status === 400, 'ni usage ni consigne : 400');
  ok((await post({ scope: 'block', instruction: 'x', text: 'T', block: '' })).status === 400, 'bloc vide : 400');
  answer = { status: 429, body: { error: { message: 'Trop de requêtes' } } };
  const r2 = await post({ scope: 'document', instruction: 'x', text: 'T' });
  ok(r2.status === 502 && r2.error === 'Trop de requêtes', 'erreur du fournisseur : 502 avec son message');
  answer = { status: 200, body: { choices: [{ finish_reason: 'length', message: { content: '---\ntitle: Guide 1' } }] } };
  const cut = await post({ scope: 'document', instruction: 'x', text: 'T' });
  ok(cut.status === 502 && cut.error.startsWith('Réponse coupée') && !cut.markdown, 'réponse coupée par la longueur maximale : refusée, jamais renvoyée');
  answer = { status: 200, body: { choices: [{ finish_reason: 'length', message: { content: '', reasoning: '…' } }] } };
  ok((await post({ scope: 'document', instruction: 'x', text: 'T' })).error.includes('à réfléchir, sans répondre'), 'longueur épuisée à réfléchir : message clair');
  answer = { status: 200, body: { choices: [{ message: { content: '  ' } }] } };
  ok((await post({ scope: 'document', instruction: 'x', text: 'T' })).status === 502, 'réponse vide : 502');
  const json = await fetch(APP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'document', instruction: 'x', text: 'T' }) });
  ok(json.status === 502, 'POST JSON accepté aussi');

  const demo = createAi({ baseUrl, apiKey: '', model: 'm', uses, fallback: ({ scope, use, text }) => `${scope}:${use}:${text}` });
  ok(await demo.complete({ scope: 'document', use: 'corriger', text: 'T' }) === 'document:corriger:T', 'sans clé : la réponse de repli de l’application');
  ok(await createAi({ baseUrl, model: 'm' }).complete({ scope: 'document', instruction: 'x', text: 'T' }).then(() => false, (e) => e.status === 502), 'sans clé ni repli : 502');
} catch (error) {
  ok(false, error.stack);
} finally {
  upstream.close(); app.close();
}
process.exit(failed ? 1 : 0);
