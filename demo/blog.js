// Mini blog : la liste (#), l'édition d'un article (#edit=<id>). Les articles sont lus et écrits par /demo/api/blog.
import { mount } from '../blockquilt-editor.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
let editor = null;

const showList = async () => {
  const articles = await (await fetch('api/blog')).json();
  $('[data-articles]').innerHTML = articles.map((a) => `<li><a href="blog/${a.id}">${esc(a.title)}
    <small>${new Date(a.updatedAt).toLocaleDateString('fr-FR')}</small></a><a href="#edit=${a.id}">Modifier</a></li>`).join('');
  $('[data-list]').hidden = false;
  $('[data-edit]').hidden = true;
};

const showEditor = async (id) => {
  const r = await fetch(`api/blog/${id}`);
  const source = r.ok ? (await r.json()).markdown : '---\ntitle: Nouvel article\n---\n\n';
  editor = mount($('[data-editor]'), {
    source,
    title: true, // titre et icône de l'article : dans le frontmatter
    saveUrl: `api/blog/${id}`, // POST du formulaire `text` : le serveur garde le Markdown
    storageKey: `blog-${id}`, // brouillon et affichage choisis, propres à cet article
    uploadUrl: '../api/upload',
    media: '../media/',
    aiUrl: '../api/ai',
  });
  $('[data-read]').href = `blog/${id}`;
  $('[data-list]').hidden = true;
  $('[data-edit]').hidden = false;
};

// Changer de vue retire l'éditeur : destroy() garde le brouillon s'il reste des modifications.
const route = () => {
  editor?.destroy();
  editor = null;
  const id = /^#edit=([a-z0-9-]+)$/.exec(location.hash)?.[1];
  return id ? showEditor(id) : showList();
};
$('[data-new]').addEventListener('click', () => { location.hash = `edit=article-${Date.now().toString(36)}`; });
$('[data-back]').addEventListener('click', () => { location.hash = ''; });
addEventListener('hashchange', route);
route();
