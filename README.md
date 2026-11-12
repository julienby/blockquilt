# blockquilt

Éditeur de texte par blocs. Le stockage est du Markdown. La personne qui écrit voit des blocs (texte, titre, astuce, conseil, consigne, liste, photo, vidéo), jamais de Markdown. Les blocs se cousent et se décousent : on les fusionne, on les scinde, on les déplace.

blockquilt vient de l'éditeur de rubrique d'easyHomeGuide. Il est extrait tel quel de `~/apps/easyhomeguide` (commit `07ec88a`). easyHomeGuide garde sa propre copie : les deux évoluent séparément.

## Essayer

```sh
docker compose up                 # démo sur http://localhost:8080/
docker compose run --rm check     # tests Node + essai dans Chromium ; exit ≠ 0 si rouge
```

La démo enregistre pour de vrai : le document va dans `dev/data/document.md`, et les photos dans `dev/data/media/`. Pour repartir de zéro, supprime `dev/data/`.

Sans Docker : `node dev/server.js` (Node 22), puis `node tests/blocks_test.cjs`.

## Fichiers

| Fichier | Rôle |
|---|---|
| `blockquilt.js` | Le noyau `Blocks` (fonctions pures : Markdown ⇄ blocs, conversion, fusion, rendu invité `Blocks.toHtml`), puis l'écran (actif si la page contient `#bq`). |
| `index.html` | Démo : la vue de l'éditeur rendue par le serveur d'easyHomeGuide, avec une rubrique d'exemple. |
| `blockquilt.css` | CSS généré par Tailwind 3.4.17. Ne pas le modifier à la main. |
| `blockquilt.src.css`, `tailwind.config.js`, `build-css` | Source du CSS. Lancer `./build-css` après tout changement de classes dans `index.html` ou `blockquilt.js`. |
| `fonts/` | Plus Jakarta Sans et Newsreader, hébergées. Licence SIL OFL 1.1 (fichiers `OFL-*.txt`). |
| `tests/blocks_test.cjs` | Test Node du noyau `Blocks`. |
| `dev/server.js` | Serveur de démo et de test, Node seul : sert les fichiers et imite les échanges ci-dessous. |
| `dev/check.mjs`, `dev/Dockerfile.check` | Essai navigateur : Chromium headless piloté en CDP. Il charge la démo, fusionne, scinde, envoie une photo, enregistre, relit `document.md`, recharge la page et ouvre l'aperçu. |

## Échanges avec le serveur

Les adresses sont lues sur `#bq` (`data-save`, `data-preview`, `data-upload`, `data-media`). Ce sont les échanges actuels, hérités d'easyHomeGuide.

| Action | Requête | Champs envoyés | Réponse attendue |
|---|---|---|---|
| Enregistrer | `POST` `data-save`, en-tête `Accept: application/json` | `_csrf`, `slug`, `text` (Markdown complet, première ligne `## icône Titre`) | JSON `{"slug": "…"}`, ou `{"error": "…"}` avec un code 422. Si le slug change, l'adresse devient `data-save/<slug>`. |
| Aperçu invité (facultatif) | `POST` `data-preview`, en-tête `HX-Request: true` | `_csrf`, `text` (sans la ligne de titre) | Fragment HTML du rendu. Sans `data-preview`, l'éditeur rend lui-même avec `Blocks.toHtml` (photos, encadrés 💡 🧭 ⚠️, titres, vidéos) ; le serveur de démo répond avec ce même rendu. |
| Photo | `POST` `data-upload`, en-tête `Accept: application/json` | `_csrf`, `photo` (fichier) | JSON `{"id": "…"}`. L'image est lue à `data-media` + `id`. |

Attention : les champs partent en `multipart/form-data`, donc les fins de ligne de `text` arrivent en `\r\n`. Le serveur doit les remettre en `\n` (voir `dev/server.js`).

## Liens qui restent avec easyHomeGuide

Ce sont les points à reprendre pour faire de blockquilt un produit facile à intégrer :

- les types de blocs, leurs textes en français et leurs classes Tailwind sont écrits dans `Blocks.TYPES` (`blockquilt.js`) ;
- le titre `## icône Titre` est propre aux rubriques ;
- les échanges en JSON par `fetch` (enregistrer, photo) ;
- l'identifiant `#bq` et les classes `bq-*` ;
- dans l'app, l'en-tête de l'éditeur porte `md:top-[61px]` (hauteur de la barre de l'app). Ce décalage est retiré de `index.html`.

## Licence

MIT (voir `LICENSE`). Les polices de `fonts/` restent sous leur propre licence, SIL OFL 1.1. `emoji.json` est tiré des données Unicode (`emoji-test.txt`) et CLDR (annotations françaises), sous la licence Unicode (Unicode License v3, https://www.unicode.org/license.txt) ; il est fabriqué par `dev/build-emoji.mjs`.
