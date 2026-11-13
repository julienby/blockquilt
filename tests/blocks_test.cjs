// Noyau blockquilt : coupe et recolle le texte sans rien perdre, rend un HTML sémantique.
const fs = require('node:fs');
const path = require('node:path');
const Blocks = require('../blockquilt.js');
let failed = 0;
const ok = (cond, name) => { console.log((cond ? 'ok   ' : 'FAIL ') + name); if (!cond) failed++; };
const types = (md) => Blocks.parse(md).blocks.map((b) => b.type).join();

// ---- Fixtures : un fichier par type, un document complet. Aller-retour exact. ----
const FIX = path.join(__dirname, 'fixtures');
const expected = {
  'h2.md': 'h2', 'h3.md': 'h3', 'text.md': 'text,text,text,text,text', 'quote.md': 'quote,quote', 'info.md': 'info', 'tip.md': 'tip', 'success.md': 'success',
  'warning.md': 'warning', 'danger.md': 'danger', 'photo.md': 'photo,photo', 'video.md': 'video,video', 'hr.md': 'text,hr,text', 'code.md': 'code,code',
  'raw.md': 'raw,raw,raw,raw', 'carousel.md': 'carousel', 'html.md': 'html', 'frontmatter.md': 'text', 'document.md': 'h2,h3,text,text,tip,warning,quote,photo,video,hr,code',
};
for (const file of fs.readdirSync(FIX).sort()) {
  const x = fs.readFileSync(path.join(FIX, file), 'utf8');
  const { meta, blocks } = Blocks.parse(x);
  ok(Blocks.serialize(meta, blocks) === x, `aller-retour exact : ${file}`);
  ok(types(x) === expected[file], `types lus : ${file} → ${types(x)}`);
}
ok(Object.keys(expected).every((f) => fs.existsSync(path.join(FIX, f))), 'fixtures : toutes présentes');

// ---- Carrousel ----
const car = Blocks.fromMarkdown(fs.readFileSync(path.join(FIX, 'carousel.md'), 'utf8'));
ok(car.type === 'carousel' && car.items.length === 3 && car.items[2].alt === 'La terrasse, côté sud' && car.items[1].alt === '' && car.items[0].src === 'media/aaaaaaaaaaaa', 'carrousel : trois photos et leurs légendes');
const carHtml = Blocks.toHtml(':::carousel\n![a](media/x1)\n![b](media/x2)\n![c](media/x3)\n:::', { media: '/m/' });
ok((carHtml.match(/<figure>/g) || []).length === 3 && carHtml.includes('<div class="bq-carousel-track">') && carHtml.includes('<figcaption>b</figcaption>') && carHtml.includes('src="/m/x3"'), 'carrousel : 3 <figure> avec <figcaption> dans le rendu');
ok(Blocks.toMarkdown({ type: 'carousel', items: [{ src: 'media/b', alt: 'B' }, { src: 'media/a', alt: 'A' }] }) === ':::carousel\n![B](media/b)\n![A](media/a)\n:::' && Blocks.toMarkdown({ type: 'carousel', items: [] }) === '', 'carrousel : écrit dans l’ordre, vide il disparaît');
ok(['::: carousel\n![a](media/x)\n:::', ':::carousel\ntexte\n:::', ':::carousel\n:::', ':::columns\n![a](media/x)\n:::'].every((x) => Blocks.fromMarkdown(x).type === 'raw' && Blocks.toMarkdown(Blocks.fromMarkdown(x)) === x), 'carrousel mal écrit ou :::columns : bloc source, texte intact');

// ---- Bloc HTML : filtre par liste blanche ----
const PAYLOADS = [
  '<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '<a href="javascript:alert(1)">x</a>', '<a href="JaVaScRiPt:alert(1)">x</a>',
  '<a href="&#106;avascript:alert(1)">x</a>', '<a href="java&#x09;script:alert(1)">x</a>', '<a href="jav&#97;script&colon;alert(1)">x</a>', '<a href="&#0000106&#0000097vascript:alert(1)">x</a>',
  '<a href=" javascript:alert(1)">x</a>', '<svg onload=alert(1)><circle/></svg>', '<iframe src="https://evil.example"></iframe>', '<style>body{display:none}</style>',
  '<a href="data:text/html;base64,PHNjcmlwdD4=">x</a>', '<div onclick="alert(1)">x</div>', '<img src="javascript:alert(1)">', '<div style="background:url(javascript:alert(1))">s</div>',
  '<object data="x"></object><embed src="x">', '<math><mi xlink:href="javascript:alert(1)">m</mi></math>', '<scr<script>ipt>alert(1)</script>', '<<script>script>alert(1)<</script>/script>',
  '<img/src="x"/onerror="alert(1)">', '<!--<script>alert(1)</script>-->', '<form action="javascript:x"><button formaction="javascript:x">b</button></form>', '<input onfocus=alert(1) autofocus>',
  '<SCRIPT SRC=//evil.example></SCRIPT>', '<img src="https://x.example/a.png" onerror  =  "alert(1)">', '<a href="https://x.example" target="_blank" style="color:red" id="y" onmouseover=x>s</a>', '<div><b>non fermé', '<a href="https://ok.example"',
];
ok(PAYLOADS.length >= 20, `filtre : ${PAYLOADS.length} charges connues`);
for (const p of PAYLOADS) {
  const out = Blocks.sanitize(p);
  const tags = [...out.matchAll(/<[a-z][^>]*>/gi)].map((m) => m[0]);
  const bad = /<(script|style|iframe|svg|math|object|embed|form|input|button)/i.test(out)
    || tags.some((t) => /\s(on\w+|style|id|target|xlink:href|formaction|action)=/i.test(t) || /(href|src)="(?!https?:\/\/|mailto:|tel:|media\/)/i.test(t));
  ok(!bad, 'filtre : rien ne survit à ' + JSON.stringify(p));
}
const table = '<table class="w-full"><thead><tr><th colspan="2">Tarifs</th></tr></thead><tbody><tr><td>Nuit</td><td rowspan="1">80 €</td></tr></tbody></table>';
ok(Blocks.sanitize(table) === table, 'filtre : un tableau passe intact');
const grid = '<div class="grid grid-cols-2 gap-4 md:grid-cols-[1fr_2fr]"><div class="p-4"><h3>A</h3><p>Texte <strong>gras</strong> <a href="https://exemple.fr">lien</a></p></div><figure><img src="https://exemple.fr/a.png" alt="A" width="40" height="40"><figcaption>B</figcaption></figure></div>';
ok(Blocks.sanitize(grid) === grid, 'filtre : une grille de div passe intacte (classes Tailwind gardées)');
ok(Blocks.sanitize('<img src="media/abc" alt="x">', '/m/') === '<img src="/m/abc" alt="x">' && Blocks.sanitize('<div><p>a') === '<div><p>a</p></div>', 'filtre : photo du document, balises fermées');
const htmlFix = fs.readFileSync(path.join(FIX, 'html.md'), 'utf8');
ok(Blocks.toMarkdown(Blocks.fromMarkdown(htmlFix)) + '\n' === htmlFix && Blocks.fromMarkdown(htmlFix).html.includes('\n\n'), 'bloc HTML : texte source gardé à l’identique (ligne vide comprise)');
ok(Blocks.toHtml(':::html\n<p onclick="x">a</p><script>b</script>\n:::').includes('<div class="bq-html"><p>a</p></div>'), 'bloc HTML : rendu filtré dans <div class="bq-html">');
ok(Blocks.toMarkdown({ type: 'html', html: 'a\n:::\nb' }) === ':::html\na\n :::\nb\n:::', 'bloc HTML : une ligne « ::: » tapée ne ferme pas le bloc');

// ---- Frontmatter ----
const fm = Blocks.parse(fs.readFileSync(path.join(FIX, 'frontmatter.md'), 'utf8'));
ok(JSON.stringify(fm.meta) === JSON.stringify({ title: 'Arrivée', icon: '🏡', auteur: 'Julien', brouillon: '' }), 'frontmatter : clés lues dans l’ordre, valeur vide gardée');
ok(Blocks.serialize({ title: 'T', icon: '🏡', x: 'y' }, []) === '---\ntitle: T\nicon: 🏡\nx: y\n---\n', 'frontmatter seul');
ok(JSON.stringify(Blocks.parse('Sans frontmatter').meta) === '{}' && Blocks.serialize({}, Blocks.parse('Sans frontmatter').blocks) === 'Sans frontmatter\n', 'sans frontmatter : ni titre ni icône');
const bad = '---\ntitle: a\n- liste\n---\n\nTexte\n';
ok(Blocks.serialize(Blocks.parse(bad).meta, Blocks.parse(bad).blocks) === bad && JSON.stringify(Blocks.parse(bad).meta) === '{}', 'frontmatter mal formé : gardé dans le corps, sans perte');
ok(Blocks.parse('').blocks.length === 0 && Blocks.serialize({}, []) === '', 'texte vide');
ok(Blocks.serialize({}, [{ type: 'text', html: '  ' }, { type: 'text', html: 'a' }]) === 'a\n', 'bloc vide ignoré');
ok(Blocks.parse('a\r\n\r\nb').blocks.length === 2, 'fins de ligne \\r\\n');

// ---- Ancien format : plus reconnu, jamais abîmé ----
const legacy = '## 🏡 Arrivée\n\n> 💡 texte\n\n> 🧭 conseil\n\n:::sensible\nCode : 1234\n:::\n';
ok(types(legacy) === 'h2,quote,quote,raw', 'ancien format : « ## 🏡 » en H2, « > 💡 » en citation, :::sensible en bloc source');
ok(Blocks.serialize({}, Blocks.parse(legacy).blocks) === legacy, 'ancien format : réécrit à l’identique');
const src = fs.readFileSync(path.join(__dirname, '..', 'blockquilt.js'), 'utf8') + fs.readFileSync(path.join(__dirname, '..', 'blockquilt-editor.js'), 'utf8');
ok(!/sensible|splitHeading|advice|🧭/.test(src), 'ancien format : plus aucun code pour le lire');

// ---- Lecture bloc par bloc ----
const kind = (md) => Blocks.fromMarkdown(md).type;
ok(['## G', '### G', 'Texte.', '> c', '> [!info]\n> x', '> [!tip] 💡\n> x', '> [!success]\n> x', '> [!warning]\n> x', '> [!danger]\n> x',
  '![a](media/aabbccddeeff)', 'https://www.youtube.com/watch?v=abc', '---', '```\nx\n```', '- a\n- b', '1. a\n2. b'].map(kind).join()
  === 'h2,h3,text,quote,info,tip,success,warning,danger,photo,video,hr,code,text,text', 'types : titres, texte, citation, 5 encadrés, photo, vidéo, ligne, code, listes');
ok(Blocks.fromMarkdown('- pain\n- **lait**').html === '<ul><li>pain</li><li><strong>lait</strong></li></ul>', 'liste à puces : <ul><li> dans le bloc texte');
const tipB = Blocks.fromMarkdown('> [!tip] 🔑 La clé\n> Boîte aux lettres.');
ok(tipB.icon === '🔑' && tipB.title === 'La clé' && tipB.html === 'Boîte aux lettres.', 'encadré : icône et titre lus');
ok(Blocks.fromMarkdown('> [!tip] Sans icône\n> x').icon === '' && Blocks.fromMarkdown('> [!tip] Sans icône\n> x').title === 'Sans icône', 'encadré : titre sans icône');
ok(Blocks.toMarkdown({ type: 'tip', icon: '', title: '', html: 'a<br>b' }) === '> [!tip]\n> a\n> b', 'encadré : écrit');
ok(Blocks.toMarkdown({ type: 'tip', icon: '🔑', title: '', html: '' }) === '' && Blocks.toMarkdown({ type: 'tip', icon: '', title: 'Seul', html: '' }) === '> [!tip] Seul', 'encadré : vide disparaît, titre seul gardé');
ok(kind('> [!foo]\n> x') === 'raw' && kind('> [!TIP]\n> x') === 'raw', 'encadré : type inconnu ou en majuscules → bloc source');

const roundtrip = (md) => { const b = Blocks.fromMarkdown(md); return b.type !== 'raw' && Blocks.toMarkdown(b) === md; };
for (const md of ['Bonjour **tout le monde**, voir *ici*.', 'Ligne un\nLigne deux', '## Garage', '### Détail', '> [!tip]\n> Garez-vous à gauche.', '> [!info] 🥖 Boulangerie\n> Le Fournil.\n> Fermé le mercredi.',
  '> **Important :** le code s’arrête à **21 h**.', '- pain\n- **lait**', '1. ouvrir\n2. fermer', '![La piscine](media/aabbccddeeff.jpg)', 'https://youtu.be/abc123',
  'Voir [la carte](https://exemple.fr/a?b=1) puis **[le site](https://x.fr)**', 'Un ==mot clé== et ++souligné++', 'Mot de passe : a\\*b_c', 'Intro\n- un\n- deux', '- a\n  suite indentée',
  'Du `code` ici', '```js\nlet a = `x`;\n```', '````\n```\nimbriqué\n```\n````', '---']) {
  ok(roundtrip(md), 'aller-retour : ' + JSON.stringify(md));
}
ok(['| a | b |\n|---|---|\n| 1 | 2 |', '# Titre un', 'a\n---', ':::columns\nx\n:::'].every((md) => kind(md) === 'raw' && Blocks.toMarkdown(Blocks.fromMarkdown(md)) === md), 'ce que l’éditeur ne sait pas refaire reste intact (tableau, titre #, « --- » collé, colonnes)');
ok(Blocks.toMarkdown(Blocks.fromMarkdown('- pain \n- lait')) === '- pain\n- lait', 'espaces en fin de ligne : ignorés');

// ---- Ce que produit le navigateur en modifiant ----
const md = (html, type = 'text') => Blocks.toMarkdown({ type, html });
ok(md('un <b>gras </b>mot') === 'un **gras** mot', 'gras : les espaces sortent des **');
ok(md('a <u>sou</u> <mark>sur</mark> <i>it</i> <code>c*d</code>') === 'a ++sou++ ==sur== *it* `c*d`', 'souligné, surligné, italique, code');
ok(md('<ul><li>un</li><li><b>deux</b></li></ul>') === '- un\n- **deux**', 'liste créée depuis la barre : convertie en Markdown');
ok(md('<strong>a</strong><b>b</b>') === '**ab**', 'deux gras collés : un seul');
ok(md('a<div>b</div><div><br></div><div>c</div>') === 'a\nb\n\nc', 'Entrée du navigateur : lignes');
ok(md('x&nbsp;y &amp; z &lt;3') === 'x y & z <3', 'espaces insécables et entités');
ok(md('') === '' && md('<br>') === '' && Blocks.isEmpty({ type: 'tip', html: '<br>', icon: '', title: '' }), 'bloc vide : disparaît');
ok(md('2 * 3 [x] _a_ b_c C++ a == b') === '2 \\* 3 \\[x\\] \\_a\\_ b_c C\\+\\+ a \\=\\= b', 'signes Markdown tapés : protégés');
ok(md('# dièse<br>&gt; cite<br>1. num<br>:::carousel<br>---<br>| t').split('\n').every((l) => l.startsWith('\\') || /^\d/.test(l)) && md('1. num').startsWith('1\\.'), 'début de ligne qui changerait le sens : protégé');
ok(Blocks.fromMarkdown(md('---<br>:::x')).type === 'text', 'ligne « --- » ou « ::: » tapée : reste du texte');
ok(md('- tiret') === '- tiret' && Blocks.toMarkdown({ type: 'h2', html: '- tiret' }) === '## \\- tiret', 'tiret de début : gardé dans un texte, protégé dans un titre');
ok(md('<a href="javascript:alert(1)">piège</a>') === 'piège' && md('<a href="www.exemple.fr">site</a>') === '[site](https://www.exemple.fr)' && md('<a href="https://a.fr/x(1)">l</a>') === '[l](https://a.fr/x%281%29)', 'liens : adresses sûres seulement');
ok(Blocks.toMarkdown({ type: 'h3', html: 'Titre  <b>long</b><br>suite' }) === '### Titre  long suite', 'titre : une seule ligne, sans mise en forme');
ok(Blocks.toMarkdown({ type: 'quote', html: 'un<br><br>deux' }) === '> un\n>\n> deux', 'citation : ligne vide écrite « > »');
ok(Blocks.toMarkdown({ type: 'photo', src: 'media/aabbccddeeff', alt: 'La [piscine]' }) === '![La \\[piscine\\]](media/aabbccddeeff)' && Blocks.toMarkdown({ type: 'photo', src: '', alt: 'x' }) === '' && Blocks.toMarkdown({ type: 'video', url: ' https://youtu.be/x ' }) === 'https://youtu.be/x', 'photo (légende protégée) et vidéo');
ok(Blocks.toMarkdown({ type: 'code', lang: 'js', code: 'a\n```\nb' }) === '````js\na\n```\nb\n````', 'code : clôture plus longue que le code');

// ---- Conversion entre types texte : aucune ligne perdue ----
ok(Blocks.TEXT_KEYS.join() === 'h2,h3,text,quote,info,tip,success,warning,danger', 'types texte convertibles');
const L = (b) => Blocks.lines(b).map((h) => Blocks.stripTags(h).trim());
const start = { type: 'text', html: 'Allumez la machine<br>Attendez 15 s<br><b>Servez</b>' };
for (const from of Blocks.TEXT_KEYS) {
  for (const to of Blocks.TEXT_KEYS) {
    const a = Blocks.convert(from === 'text' ? start : Blocks.convert(start, from), to);
    const single = Blocks.def(to).single || Blocks.def(from).single;
    ok(a.type === to && (single ? L(a).join(' ') === 'Allumez la machine Attendez 15 s Servez' : L(a).join('|') === 'Allumez la machine|Attendez 15 s|Servez'), `conversion ${from} → ${to} sans perte`);
  }
}
const titled = { type: 'tip', icon: '🔑', title: 'Clé', html: 'Boîte' };
ok(JSON.stringify(Blocks.convert(titled, 'warning')) === JSON.stringify({ type: 'warning', icon: '🔑', title: 'Clé', html: 'Boîte' }), 'conversion entre encadrés : icône et titre suivent');
ok(Blocks.toMarkdown(Blocks.convert(titled, 'text')) === '**Clé**\nBoîte', 'conversion encadré → texte : le titre devient une ligne en gras');

// ---- Fusion de deux blocs voisins ----
const tip = { type: 'tip', icon: '', title: '', html: 'Garez-vous <b>à gauche</b>' };
const list = { type: 'text', html: '<ul><li>porte bleue</li><li>code 1515</li></ul>' };
ok(Blocks.toMarkdown(Blocks.merge(tip, list)) === '> [!tip]\n> Garez-vous **à gauche**\n> - porte bleue\n> - code 1515', 'fusion astuce + liste : astuce, lignes et liste gardées');
ok(Blocks.toMarkdown(Blocks.merge({ type: 'text', html: 'Avant' }, { type: 'h2', html: 'Garage' })) === 'Avant\nGarage', 'fusion texte + titre : le titre devient une ligne du texte');
ok(Blocks.toMarkdown(Blocks.merge({ type: 'warning', icon: '', title: '', html: 'a' }, { type: 'info', icon: '', title: 'T', html: 'b' })) === '> [!warning]\n> a\n> **T**\n> b', 'fusion attention + info : attention l’emporte, le titre du dessous devient une ligne');
ok(Blocks.merge({ type: 'h2', html: 'Garage' }, list) === null, 'fusion sous un titre : refusée');
ok(Blocks.merge(tip, { type: 'photo', src: 'media/aabbccddeeff', alt: '' }) === null && Blocks.merge({ type: 'raw', md: '| a |' }, list) === null && Blocks.merge(tip, { type: 'hr' }) === null, 'fusion avec média, ligne ou bloc source : refusée');

// ---- Listes à plusieurs niveaux ----
for (const md of ['- a\n  - b\n    - c\n- d', '1. un\n   - sous\n2. deux', '- a\n  1. x\n  2. y\n- b', [...Array(10)].map((_, i) => `${i + 1}. n${i + 1}`).join('\n') + '\n    - sous dix']) ok(roundtrip(md), 'liste imbriquée, aller-retour : ' + JSON.stringify(md));
ok(Blocks.fromMarkdown('- a\n  - b').html === '<ul><li>a<ul><li>b</li></ul></li></ul>', 'liste imbriquée : <ul> dans le <li> parent');
ok(Blocks.toHtml('- a\n  - b\n- c', { title: false }).includes('<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>'), 'liste imbriquée : rendu publié');
ok(md('<ul><li>a</li><ul><li>b</li></ul><li>c</li></ul>') === '- a\n  - b\n- c', 'liste imbriquée à la manière d’execCommand (ul dans ul) : lue');
ok(md('<ol><li>un<ul><li>sous</li></ul></li><li>deux</li></ol>') === '1. un\n   - sous\n2. deux', 'liste imbriquée sous une liste numérotée : 3 espaces');
ok(Blocks.toMarkdown(Blocks.merge({ type: 'tip', icon: '', title: '', html: 'a' }, Blocks.fromMarkdown('- x\n  - y'))) === '> [!tip]\n> a\n> - x\n>   - y', 'fusion : l’imbrication est gardée');
ok(L(Blocks.convert(Blocks.fromMarkdown('- x\n  - y'), 'h2')).join(' ') === 'x y', 'conversion en titre : lignes imbriquées gardées');

// ---- Icône : un emoji collé depuis n'importe où ----
ok(Blocks.firstEmoji(' 🏊 piscine') === '🏊' && Blocks.firstEmoji('🇫🇷') === '🇫🇷' && Blocks.firstEmoji('👨‍👩‍👧 x') === '👨‍👩‍👧' && Blocks.firstEmoji('❤️') === '❤️' && Blocks.firstEmoji('👍🏽') === '👍🏽' && Blocks.firstEmoji('1️⃣') === '1️⃣', 'icône : premier emoji gardé (drapeau, famille, cœur, teinte, touche)');
ok(Blocks.firstEmoji('abc') === '' && Blocks.firstEmoji('') === '' && Blocks.firstEmoji('1 chambre') === '', 'icône : texte sans emoji refusé');

// ---- Rendu HTML sémantique ----
const doc = fs.readFileSync(path.join(FIX, 'document.md'), 'utf8');
const view = Blocks.toHtml(doc, { media: '/m/' });
ok(view.startsWith('<article class="bq-content">') && view.split('<article').length === 2, 'rendu : un seul <article class="bq-content">');
ok(view.includes('<h1><span class="bq-icon" aria-hidden="true">🏡</span> Arrivée</h1>') && !Blocks.toHtml(doc, { title: false }).includes('<h1'), 'rendu : titre du frontmatter en <h1> (désactivable)');
ok(view.includes('<h2 id="garage">Garage</h2>') && view.includes('<h3 id="detail">Détail</h3>'), 'rendu : <h2>, <h3> avec ancre sans accents');
ok(Blocks.toHtml('## Été\n\n## Été').includes('id="ete-2"'), 'rendu : ancres en double numérotées');
ok(view.includes('<strong>gras</strong>') && view.includes('<em>italique</em>') && view.includes('<u>souligné</u>') && view.includes('<mark>surligné</mark>'), 'rendu : <strong>, <em>, <u>, <mark>');
ok(view.includes('<ul><li>puce</li></ul>') && Blocks.toHtml('Intro\n- a\n- b').includes('<p>Intro</p><ul><li>a</li><li>b</li></ul>'), 'rendu : listes hors des paragraphes');
ok(view.includes('<aside class="bq-callout bq-callout-tip" role="note"') && view.includes('<p class="bq-callout-title"><span class="bq-icon" aria-hidden="true">🚭</span> Titre facultatif</p>'), 'rendu : encadré <aside role="note">, titre en <p class="bq-callout-title">');
ok(view.includes('<blockquote><p>Une citation simple.</p></blockquote>'), 'rendu : citation en <blockquote>');
ok(view.includes('<figure><img src="/m/abc123" alt="Légende" loading="lazy"><figcaption>Légende</figcaption></figure>'), 'rendu : photo en <figure>, adresse des médias, légende');
ok(view.includes('<hr>') && view.includes('<pre><code class="language-js">du code affiché tel quel'), 'rendu : <hr>, <pre><code class="language-js">');
ok(view.includes('youtube-nocookie.com/embed/dQw4w9WgXcQ') && Blocks.toHtml('https://vimeo.com/76979871').includes('player.vimeo.com/video/76979871'), 'rendu : vidéo YouTube ou Vimeo en lecteur intégré');
ok(!/class="[^"]*\b(?:bg|text|my|mt|rounded|font)-/.test(view), 'rendu : aucune classe Tailwind');
const evil = Blocks.toHtml('<script>alert(1)</script>\n\n[x](javascript:alert(1))\n\n[y](JaVaScRiPt:alert(1))\n\n![a"b](media/x"onerror=1)\n\n```js" onclick="x\ny\n```\n\n> [!tip] <img src=x onerror=1>\n> z\n\n| a | b |\n|---|---|');
const tags = [...evil.matchAll(/<[a-z][^>]*>/gi)].map((m) => m[0]);
ok(!evil.includes('<script') && !/href="javascript/i.test(evil) && tags.every((t) => !/\son\w+=/i.test(t.replace(/"[^"]*"/g, "\"\""))) && !evil.includes('<img src=x'), 'rendu : HTML échappé, liens javascript: refusés, attributs protégés');
ok([...view.matchAll(/<img\b[^>]*>/g)].every((m) => / alt="/.test(m[0])), 'rendu : chaque <img> a un alt');
ok(Blocks.toHtml('') === '<article class="bq-content">\n\n</article>', 'rendu : texte vide');

// ---- Contrôle (lint) ----
ok(Blocks.lint(doc).length === 0, 'lint : document complet sans alerte');
const lint = Blocks.lint('---\ntitle: x\nmal formé\n---\n\nTexte\n\n> [!astuce]\n> x\n\n| a |\n\n:::carousel\nx');
ok(lint.some((p) => p.line === 3 && /Frontmatter/.test(p.message)), 'lint : frontmatter mal formé (ligne 3)');
ok(lint.some((p) => /encadré inconnu « astuce »/.test(p.message)), 'lint : type d’encadré inconnu');
ok(lint.some((p) => /non fermé/.test(p.message)), 'lint : « ::: » non fermé');
ok(lint.some((p) => /non reconnu/.test(p.message) && p.line === 1), 'lint : bloc resté source');
ok(Blocks.lint('```js\nx').some((p) => /code non fermé/.test(p.message)), 'lint : code non fermé');

// ---- FORMAT.md : l'exemple donné à une IA est relu sans perte ----
const spec = fs.readFileSync(path.join(__dirname, '..', 'FORMAT.md'), 'utf8');
const example = /````markdown\n([\s\S]*?)````/.exec(spec)[1];
const parsed = Blocks.parse(example);
ok(parsed.blocks.length > 10 && parsed.blocks.every((b) => b.type !== 'raw'), 'FORMAT.md : exemple sans bloc source');
ok(Blocks.lint(example).length === 0, 'FORMAT.md : exemple sans alerte lint');
ok(Blocks.serialize(parsed.meta, parsed.blocks) === example, 'FORMAT.md : exemple réécrit à l’identique');
ok(new Set(parsed.blocks.map((b) => b.type)).size >= 10, 'FORMAT.md : l’exemple montre au moins 10 types');

// ---- Registre : un type inconnu enregistré à la volée est lu, écrit et rendu sans toucher au reste ----
Blocks.register('demo', {
  label: 'Démo', icon: 'sliders', group: 'media',
  match: (t) => { const m = /^:::demo\n([\s\S]*)\n:::$/.exec(t); return m ? { body: m[1] } : null; },
  toMarkdown: (b) => (b.body ? `:::demo\n${b.body}\n:::` : ''),
  toHtml: (b) => `<div class="demo">${Blocks.esc(b.body)}</div>`,
  blank: () => ({ body: '' }),
});
const demo = Blocks.fromMarkdown(':::demo\nbonjour <b>\n:::');
ok(demo.type === 'demo' && demo.body === 'bonjour <b>', 'registre : type « demo » lu');
ok(Blocks.toMarkdown(demo) === ':::demo\nbonjour <b>\n:::', 'registre : type « demo » écrit à l’identique');
ok(Blocks.toHtml(':::demo\nx < y\n\nz\n:::').includes('<div class="demo">x &lt; y\n\nz</div>'), 'registre : type « demo » rendu (ligne vide comprise)');
ok(Blocks.blank('demo').type === 'demo' && Blocks.blank('demo').body === '' && !Blocks.TEXT_KEYS.includes('demo'), 'registre : bloc neuf, pas convertible');
ok(Blocks.fromMarkdown(':::autre\nx\n:::').type === 'raw', 'registre : syntaxe inconnue toujours en « raw »');
delete Blocks.types.demo; Blocks.order.splice(Blocks.order.indexOf('demo'), 1);

process.exit(failed ? 1 : 0);
