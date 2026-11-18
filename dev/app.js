// Application de référence (démo) : ce qu'une application fournit à blockquilt, ici avec des fichiers .md et deux utilisateurs.
// Contrat HTTP hypermédia (voir PLAN.md §5 et README « Contenus ») :
//   GET  /contents        → liste (HTML : liens, fragment si HX-Request ; JSON si Accept: application/json)
//   GET  /contents/{id}   → text/markdown (+ ETag) ou text/html (rendu Blocks.toHtml)
//   PUT  /contents/{id}   → text/markdown, If-Match obligatoire ; 204 + ETag · 412 changé · 428 sans If-Match · 403 · 401
// Jeton : « Authorization: Bearer … » (IA, MCP, scripts) ou cookie bq_token (navigateur). Seule l'application sait
// qui est derrière un jeton et ce qu'il peut toucher : blockquilt n'en sait rien.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Blocks = require('../blockquilt.js');

// Démo seulement : jetons publics, écrits dans la page /app. Une vraie application a ses comptes et ses jetons révocables.
const USERS = {
  'demo-user1': { name: 'user1', contents: ['guide-1a', 'guide-1b'] },
  'demo-user2': { name: 'user2', contents: ['guide-2a'] },
};
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const esc = Blocks.esc;
const attr = Blocks.attr;

module.exports = (DATA) => {
  const DIR = path.join(DATA, 'contents');
  fs.mkdirSync(DIR, { recursive: true });
  // Contenus de départ (dev/contents) copiés au premier lancement ; ensuite, les fichiers de DATA font foi.
  for (const f of fs.readdirSync(path.join(__dirname, 'contents'))) {
    if (!fs.existsSync(path.join(DIR, f))) fs.copyFileSync(path.join(__dirname, 'contents', f), path.join(DIR, f));
  }

  const file = (id) => path.join(DIR, id + '.md');
  const read = (id) => (ID.test(id) && fs.existsSync(file(id)) ? fs.readFileSync(file(id), 'utf8') : null);
  const etag = (md) => `"${Blocks.hash(md)}"`;
  const info = (id) => {
    const md = read(id);
    let log = {};
    try { log = JSON.parse(fs.readFileSync(path.join(DIR, id + '.json'), 'utf8')); } catch {}
    return { id, title: Blocks.frontmatter(md).meta.title || id, updatedAt: log.at || fs.statSync(file(id)).mtime.toISOString(), updatedBy: log.by || null, etag: etag(md), href: 'contents/' + id };
  };

  const token = (req) => {
    const bearer = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
    if (bearer) return bearer[1];
    return /(?:^|;\s*)bq_token=([^;]+)/.exec(req.headers.cookie || '')?.[1] || null;
  };
  const who = (req) => USERS[token(req)] || null;
  const mine = (user) => user.contents.filter((id) => read(id) !== null);

  const send = (res, code, headers, body = '') => { res.writeHead(code, { 'Cache-Control': 'no-cache', Vary: 'Accept, Authorization, Cookie, HX-Request', ...headers }); res.end(body); };
  const text = (res, code, message) => send(res, code, { 'Content-Type': 'text/plain; charset=utf-8' }, message + '\n');
  const wants = (req, type) => (req.headers.accept || '').includes(type);
  // Corps reçu, arrêté au-delà de 1 Mo (413) : jamais chargé en entier en mémoire.
  const body = async (req) => {
    const parts = [];
    let size = 0;
    for await (const p of req) {
      size += p.length;
      if (size > 1024 * 1024) throw Object.assign(new Error('Texte trop gros : 1 Mo au plus'), { status: 413 });
      parts.push(p);
    }
    return Buffer.concat(parts).toString('utf8');
  };

  // Page complète (navigateur) ou fragment (htmx). `up` remonte à la racine de la démo : les liens restent relatifs, la démo
  // marche aussi sous un préfixe (https://web.byjulien.com/blockquilt/).
  const page = (req, title, main, up = '') => (req.headers['hx-request'] ? main : `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><link rel="stylesheet" href="${up}blockquilt-content.css">
<style>body{max-width:44rem;margin:2rem auto;padding:0 1rem;font-family:system-ui,sans-serif}nav{display:flex;gap:1rem;margin-bottom:1.5rem;font-size:.9rem}</style>
</head><body><nav><a href="${up}app">Application de démo</a><a href="${up}contents">Contenus</a></nav>${main}</body></html>`);

  // GET /contents · GET /contents/{id} · PUT /contents/{id}. Retourne false si l'adresse n'est pas la sienne.
  const contents = async (req, res, pathname) => {
    const m = /^\/contents(?:\/([^/]+))?$/.exec(pathname);
    if (!m) return false;
    const user = who(req);
    if (!user) return text(res, 401, 'Jeton inconnu : « Authorization: Bearer <jeton> »'), true;
    if (!m[1]) {
      if (req.method !== 'GET') return text(res, 405, 'Méthode refusée'), true;
      const list = mine(user).map(info);
      if (wants(req, 'application/json')) return send(res, 200, { 'Content-Type': 'application/json' }, JSON.stringify(list)), true;
      const ul = `<ul class="bq-contents">${list.map((c) => `<li><a href="${attr(c.href)}">${esc(c.title)}</a> · <a href="app?c=${attr(c.id)}">modifier</a></li>`).join('')}</ul>`;
      return send(res, 200, { 'Content-Type': 'text/html; charset=utf-8' }, (req.headers['hx-request'] ? ul : page(req, 'Contenus', `<h1>Contenus de ${esc(user.name)}</h1>${ul}`))), true;
    }
    const id = m[1];
    if (!ID.test(id)) return text(res, 404, 'Contenu introuvable'), true;
    // Un contenu d'un autre : refusé (403), qu'il existe ou non.
    if (!user.contents.includes(id)) return text(res, 403, `${user.name} n'a pas accès à « ${id} »`), true;
    const md = read(id);
    if (md === null) return text(res, 404, 'Contenu introuvable'), true;
    if (req.method === 'GET') {
      const c = info(id);
      const head = { ETag: c.etag, 'Last-Modified': new Date(c.updatedAt).toUTCString(), ...(c.updatedBy ? { 'X-Updated-By': encodeURIComponent(c.updatedBy) } : {}) };
      if (req.headers['if-none-match'] === c.etag) return send(res, 304, head), true;
      if (wants(req, 'text/markdown')) return send(res, 200, { ...head, 'Content-Type': 'text/markdown; charset=utf-8' }, md), true;
      if (wants(req, 'application/json')) return send(res, 200, { ...head, 'Content-Type': 'application/json' }, JSON.stringify({ ...c, markdown: md })), true;
      return send(res, 200, { ...head, 'Content-Type': 'text/html; charset=utf-8' }, page(req, c.title, Blocks.toHtml(md, { media: '../media/' }), '../')), true;
    }
    if (req.method !== 'PUT') return text(res, 405, 'Méthode refusée'), true;
    const expected = req.headers['if-match'];
    if (!expected) return text(res, 428, 'If-Match obligatoire : l’ETag lu avec GET (ou * pour écraser)'), true;
    const next = (await body(req)).replace(/\r\n/g, '\n');
    // Version relue après le corps, puis comparée et écrite sans attente entre les deux : un seul PUT par version passe.
    const current = read(id);
    if (expected !== '*' && expected !== etag(current)) return send(res, 412, { 'Content-Type': 'text/plain; charset=utf-8', ETag: etag(current) }, 'Le contenu a changé depuis la lecture : le relire\n'), true;
    if (next.trim() === '') return text(res, 422, 'Texte vide'), true;
    // L'auteur est la personne du jeton ; X-Via dit par quoi elle est passée (Claude, ChatGPT…).
    const via = String(req.headers['x-via'] || '').slice(0, 40).replace(/[^\p{L}\p{N} ._-]/gu, '');
    fs.writeFileSync(file(id), next);
    fs.writeFileSync(path.join(DIR, id + '.json'), JSON.stringify({ by: user.name + (via ? ` (via ${via})` : ''), at: new Date().toISOString() }));
    return send(res, 204, { ETag: etag(next) }), true;
  };

  // GET /app : la démo de l'application. ?login=<jeton> choisit l'utilisateur (cookie), ?c=<id> ouvre un contenu dans l'éditeur.
  const app = (req, res, url, index) => {
    const login = url.searchParams.get('login');
    if (login !== null) {
      const cookie = USERS[login] ? `bq_token=${login}; SameSite=Lax; HttpOnly` : 'bq_token=; Max-Age=0';
      return send(res, 303, { 'Set-Cookie': cookie, Location: 'app' }), true;
    }
    const user = who(req);
    const id = url.searchParams.get('c') || (user && mine(user)[0]);
    const users = Object.entries(USERS).map(([t, u]) => `<a href="app?login=${t}" class="${user === u ? 'font-bold underline' : ''}">${u.name}</a>`).join(' · ');
    let main = `<p>Choisir un utilisateur : ${users}</p>`;
    let source = '';
    let config = null;
    if (user) {
      const list = mine(user).map(info);
      main = `<p>Connecté : <strong>${esc(user.name)}</strong> (jeton <code>${esc(token(req))}</code>) — changer : ${users}</p>
        <p>Contenus : ${list.map((c) => c.id === id ? `<strong>${esc(c.title)}</strong>` : `<a href="app?c=${attr(c.id)}" class="underline">${esc(c.title)}</a>`).join(' · ')}</p>`;
      if (id && user.contents.includes(id) && read(id) !== null) {
        source = read(id);
        const c = info(id);
        config = { id, etag: c.etag };
        main += `<p data-app-updated>Modifié ${c.updatedBy ? `par <strong>${esc(c.updatedBy)}</strong> ` : ''}le ${esc(new Date(c.updatedAt).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' }))} · <a href="contents/${attr(id)}" class="underline">publié</a> · <a href="contents" class="underline">API</a></p>`;
      } else if (id) main += `<p><strong>${esc(user.name)}</strong> n'a pas accès à « ${esc(id)} ».</p>`;
    }
    const html = index
      .replace('<title>blockquilt</title>', '<title>blockquilt — application de démo</title>')
      .replace(/(<textarea id="source" hidden>)[\s\S]*?(<\/textarea>)/, (_, open, close) => open + esc(source) + close)
      .replace('<div id="editor"', `<header data-app class="mx-auto max-w-3xl space-y-1 px-4 py-3 text-sm">${main}</header>\n  <div id="editor"${config ? '' : ' hidden'}`)
      // L'éditeur parle lui-même le contrat : lecture de la version (ETag), PUT avec If-Match, conflits.
      .replace("saveUrl: 'api/save',", config ? `contentUrl: ${JSON.stringify('contents/' + config.id)}, version: ${JSON.stringify(config.etag)},` : "saveUrl: 'api/save',");
    return send(res, 200, { 'Content-Type': 'text/html; charset=utf-8' }, html), true;
  };

  return { contents, app };
};
