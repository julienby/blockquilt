// Annuler / rétablir : un instantané = le texte complet + la place du bloc actif.
// Pris avant et après chaque action de structure, et après 1 s sans frappe. 50 instantanés au plus.
const LIMIT = 50;

export function installHistory(ed) {
  let past = [];
  let future = [];
  let baseline = null;
  ed.typing = false; // frappe en cours, pas encore dans l'historique

  const snapshot = () => ({ md: ed.markdown(), active: Math.max(0, ed.blocks.findIndex((b) => b.id === ed.activeId)) });
  const updateButtons = () => {
    ed.app.querySelector('[data-undo]').disabled = !past.length && !ed.typing;
    ed.app.querySelector('[data-redo]').disabled = !future.length;
  };
  ed.checkpoint = () => {
    if (ed.mode === 'preview') return;
    clearTimeout(ed.checkpoint.timer);
    ed.typing = false;
    const cur = snapshot();
    if (baseline && cur.md !== baseline.md) {
      past.push(baseline);
      if (past.length > LIMIT) past.shift();
      future = [];
    }
    baseline = cur;
    updateButtons();
  };
  ed.typed = () => {
    ed.typing = true;
    clearTimeout(ed.checkpoint.timer);
    ed.checkpoint.timer = ed.later(ed.checkpoint, 1000);
    updateButtons();
  };
  const restore = (state) => {
    ed.setDoc(Blocks.parse(state.md)); // l'affichage choisi (replié, aperçu…) suit la place et le type
    ed.activeId = ed.blocks[Math.min(state.active, ed.blocks.length - 1)].id;
    ed.setDirty(true);
    ed.render();
    ed.canvas.querySelector(`[data-id="${ed.activeId}"]`)?.scrollIntoView({ block: 'nearest' });
    updateButtons();
  };
  ed.undo = () => {
    if (!ed.editing()) return false;
    if (ed.blockFull.open) ed.blockFull.close();
    ed.checkpoint();
    if (!past.length) return false;
    future.push(baseline);
    baseline = past.pop();
    restore(baseline);
    return true;
  };
  ed.redo = () => {
    if (!ed.editing() || !future.length) return false;
    if (ed.blockFull.open) ed.blockFull.close();
    past.push(baseline);
    baseline = future.pop();
    restore(baseline);
    return true;
  };
  ed.resetHistory = () => { past = []; future = []; baseline = null; ed.checkpoint(); };
}
