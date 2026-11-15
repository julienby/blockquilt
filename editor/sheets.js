// Feuilles <dialog> : [data-close] ferme ; un toucher qui commence ET finit sur le fond ferme.
// Sur grand écran, un menu s'ouvre à côté du bouton qui l'appelle ; sur téléphone, en feuille du bas.
export function installSheets(ed) {
  ed.app.querySelectorAll('[data-sheet]').forEach((d) => { ed.sheets[d.dataset.sheet] = d; });
  const outside = (d, e) => { const r = d.getBoundingClientRect(); return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom; };
  let pressedBackdrop = false;
  Object.values(ed.sheets).forEach((d) => {
    ed.on(d, 'pointerdown', (e) => { pressedBackdrop = e.target === d && outside(d, e); });
    ed.on(d, 'click', (e) => {
      if (e.target.closest('[data-close]')) d.close();
      else if (pressedBackdrop && e.target === d && outside(d, e)) d.close();
      pressedBackdrop = false;
    });
  });
  ed.openSheet = (name, from) => {
    const d = ed.sheets[name];
    d.classList.remove('bq-pop');
    d.style.removeProperty('top');
    d.style.removeProperty('left');
    d.showModal();
    if (from && innerWidth >= 640) {
      const r = from.getBoundingClientRect();
      d.classList.add('bq-pop');
      const h = d.offsetHeight;
      const w = d.offsetWidth;
      d.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
      d.style.top = (r.bottom + h + 8 < innerHeight ? r.bottom + 4 : Math.max(8, r.top - h - 4)) + 'px';
    }
  };
}
