// Cartes d'édition des types de base : chaque type reçoit edit(b, ui) → HTML de la carte, et read(card, b) → modèle.
// Un type enregistré sans carte propre est édité par Blocks.fallbackEditor (son texte source).
import { ic } from './icons.js';
import { esc, attr } from './shared.js';

/** Champ modifiable (contenteditable). `rich` : mise en forme permise (barre), sinon texte simple. */
export const editable = (cls, html, ph, extra = '') => `<div ${extra} contenteditable="true" role="textbox" aria-multiline="true" spellcheck="false" data-placeholder="${attr(ph)}" class="bq-edit ${cls}">${html}</div>`;
Blocks.editable = editable;
{
  const richEdit = (cls, ph) => (b) => editable(`min-h-7 ${cls}`, b.html, ph, 'data-body data-rich aria-label="Texte du bloc"');
  const readHtml = (card, b) => { b.html = card.querySelector('[data-body]').innerHTML; };
  Object.assign(Blocks.types.text, { edit: richEdit('text-[15px] leading-relaxed', 'Écrivez ici…'), read: readHtml });
  // Texte en grand : la taille d'un titre, la mise en forme d'un texte.
  for (const k of ['t1', 't2', 't3']) Object.assign(Blocks.types[k], { edit: richEdit(`${Blocks.types[k].size} leading-snug`, 'Texte en grand…'), read: readHtml });
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
    Object.assign(Blocks.types[k], { edit: (b) => editable(`${cls} leading-snug tracking-tight`, b.html, ph, 'data-body data-plain aria-label="Titre"'), read: readHtml });
  }
  // Photo d'un bloc photo ou d'une carte : « Ajouter une photo » si elle manque ; sinon l'image et « Retirer » (clic : ed.cardPhoto).
  const addPhoto = `<button type="button" data-card-act="photo" class="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-current/20 text-sm font-bold opacity-70 hover:opacity-100">${ic('image', 'size-4')}Ajouter une photo</button>`;
  const shownPhoto = (b, ui, height, label) => `<div class="relative"><img src="${attr(Blocks.mediaUrl(b.src, ui.media))}" alt="" class="${height} w-full rounded-xl border border-stone-200 bg-stone-100 object-cover">
          <button type="button" data-card-act="remove" aria-label="${label}" class="bq-btn absolute right-1 top-1 bg-white/90 text-red-600">${ic('trash', 'size-4')}</button></div>`;
  // Photo : taille et format choisis dans une liste (valeur '' = par défaut, rien n'est écrit dans le texte).
  const PHOTO_SIZES = [['', 'Pleine largeur'], ['medium', 'Moyenne'], ['small', 'Petite']];
  const PHOTO_RATIOS = [['', 'Format d’origine'], ['16:9', '16:9'], ['4:3', '4:3'], ['1:1', '1:1 (carré)']];
  const options = (list, value) => list.map(([v, label]) => `<option value="${v}"${v === value ? ' selected' : ''}>${label}</option>`).join('');
  const pick = 'h-11 min-w-0 flex-1 rounded-xl border border-stone-200 bg-white/80 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500';
  Object.assign(Blocks.types.photo, {
    edit: (b, ui) => `<figure class="space-y-2">${b.src ? shownPhoto(b, ui, 'max-h-72', 'Retirer la photo') : addPhoto}
        ${editable('text-sm italic opacity-75', esc(b.alt), 'Légende (lue aux personnes malvoyantes)…', 'data-body data-plain aria-label="Légende de la photo"')}
        <div class="flex gap-2"><select data-photo-size aria-label="Taille de la photo" class="${pick}">${options(PHOTO_SIZES, b.size || '')}</select>
          <select data-photo-ratio aria-label="Format de la photo" class="${pick}">${options(PHOTO_RATIOS, b.ratio || '')}</select></div></figure>`,
    read: (card, b) => {
      b.alt = card.querySelector('[data-body]').textContent;
      b.size = card.querySelector('[data-photo-size]').value;
      b.ratio = card.querySelector('[data-photo-ratio]').value;
    },
  });
  // Carrousel : une photo par ligne (poignée pour glisser, vignette, légende, suppression), « Ajouter des photos » dessous.
  // Replié (bouton à côté du type) : une seule ligne, les miniatures et le nombre de photos.
  Object.assign(Blocks.types.carousel, {
    tools: (b, view) => `<button type="button" data-toggle-view="collapsed" aria-pressed="${view === 'collapsed'}" aria-label="Replier le carrousel" title="Replier / déplier" class="group ml-1 inline-flex size-11 items-center justify-center rounded-full">
        <span class="bq-round flex size-8 items-center justify-center rounded-full border bq-muted group-aria-pressed:bg-brand-600 group-aria-pressed:text-white">${ic('fold', 'size-4 group-aria-pressed:hidden')}${ic('unfold', 'hidden size-4 group-aria-pressed:block')}</span></button>`,
    edit: (b, ui) => `<div class="bq-view-expanded">
        <ol data-car-list class="relative grid gap-1.5">${b.items.map((x, i) => `<li data-car-item="${i}" class="bq-tone flex min-w-0 items-center gap-2 rounded-xl border py-1 pl-0 pr-0">
          <button type="button" data-car-grip aria-label="Photo ${i + 1} : déplacer (glisser, ou flèches haut et bas)" class="bq-btn bq-muted cursor-grab touch-none active:cursor-grabbing">${ic('grip', 'size-4')}</button>
          <img src="${attr(Blocks.mediaUrl(x.src, ui.media))}" alt="" class="h-12 w-16 shrink-0 rounded-lg bg-stone-200 object-cover">
          <input data-car-alt value="${attr(x.alt)}" placeholder="Légende…" aria-label="Légende de la photo ${i + 1}" class="h-11 min-w-0 flex-1 bg-transparent px-1 text-sm italic focus:outline-none">
          <button type="button" data-car-act="remove" aria-label="Retirer la photo ${i + 1}" class="bq-btn text-red-600">${ic('trash', 'size-4')}</button></li>`).join('')}</ol>
        <button type="button" data-car-add class="mt-1.5 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-current/20 text-sm font-bold opacity-70 hover:opacity-100">${ic('plus', 'size-4')}Ajouter des photos</button></div>
      <div class="bq-view-collapsed flex min-h-11 min-w-0 items-center gap-3">
        <span class="flex shrink-0 -space-x-3">${b.items.slice(0, 5).map((x) => `<img src="${attr(Blocks.mediaUrl(x.src, ui.media))}" alt="" class="size-9 rounded-lg object-cover ring-2 ring-white">`).join('')}</span>
        <span data-car-count class="shrink-0 text-sm font-bold">${b.items.length} photo${b.items.length > 1 ? 's' : ''}</span>
        <span class="min-w-0 truncate text-sm italic opacity-60">${esc(b.items.map((x) => x.alt).filter(Boolean).join(' · '))}</span></div>`,
    read: (card, b) => { card.querySelectorAll('[data-car-item]').forEach((el) => { b.items[Number(el.dataset.carItem)].alt = el.querySelector('[data-car-alt]').value; }); },
  });
  // Carte : la photo (ajouter, retirer), son texte alternatif, le titre, le texte, le bouton (texte et lien).
  const field = 'h-11 min-w-0 rounded-xl border border-current/20 bg-transparent px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500'; // couleurs du bloc : lisible en mode sombre
  Object.assign(Blocks.types.card, {
    edit: (b, ui) => `<div class="grid gap-2">${b.src ? `${shownPhoto(b, ui, 'max-h-48', 'Retirer la photo de la carte')}
        <input data-card-alt value="${attr(b.alt)}" placeholder="Description de la photo (lue aux personnes malvoyantes)…" aria-label="Description de la photo" class="${field} italic">`
        : addPhoto}
        <input data-card-title value="${attr(b.title)}" placeholder="Titre de la carte" aria-label="Titre de la carte" class="h-11 min-w-0 bg-transparent text-[17px] font-bold placeholder:font-medium placeholder:opacity-50 focus:outline-none">
        ${richEdit('text-[15px] leading-relaxed', 'Texte de la carte…')(b)}
        <div class="flex gap-2"><input data-card-label value="${attr(b.label)}" placeholder="Texte du bouton" aria-label="Texte du bouton" class="${field} w-1/3">
          <input data-card-href type="url" value="${attr(b.href)}" placeholder="https://… (lien du bouton)" aria-label="Lien du bouton" class="${field} flex-1"></div></div>`,
    read: (card, b) => {
      readHtml(card, b);
      b.alt = card.querySelector('[data-card-alt]')?.value ?? b.alt;
      for (const k of ['title', 'label', 'href']) b[k] = card.querySelector(`[data-card-${k}]`).value;
    },
  });
  Object.assign(Blocks.types.video, {
    edit: (b) => `<input data-url type="url" value="${attr(b.url)}" class="h-11 w-full rounded-xl border border-rose-200 bg-white/80 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="https://www.youtube.com/watch?v=…" aria-label="Lien de la vidéo YouTube ou Vimeo">`,
    read: (card, b) => { b.url = card.querySelector('[data-url]').value.trim(); },
  });
  // Bloc HTML : le code, ou son aperçu filtré (bouton œil à côté du type, `tools`). La carte porte data-view="preview" en aperçu.
  Object.assign(Blocks.types.html, {
    tools: (b, view) => `<button type="button" data-toggle-view="preview" aria-pressed="${view === 'preview'}" aria-label="Aperçu du HTML" title="Aperçu du HTML" class="group ml-1 inline-flex size-11 items-center justify-center rounded-full">
        <span class="flex size-8 items-center justify-center rounded-full border border-black/10 bg-white/70 text-indigo-700 group-hover:bg-white group-aria-pressed:bg-indigo-600 group-aria-pressed:text-white">${ic('eye', 'size-4')}</span></button>`,
    edit: (b, ui) => `<textarea data-html rows="${Math.min(16, Math.max(4, b.html.split('\n').length))}" spellcheck="false" aria-label="Code HTML" placeholder="<div class=&quot;…&quot;>…</div>" class="bq-view-code w-full rounded-xl border border-indigo-200 bg-white p-3 font-mono text-[13px] leading-5">${esc(b.html)}</textarea>
        <div data-html-preview aria-label="Aperçu filtré" class="bq-view-preview bq-content min-h-16 overflow-auto rounded-xl border border-dashed border-indigo-200 bg-white p-3 text-sm">${Blocks.sanitize(b.html, ui.media)}</div>`,
    read: (card, b) => { b.html = card.querySelector('[data-html]').value; },
    onInput: (card, ui) => { card.querySelector('[data-html-preview]').innerHTML = Blocks.sanitize(card.querySelector('[data-html]').value, ui.media); },
  });
  Object.assign(Blocks.types.space, { fullscreen: false, edit: () => '<p class="py-2 text-sm italic opacity-60">Espace vide dans la ligne (caché sur un écran étroit)</p>', read: () => {} });
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
