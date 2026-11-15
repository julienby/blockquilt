# blockquilt

Éditeur de contenu web par blocs : pages d'application, articles, posts, notes. On écrit dans des blocs colorés qui portent un sens (titre, texte, astuce, attention, photo, carrousel, code…) ; ce qui est enregistré est un texte Markdown lisible, modifiable à la main et productible par une IA.

- **Le texte est la source.** Un seul format : Markdown + frontmatter + blocs sémantiques ([FORMAT.md](FORMAT.md)). L'éditeur le relit sans perte ; ce qu'il ne sait pas refaire à l'identique reste un bloc « texte source », intact.
- **Un bloc = une entrée de registre.** Lecture, écriture, rendu HTML, carte d'édition : tout ce qui concerne un type est au même endroit (`Blocks.register`).
- **Mobile d'abord.** Chaque écran est conçu et testé à 375 px.
- **Aucune dépendance**, aucune étape de build pour le JS.

## Essayer

```sh
docker compose up                 # démo sur http://localhost:8080/
docker compose run --rm check     # tests Node + parcours dans Chromium ; code de sortie ≠ 0 si rouge
```

La démo enregistre pour de vrai : le document va dans `dev/data/document.md`, les photos dans `dev/data/media/`. Pour repartir du document de démo, supprimer `dev/data/`. Sans Docker : `node dev/server.js` (Node 22), puis `node tests/blocks_test.cjs`.

`/app` est une **application de démo** : deux utilisateurs, chacun ses contenus (user1 : guides 1A et 1B ; user2 : guide 2A), édités par l'éditeur et exposés par le contrat ci-dessous (« Contenus d'une application »).

## Intégrer

```html
<link rel="stylesheet" href="blockquilt.css">          <!-- l'éditeur -->
<link rel="stylesheet" href="blockquilt-content.css">  <!-- le rendu (aperçu) -->
<div id="editor"></div>
<script src="blockquilt.js"></script>                <!-- le noyau Blocks -->
<script src="blockquilt-content.js"></script>        <!-- facultatif : flèches et puces des carrousels dans l'aperçu -->
<script type="module">
  import { mount } from './blockquilt-editor.js';     // module ES, sans build : il charge editor/*.js
  const editor = mount(document.getElementById('editor'), {
    source: '---\ntitle: Ma page\n---\n\nBonjour.',
    saveUrl: '/save', uploadUrl: '/upload', fields: { _csrf: '…' },
  });
</script>
```

`mount` est aussi accessible par `window.Blockquilt.mount` une fois le module chargé. Il renvoie `{ getMarkdown(), setMarkdown(md), save(), undo(), redo(), destroy() }`. Plusieurs éditeurs peuvent cohabiter dans une page ; `destroy()` retire l'éditeur et tous ses écouteurs.

Trois vues dans l'en-tête : **édition** par blocs, **texte source** (le Markdown complet, contrôlé par `Blocks.lint` et rendu en direct à côté ; en revenant aux blocs, le texte est relu, en une étape annulable) et **aperçu**.

Plein écran : l'éditeur entier (en-tête) ou un bloc seul (bouton sur la carte, sans l'habillage de la carte). C'est un `<dialog>` qui couvre toute la fenêtre, sans le plein écran du navigateur (pas de message « Pour quitter le plein écran… »). Échap ou l'icône « réduire » le quittent.

| Option | Rôle |
|---|---|
| `source` | Texte du document au format blockquilt. |
| `onSave(markdown)` ou `saveUrl` | Enregistrer : fonction (peut renvoyer une promesse, une erreur levée est affichée) ou adresse. |
| `uploadUrl` | Envoi des photos. Sans elle, pas de photo. |
| `media` | Adresse des photos : `media/<id>` du texte devient `media + id` à l'écran (`media/` par défaut). |
| `previewUrl` | Aperçu rendu par le serveur. Sans elle, l'éditeur rend lui-même avec `Blocks.toHtml`. |
| `aiUrl` | Assistant IA. Sans elle, aucun bouton IA. |
| `title` | `true` pour montrer le titre et l'icône du document dans l'en-tête (frontmatter `title` / `icon`). Absent par défaut : l'éditeur peut ne remplir qu'une partie d'une page ; le frontmatter est alors gardé tel quel. Pour un titre dans le contenu : un bloc H1. |
| `backUrl` | Bouton retour (avec confirmation si des modifications ne sont pas enregistrées). |
| `fields` | Champs ajoutés à chaque envoi (par exemple un jeton CSRF). |
| `html` | `true` pour proposer le bloc HTML (désactivé par défaut). |
| `width` | Largeur maximale du texte (CSS, `48rem` par défaut ; `100%` pour toute la largeur). L'éditeur prend la largeur de l'élément qui le contient : il s'intègre dans n'importe quelle mise en page. Aussi réglable en CSS : `--bq-width`. En plein écran, un bouton fait le tour de trois largeurs. |
| `emojiUrl` | Adresse de `emoji.json` (par défaut, à côté de `blockquilt-editor.js`). Chargé au premier usage du sélecteur. |

### Apparence

L'éditeur est neutre : il reprend la police et la couleur du texte de la page qui l'accueille, son fond est la couleur de fond du système (`Canvas`), ses lignes et ses fonds de carte sont tirés de la couleur du texte (lisibles sur fond clair comme sombre). Seuls les encadrés (info, astuce…), la vidéo, le code et le HTML gardent une teinte qui porte leur sens. Tout se règle par variables CSS, sur l'élément de l'éditeur ou n'importe quel parent :

| Variable | Rôle | Par défaut |
|---|---|---|
| `--bq-font` | Police | héritée |
| `--bq-text` | Couleur du texte | héritée |
| `--bq-surface` | Fond de l'éditeur, de l'en-tête et des feuilles | `Canvas` |
| `--bq-border` | Lignes et bordures neutres | texte à 14 % |
| `--bq-accent` | Couleur d'accent (enregistrer, focus, liens du rendu) | bleu `#0284c7` |
| `--bq-radius` | Arrondi des cartes | `1rem` |
| `--bq-width` | Largeur maximale de la colonne de texte (aussi option `width`) | `48rem` |
| `--bq-sticky-top` | Décalage de l'en-tête collant, sous la barre de l'application | `0px` |

```css
.mon-app .editeur { --bq-accent: #7c3aed; --bq-radius: 0.5rem; --bq-sticky-top: 64px; }
```

Le rendu publié (`blockquilt-content.css`) suit la même règle ; ses variables sont décrites en tête du fichier.

### Échanges avec le serveur

Tous en `POST multipart/form-data`, avec les champs de `fields`. Les fins de ligne de `text` arrivent en `\r\n` : les remettre en `\n` (voir `dev/server.js`).

| Action | Champs envoyés | Réponse attendue |
|---|---|---|
| Enregistrer (`saveUrl`) | `text` | Code 2xx. Sinon JSON `{ "error": "…" }`, affiché. |
| Photo (`uploadUrl`) | `photo` (fichier) | JSON `{ "id": "…" }` (le texte écrit `media/<id>`) ou `{ "src": "https://…" }`. |
| Aperçu (`previewUrl`) | `text` | Fragment HTML. |
| IA (`aiUrl`) | `scope` (`document` ou `block`), `instruction`, `text` (document complet), `block` (Markdown du bloc si `scope=block`) | JSON `{ "markdown": "…" }`. L'éditeur passe la réponse par `Blocks.lint`, montre avant / après, et n'applique qu'après « Appliquer » (annulable). |

L'éditeur n'appelle aucun modèle d'IA et ne contient aucune clé : c'est le service désigné par `aiUrl` qui le fait. Le serveur de démo répond par une transformation fixe (texte en majuscules), ou appelle Claude si `ANTHROPIC_API_KEY` est définie (`AI_MODEL` pour choisir le modèle), avec `FORMAT.md` en consigne système.

### Au clavier

Ctrl+S enregistre, Ctrl+Z annule, Ctrl+Maj+Z ou Ctrl+Y rétablit (50 étapes), Ctrl+B / I / U mettent en forme, Alt+F10 donne le focus à la barre de mise en forme, les flèches haut et bas sur la poignée déplacent un bloc, Échap ferme un menu, le plein écran ou annule un glissement.

## Format

Voir [FORMAT.md](FORMAT.md) : la spécification en une page, écrite pour être donnée telle quelle à une IA. `Blocks.lint(texte)` contrôle un texte généré (frontmatter mal formé, bloc non fermé, encadré inconnu, bloc non reconnu).

## Rendu côté serveur

Le noyau tourne seul, sous Node ou dans une page publique, sans l'éditeur :

```js
const Blocks = require('./blockquilt.js');
const html = Blocks.toHtml(markdown, { media: '/media/' });   // <article class="bq-content">…</article>
const { meta, blocks } = Blocks.parse(markdown);              // meta.title, meta.icon, autres clés
const problems = Blocks.lint(markdown);                       // [{ line, message }]
```

Modifier un contenu bloc par bloc (pour une IA, un serveur MCP…) sans identifiant dans le texte : un bloc est désigné par sa place et l'empreinte de son texte. Une écriture sur un bloc qui a changé depuis la lecture est refusée, jamais écrasée ; le reste du texte est gardé à l'identique.

```js
const { blocks } = Blocks.address(markdown);                  // [{ n, line, type, hash, text }], n depuis 1
const r = Blocks.changeBlock(markdown, { n: 3, hash: blocks[2].hash, mode: 'replace', markdown: '## Garage' });
// mode : replace | before | after | remove  →  { markdown } ou { error: { code: 'stale' | 'missing' | 'empty', message } }
Blocks.combine(markdown, texteIA, 'append');                  // replace | prepend | append
```

Sur la page publique, `blockquilt-content.js` (facultatif, sans dépendance) donne aux carrousels leurs flèches et leurs puces ; sans lui, un carrousel défile au doigt. Pour du contenu ajouté après le chargement : `BlockquiltContent.enhance(élément)`.

Le HTML produit est sémantique (`<h2 id>`, `<aside role="note">`, `<figure>`, `<blockquote>`, `<pre><code class="language-js">`…) et porte des classes `bq-*`, sans Tailwind. La feuille `blockquilt-content.css` (écrite à la main, couleurs en variables CSS `--bq-…`) suffit à l'afficher. Tout le texte est échappé ; le bloc HTML passe par `Blocks.sanitize` (liste blanche, voir `DECISIONS.md`).

## Contenus d'une application (pour les IA et les autres outils)

blockquilt ne stocke rien et ne connaît pas les utilisateurs : c'est l'application qui le fait. Pour qu'une IA (serveur MCP), un script ou htmx travaille sur ses contenus, l'application expose un seul contrat HTTP, ce qu'elle veut derrière (PHP, Node, fichiers, base de données) :

| Requête | Réponse |
|---|---|
| `GET /contents` | Les contenus que le jeton peut voir. `Accept: application/json` → `[{ id, title, updatedAt, updatedBy, etag, href }]` ; sinon HTML (liste de liens, fragment `<ul>` si `HX-Request`). |
| `GET /contents/{id}` | `Accept: text/markdown` → le texte, avec `ETag` (sa version) ; `text/html` → le rendu (`Blocks.toHtml`, fragment si `HX-Request`) ; `application/json` → infos + `markdown`. `If-None-Match` → 304. |
| `PUT /contents/{id}` | Corps `text/markdown`, `If-Match: <ETag lu>` obligatoire (`*` pour écraser). `204` + nouvel `ETag` ; `412` le contenu a changé depuis la lecture (rien n'est écrit) ; `428` sans `If-Match` ; `403` pas le droit ; `401` jeton inconnu. `X-Via: Claude` (facultatif) : par quoi passe la personne. |

Le jeton (`Authorization: Bearer …`, ou la session de l'application pour le navigateur) dit **qui** écrit ; l'application seule décide de ce qu'il peut voir et modifier, et note l'auteur de chaque version. Les blocs se désignent côté client par leur place et leur empreinte (`Blocks.address`) : l'application n'a pas à les connaître. Implémentation de référence : `dev/app.js`.

## Ajouter un type de bloc

Un appel à `Blocks.register`, après `blockquilt.js`. `match` lit le texte du bloc (ou renvoie `null`), `toMarkdown` le réécrit : un bloc n'est reconnu que si l'écriture redonne exactement le texte lu. `edit` et `read` sont facultatifs : sans eux, le bloc s'édite comme texte source.

```js
Blocks.register('quote-author', {
  label: 'Citation signée', short: 'Signée', icon: 'quote', group: 'text',
  tone: { card: 'bg-white border-stone-200 text-stone-800', badge: 'bg-stone-100 text-stone-700 border-stone-200' },
  // :::quote Victor Hugo
  // Le texte…
  // :::
  match: (t) => { const m = /^:::quote (.+)\n([\s\S]+)\n:::$/.exec(t); return m ? { author: m[1], text: m[2] } : null; },
  toMarkdown: (b) => (b.text.trim() ? `:::quote ${b.author}\n${b.text}\n:::` : ''),
  toHtml: (b) => `<figure class="bq-quote"><blockquote><p>${Blocks.esc(b.text)}</p></blockquote><figcaption>${Blocks.esc(b.author)}</figcaption></figure>`,
  blank: () => ({ author: '', text: '' }),
  // Côté écran (facultatif) : HTML de la carte, puis lecture de la carte vers le modèle.
  edit: (b) => `<input data-author value="${Blocks.attr(b.author)}" aria-label="Auteur" class="w-full">
                <textarea data-text aria-label="Citation" class="w-full">${Blocks.esc(b.text)}</textarea>`,
  read: (card, b) => { b.author = card.querySelector('[data-author]').value; b.text = card.querySelector('[data-text]').value; },
});
```

Le type apparaît aussitôt dans le menu d'ajout (groupe `text`, `media` ou `structure`). `icon` : un nom de `Blockquilt.icons`.

Facultatifs côté écran : `onInput(card, ui)` (appelé à chaque frappe dans la carte), `tools(b, view)` (boutons à côté du type ; un bouton `data-toggle-view` bascule la carte entre `data-view="edit"` et `data-view="preview"`, avec les classes `bq-view-code` / `bq-view-preview`), `fullscreen: false` (pas de bouton plein écran).

## Fichiers

| Fichier | Rôle | Taille (gzip) |
|---|---|---|
| `blockquilt.js` | Noyau `Blocks` : format, registre des types, rendu HTML, `lint`, `sanitize`. Sans DOM. | 35 ko (12 ko) |
| `blockquilt-editor.js` | Écran, module ES : `mount` ; assemble les modules de `editor/`. | 90 ko au total avec `editor/` (27 ko) |
| `editor/` | Un module par sujet, de 7 à 175 lignes : `document` (état, texte, enregistrement), `render` (cartes), `actions` (structure, menus, copier / coller), `history` (annuler / rétablir), `bar` (mise en forme, listes), `source` (vues), `fullscreen`, `drag`, `media` (photos, carrousel), `emoji`, `ai`, `sheets` (feuilles), `events` (clics, clavier), `template` (HTML), `types` (cartes d'édition des types), `icons`, `shared`. | |
| `blockquilt.css` | CSS de l'éditeur, généré par Tailwind 3.4.17 (`./build-css`). Ne pas modifier à la main. | 29 ko (7 ko) |
| `blockquilt-content.css` | CSS du rendu publié, écrit à la main. | 7 ko (2 ko) |
| `blockquilt-content.js` | Facultatif, pour la page publique : flèches et puces des carrousels. | 2 ko (1 ko) |
| `emoji.json` | Bibliothèque d'emoji (nom français, mots-clés, catégorie), chargée au premier usage. | 121 ko (37 ko) |
| `FORMAT.md` | Le format, pour les humains et les IA. | |
| `index.html` | Démo et exemple d'intégration : un document qui montre chaque type de bloc. | |
| `blockquilt.src.css`, `tailwind.config.js`, `build-css` | Source du CSS de l'éditeur. Relancer `./build-css` après tout changement de classes. | |
| `fonts/` | Plus Jakarta Sans et Newsreader, hébergées (SIL OFL 1.1). | |
| `tests/blocks_test.cjs`, `tests/fixtures/` | Tests Node du noyau : un fichier par type, aller-retour exact. | |
| `dev/server.js` | Serveur de démo et de test, Node seul. | |
| `dev/app.js`, `dev/contents/` | Application de référence : utilisateurs, jetons, contenus en `.md`, contrat `/contents`, page `/app`. | |
| `tests/contents_test.mjs` | Tests du contrat HTTP (droits, ETag / If-Match, auteur). | |
| `dev/check.mjs`, `dev/Dockerfile.check` | Parcours complet dans Chromium headless piloté en CDP (375 px et 1280 px). | |
| `dev/build-emoji.mjs` | Fabrique `emoji.json` depuis Unicode et CLDR (lancé une fois). | |
| `dev/shot.mjs` | Capture d'écran de la démo (outil de développement). | |
| `dev/demo-media/` | Photos du document de démo. | |

## Licence

MIT (voir `LICENSE`). Les polices de `fonts/` restent sous leur propre licence, SIL OFL 1.1. `emoji.json` est tiré des données Unicode (`emoji-test.txt`) et CLDR (annotations françaises), sous la licence Unicode (Unicode License v3, https://www.unicode.org/license.txt) ; il est fabriqué par `dev/build-emoji.mjs`. Les tracés d'icônes viennent de Lucide (licence ISC).
