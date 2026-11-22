// État partagé par tous les éditeurs d'une page ; c'est aussi l'objet public window.Blockquilt.
export const shared = {
  clipboard: '', // dernier texte copié (secours quand le presse-papiers du système est refusé)
  emojiData: null, // emoji.json, une fois chargé
};
export const esc = (s) => Blocks.esc(s);
export const attr = (s) => Blocks.attr(s);

// « il y a 3 min » : la date d'une version ou d'un brouillon.
export const ago = (date) => {
  const s = Math.max(0, Math.round((Date.now() - date) / 1000));
  if (!Number.isFinite(s)) return '';
  if (s < 45) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60) || 1} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return 'le ' + new Date(date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
};
