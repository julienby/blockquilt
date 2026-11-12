# Décisions

Une ligne par arbitrage : date, choix, pourquoi, alternative écartée.

- 2026-11-12 — Nom : blockquilt (des blocs cousus en un seul texte, libre sur npm et GitHub). Écartés : blockpen, blockquill, blockstitch, blocmark.
- 2026-11-12 — Extraction telle quelle de l'éditeur de rubrique d'easyHomeGuide (commit `07ec88a`) ; easyHomeGuide garde sa copie. Écarté : le hub stackfast (plus tard, peut-être).
- 2026-11-12 — Docker : `node:22-alpine` pour la démo, `node:22-slim` + Chromium (paquet Debian) pour la validation. Aucune dépendance npm : serveur avec `node:http`, multipart lu par `Request.formData()`, CDP par le `WebSocket` intégré à Node 22. Écartés : Puppeteer/Playwright (dépendances lourdes), une démo sans serveur (enregistrer et photo non testables).
- 2026-11-12 — Polices Plus Jakarta Sans et Newsreader livrées avec leur licence SIL OFL 1.1 (`fonts/OFL-*.txt`), le dépôt étant public.
