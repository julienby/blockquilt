// Affichage choisi par bloc ('edit' | 'preview' | 'collapsed') : jamais dans le Markdown.
// Gardé dans le navigateur (localStorage) si l'application donne `storageKey` ou `contentUrl`.
// Il suit le bloc, pas la place : l'état est réécrit à chaque dessin, dans l'ordre actuel des blocs.
export function installViews(ed) {
  const { o } = ed;
  const key = (o.storageKey ?? o.contentUrl) ? 'blockquilt.views.' + (o.storageKey ?? o.contentUrl) : null;
  ed.views = new Map();

  ed.persistViews = () => {
    if (!key || !ed.blocks) return;
    const list = ed.blocks.map((b) => [b.type, ed.views.get(b.id) || '']);
    try {
      if (list.some(([, view]) => view)) localStorage.setItem(key, JSON.stringify(list)); else localStorage.removeItem(key);
    } catch { /* stockage refusé : l'état reste en session */ }
  };
  const stored = () => { try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; } };

  /** Nouveaux blocs (setDoc) : ils reprennent l'affichage de l'ancien bloc de même place et de même type ; au premier chargement, celui du navigateur. */
  ed.carryViews = (previous) => {
    const list = previous.length || !key ? previous.map((b) => [b.type, b.view]) : stored();
    ed.views = new Map();
    ed.blocks.forEach((b, i) => { if (list[i]?.[0] === b.type && list[i][1]) ed.views.set(b.id, list[i][1]); });
  };
}
