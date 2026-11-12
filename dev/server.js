// Serveur de démo et de test, Node seul (aucune dépendance).
// Sert les fichiers du projet et imite les trois échanges que blockquilt.js attend d'un serveur.
// PORT (8080) et DATA_DIR (dev/data) se règlent par l'environnement.
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT || 8080);
const DATA = path.resolve(process.env.DATA_DIR || path.join(__dirname, 'data'));
const DOC = path.join(DATA, 'document.md');
const MEDIA = path.join(DATA, 'media');
fs.mkdirSync(MEDIA, { recursive: true });

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.md': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml' };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const send = (res, code, type, body) => { res.writeHead(code, { 'Content-Type': type }); res.end(body); };
const json = (res, code, data) => send(res, code, 'application/json', JSON.stringify(data));

// Formulaire multipart reçu → FormData (le parseur de fetch, intégré à Node).
const form = (req) => new Request('http://local' + req.url, { method: 'POST', headers: req.headers, body: req, duplex: 'half' }).formData();

// La démo : index.html, avec le dernier document enregistré dans le champ source s'il existe.
const page = () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  if (!fs.existsSync(DOC)) return html;
  return html.replace(/(<textarea data-source hidden>)[\s\S]*?(<\/textarea>)/, (_, open, close) => open + esc(fs.readFileSync(DOC, 'utf8')) + close);
};

const routes = {
  // Enregistrer : le Markdown complet, réponse JSON { slug }.
  'POST /api/save': async (req, res) => {
    const data = await form(req);
    // Un formulaire multipart envoie les fins de ligne en \r\n (règle HTML) : on les remet en \n.
    const text = String(data.get('text') ?? '').replace(/\r\n/g, '\n');
    if (text.trim() === '') return json(res, 422, { error: 'Texte vide' });
    fs.writeFileSync(DOC, text);
    json(res, 200, { slug: String(data.get('slug') ?? '') });
  },
  // Aperçu : un fragment HTML. Le vrai rendu Markdown appartient au projet hôte ; ici, le texte brut suffit.
  'POST /api/preview': async (req, res) => {
    const data = await form(req);
    send(res, 200, 'text/html; charset=utf-8', `<pre class="whitespace-pre-wrap text-sm">${esc(String(data.get('text') ?? ''))}</pre>`);
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
    if (req.method !== 'GET') return send(res, 405, 'text/plain', 'Méthode refusée');
    if (url.pathname === '/') return send(res, 200, TYPES['.html'], page());
    const media = /^\/media\/([a-f0-9]{12})$/.exec(url.pathname);
    if (media) {
      const file = path.join(MEDIA, media[1]);
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
