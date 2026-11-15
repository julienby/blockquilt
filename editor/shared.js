// État partagé par tous les éditeurs d'une page ; c'est aussi l'objet public window.Blockquilt.
export const shared = {
  clipboard: '', // dernier texte copié (secours quand le presse-papiers du système est refusé)
  emojiData: null, // emoji.json, une fois chargé
};
export const esc = (s) => Blocks.esc(s);
export const attr = (s) => Blocks.attr(s);
