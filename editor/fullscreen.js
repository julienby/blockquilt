// Plein écran : un <dialog> modal qui couvre toute la fenêtre — l'éditeur entier, ou un bloc seul sans son habillage de carte.
// Pas de plein écran du navigateur : il impose son message « Pour quitter le plein écran… », gênant pour écrire.
// Largeur du texte : variable CSS --bq-width (option `width`, 48rem par défaut) ; en plein écran, un bouton fait le tour de trois largeurs.
import { ic } from './icons.js';

const WIDTHS = [['40rem', 'étroite'], ['48rem', 'moyenne'], ['100%', 'pleine']];

export function installFullscreen(ed) {
  const { app, element, editorFull, blockFull, inner, sheets, $ } = ed;

  const enter = (d) => {
    d.showModal();
    app.querySelectorAll('[data-width]').forEach((w) => { w.hidden = false; });
  };
  const leave = () => {
    app.querySelectorAll('[data-head] [data-width]').forEach((w) => { w.hidden = !editorFull.open; });
  };
  ed.cycleWidth = () => {
    const now = app.style.getPropertyValue('--bq-width') || '48rem';
    const next = WIDTHS[(WIDTHS.findIndex(([w]) => w === now) + 1) % WIDTHS.length];
    app.style.setProperty('--bq-width', next[0]);
    blockFull.style.setProperty('--bq-width', next[0]);
    ed.toast('Largeur ' + next[1]);
  };

  // ---- Éditeur entier : déplacé dans le dialogue ; l'icône « réduire » reste dans la barre du haut, sur téléphone aussi ----
  const setFullButton = (full) => {
    const b = app.querySelector('[data-full]');
    b.classList.toggle('hidden', !full);
    b.setAttribute('aria-label', full ? 'Quitter le plein écran' : 'Plein écran');
    b.title = b.getAttribute('aria-label');
    b.innerHTML = ic(full ? 'minimize' : 'maximize');
    sheets.more.querySelector('[data-more-act="full"]').innerHTML = ic(full ? 'minimize' : 'maximize') + `<span class="min-w-0 flex-1 truncate">${full ? 'Quitter le plein écran' : 'Plein écran'}</span>`;
  };
  ed.toggleEditorFull = () => {
    if (editorFull.open) return editorFull.close();
    inner(editorFull).append(app);
    enter(editorFull);
    setFullButton(true);
  };
  ed.on(editorFull, 'close', () => {
    element.prepend(app);
    setFullButton(false);
    leave();
    ed.placeBar();
  });
  // Échap pendant un glissement : annule le glissement, ne ferme pas le plein écran.
  ed.on(editorFull, 'cancel', (e) => { if (ed.dragging() || ed.photoDragging()) e.preventDefault(); });

  // ---- Bloc seul : redessiné dans le dialogue ; sa carte, restée dans la page, perd data-id le temps de l'édition ----
  const canFull = (b) => ed.def(b).fullscreen !== false;
  const neighbour = (id, step) => {
    for (let i = ed.blocks.findIndex((b) => b.id === id) + step; ed.blocks[i]; i += step) if (canFull(ed.blocks[i])) return ed.blocks[i];
  };
  ed.stepBlockFull = (step) => {
    const next = neighbour(blockFull.querySelector('[data-id]').dataset.id, step);
    if (next) ed.openBlockFull(next.id);
  };
  // Dessine le bloc dans le dialogue ; sa carte dans la page perd data-id. Renvoie false si le bloc n'existe plus.
  const draw = (id) => {
    const b = ed.blocks.find((x) => x.id === id);
    const cardEl = ed.canvas.querySelector(`[data-id="${id}"], [data-away="${id}"]`);
    if (!b || !cardEl) return false;
    cardEl.removeAttribute('data-id');
    cardEl.dataset.away = id;
    const view = ed.viewOf(b) === 'collapsed' ? 'edit' : ed.viewOf(b); // le plein écran montre toujours le bloc en entier
    const tools = ed.tools(b, view) ? `<div class="-mt-2 mb-2 flex">${ed.tools(b, view)}</div>` : '';
    $('[data-block-full-label]', blockFull).textContent = ed.def(b).label;
    $('[data-block-full-body]', blockFull).innerHTML = `<div data-id="${id}" data-view="${view}" class="bq-focus">${tools}${ed.editorOf(b).edit(b, ed.ui)}</div>`;
    $('[data-full-prev]', blockFull).disabled = !neighbour(id, -1);
    $('[data-full-next]', blockFull).disabled = !neighbour(id, 1);
    return true;
  };
  // Après un redessin de la page (ordre ou retrait d'une photo…), le dialogue montre le bloc à jour.
  ed.redrawBlockFull = () => {
    const id = blockFull.querySelector('[data-block-full-body] [data-id]')?.dataset.id;
    if (id && !draw(id)) blockFull.close();
  };
  ed.openBlockFull = (id) => {
    if (blockFull.open) ed.checkpoint(); // lit le bloc quitté dans le dialogue
    ed.syncFromDom();
    if (!draw(id)) return;
    blockFull.style.setProperty('--bq-width', app.style.getPropertyValue('--bq-width') || '');
    inner(blockFull).append(ed.bar, ed.toastEl.parentElement); // la barre et les messages doivent être dans la couche du dialogue
    if (!blockFull.open) enter(blockFull);
    blockFull.querySelector('[contenteditable], textarea, input')?.focus();
  };
  ed.on(blockFull, 'close', () => {
    app.append(ed.bar, ed.toastEl.parentElement);
    ed.hideBar();
    ed.checkpoint(); // lit le bloc dans le dialogue
    $('[data-block-full-body]', blockFull).replaceChildren();
    leave();
    ed.render();
  });
}
