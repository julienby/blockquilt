# Contrat de rendu HTML blockquilt

Ce document décrit la sortie HTML exacte attendue de tout moteur de rendu blockquilt (`blockquilt.js`, Python, PHP), afin que [blockquilt-content.css](blockquilt-content.css) et [blockquilt-content.js](blockquilt-content.js) fonctionnent à l'identique sans dépendre de l'éditeur.

La conformité de chaque moteur est vérifiée par les paires `tests/fixtures/*.md` ↔ `tests/fixtures/*.html` (option par défaut `{ media: 'media/', title: true }`).

---

## 1. Enveloppe et en-tête

Tout document rendu produit un fragment autonome :

```html
<article class="bq-content">
...
</article>
```

* **Options** :
  * `media` (chaîne, défaut `'media/'`) : préfixe remplaçant `media/` dans les `src` d'images (`media/abc` → `${media}abc`). Les URLs `https://…` restent inchangées.
  * `title` (booléen, défaut `true`) : si vrai, que `meta.title` est non vide et que le corps ne contient aucun bloc `h1`, ajoute en première ligne :
    ```html
    <header><h1><span class="bq-icon" aria-hidden="true">🏡</span> Titre</h1></header>
    ```
    (`span.bq-icon` est omis si `meta.icon` est absent/vide).

---

## 2. Mise en forme inline et paragraphes

* **Échappement HTML** : `&` → `&amp;`, `<` → `&lt;`, `>` → `&gt;` (et `"` → `&quot;` dans les attributs).
* **Échappement Markdown** : `\` suivi d'un signe (`\`, `` ` ``, `*`, `_`, `{`, `}`, `[`, `]`, `(`, `)`, `#`, `+`, `-`, `.`, `!`, `>`, `=`, `:`, `|`, `~`) rend le caractère littéral.
* **Styles inline** :
  * `` `code` `` → `<code>…</code>` (contenu échappé, sans récursion)
  * `**gras**` → `<strong>…</strong>`
  * `*italique*` → `<em>…</em>`
  * `++souligné++` → `<u>…</u>`
  * `==surligné==` → `<mark>…</mark>`
  * `[texte](url)` → `<a href="…">…</a>` (protocoles autorisés uniquement : `https://`, `http://`, `mailto:`, `tel:`).
* **Paragraphes et listes (`flowHtml`)** :
  * Lignes simples regroupées en `<p>ligne1<br>ligne2</p>`, séparées par les lignes vides.
  * Listes `- ` (`<ul>`) et `1. ` (`<ol>`), imbrication par indentation (`indent > parent.indent`).

---

## 3. Blocs

| Bloc | Sortie HTML |
|---|---|
| `h1`, `h2`, `h3` | `<h1 id="slug">…</h1>` (`h2`, `h3`). `slug` en minuscules sans accents (`a-z0-9` et `-`, défaut `'section'`), dédupliqué sur la page (`slug-2`, `slug-3`…). |
| `t1`, `t2`, `t3` | `<div class="bq-t1"><p>…</p></div>` (`bq-t2`, `bq-t3`), hors du plan et sans `id`. |
| `text` | Paragraphes `<p>` et listes `<ul>` / `<ol>` (`flowHtml`). |
| `quote` | `<blockquote>…</blockquote>` contenant `flowHtml`. |
| Encadrés (`info`, `tip`, `success`, `warning`, `danger`) | `<aside class="bq-callout bq-callout-<type>" role="note" aria-label="…">…</aside>`. Si icône ou titre : `<p class="bq-callout-title">[<span class="bq-icon" aria-hidden="true">…</span> ]Titre</p>` suivi de `flowHtml`. `aria-label` = titre ou libellé par défaut (`Info`, `Astuce`, `Succès`, `Attention`, `Danger`). |
| `photo` | `<figure><img src="…" alt="…" loading="lazy">[<figcaption>…</figcaption>]</figure>` (`figcaption` présent seulement si `alt` non vide). Avec `{size=… ratio=…}` : `<figure class="bq-photo-small|bq-photo-medium bq-ratio-16x9|bq-ratio-4x3|bq-ratio-1x1">`, taille puis format, chacune seulement si elle est écrite ; sans option, pas d'attribut `class`. |
| `carousel` | `<div class="bq-carousel" role="group" aria-roledescription="carrousel" aria-label="N photos"><div class="bq-carousel-track">…figures…</div><button type="button" class="bq-carousel-prev" aria-label="Photo précédente" hidden></button><button type="button" class="bq-carousel-next" aria-label="Photo suivante" hidden></button><div class="bq-carousel-dots" hidden></div></div>`. |
| `card` | `<div class="bq-card">[<img src="…" alt="…" loading="lazy">]<div class="bq-card-body">[<h3 class="bq-card-title">…</h3>][flowHtml][<p><a class="bq-card-link" href="…">…</a></p>]</div></div>`. |
| `video` | YouTube / Vimeo : `<figure class="bq-video"><iframe src="…" title="Vidéo" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></figure>`. Sinon lien `<p><a href="…">…</a></p>`. |
| `hr` | `<hr>` |
| `code` | `<pre><code[ class="language-…"]>…</code></pre>` |
| `html` | `<div class="bq-html">…contenu filtré…</div>` |
| `raw` | `<pre class="bq-raw">…texte échappé…</pre>` |

---

## 4. Lignes composées

Les blocs précédés de `<!-- 1/3 -->` (`2` sixièmes), `<!-- 1/2 -->` (`3` sixièmes) ou `<!-- 2/3 -->` (`4` sixièmes) sont regroupés dans `<div class="bq-row">…</div>` (fermée à `6` sixièmes ou avant un bloc pleine largeur) :

* Bloc normal : `<div class="bq-col bq-w{2|3|4}">…html du bloc…</div>`
* Bloc `space` (commentaire seul) : `<div class="bq-col bq-w{2|3|4} bq-space" aria-hidden="true"></div>`
* Une ligne ne contenant que des `space` n'est pas rendue.

---

## 5. Sanitisation du bloc `:::html`

* **Balises autorisées (`SAFE_TAGS`)** : `div`, `span`, `p`, `br`, `hr`, `h2`, `h3`, `h4`, `ul`, `ol`, `li`, `strong`, `em`, `u`, `mark`, `small`, `a`, `img`, `figure`, `figcaption`, `table`, `thead`, `tbody`, `tr`, `th`, `td`.
* **Balises supprimées avec leur contenu (`DROP_TAGS`)** : `script`, `style`, `iframe`, `frame`, `frameset`, `object`, `embed`, `applet`, `svg`, `math`, `template`, `noscript`, `noembed`, `noframes`, `textarea`, `title`, `select`, `option`, `xmp`, `plaintext`, `head`, `canvas`, `audio`, `video`, `button`, `form`.
* **Balises vides (`VOID_TAGS`)** : `br`, `hr`, `img`. Les balises non vides restées ouvertes sont fermées automatiquement.
* **Attributs autorisés** :
  * `class` sur toutes les balises.
  * `href` sur `a` (`https://`, `http://`, `mailto:`, `tel:` après décodage d'entités et suppression des caractères de contrôle/invisibles).
  * `src` (`https://` ou `media/[\w.-]+`), `alt` (forcé à `""` si absent), `width`, `height` (1 à 4 chiffres) sur `img`. Un `img` sans `src` valide est ignoré.
  * `colspan`, `rowspan` (1 à 4 chiffres) sur `th` et `td`.

---

## 6. Assets côté page publiée

Une page publiée n'embarque aucun fichier de l'éditeur (`blockquilt.js`, `blockquilt.css`, `editor/*`). Elle n'a besoin que de :
* `blockquilt-content.css` (styles autonomes sous `.bq-content`, personnalisables via `--bq-*`).
* `blockquilt-content.js` (facultatif : active les flèches/puces des carrousels ; sans lui le contenu reste lisible et le carrousel défile au doigt).
