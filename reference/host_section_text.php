<?php use function Stack\{e, url};
// Éditeur de rubrique « Bento pastel » (kit_editor/v3). Plein écran sur mobile (`bare` passé par la route), barre haute de l'app sur PC : l'écran dessine son propre en-tête ; tout le dessin des blocs est dans assets/blocks.js.
$guestPath = $GLOBALS['guestPath'] ?? '';
$back = url('/guide/' . $guideId . '/sections');
$icons = ['heading', 'align_left', 'sparkles', 'compass', 'triangle_alert', 'list', 'list_checks', 'key_round', 'image', 'video', 'mic', 'chevron_up', 'chevron_down', 'chevron_left', 'grip', 'trash2', 'plus', 'x', 'smartphone', 'sliders', 'eraser', 'check', 'save', 'maximize', 'minimize', 'fold_vertical'];
$emoji = ['🔑', '📶', '🗑️', '♻️', '🍽️', '🏊', '📞', '🚗', '🅿️', '🛏️', '🛁', '🍳', '☕', '🔥', '❄️', '📺', '🧺', '🏖️', '🥾', '🛒', '💊', '🚨', '🐕', '📍'];
$guideName = isset($GLOBALS['guide']) ? guide_name($GLOBALS['guide']) : '';
$sections = $sections ?? [];
$btn = 'flex size-10 shrink-0 items-center justify-center rounded-xl ' . UI_FOCUS;
?>
<?= ui_icon_sprite($icons) ?>
<?php if ($error): ?><p role="alert" class="m-3 <?= UI_ALERT ?>"><?= e($error) ?></p><?php endif; ?>
<div id="ehg" hidden class="mx-auto flex min-h-dvh w-full max-w-3xl flex-col bg-white font-jakarta text-stone-800 sm:my-6 sm:min-h-[calc(100dvh-3rem)] sm:overflow-clip sm:rounded-3xl sm:border sm:border-stone-200/90 sm:shadow-xl"
     data-slug="<?= e($slug) ?>" data-csrf="<?= e($csrf) ?>" data-media="<?= e(url($guestPath . 'media/')) ?>"
     data-save="<?= e(url("/guide/$guideId/sections")) ?>" data-preview="<?= e(url("/guide/$guideId/sections/preview")) ?>" data-upload="<?= e(url("/guide/$guideId/media/upload")) ?>">
  <textarea data-source hidden><?= e($text) ?></textarea>

  <header class="sticky top-0 md:top-[61px] z-20 space-y-2 border-b border-stone-200/80 bg-white/95 px-3.5 pb-2.5 pt-[max(0.625rem,env(safe-area-inset-top))] backdrop-blur-md sm:px-6">
    <!-- Row 1 : < (retour) [] (icône) TITRE — bouton IA à droite -->
    <div class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 flex-1 items-center gap-2">
        <a href="<?= e($back) ?>" data-back aria-label="Retour" class="-ml-2 <?= $btn ?> text-stone-500 hover:bg-stone-100 active:bg-stone-200"><?= ui_icon('chevron_left') ?></a>
        <button type="button" aria-label="Changer l’icône de la rubrique" class="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-stone-200 bg-stone-100 text-xl transition-transform hover:bg-stone-200/80 active:scale-95 <?= UI_FOCUS ?>"><span data-icon>📄</span></button>
        <div class="min-w-0 flex-1">
          <h1 data-title contenteditable="true" role="textbox" aria-label="Titre de la rubrique" data-placeholder="Titre de la rubrique" class="ehg-edit truncate rounded-lg text-base font-extrabold leading-snug text-stone-900 transition-all focus:bg-stone-100 focus:px-1.5 sm:text-lg"></h1>
        </div>
      </div>
      <button type="button" data-dialog="ai" aria-label="Assistant IA" class="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-amber-300/90 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-950 shadow-sm transition-all hover:bg-amber-100/90 active:scale-95 <?= UI_FOCUS ?>">
        <?= ui_icon('sparkles', 'size-3.5 text-amber-600') ?><span>IA</span>
      </button>
    </div>
    <!-- Row 2 : [switch mode édition / mode visualisation] — Bouton enregistrer (disquette, grisé si rien à faire, bleu si modifié) -->
    <div class="flex items-center justify-between gap-2">
      <div class="flex min-w-0 flex-1 items-center rounded-xl border border-stone-200/80 bg-stone-100 p-1" role="group" aria-label="Mode">
        <button type="button" data-mode="edit" aria-pressed="true" class="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-stone-600 transition-all aria-pressed:bg-white aria-pressed:font-bold aria-pressed:text-stone-900 aria-pressed:shadow-sm sm:text-sm"><?= ui_icon('sliders', 'size-3.5 text-brand-600') ?>Édition</button>
        <button type="button" data-mode="guest" aria-pressed="false" class="flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-stone-600 transition-all aria-pressed:bg-brand-600 aria-pressed:font-bold aria-pressed:text-white aria-pressed:shadow-sm sm:text-sm"><?= ui_icon('smartphone', 'size-3.5') ?>Visualisation</button>
      </div>
      <button type="button" data-status disabled class="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-stone-100 px-3.5 py-1.5 text-xs font-bold text-stone-400 transition-all <?= UI_FOCUS ?>"></button>
    </div>
  </header>

  <div id="ai-result" class="empty:hidden px-3.5 pt-3 sm:px-6" aria-live="polite"></div>
  <div data-canvas class="flex-1 bg-stone-50/50 px-3.5 pt-4 pb-[45dvh] sm:px-6 sm:pb-12"></div>

  <!-- Pilule de mise en forme style Medium : z-50, apparaît uniquement à la sélection, déplaçable via sa poignée -->
  <div data-pill hidden role="toolbar" aria-label="Mise en forme" class="fixed z-50">
    <div class="flex max-w-[calc(100vw-1rem)] flex-wrap items-center justify-center gap-1 rounded-3xl border border-stone-700 bg-stone-900/95 px-2 py-1.5 text-sm text-white shadow-2xl">
      <span data-pill-grip role="button" aria-label="Déplacer la barre de style" title="Glisser pour déplacer" class="flex h-9 w-6 cursor-grab touch-none items-center justify-center rounded-full text-stone-400 hover:text-white active:cursor-grabbing"><?= ui_icon('grip', 'size-4') ?></span>
      <button type="button" data-fmt="bold" aria-label="Gras" class="size-9 rounded-full font-extrabold hover:bg-stone-800 active:bg-stone-700">B</button>
      <button type="button" data-fmt="italic" aria-label="Italique" class="size-9 rounded-full font-news italic hover:bg-stone-800 active:bg-stone-700">I</button>
      <button type="button" data-fmt="underline" aria-label="Souligner" class="size-9 rounded-full underline hover:bg-stone-800 active:bg-stone-700">U</button>
      <button type="button" data-fmt="insertUnorderedList" aria-label="Liste à puces" class="flex size-9 items-center justify-center rounded-full hover:bg-stone-800 active:bg-stone-700"><?= ui_icon('list', 'size-4') ?></button>
      <span class="mx-0.5 h-5 w-px bg-stone-700"></span>
      <button type="button" data-fmt="highlight" aria-label="Surligner" class="flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold hover:bg-stone-800 active:bg-stone-700"><span class="size-3 rounded-sm bg-amber-300"></span>Surligner</button>
      <button type="button" data-fmt="clear" aria-label="Effacer le style" class="flex size-9 items-center justify-center rounded-full text-stone-400 hover:bg-stone-800 hover:text-white active:bg-stone-700"><?= ui_icon('eraser', 'size-4') ?></button>
      <button type="button" data-split aria-label="Scinder le bloc au curseur" title="Scinder le bloc au curseur" class="flex size-9 items-center justify-center rounded-full text-stone-400 hover:bg-stone-800 hover:text-white active:bg-stone-700"><?= ui_icon('scissors', 'size-4') ?></button>
      <span class="mx-0.5 h-5 w-px bg-stone-700"></span>
      <button type="button" data-pill-close aria-label="Fermer la barre de style" class="flex size-9 items-center justify-center rounded-full text-stone-400 hover:bg-stone-800 hover:text-white active:bg-stone-700"><?= ui_icon('x', 'size-4') ?></button>
    </div>
  </div>

  <div class="pointer-events-none fixed inset-x-0 bottom-8 z-40 flex justify-center">
    <div data-toast role="status" class="flex items-center gap-2 rounded-full bg-stone-900/95 px-3.5 py-2 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-300">
      <span class="size-2 rounded-full bg-emerald-400"></span><span data-toast-text></span></div>
  </div>
  <input type="file" data-file accept="image/jpeg,image/png,image/webp" hidden aria-label="Choisir une photo">
</div>

<?= ui_sheet('ehg-add', 'Quel type de bloc ajouter ?', '#', $csrf,
    '<p data-add-where class="inline-block rounded-full bg-brand-50 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-600"></p>'
    . '<p class="mt-4 text-[11px] font-bold uppercase tracking-wider text-stone-400">Blocs Textuels (Tous convertibles entre eux)</p><div data-add-text class="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2"></div>'
    . '<p class="mt-4 text-[11px] font-bold uppercase tracking-wider text-stone-400">Blocs Médias</p><div data-add-media class="mt-2 grid grid-cols-3 gap-2"></div>', [], false) ?>
<?= ui_sheet('ehg-delete', 'Supprimer ce bloc ?', '#', $csrf,
    '<p class="text-sm text-stone-600">Ce bloc sera retiré de la rubrique <strong data-del-fiche class="text-stone-800"></strong>. Pensez à enregistrer ensuite.</p>'
    . '<div class="mt-3 rounded-2xl border border-stone-200 bg-stone-50 p-3.5"><span data-del-type></span><p data-del-preview class="mt-2 line-clamp-3 text-xs italic leading-relaxed text-stone-700"></p></div>'
    . '<button type="button" data-del-confirm class="' . UI_BTN_DANGER . ' mt-4 w-full">' . ui_icon('trash2') . 'Supprimer définitivement</button>', [], false) ?>
<?= ui_sheet('ehg-leave', 'Modifications non enregistrées', '#', $csrf,
    '<p class="text-sm text-stone-600">Vous avez modifié cette rubrique sans enregistrer. Que souhaitez-vous faire ?</p>'
    . '<div class="mt-4 grid gap-2">'
    . '<button type="button" data-leave-save class="' . UI_BTN . ' w-full gap-2">' . ui_icon('check') . 'Enregistrer et quitter</button>'
    . '<a href="' . e($back) . '" data-leave-discard class="' . UI_BTN_DANGER . ' w-full">Quitter sans enregistrer</a>'
    . '</div>', [], false) ?>
<?= ui_sheet('ehg-icon', 'Icône de la rubrique', '#', $csrf,
    '<ul class="grid grid-cols-6 gap-1.5">' . implode('', array_map(fn (string $m): string => '<li><button type="button" data-icon-pick="' . e($m) . '" class="flex aspect-square w-full items-center justify-center rounded-xl bg-stone-100 text-2xl hover:bg-stone-200 active:bg-stone-300">' . e($m) . '</button></li>', $emoji)) . '</ul>'
    . '<div class="mt-4 flex gap-2"><input data-icon-input aria-label="Votre emoji" placeholder="Collez votre emoji" maxlength="16" class="' . UI_FIELD . ' !mt-0 min-w-0 flex-1 text-xl">'
    . '<button type="button" data-icon-use class="' . UI_BTN . ' shrink-0">Utiliser</button></div>'
    . '<button type="button" data-icon-pick="" class="' . UI_LINK . ' mt-3">Aucune icône</button>', [], false) ?>
<?php
$aiInner = '<div class="rounded-2xl border border-amber-200 bg-amber-50/70 p-5 text-center">'
    . '<span class="mx-auto flex size-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">' . ui_icon('sparkles', 'size-5') . '</span>'
    . '<span class="mt-2.5 inline-block rounded-full bg-amber-200/80 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-950">Coming soon</span>'
    . '<p class="mt-2 font-bold text-stone-900">Assistant IA de rédaction</p>'
    . '<p class="mt-1 text-xs leading-relaxed text-stone-600">L’aide IA simplifiée arrive prochainement pour mettre en forme et enrichir vos rubriques en un geste.</p>'
    . '</div>';
?>
<?= ui_sheet('ai', 'Assistant IA', '#', $csrf, $aiInner, [], false) ?>
<script src="<?= e(url('/assets/blocks.js') . '?v=' . (int) @filemtime(APP . '/assets/blocks.js')) ?>" defer></script>
