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

// Réseau absent : un message clair au lieu de celui du navigateur (« Failed to fetch », « Load failed »…).
export const OFFLINE = 'Pas de connexion. Rien n’est perdu : réessayez quand le réseau revient.';
export const SLOW = 'Le serveur ne répond pas. Réessayez.';
/** `fetch` dont l'échec réseau devient OFFLINE et le délai dépassé SLOW ; une annulation reste une annulation. */
export const request = (url, options) => fetch(url, options).catch((error) => {
  if (error.name === 'AbortError') throw error;
  throw new Error(error.name === 'TimeoutError' ? SLOW : OFFLINE);
});
/** Le signal de l'éditeur, avec un délai maximal : un réseau mobile muet ne bloque pas l'enregistrement. */
export const within = (signal, ms = 30000) => AbortSignal.any([signal, AbortSignal.timeout(ms)]);
/** Texte d'erreur du serveur : court, il est gardé ; une page HTML ou un long texte → « Erreur du serveur (500). ». */
export const serverText = (r, text) => {
  const t = text.trim();
  return t && t.length <= 200 && !t.startsWith('<') ? t : `Erreur du serveur (${r.status}).`;
};
