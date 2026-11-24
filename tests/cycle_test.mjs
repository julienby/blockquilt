// Cycle de vie : bin/blockquilt-install et bin/blockquilt-verify, sur un clone du dépôt avec des tags de test.
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bqcycle-'));
let failed = 0;
const ok = (cond, label) => { console.log((cond ? 'ok   ' : 'FAIL ') + label); if (!cond) failed++; };
const git = (...args) => execFileSync('git', ['-C', repo, '-c', 'user.name=test', '-c', 'user.email=test@test', ...args], { encoding: 'utf8' });
const run = (script, ...args) => spawnSync('node', [path.join(repo, 'bin', script), ...args], { encoding: 'utf8' });
const files = (dir) => fs.readdirSync(dir, { recursive: true }).filter((f) => fs.statSync(path.join(dir, f)).isFile()).sort();

// Le clone a le dernier commit ; les scripts viennent de la copie de travail.
const repo = path.join(tmp, 'repo');
execFileSync('git', ['clone', '-q', ROOT, repo]);
fs.mkdirSync(path.join(repo, 'bin'), { recursive: true });
for (const s of ['blockquilt-install', 'blockquilt-verify']) fs.copyFileSync(path.join(ROOT, 'bin', s), path.join(repo, 'bin', s));
git('tag', 'v9.9.0');

try {
  // ---- install ----
  const app = path.join(tmp, 'app');
  fs.mkdirSync(app);
  fs.writeFileSync(path.join(app, 'autre.txt'), 'à garder');
  const r = run('blockquilt-install', '9.9.0', app);
  const web = path.join(app, 'assets/blockquilt/9.9.0');
  const lib = path.join(app, 'lib/blockquilt/9.9.0');
  ok(r.status === 0, `install : code 0 (${r.stderr.trim()})`);
  ok(fs.readFileSync(path.join(web, 'blockquilt.js'), 'utf8') === git('show', 'v9.9.0:blockquilt.js')
    && fs.readFileSync(path.join(lib, 'BlockquiltRender.php'), 'utf8') === git('show', 'v9.9.0:renderers/php/BlockquiltRender.php'),
    'install : les fichiers sont ceux du tag');
  const expected = ['blockquilt.js', 'blockquilt-editor.js', 'blockquilt-content.js', 'blockquilt.css', 'blockquilt-content.css', 'emoji.json', 'editor/document.js', 'fonts/newsreader.woff2'];
  ok(expected.every((f) => fs.existsSync(path.join(web, f))), 'install : fichiers du navigateur, editor/ et fonts/ compris');
  ok(files(lib).join() === 'BlockquiltRender.php,blockquilt_render.py', `install : moteurs PHP et Python dans lib/ (${files(lib)})`);
  ok(fs.readFileSync(path.join(app, 'assets/blockquilt/VERSION'), 'utf8') === '9.9.0\n', 'install : VERSION écrit');
  const top = files(app).filter((f) => !f.startsWith('assets/blockquilt/9.9.0/') && !f.startsWith('lib/blockquilt/9.9.0/'));
  ok(top.join() === 'assets/blockquilt/VERSION,autre.txt' && fs.readFileSync(path.join(app, 'autre.txt'), 'utf8') === 'à garder', `install : rien d'autre n'est touché (${top})`);
  const again = run('blockquilt-install', '9.9.0', app);
  ok(again.status !== 0 && again.stderr.includes('existe déjà'), 'install : une version déjà là est refusée');
  const app2 = path.join(tmp, 'app2');
  fs.mkdirSync(app2);
  const unknown = run('blockquilt-install', '9.9.7', app2);
  ok(unknown.status !== 0 && unknown.stderr.includes('v9.9.7') && files(app2).length === 0, 'install : tag inconnu refusé, rien n’est écrit');
  ok(run('blockquilt-install', '9.9.0', path.join(tmp, 'absent')).status !== 0, 'install : dossier d’application absent refusé');

  // ---- verify ----
  const md = path.join(tmp, 'md');
  fs.mkdirSync(path.join(md, 'sous'), { recursive: true });
  fs.writeFileSync(path.join(md, 'stable.md'), '# Titre\n\nUn paragraphe.\n');
  fs.writeFileSync(path.join(md, 'sous', 'blancs.md'), 'Un.\n\n\n\nDeux.\n'); // relu avec une seule ligne vide
  fs.writeFileSync(path.join(md, 'pas-markdown.txt'), 'ignoré');
  // v9.9.1 : un rendu HTML différent
  const js = path.join(repo, 'blockquilt.js');
  fs.writeFileSync(js, fs.readFileSync(js, 'utf8').replaceAll('<article class="bq-content">', '<article class="bq-content bq-test">'));
  git('commit', '-qam', 'rendu de test');
  git('tag', 'v9.9.1'); // la copie de travail du clone est maintenant celle de v9.9.1

  const same = run('blockquilt-verify', md, 'v9.9.0', 'v9.9.0');
  ok(same.status === 1 && same.stdout.includes('sous/blancs.md') && !same.stdout.includes('pas-markdown'), `verify : relecture non identique → code 1, fichier nommé (${same.stdout.trim()})`);
  fs.rmSync(path.join(md, 'sous'), { recursive: true });
  const clean = run('blockquilt-verify', md, 'v9.9.0', 'v9.9.0');
  ok(clean.status === 0 && clean.stdout.includes('1 contenu') && !clean.stdout.includes('HTML différent'), `verify : même version, rien à signaler → code 0 (${clean.stdout.trim()})`);
  const html = run('blockquilt-verify', md, 'v9.9.0', 'v9.9.1');
  ok(html.status === 0 && html.stdout.includes('HTML différent') && html.stdout.includes('stable.md'), `verify : HTML différent entre deux tags, listé (${html.stdout.trim()})`);
  const work = run('blockquilt-verify', md, 'v9.9.0');
  ok(work.status === 0 && work.stdout.includes('stable.md') && work.stdout.includes('copie de travail'), `verify : sans 2e tag, la copie de travail (${work.stdout.trim()})`);
  const badTag = run('blockquilt-verify', md, 'v0.0.0-absent');
  ok(badTag.status === 2 && badTag.stderr.includes('v0.0.0-absent'), 'verify : tag inconnu → code 2');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
if (failed) { console.log(`${failed} échec(s)`); process.exit(1); }
