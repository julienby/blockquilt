// Fabrique emoji.json (emoji, nom français, mots-clés, catégorie) depuis les fichiers Unicode et CLDR.
// Lancé une fois par un développeur, résultat commité ; ne tourne jamais chez l'utilisateur.
//   node dev/build-emoji.mjs            (télécharge les sources)
//   node dev/build-emoji.mjs <dossier>  (lit emoji-test.txt, fr.json, frd.json déjà téléchargés)
// Sources : Unicode emoji-test.txt et annotations CLDR françaises (licence Unicode, voir README).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = '15.1';
const SOURCES = {
  'emoji-test.txt': `https://unicode.org/Public/emoji/${VERSION}/emoji-test.txt`,
  'fr.json': 'https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-full/annotations/fr/annotations.json',
  'frd.json': 'https://raw.githubusercontent.com/unicode-org/cldr-json/main/cldr-json/cldr-annotations-derived-full/annotationsDerived/fr/annotations.json',
};
const dir = process.argv[2];
const read = async (name) => (dir ? fs.readFileSync(path.join(dir, name), 'utf8') : (await fetch(SOURCES[name])).text());

const CATEGORIES = {
  'Smileys & Emotion': 'Smileys', 'People & Body': 'Personnes', 'Animals & Nature': 'Nature', 'Food & Drink': 'Nourriture',
  'Travel & Places': 'Lieux', Activities: 'Activités', Objects: 'Objets', Symbols: 'Symboles', Flags: 'Drapeaux',
};
const names = Object.values(CATEGORIES);
const annotations = { ...JSON.parse(await read('frd.json')).annotationsDerived.annotations, ...JSON.parse(await read('fr.json')).annotations.annotations };
const lookup = (e) => annotations[e] || annotations[e.replace(/\uFE0F/g, '')];

const out = [];
let group = null;
for (const line of (await read('emoji-test.txt')).split('\n')) {
  const g = /^# group: (.+)$/.exec(line);
  if (g) { group = CATEGORIES[g[1].trim()] ?? null; continue; }
  const m = /^[0-9A-F ]+;\s*fully-qualified\s*#\s*(\S+)\s+E[\d.]+\s+(.+)$/.exec(line);
  if (!m || !group) continue;
  const emoji = m[1];
  if (/[\u{1F3FB}-\u{1F3FF}]/u.test(emoji)) continue; // teintes de peau : le sélecteur garde la forme de base
  const a = lookup(emoji);
  const name = a?.tts?.[0] ?? m[2];
  const words = (a?.default ?? []).filter((w) => w !== name && !name.includes(w)).slice(0, 6).join('|');
  out.push(words ? [emoji, name, words, names.indexOf(group)] : [emoji, name, names.indexOf(group)]);
}
const json = JSON.stringify({ version: VERSION, categories: names, emoji: out });
const target = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'emoji.json');
fs.writeFileSync(target, json);
console.log(`${out.length} emoji, ${(json.length / 1024).toFixed(0)} ko → ${target}`);
