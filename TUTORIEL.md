# Tutoriel : intégrer blockquilt dans une application PHP ou Flask

Ce tutoriel ajoute l'éditeur à une application existante, pas à pas. Le résultat :

- une page **publique** qui affiche le contenu ;
- une page **d'édition** avec l'éditeur ;
- deux adresses côté serveur : **enregistrer** le texte et **recevoir une photo**.

Le contenu est un seul fichier Markdown (`data/page.md`). Les photos vont dans `media/`. Node n'est pas nécessaire.

Chaque étape se vérifie dans le navigateur avant de passer à la suivante. Le [README](README.md) reste la référence complète des options.

Prérequis : PHP 8.1 ou plus, **ou** Python 3.10 ou plus avec Flask.

## 1. Copier les fichiers

L'éditeur n'a ni dépendance ni étape de build. Copiez ces fichiers du repo dans un dossier `blockquilt/` servi tel quel par votre application :

```text
blockquilt/
  blockquilt.js            le noyau (lecture, écriture, rendu HTML)
  blockquilt.css           l'éditeur
  blockquilt-editor.js     l'éditeur (module ES), il charge editor/*.js
  editor/                  tout le dossier
  fonts/                   les polices de l'éditeur
  emoji.json               le sélecteur d'emoji, chargé au premier usage
  blockquilt-content.css   le rendu publié
  blockquilt-content.js    facultatif : flèches et puces des carrousels
```

Où les mettre :

- **PHP** : à côté de vos scripts, donc `blockquilt/` à la racine du site.
- **Flask** : dans `static/blockquilt/`. Les adresses commencent alors par `/static/blockquilt/`.

## 2. Afficher l'éditeur, sans serveur

Le but de cette étape : voir l'éditeur et récupérer le Markdown, sans rien enregistrer. Créez `essai.html` à côté du dossier `blockquilt/` :

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Essai</title>
  <link rel="stylesheet" href="blockquilt/blockquilt.css">
  <link rel="stylesheet" href="blockquilt/blockquilt-content.css">
</head>
<body>
  <div id="editor"></div>
  <script src="blockquilt/blockquilt.js"></script>
  <script type="module">
    import { mount } from './blockquilt/blockquilt-editor.js';
    mount(document.getElementById('editor'), {
      source: '---\ntitle: Ma page\n---\n\nBonjour.',
      onSave: (markdown) => console.log(markdown),
    });
  </script>
</body>
</html>
```

Ouvrez-le par un serveur web, pas en double-cliquant : un module ES ne se charge pas depuis `file://`.

```sh
php -S localhost:8000          # ou : python3 -m http.server 8000
```

**Vérifier** : sur http://localhost:8000/essai.html, ajoutez un bloc, puis Ctrl+S. Le Markdown s'affiche dans la console du navigateur et « Enregistré » apparaît.

Ce qu'il faut retenir :

- `blockquilt.js` est chargé **avant** le module : l'éditeur utilise l'objet global `Blocks`.
- `onSave` reçoit le Markdown complet. Dans une application, on utilise plutôt `saveUrl` (étape 3).

## 3. Enregistrer sur le serveur

L'éditeur envoie le texte en `POST multipart/form-data` à `saveUrl`, dans le champ `text`. Les champs de l'option `fields` sont ajoutés à chaque envoi : on y met un jeton CSRF.

Le serveur répond par un code 2xx. En cas d'erreur, il répond en JSON `{ "error": "…" }` et l'éditeur affiche le message.

**Piège** : un formulaire envoie les fins de ligne en `\r\n`. Remettez-les en `\n` avant d'enregistrer, sinon le fichier change à chaque enregistrement.

### PHP

`edit.php` : la page d'édition. Elle lit le fichier, crée le jeton CSRF et monte l'éditeur.

```php
<?php
session_start();
$_SESSION['csrf'] ??= bin2hex(random_bytes(16));
$file = __DIR__ . '/data/page.md';
$source = is_file($file) ? file_get_contents($file) : "---\ntitle: Ma page\n---\n\nBonjour.\n";
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Modifier la page</title>
  <link rel="stylesheet" href="blockquilt/blockquilt.css">
  <link rel="stylesheet" href="blockquilt/blockquilt-content.css">
</head>
<body>
  <div id="editor"></div>
  <script src="blockquilt/blockquilt.js"></script>
  <script src="blockquilt/blockquilt-content.js"></script>
  <script type="module">
    import { mount } from './blockquilt/blockquilt-editor.js';
    mount(document.getElementById('editor'), {
      source: <?= json_encode($source, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?>,
      saveUrl: 'save.php',
      uploadUrl: 'upload.php',
      media: 'media/',
      fields: { _csrf: <?= json_encode($_SESSION['csrf']) ?> },
    });
  </script>
</body>
</html>
```

`JSON_HEX_TAG` est obligatoire : sans lui, un texte qui contient `</script>` casse la page.

`api.php` : le code commun aux deux envois (réponse JSON, erreurs, contrôle du jeton).

```php
<?php
// Commun à save.php et upload.php : réponse JSON, erreur { error }, contrôle du jeton CSRF.
session_start();
header('Content-Type: application/json');

function fail(int $code, string $message): never {
  http_response_code($code);
  echo json_encode(['error' => $message]);
  exit;
}

if (!isset($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], $_POST['_csrf'] ?? '')) {
  fail(403, 'Jeton invalide : recharger la page');
}
```

`save.php` :

```php
<?php
require __DIR__ . '/api.php';

$text = str_replace("\r\n", "\n", $_POST['text'] ?? '');
if (trim($text) === '') fail(422, 'Texte vide');
if (!is_writable(__DIR__ . '/data')) fail(500, 'Le serveur ne peut pas écrire dans data/');

file_put_contents(__DIR__ . '/data/page.md', $text);
echo json_encode(['ok' => true]);
```

Créez les dossiers `data/` et `media/`. Le serveur web doit pouvoir y écrire.

### Flask

`app.py` contient toute l'application : cette étape, les photos (étape 4) et la page publique (étape 5).

```python
import os
import secrets
from pathlib import Path

from flask import Flask, jsonify, render_template, request, send_from_directory, session

ROOT = Path(__file__).parent
PAGE = ROOT / 'data' / 'page.md'
MEDIA = ROOT / 'media'
PAGE.parent.mkdir(exist_ok=True)
MEDIA.mkdir(exist_ok=True)

app = Flask(__name__)
app.secret_key = os.environ['SECRET_KEY']
app.config['MAX_CONTENT_LENGTH'] = 6 * 1024 * 1024  # au-delà : erreur 413, avant même de lire l'envoi


def read_page():
    return PAGE.read_text(encoding='utf-8') if PAGE.exists() else '---\ntitle: Ma page\n---\n\nBonjour.\n'


def fail(code, message):
    return jsonify(error=message), code


@app.errorhandler(413)
def too_big(_):
    return fail(413, 'Photo trop grosse : 5 Mo au plus')


@app.before_request
def check_csrf():
    token = session.get('csrf')
    if request.method == 'POST' and not (token and secrets.compare_digest(token, request.form.get('_csrf', ''))):
        return fail(403, 'Jeton invalide : recharger la page')


@app.get('/edit')
def edit():
    session.setdefault('csrf', secrets.token_hex(16))
    return render_template('edit.html', source=read_page(), csrf=session['csrf'])


@app.post('/save')
def save():
    text = request.form.get('text', '').replace('\r\n', '\n')
    if not text.strip():
        return fail(422, 'Texte vide')
    PAGE.write_text(text, encoding='utf-8', newline='\n')
    return jsonify(ok=True)
```

`templates/edit.html` :

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Modifier la page</title>
  <link rel="stylesheet" href="/static/blockquilt/blockquilt.css">
  <link rel="stylesheet" href="/static/blockquilt/blockquilt-content.css">
</head>
<body>
  <div id="editor"></div>
  <script src="/static/blockquilt/blockquilt.js"></script>
  <script src="/static/blockquilt/blockquilt-content.js"></script>
  <script type="module">
    import { mount } from '/static/blockquilt/blockquilt-editor.js';
    mount(document.getElementById('editor'), {
      source: {{ source|tojson }},
      saveUrl: '/save',
      uploadUrl: '/upload',
      media: '/media/',
      fields: { _csrf: {{ csrf|tojson }} },
    });
  </script>
</body>
</html>
```

Le filtre `tojson` de Flask échappe `<`, `>` et `&` : un `</script>` dans le texte ne casse pas la page.

Lancer : `SECRET_KEY=une-longue-valeur-aleatoire flask run`.

**Vérifier** : ouvrez la page d'édition, modifiez un bloc, Ctrl+S. « Enregistré » apparaît, `data/page.md` contient le texte, sans `\r`. Rechargez la page : la modification est là.

**À faire dans votre application** : protégez la page d'édition, `save` et `upload` par votre connexion. Le jeton CSRF ne remplace pas une vérification de l'utilisateur.

## 4. Recevoir les photos

L'éditeur envoie la photo à `uploadUrl`, dans le champ `photo`. Le serveur répond `{ "id": "…" }`. Le texte écrit alors `media/<id>`, et l'éditeur affiche l'image à l'adresse `media` + `id` (option `media`). Sans `uploadUrl`, l'éditeur ne propose pas de photo.

Règles de sécurité, appliquées dans les deux exemples :

- Le type est lu dans les **premiers octets** du fichier, jamais dans le type déclaré par le navigateur.
- Seuls JPEG, PNG, GIF et WebP sont acceptés. **Pas de SVG** : servi sur votre domaine, il peut exécuter du script.
- Le nom du fichier est tiré au hasard. L'extension vient du type reconnu.
- 5 Mo au plus. Au-delà : 413.

### PHP

`upload.php` :

```php
<?php
require __DIR__ . '/api.php';

$photo = $_FILES['photo'] ?? null;
if (!$photo) fail(422, 'Image attendue');
if ($photo['error'] === UPLOAD_ERR_INI_SIZE) fail(413, 'Photo trop grosse pour PHP : voir upload_max_filesize dans php.ini');
if ($photo['size'] > 5 * 1024 * 1024) fail(413, 'Photo trop grosse : 5 Mo au plus');
if ($photo['error'] !== UPLOAD_ERR_OK) fail(422, 'Image attendue');

// Le type est lu dans les premiers octets du fichier, pas dans ce que dit le navigateur.
$head = file_get_contents($photo['tmp_name'], false, null, 0, 12);
$ext = match (true) {
  str_starts_with($head, "\xFF\xD8\xFF") => 'jpg',
  str_starts_with($head, "\x89PNG\r\n\x1A\n") => 'png',
  str_starts_with($head, 'GIF87a'), str_starts_with($head, 'GIF89a') => 'gif',
  str_starts_with($head, 'RIFF') && substr($head, 8, 4) === 'WEBP' => 'webp',
  default => null,
};
if ($ext === null) fail(422, 'Image attendue : JPEG, PNG, GIF ou WebP');
if (!is_writable(__DIR__ . '/media')) fail(500, 'Le serveur ne peut pas écrire dans media/');

$id = bin2hex(random_bytes(6)) . '.' . $ext;
if (!move_uploaded_file($photo['tmp_name'], __DIR__ . '/media/' . $id)) fail(500, 'Photo non enregistrée');
echo json_encode(['id' => $id]);
```

Le serveur web sert `media/` directement, comme des fichiers statiques.

**Piège** : PHP limite les envois à 2 Mo par défaut, et une photo de téléphone dépasse souvent cette taille. Dans `php.ini` : `upload_max_filesize = 6M` et `post_max_size = 8M`. Si l'envoi dépasse `post_max_size`, PHP vide `$_POST` : la réponse est alors « Jeton invalide ».

**Piège** : `data/` et `media/` doivent exister, et l'utilisateur du serveur web (souvent `www-data`) doit pouvoir y écrire. Sinon, `save.php` et `upload.php` le disent dans l'éditeur.

### Flask

À ajouter dans `app.py` :

```python
def image_extension(head):
    """Le type est lu dans les premiers octets du fichier, pas dans ce que dit le navigateur."""
    if head.startswith(b'\xff\xd8\xff'):
        return 'jpg'
    if head.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'png'
    if head.startswith((b'GIF87a', b'GIF89a')):
        return 'gif'
    if head.startswith(b'RIFF') and head[8:12] == b'WEBP':
        return 'webp'
    return None


@app.post('/upload')
def upload():
    photo = request.files.get('photo')
    if photo is None:
        return fail(422, 'Image attendue')
    data = photo.read()
    if len(data) > 5 * 1024 * 1024:
        return fail(413, 'Photo trop grosse : 5 Mo au plus')
    ext = image_extension(data[:12])
    if ext is None:
        return fail(422, 'Image attendue : JPEG, PNG, GIF ou WebP')
    name = f'{secrets.token_hex(6)}.{ext}'
    (MEDIA / name).write_bytes(data)
    return jsonify(id=name)


@app.get('/media/<name>')
def media(name):
    return send_from_directory(MEDIA, name)
```

`send_from_directory` refuse les noms qui sortent du dossier (`../`).

**Vérifier** : dans l'éditeur, ajoutez un bloc photo et choisissez une image. Elle s'affiche, et le texte contient `![…](media/<id>)`. Essayez un fichier SVG ou texte renommé en `.png` : l'éditeur affiche « Image attendue : JPEG, PNG, GIF ou WebP ».

## 5. Afficher la page publique

Le rendu HTML est fait par `Blocks.toHtml`, dans `blockquilt.js`. Sans Node, il tourne dans le navigateur du visiteur. Le texte est échappé et le bloc HTML est filtré : le résultat peut aller dans `innerHTML`.

### PHP

`index.php` :

```php
<?php
$file = __DIR__ . '/data/page.md';
$markdown = is_file($file) ? file_get_contents($file) : "---\ntitle: Ma page\n---\n\nBonjour.\n";
?>
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ma page</title>
  <link rel="stylesheet" href="blockquilt/blockquilt-content.css">
</head>
<body>
  <main id="page"></main>
  <script src="blockquilt/blockquilt.js"></script>
  <script>
    document.getElementById('page').innerHTML =
      Blocks.toHtml(<?= json_encode($markdown, JSON_HEX_TAG | JSON_HEX_AMP | JSON_UNESCAPED_UNICODE) ?>, { media: 'media/' });
  </script>
  <script src="blockquilt/blockquilt-content.js"></script>
</body>
</html>
```

### Flask

Dans `app.py` :

```python
@app.get('/')
def page():
    return render_template('page.html', markdown=read_page())
```

`templates/page.html` :

```html
<!doctype html>
<html lang="fr">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Ma page</title>
  <link rel="stylesheet" href="/static/blockquilt/blockquilt-content.css">
</head>
<body>
  <main id="page"></main>
  <script src="/static/blockquilt/blockquilt.js"></script>
  <script>
    document.getElementById('page').innerHTML = Blocks.toHtml({{ markdown|tojson }}, { media: '/media/' });
  </script>
  <script src="/static/blockquilt/blockquilt-content.js"></script>
</body>
</html>
```

**Vérifier** : la page affiche le contenu enregistré, photos comprises. Un carrousel a ses flèches et ses puces.

**Limite** : rendu dans le navigateur, la page est vide sans JavaScript, et les moteurs de recherche la lisent moins bien. Pour un rendu côté serveur, il faut appeler `Blocks.toHtml` sous Node (voir « Rendu côté serveur » dans le README).

## 6. Adapter l'apparence

L'éditeur reprend la police et la couleur du texte de votre page. Il prend la largeur de l'élément qui le contient. Pour le reste, des variables CSS, sur l'élément ou un parent :

```css
#editor {
  --bq-accent: #7c3aed;    /* bouton Enregistrer, focus, liens */
  --bq-radius: 0.5rem;     /* arrondi des cartes */
  --bq-sticky-top: 64px;   /* hauteur de votre barre fixe : l'en-tête de l'éditeur se colle dessous */
}
```

La liste complète est dans le README, section « Apparence ». `blockquilt-content.css` décrit ses propres variables en tête du fichier.

## 7. Les pièges, en résumé

| Symptôme | Cause | Correction |
|---|---|---|
| Page blanche, erreur de module dans la console | Page ouverte en `file://`, ou chemin d'import faux | Passer par un serveur web ; vérifier le chemin de `blockquilt-editor.js` |
| `Blocks is not defined` | `blockquilt.js` chargé après le module, ou absent | Le charger avant, en `<script>` classique |
| Polices ou emoji absents | `fonts/` ou `emoji.json` pas copiés | Copier tout le dossier de l'étape 1 |
| Le fichier change à chaque enregistrement | Fins de ligne `\r\n` gardées | Les remplacer par `\n` |
| La page casse quand le texte contient `</script>` | Texte inséré sans échappement | `JSON_HEX_TAG` en PHP, `tojson` en Flask |
| « Photo trop grosse pour PHP » | Limite `upload_max_filesize` (2 Mo par défaut) | Monter `upload_max_filesize` et `post_max_size` |
| « Le serveur ne peut pas écrire dans … » (PHP) | Dossier absent, ou droits manquants | Créer `data/` et `media/`, les donner à l'utilisateur du serveur web |
| « Jeton invalide » sur une grosse photo (PHP) | Envoi au-delà de `post_max_size` | Monter `upload_max_filesize` et `post_max_size` |
| Page publique blanche | Rien n'est encore enregistré, ou une erreur JavaScript | Enregistrer une fois depuis l'éditeur ; sinon, lire la console du navigateur (F12) : chemin de `blockquilt/` faux, ou erreur de syntaxe dans le `<script>` |
| Photo enregistrée mais pas affichée | Option `media` différente de l'adresse qui sert `media/` | Même adresse des deux côtés |

## Aller plus loin

Tout est décrit dans le [README](README.md) :

- **Plusieurs contenus, conflits d'écriture** : `contentUrl` au lieu de `saveUrl`. L'éditeur enregistre par `PUT` + `If-Match` et ne remplace jamais un contenu modifié ailleurs (section « Contenus d'une application »).
- **Assistant IA** : `aiUrl` (section « Relais IA »).
- **Bloc HTML** : `html: true` (désactivé par défaut).
- **Format du texte** : [FORMAT.md](FORMAT.md), à donner tel quel à une IA qui écrit du contenu.
