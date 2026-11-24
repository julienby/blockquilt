// Admin d'un SaaS : une fiche produit avec des champs (nom, statut, catégorie, prix) et trois éditeurs :
// image de couverture et description courte en champs (single: true), page produit avec une liste de blocs restreinte.
// L'application enregistre la fiche entière : PUT /demo/api/admin/{id} (JSON). Les éditeurs ont save: false ;
// l'application lit getMarkdown() et dirty, suit onDirty, et appelle markSaved(texte envoyé) après son enregistrement.
import { mount } from '../blockquilt-editor.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const form = $('[data-form]');
const FIELDS = ['name', 'status', 'category', 'price'];
let current = null; // identifiant du produit ouvert
const TEXTS = ['cover', 'summary', 'page']; // un éditeur par texte, dans cet ordre
let editors = [];
let fieldsChanged = false;

const dirty = () => fieldsChanged || editors.some((e) => e.dirty);
const showState = () => {
  $('[data-save-form]').disabled = !dirty();
  $('[data-state]').textContent = dirty() ? 'Modifications non enregistrées' : 'Enregistré';
};
const editorOptions = (source, more) => ({
  source,
  ...more,
  save: false, // pas de bouton Enregistrer dans l'éditeur : la fiche a le sien
  onDirty: showState,
  uploadUrl: '../api/upload',
  media: '../media/',
  aiUrl: '../api/ai',
});

const showList = async () => {
  const products = await (await fetch('api/admin')).json();
  const status = { draft: 'Brouillon', published: 'Publié', archived: 'Archivé' };
  $('[data-products]').innerHTML = products.map((p) => `<li><button type="button" data-open="${p.id}" aria-current="${p.id === current}">${esc(p.title)}
    <small>${status[p.status] || ''}</small></button></li>`).join('');
};

const openProduct = async (id) => {
  if (dirty() && !confirm('Des modifications ne sont pas enregistrées. Les abandonner ?')) return;
  const r = await fetch(`api/admin/${id}`);
  const p = r.ok ? await r.json() : { name: '', status: 'draft', category: 'abonnement', price: '' };
  current = id;
  for (const k of FIELDS) form.elements[k].value = p[k] ?? '';
  editors.forEach((e) => e.destroy());
  editors = [
    mount($('[data-cover]'), editorOptions(p.cover ?? '', { single: true, blocks: ['photo'] })),
    mount($('[data-summary]'), editorOptions(p.summary ?? '', { single: true })),
    mount($('[data-page]'), editorOptions(p.page ?? '', { blocks: ['h2', 'h3', 'text', 'info', 'photo', 'card', 'video'] })),
  ];
  fieldsChanged = false;
  $('[data-heading]').textContent = p.name || 'Nouveau produit';
  showState();
  showList();
};

const save = async () => {
  if (!dirty()) return;
  const record = Object.fromEntries(FIELDS.map((k) => [k, form.elements[k].value.trim()]));
  const texts = editors.map((e) => e.getMarkdown());
  TEXTS.forEach((k, i) => { record[k] = texts[i]; });
  const r = await fetch(`api/admin/${current}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) });
  if (!r.ok) { $('[data-state]').textContent = 'Enregistrement impossible. Réessayez.'; return; }
  editors.forEach((e, i) => e.markSaved(texts[i]));
  fieldsChanged = false;
  $('[data-heading]').textContent = record.name || 'Nouveau produit';
  showState();
  showList();
};

form.addEventListener('input', (e) => { if (FIELDS.includes(e.target.name)) { fieldsChanged = true; showState(); } });
form.addEventListener('submit', (e) => { e.preventDefault(); save(); });
// Ctrl+S enregistre la fiche (les éditeurs le laissent à l'application avec save: false).
addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); } });
addEventListener('beforeunload', (e) => { if (dirty()) e.preventDefault(); });
$('[data-products]').addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openProduct(b.dataset.open); });
$('[data-new]').addEventListener('click', () => openProduct(`produit-${Date.now().toString(36)}`));

const first = (await (await fetch('api/admin')).json())[0];
openProduct(first ? first.id : `produit-${Date.now().toString(36)}`);
