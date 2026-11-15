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
      if (t.add) {
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

  // Carrousel : flèches (avancer / reculer d'une place), corbeille, tuile « Ajouter des photos ».
  ed.carousel = (el, id) => {
    const b = ed.blocks.find((x) => x.id === id);
    if (el.closest('[data-car-add]')) return ed.pickFiles({ add: id });
    const i = Number(el.closest('[data-car-item]').dataset.carItem);
    const act = el.closest('[data-car-act]').dataset.carAct;
    ed.syncFromDom();
    const j = act === 'left' ? i - 1 : i + 1;
    ed.change(() => { if (act === 'remove') b.items.splice(i, 1); else [b.items[i], b.items[j]] = [b.items[j], b.items[i]]; });
    canvas.querySelector(`[data-id="${id}"] [data-car-item="${act === 'remove' ? Math.max(0, i - 1) : j}"] [data-car-act="${act}"]`)?.focus({ preventScroll: true });
  };
}
