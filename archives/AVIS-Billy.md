# Avis de Billy — lancement de la V1

17 novembre 2026. Revue de la documentation, lecture ciblée du code et exécution des tests. Aucun code applicatif modifié.

## Mon avis

**Le projet a un bon socle et un périmètre déjà suffisant pour une V1 utile. Je recommande un lancement après quelques corrections précises. Je déconseille de l’ouvrir au public en l’état avec une clé IA active.**

Le problème principal n’est pas un manque de blocs ou de fonctions. C’est la confiance : garder le texte, comprendre ce que l’IA va changer, maîtriser les coûts et enregistrer sans écraser une autre version.

Je considère ici la V1 comme un **éditeur intégrable dans une application**, avec une démonstration publique. Le projet ne promet pas encore un service autonome de publication avec comptes, facturation et gestion complète des contenus. Cette distinction doit rester claire dans la présentation.

Les liens vers d’autres ressources restent en V2, conformément à ta demande. Je parle ici de connexions entre contenus ou ressources, pas des liens ordinaires déjà présents dans le texte.

## Ce qui est bien et mérite de rester

- **Le texte comme source.** Le Markdown reste lisible et transportable. L’IA peut le produire sans dépendre du fonctionnement interne de l’éditeur. C’est une vraie qualité du produit.
- **La conservation des formes inconnues.** Garder un bloc source vaut mieux que transformer ou supprimer un contenu que l’éditeur ne comprend pas.
- **Une séparation claire des responsabilités.** L’éditeur édite. L’application stocke et gère les droits. Le relais appelle les modèles. Le serveur MCP donne un autre accès aux mêmes contenus. Je ne propose pas de refonte.
- **Deux accès IA déjà concrets.** L’assistant dans l’éditeur et les outils externes travaillent sur le même format. Ce n’est pas seulement une intention dans la documentation.
- **La main reste à l’utilisateur.** Aperçu de la proposition, choix d’application, annulation et affichage des conflits : ces choix vont dans le bon sens.
- **Un travail réel sur l’usage.** Vue source, plein écran par bloc, repli des longs textes, clavier et petits écrans couvrent des besoins pratiques.
- **Des tests substantiels.** Ils couvrent le noyau, les échanges HTTP, le MCP, le relais IA et des parcours dans Chromium. Cela donne une base sérieuse pour corriger sans tout fragiliser.

L’absence de dépendance npm à l’exécution simplifie aussi l’intégration. Il faut toutefois préciser que la génération du CSS utilise Tailwind et que le contrôle navigateur utilise Chromium. « Aucune dépendance » mérite ce contexte.

## À corriger avant une ouverture publique

### 1. Le serveur de démo sert le fichier `.env`

**Bloquant si ce serveur est exposé.**

Dans `dev/server.js`, la route des fichiers interdit `dev/` et `.git/`, mais autorise les autres fichiers situés à la racine. Le dépôt contient un `.env`. La configuration publique monte cette racine dans le conteneur et utilise ce serveur.

Reproduction sur une instance locale jetable, sans afficher le contenu :

```text
GET /.env : HTTP 200 (corps non affiché)
```

Cela suffit à établir que le serveur peut publier ce fichier. Je n’ai pas interrogé le site public. Un éventuel filtre du proxy public n’a donc pas été vérifié.

**Recommandation :** servir uniquement les ressources nécessaires à l’éditeur, avec une liste explicite de fichiers et répertoires publics. Interdire seulement quelques noms laisse le problème ouvert pour les prochains fichiers sensibles.

**Critère de sortie :** `.env`, fichiers cachés et documents internes ne sont pas accessibles ; les ressources de l’éditeur fonctionnent toujours. Si une clé réelle a été exposée sur un déploiement accessible, la révoquer et la remplacer.

### 2. La protection contre les écritures concurrentes a une faille

**Bloquant pour tenir la promesse « ne jamais écraser une autre version ».**

Dans `dev/app.js`, le serveur lit le document et vérifie `If-Match`, puis attend le corps de la requête avant d’écrire. Deux requêtes peuvent passer le contrôle sur la même version et écrire ensuite chacune leur texte.

Reproduction locale : deux requêtes PUT sont ouvertes avec le même ETag. Leur corps arrive en plusieurs morceaux. Les deux passent le contrôle avant la fin de la première écriture.

```text
Deux PUT concurrents, même ETag : 204 / 204
```

La seconde écriture remplace alors la première. Les tests actuels couvrent le conflit après une écriture terminée, mais ne suffisent pas à couvrir ce cas.

**Recommandation :** dans cette implémentation à un seul processus Node, lire le corps avant de relire la version, puis vérifier et écrire sans attente intermédiaire. Dans une application à plusieurs processus, le stockage doit assurer lui-même cette opération conditionnelle.

**Critère de sortie :** pour deux écritures concurrentes fondées sur la même version, une seule réussit ; l’autre reçoit 412. Ajouter ce scénario aux tests du contrat.

### 3. Encadrer les appels IA et les envois de fichiers

**Bloquant pour une démo publique avec une clé payante.**

F5 est encore ouvert dans `PLAN.md`. Le relais actuel n’a ni quota, ni limite du corps reçu, ni délai maximal explicite pour l’appel au fournisseur. La route IA de la démo ne vérifie pas d’identité. La route photo accepte un type déclaré `image/*`, conserve le fichier tel quel et ne fixe pas de taille maximale dans le code lu.

**Le minimum utile :**

- Limiter les octets reçus avant de charger tout le corps en mémoire, pour l’IA comme pour les photos.
- Limiter la taille du document envoyé au modèle et fixer un délai maximal d’appel.
- Limiter les appels simultanés et le budget global ; conserver un plafond de crédit chez le fournisseur.
- Réserver les quotas individuels à une identité vérifiée. Les jetons publics de la démo ne constituent pas des comptes personnels.
- Pour la V1, limiter les photos à des formats raster attendus et vérifier leur contenu côté serveur. Éviter de servir du SVG actif envoyé librement sur la même origine.

Le comptage des jetons après réponse est utile, mais ne réserve pas le coût des appels déjà en cours. Des compteurs en mémoire sont acceptables pour une petite démo à un processus, à condition d’assumer leur remise à zéro au redémarrage.

**Critère de sortie :** une demande trop grosse, un quota dépassé et un fournisseur trop lent donnent des erreurs compréhensibles. Aucun appel supplémentaire ne part quand la limite est atteinte. Pas besoin d’un système de facturation en V1.

## L’IA : essentielle en V1, avec une promesse plus précise

### Le mode document actuel prête à confusion

Le relais demande au modèle de renvoyer **le document complet**. L’interface propose ensuite « Ajouter au début » ou « Ajouter à la fin ». Pour « ajoute une astuce », ces boutons peuvent ajouter une copie du document entier. Ton retour dans `AMELIORATIONS.md` décrit donc un vrai défaut d’usage.

**Mon conseil pour lancer sans grossir le projet :** garder la modification d’un bloc, et présenter le mode document actuel comme une proposition de révision complète. Pour cette réponse complète, proposer remplacer, copier ou ignorer. Ne proposer l’insertion d’un fragment que si l’usage demande explicitement un fragment.

Le projet reste ainsi centré sur l’IA dès la V1 : création, correction, traduction, révision globale et accès externe sont déjà utiles.

Le plan d’opérations sur plusieurs blocs de `PLAN.md §4c` répond à un besoin réel. Il demande toutefois validation du format, gestion des opérations incompatibles, contrôle de version et acceptation des changements. **Je ne rendrais pas toute cette interface obligatoire pour sortir une première V1.** En revanche, si la promesse de lancement est « modifier plusieurs blocs de façon ciblée », cette fonction devient nécessaire avant de faire cette promesse. C’est le choix produit à trancher.

### Une proposition doit rester liée à la demande qui l’a produite

Dans `editor/ai.js`, l’état `ai` est partagé entre les ouvertures de la feuille. La requête ne possède pas son propre contrôle de validité à son retour. Fermer puis rouvrir la feuille, ou déclencher plusieurs usages pendant une attente, mérite un test précis : une réponse ancienne pourrait être présentée dans un autre contexte.

**Recommandation :** lier chaque réponse à sa demande et à son document de départ. Ignorer une réponse devenue obsolète. Désactiver les autres déclencheurs pendant une demande, ou annuler explicitement la précédente. Ce risque vient de la lecture du code ; je n’ai pas reproduit ce parcours dans le navigateur.

### Un format valide ne prouve pas une bonne modification

`Blocks.lint` contrôle le format. Il ne détecte pas qu’une IA a supprimé un code d’accès, changé une date ou inventé une information. Le refus des réponses coupées est un bon garde-fou, mais ne couvre pas ces erreurs.

Pour une révision complète, montrer les différences textuelles aiderait davantage qu’un seul aperçu rendu. Le projet possède déjà `Blocks.diffLines` pour les conflits : examiner sa réutilisation avant de créer autre chose.

Avant lancement, faire un petit essai réel avec le modèle retenu : corriger sans changer les faits, traduire, ajouter une astuce, modifier un bloc et travailler sur un document long. Vérifier les liens, médias, chiffres et blocs non concernés. Aucun besoin d’un comparatif général des modèles.

Préciser aussi dans la feuille IA que le document est envoyé au service configuré. Même une demande sur un bloc transmet aujourd’hui tout le document comme contexte. L’utilisateur doit pouvoir le comprendre avant l’envoi.

## Ce qui manque surtout pour rendre la V1 utilisable

### Une preuve d’intégration réelle

La démo prouve le fonctionnement de l’éditeur. Elle ne prouve pas encore la facilité d’intégration dans une application existante. `PLAN.md` garde cette étape pour la suite.

Je recommande **une seule intégration pilote** avec de vrais contenus : ouvrir, modifier, envoyer une photo, appeler l’IA, enregistrer, rouvrir et gérer un conflit. Cela dira plus sur la maturité de la V1 qu’un nouveau bloc.

Les comptes, sauvegardes durables, droits et versions relèvent de cette application. Les exemples à jetons publics et le serveur de démo doivent rester clairement identifiés comme tels.

### Une protection proportionnée du travail non enregistré

L’éditeur avertit avant de quitter et conserve un historique en mémoire. Il ne restaure pas le texte après un plantage ou la fermeture forcée d’un navigateur mobile.

Je ne rendrais pas un brouillon local obligatoire pour un lancement pilote. Je le placerais tôt après les premiers retours si les utilisateurs écrivent longtemps. Pour la V1, vérifier surtout que l’état non enregistré et les erreurs de sauvegarde sont bien visibles. Une alerte brève ne doit pas faire croire que le travail est conservé.

### Un court passage sur de vrais appareils

Les parcours Chromium sont utiles. Ils ne prouvent pas le comportement du clavier iPhone, de la sélection tactile, de Safari ou de Firefox.

Avant d’annoncer « mobile d’abord », essayer sur un vrai iPhone et un Android : saisir un long texte, sélectionner, mettre en forme, déplacer, passer en plein écran et enregistrer. Ajouter un passage Safari et Firefox sur ordinateur. Pas besoin d’une grande matrice de compatibilité pour cette V1.

## Documentation : bonne base, quelques écarts à corriger

Le README est déjà riche et concret. Le principal effort est de le rendre cohérent avec le produit livré.

- `FORMAT.md`, envoyé au modèle comme consigne, ne décrit pas le carrousel alors que le noyau le prend en charge. Le HTML y est présenté comme texte source, alors qu’un bloc explicite `:::html` existe. Décrire les formes disponibles et préciser leurs conditions d’activation.
- Le README indique que les alertes IA bloquent remplacer et ajouter, mais l’interface possède une case qui autorise à forcer l’application. Documenter exactement cette règle ou revoir le choix.
- Le README cite ChatGPT avec le MCP, alors que `PLAN.md` note une limite OAuth pour son connecteur distant. Distinguer les clients réellement essayés des connexions encore à valider.
- Le « sans perte » concerne la conservation du contenu et des formes inconnues. Ne pas laisser croire que toute édition visuelle conserve chaque espace du fichier original. Les écritures ciblées par le noyau ont une garantie plus précise sur le texte non touché.
- Avant publication, ajouter un exemple de configuration sans secret et une courte procédure de mise à jour. Distinguer clairement fichiers à distribuer, démo et responsabilités de l’application.

Pas besoin de réécrire toute la documentation ni de produire un grand site documentaire.

## Ce que je garderais en V2

- Liens entre ressources, recherche transverse et navigation entre contenus.
- Colonnes et blocs imbriqués.
- Collaboration en temps réel.
- Historique complet des versions dans l’éditeur ; l’application peut déjà sauvegarder ses fichiers.
- Envoi de photos par MCP.
- OAuth pour de nouveaux clients, tant qu’ils ne sont pas annoncés comme disponibles en V1.
- Nouveaux menus, nouvelles commandes et retouches visuelles sans problème d’usage constaté.

Je ne recommande ni framework, ni base de données imposée, ni refonte du registre. Le produit a besoin de finir son parcours essentiel, pas d’élargir son architecture.

## Validation effectuée et limites

Commande exécutée avec un nom de projet Docker isolé :

```sh
docker compose -p blockquilt-billy-review run --rm check
```

**Code de sortie : 0.** La commande exécute les quatre suites Node, puis le parcours Chromium. Extraits exacts de la sortie :

```text
ok   chaque bouton à icône a un aria-label
ok   chaque champ a une étiquette
ok   375 px : 2 panneaux empilés, visuel sous les blocs
ok   vue source : Ctrl+S enregistre le texte tel quel
ok   app : conflit (412) — le texte de l’IA n’est pas écrasé, celui de l’éditeur reste à l’écran
ok   app : « Garder la mienne » — votre version remplace l’autre, en connaissance de cause
ok   contentUrl sans source : texte et version lus par l’éditeur
```

Les quatre suites Node ont aussi été exécutées directement. Le relais y utilise un faux fournisseur. Les deux reproductions locales supplémentaires, `.env` et PUT concurrents, montrent des cas absents de la protection actuelle malgré la suite verte.

Non vérifiés : le déploiement public et son proxy, un appel à un vrai modèle pendant cette revue, Safari, Firefox, appareils physiques, charge et audit complet du filtre HTML. Je n’ai pas effectué de revue visuelle manuelle de tous les écrans. Les essais réels de modèles relatés dans `DECISIONS.md` sont des éléments antérieurs, pas des mesures refaites ici.

## Mon ordre de priorité

1. Fermer l’accès aux fichiers internes et vérifier l’exposition éventuelle des secrets.
2. Corriger et tester l’écriture concurrente du serveur de référence.
3. Encadrer les coûts IA, les tailles reçues et les attentes réseau.
4. Rendre cohérents les choix d’application de l’IA document et isoler les demandes en cours.
5. Aligner le format donné aux modèles et la documentation sur le comportement livré.
6. Valider un parcours dans une vraie application, avec un vrai modèle et sur téléphone.

**Billy : je suis favorable à cette V1 après ces points. Le projet n’a pas besoin de devenir plus gros pour devenir crédible. Il doit surtout garantir que l’utilisateur comprend ce qui change, garde son travail et peut utiliser l’IA sans mauvaise surprise.**

## Complément du 18 novembre — structure, performance et maintenance

Lecture du code au commit `ae21c96`. Ce complément porte sur la version actuelle. L’avis du 17 novembre reste une photographie de la version précédente : depuis, les quotas IA, les opérations ciblées, le bloc Carte et les lignes composées ont été ajoutés. Les constats antérieurs ne constituent donc pas un état actualisé de tous ces sujets.

### Verdict sur la structure

**La structure est adaptée à la taille du projet. Je ne vois aucune raison de changer de framework ou de multiplier les couches. Je vois en revanche quelques défauts concrets à corriger, et une limite à poser à la croissance du contexte partagé.**

Le noyau fait environ 880 lignes. L’assemblage de l’éditeur en fait moins de 100. Les modules de l’éditeur restent courts, généralement entre 30 et 175 lignes. La séparation noyau / écran / relais IA / MCP / application de démonstration est compréhensible.

Les bons choix à conserver :

- Les opérations de format restent dans le noyau et se testent sans navigateur.
- Le registre de blocs évite un grand branchement différent dans chaque partie du produit.
- Les événements passent principalement par délégation, sans poser un écouteur sur chaque bouton de chaque carte.
- `AbortController` regroupe la suppression des écouteurs et l’arrêt des requêtes lors de `destroy()`.
- La frappe ne redessine pas toutes les cartes à chaque caractère. Le visuel et l’historique attendent une courte pause.
- Les instantanés Markdown de l’historique sont simples à comprendre. Cinquante copies peuvent coûter de la mémoire sur de gros documents, mais ne justifient pas encore un historique par différences.

La longueur du noyau n’est pas à elle seule un problème. Il contient plusieurs responsabilités liées au format, mais elles restent identifiables. Le découper uniquement pour obtenir de petits fichiers ferait perdre une partie de sa simplicité de distribution.

### Rouge : le redessin de la vue source peut perdre le texte saisi

`editor/source.js` garde une variable `sourceText`, initialisée à l’entrée dans la vue source. Pendant la saisie, le texte réel vit dans le `textarea`. `renderSource()` reconstruit ce champ depuis `sourceText`, sans reprendre la valeur courante.

Dans `editor/render.js`, `toggleSplit()` appelle `syncFromDom()` puis `render()`. Or `syncFromDom()` ne fait rien en vue source. Le bouton « Visuel à côté » peut donc reconstruire la zone avec le texte d’avant la saisie.

**Scénario :** passer en source, modifier le Markdown, cliquer sur « Visuel à côté ». La nouvelle saisie risque de disparaître. Les tests actuels vérifient le bouton et la saisie séparément, mais pas cette succession.

Reproduction ciblée avec le vrai module `source.js`, chargé dans Node avec une zone de texte simulée, puis saisie et redessin :

```text
Source après redessin : PERDUE
```

Ce test isole le défaut du module ; ce n’est pas une reproduction dans un navigateur réel. Le chemin du bouton a été vérifié par lecture de ses appelants.

**Recommandation :** conserver la valeur courante avant de remplacer le champ. Clarifier la règle : en vue source, le champ courant fait foi ; en vue blocs, synchroniser les champs avant une mutation ou un redessin. Ajouter le parcours navigateur « saisir → basculer le visuel → enregistrer → relire ». C’est une correction locale, pas une raison de créer un nouveau gestionnaire d’état.

### Orange : la synchronisation de tous les blocs est quadratique

Dans `editor/document.js`, `syncFromDom()` parcourt les cartes et fait un `ed.blocks.find(...)` pour chacune. Pour N blocs, le nombre de comparaisons peut donc croître comme N². Le visuel utilise `ed.markdown()`, qui déclenche cette synchronisation, puis sérialise et rend le document entier. L’historique appelle aussi `ed.markdown()`.

Comptage du même parcours de recherches, sur des identifiants en ordre :

```text
syncFromDom, 100 blocs : 5050 comparaisons d’identifiant
syncFromDom, 500 blocs : 125250 comparaisons d’identifiant
syncFromDom, 1000 blocs : 500500 comparaisons d’identifiant
```

Ce sont des comptes d’opérations, pas des temps mesurés dans le navigateur. Ils ne prouvent pas que les documents habituels sont lents.

**Première amélioration simple :** construire une `Map` des blocs par identifiant une fois dans cet appel. Le parcours devient linéaire, sans cache permanent à invalider. Ne pas transformer chaque `find()` isolé du projet : c’est la recherche répétée dans une boucle qui pose ici problème.

Le remplacement complet du HTML du visuel et des cartes lors des actions de structure reste acceptable pour des documents courts. Avant d’introduire du rendu partiel, mesurer la saisie avec visuel, le déplacement, l’annulation et l’ouverture sur 100 puis 500 blocs, avec du texte réaliste. Les blocs repliés restent dans le DOM ; leur repli ne réduit donc pas autant le coût qu’un retrait du DOM.

### Orange : les temporisateurs annulés restent référencés

Dans `blockquilt-editor.js`, `ed.later()` ajoute chaque temporisateur dans un `Set`. Il le retire quand la fonction s’exécute. Mais les appels directs à `clearTimeout()` dans l’historique, la vue source, les notifications et la barre ne retirent pas la référence du `Set`.

Pendant une longue session, les temporisateurs remplacés s’accumulent jusqu’à `destroy()`. Le nombre de références gardées n’est donc pas borné par le nombre de temporisateurs encore actifs.

Reproduction en mémoire du mécanisme exact d’ajout et d’annulation :

```text
Temporisateurs référencés après 10000 remplacements : 10000
```

**Recommandation :** une petite fonction d’annulation qui fait `clearTimeout()` et retire la référence du `Set`, utilisée avec `ed.later()`. C’est une correction de durée de vie, sans nouvelle dépendance. Vérifier qu’une rafale de saisie laisse seulement les temporisateurs actifs référencés, puis que la destruction les libère.

### Orange : `ed` est pratique, mais ses contrats deviennent implicites

Chaque module ajoute des fonctions et de l’état à un même objet. Cela évite beaucoup de code de raccordement. Mais un module appelle des fonctions installées ailleurs sans déclarer ses besoins. L’ordre d’installation est centralisé dans `mount()`, et certaines références ne sont valides qu’une fois tous les modules installés.

Ce n’est pas un motif suffisant pour réécrire le projet. Le risque apparaît quand une nouvelle fonction modifie directement `blocks`, `meta`, le DOM ou l’historique sans suivre les mêmes règles que les autres.

**Recommandation :** garder `ed`, mais décrire brièvement son contrat avec des types JSDoc pour les parties partagées et les entrées publiques. Nommer le module propriétaire de l’état du document, du rendu et des requêtes. Garder les mutations annulables derrière `ed.change()` et les remplacements de document derrière les fonctions prévues. Ne pas installer TypeScript ni une couche d’injection pour ce seul besoin.

Les détails internes de la feuille IA n’ont pas tous besoin de devenir des méthodes de `ed`. Lors d’une prochaine modification de ces modules, privilégier un petit objet retourné entre `ai.js` et `ai-ops.js` si cela rend leurs échanges plus lisibles. Pas de chantier transversal juste pour réduire le nombre de propriétés.

### Jaune : un format simple exige des frontières strictes

Le noyau contient un parseur Markdown limité, un filtre HTML et un moteur de différences maison. Leur absence de dépendance est utile, mais leur maintenance revient au projet. Les expressions régulières ne sont pas en elles-mêmes un défaut : le risque serait d’étendre progressivement ces outils vers tout Markdown, tout HTML ou un langage de mise en page complet.

**Recommandation :** maintenir un sous-ensemble explicite. Pour chaque nouvelle syntaxe, un exemple lu puis réécrit, un exemple invalide conservé et un rendu attendu. Tester notamment les interactions des largeurs avec les blocs source, le code et les opérations IA. Garder le bloc HTML facultatif et sa liste de balises courte. Je ne recommande pas de remplacer ces composants maintenant ; je ne considère pas non plus cette lecture comme un audit complet de leur sécurité ou de leur complexité.

Le registre mélange volontairement description du format et données d’affichage. `editor/types.js` enrichit globalement ses entrées avec `edit` et `read`. C’est acceptable pour une bibliothèque chargée une fois dans une page. Documenter que le registre est partagé par les instances ; une option propre à un éditeur ne doit pas modifier globalement un type pour les autres.

### Jaune : le CSS généré doit suivre les sources

Le binaire Tailwind est fixé à une version et le CSS généré est livré : c’est raisonnable. En revanche, la commande `check` ne reconstruit pas le CSS. Une nouvelle classe dans un module peut donc être présente dans le JS et absente de la feuille distribuée, malgré des tests fonctionnels verts.

**Recommandation :** vérifier avant livraison qu’une génération ne produit aucun diff inattendu. Actualiser aussi le commentaire de `build-css`, qui cite seulement certains fichiers alors que la configuration parcourt tout `editor/*.js`. Pas besoin de remplacer la chaîne CSS.

### Jaune : garder les tests lisibles à mesure que le produit grandit

`dev/check.mjs` dépasse maintenant mille lignes et regroupe beaucoup de parcours dans un même programme CDP. C’est efficace pour démarrer. À terme, l’état laissé par un scénario rendra les pannes plus difficiles à isoler. Les ports fixes limitent aussi l’exécution de plusieurs contrôles dans un même environnement réseau.

**Recommandation :** à la prochaine extension importante, regrouper les scénarios par sujet en gardant un lanceur unique et le même outil. Donner aux scénarios leur document de départ explicite. Priorité aux transitions qui croisent plusieurs fonctions : source et visuel, IA et fermeture de feuille, suppression et annulation, plusieurs éditeurs et raccourcis. Ne pas ajouter un framework de test pour ce seul rangement.

### Ce que je ferais, dans cet ordre

1. Corriger la conservation du texte source lors d’un changement d’affichage.
2. Corriger le suivi des temporisateurs annulés.
3. Supprimer la recherche quadratique dans `syncFromDom()`.
4. Mesurer quelques documents longs avant de décider d’autres optimisations.
5. Préciser les contrats de `ed` et vérifier le CSS livré, au fil des changements utiles.

Je n’ajouterais ni DOM virtuel, ni bus d’événements, ni gestionnaire d’état, ni découpage supplémentaire du noyau à ce stade. Je ne remplacerais pas non plus l’API d’édition du navigateur pendant la préparation de la V1 sans défaut reproduit qui l’exige.

**Conclusion de Billy sur la maintenance :** le code est encore à une taille où des corrections locales suffisent. Les vrais signaux rouges sont la perte possible du texte et les états qui peuvent diverger. Le reste appelle surtout des limites claires et quelques mesures, pas une refonte.

Validation du complément : la suite complète a été relancée sur cette version avec `docker compose -p blockquilt-billy-review run --rm check`. Code de sortie : **0**. Extrait exact :

```text
ok   app : revérification sans changement : rien (304)
ok   contentUrl sans source : texte et version lus par l’éditeur
```

`git diff --check` ne signale aucune erreur. Aucun code applicatif modifié. Les reproductions ciblées ci-dessus complètent la suite ; aucun temps de réponse ni consommation mémoire réelle du navigateur n’a été mesuré dans cette revue.
