// HTML de l'éditeur : en-tête, zone des blocs, barre de mise en forme, feuilles (<dialog>) et dialogues plein écran.
// Aucun attribut id : plusieurs éditeurs peuvent cohabiter dans une page.
import { ic } from './icons.js';
import { esc, attr } from './shared.js';

export const GROUPS = { text: 'Texte', media: 'Médias', structure: 'Structure' };
const sheetCls = 'bq-sheet m-0 mt-auto max-h-[88dvh] w-full max-w-full overflow-auto rounded-t-3xl p-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-xl backdrop:bg-black/40 sm:m-auto sm:max-w-lg sm:rounded-3xl';
// Feuille avec une ligne de titre (contenu à expliquer), ou menu d'actions sans titre (`menu`) : chaque ligne se suffit.
const menu = (name, label, inner) => `<dialog data-sheet="${name}" autofocus aria-label="${attr(label)}" class="${sheetCls} !pt-2 outline-none">${inner}</dialog>`;
const sheet = (name, label, inner) => `<dialog data-sheet="${name}" aria-label="${attr(label)}" class="${sheetCls}">
    <div class="-mx-1 -mt-1 mb-2 flex items-center gap-2"><h2 tabindex="-1" autofocus class="min-w-0 flex-1 truncate px-1 text-base font-bold outline-none">${esc(label)}</h2>
      <button type="button" data-close aria-label="Fermer" class="bq-btn bq-muted">${ic('x')}</button></div>${inner}</dialog>`;
export const item = (data, icon, label, cls = '') => `<button type="button" ${data} class="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-[15px] font-medium hover:bg-stone-100 active:bg-stone-200 ${cls}">${ic(icon)}<span class="min-w-0 flex-1 truncate">${label}</span></button>`;

export const template = (o) => `<div data-bq class="bq-app flex min-h-full w-full flex-col"${o.width ? ` style="--bq-width: ${attr(o.width)}"` : ''}>
  <header data-head class="bq-head sticky z-20 flex min-h-14 items-center gap-0.5 border-b px-1.5 pt-[env(safe-area-inset-top)] backdrop-blur-md sm:px-3">
    ${o.backUrl ? `<a href="${attr(o.backUrl)}" data-back aria-label="Retour" class="bq-btn bq-muted">${ic('chevron_left')}</a>` : ''}
    ${o.title ? `<button type="button" data-doc-icon aria-label="Icône du document" class="bq-btn text-xl"></button>
    <div data-title contenteditable="true" role="textbox" aria-label="Titre du document" data-placeholder="Sans titre" spellcheck="false" class="bq-edit min-w-0 flex-1 truncate px-1 text-base font-extrabold leading-snug text-stone-900 sm:text-lg"></div>`
      : '<span class="flex-1"></span>'}
    <button type="button" data-undo disabled aria-label="Annuler" title="Annuler (Ctrl+Z)" class="bq-btn bq-muted">${ic('undo')}</button>
    <button type="button" data-redo disabled aria-label="Rétablir" title="Rétablir (Ctrl+Y)" class="bq-btn bq-muted hidden sm:inline-flex">${ic('redo')}</button>
    <button type="button" data-source-mode aria-pressed="false" aria-label="Texte source (Markdown)" title="Texte source (Markdown)" class="bq-btn bq-muted aria-pressed:bg-brand-600 aria-pressed:text-white">${ic('code')}</button>
    <button type="button" data-preview aria-pressed="false" aria-label="Aperçu" title="Aperçu" class="bq-btn bq-muted aria-pressed:bg-brand-600 aria-pressed:text-white">${ic('eye')}</button>
    <button type="button" data-visual-toggle aria-pressed="false" aria-label="Visuel à côté" title="Visuel à côté" class="bq-btn bq-muted aria-pressed:bg-brand-600 aria-pressed:text-white disabled:opacity-40">${ic('columns')}</button>
    ${o.aiUrl ? `<button type="button" data-ai aria-label="Assistant IA" title="Assistant IA" class="bq-btn hidden text-amber-600 sm:inline-flex">${ic('wand')}</button>` : ''}
    <button type="button" data-save aria-label="Enregistré" title="Enregistrer (Ctrl+S)" class="bq-btn relative">${ic('save')}<span data-dot hidden class="absolute right-2 top-2 size-2 rounded-full bg-brand-600"></span></button>
    <button type="button" data-width hidden aria-label="Largeur du texte" title="Largeur du texte" class="bq-btn bq-muted max-sm:hidden">${ic('width')}</button>
    <button type="button" data-full aria-label="Plein écran" title="Plein écran" class="bq-btn bq-muted hidden sm:inline-flex">${ic('maximize')}</button>
    <button type="button" data-more aria-label="Plus d’actions" aria-haspopup="dialog" class="bq-btn bq-muted sm:hidden">${ic('more')}</button>
  </header>
  ${o.contentUrl ? `<div data-remote-bar hidden role="status" class="bq-remote-bar sticky z-10 mx-3 mt-2 flex items-center gap-2 rounded-2xl border border-amber-300 bg-amber-50 py-0.5 pl-3 pr-1 text-sm text-amber-950 sm:mx-6">
    <span data-remote-text class="min-w-0 flex-1 truncate font-semibold"></span>
    <button type="button" data-remote-show class="min-h-11 shrink-0 rounded-xl px-3 font-bold underline">Voir</button></div>` : ''}
  <div data-canvas class="flex-1 px-3 pb-[40dvh] pt-3 sm:px-6 sm:pb-16"></div>
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
  ${o.contentUrl ? sheet('remote', 'Modifié ailleurs', `<p data-remote-who class="text-sm"></p>
      <p class="mt-3 text-[11px] font-bold uppercase tracking-wider text-stone-400">Votre texte → l’autre version</p>
      <div data-remote-diff class="mt-1 max-h-72 overflow-auto rounded-xl border border-stone-200 py-2 font-mono text-xs leading-relaxed"></div>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <button type="button" data-remote-take class="col-span-2 min-h-11 rounded-xl bg-brand-600 px-4 font-semibold text-white">Prendre l’autre version</button>
        <button type="button" data-remote-keep class="min-h-11 rounded-xl border border-stone-300 px-3 text-sm font-semibold">Garder la mienne</button>
        <button type="button" data-remote-later class="min-h-11 rounded-xl border border-stone-300 px-3 text-sm font-semibold">Plus tard</button></div>`) : ''}
  ${o.aiUrl ? sheet('ai', 'Assistant IA', `<div data-ai-form>
      <p data-ai-scope class="mb-2 truncate rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900"></p>
      <div data-ai-uses class="flex flex-wrap gap-1.5">${[['Corriger', 'Corrige l’orthographe et la grammaire, sans changer le sens ni la structure.'], ['Raccourcir', 'Raccourcis le texte en gardant l’essentiel.'], ['En étapes', 'Réécris sous forme d’étapes numérotées.'], ['Traduire', 'Traduis en anglais, en gardant la structure.']].map(([l, t]) => `<button type="button" data-ai-preset="${attr(t)}" class="min-h-11 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-950 hover:bg-amber-100">${l}</button>`).join('')}</div>
      <textarea data-ai-instruction rows="3" aria-label="Consigne" placeholder="Votre consigne, par exemple : ajoute une astuce sur le parking" class="mt-2 w-full rounded-xl border border-stone-300 p-3 text-[15px]"></textarea>
      <button type="button" data-ai-run class="mt-2 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-stone-900 px-4 font-semibold text-white disabled:opacity-60">${ic('wand', 'size-4')}<span>Envoyer</span></button>
      <p class="mt-2 text-xs text-stone-500">Le document entier part au service IA du site, même pour un seul bloc.</p>
      <p data-ai-error role="alert" hidden class="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-800"></p></div>
    <div data-ai-result hidden>
      <div data-ai-ops hidden>
        <p data-ai-ops-summary class="text-sm font-semibold text-stone-700"></p>
        <ol data-ai-ops-list class="mt-2 max-h-[55dvh] space-y-2 overflow-auto"></ol>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button type="button" data-ai-ops-apply class="col-span-2 min-h-11 rounded-xl bg-brand-600 px-4 font-semibold text-white disabled:opacity-40">Appliquer</button>
          <button type="button" data-ai-copy class="min-h-11 rounded-xl border border-stone-300 px-3 text-sm font-semibold">Copier la réponse</button>
          <button type="button" data-ai-ignore class="min-h-11 rounded-xl border border-stone-300 px-3 text-sm font-semibold">Ignorer</button></div></div>
      <div data-ai-whole>
      <ul data-ai-lint role="alert" class="mb-2 space-y-1 rounded-xl bg-red-50 p-3 text-xs text-red-800"></ul>
      <label data-ai-force-wrap class="mb-2 flex min-h-11 items-center gap-2 text-sm font-semibold text-red-800"><input type="checkbox" data-ai-force class="size-5"> Appliquer malgré les alertes</label>
      <p class="text-[11px] font-bold uppercase tracking-wider text-stone-400">Actuel</p>
      <div data-ai-before class="bq-content mt-1 max-h-48 overflow-auto rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm"></div>
      <p class="mt-2 text-[11px] font-bold uppercase tracking-wider text-stone-400">Proposition de l’IA</p>
      <div data-ai-after class="bq-content mt-1 max-h-64 overflow-auto rounded-xl border border-amber-200 bg-white p-3 text-sm"></div>
      <p class="mt-3 text-[11px] font-bold uppercase tracking-wider text-stone-400">Que faire de la proposition ?</p>
      <div class="mt-1 grid grid-cols-2 gap-2">
        <button type="button" data-ai-apply="replace" class="col-span-2 min-h-11 rounded-xl bg-brand-600 px-4 font-semibold text-white disabled:opacity-40">Remplacer le document</button>
        <button type="button" data-ai-apply="start" class="min-h-11 rounded-xl border border-stone-300 px-3 text-sm font-semibold disabled:opacity-40">Ajouter au début</button>
        <button type="button" data-ai-apply="end" class="min-h-11 rounded-xl border border-stone-300 px-3 text-sm font-semibold disabled:opacity-40">Ajouter à la fin</button>
        <button type="button" data-ai-copy class="min-h-11 rounded-xl border border-stone-300 px-3 text-sm font-semibold disabled:opacity-40">Copier seulement</button>
        <button type="button" data-ai-ignore class="min-h-11 rounded-xl border border-stone-300 px-3 text-sm font-semibold disabled:opacity-40">Ignorer</button></div></div></div>`) : ''}
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
  <dialog data-block-full aria-label="Bloc en plein écran" class="bq-full"><div data-full-inner class="bq-full-inner">
    <div class="bq-head sticky z-10 flex min-h-14 items-center gap-1 border-b px-2 pt-[env(safe-area-inset-top)] backdrop-blur-md">
      <span data-block-full-label class="min-w-0 flex-1 truncate px-2 text-sm font-bold text-stone-500"></span>
      <button type="button" data-full-prev aria-label="Bloc précédent" title="Bloc précédent" class="bq-btn bq-muted">${ic('chevron_up')}</button>
      <button type="button" data-full-next aria-label="Bloc suivant" title="Bloc suivant" class="bq-btn bq-muted">${ic('chevron_down')}</button>
      <button type="button" data-full-save aria-label="Enregistrer" title="Enregistrer (Ctrl+S)" class="bq-btn bq-muted">${ic('save')}</button>
      <button type="button" data-width aria-label="Largeur du texte" title="Largeur du texte" class="bq-btn bq-muted hidden sm:inline-flex">${ic('width')}</button>
      <button type="button" data-block-full-close aria-label="Quitter le plein écran" title="Quitter le plein écran" class="group inline-flex size-11 shrink-0 items-center justify-center rounded-full">
        <span class="flex size-8 items-center justify-center rounded-full border border-black/10 bg-white text-stone-700 group-hover:bg-stone-100">${ic('minimize', 'size-4')}</span></button></div>
    <div data-block-full-body class="bq-column px-4 py-6 sm:px-8"></div></div>
</div>
<dialog data-editor-full aria-label="Éditeur en plein écran" class="bq-full"><div data-full-inner class="bq-full-inner"></div></dialog>`;
