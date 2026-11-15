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
  Object.assign(Blocks.types.photo, {
    edit: (b, ui) => `<figure class="space-y-2">${b.src ? `<img src="${attr(Blocks.mediaUrl(b.src, ui.media))}" alt="" class="max-h-72 w-full rounded-xl border border-stone-200 bg-stone-100 object-cover">` : ''}
        ${editable('text-sm italic opacity-75', esc(b.alt), 'Légende (lue aux personnes malvoyantes)…', 'data-body data-plain aria-label="Légende de la photo"')}</figure>`,
    read: (card, b) => { b.alt = card.querySelector('[data-body]').textContent; },
  });
  // Carrousel : grille de vignettes (2 colonnes au téléphone, 3 à 4 au-delà), comme les éditeurs de publication ;
  // légende sous chaque photo, ordre par flèches, retrait, tuile « Ajouter » en dernier (plusieurs fichiers à la fois).
  Object.assign(Blocks.types.carousel, {
    edit: (b, ui) => `<div data-car-grid class="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">${b.items.map((x, i) => `<figure data-car-item="${i}" class="bq-tone flex min-w-0 flex-col rounded-xl border p-1.5">
        <div class="relative"><img src="${attr(Blocks.mediaUrl(x.src, ui.media))}" alt="" class="aspect-[4/3] w-full rounded-lg bg-stone-200 object-cover">
          <span class="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 text-[11px] font-bold text-white">${i + 1}</span></div>
        <input data-car-alt value="${attr(x.alt)}" placeholder="Légende…" aria-label="Légende de la photo ${i + 1}" class="mt-1 h-9 w-full min-w-0 bg-transparent px-1 text-xs italic focus:outline-none">
        <div class="flex justify-between"><button type="button" data-car-act="left" ${i === 0 ? 'disabled' : ''} aria-label="Photo ${i + 1} : avancer d’une place" class="bq-btn bq-muted">${ic('chevron_left', 'size-4')}</button>
          <button type="button" data-car-act="remove" aria-label="Retirer la photo ${i + 1}" class="bq-btn text-red-600">${ic('trash', 'size-4')}</button>
          <button type="button" data-car-act="right" ${i === b.items.length - 1 ? 'disabled' : ''} aria-label="Photo ${i + 1} : reculer d’une place" class="bq-btn bq-muted">${ic('chevron_right', 'size-4')}</button></div></figure>`).join('')}
        <button type="button" data-car-add class="flex min-h-32 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-current/20 text-xs font-bold opacity-70 hover:opacity-100">${ic('plus')}Ajouter des photos</button></div>`,
    read: (card, b) => { card.querySelectorAll('[data-car-item]').forEach((el) => { b.items[Number(el.dataset.carItem)].alt = el.querySelector('[data-car-alt]').value; }); },
  });
  Object.assign(Blocks.types.video, {
    edit: (b) => `<input data-url type="url" value="${attr(b.url)}" class="h-11 w-full rounded-xl border border-rose-200 bg-white/80 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500" placeholder="https://www.youtube.com/watch?v=…" aria-label="Lien de la vidéo YouTube ou Vimeo">`,
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
