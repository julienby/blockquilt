import { ago } from './shared.js';

// Brouillon : le texte non enregistré, gardé dans ce navigateur (`localStorage`), sans message du navigateur au départ.
// Actif avec `storageKey` ou `contentUrl`, sauf `draft: false`. Sans brouillon possible : message du navigateur (`beforeunload`).
// Au chargement, un bandeau dans l'éditeur (pas une feuille : plusieurs éditeurs par page) propose de le reprendre.
export function installDraft(ed) {
  const { o, $ } = ed;
  const bar = $('[data-draft-bar]');
  const name = o.storageKey ?? o.contentUrl;
  const key = o.draft !== false && name ? 'blockquilt.draft.' + name : null;
  let stored = !!key; // devient faux si le navigateur refuse l'écriture : retour au message du navigateur

  ed.writeDraft = () => {
    clearTimeout(ed.writeDraft.timer);
    if (!key || !ed.dirty || ed.unread) return; // texte non lu : le brouillon d'avant reste
    const draft = { text: ed.markdown(), version: ed.version ?? null, base: Blocks.hash(ed.savedText), at: Date.now() };
    try { localStorage.setItem(key, JSON.stringify(draft)); } catch { stored = false; }
  };
  ed.dropDraft = () => {
    clearTimeout(ed.writeDraft.timer);
    if (key) try { localStorage.removeItem(key); } catch { /* stockage refusé : rien à effacer */ }
  };
  ed.draftLater = () => {
    clearTimeout(ed.writeDraft.timer);
    if (key) ed.writeDraft.timer = ed.later(ed.writeDraft, 1000);
  };

  // Au chargement du texte : un brouillon différent est proposé, un brouillon identique est effacé.
  let offered = null;
  ed.offerDraft = () => {
    let draft = null;
    try { draft = key && JSON.parse(localStorage.getItem(key)); } catch { /* illisible ou refusé : pas de brouillon */ }
    if (!draft?.text) return;
    if (draft.text === ed.savedText) return ed.dropDraft();
    offered = draft;
    const changed = draft.base !== Blocks.hash(ed.savedText) ? ' Le contenu a changé depuis ce brouillon.' : '';
    $('[data-draft-text]', bar).textContent = `Modifications non enregistrées sur cet appareil, ${ago(draft.at)}.${changed}`;
    bar.hidden = false;
  };
  ed.on(bar, 'click', (e) => {
    if (!offered) return;
    if (e.target.closest('[data-draft-take]')) {
      // Annulable ; avec `contentUrl`, la version du brouillon : un contenu changé depuis donnera un conflit à l'enregistrement.
      const draft = offered;
      ed.change(() => ed.setDoc(Blocks.parse(draft.text)));
      if (draft.version) ed.version = draft.version;
    } else if (e.target.closest('[data-draft-drop]')) ed.dropDraft();
    else return;
    offered = null;
    bar.hidden = true;
  });

  // Android peut fermer un onglet caché sans `beforeunload` : on écrit aussi quand la page se cache.
  ed.on(window, 'pagehide', ed.writeDraft);
  ed.on(document, 'visibilitychange', () => { if (document.hidden) ed.writeDraft(); });
  ed.on(window, 'beforeunload', (e) => {
    if (!ed.dirty) return;
    ed.writeDraft();
    if (stored) return;
    e.preventDefault();
    e.returnValue = '';
  });
}

/** Efface tout ce que blockquilt garde dans ce navigateur (brouillons, affichage des blocs) : à la déconnexion. */
export function clearDrafts() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('blockquilt.')).forEach((k) => localStorage.removeItem(k));
  } catch { /* stockage refusé : rien à effacer */ }
}
