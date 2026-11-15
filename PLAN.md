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
- [ ] **E5 Carrousel, édition.** La bande de vignettes défilante est remplacée par une grille (2 colonnes à 375 px, 3 à 4 au-delà) : légende sous chaque photo, déplacement par glisser ou par flèches, retrait, tuile « + Ajouter » en dernier. C'est l'approche courante des éditeurs de publication (Instagram, LinkedIn, WordPress Galerie).
- [ ] **E6 Modularité.** `blockquilt-editor.js` (83 ko, environ 1 200 lignes) est découpé en modules ES natifs, toujours sans build : `editor/history.js`, `editor/drag.js`, `editor/fullscreen.js`, `editor/emoji.js`, `editor/ai.js`, `editor/bar.js`, `editor/cards.js`. Intégration : `<script type="module" src="blockquilt-editor.js">`. Le noyau `blockquilt.js` reste un seul fichier utilisable sous Node. Seulement si le code devient plus simple à lire et à maintenir.

Ordre : E4, E1, E2, E3, E5, E6. L'IA (§5) est mise de côté pour ce round.

## 5. IA — proposition à discuter (mise de côté pour ce round, rien n'est implémenté)

Deux niveaux (document entier, bloc) et deux accès :

**A. L'IA dans l'éditeur (l'éditeur appelle).** Aujourd'hui : une seule adresse `aiUrl`. Proposition : plusieurs IA, chacune pour un usage.

```js
ai: [
  { id: 'traduction', label: 'Traduire', url: '/ai/deepl', scopes: ['document', 'block'], presets: ['Anglais', 'Espagnol'] },
  { id: 'redaction', label: 'Réécrire', url: '/ai/claude', scopes: ['document', 'block'], presets: ['Corriger', 'Raccourcir'] },
]
```

Même échange pour toutes (`scope`, `instruction`, `text`, `block` → `{ markdown }`). L'éditeur ne voit jamais une clé : chaque adresse est un petit service côté serveur qui garde la clé, vérifie la session (`fields`, jeton CSRF), limite le débit et les usages permis. La réponse passe toujours par `Blocks.lint`, avant / après, « Appliquer » annulable.

**B. L'IA se connecte au document (l'IA écrit, l'éditeur relit).** ChatGPT ou Claude Code travaillent directement sur le contenu ; à l'ouverture dans l'éditeur, tout est propre.

- **Le savoir-faire** : un « skill » (`FORMAT.md` + règles d'écriture), donné tel quel à l'IA. Base déjà prête : `FORMAT.md`, `Blocks.lint`.
- **L'accès** : un serveur MCP (et la même chose en API REST) avec des outils simples :
  - `get_format` ;
  - `list_documents` ;
  - `read_document` ;
  - `write_document`, qui contrôle par `lint` et refuse ou signale ;
  - `read_block` et `replace_block` (un bloc désigné par sa place et l'empreinte de son texte, pour ne pas écraser un bloc qui a changé entre-temps) ;
  - `lint`.
- **La sécurité** :
  - jeton par document ou par espace, avec des droits (lecture / écriture), une durée et la possibilité de le révoquer ;
  - chaque écriture crée une version : l'éditeur affiche « modifié par Claude il y a 2 min », montre la différence et permet d'annuler ;
  - écriture conditionnelle (version attendue, `If-Match`) pour ne pas écraser une édition en cours.
- **Où ça vit** : l'éditeur reste un composant d'interface générique. Le stockage dépend de chaque application ; blockquilt fournirait un serveur MCP de référence sur un dossier de fichiers `.md` (MCP en JSON-RPC sur stdio, sans dépendance), que chaque application adapte à son stockage.

**Questions à trancher avant d'écrire du code :**
1. Où sont stockés les documents dans tes applications (fichiers, base de données) ?
2. Quelles IA veux-tu brancher en premier (traduction, rédaction) ?
3. Qui se connecte par MCP : toi seul (jeton personnel) ou aussi tes utilisateurs ?
4. Faut-il un historique des versions visible dans l'éditeur dès la première étape ?

**Étapes possibles :**
- I1 : le skill, c'est-à-dire `FORMAT.md` + `SKILL.md` pour Claude Code et ChatGPT.
- I2 : plusieurs IA dans l'éditeur.
- I3 : serveur MCP de référence sur fichiers.
- I4 : versions et « modifié par… » dans l'éditeur.

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
