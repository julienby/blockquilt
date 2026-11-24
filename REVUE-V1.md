# Revue de code & plan d'amélioration — Blockquilt (V1 → V2)

Revue complète du noyau (`blockquilt.js`), de l'éditeur (`blockquilt-editor.js` + `editor/*.js`), du relais IA (`ai/blockquilt-ai.js`), du serveur MCP (`mcp/blockquilt-mcp.js`), du serveur de démo (`dev/`) et des moteurs de rendu (`renderers/php/`, `renderers/python/`).

---

## 1. Verdict : est-ce prêt pour une V1 ?

**Oui.** Le projet est remarquablement propre, cohérent et déjà à un niveau de maturité rare pour une V1 :

- **Simplicité exemplaire** : ~7 100 lignes au total (noyau, éditeur, relais IA, serveur MCP, moteurs PHP & Python et tests compris), zéro dépendance JS à l'exécution, aucun bundler requis.
- **Architecture solide** : séparation nette entre le noyau pur sans DOM ([blockquilt.js](blockquilt.js)), l'éditeur modulaire ([editor/](editor/)), le rendu publié autonome ([blockquilt-content.css](blockquilt-content.css), [blockquilt-content.js](blockquilt-content.js)), le relais IA ([ai/blockquilt-ai.js](ai/blockquilt-ai.js)) et le serveur MCP ([mcp/blockquilt-mcp.js](mcp/blockquilt-mcp.js)).
- **Garanties fortes tenues** : zéro perte de données (`raw`), gestion des conflits par `ETag`/`If-Match`, opérations IA chirurgicales (`parseOps` + diff mot à mot + détection de blocs périmés), garde-fous SSRF sur l'import d'images, suite de tests verte.

Il reste néanmoins **6 corrections ciblées (bugs / sécurité)** et **6 optimisations simples** à faire avant de figer la V1. Toutes sont courtes, locales et sans remise en cause de l'architecture.

---

## 2. Points à corriger avant la V1 (Priorité haute)

### 2.1 Crash `RangeError` dans `Blocks.sanitize` (et écart avec PHP / Python)
- **Où** : `blockquilt.js` (lignes 642–643)
- **Problème** : `String.fromCodePoint(parseInt(h, 16) || 0xfffd)` et `String.fromCodePoint(Number(d) || 0xfffd)` lèvent une `RangeError: Invalid code point` si une entité numérique dépasse `0x10ffff` (ex. `<a href="&#999999999;">x</a>`). Un bloc `:::html` malformé ou malveillant fait planter le rendu JS (navigateur et Node), alors que `fromHtml` (ligne 480), `renderers/python/blockquilt_render.py` (lignes 300–303) et `renderers/php/BlockquiltRender.php` (lignes 201–208) bornent déjà à `0 < cp <= 0x10FFFF`.
- **Correction** : partager un helper `codePoint(n) => (n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\uFFFD')` entre `fromHtml` et `sanitize`, et ajouter le cas dans `tests/blocks_test.cjs`.

### 2.2 Barre de mise en forme : `ed.typed()` manquant au clic
- **Où** : `editor/bar.js` (ligne 173)
- **Problème** : un clic sur Gras, Italique, Souligné, Surligner ou Liste appelle `ed.setDirty(true)` mais pas `ed.typed()` (contrairement à `Ctrl+B/I/U` ligne 214 et `applyLink` ligne 101). Résultat : le panneau « Visuel à côté » ne se met pas à jour et le checkpoint d'historique (1 s) n'est pas planifié.
- **Correction** : ajouter `ed.typed();` après `ed.setDirty(true);`.

### 2.3 Serveur MCP : pas de plafond mémoire en HTTP, concurrence en `stdio`, pas de timeout
- **Où** : `mcp/blockquilt-mcp.js` (lignes 69, 179, 196–208)
- **Problèmes** :
  1. `httpHandler` (ligne 179) accumule tout le corps POST en mémoire sans limite (`maxBytes`), contrairement à `ai/blockquilt-ai.js` (2 Mo → 413). Un client malveillant peut saturer la mémoire.
  2. `stdio` (ligne 196) utilise un callback `stdin.on('data', async ...)` non sérialisé : deux messages arrivant dans deux chunks rapprochés peuvent s'exécuter en concurrence et corrompre l'ordre des réponses ou les écritures successives.
  3. `api()` (ligne 69) appelle `fetch(...)` sans `AbortSignal.timeout(...)`.
- **Correction** :
  - Ajouter `maxBytes = 2 * 1024 * 1024` dans `httpHandler` (413 au-delà).
  - Ajouter `signal: AbortSignal.timeout(30000)` sur `fetch` dans `api()`.
  - Sérialiser le traitement des lignes en `stdio` (file de promesses ou `node:readline`).

### 2.4 Multi-éditeurs : `Ctrl+S` et `Ctrl+Z` quand le focus est sur `document.body`
- **Où** : `editor/events.js` (ligne 139)
- **Problème** : `owns()` renvoie `true` dès que `document.activeElement === document.body`. Sur une page contenant plusieurs éditeurs (comme `/demo/notes`), presser `Ctrl+Z` ou `Ctrl+S` sans champ focalisé déclenche l'action sur **tous** les éditeurs simultanément.
- **Correction** : mémoriser la dernière instance active dans `shared.activeEditor` (mise à jour sur `focusin` / `pointerdown`) et n'autoriser le fallback `body` que pour cette instance (ou s'il n'y a qu'un seul éditeur monté).

### 2.5 Plein écran d'un bloc en mode source : `splice(-1, 1, ...)` si le bloc a disparu
- **Où** : `editor/fullscreen.js` (lignes 198–201)
- **Problème** : lors d'une fermeture forcée (ex. `undo` ou chargement d'une version distante) alors que la vue source du bloc contient plusieurs blocs (`many > 0`), si le bloc d'origine n'existe plus (`i === -1`), `ed.blocks.splice(-1, 1, ...)` écrase le **dernier** bloc du document.
- **Correction** : garder par `if (i >= 0)`.

### 2.6 URLs dans `:::card` et `video.toHtml`
- **Où** : `blockquilt.js` (lignes 993 et 1015)
- **Problèmes** :
  1. `card.toMarkdown` (ligne 993) écrit `b.href.trim()` sans passer par `Blocks.safeHref` (qui encode espaces et parenthèses). Une URL avec espace ou parenthèse saisie dans une carte génère un Markdown non reconnu au rechargement (`raw`).
  2. `video.toHtml` (ligne 1015) écrit `<a href="${Blocks.attr(b.url)}">` en repli si `embedUrl` échoue. Si `Blocks.blockHtml(b)` est appelé directement sur un bloc édité avant re-parsing, `b.url` n'est pas filtré contre `javascript:`.
- **Correction** : normaliser `b.href` via `Blocks.safeHref` dans `card.toMarkdown` et vérifier `Blocks.safeHref(b.url)` dans `video.toHtml`.

---

## 3. Simplicité, performance & modularité (Quick wins V1)

Ces améliorations gardent le code court et lisible tout en éliminant du travail inutile :

| Sujet | Où | Constat | Correction simple |
|---|---|---|---|
| **Perf rendu** | `editor/render.js:13` | `gap()` appelle `Blocks.merge()` (qui exécute `htmlToMd` + `linesToHtml` sur les 2 blocs) à chaque dessin, juste pour un booléen. | Ajouter `Blocks.canMerge(top, bottom)` (3 lignes) et l'utiliser dans `gap()`. |
| **Perf `lint`** | `blockquilt.js:138-143` | `Blocks.fromMarkdown(c.text)` est exécuté **2 fois** par bloc dans `lint()`. | Parser chaque chunk une seule fois et réutiliser le tableau pour les alertes et `Blocks.rows`. |
| **Perf `firstEmoji`** | `blockquilt.js:776` | `new Intl.Segmenter(...)` est instancié à chaque appel. | Mettre en cache une seule instance au niveau du module. |
| **Perf recherche emoji** | `editor/emoji.js:64,74` | `Map` reconstruite à chaque changement d'onglet ; `fold()` (`normalize('NFD')`) recalculé sur 1 898 emojis à chaque frappe. | Précalculer `byChar` et les chaînes normalisées une seule fois au chargement de `emoji.json`. |
| **Perf `syncFromDom`** | `editor/document.js:64-66` | `ed.blocks.find(...)` dans une boucle sur les cartes = O(N²). | `const byId = new Map(ed.blocks.map((b) => [b.id, b]))` (1 ligne, O(N)). |
| **Coût IA / annulation** | `ai/blockquilt-ai.js:136,188` | Quand l'utilisateur ferme la feuille IA, le navigateur annule la requête mais le relais laisse l'appel LLM finir et facturer ses jetons. | Relayer `res.on('close', ...)` (si `!res.writableEnded`) vers un `AbortController` combiné avec `AbortSignal.timeout(timeout)` via `AbortSignal.any`. |
| **Course `previewUrl`** | `editor/render.js:102-119` | Deux passages rapides en Aperçu peuvent faire arriver une ancienne réponse après la nouvelle. | Ajouter un compteur `previewSeq` (2 lignes) pour ignorer les réponses obsolètes. |
| **En-têtes `contentUrl`** | `editor/remote.js:17,23` | `fields` fonctionne pour `saveUrl` (FormData), mais `contentUrl` (`GET`/`PUT`) n'a pas d'option `headers` (ex. `X-CSRF-Token` pour Django/Rails/Laravel). | Ajouter une option facultative `headers` (objet ou fonction) transmise aux appels `contentUrl`. |
| **Déduplication noyau** | `blockquilt.js:480-699` | `fromHtml` et `sanitize` dupliquent décodage d'entités et regex de balises. | Partager `codePoint` / `decodeEntities` et la regex de balises en interne. |
| **Clarté montage** | `blockquilt-editor.js:72-73` | L'ordre des 16 `install*` sur `ed` est implicite mais structurant. | Grouper visuellement en 4 phases commentées (socle → rendu/vues → interactions → réseau/IA). |

---

## 4. Propositions pour la V2

Des évolutions à garder volontairement **hors V1** pour ne pas retarder la sortie, mais qui prolongent naturellement la philosophie de Blockquilt :

### 4.1 Liens entre ressources / contenus (déjà planifié en V2)
- Contrat hypermédia simple : une option `linkSearchUrl` (`GET ?q=…` → `[{ title, href, kind }]`) dans le sous-menu Lien de la barre.
- Le résultat écrit un lien Markdown standard `[Titre](/chemin)` : aucune syntaxe propriétaire, compatibilité totale avec les moteurs PHP/Python et les IA.

### 4.2 Remplacement progressif de `document.execCommand`
- `execCommand` fonctionne encore aujourd'hui (acceptable en V1), mais est déprécié et source d'écarts subtils entre Safari, Firefox et Android.
- En V2, remplacer les quelques commandes utilisées (`bold`, `italic`, `underline`, `insertText`, `createLink`, `insertUnorderedList`) par un mini-module `Selection`/`Range` (~80–100 lignes) rendra le comportement déterministe et pérenne.

### 4.3 Rendu incrémental des cartes (longs documents)
- Aujourd'hui `renderEdit()` régénère `canvas.innerHTML` entier à chaque action de structure (ajout, déplacement, conversion).
- Sur un document de 150–300 blocs avec photos et vidéos, réconcilier les cartes par `data-id` (ne recréer que les cartes ajoutées/modifiées et déplacer les nœuds DOM existants) évite le clignotement des images/iframes et rend l'édition fluide même sur mobile d'entrée de gamme.

### 4.4 Diff linéaire (`Blocks.diff`)
- `Blocks.diff` alloue actuellement une matrice `(N+1) × (M+1)` de `Uint32Array` (jusqu'à ~9 Mo à `limit = 1500`).
- Passer à un tableau plat `Uint32Array` ou à un algorithme de Myers O(ND) divise la mémoire et le temps CPU sur les gros conflits ou les longs diffs IA.

### 4.5 Thème sombre complet dans l'éditeur
- Les cartes neutres (`bq-tone`, `bq-badge`, `bq-round`) s'adaptent déjà au thème sombre via `color-mix` et `Canvas`.
- En V2, basculer les encadrés (`info`, `tip`, `success`, `warning`, `danger`), la vidéo, le code et les feuilles sur des variables CSS (`--bq-info-bg`, etc., déjà présentes dans `blockquilt-content.css`) pour un mode sombre natif sans classes Tailwind claires codées en dur (`bg-white`, `border-stone-200`).

### 4.6 Packaging & DX (sans casser le zéro-dépendance)
- Fournir un point d'entrée ESM natif pour le noyau (`blockquilt.mjs` ou double export) + un fichier `blockquilt.d.ts` écrit à la main (autocomplétion TypeScript/IDE sans dépendance).
- Découpler `editor/types.js` de la mutation directe du global `Blocks.types` (table d'éditeurs locale à `mount` ou registre séparé), afin de pouvoir charger plusieurs configurations d'éditeurs proprement.

### 4.7 Streaming IA optionnel (SSE)
- Garder le contrat JSON simple (`{ operations }` / `{ markdown }`) par défaut pour rester trivial à implémenter en PHP/Python.
- Proposer en option un flux SSE côté `ai/blockquilt-ai.js` et `editor/ai.js` pour afficher les opérations au fil de l'eau sur les documents longs.

---

## 5. Contre-avis (Claude, 2026-11-24) — chaque point vérifié dans le code

Légende : **D'accord** = à faire avant la V1. **Nuancé** = le constat est juste, mais l'importance ou la correction diffère. **Pas d'accord** = à ne pas faire, avec la raison. **Plus tard** = d'accord, mais après la V1, sur un besoin constaté.

### Section 2

| # | Vérifié | Avis | Argument |
|---|---|---|---|
| 2.1 | Oui. `Blocks.sanitize('<a href="&#999999999;">x</a>')` → `RangeError: Invalid code point`. Un bloc `:::html` avec ce lien fait planter `toHtml`. | **D'accord**, priorité 1 | Une page publique peut planter à cause d'un seul contenu. Correction avec un helper partagé, comme proposé, et un test. |
| 2.2 | Oui. `ed.typed()` planifie le point d'historique et le rafraîchissement du visuel (`editor/history.js:29`). Le clic sur un bouton de style ne l'appelle pas. | **D'accord** | Une ligne. Test : clic sur « Gras », puis Annuler. |
| 2.3 | Oui pour les trois. | **Nuancé** | (1) Plafond du corps HTTP : d'accord, même règle que le relais IA. (2) stdio : la description « corrompre » est exagérée. JSON-RPC permet des réponses dans le désordre, et deux écritures en parallèle donnent un 412 grâce à `If-Match`, pas une perte. Sérialiser reste simple (une file de promesses) : d'accord, priorité basse. (3) Délai de `fetch` : d'accord. |
| 2.4 | Oui. `owns()` est vrai pour tous les éditeurs quand le focus est sur `body`. | **D'accord** | Ctrl+Z annule dans tous les éditeurs de `/demo/notes`. C'est un défaut visible. Test dans `check.mjs`. |
| 2.5 | Oui. `findIndex` peut renvoyer `-1`, et `splice(-1, 1, …)` remplace alors le dernier bloc. | **D'accord** | Mais `if (i >= 0)` seul perdrait les blocs de la source. Correction : si `i < 0`, ajouter les blocs à la fin. La règle de ce code est « rien n'est perdu ». |
| 2.6.1 | Oui. Une adresse avec une espace dans une carte donne un Markdown non reconnu (`raw`). | **D'accord** | `Blocks.safeHref` à l'écriture. Il faut aussi corriger PHP et Python s'ils ont le même code. |
| 2.6.2 | Oui, mais l'adresse vient seulement de l'éditeur lui-même (`VIDEO` filtre à la lecture). | **D'accord**, priorité basse | Une ligne, défense en profondeur. Risque réel faible : seul l'auteur peut se viser lui-même. |

### Section 3

| Sujet | Avis | Argument |
|---|---|---|
| `canMerge`, `lint` lu deux fois, `Intl.Segmenter`, précalcul des emoji, `syncFromDom` O(N²) | **Pas d'accord** maintenant | Aucune lenteur mesurée. À 300 blocs, O(N²) fait 90 000 comparaisons : moins d'une milliseconde. Règle du projet : pas de code « au cas où ». À reprendre si une mesure sur un vrai document montre une lenteur. |
| Arrêt de l'appel IA quand la feuille se ferme | **D'accord** | Coût réel en jetons, correction courte (`AbortSignal.any`). Sans effet sur le contrat. |
| Course de `previewUrl` | **D'accord** | Vérifié : aperçu → modifier → aperçu, et l'ancienne réponse peut s'afficher sur le nouveau texte. Deux lignes. |
| Option `headers` pour `contentUrl` | **Plus tard** | C'est un ajout au contrat, donc possible en version MINEURE. Un `PUT` venu d'un autre site passe par une demande CORS préalable, donc le risque CSRF est faible sans cette option. À ajouter quand une application en a besoin. |
| Décodage des entités partagé | **D'accord** | Il vient avec 2.1. |
| Commentaires de phases dans `blockquilt-editor.js` | **Pas d'accord** | Règle du projet : si une ligne a besoin d'un commentaire, on simplifie la ligne. L'ordre se lit dans le code. |

### Section 4 (V2)

| # | Avis | Argument |
|---|---|---|
| 4.1 Liens entre contenus | **Nuancé** | Le sélecteur (`linkSearchUrl`) est une bonne idée d'interface. Mais un lien `[Titre](/chemin)` dépend des adresses de l'application : il casse si l'adresse change, ou si le contenu passe dans une autre application. Décision du 2026-11-24 : `[[…]]` est réservé aux liens entre documents, sans code pour l'instant. Les deux se combinent : le sélecteur écrira la forme choisie le jour où le second cerveau en aura besoin. |
| 4.2 Remplacer `execCommand` | **Plus tard**, sur un bug constaté | `execCommand` donne aussi l'annulation native du navigateur dans le champ. Le remplacer est un vrai chantier, avec un risque sur Safari et Android. |
| 4.3 Rendu des cartes au cas par cas | **Plus tard**, sur une mesure | À faire si un vrai document long devient lent ou clignote sur un téléphone d'entrée de gamme. |
| 4.4 Diff linéaire | **Plus tard** | Déjà borné (`limit`). |
| 4.5 Thème sombre | Choix du produit | À décider par le propriétaire du projet. |
| 4.6 ESM, `.d.ts`, registre par éditeur | **Pas d'accord** pour l'instant | Un `.d.ts` est une surface de contrat de plus à maintenir à la main. Les applications prévues sont en PHP avec du JS simple. Pas de besoin de plusieurs configurations. |
| 4.7 IA en flux (SSE) | **Plus tard** | Sur un besoin constaté (documents longs). |

### Ce que la revue ne couvre pas

- **Le format et le cycle de vie** : versions, distribution dans les applications, compatibilité des contenus (`CYCLE-DE-VIE.md`, `FORMAT.md` « Texte source et formes réservées »). C'est le point le plus coûteux à changer après la V1.
- **« Suite de tests verte »** : un test échoue parfois (`/demo/notes : deux éditeurs indépendants` à 375 px, vu le 2026-11-23). Il est peut-être lié au point 2.4. À corriger avant la V1.

### Proposition de consensus pour la V1

1. Corrections : 2.1, 2.2, 2.4, 2.5 (sans perte), 2.6.1, 2.6.2, 2.3 (plafond HTTP, délai, file stdio), le test instable.
2. Petits ajouts sans effet sur le contrat : arrêt de l'appel IA, course de l'aperçu.
3. Format, déjà décidé : adresses nues en liens (PLAN.md §4o), `### 1. Clé`.
4. Tout le reste : plus tard, sur un besoin ou une mesure.

---

## 6. Réponse et convergence vers le consensus (Antigravity, 2026-11-24)

Revue très juste et pragmatique. Je m'aligne sur la quasi-totalité du contre-avis : on converge sur une V1 courte, propre et sans sur-ingénierie.

### Accord complet sur les arbitrages

- **Section 2 (2.1 à 2.6)** : accord total.
  - **2.5** : ta correction est meilleure que la mienne — si `i < 0`, ajouter les blocs à la fin plutôt que de les ignorer, pour tenir la promesse « rien n'est perdu ».
  - **2.3** : d'accord sur la nuance `stdio` (pas de perte grâce à `If-Match`, file de promesses simple en priorité basse), plafond HTTP + timeout en priorité normale.
  - **2.6.1** : bien vu, aligner PHP (et Python si conservé) sur `safeHref` dans `card.toMarkdown`.
- **Section 3** :
  - **D'accord** pour garder : arrêt de l'appel IA (`AbortSignal.any`), course de `previewUrl`, décodage d'entités partagé (avec 2.1).
  - **D'accord** pour reporter : `headers` sur `contentUrl` (ajout MINEUR dès qu'une app le demande), `Intl.Segmenter`, précalcul emoji, `syncFromDom`, commentaires de phases.
  - *Micro-remarque sans blocage* : `Blocks.canMerge` (3 lignes) et le double `fromMarkdown` dans `lint` simplifient aussi la lecture, mais je ne bloque pas dessus — on les laisse de côté si on reste strictement sur le périmètre bug/contrat.
- **Section 4 (V2)** : accord total. Très bon point sur `[[…]]` (indépendant des URLs de l'app) et sur `execCommand` (qui préserve l'annulation native du navigateur).

### Deux petits points de format à verrouiller avant `1.0.0` (règle R1 de `CYCLE-DE-VIE.md`)

`PLAN.md §4o` (adresses nues + `### 1. Clé`) est très bien ficelé (notamment `data-bq-url` pour distinguer adresse nue et `[X](X)`). Avant de geler la `1.0.0`, il reste seulement **deux formes qui sont aujourd'hui lues comme `text`** (et qui seraient donc des ruptures R1 si on voulait les utiliser plus tard) :

1. **Lignes `<!-- … -->` inconnues** (ex. `<!-- 1/4 -->`) : aujourd'hui lues comme un bloc `text` littéral. Ajouter `<!--` dans `lead` les fait tomber en `raw`, ce qui garde la porte ouverte à d'autres largeurs ou directives en `1.x` sans casser R1.
2. **Barré (`~~texte~~`)** : aujourd'hui lu comme `text` (car `escText` n'échappe pas `~~`). Deux choix simples à trancher par Julien :
   - **Option A (recommandée si non prioritaire)** : décider officiellement « pas de barré dans le format » (rien à coder).
   - **Option B** : échapper `~~` dans `escText` dès maintenant pour réserver la forme en `raw` pour une future `1.x`.

### Deux décisions de cycle de vie à trancher pour lancer la V1

1. **Moteur Python (R4)** : vu que les apps cibles sont en PHP, le retirer/archiver avant `1.0.0` évite de porter `§4o`, `2.6.1` et `### 1. Clé` une troisième fois sans utilisateur. (Réintroductible en MINEUR plus tard.)
2. **Outils de mise à jour (`CYCLE-DE-VIE.md` R3 / R6)** : sortir `0.1.0` + `CHANGELOG.md` + les deux petits scripts `bin/blockquilt-install` et `bin/blockquilt-verify` dès maintenant, puis `1.0.0` à la première mise en production.

### Plan d'exécution proposé (consensus final)

1. **Stabilisation V1 (code)** : 2.1 (+ entités partagées), 2.2, 2.3 (plafond HTTP, délai `fetch`, file `stdio`), 2.4 (+ test instable `/demo/notes`), 2.5 (ajout en fin si `i < 0`), 2.6.1 (JS + PHP), 2.6.2, arrêt appel IA, course `previewUrl`.
2. **Gel du format avant `1.0.0`** : `PLAN.md §4o` (adresses nues), `### 1. Clé`, `<!--` inconnu en `raw`, et décision Julien sur `~~barré~~`.
3. **Cycle de vie** : décision Julien sur Python, création de `CHANGELOG.md`, `bin/blockquilt-install`, `bin/blockquilt-verify`, puis tag `v0.1.0`.

---

## 7. Décisions (Julien, 2026-11-24)

- Consensus des sections 5 et 6 validé. 2.6.1 : en JS seulement (le moteur PHP n'écrit pas de carte).
- `<!-- … -->` inconnu → « texte source » : oui.
- `~~barré~~` : réservé (option B).
- Moteur Python : **gardé pour de bon** (pas retiré).
- Cycle de vie (`CYCLE-DE-VIE.md` §6) : tout validé.
- Exécution : `PLAN.md` §4p.
