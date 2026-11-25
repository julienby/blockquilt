// Second cerveau : la liste des notes (recherche dans le texte), la note choisie, le journal du jour.
// Deux éditeurs indépendants dans la page : chacun son texte, son adresse d'enregistrement, son brouillon, son annuler.
import { mount } from '../blockquilt-editor.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const today = new Date().toISOString().slice(0, 10);
const journalId = `journal-${today}`;
let current = null; // identifiant de la note ouverte
let note = null; // son éditeur

const read = async (id, fallback) => {
  const r = await fetch(`api/notes/${id}`);
  return r.ok ? (await r.json()).markdown : fallback;
};
// Options communes : chaque note s'enregistre à sa propre adresse et garde son propre brouillon.
const options = (id, source) => ({
  source,
  onMeta: (meta) => { $('[data-note-title]').value = meta.title || ''; }, // le champ Titre suit le frontmatter (chargement, Ctrl+Z, vue source)
  saveUrl: `api/notes/${id}`,
  storageKey: `notes-${id}`,
  uploadUrl: '../api/upload',
  media: '../media/',
  aiUrl: '../api/ai',
  onDirty: (dirty) => { if (!dirty) showList(); }, // enregistré : la liste montre le nouveau titre
});

const showList = async () => {
  const q = $('[data-search]').value.trim();
  const notes = (await (await fetch(`api/notes?q=${encodeURIComponent(q)}`)).json()).filter((n) => !n.id.startsWith('journal-'));
  $('[data-notes]').innerHTML = notes.map((n) => `<li><button type="button" data-open="${n.id}" aria-current="${n.id === current}">${esc(n.title)}</button></li>`).join('')
    || '<li class="muted">Aucune note</li>';
};

// Ouvrir une autre note : l'éditeur de la note quittée est retiré (son brouillon est gardé s'il reste des modifications).
const openNote = async (id, fallback = '---\ntitle: Note sans titre\n---\n\n') => {
  note?.destroy();
  current = id;
  note = mount($('[data-note]'), options(id, await read(id, fallback)));
  showList();
};

$('[data-notes]').addEventListener('click', (e) => { const b = e.target.closest('[data-open]'); if (b) openNote(b.dataset.open); });
$('[data-new]').addEventListener('click', () => openNote(`note-${Date.now().toString(36)}`, '---\ntitle: Nouvelle note\n---\n\n'));
$('[data-search]').addEventListener('input', showList);
$('[data-note-title]').addEventListener('input', (e) => note?.setMeta({ ...note.getMeta(), title: e.target.value.trim() }));

$('[data-journal-label]').textContent = `Journal du ${new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}`;
mount($('[data-journal]'), { ...options(journalId, await read(journalId, `---\ntitle: Journal du ${today}\n---\n\n`)), onMeta: null });
const first = (await (await fetch('api/notes')).json()).find((n) => !n.id.startsWith('journal-'));
openNote(first ? first.id : `note-${Date.now().toString(36)}`);
