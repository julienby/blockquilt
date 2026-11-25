// Sélecteur d'emoji : un seul sélecteur pour l'icône d'un encadré (id du bloc)
// et l'insertion dans le texte ({ field, range }). Bibliothèque emoji.json chargée au premier usage, « récents » en localStorage.
import { shared, esc, attr } from './shared.js';

let loading = null;
/** Charge emoji.json une fois pour toute la page (par défaut : à la racine de blockquilt, à côté de blockquilt-editor.js). */
export const emoji = (url) => {
  loading = loading || fetch(url || new URL('../emoji.json', import.meta.url)).then((r) => { if (!r.ok) throw new Error('emoji.json'); return r.json(); })
    .then((data) => { shared.emojiData = data; return data; })
    .catch((error) => { loading = null; throw error; });
  return loading;
};

const recent = () => { try { return JSON.parse(localStorage.getItem('blockquilt.emoji') || '[]'); } catch { return []; } };
const remember = (e) => { try { localStorage.setItem('blockquilt.emoji', JSON.stringify([e, ...recent().filter((x) => x !== e)].slice(0, 28))); } catch { /* stockage refusé */ } };
const fold = (x) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const button = (e) => `<button type="button" data-icon-pick="${attr(e[0])}" title="${attr(e[1])}" aria-label="${attr(e[1])}" class="flex aspect-square items-center justify-center rounded-xl text-[26px] leading-none hover:bg-stone-100 active:bg-stone-200">${esc(e[0])}</button>`;

export function installEmoji(ed) {
  const { o, $, sheets } = ed;
  const sheet = sheets.icon;
  const grid = $('[data-emoji-grid]', sheet);
  const tabs = $('[data-emoji-tabs]', sheet);
  const search = $('[data-emoji-search]', sheet);
  let target = null;
  let tab = 0;

  const setIcon = (value) => {
    if (typeof target === 'object') {
      const { field, range } = target;
      if (!value) return;
      field.focus();
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      document.execCommand('insertText', false, value);
      return;
    }
    ed.syncFromDom();
    const b = ed.blocks.find((x) => x.id === target);
    if (b) ed.change(() => { b.icon = value; });
  };
  ed.openIcon = (t) => {
    target = t;
    sheet.querySelector('h2').textContent = typeof t === 'object' ? 'Insérer un emoji' : 'Icône de l’encadré';
    $('[data-emoji-none]', sheet).hidden = typeof t === 'object';
    search.value = '';
    // Écran tactile : aucun champ ne garde le focus, le clavier se ferme et ne recouvre pas le sélecteur (la recherche reste à un toucher).
    const touch = matchMedia('(pointer: coarse)').matches;
    if (touch) document.activeElement?.blur?.();
    ed.openSheet('icon');
    if (touch) sheet.querySelector('h2').focus({ preventScroll: true });
    else search.focus({ preventScroll: true });
    emoji(o.emojiUrl).then(() => show(recent().length ? -1 : 0)).catch(() => {
      grid.innerHTML = '<p class="col-span-full p-3 text-sm text-stone-500">Bibliothèque indisponible : collez un emoji ci-dessous.</p>';
    });
  };
  const show = (t) => {
    const data = shared.emojiData;
    if (!data) return;
    tab = t;
    const cats = [['Récents', -1], ...data.categories.map((c, i) => [c, i])];
    tabs.innerHTML = cats.map(([c, i]) => `<button type="button" role="tab" data-emoji-tab="${i}" aria-selected="${i === t}" class="min-h-9 shrink-0 rounded-full px-3 text-xs font-bold text-stone-600 aria-selected:bg-stone-900 aria-selected:text-white">${esc(c)}</button>`).join('');
    const byChar = new Map(data.emoji.map((e) => [e[0], e]));
    const list = t === -1 ? recent().map((c) => byChar.get(c) || [c, c]) : data.emoji.filter((e) => e[e.length - 1] === t);
    grid.innerHTML = list.length ? list.map(button).join('') : '<p class="col-span-full p-3 text-sm text-stone-500">Aucun emoji récent.</p>';
  };
  ed.on(search, 'input', () => {
    const q = fold(search.value.trim());
    if (!q) return show(tab);
    const data = shared.emojiData;
    if (!data) return;
    // Nom exact, puis nom qui commence par la recherche, puis nom qui la contient, puis mots-clés.
    const rank = (x) => { const n = fold(x[1]); const k = typeof x[2] === 'string' ? fold(x[2]) : ''; return n === q ? 0 : n.startsWith(q) ? 1 : (' ' + n).includes(' ' + q) ? 2 : n.includes(q) ? 3 : k.split('|').some((w) => w.startsWith(q)) ? 4 : k.includes(q) ? 5 : 9; };
    const found = data.emoji.map((x) => [rank(x), x]).filter(([r]) => r < 9).sort((a, b) => a[0] - b[0]).slice(0, 140).map(([, x]) => x);
    tabs.querySelectorAll('[aria-selected]').forEach((x) => x.setAttribute('aria-selected', 'false'));
    grid.innerHTML = found.length ? found.map(button).join('') : '<p class="col-span-full p-3 text-sm text-stone-500">Aucun emoji trouvé.</p>';
  });
  ed.on(sheet, 'click', (e) => {
    const tabEl = e.target.closest('[data-emoji-tab]');
    if (tabEl) { search.value = ''; return show(Number(tabEl.dataset.emojiTab)); }
    const pick = e.target.closest('[data-icon-pick]');
    if (pick) { sheet.close(); if (pick.dataset.iconPick) remember(pick.dataset.iconPick); setIcon(pick.dataset.iconPick); return; }
    if (e.target.closest('[data-icon-use]')) {
      const input = $('[data-icon-input]', sheet);
      const picked = Blocks.firstEmoji(input.value);
      if (!picked) return ed.toast('Collez un emoji, par exemple 🏡');
      input.value = '';
      sheet.close();
      remember(picked);
      setIcon(picked);
    }
  });
  ed.on($('[data-icon-input]', sheet), 'keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('[data-icon-use]', sheet).click(); } });
}
