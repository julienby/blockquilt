# Format blockquilt

Un document blockquilt est un fichier texte en Markdown. Il commence par un frontmatter facultatif, puis une suite de blocs séparés par une ligne vide. Tout ce qui suit est lu par l'éditeur sans perte. Ce qui sort de ces règles n'est pas perdu : l'éditeur le garde tel quel, dans un bloc « texte source ».

## Exemple complet

````markdown
---
title: Arrivée à la maison
icon: 🏡
---

# Arrivée à la maison

:::t2
Tout ce qu'il faut savoir pour arriver sans souci.
:::

## Se garer

Le portail s'ouvre avec le **bip gris**. Garez-vous *à gauche*, devant le ++garage++.
Le code est ==1515==, voir [le plan](https://exemple.fr/plan).

- porte bleue
- boîte aux lettres
  - à droite du portail
  - nom sur l'étiquette

> [!tip] 🔑 La clé
> Elle est dans la boîte aux lettres.

> [!warning]
> Ne pas fumer dans la maison.

### Pour aller plus loin

1. Ouvrir le portail
2. Allumer la lumière

> Une maison est une machine à habiter.

![Le portail vu de la rue](media/abc123def456)

:::card
![La plage](media/def456abc123)
### La plage à 5 minutes
Prendre le chemin derrière la maison.
[Voir le plan](https://exemple.fr/plage)
:::

https://youtu.be/dQw4w9WgXcQ

---

```sh
ssh maison.local
```
````

## Règles

**Frontmatter.** Facultatif, seulement en tête. Une ligne `---`, puis des lignes `clé: valeur` à plat (pas de listes, pas d'imbrication, une clé une seule fois), puis `---`. `title` et `icon` (un emoji) décrivent le document ; les autres clés sont gardées telles quelles, dans le même ordre. Au rendu, `title` devient le `<h1>` seulement si le corps n'a pas de bloc `# Titre`.

**Blocs.** Un bloc par paragraphe, séparés par une ligne vide. Ne jamais mettre deux blocs sans ligne vide entre eux.

| Bloc | Écriture |
|---|---|
| Titre H1 | `# Titre` sur une seule ligne (un seul par document, de préférence) |
| Titre H2 | `## Titre` sur une seule ligne |
| Titre H3 | `### Titre` sur une seule ligne |
| Texte en grand | `:::t1`, `:::t2` ou `:::t3`, le texte, puis `:::`. Taille d'un H1, H2 ou H3, sans être un titre (accroche, chiffre clé, phrase mise en avant). |
| Texte | Lignes de texte. Un retour à la ligne simple reste dans le même paragraphe. |
| Liste | Lignes `- élément` ou `1. élément`, dans un bloc texte. Sous-liste : indenter de la largeur de la puce du parent (2 espaces sous `- `, 3 sous `1. `). |
| Citation | Chaque ligne commence par `> ` |
| Encadré | Première ligne `> [!type]`, puis facultatifs un emoji et un titre : `> [!tip] 🔑 La clé`. Le texte suit, chaque ligne commençant par `> `. |
| Photo | `![légende](media/<id>)` ou `![légende](https://…)`, seule sur sa ligne |
| Carte | `:::card`, puis, chacun facultatif et dans cet ordre : une photo `![…](…)`, un titre `### …`, du texte, un lien `[Lire](https://…)` seul sur la dernière ligne (rendu en bouton) ; puis `:::`. Remplace une carte écrite en HTML. |
| Vidéo | Adresse YouTube ou Vimeo, seule sur sa ligne |
| Ligne horizontale | `---` seul, entre deux lignes vides |
| Code | Trois accents graves suivis du langage (` ```js `), le code, puis trois accents graves |

**Types d'encadré** (en minuscules) : `info`, `tip` (astuce), `success`, `warning` (attention), `danger`.

**Mise en forme dans le texte** : `**gras**`, `*italique*`, `++souligné++`, `==surligné==`, `` `code` ``, `[lien](https://…)`. Liens acceptés : `https://`, `http://`, `mailto:`, `tel:`.

**Pour écrire un caractère qui a un sens** (`*`, `[`, `` ` ``, `#` en début de ligne…), le précéder de `\`.

## Ce qu'il ne faut pas écrire

- `####` et plus : seuls `#`, `##` et `###` sont des titres.
- Un encadré dans un autre.
- Du HTML brut, des tableaux : gardés tels quels, mais affichés comme du texte source.
- Un bloc `:::` dans un autre bloc `:::`.

## Contrôle

`Blocks.lint(texte)` renvoie la liste des problèmes `{ line, message }` : frontmatter mal formé, bloc `:::` ou de code non fermé, type d'encadré inconnu, bloc non reconnu. Une liste vide veut dire que l'éditeur relit tout le texte sans perte.
