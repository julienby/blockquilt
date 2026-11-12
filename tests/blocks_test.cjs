// Éditeur par blocs : coupe et recolle le Markdown sans rien perdre.
const Blocks = require('../blockquilt.js');
const norm = (s) => s.replace(/\n{3,}/g, '\n\n').trim() + '\n';
let failed = 0;
const ok = (cond, name) => { console.log((cond ? 'ok   ' : 'FAIL ') + name); if (!cond) failed++; };

const sample = `## 🏡 Arrivée

La clé est dans la boîte.
Réseau : box
Code Wi-Fi : abc

### Garage

- porte bleue
- code 1515

> 💡 Garez-vous à gauche.

> ⚠️ Ne pas fumer.

![Piscine](media/abcdef123456)

Fin.
`;
const { title, blocks } = Blocks.parse(sample);
ok(title === '## 🏡 Arrivée', 'titre : première ligne gardée');
ok(blocks[0].text.includes('Réseau : box\nCode Wi-Fi : abc'), 'saut de ligne simple gardé dans un bloc');
ok(Blocks.serialize(title, blocks) === norm(sample), 'aller-retour : texte identique');
ok(Blocks.serialize(title, [blocks[5], blocks[0], ...blocks.slice(1, 5)]).split('\n\n')[1].startsWith('![Piscine]'), 'déplacer un bloc image : il change de place dans le texte');
ok(Blocks.parse('').blocks.length === 0 && Blocks.serialize('', []) === '\n', 'texte vide');
ok(Blocks.parse('## \n\n').blocks.length === 0, 'nouvelle rubrique : ## ne crée pas de bloc parasite');
ok(Blocks.parse('## Seul\n').title === '## Seul' && Blocks.parse('Sans titre\n\nDeux').title === '', 'sans titre : pas de titre inventé');
ok(Blocks.serialize('## T', [{ text: '  ' }, { text: 'a' }]) === '## T\n\na\n', 'bloc vide ignoré');

// Blocs sémantiques : 5 types texte (title, text, tip, advice, warning) + médias (photo, video) ; listes dans le texte et anciens :::sensible repris en text.
ok(Blocks.TEXT_KEYS.join() === 'title,text,tip,advice,warning', 'types texte : 5 types (sans list ni secret comme structure de bloc)');
const kind = (md) => Blocks.fromMarkdown(md).type;
ok([
  '### Garage', 'La clé est là.', '> 💡 Garez-vous à gauche.', '> 🧭 Le Fournil, à 150 m.', '> ⚠️ Ne pas fumer.', '> **Important :** stop',
  '- pain\n- lait', '1. ouvrir\n2. fermer', ':::sensible\nCode : 4242\n:::', '![La piscine](media/aabbccddeeff.jpg)', 'https://www.youtube.com/watch?v=abc',
].map(kind).join() === 'title,text,tip,advice,warning,tip,text,text,text,photo,video', 'types : titre, texte (dont listes et anciens codes), astuce, conseil, consigne, photo, vidéo');

ok(Blocks.fromMarkdown('- pain\n- **lait**').html === '<ul><li>pain</li><li><b>lait</b></li></ul>', 'liste à puces : rendue en <ul><li> dans le bloc texte');
ok(Blocks.fromMarkdown(':::sensible\n**Code boîte**\n4829\n:::').type === 'text' && Blocks.toMarkdown(Blocks.fromMarkdown(':::sensible\n**Code boîte**\n4829\n:::')) === '**Code boîte**\n4829', 'ancien bloc :::sensible : repris en bloc texte normal sans perte');

const roundtrip = (md) => { const b = Blocks.fromMarkdown(md); return b.type !== 'raw' && Blocks.toMarkdown(b) === md; };
for (const md of ['Bonjour **tout le monde**, voir *ici*.', 'Ligne un\nLigne deux', '### Garage', '> 💡 Garez-vous à gauche.', '> 🧭 Le Fournil.\n> Fermé le mercredi.', '> ⚠️ Ne pas fumer.', '> **Important :** le code s’arrête à **21 h**.',
  '- pain\n- **lait**', '1. ouvrir\n2. fermer', '- pain\n- lait',
  '![La piscine](media/aabbccddeeff.jpg)', 'https://youtu.be/abc123', 'Voir [la carte](https://exemple.fr/a?b=1) puis **[le site](https://x.fr)**', 'Un ==mot clé== et ++souligné++', 'Mot de passe : a\\*b_c', 'Intro\n- un\n- deux', '- a\n  suite indentée']) {
  ok(roundtrip(md), 'aller-retour : ' + JSON.stringify(md));
}
ok(['| a | b |\n|---|---|\n| 1 | 2 |', 'Du `code` ici', '# Titre un'].every((md) => kind(md) === 'raw' && Blocks.toMarkdown(Blocks.fromMarkdown(md)) === md), 'ce que l’éditeur ne sait pas refaire reste intact (tableau, code, titre #)');
ok(Blocks.toMarkdown(Blocks.fromMarkdown('- pain \n- lait')) === '- pain\n- lait', 'espaces en fin de ligne : ignorés');

// Ce que produit le navigateur en modifiant.
const md = (html, type = 'text') => Blocks.toMarkdown({ type, html });
ok(md('un <b>gras </b>mot') === 'un **gras** mot', 'gras : les espaces sortent des **');
ok(md('a <u>sou</u> <mark class="ehg-highlight">sur</mark> <i>it</i>') === 'a ++sou++ ==sur== *it*', 'souligné, surligné, italique');
ok(md('<ul><li>un</li><li><b>deux</b></li></ul>') === '- un\n- **deux**', 'liste créée depuis la barre flottante : convertie en Markdown');
ok(md('<strong>a</strong><b>b</b>') === '**ab**', 'deux gras collés : un seul');
ok(md('a<div>b</div><div><br></div><div>c</div>') === 'a\nb\n\nc', 'Entrée du navigateur : lignes');
ok(md('x&nbsp;y &amp; z &lt;3') === 'x y & z <3', 'espaces insécables et entités');
ok(md('') === '' && md('<br>') === '' && Blocks.isEmpty({ type: 'tip', html: '<br>', mark: '💡' }), 'bloc vide : disparaît');
ok(md('2 * 3 [x] _a_ b_c C++ a == b') === '2 \\* 3 \\[x\\] \\_a\\_ b_c C\\+\\+ a \\=\\= b', 'signes Markdown tapés : protégés');
ok(md('# dièse<br>&gt; cite<br>1. num').split('\n').every((l) => l.startsWith('\\') || /^\d/.test(l)) && md('1. num').startsWith('1\\.'), 'début de ligne qui changerait le sens : protégé');
ok(md('- tiret') === '- tiret' && Blocks.toMarkdown({ type: 'title', html: '- tiret' }) === '### \\- tiret', 'tiret de début : gardé dans un texte, protégé dans un titre');
ok(md('<a href="javascript:alert(1)">piège</a>') === 'piège' && md('<a href="www.exemple.fr">site</a>') === '[site](https://www.exemple.fr)' && md('<a href="https://a.fr/x(1)">l</a>') === '[l](https://a.fr/x%281%29)', 'liens : adresses sûres seulement');
ok(Blocks.toMarkdown({ type: 'title', html: 'Titre  long<br>suite' }) === '### Titre  long suite', 'titre : une seule ligne');
ok(Blocks.toMarkdown({ type: 'tip', html: 'un<br>deux', mark: '💡' }) === '> 💡 un\n> deux' && Blocks.toMarkdown({ type: 'warning', html: 'x', mark: '⚠️' }) === '> ⚠️ x', 'astuce, consigne');
ok(Blocks.toMarkdown({ type: 'photo', file: 'aabbccddeeff', alt: 'La [piscine]' }) === '![La \\[piscine\\]](media/aabbccddeeff)' && Blocks.toMarkdown({ type: 'photo', file: '', alt: 'x' }) === '' && Blocks.toMarkdown({ type: 'video', url: ' https://youtu.be/x ' }) === 'https://youtu.be/x', 'photo (légende protégée) et vidéo');

// Conversion universelle des 5 types texte : aucune ligne perdue.
const L = (b) => Blocks.lines(b).map((h) => Blocks.stripTags(h).trim());
const start = { type: 'text', html: 'Allumez la machine<br>Attendez 15 s<br><b>Servez</b>' };
for (const from of Blocks.TEXT_KEYS) {
  for (const to of Blocks.TEXT_KEYS) {
    const a = Blocks.convert(from === 'text' ? start : Blocks.convert(start, from), to);
    ok(a.type === to && (to === 'title' || from === 'title' ? L(a).join(' ') === 'Allumez la machine Attendez 15 s Servez' : L(a).join('|') === 'Allumez la machine|Attendez 15 s|Servez'), `conversion ${from} → ${to} sans perte`);
  }
}
// Fusion de deux blocs voisins : le type du dessus l'emporte, aucune ligne perdue.
const tip = { type: 'tip', html: 'Garez-vous <b>à gauche</b>', mark: '💡' };
const list = { type: 'text', html: '<ul><li>porte bleue</li><li>code 1515</li></ul>' };
const fused = Blocks.merge(tip, list);
ok(fused.type === 'tip' && fused.mark === '💡' && Blocks.toMarkdown(fused) === '> 💡 Garez-vous **à gauche**\n> - porte bleue\n> - code 1515', 'fusion astuce + liste : astuce, lignes et liste gardées');
ok(Blocks.toMarkdown(Blocks.merge({ type: 'text', html: 'Avant' }, { type: 'title', html: 'Garage' })) === 'Avant\nGarage', 'fusion texte + titre : le titre devient une ligne du texte');
ok(Blocks.toMarkdown(Blocks.merge({ type: 'warning', html: 'a', mark: '⚠️' }, { type: 'advice', html: 'b', mark: '🧭' })) === '> ⚠️ a\n> b', 'fusion consigne + conseil : la consigne l’emporte');
ok(Blocks.merge({ type: 'title', html: 'Garage' }, list) === null, 'fusion sous un titre : refusée');
ok(Blocks.merge(tip, { type: 'photo', file: 'aabbccddeeff', alt: '' }) === null && Blocks.merge({ type: 'raw', md: '| a |' }, list) === null, 'fusion avec photo, vidéo ou bloc avancé : refusée');
ok(Blocks.convert({ type: 'tip', html: 'x', mark: '💡' }, 'advice').mark === '🧭' && Blocks.convert({ type: 'tip', html: 'x', mark: '' }, 'tip').mark === '', 'conversion : l’emoji suit le type');

// Garanties UI de l'éditeur (assets/blocks.js) : menu flottant fonctionnel sur mobile et repositionnement au-dessus du clavier virtuel.
const fs = require('node:fs');
const src = fs.readFileSync(__dirname + '/../blockquilt.js', 'utf8');
const cssSrc = fs.readFileSync(__dirname + '/../blockquilt.src.css', 'utf8');
ok(!src.includes("pill.addEventListener('touchstart'"), 'menu flottant : aucun preventDefault sur touchstart (ne bloque jamais le click sur mobile)');
ok(src.includes("pill.addEventListener('mousedown', keepSelection)") && src.includes("pill.addEventListener('pointerdown'"), 'menu flottant : conserve la sélection au clic et gère le glisser (mousedown + pointerdown)');
ok(src.includes("canvas.addEventListener('contextmenu'") && cssSrc.includes('-webkit-touch-callout: none'), 'menu flottant : désactive le menu contextuel natif du téléphone sur .ehg-edit');
ok(src.includes('if (!hasSel && !pillForced) { pill.hidden = true; return; }') && src.includes('longPressTimer = setTimeout(() => placePill(true), 450)'), 'menu flottant : apparaît à la sélection de texte OU sur un appui long (450ms / contextmenu), jamais lors d’un retour à la ligne');
ok(src.includes('data-pill-grip') && src.includes('pillDrag'), 'menu flottant : déplaçable au doigt ou à la souris via [data-pill-grip]');
ok(src.includes('spellcheck="false"'), 'clavier virtuel : spellcheck="false" empêche la popup dictionnaire de masquer le clavier dans les listes');
ok(src.includes('const minTop = fullscreenId ? 12 : 72;') && src.includes('const top = rect.top - h - 8;'), 'menu flottant : positionné juste au-dessus de la sélection en mode normal comme en plein écran');
ok(src.includes('ensureVisibleAboveKeyboard') && src.includes('window.scrollBy({ top: delta, behavior: \'smooth\' })'), 'clavier virtuel : un bloc ajouté en bas de page remonte automatiquement au-dessus du clavier');

// Feedback 6 (point 7) : icône libre, un emoji collé depuis n'importe où.
ok(Blocks.firstEmoji(' 🏊 piscine') === '🏊' && Blocks.firstEmoji('🇫🇷') === '🇫🇷' && Blocks.firstEmoji('👨‍👩‍👧 x') === '👨‍👩‍👧' && Blocks.firstEmoji('❤️') === '❤️' && Blocks.firstEmoji('👍🏽') === '👍🏽' && Blocks.firstEmoji('1️⃣') === '1️⃣', 'icône : premier emoji gardé (drapeau, famille, cœur, teinte, touche)');
ok(Blocks.firstEmoji('abc') === '' && Blocks.firstEmoji('') === '' && Blocks.firstEmoji('1 chambre') === '', 'icône : texte sans emoji refusé');
ok(JSON.stringify(Blocks.splitHeading('## 🇫🇷 Accueil')) === JSON.stringify({ icon: '🇫🇷', title: 'Accueil' }) && JSON.stringify(Blocks.splitHeading('## Wi-Fi')) === JSON.stringify({ icon: '', title: 'Wi-Fi' }), 'titre : emoji composé séparé du titre');
ok(!src.includes('ne sait pas refaire (tableau, code…). Il reste tel quel.'), 'Feedback 6 (point 6) : plus de message sur le bloc avancé');

process.exit(failed ? 1 : 0);
