// Dessin : cartes de blocs, intervalles « Insérer / Fusionner », aperçu ; la vue source est dans source.js.
import { ic } from './icons.js';
import { esc, attr } from './shared.js';

export function installRender(ed) {
  const { o, canvas } = ed;

  // Bloc HTML désactivé (option `html` absente) : édité comme texte source, sans aperçu.
  ed.editorOf = (b) => (ed.def(b).edit && (b.type !== 'html' || o.html) ? ed.def(b) : Blocks.fallbackEditor);
  // Affichage choisi par bloc (ex. code ou aperçu du bloc HTML) : 'edit' | 'preview'.
  ed.views = new Map();

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
  ed.tools = (b) => (ed.editorOf(b) === ed.def(b) && ed.def(b).tools ? ed.def(b).tools(b, ed.views.get(b.id)) : '');
  // Carte : à gauche le type (liste de conversion), à droite du type trois boutons ronds (menu, agrandir, supprimer) ;
  // colonne de droite : monter, poignée, descendre. Une action = un seul endroit.
  // Le contenu est centré verticalement sous le badge : un titre court occupe harmonieusement la hauteur donnée par la colonne.
  const card = (b, i) => `<article data-id="${b.id}" data-view="${ed.views.get(b.id) || 'edit'}" aria-label="${attr(ed.def(b).label)}" class="bq-card flex border ${ed.def(b).tone.card}">
      <div class="flex min-w-0 flex-1 flex-col pb-3 pl-3 pr-1">
        <div class="flex h-11 items-center">${badge(b)}${ed.tools(b)}<span class="flex-1"></span>
          ${round('data-menu aria-haspopup="dialog"', 'more', 'Actions du bloc')}
          ${ed.def(b).fullscreen === false ? '' : round('data-expand', 'maximize', 'Plein écran')}
          ${round('data-delete', 'trash', 'Supprimer ce bloc', 'text-red-600')}</div>
        <div data-card-body class="flex flex-1 flex-col justify-center">${ed.editorOf(b).edit(b, ed.ui)}</div></div>
      <div data-rail class="flex w-11 shrink-0 select-none flex-col items-center justify-between border-l border-black/5 py-1">
        <button type="button" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter ce bloc" class="bq-rail">${ic('chevron_up', 'size-4')}</button>
        <button type="button" data-grip aria-label="Déplacer (glisser, ou flèches haut et bas)" class="bq-rail cursor-grab touch-none text-stone-400 active:cursor-grabbing">${ic('grip', 'size-4')}</button>
        <button type="button" data-move="1" ${i === ed.blocks.length - 1 ? 'disabled' : ''} aria-label="Descendre ce bloc" class="bq-rail">${ic('chevron_down', 'size-4')}</button></div></article>`;

  // Un champ vidé par le navigateur garde parfois un <br> : on le vide pour que le texte d'aide réapparaisse.
  ed.clean = (el) => { if (el.innerHTML !== '' && el.textContent === '' && !el.querySelector('img, ul, ol, li')) el.innerHTML = ''; };
  const renderEdit = () => {
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
  ed.render = () => (ed.mode === 'preview' ? renderPreview() : ed.mode === 'source' ? ed.renderSource() : renderEdit());

  ed.focusCard = (id) => {
    const el = canvas.querySelector(`[data-id="${id}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    const field = el.querySelector('[contenteditable], input, textarea');
    if (field) field.focus({ preventScroll: true }); else el.querySelector('[data-menu]')?.focus({ preventScroll: true });
  };
}
