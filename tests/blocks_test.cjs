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
  'h1.md': 'h1', 't.md': 't1,t2,t3', 'h2.md': 'h2', 'h3.md': 'h3', 'text.md': 'text,text,text,text,text', 'quote.md': 'quote,quote', 'info.md': 'info', 'tip.md': 'tip', 'success.md': 'success',
  'warning.md': 'warning', 'danger.md': 'danger', 'photo.md': 'photo,photo', 'photo-options.md': 'photo,photo,photo', 'video.md': 'video,video', 'hr.md': 'text,hr,text', 'code.md': 'code,code',
  'raw.md': 'raw,raw,raw,raw', 'carousel.md': 'carousel', 'card.md': 'card,card', 'html.md': 'html', 'frontmatter.md': 'text', 'document.md': 'h2,h3,text,text,tip,warning,quote,photo,video,hr,code',
  // Cas limites : un bloc dont la réécriture ne redonne pas le texte reste « texte source » (raw), dans les trois moteurs.
  'edge.md': 'raw,raw,raw,text,raw,raw,text,raw,raw,raw,raw,raw,raw,raw,raw,raw,text,text,text,text,raw,text,text,raw,raw,tip,raw,raw,raw,raw,html,raw,raw,raw,text,text,quote,info,t2,warning,text,raw,h1,text,raw',
};
for (const file of fs.readdirSync(FIX).filter((f) => f.endsWith('.md')).sort()) {
  const x = fs.readFileSync(path.join(FIX, file), 'utf8');
  const { meta, blocks } = Blocks.parse(x);
  ok(Blocks.serialize(meta, blocks) === x, `aller-retour exact : ${file}`);
  ok(types(x) === expected[file], `types lus : ${file} → ${types(x)}`);
  const htmlFile = file.replace(/\.md$/, '.html');
  const expectedHtml = fs.existsSync(path.join(FIX, htmlFile)) ? fs.readFileSync(path.join(FIX, htmlFile), 'utf8') : null;
  ok(expectedHtml !== null && Blocks.toHtml(x, { media: 'media/' }) === expectedHtml, `rendu HTML exact : ${htmlFile}`);
}
ok(Object.keys(expected).every((f) => fs.existsSync(path.join(FIX, f))), 'fixtures : toutes présentes');

// ---- Carrousel ----
const car = Blocks.fromMarkdown(fs.readFileSync(path.join(FIX, 'carousel.md'), 'utf8'));
ok(car.type === 'carousel' && car.items.length === 3 && car.items[2].alt === 'La terrasse, côté sud' && car.items[1].alt === '' && car.items[0].src === 'media/aaaaaaaaaaaa', 'carrousel : trois photos et leurs légendes');
const carHtml = Blocks.toHtml(':::carousel\n![a](media/x1)\n![b](media/x2)\n![c](media/x3)\n:::', { media: '/m/' });
ok((carHtml.match(/<figure>/g) || []).length === 3 && carHtml.includes('<div class="bq-carousel-track">') && carHtml.includes('<figcaption>b</figcaption>') && carHtml.includes('src="/m/x3"'), 'carrousel : 3 <figure> avec <figcaption> dans le rendu');
ok(/<button type="button" class="bq-carousel-prev" aria-label="Photo précédente" hidden><\/button><button type="button" class="bq-carousel-next" aria-label="Photo suivante" hidden><\/button><div class="bq-carousel-dots" hidden><\/div>/.test(carHtml), 'carrousel : flèches et puces présentes, cachées tant que blockquilt-content.js ne les relie pas');
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
const ROOT = path.join(__dirname, '..');
const src = ['blockquilt.js', 'blockquilt-editor.js', ...fs.readdirSync(path.join(ROOT, 'editor')).map((f) => 'editor/' + f)].map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
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
ok(['| a | b |\n|---|---|\n| 1 | 2 |', '#### Titre quatre', 'a\n---', ':::columns\nx\n:::'].every((md) => kind(md) === 'raw' && Blocks.toMarkdown(Blocks.fromMarkdown(md)) === md), 'ce que l’éditeur ne sait pas refaire reste intact (tableau, titre ####, « --- » collé, colonnes)');
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
ok(Blocks.TEXT_KEYS.join() === 'h1,h2,h3,t1,t2,t3,text,quote,info,tip,success,warning,danger', 'types texte convertibles');

// ---- H1, et texte en grand T1 / T2 / T3 (taille d'un titre, sans sa sémantique) ----
ok(kind('# Grand titre') === 'h1' && roundtrip('# Grand titre') && kind('## Deux') === 'h2', 'H1 : « # Titre », distinct de « ## »');
ok(Blocks.toHtml('# Été chaud', { title: false }).includes('<h1 id="ete-chaud">Été chaud</h1>'), 'H1 : rendu <h1> avec ancre');
ok(!Blocks.toHtml('---\ntitle: Doc\n---\n\n# Vrai titre').includes('Doc') && Blocks.toHtml('---\ntitle: Doc\n---\n\n# Vrai titre').split('<h1').length === 2, 'H1 : avec un bloc H1, pas de second <h1> tiré du frontmatter');
for (const md of [':::t1\nBienvenue', ':::t2\nDeux\nlignes', ':::t3\nUn **mot** et un [lien](https://exemple.fr)']) ok(roundtrip(md + '\n:::'), 'texte en grand, aller-retour : ' + JSON.stringify(md));
const big = Blocks.toHtml(':::t1\nGros **texte**\n:::', { title: false });
ok(big.includes('<div class="bq-t1"><p>Gros <strong>texte</strong></p></div>') && !/<h\d/.test(big), 'texte en grand : paragraphe <div class="bq-t1"><p>, aucune balise de titre');
ok(kind(':::t1\n## pas un titre\n:::') === 'raw' && kind(':::t4\nx\n:::') === 'raw', 'texte en grand : ligne de titre dedans ou T4 → bloc source');
ok(Blocks.lint('# Titre\n\n:::t2\nGrand\n:::').length === 0, 'lint : H1 et texte en grand sans alerte');
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

// ---- I1 : désigner un bloc (place + empreinte) et le modifier sans toucher au reste ----
{
  const md = '---\ntitle: T\n---\n\n# Titre\n\nUn  paragraphe.\n\n\n\n## Garage\nCollé au titre.\n\n- a\n- b\n';
  const a = Blocks.address(md);
  ok(a.meta.title === 'T' && a.blocks.map((b) => `${b.n}:${b.line}:${b.type}`).join() === '1:5:h1,2:7:text,3:11:h2,4:12:text,5:14:text', 'address : blocs numérotés depuis 1, ligne et type');
  ok(a.blocks.every((b) => /^[0-9a-f]{8}$/.test(b.hash)) && new Set(a.blocks.map((b) => b.hash)).size === 5, 'address : empreintes de 8 caractères, distinctes');
  ok(Blocks.hash('abc') === Blocks.hash('abc') && Blocks.hash('abc') !== Blocks.hash('abd') && Blocks.hash('é🙂') === Blocks.hash('é🙂'), 'hash : stable, sensible au moindre caractère');
  const h = (n) => a.blocks[n - 1].hash;
  const ch = (o) => Blocks.changeBlock(md, o).markdown;
  ok(ch({ n: 2, hash: h(2), markdown: 'Nouveau.' }) === md.replace('Un  paragraphe.', 'Nouveau.'), 'changeBlock replace : seules les lignes du bloc changent (espaces et lignes vides du reste gardés)');
  ok(ch({ n: 2, hash: h(2), mode: 'before', markdown: '\n\n> [!tip] Avant\n\n' }) === md.replace('Un  paragraphe.', '> [!tip] Avant\n\nUn  paragraphe.'), 'changeBlock before : inséré au-dessus, fragment nettoyé');
  ok(ch({ n: 4, hash: h(4), mode: 'after', markdown: 'X\n\nY' }) === md.replace('Collé au titre.\n', 'Collé au titre.\n\nX\n\nY\n'), 'changeBlock after : plusieurs blocs insérés dessous');
  ok(ch({ n: 3, hash: h(3), markdown: 'Paragraphe' }) === md.replace('## Garage\nCollé', 'Paragraphe\n\nCollé'), 'changeBlock : une ligne vide sépare un titre remplacé de son voisin collé');
  ok(ch({ n: 4, hash: h(4), mode: 'before', markdown: 'X' }) === md.replace('## Garage\nCollé', '## Garage\n\nX\n\nCollé'), 'changeBlock before sous un titre collé : blocs gardés séparés');
  ok(ch({ n: 2, hash: h(2), mode: 'remove' }) === md.replace('Un  paragraphe.\n\n\n\n', ''), 'changeBlock remove : le bloc et les lignes vides qui suivent');
  ok(ch({ n: 5, hash: h(5), mode: 'remove' }) === md.replace('\n\n- a\n- b\n', '\n'), 'changeBlock remove du dernier bloc : texte terminé proprement');
  ok(ch({ n: 2, hash: h(2), markdown: '  \n' }) === ch({ n: 2, hash: h(2), mode: 'remove' }), 'changeBlock replace par du vide = retrait');
  ok(Blocks.changeBlock(md, { n: 2, hash: 'deadbeef', markdown: 'X' }).error?.code === 'stale', 'changeBlock : empreinte périmée refusée');
  ok(Blocks.changeBlock(md, { n: 9, hash: h(2), markdown: 'X' }).error?.code === 'missing', 'changeBlock : bloc inexistant refusé');
  ok(Blocks.changeBlock(md, { n: 2, hash: h(2), mode: 'after', markdown: '' }).error?.code === 'empty', 'changeBlock : rien à insérer refusé');
  ok(Blocks.changeBlock(md.replace(/\n/g, '\r\n'), { n: 2, hash: h(2), markdown: 'Nouveau.' }).markdown === md.replace('Un  paragraphe.', 'Nouveau.'), 'changeBlock : fins de ligne Windows acceptées');
  const one = Blocks.changeBlock('Seul.\n', { n: 1, hash: Blocks.hash('Seul.'), mode: 'remove' }).markdown;
  ok(one === '', 'changeBlock : retirer l’unique bloc donne un texte vide');
  const code = '```\na\n\nb\n```\n\nFin.\n';
  ok(Blocks.changeBlock(code, { n: 1, hash: Blocks.address(code).blocks[0].hash, markdown: 'Code retiré.' }).markdown === 'Code retiré.\n\nFin.\n', 'changeBlock : un bloc de code avec ligne vide est un seul bloc');

  const doc = '---\ntitle: T\n---\n\n# Titre\n\nTexte.\n';
  ok(Blocks.combine(doc, '\nAjout.\n', 'append') === doc + '\nAjout.\n', 'combine append : à la fin');
  ok(Blocks.combine(doc, 'Ajout.', 'prepend') === '---\ntitle: T\n---\n\nAjout.\n\n# Titre\n\nTexte.\n', 'combine prepend : au début, sous le frontmatter');
  ok(Blocks.combine(doc, 'Neuf.', 'replace') === '---\ntitle: T\n---\n\nNeuf.\n', 'combine replace sans frontmatter : celui du contenu est gardé');
  ok(Blocks.combine(doc, '---\ntitle: Z\n---\nNeuf.', 'replace') === '---\ntitle: Z\n---\n\nNeuf.\n', 'combine replace avec frontmatter : il remplace');
  ok(Blocks.combine(doc, '---\nlang: fr\ntitle: Z\n---\nAjout.', 'append') === '---\ntitle: T\nlang: fr\n---\n\n# Titre\n\nTexte.\n\nAjout.\n', 'combine append : clés nouvelles ajoutées, celles du contenu inchangées');
  ok(Blocks.combine('', 'Premier.', 'append') === 'Premier.\n' && Blocks.combine('Texte.\n', '', 'prepend') === 'Texte.\n', 'combine : contenu vide, fragment vide');
  ok(Blocks.combine('---\nmal formé\n---\nTexte.\n', '---\nk: v\n---\nX', 'append') === '---\nmal formé\n---\nTexte.\n\nX\n', 'combine : frontmatter mal formé laissé tel quel, pas de second');
}

// ---- I6 : différences ligne à ligne ----
{
  const show = (d) => d.map((l) => l.op + l.text).join('|');
  ok(show(Blocks.diffLines('a\nb\nc', 'a\nb\nc')) === ' a| b| c', 'diffLines : textes égaux');
  ok(show(Blocks.diffLines('a\nb\nc', 'a\nB\nc')) === ' a|-b|+B| c', 'diffLines : une ligne changée, l’ancienne avant la nouvelle');
  ok(show(Blocks.diffLines('a\nc', 'a\nb\nc')) === ' a|+b| c' && show(Blocks.diffLines('a\nb\nc', 'a\nc')) === ' a|-b| c', 'diffLines : ajout, retrait');
  const d = Blocks.diffLines('# T\n\nun\ndeux\ntrois\n', '# T\n\nzéro\nun\ntrois\nquatre\n');
  ok(d.filter((l) => l.op === '+').map((l) => l.text).join() === 'zéro,quatre' && d.filter((l) => l.op === '-').map((l) => l.text).join() === 'deux' && d.filter((l) => l.op === ' ').length === 5, 'diffLines : plus longue sous-suite commune');
  ok(Blocks.diffLines('a\r\nb', 'a\nb').every((l) => l.op === ' '), 'diffLines : fins de ligne Windows ignorées');
  const big = Array.from({ length: 30 }, (_, i) => 'l' + i).join('\n');
  ok(Blocks.diffLines(big, big.replace('l3', 'x'), 0).filter((l) => l.op !== ' ').length === 2, 'diffLines : au-delà de la limite, retrait + ajout en bloc');
}

// ---- A1 : IA du document par opérations ----
{
  const show = (r) => (r.error ? 'ERR ' + r.error : r.ops.map((o) => `${o.mode} ${o.n}:${o.markdown}`).join(' | '));
  const r = Blocks.parseOps('@@ remplacer 3\nNouveau bloc 3.\n\n@@ après 5\n## Titre\n\nUn paragraphe.\n\n@@ avant 1\nTout début.\n@@ supprimer 4\n', 5);
  ok(show(r) === 'replace 3:Nouveau bloc 3. | after 5:## Titre\n\nUn paragraphe. | before 1:Tout début. | remove 4:', 'parseOps : quatre verbes, corps jusqu’au prochain @@, plusieurs blocs permis (' + show(r) + ')');
  ok(show(Blocks.parseOps('', 3)) === '' && show(Blocks.parseOps('  \n\n', 3)) === '' && show(Blocks.parseOps('@@ rien\n', 3)) === '', 'parseOps : « @@ rien » ou réponse vide → aucune opération (valide)');
  ok(show(Blocks.parseOps('@@ rien\n@@ supprimer 1', 3)).startsWith('ERR ') && show(Blocks.parseOps('@@ remplacer 1\nA\n@@', 3)).startsWith('ERR Ligne 3'), 'parseOps : « @@ rien » avec d’autres opérations, « @@ » seul : refusés');
  ok(show(Blocks.parseOps('@@ remplacer 0\n---\ntitle: T\n---\n@@ après 0\nEn tête.', 2)) === 'replace 0:---\ntitle: T\n--- | after 0:En tête.', 'parseOps : bloc 0 (frontmatter) : remplacer et après');
  ok(show(Blocks.parseOps('@@ avant 0\nx', 2)).startsWith('ERR ') && show(Blocks.parseOps('@@ supprimer 0', 2)).startsWith('ERR '), 'parseOps : avant 0, supprimer 0 refusés');
  ok(show(Blocks.parseOps('@@ après 2\nA\n@@ après 2\nB\n@@ avant 2\nC', 2)) === 'after 2:A | after 2:B | before 2:C', 'parseOps : plusieurs avant / après sur un même numéro');
  ok(show(Blocks.parseOps('@@ remplacer 2\nA\n@@ supprimer 2', 2)).includes('bloc 2'), 'parseOps : remplacer + supprimer sur un même numéro refusés');
  ok(show(Blocks.parseOps('@@ remplacer 2\nA\n@@ remplacer 2\nB', 2)).startsWith('ERR '), 'parseOps : deux remplacer sur un même numéro refusés');
  ok(show(Blocks.parseOps('@@ remplacer 7\nA', 3)) === 'ERR Ligne 1 : pas de bloc 7 (le document en a 3)', 'parseOps : numéro inconnu, message avec la ligne');
  ok(show(Blocks.parseOps('Voici les changements :\n@@ remplacer 1\nA', 3)).startsWith('ERR Ligne 1'), 'parseOps : texte avant le premier @@ refusé');
  ok(show(Blocks.parseOps('@@ modifier 1\nA', 3)).startsWith('ERR Ligne 1'), 'parseOps : verbe inconnu refusé');
  ok(show(Blocks.parseOps('@@ remplacer 1\n\n@@ supprimer 2', 3)).startsWith('ERR Ligne 1') && show(Blocks.parseOps('@@ supprimer 2\nreste', 3)).startsWith('ERR Ligne 1'), 'parseOps : remplacer sans corps, supprimer avec corps refusés');
  ok(show(Blocks.parseOps('@@ remplacer 1\r\nA\r\n', 3)) === 'replace 1:A', 'parseOps : fins de ligne Windows');

  const words = (a, b) => Blocks.diffWords(a, b).map((p) => p.op + p.text).join('|');
  ok(words('Le chein dort.', 'Le chien dort.') === ' Le |-chein|+chien|  dort.', 'diffWords : un mot changé, le reste en morceaux communs (' + words('Le chein dort.', 'Le chien dort.') + ')');
  ok(words('a b', 'a b') === ' a b' && words('', 'x') === '+x' && words('x', '') === '-x', 'diffWords : égaux, tout ajouté, tout retiré');
  const back = (a, b) => { const d = Blocks.diffWords(a, b); return d.filter((p) => p.op !== '+').map((p) => p.text).join('') === a && d.filter((p) => p.op !== '-').map((p) => p.text).join('') === b; };
  ok(back('un deux trois', 'un trois quatre') && back('Ligne **un**\nligne deux', 'Ligne **1**\nligne deux, fin') && back('', ''), 'diffWords : l’ancien = communs + retirés, le nouveau = communs + ajoutés');
  ok(Blocks.diffWords('un deux trois', 'un trois quatre').filter((p) => p.op === ' ').map((p) => p.text.trim()).join() === 'un,trois', 'diffWords : plus longue sous-suite commune de mots');
}

// ---- Modules de l'écran : syntaxe valide (une erreur bloquerait tout l'éditeur dans le navigateur) ----
const { spawnSync } = require('node:child_process');
for (const f of ['blockquilt-editor.js', ...fs.readdirSync(path.join(ROOT, 'editor')).map((x) => 'editor/' + x)]) {
  const r = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(path.join(ROOT, f)) });
  ok(r.status === 0, `module ${f} : syntaxe valide${r.status ? ' — ' + String(r.stderr).split('\n').slice(0, 4).join(' ') : ''}`);
}

// ---- Carte : photo, titre, texte, lien en bouton, chacun facultatif ----
{
  const c = Blocks.parse(fs.readFileSync(path.join(FIX, 'card.md'), 'utf8')).blocks;
  ok(c[0].src === 'media/abc123def456' && c[0].alt === 'Paysage de montagne' && c[0].title === 'Les plus beaux sentiers des Alpes' && c[0].label === 'Lire l’article'.replace('’', "'") && c[0].href === 'https://exemple.fr/sentiers', 'carte : photo, titre, lien lus');
  ok(c[1].src === '' && c[1].href === '' && c[1].title === 'Sans photo ni lien', 'carte : sans photo ni lien');
  const h = Blocks.toHtml(':::card\n![Montagne](media/m1)\n### Les Alpes\nUn **beau** texte.\n[Lire](https://exemple.fr)\n:::', { media: '/m/' });
  ok(h.includes('<div class="bq-card"><img src="/m/m1" alt="Montagne" loading="lazy"><div class="bq-card-body"><h3 class="bq-card-title">Les Alpes</h3><p>Un <strong>beau</strong> texte.</p><p><a class="bq-card-link" href="https://exemple.fr">Lire</a></p></div></div>'), 'carte : rendu HTML (photo, titre sans ancre, texte, bouton) — ' + h);
  ok(!Blocks.toHtml(':::card\n### A\n:::\n\n## A').includes('id="a-2"'), 'carte : son titre ne prend pas d’ancre dans le plan de la page');
  ok(types(':::card\n[Lire](javascript:alert(1))\n:::') !== 'card' || !Blocks.toHtml(':::card\n[Lire](javascript:alert(1))\n:::').includes('href="javascript'), 'carte : lien javascript: jamais en bouton');
  ok(types(':::card\n## Pas un titre de carte\n:::') === 'raw' && types(':::card\n:::') === 'raw' && types(':::card\n> citation\n:::') === 'raw', 'carte : ## , vide ou citation → texte source');
  ok(Blocks.toMarkdown({ type: 'card', ...Blocks.blank('card') }) === '', 'carte vide : rien');
  ok(Blocks.toMarkdown({ type: 'card', ...Blocks.blank('card'), title: 'T', label: 'Lire', href: 'https://x.fr' }) === ':::card\n### T\n[Lire](https://x.fr)\n:::', 'carte : écrite sans photo ni texte');
  ok(Blocks.lint(':::card\n### A\n')[0]?.message.includes('non fermé'), 'carte non fermée : alerte lint');
}

// ---- Lignes composées : largeur en tête de bloc, Espace, regroupement, rendu (L1) ----
{
  const doc = '<!-- 1/3 -->\n![Chalet](media/c1)\n\n<!-- 2/3 -->\nLe chalet est au bout du chemin.\n\n<!-- 1/2 -->\n:::card\n### A\n:::\n\n<!-- 1/2 -->\n## Titre\n\n<!-- 1/3 -->\n\n<!-- 1/3 -->\n---\n\n<!-- 1/3 -->\n```js\nx\n```\n\nPleine largeur.\n';
  const { blocks } = Blocks.parse(doc);
  ok(blocks.map((b) => `${b.type}:${b.width || '-'}`).join() === 'photo:1/3,text:2/3,card:1/2,h2:1/2,space:1/3,hr:1/3,code:1/3,text:-', 'largeur : lue sur tous les types, Espace, titre et bloc ::: gardés avec leur largeur — ' + blocks.map((b) => `${b.type}:${b.width || '-'}`).join());
  ok(Blocks.serialize({}, blocks) === doc, 'largeur : aller-retour exact');
  ok(Blocks.lint(doc).length === 0, 'lignes complètes : aucune alerte');
  ok(types('<!-- 3/4 -->\nTexte') !== 'text' || !Blocks.parse('<!-- 3/4 -->\nTexte').blocks[0].width, 'largeur : seules 1/3, 1/2, 2/3');
  ok(Blocks.parse('<!-- 1/2 -->\nTexte').blocks[0].html === 'Texte', 'largeur : le commentaire ne reste pas dans le texte');
  ok(Blocks.toMarkdown({ type: 'text', html: '', width: '1/2' }) === '', 'bloc vide avec largeur : disparaît');
  ok(Blocks.toMarkdown({ type: 'space', width: '1/3' }) === '<!-- 1/3 -->', 'Espace : le commentaire seul');
  const rows = (md) => Blocks.rows(Blocks.parse(md).blocks).map((r) => (r.row ? '[' + r.row.map((b) => b.width).join('+') + ']' : '-')).join(' ');
  ok(rows('<!-- 1/2 -->\nA\n\n<!-- 1/2 -->\nB\n\n<!-- 1/3 -->\nC\n\n<!-- 2/3 -->\nD\n\n<!-- 1/3 -->\nE\n\n<!-- 1/3 -->\nF\n\n<!-- 1/3 -->\nG\n\nH') === '[1/2+1/2] [1/3+2/3] [1/3+1/3+1/3] -', 'lignes : ½+½, ⅓+⅔, ⅓+⅓+⅓, puis pleine largeur');
  ok(rows('<!-- 1/2 -->\nA\n\n<!-- 2/3 -->\nB\n\n<!-- 1/3 -->\nC') === '[1/2] [2/3+1/3]', 'débordement : nouvelle ligne');
  ok(rows('<!-- 1/3 -->\nA\n\nB') === '[1/3] -', 'incomplète puis pleine largeur');
  const warn = Blocks.lint('Intro\n\n<!-- 1/2 -->\nA\n\n<!-- 2/3 -->\nB\n\n<!-- 1/3 -->\nC');
  ok(warn.length === 1 && warn[0].line === 3 && warn[0].message.startsWith('Ligne incomplète'), 'lint : ligne incomplète signalée à sa première ligne — ' + JSON.stringify(warn));
  const h = Blocks.toHtml('<!-- 1/3 -->\n![C](media/c1)\n\n<!-- 2/3 -->\nTexte.\n\nFin.', { title: false });
  ok(h.includes('<div class="bq-row"><div class="bq-col bq-w2"><figure>') && h.includes('<div class="bq-col bq-w4"><p>Texte.</p></div></div>\n<p>Fin.</p>'), 'rendu : bq-row, une bq-col par bloc (sixièmes) — ' + h);
  ok(Blocks.toHtml('<!-- 1/3 -->\n\n<!-- 2/3 -->\nT', { title: false }).includes('<div class="bq-col bq-w2 bq-space" aria-hidden="true"></div>'), 'rendu : Espace = colonne vide cachée aux lecteurs d’écran');
  ok(!Blocks.toHtml('<!-- 1/3 -->\n\n<!-- 1/3 -->', { title: false }).includes('bq-row'), 'rendu : une ligne faite seulement d’Espaces ne s’affiche pas');
}

// ---- Lignes composées dans l'éditeur (L3) : la largeur survit au changement de type et à l'IA ----
{
  const b = Blocks.parse('<!-- 1/2 -->\nTexte.').blocks[0];
  ok(Blocks.convert(b, 't2').width === '1/2' && Blocks.convert(b, 'h2').width === '1/2', 'changer de type : la largeur reste');
  ok(Blocks.keepWidth(b, Blocks.parse('TEXTE.').blocks)[0].width === '1/2', 'IA sur un bloc : un bloc rendu sans largeur garde la sienne');
  ok(Blocks.keepWidth(b, Blocks.parse('<!-- 1/3 -->\nTEXTE.').blocks)[0].width === '1/3', 'IA sur un bloc : une largeur écrite par l’IA l’emporte');
  ok(Blocks.keepWidth(b, Blocks.parse('A\n\nB').blocks).every((x) => !x.width), 'IA sur un bloc : plusieurs blocs rendus → pas de largeur imposée');
}

// ---- Photo : taille et format, {size=… ratio=…} ----
{
  const p = Blocks.fromMarkdown('![Le portail](media/aabbccddeeff){size=medium ratio=4:3}');
  ok(p.type === 'photo' && p.src === 'media/aabbccddeeff' && p.alt === 'Le portail' && p.size === 'medium' && p.ratio === '4:3', 'photo : taille et format lus');
  ok(Blocks.fromMarkdown('![x](media/aabbccddeeff)').size === '' && Blocks.fromMarkdown('![x](media/aabbccddeeff)').ratio === '', 'photo sans options : taille et format par défaut');
  const blank = Blocks.blank('photo');
  ok(blank.size === '' && blank.ratio === '', 'photo neuve : taille et format par défaut');
  const md = (o) => Blocks.toMarkdown({ type: 'photo', src: 'media/aabbccddeeff', alt: 'x', size: '', ratio: '', ...o });
  ok(md({}) === '![x](media/aabbccddeeff)', 'photo : rien écrit pour les valeurs par défaut');
  ok(md({ size: 'small' }) === '![x](media/aabbccddeeff){size=small}' && md({ ratio: '1:1' }) === '![x](media/aabbccddeeff){ratio=1:1}', 'photo : une seule option écrite');
  ok(md({ ratio: '16:9', size: 'medium' }) === '![x](media/aabbccddeeff){size=medium ratio=16:9}', 'photo : toujours size puis ratio');
  for (const bad of ['{size=big}', '{ratio=3:2}', '{foo=1}', '{}', '{ratio=1:1 size=small}', '{size=small  ratio=1:1}', '{ size=small}'])
    ok(Blocks.fromMarkdown('![x](media/aabbccddeeff)' + bad).type === 'raw', `photo : ${bad} non reconnu → texte source`);
  ok(Blocks.parse('<!-- 1/2 -->\n![x](media/aabbccddeeff){size=small}').blocks[0].size === 'small', 'photo : options lues dans une ligne composée');
  ok(Blocks.fromMarkdown(':::carousel\n![x](media/aabbccddeeff){size=small}\n:::').type === 'raw', 'carrousel : pas d’options sur ses photos');
  ok(Blocks.toHtml('![x](media/a){size=medium}').includes('<figure class="bq-photo-medium"><img'), 'rendu : classe de taille sur <figure>');
}

// ---- Coller une page web : HTML → Markdown blockquilt, au mieux ----
{
  const f = Blocks.fromHtml;
  const same = (html, md, name) => { const got = f(html); ok(got === md, `coller du HTML : ${name}` + (got === md ? '' : ` → ${JSON.stringify(got)}`)); };
  same('<h1>A</h1><h2>B</h2><h4>C</h4><h6>D</h6><p>E</p>', '# A\n\n## B\n\n### C\n\n### D\n\nE', 'titres h1 à h6, h4 à h6 → h3');
  same('<p>Un <b class="x">gras</b>, <em>penché</em>, <a href="https://e.fr/a?x=1&amp;y=2">lien</a> et <a href="javascript:alert(1)">piège</a>.</p>', 'Un **gras**, *penché*, [lien](https://e.fr/a?x=1&y=2) et piège.', 'mise en forme et liens, javascript: retiré');
  same('<p>a<br>b</p><div>c</div>', 'a\nb\n\nc', 'retour à la ligne dans un paragraphe, un bloc par paragraphe');
  same('<p>  a\n   b  </p>', 'a b', 'blancs du HTML repliés');
  same('<ul><li>a<ul><li>b</li></ul></li><li><p>c</p></li></ul><ol><li>x</li><li>y</li></ol>', '- a\n  - b\n- c\n\n1. x\n2. y', 'listes imbriquées, puces et numéros');
  same('<blockquote><p>Une</p><p>Deux</p></blockquote>', '> Une\n> Deux', 'citation sur plusieurs paragraphes');
  same('<pre><code class="language-js">a &lt; b\n  c</code></pre>', '```\na < b\n  c\n```', 'code : texte brut, espaces gardés');
  same('<figure><img src="https://e.fr/p.jpg" alt="alt"><figcaption>La <b>plage</b></figcaption></figure>', '![La plage](https://e.fr/p.jpg)', 'photo : la légende remplace le texte alternatif');
  same('<p>Avant</p><img src="https://e.fr/a b.jpg" alt="Vue [1]"><p>Après</p>', 'Avant\n\n![Vue \\[1\\]](https://e.fr/a%20b.jpg)\n\nAprès', 'photo entre deux paragraphes, adresse et texte protégés');
  same('<img src="data:image/png;base64,AAA"><img src="/rel.png"><img src="http://e.fr/x.png"><img src="https://e.fr/i.png" width="16" height="16"><p>Reste</p>', 'Reste', 'images ignorées : data:, relative, http, icône');
  same('<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ?si=x"></iframe><iframe src="https://player.vimeo.com/video/76979871"></iframe><iframe src="https://e.fr/pub"></iframe>', 'https://youtu.be/dQw4w9WgXcQ\n\nhttps://vimeo.com/76979871', 'vidéo intégrée YouTube et Vimeo, autre iframe retirée');
  same('<!DOCTYPE html><html><head><title>T</title><style>p{}</style></head><body><!--StartFragment--><script>alert(1)</script><nav><a href="/">Accueil</a></nav><p>Reste</p><embed src="x"><p>Fin</p></body></html>', 'Reste\n\nFin', 'script, style, nav, commentaires retirés ; balise sans fin sans perte');
  same('<p># pas un titre *ni* [lien]</p><p>- pas une liste</p>', '\\# pas un titre \\*ni\\* \\[lien\\]\n\n\\- pas une liste', 'signes Markdown du texte protégés');
  same('<p>L&#8217;été &amp; l&rsquo;hiver&nbsp;! &#x1F600; &#99999999;</p>', 'L’été & l’hiver ! 😀 �', 'entités décodées');
  same('<hr><h2>Titre <b>gras</b></h2>', '---\n\n## Titre gras', 'ligne, titre sans mise en forme');
  same('<p><b>a</p><p>b</b> <i>c</p>', '**a**\n\nb *c*', 'balises mal fermées : aucun texte perdu');
  same('<table><tr><th>a</th><td>b</td></tr><tr><td>c</td></tr></table>', 'a b\n\nc', 'tableau : une ligne = un paragraphe');
  // Google Docs : tout est enveloppé dans un <b style="font-weight:normal">, et chaque morceau dans un <span>.
  same('<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1"><h1 dir="ltr"><span style="font-size:20pt">Titre</span></h1><p dir="ltr"><span style="font-weight:700">Gras</span><span> normal</span></p></b>', '# Titre\n\nGras normal', 'Google Docs');
  same('', '', 'rien');
  const article = `<article><h1>Un article</h1><p>Intro avec <a href="https://e.fr">un lien</a>.</p><h2>Partie</h2><ul><li>un</li><li>deux</li></ul>
    <figure><img src="https://e.fr/p.jpg" alt=""><figcaption>Une photo</figcaption></figure><blockquote>Une citation</blockquote>
    <pre>npm test</pre><hr><p>Fin.</p></article>`;
  const parsed = Blocks.parse(f(article)).blocks;
  ok(parsed.map((b) => b.type).join() === 'h1,text,h2,text,photo,quote,code,hr,text', `coller du HTML : article complet → ${parsed.map((b) => b.type).join()}`);
}

process.exit(failed ? 1 : 0);
