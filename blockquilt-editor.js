// blockquilt — écran d'édition. Nécessite blockquilt.js (le noyau `Blocks`), chargé avant, et la feuille blockquilt.css.
// Intégration : Blockquilt.mount(element, { source, media, saveUrl | onSave, uploadUrl, previewUrl, aiUrl, backUrl, fields }).
// Chaque type de bloc reçoit ici edit(b, ui) → HTML de la carte, et read(card, b) → met à jour le modèle depuis l'écran.
(function () {
  // ---- Icônes (tracés Lucide, licence ISC), en ligne : aucun identifiant dans la page ----
  const ICONS = {
    heading: '<path d="M6 12h12"/><path d="M6 20V4"/><path d="M18 20V4"/>',
    type: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
    align_left: '<path d="M15 12H3"/><path d="M17 18H3"/><path d="M21 6H3"/>',
    sparkles: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8Z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8Z"/>',
    triangle_alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    octagon_alert: '<path d="M12 16h.01"/><path d="M12 8v4"/><path d="M15.312 2a2 2 0 0 1 1.414.586l4.688 4.688A2 2 0 0 1 22 8.688v6.624a2 2 0 0 1-.586 1.414l-4.688 4.688a2 2 0 0 1-1.414.586H8.688a2 2 0 0 1-1.414-.586l-4.688-4.688A2 2 0 0 1 2 15.312V8.688a2 2 0 0 1 .586-1.414l4.688-4.688A2 2 0 0 1 8.688 2z"/>',
    info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
    quote: '<path d="M10 11H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6c0 2-1 4-4 5"/><path d="M19 11h-4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v6c0 2-1 4-4 5"/>',
    image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="1.5"/><path d="m21 15-5-5L5 21"/>',
    images: '<path d="M18 22H4a2 2 0 0 1-2-2V6"/><path d="m22 13-1.296-1.296a2.41 2.41 0 0 0-3.408 0L11 18"/><circle cx="12" cy="8" r="2"/><rect width="16" height="16" x="6" y="2" rx="2"/>',
    video: '<path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
    minus: '<path d="M5 12h14"/>',
    width: '<path d="M21 12H3"/><path d="m7 8-4 4 4 4"/><path d="m17 8 4 4-4 4"/>',
    code: '<path d="m16 18 6-6-6-6"/><path d="m8 6-6 6 6 6"/>',
    html: '<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>',
    sliders: '<path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4"/>',
    chevron_left: '<path d="m15 6-6 6 6 6"/>',
    chevron_down: '<path d="m6 9 6 6 6-6"/>',
    chevron_up: '<path d="m18 15-6-6-6 6"/>',
    chevron_right: '<path d="m9 18 6-6-6-6"/>',
    arrow_up: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
    arrow_down: '<path d="M12 5v14"/><path d="m19 12-7 7-7-7"/>',
    grip: '<circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
    trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    save: '<path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7"/><path d="M7 3v4a1 1 0 0 0 1 1h7"/>',
    maximize: '<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>',
    minimize: '<path d="M4 14h6v6"/><path d="M20 10h-6V4"/><path d="M14 10l7-7"/><path d="M3 21l7-7"/>',
    merge: '<path d="M12 22v-6"/><path d="M12 8V2"/><path d="m15 19-3-3-3 3"/><path d="m15 5-3 3-3-3"/>',
    eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    duplicate: '<path d="M15 12h-6M12 9v6"/><rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    cut: '<circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/>',
    paste: '<rect width="8" height="4" x="8" y="2" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
    split: '<path d="M3 12h4M17 12h4M10 12h4"/><path d="m8 5 4 4 4-4"/><path d="m8 19 4-4 4 4"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
    smile: '<circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><path d="M9 9h.01"/><path d="M15 9h.01"/>',
    wand: '<path d="m21.64 3.64-1.28-1.28a1.21 1.21 0 0 0-1.72 0L2.36 18.64a1.21 1.21 0 0 0 0 1.72l1.28 1.28a1.2 1.2 0 0 0 1.72 0L21.64 5.36a1.2 1.2 0 0 0 0-1.72"/><path d="m14 7 3 3"/><path d="M5 6v4"/><path d="M19 14v4"/><path d="M10 2v2"/><path d="M7 8H3"/><path d="M21 16h-4"/><path d="M11 3H9"/>',
  };
  const ic = (name, cls = 'size-5') => `<svg data-icon="${name}" class="${cls} shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.sliders}</svg>`;
  const esc = Blocks.esc;
  const attr = Blocks.attr;

  // ---- Cartes d'édition des types de base ----
  /** Champ modifiable (contenteditable). `rich` : mise en forme permise (barre), sinon texte simple. */
  const editable = (cls, html, ph, extra = '') => `<div ${extra} contenteditable="true" role="textbox" aria-multiline="true" spellcheck="false" data-placeholder="${attr(ph)}" class="bq-edit ${cls}">${html}</div>`;
  Blocks.editable = editable;
  {
    const richEdit = (cls, ph) => (b) => editable(`min-h-7 ${cls}`, b.html, ph, 'data-body data-rich aria-label="Texte du bloc"');
    const readHtml = (card, b) => { b.html = card.querySelector('[data-body]').innerHTML; };
    Object.assign(Blocks.types.text, { edit: richEdit('text-[15px] leading-relaxed', 'Écrivez ici…'), read: readHtml });
    // Texte en grand : la taille d'un titre, la mise en forme d'un texte.
    for (const k of ['t1', 't2', 't3']) Object.assign(Blocks.types[k], { edit: richEdit(`${Blocks.types[k].size} leading-snug text-stone-900`, 'Texte en grand…'), read: readHtml });
    Object.assign(Blocks.types.quote, { edit: richEdit('text-[15px] italic leading-relaxed', 'Une citation…'), read: readHtml });
    for (const k of Blocks.CALLOUTS) {
      const t = Blocks.types[k];
      Object.assign(t, {
        edit: (b) => `<div class="-ml-2 flex items-center">
            <button type="button" data-callout-icon aria-label="Icône de l’encadré" class="bq-btn text-xl ${b.icon ? '' : 'opacity-40 grayscale'}">${esc(b.icon || t.emoji)}</button>
            <input data-callout-title value="${attr(b.title || '')}" placeholder="Titre (facultatif)" aria-label="Titre de l’encadré" class="h-11 min-w-0 flex-1 bg-transparent text-[15px] font-bold placeholder:font-medium placeholder:opacity-50 focus:outline-none"></div>
          ${richEdit('text-[15px] leading-relaxed', 'Écrivez ici…')(b)}`,
        read: (card, b) => { readHtml(card, b); b.title = card.querySelector('[data-callout-title]').value; },
      });
    }
    for (const [k, cls, ph] of [['h1', 'text-2xl font-extrabold', 'Titre principal'], ['h2', 'text-xl font-bold', 'Titre de section'], ['h3', 'text-[17px] font-bold', 'Sous-titre']]) {
      Object.assign(Blocks.types[k], { edit: (b) => editable(`${cls} leading-snug tracking-tight text-stone-900`, b.html, ph, 'data-body data-plain aria-label="Titre"'), read: readHtml });
    }
    Object.assign(Blocks.types.photo, {
      edit: (b, ui) => `<figure class="space-y-2">${b.src ? `<img src="${attr(Blocks.mediaUrl(b.src, ui.media))}" alt="" class="max-h-72 w-full rounded-xl border border-stone-200 bg-stone-100 object-cover">` : ''}
          ${editable('text-sm italic text-stone-600', esc(b.alt), 'Légende (lue aux personnes malvoyantes)…', 'data-body data-plain aria-label="Légende de la photo"')}</figure>`,
      read: (card, b) => { b.alt = card.querySelector('[data-body]').textContent; },
    });
    // Carrousel : vignettes en ligne ; légende, ordre et retrait par photo ; ajout de plusieurs fichiers à la fois.
    Object.assign(Blocks.types.carousel, {
      edit: (b, ui) => `<div class="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1">${b.items.map((x, i) => `<figure data-car-item="${i}" class="w-40 shrink-0 snap-start rounded-xl border border-stone-200 bg-stone-50 p-1.5">
          <img src="${attr(Blocks.mediaUrl(x.src, ui.media))}" alt="" class="aspect-[4/3] w-full rounded-lg bg-stone-200 object-cover">
          <input data-car-alt value="${attr(x.alt)}" placeholder="Légende…" aria-label="Légende de la photo ${i + 1}" class="mt-1 h-9 w-full bg-transparent px-1 text-xs italic focus:outline-none">
          <div class="flex justify-between"><button type="button" data-car-act="left" ${i === 0 ? 'disabled' : ''} aria-label="Photo ${i + 1} : vers la gauche" class="bq-btn text-stone-500">${ic('chevron_left', 'size-4')}</button>
            <button type="button" data-car-act="remove" aria-label="Retirer la photo ${i + 1}" class="bq-btn text-red-600">${ic('x', 'size-4')}</button>
            <button type="button" data-car-act="right" ${i === b.items.length - 1 ? 'disabled' : ''} aria-label="Photo ${i + 1} : vers la droite" class="bq-btn text-stone-500">${ic('chevron_right', 'size-4')}</button></div></figure>`).join('')}
          <button type="button" data-car-add class="flex min-h-11 w-28 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-300 text-xs font-bold text-stone-500 hover:border-stone-400">${ic('plus')}Ajouter des photos</button></div>`,
      read: (card, b) => { card.querySelectorAll('[data-car-item]').forEach((el) => { b.items[Number(el.dataset.carItem)].alt = el.querySelector('[data-car-alt]').value; }); },
    });
    Object.assign(Blocks.types.video, {
      edit: (b) => `<input data-url type="url" value="${attr(b.url)}" class="h-11 w-full rounded-xl border border-rose-200 bg-white/80 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" placeholder="https://www.youtube.com/watch?v=…" aria-label="Lien de la vidéo YouTube ou Vimeo">`,
      read: (card, b) => { b.url = card.querySelector('[data-url]').value.trim(); },
    });
    // Bloc HTML : le code, ou son aperçu filtré (bouton œil à côté du type, `tools`). La carte porte data-view="preview" en aperçu.
    Object.assign(Blocks.types.html, {
      tools: (b, view) => `<button type="button" data-toggle-view aria-pressed="${view === 'preview'}" aria-label="Aperçu du HTML" title="Aperçu du HTML" class="group ml-1 inline-flex size-11 items-center justify-center rounded-full">
          <span class="flex size-8 items-center justify-center rounded-full border border-black/10 bg-white/70 text-indigo-700 group-hover:bg-white group-aria-pressed:bg-indigo-600 group-aria-pressed:text-white">${ic('eye', 'size-4')}</span></button>`,
      edit: (b, ui) => `<textarea data-html rows="${Math.min(16, Math.max(4, b.html.split('\n').length))}" spellcheck="false" aria-label="Code HTML" placeholder="<div class=&quot;…&quot;>…</div>" class="bq-view-code w-full rounded-xl border border-indigo-200 bg-white p-3 font-mono text-[13px] leading-5">${esc(b.html)}</textarea>
          <div data-html-preview aria-label="Aperçu filtré" class="bq-view-preview bq-content min-h-16 overflow-auto rounded-xl border border-dashed border-indigo-200 bg-white p-3 text-sm">${Blocks.sanitize(b.html, ui.media)}</div>`,
      read: (card, b) => { b.html = card.querySelector('[data-html]').value; },
      onInput: (card, ui) => { card.querySelector('[data-html-preview]').innerHTML = Blocks.sanitize(card.querySelector('[data-html]').value, ui.media); },
    });
    Object.assign(Blocks.types.hr, { fullscreen: false, edit: () => '<hr class="my-3 border-t-2 border-stone-300">', read: () => {} });
    Object.assign(Blocks.types.code, {
      edit: (b) => `<input data-lang value="${attr(b.lang)}" placeholder="langage (js, html, sh…)" aria-label="Langage du code" class="mb-1 h-9 w-full bg-transparent font-mono text-xs focus:outline-none">
          <textarea data-code rows="${Math.min(16, Math.max(3, b.code.split('\n').length))}" spellcheck="false" aria-label="Code" class="w-full rounded-xl border border-slate-300 bg-white p-3 font-mono text-[13px] leading-5">${esc(b.code)}</textarea>`,
      read: (card, b) => { b.lang = card.querySelector('[data-lang]').value.trim().replace(/[^\w+#.-]/g, ''); b.code = card.querySelector('[data-code]').value; },
    });
    // Repli : le texte du bloc, tel quel. Sert aussi à tout type enregistré sans carte d'édition propre.
    const sourceEdit = (b) => `<textarea data-raw rows="${Math.min(14, Math.max(3, Blocks.toMarkdown(b).split('\n').length))}" spellcheck="false" class="w-full rounded-xl border border-stone-300 bg-white p-3 font-mono text-[13px] leading-5" aria-label="Texte source du bloc">${esc(Blocks.toMarkdown(b))}</textarea>`;
    Object.assign(Blocks.types.raw, { edit: sourceEdit, read: (card, b) => { b.md = card.querySelector('[data-raw]').value; } });
    Blocks.fallbackEditor = {
      edit: sourceEdit,
      read: (card, b) => {
        const next = Blocks.fromMarkdown(card.querySelector('[data-raw]').value);
        for (const k of Object.keys(b)) if (k !== 'id') delete b[k];
        Object.assign(b, next);
      },
    };
  }

  const GROUPS = { text: 'Texte', media: 'Médias', structure: 'Structure' };
  const sheetCls = 'bq-sheet m-0 mt-auto max-h-[88dvh] w-full max-w-full overflow-auto rounded-t-3xl bg-white p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-stone-900 shadow-xl backdrop:bg-black/40 sm:m-auto sm:max-w-lg sm:rounded-3xl';
  // Feuille avec une ligne de titre (contenu à expliquer), ou menu d'actions sans titre (`menu`) : chaque ligne se suffit.
  const menu = (name, label, inner) => `<dialog data-sheet="${name}" autofocus aria-label="${attr(label)}" class="${sheetCls} !pt-2 outline-none">${inner}</dialog>`;
  const sheet = (name, label, inner) => `<dialog data-sheet="${name}" aria-label="${attr(label)}" class="${sheetCls}">
      <div class="-mx-1 -mt-1 mb-2 flex items-center gap-2"><h2 tabindex="-1" autofocus class="min-w-0 flex-1 truncate px-1 text-base font-bold outline-none">${esc(label)}</h2>
        <button type="button" data-close aria-label="Fermer" class="bq-btn text-stone-500">${ic('x')}</button></div>${inner}</dialog>`;
  const item = (data, icon, label, cls = '') => `<button type="button" ${data} class="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium hover:bg-stone-100 active:bg-stone-200 ${cls}">${ic(icon)}<span class="min-w-0 flex-1 truncate">${label}</span></button>`;

  /** Monte un éditeur dans `element`. Renvoie { getMarkdown(), setMarkdown(md), destroy() }. */
  function mount(element, options = {}) {
    const o = { media: 'media/', fields: {}, source: '', ...options };
    const ac = new AbortController();
    const on = (target, type, fn, opts = {}) => target?.addEventListener(type, fn, { ...opts, signal: ac.signal });
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };

    element.innerHTML = `<div data-bq class="bq-app flex min-h-full w-full flex-col bg-white font-jakarta text-stone-800"${o.width ? ` style="--bq-width: ${attr(o.width)}"` : ''}>
      <header data-head class="sticky top-0 z-20 flex min-h-14 items-center gap-0.5 border-b border-stone-200/80 bg-white/95 px-1.5 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:px-3">
        ${o.backUrl ? `<a href="${attr(o.backUrl)}" data-back aria-label="Retour" class="bq-btn text-stone-500">${ic('chevron_left')}</a>` : ''}
        ${o.title ? `<button type="button" data-doc-icon aria-label="Icône du document" class="bq-btn text-xl"></button>
        <div data-title contenteditable="true" role="textbox" aria-label="Titre du document" data-placeholder="Sans titre" spellcheck="false" class="bq-edit min-w-0 flex-1 truncate px-1 text-base font-extrabold leading-snug text-stone-900 sm:text-lg"></div>`
          : `<span data-label class="min-w-0 flex-1 truncate px-2 text-sm font-semibold text-stone-500">${esc(o.label || '')}</span>`}
        <button type="button" data-undo disabled aria-label="Annuler" title="Annuler (Ctrl+Z)" class="bq-btn text-stone-600">${ic('undo')}</button>
        <button type="button" data-redo disabled aria-label="Rétablir" title="Rétablir (Ctrl+Y)" class="bq-btn hidden text-stone-600 sm:inline-flex">${ic('redo')}</button>
        <button type="button" data-preview aria-pressed="false" aria-label="Aperçu" title="Aperçu" class="bq-btn text-stone-600 aria-pressed:bg-brand-600 aria-pressed:text-white">${ic('eye')}</button>
        ${o.aiUrl ? `<button type="button" data-ai aria-label="Assistant IA" title="Assistant IA" class="bq-btn hidden text-amber-600 sm:inline-flex">${ic('wand')}</button>` : ''}
        <button type="button" data-save aria-label="Enregistré" title="Enregistrer (Ctrl+S)" class="bq-btn relative text-stone-400">${ic('save')}<span data-dot hidden class="absolute right-2 top-2 size-2 rounded-full bg-brand-600"></span></button>
        <button type="button" data-width hidden aria-label="Largeur du texte" title="Largeur du texte" class="bq-btn text-stone-600 max-sm:hidden">${ic('width')}</button>
        <button type="button" data-full aria-label="Plein écran" title="Plein écran" class="bq-btn hidden text-stone-600 sm:inline-flex">${ic('maximize')}</button>
        <button type="button" data-more aria-label="Plus d’actions" aria-haspopup="dialog" class="bq-btn text-stone-600 sm:hidden">${ic('more')}</button>
      </header>
      <div data-canvas class="flex-1 bg-stone-50/60 px-3 pb-[40dvh] pt-3 sm:px-6 sm:pb-16"></div>
      <div data-bar role="toolbar" aria-label="Mise en forme" hidden class="bq-bar fixed left-1/2 z-50 flex w-max max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center rounded-2xl border border-stone-700 bg-stone-900/95 text-white shadow-2xl">
        <div data-bar-clip hidden role="group" aria-label="Presse-papiers" class="flex basis-full justify-center gap-1 border-b border-white/15 py-1">
          <button type="button" data-clip="copy" class="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold hover:bg-white/10">${ic('copy', 'size-4')}Copier</button>
          <button type="button" data-clip="cut" class="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold hover:bg-white/10">${ic('cut', 'size-4')}Couper</button>
          <button type="button" data-clip="paste" class="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-semibold hover:bg-white/10">${ic('paste', 'size-4')}Coller</button></div>
        <button type="button" data-fmt="bold" aria-label="Gras" class="bq-btn font-extrabold">B</button>
        <button type="button" data-fmt="italic" aria-label="Italique" class="bq-btn font-news italic">I</button>
        <button type="button" data-fmt="underline" aria-label="Souligner" class="bq-btn underline">U</button>
        <button type="button" data-fmt="highlight" aria-label="Surligner" class="bq-btn"><span class="size-4 rounded bg-amber-300"></span></button>
        <button type="button" data-fmt="insertUnorderedList" aria-label="Liste à puces" class="bq-btn">${ic('list')}</button>
        <button type="button" data-emoji-insert aria-label="Insérer un emoji" class="bq-btn">${ic('smile')}</button>
        <button type="button" data-clip-toggle aria-label="Copier, couper, coller" aria-expanded="false" class="bq-btn text-stone-300 aria-expanded:bg-white/15 aria-expanded:text-white">${ic('paste')}</button>
        <button type="button" data-split aria-label="Scinder le bloc au curseur" class="bq-btn text-stone-300">${ic('split')}</button>
      </div>
      <div class="pointer-events-none fixed inset-x-0 top-16 z-[60] flex justify-center">
        <div data-toast role="status" class="rounded-full bg-stone-900/95 px-3.5 py-2 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-300"></div>
      </div>
      <input type="file" data-file accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden aria-label="Choisir une photo">
      ${sheet('add', 'Ajouter un bloc', '<div data-add-list></div>')}
      ${menu('more', 'Actions', `<div class="grid gap-0.5">${item('data-more-act="redo"', 'redo', 'Rétablir')}${item('data-more-act="full"', 'maximize', 'Plein écran')}${o.aiUrl ? item('data-more-act="ai"', 'wand', 'Assistant IA') : ''}</div>`)}
      ${o.aiUrl ? sheet('ai', 'Assistant IA', `<div data-ai-form>
          <p data-ai-scope class="mb-2 truncate rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"></p>
          <div class="flex flex-wrap gap-1.5">${[['Corriger', 'Corrige l’orthographe et la grammaire, sans changer le sens ni la structure.'], ['Raccourcir', 'Raccourcis le texte en gardant l’essentiel.'], ['En étapes', 'Réécris sous forme d’étapes numérotées.'], ['Traduire', 'Traduis en anglais, en gardant la structure.']].map(([l, t]) => `<button type="button" data-ai-preset="${attr(t)}" class="min-h-11 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-950 hover:bg-amber-100">${l}</button>`).join('')}</div>
          <textarea data-ai-instruction rows="3" aria-label="Consigne" placeholder="Votre consigne, par exemple : ajoute une astuce sur le parking" class="mt-2 w-full rounded-xl border border-stone-300 p-3 text-[15px]"></textarea>
          <button type="button" data-ai-run class="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 font-semibold text-white disabled:opacity-60">${ic('wand', 'size-4')}<span>Envoyer</span></button></div>
        <div data-ai-result hidden>
          <ul data-ai-lint role="alert" class="mb-2 space-y-1 rounded-xl bg-red-50 p-3 text-xs text-red-800"></ul>
          <label data-ai-force-wrap class="mb-2 flex min-h-11 items-center gap-2 text-sm font-semibold text-red-800"><input type="checkbox" data-ai-force class="size-5"> Appliquer malgré les alertes</label>
          <p class="text-[11px] font-bold uppercase tracking-wider text-stone-400">Avant</p>
          <div data-ai-before class="bq-content mt-1 max-h-48 overflow-auto rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm"></div>
          <p class="mt-2 text-[11px] font-bold uppercase tracking-wider text-stone-400">Après</p>
          <div data-ai-after class="bq-content mt-1 max-h-64 overflow-auto rounded-xl border border-amber-200 bg-white p-3 text-sm"></div>
          <div class="mt-3 grid grid-cols-2 gap-2"><button type="button" data-ai-ignore class="min-h-11 rounded-xl border border-stone-300 px-4 font-semibold">Ignorer</button>
            <button type="button" data-ai-apply class="min-h-11 rounded-xl bg-brand-600 px-4 font-semibold text-white disabled:opacity-40">Appliquer</button></div></div>`) : ''}
      ${menu('menu', 'Actions du bloc', '<div data-menu-list class="grid gap-0.5"></div>')}
      ${sheet('delete', 'Supprimer ce bloc ?', `<p data-del-preview class="line-clamp-3 rounded-2xl border border-stone-200 bg-stone-50 p-3 text-sm italic text-stone-700"></p>
        <button type="button" data-del-confirm class="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 font-semibold text-white hover:bg-red-700">${ic('trash')}Supprimer</button>`)}
      ${sheet('leave', 'Modifications non enregistrées', `<div class="grid gap-2"><button type="button" data-leave-save class="min-h-11 rounded-xl bg-brand-600 px-4 font-semibold text-white">Enregistrer et quitter</button>
        <button type="button" data-leave-discard class="min-h-11 rounded-xl bg-red-600 px-4 font-semibold text-white">Quitter sans enregistrer</button></div>`)}
      ${sheet('icon', 'Emoji', `<input data-emoji-search type="search" enterkeyhint="search" aria-label="Chercher un emoji" placeholder="Chercher : clé, maison, attention…" class="h-11 w-full rounded-xl border border-stone-300 px-3 text-[15px]">
        <div data-emoji-tabs role="tablist" aria-label="Catégories" class="-mx-1 mt-2 flex gap-1 overflow-x-auto pb-1"></div>
        <div data-emoji-grid class="mt-1 grid h-[min(19rem,42dvh)] grid-cols-7 content-start overflow-y-auto sm:grid-cols-9"></div>
        <div class="mt-3 flex gap-2"><input data-icon-input aria-label="Votre emoji" placeholder="Ou collez un emoji" class="h-11 min-w-0 flex-1 rounded-xl border border-stone-300 px-3 text-xl"><button type="button" data-icon-use class="min-h-11 rounded-xl bg-brand-600 px-4 font-semibold text-white">Utiliser</button></div>
        <button type="button" data-icon-pick="" data-emoji-none class="mt-2 min-h-11 rounded-xl px-3 font-medium text-brand-700 hover:bg-brand-50">Aucune icône</button>`)}
      <dialog data-block-full aria-label="Bloc en plein écran" class="bq-full bg-white"><div data-full-inner class="bq-full-inner">
        <div class="sticky top-0 z-10 flex min-h-14 items-center gap-1 border-b border-stone-200/80 bg-white/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur-md">
          <span data-block-full-label class="min-w-0 flex-1 truncate px-2 text-sm font-bold text-stone-500"></span>
          <button type="button" data-width aria-label="Largeur du texte" title="Largeur du texte" class="bq-btn hidden text-stone-600 sm:inline-flex">${ic('width')}</button>
          <button type="button" data-block-full-close aria-label="Quitter le plein écran" title="Quitter le plein écran" class="group inline-flex size-11 shrink-0 items-center justify-center rounded-full">
            <span class="flex size-8 items-center justify-center rounded-full border border-black/10 bg-white text-stone-700 group-hover:bg-stone-100">${ic('minimize', 'size-4')}</span></button></div>
        <div data-block-full-body class="bq-column px-4 py-6 sm:px-8"></div></div>
    </div>
    <dialog data-editor-full aria-label="Éditeur en plein écran" class="bq-full bg-white"><div data-full-inner class="bq-full-inner"></div></dialog>`;

    const app = element.firstElementChild;
    const editorFull = element.lastElementChild;
    const blockFull = app.querySelector('[data-block-full]');
    // Conteneur intérieur du dialogue plein écran : c'est lui qui défile.
    const inner = (d) => d.querySelector('[data-full-inner]');
    const $ = (s, r = app) => r.querySelector(s);
    const canvas = $('[data-canvas]');
    const bar = $('[data-bar]');
    const head = $('[data-head]');
    // Titre et icône du document : seulement avec l'option `title` (l'éditeur peut ne remplir qu'une partie d'une page).
    // Sans elle, ces deux éléments existent hors de la page (aucun écouteur n'y arrive) et le frontmatter est gardé tel quel.
    const titleEl = $('[data-title]') || document.createElement('div');
    const iconBtn = $('[data-doc-icon]') || document.createElement('button');
    const saveBtn = $('[data-save]');
    const fileInput = $('[data-file]');
    const toastEl = $('[data-toast]');
    const sheets = {};
    app.querySelectorAll('[data-sheet]').forEach((d) => { sheets[d.dataset.sheet] = d; });
    const ui = { ic, esc, attr, media: o.media, editable };

    let meta = {};
    let icon = '';
    let blocks = [];
    let dirty = false;
    let preview = false;
    let insertAt = null; // null = en bas
    let menuId = null;
    let iconTarget = null; // null = document, sinon id du bloc (encadré)
    let activeId = null;
    let nextId = 1;
    const newId = () => 'b' + nextId++;
    const def = (b) => Blocks.def(b.type);

    const toast = (text) => {
      toastEl.textContent = text;
      toastEl.classList.remove('opacity-0');
      clearTimeout(toast.timer);
      toast.timer = later(() => toastEl.classList.add('opacity-0'), 1800);
    };

    // ---- Feuilles <dialog> : [data-close] ferme ; un toucher qui commence ET finit sur le fond ferme ----
    const outside = (d, e) => { const r = d.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
    let pressedBackdrop = false;
    Object.values(sheets).forEach((d) => {
      on(d, 'pointerdown', (e) => { pressedBackdrop = e.target === d && outside(d, e); });
      on(d, 'click', (e) => {
        if (e.target.closest('[data-close]')) d.close();
        else if (pressedBackdrop && e.target === d && outside(d, e)) d.close();
        pressedBackdrop = false;
      });
    });
    // Sur grand écran, un menu s'ouvre à côté du bouton qui l'appelle ; sur téléphone, en feuille du bas.
    const openSheet = (name, from) => {
      const d = sheets[name];
      d.classList.remove('bq-pop');
      d.style.removeProperty('top');
      d.style.removeProperty('left');
      d.showModal();
      if (from && innerWidth >= 640) {
        const r = from.getBoundingClientRect();
        d.classList.add('bq-pop');
        const h = d.offsetHeight;
        const w = d.offsetWidth;
        d.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
        d.style.top = (r.bottom + h + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - h - 4)) + 'px';
      }
    };

    // ---- État enregistré / à enregistrer ----
    const setDirty = (value) => {
      dirty = value;
      $('[data-dot]', saveBtn).hidden = !value;
      saveBtn.classList.toggle('text-brand-700', value);
      saveBtn.classList.toggle('text-stone-400', !value);
      saveBtn.setAttribute('aria-label', value ? 'Enregistrer' : 'Enregistré');
    };
    on(window, 'beforeunload', (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

    // ---- Titre et icône : dans le frontmatter ; les autres clés sont gardées dans leur ordre ----
    const showIcon = () => { iconBtn.textContent = icon || '📄'; iconBtn.classList.toggle('grayscale', !icon); };
    const docMeta = () => {
      const m = { ...meta };
      if (!o.title) return m;
      const title = titleEl.textContent.replace(/\s+/g, ' ').trim();
      if (title) m.title = title; else delete m.title;
      if (icon) m.icon = icon; else delete m.icon;
      return m;
    };

    // ---- Écran → modèle (avant tout nouveau dessin) ----
    const cardsIn = () => app.querySelectorAll('[data-id]');
    const syncFromDom = () => {
      if (preview) return;
      cardsIn().forEach((card) => {
        const b = blocks.find((x) => x.id === card.dataset.id);
        if (b) editorOf(b).read(card, b);
      });
    };
    const markdown = () => { syncFromDom(); return Blocks.serialize(docMeta(), blocks); };

    // ---- Dessin ----
    const pill = 'inline-flex h-7 items-center gap-1 rounded-full border border-stone-200/90 bg-white px-2.5 text-[11px] font-bold text-stone-500 shadow-sm group-hover:border-stone-400 group-hover:text-stone-800';
    const gap = (index) => {
      const canMerge = index > 0 && index < blocks.length && Blocks.merge(blocks[index - 1], blocks[index]) !== null;
      // Intervalle aéré : la pastille de 28 px est à 12 px de chaque carte (cible tactile de 44 px + 4 px de marge).
      return `<div class="bq-gap flex justify-center gap-1 py-1">
        <button type="button" data-insert="${index}" aria-label="${index === 0 ? 'Insérer un bloc au début' : 'Insérer un bloc ici'}" class="group flex h-11 items-center px-1"><span class="${pill}">${ic('plus', 'size-3.5')}Insérer</span></button>
        ${canMerge ? `<button type="button" data-merge="${index}" aria-label="Fusionner avec le bloc du dessus" class="group flex h-11 items-center px-1"><span class="${pill}">${ic('merge', 'size-3.5')}Fusionner</span></button>` : ''}</div>`;
    };
    const badge = (b) => {
      const t = def(b);
      return t.convertible
        ? `<label class="relative inline-flex items-center">${ic(t.icon, 'pointer-events-none absolute left-2 size-3.5 opacity-80')}
            <select data-convert aria-label="Type du bloc" class="h-7 cursor-pointer appearance-none rounded-full border py-0 pl-7 pr-6 text-[11px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${t.tone.badge}">
            ${Blocks.TEXT_KEYS.map((k) => `<option value="${k}" ${k === b.type ? 'selected' : ''}>${esc(Blocks.types[k].label)}</option>`).join('')}</select>
            ${ic('chevron_down', 'pointer-events-none absolute right-2 size-3 opacity-70')}</label>`
        : `<span class="inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[11px] font-bold ${t.tone.badge}">${ic(t.icon, 'size-3.5')}${esc(t.label)}</span>`;
    };
    // Carte : à gauche le type (liste de conversion), à droite du type trois boutons ronds (menu, agrandir, supprimer) ;
    // colonne de droite : monter, poignée, descendre. Une action = un seul endroit.
    const round = (data, icon, label, cls = 'text-stone-600') => `<button type="button" ${data} aria-label="${label}" title="${label}" class="group inline-flex size-11 shrink-0 items-center justify-center rounded-full">
        <span class="flex size-8 items-center justify-center rounded-full border border-black/10 bg-white/70 transition-colors group-hover:bg-white group-active:bg-stone-100 ${cls}">${ic(icon, 'size-4')}</span></button>`;
    // Outils propres à un type (ex. œil du bloc HTML), à côté du type ; `views` garde l'affichage choisi par bloc (code / aperçu).
    const views = new Map();
    const card = (b, i) => `<article data-id="${b.id}" data-view="${views.get(b.id) || 'edit'}" aria-label="${attr(def(b).label)}" class="bq-card flex rounded-2xl border ${def(b).tone.card}">
        <div class="min-w-0 flex-1 pb-3 pl-3 pr-1">
          <div class="flex h-11 items-center">${badge(b)}${editorOf(b) === def(b) && def(b).tools ? def(b).tools(b, views.get(b.id)) : ''}<span class="flex-1"></span>
            ${round('data-menu aria-haspopup="dialog"', 'more', 'Actions du bloc')}
            ${def(b).fullscreen === false ? '' : round('data-expand', 'maximize', 'Plein écran')}
            ${round('data-delete', 'trash', 'Supprimer ce bloc', 'text-red-600')}</div>
          <div data-card-body>${editorOf(b).edit(b, ui)}</div></div>
        <div data-rail class="flex w-11 shrink-0 select-none flex-col items-center justify-between border-l border-black/5 py-1">
          <button type="button" data-move="-1" ${i === 0 ? 'disabled' : ''} aria-label="Monter ce bloc" class="bq-rail">${ic('chevron_up', 'size-4')}</button>
          <button type="button" data-grip aria-label="Déplacer (glisser, ou flèches haut et bas)" class="bq-rail cursor-grab touch-none text-stone-400 active:cursor-grabbing">${ic('grip', 'size-4')}</button>
          <button type="button" data-move="1" ${i === blocks.length - 1 ? 'disabled' : ''} aria-label="Descendre ce bloc" class="bq-rail">${ic('chevron_down', 'size-4')}</button></div></article>`;

    // Bloc HTML désactivé (option `html` absente) : édité comme texte source, sans aperçu.
    const editorOf = (b) => (def(b).edit && (b.type !== 'html' || o.html) ? def(b) : Blocks.fallbackEditor);
    const render = () => (preview ? renderPreview() : renderEdit());
    const renderEdit = () => {
      canvas.innerHTML = `<div class="bq-column relative">${blocks.map((b, i) => gap(i) + card(b, i)).join('')}
        <button type="button" data-insert="end" class="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-stone-300 bg-white/70 text-sm font-bold text-stone-500 hover:border-stone-400 hover:text-stone-800">${ic('plus', 'size-4')}Ajouter un bloc</button></div>`;
      canvas.querySelectorAll('.bq-edit').forEach(clean);
    };
    const clean = (el) => { if (el.innerHTML !== '' && el.textContent === '' && !el.querySelector('img, ul, ol, li')) el.innerHTML = ''; };
    const renderPreview = async () => {
      hideBar();
      const text = markdown();
      canvas.innerHTML = '<p class="py-10 text-center text-sm text-stone-500">Chargement de l’aperçu…</p>';
      try {
        const html = o.previewUrl ? await (await fetch(o.previewUrl, { method: 'POST', body: form({ text }), signal: ac.signal })).text() : Blocks.toHtml(text, { media: o.media });
        if (preview) {
          canvas.innerHTML = `<div class="bq-column rounded-2xl bg-white p-4 sm:p-8">${html}</div>`;
          window.BlockquiltContent?.enhance(canvas); // flèches et puces des carrousels, si blockquilt-content.js est chargé
        }
      } catch {
        if (preview) canvas.innerHTML = '<p role="alert" class="rounded-xl bg-red-100 p-3 text-red-800">Aperçu indisponible. Réessayez.</p>';
      }
    };
    const setPreview = (value) => {
      if (value === preview) return;
      syncFromDom();
      preview = value;
      $('[data-preview]').setAttribute('aria-pressed', String(value));
      titleEl.contentEditable = String(!value);
      render();
    };
    const focusCard = (id) => {
      const el = canvas.querySelector(`[data-id="${id}"]`);
      if (!el) return;
      el.scrollIntoView({ block: 'nearest' });
      const field = el.querySelector('[contenteditable], input, textarea');
      if (field) field.focus({ preventScroll: true }); else el.querySelector('[data-menu]')?.focus({ preventScroll: true });
    };

    // ---- Envois au serveur hôte : champs fixes (`fields`, ex. jeton CSRF) + champs de l'échange ----
    const form = (extra) => {
      const data = new FormData();
      for (const [k, v] of Object.entries({ ...o.fields, ...extra })) data.set(k, v);
      return data;
    };

    // ---- Annuler / rétablir : un instantané = le texte complet + la place du bloc actif ----
    // Pris avant et après chaque action de structure, et après 1 s sans frappe. 50 instantanés au plus.
    const LIMIT = 50;
    let past = [];
    let future = [];
    let baseline = null;
    let typing = false;
    const snapshot = () => ({ md: markdown(), active: Math.max(0, blocks.findIndex((b) => b.id === activeId)) });
    const updateHistoryButtons = () => {
      app.querySelector('[data-undo]').disabled = !past.length && !typing;
      app.querySelector('[data-redo]').disabled = !future.length;
    };
    const checkpoint = () => {
      if (preview) return;
      clearTimeout(checkpoint.timer);
      typing = false;
      const cur = snapshot();
      if (baseline && cur.md !== baseline.md) {
        past.push(baseline);
        if (past.length > LIMIT) past.shift();
        future = [];
      }
      baseline = cur;
      updateHistoryButtons();
    };
    const typed = () => {
      typing = true;
      clearTimeout(checkpoint.timer);
      checkpoint.timer = later(checkpoint, 1000);
      updateHistoryButtons();
    };
    const restore = (state) => {
      const { meta: m, blocks: parsed } = Blocks.parse(state.md);
      meta = m;
      icon = m.icon || '';
      titleEl.textContent = m.title || '';
      showIcon();
      blocks = parsed.map((b) => ({ id: newId(), ...b }));
      if (!blocks.length) blocks = [{ id: newId(), ...Blocks.blank('text') }];
      activeId = blocks[Math.min(state.active, blocks.length - 1)].id;
      setDirty(true);
      render();
      canvas.querySelector(`[data-id="${activeId}"]`)?.scrollIntoView({ block: 'nearest' });
      updateHistoryButtons();
    };
    const undo = () => {
      if (preview) return false;
      if (blockFull.open) blockFull.close();
      checkpoint();
      if (!past.length) return false;
      future.push(baseline);
      baseline = past.pop();
      restore(baseline);
      return true;
    };
    const redo = () => {
      if (preview || !future.length) return false;
      if (blockFull.open) blockFull.close();
      past.push(baseline);
      baseline = future.pop();
      restore(baseline);
      return true;
    };

    // ---- Actions de structure ----
    const change = (fn) => { checkpoint(); fn(); setDirty(true); render(); checkpoint(); };
    const add = (type, at, extra = {}) => {
      const b = { id: newId(), ...Blocks.blank(type), ...extra };
      change(() => blocks.splice(at === null || at > blocks.length ? blocks.length : at, 0, b));
      canvas.querySelector(`[data-id="${b.id}"]`)?.classList.add('bq-new');
      focusCard(b.id);
      return b;
    };
    // Après un déplacement, le focus reste sur le bouton utilisé (chevron ou poignée) de la carte déplacée.
    const move = (id, to, focus = '[data-grip]') => {
      const i = blocks.findIndex((b) => b.id === id);
      if (i < 0 || to < 0 || to >= blocks.length || to === i) return;
      change(() => blocks.splice(to, 0, ...blocks.splice(i, 1)));
      const cardEl = canvas.querySelector(`[data-id="${id}"]`);
      (cardEl?.querySelector(`${focus}:not(:disabled)`) || cardEl?.querySelector('[data-grip]'))?.focus({ preventScroll: true });
      canvas.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
    };
    const merge = (index) => {
      syncFromDom();
      const fused = Blocks.merge(blocks[index - 1], blocks[index]);
      if (!fused) return;
      change(() => blocks.splice(index - 1, 2, fused));
      toast('Blocs fusionnés');
    };
    const remove = (id) => { change(() => { blocks = blocks.filter((b) => b.id !== id); }); toast('Bloc supprimé'); };
    const convert = (id, type) => {
      const i = blocks.findIndex((b) => b.id === id);
      change(() => { blocks[i] = { id, ...Blocks.convert(blocks[i], type) }; });
      toast('Converti en ' + Blocks.def(type).label);
    };
    // Coupe le bloc au curseur : ce qui suit part dans un nouveau bloc du même type, juste en dessous.
    const richOf = (node) => (node && (node.nodeType === 1 ? node : node.parentElement))?.closest('.bq-edit[data-rich]');
    const split = (range) => {
      const field = richOf(range.startContainer);
      const id = field?.closest('[data-id]')?.dataset.id;
      if (!id) return;
      const tail = document.createRange();
      tail.setStart(range.startContainer, range.startOffset);
      tail.setEnd(field, field.childNodes.length);
      const box = document.createElement('div');
      box.append(tail.extractContents());
      syncFromDom();
      const i = blocks.findIndex((b) => b.id === id);
      const nb = { ...blocks[i], id: newId(), html: box.innerHTML, ...('title' in blocks[i] ? { title: '', icon: '' } : {}) };
      change(() => blocks.splice(i + 1, 0, nb));
      hideBar();
      focusCard(nb.id);
      toast('Bloc scindé');
    };

    // ---- Menu d'ajout : construit depuis le registre à chaque ouverture ----
    const openAdd = (at) => {
      syncFromDom();
      insertAt = at;
      const groups = {};
      for (const k of Blocks.order) {
        const t = Blocks.types[k];
        if (t.group === 'none' || t.hidden || (k === 'html' && !o.html)) continue;
        (groups[t.group] = groups[t.group] || []).push(k);
      }
      $('[data-add-list]', sheets.add).innerHTML = Object.entries(groups).map(([g, keys]) => `<p class="mb-1 mt-3 px-1 text-[11px] font-bold uppercase tracking-wider text-stone-400 first:mt-0">${esc(GROUPS[g] || g)}</p>
        <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">${keys.map((k) => `<button type="button" data-pick="${k}" class="flex min-h-11 items-center gap-2 rounded-xl border px-2.5 text-left text-sm font-semibold ${Blocks.types[k].tone.card}">
          <span class="flex size-7 shrink-0 items-center justify-center rounded-lg border ${Blocks.types[k].tone.badge}">${ic(Blocks.types[k].icon, 'size-4')}</span><span class="min-w-0 truncate">${esc(Blocks.types[k].label)}</span></button>`).join('')}</div>`).join('');
      openSheet('add');
    };
    on(sheets.add, 'click', (e) => {
      const pick = e.target.closest('[data-pick]');
      if (!pick) return;
      sheets.add.close();
      if (pick.dataset.pick === 'photo' || pick.dataset.pick === 'carousel') { fileTarget = { type: pick.dataset.pick, at: insertAt }; return fileInput.click(); }
      add(pick.dataset.pick, insertAt);
    });
    const upload = async (file) => {
      if (!o.uploadUrl) throw new Error('Envoi de photos non configuré');
      const r = await fetch(o.uploadUrl, { method: 'POST', body: form({ photo: file }), headers: { Accept: 'application/json' }, signal: ac.signal });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !(j.id || j.src)) throw new Error(j.error || 'Envoi impossible');
      return j.src || 'media/' + j.id;
    };
    // Envoi de photos : plusieurs fichiers à la fois. Selon la demande : un bloc photo par fichier, un carrousel neuf, ou des photos ajoutées à un carrousel.
    let fileTarget = null;
    on(fileInput, 'change', async () => {
      const files = [...fileInput.files];
      const target = fileTarget || { type: 'photo', at: null };
      fileInput.value = '';
      fileTarget = null;
      if (!files.length) return;
      toast(files.length > 1 ? `Envoi de ${files.length} photos…` : 'Envoi de la photo…');
      try {
        const srcs = [];
        for (const f of files) srcs.push(await upload(f));
        const items = srcs.map((src) => ({ src, alt: '' }));
        if (target.add) {
          syncFromDom();
          const b = blocks.find((x) => x.id === target.add);
          if (b) change(() => b.items.push(...items));
        } else if (target.type === 'carousel') add('carousel', target.at, { items });
        else {
          const at = target.at === null ? blocks.length : target.at;
          const fresh = items.map((x) => ({ id: newId(), ...Blocks.blank('photo'), ...x }));
          change(() => blocks.splice(at, 0, ...fresh));
          focusCard(fresh[0].id);
        }
        toast(srcs.length > 1 ? `${srcs.length} photos ajoutées` : 'Photo ajoutée');
      } catch (error) {
        toast(error.message);
      }
    });
    const carousel = (el, id) => {
      const b = blocks.find((x) => x.id === id);
      if (el.closest('[data-car-add]')) { fileTarget = { add: id }; return fileInput.click(); }
      const i = Number(el.closest('[data-car-item]').dataset.carItem);
      const act = el.closest('[data-car-act]').dataset.carAct;
      syncFromDom();
      const j = act === 'left' ? i - 1 : i + 1;
      change(() => { if (act === 'remove') b.items.splice(i, 1); else [b.items[i], b.items[j]] = [b.items[j], b.items[i]]; });
      canvas.querySelector(`[data-id="${id}"] [data-car-item="${act === 'remove' ? Math.max(0, i - 1) : j}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };

    // ---- Menu du bloc « ⋯ » ----
    const openMenu = (id, from) => {
      syncFromDom();
      menuId = id;
      const i = blocks.findIndex((b) => b.id === id);
      const b = blocks[i];
      sheets.menu.setAttribute('aria-label', 'Actions du bloc ' + def(b).label);
      // Le type, l'ordre, le plein écran et la suppression ont leur bouton sur la carte : ils ne sont pas répétés ici.
      $('[data-menu-list]', sheets.menu).innerHTML = item('data-act="duplicate"', 'duplicate', 'Dupliquer')
        + item('data-act="copy"', 'copy', 'Copier')
        + item('data-act="paste-above"', 'paste', 'Coller au-dessus')
        + item('data-act="paste"', 'paste', 'Coller dessous')
        + (o.aiUrl ? item('data-act="ai"', 'wand', 'IA sur ce bloc', 'text-amber-800') : '');
      openSheet('menu', from);
    };
    on(sheets.menu, 'click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      sheets.menu.close();
      const id = menuId;
      const i = blocks.findIndex((b) => b.id === id);
      if (i < 0) return;
      if (act === 'duplicate') { const copy = { ...structuredClone(blocks[i]), id: newId() }; change(() => blocks.splice(i + 1, 0, copy)); toast('Bloc dupliqué'); }
      else if (act === 'copy') { copyText(Blocks.toMarkdown(blocks[i])); toast('Bloc copié'); }
      else if (act === 'paste' || act === 'paste-above') paste(id, act === 'paste' ? 1 : 0);
      else if (act === 'ai') openAi(id);
    });
    const askDelete = (id) => {
      syncFromDom();
      menuId = id;
      const b = blocks.find((x) => x.id === id);
      if (b) {
        const preview = Blocks.stripTags(Blocks.toMarkdown(b)).replace(/\n/g, ' • ').trim();
        $('[data-del-preview]', sheets.delete).textContent = preview ? `« ${preview.slice(0, 160)}${preview.length > 160 ? '…' : ''} »` : '(Bloc vide)';
        openSheet('delete');
      }
    };
    on(sheets.delete, 'click', (e) => {
      if (!e.target.closest('[data-del-confirm]')) return;
      sheets.delete.close();
      remove(menuId);
    });

    // ---- Assistant IA : l'hôte fournit `aiUrl` ; l'éditeur n'appelle aucun modèle lui-même et ne contient aucune clé ----
    // Envoi : scope (document | block), instruction, text (document), block (Markdown du bloc). Réponse : { markdown }.
    // La réponse passe par Blocks.lint, s'affiche avant / après, puis « Appliquer » (annulable) ou « Ignorer ».
    let ai = null; // { id, markdown }
    const aiSheet = sheets.ai;
    const openAi = (id) => {
      if (!aiSheet) return;
      syncFromDom();
      ai = { id };
      const b = id && blocks.find((x) => x.id === id);
      $('[data-ai-scope]', aiSheet).textContent = b ? `Sur ce bloc : ${def(b).label}` : 'Sur tout le document';
      $('[data-ai-form]', aiSheet).hidden = false;
      $('[data-ai-result]', aiSheet).hidden = true;
      $('[data-ai-instruction]', aiSheet).value = '';
      openSheet('ai');
    };
    const runAi = async () => {
      const instruction = $('[data-ai-instruction]', aiSheet).value.trim();
      if (!instruction) return toast('Écrivez une consigne');
      const text = markdown();
      const b = ai.id && blocks.find((x) => x.id === ai.id);
      if (ai.id && !b) return aiSheet.close();
      const run = $('[data-ai-run]', aiSheet);
      run.disabled = true;
      run.querySelector('span').textContent = 'L’IA travaille…';
      try {
        const r = await fetch(o.aiUrl, { method: 'POST', body: form({ scope: b ? 'block' : 'document', instruction, text, ...(b ? { block: Blocks.toMarkdown(b) } : {}) }), headers: { Accept: 'application/json' }, signal: ac.signal });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || typeof j.markdown !== 'string') throw new Error(j.error || 'Pas de réponse de l’IA');
        ai.markdown = j.markdown.replace(/\r\n/g, '\n');
        const problems = Blocks.lint(ai.markdown);
        const lint = $('[data-ai-lint]', aiSheet);
        lint.hidden = !problems.length;
        lint.innerHTML = problems.map((p) => `<li>Ligne ${p.line} : ${esc(p.message)}</li>`).join('');
        $('[data-ai-force-wrap]', aiSheet).hidden = !problems.length;
        $('[data-ai-force]', aiSheet).checked = false;
        $('[data-ai-apply]', aiSheet).disabled = problems.length > 0;
        const show = (md) => Blocks.toHtml(md, { media: o.media, title: !b });
        $('[data-ai-before]', aiSheet).innerHTML = show(b ? Blocks.toMarkdown(b) : text);
        $('[data-ai-after]', aiSheet).innerHTML = show(ai.markdown);
        $('[data-ai-form]', aiSheet).hidden = true;
        $('[data-ai-result]', aiSheet).hidden = false;
      } catch (error) {
        if (error.name !== 'AbortError') toast(error.message);
      } finally {
        run.disabled = false;
        run.querySelector('span').textContent = 'Envoyer';
      }
    };
    const applyAi = () => {
      const parsed = Blocks.parse(ai.markdown);
      const fresh = parsed.blocks.map((b) => ({ id: newId(), ...b }));
      if (ai.id) {
        const i = blocks.findIndex((x) => x.id === ai.id);
        if (i < 0) return;
        change(() => blocks.splice(i, 1, ...fresh));
      } else {
        change(() => {
          if (Object.keys(parsed.meta).length) { meta = parsed.meta; icon = meta.icon || ''; titleEl.textContent = meta.title || ''; showIcon(); }
          blocks = fresh.length ? fresh : [{ id: newId(), ...Blocks.blank('text') }];
        });
      }
      toast('Proposition appliquée');
    };
    on(aiSheet, 'click', (e) => {
      const preset = e.target.closest('[data-ai-preset]');
      if (preset) { $('[data-ai-instruction]', aiSheet).value = preset.dataset.aiPreset; return runAi(); }
      if (e.target.closest('[data-ai-run]')) return runAi();
      if (e.target.closest('[data-ai-ignore]')) { aiSheet.close(); return; }
      if (e.target.closest('[data-ai-apply]')) { aiSheet.close(); applyAi(); }
    });
    on(aiSheet, 'change', (e) => { if (e.target.matches('[data-ai-force]')) $('[data-ai-apply]', aiSheet).disabled = !e.target.checked; });

    // ---- Copier / coller : du Markdown, découpé en blocs par Blocks.parse ----
    const copyText = (text) => {
      Blockquilt.clipboard = text;
      navigator.clipboard?.writeText(text).catch(() => {});
    };
    const paste = async (id, offset) => {
      let text = '';
      try { text = await navigator.clipboard.readText(); } catch { /* refusé : copie interne */ }
      if (!text.trim()) text = Blockquilt.clipboard || '';
      const parsed = Blocks.parse(text).blocks.filter((b) => !Blocks.isEmpty(b));
      if (!parsed.length) return toast('Presse-papiers vide');
      const i = blocks.findIndex((b) => b.id === id);
      const fresh = parsed.map((b) => ({ id: newId(), ...b }));
      change(() => blocks.splice(i + offset, 0, ...fresh));
      toast(fresh.length > 1 ? `${fresh.length} blocs collés` : 'Bloc collé');
    };

    // ---- Plein écran : un <dialog> modal qui couvre toute la fenêtre (éditeur entier, ou un bloc seul sans son habillage de carte) ----
    // Pas de plein écran du navigateur : il impose son message « Pour quitter le plein écran… », gênant pour écrire.
    const enterFull = (d) => {
      d.showModal();
      app.querySelectorAll('[data-width]').forEach((w) => { w.hidden = false; });
    };
    const leaveFull = () => {
      app.querySelectorAll('[data-head] [data-width]').forEach((w) => { w.hidden = !editorFull.open; });
    };
    // Largeur du texte : variable CSS --bq-width (option `width`, 48rem par défaut) ; en plein écran, le bouton fait le tour des trois largeurs.
    const WIDTHS = [['40rem', 'étroite'], ['48rem', 'moyenne'], ['100%', 'pleine']];
    const cycleWidth = () => {
      const now = app.style.getPropertyValue('--bq-width') || '48rem';
      const next = WIDTHS[(WIDTHS.findIndex(([w]) => w === now) + 1) % WIDTHS.length];
      app.style.setProperty('--bq-width', next[0]);
      blockFull.style.setProperty('--bq-width', next[0]);
      toast('Largeur ' + next[1]);
    };
    const toggleEditorFull = () => {
      if (editorFull.open) return editorFull.close();
      inner(editorFull).append(app);
      enterFull(editorFull);
      setFullButton(true);
    };
    // En plein écran, l'icône « réduire » reste dans la barre du haut, sur téléphone aussi ; le menu « ⋯ » suit.
    const setFullButton = (full) => {
      const b = app.querySelector('[data-full]');
      b.classList.toggle('hidden', !full);
      b.setAttribute('aria-label', full ? 'Quitter le plein écran' : 'Plein écran');
      b.title = b.getAttribute('aria-label');
      b.innerHTML = ic(full ? 'minimize' : 'maximize');
      const more = sheets.more.querySelector('[data-more-act="full"]');
      more.innerHTML = ic(full ? 'minimize' : 'maximize') + `<span class="min-w-0 flex-1 truncate">${full ? 'Quitter le plein écran' : 'Plein écran'}</span>`;
    };
    on(editorFull, 'close', () => {
      element.prepend(app);
      setFullButton(false);
      leaveFull();
      placeBar();
    });
    // Le bloc est redessiné seul dans le dialogue ; sa carte, restée dans la page, perd data-id le temps de l'édition.
    const openBlockFull = (id) => {
      syncFromDom();
      const b = blocks.find((x) => x.id === id);
      const cardEl = canvas.querySelector(`[data-id="${id}"]`);
      if (!b || !cardEl) return;
      cardEl.removeAttribute('data-id');
      cardEl.dataset.away = id;
      const tools = editorOf(b) === def(b) && def(b).tools ? `<div class="-mt-2 mb-2 flex">${def(b).tools(b, views.get(id))}</div>` : '';
      $('[data-block-full-label]', blockFull).textContent = def(b).label;
      $('[data-block-full-body]', blockFull).innerHTML = `<div data-id="${id}" data-view="${views.get(id) || 'edit'}" class="bq-focus">${tools}${editorOf(b).edit(b, ui)}</div>`;
      blockFull.style.setProperty('--bq-width', app.style.getPropertyValue('--bq-width') || '');
      inner(blockFull).append(bar, toastEl.parentElement); // la barre et les messages doivent être dans la couche du dialogue
      enterFull(blockFull);
      blockFull.querySelector('[contenteditable], textarea, input')?.focus();
    };
    on(blockFull, 'close', () => {
      app.append(bar, toastEl.parentElement);
      hideBar();
      checkpoint(); // lit le bloc dans le dialogue
      $('[data-block-full-body]', blockFull).replaceChildren();
      leaveFull();
      render();
    });
    // Échap pendant un glissement : annule le glissement, ne ferme pas le plein écran.
    on(editorFull, 'cancel', (e) => { if (drag) e.preventDefault(); });

    // ---- Glisser-déposer : la carte reste à sa place, une copie suit le doigt, un trait bleu marque l'arrivée ----
    let drag = null;
    const scroller = () => (editorFull.open ? inner(editorFull) : document.scrollingElement);
    const dropAt = (y) => {
      const list = [...canvas.querySelectorAll('[data-id]')];
      let slot = list.findIndex((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
      if (slot < 0) slot = list.length;
      const box = drag.line.parentElement.getBoundingClientRect();
      const above = list[slot - 1]?.getBoundingClientRect();
      const below = list[slot]?.getBoundingClientRect();
      const at = above && below ? (above.bottom + below.top) / 2 : above ? above.bottom + 6 : below.top - 6;
      drag.line.style.top = (at - box.top - 1.5) + 'px';
      return slot > drag.origin ? slot - 1 : slot;
    };
    const dragMove = () => {
      drag.ghost.style.top = (drag.y - drag.dy) + 'px';
      drag.target = dropAt(drag.y);
    };
    const dragEnd = (commit) => {
      if (!drag) return;
      const { id, target, origin } = drag;
      cancelAnimationFrame(drag.raf);
      drag.ghost.remove();
      drag.line.remove();
      drag.card.classList.remove('bq-origin');
      app.classList.remove('bq-dragging');
      drag = null;
      if (commit && target !== origin) move(id, target);
    };
    on(app, 'pointerdown', (e) => {
      const grip = e.target.closest('[data-grip]');
      if (!grip || !canvas.contains(grip) || e.button !== 0 || preview) return;
      e.preventDefault();
      syncFromDom();
      const cardEl = grip.closest('[data-id]');
      const r = cardEl.getBoundingClientRect();
      const ghost = cardEl.cloneNode(true);
      ghost.removeAttribute('data-id');
      ghost.inert = true;
      ghost.className += ' bq-ghost';
      Object.assign(ghost.style, { left: r.left + 'px', width: r.width + 'px', top: r.top + 'px' });
      const line = document.createElement('div');
      line.className = 'bq-drop';
      canvas.firstElementChild.append(line);
      app.append(ghost);
      cardEl.classList.add('bq-origin');
      app.classList.add('bq-dragging');
      const origin = blocks.findIndex((b) => b.id === cardEl.dataset.id);
      drag = { id: cardEl.dataset.id, card: cardEl, ghost, line, origin, target: origin, y: e.clientY, dy: e.clientY - r.top };
      grip.setPointerCapture(e.pointerId);
      dragMove();
      // Défilement automatique près du haut ou du bas de l'écran.
      const tick = () => {
        if (!drag) return;
        const edge = 64;
        const speed = drag.y < edge ? -(edge - drag.y) / 3 : drag.y > innerHeight - edge ? (drag.y - innerHeight + edge) / 3 : 0;
        if (speed) { scroller().scrollTop += speed; dragMove(); }
        drag.raf = requestAnimationFrame(tick);
      };
      drag.raf = requestAnimationFrame(tick);
    });
    on(app, 'pointermove', (e) => { if (drag) { drag.y = e.clientY; dragMove(); } });
    on(app, 'pointerup', () => dragEnd(true));
    on(app, 'pointercancel', () => dragEnd(false));

    // ---- Raccourcis : Ctrl+S, Ctrl+Z, Ctrl+Maj+Z, Ctrl+Y, Échap ----
    const owns = () => app.contains(document.activeElement) || !document.activeElement || document.activeElement === document.body;
    const inField = () => app.contains(document.activeElement) && document.activeElement.matches('[contenteditable="true"], input, textarea');
    on(document, 'keydown', (e) => {
      if (e.key === 'Escape' && drag) { e.preventDefault(); dragEnd(false); return; }
      if (!(e.ctrlKey || e.metaKey) || e.altKey || !owns()) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); save(); return; }
      if (k !== 'z' && k !== 'y') return;
      // Frappe en cours dans un champ : le navigateur annule sa propre frappe.
      if (typing && inField()) return;
      e.preventDefault();
      if (k === 'y' || e.shiftKey) redo(); else undo();
    });

    // ---- Icône du document ou d'un encadré ----
    // Trois usages du même sélecteur : icône du document (null), icône d'un encadré (id du bloc), insertion dans le texte ({ field, range }).
    const setIcon = (value) => {
      if (iconTarget === null) { checkpoint(); icon = value; showIcon(); setDirty(true); checkpoint(); return; }
      if (typeof iconTarget === 'object') {
        const { field, range } = iconTarget;
        if (!value) return;
        field.focus();
        getSelection().removeAllRanges();
        getSelection().addRange(range);
        document.execCommand('insertText', false, value);
        return;
      }
      syncFromDom();
      const b = blocks.find((x) => x.id === iconTarget);
      if (b) change(() => { b.icon = value; });
    };
    const openIcon = (target) => {
      iconTarget = target;
      sheets.icon.querySelector('h2').textContent = target === null ? 'Icône du document' : typeof target === 'object' ? 'Insérer un emoji' : 'Icône de l’encadré';
      $('[data-emoji-none]', sheets.icon).hidden = typeof target === 'object';
      const search = $('[data-emoji-search]', sheets.icon);
      search.value = '';
      // Écran tactile : aucun champ ne garde le focus, le clavier se ferme et ne recouvre pas le sélecteur (la recherche reste à un toucher).
      const touch = matchMedia('(pointer: coarse)').matches;
      if (touch) document.activeElement?.blur?.();
      openSheet('icon');
      if (touch) sheets.icon.querySelector('h2').focus({ preventScroll: true });
      else search.focus({ preventScroll: true });
      Blockquilt.emoji(o.emojiUrl).then(() => showEmoji(recent().length ? -1 : 0)).catch(() => {
        $('[data-emoji-grid]', sheets.icon).innerHTML = '<p class="col-span-full p-3 text-sm text-stone-500">Bibliothèque indisponible : collez un emoji ci-dessous.</p>';
      });
    };
    const recent = () => { try { return JSON.parse(localStorage.getItem('blockquilt.emoji') || '[]'); } catch { return []; } };
    const remember = (e) => { try { localStorage.setItem('blockquilt.emoji', JSON.stringify([e, ...recent().filter((x) => x !== e)].slice(0, 28))); } catch { /* stockage refusé */ } };
    let emojiTab = 0;
    const emojiButton = (e) => `<button type="button" data-icon-pick="${attr(e[0])}" title="${attr(e[1])}" aria-label="${attr(e[1])}" class="flex aspect-square items-center justify-center rounded-xl text-[26px] leading-none hover:bg-stone-100 active:bg-stone-200">${esc(e[0])}</button>`;
    const showEmoji = (tab) => {
      const data = Blockquilt.emojiData;
      if (!data) return;
      emojiTab = tab;
      const cats = [['Récents', -1], ...data.categories.map((c, i) => [c, i])];
      $('[data-emoji-tabs]', sheets.icon).innerHTML = cats.map(([c, i]) => `<button type="button" role="tab" data-emoji-tab="${i}" aria-selected="${i === tab}" class="min-h-9 shrink-0 rounded-full px-3 text-xs font-bold text-stone-600 aria-selected:bg-stone-900 aria-selected:text-white">${esc(c)}</button>`).join('');
      const byChar = new Map(data.emoji.map((e) => [e[0], e]));
      const list = tab === -1 ? recent().map((c) => byChar.get(c) || [c, c]) : data.emoji.filter((e) => e[e.length - 1] === tab);
      $('[data-emoji-grid]', sheets.icon).innerHTML = list.length ? list.map(emojiButton).join('') : '<p class="col-span-full p-3 text-sm text-stone-500">Aucun emoji récent.</p>';
    };
    const fold = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    on($('[data-emoji-search]', sheets.icon), 'input', (e) => {
      const q = fold(e.target.value.trim());
      if (!q) return showEmoji(emojiTab);
      const data = Blockquilt.emojiData;
      if (!data) return;
      // Nom exact, puis nom qui commence par la recherche, puis nom qui la contient, puis mots-clés.
      const rank = (x) => { const n = fold(x[1]); const k = typeof x[2] === 'string' ? fold(x[2]) : ''; return n === q ? 0 : n.startsWith(q) ? 1 : (' ' + n).includes(' ' + q) ? 2 : n.includes(q) ? 3 : k.split('|').some((w) => w.startsWith(q)) ? 4 : k.includes(q) ? 5 : 9; };
      const found = data.emoji.map((x) => [rank(x), x]).filter(([r]) => r < 9).sort((a, b) => a[0] - b[0]).slice(0, 140).map(([, x]) => x);
      $('[data-emoji-tabs]', sheets.icon).querySelectorAll('[aria-selected]').forEach((t) => t.setAttribute('aria-selected', 'false'));
      $('[data-emoji-grid]', sheets.icon).innerHTML = found.length ? found.map(emojiButton).join('') : '<p class="col-span-full p-3 text-sm text-stone-500">Aucun emoji trouvé.</p>';
    });
    on(sheets.icon, 'click', (e) => {
      const tab = e.target.closest('[data-emoji-tab]');
      if (tab) { $('[data-emoji-search]', sheets.icon).value = ''; return showEmoji(Number(tab.dataset.emojiTab)); }
      const pick = e.target.closest('[data-icon-pick]');
      if (pick) { sheets.icon.close(); if (pick.dataset.iconPick) remember(pick.dataset.iconPick); setIcon(pick.dataset.iconPick); return; }
      if (e.target.closest('[data-icon-use]')) {
        const input = $('[data-icon-input]', sheets.icon);
        const picked = Blocks.firstEmoji(input.value);
        if (!picked) return toast('Collez un emoji, par exemple 🏡');
        input.value = '';
        sheets.icon.close();
        remember(picked);
        setIcon(picked);
      }
    });
    on($('[data-icon-input]', sheets.icon), 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('[data-icon-use]', sheets.icon).click(); } });

    // ---- Enregistrer ----
    let saving = null;
    const save = async () => {
      if (saving) return saving;
      const text = markdown();
      saving = (async () => {
        try {
          if (o.onSave) await o.onSave(text);
          else if (o.saveUrl) {
            const r = await fetch(o.saveUrl, { method: 'POST', body: form({ text }), headers: { Accept: 'application/json' }, signal: ac.signal });
            const j = await r.json().catch(() => ({}));
            if (!r.ok) throw new Error(j.error || 'Enregistrement impossible');
          } else throw new Error('Enregistrement non configuré');
          if (markdown() === text) setDirty(false);
          toast('Enregistré');
          return true;
        } catch (error) {
          if (error.name !== 'AbortError') toast(error.message);
          return false;
        } finally { saving = null; }
      })();
      return saving;
    };

    // ---- Clics ----
    on(app, 'click', async (e) => {
      const el = e.target;
      if (el.closest('[data-sheet]')) return;
      const cardEl = el.closest('[data-id]');
      const id = cardEl?.dataset.id;
      if (el.closest('[data-insert]')) { const v = el.closest('[data-insert]').dataset.insert; return openAdd(v === 'end' ? null : Number(v)); }
      if (el.closest('[data-merge]')) return merge(Number(el.closest('[data-merge]').dataset.merge));
      if (el.closest('[data-menu]')) return openMenu(id, el.closest('[data-menu]'));
      if (el.closest('[data-expand]')) return openBlockFull(id);
      if (el.closest('[data-toggle-view]')) {
        const view = cardEl.dataset.view === 'preview' ? 'edit' : 'preview';
        views.set(id, view);
        cardEl.dataset.view = view;
        el.closest('[data-toggle-view]').setAttribute('aria-pressed', String(view === 'preview'));
        def(blocks.find((b) => b.id === id)).onInput?.(cardEl, ui);
        return;
      }
      if (el.closest('[data-delete]')) return askDelete(id);
      if (el.closest('[data-move]')) {
        const step = el.closest('[data-move]').dataset.move;
        return move(id, blocks.findIndex((b) => b.id === id) + Number(step), `[data-move="${step}"]`);
      }
      if (el.closest('[data-callout-icon]')) { syncFromDom(); return openIcon(id); }
      if (el.closest('[data-car-act], [data-car-add]')) return carousel(el, id);
      if (el.closest('[data-save]')) return save();
      if (el.closest('[data-undo]')) return undo();
      if (el.closest('[data-redo]')) return redo();
      if (el.closest('[data-full]')) return toggleEditorFull();
      if (el.closest('[data-width]')) return cycleWidth();
      if (el.closest('[data-ai]')) return openAi(null);
      if (el.closest('[data-more]')) return openSheet('more', el.closest('[data-more]'));
      if (el.closest('[data-block-full-close]')) return blockFull.close();
      if (el.closest('[data-preview]')) return setPreview(!preview);
      if (el.closest('[data-doc-icon]')) return preview ? null : openIcon(null);
      if (el.closest('[data-back]') && dirty) { e.preventDefault(); return openSheet('leave'); }
    });
    on(sheets.more, 'click', (e) => {
      const act = e.target.closest('[data-more-act]')?.dataset.moreAct;
      if (!act) return;
      sheets.more.close();
      if (act === 'redo') redo();
      else if (act === 'full') toggleEditorFull();
      else if (act === 'ai') openAi(null);
    });
    on(sheets.leave, 'click', async (e) => {
      if (e.target.closest('[data-leave-discard]')) { setDirty(false); location.href = o.backUrl; }
      if (e.target.closest('[data-leave-save]')) { sheets.leave.close(); if (await save()) location.href = o.backUrl; }
    });
    on(app, 'change', (e) => { if (e.target.matches('[data-convert]') && canvas.contains(e.target)) convert(e.target.closest('[data-id]').dataset.id, e.target.value); });
    // Écouteurs posés sur toute l'application : un bloc en plein écran est hors de la zone des blocs. Les feuilles sont exclues.
    const inSheet = (t) => !!t.closest?.('[data-sheet]');
    on(app, 'input', (e) => {
      if (inSheet(e.target)) return;
      setDirty(true);
      typed();
      const c = e.target.closest?.('[data-id]');
      const b = c && blocks.find((x) => x.id === c.dataset.id);
      if (b) def(b).onInput?.(c, ui);
    });
    on(app, 'focusin', (e) => { const c = e.target.closest?.('[data-id]'); if (c) activeId = c.dataset.id; });
    on(titleEl, 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); titleEl.blur(); } });
    on(app, 'focusout', (e) => { if (e.target.classList?.contains('bq-edit')) clean(e.target); });
    on(app, 'paste', (e) => {
      if (!e.target.closest?.('.bq-edit')) return;
      e.preventDefault();
      document.execCommand('insertText', false, e.clipboardData.getData('text/plain'));
    });
    on(app, 'keydown', (e) => {
      const el = e.target;
      // Poignée au clavier : flèches haut et bas déplacent le bloc.
      if (el.matches?.('[data-grip]') && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        e.preventDefault();
        const id = el.closest('[data-id]').dataset.id;
        move(id, blocks.findIndex((b) => b.id === id) + (e.key === 'ArrowUp' ? -1 : 1));
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey && el.matches?.('.bq-edit[data-plain], [data-callout-title]')) { e.preventDefault(); el.blur(); }
      const rich = richOf(el);
      if (!rich) return;
      // Listes : Tab descend l'élément d'un niveau, Maj+Tab le remonte. Sans effet possible, Tab garde son rôle (focus suivant).
      if (e.key === 'Tab' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const sel = getSelection();
        const node = sel.rangeCount ? sel.anchorNode : null;
        const li = (node && (node.nodeType === 1 ? node : node.parentElement))?.closest('li');
        if (li && rich.contains(li) && shiftLevel(li, e.shiftKey ? -1 : 1)) { e.preventDefault(); setDirty(true); typed(); return; }
      }
      // Mise en forme au clavier : Ctrl+B, Ctrl+I, Ctrl+U ; Alt+F10 donne le focus à la barre.
      const cmd = (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && { b: 'bold', i: 'italic', u: 'underline' }[e.key.toLowerCase()];
      if (cmd) { e.preventDefault(); document.execCommand(cmd); setDirty(true); typed(); return; }
      if (e.altKey && e.key === 'F10') { e.preventDefault(); showBar(rich); bar.querySelector('[data-fmt]').focus(); }
    });

    // Change le niveau d'un élément de liste ; le curseur et la sélection restent en place. Renvoie false si impossible.
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

    // ---- Barre de mise en forme : fixe et centrée, en bas de l'écran visible (téléphone) ou sous l'en-tête (ordinateur) ----
    let barField = null;
    let barRange = null; // sélection gardée : la barre peut prendre le focus (clavier) sans la perdre
    const placeBar = () => {
      if (bar.hidden) return;
      const vv = window.visualViewport;
      if (innerWidth >= 640) {
        const top = Math.max(8, Math.min(innerHeight - bar.offsetHeight - 8, head.getBoundingClientRect().bottom + 8));
        bar.style.top = top + 'px';
        bar.style.left = '50%';
      } else {
        bar.style.top = ((vv ? vv.offsetTop + vv.height : innerHeight) - bar.offsetHeight - 8) + 'px';
        bar.style.left = (vv ? vv.offsetLeft + vv.width / 2 : innerWidth / 2) + 'px';
      }
    };
    const showBar = (field) => {
      if (preview || !field || !app.contains(field)) return;
      barField = field;
      bar.hidden = false;
      placeBar();
    };
    const hideBar = () => { bar.hidden = true; barField = null; barRange = null; toggleClip(false); };
    // Sous-menu presse-papiers de la barre : copier, couper, coller le texte sélectionné (texte simple).
    const toggleClip = (open) => {
      const row = bar.querySelector('[data-bar-clip]');
      const show = open ?? row.hidden;
      row.hidden = !show;
      bar.querySelector('[data-clip-toggle]').setAttribute('aria-expanded', String(show));
      placeBar();
    };
    const clipboard = async (what) => {
      const sel = getSelection();
      if (!barField || !sel.rangeCount) return;
      if (what === 'paste') {
        let text = '';
        try { text = await navigator.clipboard.readText(); } catch { /* refusé : copie interne */ }
        if (!text) text = Blockquilt.clipboard || '';
        if (!text) return toast('Presse-papiers vide');
        backToField();
        document.execCommand('insertText', false, text);
      } else {
        const text = sel.toString();
        if (!text) return toast('Sélectionnez du texte');
        Blockquilt.clipboard = text;
        await navigator.clipboard?.writeText(text).catch(() => {});
        if (what === 'cut') { backToField(); document.execCommand('delete'); }
        toast(what === 'cut' ? 'Texte coupé' : 'Texte copié');
      }
      setDirty(true);
      typed();
      toggleClip(false);
    };
    const backToField = () => {
      if (!barField || document.activeElement === barField) return;
      barField.focus({ preventScroll: true });
      if (barRange) { getSelection().removeAllRanges(); getSelection().addRange(barRange); }
    };
    on(bar, 'keydown', (e) => {
      const buttons = [...bar.querySelectorAll('button')].filter((b) => b.offsetParent);
      const i = buttons.indexOf(document.activeElement);
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); backToField(); }
      else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); buttons[(i + (e.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length].focus(); }
    });
    on(bar, 'focusout', (e) => { if (!bar.contains(e.relatedTarget) && e.relatedTarget !== barField) hideBar(); });
    on(document, 'selectionchange', () => {
      const sel = getSelection();
      if (!sel.rangeCount || sel.isCollapsed) return;
      const field = richOf(sel.anchorNode);
      if (field && app.contains(field) && document.activeElement === field) showBar(field);
    });
    on(document, 'selectionchange', () => {
      const sel = getSelection();
      if (barField && sel.rangeCount && barField.contains(sel.anchorNode)) barRange = sel.getRangeAt(0).cloneRange();
    });
    on(app, 'dblclick', (e) => showBar(richOf(e.target)));
    on(app, 'contextmenu', (e) => { const f = richOf(e.target); if (f) { e.preventDefault(); showBar(f); } });
    let press = null;
    on(app, 'pointerdown', (e) => {
      clearTimeout(press?.timer);
      const f = richOf(e.target);
      press = f ? { x: e.clientX, y: e.clientY, timer: later(() => showBar(f), 450) } : null;
    });
    on(app, 'pointermove', (e) => { if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) clearTimeout(press.timer); });
    on(app, 'pointerup', () => clearTimeout(press?.timer));
    on(app, 'pointercancel', () => clearTimeout(press?.timer));
    on(app, 'focusout', (e) => { if (barField && e.target === barField && !bar.contains(e.relatedTarget)) hideBar(); });
    on(window.visualViewport, 'resize', placeBar);
    on(window.visualViewport, 'scroll', placeBar);
    on(window, 'resize', placeBar);
    on(bar, 'mousedown', (e) => e.preventDefault());
    const unwrapMarks = (range) => {
      const scope = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
      scope.closest('.bq-edit')?.querySelectorAll('mark').forEach((m) => { if (range.intersectsNode(m)) m.replaceWith(...m.childNodes); });
    };
    on(bar, 'click', (e) => {
      backToField();
      const sel = getSelection();
      if (e.target.closest('[data-split]')) { if (sel.rangeCount) split(sel.getRangeAt(0)); return; }
      if (e.target.closest('[data-clip-toggle]')) return toggleClip();
      const clip = e.target.closest('[data-clip]')?.dataset.clip;
      if (clip) return clipboard(clip);
      if (e.target.closest('[data-emoji-insert]')) {
        const field = barField;
        if (!field || !sel.rangeCount) return;
        const range = sel.getRangeAt(0).cloneRange();
        hideBar();
        return openIcon({ field, range });
      }
      const button = e.target.closest('[data-fmt]');
      if (!button || !sel.rangeCount) return;
      const what = button.dataset.fmt;
      const range = sel.getRangeAt(0);
      if (what === 'highlight') {
        if (range.collapsed) return;
        const inside = (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement).closest('mark');
        if (inside) unwrapMarks(range);
        else { const m = document.createElement('mark'); m.append(range.extractContents()); range.insertNode(m); sel.removeAllRanges(); sel.selectAllChildren(m); }
      } else document.execCommand(what);
      setDirty(true);
    });

    // ---- Chargement ----
    const load = (md) => {
      const parsed = Blocks.parse(md);
      meta = parsed.meta;
      icon = meta.icon || '';
      titleEl.textContent = meta.title || '';
      showIcon();
      blocks = parsed.blocks.map((b) => ({ id: newId(), ...b }));
      if (!blocks.length) blocks = [{ id: newId(), ...Blocks.blank('text') }];
      render();
    };
    load(o.source);
    setDirty(false);
    checkpoint();

    return {
      getMarkdown: markdown,
      setMarkdown: (md) => { load(md); setDirty(false); past = []; future = []; baseline = null; checkpoint(); },
      save,
      undo,
      redo,
      destroy: () => {
        ac.abort();
        timers.forEach(clearTimeout);
        dragEnd(false);
        [...Object.values(sheets), blockFull, editorFull].forEach((d) => d.open && d.close());
        element.replaceChildren();
      },
    };
  }

  // Bibliothèque d'emoji : chargée au premier usage seulement (emoji.json, à côté de ce script par défaut).
  const scriptUrl = document.currentScript?.src || location.href;
  let emojiLoad = null;
  const emoji = (url) => {
    emojiLoad = emojiLoad || fetch(url || new URL('emoji.json', scriptUrl)).then((r) => { if (!r.ok) throw new Error('emoji.json'); return r.json(); })
      .then((data) => { Blockquilt.emojiData = data; return data; })
      .catch((error) => { emojiLoad = null; throw error; });
    return emojiLoad;
  };

  window.Blockquilt = { mount, icons: ICONS, emoji, emojiData: null, clipboard: '' };
})();
