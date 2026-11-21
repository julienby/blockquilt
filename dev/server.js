// Serveur de démo et de test, Node seul (aucune dépendance).
// Sert les fichiers du projet, imite les échanges que l'éditeur attend d'un serveur (api/…) et l'application de référence (dev/app.js).
// PORT (8080) et DATA_DIR (dev/data) se règlent par l'environnement.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const dns = require('node:dns');
const https = require('node:https');
const net = require('node:net');
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

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' };
// Les seuls fichiers du projet servis : ceux que le navigateur charge pour l'éditeur (liste blanche).
const PUBLIC = /^(blockquilt(-editor|-content)?\.(js|css)|emoji\.json|editor\/[a-z-]+\.js|fonts\/[a-z-]+\.woff2)$/;
// Photos acceptées, reconnues à leurs premiers octets (pas au type déclaré par le navigateur).
const IMAGES = [['image/jpeg', /^\xff\xd8\xff/], ['image/png', /^\x89PNG\r\n\x1a\n/], ['image/gif', /^GIF8[79]a/], ['image/webp', /^RIFF[\s\S]{4}WEBP/]];
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// no-cache : le navigateur revérifie chaque fichier, une démo mise à jour n'est jamais servie à moitié depuis le cache.
const send = (res, code, type, body) => { res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-cache' }); res.end(body); };
const json = (res, code, data) => send(res, code, 'application/json', JSON.stringify(data));

// Corps reçu, arrêté dès qu'il dépasse max octets (413) : jamais chargé en entier en mémoire.
const read = async (req, max) => {
  const parts = [];
  let size = 0;
  for await (const p of req) {
    size += p.length;
    if (size > max) throw Object.assign(new Error(`Envoi trop gros : ${Math.round(max / 1024 / 1024)} Mo au plus`), { status: 413 });
    parts.push(p);
  }
  return Buffer.concat(parts);
};
// Formulaire multipart reçu → FormData (le parseur de fetch, intégré à Node). 1 Mo au plus, sauf photo.
const form = async (req, max = 1024 * 1024) => new Request('http://local' + req.url, { method: 'POST', headers: req.headers, body: await read(req, max) }).formData();

// ---- Import d'une image par son adresse : garde-fous contre le SSRF (le serveur ne doit atteindre que l'Internet public) ----
const MAX_PHOTO = 5 * 1024 * 1024;
// Adresse IP publique : ni locale, ni privée, ni réservée (IPv4, IPv6, IPv4 dans IPv6).
const publicIp = (ip) => {
  const v4 = net.isIPv4(ip) ? ip : (/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip) || [])[1];
  if (v4) {
    const [a, b] = v4.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b < 128) || (a === 169 && b === 254)
      || (a === 172 && b >= 16 && b < 32) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)));
  }
  const x = ip.toLowerCase();
  return net.isIPv6(x) && !(x === '::' || x === '::1' || x.startsWith('::ffff:') || /^(f[cd]|fe[89ab]|ff)/.test(x));
};
// Résolution DNS vérifiée : la connexion se fait vers l'adresse contrôlée ici (pas de seconde résolution, pas de « DNS rebinding »).
const lookup = (host, opts, cb) => dns.lookup(host, { all: true }, (err, list) => {
  if (err) return cb(err);
  if (!list.length || !list.every((a) => publicIp(a.address))) return cb(Object.assign(new Error('Adresse non publique'), { code: 'EPRIVATE' }));
  if (opts.all) cb(null, list); else cb(null, list[0].address, list[0].family);
});
// Image téléchargée : https sur le port 443, sans identifiants, 3 redirections, 10 s et 5 Mo au plus. Erreur : status 422.
const fetchImage = (raw, hops = 3) => new Promise((resolve, reject) => {
  const fail = (message) => reject(Object.assign(new Error(message), { status: 422 }));
  let u;
  try { u = new URL(raw); } catch { return fail('Adresse invalide'); }
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (u.protocol !== 'https:' || u.port || u.username || u.password) return fail('Adresse https attendue, sans port ni identifiant');
  if (net.isIP(host) && !publicIp(host)) return fail('Adresse non publique'); // une adresse IP écrite ne passe pas par lookup
  const req = https.get(u, { lookup, signal: AbortSignal.timeout(10000), headers: { 'User-Agent': 'blockquilt', Accept: 'image/*' } }, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      res.resume();
      if (!hops) return fail('Trop de redirections');
      return fetchImage(new URL(res.headers.location, u).href, hops - 1).then(resolve, reject);
    }
    if (res.statusCode !== 200) { res.resume(); return fail(`Image introuvable (${res.statusCode})`); }
    const parts = [];
    let size = 0;
    res.on('data', (p) => {
      size += p.length;
      if (size > MAX_PHOTO) { req.destroy(); fail('Photo trop grosse : 5 Mo au plus'); } else parts.push(p);
    });
    res.on('end', () => resolve(Buffer.concat(parts)));
    res.on('error', () => fail('Téléchargement interrompu'));
  });
  req.on('error', (e) => fail(e.code === 'EPRIVATE' ? 'Adresse non publique' : 'Téléchargement impossible'));
});

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
    // Opérations : une consigne qui commence par « @@ » est renvoyée telle quelle (essais) ;
    // sinon blocs 1 et 2 en majuscules, un paragraphe à la fin.
    if (instruction.startsWith('@@')) return instruction;
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
  // Photo : JPEG, PNG, GIF ou WebP de 5 Mo au plus, gardée telle quelle, réponse JSON { id }.
  // Envoyée (`photo`, un fichier) ou téléchargée par le serveur (`url`, l'adresse https d'une image collée).
  'POST /api/upload': async (req, res) => {
    const data = await form(req, MAX_PHOTO + 64 * 1024);
    const url = data.get('url');
    const file = data.get('photo');
    let bytes;
    if (typeof url === 'string' && url) bytes = await fetchImage(url);
    else {
      if (!file || typeof file === 'string') return json(res, 422, { error: 'Image attendue' });
      if (file.size > MAX_PHOTO) return json(res, 413, { error: 'Photo trop grosse : 5 Mo au plus' });
      bytes = Buffer.from(await file.arrayBuffer());
    }
    const type = IMAGES.find(([, magic]) => magic.test(bytes.subarray(0, 12).toString('latin1')))?.[0];
    if (!type) return json(res, 422, { error: 'Image attendue : JPEG, PNG, GIF ou WebP' });
    const id = crypto.randomBytes(6).toString('hex');
    fs.writeFileSync(path.join(MEDIA, id), bytes);
    fs.writeFileSync(path.join(MEDIA, id + '.type'), type);
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
    // Fichiers du projet : seulement ceux de la liste blanche.
    const name = url.pathname.slice(1);
    const file = path.join(ROOT, name);
    if (!PUBLIC.test(name) || !fs.existsSync(file)) return send(res, 404, 'text/plain', 'Introuvable');
    send(res, 200, TYPES[path.extname(file)], fs.readFileSync(file));
  } catch (error) {
    // Erreur prévue (envoi trop gros…) : JSON { error }, comme les autres réponses de api/.
    if (error.status) return json(res, error.status, { error: error.message });
    send(res, 500, 'text/plain', String(error.message));
  }
});
server.listen(PORT, () => console.log(`blockquilt : http://localhost:${PORT}/ (données : ${DATA})`));
