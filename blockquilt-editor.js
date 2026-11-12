// Écran de blockquilt : cartes d'édition des blocs. Nécessite blockquilt.js (le noyau `Blocks`), chargé avant.
// Chaque type reçoit ici edit(b, ui) → HTML de la carte, et read(card, b) → met à jour le modèle depuis l'écran.

/** Champ riche ou simple (contenteditable). */
Blocks.editable = (cls, html, ph, extra = '') => `<div ${extra} contenteditable="true" role="textbox" aria-multiline="true" spellcheck="false" data-placeholder="${Blocks.esc(ph).replace(/"/g, '&quot;')}" class="bq-edit ${cls}">${html}</div>`;
{
  const rich = { edit: (b, ui) => ui.editable('min-h-10 text-sm leading-relaxed', b.html, 'Insérez votre texte…', 'data-body data-rich'), read: (card, b) => { b.html = card.querySelector('[data-body]').innerHTML; } };
  for (const k of ['text', 'tip', 'advice', 'warning']) Object.assign(Blocks.types[k], rich);
  Object.assign(Blocks.types.title, {
    edit: (b, ui) => ui.editable('font-news text-base sm:text-lg font-semibold leading-tight tracking-tight text-stone-900', b.html, 'Saisissez un titre de section…', 'data-body data-plain'),
    read: rich.read,
  });
  Object.assign(Blocks.types.photo, {
    edit: (b, ui) => `<div class="space-y-2">${b.file ? `<div class="overflow-hidden rounded-xl border border-stone-200 bg-stone-100"><img src="${ui.attr(ui.media + b.file)}" alt="" class="h-36 w-full object-cover"></div>` : ''}
          ${ui.editable('text-xs italic text-stone-600', ui.esc(b.alt), 'Légende de la photo (lue aux personnes malvoyantes)…', 'data-body data-plain')}</div>`,
    read: (card, b) => { b.alt = card.querySelector('[data-body]').textContent; },
  });
  Object.assign(Blocks.types.video, {
    edit: (b, ui) => `<div class="space-y-2"><div class="flex h-24 flex-col items-center justify-center gap-1 rounded-xl bg-stone-900 text-white"><span class="flex size-9 items-center justify-center rounded-full bg-white/20">${ui.ic('video', 'size-4')}</span><span class="text-[11px] text-stone-300">Lecteur affiché à l’invité</span></div>
          <input data-url type="url" value="${ui.attr(b.url)}" class="w-full rounded-lg border border-rose-200 bg-white/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" placeholder="https://www.youtube.com/watch?v=…" aria-label="Lien de la vidéo"></div>`,
    read: (card, b) => { b.url = card.querySelector('[data-url]').value; },
  });
  // Repli : le texte du bloc, tel quel. Sert aussi à tout type enregistré sans carte d'édition propre.
  const source = {
    edit: (b, ui) => `<div class="space-y-1"><textarea data-raw rows="3" class="w-full rounded-xl border border-stone-300 bg-white p-3 font-mono text-xs leading-5" aria-label="Contenu du bloc">${ui.esc(Blocks.toMarkdown(b))}</textarea></div>`,
  };
  Object.assign(Blocks.types.raw, source, { read: (card, b) => { b.md = card.querySelector('[data-raw]').value; } });
  Blocks.fallbackEditor = {
    edit: source.edit,
    read: (card, b) => {
      const next = Blocks.fromMarkdown(card.querySelector('[data-raw]').value);
      for (const k of Object.keys(b)) if (k !== 'id') delete b[k];
      Object.assign(b, next);
    },
  };
}

// ---- Écran : actif seulement si la page contient #bq ----
(function () {
  const root = typeof document !== 'undefined' ? document.getElementById('bq') : null;
  if (!root) return;
  const $ = (s, r = root) => r.querySelector(s);
  const media = root.dataset.media;
  const csrf = root.dataset.csrf;
  const saveUrl = root.dataset.save;
  const previewUrl = root.dataset.preview;
  const uploadUrl = root.dataset.upload;
  const canvas = $('[data-canvas]');
  const pill = $('[data-pill]');
  const status = $('[data-status]');
  const titleEl = $('[data-title]');
  const iconEl = $('[data-icon]');
  const toast = $('[data-toast]');
  const T = Blocks.types;

  let slug = root.dataset.slug;
  let icon = '';
  let blocks = [];
  let dirty = false;
  let guestMode = false;
  let insertAt = null; // null = en bas
  let deleteId = null;
  let activeBlockId = null;
  let fullscreenId = null;
  let nextId = 1;

  const ic = (name, cls = 'size-4') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#ic-${name}"/></svg>`;
  const esc = Blocks.esc;
  const attr = (s) => esc(s).replace(/"/g, '&quot;');
  const showToast = (text) => {
    $('[data-toast-text]').textContent = text;
    toast.classList.remove('opacity-0');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add('opacity-0'), 1800);
  };

  // ---- État enregistré (grisé) / à enregistrer (vert avec icône disquette) ----
  const setDirty = (value) => {
    if (dirty === value && status.innerHTML !== '') return;
    dirty = value;
    status.innerHTML = `${ic('save', 'size-3.5')} <span>${value ? 'Enregistrer' : 'Enregistré'}</span>`;
    status.disabled = !value;
    status.className = value
      ? 'inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700 active:scale-95 transition-all'
      : 'inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-400 transition-all';
  };
  addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });

  // ---- Titre et icône de la rubrique : « ## 🔑 Arrivée » ----
  const splitHeading = Blocks.splitHeading;
  const heading = () => '## ' + [icon, titleEl.textContent.trim()].filter(Boolean).join(' ');
  const showIcon = () => { iconEl.textContent = icon || '📄'; };

  // ---- Lecture de l'écran vers le modèle (avant tout nouveau dessin) ----
  const syncFromDom = () => {
    if (guestMode) return;
    canvas.querySelectorAll('[data-id]').forEach((card) => {
      const b = blocks.find((x) => x.id === card.dataset.id);
      if (b) (Blocks.def(b.type).read || Blocks.fallbackEditor.read)(card, b);
    });
  };
  const markdown = () => {
    syncFromDom();
    return Blocks.serialize(heading(), blocks.map((b) => ({ text: Blocks.toMarkdown(b) })));
  };

  // ---- Dessin : bouton + Insérer au milieu SANS trait horizontal ----
  const gapBtn = 'inline-flex h-7 items-center justify-center gap-1 rounded-full border border-stone-200/90 bg-white px-3 text-[11px] font-bold text-stone-600 shadow-sm transition-all hover:border-stone-400 hover:bg-stone-50 active:scale-95';
  const gap = (index, label) => {
    const canMerge = index > 0 && index < blocks.length && Blocks.merge(blocks[index - 1], blocks[index]) !== null;
    return `<div class="flex items-center justify-center gap-2 py-2.5">
      <button type="button" data-insert="${index}" aria-label="${label}" class="${gapBtn}">${ic('plus', 'size-3.5')}<span>Insérer</span></button>
      ${canMerge ? `<button type="button" data-merge="${index}" aria-label="Fusionner le bloc n°${index + 1} dans le bloc n°${index}" class="${gapBtn}">${ic('fold_vertical', 'size-3.5')}<span>Fusionner</span></button>` : ''}
    </div>`;
  };

  const ui = { ic, esc, attr, media, editable: Blocks.editable };
  const body = (b) => (Blocks.def(b.type).edit || Blocks.fallbackEditor.edit)(b, ui);

  // Structure de bloc :
  // (type contenu)   []fullscreen   | haut
  // contenu                         | drag
  //                  []poubelle     | bas
  const card = (b, i) => {
    const t = T[b.type];
    const isTitle = !!t.single;
    const isFull = fullscreenId === b.id;
    const canFullscreen = t.convertible && !t.single || b.type === 'raw';
    const head = Blocks.TEXT_KEYS.includes(b.type)
      ? `<div class="relative inline-flex items-center">${ic(t.icon, 'pointer-events-none absolute left-2.5 size-3.5 opacity-80')}
          <select data-convert aria-label="Type du bloc" class="cursor-pointer appearance-none rounded-full border py-0.5 pl-7 pr-6 text-[11px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${t.tone.badge}">
            ${Blocks.TEXT_KEYS.map((k) => `<option value="${k}" ${k === b.type ? 'selected' : ''}>${T[k].label}</option>`).join('')}</select>
          ${ic('chevron_down', 'pointer-events-none absolute right-2 size-3 opacity-70')}</div>`
      : `<span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${t.tone.badge}">${ic(t.icon, 'size-3.5')}<span>${t.label}</span></span>`;
    const fsBtn = canFullscreen
      ? `<button type="button" data-fullscreen aria-label="${isFull ? 'Quitter le plein écran' : 'Plein écran'}" title="${isFull ? 'Quitter le plein écran' : 'Plein écran'}" class="-mr-1.5 -mt-1 flex size-8 items-center justify-center rounded-xl text-stone-500 hover:bg-black/5 hover:text-stone-900">${ic(isFull ? 'minimize' : 'maximize', 'size-3.5')}</button>`
      : '<span></span>';
    const rail = (name, act, label, disabled) => `<button type="button" data-move="${act}" ${disabled ? 'disabled' : ''} aria-label="${label}" class="flex ${isTitle ? 'size-7' : 'size-8'} items-center justify-center rounded-lg text-stone-500 active:bg-white/80 disabled:pointer-events-none disabled:opacity-20">${ic(name, 'size-3.5')}</button>`;
    return `<article data-id="${b.id}" class="bq-card flex items-stretch overflow-hidden rounded-2xl border ${t.tone.card} ${isFull ? 'bq-fullscreen' : ''}">
        <div class="flex min-w-0 flex-1 flex-col ${isTitle ? 'px-3.5 py-2.5' : 'p-3.5'}">
          <div class="${isTitle ? 'mb-1' : 'mb-2'} flex items-center justify-between gap-2">${head}${fsBtn}</div>
          <div class="flex-1">${body(b)}</div>
          <div class="mt-2 flex justify-end">
            <button type="button" data-delete aria-label="Supprimer ce bloc" class="-mb-1 -mr-1.5 flex size-8 items-center justify-center rounded-xl text-red-600 hover:bg-red-50 active:bg-red-100">${ic('trash2', 'size-3.5')}</button>
          </div>
        </div>
        <div class="flex w-10 shrink-0 select-none flex-col items-center justify-between border-l border-black/5 bg-black/[0.02] py-1">
          ${rail('chevron_up', '-1', 'Monter ce bloc', i === 0)}
          <div data-grip role="button" aria-label="Glisser pour déplacer" class="flex ${isTitle ? 'size-7' : 'size-8'} cursor-grab touch-none items-center justify-center rounded-lg text-stone-400 active:cursor-grabbing">${ic('grip', 'size-3.5')}</div>
          ${rail('chevron_down', '1', 'Descendre ce bloc', i === blocks.length - 1)}</div></article>`;
  };

  const render = () => (guestMode ? renderGuest() : renderEdit());
  const renderEdit = () => {
    canvas.innerHTML = `${blocks.length ? gap(0, 'Insérer un bloc au début') : ''}${blocks.map((b, i) => card(b, i) + (i < blocks.length - 1 ? gap(i + 1, 'Insérer un bloc ici') : '')).join('')}
      <div class="${blocks.length ? 'pt-3' : ''} flex items-center gap-2.5">
        <button type="button" data-insert="end" class="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-stone-200/90 bg-white px-4 py-2.5 text-xs font-bold text-stone-600 shadow-sm transition-all hover:border-stone-300 hover:bg-stone-50 active:scale-[0.99] sm:text-sm">
          <span class="flex size-5 items-center justify-center rounded-full bg-stone-100 text-stone-500">${ic('plus', 'size-3.5')}</span><span>Insérer un bloc</span></button>
      </div>`;
    pill.hidden = true;
    canvas.querySelectorAll('.bq-edit').forEach(clean);
  };
  const clean = (el) => { if (el.innerHTML !== '' && el.textContent === '' && !el.querySelector('img, ul, ol, li')) el.innerHTML = ''; };

  const renderGuest = async () => {
    pill.hidden = true;
    canvas.innerHTML = '<p class="py-10 text-center text-sm text-stone-500">Chargement de l’aperçu…</p>';
    const text = markdown().split('\n').slice(1).join('\n');
    const data = new FormData();
    data.set('_csrf', csrf);
    data.set('text', text);
    try {
      // Sans data-preview, le rendu se fait ici (Blocks.toHtml) ; avec, le serveur hôte peut compléter le texte (variables, etc.).
      const html = previewUrl
        ? await (await fetch(previewUrl, { method: 'POST', body: data, headers: { 'HX-Request': 'true' } })).text()
        : Blocks.toHtml(text, media);
      canvas.innerHTML = `<div class="rounded-2xl bg-white p-4"><h2 class="font-news text-2xl font-bold text-stone-900">${esc((icon + ' ' + titleEl.textContent).trim())}</h2>${html}</div>`;
    } catch {
      canvas.innerHTML = '<p role="alert" class="rounded-xl bg-red-100 p-3 text-red-800">Aperçu indisponible. Réessayez.</p>';
    }
  };

  // ---- Modes ----
  const setMode = async (guest) => {
    if (guest === guestMode) return;
    syncFromDom();
    guestMode = guest;
    fullscreenId = null;
    root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.mode === 'guest') === guest)));
    titleEl.contentEditable = String(!guest);
    render();
    showToast(guest ? 'Visualisation invité' : 'Mode édition');
  };

  // ---- Positionnement fluide au-dessus du clavier virtuel mobile lors de l'ajout d'un bloc ----
  // Règle UX : uniquement déclenché à l'ajout d'un bloc neuf (jamais pendant la frappe ni au focusin sur une liste existante).
  let addedCard = null;
  let addedAt = 0;
  const ensureVisibleAboveKeyboard = (cardEl) => {
    if (!cardEl || fullscreenId) return;
    const vh = window.visualViewport ? window.visualViewport.height : innerHeight;
    const rect = cardEl.getBoundingClientRect();
    const targetTop = Math.max(96, Math.round(vh * 0.26));
    if (rect.bottom > vh - 20 || rect.top > vh * 0.5) {
      const delta = rect.top - targetTop;
      if (Math.abs(delta) > 16) window.scrollBy({ top: delta, behavior: 'smooth' });
    }
  };
  const scrollAboveKeyboard = (cardEl) => {
    if (!cardEl) return;
    addedCard = cardEl;
    addedAt = Date.now();
    const field = cardEl.querySelector('[contenteditable], input, textarea');
    field?.focus({ preventScroll: true });
    requestAnimationFrame(() => ensureVisibleAboveKeyboard(cardEl));
    setTimeout(() => ensureVisibleAboveKeyboard(cardEl), 180);
    setTimeout(() => ensureVisibleAboveKeyboard(cardEl), 360);
  };
  window.visualViewport?.addEventListener('resize', () => {
    if (addedCard && Date.now() - addedAt < 800) {
      ensureVisibleAboveKeyboard(addedCard);
    }
  });

  // ---- Ajout, déplacement, suppression ----
  const add = (type, at) => {
    syncFromDom();
    const b = { id: 'b' + nextId++, ...Blocks.blank(type) };
    const index = at === null || at > blocks.length ? blocks.length : at;
    blocks.splice(index, 0, b);
    setDirty(true);
    render();
    const el = canvas.querySelector(`[data-id="${b.id}"]`);
    el.classList.add('bq-new');
    scrollAboveKeyboard(el);
  };
  const move = (id, delta) => {
    syncFromDom();
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + delta;
    if (j < 0 || j >= blocks.length) return;
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    setDirty(true);
    render();
    canvas.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  // Le bloc n°index rejoint celui du dessus, qui garde son type.
  const merge = (index) => {
    syncFromDom();
    const fused = Blocks.merge(blocks[index - 1], blocks[index]);
    if (!fused) return;
    blocks.splice(index - 1, 2, fused);
    setDirty(true);
    render();
    showToast('Blocs fusionnés');
  };
  // Coupe le bloc au curseur : ce qui suit part dans un nouveau bloc du même type, juste en dessous.
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
    const nb = { ...blocks[i], id: 'b' + nextId++, html: box.innerHTML };
    blocks.splice(i + 1, 0, nb);
    setDirty(true);
    render();
    canvas.querySelector(`[data-id="${nb.id}"] [data-body]`)?.focus();
    showToast('Bloc scindé');
  };

  const dialog = (name) => document.getElementById('bq-' + name);
  // Feuilles <dialog> : [data-close] ferme celle qui le contient ; un toucher qui commence ET finit sur le fond la ferme.
  const outside = (d, event) => {
    const box = d.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
  };
  let pressedBackdrop = false;
  document.querySelectorAll('dialog[id^="bq-"]').forEach((d) => {
    d.addEventListener('pointerdown', (event) => { pressedBackdrop = event.target === d && outside(d, event); });
    d.addEventListener('click', (event) => {
      if (event.target.closest('[data-close]')) d.close();
      else if (pressedBackdrop && event.target === d && outside(d, event)) d.close();
      pressedBackdrop = false;
    });
  });
  const openAdd = (at) => {
    insertAt = at;
    const n = blocks.length;
    $('[data-add-where]', dialog('add')).textContent = at === null || at >= n ? `Ajout en bas de fiche (bloc n°${n + 1})` : at === 0 ? 'Insertion tout en haut de la fiche' : `Insertion entre le bloc n°${at} et n°${at + 1}`;
    // Construit depuis le registre à chaque ouverture : un type enregistré après le chargement y figure aussi.
    const ofGroup = (g) => Blocks.order.filter((k) => T[k].group === g);
    $('[data-add-text]', dialog('add')).innerHTML = ofGroup('text').map((k) => tile(k, true)).join('');
    $('[data-add-media]', dialog('add')).innerHTML = ofGroup('media').map((k) => tile(k, false)).join('');
    dialog('add').showModal();
  };

  canvas.addEventListener('focusin', (event) => {
    const cardEl = event.target.closest?.('[data-id]');
    if (cardEl) activeBlockId = cardEl.dataset.id;
  });
  canvas.addEventListener('click', (event) => {
    const el = event.target;
    const cardEl = el.closest('[data-id]');
    const id = cardEl?.dataset.id;
    if (id) activeBlockId = id;
    if (el.closest('[data-fullscreen]')) {
      syncFromDom();
      fullscreenId = fullscreenId === id ? null : id;
      render();
      canvas.querySelector(`[data-id="${id}"] [contenteditable], [data-id="${id}"] textarea`)?.focus();
      return;
    }
    if (el.closest('[data-insert]')) { const v = el.closest('[data-insert]').dataset.insert; syncFromDom(); return openAdd(v === 'end' ? null : Number(v)); }
    if (el.closest('[data-merge]')) return merge(Number(el.closest('[data-merge]').dataset.merge));
    if (el.closest('[data-move]')) return move(id, Number(el.closest('[data-move]').dataset.move));
    if (el.closest('[data-delete]')) {
      syncFromDom();
      const b = blocks.find((x) => x.id === id);
      deleteId = id;
      const badge = $('[data-del-type]', dialog('delete'));
      badge.textContent = T[b.type].label;
      badge.className = `inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${T[b.type].tone.badge}`;
      const preview = Blocks.stripTags(Blocks.toMarkdown(b)).replace(/\n/g, ' • ').replace(/^[#>:*\s]+/, '').trim();
      $('[data-del-preview]', dialog('delete')).textContent = preview ? `« ${preview.slice(0, 140)}${preview.length > 140 ? '…' : ''} »` : '(Bloc sans texte)';
      $('[data-del-fiche]', dialog('delete')).textContent = titleEl.textContent.trim() || 'cette rubrique';
      return dialog('delete').showModal();
    }
  });

  canvas.addEventListener('change', (event) => {
    if (!event.target.matches('[data-convert]')) return;
    syncFromDom();
    const i = blocks.findIndex((b) => b.id === event.target.closest('[data-id]').dataset.id);
    blocks[i] = { id: blocks[i].id, ...Blocks.convert(blocks[i], event.target.value) };
    setDirty(true);
    render();
    showToast('Converti en ' + T[blocks[i].type].label);
  });

  canvas.addEventListener('input', () => {
    setDirty(true);
  });
  canvas.addEventListener('focusout', (event) => {
    if (event.target.classList?.contains('bq-edit')) clean(event.target);
  });
  canvas.addEventListener('paste', (event) => {
    if (!event.target.closest?.('.bq-edit')) return;
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  });
  canvas.addEventListener('keydown', (event) => {
    const el = event.target;
    if (event.key === 'Escape' && fullscreenId) {
      syncFromDom();
      fullscreenId = null;
      render();
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey || !el.matches?.('.bq-edit[data-plain]')) return;
    event.preventDefault();
    el.blur();
  });

  // ---- Suppression confirmée ----
  dialog('delete').addEventListener('click', (event) => {
    if (!event.target.closest('[data-del-confirm]')) return;
    blocks = blocks.filter((b) => b.id !== deleteId);
    if (fullscreenId === deleteId) fullscreenId = null;
    deleteId = null;
    dialog('delete').close();
    setDirty(true);
    render();
    showToast('Bloc supprimé');
  });

  // ---- Choix du type à ajouter ----
  const fileInput = $('[data-file]');
  const tile = (key, flat) => `<button type="button" data-pick="${key}" class="rounded-2xl border p-3 text-left transition-transform active:scale-95 ${flat ? 'flex items-center justify-between gap-2' : 'flex flex-col items-center gap-1.5 text-center'} ${T[key].tone.card}">
      <span class="flex size-8 shrink-0 items-center justify-center rounded-xl border ${T[key].tone.badge}">${ic(T[key].icon)}</span>
      <span class="min-w-0 flex-1"><span class="block text-xs font-bold text-stone-900">${T[key].label}</span>${flat && T[key].desc ? `<span class="mt-0.5 block text-[11px] leading-snug opacity-75">${T[key].desc}</span>` : ''}</span></button>`;
  dialog('add').addEventListener('click', (event) => {
    const pick = event.target.closest('[data-pick]');
    if (!pick) return;
    if (pick.dataset.pick === 'photo') { fileInput.click(); dialog('add').close(); return; }
    dialog('add').close();
    add(pick.dataset.pick, insertAt);
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    showToast('Envoi de la photo…');
    const data = new FormData();
    data.set('_csrf', csrf);
    data.set('photo', file);
    try {
      const r = await fetch(uploadUrl, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Envoi impossible');
      syncFromDom();
      const b = { id: 'b' + nextId++, ...Blocks.blank('photo'), file: j.id };
      blocks.splice(insertAt === null || insertAt > blocks.length ? blocks.length : insertAt, 0, b);
      setDirty(true);
      render();
      const el = canvas.querySelector(`[data-id="${b.id}"]`);
      scrollAboveKeyboard(el);
      showToast('Photo ajoutée');
    } catch (error) {
      showToast(error.message);
    }
  });

  // ---- Icône de la rubrique ----
  dialog('icon').addEventListener('click', (event) => {
    const pick = event.target.closest('[data-icon-pick]');
    if (!pick) return;
    icon = pick.dataset.iconPick;
    showIcon();
    setDirty(true);
    dialog('icon').close();
    showToast(icon ? `Icône changée en ${icon}` : 'Icône retirée');
  });
  // Emoji libre : collé depuis un clavier ou un site ; seul le premier emoji est gardé.
  dialog('icon').querySelector('[data-icon-use]').addEventListener('click', () => {
    const input = dialog('icon').querySelector('[data-icon-input]');
    const picked = Blocks.firstEmoji(input.value);
    if (!picked) { showToast('Collez un emoji, par exemple 🏡'); return; }
    icon = picked;
    input.value = '';
    showIcon();
    setDirty(true);
    dialog('icon').close();
    showToast(`Icône changée en ${icon}`);
  });
  dialog('icon').querySelector('[data-icon-input]').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); dialog('icon').querySelector('[data-icon-use]').click(); }
  });
  iconEl.closest('button').addEventListener('click', () => dialog('icon').showModal());
  $('[data-title]').addEventListener('input', () => setDirty(true));
  titleEl.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); titleEl.blur(); } });

  // ---- Modes, ajout, retour sécurisé, enregistrement ----
  root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode === 'guest')));
  root.querySelectorAll('[data-open-add]').forEach((b) => b.addEventListener('click', () => { syncFromDom(); openAdd(null); }));

  const save = async () => {
    if (!dirty) return true;
    const data = new FormData();
    data.set('_csrf', csrf);
    data.set('slug', slug);
    data.set('text', markdown());
    status.textContent = 'Enregistrement…';
    try {
      const r = await fetch(saveUrl, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Enregistrement impossible');
      if (j.slug !== slug) {
        slug = j.slug;
        history.replaceState(null, '', saveUrl + '/' + encodeURIComponent(slug));
      }
      setDirty(false);
      showToast('Sauvegardé');
      return true;
    } catch (error) {
      setDirty(true);
      showToast(error.message);
      return false;
    }
  };
  status.addEventListener('click', save);

  // Retour vers les rubriques : modale de confirmation si des modifications ne sont pas enregistrées.
  const backBtn = $('[data-back]');
  backBtn?.addEventListener('click', (event) => {
    if (!dirty) return;
    event.preventDefault();
    dialog('leave')?.showModal();
  });
  dialog('leave')?.addEventListener('click', async (event) => {
    if (event.target.closest('[data-leave-discard]')) {
      dirty = false;
      return;
    }
    if (event.target.closest('[data-leave-save]')) {
      dialog('leave').close();
      if (await save()) location.href = backBtn.href;
    }
  });

  // ---- Glisser par la poignée (doigt ou souris) ----
  let drag = null;
  canvas.addEventListener('pointerdown', (event) => {
    const grip = event.target.closest('[data-grip]');
    if (!grip) return;
    syncFromDom();
    drag = grip.closest('[data-id]');
    drag.classList.add('bq-dragging');
    grip.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const others = [...canvas.querySelectorAll('[data-id]')].filter((c) => c !== drag);
    const next = others.find((c) => event.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
    if (next) next.before(drag); else if (others.length) others[others.length - 1].after(drag);
  });
  const dropped = () => {
    if (!drag) return;
    const order = [...canvas.querySelectorAll('[data-id]')].map((c) => c.dataset.id);
    drag = null;
    const same = order.every((id, i) => blocks[i].id === id);
    if (!same) { blocks.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); setDirty(true); }
    render();
  };
  canvas.addEventListener('pointerup', dropped);
  canvas.addEventListener('pointercancel', dropped);

  // ---- Pilule de mise en forme style Medium (z-50 : apparaît à la sélection de texte OU sur un appui long, et déplaçable) ----
  const richOf = (node) => (node && (node.nodeType === 1 ? node : node.parentElement))?.closest('.bq-edit[data-rich], .bq-edit:not([data-plain]):not([data-body])');
  let pillDismissed = false;
  let pillForced = false;
  let pillDrag = null;
  let longPressTimer = null;
  let pressPt = null;
  const placePill = (force = false) => {
    if (pillDrag) return;
    if (force) { pillForced = true; pillDismissed = false; }
    if (guestMode || pillDismissed) { pill.hidden = true; return; }
    const sel = getSelection();
    const hasSel = sel && sel.rangeCount > 0 && !sel.isCollapsed;
    if (!hasSel && !pillForced) { pill.hidden = true; return; }
    const field = (sel && sel.rangeCount ? richOf(sel.anchorNode) : null) || richOf(document.activeElement);
    if (!field || !canvas.contains(field) || field.hasAttribute('data-plain')) { pill.hidden = true; return; }
    let rect = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : { width: 0, height: 0, top: 0, bottom: 0, left: 0 };
    if (rect.width === 0 && rect.height === 0) {
      const fRect = field.getBoundingClientRect();
      rect = pressPt ? { left: pressPt.x, width: 0, top: pressPt.y - 10, bottom: pressPt.y + 10 } : fRect;
    }
    pill.hidden = false;
    const w = pill.offsetWidth;
    const h = pill.offsetHeight;
    const minTop = fullscreenId ? 12 : 72;
    const top = rect.top - h - 8;
    pill.style.left = Math.max(8, Math.min(innerWidth - w - 8, rect.left + rect.width / 2 - w / 2)) + 'px';
    pill.style.top = (top < minTop ? rect.bottom + 8 : top) + 'px';
  };
  document.addEventListener('selectionchange', () => { pillDismissed = false; placePill(); });
  canvas.addEventListener('input', () => { pillForced = false; });
  canvas.addEventListener('keydown', () => { pillForced = false; pill.hidden = true; });
  canvas.addEventListener('pointerdown', (event) => {
    clearTimeout(longPressTimer);
    const field = richOf(event.target);
    if (!field || field.hasAttribute('data-plain')) { pillForced = false; return; }
    pressPt = { x: event.clientX, y: event.clientY };
    longPressTimer = setTimeout(() => placePill(true), 450);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (pressPt && (Math.abs(event.clientX - pressPt.x) > 10 || Math.abs(event.clientY - pressPt.y) > 10)) {
      clearTimeout(longPressTimer);
    }
  });
  canvas.addEventListener('pointerup', () => clearTimeout(longPressTimer));
  canvas.addEventListener('pointercancel', () => clearTimeout(longPressTimer));
  canvas.addEventListener('contextmenu', (event) => {
    if (event.target.closest?.('.bq-edit')) {
      event.preventDefault();
      clearTimeout(longPressTimer);
      pressPt = { x: event.clientX || innerWidth / 2, y: event.clientY || 160 };
      placePill(true);
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!pill.hidden && !pill.contains(event.target) && !richOf(event.target)) { pillForced = false; pill.hidden = true; }
  });
  addEventListener('scroll', () => { if (!pill.hidden && !pillDrag) placePill(); }, { passive: true });
  const keepSelection = (event) => event.preventDefault();
  pill.addEventListener('mousedown', keepSelection);
  pill.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const grip = event.target.closest('[data-pill-grip]');
    if (!grip) return;
    pillDrag = { dx: event.clientX - pill.offsetLeft, dy: event.clientY - pill.offsetTop };
    grip.setPointerCapture(event.pointerId);
  });
  pill.addEventListener('pointermove', (event) => {
    if (!pillDrag) return;
    pill.style.left = Math.max(8, Math.min(innerWidth - pill.offsetWidth - 8, event.clientX - pillDrag.dx)) + 'px';
    pill.style.top = Math.max(8, Math.min(innerHeight - pill.offsetHeight - 8, event.clientY - pillDrag.dy)) + 'px';
  });
  const endPillDrag = () => { pillDrag = null; };
  pill.addEventListener('pointerup', endPillDrag);
  pill.addEventListener('pointercancel', endPillDrag);
  const unwrapMarks = (range) => {
    const scope = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    scope.closest('.bq-edit')?.querySelectorAll('mark').forEach((m) => {
      if (range.intersectsNode(m)) m.replaceWith(...m.childNodes);
    });
  };
  pill.addEventListener('click', (event) => {
    if (event.target.closest('[data-pill-close]')) { pillDismissed = true; pill.hidden = true; return; }
    if (event.target.closest('[data-split]')) { const sel = getSelection(); if (sel.rangeCount) split(sel.getRangeAt(0)); return; }
    const button = event.target.closest('[data-fmt]');
    if (!button) return;
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const what = button.dataset.fmt;
    const range = sel.getRangeAt(0);
    if (what === 'highlight') {
      if (range.collapsed) return;
      const inside = (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement).closest('mark');
      if (inside) unwrapMarks(range);
      else { const m = document.createElement('mark'); m.className = 'bq-highlight'; m.append(range.extractContents()); range.insertNode(m); sel.removeAllRanges(); sel.selectAllChildren(m); }
    } else if (what === 'clear') {
      document.execCommand('removeFormat');
      unwrapMarks(sel.getRangeAt(0));
    } else document.execCommand(what);
    setDirty(true);
  });

  // ---- Chargement ----
  const load = (md) => {
    const { title, blocks: parsed } = Blocks.parse(md);
    const h = splitHeading(title);
    icon = h.icon;
    titleEl.textContent = h.title;
    showIcon();
    blocks = parsed.map((p) => ({ id: 'b' + nextId++, ...Blocks.fromMarkdown(p.text) }));
    if (blocks.length === 0) {
      blocks = [{ id: 'b' + nextId++, type: 'text', html: '' }];
    }
    render();
  };
  load($('[data-source]').value);
  setDirty(false);
  root.hidden = false;
})();
