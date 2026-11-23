// Événements généraux : clics (un bouton = une action), saisie, focus, collage, clavier, raccourcis Ctrl+S / Z / Y.
// Les écouteurs sont posés sur toute l'application (un bloc en plein écran est hors de la zone des blocs) ; les feuilles sont exclues.
export function installEvents(ed) {
  const { o, app, canvas, sheets, titleEl, blockFull } = ed;
  const inSheet = (t) => !!t.closest?.('[data-sheet]');

  ed.on(app, 'click', (e) => {
    const el = e.target;
    if (inSheet(el)) return;
    const cardEl = el.closest('[data-id]');
    const id = cardEl?.dataset.id;
    const hit = (sel) => el.closest(sel);
    if (hit('[data-insert]')) { const v = hit('[data-insert]').dataset.insert; return ed.openAdd(v === 'end' ? null : Number(v)); }
    if (hit('[data-merge]')) return ed.merge(Number(hit('[data-merge]').dataset.merge));
    if (hit('[data-menu]')) return ed.openMenu(id, hit('[data-menu]'));
    if (hit('[data-expand]')) return ed.openBlockFull(id);
    // Deuxième affichage d'une carte (aperçu du HTML, carrousel replié…) : data-toggle-view porte son nom.
    const toggler = hit('[data-toggle-view]') || (cardEl?.dataset.view === 'collapsed' && hit('[data-fold]'));
    if (toggler) {
      const alt = toggler.dataset.toggleView || toggler.dataset.fold || 'preview';
      const view = cardEl.dataset.view === alt ? 'edit' : alt;
      ed.views.set(id, view);
      ed.persistViews();
      cardEl.dataset.view = view;
      toggler.setAttribute('aria-pressed', String(view === alt));
      ed.def(ed.blocks.find((b) => b.id === id)).onInput?.(cardEl, ed.ui);
      return;
    }
    if (hit('[data-delete]')) return ed.askDelete(id);
    if (hit('[data-move]')) {
      const step = hit('[data-move]').dataset.move;
      return ed.move(id, ed.blocks.findIndex((b) => b.id === id) + Number(step), `[data-move="${step}"]`);
    }
    if (hit('[data-callout-icon]')) { ed.syncFromDom(); return ed.openIcon(id); }
    if (hit('[data-car-act], [data-car-add]')) return ed.carousel(el, id);
    if (hit('[data-card-act]')) return ed.cardPhoto(hit('[data-card-act]').dataset.cardAct, id);
    if (hit('[data-save]')) return ed.save();
    if (hit('[data-undo]')) return ed.undo();
    if (hit('[data-redo]')) return ed.redo();
    if (hit('[data-full]')) return ed.toggleEditorFull();
    if (hit('[data-width]')) return ed.cycleWidth();
    if (hit('[data-ai]')) return ed.openAi(null);
    if (hit('[data-more]')) return ed.openSheet('more', hit('[data-more]'));
    if (hit('[data-full-save]')) return ed.save();
    if (hit('[data-full-source]')) return ed.toggleBlockSource();
    if (hit('[data-full-preview]')) return ed.toggleBlockPreview();
    if (hit('[data-full-more]')) return ed.openSheet('fullmore', hit('[data-full-more]'));
    if (hit('[data-full-visual]')) return ed.toggleSplit();
    if (hit('[data-full-ai]')) return ed.openAiField(blockFull.querySelector('[data-rich]'));
    if (hit('[data-full-prev]')) return ed.stepBlockFull(-1);
    if (hit('[data-full-next]')) return ed.stepBlockFull(1);
    if (hit('[data-block-full-close]')) return ed.closeBlockFull();
    if (hit('[data-preview]')) return ed.setMode('preview');
    if (hit('[data-source-mode]')) return ed.setMode('source');
    if (hit('[data-visual-toggle]')) return ed.toggleSplit();
    if (hit('[data-source-line]')) return ed.goToLine(Number(hit('[data-source-line]').dataset.sourceLine));
    if (hit('[data-doc-icon]')) return ed.editing() ? ed.openIcon(null) : null;
    if (hit('[data-back]') && ed.dirty) { e.preventDefault(); return ed.openSheet('leave'); }
  });
  ed.on(sheets.more, 'click', (e) => {
    const act = e.target.closest('[data-more-act]')?.dataset.moreAct;
    if (!act) return;
    sheets.more.close();
    if (act === 'redo') ed.redo();
    else if (act === 'full') ed.toggleEditorFull();
    else if (act === 'ai') ed.openAi(null);
  });
  ed.on(sheets.leave, 'click', async (e) => {
    if (e.target.closest('[data-leave-discard]')) { ed.setDirty(false); location.href = o.backUrl; }
    if (e.target.closest('[data-leave-save]')) { sheets.leave.close(); if (await ed.save()) location.href = o.backUrl; }
  });

  // ---- Saisie ----
  ed.on(app, 'change', (e) => { if (e.target.matches('[data-convert]') && canvas.contains(e.target)) ed.convert(e.target.closest('[data-id]').dataset.id, e.target.value); });
  ed.on(app, 'input', (e) => {
    if (inSheet(e.target)) return;
    ed.setDirty(true);
    if (e.target.matches?.('[data-source-text]')) {
      // Vue source : alertes et aperçu suivent la frappe ; l'historique attend le retour aux blocs.
      clearTimeout(ed.refreshSource.timer);
      ed.refreshSource.timer = ed.later(ed.refreshSource, 250);
      return;
    }
    ed.typed();
    const c = e.target.closest?.('[data-id]');
    const b = c && ed.blocks.find((x) => x.id === c.dataset.id);
    if (!b) return;
    ed.def(b).onInput?.(c, ed.ui);
    ed.editorOf(b).read(c, b);
    ed.refreshFold(c, b);
  });
  ed.on(app, 'focusin', (e) => { const c = e.target.closest?.('[data-id]'); if (c) ed.activeId = c.dataset.id; });
  ed.on(app, 'focusout', (e) => { if (e.target.classList?.contains('bq-edit')) ed.clean(e.target); });
  ed.on(titleEl, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } });
  // Coller une page web (plusieurs blocs, ou un titre, une photo, une liste…) : des blocs sous le bloc en cours ; un bloc vide est remplacé.
  // Sinon, dans un champ : texte simple seulement (pas de styles venus d'ailleurs). Les autres champs (titre, légende, code) collent seuls.
  // En plein écran d'un bloc, tout reste dans le champ en texte simple : jamais de bloc créé hors de la vue.
  ed.on(app, 'paste', (e) => {
    const field = e.target.closest?.('.bq-edit');
    if (inSheet(e.target) || (!field && e.target.matches?.('input, textarea, [contenteditable]'))) return;
    if (field && blockFull.contains(field)) {
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      if (text) document.execCommand('insertText', false, text);
      else if (e.clipboardData.files.length) ed.toast('Une photo ne peut pas entrer dans ce texte');
      return;
    }
    const html = e.clipboardData.getData('text/html');
    const md = html ? Blocks.fromHtml(html) : '';
    const found = Blocks.parse(md).blocks.filter((b) => !Blocks.isEmpty(b));
    const images = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'));
    const web = found.length > 1 || (found.length === 1 && found[0].type !== 'text') || /^ *(?:-|\d+\.) /m.test(md);
    if (web || images.length) {
      e.preventDefault();
      ed.syncFromDom();
      const i = ed.blocks.findIndex((b) => b.id === ed.activeId);
      const empty = i >= 0 && Blocks.isEmpty(ed.blocks[i]);
      const at = i < 0 ? ed.blocks.length : empty ? i : i + 1;
      // Une page web d'abord (ses photos seront rapatriées) ; sinon une capture d'écran, envoyée comme une photo choisie.
      return web ? ed.pasteBlocks(md, at, { replace: empty, web: true }) : ed.addPhotos(images, { type: 'photo', at, replace: empty });
    }
    if (!field) return;
    e.preventDefault();
    document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
  });
  ed.on(app, 'keydown', (e) => {
    const el = e.target;
    // Poignée au clavier : flèches haut et bas déplacent le bloc.
    if (el.matches?.('[data-grip]') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      const id = el.closest('[data-id]').dataset.id;
      ed.move(id, ed.blocks.findIndex((b) => b.id === id) + (e.key === 'ArrowUp' ? -1 : 1));
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && el.matches?.('.bq-edit[data-plain], [data-callout-title]')) { e.preventDefault(); el.blur(); }
  });

  // ---- Raccourcis : Ctrl+S, Ctrl+Z, Ctrl+Maj+Z, Ctrl+Y, Échap ----
  const owns = () => app.contains(document.activeElement) || !document.activeElement || document.activeElement === document.body;
  const inField = () => app.contains(document.activeElement) && document.activeElement.matches('[contenteditable="true"], input, textarea');
  ed.on(document, 'keydown', (e) => {
    if (e.key === 'Escape' && ed.dragging()) { e.preventDefault(); ed.dragEnd(false); return; }
    if (!(e.ctrlKey || e.metaKey) || e.altKey || !owns()) return;
    const k = e.key.toLowerCase();
    if (k === 's') { if (o.save !== false) { e.preventDefault(); ed.save(); } return; } // save: false : Ctrl+S est à l'application
    if (k !== 'z' && k !== 'y') return;
    if (ed.mode === 'source') return; // vue source : la zone de texte garde son propre annuler / rétablir
    if (ed.typing && inField()) return; // frappe en cours dans un champ : le navigateur annule sa propre frappe
    e.preventDefault();
    if (k === 'y' || e.shiftKey) ed.redo(); else ed.undo();
  });
}
