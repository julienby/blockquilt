# Cycle de vie de blockquilt

Ce document dit comment blockquilt évolue et comment les applications le suivent.
Il s'applique à toutes les applications qui l'utilisent : easyhomeguide, le second cerveau, et les suivantes.

État au 2026-11-23 : aucune application n'utilise blockquilt. Pas de numéro de version, pas de tag.
C'est le bon moment pour fixer les règles. Après la première mise en production, chaque règle changée coûte une migration.

Les points marqués **À valider** attendent une décision. Chacun a une recommandation.

---

## 1. Le contrat : ce que les applications voient

Le contrat, c'est tout ce qu'une application utilise. Si on le change, une application peut casser.
Le reste est interne : on peut le changer librement.

| Surface | Où elle est décrite | Pourquoi elle compte |
|---|---|---|
| **Le format** (Markdown + blocs) | `FORMAT.md` | Les contenus vivent des années dans les bases des applications. C'est la surface la plus importante. |
| **Le HTML rendu** (balises, classes `bq-*`) | `RENDER.md`, `blockquilt-content.css` | Les pages publiques des applications l'affichent et le stylent. |
| **L'API de l'éditeur** (`mount`, ses options, l'objet renvoyé) | `README.md` « Intégrer » | Le code JS des applications l'appelle. |
| **Les variables CSS** (`--bq-*`) | `README.md` « Apparence » | Les applications règlent l'aspect avec elles. |
| **Les échanges avec le serveur** (`saveUrl`, `uploadUrl`, `previewUrl`, `aiUrl`, contrat `/contents`) | `README.md` « Échanges avec le serveur », « Contenus d'une application » | Le serveur de chaque application les implémente. |
| **Les moteurs de rendu** PHP et Python (`toHtml`, `sanitize`) | `RENDER.md` | Le serveur des applications les appelle. |
| **Les clés du navigateur** (`blockquilt.draft.*`, `blockquilt.views.*`) | `README.md` « Préférences » | Changer une clé perd les brouillons non enregistrés. |
| **Le serveur MCP et son skill** | `mcp/SKILL.md` | Les IA écrivent les contenus avec eux. |

Hors contrat : l'interface de l'éditeur (boutons, menus, disposition), les fichiers de `editor/`, le CSS de l'éditeur.
Une application ne doit pas en dépendre. Exemple : ne pas viser `[data-bar]` depuis le code d'une application.

## 2. Les règles à graver

### R1. Le format ne casse jamais à la lecture

Un document écrit avec une version de blockquilt est lu de la même façon par toutes les versions suivantes.

- On peut **ajouter** une syntaxe (un type de bloc, une option).
- On ne **change jamais le sens** d'une syntaxe existante.
- On ne **retire jamais** une syntaxe. Une syntaxe abandonnée reste lue.
- Une nouvelle syntaxe utilise seulement une forme qui est « texte source » aujourd'hui (`FORMAT.md`, « Texte source et formes réservées »). Le texte simple d'un bloc reconnu ne change jamais de sens.
- Les fichiers de `tests/fixtures/` sont la preuve. On ne modifie jamais un fichier existant de `tests/fixtures/` : on en ajoute. Si un changement oblige à modifier un fichier existant, c'est une rupture (voir R2).

Cas limites, acceptés parce qu'ils arrivent avant la première mise en production :
- les liens `/…` et `#…` (2026-11-23) : avant, `[x](/page)` restait du texte ; maintenant c'est un lien ;
- les adresses nues (prévu) : `Voir https://exemple.fr` deviendra un lien.

Après la `1.0.0`, ces deux changements seraient des ruptures.

### R2. Une seule version pour tout le dépôt, en SemVer

Un seul numéro pour le noyau JS, l'éditeur, les moteurs PHP et Python, le MCP et le relais IA.
Ils doivent rester identiques entre eux. Un numéro par morceau permettrait de mélanger des morceaux incompatibles.

Format `MAJEUR.MINEUR.CORRECTIF` :

| Changement | Exemple | Numéro |
|---|---|---|
| Correction sans effet sur le contrat | un bug d'affichage, une faille de `sanitize` | CORRECTIF (`1.2.0` → `1.2.1`) |
| Ajout au contrat, rien ne casse | un type de bloc, une option de `mount`, un bouton | MINEUR (`1.2.1` → `1.3.0`) |
| Rupture du contrat | une option retirée, une classe `bq-*` renommée, un changement de sens du format | MAJEUR (`1.3.0` → `2.0.0`) |

Chaque version a :
- un tag git `vX.Y.Z` ;
- une entrée dans `CHANGELOG.md`, écrite pour celui qui met à jour une application. Pour chaque entrée : ce qui change, et ce que l'application doit faire (souvent : rien).

**À valider — point de départ.** Recommandation : `0.1.0` maintenant. `1.0.0` le jour où la première application passe en production.
En `0.x`, tout peut encore changer. À partir de `1.0.0`, R1 et R2 s'appliquent sans exception.

### R3. Une application embarque une copie figée, dans un dossier qui porte la version

Chaque application contient sa propre copie des fichiers de blockquilt, pour une version précise.
Elle ne pointe jamais vers « la dernière version ».

```
app/assets/blockquilt/1.3.0/      ← fichiers du navigateur (blockquilt.js, blockquilt-editor.js, editor/, *.css, fonts/, emoji.json)
app/lib/blockquilt/1.3.0/         ← moteurs de rendu (BlockquiltRender.php, blockquilt_render.py)
app/assets/blockquilt/VERSION     ← « 1.3.0 » : la version utilisée, lue par les pages et par le serveur
```

Pourquoi le numéro dans le chemin :
- L'éditeur charge une vingtaine de modules (`editor/*.js`). Le navigateur les garde en cache, chacun pour lui.
  Avec un chemin fixe, après une mise à jour, le navigateur peut mélanger d'anciens et de nouveaux modules. L'éditeur casse alors chez certains utilisateurs seulement.
  Un nouveau chemin oblige le navigateur à tout recharger.
- Le moteur PHP et les fichiers du navigateur doivent être de la même version. Le même numéro dans les deux chemins le montre.

Pourquoi une copie, pas un CDN, un sous-module git ou un paquet Composer :
- Pas de build, pas de dépendance, pas d'accès réseau au démarrage.
- L'image Docker de l'application contient tout. Ce qui tourne en production, c'est ce qui est dans le repo de l'application.
- Revenir en arrière, c'est changer `VERSION`.

**Outil de copie** : `bin/blockquilt-install <version> <dossier de l'application>`. Il copie les fichiers du tag, écrit `VERSION`, et ne touche à rien d'autre. Il copie aussi le moteur Python dans `lib/` (R4).

### R4. La parité des moteurs est une condition de version

Une version sort seulement si les trois suites sont vertes : `check`, `check-php`, `check-python`.
Les trois moteurs lisent les mêmes fichiers de `tests/fixtures/` et doivent produire le même HTML.

**Décidé (2026-11-24) — le moteur Python reste, pour de bon.** Chaque changement du format se code donc trois fois (JS, PHP, Python). C'est un coût accepté.

### R5. Pas de code propre à une application dans blockquilt

blockquilt ne connaît aucune application. Un besoin d'une application devient une option générale, ou reste dans l'application.

Les types de bloc vivent dans blockquilt, pas dans les applications.
Un type ajouté par une seule application ne serait pas lu par les moteurs PHP et Python, ni par les autres applications. Il resterait un bloc « texte source » ailleurs.

### R6. Une application vérifie tous ses contenus avant de changer de version

Avant de déployer une nouvelle version dans une application, on passe sur **tous les contenus réels** de cette application :
1. Lire puis réécrire chaque contenu (`Blocks.parse` puis `Blocks.serialize`) : le texte doit rester identique.
2. Rendre chaque contenu avec l'ancienne et la nouvelle version, puis comparer le HTML. Chaque différence doit être annoncée dans `CHANGELOG.md`.

Les fichiers de `tests/fixtures/` couvrent les cas connus. Les contenus réels couvrent les cas que personne n'a imaginés.

**Outil** : `bin/blockquilt-verify <dossier de .md> <ancien tag> [nouveau tag]`, depuis le dépôt blockquilt. Il donne les deux résultats ; code 1 si une relecture n'est pas identique. Chaque application exporte ses contenus vers un dossier, puis lance le script.

### R7. Le contrat `/contents` est vérifiable contre n'importe quelle application

`tests/contents_test.mjs` vérifie aujourd'hui l'application de référence (`dev/app.js`).
Chaque application PHP réécrit ce contrat. Elle doit passer les mêmes tests.

**Outil** : `BQ_URL=… BQ_TOKEN=… node tests/contents_test.mjs` lance la partie générique du contrat contre l'application. Le premier contenu de la liste est modifié, puis remis à l'identique.

## 3. Sortir une version de blockquilt

1. Toutes les suites sont vertes : `docker compose run --rm check`, `check-php`, `check-python`.
   Un test qui échoue « parfois » se corrige avant la version.
2. Choisir le numéro avec le tableau de R2.
3. Écrire l'entrée de `CHANGELOG.md`.
4. Commit, puis tag `vX.Y.Z`, puis push du tag.

## 4. Mettre à jour une application

1. Lire les entrées de `CHANGELOG.md` entre la version actuelle et la nouvelle.
2. `bin/blockquilt-install X.Y.Z <dossier de l'application>`, depuis le dépôt blockquilt.
3. Vérifier les contenus réels (R6) : `bin/blockquilt-verify <export> vA.B.C vX.Y.Z`.
4. Faire ce que le `CHANGELOG.md` demande (souvent : rien).
5. Lancer les tests de l'application, puis déployer.
6. Après le déploiement, supprimer l'ancien dossier de version.

Retour arrière : remettre l'ancienne version dans `VERSION` et l'ancien dossier, puis redéployer.
Les contenus enregistrés entre-temps restent lisibles par l'ancienne version, sauf s'ils utilisent une syntaxe nouvelle (un MINEUR ajoute de la syntaxe).

Une correction de sécurité (`sanitize`, filtrage des liens et des images) se déploie dans **toutes** les applications, sans attendre.

## 5. Où tourne blockquilt

Tenir ce tableau à jour à chaque mise à jour d'une application.

| Application | Version | Moteur serveur | Contrat utilisé | Date |
|---|---|---|---|---|
| — | — | — | — | — |

## 6. Décisions prises avant d'ouvrir

Toutes validées le 2026-11-24, sauf la 3 : le moteur Python est gardé.

| # | Question | Recommandation |
|---|---|---|
| 1 | Point de départ des versions | `0.1.0` maintenant, `1.0.0` à la première mise en production (R2) |
| 2 | Distribution | Copie figée dans un dossier qui porte la version, par un script `bin/blockquilt-install` (R3) |
| 3 | Moteur Python | Gardé pour de bon (R4) |
| 4 | Vérification des contenus réels | Script `bin/blockquilt-verify` (R6) |
| 5 | Contrat `/contents` testable contre une application | `tests/contents_test.mjs` avec `BQ_URL` et `BQ_TOKEN` (R7) |
| 6 | Types de bloc propres à une application | Interdits : tout type vit dans blockquilt (R5) |
