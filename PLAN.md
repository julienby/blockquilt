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
- **Evol 3** : E1 à E6 (titres centrés, intégration neutre, vue source, code à la ligne, carrousel en lignes repliable, modules ES dans `editor/`).
- **IA** (§5, I1 à I6) : désignation des blocs, contrat HTTP `/contents`, application de référence `/app`, serveur MCP et skill, choix d'application d'une proposition, relais compatible OpenAI, versions et conflits dans l'éditeur. Essayé avec Claude Code (connexion) et OpenRouter (`glm-5.3-flash`).
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

## 4b. Evol 4 — tâches (validées avec Julien le 2026-11-16)

Chaque tâche : test, `check` vert, commit, ligne dans `DECISIONS.md`. Source : `AMELIORATIONS.md` > Evol 4.

Principe : le **document est l'unité d'enregistrement**. L'état d'affichage (replié, vue) n'entre jamais dans le Markdown : il vit dans `localStorage`.

- [x] **F1 État d'affichage mémorisé.** `ed.views` est relu et écrit dans `localStorage` (clé `blockquilt.views.<contenu>`, valeur par place + type du bloc). Clé du contenu : option `storageKey`, sinon `contentUrl`. Sans clé : état gardé en session seulement. Le déplacement d'un bloc (monter, descendre, glisser) garde son état. Test : replier un carrousel, le déplacer, enregistrer, recharger → toujours replié.
- [x] **F2 Repli automatique des longs blocs.** Option `collapseLines` (défaut 5, `0` = désactivé). Un bloc texte, citation, liste, code ou texte source de plus de N lignes de Markdown est replié au premier affichage : N lignes visibles, fondu, « … +X lignes » et bouton « Déplier ». Un clic sur la zone repliée déplie. Le choix de l'utilisateur (replier / déplier) prime sur le défaut et est gardé par F1. Le carrousel utilise le même mécanisme. Le plein écran d'un bloc l'affiche toujours en entier. Test : bloc de 12 lignes replié à 375 px ; déplié ; reste déplié après rechargement ; `collapseLines: 0` ne replie rien.
- [x] **F3 Plein écran d'un bloc : enregistrer et passer au suivant.** Dans l'en-tête du plein écran : « Enregistrer » (enregistre le document ; Ctrl+S reste dans le plein écran), flèches « bloc précédent / suivant » (le plein écran passe au bloc voisin, sans retour à la page). Test : modifier le bloc 2, enregistrer, passer au bloc 3, le contenu enregistré contient la modification.
- [x] **F4 Vue source : choix de la visualisation.** Trois états : « Source », « Source + visuel », « Visuel ». Choix gardé dans `localStorage`. Défaut : « Source + visuel » à partir de 1024 px, « Source » en dessous. Test à 375 px et 1280 px.
- [x] **F5 Limites du relais IA.** Réglage `limits: { maxChars, perUserDay, globalDay }` (en jetons pour les deux derniers, comptés d'après `usage` de la réponse du modèle). Taille du texte envoyé au-delà de `maxChars` → 413. Quota du jour par jeton d'application dépassé → 429. Plafond global du jour dépassé → 429. Compteurs en mémoire, remis à zéro à minuit. Messages clairs dans l'éditeur. Valeurs de la démo publique basses. Garder aussi une limite de crédit sur la clé OpenRouter.

Ordre : F1, F2, F3, F4, F5. L'IA par opérations (§4c) vient après, avec son propre plan.

## 4b-bis. F4b Modes et panneaux (validé le 2026-11-16)

Décidé avec Julien le 2026-11-16 : deux réglages indépendants, mêmes choix partout.

| | 1 panneau | 2 panneaux |
|---|---|---|
| Édition en blocs | blocs | blocs + visuel |
| Édition en source | source | source + visuel |

L'aperçu seul reste un mode à part (lecture). Le choix 1 / 2 panneaux est commun aux deux modes. Le visuel ne suit pas le défilement de l'éditeur.

- [x] **F4b** Remplace le sélecteur à trois boutons de F4 (dans la vue source).
  - En-tête : à côté de « Texte source » et « Aperçu », un bouton bascule à icône deux colonnes, sans texte visible (`aria-label` et `title` « Visuel à côté », `aria-pressed`). Désactivé en mode Aperçu.
  - Choix gardé dans `localStorage` (clé `blockquilt.split`, `try/catch`). Défaut : 2 panneaux à partir de 1024 px, 1 panneau en dessous. La clé `blockquilt.sourceLayout` de F4 n'est plus lue.
  - 2 panneaux : côte à côte à partir de 1024 px, empilés en dessous (éditeur, puis visuel).
  - Visuel = `Blocks.toHtml` du document courant. Source : à chaque frappe (comme aujourd'hui). Blocs : à chaque modification, avec un délai court (environ 300 ms), et après annuler / rétablir, déplacer, ajouter, supprimer.
  - Le plein écran d'un bloc n'a pas de visuel à côté.
  - Tests `dev/check.mjs` (375 px et 1280 px) : défaut à chaque largeur ; bascule en blocs et en source ; choix gardé en passant de blocs à source et après rechargement ; visuel à jour après une frappe dans un bloc ; bouton désactivé en Aperçu ; aucun débordement horizontal à 375 px. Les tests F4 sont adaptés sans perdre ce qu'ils vérifiaient.

## 4c. IA du document par opérations (validé le 2026-11-17)

Problème : l'IA du document recopie tout le texte, donc « avant / après » n'a pas de sens. Objectif : des modifications **ciblées sur plusieurs blocs**, que Julien accepte **une à une**. Prévisible, simple, précis. Plan à faire relire avant tout code ; implémentation avec le modèle fort.

Gain en plus : la réponse ne contient que les changements. Elle coûte moins de jetons écrits (F5) et risque moins d'être coupée (`finish_reason: length`). Le gain de temps grandit avec la taille du document : mesuré en A2b sur de petits documents (moins de 2 000 caractères), il est faible, car la réflexion du modèle et la latence comptent plus que la longueur de la réponse.

**Principes**
- L'IA reçoit le document en **blocs numérotés** (1, 2, 3…), comme le serveur MCP. Le frontmatter est le bloc **0**. Elle renvoie des **opérations**, jamais le document.
- L'IA ne donne **que des numéros**. Une IA ne sait pas recopier une empreinte ; l'éditeur, si.
- Tous les numéros se rapportent au document **envoyé**. À l'envoi, l'éditeur note pour chaque numéro l'identifiant interne du bloc (`ed.blocks[i].id`) et son empreinte. À l'application, chaque opération vise ce bloc par son identifiant, pas par sa place.
- On continue d'écrire pendant que l'IA travaille. Une opération dont le bloc n'a pas changé s'applique, même si d'autres blocs ont bougé. Une opération dont le bloc a été modifié ou supprimé est **périmée** : affichée, décochée, désactivée. (Pas de refus global : une lettre tapée ailleurs ferait perdre toute la réponse.)
- Réponse vide → « Aucune modification proposée » (réponse valide, par exemple « Corriger » sur un texte sans faute).
- Réponse mal formée → rien n'est appliqué ; message « La réponse de l'IA n'est pas utilisable » et le texte brut reste copiable. Pas de réparation automatique.

**Format de réponse** (texte, pas de JSON : le Markdown n'a pas à être échappé)

```
@@ remplacer 3
Texte Markdown du nouveau bloc 3.

@@ après 5
## Nouveau titre

Un paragraphe ajouté.

@@ avant 1
...

@@ supprimer 4
```

- Quatre verbes : `remplacer n`, `avant n`, `après n`, `supprimer n`. Le corps (plusieurs blocs permis) va jusqu'au prochain `@@` ; `supprimer` n'a pas de corps.
- Bloc 0 (frontmatter) : seuls `remplacer 0` (le corps est un frontmatter) et `après 0` (ajout en tête du document) sont permis.
- Un seul `remplacer` ou `supprimer` par numéro ; plusieurs `avant` / `après` permis.
- Un `remplacer` dont le corps est identique au bloc est retiré, et compté : « 4 blocs inchangés ignorés ».
- Chaque corps passe `Blocks.lint`. Une opération en alerte est décochée et montre son alerte ; les autres restent utilisables.

**Interface**
- Feuille « Propositions de l'IA » : une ligne par opération (« Remplacer le bloc 3 », « Ajouter après le bloc 5 »), case à cocher. Tout est coché au départ, sauf les opérations périmées ou en alerte.
- `remplacer` : différences **mot à mot** (mots retirés barrés, mots ajoutés surlignés), pas avant / après en entier. Pour une correction, on voit le changement en un coup d'œil.
- « Appliquer les N choisies » : une seule étape annulable (Ctrl+Z).
- « Copier la réponse » reste disponible.

**Mode par défaut** (question tranchée)
- Sur le document, « opérations » est le défaut : usages et consigne libre.
- Un usage qui restructure tout (« En étapes ») déclare `output: 'document'` et garde le mode actuel (remplacer / début / fin).
- Sur un bloc : rien ne change.

**Étapes**
- [x] **A1 Noyau** (fonctions pures, tests Node) : `Blocks.parseOps(texte)` (format, verbes, numéros, bloc 0, doublons, réponse vide) ; `Blocks.diffWords(avant, après)`. Tests : valides, mal formés, numéro inconnu, doublon, verbe interdit sur le bloc 0, réponse vide. Pas de `applyOps` sur le Markdown : l'éditeur applique sur `ed.blocks`. À ajouter seulement si un outil MCP doit appliquer plusieurs opérations d'un coup.
- [x] **A2 Relais** : un usage déclare `output: 'operations' | 'document'` (défaut `operations` sur le document) ; la consigne système contient le format ci-dessus et le document numéroté. Le contrat HTTP du relais est mis à jour. Démo : réponse fixe avec 3 opérations.
- [x] **A2b Essai réel, avant l'interface** : un script envoie 5 à 10 documents à un vrai modèle (OpenRouter, `glm-5.3-flash` et un modèle plus fort) et passe chaque réponse dans `parseOps`. Noter le taux de réponses utilisables et les écarts de format dans `DECISIONS.md` ; durcir la consigne, pas le parseur. Format qui ne tient pas → on le change avant A3.
- [x] **A3 Éditeur** : identifiants et empreintes notés à l'envoi, opérations périmées, feuille de choix une à une, différences mot à mot, application en une étape annulable. Test `dev/check.mjs` à 375 px et 1280 px (dont : on modifie un bloc pendant que l'IA travaille → son opération est périmée, les autres s'appliquent).

## 4d. Lignes composées (validé le 2026-11-17 : « rien ne doit générer un mauvais affichage »)

Fait avant : bloc Carte (`:::card`, commit ded25ca).

Objectif : à la restitution, mettre des blocs côte à côte (une photo à 1/3 et un texte à 2/3, deux photos à 1/2). Trois largeurs seulement, pour cadrer. Dans l'éditeur, les blocs restent les uns sous les autres.

**Format** (validé : commentaire en tête du bloc)
- Première ligne du bloc : `<!-- 1/3 -->`, `<!-- 1/2 -->` ou `<!-- 2/3 -->`. Rien d'autre n'est permis. Ailleurs (GitHub, autre lecteur Markdown), le commentaire est invisible et les blocs s'empilent : rien n'est perdu.
- Bloc **Espace** : le commentaire seul (`<!-- 1/3 -->`). Il laisse un vide dans la ligne.
- Les blocs avec une largeur qui se suivent forment une ligne. La ligne se ferme quand la somme fait 1. Lignes possibles : 1/2 + 1/2, 1/3 + 2/3, 2/3 + 1/3, 1/3 + 1/3 + 1/3.
- Ligne incomplète (la somme ne fait pas 1 avant un bloc pleine largeur ou la fin) ou qui déborde (1/2 puis 2/3) : alerte `Blocks.lint`. Rendu : ses blocs s'élargissent en gardant leurs proportions, jamais de trou non voulu ; un débordement ouvre une nouvelle ligne ; une ligne d'Espaces seuls n'est pas rendue.
- Tous les types peuvent avoir une largeur, ligne horizontale comprise (sinon le bloc tomberait en texte source).

**Rendu publié**
- `<div class="bq-row">` puis une `<div class="bq-col bq-w-1-3">` par bloc. Grille de 6 colonnes dans `blockquilt-content.css`.
- Dans un conteneur étroit (moins de 36rem, `@container`), la ligne s'empile et les Espaces disparaissent. Une photo à 1/3 sur un téléphone serait trop petite.

**Éditeur**
- Les blocs restent les uns sous les autres.
- À côté du type, une petite grille dessinée (pas un bouton : la place manque à 375 px ; la largeur se choisit dans le menu « ⋯ ») (2 ou 3 cases), avec la case du bloc en couleur. Pas de texte « 2/3 », qui se confond avec la largeur. Un bloc pleine largeur n'a pas de grille, seulement le bouton.
- Le bouton ouvre un choix : Pleine largeur, 1/3, 1/2, 2/3.
- Ligne incomplète : la grille est en orange et porte l'aide « Ligne incomplète ».
- « Espace » est dans le menu d'ajout, groupe Structure.
- IA sur un bloc : la réponse garde la largeur du bloc, même si l'IA n'a pas écrit le commentaire.

**Étapes**
- [x] **L1 Noyau** : lire et écrire la largeur (générique, pour tous les types : `fromMarkdown` / `toMarkdown`), bloc Espace, regroupement en lignes, alertes lint, rendu `bq-row`. Tests Node : aller-retour, types lus, lignes possibles, incomplète, débordement, ligne horizontale refusée, HTML rendu.
- [x] **L2 CSS publié** : grille et empilement en écran étroit. Test `dev/check.mjs` en aperçu : côte à côte à 1280 px, empilé à 375 px.
- [x] **L3 Éditeur** : bouton de largeur et sa grille, choix, alerte de ligne incomplète, Espace dans le menu d'ajout, largeur gardée par l'IA sur un bloc. Tests à 375 px et 1280 px.
- [x] **L4 Docs** : `FORMAT.md` (l'IA le reçoit : elle pourra composer des lignes), démo, `DECISIONS.md`.

## 4e. Avant la V1 : retours de Billy et Cod (validé le 2026-11-18)

Source : `archives/AVIS-Billy.md`, `archives/AVIS-Cod.md`. Écartés (voir `DECISIONS.md`) : temporisateurs, `syncFromDom` en N², délai du visuel, JSDoc de `ed`, découpage de `check.mjs`, contrôle du CSS généré.

- [x] **V1 Sécurité du serveur de démo** (`dev/server.js`) : fichiers servis par liste blanche (pas de `.env`, ni fichier caché, ni document interne) ; corps reçu limité en octets (413) ; photos limitées en taille et à JPEG, PNG, WebP, GIF (pas de SVG envoyé) ; délai maximal de l'appel au fournisseur dans `ai/blockquilt-ai.js`. Tests.
- [x] **V2 Écritures concurrentes** (`dev/app.js`) : lire le corps, puis relire la version, comparer, écrire sans attente. Test : deux PUT avec le même ETag → un 204, un 412.
- [x] **V3 Vue source** : saisie, puis « Visuel à côté » → texte gardé. Test navigateur d'abord (saisir → basculer → enregistrer → relire), puis correctif.
- [x] **V4 Demande IA périmée** : une demande par `AbortController`, annulée à la fermeture de la feuille ou à une nouvelle demande. Test d'abord.
- [x] **V5 Marge du carrousel** : marge haute différente des photos, textes, vidéos. Reproduire (où et à quelle largeur), puis aligner.
- [x] **V6 Docs** : `FORMAT.md` (`:::carousel`, `:::html` et sa condition) ; README (case « forcer », ChatGPT non validé, portée de « sans perte ») ; feuille IA : « le document est envoyé au service configuré ».
- [ ] **V7 Essais manuels (Julien)** : vrai modèle, iPhone, Android, Safari, Firefox, une intégration pilote.

## 4f. Rendu HTML multi-langages & génération hybride

Objectif : permettre à n'importe quel serveur (Node, PHP, Python) de générer des pages HTML indépendantes de l'éditeur à partir du seul Markdown, sans dérive entre les implémentations.

- [x] **R1 Plan et décisions** : contrat `.bq-content`, rendu hybride par fragment en cache, parité JS / PHP / Python par fixtures (`DECISIONS.md`).
- [x] **R2 Golden tests de rendu** (`tests/fixtures/*.md` ↔ `tests/fixtures/*.html`) : figer la sortie exacte de `Blocks.toHtml(md, { media: 'media/' })` pour toutes les fixtures et vérifier dans `tests/blocks_test.cjs`.
- [x] **R3 Contrat HTML documenté** (`RENDER.md`) : balises, classes `.bq-*`, règle du `<h1>` frontmatter, liste blanche `:::html`, protocoles autorisés.
- [x] **R4 Génération hybride côté serveur** (`dev/app.js`, `tests/contents_test.mjs`) : à l'écriture (ou à la première lecture), pré-rendre et mettre en cache le fragment `<article class="bq-content">…</article>` avec `ETag` ; servir le fragment directement pour HTMX (`HX-Request`) ou l'injecter dans le gabarit HTML complet (`blockquilt-content.css` + `blockquilt-content.js` facultatif).
- [x] **R5 Moteur Python** (`renderers/python/blockquilt_render.py`, `test_render.py`) : parseur + `to_html` + sanitisation stricte `:::html`, validé à 100 % par les mêmes fixtures `*.md` / `*.html` (`unittest`).
- [x] **R6 Moteur PHP** (`renderers/php/BlockquiltRender.php`, `test_render.php`) : parseur + `toHtml` + sanitisation stricte `:::html`, validé à 100 % par les mêmes fixtures `*.md` / `*.html` (`docker compose run --rm check-php`).

## 4g. Photo : taille et format (validé le 2026-11-18)

- [x] **P1** `{size=small|medium}`, `{ratio=16:9|4:3|1:1}` sur le bloc Photo seul : noyau JS, moteurs PHP et Python, fixture commune `photo-options`, carte d'édition (deux listes), `blockquilt-content.css`, FORMAT / RENDER / DECISIONS.
- [x] **P2** Parité JS / PHP / Python sur les cas limites : les moteurs PHP et Python vérifient la réécriture comme `Blocks.fromMarkdown` (fixture `edge`, 45 cas ; essai aléatoire de 3 000 textes identique dans les trois moteurs, contre 1 226 avant).

## 4h. Coller une page web (validé le 2026-11-21)

- [x] **C1** `Blocks.fromHtml` (noyau, sans DOM) ; menu « Coller » lit le HTML du presse-papiers ; Ctrl+V d'une page → blocs dessous, ou à la place d'un bloc vide. Tests : `blocks_test.cjs` (20 cas), `check.mjs` (5 cas).
- [x] **C2** « Coller » dans le menu d'ajout (mobile, document vide).
- [x] **C3** Rapatrier les images : `uploadUrl` accepte `url` (démo : garde-fous SSRF) ; capture d'écran collée → `upload`. Images `data:` du HTML : ignorées.
- [x] **C4** IA sur la plage collée, avec une consigne (validé le 2026-11-22) :
  - **Bandeau juste après le collage** (Ctrl+V d'une page, menu « Coller », s'il crée au moins 2 blocs) : « 5 blocs collés · IA sur ces blocs · Fermer ». Il garde les ids des blocs insérés. Il part à la modification suivante (frappe, action, Annuler) : les ids sont alors encore justes, pas besoin de les garder dans l'historique.
  - **IA sur ces blocs** : la feuille IA s'ouvre avec « Sur les 5 blocs collés ». Envoi `scope=document` avec les blocs numérotés (§4c), plus un nouveau champ **`range`** = `"4-8"` (numéros du document envoyé). Le relais ajoute à la consigne : ne modifier que les blocs 4 à 8 ; insérer seulement entre eux ou juste après. Les usages proposés sont ceux du document.
  - **Côté éditeur** : une opération hors de la plage est montrée, décochée, désactivée, avec « hors des blocs collés » (comme une opération périmée). Le reste ne change pas : « Appliquer » = une étape annulable.
  - Docs : README (champ `range`), en-tête de `ai/blockquilt-ai.js`, `DECISIONS.md`. Tests : bandeau (apparaît, part à la frappe et à Annuler, pas pour 1 bloc) ; envoi de `range` ; opération hors plage désactivée ; relais (`blocks_test.cjs` ou test du relais) : `range` dans la consigne.
- ~~**C5** Lien « Source »~~ : retiré de l'éditeur (2026-11-22). Une extension de navigateur (application) crée le document par `/contents` et écrit `source: https://…` dans le frontmatter, que l'éditeur garde déjà.

## 4i. Enregistrer : bouton clair et brouillon local (validé le 2026-11-21)

Problème : au rechargement d'une page non enregistrée, Android affiche son message (`beforeunload`), impossible à remplacer par une feuille de l'éditeur. Le bouton Enregistrer est gris mais cliquable quand il n'y a rien à enregistrer.

- [x] **B1 Bouton Enregistrer** : `disabled` quand il n'y a rien à enregistrer (en-tête et plein écran d'un bloc) ; actif : couleur de l'accent + pastille. Ctrl+S sans modification : rien. Annuler jusqu'à l'état enregistré (Ctrl+Z, ↶) → le bouton redevient inactif (comparaison avec le texte enregistré, faite seulement à l'annulation, pas à chaque frappe). Test : chargé → `disabled` ; frappe → actif ; enregistré → `disabled` ; frappe puis annuler → `disabled`.
- [x] **B2 Brouillon écrit** : avec `storageKey` ou `contentUrl`, le texte non enregistré est gardé dans `localStorage` (`blockquilt.draft.<clé>` : `{ text, version, at }`) 1 s après la dernière modification et quand la page se cache (`pagehide`, `visibilitychange`, car Android peut fermer l'onglet sans `beforeunload`). Effacé après un enregistrement réussi, après « Ignorer », après « Quitter sans enregistrer ». Le message `beforeunload` n'est plus utilisé dans ce cas. Option `draft: false`, ou ni `storageKey` ni `contentUrl` : comportement actuel (message du navigateur, pas de brouillon). Écriture refusée (`localStorage` bloqué ou plein, iframe tierce) : retour au message du navigateur pour la session. `destroy()` écrit le brouillon s'il reste des modifications (htmx, application à une seule page : pas de `pagehide`). `Blockquilt.clearDrafts()` efface toutes les clés `blockquilt.*` (déconnexion).
- [x] **B3 Brouillon proposé** : au montage seulement (pas à `setMarkdown`), si un brouillon existe et diffère du texte chargé, **bandeau dans l'éditeur** (pas de feuille : plusieurs éditeurs par page, page hôte libre), comme le bandeau « Modifié par … » : « Modifications non enregistrées sur cet appareil, il y a 5 min · Reprendre · Ignorer ». Brouillon identique au texte chargé : effacé sans rien dire. Reprendre : le brouillon remplace le texte, état « à enregistrer », annulable (Ctrl+Z revient au texte chargé). Avec `contentUrl`, la version lue est celle du brouillon : si le contenu a changé sur le serveur depuis, l'enregistrement reçoit 412 et la feuille de conflit existante (I6) s'ouvre. Sans `contentUrl` (`saveUrl`, `onSave`) : le brouillon garde l'empreinte du texte chargé ; si le texte chargé a changé depuis, le bandeau ajoute « Le contenu a changé depuis ce brouillon ».
- [x] **B4 Docs** : README (option `draft`, clé `localStorage`, `clearDrafts()`, limites : le brouillon reste sur cet appareil et ce navigateur ; application à plusieurs utilisateurs → `storageKey` contient l'identifiant de l'utilisateur ; appareil partagé → `draft: false` ou `clearDrafts()` à la déconnexion), `DECISIONS.md`.

Tests (`dev/check.mjs`) : modifier, recharger → le bandeau s'affiche, aucun message `beforeunload` ; Reprendre → texte du brouillon, bouton actif, Ctrl+Z → texte chargé ; Ignorer → texte serveur, brouillon effacé ; enregistrer → brouillon effacé ; brouillon d'une ancienne version → Reprendre puis Enregistrer → feuille de conflit ; sans `contentUrl`, texte changé → mention dans le bandeau ; brouillon identique → effacé, pas de bandeau ; deux éditeurs → deux bandeaux indépendants ; `destroy()` avec modifications → brouillon écrit ; `localStorage` qui lève une erreur → `beforeunload` actif ; `draft: false` → `beforeunload` actif ; `clearDrafts()` → clés effacées.

Limites acceptées : deux onglets ou deux éditeurs sur le même contenu → le dernier brouillon écrit gagne. Pas de date d'expiration du brouillon.

## 4j. Réseau absent ou serveur en erreur : messages clairs (validé le 2026-11-22)

Problème : sans réseau, le message est celui du navigateur (« Failed to fetch », « Load failed »…), en anglais, dans une notification de 1,8 s. Le texte n'est pas perdu (bouton actif, brouillon).

- [x] **N1 Un seul traducteur d'erreurs** (`editor/shared.js`) : `request(url, options)` = `fetch` dont l'échec réseau devient « Pas de connexion. Rien n'est perdu : réessayez quand le réseau revient. » (une annulation reste une annulation) ; `serverText(r, text)` : texte court du serveur gardé, page HTML ou texte long → « Erreur du serveur (500). ». Utilisé par : enregistrer (`saveUrl`, `contentUrl`), IA, photos, lecture du texte, « Garder la mienne », aperçu. Les appels silencieux restent silencieux (usages de l'IA, revérification, emoji). Tests (réseau coupé dans la page) : enregistrer, IA, photo → message clair ; PUT 500 en HTML → « Erreur du serveur (500). ».
- [x] **N2 Erreur d'enregistrement affichée jusqu'à la suite** : bandeau ambre (style existant) au lieu de la notification de 1,8 s ; caché au prochain enregistrement réussi ou par « Fermer ». Test.
- [x] **N3 Délai maximal** : 30 s pour enregistrer et envoyer une photo (`AbortSignal.timeout`) → « Le serveur ne répond pas. Réessayez. » ; pendant l'attente, le bouton Enregistrer montre l'attente (`aria-busy`). L'IA garde le délai de son relais. Test.
- [x] **N4 Défauts** : « Garder la mienne » sans réseau → message dans la feuille (aujourd'hui rien) ; aperçu : réponse non `ok` → « Aperçu indisponible » (aujourd'hui la page d'erreur est affichée comme aperçu) ; lecture du texte (`contentUrl` sans `source`) en échec → message dans l'éditeur et enregistrement impossible tant que le texte n'est pas lu. Tests.

Écarté : réenregistrer seul au retour du réseau (change « j'enregistre quand je veux » ; le brouillon protège déjà le texte).

## 4k. IA en plein écran sur un bloc (validé le 2026-11-22)

Principe : le contexte visuel est le contexte de travail. En plein écran, l'IA ne transforme que le champ texte du bloc (sélection, contenu entier, ou insertion au curseur) ; jamais de bloc créé hors de la vue. Un bloc ne produit que son type : texte → texte. Pour découper : « Scinder » (existe). Bouton seulement si le bloc a un champ `.bq-edit[data-rich]` (texte, citation, encadrés, texte en grand) ; titres, photo, vidéo, code, carte : IA par l'éditeur seulement. Contrat `aiUrl` inchangé (`block` = contenu envoyé).

Précisé le 2026-11-22 : la carte n'a pas de bouton (liste fermée : texte, citation, texte en grand, encadrés). Texte sélectionné → la sélection part, un bouton « Remplacer la sélection ». Curseur seul → le champ entier part, deux boutons « Remplacer le texte » et « Insérer au curseur ».

- [x] **P0 Essais Chromium d'abord** (`dev/check.mjs`) : feuille IA au-dessus du plein écran ; bouton présent / absent ; remplacer la sélection ; insérer au curseur ; remplacer le contenu d'un encadré (titre et icône gardés) ; 2 paragraphes → 2 lignes ; réponse avec photo → boutons désactivés ; un seul Annuler.
- [x] **P1 Bouton** `data-full-ai` (template, fullscreen `draw`, events).
- [x] **P2 Ouverture** (`ai.js`) : plage gardée, `ai.sent` (sélection ou champ entier), libellé.
- [x] **P3 Réponse → texte du champ** : blocs texte / citation / texte en grand → html, titre → texte brut, joints par `<br>` ; sinon boutons désactivés avec la raison.
- [x] **P4 Boutons et application** : `here` / `all`, `ed.change` + `syncFromDom`, plage vérifiée, focus rendu au champ.
- [x] **P5 Docs** : README (IA, plein écran), DECISIONS.

## 5. IA — fait (I1 à I6)

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
- [x] **I5 Relais IA** compatible OpenAI (OpenRouter) : module Node réutilisable, plusieurs usages (`traduire`, `réécrire`… chacun son modèle et sa consigne), consigne système `FORMAT.md` ; contrat HTTP documenté pour le réécrire ailleurs. L'éditeur propose les usages fournis par l'application. Démo : réponse fixe par défaut, vrai modèle si une clé est donnée.
- [x] **I6 Versions et conflits dans l'éditeur** : enregistrement avec la version lue ; si le contenu a changé (par exemple modifié par une IA), une feuille propose de voir la différence, de prendre l'autre version ou de garder la sienne ; « modifié par … il y a … ».

Hors périmètre : l'édition à plusieurs en temps réel (curseurs partagés).

## 6. Idées gardées pour plus tard

- Brouillon local : texte non enregistré gardé dans le navigateur, « Reprendre le brouillon / Ignorer » à la réouverture (~40 lignes).

- Raccourcis de frappe Markdown (`## `, `- `, `> `, `---` en début de bloc) : pas convaincant pour le moment.
- Coller plusieurs paragraphes dans un champ → plusieurs blocs.
- Commande `/` dans un bloc vide pour le menu d'ajout.
- Colonnes : abandonnées pour le moment (`:::columns` reste un bloc source).
- IA, suites possibles :
  - photos par MCP (une IA ne peut pas encore envoyer une image : elle n'utilise que des adresses existantes) ;
  - ChatGPT : son connecteur MCP distant demande une connexion OAuth, la démo n'a que des jetons ;
  - auteur en HTTP : « via MCP » au lieu du nom du client (pas de session côté serveur) ;
  - historique des versions côté application (aujourd'hui : la dernière version et son auteur seulement).
- Intégration réelle dans une application (easyHomeGuide en PHP : le contrat `/contents` et le relais IA à réécrire, le serveur MCP à brancher dessus).

## 7. Risques

- Barre de mise en forme au-dessus du clavier sur iPhone (`visualViewport`) : à essayer sur un vrai appareil, Chromium ne le reproduit pas.
- Tests uniquement dans Chromium : à essayer à la main sur Safari (iPhone, Mac) et Firefox.
- Bloc HTML : un filtre maison ; garder la liste blanche courte, bloc désactivé par défaut (`html: true`).
- Démo publique ouverte : jetons de démo publics, IA à la charge de la clé OpenRouter → limite de crédit sur la clé.
- Modèles à réflexion : réglage `params` / `AI_REASONING` ; un autre modèle peut demander un autre réglage.
