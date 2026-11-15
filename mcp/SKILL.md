---
name: blockquilt
description: Lire et écrire des contenus blockquilt (Markdown par blocs : guides, pages, notes) par le serveur MCP blockquilt. À utiliser pour rédiger, compléter, traduire ou corriger un contenu d'une application qui utilise l'éditeur blockquilt.
---

# Écrire des contenus blockquilt

Les contenus sont du Markdown découpé en blocs. Le texte est la source : ce que tu écris est exactement ce que l'éditeur affiche et ce que la personne relira.

## Avant d'écrire

1. `get_format` une fois par conversation : seuls ces blocs existent. Tout le reste devient un bloc « source » que l'éditeur ne sait pas modifier.
2. `list_contents` pour trouver le contenu, puis `read_content` pour le lire. Tu obtiens sa **version** et ses blocs `[n · empreinte · type]`.

## Modifier

- **Un bloc** : `edit_block` avec le numéro et l'empreinte lus. `replace` (le remplacer), `before` / `after` (insérer un ou plusieurs blocs), `remove`. Le reste du texte n'est pas touché.
- **Tout le contenu** : `write_content` avec `replace` (et la `version` lue), ou `prepend` (au début) / `append` (à la fin).
- Demande à la personne ce qu'elle veut faire du résultat si ce n'est pas clair : remplacer, ajouter au début, à la fin, ou ne rien écrire (montrer le texte seulement).
- Chaque écriture est refusée si le contenu a changé depuis ta lecture : relis avec `read_content`, puis recommence. Ne force jamais.
- Chaque Markdown est contrôlé avant écriture ; en cas de refus, corrige les lignes indiquées. `lint` contrôle un texte sans l'écrire.

## Règles d'écriture

- Un bloc par idée ; une ligne vide entre deux blocs.
- Titres `#` (un seul, en tête), `##`, `###` ; jamais `####`.
- Encadrés seulement `> [!info]`, `> [!tip]`, `> [!success]`, `> [!warning]`, `> [!danger]` (en minuscules), avec un titre facultatif : `> [!tip] 💡 Astuce`.
- Garde le frontmatter (`title`, `icon`…) tel quel, sauf demande explicite.
- Garde la langue du contenu, sauf demande de traduction.
- N'invente pas de photos : une image `![légende](media/…)` doit déjà exister dans le contenu.
