# améliorations

- enlever les éléments qui en sont pas liés à l'éditeur épuré le système
- mettre le texte pour la bloc "Titre de section" plus au milieu verticalement, trop grand trou sur la partie bassse, ça fait vide.
- rendre les élements sémantiques plus classiques (danger, information, success, code ... etc)
- bibliothèques d'émoji
- le code généré doit être sémantique , ai friendly, seo friendly ... on utilise un html sémantique propose
- le format pivot doit être clair. une génération d'un format texte éditable par un humain doit être possible markdown / frontmatter / + bloc sémantique modifiable à la main si besoin (source) 
- le drag n drop, n'est pas très visuel il faudrait peut être un trait bleu indiquant ou va se mettre le contenu quelques chose d'indicatif (là quand on bouge un élément ça décalle directement tout, on on voir plusieur bouton insérer au même endroit ... moyen)
- l'éditeur doit être plus épuré au niveau de son layout, là il hérite du format de l'application easyhomeguide
- plus d'émoji disponible
- quand je sélectionne du texte la barre contextuel suit le texte ... il faut un comportement plus stable la barre contetuel doit rester au milieu
- un double clic ou appui long dans un bloc doit faire apparaitre le menu contextuel
- mobile first (important)
- le full screen doit être un vrai full screen qui prend toute la fenêtre (mobile, pc) de maniere propre (et pas une couche qui vient par dessus plus ou moins bien ... à toi de voir la bonn pratique)
- l'éditeur doit pouvoir être full screen / le bloc doit pouvoir être full screen
- Ctrl s pour sauvegarder
- undo / redo (10 historiques ??)
- Le bouton IA doit être disponible au niveau de l'éditeur mais aussi au niveau des bloc (menu contextuel) : soit on demande à l'ia des actions globalement sur le document soit on demande une action spécifique au niveau d'un bloc.
- Le menu modal pour ajoouter du contenu peut être plus dense (juste une icone et le nom de la section ex : H - Titre de section)
- Ajout H2 / H3 
- Ajout d'un carousel x photos + description (comme linkedin)
- Ajout ligne horizontale
- Ajout d'un bloc code html (tailwind available) comme ça vec l'IA un contenu complexe peut être ajouté
- Ajoute d'un bloc 2 colonne / bloc 3 colonnes qui peut contenir d'autres bloc de contenus
- copier / coller dans le menu contextuel 
- Garder le menu contextuel ergonomique ??? question ouverte
- Garder un code simple / une intégration simple avec les autres app
- Etre AI compliant (une ia doit pouvoir générer le contenu) , l'éditeur blockquilt le lire
- L'éditeur doit être sémantique et extensible ... si je veux intégrer un nouveau bloc sémantique
- Quand il y a des icones dans les bloc je ne sais pas si c'est modifiable simplement ... (clic sur icone -> modal -> choix) ... un truc simple

le but est décrire pour le web (contenu applicatif comme easyhomeguide, article de blog, posts réseaux sociaux, second cerveau ... bref écrire du contenu)
le concept de bloc visuels colorés avec lesquels il est agréable d'écrire ... sur mobile ou pc
les autres éditeurs doivent être à la rue ... je veux attaquer cet aspect éditeur sous un autre angle
propose si tu as d'autres idées, une meilleure approche

# Evol2
- J'aime bien  l'idée à droite (une colonne)  d'avoir de chaque box : chevron vers le haut pour monter / poignée au milieu / chevron vers le bas pour descendre le bloc 
- Au même niveau que la combo box mais aligné à droite : 3 icones (rondes) : Menu ... / expand / Poubelle si ça te parait jouable au niveau ergonomique
La philosophie : 1 action = 1 possilibité ou 1 seul façon de faire (donc on ne change pas le type de contenu dans ce menu c'est déjà géré sur la partie gauche de la box), pareil pour descendre monter (déjà géré par chevron haut et bas)
- Les  bouton insérer / fusionner sont collés aux éléments . il faudrait leur laisser un espace minimum pour avoir des bloc aérés
- Les titres h2 / h3 devraient avoir une bordure du bloc un peu plus marqué pour visuellement  voir cette segmentation sur la page. h2 bord noir avec une epaisseur +1 ey h2 bord noir fin 
- Les liste à puces ne sont pas indentables, utiliser le tab pour cela
- copier/couper/coller quand on sélectionne du texte dans le menu contextuel (peut être avec un sou menu pour rester ergonomique  
- Le menu ...des box doit contenir : dupliquer / copier /  coller / coller dessous / ia sur ce bloc 
- Le bloc html il faut ajouter une icone oeuil à cote de l'icone html pour visualiser le code html (preview)
- Le plein écran d'un bloc ne fonctionne pas sur pc (revoir la construction de cette fonction)
- La visualisation plein écran serait bien sans forcément apparaitre dans un bloc ... l'éditeur doit pouvoir s'intégrer dans n'importe quel layout et on doit pouvoir agir sur la largeur .
- il manquer un élément insérer en 1ere position de l'éditeur

# Evol 3
1.1- « Coller » du menu ⋯ du bloc : je l'ai compris comme « Coller au-dessus ». Dis-moi si tu voulais plutôt remplacer le bloc. : non le copier pios coller en dessous ou au dessus est clair pour moi.
1.2- Colonne de droite : les trois boutons (monter, poignée, descendre) mesurent 44 × 32 px. Avec 44 × 44, une carte de titre redevient trop haute. : non c'est un compromis acceptable. J'imaginais que le titre pouvais être centré verticalement pour occuper l'espace harmoniseusement.
1.3- Plein écran sur ton PC :comment faire en sorte que l'éditeur s'adapte au template dans lequel il s'intéègre ? il va être à l'intérieur d'une app donc il doit être assez neutre dans sa mise en forme pour s'intégrer naturellement.
3.1. Raccourcis de frappe : ## , - , >  ou --- en début de bloc convertit le bloc. : non trop complexe pour le moment (garde le en amélioratins possibles) ... mais pas convaincu pour le moment
3. Vue « source » : le texte Markdown modifiable directement, à côté de l'édition et de l'aperçu. : oui pour celui qui sait ce qu'il fait ça peut être moins pénible que de cliquer sur des menus ... il faut pouvoir passer en plein écran pour avoir un espace d'écriture total et on doit pouvoir visualiser le résultat
3.4. Brouillon automatique dans le navigateur, proposé à la réouverture.  : je ne sais pas ... si c'est standard oui si c'est de la complexité inutile non ou pas intuitif non
4. Modularité : oui si ça peut rendre le code plus simple à maintenir / plus clair
- IA : L'IA réelle (avec ANTHROPIC_API_KEY) n'a jamais été essayée avec une vraie clé. : je crois que l'éditeur doit être nativement multi IA : car parfois je veux traduire un texte avec une ia de traduction, parfois je veux réorganiser un contenu général avec une ia différente. il faut penser à une architecture ou un procédé pour sécuriser les accès. est ce que l'éditeur peut être accessible via un mcp ou une api afin de brancher directement mon chatgpt ou claudecode sur le contenu et avec le bon skill le contenu est généré proprement et ensuite quand j'ouvre le contenu avec l'éditeur tout est ok ?? Cette features IA est vriment un point important car mon editeur doit être AI first / AI compliant. L'éditeur a 2 niveaux : niveau globale (tout le document) niveau bloc. 2 accès (api IA dans l'éditeur ou l'IA se connecte au document et génère le doc pour l'éditeur). On ne se précipite pas ... il faut réfléchir sur ce point c'est structurant mais hyper innovant !

Autres reflexions : je ne sais pas si le carousel en mode slider est très ergonomique pour ajouter / retirer des images (limité par l'espace) ... peut être une autre approche standard est possible ?
Le bloc code en mode visualisation ne revoi pas le code  à la ligne ... je ne sais pas si c'est classique ou pas. bref pas très lilisble une box avec un slider ...

