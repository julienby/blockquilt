// Photos : envoi (plusieurs fichiers à la fois) et actions du carrousel (ordre, retrait, ajout).
export function installMedia(ed) {
  const { o, fileInput, canvas } = ed;

  const upload = async (file) => {
    if (!o.uploadUrl) throw new Error('Envoi de photos non configuré');
    const r = await fetch(o.uploadUrl, { method: 'POST', body: ed.form({ photo: file }), headers: { Accept: 'application/json' }, signal: ed.ac.signal });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !(j.id || j.src)) throw new Error(j.error || 'Envoi impossible');
    return j.src || 'media/' + j.id;
  };

  // Selon la demande : un bloc photo par fichier ({ type: 'photo', at }), un carrousel neuf ({ type: 'carousel', at }),
  // ou des photos ajoutées à un carrousel existant ({ add: id }).
  let target = null;
  ed.pickFiles = (t) => { target = t; fileInput.click(); };
  ed.on(fileInput, 'change', async () => {
    const files = [...fileInput.files];
    const t = target || { type: 'photo', at: null };
    fileInput.value = '';
    target = null;
    if (!files.length) return;
    ed.toast(files.length > 1 ? `Envoi de ${files.length} photos…` : 'Envoi de la photo…');
    try {
      const srcs = [];
      for (const f of files) srcs.push(await upload(f));
      const items = srcs.map((src) => ({ src, alt: '' }));
      if (t.card) {
        ed.syncFromDom();
        const b = ed.blocks.find((x) => x.id === t.card);
        if (b) ed.change(() => { b.src = srcs[0]; });
      } else if (t.add) {
        ed.syncFromDom();
        const b = ed.blocks.find((x) => x.id === t.add);
        if (b) ed.change(() => b.items.push(...items));
      } else if (t.type === 'carousel') ed.add('carousel', t.at, { items });
      else {
        const at = t.at === null ? ed.blocks.length : t.at;
        const fresh = items.map((x) => ({ id: ed.newId(), ...Blocks.blank('photo'), ...x }));
        ed.change(() => ed.blocks.splice(at, 0, ...fresh));
        ed.focusCard(fresh[0].id);
      }
      ed.toast(srcs.length > 1 ? `${srcs.length} photos ajoutées` : 'Photo ajoutée');
    } catch (error) {
      ed.toast(error.message);
    }
  });

  // ---- Carte : une seule photo (la première si plusieurs fichiers sont choisis) ----
  ed.cardPhoto = (act, id) => {
    if (act === 'photo') return ed.pickFiles({ card: id });
    const b = ed.blocks.find((x) => x.id === id);
    ed.syncFromDom();
    ed.change(() => { b.src = ''; b.alt = ''; });
  };

  // ---- Carrousel : retrait, ajout, ordre (poignée : glisser, ou flèches haut et bas au clavier) ----
  const moveItem = (id, from, to) => {
    const b = ed.blocks.find((x) => x.id === id);
    if (!b || to < 0 || to >= b.items.length || to === from) return;
    ed.syncFromDom();
    ed.change(() => b.items.splice(to, 0, ...b.items.splice(from, 1)));
    canvas.querySelector(`[data-id="${id}"] [data-car-item="${to}"] [data-car-grip]`)?.focus({ preventScroll: true });
  };
  ed.carousel = (el, id) => {
    const b = ed.blocks.find((x) => x.id === id);
    if (el.closest('[data-car-add]')) return ed.pickFiles({ add: id });
    const i = Number(el.closest('[data-car-item]').dataset.carItem);
    ed.syncFromDom();
    ed.change(() => b.items.splice(i, 1));
    canvas.querySelector(`[data-id="${id}"] [data-car-item="${Math.max(0, i - 1)}"] [data-car-act]`)?.focus({ preventScroll: true });
  };
  ed.on(ed.app, 'keydown', (e) => {
    const grip = e.target.closest?.('[data-car-grip]');
    if (!grip || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
    e.preventDefault();
    const i = Number(grip.closest('[data-car-item]').dataset.carItem);
    moveItem(grip.closest('[data-id]').dataset.id, i, i + (e.key === 'ArrowUp' ? -1 : 1));
  });
  // Glisser une photo : la ligne reste à sa place (estompée), un trait bleu marque l'arrivée ; l'ordre change au lâcher, Échap annule.
  let drag = null;
  ed.photoDragging = () => drag !== null;
  const stop = (commit) => {
    if (!drag) return;
    const { id, from, to, row, line } = drag;
    row.classList.remove('bq-origin');
    line.remove();
    drag = null;
    if (commit) moveItem(id, from, to);
  };
  ed.on(ed.app, 'pointerdown', (e) => {
    const grip = e.target.closest('[data-car-grip]');
    if (!grip || e.button !== 0 || !ed.editing()) return;
    e.preventDefault();
    const row = grip.closest('[data-car-item]');
    const line = document.createElement('div');
    line.className = 'bq-drop';
    row.parentElement.append(line);
    row.classList.add('bq-origin');
    const from = Number(row.dataset.carItem);
    drag = { id: grip.closest('[data-id]').dataset.id, from, to: from, row, line };
    grip.setPointerCapture(e.pointerId);
    place(e.clientY); // le trait part de la photo saisie, pas du haut de la liste
  });
  // Trait bleu entre les deux lignes les plus proches du pointeur ; drag.to = la place d'arrivée.
  const place = (y) => {
    const rows = [...drag.row.parentElement.querySelectorAll('[data-car-item]')];
    let slot = rows.findIndex((r) => { const b = r.getBoundingClientRect(); return y < b.top + b.height / 2; });
    if (slot < 0) slot = rows.length;
    const box = drag.row.parentElement.getBoundingClientRect();
    const above = rows[slot - 1]?.getBoundingClientRect();
    const below = rows[slot]?.getBoundingClientRect();
    const at = above && below ? (above.bottom + below.top) / 2 : above ? above.bottom + 3 : below.top - 3;
    drag.line.style.top = (at - box.top - 1.5) + 'px';
    drag.to = slot > drag.from ? slot - 1 : slot;
  };
  ed.on(ed.app, 'pointermove', (e) => { if (drag) place(e.clientY); });
  ed.on(ed.app, 'pointerup', () => stop(true));
  ed.on(ed.app, 'pointercancel', () => stop(false));
  ed.on(document, 'keydown', (e) => { if (e.key === 'Escape' && drag) { e.preventDefault(); stop(false); } });
}
