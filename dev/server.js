// Serveur de démo et de test, Node seul (aucune dépendance).
// Sert les fichiers du projet, imite les échanges que l'éditeur attend d'un serveur (api/…) et l'application de référence (dev/app.js).
// PORT (8080) et DATA_DIR (dev/data) se règlent par l'environnement.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const Blocks = require('../blockquilt.js');
const application = require('./app.js');
const { httpHandler } = require('../mcp/blockquilt-mcp.js');
const { createAi } = require('../ai/blockquilt-ai.js');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);
const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DOC = path.join(DATA, 'document.md');
const MEDIA = path.join(DATA, 'media');
fs.mkdirSync(MEDIA, { recursive: true });
// Application de référence : contenus, utilisateurs, jetons, contrat HTTP (/contents) et sa page (/app).
const reference = application(DATA);
// Serveur MCP (transport HTTP) : un client du contrat /contents de cette même application, avec le jeton du client MCP.
const mcp = httpHandler({ base: `http://127.0.0.1:${PORT}/` });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml' };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// no-cache : le navigateur revérifie chaque fichier, une démo mise à jour n'est jamais servie à moitié depuis le cache.
const send = (res, code, type, body) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(body); };
const json = (res, code, data) => send(res, code, 'application/json', JSON.stringify(data));

// Formulaire multipart reçu → FormData (le parseur de fetch, intégré à Node).
const form = (req) => new Request('http://local' + req.url, { method: 'POST', headers: req.headers, body: req, duplex: 'half' }).formData();

// La démo : index.html, avec le dernier document enregistré dans le champ source s'il existe.
const page = () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!fs.existsSync(DOC)) return html;
  return html.replace(/(<textarea id="source" hidden>)[\s\S]*?(<\/textarea>)/, (_, open, close) => open + esc(fs.readFileSync(DOC, 'utf8')) + close);
};

// IA : le relais générique (ai/blockquilt-ai.js), compatible OpenAI. Avec AI_KEY (ou OPENROUTER_API_KEY), un vrai modèle
// (AI_BASE_URL, OpenRouter par défaut ; AI_MODEL) ; sans clé, une transformation fixe et prévisible (texte en majuscules).
const shout = (markdown) => {
  const up = (html) => html.replace(/(^|>)([^<]+)/g, (_, a, t) => a + Blocks.esc(Blocks.unesc(t).toUpperCase()));
  const { meta, blocks } = Blocks.parse(markdown);
  return Blocks.serialize(meta, blocks.map((b) => ({ ...b, ...(b.html !== undefined && b.type !== 'html' ? { html: up(b.html) } : {}), ...(b.title ? { title: b.title.toUpperCase() } : {}) })));
};
const ai = createAi({
  baseUrl: process.env.AI_BASE_URL || 'https://openrouter.ai/api/v1',
  apiKey: process.env.AI_KEY || process.env.OPENROUTER_API_KEY,
  model: process.env.AI_MODEL || 'anthropic/claude-sonnet-4.5',
  headers: { 'X-Title': 'blockquilt (démo)' },
  // OpenRouter : réflexion courte (AI_REASONING : low par défaut, medium, high, ou none pour ne rien demander).
  params: !/openrouter\.ai/.test(process.env.AI_BASE_URL || 'openrouter.ai') || process.env.AI_REASONING === 'none' ? {} : { reasoning: { effort: process.env.AI_REASONING || 'low' } },
  uses: [
    { id: 'corriger', label: 'Corriger', instruction: 'Corrige l’orthographe et la grammaire, sans changer le sens ni la structure.' },
    { id: 'raccourcir', label: 'Raccourcir', instruction: 'Raccourcis le texte en gardant l’essentiel.' },
    { id: 'etapes', label: 'En étapes', instruction: 'Réécris sous forme d’étapes numérotées.', output: 'document' },
    { id: 'traduire', label: 'En anglais', instruction: 'Traduis en anglais, en gardant la structure et les emoji.' },
  ],
  // Démo publique : limites basses. Personne = son jeton (Bearer ou cookie bq_token de /app), sinon son adresse IP
  // (X-Forwarded-For posé par Caddy). Garder aussi une limite de crédit sur la clé OpenRouter.
  limits: { maxChars: 20000, perUserDay: 50000, globalDay: 500000 },
  userOf: (req) => /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1]
    || /(?:^|;\s*)bq_token=([^;]+)/.exec(req.headers.cookie || '')?.[1]
    || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket.remoteAddress,
  // Démo : « non fermé » dans la consigne donne une réponse fautive, pour essayer les alertes.
  fallback: ({ scope, instruction, text, block, blocks, output }) => {
    const broken = /non fermé/i.test(instruction) ? '\n:::html\n<p>bloc sans fin</p>\n' : '';
    if (output === 'document') return shout(scope === 'block' ? block : text) + broken;
    // Opérations : « rien » dans la consigne → rien à changer ; sinon blocs 1 et 2 en majuscules, un paragraphe à la fin.
    if (/rien/i.test(instruction)) return '@@ rien';
    const last = blocks.length - 1;
    return [1, 2].filter((n) => n <= last).map((n) => `@@ remplacer ${n}\n${shout(blocks[n]).trim()}\n`)
      .concat(`@@ après ${last}\nParagraphe ajouté par l’IA de démo.${broken}`).join('\n');
  },
});

const routes = {
  // IA : GET → usages proposés ; POST → { markdown } ou { operations } (contrat dans ai/blockquilt-ai.js).
  'GET /api/ai': (req, res) => ai.handler(req, res),
  'POST /api/ai': (req, res) => ai.handler(req, res),
  // Enregistrer : le Markdown complet (champ `text`), réponse JSON { ok: true }.
  'POST /api/save': async (req, res) => {
    const data = await form(req);
    // Un formulaire multipart envoie les fins de ligne en \r\n (règle HTML) : on les remet en \n.
    const text = String(data.get('text') ?? '').replace(/\r\n/g, '\n');
    if (text.trim() === '') return json(res, 422, { error: 'Texte vide' });
    fs.writeFileSync(DOC, text);
    json(res, 200, { ok: true });
  },
  // Aperçu : un fragment HTML, rendu par Blocks.toHtml (le même rendu que l'éditeur fait seul sans data-preview).
  'POST /api/preview': async (req, res) => {
    const data = await form(req);
    send(res, 200, 'text/html; charset=utf-8', Blocks.toHtml(String(data.get('text') ?? '').replace(/\r\n/g, '\n'), { media: 'media/' }));
  },
  // Photo : le fichier est gardé tel quel, réponse JSON { id }.
  'POST /api/upload': async (req, res) => {
    const file = (await form(req)).get('photo');
    if (!file || typeof file === 'string' || !file.type.startsWith('image/')) return json(res, 422, { error: 'Image attendue' });
    const id = crypto.randomBytes(6).toString('hex');
    fs.writeFileSync(path.join(MEDIA, id), Buffer.from(await file.arrayBuffer()));
    fs.writeFileSync(path.join(MEDIA, id + '.type'), file.type);
    json(res, 200, { id });
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  try {
    const route = routes[`${req.method} ${url.pathname}`];
    if (route) return await route(req, res);
    if (await reference.contents(req, res, url.pathname)) return;
    if (url.pathname === '/mcp') return await mcp(req, res);
    if (req.method === 'GET' && url.pathname === '/app') return reference.app(req, res, url, fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'));
    if (req.method !== 'GET') return send(res, 405, 'text/plain', 'Méthode refusée');
    if (url.pathname === '/') return send(res, 200, TYPES['.html'], page());
    const media = /^\/media\/([a-f0-9]{12})$/.exec(url.pathname);
    if (media) {
      // Photos envoyées, sinon photos du document de démo (dev/demo-media).
      const file = [path.join(MEDIA, media[1]), path.join(__dirname, 'demo-media', media[1])].find((f) => fs.existsSync(f)) || path.join(MEDIA, media[1]);
      if (!fs.existsSync(file)) return send(res, 404, 'text/plain', 'Introuvable');
      return send(res, 200, fs.readFileSync(file + '.type', 'utf8'), fs.readFileSync(file));
    }
    // Fichiers du projet : jamais en dehors de ROOT, jamais dev/ ni .git/.
    const file = path.resolve(ROOT, '.' + decodeURIComponent(url.pathname));
    const inside = file.startsWith(ROOT + path.sep) && !/^(dev|\.git)(\/|$)/.test(path.relative(ROOT, file));
    if (!inside || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'text/plain', 'Introuvable');
    send(res, 200, TYPES[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file));
  } catch (error) {
    send(res, 500, 'text/plain', String(error.message));
  }
});
server.listen(PORT, () => console.log(`blockquilt : http://localhost:${PORT}/ (données : ${DATA})`));
