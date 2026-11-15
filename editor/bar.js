// Mise en forme du texte : barre fixe et centrée (en bas de l'écran visible au téléphone, sous l'en-tête à l'ordinateur),
// ouverte par une sélection, un double clic, un appui long ou un clic droit, fermée à la perte du focus.
// Au clavier : Ctrl+B / I / U, Alt+F10 (focus sur la barre), Tab / Maj+Tab dans une liste (niveaux).
import { shared } from './shared.js';

export function installBar(ed) {
  const { app, bar, head } = ed;
  let field = null;
  let range = null; // sélection gardée : la barre peut prendre le focus (clavier) sans la perdre

  ed.placeBar = () => {
    if (bar.hidden) return;
    const vv = window.visualViewport;
    if (innerWidth >= 640) {
      bar.style.top = Math.max(8, Math.min(innerHeight - bar.offsetHeight - 8, head.getBoundingClientRect().bottom + 8)) + 'px';
      bar.style.left = '50%';
    } else {
      bar.style.top = ((vv ? vv.offsetTop + vv.height : innerHeight) - bar.offsetHeight - 8) + 'px';
      bar.style.left = (vv ? vv.offsetLeft + vv.width / 2 : innerWidth / 2) + 'px';
    }
  };
  const showBar = (f) => {
    if (!ed.editing() || !f || !app.contains(f)) return;
    field = f;
    bar.hidden = false;
    ed.placeBar();
  };
  ed.hideBar = () => { bar.hidden = true; field = null; range = null; toggleClip(false); };
  const backToField = () => {
    if (!field || document.activeElement === field) return;
    field.focus({ preventScroll: true });
    if (range) { getSelection().removeAllRanges(); getSelection().addRange(range); }
  };

  // ---- Sous-menu presse-papiers : copier, couper, coller le texte sélectionné (texte simple) ----
  const toggleClip = (open) => {
    const row = bar.querySelector('[data-bar-clip]');
    const show = open ?? row.hidden;
    row.hidden = !show;
    bar.querySelector('[data-clip-toggle]').setAttribute('aria-expanded', String(show));
    ed.placeBar();
  };
  const clipboard = async (what) => {
    const sel = getSelection();
    if (!field || !sel.rangeCount) return;
    if (what === 'paste') {
      let text = '';
      try { text = await navigator.clipboard.readText(); } catch { /* refusé : copie interne */ }
      if (!text) text = shared.clipboard || '';
      if (!text) return ed.toast('Presse-papiers vide');
      backToField();
      document.execCommand('insertText', false, text);
    } else {
      const text = sel.toString();
      if (!text) return ed.toast('Sélectionnez du texte');
      shared.clipboard = text;
      await navigator.clipboard?.writeText(text).catch(() => {});
      if (what === 'cut') { backToField(); document.execCommand('delete'); }
      ed.toast(what === 'cut' ? 'Texte coupé' : 'Texte copié');
    }
    ed.setDirty(true);
    ed.typed();
    toggleClip(false);
  };

  // ---- Ouverture et fermeture ----
  ed.on(document, 'selectionchange', () => {
    const sel = getSelection();
    if (!sel.rangeCount) return;
    if (!sel.isCollapsed) {
      const f = ed.richOf(sel.anchorNode);
      if (f && app.contains(f) && document.activeElement === f) showBar(f);
    }
    if (field && field.contains(sel.anchorNode)) range = sel.getRangeAt(0).cloneRange();
  });
  ed.on(app, 'dblclick', (e) => showBar(ed.richOf(e.target)));
  ed.on(app, 'contextmenu', (e) => { const f = ed.richOf(e.target); if (f) { e.preventDefault(); showBar(f); } });
  let press = null;
  ed.on(app, 'pointerdown', (e) => {
    clearTimeout(press?.timer);
    const f = ed.richOf(e.target);
    press = f ? { x: e.clientX, y: e.clientY, timer: ed.later(() => showBar(f), 450) } : null;
  });
  ed.on(app, 'pointermove', (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) clearTimeout(press.timer); });
  ed.on(app, 'pointerup', () => clearTimeout(press?.timer));
  ed.on(app, 'pointercancel', () => clearTimeout(press?.timer));
  ed.on(app, 'focusout', (e) => { if (field && e.target === field && !bar.contains(e.relatedTarget)) ed.hideBar(); });
  ed.on(bar, 'focusout', (e) => { if (!bar.contains(e.relatedTarget) && e.relatedTarget !== field) ed.hideBar(); });
  ed.on(window.visualViewport, 'resize', ed.placeBar);
  ed.on(window.visualViewport, 'scroll', ed.placeBar);
  ed.on(window, 'resize', ed.placeBar);
  ed.on(bar, 'mousedown', (e) => e.preventDefault());
  ed.on(bar, 'keydown', (e) => {
    const buttons = [...bar.querySelectorAll('button')].filter((b) => b.offsetParent);
    const i = buttons.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); backToField(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length].focus(); }
  });

  // ---- Boutons de la barre ----
  const unwrapMarks = (r) => {
    const scope = r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
    scope.closest('.bq-edit')?.querySelectorAll('mark').forEach((m) => { if (r.intersectsNode(m)) m.replaceWith(...m.childNodes); });
  };
  ed.on(bar, 'click', (e) => {
    backToField();
    const sel = getSelection();
    if (e.target.closest('[data-split]')) { if (sel.rangeCount) ed.split(sel.getRangeAt(0)); return; }
    if (e.target.closest('[data-clip-toggle]')) return toggleClip();
    const clip = e.target.closest('[data-clip]')?.dataset.clip;
    if (clip) return clipboard(clip);
    if (e.target.closest('[data-emoji-insert]')) {
      const f = field;
      if (!f || !sel.rangeCount) return;
      const r = sel.getRangeAt(0).cloneRange();
      ed.hideBar();
      return ed.openIcon({ field: f, range: r });
    }
    const button = e.target.closest('[data-fmt]');
    if (!button || !sel.rangeCount) return;
    const what = button.dataset.fmt;
    const r = sel.getRangeAt(0);
    if (what === 'highlight') {
      if (r.collapsed) return;
      const inside = (r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement).closest('mark');
      if (inside) unwrapMarks(r);
      else { const m = document.createElement('mark'); m.append(r.extractContents()); r.insertNode(m); sel.removeAllRanges(); sel.selectAllChildren(m); }
    } else document.execCommand(what);
    ed.setDirty(true);
  });

  // ---- Listes : niveau d'un élément ; le curseur et la sélection restent en place. Renvoie false si impossible. ----
  const shiftLevel = (li, dir) => {
    const sel = getSelection();
    const r = sel.rangeCount ? sel.getRangeAt(0) : null;
    const keep = r && [r.startContainer, r.startOffset, r.endContainer, r.endOffset];
    const list = li.parentElement;
    if (dir > 0) {
      // Sous l'élément précédent, dans sa dernière sous-liste du même genre (créée au besoin).
      const prev = li.previousElementSibling;
      if (!prev || prev.tagName !== 'LI') return false;
      let sub = prev.lastElementChild;
      if (!sub || sub.tagName !== list.tagName) { sub = document.createElement(list.tagName.toLowerCase()); prev.append(sub); }
      sub.append(li);
    } else {
      // Après l'élément parent ; les éléments qui le suivaient deviennent ses enfants.
      const parentLi = list.parentElement;
      if (!parentLi || parentLi.tagName !== 'LI') return false;
      const after = [...list.children].slice([...list.children].indexOf(li) + 1);
      if (after.length) { const sub = document.createElement(list.tagName.toLowerCase()); sub.append(...after); li.append(sub); }
      parentLi.after(li);
      if (!list.children.length) list.remove();
    }
    if (keep) sel.setBaseAndExtent(...keep);
    return true;
  };

  // ---- Clavier dans un champ riche ----
  ed.on(app, 'keydown', (e) => {
    const rich = ed.richOf(e.target);
    if (!rich) return;
    // Tab descend un élément de liste d'un niveau, Maj+Tab le remonte. Sans effet possible, Tab garde son rôle (focus suivant).
    if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
      const sel = getSelection();
      const node = sel.rangeCount ? sel.anchorNode : null;
      const li = (node && (node.nodeType === 1 ? node : node.parentElement))?.closest('li');
      if (li && rich.contains(li) && shiftLevel(li, e.shiftKey ? -1 : 1)) { e.preventDefault(); ed.setDirty(true); ed.typed(); return; }
    }
    const cmd = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && { b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()];
    if (cmd) { e.preventDefault(); document.execCommand(cmd); ed.setDirty(true); ed.typed(); return; }
    if (e.altKey && e.key === 'F10') { e.preventDefault(); showBar(rich); bar.querySelector('[data-fmt]').focus(); }
  });
}
