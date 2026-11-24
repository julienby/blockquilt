# Changelog

Écrit pour la personne qui met à jour blockquilt dans une application.
Pour chaque version : ce qui change, puis ce que l'application doit faire (souvent : rien).
Règles des numéros : `CYCLE-DE-VIE.md`, R2. En `0.x`, le contrat peut encore changer.

## 0.1.0 — à venir

Première version numérotée. Elle fixe le contrat décrit dans `CYCLE-DE-VIE.md` §1 :
le format (`FORMAT.md`), le HTML rendu (`RENDER.md`), l'API de `mount` (`README.md`),
les variables CSS `--bq-*`, les échanges avec le serveur, les moteurs PHP et Python, le MCP.

À faire dans l'application :
- Installer : `bin/blockquilt-install 0.1.0 <dossier de l'application>`.
- Avec `save: false` : appeler `markSaved(text)` avec le texte envoyé au serveur.
  `markSaved()` sans argument marche encore, mais il marque aussi enregistrée une frappe faite pendant l'enregistrement.
