// Le document : état (frontmatter, blocs), lecture de l'écran, texte complet, enregistrement, messages.
import { request, within } from './shared.js';

export function installDocument(ed) {
  const { o, $, saveBtn, toastEl } = ed;

  ed.toast = (text) => {
    toastEl.textContent = text;
    toastEl.classList.remove('opacity-0');
    clearTimeout(ed.toast.timer);
    ed.toast.timer = ed.later(() => toastEl.classList.add('opacity-0'), 1800);
  };

  // ---- État enregistré / à enregistrer ----
  // Rien à enregistrer : les boutons Enregistrer sont inactifs. Le texte enregistré sert à Ctrl+Z (retour à l'état enregistré).
  // Brouillon : écrit 1 s après une modification ; effacé quand il n'y a plus rien à enregistrer,
  // sauf au chargement d'un texte (`loaded`) : le brouillon d'avant reste à proposer.
  // Deux boutons Enregistrer, un seul comportement : l'en-tête et le plein écran d'un bloc.
  const saveButtons = () => [saveBtn, $('[data-full-save]')];
  ed.setDirty = (value, { loaded = false } = {}) => {
    const changed = value !== ed.dirty;
    ed.dirty = value;
    if (!value) ed.savedText = ed.markdown();
    if (value) ed.draftLater();
    else if (!loaded) ed.dropDraft();
    for (const b of saveButtons()) {
      b.disabled = !value;
      $('[data-dot]', b).hidden = !value;
      b.classList.toggle('text-brand-700', value);
      b.setAttribute('aria-label', value ? 'Enregistrer' : 'Enregistré');
    }
    if (changed) ed.o.onDirty?.(value); // l'application suit l'état (save: false : son propre bouton Enregistrer)
  };

  // ---- Frontmatter : gardé tel quel, clés dans leur ordre. L'éditeur ne l'affiche pas ; l'application en fait des champs (getMeta, setMeta). ----
  ed.docMeta = () => ({ ...ed.meta });
  /** Remplace le frontmatter depuis l'éditeur (chargement, Ctrl+Z, vue source, IA) : onMeta le signale à l'application. */
  ed.setMeta = (meta) => {
    ed.meta = meta;
    o.onMeta?.({ ...meta });
  };
  /** Remplace le document par { meta, blocks } (lu par Blocks.parse) ; un document vide reçoit un bloc du premier type permis. */
  ed.setDoc = ({ meta, blocks }) => {
    ed.setMeta(meta);
    const previous = ed.blocks.map((b) => ({ type: b.type, view: ed.views.get(b.id) }));
    ed.blocks = blocks.map((b) => ({ id: ed.newId(), ...b }));
    if (!ed.blocks.length) ed.blocks = [ed.blank()];
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

  // Erreur d'enregistrement : un bandeau qui reste (pas une notification de 1,8 s), jusqu'au prochain succès ou « Fermer ».
  const errorBar = $('[data-save-error]');
  ed.saveError = (text) => {
    $('[data-save-error-text]', errorBar).textContent = text;
    errorBar.hidden = !text;
  };
  ed.on(errorBar, 'click', (e) => { if (e.target.closest('[data-save-error-close]')) ed.saveError(''); });

  // ---- Enregistrer : onSave(markdown) ou saveUrl ----
  let saving = null;
  ed.save = async () => {
    if (saving) return saving;
    if (ed.unread) { ed.saveError('Le texte n’a pas pu être lu : rien n’est enregistré.'); return false; } // sinon il remplacerait celui du serveur
    if (!ed.dirty) return true;
    ed.checkpoint(); // l'état enregistré est une étape de Ctrl+Z
    const text = ed.markdown();
    saving = (async () => {
      saveButtons().forEach((b) => b.setAttribute('aria-busy', 'true')); // l'attente se voit (jusqu'à 30 s sur un réseau muet)
      try {
        if (o.onSave) await o.onSave(text);
        else if (o.contentUrl) await ed.putContent(text);
        else if (o.saveUrl) {
          const r = await request(o.saveUrl, { method: 'POST', body: ed.form({ text }), headers: { Accept: 'application/json' }, signal: within(ed.ac.signal) });
          const j = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(j.error || 'Enregistrement impossible');
        } else throw new Error('Enregistrement non configuré');
        if (ed.markdown() === text) ed.setDirty(false);
        ed.saveError('');
        ed.toast('Enregistré');
        return true;
      } catch (error) {
        if (error.name === 'AbortError') return false;
        if (error.conflict) ed.toast(error.message); // la feuille du conflit est ouverte : elle suffit
        else ed.saveError(error.message);
        return false;
      } finally { saving = null; saveButtons().forEach((b) => b.removeAttribute('aria-busy')); }
    })();
    return saving;
  };
}
