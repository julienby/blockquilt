// Dessin : cartes de blocs, intervalles « Insérer / Fusionner », aperçu ; la vue source est dans source.js.
import { ic } from './icons.js';
import { esc, attr } from './shared.js';

export function installRender(ed) {
  const { o, canvas } = ed;

  // Bloc HTML désactivé (option `html` absente) : édité comme texte source, sans aperçu.
  ed.editorOf = (b) => (ed.def(b).edit && (b.type !== 'html' || o.html) ? ed.def(b) : Blocks.fallbackEditor);

  const pill = 'bq-pill inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-bold shadow-sm';
  const gap = (index) => {
    const canMerge = index > 0 && index < ed.blocks.length && Blocks.merge(ed.blocks[index - 1], ed.blocks[index]) !== null;
    // Intervalle aéré : la pastille de 28 px est à 12 px de chaque carte (cible tactile de 44 px + 4 px de marge).
    return `<div class="bq-gap flex justify-center gap-1 py-1">
      <button type="button" data-insert="${index}" aria-label="${index === 0 ? 'Insérer un bloc au début' : 'Insérer un bloc ici'}" class="group flex h-11 items-center px-1"><span class="${pill}">${ic('plus', 'size-3.5')}Insérer</span></button>
      ${canMerge ? `<button type="button" data-merge="${index}" aria-label="Fusionner avec le bloc du dessus" class="group flex h-11 items-center px-1"><span class="${pill}">${ic('merge', 'size-3.5')}Fusionner</span></button>` : ''}</div>`;
  };
  const badge = (b) => {
    const t = ed.def(b);
    return t.convertible
      ? `<label class="relative inline-flex items-center">${ic(t.icon, 'pointer-events-none absolute left-2 size-3.5 opacity-80')}
          <select data-convert aria-label="Type du bloc" class="h-7 cursor-pointer appearance-none rounded-full border py-0 pl-7 pr-6 text-[11px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${t.tone.badge}">
          ${Blocks.TEXT_KEYS.map((k) => `<option value="${k}" ${k === b.type ? 'selected' : ''}>${esc(Blocks.types[k].label)}</option>`).join('')}</select>
          ${ic('chevron_down', 'pointer-events-none absolute right-2 size-3 opacity-70')}</label>`
      : `<span class="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold ${t.tone.badge}">${ic(t.icon, 'size-3.5')}${esc(t.label)}</span>`;
  };
  const round = (data, icon, label, cls = 'bq-muted') => `<button type="button" ${data} aria-label="${label}" title="${label}" class="group inline-flex size-11 shrink-0 items-center justify-center rounded-full">
      <span class="bq-round flex size-8 items-center justify-center rounded-full border transition-colors ${cls}">${ic(icon, 'size-4')}</span></button>`;
  /** Outils propres à un type (ex. œil du bloc HTML), à côté du type. */
  ed.tools = (b, view = ed.viewOf(b)) => (ed.editorOf(b) === ed.def(b) && ed.def(b).tools ? ed.def(b).tools(b, view) : '');
  // Carte : à gauche le type (liste de conversion), à droite du type trois boutons ronds (menu, agrandir, supprimer) ;
  // colonne de droite : monter, poignée, descendre. Une action = un seul endroit.
  // Le contenu est centré verticalement sous le badge : un titre court occupe harmonieusement la hauteur donnée par la colonne.
  // Long bloc texte : replié, il montre ses premières lignes, un fondu et « … +X lignes » ; un clic dessus le déplie.
  const foldFooter = (hidden) => `<div class="mt-1 flex min-h-11 items-center gap-2 text-sm">
          <span class="bq-view-collapsed opacity-70">… +${hidden} ligne${hidden > 1 ? 's' : ''}</span>
          <button type="button" data-toggle-view="collapsed" class="bq-view-collapsed min-h-11 px-2 font-bold underline">Déplier</button>
          <button type="button" data-toggle-view="collapsed" class="bq-view-expanded min-h-11 px-2 font-bold underline opacity-70">Replier</button></div>`;
  // Ligne composée : petite grille à côté du type, la case du bloc pleine. Ligne incomplète : orange, pointillés pour la place libre.
  let place = new Map(); // identifiant → { row, k, sum }
  const colGrid = (b) => {
    const p = place.get(b.id);
    if (!p) return '';
    const unit = 28 / 6;
    let x = 0;
    const cells = p.row.map((c, k) => {
      const w = Blocks.SIXTHS[c.width] * unit;
      const r = `<rect x="${x + 0.75}" y="0.75" width="${w - 2.5}" height="14.5" rx="2" ${k === p.k ? 'fill="currentColor"' : 'fill="none"'}/>`;
      x += w;
      return r;
    }).join('') + (p.sum < 6 ? `<rect x="${x + 0.75}" y="0.75" width="${28 - x - 1.5}" height="14.5" rx="2" fill="none" stroke-dasharray="2 2"/>` : '');
    const label = `Largeur ${b.width}, ${p.k ? p.k + 1 + 'e' : '1re'} place sur ${p.row.length}${p.sum < 6 ? ' · ligne incomplète : ses blocs s’élargissent pour la remplir' : ''}`;
    return `<span data-col-grid role="img" aria-label="${label}" title="${label}" ${p.sum < 6 ? 'data-incomplete' : ''} class="ml-1.5 inline-flex shrink-0 ${p.sum < 6 ? 'text-amber-600' : 'text-brand-600'}">
      <svg width="28" height="16" viewBox="0 0 28 16" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${cells}</svg></span>`;
  };
  const card = (b, i) => {
    const hidden = b.type === 'carousel' ? 0 : ed.hiddenLines(b);
    return `<article data-id="${b.id}" data-view="${ed.viewOf(b)}" aria-label="${attr(ed.def(b).label)}" class="bq-card flex border ${ed.def(b).tone.card}">
      <div class="flex min-w-0 flex-1 flex-col pb-3 pl-3 pr-1">
        <div class="flex h-11 items-center">${badge(b)}${colGrid(b)}${ed.tools(b)}<span class="flex-1"></span>
          ${round('data-menu aria-haspopup="dialog"', 'more', 'Actions du bloc')}
          ${ed.def(b).fullscreen === false ? '' : round('data-expand', 'maximize', 'Plein écran')}
          ${round('data-delete', 'trash', 'Supprimer ce bloc', 'text-red-600')}</div>
        <div data-card-body ${hidden ? `data-fold="collapsed" style="--bq-fold:${ed.foldLimit}"` : ''} class="flex flex-1 flex-col justify-center">${ed.editorOf(b).edit(b, ed.ui)}</div>${hidden ? foldFooter(hidden) : ''}</div>
      <div data-rail class="flex w-11 shrink-0 select-none flex-col items-center justify-between border-l border-black/5 py-1">
        <button type="button" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter ce bloc" class="bq-rail">${ic('chevron_up', 'size-4')}</button>
        <button type="button" data-grip aria-label="Déplacer (glisser, ou flèches haut et bas)" class="bq-rail cursor-grab touch-none text-stone-400 active:cursor-grabbing">${ic('grip', 'size-4')}</button>
        <button type="button" data-move="1" ${i === ed.blocks.length - 1 ? 'disabled' : ''} aria-label="Descendre ce bloc" class="bq-rail">${ic('chevron_down', 'size-4')}</button></div></article>`;
  };

  // Un champ vidé par le navigateur garde parfois un <br> : on le vide pour que le texte d'aide réapparaisse.
  ed.clean = (el) => { if (el.innerHTML !== '' && el.textContent === '' && !el.querySelector('img, ul, ol, li')) el.innerHTML = ''; };
  const renderEdit = () => {
    place = new Map();
    for (const r of Blocks.rows(ed.blocks)) {
      if (!r.row) continue;
      const sum = r.row.reduce((n, c) => n + Blocks.SIXTHS[c.width], 0);
      r.row.forEach((c, k) => place.set(c.id, { row: r.row, k, sum }));
    }
    canvas.innerHTML = `<div class="bq-column relative">${ed.blocks.map((b, i) => gap(i) + card(b, i)).join('')}
      <button type="button" data-insert="end" class="bq-add mt-3 flex min-h-12 w-full items-center justify-center gap-2 border border-dashed border-stone-300 text-sm font-bold text-stone-500 hover:border-stone-400 hover:text-stone-800">${ic('plus', 'size-4')}Ajouter un bloc</button></div>`;
    canvas.querySelectorAll('.bq-edit').forEach(ed.clean);
  };
  const renderPreview = async () => {
    ed.hideBar();
    const text = ed.markdown();
    canvas.innerHTML = '<p class="py-10 text-center text-sm text-stone-500">Chargement de l’aperçu…</p>';
    try {
      const html = o.previewUrl ? await (await fetch(o.previewUrl, { method: 'POST', body: ed.form({ text }), signal: ed.ac.signal })).text() : Blocks.toHtml(text, { media: o.media });
      if (ed.mode === 'preview') {
        canvas.innerHTML = `<div class="bq-column p-1 sm:p-4">${html}</div>`;
        window.BlockquiltContent?.enhance(canvas); // flèches et puces des carrousels, si blockquilt-content.js est chargé
      }
    } catch {
      if (ed.mode === 'preview') canvas.innerHTML = '<p role="alert" class="rounded-xl bg-red-100 p-3 text-red-800">Aperçu indisponible. Réessayez.</p>';
    }
  };
  // Visuel à côté : le même choix en vue blocs et en vue source. 2 panneaux dès 1024 px par défaut.
  const splitKey = 'blockquilt.split';
  const wide = matchMedia('(min-width: 1024px)').matches;
  try { const saved = localStorage.getItem(splitKey); ed.sideBySide = saved === null ? wide : saved === 'true'; } catch { ed.sideBySide = wide; }
  ed.showSplit = () => ed.app.querySelector('[data-visual-toggle]').setAttribute('aria-pressed', String(ed.sideBySide));
  ed.showSplit();
  ed.toggleSplit = () => {
    ed.sideBySide = !ed.sideBySide;
    try { localStorage.setItem(splitKey, String(ed.sideBySide)); } catch { /* stockage refusé : choix valable pour cet affichage seulement */ }
    ed.showSplit();
    ed.syncFromDom();
    ed.render();
  };
  ed.refreshVisual = () => {
    const visual = canvas.querySelector('[data-visual]');
    if (!visual) return;
    visual.innerHTML = Blocks.toHtml(ed.markdown(), { media: o.media });
    window.BlockquiltContent?.enhance(visual);
  };
  const addVisual = () => {
    const edit = document.createElement('div');
    edit.className = 'min-w-0';
    edit.append(...canvas.childNodes);
    const visual = document.createElement('div');
    visual.dataset.visual = '';
    visual.setAttribute('aria-label', 'Visuel');
    visual.className = 'min-w-0 overflow-auto rounded-xl border p-3 sm:p-4';
    const panes = document.createElement('div');
    panes.dataset.panes = '';
    panes.className = 'bq-panes mx-auto grid gap-3';
    panes.append(edit, visual);
    canvas.append(panes);
    ed.refreshVisual();
  };
  ed.render = () => {
    ed.persistViews();
    if (ed.mode === 'preview') return renderPreview();
    if (ed.mode === 'source') ed.renderSource(); else renderEdit();
    if (ed.blockFull.open) ed.redrawBlockFull(); // avant le visuel : il relit les blocs, dialogue compris
    if (ed.sideBySide) addVisual();
  };

  ed.focusCard = (id) => {
    const el = canvas.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    const field = el.querySelector('[contenteditable], input, textarea');
    if (field) field.focus({ preventScroll: true }); else el.querySelector('[data-menu]')?.focus({ preventScroll: true });
  };
}
