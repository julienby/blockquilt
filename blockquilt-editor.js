// blockquilt — écran d'édition (module ES, sans build). Nécessite blockquilt.js (le noyau `Blocks`), chargé avant, et blockquilt.css.
//   <script src="blockquilt.js"></script>
//   <script type="module">
//     import { mount } from './blockquilt-editor.js';
//     const editor = mount(document.getElementById('editor'), { source, saveUrl, uploadUrl, fields });
//   </script>
// Le code est découpé par sujet dans editor/ ; chaque module installe sa partie sur un contexte commun `ed`
// (état du document, éléments de l'écran, et les fonctions des autres modules, appelées au moment voulu).
import { ICONS, ic } from './editor/icons.js';
import { shared, esc, attr } from './editor/shared.js';
import { editable } from './editor/types.js';
import { template } from './editor/template.js';
import { installDocument } from './editor/document.js';
import { installSheets } from './editor/sheets.js';
import { installViews } from './editor/views.js';
import { installRender } from './editor/render.js';
import { installHistory } from './editor/history.js';
import { installActions } from './editor/actions.js';
import { installMedia } from './editor/media.js';
import { installSource } from './editor/source.js';
import { installFullscreen } from './editor/fullscreen.js';
import { installDrag } from './editor/drag.js';
import { installEmoji, emoji } from './editor/emoji.js';
import { installAi } from './editor/ai.js';
import { installRemote } from './editor/remote.js';
import { installDraft, clearDrafts } from './editor/draft.js';
import { installBar } from './editor/bar.js';
import { installEvents } from './editor/events.js';

/** Monte un éditeur dans `element`. Renvoie { getMarkdown(), setMarkdown(md), save(), dirty, markSaved(text), undo(), redo(), checkRemote(), version, destroy() }. */
export function mount(element, options = {}) {
  const o = { media: 'media/', fields: {}, source: '', ...options };
  const ac = new AbortController();
  const timers = new Set();
  element.innerHTML = template(o);
  const app = element.firstElementChild;
  const $ = (s, r = app) => r.querySelector(s);

  const ed = {
    o, element, app, $, ac,
    on: (target, type, fn, opts = {}) => target?.addEventListener(type, fn, { ...opts, signal: ac.signal }),
    later: (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; },
    // Éléments de l'écran
    canvas: $('[data-canvas]'),
    bar: $('[data-bar]'),
    head: $('[data-head]'),
    // Titre et icône du document : seulement avec l'option `title` (l'éditeur peut ne remplir qu'une partie d'une page).
    // Sans elle, ces deux éléments existent hors de la page (aucun écouteur n'y arrive) et le frontmatter est gardé tel quel.
    titleEl: $('[data-title]') || document.createElement('div'),
    iconBtn: $('[data-doc-icon]') || document.createElement('button'),
    saveBtn: $('[data-save]'),
    fileInput: $('[data-file]'),
    toastEl: $('[data-toast]'),
    editorFull: element.lastElementChild,
    blockFull: $('[data-block-full]'),
    inner: (d) => d.querySelector('[data-full-inner]'), // conteneur du dialogue plein écran : c'est lui qui défile
    sheets: {},
    ui: { ic, esc, attr, media: o.media, editable }, // passé aux cartes d'édition des types (edit(b, ui))
    // État du document
    meta: {},
    icon: '',
    blocks: [],
    dirty: false,
    mode: 'edit', // 'edit' (blocs) | 'source' (texte Markdown) | 'preview' (rendu)
    activeId: null,
    nextId: 1,
  };
  ed.editing = () => ed.mode === 'edit';
  ed.newId = () => 'b' + ed.nextId++;
  ed.def = (b) => Blocks.def(b.type);
  // Types proposés par les menus (option `blocks` ; le bloc HTML demande aussi `html: true`). Un bloc d'un autre type déjà là est gardé.
  ed.allowed = (k) => (!o.blocks || o.blocks.includes(k)) && (k !== 'html' || !!o.html);
  // Bloc d'un document vide : le premier type permis.
  ed.blank = () => ({ id: ed.newId(), ...Blocks.blank(o.blocks?.[0] || 'text') });

  for (const install of [installViews, installDocument, installDraft, installSheets, installRender, installHistory, installActions, installMedia,
    installSource, installFullscreen, installDrag, installEmoji, installAi, installRemote, installBar, installEvents]) install(ed);

  ed.load(o.source);
  ed.setDirty(false, { loaded: true });
  ed.checkpoint();
  if (o.source || !o.contentUrl) ed.offerDraft(); // sinon : après la lecture du texte (remote.js)

  return {
    getMarkdown: ed.markdown,
    setMarkdown: (md) => { ed.load(md); ed.setDirty(false, { loaded: true }); ed.resetHistory(); },
    save: ed.save,
    get dirty() { return ed.dirty; }, // des modifications ne sont pas enregistrées
    // L'application a enregistré `text` elle-même (option save: false). Une frappe faite depuis reste à enregistrer.
    markSaved: (text) => { if (text === undefined || ed.markdown() === text) ed.setDirty(false); },
    undo: ed.undo,
    redo: ed.redo,
    checkRemote: () => ed.checkRemote(),
    get version() { return ed.version; },
    destroy: () => {
      ed.writeDraft(); // retiré sans quitter la page (htmx…) : pas de pagehide
      ac.abort();
      timers.forEach(clearTimeout);
      ed.dragEnd(false);
      [...Object.values(ed.sheets), ed.blockFull, ed.editorFull].forEach((d) => d.open && d.close());
      element.replaceChildren();
    },
  };
}

// Objet public : window.Blockquilt.mount, .icons, .emoji (chargement de emoji.json), .clipboard, .emojiData.
export const Blockquilt = Object.assign(shared, { mount, icons: ICONS, emoji, clearDrafts });
window.Blockquilt = Blockquilt;
