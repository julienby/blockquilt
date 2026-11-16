// Le document : état (frontmatter, blocs), lecture de l'écran, texte complet, enregistrement, messages.
export function installDocument(ed) {
  const { o, $, saveBtn, titleEl, iconBtn, toastEl } = ed;

  ed.toast = (text) => {
    toastEl.textContent = text;
    toastEl.classList.remove('opacity-0');
    clearTimeout(ed.toast.timer);
    ed.toast.timer = ed.later(() => toastEl.classList.add('opacity-0'), 1800);
  };

  // ---- État enregistré / à enregistrer ----
  ed.setDirty = (value) => {
    ed.dirty = value;
    $('[data-dot]', saveBtn).hidden = !value;
    saveBtn.classList.toggle('text-brand-700', value);
    saveBtn.classList.toggle('text-stone-400', !value);
    saveBtn.setAttribute('aria-label', value ? 'Enregistrer' : 'Enregistré');
  };
  ed.on(window, 'beforeunload', (e) => { if (ed.dirty) { e.preventDefault(); e.returnValue = ''; } });

  // ---- Titre et icône : dans le frontmatter ; les autres clés sont gardées dans leur ordre ----
  ed.showIcon = () => { iconBtn.textContent = ed.icon || '📄'; iconBtn.classList.toggle('grayscale', !ed.icon); };
  ed.docMeta = () => {
    const m = { ...ed.meta };
    if (!o.title) return m;
    const title = titleEl.textContent.replace(/\s+/g, ' ').trim();
    if (title) m.title = title; else delete m.title;
    if (ed.icon) m.icon = ed.icon; else delete m.icon;
    return m;
  };
  /** Remplace le document par { meta, blocks } (lu par Blocks.parse) ; un document vide reçoit un bloc texte. */
  ed.setDoc = ({ meta, blocks }) => {
    ed.meta = meta;
    ed.icon = meta.icon || '';
    titleEl.textContent = meta.title || '';
    ed.showIcon();
    const previous = ed.blocks.map((b) => ({ type: b.type, view: ed.views.get(b.id) }));
    ed.blocks = blocks.map((b) => ({ id: ed.newId(), ...b }));
    if (!ed.blocks.length) ed.blocks = [{ id: ed.newId(), ...Blocks.blank('text') }];
    ed.carryViews(previous);
  };

  // ---- Écran → modèle (avant tout nouveau dessin) ----
  ed.syncFromDom = () => {
    if (!ed.editing()) return;
    ed.app.querySelectorAll('[data-id]').forEach((card) => {
      const b = ed.blocks.find((x) => x.id === card.dataset.id);
      if (b) ed.editorOf(b).read(card, b);
    });
  };
  // En vue source, le document est le texte de la zone de saisie, tel quel.
  ed.markdown = () => {
    if (ed.mode === 'source' && ed.sourceArea()) return ed.sourceArea().value;
    ed.syncFromDom();
    return Blocks.serialize(ed.docMeta(), ed.blocks);
  };
  ed.load = (md) => { ed.setDoc(Blocks.parse(md)); ed.render(); };

  // ---- Envois au serveur : champs fixes (`fields`, ex. jeton CSRF) + champs de l'échange ----
  ed.form = (extra) => {
    const data = new FormData();
    for (const [k, v] of Object.entries({ ...o.fields, ...extra })) data.set(k, v);
    return data;
  };

  // ---- Enregistrer : onSave(markdown) ou saveUrl ----
  let saving = null;
  ed.save = async () => {
    if (saving) return saving;
    const text = ed.markdown();
    saving = (async () => {
      try {
        if (o.onSave) await o.onSave(text);
        else if (o.contentUrl) await ed.putContent(text);
        else if (o.saveUrl) {
          const r = await fetch(o.saveUrl, { method: 'POST', body: ed.form({ text }), headers: { Accept: 'application/json' }, signal: ed.ac.signal });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || 'Enregistrement impossible');
        } else throw new Error('Enregistrement non configuré');
        if (ed.markdown() === text) ed.setDirty(false);
        ed.toast('Enregistré');
        return true;
      } catch (error) {
        if (error.name !== 'AbortError') ed.toast(error.message);
        return false;
      } finally { saving = null; }
    })();
    return saving;
  };
}
