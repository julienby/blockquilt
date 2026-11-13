// Essai dans un vrai navigateur (Chromium headless piloté en CDP, Node seul).
// Lance dev/server.js sur un dossier de données jetable, puis rejoue un parcours complet sur la démo.
// Exit 1 si une étape échoue. Lancé par `docker compose run --rm check`.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = 8099;
const CDP = 9222;
const BASE = `http://127.0.0.1:${PORT}`;
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'blockquilt-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failed = 0;
const ok = (cond, label) => { console.log((cond ? 'ok   ' : 'FAIL ') + label); if (!cond) failed++; };

// Document de départ des essais (la démo, elle, montre tous les types de blocs).
fs.writeFileSync(path.join(data, 'document.md'), `---
title: Arrivée
icon: 🏡
---

> [!tip]
> Garez-vous à gauche du portail.

- porte bleue
- code **1515**

## Garage

La clé est dans la boîte aux lettres.
Réseau : maison-wifi

> [!info] 🥖 Boulangerie
> La boulangerie du village ouvre à 7 h.

> [!warning]
> Ne pas fumer dans la maison.
`);

const server = spawn('node', [path.join(DIR, 'server.js')], { env: { ...process.env, PORT: String(PORT), DATA_DIR: data }, stdio: 'ignore' });
const chrome = spawn(process.env.CHROME || 'chromium', ['--headless=new', '--no-sandbox', '--disable-gpu', `--remote-debugging-port=${CDP}`, `--user-data-dir=${path.join(data, 'chrome')}`, 'about:blank'], { stdio: 'ignore', detached: true });
const exited = (child) => new Promise((r) => (child.exitCode !== null || child.signalCode !== null ? r() : child.once('exit', r)));
// Chromium lance des processus enfants : on arrête tout son groupe.
const stop = async () => { try { process.kill(-chrome.pid, 'SIGKILL'); } catch {} server.kill(); await Promise.all([exited(chrome), exited(server)]); };

const waitFor = async (test, label, tries = 40) => {
  for (let i = 0; i < tries; i++) { if (await test().catch(() => false)) return true; await sleep(250); }
  throw new Error('attente trop longue : ' + label);
};

try {
  await waitFor(async () => (await fetch(BASE + '/')).ok, 'serveur');
  await waitFor(async () => (await fetch(`http://127.0.0.1:${CDP}/json/version`)).ok, 'chromium');
  const target = (await (await fetch(`http://127.0.0.1:${CDP}/json/list`)).json()).find((t) => t.type === 'page');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => ws.addEventListener('open', r));
  let n = 0;
  const pending = {};
  const requests = [];
  ws.addEventListener('message', (e) => {
    const m = JSON.parse(e.data);
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
    // « Quitter la page ? » (modifications non enregistrées) : on accepte, pour recharger la démo.
    if (m.method === 'Page.javascriptDialogOpening') ws.send(JSON.stringify({ id: 1e9 + Math.floor(Math.random() * 1e6), method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
    if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; }
  });
  const send = (method, params = {}) => new Promise((r) => { const id = ++n; pending[id] = r; ws.send(JSON.stringify({ id, method, params })); });
  const ev = async (expr) => {
    const m = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (m.result.exceptionDetails) throw new Error(m.result.exceptionDetails.exception?.description || 'erreur JS');
    return m.result.result.value;
  };
  const open = async (url = BASE + '/') => {
    await send('Page.navigate', { url });
    await waitFor(() => ev(`document.readyState === 'complete' && document.querySelectorAll('[data-bq] [data-id]').length > 0`), 'chargement de la démo');
  };
  const viewport = (width, height = 900) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 640 });
  // Type et texte de chaque bloc, dans l'ordre.
  const cards = () => ev(`[...document.querySelectorAll('[data-bq] [data-id]')].map((a) => (a.querySelector('[data-convert]')?.value ?? 'media') + ':' + (a.querySelector('[data-body]')?.textContent ?? ''))`);
  const mergeButtons = () => ev(`[...document.querySelectorAll('[data-merge]')].map((b) => b.dataset.merge)`);
  const doc = path.join(data, 'document.md');
  const saved = async (test, label) => { await waitFor(async () => fs.existsSync(doc) && test(fs.readFileSync(doc, "utf8")), label); return fs.readFileSync(doc, 'utf8'); };

  await send('Browser.grantPermissions', { origin: BASE, permissions: ['clipboardReadWrite', 'clipboardSanitizedWrite'] });
  await send('Emulation.setFocusEmulationEnabled', { enabled: true });
  await send('Network.enable');
  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await viewport(375);
  await open();

  let c = await cards();
  ok(c.length === 6, `démo : 6 blocs affichés (${c.length})`);
  ok(JSON.stringify(await mergeButtons()) === '["1","2","4","5"]', 'Fusionner : entre deux blocs texte, jamais sous un titre');

  await ev(`document.querySelector('[data-merge="1"]').click()`);
  c = await cards();
  ok(c.length === 5 && c[0].startsWith('tip:') && c[0].includes('porte bleue'), 'fusion : l’astuce garde son type et reçoit la liste');

  await ev(`(() => {
    const body = [...document.querySelectorAll('[data-bq] [data-body]')].find((b) => b.textContent.includes('Réseau'));
    body.focus();
    const r = document.createRange(); r.setStartAfter(body.querySelector('br')); r.collapse(true);
    getSelection().removeAllRanges(); getSelection().addRange(r);
    body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
  })()`);
  ok(await ev(`!document.querySelector('[data-bar]').hidden`), 'clic droit : la barre de mise en forme s’ouvre');
  ok(await ev(`(() => { const r = document.querySelector('[data-bar]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight; })()`), 'barre de mise en forme : tient dans un écran de 375 px');
  ok(await ev(`[...document.querySelectorAll('[data-bar] button')].filter((b) => b.offsetParent).every((b) => { const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })`), 'barre de mise en forme : boutons de 44 px');
  await ev(`document.querySelector('[data-split]').click()`);
  c = await cards();
  ok(c.length === 6 && c.some((x) => x === 'text:Réseau : maison-wifi'), 'scission : la suite part dans un nouveau bloc');

  // Photo : un PNG d'un pixel envoyé par le champ fichier de l'éditeur.
  const png = path.join(data, 'pixel.png');
  fs.writeFileSync(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'));
  const setFiles = async (selector, files) => {
    const { root } = (await send('DOM.getDocument')).result;
    const { nodeId } = (await send('DOM.querySelector', { nodeId: root.nodeId, selector })).result;
    await send('DOM.setFileInputFiles', { nodeId, files });
  };
  await setFiles('input[data-file]', [png]);
  await waitFor(async () => (await cards()).length === 7, 'bloc photo');
  ok(true, 'photo : envoyée, un bloc photo apparaît');

  await ev(`document.querySelector('[data-save]').click()`);
  let md = await saved((x) => x.includes('media/'), 'enregistrement');
  ok(md.startsWith('---\ntitle: Arrivée\nicon: 🏡\n---\n'), 'enregistrement : titre et icône dans le frontmatter');
  ok(md.includes('> [!tip]\n> Garez-vous à gauche du portail.\n> - porte bleue\n> - code **1515**'), 'enregistrement : astuce fusionnée en Markdown');
  ok(md.includes('> [!info] 🥖 Boulangerie\n'), 'enregistrement : icône et titre de l’encadré gardés');
  ok(md.includes('La clé est dans la boîte aux lettres.\n\nRéseau : maison-wifi'), 'enregistrement : deux blocs après la scission');
  if (failed) console.log('--- document.md ---\n' + md + '\n---');
  const media = /\]\(media\/([a-f0-9]{12})\)/.exec(md);
  ok(media !== null, 'enregistrement : la photo est dans le texte');
  const img = media ? await fetch(`${BASE}/media/${media[1]}`) : null;
  ok(img?.ok && img.headers.get('content-type') === 'image/png', 'photo : servie par /media/<id>');
  await waitFor(() => ev(`document.querySelector('[data-save]').getAttribute('aria-label') === 'Enregistré'`), 'état enregistré');
  ok(true, 'enregistrement : le bouton repasse à « Enregistré »');

  await open();
  ok((await cards()).length === 7, 'rechargement : le document enregistré revient, 7 blocs');

  await ev(`document.querySelector('[data-preview]').click()`);
  await waitFor(() => ev(`document.querySelector('[data-canvas]').textContent.includes('Garez-vous')`), 'aperçu');
  ok(true, 'aperçu : le fragment du serveur s’affiche');
  ok(await ev(`!!document.querySelector('[data-canvas] article.bq-content aside.bq-callout-tip')`), 'aperçu : l’astuce s’affiche dans son encadré');
  ok(await ev(`getComputedStyle(document.querySelector('aside.bq-callout-tip')).backgroundColor !== 'rgba(0, 0, 0, 0)'`), 'aperçu : feuille blockquilt-content.css chargée');
  await waitFor(() => ev(`(() => { const i = document.querySelector('[data-canvas] img[src*="media/"]'); return !!i && i.complete && i.naturalWidth > 0; })()`), 'photo dans l’aperçu');
  ok(true, 'aperçu : la photo envoyée s’affiche');

  // Registre : un type enregistré à la volée apparaît dans le menu d'ajout et s'ajoute (carte de repli : son texte).
  await open();
  await ev(`Blocks.register('demo', { label: 'Démo', group: 'media', match: () => null, toMarkdown: (b) => b.md || '', toHtml: () => '', blank: () => ({ md: ':::demo\\nx\\n:::' }) })`);
  await ev(`document.querySelector('[data-insert="end"]').click()`);
  ok(await ev(`!!document.querySelector('[data-sheet="add"][open] [data-pick="demo"]')`), 'registre : le type « demo » est dans le menu d’ajout');
  await ev(`document.querySelector('[data-sheet="add"] [data-pick="demo"]').click()`);
  ok(await ev(`[...document.querySelectorAll('[data-bq] [data-id] [data-raw]')].some((t) => t.value.startsWith(':::demo'))`), 'registre : un bloc « demo » est ajouté');

  // ---- Mise en page : 375 px puis 1280 px ----
  const layout = () => ev(`(() => {
    const h2 = [...document.querySelectorAll('[data-bq] [data-id]')].find((c) => c.querySelector('[data-convert]')?.value === 'h2');
    const cr = h2.getBoundingClientRect();
    const tr = h2.querySelector('[data-body]').getBoundingClientRect();
    // Cible de 44 × 44 px ; colonne monter / poignée / descendre : 44 × 32 px (trois boutons empilés dans une carte de titre).
    const small = [...document.querySelectorAll('[data-bq] button, [data-bq] a')].filter((b) => b.offsetParent && !b.closest('dialog'))
      .filter((b) => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < (b.closest('[data-rail]') ? 32 : 44); }).map((b) => b.getAttribute('aria-label') || b.textContent.trim());
    return { scroll: document.documentElement.scrollWidth <= innerWidth, head: document.querySelector('[data-head]').getBoundingClientRect().height, top: tr.top - cr.top, bottom: cr.bottom - tr.bottom, small };
  })()`);
  for (const width of [375, 1280]) {
    await viewport(width);
    await open();
    const l = await layout();
    ok(l.scroll, `${width} px : aucune barre de défilement horizontale`);
    ok(l.head <= 64, `${width} px : en-tête sur une ligne (${l.head} px)`);
    ok(l.bottom <= l.top + 4, `${width} px : carte H2 sans vide en bas (haut ${l.top}, bas ${l.bottom})`);
    if (width === 375) ok(l.small.length === 0, `375 px : chaque bouton mesure au moins 44 × 44 px (44 × 32 dans la colonne de droite) ${l.small.join(', ')}`);
    await ev(`document.querySelector('[data-insert="end"]').click()`);
    ok(await ev(`(() => { const d = document.querySelector('[data-sheet="add"]'); const n = d.querySelector('.grid').children.length; const cols = getComputedStyle(d.querySelector('.grid')).gridTemplateColumns.split(' ').length; d.close(); return n > 0 && cols === ${width < 640 ? 2 : 3}; })()`), `${width} px : menu d’ajout en ${width < 640 ? 2 : 3} colonnes`);
  }
  await viewport(375);

  // ---- Evol2 : intervalles aérés, insertion au début, bordures des titres ----
  await open();
  const spacing = await ev(`(() => {
    const out = [];
    document.querySelectorAll('[data-bq] .bq-gap').forEach((g) => {
      const pill = g.querySelector('span').getBoundingClientRect();
      const prev = g.previousElementSibling?.getBoundingClientRect();
      const next = g.nextElementSibling.getBoundingClientRect();
      if (prev) out.push(pill.top - prev.bottom);
      out.push(next.top - pill.bottom);
    });
    return Math.min(...out);
  })()`);
  ok(spacing >= 10, `Insérer / Fusionner : au moins 10 px entre la pastille et les blocs (${spacing} px)`);
  ok(await ev(`(() => { const first = document.querySelector('[data-bq] [data-canvas] > div').firstElementChild; return first.matches('.bq-gap') && !!first.querySelector('[data-insert="0"]') && !first.querySelector('[data-merge]'); })()`), 'insérer en première position : bouton avant le premier bloc');
  await ev(`document.querySelector('[data-insert="0"]').click()`);
  await ev(`document.querySelector('[data-sheet="add"] [data-pick="hr"]').click()`);
  ok(await ev(`Blocks.parse(editor.getMarkdown()).blocks[0].type === 'hr'`), 'insérer en première position : le bloc arrive en tête');
  const borders = await ev(`(() => { editor.setMarkdown('## Section\\n\\n### Sous-section'); const w = (t) => { const c = [...document.querySelectorAll('[data-bq] [data-id]')].find((x) => x.querySelector('[data-convert]')?.value === t); const s = getComputedStyle(c); return s.borderTopWidth + ' ' + s.borderTopColor; }; return { h2: w('h2'), h3: w('h3') }; })()`);
  ok(borders.h2 === '2px rgb(28, 25, 23)' && borders.h3 === '1px rgb(28, 25, 23)', `bordure noire : H2 épaisse, H3 fine (${JSON.stringify(borders)})`);

  // ---- Titre facultatif : par défaut, pas de titre imposé dans l'en-tête ----
  await viewport(375);
  await open();
  ok(await ev(`!document.querySelector('[data-bq] [data-title], [data-bq] [data-doc-icon]') && document.querySelector('[data-bq] [data-label]').textContent === 'Démo blockquilt'`), 'en-tête : pas de titre imposé, libellé fixe de l’hôte (option label)');
  ok(await ev(`editor.getMarkdown().startsWith('---\\ntitle: Arrivée\\nicon: 🏡\\n---')`), 'sans titre affiché : le frontmatter (title, icon) est gardé tel quel');
  ok(await ev(`(() => { const el = document.createElement('div'); document.body.append(el); const e = Blockquilt.mount(el, { source: '---\\ntitle: T\\n---\\n\\nx', title: true }); const ok = el.querySelector('[data-title]').textContent === 'T' && !!el.querySelector('[data-doc-icon]'); el.querySelector('[data-title]').textContent = 'Nouveau'; const md = e.getMarkdown(); e.destroy(); el.remove(); return ok && md.startsWith('---\\ntitle: Nouveau'); })()`), 'option title : titre et icône du document dans l’en-tête, écrits dans le frontmatter');

  // ---- Deux éditeurs dans la même page, puis destroy() ----
  await open();
  const two = await ev(`(() => {
    const el = document.createElement('div');
    document.body.append(el);
    window.saves = 0;
    window.second = Blockquilt.mount(el, { source: '## Deux\\n\\nSecond éditeur', onSave: () => { window.saves++; } });
    const ids = [...document.querySelectorAll('[id]')].map((x) => x.id);
    return { dup: ids.length !== new Set(ids).size, n: document.querySelectorAll('[data-bq]').length, md: window.second.getMarkdown() };
  })()`);
  ok(two.n === 2 && !two.dup, 'deux éditeurs dans la même page : aucun identifiant en double');
  ok(two.md === '## Deux\n\nSecond éditeur\n', 'second éditeur : getMarkdown() rend son propre texte');
  ok(await ev(`(async () => { document.querySelectorAll('[data-bq]')[1].querySelector('[data-save]').click(); await new Promise((r) => setTimeout(r, 50)); return window.saves === 1; })()`), 'second éditeur : onSave appelé');
  ok(await ev(`(async () => {
    const el = document.querySelectorAll('[data-bq]')[1];
    window.second.destroy();
    const gone = !document.querySelectorAll('[data-bq]')[1];
    document.body.append(el);
    el.querySelector('[data-save]').click();
    el.querySelector('[data-insert="end"]').click();
    await new Promise((r) => setTimeout(r, 50));
    const quiet = window.saves === 1 && !el.querySelector('dialog[open]');
    el.remove();
    return gone && quiet;
  })()`), 'destroy() : éditeur retiré, plus aucun écouteur (un clic ne déclenche rien)');
  ok(await ev(`(() => { editor.setMarkdown('Nouveau'); return editor.getMarkdown() === 'Nouveau\\n' && document.querySelector('[data-save]').getAttribute('aria-label') === 'Enregistré'; })()`), 'setMarkdown() : remplace le document, état enregistré');

  // ---- Phase 5 : interactions ----
  const key = async (k, code, vk, modifiers = 0) => {
    // Entrée doit porter son caractère (« \r ») : c'est lui qui active un bouton.
    await send('Input.dispatchKeyEvent', k === 'Enter' ? { type: 'keyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers, text: '\r', unmodifiedText: '\r' } : { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: k, code, windowsVirtualKeyCode: vk, modifiers });
    await sleep(60);
  };
  const CTRL = 2;
  const SHIFT = 8;
  const mdNow = () => ev(`editor.getMarkdown()`);
  await viewport(375);
  await open();

  // Annuler / rétablir
  const before = await mdNow();
  const count0 = (await cards()).length;
  await ev(`document.querySelectorAll('[data-bq] [data-id] [data-menu]')[1].click()`);
  ok(await ev(`!!document.querySelector('[data-sheet="menu"][open]')`), 'menu du bloc : s’ouvre depuis « ⋯ »');
  ok(await ev(`[...document.querySelectorAll('[data-sheet="menu"] [data-act]')].map((b) => b.dataset.act).join() === 'duplicate,copy,paste-above,paste,ai'`), 'menu du bloc : dupliquer, copier, coller au-dessus, coller dessous, IA — rien d’autre');
  await ev(`document.querySelector('[data-sheet="menu"]').close()`);
  ok(await ev(`[...document.querySelectorAll('[data-bq] [data-id]')].every((c) => c.querySelector('[data-menu]') && c.querySelector('[data-delete]') && c.querySelectorAll('[data-rail] button').length === 3)`), 'carte : menu, agrandir, supprimer à droite du type ; monter, poignée, descendre dans la colonne de droite');
  ok(await ev(`(() => { const r = [...document.querySelectorAll('[data-bq] [data-rail]')]; return r[0].querySelector('[data-move="-1"]').disabled && r[r.length - 1].querySelector('[data-move="1"]').disabled && !r[1].querySelector('[data-move="-1"]').disabled; })()`), 'colonne de droite : monter désactivé sur le premier bloc, descendre sur le dernier');
  {
    const o0 = await ev(`[...document.querySelectorAll('[data-bq] [data-id]')].map((c) => c.dataset.id).join()`);
    await ev(`document.querySelectorAll('[data-bq] [data-rail]')[0].querySelector('[data-move="1"]').click()`);
    const o1 = await ev(`[...document.querySelectorAll('[data-bq] [data-id]')].map((c) => c.dataset.id).join()`);
    ok(o1.split(',')[1] === o0.split(',')[0] && o1.split(',')[0] === o0.split(',')[1] && await ev(`document.activeElement.matches('[data-move="1"]')`), 'chevron bas : le bloc descend d’un cran, le focus reste sur le chevron');
    await ev(`document.querySelectorAll('[data-bq] [data-rail]')[1].querySelector('[data-move="-1"]').click()`);
    ok((await ev(`[...document.querySelectorAll('[data-bq] [data-id]')].map((c) => c.dataset.id).join()`)) === o0, 'chevron haut : le bloc remonte');
  }
  await ev(`document.querySelectorAll('[data-bq] [data-id] [data-delete]')[1].click()`);
  await ev(`document.querySelector('[data-del-confirm]').click()`);
  const afterDel = await mdNow();
  ok(afterDel !== before && (await cards()).length === count0 - 1, 'suppression : un bloc de moins');
  await key('z', 'KeyZ', 90, CTRL);
  ok((await mdNow()) === before, 'Ctrl+Z : texte identique à avant la suppression');
  await key('y', 'KeyY', 89, CTRL);
  ok((await mdNow()) === afterDel, 'Ctrl+Y : le bloc est de nouveau supprimé');
  await key('z', 'KeyZ', 90, CTRL);
  await key('z', 'KeyZ', 90, CTRL | SHIFT);
  ok((await mdNow()) === afterDel, 'Ctrl+Maj+Z : rétablit aussi');
  ok(await ev(`document.querySelector('[data-undo]').getBoundingClientRect().width >= 44 && !document.querySelector('[data-undo]').disabled`), 'bouton Annuler dans l’en-tête');
  const hist = await ev(`(async () => {
    for (let i = 0; i < 60; i++) { document.querySelector('[data-insert="end"]').click(); document.querySelector('[data-sheet="add"] [data-pick="hr"]').click(); }
    const added = document.querySelectorAll('[data-bq] hr').length;
    let undone = 0;
    for (let i = 0; i < 60; i++) if (editor.undo()) undone++;
    return { added, undone, left: document.querySelectorAll('[data-bq] hr').length };
  })()`);
  ok(hist.added === 60 && hist.undone === 50 && hist.left === 10, `60 actions puis 60 annulations : arrêt à la 50ᵉ (${JSON.stringify(hist)})`);
  // Frappe en cours dans un champ : le navigateur garde la main sur Ctrl+Z.
  ok(await ev(`(() => {
    const f = document.querySelector('[data-bq] [data-rich]'); f.focus();
    document.execCommand('insertText', false, 'abc');
    const e = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true });
    f.dispatchEvent(e);
    return !e.defaultPrevented;
  })()`), 'Ctrl+Z pendant la frappe : laissé au navigateur');

  // Ctrl+S
  await ev(`(() => { const t = document.querySelector('[data-bq] [data-rich]'); t.focus(); document.execCommand('insertText', false, 'Titre Ctrl S'); document.activeElement.blur(); })()`);
  await key('s', 'KeyS', 83, CTRL);
  md = await saved((x) => x.includes('Titre Ctrl S'), 'Ctrl+S');
  ok(true, 'Ctrl+S : document.md écrit sur le disque');

  // Barre de mise en forme stable
  await open();
  const barAt = (n) => ev(`(async () => {
    const f = [...document.querySelectorAll('[data-bq] [data-rich]')][${n}];
    f.focus();
    const node = document.createTreeWalker(f, NodeFilter.SHOW_TEXT).nextNode();
    const r = document.createRange(); r.setStart(node, 0); r.setEnd(node, Math.min(4, node.length));
    getSelection().removeAllRanges(); getSelection().addRange(r);
    await new Promise((res) => setTimeout(res, 120));
    const b = document.querySelector('[data-bar]');
    return b.hidden ? null : JSON.stringify(b.getBoundingClientRect());
  })()`);
  const r1 = await barAt(0);
  const r5 = await barAt(4);
  ok(r1 !== null && r1 === r5, 'barre : même position pour un mot ligne 1 et un mot ligne 5');
  ok(await ev(`(() => { const r = document.querySelector('[data-bar]').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; })()`), 'barre : tient dans 375 px');
  ok(await ev(`(async () => { document.activeElement.blur(); await new Promise((r) => setTimeout(r, 50)); return document.querySelector('[data-bar]').hidden; })()`), 'barre : disparaît quand le champ perd le focus');
  ok(await ev(`(() => { const f = [...document.querySelectorAll('[data-bq] [data-rich]')][1]; f.focus(); getSelection().collapse(f, 0); f.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); return !document.querySelector('[data-bar]').hidden; })()`), 'barre : visible au double clic');
  ok(await ev(`(async () => { document.activeElement.blur(); const f = [...document.querySelectorAll('[data-bq] [data-rich]')][2]; f.focus(); f.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 50, clientY: 300 })); await new Promise((r) => setTimeout(r, 520)); return !document.querySelector('[data-bar]').hidden; })()`), 'barre : visible après un appui long (450 ms)');
  await ev(`(() => { document.activeElement.blur(); document.querySelector('[data-bq]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); })()`);

  // Copier / coller
  const n0 = (await cards()).length;
  await ev(`document.querySelectorAll('[data-bq] [data-id] [data-menu]')[0].click()`);
  await ev(`document.querySelector('[data-sheet="menu"] [data-act="copy"]').click()`);
  await ev(`document.querySelectorAll('[data-bq] [data-id] [data-menu]')[0].click()`);
  await ev(`document.querySelector('[data-sheet="menu"] [data-act="paste"]').click()`);
  await waitFor(async () => (await cards()).length === n0 + 1, 'collage');
  ok(await ev(`(() => { const p = Blocks.parse(editor.getMarkdown()).blocks; return Blocks.toMarkdown(p[0]) === Blocks.toMarkdown(p[1]); })()`), 'copier un bloc, coller dessous : deux blocs identiques');
  await ev(`(async () => { const t = 'Un\\n\\nDeux\\n\\nTrois'; await navigator.clipboard?.writeText(t).catch(() => {}); Blockquilt.clipboard = t; })()`);
  await ev(`document.querySelectorAll('[data-bq] [data-id] [data-menu]')[0].click()`);
  await ev(`document.querySelector('[data-sheet="menu"] [data-act="paste"]').click()`);
  await waitFor(async () => (await cards()).length === n0 + 4, 'collage de trois paragraphes');
  ok(true, 'coller un texte de trois paragraphes : trois blocs');

  // Glisser-déposer
  await open();
  const order = () => ev(`[...document.querySelectorAll('[data-bq] [data-id]')].map((c) => c.dataset.id).join()`);
  const mouse = (type, x, y, buttons = 1) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: 1 });
  const grip = await ev(`(() => { scrollTo(0, 0); const r = document.querySelectorAll('[data-bq] [data-grip]')[0].getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  const goal = await ev(`(() => { const r = document.querySelectorAll('[data-bq] [data-id]')[2].getBoundingClientRect(); return r.bottom - 8; })()`);
  const o0 = await order();
  await mouse('mouseMoved', grip.x, grip.y, 0);
  await mouse('mousePressed', grip.x, grip.y);
  for (let y = grip.y; y <= goal; y += 40) await mouse('mouseMoved', grip.x, y);
  await mouse('mouseMoved', grip.x, goal);
  const mid = await ev(`({ drops: document.querySelectorAll('.bq-drop').length, ghost: !!document.querySelector('.bq-ghost'), gaps: getComputedStyle(document.querySelector('.bq-gap')).visibility })`);
  ok((await order()) === o0 && mid.drops === 1, 'glissement : ordre inchangé pendant le déplacement, un seul trait bleu');
  ok(mid.ghost && mid.gaps === 'hidden', 'glissement : une copie suit le doigt, boutons Insérer et Fusionner masqués');
  await mouse('mouseReleased', grip.x, goal, 0);
  const o1 = await order();
  ok(o1 !== o0 && o1.split(',')[2] === o0.split(',')[0] && !(await ev(`!!document.querySelector('.bq-drop, .bq-ghost')`)), 'glissement : au lâcher, le bloc arrive sous le trait');
  await mouse('mousePressed', grip.x, grip.y);
  for (let y = grip.y; y <= goal; y += 40) await mouse('mouseMoved', grip.x, y);
  await key('Escape', 'Escape', 27);
  await mouse('mouseReleased', grip.x, goal, 0);
  ok((await order()) === o1 && !(await ev(`!!document.querySelector('.bq-drop')`)), 'glissement : Échap rend l’ordre d’origine');

  // Plein écran
  for (const width of [375, 1280]) {
    await viewport(width);
    await open();
    if (width < 640) { await ev(`document.querySelector('[data-more]').click()`); await ev(`document.querySelector('[data-more-act="full"]').click()`); }
    else await ev(`document.querySelector('[data-full]').click()`);
    const full = await ev(`(() => { const d = document.querySelector('[data-editor-full]'); const r = d.getBoundingClientRect(); return { open: d.open, w: r.width, h: r.height, W: innerWidth, H: innerHeight, inside: d.contains(document.querySelector('[data-bq]')) }; })()`);
    ok(full.open && full.inside && full.w === full.W && full.h === full.H, `${width} px : éditeur en plein écran, exactement ${full.W} × ${full.H} (${full.w} × ${full.h})`);
    await key('Escape', 'Escape', 27);
    ok(await ev(`!document.querySelector('[data-editor-full]').open && document.getElementById('editor').firstElementChild.matches('[data-bq]')`), `${width} px : Échap quitte le plein écran, l’éditeur revient à sa place`);
    await ev(`(() => { const c = [...document.querySelectorAll('[data-bq] [data-id]')].find((x) => x.querySelector('[data-convert]')?.value === 'text'); c.querySelector('[data-expand]').click(); })()`);
    const bf = await ev(`(() => { const d = document.querySelector('[data-block-full]'); const r = d.getBoundingClientRect(); const f = d.querySelector('[data-rich]'); f.focus(); getSelection().selectAllChildren(f); getSelection().collapseToEnd(); document.execCommand('insertText', false, ' Plein${width}'); return { open: d.open, w: r.width, h: r.height, W: innerWidth, H: innerHeight }; })()`);
    ok(bf.open && bf.w === bf.W && bf.h === bf.H, `${width} px : bloc en plein écran, exactement ${bf.W} × ${bf.H} (${bf.w} × ${bf.h})`);
    await key('Escape', 'Escape', 27);
    ok(await ev(`!document.querySelector('[data-block-full]').open && editor.getMarkdown().includes(' Plein${width}')`), `${width} px : Échap ferme, le texte tapé est dans le document`);
  }
  await viewport(375);

  await open();
  // Listes : Tab / Maj+Tab
  await ev(`(() => {
    editor.setMarkdown('- a\\n- b\\n- c');
    const li = [...document.querySelectorAll('[data-bq] [data-rich] li')][1];
    li.closest('[data-rich]').focus();
    getSelection().collapse(li.firstChild, 1);
  })()`);
  await key('Tab', 'Tab', 9);
  ok((await mdNow()) === '- a\n  - b\n- c\n', 'liste : Tab descend l’élément d’un niveau');
  ok(await ev(`getSelection().anchorNode.textContent === 'b' && document.activeElement.matches('[data-rich]')`), 'liste : le curseur reste dans l’élément');
  await ev(`(() => { const li = [...document.querySelectorAll('[data-bq] [data-rich] li')].find((x) => x.firstChild.textContent === 'c'); getSelection().collapse(li.firstChild, 1); })()`);
  await key('Tab', 'Tab', 9);
  await key('Tab', 'Tab', 9);
  ok((await mdNow()) === '- a\n  - b\n    - c\n', 'liste : Tab répété, trois niveaux');
  await ev(`(() => { const li = [...document.querySelectorAll('[data-bq] [data-rich] li')].find((x) => x.firstChild.textContent === 'b'); getSelection().collapse(li.firstChild, 1); })()`);
  await key('Tab', 'Tab', 9, SHIFT);
  ok((await mdNow()) === '- a\n- b\n  - c\n', 'liste : Maj+Tab remonte l’élément, ses enfants le suivent');
  await key('Tab', 'Tab', 9, SHIFT);
  ok(await ev(`!document.activeElement.matches('[data-rich]')`) && (await mdNow()) === '- a\n- b\n  - c\n', 'liste : Maj+Tab au premier niveau rend le focus (pas de piège clavier)');

  // Barre : copier / couper / coller le texte sélectionné, dans un sous-menu
  const selectIn = (from, to) => ev(`(() => { const f = document.querySelector('[data-bq] [data-rich]'); f.focus(); const t = f.firstChild; const r = document.createRange(); r.setStart(t, ${from}); r.setEnd(t, ${to}); getSelection().removeAllRanges(); getSelection().addRange(r); f.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); })()`);
  await ev(`editor.setMarkdown('Bonjour monde')`);
  await selectIn(0, 7);
  ok(await ev(`(() => { const r = document.querySelector('[data-bar]').getBoundingClientRect(); return r.height < 60 && r.right <= innerWidth && document.querySelector('[data-bar-clip]').hidden; })()`), 'barre : une seule ligne à 375 px, sous-menu fermé');
  await ev(`document.querySelector('[data-clip-toggle]').click()`);
  ok(await ev(`!document.querySelector('[data-bar-clip]').hidden && document.querySelector('[data-clip-toggle]').getAttribute('aria-expanded') === 'true'`), 'barre : le sous-menu presse-papiers s’ouvre');
  await ev(`document.querySelector('[data-clip="copy"]').click()`);
  await sleep(100);
  ok((await ev(`navigator.clipboard.readText()`)) === 'Bonjour' && await ev(`document.querySelector('[data-bar-clip]').hidden`), 'barre : « Copier » met la sélection dans le presse-papiers');
  await selectIn(7, 13);
  await ev(`(() => { document.querySelector('[data-clip-toggle]').click(); document.querySelector('[data-clip="cut"]').click(); })()`);
  await sleep(100);
  ok((await ev(`navigator.clipboard.readText()`)) === ' monde' && (await mdNow()) === 'Bonjour\n', 'barre : « Couper » retire le texte et le garde');
  await ev(`(() => { const f = document.querySelector('[data-bq] [data-rich]'); getSelection().collapse(f.firstChild, 0); f.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); document.querySelector('[data-clip-toggle]').click(); document.querySelector('[data-clip="paste"]').click(); })()`);
  await sleep(150);
  ok((await mdNow()) === ' mondeBonjour\n', 'barre : « Coller » insère au curseur');

  // Evol2 : plein écran déclenché par un vrai clic (geste de l'utilisateur, donc plein écran du navigateur permis)
  const realClick = async (selector) => {
    const pt = await ev(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await mouse('mousePressed', pt.x, pt.y);
    await mouse('mouseReleased', pt.x, pt.y, 0);
    await sleep(400);
  };
  await viewport(1280);
  await open();
  await realClick('[data-bq] [data-id] [data-expand]');
  const real = await ev(`(() => { const d = document.querySelector('[data-block-full]'); const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return { open: d.open, fs: document.fullscreenElement === d.querySelector('[data-full-inner]'), hit: d.contains(hit), chrome: !!d.querySelector('.bq-card, [data-rail], [data-convert], [data-delete]'), field: d.contains(document.activeElement) && document.activeElement.matches('[contenteditable], textarea, input') }; })()`);
  ok(real.open && real.fs && real.hit, `PC : bloc en plein écran visible au premier plan, plein écran du navigateur sur le dialogue (${JSON.stringify(real)})`);
  ok(!real.chrome && real.field, 'bloc en plein écran : sans habillage de carte, curseur dans le texte');
  await send('Input.insertText', { text: ' (vrai clic)' });
  await key('Escape', 'Escape', 27);
  await sleep(200);
  ok(await ev(`!document.querySelector('[data-block-full]').open && !document.fullscreenElement && editor.getMarkdown().includes(' (vrai clic)') && document.querySelectorAll('[data-bq] [data-id]').length === Blocks.parse(editor.getMarkdown()).blocks.length`), 'bloc en plein écran : Échap ferme tout, le texte est gardé, une seule carte par bloc');
  await realClick('[data-full]');
  ok(await ev(`(() => { const d = document.querySelector('[data-editor-full]'); return d.open && document.fullscreenElement === d.querySelector('[data-full-inner]') && d.contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2)) && !document.querySelector('[data-head] [data-width]').hidden; })()`), 'PC : éditeur en plein écran au premier plan, bouton de largeur visible');
  const widths = [];
  for (let i = 0; i < 3; i++) { await ev(`document.querySelector('[data-head] [data-width]').click()`); widths.push(await ev(`Math.round(document.querySelector('[data-canvas] .bq-column').getBoundingClientRect().width)`)); }
  ok(new Set(widths).size === 3 && widths.includes(640) && widths.some((w) => w > 1200), `plein écran : la largeur du texte fait le tour de trois largeurs (${widths.join(', ')} px)`);
  await ev(`document.querySelector('[data-editor-full]').close()`);
  await sleep(200);
  ok(await ev(`!document.fullscreenElement && document.querySelector('[data-head] [data-width]').hidden && document.getElementById('editor').firstElementChild.matches('[data-bq]')`), 'plein écran quitté : plein écran du navigateur quitté aussi, éditeur à sa place');
  ok(await ev(`(() => { const el = document.createElement('div'); el.style.width = '900px'; document.body.append(el); const e = Blockquilt.mount(el, { source: 'Texte', width: '30rem' }); const w = el.querySelector('.bq-column').getBoundingClientRect().width; const app = el.firstElementChild.getBoundingClientRect().width; e.destroy(); el.remove(); return w === 480 && app === 900; })()`), 'option width : largeur du texte réglable, l’éditeur prend la largeur de son conteneur');
  await viewport(375);

  // ---- Phase 6 : emoji ----
  ok(fs.statSync(path.join(DIR, '..', 'emoji.json')).size < 150 * 1024, 'emoji.json : moins de 150 ko');
  requests.length = 0;
  await open();
  await sleep(300);
  ok(!requests.some((u) => u.includes('emoji.json')), 'emoji.json : pas demandé au chargement de la page');
  await ev(`[...document.querySelectorAll('[data-bq] [data-id]')].find((c) => c.querySelector('[data-convert]')?.value === 'tip').querySelector('[data-callout-icon]').click()`);
  await waitFor(() => ev(`document.querySelectorAll('[data-sheet="icon"] [data-emoji-grid] button').length > 50`), 'bibliothèque d’emoji');
  ok(requests.some((u) => u.includes('emoji.json')), 'emoji.json : chargé à la première ouverture du sélecteur');
  ok(await ev(`document.querySelectorAll('[data-sheet="icon"] [data-emoji-tab]').length === 10`), 'sélecteur : onglets « Récents » + 9 catégories');
  await ev(`(() => { const i = document.querySelector('[data-emoji-search]'); i.value = 'clé'; i.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
  ok(await ev(`[...document.querySelectorAll('[data-sheet="icon"] [data-emoji-grid] button')].slice(0, 3).some((b) => b.dataset.iconPick === '🔑')`), 'recherche « clé » : propose 🔑');
  await ev(`document.querySelector('[data-sheet="icon"] [data-icon-pick="🔑"]').click()`);
  ok(await ev(`!document.querySelector('[data-sheet="icon"]').open && editor.getMarkdown().includes('> [!tip] 🔑\\n')`), 'icône d’encadré : écrite sur la ligne « > [!tip] 🔑 »');
  await ev(`document.querySelector('[data-save]').click()`);
  md = await saved((x) => x.includes('> [!tip] 🔑\n'), 'enregistrement de l’icône');
  ok(true, 'icône d’encadré : enregistrée dans document.md');
  await open();
  ok(await ev(`[...document.querySelectorAll('[data-callout-icon]')].some((b) => b.textContent === '🔑')`), 'icône d’encadré : revient à l’ouverture');
  ok(await ev(`(async () => {
    const el = document.createElement('div'); document.body.append(el);
    const e = Blockquilt.mount(el, { source: '---\\ntitle: Doc\\n---\\n\\nTexte', title: true });
    el.querySelector('[data-doc-icon]').click();
    await new Promise((r) => setTimeout(r, 100));
    const sheet = el.querySelector('[data-sheet="icon"]');
    const recents = [...sheet.querySelectorAll('[data-emoji-grid] button')].map((b) => b.dataset.iconPick);
    sheet.querySelector('[data-icon-pick="🔑"]').click();
    const ok = recents[0] === '🔑' && el.querySelector('[data-doc-icon]').textContent === '🔑' && e.getMarkdown().startsWith('---\\ntitle: Doc\\nicon: 🔑\\n---');
    e.destroy(); el.remove();
    return ok;
  })()`), 'icône du document (option title) : choisie dans « Récents » (localStorage), écrite dans le frontmatter');
  ok(await ev(`(async () => {
    const f = document.querySelector('[data-bq] [data-rich]'); f.focus();
    getSelection().selectAllChildren(f); getSelection().collapseToEnd();
    f.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    document.querySelector('[data-emoji-insert]').click();
    await new Promise((r) => setTimeout(r, 100));
    document.querySelector('[data-sheet="icon"] [data-icon-pick="🔑"]').click();
    return f.textContent.endsWith('🔑');
  })()`), 'barre de mise en forme : insère un emoji dans le texte');

  // ---- Phase 7 : carrousel ----
  await viewport(375);
  await open();
  const pngs = [1, 2, 3].map((i) => { const f = path.join(data, `p${i}.png`); fs.copyFileSync(png, f); return f; });
  await ev(`document.querySelector('[data-insert="end"]').click()`);
  await ev(`document.querySelector('[data-sheet="add"] [data-pick="carousel"]').click()`);
  await setFiles('input[data-file]', pngs);
  await waitFor(() => ev(`document.querySelectorAll('[data-bq] [data-car-item]').length === 3`), 'carrousel de 3 photos');
  ok(true, 'envoi de 3 fichiers d’un coup : 3 vignettes dans un carrousel');
  await ev(`(() => { ['Un', 'Deux', 'Trois'].forEach((t, i) => { const x = document.querySelectorAll('[data-car-alt]')[i]; x.value = t; x.dispatchEvent(new InputEvent('input', { bubbles: true })); }); })()`);
  await ev(`document.querySelector('[data-car-item="0"] [data-car-act="right"]').click()`);
  ok(await ev(`[...document.querySelectorAll('[data-car-alt]')].map((x) => x.value).join() === 'Deux,Un,Trois'`), 'carrousel : photo déplacée vers la droite, légendes suivies');
  await ev(`document.querySelector('[data-save]').click()`);
  md = await saved((x) => x.includes(':::carousel'), 'enregistrement du carrousel');
  ok(/:::carousel\n!\[Deux\]\(media\/\w+\)\n!\[Un\]\(media\/\w+\)\n!\[Trois\]\(media\/\w+\)\n:::/.test(md), 'carrousel : l’ordre des lignes a changé dans document.md');
  await ev(`document.querySelector('[data-car-item="2"] [data-car-act="remove"]').click()`);
  ok(await ev(`document.querySelectorAll('[data-car-item]').length === 2`), 'carrousel : photo retirée');
  await ev(`editor.undo()`);
  await ev(`document.querySelector('[data-preview]').click()`);
  await waitFor(() => ev(`!!document.querySelector('[data-canvas] .bq-carousel')`), 'aperçu du carrousel');
  const track = await ev(`(() => { const t = document.querySelector('.bq-carousel-track'); return { figures: t.querySelectorAll('figure').length, sw: t.scrollWidth, cw: t.clientWidth, snap: getComputedStyle(t).scrollSnapType }; })()`);
  ok(track.figures === 3 && track.sw > track.cw && track.snap.includes('x'), `carrousel : 3 <figure>, défilement horizontal à 375 px (${track.sw} > ${track.cw})`);
  await ev(`document.querySelector('[data-preview]').click()`);
  ok(await ev(`(() => { const t = ':::columns\\nGauche\\n\\nDroite\\n:::'; editor.setMarkdown(t); return !!document.querySelector('[data-bq] [data-raw]') && editor.getMarkdown() === t + '\\n'; })()`), ':::columns écrit à la main : bloc source, texte intact');

  // ---- Phase 8 : bloc HTML ----
  await open();
  await ev(`document.querySelector('[data-insert="end"]').click()`);
  await ev(`document.querySelector('[data-sheet="add"] [data-pick="html"]').click()`);
  await ev(`(() => { const t = document.querySelector('[data-bq] [data-html]'); t.value = '<div class="p-4" onclick="alert(1)"><strong>Gras</strong><script>window.pwned = 1</script><img src=x onerror="window.pwned = 2"></div>'; t.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
  ok(await ev(`(() => { const c = document.querySelector('[data-bq] [data-html]').closest('[data-id]'); const eye = c.querySelector('[data-toggle-view]'); return !!eye && eye.compareDocumentPosition(c.querySelector('[data-convert], .rounded-full')) & Node.DOCUMENT_POSITION_PRECEDING && c.querySelector('[data-html]').offsetParent !== null && c.querySelector('[data-html-preview]').offsetParent === null; })()`), 'bloc HTML : œil à côté du type, code affiché par défaut');
  await ev(`document.querySelector('[data-bq] [data-toggle-view]').click()`);
  const live = await ev(`document.querySelector('[data-html-preview]').innerHTML`);
  ok(live === '<div class="p-4"><strong>Gras</strong></div>' && await ev(`document.querySelector('[data-html-preview]').offsetParent !== null && document.querySelector('[data-bq] [data-html]').offsetParent === null && document.querySelector('[data-toggle-view]').getAttribute('aria-pressed') === 'true'`), 'bloc HTML : l’œil montre l’aperçu filtré à la place du code (' + live + ')');
  await ev(`document.querySelector('[data-bq] [data-toggle-view]').click()`);
  ok(await ev(`document.querySelector('[data-bq] [data-html]').offsetParent !== null`), 'bloc HTML : l’œil revient au code');
  await ev(`document.querySelector('[data-save]').click()`);
  md = await saved((x) => x.includes(':::html'), 'enregistrement du bloc HTML');
  ok(md.includes(':::html\n<div class="p-4" onclick="alert(1)"><strong>Gras</strong><script>window.pwned = 1</script><img src=x onerror="window.pwned = 2"></div>\n:::'), 'bloc HTML : texte source enregistré tel quel');
  await ev(`document.querySelector('[data-preview]').click()`);
  await waitFor(() => ev(`!!document.querySelector('[data-canvas] .bq-html')`), 'aperçu du bloc HTML');
  await sleep(200);
  ok(await ev(`!window.pwned && !document.querySelector('[data-canvas] script, [data-canvas] [onclick], [data-canvas] [onerror]') && document.querySelector('[data-canvas] .bq-html strong')?.textContent === 'Gras'`), 'bloc HTML : rendu filtré, aucun script exécuté');
  ok(await ev(`(() => { const el = document.createElement('div'); document.body.append(el); const e = Blockquilt.mount(el, { source: ':::html\\n<b>x</b>\\n:::' }); el.querySelector('[data-insert="end"]').click(); const has = !!el.querySelector('[data-pick="html"]'); const raw = !!el.querySelector('[data-id] [data-raw]') && !el.querySelector('[data-html-preview]'); e.destroy(); el.remove(); return !has && raw; })()`), 'bloc HTML désactivé par défaut : absent du menu, édité comme texte source');

  // ---- Phase 9 : IA ----
  await viewport(375);
  await open();
  const tipIndex = await ev(`[...document.querySelectorAll('[data-bq] [data-id]')].findIndex((c) => c.querySelector('[data-convert]')?.value === 'tip')`);
  const docBefore = await mdNow();
  await ev(`document.querySelectorAll('[data-bq] [data-id]')[${tipIndex}].querySelector('[data-menu]').click()`);
  await ev(`document.querySelector('[data-sheet="menu"] [data-act="ai"]').click()`);
  ok(await ev(`document.querySelector('[data-sheet="ai"]').open && document.querySelector('[data-ai-scope]').textContent.includes('Astuce')`), 'IA sur un bloc : ouverte depuis le menu « ⋯ »');
  await ev(`document.querySelector('[data-ai-preset]').click()`);
  await waitFor(() => ev(`!document.querySelector('[data-ai-result]').hidden`), 'réponse de l’IA');
  ok(await ev(`document.querySelector('[data-ai-before]').textContent.includes('Garez-vous') && document.querySelector('[data-ai-after]').textContent.includes('GAREZ-VOUS') && document.querySelector('[data-ai-lint]').hidden`), 'IA : aperçu avant / après, sans alerte');
  await ev(`document.querySelector('[data-ai-apply]').click()`);
  await ev(`document.querySelector('[data-save]').click()`);
  md = await saved((x) => x.includes('GAREZ-VOUS'), 'enregistrement après IA sur un bloc');
  {
    const a = (await import('../blockquilt.js')).default;
    const pb = a.parse(docBefore).blocks.map(a.toMarkdown);
    const pa = a.parse(md).blocks.map(a.toMarkdown);
    const changed = pa.map((x, i) => x !== pb[i]).reduce((n, x) => n + x, 0);
    ok(pa.length === pb.length && changed === 1 && pa[tipIndex].startsWith('> [!tip]') && pa[tipIndex].includes('GAREZ-VOUS'), 'IA sur un bloc : seul ce bloc change dans document.md');
  }
  const docMid = await mdNow();
  await ev(`document.querySelector('[data-more]').click()`);
  await ev(`document.querySelector('[data-more-act="ai"]').click()`);
  ok(await ev(`document.querySelector('[data-ai-scope]').textContent.includes('document')`), 'IA sur le document : ouverte depuis l’en-tête');
  await ev(`(() => { document.querySelector('[data-ai-instruction]').value = 'Tout en majuscules'; document.querySelector('[data-ai-run]').click(); })()`);
  await waitFor(() => ev(`!document.querySelector('[data-ai-result]').hidden`), 'réponse de l’IA (document)');
  ok((await mdNow()) === docMid, 'IA sur le document : rien ne change avant « Appliquer »');
  await ev(`document.querySelector('[data-ai-apply]').click()`);
  ok(await ev(`editor.getMarkdown().includes('LA CLÉ EST DANS LA BOÎTE AUX LETTRES.') && editor.getMarkdown().startsWith('---\\ntitle: ')`), 'IA sur le document : remplacé après « Appliquer »');
  await ev(`document.activeElement.blur()`);
  await key('z', 'KeyZ', 90, CTRL);
  ok((await mdNow()) === docMid, 'IA sur le document : restauré par Ctrl+Z');
  await ev(`document.querySelector('[data-more]').click()`);
  await ev(`document.querySelector('[data-more-act="ai"]').click()`);
  await ev(`(() => { document.querySelector('[data-ai-instruction]').value = 'Réponse avec un bloc non fermé'; document.querySelector('[data-ai-run]').click(); })()`);
  await waitFor(() => ev(`!document.querySelector('[data-ai-result]').hidden`), 'réponse fautive de l’IA');
  ok(await ev(`!document.querySelector('[data-ai-lint]').hidden && document.querySelector('[data-ai-lint]').textContent.includes('non fermé') && document.querySelector('[data-ai-apply]').disabled`), 'IA : « ::: » non fermé → alerte lint, « Appliquer » bloqué');
  await ev(`(() => { const c = document.querySelector('[data-ai-force]'); c.click(); })()`);
  ok(await ev(`!document.querySelector('[data-ai-apply]').disabled`), 'IA : appliquer seulement après confirmation');
  await ev(`document.querySelector('[data-ai-ignore]').click()`);
  ok((await mdNow()) === docMid, 'IA : « Ignorer » ne change rien');
  ok(await ev(`(() => {
    const el = document.createElement('div'); document.body.append(el);
    const e = Blockquilt.mount(el, { source: 'Texte' });
    el.querySelector('[data-menu]').click();
    const none = !el.querySelector('[data-ai], [data-more-act="ai"], [data-act="ai"], [data-sheet="ai"]');
    e.destroy(); el.remove();
    return none;
  })()`), 'sans aiUrl : aucun bouton IA');

  // ---- Phase 10 : démo complète, accessibilité, parcours au clavier ----
  fs.rmSync(doc);
  await viewport(375);
  await open();
  const demoTypes = await ev(`(() => { const md = editor.getMarkdown(); const types = new Set(Blocks.parse(md).blocks.map((b) => b.type)); return { missing: Blocks.order.filter((t) => !types.has(t)), lint: Blocks.lint(md).length }; })()`);
  ok(demoTypes.missing.length === 0 && demoTypes.lint === 0, `démo : chaque type de bloc est montré, sans alerte (${demoTypes.missing.join(', ')})`);
  await ev(`document.querySelector('[data-preview]').click()`);
  await waitFor(() => ev(`[...document.querySelectorAll('[data-canvas] img')].length >= 4 && [...document.querySelectorAll('[data-canvas] img')].every((i) => i.complete && i.naturalWidth > 0)`), 'photos de la démo');
  ok(true, 'démo : photos et carrousel affichés dans l’aperçu');
  await ev(`document.querySelector('[data-preview]').click()`);
  ok(await ev(`[...document.querySelectorAll('[data-bq] button')].filter((b) => !b.textContent.trim() || b.querySelector('svg') && b.textContent.trim().length < 2).every((b) => b.getAttribute('aria-label'))`), 'chaque bouton à icône a un aria-label');
  ok(await ev(`[...document.querySelectorAll('[data-bq] input, [data-bq] textarea, [data-bq] select, [data-bq] [contenteditable]')].every((f) => f.getAttribute('aria-label') || f.labels?.length)`), 'chaque champ a une étiquette');

  // Parcours complet sans souris : ajouter, écrire, mettre en forme, déplacer, supprimer.
  await ev(`(() => { editor.setMarkdown('## Début\\n\\nPremier bloc'); document.querySelector('[data-head] [data-preview]').focus(); })()`);
  const TAB = ['Tab', 'Tab', 9];
  const tabTo = async (selector, back = false) => {
    for (let i = 0; i < 60; i++) {
      if (await ev(`!!document.activeElement?.matches(${JSON.stringify(selector)})`)) return true;
      await key(...TAB, back ? SHIFT : 0);
    }
    throw new Error('clavier : ' + selector + ' introuvable');
  };
  await tabTo('[data-insert="end"]');
  ok(await ev(`getComputedStyle(document.activeElement).outlineStyle !== 'none'`), 'clavier : focus visible');
  await key('Enter', 'Enter', 13);
  ok(await ev(`document.querySelector('[data-sheet="add"]').open`), 'clavier : Entrée ouvre le menu d’ajout');
  await tabTo('[data-sheet="add"] [data-pick="text"]');
  await key('Enter', 'Enter', 13);
  ok(await ev(`document.querySelectorAll('[data-bq] [data-id]').length === 3 && document.activeElement.matches('[data-rich]')`), 'clavier : bloc texte ajouté, curseur dedans');
  await send('Input.insertText', { text: 'Bonjour monde' });
  for (let i = 0; i < 5; i++) await key('ArrowLeft', 'ArrowLeft', 37, SHIFT);
  await key('b', 'KeyB', 66, CTRL);
  ok((await mdNow()).includes('Bonjour **monde**'), 'clavier : Ctrl+B met en gras la sélection');
  await key('F10', 'F10', 121, 1);
  ok(await ev(`!document.querySelector('[data-bar]').hidden && document.querySelector('[data-bar]').contains(document.activeElement)`), 'clavier : Alt+F10 donne le focus à la barre de mise en forme');
  await tabTo('[data-bar] [data-fmt="highlight"]');
  await key('Enter', 'Enter', 13);
  ok((await mdNow()).includes('Bonjour ==**monde**==') || (await mdNow()).includes('Bonjour **==monde==**'), 'clavier : surligner depuis la barre');
  ok(await ev(`document.activeElement.matches('[data-rich]')`), 'clavier : retour au texte après la barre');
  await tabTo('[data-grip]');
  await key('ArrowUp', 'ArrowUp', 38);
  ok(await ev(`Blocks.parse(editor.getMarkdown()).blocks[1].type === 'text' && editor.getMarkdown().split('\\n\\n')[1].startsWith('Bonjour')`), 'clavier : flèche haut sur la poignée remonte le bloc');
  await tabTo('[data-delete]', true);
  await key('Enter', 'Enter', 13);
  await tabTo('[data-del-confirm]');
  await key('Enter', 'Enter', 13);
  ok(await ev(`!editor.getMarkdown().includes('Bonjour') && document.querySelectorAll('[data-bq] [data-id]').length === 2`), 'clavier : bloc supprimé par son bouton « Supprimer »');

  ws.close();
} catch (error) {
  ok(false, error.message);
} finally {
  await stop();
  fs.rmSync(data, { recursive: true, force: true, maxRetries: 10 });
}
process.exit(failed ? 1 : 0);
