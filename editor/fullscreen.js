// Plein écran : un <dialog> modal qui couvre toute la fenêtre — l'éditeur entier, ou un bloc seul sans son habillage de carte.
// Pas de plein écran du navigateur : il impose son message « Pour quitter le plein écran… », gênant pour écrire.
// Largeur du texte : variable CSS --bq-width (option `width`, 48rem par défaut) ; en plein écran, un bouton fait le tour de trois largeurs.
import { ic } from './icons.js';
import { esc } from './shared.js';

const WIDTHS = [['40rem', 'étroite'], ['48rem', 'moyenne'], ['100%', 'pleine']];
// Blocs dont le plein écran offre l'IA sur leur texte (un seul champ de texte mis en forme). Les autres : IA par l'éditeur.
const FIELD_AI = ['text', 'quote', 't1', 't2', 't3', ...Blocks.CALLOUTS];

export function installFullscreen(ed) {
  const { app, element, editorFull, blockFull, inner, sheets, $ } = ed;

  // Clavier du téléphone : le navigateur rétrécit l'écran visible et le décale, sans réduire la page.
  // Le dialogue suit l'écran visible : son en-tête et ses premières lignes restent visibles. Pas au zoom (pincer).
  const fit = () => {
    const vv = window.visualViewport;
    for (const d of [blockFull, editorFull]) {
      const keyboard = d.open && vv && Math.abs(vv.scale - 1) < 0.01;
      d.style.top = keyboard ? vv.offsetTop + 'px' : '';
      d.style.height = keyboard ? vv.height + 'px' : '';
    }
  };
  ed.on(window.visualViewport, 'resize', fit);
  ed.on(window.visualViewport, 'scroll', fit);
  // Écran tactile : aucun champ ne prend le focus de lui-même, sinon le clavier s'ouvre et cache la moitié du texte.
  // On lit d'abord, puis on touche le texte à l'endroit voulu. À la souris, le curseur est mis dans le champ.
  const focusField = (el) => { if (!matchMedia('(pointer: coarse)').matches) el?.focus(); };
  const enter = (d) => {
    d.showModal();
    fit();
    app.querySelectorAll('[data-width]').forEach((w) => { w.hidden = false; });
  };
  const leave = () => {
    fit();
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
    if (mode === 'source' && !leaveSource()) return;
    const next = neighbour(fullId(), step);
    if (next) ed.openBlockFull(next.id);
  };
  // Rendu du bloc seul, comme dans l'aperçu et le visuel de l'éditeur.
  const blockRender = (b) => Blocks.toHtml(Blocks.toMarkdown(b), { media: ed.o.media });
  const body = $('[data-block-full-body]', blockFull);
  const fullId = () => body.dataset.fullId;
  const area = () => body.querySelector('[data-full-source-text]');
  const more = sheets.fullmore;
  // Vue du bloc seul, comme les vues de l'éditeur : edit | source | preview. Gardée d'un bloc à l'autre, remise à edit à la fermeture.
  let mode = 'edit';
  let many = 0; // source : nombre de blocs du texte tapé, s'il en fait plus d'un (un seul bloc ici)
  const manyText = () => `Ce texte fait ${many} blocs : un seul ici. Pour découper, utilisez « Scinder ».`;
  // Dessine le bloc dans le dialogue ; sa carte dans la page perd data-id. Renvoie false si le bloc n'existe plus.
  // Aperçu : le rendu à la place du champ (la carte reste, cachée : la lecture des blocs ne change pas).
  // Source : le Markdown du bloc, sans carte (la frappe change le bloc directement, voir readSource).
  // Visuel à côté (même réglage que l'en-tête) : le rendu à côté du champ ou de la source.
  const draw = (id) => {
    const b = ed.blocks.find((x) => x.id === id);
    const cardEl = ed.canvas.querySelector(`[data-id="${id}"], [data-away="${id}"]`);
    if (!b || !cardEl) return false;
    cardEl.removeAttribute('data-id');
    cardEl.dataset.away = id;
    const view = ed.viewOf(b) === 'collapsed' ? 'edit' : ed.viewOf(b); // le plein écran montre toujours le bloc en entier
    const tools = ed.tools(b, view) ? `<div class="-mt-2 mb-2 flex">${ed.tools(b, view)}</div>` : '';
    $('[data-block-full-label]', blockFull).textContent = ed.def(b).label;
    const text = fullId() === id && area() ? area().value : Blocks.toMarkdown(b); // un redessin garde le texte tapé
    const card = mode === 'source'
      ? `<div class="flex flex-col gap-2"><textarea data-full-source-text spellcheck="false" aria-label="Texte source du bloc (Markdown)" class="bq-source-text w-full rounded-xl border bg-transparent p-3 font-mono text-[13px] leading-6">${esc(text)}</textarea>
          <ul data-full-source-lint aria-live="polite" class="space-y-1 text-xs"></ul></div>`
      : `<div data-id="${id}" data-view="${view}" class="bq-focus"${mode === 'preview' ? ' hidden' : ''}>${tools}${ed.editorOf(b).edit(b, ed.ui)}</div>`;
    const render = `<div data-full-render aria-label="Visuel" class="min-w-0 overflow-auto${mode === 'preview' ? '' : ' rounded-xl border p-3 sm:p-4'}">${blockRender(b)}</div>`;
    const side = ed.sideBySide && mode !== 'preview';
    body.dataset.fullId = id;
    body.classList.toggle('bq-column', !side); // côte à côte : la largeur de deux colonnes (bq-panes)
    body.innerHTML = side ? `<div class="bq-panes mx-auto grid gap-3"><div class="min-w-0">${card}</div>${render}</div>` : mode === 'preview' ? card + render : card;
    if (mode === 'source') showLint();
    window.BlockquiltContent?.enhance(body);
    for (const [k, on] of [['source', mode === 'source'], ['preview', mode === 'preview'], ['visual', ed.sideBySide]]) {
      $(`[data-full-${k}]`, blockFull)?.setAttribute('aria-pressed', String(on)); // source absente avec sourceView: false
      $(`[data-full-act="${k}"]`, more)?.setAttribute('aria-pressed', String(on));
    }
    $('[data-full-visual]', blockFull).disabled = mode === 'preview';
    $('[data-full-act="visual"]', more).disabled = mode === 'preview';
    $('[data-full-prev]', blockFull).disabled = !neighbour(id, -1);
    $('[data-full-next]', blockFull).disabled = !neighbour(id, 1);
    for (const ai of [blockFull.querySelector('[data-full-ai]'), more.querySelector('[data-full-act="ai"]')]) if (ai) ai.hidden = !FIELD_AI.includes(b.type);
    return true;
  };
  // Après un redessin de la page (ordre ou retrait d'une photo…), le dialogue montre le bloc à jour.
  ed.redrawBlockFull = () => {
    const id = fullId();
    if (id && !draw(id)) blockFull.close();
  };

  // ---- Source du bloc : la frappe relit le texte ; un seul bloc remplace le bloc (son type peut changer) ----
  const showLint = () => {
    const problems = Blocks.lint(area().value);
    const li = (cls, text) => `<li class="rounded-lg px-2 py-1.5 ${cls}">${esc(text)}</li>`;
    body.querySelector('[data-full-source-lint]').innerHTML = (many ? li('bg-red-50 font-semibold text-red-800', manyText()) : '')
      + (problems.length ? problems.map((p) => li('bg-red-50 text-red-800', `Ligne ${p.line} : ${p.message}`)).join('')
        : many ? '' : li('opacity-60', 'Aucune alerte : l’éditeur relit tout le texte sans perte.'));
  };
  const readSource = () => {
    const id = fullId();
    const i = ed.blocks.findIndex((x) => x.id === id);
    const found = Blocks.parse(area().value).blocks.filter((x) => !Blocks.isEmpty(x));
    many = found.length > 1 ? found.length : 0;
    if (!many) {
      ed.blocks[i] = { id, ...(found[0] ?? Blocks.blank(ed.blocks[i].type)) };
      $('[data-block-full-label]', blockFull).textContent = ed.def(ed.blocks[i]).label;
    }
    showLint();
  };
  ed.on(blockFull, 'input', (e) => { if (e.target.matches('[data-full-source-text]')) readSource(); });
  // Quitter la source : refusé tant que le texte fait plusieurs blocs. Le bloc est déjà à jour : une étape d'annulation.
  const leaveSource = () => {
    if (many) { ed.toast(manyText()); focusField(area()); return false; }
    ed.checkpoint();
    return true;
  };
  const setMode = (next) => {
    if (next === mode) next = 'edit';
    if (mode === 'source' && !leaveSource()) return;
    ed.syncFromDom();
    mode = next;
    ed.redrawBlockFull();
    if (mode !== 'preview') focusField(body.querySelector('[contenteditable], textarea, input'));
  };
  ed.toggleBlockPreview = () => setMode('preview');
  ed.toggleBlockSource = () => setMode('source');
  ed.closeBlockFull = () => { if (mode !== 'source' || leaveSource()) blockFull.close(); };
  ed.on(blockFull, 'cancel', (e) => { if (mode === 'source' && many) { e.preventDefault(); leaveSource(); } });
  // Téléphone : Source, Aperçu, Visuel et IA dans le menu « ⋯ » de l'en-tête.
  ed.on(more, 'click', (e) => {
    const k = e.target.closest('[data-full-act]')?.dataset.fullAct;
    if (!k) return;
    more.close();
    ({ source: ed.toggleBlockSource, preview: ed.toggleBlockPreview, visual: ed.toggleSplit, ai: () => ed.openAiField(body.querySelector('[data-rich]')) })[k]();
  });
  // Le rendu suit la frappe (appelé avec le visuel de l'éditeur, 300 ms après la dernière touche).
  ed.refreshBlockRender = () => {
    const box = blockFull.querySelector('[data-full-render]');
    const b = ed.blocks.find((x) => x.id === fullId());
    if (!box || !b) return;
    box.innerHTML = blockRender(b);
    window.BlockquiltContent?.enhance(box);
  };
  ed.openBlockFull = (id) => {
    if (blockFull.open) ed.checkpoint(); // lit le bloc quitté dans le dialogue
    ed.syncFromDom();
    if (!draw(id)) return;
    blockFull.style.setProperty('--bq-width', app.style.getPropertyValue('--bq-width') || '');
    inner(blockFull).append(ed.bar, ed.toastEl.parentElement); // la barre et les messages doivent être dans la couche du dialogue
    if (!blockFull.open) enter(blockFull);
    focusField(blockFull.querySelector('[contenteditable], textarea, input'));
  };
  ed.on(blockFull, 'close', () => {
    app.append(ed.bar, ed.toastEl.parentElement);
    ed.hideBar();
    // Fermeture forcée (Annuler, autre version…) avec une source de plusieurs blocs : ils sont tous gardés, rien n'est perdu.
    // Bloc absent : un autre document a été chargé (setMarkdown, autre version) ; il n'est pas modifié.
    const i = ed.blocks.findIndex((x) => x.id === fullId());
    if (mode === 'source' && many && i >= 0) {
      ed.blocks.splice(i, 1, ...Blocks.parse(area().value).blocks.filter((x) => !Blocks.isEmpty(x)).map((x) => ({ id: ed.newId(), ...x })));
    }
    ed.checkpoint(); // lit le bloc dans le dialogue
    body.replaceChildren();
    delete body.dataset.fullId;
    mode = 'edit';
    many = 0;
    leave();
    ed.render();
  });
}
