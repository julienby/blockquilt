// Exemples d'intégration (démo) : trois petites applications qui gardent leurs fiches en fichiers JSON.
// Une fiche = des champs de l'application + du Markdown. C'est ce qu'une vraie application fait avec sa base.
//   GET  /demo/{exemple}              → la page (demo/{exemple}.html)
//   GET  /demo/{exemple}.js           → son script
//   GET  /demo/api/{exemple}?q=…      → liste [{ id, title, updatedAt, …champs }], la plus récente d'abord ; q : cherche dans le texte
//   GET  /demo/api/{exemple}/{id}     → la fiche (JSON)
//   PUT  /demo/api/{exemple}/{id}     → fiche JSON entière (champs + Markdown) → la fiche enregistrée
//   POST /demo/api/{exemple}/{id}     → formulaire `text` (option saveUrl de l'éditeur) : le Markdown seul, les autres champs gardés
//   GET  /demo/blog/{id}              → l'article rendu par le serveur (Blocks.toHtml), la page publique
//   GET  /demo/story/{id}             → le récit rendu par le serveur : titre, sous-titre (frontmatter `description`), texte
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const Blocks = require('../blockquilt.js');

const NAMES = ['blog', 'notes', 'admin', 'story'];
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const PAGES = path.join(__dirname, '..', 'demo');

module.exports = (DATA, { send, json, read, form }) => {
  const dir = (name) => path.join(DATA, 'demos', name);
  // Fiches de départ (dev/demos) copiées au premier lancement ; ensuite, les fichiers de DATA font foi.
  for (const name of NAMES) {
    fs.mkdirSync(dir(name), { recursive: true });
    const seed = path.join(__dirname, 'demos', name);
    for (const f of fs.existsSync(seed) ? fs.readdirSync(seed) : []) {
      if (!fs.existsSync(path.join(dir(name), f))) fs.copyFileSync(path.join(seed, f), path.join(dir(name), f));
    }
  }
  const file = (name, id) => path.join(dir(name), id + '.json');
  const load = (name, id) => (fs.existsSync(file(name, id)) ? JSON.parse(fs.readFileSync(file(name, id), 'utf8')) : null);
  const store = (name, id, record) => {
    const saved = { ...record, id, updatedAt: new Date().toISOString() };
    fs.writeFileSync(file(name, id), JSON.stringify(saved, null, 2));
    return saved;
  };
  // Titre d'une fiche : son champ `name`, sinon le titre du frontmatter de son Markdown.
  const title = (r) => r.name || Blocks.frontmatter(r.markdown || '').meta?.title || 'Sans titre';

  const head = (r) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${Blocks.esc(title(r))}</title><link rel="stylesheet" href="../../blockquilt-content.css"><link rel="stylesheet" href="../demo.css"></head>`;
  const article = (r) => `${head(r)}
<body><main class="page"><p><a href="../blog">← Tous les articles</a> · <a href="../blog#edit=${r.id}">Modifier</a></p>
${Blocks.toHtml(r.markdown || '', { media: '../../media/' })}
<script src="../../blockquilt-content.js"></script></main></body></html>`;
  // Récit : le sous-titre (frontmatter `description`) est placé sous le titre <h1>.
  const story = (r) => {
    const md = r.markdown || '';
    const sub = Blocks.frontmatter(md).meta?.description;
    const html = Blocks.toHtml(md, { media: '../../media/' }).replace('</h1>', sub ? `</h1>\n<p class="story-lead" data-subtitle>${Blocks.esc(sub)}</p>` : '</h1>');
    return `${head(r)}
<body><main class="story story-read"><p class="top"><a href="../story">Modifier</a></p>
${html}
<script src="../../blockquilt-content.js"></script></main></body></html>`;
  };

  // Renvoie true si la requête est pour les exemples.
  return async (req, res, pathname) => {
    let m = /^\/demo\/(blog|notes|admin|story)(\.js)?$/.exec(pathname);
    if (m && req.method === 'GET') {
      send(res, 200, m[2] ? 'text/javascript' : 'text/html; charset=utf-8', fs.readFileSync(path.join(PAGES, m[1] + (m[2] || '.html'))));
      return true;
    }
    if (pathname === '/demo/demo.css' && req.method === 'GET') { send(res, 200, 'text/css', fs.readFileSync(path.join(PAGES, 'demo.css'))); return true; }
    m = /^\/demo\/(blog|story)\/([^/]+)$/.exec(pathname);
    if (m && req.method === 'GET') {
      const r = ID.test(m[2]) && load(m[1], m[2]);
      if (!r) send(res, 404, 'text/plain; charset=utf-8', 'Article introuvable');
      else send(res, 200, 'text/html; charset=utf-8', m[1] === 'blog' ? article(r) : story(r));
      return true;
    }
    m = /^\/demo\/api\/(blog|notes|admin|story)(?:\/([^/]+))?$/.exec(pathname);
    if (!m) return false;
    const [, name, id] = m;
    if (id !== undefined && !ID.test(id)) { json(res, 400, { error: 'Identifiant invalide' }); return true; }
    if (!id && req.method === 'GET') {
      const q = (new URL(req.url, 'http://local').searchParams.get('q') || '').toLowerCase();
      const list = fs.readdirSync(dir(name)).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(dir(name), f), 'utf8')))
        .filter((r) => !q || `${title(r)}\n${r.markdown || ''}`.toLowerCase().includes(q))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(({ markdown, summary, page, cover, ...fields }) => ({ ...fields, title: title({ markdown, ...fields }) }));
      json(res, 200, list);
      return true;
    }
    if (id && req.method === 'GET') {
      const r = load(name, id);
      if (r) json(res, 200, r); else json(res, 404, { error: 'Introuvable' });
      return true;
    }
    if (id && req.method === 'PUT') {
      const record = JSON.parse((await read(req, 1024 * 1024)).toString('utf8') || '{}');
      json(res, 200, store(name, id, record));
      return true;
    }
    if (id && req.method === 'POST') {
      const text = String((await form(req)).get('text') ?? '').replace(/\r\n/g, '\n');
      store(name, id, { ...load(name, id), markdown: text });
      json(res, 200, { ok: true });
      return true;
    }
    json(res, 405, { error: 'Méthode non prise en charge' });
    return true;
  };
};
