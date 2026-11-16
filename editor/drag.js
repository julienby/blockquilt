// Glisser-déposer par la poignée : la carte reste à sa place (estompée), une copie suit le doigt,
// un trait bleu marque l'arrivée ; l'ordre ne change qu'au lâcher, Échap annule.
export function installDrag(ed) {
  const { app, canvas, editorFull, inner } = ed;
  let drag = null;
  ed.dragging = () => drag !== null;

  const scroller = () => (editorFull.open ? inner(editorFull) : document.scrollingElement);
  const dropAt = (y) => {
    const list = [...canvas.querySelectorAll('[data-id]')];
    let slot = list.findIndex((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
    if (slot < 0) slot = list.length;
    const box = drag.line.parentElement.getBoundingClientRect();
    const above = list[slot - 1]?.getBoundingClientRect();
    const below = list[slot]?.getBoundingClientRect();
    const at = above && below ? (above.bottom + below.top) / 2 : above ? above.bottom + 6 : below.top - 6;
    drag.line.style.top = (at - box.top - 1.5) + 'px';
    return slot > drag.origin ? slot - 1 : slot;
  };
  const dragMove = () => {
    drag.ghost.style.top = (drag.y - drag.dy) + 'px';
    drag.target = dropAt(drag.y);
  };
  ed.dragEnd = (commit) => {
    if (!drag) return;
    const { id, target, origin } = drag;
    cancelAnimationFrame(drag.raf);
    drag.ghost.remove();
    drag.line.remove();
    drag.card.classList.remove('bq-origin');
    app.classList.remove('bq-dragging');
    drag = null;
    if (commit && target !== origin) ed.move(id, target);
  };
  ed.on(app, 'pointerdown', (e) => {
    const grip = e.target.closest('[data-grip]');
    if (!grip || !canvas.contains(grip) || e.button !== 0 || !ed.editing()) return;
    e.preventDefault();
    ed.syncFromDom();
    const cardEl = grip.closest('[data-id]');
    const r = cardEl.getBoundingClientRect();
    const ghost = cardEl.cloneNode(true);
    ghost.removeAttribute('data-id');
    ghost.inert = true;
    ghost.className += ' bq-ghost';
    Object.assign(ghost.style, { left: r.left + 'px', width: r.width + 'px', top: r.top + 'px' });
    const line = document.createElement('div');
    line.className = 'bq-drop';
    canvas.querySelector('.bq-column').append(line);
    app.append(ghost);
    cardEl.classList.add('bq-origin');
    app.classList.add('bq-dragging');
    const origin = ed.blocks.findIndex((b) => b.id === cardEl.dataset.id);
    drag = { id: cardEl.dataset.id, card: cardEl, ghost, line, origin, target: origin, y: e.clientY, dy: e.clientY - r.top };
    grip.setPointerCapture(e.pointerId);
    dragMove();
    // Défilement automatique près du haut ou du bas de l'écran.
    const tick = () => {
      if (!drag) return;
      const edge = 64;
      const speed = drag.y < edge ? -(edge - drag.y) / 3 : drag.y > innerHeight - edge ? (drag.y - innerHeight + edge) / 3 : 0;
      if (speed) { scroller().scrollTop += speed; dragMove(); }
      drag.raf = requestAnimationFrame(tick);
    };
    drag.raf = requestAnimationFrame(tick);
  });
  ed.on(app, 'pointermove', (e) => { if (drag) { drag.y = e.clientY; dragMove(); } });
  ed.on(app, 'pointerup', () => ed.dragEnd(true));
  ed.on(app, 'pointercancel', () => ed.dragEnd(false));
}
