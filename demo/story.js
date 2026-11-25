// Écrire un récit : titre et sous-titre dans la page (frontmatter `title`, `description`), l'éditeur épuré (quiet: true),
// un seul bouton Publier. L'éditeur n'a pas de bouton Enregistrer (save: false) ; Publier appelle save(), qui envoie à saveUrl.
import { mount } from '../blockquilt-editor.js';

const $ = (s) => document.querySelector(s);
const id = 'ecrire-sans-cadre';
const title = $('[data-story-title]');
const subtitle = $('[data-story-subtitle]');

const showState = (dirty) => {
  $('[data-publish]').disabled = !dirty;
  $('[data-state]').textContent = dirty ? 'Modifications non publiées' : 'Publié';
};
// Le frontmatter → les deux champs (chargement, Ctrl+Z, vue source).
const showMeta = (meta) => { title.value = meta.title || ''; subtitle.value = meta.description || ''; };

const r = await fetch(`api/story/${id}`);
const editor = mount($('[data-editor]'), {
  source: r.ok ? (await r.json()).markdown : '---\ntitle: \ndescription: \n---\n\n',
  quiet: true,
  width: '42rem', // colonne de lecture
  save: false,
  saveUrl: `api/story/${id}`,
  storageKey: `story-${id}`,
  onDirty: showState,
  onMeta: showMeta,
  uploadUrl: '../api/upload',
  media: '../media/',
  aiUrl: '../api/ai',
});

const write = (key, value) => editor.setMeta({ ...editor.getMeta(), [key]: value.replace(/\s+/g, ' ').trim() });
title.addEventListener('input', () => write('title', title.value));
subtitle.addEventListener('input', () => write('description', subtitle.value));
// Le titre est une ligne : Entrée passe au sous-titre.
title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); subtitle.focus(); } });

$('[data-publish]').addEventListener('click', () => editor.save());
addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); editor.save(); } });
