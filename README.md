# blockquilt

Éditeur de contenu web par blocs : pages d'application, articles, posts, notes. On écrit dans des blocs colorés qui portent un sens (titre, texte, astuce, attention, photo, carrousel, code…) ; ce qui est enregistré est un texte Markdown lisible, modifiable à la main et productible par une IA.

- **Le texte est la source.** Un seul format : Markdown + frontmatter + blocs sémantiques ([FORMAT.md](FORMAT.md)). L'éditeur le relit sans perte : aucun contenu n'est perdu, ce qu'il ne sait pas refaire à l'identique reste un bloc « texte source », intact. Une édition peut normaliser la mise en page du texte (lignes vides, espaces en fin de ligne) ; les écritures ciblées (`edit_block`, opérations de l'IA) ne touchent pas aux autres blocs.
- **Un bloc = une entrée de registre.** Lecture, écriture, rendu HTML, carte d'édition : tout ce qui concerne un type est au même endroit (`Blocks.register`).
- **Mobile d'abord.** Chaque écran est conçu et testé à 375 px.
- **Aucune dépendance**, aucune étape de build pour le JS.

## Essayer

```sh
docker compose up                 # démo sur http://localhost:8080/
docker compose run --rm check     # tests Node (noyau, contrat, MCP, relais IA) + parcours dans Chromium ; code de sortie ≠ 0 si rouge
docker compose run --rm check-python  # tests de conformité du moteur Python (renderers/python/)
docker compose run --rm check-php     # tests de conformité du moteur PHP + intl (renderers/php/)
```

La démo enregistre pour de vrai : le document va dans `dev/data/document.md`, les photos dans `dev/data/media/`. Pour repartir du document de démo, supprimer `dev/data/`. Sans Docker : `node dev/server.js` (Node 22), puis `node tests/blocks_test.cjs`.

`/app` est une **application de démo** : deux utilisateurs, chacun ses contenus (user1 : guides 1A et 1B ; user2 : guide 2A), édités par l'éditeur et exposés par le contrat ci-dessous (« Contenus d'une application »).

## Intégrer

Pas à pas, avec un serveur PHP ou Flask : [TUTORIEL.md](TUTORIEL.md).

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

`mount` est aussi accessible par `window.Blockquilt.mount` une fois le module chargé. Il renvoie `{ getMarkdown(), setMarkdown(md), save(), undo(), redo(), checkRemote(), version, destroy() }`. `save()` sans modification n'envoie rien et renvoie `true`. Plusieurs éditeurs peuvent cohabiter dans une page ; `destroy()` retire l'éditeur et tous ses écouteurs (il écrit d'abord le brouillon s'il reste des modifications). `Blockquilt.clearDrafts()` efface tout ce que blockquilt garde dans le navigateur (clés `blockquilt.*` : brouillons, affichage des blocs) : à appeler à la déconnexion.

Trois vues dans l'en-tête : **édition** par blocs, **texte source** (le Markdown complet, contrôlé par `Blocks.lint`) et **aperçu**. Le bouton **Visuel à côté** (icône deux colonnes) affiche un visuel à droite du texte, en blocs comme en source ; il est grisé en aperçu. Par défaut, deux panneaux dès 1024 px, un en dessous ; le choix est gardé dans le navigateur. Le visuel est toujours rendu par l'éditeur (`Blocks.toHtml`), même avec `previewUrl`, et ne suit pas le défilement. En revenant aux blocs depuis la source, le texte est relu, en une étape annulable.

Plein écran : l'éditeur entier (en-tête) ou un bloc seul (bouton sur la carte, sans l'habillage de la carte). C'est un `<dialog>` qui couvre toute la fenêtre, sans le plein écran du navigateur (pas de message « Pour quitter le plein écran… »). Échap ou l'icône « réduire » le quittent. Un bloc seul a en en-tête « Enregistrer » (comme Ctrl+S) et les flèches « Bloc précédent » / « Bloc suivant », qui passent au bloc voisin sans fermer. Il montre toujours le bloc en entier, même replié. Il n'a pas de visuel à côté.

| Option | Rôle |
|---|---|
| `source` | Texte du document au format blockquilt. |
| `onSave(markdown)` ou `saveUrl` | Enregistrer : fonction (peut renvoyer une promesse, une erreur levée est affichée) ou adresse. |
| `contentUrl`, `version` | À la place de `saveUrl` : l'adresse du contenu dans le contrat de l'application (« Contenus d'une application ») et sa version (`ETag`). L'éditeur enregistre par `PUT` + `If-Match` ; si le contenu a changé ailleurs (une IA, un autre onglet), rien n'est écrasé : une feuille montre qui, quand et les lignes qui changent, puis « Prendre l'autre version » (annulable), « Garder la mienne » ou « Plus tard ». Sans `version`, il la lit ; sans `source`, il lit aussi le texte. |
| `storageKey` | Nom du contenu pour garder, dans le navigateur (`localStorage`), l'affichage choisi par bloc (texte ou carrousel replié, aperçu du HTML). Par défaut `contentUrl`. Sans l'un ni l'autre, l'affichage est gardé le temps de la session seulement. Jamais écrit dans le Markdown. L'état suit la place et le type du bloc : il est réécrit à chaque dessin. Nomme aussi le brouillon (`draft`). Application à plusieurs utilisateurs sur un même appareil : mettre l'identifiant de l'utilisateur dans `storageKey`. |
| `draft` | Brouillon local, actif par défaut avec `storageKey` ou `contentUrl`. Le texte non enregistré est gardé dans le navigateur 1 s après une modification et quand la page se cache ; il n'y a plus de message du navigateur au départ. Au chargement suivant, un bandeau dans l'éditeur propose « Reprendre » (annulable) ou « Ignorer » ; il signale si le contenu a changé depuis. Avec `contentUrl`, un brouillon d'une ancienne version mène à la feuille de conflit à l'enregistrement. `false` : pas de brouillon, message du navigateur (appareil partagé). Si le navigateur refuse l'écriture (stockage plein ou bloqué), le message du navigateur revient. Limites : le brouillon reste sur cet appareil et ce navigateur ; deux onglets sur le même contenu : le dernier brouillon écrit gagne. |
| `collapseLines` | Replie au premier affichage un bloc texte, liste, citation, encadré, code, texte source ou carrousel de plus de N lignes de Markdown : N lignes visibles, un fondu, « … +X lignes » et « Déplier ». Défaut `5` ; `0` ne replie rien. Un bloc qui devient long pendant la frappe reste ouvert et montre « Replier ». Le choix de l'utilisateur prime et est gardé (`storageKey`). Un carrousel replié montre sa ligne de vignettes, avec son propre bouton. |
| `pollSeconds` | Avec `contentUrl` : revérifier toutes les N secondes (30 par défaut, `0` jamais) et au retour sur la page ; un changement d'ailleurs affiche un bandeau « Modifié par … il y a … », sans rien changer à l'écran. `checkRemote()` revérifie à la demande (par exemple sur un événement htmx). |
| `uploadUrl` | Envoi des photos. Sans elle, pas de photo. Sert aussi à rapatrier les photos d'une page collée (champ `url`, voir « Coller »). |
| `media` | Adresse des photos : `media/<id>` du texte devient `media + id` à l'écran (`media/` par défaut). |
| `previewUrl` | Aperçu rendu par le serveur. Sans elle, l'éditeur rend lui-même avec `Blocks.toHtml`. Le visuel à côté reste rendu par l'éditeur. |
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
| Photo (`uploadUrl`) | `photo` (fichier), ou `url` (adresse `https` d'une image à télécharger) | JSON `{ "id": "…" }` (le texte écrit `media/<id>`) ou `{ "src": "https://…" }`. Erreur : JSON `{ "error": "…" }`, affiché. Un serveur qui ne gère pas `url` répond 422 : l'adresse externe reste, rien ne casse. |
| Aperçu (`previewUrl`) | `text` | Fragment HTML. |
| IA (`aiUrl`) | `GET` → `{ uses: [{ id, label, scopes }] }`, les boutons de la feuille IA (facultatif : sans réponse, des boutons intégrés). `POST` : `scope` (`document` ou `block`), `use` (l'usage choisi, facultatif), `instruction`, `text` (document complet), `block` (Markdown du bloc si `scope=block`), `blocks` (document, hors vue source : liste JSON, `[0]` = frontmatter, `[n]` = bloc n), `range` (avec `blocks`, facultatif : `a-b`, les seuls blocs à modifier, ceux qu'on vient de coller ; réponse toujours en opérations, même pour un usage qui réécrit le document ; hors du document envoyé → 400) | JSON `{ "operations": "…" }` ou `{ "markdown": "…" }`. **Opérations** (document) : une proposition par opération, avec les différences mot à mot, à cocher une à une ; « Appliquer » fait une seule étape annulable. Une proposition dont le bloc a changé depuis l'envoi est périmée, jamais appliquée. Une proposition en alerte `Blocks.lint` est décochée. **Markdown** : passé par `Blocks.lint`, montré à côté de l'actuel ; en alerte, les boutons d'application sont désactivés, la case « Appliquer malgré les alertes » les réactive ; puis, au choix et annulable : document — remplacer, ajouter au début, à la fin ; bloc — remplacer, insérer au-dessus, dessous ; ou « Copier seulement » (rien ne change). |

Photos : le serveur vérifie le contenu, pas le type déclaré par le navigateur. La démo accepte JPEG, PNG, GIF et WebP de 5 Mo au plus (413 au-delà, 422 sinon). Pas de SVG envoyé par un utilisateur : servi sur le même domaine, il peut exécuter du script.

Photo par `url` (photos d'une page collée) : le serveur télécharge l'image lui-même, donc il doit se protéger contre les adresses internes (SSRF). L'éditeur n'envoie que des adresses `https`. Règles de `fetchImage` dans `dev/server.js`, à reprendre : `https` sur le port 443, sans identifiants ; seules les adresses IP publiques, vérifiées au moment de la connexion (dans le `lookup`, contre le « DNS rebinding ») ; 3 redirections au plus, revérifiées ; 10 s ; 5 Mo ; type reconnu aux premiers octets.

L'éditeur n'appelle aucun modèle d'IA et ne contient aucune clé : c'est le service désigné par `aiUrl` qui le fait. Un relais prêt à monter est fourni (« Relais IA » plus bas) ; la démo l'utilise, avec une transformation fixe (texte en majuscules) tant qu'aucune clé `AI_KEY` n'est donnée.

### Préférences dans le navigateur

L'éditeur garde dans `localStorage` seulement des préférences d'affichage. Sans stockage (navigation privée, données bloquées), le choix vaut pour la session :

- `blockquilt.views.<storageKey ou contentUrl>` : affichage par bloc (replié, aperçu). Absente sans `storageKey` ni `contentUrl`. Jamais dans le Markdown.
- `blockquilt.draft.<storageKey ou contentUrl>` : brouillon `{ text, version, base, at }` (texte non enregistré, version lue, empreinte du texte enregistré, date). Effacé à l'enregistrement, à « Ignorer » et dès qu'il n'y a plus rien à enregistrer. Absente avec `draft: false`.
- `blockquilt.split` : visuel à côté (`true` ou `false`). Sans choix gardé, deux panneaux dès 1024 px.
- `blockquilt.emoji` : emoji récents.

### Coller

Copier une partie d'une page web (ou d'un Google Docs), puis coller. Le HTML du presse-papiers devient des blocs :

- titres (h4 à h6 deviennent h3), paragraphes avec gras, italique et liens ;
- listes imbriquées, citations, code, lignes ;
- photos `https` avec leur légende, vidéos YouTube et Vimeo intégrées.

Un nouveau bloc commence à chaque paragraphe, titre, liste, citation, code ou photo. Un `<div>` (ou `section`, `article`, une ligne de tableau…) n'est qu'un saut de ligne dans le bloc en cours. Dans un texte en `white-space: pre` ou `pre-wrap`, les retours à la ligne sont gardés, et une ligne vide ouvre un nouveau bloc.

Retirés : scripts, styles, menus de navigation, ce qu'un lecteur d'écran ne lit pas (`aria-hidden="true"`, `hidden`, `display: none`), images `data:` ou relatives, petites icônes (moins de 48 px). Le gras fait par un style CSS (Google Docs) est perdu : seul le gras balisé reste.

Où coller :

- menu ⋯ d'un bloc : « Coller au-dessus » ou « Coller dessous ». Le menu lit le HTML, sinon le texte ;
- Ctrl+V dans un bloc plein : les blocs vont dessous. Dans un bloc vide : ils le remplacent ;
- menu d'ajout « Ajouter un bloc » : bouton « Coller » en tête. C'est la seule façon de coller dans un document vide sur mobile ;
- Ctrl+V d'une simple phrase : texte simple, au curseur. Ctrl+V ne marche que si le focus est dans l'éditeur.

Capture d'écran : Ctrl+V d'une image du presse-papiers ajoute un bloc photo, envoyé comme une photo choisie. Il va sous le bloc en cours, ou remplace un bloc vide.

Photos d'une page collée : chaque photo `https` est envoyée à `uploadUrl` (champ `url`), que le serveur télécharge. Elle devient `media/…`. Message, par exemple : « 3 photos importées · 1 photo gardée en lien externe ». Une photo refusée reste en lien externe. « Annuler » remet les adresses externes ; un second « Annuler » défait le collage.

IA sur les blocs collés (avec `aiUrl`) : après un collage de 2 blocs ou plus, un bandeau propose « 5 blocs collés · IA sur ces blocs · Fermer ». La feuille IA envoie tout le document (le contexte) avec `range`, et l'IA ne modifie que les blocs collés. Une proposition hors de ces blocs est montrée, mais désactivée. Le bandeau reste pendant la frappe. Il part à la modification suivante des blocs collés (Annuler, bloc remplacé ou déplacé), en vue source ou aperçu, ou par « Fermer ».

Limite : sur Firefox et Safari, le menu « Coller » peut demander une permission. Refusée, il colle du texte simple. Ctrl+V n'a pas cette limite.

### Au clavier

Ctrl+S enregistre, Ctrl+Z annule, Ctrl+Maj+Z ou Ctrl+Y rétablit (50 étapes), Ctrl+B / I / U mettent en forme, Ctrl+V colle (voir « Coller »), Alt+F10 donne le focus à la barre de mise en forme, les flèches haut et bas sur la poignée déplacent un bloc, Échap ferme un menu, le plein écran ou annule un glissement.

## Format

Voir [FORMAT.md](FORMAT.md) : la spécification en une page, écrite pour être donnée telle quelle à une IA. `Blocks.lint(texte)` contrôle un texte généré (frontmatter mal formé, bloc non fermé, encadré inconnu, bloc non reconnu).

## Rendu côté serveur

Le noyau tourne seul, sous Node ou dans une page publique, sans l'éditeur :

```js
const Blocks = require('./blockquilt.js');
const html = Blocks.toHtml(markdown, { media: '/media/' });   // <article class="bq-content">…</article>
const { meta, blocks } = Blocks.parse(markdown);              // meta.title, meta.icon, autres clés
const problems = Blocks.lint(markdown);                       // [{ line, message }]
const md = Blocks.fromHtml(pageHtml);                         // HTML collé (page web) → Markdown blockquilt, sans DOM
```

Modifier un contenu bloc par bloc (pour une IA, un serveur MCP…) sans identifiant dans le texte : un bloc est désigné par sa place et l'empreinte de son texte. Une écriture sur un bloc qui a changé depuis la lecture est refusée, jamais écrasée ; le reste du texte est gardé à l'identique.

```js
const { blocks } = Blocks.address(markdown);                  // [{ n, line, type, hash, text }], n depuis 1
const r = Blocks.changeBlock(markdown, { n: 3, hash: blocks[2].hash, mode: 'replace', markdown: '## Garage' });
// mode : replace | before | after | remove  →  { markdown } ou { error: { code: 'stale' | 'missing' | 'empty', message } }
Blocks.combine(markdown, texteIA, 'append');                  // replace | prepend | append
```

Sur la page publique, `blockquilt-content.js` (facultatif, sans dépendance) donne aux carrousels leurs flèches et leurs puces ; sans lui, un carrousel défile au doigt. Pour du contenu ajouté après le chargement : `BlockquiltContent.enhance(élément)`.

Le HTML produit est sémantique (`<h2 id>`, `<aside role="note">`, `<figure>`, `<blockquote>`, `<pre><code class="language-js">`…) et porte des classes `bq-*`, sans Tailwind ([RENDER.md](RENDER.md)). La feuille `blockquilt-content.css` (écrite à la main, couleurs en variables CSS `--bq-…`) suffit à l'afficher. Tout le texte est échappé ; le bloc HTML passe par `Blocks.sanitize` (liste blanche, voir `DECISIONS.md`).

**Sans Node côté serveur** : des moteurs de rendu autonomes en **Python** ([renderers/python/blockquilt_render.py](renderers/python/blockquilt_render.py)) et **PHP** ([renderers/php/BlockquiltRender.php](renderers/php/BlockquiltRender.php), extension `intl` requise) implémentent exactement le même contrat, validé contre les mêmes fixtures `tests/fixtures/*.md` ↔ `*.html`. L'application de référence (`dev/app.js`) illustre aussi le **rendu hybride** : le fragment `<article class="bq-content">` est pré-rendu et mis en cache sur disque par `ETag` à l'enregistrement ou à la première lecture.

## Contenus d'une application (pour les IA et les autres outils)

blockquilt ne stocke rien et ne connaît pas les utilisateurs : c'est l'application qui le fait. Pour qu'une IA (serveur MCP), un script ou htmx travaille sur ses contenus, l'application expose un seul contrat HTTP, ce qu'elle veut derrière (PHP, Node, fichiers, base de données) :

| Requête | Réponse |
|---|---|
| `GET /contents` | Les contenus que le jeton peut voir. `Accept: application/json` → `[{ id, title, updatedAt, updatedBy, etag, href }]` ; sinon HTML (liste de liens, fragment `<ul>` si `HX-Request`). |
| `GET /contents/{id}` | `Accept: text/markdown` → le texte, avec `ETag` (sa version) ; `text/html` → le rendu (`Blocks.toHtml`, fragment si `HX-Request`) ; `application/json` → infos + `markdown`. `If-None-Match` → 304. |
| `PUT /contents/{id}` | Corps `text/markdown`, `If-Match: <ETag lu>` obligatoire (`*` pour écraser). `204` + nouvel `ETag` ; `412` le contenu a changé depuis la lecture (rien n'est écrit) ; `428` sans `If-Match` ; `403` pas le droit ; `401` jeton inconnu. `X-Via: Claude` (facultatif) : par quoi passe la personne. |

Le jeton (`Authorization: Bearer …`, ou la session de l'application pour le navigateur) dit **qui** écrit ; l'application seule décide de ce qu'il peut voir et modifier, et note l'auteur de chaque version. Les blocs se désignent côté client par leur place et leur empreinte (`Blocks.address`) : l'application n'a pas à les connaître. Implémentation de référence : `dev/app.js`.

### Relais IA (l'IA dans l'éditeur)

`ai/blockquilt-ai.js` (Node 22, sans dépendance) est le service derrière `aiUrl` : il appelle un modèle par une API compatible OpenAI (OpenRouter, OpenAI, Mistral, Anthropic, Ollama…) avec `FORMAT.md` en consigne système. La clé reste sur le serveur ; chaque application installe le sien et le protège comme ses autres routes. Les **usages** (boutons de la feuille IA) sont à elle : chacun son libellé, sa consigne, son modèle et sa portée.

```js
const { createAi } = require('./ai/blockquilt-ai.js');
const ai = createAi({
  baseUrl: 'https://openrouter.ai/api/v1', apiKey: process.env.AI_KEY, model: 'anthropic/claude-sonnet-4.5',
  uses: [
    { id: 'corriger', label: 'Corriger', instruction: 'Corrige l’orthographe…' },
    { id: 'resumer', label: 'Résumer', instruction: 'Résume…', model: 'mistralai/mistral-small', scopes: ['document'] },
  ],
});
app.all('/api/ai', ai.handler);   // GET : usages ; POST : { markdown }
```

Le contrat (en tête du fichier) se réécrit en quelques lignes ailleurs, en PHP par exemple. `params` ajoute des champs à la requête du modèle (pour tous les usages, ou par usage) : avec un modèle qui « réfléchit » avant de répondre, `{ reasoning: { effort: 'low' } }` (OpenRouter) évite qu'il épuise `maxTokens` (16 000 par défaut) sans répondre. Une réponse coupée par la limite est toujours refusée, jamais renvoyée.

**Opérations** : sur le document, si l'éditeur envoie `blocks` (liste JSON : `[0]` = frontmatter, `[n]` = bloc n), le modèle reçoit le document numéroté et ne renvoie que les changements, `{ operations: "@@ remplacer 3\n…" }` (verbes `remplacer`, `avant`, `après`, `supprimer` ; `@@ rien` = rien à changer). Réponse plus courte : moins de jetons écrits, moins de risque de coupure ; plus rapide sur un long document. Un usage qui restructure tout déclare `output: 'document'` et reçoit le document entier, comme avant.

**Limites** : `limits: { maxChars, perUserDay, globalDay }` (absent ou `0` = pas de limite). Au-delà de `maxChars` caractères envoyés (document + bloc + consigne) : 413. Jetons du jour (`usage.total_tokens` du modèle) au-delà de `perUserDay` pour une personne, ou de `globalDay` pour tout le site : 429. Compteurs en mémoire, remis à zéro à minuit (heure du serveur) et au redémarrage. La personne vient de `userOf(req)` : le jeton `Authorization: Bearer` par défaut ; `null` = seul le plafond global compte. L'éditeur affiche le message d'erreur dans la feuille IA. Garder aussi une limite de crédit chez le fournisseur. **Attente et taille** : `timeout` (120 000 ms par défaut) arrête un modèle trop lent (504) ; `maxBytes` (2 Mo) refuse une demande trop grosse avant de la lire en entier (413).

La démo utilise ce relais : une clé dans `.env` (`AI_KEY=…`, fichier ignoré par git), puis `docker compose up -d` ; `AI_MODEL`, `AI_BASE_URL`, `AI_REASONING` (`low` par défaut) pour régler. Sans clé, elle met le texte en majuscules. Ses limites : 20 000 caractères, 50 000 jetons par personne (jeton, sinon adresse IP) et 500 000 pour tout le site, par jour.

### Serveur MCP (Claude Code)

`mcp/blockquilt-mcp.js` (Node 22, sans dépendance) donne ces contenus à une IA, par-dessus le contrat ci-dessus et avec le jeton reçu : il ne stocke rien et ne décide d'aucun droit. Outils : `get_format`, `list_contents`, `read_content` (version et blocs numérotés `[n · empreinte · type]`), `edit_block` (`replace`, `before`, `after`, `remove`), `write_content` (`replace` avec la version lue, `prepend`, `append`), `lint`. Tout Markdown est contrôlé par `Blocks.lint` avant écriture ; une écriture sur un contenu changé depuis la lecture est refusée.

```sh
# En local (stdio) : l'adresse de l'application et le jeton de la personne
claude mcp add blockquilt -e BQ_URL=http://localhost:8080/ -e BQ_TOKEN=demo-user1 -- node /chemin/blockquilt/mcp/blockquilt-mcp.js
# En ligne (HTTP) : l'application monte httpHandler, ici la démo publique
claude mcp add --transport http blockquilt https://web.byjulien.com/blockquilt/mcp --header "Authorization: Bearer demo-user1"
```

Essayé avec Claude Code. Pas encore avec ChatGPT : son connecteur MCP distant demande une connexion OAuth, la démo n'a que des jetons.

`mcp/SKILL.md` est le skill qui va avec (règles d'écriture, quand utiliser quel outil) : à copier dans `~/.claude/skills/blockquilt/`. Une application monte la version HTTP en quelques lignes : `const { httpHandler } = require('./mcp/blockquilt-mcp.js'); app.post('/mcp', httpHandler({ base: 'https://exemple.org/' }))`.

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

Facultatifs côté écran : `onInput(card, ui)` (appelé à chaque frappe dans la carte), `tools(b, view)` (boutons à côté du type ; un bouton `data-toggle-view` bascule la carte entre `data-view="edit"` et `data-view="preview"`, avec les classes `bq-view-code` / `bq-view-preview`), `fullscreen: false` (pas de bouton plein écran), `ai: false` (pas d'« IA sur ce bloc » : bloc sans texte, comme la ligne horizontale).

## Fichiers

| Fichier | Rôle | Taille (gzip) |
|---|---|---|
| `blockquilt.js` | Noyau `Blocks` : format, registre des types, rendu HTML, `lint`, `sanitize`. Sans DOM. | 40 ko (13 ko) |
| `blockquilt-editor.js` | Écran, module ES : `mount` ; assemble les modules de `editor/`. | 103 ko au total avec `editor/` (30 ko) |
| `editor/` | Un module par sujet, de 7 à 175 lignes : `document` (état, texte, enregistrement), `render` (cartes), `actions` (structure, menus, copier / coller), `history` (annuler / rétablir), `views` (affichage gardé par bloc), `bar` (mise en forme, listes), `source` (vues), `fullscreen`, `drag`, `media` (photos, carrousel), `emoji`, `ai`, `ai-ops` (propositions de l’IA une à une), `sheets` (feuilles), `remote` (versions et conflits), `events` (clics, clavier), `template` (HTML), `types` (cartes d'édition des types), `icons`, `shared`. | |
| `blockquilt.css` | CSS de l'éditeur, généré par Tailwind 3.4.17 (`./build-css`). Ne pas modifier à la main. | 30 ko (7 ko) |
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
| `mcp/blockquilt-mcp.js`, `mcp/SKILL.md` | Serveur MCP générique (stdio et HTTP) et son skill. | |
| `tests/mcp_test.mjs` | Tests du serveur MCP sur l'application de référence (HTTP et stdio). | |
| `ai/blockquilt-ai.js`, `tests/ai_test.mjs` | Relais IA compatible OpenAI et ses tests (faux fournisseur). | |
| `dev/check.mjs`, `dev/Dockerfile.check` | Parcours complet dans Chromium headless piloté en CDP (375 px et 1280 px). | |
| `dev/build-emoji.mjs` | Fabrique `emoji.json` depuis Unicode et CLDR (lancé une fois). | |
| `dev/shot.mjs` | Capture d'écran de la démo (outil de développement). | |
| `dev/demo-media/` | Photos du document de démo. | |

## Licence

MIT (voir `LICENSE`). Les polices de `fonts/` restent sous leur propre licence, SIL OFL 1.1. `emoji.json` est tiré des données Unicode (`emoji-test.txt`) et CLDR (annotations françaises), sous la licence Unicode (Unicode License v3, https://www.unicode.org/license.txt) ; il est fabriqué par `dev/build-emoji.mjs`. Les tracés d'icônes viennent de Lucide (licence ISC).
