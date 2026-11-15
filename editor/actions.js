// Actions de structure (ajouter, déplacer, fusionner, scinder, convertir, supprimer), menu d'ajout, menu « ⋯ », copier / coller.
import { ic } from './icons.js';
import { shared, esc } from './shared.js';
import { GROUPS, item } from './template.js';

export function installActions(ed) {
  const { o, $, canvas, sheets } = ed;

  // Toute action de structure passe ici : un instantané avant, un après (annulable par Ctrl+Z).
  ed.change = (fn) => { ed.checkpoint(); fn(); ed.setDirty(true); ed.render(); ed.checkpoint(); };
  ed.add = (type, at, extra = {}) => {
    const b = { id: ed.newId(), ...Blocks.blank(type), ...extra };
    ed.change(() => ed.blocks.splice(at === null || at > ed.blocks.length ? ed.blocks.length : at, 0, b));
    canvas.querySelector(`[data-id="${b.id}"]`)?.classList.add('bq-new');
    ed.focusCard(b.id);
    return b;
  };
  // Après un déplacement, le focus reste sur le bouton utilisé (chevron ou poignée) de la carte déplacée.
  ed.move = (id, to, focus = '[data-grip]') => {
    const i = ed.blocks.findIndex((b) => b.id === id);
    if (i < 0 || to < 0 || to >= ed.blocks.length || to === i) return;
    ed.change(() => ed.blocks.splice(to, 0, ...ed.blocks.splice(i, 1)));
    const cardEl = canvas.querySelector(`[data-id="${id}"]`);
    (cardEl?.querySelector(`${focus}:not(:disabled)`) || cardEl?.querySelector('[data-grip]'))?.focus({ preventScroll: true });
    cardEl?.scrollIntoView({ block: 'nearest' });
  };
  ed.merge = (index) => {
    ed.syncFromDom();
    const fused = Blocks.merge(ed.blocks[index - 1], ed.blocks[index]);
    if (!fused) return;
    ed.change(() => ed.blocks.splice(index - 1, 2, fused));
    ed.toast('Blocs fusionnés');
  };
  ed.remove = (id) => { ed.change(() => { ed.blocks = ed.blocks.filter((b) => b.id !== id); }); ed.toast('Bloc supprimé'); };
  ed.convert = (id, type) => {
    const i = ed.blocks.findIndex((b) => b.id === id);
    ed.change(() => { ed.blocks[i] = { id, ...Blocks.convert(ed.blocks[i], type) }; });
    ed.toast('Converti en ' + Blocks.def(type).label);
  };
  /** Champ riche (mise en forme permise) qui contient `node`. */
  ed.richOf = (node) => (node && (node.nodeType === 1 ? node : node.parentElement))?.closest('.bq-edit[data-rich]');
  // Coupe le bloc au curseur : ce qui suit part dans un nouveau bloc du même type, juste en dessous.
  ed.split = (range) => {
    const field = ed.richOf(range.startContainer);
    const id = field?.closest('[data-id]')?.dataset.id;
    if (!id) return;
    const tail = document.createRange();
    tail.setStart(range.startContainer, range.startOffset);
    tail.setEnd(field, field.childNodes.length);
    const box = document.createElement('div');
    box.append(tail.extractContents());
    ed.syncFromDom();
    const i = ed.blocks.findIndex((b) => b.id === id);
    const nb = { ...ed.blocks[i], id: ed.newId(), html: box.innerHTML, ...('title' in ed.blocks[i] ? { title: '', icon: '' } : {}) };
    ed.change(() => ed.blocks.splice(i + 1, 0, nb));
    ed.hideBar();
    ed.focusCard(nb.id);
    ed.toast('Bloc scindé');
  };

  // ---- Menu d'ajout : construit depuis le registre à chaque ouverture ----
  let insertAt = null; // null = en bas
  ed.openAdd = (at) => {
    ed.syncFromDom();
    insertAt = at;
    const groups = {};
    for (const k of Blocks.order) {
      const t = Blocks.types[k];
      if (t.group === 'none' || t.hidden || (k === 'html' && !o.html)) continue;
      (groups[t.group] = groups[t.group] || []).push(k);
    }
    $('[data-add-list]', sheets.add).innerHTML = Object.entries(groups).map(([g, keys]) => `<p class="mb-1 mt-3 px-1 text-[11px] font-bold uppercase tracking-wider text-stone-400 first:mt-0">${esc(GROUPS[g] || g)}</p>
      <div class="grid grid-cols-2 gap-1.5 sm:grid-cols-3">${keys.map((k) => `<button type="button" data-pick="${k}" class="flex min-h-11 items-center gap-2 rounded-xl border px-2.5 text-left text-sm font-semibold ${Blocks.types[k].tone.card}">
        <span class="flex size-7 shrink-0 items-center justify-center rounded-lg border ${Blocks.types[k].tone.badge}">${ic(Blocks.types[k].icon, 'size-4')}</span><span class="min-w-0 truncate">${esc(Blocks.types[k].label)}</span></button>`).join('')}</div>`).join('');
    ed.openSheet('add');
  };
  ed.on(sheets.add, 'click', (e) => {
    const pick = e.target.closest('[data-pick]');
    if (!pick) return;
    sheets.add.close();
    const type = pick.dataset.pick;
    if (type === 'photo' || type === 'carousel') return ed.pickFiles({ type, at: insertAt });
    ed.add(type, insertAt);
  });

  // ---- Menu du bloc « ⋯ » : le type, l'ordre, le plein écran et la suppression ont leur bouton sur la carte ----
  let menuId = null;
  ed.openMenu = (id, from) => {
    ed.syncFromDom();
    menuId = id;
    const b = ed.blocks.find((x) => x.id === id);
    sheets.menu.setAttribute('aria-label', 'Actions du bloc ' + ed.def(b).label);
    $('[data-menu-list]', sheets.menu).innerHTML = item('data-act="duplicate"', 'duplicate', 'Dupliquer')
      + item('data-act="copy"', 'copy', 'Copier')
      + item('data-act="paste-above"', 'paste', 'Coller au-dessus')
      + item('data-act="paste"', 'paste', 'Coller dessous')
      + (o.aiUrl ? item('data-act="ai"', 'wand', 'IA sur ce bloc', 'text-amber-800') : '');
    ed.openSheet('menu', from);
  };
  ed.on(sheets.menu, 'click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    sheets.menu.close();
    const id = menuId;
    const i = ed.blocks.findIndex((b) => b.id === id);
    if (i < 0) return;
    if (act === 'duplicate') { const copy = { ...structuredClone(ed.blocks[i]), id: ed.newId() }; ed.change(() => ed.blocks.splice(i + 1, 0, copy)); ed.toast('Bloc dupliqué'); }
    else if (act === 'copy') { copyText(Blocks.toMarkdown(ed.blocks[i])); ed.toast('Bloc copié'); }
    else if (act === 'paste' || act === 'paste-above') paste(id, act === 'paste' ? 1 : 0);
    else if (act === 'ai') ed.openAi(id);
  });

  // ---- Suppression, avec confirmation ----
  ed.askDelete = (id) => {
    ed.syncFromDom();
    menuId = id;
    const b = ed.blocks.find((x) => x.id === id);
    if (!b) return;
    const text = Blocks.stripTags(Blocks.toMarkdown(b)).replace(/\n/g, ' • ').trim();
    $('[data-del-preview]', sheets.delete).textContent = text ? `« ${text.slice(0, 160)}${text.length > 160 ? '…' : ''} »` : '(Bloc vide)';
    ed.openSheet('delete');
  };
  ed.on(sheets.delete, 'click', (e) => {
    if (!e.target.closest('[data-del-confirm]')) return;
    sheets.delete.close();
    ed.remove(menuId);
  });

  // ---- Copier / coller un bloc : du Markdown, découpé en blocs par Blocks.parse ----
  const copyText = (text) => {
    shared.clipboard = text;
    navigator.clipboard?.writeText(text).catch(() => {});
  };
  const paste = async (id, offset) => {
    let text = '';
    try { text = await navigator.clipboard.readText(); } catch { /* refusé : copie interne */ }
    if (!text.trim()) text = shared.clipboard || '';
    const parsed = Blocks.parse(text).blocks.filter((b) => !Blocks.isEmpty(b));
    if (!parsed.length) return ed.toast('Presse-papiers vide');
    const i = ed.blocks.findIndex((b) => b.id === id);
    const fresh = parsed.map((b) => ({ id: ed.newId(), ...b }));
    ed.change(() => ed.blocks.splice(i + offset, 0, ...fresh));
    ed.toast(fresh.length > 1 ? `${fresh.length} blocs collés` : 'Bloc collé');
  };
}
