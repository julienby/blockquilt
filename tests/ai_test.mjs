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
  if (answer.delay) await new Promise((r) => setTimeout(r, answer.delay));
  if (res.destroyed) return;
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

  // F5 : limites. Taille envoyée, jetons par personne et pour tout le site, d'après `usage` ; remis à zéro à minuit.
  let clock = new Date('2026-11-16T10:00:00');
  const lim = createAi({ baseUrl, apiKey: 'k', model: 'm', limits: { maxChars: 50, perUserDay: 100, globalDay: 250 }, now: () => clock, fallback: () => 'repli\n' });
  const asks = (user, more = {}) => lim.complete({ scope: 'document', instruction: 'x', text: 'T', ...more }, user).then(() => 200, (e) => e.status + ' ' + e.message);
  answer = { status: 200, body: { choices: [{ message: { content: 'ok' } }], usage: { total_tokens: 60 } } };
  const big = await asks('ana', { text: 'a'.repeat(50) });
  ok(big.startsWith('413 ') && big.includes('51 caractères') && big.includes('50 au plus'), 'maxChars : texte + bloc + consigne au-delà → 413, message avec les nombres (' + big + ')');
  ok(await asks('ana') === 200 && await asks('ana') === 200, 'perUserDay : sous la limite, les demandes passent');
  const full = await asks('ana');
  ok(full.startsWith('429 ') && full.includes('Votre limite'), 'perUserDay : 120 jetons comptés sur 100 → 429 pour cette personne (' + full + ')');
  ok(await asks('bob') === 200 && await asks('bob') === 200, 'perUserDay : une autre personne a son propre compteur');
  ok(await asks('cyd') === 200, 'globalDay : 240 jetons comptés sur 250, la demande passe');
  const site = await asks('dan');
  ok(site.startsWith('429 ') && site.includes('du site'), 'globalDay : 300 jetons comptés sur 250 → 429 pour tout le monde (' + site + ')');
  ok(await asks(null).then((x) => x.startsWith('429 ')), 'sans personne connue : le plafond global s’applique quand même');
  clock = new Date('2026-11-17T00:00:01');
  ok(await asks('ana') === 200, 'minuit passé : compteurs remis à zéro');
  answer = { status: 200, body: { choices: [{ finish_reason: 'length', message: { content: 'coupé' } }], usage: { total_tokens: 60 } } };
  await asks('ana');
  answer = { status: 200, body: { choices: [{ message: { content: 'ok' } }], usage: { total_tokens: 60 } } };
  ok((await asks('ana')).startsWith('429 '), 'réponse refusée (coupée) : ses jetons comptent quand même');
  const free = createAi({ baseUrl, apiKey: '', model: 'm', limits: { maxChars: 5, perUserDay: 1, globalDay: 1 }, fallback: () => 'repli\n' });
  ok(await free.complete({ scope: 'document', instruction: 'x', text: 'T' }, 'ana').then((r) => r.markdown) === 'repli\n' && await free.complete({ scope: 'document', instruction: 'x', text: 'T' }, 'ana').then((r) => r.markdown) === 'repli\n', 'réponse de repli : aucun jeton compté');
  ok(await free.complete({ scope: 'document', instruction: 'x', text: 'T'.repeat(9) }).then(() => false, (e) => e.status === 413), 'réponse de repli : maxChars s’applique quand même');
  // Par HTTP : la personne vient de userOf(req), le jeton Bearer par défaut.
  const limApp = http.createServer((req, res) => lim.handler(req, res));
  await new Promise((r) => limApp.listen(0, '127.0.0.1', r));
  clock = new Date('2026-11-18T09:00:00');
  const asHttp = (token) => fetch(`http://127.0.0.1:${limApp.address().port}/`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ scope: 'document', instruction: 'x', text: 'T' }) }).then(async (r) => r.status + ' ' + ((await r.json()).error || ''));
  const seen = [await asHttp('jo'), await asHttp('jo'), await asHttp('jo'), await asHttp('li')];
  limApp.close();
  ok(seen[0].startsWith('200') && seen[1].startsWith('200') && seen[2].startsWith('429 Votre limite') && seen[3].startsWith('200'), 'HTTP : compteur par jeton Bearer, 429 avec { error } (' + seen.join(' | ') + ')');

  // A2 : document en blocs numérotés (champ `blocks`) → réponse en opérations, { operations } au lieu de { markdown }.
  answer = { status: 200, body: { choices: [{ message: { content: '```\n@@ remplacer 2\nC\n```' } }] } };
  const sent = ['---\ntitle: T\n---', '# A', 'B'];
  const op = await post({ scope: 'document', instruction: 'corrige', text: 'texte entier', blocks: JSON.stringify(sent) });
  ok(op.status === 200 && op.operations === '@@ remplacer 2\nC\n' && op.markdown === undefined, 'blocks envoyés : { operations }, bloc de code autour retiré (' + JSON.stringify(op) + ')');
  const sys = last.body.messages[0].content, usr = last.body.messages[1].content;
  ok(sys.includes('@@ remplacer') && sys.includes('@@ supprimer') && sys.includes('> [!tip]'), 'opérations : consigne système = format des opérations + FORMAT.md');
  ok(usr.includes('[0]\n---\ntitle: T\n---') && usr.includes('[1]\n# A') && usr.includes('[2]\nB') && !usr.includes('texte entier') && usr.includes('Consigne : corrige'), 'opérations : document numéroté depuis `blocks` (0 = frontmatter), pas le texte entier');
  await post({ scope: 'document', instruction: 'x', text: 'T', blocks: JSON.stringify(['', 'B']) });
  ok(last.body.messages[1].content.includes('[0]\n(pas de frontmatter)'), 'opérations : bloc 0 vide → « (pas de frontmatter) »');
  answer = { status: 200, body: { choices: [{ message: { content: '' } }] } };
  const none = await post({ scope: 'document', instruction: 'x', text: 'T', blocks: JSON.stringify(sent) });
  ok(none.status === 200 && none.operations === '', 'opérations : réponse vide valide (rien à changer)');
  answer = { status: 200, body: { choices: [{ message: { content: 'Réécrit.' } }] } };
  const whole = await createAi({ baseUrl, apiKey: 'k', model: 'm', uses: [{ id: 'etapes', label: 'En étapes', instruction: 'En étapes.', output: 'document' }] })
    .complete({ scope: 'document', use: 'etapes', text: 'T', blocks: sent });
  ok(whole.markdown === 'Réécrit.\n' && last.body.messages[1].content.includes('Document :\n\nT'), 'usage output: document : document entier, même avec blocks');
  ok((await post({ scope: 'document', instruction: 'x', text: 'T' })).markdown === 'Réécrit.\n', 'sans blocks : document entier, comme avant');
  ok((await post({ scope: 'block', instruction: 'x', text: 'T', block: 'B', blocks: JSON.stringify(sent) })).markdown === 'Réécrit.\n', 'sur un bloc : rien ne change');
  ok((await post({ scope: 'document', instruction: 'x', text: 'T', blocks: '{"a":1}' })).error === 'blocks : liste JSON de textes attendue', 'blocks mal formé : 400');
  // C4 : `range` (blocs collés) → l'IA ne modifie que ces blocs ; numéros hors du document envoyé → 400.
  answer = { status: 200, body: { choices: [{ message: { content: '@@ rien' } }] } };
  await post({ scope: 'document', instruction: 'résume', text: 'T', blocks: JSON.stringify(sent), range: '1-2' });
  ok(last.body.messages[1].content.includes('Ne modifie que les blocs 1 à 2'), 'range : la consigne limite les opérations aux blocs collés');
  await post({ scope: 'document', instruction: 'résume', text: 'T', blocks: JSON.stringify(sent) });
  ok(!last.body.messages[1].content.includes('Ne modifie que'), 'sans range : tout le document');
  const badRange = await Promise.all(['0-1', '2-1', '1-3', 'x'].map((range) => post({ scope: 'document', instruction: 'x', text: 'T', blocks: JSON.stringify(sent), range })));
  ok(badRange.every((r) => r.status === 400 && r.error === 'range : « a-b », numéros de blocs du document envoyé'), 'range invalide : 400 (' + badRange.map((r) => r.status).join() + ')');
  const small = createAi({ baseUrl, apiKey: 'k', model: 'm', limits: { maxChars: 20 } });
  ok(await small.complete({ scope: 'document', instruction: 'x', text: 'T', blocks: ['', 'a'.repeat(30)] }).then(() => false, (e) => e.status === 413), 'opérations : maxChars compte les blocs envoyés');
  let seenAsk = null;
  const fb = await createAi({ baseUrl, apiKey: '', model: 'm', fallback: (a) => { seenAsk = a; return '@@ supprimer 1'; } }).complete({ scope: 'document', instruction: 'x', text: 'T', blocks: sent });
  ok(fb.operations === '@@ supprimer 1' && seenAsk.output === 'operations' && seenAsk.blocks.length === 3, 'sans clé : la réponse de repli reçoit output et blocks');

  const demo = createAi({ baseUrl, apiKey: '', model: 'm', uses, fallback: ({ scope, use, text }) => `${scope}:${use}:${text}` });
  ok(await demo.complete({ scope: 'document', use: 'corriger', text: 'T' }).then((r) => r.markdown) === 'document:corriger:T', 'sans clé : la réponse de repli de l’application');
  ok(await createAi({ baseUrl, model: 'm' }).complete({ scope: 'document', instruction: 'x', text: 'T' }).then(() => false, (e) => e.status === 502), 'sans clé ni repli : 502');

  // Fournisseur trop lent : la demande s'arrête au délai maximal.
  answer = { ...answer, delay: 500 };
  const slow = await createAi({ baseUrl, apiKey: 'k', model: 'm', timeout: 100 }).complete({ scope: 'document', instruction: 'x', text: 'T' }).then(() => null, (e) => e);
  ok(slow?.status === 504 && slow.message.includes('trop lent'), 'fournisseur trop lent : 504 au délai maximal');
  delete answer.delay;
  const huge = await fetch(APP, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'document', instruction: 'x', text: 'a'.repeat(2_100_000) }) });
  ok(huge.status === 413 && (await huge.json()).error.includes('trop gros'), 'corps reçu de plus de 2 Mo : 413, sans le lire en entier');
} catch (error) {
  ok(false, error.stack);
} finally {
  upstream.close(); app.close();
}
process.exit(failed ? 1 : 0);
