# Plan

Destinataire : le modèle qui implémente. Lire d'abord `README.md`, `FORMAT.md`, `DECISIONS.md`, `AMELIORATIONS.md`, puis `blockquilt.js` et `blockquilt-editor.js`.

## 1. Cap

blockquilt est un éditeur de contenu web **générique** (pages d'application, articles, posts, notes), qu'on intègre dans n'importe quelle application.

1. **Le texte est la source.** Un seul format : Markdown + frontmatter + blocs sémantiques (`FORMAT.md`). Lisible, modifiable à la main, relu sans perte.
2. **Un bloc = une entrée de registre** (`Blocks.register`) : lecture, écriture, rendu HTML, carte d'édition au même endroit.
3. **Mobile d'abord.** Chaque écran est conçu et testé à 375 px, puis élargi.
4. **IA d'abord.** Une IA doit pouvoir lire, produire et modifier le contenu, sur tout le document ou sur un bloc, depuis l'éditeur ou de l'extérieur (§5).
5. **Neutre.** L'éditeur s'intègre dans l'application qui l'accueille sans imposer sa mise en forme (§4, E2).

## 2. Règles permanentes

- Aucune dépendance npm, aucune étape de build pour le JS (Tailwind reste pour le CSS de l'éditeur, via `./build-css`).
- Ne jamais abîmer un texte : ce que l'éditeur ne sait pas refaire à l'identique reste un bloc « texte source » (`raw`).
- Une action = un seul endroit dans l'interface.
- Chaque tâche se termine par `docker compose run --rm check` vert (code de sortie 0), puis un commit. Pas de tâche suivante sur du rouge.
- Chaque comportement nouveau a son test : noyau dans `tests/blocks_test.cjs`, écran dans `dev/check.mjs` (Chromium, 375 px et 1280 px).
- Chaque arbitrage : une ligne dans `DECISIONS.md`.
- Textes de l'interface en français.
- Après toute modification du code : `docker compose -f docker-compose.web.yml restart` pour la démo publique.

## 3. Fait

Le détail est dans `git log` et `DECISIONS.md`.

- **Phases 0 à 10** (plan d'origine) : épuration, registre de blocs, format pivot et HTML sémantique, `Blockquilt.mount`, interactions (annuler, Ctrl+S, barre, menus, glisser-déposer, plein écran), emoji, carrousel, bloc HTML filtré, IA par `aiUrl`, accessibilité et parcours au clavier.
- **Evol2** : colonne monter / poignée / descendre, boutons ronds menu / plein écran / supprimer, menu « ⋯ » réduit, intervalles aérés, insertion au début, bordures des titres, listes à plusieurs niveaux, presse-papiers dans la barre, œil du bloc HTML, plein écran reconstruit, largeur réglable.
- **Retours suivants** : titre du document facultatif, menus d'actions sans titre, plein écran sans celui du navigateur, icônes « réduire », clavier fermé à l'ouverture du sélecteur d'emoji, carrousel à flèches et puces, blocs H1 et texte en grand T1 / T2 / T3, éditeur sans notion d'« hôte ».

## 4. Evol 3 — tâches

Chaque tâche : test, `check` vert, commit, ligne dans `DECISIONS.md`.

- [x] **E1 Titres centrés.** Dans une carte H1, H2, H3 ou T1–T3, le texte est centré verticalement dans la hauteur donnée par la colonne de droite (aujourd'hui collé sous le badge). Vérifier : écart haut ≈ écart bas (± 4 px) entre le texte et la zone sous le badge.
- [x] **E2 Intégration neutre.** L'éditeur prend l'apparence de l'application qui l'accueille.
  - Police héritée de la page (`font-family: inherit`) ; Plus Jakarta Sans seulement pour la démo.
  - Couleurs et formes en variables CSS documentées (`--bq-accent`, `--bq-surface`, `--bq-border`, `--bq-radius`…), valeurs par défaut sobres.
  - Pas de fond ni d'ombre imposés autour de l'éditeur ; décalage de l'en-tête collant réglable (`--bq-sticky-top`) pour une application qui a déjà sa barre.
  - Vérifier : monté dans une page à police et couleur d'accent différentes, l'éditeur les reprend.
- [x] **E3 Vue « source ».** Un mode à côté de « Édition » et « Aperçu » : le texte Markdown complet dans une zone de texte.
  - Contrôle `Blocks.lint` en direct, ligne par ligne.
  - Aperçu à côté sur grand écran, bascule source / aperçu sur téléphone.
  - Utilisable en plein écran (espace d'écriture total).
  - Retour en édition : le texte est relu en blocs, en une étape annulable (Ctrl+Z).
- [x] **E4 Code lisible.** En aperçu et dans le rendu publié, un bloc de code va à la ligne (`white-space: pre-wrap`) au lieu d'un défilement horizontal ; même chose pour un bloc « texte source ».
- [x] **E5 Carrousel, édition.** La bande de vignettes défilante est remplacée par une grille (2 colonnes à 375 px, 3 à 4 au-delà) : légende sous chaque photo, déplacement par glisser ou par flèches, retrait, tuile « + Ajouter » en dernier. C'est l'approche courante des éditeurs de publication (Instagram, LinkedIn, WordPress Galerie).
- [x] **E6 Modularité.** `blockquilt-editor.js` (83 ko, environ 1 200 lignes) est découpé en modules ES natifs, toujours sans build : `editor/history.js`, `editor/drag.js`, `editor/fullscreen.js`, `editor/emoji.js`, `editor/ai.js`, `editor/bar.js`, `editor/cards.js`. Intégration : `<script type="module" src="blockquilt-editor.js">`. Le noyau `blockquilt.js` reste un seul fichier utilisable sous Node. Seulement si le code devient plus simple à lire et à maintenir.

Ordre : E4, E1, E2, E3, E5, E6. L'IA (§5) est mise de côté pour ce round.

## 5. IA — plan validé (à implémenter après « go »)

### Principes (décidés avec Julien)

- **Un éditeur ou un bloc n'existe jamais seul** : il vit dans une application (easyHomeGuide, site du labo, site perso, ytgrabber…). blockquilt fournit le générique ; l'application fournit le stockage, l'identité des contenus, les utilisateurs et les droits.
- **Désigner** : un contenu par son identifiant applicatif et sa version ; un bloc par **sa place et l'empreinte de son texte** dans cette version (`contenu guide1A, version 17, bloc 3, empreinte 9c1e`). Aucun identifiant dans le texte. Une écriture faite sur une version ou une empreinte périmée est refusée, jamais écrasée (comme `git` et `If-Match`).
- **Deux mécanismes IA** :
  - A. **dans l'éditeur** : un relais côté serveur, compatible OpenAI (OpenRouter…), installé par chaque application ; aucun relais central, aucune clé dans le navigateur.
  - B. **à l'extérieur** : un serveur MCP (et la même chose en API REST) sur les contenus de l'application, pour ChatGPT ou Claude Code.
- **Droits : jamais dans blockquilt.** Le serveur MCP et le relais transmettent le jeton à l'application, qui dit qui c'est et ce qu'il peut faire (jeton mcp1 → user1 → guides 1A, 1B, 1C ; rien d'autre).
- **Ce qu'on fait d'un résultat de l'IA**, toujours au choix :
  - document : remplacer, ajouter au début, ajouter à la fin, ne rien toucher (copier le résultat, continuer à travailler) ;
  - bloc : remplacer le bloc, insérer au-dessus, insérer dessous, ne rien toucher.
- **Tout s'essaie dans les démos**, locale et publique (application de référence = `dev/server.js`).

### Le contrat de l'application : HTTP hypermédia (un seul contrat, aucun module à réécrire)

Derrière, ce que l'on veut (PHP, Node, fichiers, base de données). Le Markdown est la représentation du contenu ; la version est l'`ETag`.

```
GET  /contents         Accept: text/html → liste de liens (htmx) · application/json → [{ id, title, updatedAt, href }]
GET  /contents/{id}    Accept: text/markdown → le texte (+ ETag) · text/html → le rendu (Blocks.toHtml)
PUT  /contents/{id}    Content-Type: text/markdown, If-Match: <ETag lu>, Authorization: Bearer <jeton>
                       → 204 + nouvel ETag · 412 contenu changé entre-temps · 403 pas le droit · 401 jeton inconnu
```

- L'application seule interprète le jeton (qui, quels contenus) et note l'auteur de chaque version (le jeton dit qui écrit).
- Le serveur MCP, le relais IA et l'éditeur ne sont que des clients de ces adresses. Les blocs (place + empreinte) sont calculés côté client par `Blocks` : l'application n'a pas à connaître les blocs.

### Étapes

- [x] **I1 Noyau** (fonctions pures, tests Node) : `Blocks.address(md)` → blocs numérotés avec leur empreinte ; `Blocks.changeBlock(md, { n, hash, mode, markdown })` (`replace | before | after | remove`, refus si empreinte périmée) ; `Blocks.combine(md, fragment, mode)` pour `replace | prepend | append`.
- [x] **I2 Application de référence** (démo) : plusieurs contenus en fichiers `.md`, deux utilisateurs et leurs jetons (user1 → guides 1A, 1B ; user2 → guide 2A), le contrat HTTP ci-dessus (Markdown, HTML, `ETag`, `If-Match`, auteur), page de démo avec le choix du contenu.
- [x] **I3 Serveur MCP générique** (Node, sans dépendance) : outils `get_format`, `list_contents`, `read_content` (blocs numérotés, empreintes), `edit_block` (`replace | before | after | remove`), `write_content` (`replace | prepend | append`, version attendue), `lint`. En stdio (Claude Code) et en HTTP (`/mcp` dans la démo, pour un client distant). Un « skill » `SKILL.md` (FORMAT.md + règles d'écriture). Essai : user1 voit 1A et 1B mais pas 2A, une écriture sur une empreinte périmée est refusée, l'éditeur relit ce que l'IA a écrit.
- [x] **I4 Modes d'application dans l'éditeur** : après la proposition de l'IA, « Remplacer », « Ajouter au début », « Ajouter à la fin », « Copier » (ne rien toucher) ; pour un bloc, « Remplacer », « Au-dessus », « Dessous », « Copier ». Toujours annulable.
- [ ] **I5 Relais IA** compatible OpenAI (OpenRouter) : module Node réutilisable, plusieurs usages (`traduire`, `réécrire`… chacun son modèle et sa consigne), consigne système `FORMAT.md` ; contrat HTTP documenté pour le réécrire ailleurs. L'éditeur propose les usages fournis par l'application. Démo : réponse fixe par défaut, vrai modèle si une clé est donnée.
- [ ] **I6 Versions et conflits dans l'éditeur** : enregistrement avec la version lue ; si le contenu a changé (par exemple modifié par une IA), une feuille propose de voir la différence, de prendre l'autre version ou de garder la sienne ; « modifié par … il y a … ».

Hors périmètre : l'édition à plusieurs en temps réel (curseurs partagés).

## 6. Idées gardées pour plus tard

- Brouillon local : texte non enregistré gardé dans le navigateur, « Reprendre le brouillon / Ignorer » à la réouverture (~40 lignes).

- Raccourcis de frappe Markdown (`## `, `- `, `> `, `---` en début de bloc) : pas convaincant pour le moment.
- Coller plusieurs paragraphes dans un champ → plusieurs blocs.
- Commande `/` dans un bloc vide pour le menu d'ajout.
- Colonnes : abandonnées pour le moment (`:::columns` reste un bloc source).

## 7. Risques

- Barre de mise en forme au-dessus du clavier sur iPhone (`visualViewport`) : à essayer sur un vrai appareil, Chromium ne le reproduit pas.
- Tests uniquement dans Chromium : à essayer à la main sur Safari (iPhone, Mac) et Firefox.
- Bloc HTML : un filtre maison ; garder la liste blanche courte, bloc désactivé par défaut (`html: true`).
