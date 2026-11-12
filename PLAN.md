# Plan d'implémentation de AMELIORATIONS.md

Destinataire : le modèle qui implémente. Lire d'abord `README.md`, `DECISIONS.md`, `AMELIORATIONS.md`, puis `blockquilt.js` en entier.

## 1. Cap

blockquilt devient un éditeur de contenu web généraliste (app, blog, posts, notes), plus seulement l'éditeur de rubrique d'easyHomeGuide. Trois idées tiennent le tout :

1. **Le texte est la source.** Un seul format pivot : Markdown + frontmatter + blocs sémantiques. Lisible et modifiable à la main, productible par une IA, relu par l'éditeur sans perte.
2. **Un bloc = une entrée de registre.** Lecture, écriture, rendu HTML, carte d'édition : tout ce qui concerne un type est au même endroit. Ajouter un bloc ne touche à rien d'autre.
3. **Mobile d'abord.** Chaque écran est conçu et testé à 375 px, puis élargi.

## 2. Règles permanentes

- Aucune dépendance npm, aucune étape de build pour le JS (Tailwind reste pour le CSS de l'éditeur, via `./build-css`).
- Ne jamais abîmer un texte : ce que l'éditeur ne sait pas refaire à l'identique reste un bloc `raw`.
- Chaque phase se termine par `docker compose run --rm check` vert (code de sortie 0), puis un commit. Pas de phase suivante sur du rouge.
- Chaque comportement nouveau a son test : noyau dans `tests/blocks_test.cjs`, écran dans `dev/check.mjs` (Chromium, 375 px).
- Chaque arbitrage : une ligne dans `DECISIONS.md`.
- Textes de l'interface en français, comme aujourd'hui.
- Après toute modification du code : `docker compose -f docker-compose.web.yml restart` pour la démo publique.

## 3. Décisions prises

Toutes validées par Julien.

| # | Proposition | Pourquoi | Phase touchée |
|---|---|---|---|
| A | Encadrés écrits `> [!tip]`, types `info`, `tip`, `success`, `warning`, `danger`, plus la citation simple `>` | Syntaxe de GitHub et d'Obsidian : les IA la connaissent, elle s'affiche déjà correctement ailleurs | 3 |
| B | Aucune compatibilité avec l'ancien format : il n'existe aucun contenu à migrer. L'éditeur lit et écrit uniquement le format du §4 | Un seul format, pas de code de reprise à écrire ni à tester | 3 |
| C | Le HTML produit porte des classes `bq-*` et une petite feuille `blockquilt-content.css` écrite à la main, sans classes Tailwind | La page publique n'a plus besoin de Tailwind ; HTML propre pour le SEO et les IA | 3 |
| D | Bloc HTML : filtré par une liste blanche courte de balises et d'attributs, jamais de `<script>`, `<style>` ni `on*=` | Sans filtre, tout contenu collé ou généré peut exécuter du code chez le lecteur | 8 |

Décisions prises par Julien :

- **Tailwind dans le bloc HTML** : seules les classes déjà présentes dans le CSS de l'application hôte fonctionnent. Pas de script Tailwind Play, pas de build à la volée. Une classe absente du CSS de l'hôte est gardée dans le texte mais reste sans effet. Conséquence à connaître avec C : sur une page publique sans Tailwind, un bloc HTML s'affiche sans ces styles.
- **Colonnes** : abandonnées pour le moment. Rien à coder, rien à réserver dans le format. Un `:::columns` écrit à la main reste un bloc `raw`.

## 4. Format pivot (cible)

````markdown
---
title: Arrivée
icon: 🏡
---

## Garage

### Détail

Texte avec **gras**, *italique*, ++souligné++, ==surligné== et [lien](https://exemple.fr).

- puce

> [!tip]
> Garez-vous à gauche.

> [!warning] 🚭 Titre facultatif
> Ne pas fumer.

> Une citation simple.

![Légende](media/abc123)

https://youtu.be/dQw4w9WgXcQ

---

```js
du code affiché tel quel
```

:::carousel
![Légende 1](media/a)
![Légende 2](media/b)
:::

:::html
<div class="grid">…</div>
:::
````

Règles :

- Frontmatter : seulement en tête, lignes `clé: valeur` à plat. `title` et `icon` sont lus par l'éditeur ; toute autre clé est gardée telle quelle et réécrite dans le même ordre.
- Le titre du document vit dans le frontmatter. Dans le corps, `##` est un H2 et `###` un H3.
- Ligne d'un encadré : `> [!type]`, puis facultatifs un emoji (icône choisie) et un titre.
- `---` seul entre deux lignes vides : ligne horizontale.
- Un bloc `:::` ne contient jamais un autre `:::` (lecture en une passe, pas de récursion).
- Pas d'ancien format : `## 🏡 Titre` en première ligne, `> 💡 …`, `> 🧭 …` et `:::sensible` ne sont plus des écritures reconnues. Le code qui les lit est supprimé (phase 3), pas conservé « au cas où ». Un texte écrit ainsi reste lisible : il tombe en H2, en citation ou en bloc `raw`, sans perte.

## 5. Phases

### Phase 0 — Point de départ

- 0.1 Commiter l'état actuel (rendu `Blocks.toHtml`, `docker-compose.web.yml`, `AMELIORATIONS.md`, `PLAN.md`).
- **Vérifier** : `git status` propre, `docker compose run --rm check` vert (116 lignes `ok` aujourd'hui).

### Phase 1 — Épurer (aucune fonction nouvelle)

Couvre : « enlever les éléments non liés à l'éditeur », « garder un code simple ».

- 1.1 Supprimer `app.js` (363 lignes d'easyHomeGuide : séjours, PWA, import PDF). L'éditeur n'en utilise que l'ouverture et la fermeture des `<dialog>` (`[data-dialog]`, `[data-close]`, clic sur le fond) : reprendre ces ~25 lignes dans `blockquilt.js`. Retirer `app.js` de `tailwind.config.js` et de `index.html`.
- 1.2 Supprimer `reference/` et `docs/` (kit et spec d'easyHomeGuide ; l'historique git les garde).
- 1.3 Renommer `#ehg` → `#bq`, `ehg-*` → `bq-*` (JS, CSS, HTML, tests).
- 1.4 Retirer la fausse IA locale (`[data-ai-block]`, `[data-ai-generate]` : des expressions régulières présentées comme de l'IA) et le type `audio` « bientôt disponible ». La vraie IA revient en phase 9.
- 1.5 Retirer les tests qui lisent le source pour des retours d'easyHomeGuide (`src.includes(...)`, « Feedback 6 »).
- **Vérifier** : `grep -rn "ehg\|easyhomeguide\|homebook\|séjour" --include=*.js --include=*.html --include=*.css .` ne renvoie rien hors `DECISIONS.md` ; check vert ; la démo locale s'ouvre, enregistre, envoie une photo.

### Phase 2 — Registre de blocs (aucun changement visible)

Couvre : « sémantique et extensible ».

Aujourd'hui un type est réparti dans sept endroits : `TYPES`, `fromMarkdown`, `toMarkdown`, `blockHtml`, `blank`, `body`, `syncFromDom`.

- 2.1 Dans le noyau : `Blocks.register(type, def)` avec
  - `label`, `short`, `icon`, `group` (`text` | `media`), `tone` (classes de la carte et du badge) ;
  - `match(md)` → modèle ou `null` ; `toMarkdown(b)` ; `toHtml(b, ctx)` ; `blank()` ;
  - `convertible` (vrai pour les types texte) remplace `TEXT_KEYS`.
- 2.2 Côté écran : `def.edit(b, ui)` → HTML de la carte, `def.read(card, b)` → met à jour le modèle. Ces deux fonctions sont ajoutées par la partie écran, pas par le noyau (le noyau reste utilisable sous Node).
- 2.3 `fromMarkdown` devient : essayer `match` dans l'ordre d'enregistrement, garder le premier modèle dont `toMarkdown` redonne le texte, sinon `raw`.
- 2.4 Réenregistrer les types actuels avec ce mécanisme. Supprimer les `switch`.
- 2.5 Séparer en deux fichiers : `blockquilt.js` (noyau pur : format, registre, rendu) et `blockquilt-editor.js` (écran). Le noyau seul suffit à un serveur ou à une page publique.
- **Vérifier** : tous les tests existants passent sans modification de leurs attentes ; nouveau test « type inconnu enregistré à la volée » (enregistrer un type `demo` dans le test, vérifier lecture, écriture, rendu, puis qu'il apparaît dans le menu d'ajout via check.mjs).

### Phase 3 — Format pivot et HTML sémantique

Couvre : « format pivot clair », « éléments sémantiques classiques », « H2 / H3 », « ligne horizontale », « code », « HTML sémantique, AI friendly, SEO friendly », « AI compliant ».

- 3.1 Frontmatter : `Blocks.parse` renvoie `{ meta, blocks }`, `Blocks.serialize(meta, blocks)`. Sans frontmatter, le document n'a simplement ni titre ni icône.
- 3.2 Types : `h2`, `h3` (remplacent `title`), `text`, `quote`, `info`, `tip`, `success`, `warning`, `danger`, `photo`, `video`, `hr`, `code`, `raw`. Encadrés : un seul gabarit paramétré par le type, champs `icon` et `title` facultatifs.
- 3.3 Supprimer le code de l'ancien format : titre de rubrique en première ligne `##` (`splitHeading`, `heading()`), encadrés par emoji (`💡 🧭 ⚠️ 🚨 ❗`, champ `mark`), reprise de `:::sensible`, type `advice`. Réécrire les tests qui s'appuyaient dessus avec le nouveau format ; ne pas les garder en double.
- 3.4 Rendu `Blocks.toHtml(md, { media })` :
  - `<article class="bq-content">` ; `<h2>`, `<h3>`, `<p>`, `<ul>`, `<ol>`, `<hr>` ;
  - encadré : `<aside class="bq-callout bq-callout-tip" role="note">` avec titre en `<p class="bq-callout-title">` ;
  - citation : `<blockquote>` ; photo : `<figure><img alt loading="lazy"><figcaption>` ;
  - code : `<pre><code class="language-js">` ; `<strong>`, `<em>`, `<u>`, `<mark>` ;
  - identifiants d'ancre sur `h2` et `h3` (titre en minuscules, sans accents, tirets).
- 3.5 `blockquilt-content.css` : feuille écrite à la main pour `.bq-content`, couleurs en variables CSS (`--bq-tip-bg`…). L'aperçu de l'éditeur la charge.
- 3.6 `Blocks.lint(md)` → liste de `{ line, message }` : `:::` non fermé, type d'encadré inconnu, frontmatter mal formé, bloc resté `raw`. Sert à contrôler un texte généré.
- 3.7 `FORMAT.md` : la spécification du §4 en une page, avec un exemple complet, écrite pour être donnée telle quelle à une IA.
- **Vérifier** :
  - dossier `tests/fixtures/` : un fichier par type et un document complet. Test « aller-retour » : `serialize(parse(x)) === x` pour chaque fichier ;
  - `grep -n "sensible\|splitHeading\|advice\|🧭" blockquilt*.js` ne renvoie rien ; `> 💡 texte` est lu comme une citation simple, `:::sensible … :::` comme un bloc `raw`, et tous deux sont réécrits à l'identique ;
  - l'exemple de `FORMAT.md` est lu par le test et ne produit aucun bloc `raw` ni aucune alerte `lint` ;
  - rendu : pas de `<script`, pas de `href="javascript`, un seul `<article>`, chaque `<img>` a un `alt` ;
  - check.mjs : l'aperçu montre un `aside.bq-callout-tip` et la photo chargée (`naturalWidth > 0`).

### Phase 4 — Intégration en une ligne et mise en page épurée

Couvre : « layout plus épuré », « mobile first », « intégration simple », « menu d'ajout plus dense », « titre de section mal centré ».

- 4.1 `Blockquilt.mount(element, options)` : l'éditeur fabrique lui-même son HTML (en-tête, zone de blocs, feuilles, icônes SVG). L'hôte n'a plus à recopier les 85 lignes de `index.html`. Options : `source`, `media`, `onSave(markdown)` ou `saveUrl`, `uploadUrl`, `previewUrl`, `aiUrl`, `backUrl`, `fields` (champs ajoutés aux envois, par exemple un jeton CSRF). Renvoie `{ getMarkdown(), setMarkdown(md), destroy() }`.
- 4.2 `index.html` : une `<div>`, un `<script>` avec `mount`, le document de démo. Le garder comme exemple d'intégration.
- 4.3 En-tête sur une ligne à 375 px : retour (si `backUrl`), icône, titre, puis à droite annuler, rétablir, aperçu, IA, enregistrer, plein écran. Les actions qui ne tiennent pas passent dans un menu « ⋯ ».
- 4.4 Carte de bloc : badge de type en haut à gauche, à droite une poignée et un bouton « ⋯ ». Retirer la ligne du bas (corbeille) et le rail de droite (monter, poignée, descendre) : ces actions vont dans le menu « ⋯ » de la phase 5. Cela règle le vide sous « Titre de section ». Cibles tactiles de 44 px.
- 4.5 Feuille d'ajout dense : une ligne par type, icône + nom (« H2 Titre », « Texte », « Astuce »…), en grille de 2 colonnes sur mobile, 3 au-delà, groupée par `group`. Construite depuis le registre.
- **Vérifier** (check.mjs, à 375 px puis à 1280 px) : aucune barre de défilement horizontale (`document.documentElement.scrollWidth <= innerWidth`) ; en-tête d'une hauteur ≤ 64 px ; carte H2 : écart entre le bas du texte et le bas de la carte ≤ écart du haut + 4 px ; chaque bouton mesure au moins 44 × 44 px à 375 px ; test « monter deux éditeurs dans la même page » (pas d'identifiant en double) ; `destroy()` retire tous les écouteurs (vérifier qu'un clic ne déclenche plus rien).

### Phase 5 — Interactions

Couvre : barre contextuelle stable, double clic et appui long, copier / coller, glisser-déposer, Ctrl+S, annuler / rétablir, plein écran.

- 5.1 **Annuler / rétablir.** Un instantané est le texte Markdown complet plus le bloc actif. Pris avant chaque action de structure (ajout, suppression, déplacement, fusion, scission, conversion, IA) et après 1 s sans frappe. Pile de 50 (un instantané pèse quelques ko ; 10 est court dès qu'on réorganise). `Ctrl+Z`, `Ctrl+Maj+Z`, `Ctrl+Y`, et deux boutons. Dans un champ en cours de frappe, laisser le navigateur annuler la frappe.
- 5.2 **Ctrl+S / Cmd+S** : enregistre, `preventDefault`.
- 5.3 **Barre de mise en forme stable.** Elle ne suit plus la sélection et n'est plus déplaçable. Position fixe, centrée : en bas de la fenêtre visible sur mobile (au-dessus du clavier, via `visualViewport`), sous l'en-tête sur ordinateur. Elle apparaît quand un champ riche a une sélection, sur double clic, appui long (450 ms) ou clic droit ; elle disparaît quand le champ perd le focus.
- 5.4 **Menu du bloc « ⋯ »** (feuille en bas sur mobile, menu flottant sur ordinateur) : changer de type, monter, descendre, dupliquer, copier, couper, coller dessous, plein écran, IA sur ce bloc (phase 9), supprimer (rouge, avec confirmation). Copier met le Markdown du bloc dans le presse-papiers ; coller lit du Markdown et le découpe en blocs avec `Blocks.parse`. La barre de mise en forme garde seulement le style du texte et « scinder » : deux menus à rôle net plutôt qu'un seul menu chargé.
- 5.5 **Glisser-déposer.** Pendant le glissement : la carte d'origine reste à sa place, estompée ; une copie réduite suit le doigt ; un trait bleu de 3 px marque l'emplacement d'arrivée ; les boutons « Insérer » et « Fusionner » sont masqués ; la page défile seule quand le doigt approche du haut ou du bas. L'ordre ne change qu'au lâcher. `Échap` annule.
- 5.6 **Plein écran.** Un seul mécanisme : un `<dialog>` ouvert par `showModal()` qui couvre toute la fenêtre (`100dvw × 100dvh`, couche supérieure du navigateur, `Échap` pour sortir, fond de page figé). Pour l'éditeur entier comme pour un bloc seul. En plus, `requestFullscreen()` quand le navigateur le permet, pour masquer sa barre d'adresse (absent sur iPhone : le dialogue suffit). Supprimer `.bq-fullscreen` (carte posée par-dessus la page).
- **Vérifier** (check.mjs) :
  - annuler : supprimer un bloc, `Ctrl+Z` → le texte Markdown est identique à avant ; `Ctrl+Y` → le bloc est de nouveau supprimé ; 60 actions puis 60 annulations → pas d'erreur, arrêt à la 50ᵉ ;
  - `Ctrl+S` → `document.md` écrit sur le disque ;
  - barre : sélectionner un mot ligne 1 puis un mot ligne 5 → même `getBoundingClientRect()` de la barre ; double clic → barre visible ; elle tient dans 375 px ;
  - copier un bloc, coller dessous → deux blocs identiques ; coller un texte de trois paragraphes → trois blocs ;
  - glissement : pendant le déplacement, l'ordre des `[data-id]` est inchangé et un seul `.bq-drop` existe ; après le lâcher, l'ordre a changé ; `Échap` → ordre d'origine ;
  - plein écran : le dialogue mesure exactement `innerWidth × innerHeight` à 375 px et à 1280 px ; `Échap` le ferme ; le texte tapé dedans est dans le modèle après fermeture.

### Phase 6 — Emoji et icônes

Couvre : « bibliothèque d'emoji », « plus d'emoji », « icône des blocs modifiable ».

- 6.1 `dev/build-emoji.mjs` : script lancé une fois, qui fabrique `emoji.json` (emoji, nom français, mots-clés, catégorie) depuis les fichiers Unicode `emoji-test.txt` et les annotations CLDR françaises. Le résultat est commité ; le script ne tourne pas chez l'utilisateur. Noter la licence Unicode dans le README.
- 6.2 Sélecteur d'emoji : chargé au premier usage (`fetch('emoji.json')`), recherche en français, onglets par catégorie, « récents » en `localStorage`, champ libre gardé pour coller un emoji.
- 6.3 Trois usages du même sélecteur : icône du document, icône d'un encadré (toucher l'icône → sélecteur → écrite sur la ligne `> [!tip] 🚭`), insertion dans le texte depuis la barre de mise en forme.
- **Vérifier** : `emoji.json` pèse moins de 150 ko et n'est pas demandé au chargement de la page (journal réseau de check.mjs) ; chercher « clé » propose 🔑 ; changer l'icône d'un encadré puis enregistrer → la ligne `> [!tip] 🔑` est dans `document.md`, et revient à l'ouverture.

### Phase 7 — Carrousel

Couvre : « carrousel de photos avec description ». Les colonnes sont hors périmètre.

- 7.1 **Carrousel** (`:::carousel`). Édition : vignettes en ligne, ajouter (plusieurs fichiers à la fois), réordonner, retirer, légende par photo. Rendu : défilement horizontal en CSS (`scroll-snap`), sans JavaScript, chaque photo dans un `<figure>` avec `<figcaption>`, points de repère en dessous.
- **Vérifier** : fixture et aller-retour ; carrousel de 3 photos → 3 `<figure>` dans le rendu, largeur de défilement > largeur visible à 375 px ; réordonner deux photos puis enregistrer → l'ordre des lignes change dans `document.md` ; envoi de 3 fichiers d'un coup → 3 vignettes ; `:::columns` écrit à la main → bloc `raw`, texte intact.

### Phase 8 — Bloc HTML

Couvre : « bloc code HTML (Tailwind disponible) ». Tailwind : les classes du CSS de l'hôte, rien de plus (voir §3).

- 8.1 `Blocks.sanitize(html)` dans le noyau, sans DOM (il doit tourner sous Node) : découpe par balises comme le fait déjà `htmlToMd`. Liste blanche courte et figée. Balises : `div`, `span`, `p`, `br`, `hr`, `h2` à `h4`, `ul`, `ol`, `li`, `strong`, `em`, `u`, `mark`, `small`, `a`, `img`, `figure`, `figcaption`, `table`, `thead`, `tbody`, `tr`, `th`, `td`. Attributs : `class` partout ; `href` sur `a` (http, https, mailto, tel) ; `src` (`media/…` ou https), `alt`, `width`, `height` sur `img` ; `colspan`, `rowspan` sur `th` et `td`. Tout le reste est retiré, y compris `svg`, `style=` et `id`. Allonger la liste demande une ligne dans `DECISIONS.md`.
- 8.2 Carte d'édition : zone de code à gauche (ou au-dessus sur mobile), aperçu filtré en direct.
- 8.3 Rendu : le HTML filtré dans `<div class="bq-html">`.
- **Vérifier** : jeu de 20 charges connues (`<script>`, `<img onerror>`, `javascript:` en majuscules ou avec entités, `<svg onload>`, `<iframe>`, `<style>`, `<a href="data:…">`, balise non fermée…) → aucune ne survit ; un tableau et une grille de `div` passent intacts ; aller-retour du texte source à l'identique.

### Phase 9 — IA

Couvre : « bouton IA au niveau de l'éditeur et du bloc ».

- 9.1 Contrat unique, fourni par l'hôte (`aiUrl`) : `POST` avec `scope` (`document` | `block`), `instruction`, `text` (Markdown du document), `block` (Markdown du bloc si `scope=block`). Réponse JSON `{ markdown }`. L'éditeur n'appelle aucun modèle lui-même et ne contient aucune clé.
- 9.2 Écran : une feuille avec une zone de consigne et quelques consignes prêtes (« corriger », « raccourcir », « en étapes », « traduire »). Ouverte depuis l'en-tête (document) ou depuis le menu « ⋯ » (bloc). La réponse passe par `Blocks.lint`, s'affiche en aperçu « avant / après », puis « Appliquer » ou « Ignorer ». Appliquer est annulable (phase 5.1).
- 9.3 Serveur de démo : `/api/ai` renvoie une transformation fixe et prévisible (pour les tests), ou appelle un vrai modèle si une variable d'environnement donne une clé. `FORMAT.md` sert de consigne système.
- **Vérifier** : IA sur un bloc → seul ce bloc change dans `document.md` ; IA sur le document → remplacé après « Appliquer », restauré par `Ctrl+Z` ; réponse avec un `:::` non fermé → l'alerte `lint` s'affiche et rien n'est appliqué sans confirmation ; sans `aiUrl`, aucun bouton IA n'apparaît.

### Phase 10 — Finitions

- 10.1 README réécrit : ce que c'est, intégration en dix lignes (`mount`), format (lien vers `FORMAT.md`), ajouter un bloc (exemple complet de `Blocks.register`), rendu côté serveur.
- 10.2 Document de démo qui montre chaque type de bloc.
- 10.3 Accessibilité : parcours complet au clavier (ajouter, déplacer, supprimer, mettre en forme), `aria-label` sur chaque bouton à icône, focus visible.
- **Vérifier** : un test de check.mjs fait tout le parcours sans souris ; taille totale du JS notée dans le README ; démo publique à jour.

## 6. Correspondance avec AMELIORATIONS.md

| Demande | Phase |
|---|---|
| Enlever ce qui n'est pas lié à l'éditeur | 1 |
| Titre de section : vide en bas | 4.4 |
| Éléments sémantiques classiques (danger, info, success, code…) | 3.2 |
| Bibliothèque d'emoji, plus d'emoji | 6 |
| HTML sémantique, AI et SEO friendly | 3.4 |
| Format pivot Markdown / frontmatter / blocs | 3 |
| Glisser-déposer avec trait bleu | 5.5 |
| Layout épuré, mobile first | 4 |
| Barre contextuelle stable | 5.3 |
| Double clic / appui long | 5.3 |
| Vrai plein écran, éditeur et bloc | 5.6 |
| Ctrl+S | 5.2 |
| Annuler / rétablir | 5.1 |
| IA sur le document et sur un bloc | 9 |
| Menu d'ajout plus dense | 4.5 |
| H2 / H3 | 3.2 |
| Carrousel | 7.1 |
| Ligne horizontale | 3.2 |
| Bloc HTML | 8 |
| Colonnes | Abandonné pour le moment |
| Copier / coller dans le menu | 5.4 |
| Menu contextuel ergonomique (question ouverte) | 5.3 + 5.4 : deux menus |
| Code simple, intégration simple | 1, 2.5, 4.1 |
| Une IA peut générer le contenu | 3.6, 3.7 |
| Sémantique et extensible | 2 |
| Icône des blocs modifiable | 6.3 |

## 7. Idées en plus (non demandées, à décider après la phase 5)

1. **Raccourcis de frappe Markdown** : taper `## `, `- `, `> ` ou `---` en début de bloc le convertit. Peu de code une fois le registre en place.
2. **Coller du Markdown n'importe où** : un texte collé qui contient plusieurs paragraphes devient plusieurs blocs (le mécanisme existe en 5.4).
3. **Vue « source »** : un troisième mode à côté d'édition et d'aperçu, qui montre le texte pivot dans une zone de texte modifiable. Rend concret « modifiable à la main ».
4. **Brouillon local** : copie dans `localStorage` toutes les quelques secondes, proposée à la réouverture si l'enregistrement n'a pas eu lieu.
5. **Commande `/`** : taper `/` dans un bloc vide ouvre le menu d'ajout filtré au clavier.

## 8. Risques

- **Barre au-dessus du clavier sur iPhone** (5.3) : `visualViewport` se comporte différemment selon les versions de Safari. Chromium ne le reproduit pas : essai manuel sur un vrai iPhone nécessaire.
- **Bloc HTML** (8) : un filtre maison est un endroit où une faille passe facilement. Garder la liste blanche courte, et laisser le bloc désactivé par défaut (`options.html: true` pour l'activer).
