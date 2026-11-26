# Changelog

Écrit pour la personne qui met à jour blockquilt dans une application.
Pour chaque version : ce qui change, puis ce que l'application doit faire (souvent : rien).
Règles des numéros : `CYCLE-DE-VIE.md`, R2. En `0.x`, le contrat peut encore changer.

## 0.3.1 — 2026-11-25

Correction :
- Le CSS de l'éditeur (`blockquilt.css`, Tailwind) ne vaut plus que dans l'éditeur. `mount` pose la classe `bq-root` sur l'élément reçu ; `destroy` la retire. Avant, dans une page qui a son propre Tailwind, les deux feuilles se gênaient selon leur ordre (`.hidden` de l'une contre `md:block` de l'autre). Rendu de l'éditeur inchangé (styles calculés identiques sur la démo, 375 et 1280 px).

À faire dans l'application : rien. Si elle comptait sur des classes de `blockquilt.css` pour sa propre page, les mettre dans sa feuille.

## 0.3.0 — 2026-11-25

Ajout :
- Option `sourceView: false` de `mount` : pas de vue « Texte source » (en-tête, plein écran d'un bloc, menu ⋯).

À faire dans l'application : rien.

## 0.2.0 — 2026-11-25

Ajouts :
- `getMeta()` / `setMeta(meta)` et l'option `onMeta(meta)` : le frontmatter devient des champs de l'application (titre, slug…).
- Option `blocks` de `mount` : les types de bloc proposés par les menus.
- Option `single: true` : un champ (un seul bloc, sans outils de bloc, en-tête réduit).
- Option `quiet: true` : écriture épurée (blocs sans cadre, outils seulement autour du bloc actif). Démo `/demo/story`.
- Barre de mise en forme sur téléphone : une seule ligne (boutons de 36 px de large).
- Bloc photo vide : bouton « Ajouter une photo » ; photo présente : bouton « Retirer la photo ».

Changements :
- L'éditeur reste en thème clair (fond blanc, texte foncé), même sur une page en mode sombre. Il ne reprend plus la couleur du texte de la page : une application qui veut une autre couleur pose `--bq-text`.
- Écran tactile : un bloc ajouté ou collé est amené à l'écran sans ouvrir le clavier ; on touche son texte pour taper. Le clavier ouvert, le point de saisie reste visible au-dessus de lui.

Retrait (rupture, permise en 0.x) :
- Option `title` : plus de titre ni d'icône du document dans la barre. Le frontmatter est gardé tel quel.

À faire dans l'application : si elle passe `title: true`, mettre un champ Titre dans son formulaire (`getMeta`, `setMeta`, `onMeta` ; exemple : `/demo/blog`), ou un bloc H1 dans le texte.

## 0.1.0 — 2026-11-24

Première version numérotée. Elle fixe le contrat décrit dans `CYCLE-DE-VIE.md` §1 :
le format (`FORMAT.md`), le HTML rendu (`RENDER.md`), l'API de `mount` (`README.md`),
les variables CSS `--bq-*`, les échanges avec le serveur, les moteurs PHP et Python, le MCP.

À faire dans l'application :
- Installer : `bin/blockquilt-install 0.1.0 <dossier de l'application>`.
- Avec `save: false` : appeler `markSaved(text)` avec le texte envoyé au serveur.
  `markSaved()` sans argument marche encore, mais il marque aussi enregistrée une frappe faite pendant l'enregistrement.
