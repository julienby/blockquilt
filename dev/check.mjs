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
  // Taille et format : choisis dans la carte, écrits {size=… ratio=…} à l'enregistrement.
  await ev(`(() => {
    const pick = (sel, v) => { const s = document.querySelector(sel); s.value = v; s.dispatchEvent(new Event('input', { bubbles: true })); };
    pick('[data-photo-size]', 'medium'); pick('[data-photo-ratio]', '1:1');
  })()`);

  await ev(`document.querySelector('[data-save]').click()`);
  let md = await saved((x) => x.includes('media/'), 'enregistrement');
  ok(md.startsWith('---\ntitle: Arrivée\nicon: 🏡\n---\n'), 'enregistrement : titre et icône dans le frontmatter');
  ok(md.includes('> [!tip]\n> Garez-vous à gauche du portail.\n> - porte bleue\n> - code **1515**'), 'enregistrement : astuce fusionnée en Markdown');
  ok(md.includes('> [!info] 🥖 Boulangerie\n'), 'enregistrement : icône et titre de l’encadré gardés');
  ok(md.includes('La clé est dans la boîte aux lettres.\n\nRéseau : maison-wifi'), 'enregistrement : deux blocs après la scission');
  if (failed) console.log('--- document.md ---\n' + md + '\n---');
  const media = /\]\(media\/([a-f0-9]{12})\)/.exec(md);
  ok(media !== null, 'enregistrement : la photo est dans le texte');
  ok(/\]\(media\/[a-f0-9]{12}\)\{size=medium ratio=1:1\}/.test(md), 'enregistrement : taille et format de la photo écrits');
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
  ok(await ev(`(() => { const i = document.querySelector('[data-canvas] figure.bq-photo-medium.bq-ratio-1x1 img'); return !!i && getComputedStyle(i).aspectRatio === '1 / 1' && getComputedStyle(i).objectFit === 'cover'; })()`), 'aperçu : photo moyenne, recadrée en carré');

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
  ok(await ev(`!document.querySelector('[data-bq] [data-title], [data-bq] [data-doc-icon], [data-bq] [data-label]')`), 'en-tête : pas de titre imposé (actions seulement)');
  ok(await ev(`editor.getMarkdown().startsWith('---\\ntitle: Arrivée\\nicon: 🏡\\n---')`), 'sans titre affiché : le frontmatter (title, icon) est gardé tel quel');
  ok(await ev(`(() => { const el = document.createElement('div'); document.body.append(el); const e = Blockquilt.mount(el, { source: '---\\ntitle: T\\n---\\n\\nx', title: true }); const ok = el.querySelector('[data-title]').textContent === 'T' && !!el.querySelector('[data-doc-icon]'); el.querySelector('[data-title]').textContent = 'Nouveau'; const md = e.getMarkdown(); e.destroy(); el.remove(); return ok && md.startsWith('---\\ntitle: Nouveau'); })()`), 'option title : titre et icône du document dans l’en-tête, écrits dans le frontmatter');

  // H1 et texte en grand
  await ev(`document.querySelector('[data-insert="end"]').click()`);
  ok(await ev(`['h1', 'h2', 'h3', 't1', 't2', 't3'].every((t) => document.querySelector('[data-sheet="add"] [data-pick="' + t + '"]'))`), 'menu d’ajout : H1, H2, H3 et texte en grand T1, T2, T3');
  await ev(`document.querySelector('[data-sheet="add"] [data-pick="t1"]').click()`);
  await ev(`document.execCommand('insertText', false, 'Accroche')`);
  ok(await ev(`editor.getMarkdown().endsWith(':::t1\\nAccroche\\n:::\\n') && document.activeElement.closest('[data-id]').querySelector('[data-convert]').value === 't1'`), 'texte en grand : ajouté, écrit « :::t1 »');
  await ev(`(() => { editor.setMarkdown('# Grand titre\\n\\n:::t1\\nAccroche\\n:::'); document.querySelector('[data-preview]').click(); })()`);
  await waitFor(() => ev(`!!document.querySelector('[data-canvas] .bq-t1')`), 'aperçu du texte en grand');
  const sizes = await ev(`(() => { const h = getComputedStyle(document.querySelector('[data-canvas] h1')); const t = getComputedStyle(document.querySelector('[data-canvas] .bq-t1')); return { h: h.fontSize, t: t.fontSize, h1s: document.querySelectorAll('[data-canvas] h1').length, inT: !!document.querySelector('[data-canvas] .bq-t1 h1, [data-canvas] .bq-t1 h2') }; })()`);
  ok(sizes.h === sizes.t && sizes.h1s === 1 && !sizes.inT, `aperçu : T1 a la taille du H1 (${sizes.t}) sans être un titre ; un seul <h1>`);
  await ev(`document.querySelector('[data-preview]').click()`);
  ok(await ev(`getComputedStyle([...document.querySelectorAll('[data-bq] [data-id]')].find((c) => c.querySelector('[data-convert]')?.value === 'h1')).borderTopWidth === '3px'`), 'carte H1 : bordure noire de 3 px');
  const centered = await ev(`[...document.querySelectorAll('[data-bq] [data-id]')].filter((c) => ['h1', 't1'].includes(c.querySelector('[data-convert]')?.value)).map((c) => {
    const head = c.querySelector('[data-convert]').closest('.flex').getBoundingClientRect();
    const t = c.querySelector('[data-body]').getBoundingClientRect();
    const box = c.getBoundingClientRect();
    return [Math.round(t.top - head.bottom), Math.round(box.bottom - 12 - t.bottom)];
  })`);
  ok(centered.length === 2 && centered.every(([a, b]) => Math.abs(a - b) <= 4), `cartes de titre : texte centré verticalement sous le badge (${JSON.stringify(centered)})`);

  // Code lisible : les longues lignes vont à la ligne dans l'aperçu
  await ev(`(() => { editor.setMarkdown('\x60\x60\x60js\\nconst uneTresLongueVariable = appelerUneFonction(avecUnPremierArgument, avecUnDeuxiemeArgument, etUnTroisieme);\\n  indentée();\\n\x60\x60\x60\\n\\n| tableau | source |\\n|---|---|\\n| une cellule avec beaucoup de texte qui dépasse largement la largeur d’un téléphone | b |'); document.querySelector('[data-preview]').click(); })()`);
  await waitFor(() => ev(`!!document.querySelector('[data-canvas] pre code')`), 'aperçu du code');
  ok(await ev(`[...document.querySelectorAll('[data-canvas] pre')].every((p) => p.scrollWidth <= p.clientWidth + 1 && getComputedStyle(p).whiteSpace === 'pre-wrap') && document.querySelector('[data-canvas] pre code').textContent.includes('\\n  indentée')`), 'code et texte source : à la ligne à 375 px, sans défilement horizontal, indentation gardée');
  await ev(`document.querySelector('[data-preview]').click()`);

  // Intégration neutre : l'éditeur reprend la police, l'accent, le fond et la barre de l'application qui l'accueille
  const themed = await ev(`(async () => {
    const box = document.createElement('div');
    box.style.cssText = 'font-family: Georgia, serif; color: rgb(20, 40, 60); --bq-accent: rgb(200, 0, 0); --bq-surface: rgb(250, 245, 230); --bq-sticky-top: 50px; --bq-radius: 4px; width: 600px';
    document.body.append(box);
    const e = Blockquilt.mount(box, { source: 'Un texte\\n\\n> [!tip]\\n> Une astuce' });
    box.querySelector('[data-rich]').focus(); document.execCommand('insertText', false, '!');
    const app = getComputedStyle(box.firstElementChild);
    const out = {
      font: getComputedStyle(box.querySelector('[data-rich]')).fontFamily,
      text: getComputedStyle(box.querySelector('[data-rich]')).color,
      bg: app.backgroundColor,
      top: getComputedStyle(box.querySelector('[data-head]')).top,
      dot: getComputedStyle(box.querySelector('[data-dot]')).backgroundColor,
      radius: getComputedStyle(box.querySelector('.bq-card')).borderTopLeftRadius,
      head: getComputedStyle(box.querySelector('[data-head]')).borderBottomColor,
    };
    box.querySelector('[data-preview]').click();
    await new Promise((r) => setTimeout(r, 50));
    out.preview = getComputedStyle(box.querySelector('.bq-content p')).fontFamily + ' / ' + getComputedStyle(box.querySelector('.bq-content p')).color;
    e.destroy(); box.remove();
    return out;
  })()`);
  ok(themed.font.startsWith('Georgia') && themed.text === 'rgb(20, 40, 60)' && themed.preview === 'Georgia, serif / rgb(20, 40, 60)', `intégration : police et couleur du texte de la page reprises, en édition et en aperçu (${themed.font}, ${themed.text})`);
  ok(themed.dot === 'rgb(200, 0, 0)' && themed.bg === 'rgb(250, 245, 230)' && themed.top === '50px' && themed.radius === '4px', `intégration : --bq-accent, --bq-surface, --bq-sticky-top, --bq-radius (${JSON.stringify(themed)})`);

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
  ok(await ev(`!document.querySelector('[data-sheet="menu"] h2, [data-sheet="more"] h2') && document.querySelector('[data-sheet="menu"]').getAttribute('aria-label').startsWith('Actions du bloc')`), 'menus d’actions : pas de ligne de titre (nom gardé pour les lecteurs d’écran)');
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

  // Coller une page web : le HTML du presse-papiers devient des blocs
  await ev(`navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob(['<h2>Depuis le web</h2><p>Un <b>texte</b>.</p>'], { type: 'text/html' }), 'text/plain': new Blob(['Depuis le web Un texte.'], { type: 'text/plain' }) })])`);
  await ev(`document.querySelectorAll('[data-bq] [data-id] [data-menu]')[0].click()`);
  await ev(`document.querySelector('[data-sheet="menu"] [data-act="paste-above"]').click()`);
  await waitFor(async () => (await cards()).length === n0 + 6, 'collage HTML par le menu');
  ok((await ev(`Blocks.parse(editor.getMarkdown()).blocks.slice(0, 2).map(Blocks.toMarkdown).join('|')`)) === '## Depuis le web|Un **texte**.', 'menu « Coller au-dessus » : le HTML d’une page devient un titre et un paragraphe, en tête');
  // Ctrl+V dans un champ : un ClipboardEvent porte le HTML.
  const pasteIn = (n, html, text) => ev(`(() => { const f = [...document.querySelectorAll('[data-bq] [data-id] .bq-edit')][${n}]; f.focus(); getSelection().selectAllChildren(f); getSelection().collapseToEnd();
    const dt = new DataTransfer(); dt.setData('text/html', ${JSON.stringify(html)}); dt.setData('text/plain', ${JSON.stringify(text)});
    f.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
  await ev(`editor.setMarkdown('Premier\\n\\nSecond')`);
  await pasteIn(0, '<h3>Collé</h3><ul><li>a</li><li>b</li></ul>', 'Collé a b');
  ok((await mdNow()) === 'Premier\n\n### Collé\n\n- a\n- b\n\nSecond\n', 'Ctrl+V d’une page dans un champ plein : les blocs vont dessous, le bloc reste intact');
  await ev(`document.querySelector('[data-undo]').click()`);
  ok((await mdNow()) === 'Premier\n\nSecond\n', 'collage d’une page : un seul « Annuler » le défait');
  await ev(`(() => { const f = [...document.querySelectorAll('[data-bq] [data-id] .bq-edit')][1]; f.textContent = ''; })()`);
  await pasteIn(1, '<p>Un</p><p>Deux</p>', 'Un Deux');
  ok((await mdNow()) === 'Premier\n\nUn\n\nDeux\n', 'Ctrl+V d’une page dans un champ vide : les blocs le remplacent');
  await pasteIn(0, '<span style="color:red">juste un mot</span>', ' juste un mot');
  ok((await mdNow()) === 'Premier juste un mot\n\nUn\n\nDeux\n', 'Ctrl+V d’une phrase : texte simple au curseur, sans nouveau bloc');

  // Photos collées rapatriées : le fetch de la page est remplacé pour les envois `url` (pas d'Internet dans le conteneur).
  await ev(`(() => { const real = window.fetch; window.realFetch = real; window.fetch = (u, init) => { const url = init?.body?.get?.('url');
    if (!url) return real(u, init);
    return Promise.resolve(new Response(JSON.stringify(url.includes('/ok') ? { id: 'de0000000001' } : { error: 'non' }), { status: url.includes('/ok') ? 200 : 422 })); }; })()`);
  await ev(`editor.setMarkdown('Premier\\n\\nSecond')`);
  await pasteIn(1, '<p>Texte</p><img src="https://e.fr/ok.jpg" alt="A"><img src="https://e.fr/ko.jpg" alt="B">', 'Texte');
  await waitFor(async () => (await mdNow()).includes('media/de0000000001'), 'import des photos');
  ok((await mdNow()) === 'Premier\n\nSecond\n\nTexte\n\n![A](media/de0000000001)\n\n![B](https://e.fr/ko.jpg)\n', 'collage d’une page : une photo rapatriée, l’autre gardée en lien externe');
  ok(await ev(`document.querySelector('[data-toast]')?.textContent.includes('1 photo gardée en lien externe')`), 'import des photos : un message dit ce qui reste externe');
  await ev(`document.querySelector('[data-undo]').click()`);
  ok((await mdNow()).includes('![A](https://e.fr/ok.jpg)'), 'import des photos : un « Annuler » remet l’adresse externe');
  await ev(`window.fetch = window.realFetch`);

  // Menu d'ajout : « Coller » dans un document vide.
  await ev(`editor.setMarkdown('')`);
  await ev(`navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob(['<h2>Vide</h2><p>Rempli</p>'], { type: 'text/html' }) })])`);
  await ev(`document.querySelector('[data-bq] [data-insert="end"]').click()`);
  await ev(`document.querySelector('[data-sheet="add"] [data-pick="paste"]').click()`);
  await waitFor(async () => (await mdNow()) === '## Vide\n\nRempli\n', 'coller depuis le menu d’ajout');
  ok(true, 'menu d’ajout « Coller » : un document vide reçoit les blocs');

  // Ctrl+V d'une capture d'écran : envoyée par uploadUrl, un bloc photo.
  const pasteShot = (text) => ev(`(() => { const f = [...document.querySelectorAll('[data-bq] [data-id] .bq-edit')].find((x) => x.textContent === ${JSON.stringify(text)}); f.focus();
    const dt = new DataTransfer(); dt.items.add(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])], 'capture.png', { type: 'image/png' }));
    f.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); })()`);
  await pasteShot('Vide');
  await waitFor(async () => /!\[\]\(media\/[a-f0-9]{12}\)/.test(await mdNow()), 'capture d’écran collée');
  const shotMd = await mdNow();
  ok(/^## Vide\n\n!\[\]\(media\/[a-f0-9]{12}\)\n\nRempli\n$/.test(shotMd), `Ctrl+V d’une capture d’écran : un bloc photo sous le bloc en cours → ${JSON.stringify(shotMd)}`);
  const nShot = (await cards()).length;
  await pasteShot('');
  await waitFor(async () => ((await mdNow()).match(/media\//g) || []).length === 2, 'capture d’écran dans un bloc vide');
  ok((await cards()).length === nShot && /^!\[\]\(media\/[a-f0-9]{12}\)\n\n## Vide/.test(await mdNow()), 'Ctrl+V d’une capture d’écran dans un bloc vide : la photo le remplace');

  // Import par adresse : le serveur refuse ce qui n'est pas une image publique en https (SSRF).
  const mediaCount = () => fs.readdirSync(path.join(data, 'media')).length;
  const mediaBefore = mediaCount();
  for (const bad of ['https://127.0.0.1/x.png', 'https://localhost/x.png', 'https://10.0.0.1/x.png', 'https://[::1]/x.png', 'https://[::ffff:127.0.0.1]/x.png', 'https://169.254.169.254/latest', 'http://exemple.fr/x.png', 'https://exemple.fr:8443/x.png', 'https://u:p@exemple.fr/x.png', 'file:///etc/passwd', 'pas une adresse']) {
    const fd = new FormData();
    fd.set('url', bad);
    const r = await fetch(BASE + '/api/upload', { method: 'POST', body: fd });
    ok(r.status === 422 && (await r.json()).error, `import par adresse refusé : ${bad}`);
  }
  ok(mediaCount() === mediaBefore, 'import refusé : aucun fichier écrit');

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
    ok(await ev(`(() => { const b = document.querySelector('[data-head] [data-full]'); const r = b.getBoundingClientRect(); return b.offsetParent !== null && r.width >= 44 && !!b.querySelector('svg[data-icon="minimize"]') && b.getAttribute('aria-label') === 'Quitter le plein écran'; })()`), `${width} px : icône « réduire » visible dans la barre du haut`);
    if (width < 640) await ev(`document.querySelector('[data-head] [data-full]').click()`); else await key('Escape', 'Escape', 27);
    await sleep(100); // l'événement « close » d'un dialogue arrive au tour suivant
    ok(await ev(`!document.querySelector('[data-editor-full]').open && document.getElementById('editor').firstElementChild.matches('[data-bq]') && (innerWidth >= 640 || document.querySelector('[data-head] [data-full]').offsetParent === null)`), `${width} px : ${width < 640 ? 'l’icône « réduire »' : 'Échap'} quitte le plein écran, l’éditeur revient à sa place`);
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

  // Plein écran déclenché par un vrai clic (geste de l'utilisateur) : le dialogue couvre la fenêtre, sans plein écran du navigateur (pas de message « Pour quitter… »)
  const realClick = async (selector) => {
    const pt = await ev(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
    await mouse('mousePressed', pt.x, pt.y);
    await mouse('mouseReleased', pt.x, pt.y, 0);
    await sleep(400);
  };
  await viewport(1280);
  await ev(`localStorage.setItem('blockquilt.split', 'false')`); // ces tests mesurent la largeur d'une seule colonne
  await open();
  await realClick('[data-bq] [data-id] [data-expand]');
  const real = await ev(`(() => { const d = document.querySelector('[data-block-full]'); const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2); return { open: d.open, fs: !document.fullscreenElement, w: d.getBoundingClientRect().width === innerWidth && d.getBoundingClientRect().height === innerHeight, hit: d.contains(hit), chrome: !!d.querySelector('.bq-card, [data-rail], [data-convert], [data-delete]'), field: d.contains(document.activeElement) && document.activeElement.matches('[contenteditable], textarea, input') }; })()`);
  ok(real.open && real.fs && real.w && real.hit, `PC : bloc en plein écran, toute la fenêtre, au premier plan, sans plein écran du navigateur (${JSON.stringify(real)})`);
  ok(!real.chrome && real.field, 'bloc en plein écran : sans habillage de carte, curseur dans le texte');
  ok(await ev(`(() => { const b = document.querySelector('[data-block-full] [data-block-full-close]'); const r = b.getBoundingClientRect(); return !!b.querySelector('svg[data-icon="minimize"]') && b.getAttribute('aria-label') === 'Quitter le plein écran' && r.right > innerWidth - 60 && r.top < 60; })()`), 'bloc en plein écran : l’icône « agrandir » devient « réduire », en haut à droite');
  await send('Input.insertText', { text: ' (vrai clic)' });
  await key('Escape', 'Escape', 27);
  await sleep(200);
  ok(await ev(`!document.querySelector('[data-block-full]').open && !document.fullscreenElement && editor.getMarkdown().includes(' (vrai clic)') && document.querySelectorAll('[data-bq] [data-id]').length === Blocks.parse(editor.getMarkdown()).blocks.length`), 'bloc en plein écran : Échap ferme tout, le texte est gardé, une seule carte par bloc');
  await realClick('[data-full]');
  ok(await ev(`(() => { const d = document.querySelector('[data-editor-full]'); return d.open && !document.fullscreenElement && d.contains(document.elementFromPoint(innerWidth / 2, innerHeight / 2)) && !document.querySelector('[data-head] [data-width]').hidden; })()`), 'PC : éditeur en plein écran au premier plan, sans plein écran du navigateur, bouton de largeur visible');
  const widths = [];
  for (let i = 0; i < 3; i++) { await ev(`document.querySelector('[data-head] [data-width]').click()`); widths.push(await ev(`Math.round(document.querySelector('[data-canvas] .bq-column').getBoundingClientRect().width)`)); }
  ok(new Set(widths).size === 3 && widths.includes(640) && widths.some((w) => w > 1200), `plein écran : la largeur du texte fait le tour de trois largeurs (${widths.join(', ')} px)`);
  await ev(`document.querySelector('[data-editor-full]').close()`);
  await sleep(200);
  ok(await ev(`!document.fullscreenElement && document.querySelector('[data-head] [data-width]').hidden && document.getElementById('editor').firstElementChild.matches('[data-bq]')`), 'plein écran quitté : éditeur à sa place, bouton de largeur masqué');
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
  await ev(`document.querySelector('[data-sheet="icon"]').close()`);
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await ev(`(() => { const f = [...document.querySelectorAll('[data-bq] [data-id]')].find((c) => c.querySelector('[data-convert]')?.value === 'tip'); f.querySelector('[data-rich]').focus(); f.querySelector('[data-callout-icon]').click(); })()`);
  ok(await ev(`matchMedia('(pointer: coarse)').matches && document.querySelector('[data-sheet="icon"]').open && !document.activeElement.matches('input, textarea, [contenteditable="true"]')`), 'sélecteur d’emoji (tactile) : aucun champ n’a le focus, le clavier se ferme');
  await send('Emulation.setTouchEmulationEnabled', { enabled: false });
  await ev(`document.querySelector('[data-sheet="icon"]').close()`);
  await viewport(1280);
  await ev(`[...document.querySelectorAll('[data-bq] [data-id]')].find((c) => c.querySelector('[data-convert]')?.value === 'tip').querySelector('[data-callout-icon]').click()`);
  ok(await ev(`!matchMedia('(pointer: coarse)').matches && document.activeElement.matches('[data-emoji-search]')`), 'sélecteur d’emoji (souris) : la recherche a le focus');
  await viewport(375);
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
  const rows = await ev(`(() => {
    const list = document.querySelector('[data-bq] [data-car-list]');
    const lines = [...list.querySelectorAll('[data-car-item]')].map((r) => {
      const mid = (el) => { const b = el.getBoundingClientRect(); return Math.round(b.top + b.height / 2); };
      const parts = [r.querySelector('[data-car-grip]'), r.querySelector('img'), r.querySelector('[data-car-alt]'), r.querySelector('[data-car-act="remove"]')];
      return parts.every(Boolean) && Math.max(...parts.map(mid)) - Math.min(...parts.map(mid)) <= 4;
    });
    return { n: lines.length, oneLine: lines.every(Boolean), fits: list.scrollWidth <= list.clientWidth, add: !!list.parentElement.querySelector('[data-car-add]') };
  })()`);
  ok(rows.n === 3 && rows.oneLine && rows.fits && rows.add, `carrousel : une photo par ligne (poignée, vignette, légende, suppression), « Ajouter » dessous (${JSON.stringify(rows)})`);
  await ev(`(() => { ['Un', 'Deux', 'Trois'].forEach((t, i) => { const x = document.querySelectorAll('[data-car-alt]')[i]; x.value = t; x.dispatchEvent(new InputEvent('input', { bubbles: true })); }); })()`);
  await ev(`document.querySelector('[data-car-item="0"] [data-car-grip]').focus()`);
  await key('ArrowDown', 'ArrowDown', 40);
  ok(await ev(`[...document.querySelectorAll('[data-car-alt]')].map((x) => x.value).join() === 'Deux,Un,Trois' && document.activeElement.matches('[data-car-item="1"] [data-car-grip]')`), 'carrousel : flèche bas sur la poignée, la photo descend, légendes suivies, focus gardé');
  await ev(`document.querySelector('[data-save]').click()`);
  md = await saved((x) => x.includes(':::carousel'), 'enregistrement du carrousel');
  ok(/:::carousel\n!\[Deux\]\(media\/\w+\)\n!\[Un\]\(media\/\w+\)\n!\[Trois\]\(media\/\w+\)\n:::/.test(md), 'carrousel : l’ordre des lignes a changé dans document.md');
  // Glisser une photo par sa poignée : trait bleu pendant le glissement, ordre changé au lâcher, Échap annule
  const carOrder = () => ev(`[...document.querySelectorAll('[data-car-alt]')].map((x) => x.value).join()`);
  await ev(`document.querySelector('[data-car-list]').scrollIntoView({ block: 'center' })`);
  const gripAt = (i) => ev(`(() => { const b = document.querySelector('[data-car-item="${i}"] [data-car-grip]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  let g2 = await gripAt(2);
  const g0 = await gripAt(0);
  await mouse('mousePressed', g2.x, g2.y);
  const startLine = await ev(`(() => { const l = document.querySelector('[data-car-list] .bq-drop').getBoundingClientRect(); const r = document.querySelector('[data-car-item="2"]').getBoundingClientRect(); const mid = l.top + l.height / 2; return { mid, top: r.top, bottom: r.bottom }; })()`);
  ok(startLine.mid >= startLine.top - 8 && startLine.mid <= startLine.bottom + 8, `carrousel : dès la saisie, le trait bleu est contre la photo saisie, pas en haut (${JSON.stringify(startLine)})`);
  for (let y = g2.y; y >= g0.y - 20; y -= 15) await mouse('mouseMoved', g2.x, y);
  ok((await carOrder()) === 'Deux,Un,Trois' && await ev(`document.querySelectorAll('[data-car-list] .bq-drop').length === 1`), 'carrousel : pendant le glissement, ordre inchangé et un trait bleu');
  await mouse('mouseReleased', g2.x, g0.y - 20, 0);
  ok((await carOrder()) === 'Trois,Deux,Un', 'carrousel : au lâcher, la photo arrive sous le trait');
  g2 = await gripAt(2);
  await mouse('mousePressed', g2.x, g2.y);
  for (let y = g2.y; y >= g0.y - 20; y -= 15) await mouse('mouseMoved', g2.x, y);
  await key('Escape', 'Escape', 27);
  await mouse('mouseReleased', g2.x, g0.y - 20, 0);
  ok((await carOrder()) === 'Trois,Deux,Un' && !(await ev(`!!document.querySelector('[data-car-list] .bq-drop')`)), 'carrousel : Échap annule le glissement');
  await ev(`editor.undo()`);
  ok((await carOrder()) === 'Deux,Un,Trois', 'carrousel : Ctrl+Z annule le déplacement');
  // Plein écran du bloc : le nouvel ordre se voit dans le dialogue et reste à la fermeture
  await ev(`document.querySelector('[data-car-list]').closest('[data-id]').querySelector('[data-expand]').click()`);
  const fullOrder = () => ev(`[...document.querySelectorAll('[data-block-full] [data-car-alt]')].map((x) => x.value).join()`);
  await ev(`document.querySelector('[data-block-full] [data-car-item="0"] [data-car-grip]').focus()`);
  await key('ArrowDown', 'ArrowDown', 40);
  ok((await fullOrder()) === 'Un,Deux,Trois' && await ev(`document.activeElement.matches('[data-block-full] [data-car-item="1"] [data-car-grip]')`), `carrousel en plein écran : flèche bas, la photo descend dans le dialogue, focus gardé (${await fullOrder()})`);
  let fg2 = await ev(`(() => { const b = document.querySelector('[data-block-full] [data-car-item="2"] [data-car-grip]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  const fg0 = await ev(`(() => { const b = document.querySelector('[data-block-full] [data-car-item="0"] [data-car-grip]').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
  await mouse('mousePressed', fg2.x, fg2.y);
  for (let y = fg2.y; y >= fg0.y - 20; y -= 15) await mouse('mouseMoved', fg2.x, y);
  await mouse('mouseReleased', fg2.x, fg0.y - 20, 0);
  ok((await fullOrder()) === 'Trois,Un,Deux', `carrousel en plein écran : glisser change l’ordre dans le dialogue (${await fullOrder()})`);
  await ev(`document.querySelector('[data-block-full] [data-block-full-close]').click()`);
  await waitFor(() => ev(`!document.querySelector('[data-block-full] [data-car-list]')`), 'plein écran du carrousel fermé');
  ok((await carOrder()) === 'Trois,Un,Deux' && /!\[Trois\]\(media\/\w+\)\n!\[Un\]\(media\/\w+\)\n!\[Deux\]\(media\/\w+\)/.test(await ev(`editor.getMarkdown()`)) && await ev(`document.querySelectorAll('[data-car-list]').length === 1`), `carrousel en plein écran : à la fermeture, l’ordre est gardé (${await carOrder()})`);
  await ev(`editor.undo()`);
  await ev(`editor.undo()`);
  ok((await carOrder()) === 'Deux,Un,Trois', `carrousel : Ctrl+Z annule les déplacements faits en plein écran (${await carOrder()})`);
  // Plein écran, avec le visuel à côté (défaut sur grand écran) : une légende tapée dans le dialogue suit sa photo quand elle descend
  const splitWas = await ev(`document.querySelector('[data-visual-toggle]').getAttribute('aria-pressed')`);
  if (splitWas !== 'true') await ev(`document.querySelector('[data-visual-toggle]').click()`);
  await ev(`document.querySelector('[data-car-list]').closest('[data-id]').querySelector('[data-expand]').click()`);
  const pairs = () => ev(`[...document.querySelectorAll('[data-block-full] [data-car-item]')].map((r) => r.querySelector('img').getAttribute('src').slice(-12) + '=' + r.querySelector('[data-car-alt]').value).join()`);
  await ev(`(() => { const x = document.querySelector('[data-block-full] [data-car-item="0"] [data-car-alt]'); x.focus(); x.value = 'Neuf'; x.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
  const pBefore = (await pairs()).split(',');
  await ev(`document.querySelector('[data-block-full] [data-car-item="0"] [data-car-grip]').focus()`);
  await key('ArrowDown', 'ArrowDown', 40);
  const pAfter = (await pairs()).split(',');
  ok(pAfter.join() === [pBefore[1], pBefore[0], pBefore[2]].join() && pAfter[1].endsWith('=Neuf'), `carrousel en plein écran : la légende tapée suit sa photo (${pBefore} → ${pAfter})`);
  await ev(`document.querySelector('[data-block-full] [data-block-full-close]').click()`);
  await waitFor(() => ev(`!document.querySelector('[data-block-full] [data-car-list]')`), 'plein écran du carrousel fermé');
  ok((await carOrder()) === 'Un,Neuf,Trois', `carrousel en plein écran : à la fermeture, la légende tapée reste avec sa photo (${await carOrder()})`);
  await ev(`editor.undo()`);
  await ev(`editor.undo()`);
  if (splitWas !== 'true') await ev(`document.querySelector('[data-visual-toggle]').click()`);
  // Replier : une seule ligne (miniatures et nombre de photos), gardée d'un dessin à l'autre
  const fold = await ev(`(async () => {
    const card = document.querySelector('[data-car-list]').closest('[data-id]');
    card.querySelector('[data-toggle-view="collapsed"]').click();
    const c = document.querySelector('[data-car-count]').closest('[data-id]');
    const body = c.querySelector('[data-card-body]').getBoundingClientRect().height;
    const out = { view: c.dataset.view, list: c.querySelector('[data-car-list]').offsetParent === null, count: c.querySelector('[data-car-count]').textContent, body, pressed: c.querySelector('[data-toggle-view]').getAttribute('aria-pressed') };
    document.querySelector('[data-insert="end"]').click(); document.querySelector('[data-sheet="add"] [data-pick="hr"]').click();
    out.kept = document.querySelector('[data-car-count]').closest('[data-id]').dataset.view === 'collapsed';
    editor.undo();
    out.kept = out.kept && document.querySelector('[data-car-count]').closest('[data-id]').dataset.view === 'collapsed';
    document.querySelector('[data-car-count]').closest('[data-id]').querySelector('[data-toggle-view="collapsed"]').click();
    out.back = document.querySelector('[data-car-list]').offsetParent !== null;
    return out;
  })()`);
  ok(fold.view === 'collapsed' && fold.list && fold.count === '3 photos' && fold.body <= 48 && fold.pressed === 'true', `carrousel replié : une seule ligne, « 3 photos » (${JSON.stringify(fold)})`);
  ok(fold.kept && fold.back, 'carrousel replié : gardé d’un dessin à l’autre et après Ctrl+Z, se déplie au même bouton');
  // F1 : un carrousel replié le reste quand on le déplace (flèche de la colonne, ou clavier sur la poignée)
  const moved = await ev(`(async () => {
    const car = () => document.querySelector('[data-car-count]')?.closest('[data-id]');
    document.querySelector('[data-car-list]').closest('[data-id]').querySelector('[data-toggle-view="collapsed"]').click();
    const out = {};
    car().querySelector('[data-move="1"]:not(:disabled), [data-move="-1"]:not(:disabled)').click();
    out.afterRail = car().dataset.view;
    car().querySelector('[data-grip]').focus();
    car().querySelector('[data-grip]').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    out.afterKey = car().dataset.view;
    out.listHidden = car().querySelector('[data-car-list]').offsetParent === null;
    car().querySelector('[data-toggle-view="collapsed"]').click();
    return out;
  })()`);
  ok(moved.afterRail === 'collapsed' && moved.afterKey === 'collapsed' && moved.listHidden, `carrousel replié : reste replié après un déplacement (${JSON.stringify(moved)})`);
  // F1 : le repli est gardé dans le navigateur (storageKey) et revient après rechargement
  await ev(`document.querySelector('[data-car-list]').closest('[data-id]').querySelector('[data-toggle-view="collapsed"]').click()`);
  await ev(`editor.save()`); // l'état suit les blocs : on enregistre pour que le texte relu ait le même ordre
  await open();
  const reloaded = await ev(`(() => { const c = document.querySelector('[data-car-count]')?.closest('[data-id]'); return { view: c?.dataset.view, stored: localStorage.getItem('blockquilt.views.demo') }; })()`);
  ok(reloaded.view === 'collapsed', `repli mémorisé : le carrousel reste replié après rechargement (${JSON.stringify(reloaded)})`);
  // La copie qui suit le doigt, pendant le glissement par la poignée, reste repliée comme la carte
  const cg = await ev(`(() => { const g = document.querySelector('[data-car-count]').closest('[data-id]').querySelector('[data-grip]'); g.scrollIntoView({ block: 'center' }); const r = g.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await mouse('mousePressed', cg.x, cg.y);
  await mouse('mouseMoved', cg.x, cg.y + 5);
  const ghost = await ev(`(() => { const g = document.querySelector('.bq-ghost'); return { list: g.querySelector('[data-car-list]').offsetParent === null, count: g.querySelector('[data-car-count]').offsetParent !== null, h: Math.round(g.getBoundingClientRect().height), card: Math.round(document.querySelector('.bq-origin').getBoundingClientRect().height) }; })()`);
  await key('Escape', 'Escape', 27);
  await mouse('mouseReleased', cg.x, cg.y + 5, 0);
  ok(ghost.list && ghost.count && ghost.h <= ghost.card + 2, `glissement : la copie d'un carrousel replié reste repliée (${JSON.stringify(ghost)})`);
  await ev(`document.querySelector('[data-car-count]').closest('[data-id]').querySelector('[data-toggle-view="collapsed"]').click()`);
  ok(await ev(`!localStorage.getItem('blockquilt.views.demo').includes('collapsed') && !!document.querySelector('[data-car-list]').offsetParent`), 'repli mémorisé : déplié, le choix est gardé aussi');
  // F2 : repli automatique des longs blocs (collapseLines)
  const longText = Array.from({ length: 12 }, (_, i) => `Ligne ${i + 1}`).join('  \n');
  const autoFold = (options, act = '') => ev(`(() => {
    const el = document.createElement('div'); document.body.append(el);
    const e = Blockquilt.mount(el, { source: ${JSON.stringify(longText)} + '\\n\\nCourt', storageKey: 'f2', ...${JSON.stringify(options)} });
    ${act}
    const card = el.querySelector('[data-id]'); const body = card.querySelector('[data-card-body]');
    const out = { view: card.dataset.view, h: body.getBoundingClientRect().height, line: parseFloat(getComputedStyle(body).lineHeight) || 0, footer: card.textContent.includes('+7 lignes') && !!card.querySelector('button.bq-view-collapsed')?.offsetParent, shortView: el.querySelectorAll('[data-id]')[1].dataset.view, full: [...el.querySelectorAll('[data-expand]')][0] && 1 };
    e.destroy(); el.remove(); return out;
  })()`);
  await ev(`localStorage.removeItem('blockquilt.views.f2')`);
  await viewport(375);
  const f2 = await autoFold({});
  ok(f2.view === 'collapsed' && f2.footer && f2.shortView === 'edit' && f2.h < 12 * 24, `repli auto : un bloc de 12 lignes est replié à 375 px, « … +7 lignes » et « Déplier » (${JSON.stringify(f2)})`);
  const f2open = await autoFold({}, `el.querySelector('[data-fold]').click();`);
  ok(f2open.view === 'edit' && f2open.h > f2.h, `repli auto : un clic sur la zone repliée déplie (${JSON.stringify(f2open)})`);
  const f2again = await autoFold({});
  ok(f2again.view === 'edit', 'repli auto : le bloc reste déplié après rechargement (choix gardé)');
  const f2off = await autoFold({ collapseLines: 0, storageKey: 'f2off' });
  ok(f2off.view === 'edit' && f2off.h > f2.h, 'repli auto : collapseLines: 0 ne replie rien');
  const f2full = await ev(`(async () => {
    localStorage.removeItem('blockquilt.views.f2');
    const el = document.createElement('div'); document.body.append(el);
    const e = Blockquilt.mount(el, { source: ${JSON.stringify(longText)}, storageKey: 'f2' });
    el.querySelector('[data-expand]').click();
    const d = el.querySelector('[data-block-full]') || document.querySelector('[data-block-full]');
    const inner = d.querySelector('[data-id]'); const r = { view: inner.dataset.view, h: inner.getBoundingClientRect().height };
    d.close(); e.destroy(); el.remove(); localStorage.removeItem('blockquilt.views.f2'); return r;
  })()`);
  ok(f2full.view === 'edit' && f2full.h > f2.h, `repli auto : le plein écran montre le bloc en entier (${JSON.stringify(f2full)})`);
  for (const width of [375, 1280]) {
    await viewport(width);
    const f3 = await ev(`(async () => {
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      const el = document.createElement('div'); document.body.append(el);
      const saved = [];
      const e = Blockquilt.mount(el, { source: 'Un\\n\\nDeux\\n\\nTrois', onSave: (md) => { saved.push(md); } });
      const d = el.querySelector('[data-block-full]');
      const btn = (n) => d.querySelector('[data-full-' + n + ']');
      const label = () => d.querySelector('[data-block-full-body] [data-rich]').textContent;
      const typeAtEnd = (t) => { const f = d.querySelector('[data-rich]'); f.focus(); getSelection().selectAllChildren(f); getSelection().collapseToEnd(); document.execCommand('insertText', false, t); };
      el.querySelectorAll('[data-expand]')[1].click();
      const r = { first: label(), labels: ['save', 'prev', 'next'].map((n) => btn(n).getAttribute('aria-label')) };
      typeAtEnd(' modifié');
      btn('save').click(); await wait(50);
      r.saved = saved.length === 1 && saved[0].includes('Deux modifié');
      btn('next').click(); await wait(50);
      r.third = label(); r.open = d.open; r.nextOff = btn('next').disabled;
      typeAtEnd(' fin');
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true })); await wait(50);
      r.ctrlS = saved.length === 2 && saved[1].includes('Deux modifié') && saved[1].includes('Trois fin');
      btn('prev').click(); await wait(50); btn('prev').click(); await wait(50);
      r.firstAgain = label(); r.prevOff = btn('prev').disabled;
      d.close(); await wait(50);
      r.md = e.getMarkdown(); r.cards = el.querySelectorAll('[data-id]').length;
      e.destroy(); el.remove(); return r;
    })()`);
    ok(f3.first === 'Deux' && f3.labels.every(Boolean), `${width} px : plein écran, Enregistrer et flèches avec aria-label (${JSON.stringify(f3.labels)})`);
    ok(f3.saved && f3.third === 'Trois' && f3.open, `${width} px : bloc 2 modifié, Enregistrer, puis « suivant » : le contenu enregistré contient la modification, le plein écran reste ouvert`);
    ok(f3.ctrlS && f3.nextOff, `${width} px : Ctrl+S enregistre dans le plein écran ; flèche « suivant » désactivée au dernier bloc`);
    ok(f3.firstAgain === 'Un' && f3.prevOff && f3.md === 'Un\n\nDeux modifié\n\nTrois fin\n' && f3.cards === 3, `${width} px : « précédent » jusqu’au premier bloc (flèche désactivée), texte gardé (${JSON.stringify(f3.md)})`);
  }
  await viewport(375);
  await ev(`document.querySelector('[data-car-item="2"] [data-car-act="remove"]').click()`);
  ok(await ev(`document.querySelectorAll('[data-car-item]').length === 2`), 'carrousel : photo retirée');
  await ev(`editor.undo()`);
  await ev(`document.querySelector('[data-preview]').click()`);
  await waitFor(() => ev(`!!document.querySelector('[data-canvas] .bq-carousel')`), 'aperçu du carrousel');
  const track = await ev(`(() => { const t = document.querySelector('.bq-carousel-track'); return { figures: t.querySelectorAll('figure').length, sw: t.scrollWidth, cw: t.clientWidth, snap: getComputedStyle(t).scrollSnapType }; })()`);
  ok(track.figures === 3 && track.sw > track.cw && track.snap.includes('x'), `carrousel : 3 <figure>, défilement horizontal à 375 px (${track.sw} > ${track.cw})`);
  const carNav = () => ev(`(() => { const c = document.querySelector('[data-canvas] .bq-carousel'); const d = [...c.querySelectorAll('.bq-carousel-dots button')]; return { ready: c.classList.contains('is-ready'), dots: d.length, cur: d.findIndex((x) => x.getAttribute('aria-current') === 'true'), prev: !c.querySelector('.bq-carousel-prev').hidden && !c.querySelector('.bq-carousel-prev').disabled, next: !c.querySelector('.bq-carousel-next').hidden && !c.querySelector('.bq-carousel-next').disabled, bar: getComputedStyle(c.querySelector('.bq-carousel-track')).scrollbarWidth, one: Math.round(c.querySelector('figure').getBoundingClientRect().width) === Math.round(c.querySelector('.bq-carousel-track').clientWidth) }; })()`);
  let nav = await carNav();
  ok(nav.ready && nav.dots === 3 && nav.cur === 0 && !nav.prev && nav.next && nav.bar === 'none' && nav.one, `carrousel : une photo à la fois, flèches et 3 puces, sans barre de défilement (${JSON.stringify(nav)})`);
  await ev(`document.querySelector('[data-canvas] .bq-carousel-next').click()`);
  await waitFor(async () => (await carNav()).cur === 1, 'flèche suivante');
  nav = await carNav();
  ok(nav.prev && nav.next, 'carrousel : la flèche droite passe à la photo 2, les deux flèches sont actives');
  await ev(`document.querySelectorAll('[data-canvas] .bq-carousel-dots button')[2].click()`);
  await waitFor(async () => (await carNav()).cur === 2, 'puce 3');
  ok(!(await carNav()).next, 'carrousel : la puce 3 montre la dernière photo, flèche droite masquée');
  await ev(`document.querySelector('[data-canvas] .bq-carousel-prev').click()`);
  await waitFor(async () => (await carNav()).cur === 1, 'flèche précédente');
  ok(true, 'carrousel : la flèche gauche revient à la photo 2');
  await ev(`document.querySelector('[data-preview]').click()`);
  ok(await ev(`(() => { const t = ':::columns\\nGauche\\n\\nDroite\\n:::'; editor.setMarkdown(t); return !!document.querySelector('[data-bq] [data-raw]') && editor.getMarkdown() === t + '\\n'; })()`), ':::columns écrit à la main : bloc source, texte intact');

  // ---- Phase 8 : bloc HTML ----
  await open();
  await ev(`document.querySelector('[data-insert="end"]').click()`);
  await ev(`document.querySelector('[data-sheet="add"] [data-pick="html"]').click()`);
  await ev(`(() => { const t = document.querySelector('[data-bq] [data-html]'); t.value = '<div class="p-4" onclick="alert(1)"><strong>Gras</strong><script>window.pwned = 1</script><img src=x onerror="window.pwned = 2"></div>'; t.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
  ok(await ev(`(() => { const c = document.querySelector('[data-bq] [data-html]').closest('[data-id]'); const eye = c.querySelector('[data-toggle-view="preview"]'); return !!eye && eye.compareDocumentPosition(c.querySelector('[data-convert], .rounded-full')) & Node.DOCUMENT_POSITION_PRECEDING && c.querySelector('[data-html]').offsetParent !== null && c.querySelector('[data-html-preview]').offsetParent === null; })()`), 'bloc HTML : œil à côté du type, code affiché par défaut');
  await ev(`document.querySelector('[data-bq] [data-toggle-view="preview"]').click()`);
  const live = await ev(`document.querySelector('[data-html-preview]').innerHTML`);
  ok(live === '<div class="p-4"><strong>Gras</strong></div>' && await ev(`document.querySelector('[data-html-preview]').offsetParent !== null && document.querySelector('[data-bq] [data-html]').offsetParent === null && document.querySelector('[data-toggle-view="preview"]').getAttribute('aria-pressed') === 'true'`), 'bloc HTML : l’œil montre l’aperçu filtré à la place du code (' + live + ')');
  await ev(`document.querySelector('[data-bq] [data-toggle-view="preview"]').click()`);
  ok(await ev(`document.querySelector('[data-bq] [data-html]').offsetParent !== null`), 'bloc HTML : l’œil revient au code');
  await ev(`document.querySelector('[data-save]').click()`);
  md = await saved((x) => x.includes(':::html'), 'enregistrement du bloc HTML');
  ok(md.includes(':::html\n<div class="p-4" onclick="alert(1)"><strong>Gras</strong><script>window.pwned = 1</script><img src=x onerror="window.pwned = 2"></div>\n:::'), 'bloc HTML : texte source enregistré tel quel');
  await ev(`document.querySelector('[data-preview]').click()`);
  await waitFor(() => ev(`!!document.querySelector('[data-canvas] .bq-html')`), 'aperçu du bloc HTML');
  await sleep(200);
  ok(await ev(`!window.pwned && !document.querySelector('[data-canvas] script, [data-canvas] [onclick], [data-canvas] [onerror]') && document.querySelector('[data-canvas] .bq-html strong')?.textContent === 'Gras'`), 'bloc HTML : rendu filtré, aucun script exécuté');
  ok(await ev(`(() => { const el = document.createElement('div'); document.body.append(el); const e = Blockquilt.mount(el, { source: ':::html\\n<b>x</b>\\n:::' }); el.querySelector('[data-insert="end"]').click(); const has = !!el.querySelector('[data-pick="html"]'); const raw = !!el.querySelector('[data-id] [data-raw]') && !el.querySelector('[data-html-preview]'); e.destroy(); el.remove(); return !has && raw; })()`), 'bloc HTML désactivé par défaut : absent du menu, édité comme texte source');

  // ---- Carte : ajoutée depuis le menu, photo envoyée, champs écrits, rendu en aperçu, à 375 et 1280 px ----
  for (const width of [375, 1280]) {
    await viewport(width);
    await ev(`(() => { const el = document.createElement('div'); el.className = 'cardtest'; document.body.append(el);
      window.cardEd = Blockquilt.mount(el, { source: 'Intro.\\n', uploadUrl: 'api/upload' });
      el.querySelector('[data-insert="end"]').click(); el.querySelector('[data-pick="card"]').click(); })()`);
    ok(await ev(`!!document.querySelector('.cardtest [data-id] [data-card-act="photo"]') && !!document.querySelector('.cardtest [data-card-title]')`), `${width} px, carte : ajoutée depuis le menu, avec « Ajouter une photo »`);
    await ev(`document.querySelector('.cardtest [data-card-act="photo"]').click()`);
    await setFiles('div.cardtest input[data-file]', [png]);
    await waitFor(() => ev(`!!document.querySelector('.cardtest [data-card-act="remove"]')`), 'photo de la carte');
    const card = await ev(`(() => { const el = document.querySelector('.cardtest'); const c = el.querySelectorAll('[data-id]')[1];
      const put = (s, v) => { const i = c.querySelector(s); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };
      put('[data-card-alt]', 'Un pixel'); put('[data-card-title]', 'Les Alpes'); put('[data-card-label]', 'Lire'); put('[data-card-href]', 'https://exemple.fr');
      const t = c.querySelector('[data-body]'); t.textContent = 'Un texte court.'; t.dispatchEvent(new Event('input', { bubbles: true }));
      const md = cardEd.getMarkdown();
      const fits = c.scrollWidth <= c.clientWidth + 1 && c.getBoundingClientRect().right <= innerWidth;
      el.querySelector('[data-preview]').click();
      return { md, fits }; })()`);
    ok(/^Intro\.\n\n:::card\n!\[Un pixel\]\(media\/[\w.-]+\)\n### Les Alpes\nUn texte court\.\n\[Lire\]\(https:\/\/exemple\.fr\)\n:::\n$/.test(card.md) && card.fits, `${width} px, carte : photo, titre, texte et bouton écrits en Markdown, la carte tient dans l’écran (${JSON.stringify(card)})`);
    await waitFor(() => ev(`!!document.querySelector('.cardtest .bq-card a.bq-card-link')`), 'aperçu de la carte');
    ok(await ev(`(() => { const a = document.querySelector('.cardtest .bq-card a.bq-card-link'); const r = a.getBoundingClientRect(); const img = document.querySelector('.cardtest .bq-card > img');
      const ok = r.height >= 44 && getComputedStyle(a).color === 'rgb(255, 255, 255)' && img.getBoundingClientRect().width > 0 && document.querySelector('.cardtest .bq-card-title').textContent === 'Les Alpes';
      cardEd.destroy(); document.querySelector('.cardtest').remove(); return ok; })()`), `${width} px, carte : aperçu avec photo, titre et bouton de 44 px au moins`);
  }

  // ---- Lignes composées (L2) : en aperçu, côte à côte en large, empilées en étroit ; ligne incomplète sans trou ----
  for (const width of [1280, 375]) {
    await viewport(width);
    await ev(`(() => { const el = document.createElement('div'); el.className = 'rowtest'; document.body.append(el);
      window.rowEd = Blockquilt.mount(el, { source: '<!-- 1/3 -->\\n![Vert](media/de0000000003)\\n\\n<!-- 2/3 -->\\nLe chalet est au bout du chemin.\\n\\n<!-- 1/3 -->\\n\\n<!-- 2/3 -->\\nDécalé à droite.\\n\\n<!-- 1/2 -->\\nSeul dans sa ligne.\\n\\nFin.\\n' });
      el.querySelector('[data-preview]').click(); })()`);
    await waitFor(() => ev(`document.querySelectorAll('.rowtest .bq-row').length === 3`), 'aperçu des lignes');
    const r = await ev(`(() => { const rows = [...document.querySelectorAll('.rowtest .bq-row')]; const box = (e) => e.getBoundingClientRect();
      const [a, b] = rows[0].children, [s, t] = rows[1].children, lone = rows[2].children[0], art = box(document.querySelector('.rowtest .bq-content'));
      const out = { ratio: Math.round(box(b).width / box(a).width * 10) / 10, sameTop: Math.abs(box(a).top - box(b).top) < 1, spaceShown: box(s).width > 0,
        tRight: Math.round(art.right - box(t).right), loneFull: Math.round(art.width - box(lone).width), over: document.documentElement.scrollWidth > innerWidth };
      rowEd.destroy(); document.querySelector('.rowtest').remove(); return out; })()`);
    if (width === 1280) ok(r.sameTop && r.ratio >= 1.8 && r.ratio <= 2.2 && r.spaceShown && Math.abs(r.tRight) <= 1 && Math.abs(r.loneFull) <= 1 && !r.over, `1280 px, lignes : ⅓ + ⅔ côte à côte, Espace qui décale, ligne incomplète qui remplit la largeur (${JSON.stringify(r)})`);
    else ok(!r.sameTop && !r.spaceShown && Math.abs(r.loneFull) <= 1 && !r.over, `375 px, lignes : empilées, Espaces cachés, rien ne déborde (${JSON.stringify(r)})`);
  }
  // Dans une ligne, chaque bloc commence en haut de sa colonne : aucune marge propre au type (carrousel, carte, HTML).
  {
    await viewport(1280);
    const gaps = await ev(`(async () => { const el = document.createElement('div'); el.className = 'rowtop'; document.body.append(el);
      const e = Blockquilt.mount(el, { source: '<!-- 1/3 -->\\n![Vert](media/de0000000003)\\n\\n<!-- 1/3 -->\\n:::carousel\\n![Bleu](media/de0000000002)\\n![Vert](media/de0000000003)\\n:::\\n\\n<!-- 1/3 -->\\n:::card\\n### Carte\\nTexte.\\n:::\\n\\n<!-- 1/2 -->\\n:::html\\n<p>HTML</p>\\n:::\\n\\n<!-- 1/2 -->\\nTexte.\\n' });
      el.querySelector('[data-preview]').click();
      for (let i = 0; i < 40 && el.querySelectorAll('.bq-row').length < 2; i++) await new Promise((r) => setTimeout(r, 50));
      const out = [...el.querySelectorAll('.bq-col')].map((c) => Math.round(c.firstElementChild.getBoundingClientRect().top - c.getBoundingClientRect().top));
      e.destroy(); el.remove(); return out; })()`);
    ok(gaps.length === 5 && gaps.every((g) => g === 0), `1280 px, lignes : photo, carrousel, carte, HTML et texte collés au haut de leur colonne (${gaps})`);
  }

  // ---- Lignes composées dans l'éditeur (L3) : blocs l'un sous l'autre, petite grille à côté du type, largeur au menu « ⋯ » ----
  for (const width of [375, 1280]) {
    await viewport(width);
    const r = await ev(`(async () => {
      const el = document.createElement('div'); el.className = 'coltest'; document.body.append(el);
      const e = Blockquilt.mount(el, { source: '<!-- 1/3 -->\\n:::carousel\\n![a](media/de0000000002)\\n![b](media/de0000000003)\\n:::\\n\\n<!-- 2/3 -->\\nTexte.\\n\\n<!-- 1/2 -->\\nSeul.\\n\\nPlein.\\n' });
      const cards = () => [...el.querySelectorAll('[data-id]')];
      const grid = (i) => cards()[i].querySelector('[data-col-grid]');
      const s = { stacked: cards()[1].getBoundingClientRect().top > cards()[0].getBoundingClientRect().bottom,
        labels: cards().map((c, i) => grid(i)?.getAttribute('aria-label') ?? '-'), incomplete: !!grid(2)?.hasAttribute('data-incomplete'),
        fits: cards().every((c) => c.scrollWidth <= c.clientWidth + 1) && document.documentElement.scrollWidth <= innerWidth };
      const pick = (i, w) => { cards()[i].querySelector('[data-menu]').click(); const m = el.querySelector('[data-sheet="menu"]'); s.options ??= [...m.querySelectorAll('[data-col]')].map((x) => x.dataset.col + (x.getAttribute('aria-pressed') === 'true' ? '*' : '')).join(); m.querySelector('[data-col="' + w + '"]').click(); };
      pick(3, '1/2');
      s.afterHalf = e.getMarkdown(); s.complete = !grid(2).hasAttribute('data-incomplete') && !!grid(3);
      pick(0, '');
      s.afterFull = e.getMarkdown(); s.noGrid = !grid(0);
      e.undo(); s.undone = e.getMarkdown().startsWith('<!-- 1/3 -->');
      el.querySelector('[data-insert="end"]').click(); el.querySelector('[data-pick="space"]').click();
      s.space = e.getMarkdown().endsWith('<!-- 1/3 -->\\n');
      cards()[4].querySelector('[data-menu]').click(); const m = el.querySelector('[data-sheet="menu"]');
      s.spaceOptions = [...m.querySelectorAll('[data-col]')].map((x) => x.dataset.col).join(); s.spaceAi = !!m.querySelector('[data-act="ai"]'); m.close();
      e.destroy(); el.remove(); return s; })()`);
    ok(r.stacked && r.labels[0].includes('1/3') && r.labels[0].includes('1re place sur 2') && r.labels[2].includes('incomplète') && r.incomplete && r.labels[3] === '-' && r.fits, `${width} px, lignes dans l’éditeur : blocs l’un sous l’autre, grille à côté du type, ligne incomplète signalée, rien ne déborde (${JSON.stringify(r)})`);
    ok(r.afterHalf.includes('<!-- 1/2 -->\nSeul.\n\n<!-- 1/2 -->\nPlein.') && r.complete && r.options === '*,1/3,1/2,2/3', `${width} px, largeur choisie au menu « ⋯ » : la ligne se complète (${r.options})`);
    ok(r.afterFull.startsWith(':::carousel') && r.noGrid && r.undone, `${width} px, pleine largeur : commentaire retiré, plus de grille ; Ctrl+Z le remet`);
    ok(r.space && r.spaceOptions === '1/3,1/2,2/3' && !r.spaceAi, `${width} px, Espace : ajouté depuis le menu, sans « Pleine largeur » ni IA (${r.spaceOptions})`);
  }

  // ---- Phase 9 : IA ----
  await viewport(375);
  await open();
  const tipIndex = await ev(`[...document.querySelectorAll('[data-bq] [data-id]')].findIndex((c) => c.querySelector('[data-convert]')?.value === 'tip')`);
  const docBefore = await mdNow();
  await ev(`document.querySelectorAll('[data-bq] [data-id]')[${tipIndex}].querySelector('[data-menu]').click()`);
  await ev(`document.querySelector('[data-sheet="menu"] [data-act="ai"]').click()`);
  ok(await ev(`document.querySelector('[data-sheet="ai"]').open && document.querySelector('[data-ai-scope]').textContent.includes('Astuce')`), 'IA sur un bloc : ouverte depuis le menu « ⋯ »');
  await waitFor(() => ev(`!!document.querySelector('[data-ai-use]')`), 'usages de l’application');
  ok(await ev(`[...document.querySelectorAll('[data-ai-uses] button')].map((b) => b.textContent).join() === 'Corriger,Raccourcir,En étapes,En anglais' && !document.querySelector('[data-ai-preset]')`), 'IA : les usages viennent de l’application (GET aiUrl)');
  await ev(`document.querySelector('[data-ai-use="corriger"]').click()`);
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
  ok(await ev(`(() => { const el = document.createElement('div'); document.body.append(el); const e = Blockquilt.mount(el, { source: 'Texte.\\n\\n---\\n', aiUrl: 'api/ai' });
    const has = (i) => { el.querySelectorAll('[data-id]')[i].querySelector('[data-menu]').click(); const m = el.querySelector('[data-sheet="menu"]'); const r = !!m.querySelector('[data-act="ai"]'); m.close(); return r; };
    const r = has(0) && !has(1); e.destroy(); el.remove(); return r; })()`), 'IA sur un bloc : absente du menu d’une ligne horizontale');
  // Demande en cours, feuille fermée puis rouverte sur un autre bloc : l'ancienne réponse n'arrive jamais dans la nouvelle feuille.
  ok(await ev(`(async () => {
    const real = window.fetch;
    window.fetch = (url, init) => (init?.method === 'POST' && String(url).includes('lent') ? new Promise((r) => setTimeout(r, 300)).then(() => real(url, init)) : real(url, init));
    const el = document.createElement('div'); document.body.append(el);
    const e = Blockquilt.mount(el, { source: 'Un.\\n\\nDeux.\\n', aiUrl: 'api/ai?lent' });
    const sheet = el.querySelector('[data-sheet="ai"]');
    const openOn = (i) => { el.querySelectorAll('[data-id]')[i].querySelector('[data-menu]').click(); el.querySelector('[data-sheet="menu"] [data-act="ai"]').click(); };
    openOn(0);
    sheet.querySelector('[data-ai-instruction]').value = 'x';
    sheet.querySelector('[data-ai-run]').click();
    sheet.close();
    openOn(1);
    await new Promise((r) => setTimeout(r, 600));
    const r = { scope: sheet.querySelector('[data-ai-scope]').textContent, result: !sheet.querySelector('[data-ai-result]').hidden, run: !sheet.querySelector('[data-ai-run]').disabled };
    window.fetch = real; e.destroy(); el.remove();
    return !r.result && r.run;
  })()`), 'IA : une demande en cours est annulée à la fermeture de la feuille (pas de réponse périmée sur un autre bloc)');
  const docMid = await mdNow();
  await ev(`document.querySelector('[data-more]').click()`);
  await ev(`document.querySelector('[data-more-act="ai"]').click()`);
  ok(await ev(`document.querySelector('[data-ai-scope]').textContent.includes('document')`), 'IA sur le document : ouverte depuis l’en-tête');
  // Document entier : l'usage « En étapes » de la démo (output: 'document') ; les autres répondent en opérations (A3).
  await waitFor(() => ev(`!!document.querySelector('[data-ai-use="etapes"]')`), 'usage « En étapes »');
  await ev(`document.querySelector('[data-ai-use="etapes"]').click()`);
  await waitFor(() => ev(`!document.querySelector('[data-ai-result]').hidden`), 'réponse de l’IA (document)');
  ok((await mdNow()) === docMid, 'IA sur le document : rien ne change avant « Appliquer »');
  await ev(`document.querySelector('[data-ai-apply]').click()`);
  ok(await ev(`editor.getMarkdown().includes('LA CLÉ EST DANS LA BOÎTE AUX LETTRES.') && editor.getMarkdown().startsWith('---\\ntitle: ')`), 'IA sur le document : remplacé après « Appliquer »');
  await ev(`document.activeElement.blur()`);
  await key('z', 'KeyZ', 90, CTRL);
  ok((await mdNow()) === docMid, 'IA sur le document : restauré par Ctrl+Z');
  // F5 : au-delà de maxChars (20 000 dans la démo), le relais répond 413 ; le message reste dans la feuille.
  await ev(`document.querySelector('[data-more]').click()`);
  await ev(`document.querySelector('[data-more-act="ai"]').click()`);
  await ev(`(() => { document.querySelector('[data-ai-instruction]').value = 'x'.repeat(20001); document.querySelector('[data-ai-run]').click(); })()`);
  await waitFor(() => ev(`!document.querySelector('[data-ai-error]').hidden`), 'message de limite de l’IA');
  await sleep(2500);
  ok(await ev(`(() => { const e = document.querySelector('[data-ai-error]'); return e.offsetParent !== null && e.textContent.startsWith('Texte trop long pour l’IA') && e.textContent.includes('20000 au plus') && document.querySelector('[data-ai-result]').hidden; })()`), 'IA, texte trop long : message clair dans la feuille, encore visible après 2,5 s');
  await ev(`document.querySelector('[data-sheet="ai"]').close()`);
  await ev(`document.querySelector('[data-more]').click()`);
  await ev(`document.querySelector('[data-more-act="ai"]').click()`);
  ok(await ev(`document.querySelector('[data-ai-error]').hidden`), 'IA rouverte : l’ancien message a disparu');
  await ev(`document.querySelector('[data-sheet="ai"]').close()`);
  ok((await mdNow()) === docMid, 'IA refusée : le document n’a pas changé');
  // A3 : IA du document par opérations, dans un éditeur à part au document connu. La démo répond : blocs 1 et 2 en
  // majuscules, un paragraphe après le dernier ; une consigne qui commence par « @@ » est renvoyée telle quelle.
  const opsRun = (instruction, then, source = '---\\ntitle: Essai\\n---\\n\\nPremier bloc.\\n\\nDeuxième bloc.\\n\\nTroisième bloc.\\n') => ev(`(async () => {
    const wait = async (f) => { for (let i = 0; i < 100 && !f(); i++) await new Promise((r) => setTimeout(r, 50)); return f(); };
    const el = document.createElement('div'); document.body.append(el);
    const source = '${source}';
    const e = Blockquilt.mount(el, { source, aiUrl: 'api/ai' });
    const $ = (s) => el.querySelector(s), $$ = (s) => [...el.querySelectorAll(s)];
    $('[data-more]').click(); $('[data-more-act="ai"]').click();
    $('[data-ai-instruction]').value = ${JSON.stringify(instruction)}; $('[data-ai-run]').click();
    await wait(() => !$('[data-ai-ops]').hidden);
    const sheet = $('[data-sheet="ai"]');
    const s = { untouched: e.getMarkdown() === source, whole: $('[data-ai-whole]').hidden, summary: $('[data-ai-ops-summary]').textContent,
      titles: $$('[data-ai-ops-list] label span').map((x) => x.textContent), checked: $$('[data-ai-op]').map((c) => c.checked),
      button: $('[data-ai-ops-apply]').textContent, disabled: $('[data-ai-ops-apply]').disabled,
      del: $('[data-ai-diff] del')?.textContent, ins: $('[data-ai-diff] ins')?.textContent,
      fits: sheet.scrollWidth <= sheet.clientWidth && sheet.getBoundingClientRect().right <= innerWidth };
    ${then}
    if (sheet.open) sheet.close();
    e.destroy(); el.remove();
    return s;
  })()`);
  for (const width of [375, 1280]) {
    await viewport(width);
    const a = await opsRun('Tout en majuscules', `
      $$('[data-ai-op]')[2].click();
      s.button2 = $('[data-ai-ops-apply]').textContent;
      const f = $$('[data-bq] [data-id]')[1].querySelector('[contenteditable="true"]');
      f.textContent = 'Deuxième bloc modifié.'; f.dispatchEvent(new Event('input', { bubbles: true }));
      $('[data-ai-ops-apply]').click();
      s.after = e.getMarkdown(); s.toast = $('[data-toast]').textContent;
      e.undo(); s.undone = e.getMarkdown();`);
    ok(a.untouched && a.whole && a.summary === '3 propositions.' && a.titles.join('|') === 'Remplacer le bloc 1|Remplacer le bloc 2|Ajouter après le bloc 3' && a.checked.every(Boolean) && a.button === 'Appliquer les 3 choisies', `${width} px, IA document : une proposition par opération, toutes cochées, rien de changé avant d’appliquer (${JSON.stringify(a)})`);
    ok(a.del === 'Premier' && a.ins === 'PREMIER' && a.fits, `${width} px, IA document : différences mot à mot (« ${a.del} » → « ${a.ins} »), la feuille tient dans l’écran`);
    ok(a.button2 === 'Appliquer les 2 choisies' && a.after === '---\ntitle: Essai\n---\n\nPREMIER BLOC.\n\nDeuxième bloc modifié.\n\nTroisième bloc.\n', `${width} px, IA document : seules les propositions cochées ; bloc modifié depuis l’envoi → proposition périmée, jamais appliquée (${JSON.stringify(a.after)})`);
    ok(a.toast === '1 proposition appliquée · 1 périmée ignorée' && a.undone === '---\ntitle: Essai\n---\n\nPremier bloc.\n\nDeuxième bloc modifié.\n\nTroisième bloc.\n', `${width} px, IA document : message (${a.toast}), une seule étape annulée par Ctrl+Z`);
  }
  await viewport(375);
  {
    const b = await opsRun('@@ supprimer 3\n@@ avant 1\nAvant tout.\n@@ remplacer 0\n---\ntitle: Nouveau\n---\n@@ après 0\nTout début.\n@@ remplacer 2\nDeuxième bloc.', `
      $('[data-ai-ops-apply]').click(); s.after = e.getMarkdown();`);
    ok(b.summary === '4 propositions · 1 bloc inchangé ignoré.' && b.titles.join('|') === 'Supprimer le bloc 3|Ajouter avant le bloc 1|Remplacer le titre et les réglages (frontmatter)|Ajouter au début du document', 'IA document : supprimer, avant, frontmatter, au début ; un remplacement identique ignoré (' + b.summary + ')');
    ok(b.after === '---\ntitle: Nouveau\n---\n\nTout début.\n\nAvant tout.\n\nPremier bloc.\n\nDeuxième bloc.\n', 'IA document : appliquées à leur place (' + JSON.stringify(b.after) + ')');
    const c = await opsRun('@@ rien', '');
    ok(c.summary === 'Aucune modification proposée.' && c.disabled && c.button === 'Aucune proposition choisie' && c.untouched, 'IA document : « @@ rien » → aucune modification proposée');
    const d = await opsRun('@@ modifier 1\nx', `$('[data-ai-copy]').click(); s.copied = await navigator.clipboard.readText(); s.end = e.getMarkdown() === source;`);
    ok(d.summary.startsWith('La réponse de l’IA n’est pas utilisable (Ligne 1') && d.disabled && d.copied === '@@ modifier 1\nx' && d.end, 'IA document : réponse illisible → rien d’appliqué, texte brut copiable (' + JSON.stringify(d) + ')');
    // Supprimer : le type du bloc et le début de son texte, sans code Markdown.
    const g = await opsRun('@@ supprimer 1\n@@ supprimer 2\n@@ supprimer 3', `s.removed = $$('[data-ai-ops-list] li > p').map((x) => x.textContent);`,
      '## Les clés\\n\\n> [!tip]\\n> Garez-**vous** sur le parking du haut, il est gratuit le soir et le week-end, pensez-y.\\n\\n---\\n');
    ok(g.removed?.join('|') === 'Titre H2 · « Les clés »|Astuce · « Garez-vous sur le parking du haut, il est gratuit le soir et le week-end, pensez… »|Ligne horizontale', 'IA document, supprimer : type du bloc et début du texte, sans code Markdown (' + JSON.stringify(g.removed) + ')');
    const f = await opsRun('@@ après 3\n:::html\n<p>sans fin</p>', '');
    ok(f.checked.join() === 'false' && f.button === 'Aucune proposition choisie', 'IA document : proposition en alerte lint → décochée');
  }
  // I4 : ce qu'on fait de la proposition — au début, à la fin, au-dessus, dessous, ou copier sans rien changer
  const aiRun = async (blockIndex, instruction = 'Tout en majuscules') => {
    if (blockIndex === undefined) { await ev(`document.querySelector('[data-more]').click()`); await ev(`document.querySelector('[data-more-act="ai"]').click()`); }
    else { await ev(`document.querySelectorAll('[data-bq] [data-id]')[${blockIndex}].querySelector('[data-menu]').click()`); await ev(`document.querySelector('[data-sheet="menu"] [data-act="ai"]').click()`); }
    await ev(`document.querySelector('[data-ai-instruction]').value = ${JSON.stringify(instruction)}`);
    // Sur le document : l'usage « En étapes » (document entier) ; sur un bloc : la consigne.
    if (blockIndex === undefined) { await waitFor(() => ev(`!!document.querySelector('[data-ai-use="etapes"]')`), 'usage « En étapes »'); await ev(`document.querySelector('[data-ai-use="etapes"]').click()`); }
    else await ev(`document.querySelector('[data-ai-run]').click()`);
    await waitFor(() => ev(`!document.querySelector('[data-ai-result]').hidden && !document.querySelector('[data-ai-run]').disabled`), 'réponse de l’IA');
  };
  await aiRun();
  ok(await ev(`[...document.querySelectorAll('[data-ai-apply]')].map((b) => b.textContent).join('|') === 'Remplacer le document|Ajouter au début|Ajouter à la fin' && !!document.querySelector('[data-ai-copy]')`), 'IA document : remplacer, au début, à la fin, copier');
  await ev(`document.querySelector('[data-ai-apply="end"]').click()`);
  {
    const now = await mdNow();
    ok(now.startsWith(docMid.trim() + '\n\n') && now.indexOf('NE PAS FUMER') > docMid.length && (now.match(/^title:/gm) || []).length === 1, 'IA document « Ajouter à la fin » : le document gardé, la proposition après, un seul frontmatter');
  }
  await ev(`editor.undo()`);
  await aiRun();
  await ev(`document.querySelector('[data-ai-apply="start"]').click()`);
  ok(await ev(`(() => { const m = editor.getMarkdown(); return m.indexOf('NE PAS FUMER') < m.indexOf('Ne pas fumer') && m.indexOf('NE PAS FUMER') > 0; })()`), 'IA document « Ajouter au début » : la proposition avant le texte');
  await ev(`editor.undo()`);
  ok((await mdNow()) === docMid, 'IA document : au début / à la fin annulés par Ctrl+Z');
  const nBlocks = (await cards()).length;
  const textIndex = (await cards()).findIndex((c) => c.startsWith('text:La clé'));
  await aiRun(textIndex);
  ok(await ev(`[...document.querySelectorAll('[data-ai-apply]')].map((b) => b.textContent).join('|') === 'Remplacer le bloc|Insérer au-dessus|Insérer dessous'`), 'IA bloc : remplacer, au-dessus, dessous');
  await ev(`document.querySelector('[data-ai-apply="end"]').click()`);
  {
    const c = await cards();
    ok(c.length === nBlocks + 1 && c[textIndex] === 'text:La clé est dans la boîte aux lettres.' && c[textIndex + 1] === 'text:LA CLÉ EST DANS LA BOÎTE AUX LETTRES.', 'IA bloc « Insérer dessous » : le bloc gardé, la proposition juste après');
  }
  await ev(`editor.undo()`);
  await aiRun(textIndex);
  await ev(`document.querySelector('[data-ai-apply="start"]').click()`);
  {
    const c = await cards();
    ok(c.length === nBlocks + 1 && c[textIndex] === 'text:LA CLÉ EST DANS LA BOÎTE AUX LETTRES.' && c[textIndex + 1] === 'text:La clé est dans la boîte aux lettres.', 'IA bloc « Insérer au-dessus »');
  }
  await ev(`editor.undo()`);
  await aiRun(textIndex);
  await ev(`document.querySelector('[data-ai-copy]').click()`);
  ok((await mdNow()) === docMid && await ev(`navigator.clipboard.readText().then((t) => t === 'LA CLÉ EST DANS LA BOÎTE AUX LETTRES.\\n')`) && !(await ev(`document.querySelector('[data-sheet="ai"]').open`)), 'IA « Copier, ne rien changer » : proposition au presse-papiers, document intact');
  await aiRun(undefined, 'Réponse avec un bloc non fermé');
  ok(await ev(`!document.querySelector('[data-ai-lint]').hidden && document.querySelector('[data-ai-lint]').textContent.includes('non fermé') && [...document.querySelectorAll('[data-ai-apply]')].every((b) => b.disabled) && !document.querySelector('[data-ai-copy]').disabled`), 'IA : « ::: » non fermé → alerte lint, remplacer / ajouter bloqués, copier possible');
  await ev(`(() => { const c = document.querySelector('[data-ai-force]'); c.click(); })()`);
  ok(await ev(`[...document.querySelectorAll('[data-ai-apply]')].every((b) => !b.disabled)`), 'IA : appliquer seulement après confirmation');
  await ev(`document.querySelector('[data-ai-ignore]').click()`);
  ok((await mdNow()) === docMid, 'IA : « Ignorer » ne change rien');
  ok(await ev(`(async () => {
    const el = document.createElement('div'); document.body.append(el);
    const e = Blockquilt.mount(el, { source: 'Un texte.', aiUrl: 'api/inexistant' });
    el.querySelector('[data-more]').click(); el.querySelector('[data-more-act="ai"]').click();
    await new Promise((r) => setTimeout(r, 300));
    const out = el.querySelectorAll('[data-ai-preset]').length === 4 && !el.querySelector('[data-ai-use]');
    el.querySelector('[data-sheet="ai"]').close(); e.destroy(); el.remove();
    return out;
  })()`), 'IA : sans usages de l’application, les boutons intégrés restent');
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


  // ---- E3 : vue source (à la fin : elle enregistre un autre document) ----
  // Vue source
  for (const width of [1280, 375]) {
    await viewport(width);
    await ev(`localStorage.removeItem('blockquilt.split')`);
    await open();
    const before = await mdNow();
    await ev(`document.querySelector('[data-source-mode]').click()`);
    const src = await ev(`(() => { const t = document.querySelector('[data-source-text]'); return { same: t.value === editor.getMarkdown(), focus: document.activeElement === t, cards: document.querySelectorAll('[data-canvas] [data-id]').length, side: !!document.querySelector('[data-visual]'), ok: document.querySelector('[data-source-lint]').textContent.includes('Aucune alerte') }; })()`);
    ok(src.same && src.focus && src.cards === 0 && src.ok, `${width} px : vue source, le texte Markdown complet, sans alerte`);
    ok(src.side === (width >= 1024), `${width} px : visuel ${width >= 1024 ? 'à côté du texte' : 'absent par défaut'}`);
    if (width < 1024) {
      await ev(`document.querySelector('[data-visual-toggle]').click()`);
      ok(await ev(`!!document.querySelector('[data-visual] article.bq-content') && document.querySelector('[data-source-text]').offsetParent !== null`), '375 px : le bouton « Visuel à côté » ajoute le visuel sous le texte');
    } else ok(await ev(`!!document.querySelector('[data-visual] article.bq-content')`), '1280 px : le visuel montre le document rendu');
    await ev(`(() => { const t = document.querySelector('[data-source-text]'); t.value = t.value + '\\n> [!astuce]\\n> Encadré inconnu\\n\\n## Ajouté à la main\\n'; t.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
    await waitFor(() => ev(`document.querySelector('[data-source-lint]').textContent.includes('encadré inconnu')`), 'alerte lint en direct');
    ok(await ev(`document.querySelector('[data-visual]').textContent.includes('Ajouté à la main')`), `${width} px : alerte lint et visuel mis à jour en direct`);
    // Le texte saisi survit au bouton « Visuel à côté » (la zone est redessinée), dans les deux sens.
    const kept = [];
    for (let i = 0; i < 2; i++) {
      await ev(`document.querySelector('[data-visual-toggle]').click()`);
      kept.push(await ev(`document.querySelector('[data-source-text]').value.includes('## Ajouté à la main')`));
    }
    ok(kept.every(Boolean), `${width} px : vue source, le texte saisi reste après « Visuel à côté » (${kept})`);
    await ev(`document.querySelector('[data-source-line]').click()`);
    ok(await ev(`(() => { const t = document.querySelector('[data-source-text]'); return document.activeElement === t && t.value.slice(t.selectionStart, t.selectionEnd) === '> [!astuce]'; })()`), `${width} px : un clic sur l’alerte sélectionne la ligne`);
    await ev(`document.querySelector('[data-source-mode]').click()`);
    ok(await ev(`[...document.querySelectorAll('[data-canvas] [data-id] [data-body]')].some((b) => b.textContent === 'Ajouté à la main') && editor.getMarkdown().includes('## Ajouté à la main')`), `${width} px : retour en édition, le texte est relu en blocs`);
    await ev(`document.activeElement.blur()`);
    await key('z', 'KeyZ', 90, CTRL);
    ok((await mdNow()) === before, `${width} px : Ctrl+Z annule toute la modification faite en vue source, en une fois`);
  }
  // F4b : un bouton « Visuel à côté » (1 ou 2 panneaux), commun aux modes blocs et source, défaut selon la largeur, gardé après rechargement
  const splitState = () => ev(`(() => { const vis = document.querySelector('[data-visual]'); const pane = document.querySelector('[data-panes] > :first-child'); const r = vis?.getBoundingClientRect(); const p = pane?.getBoundingClientRect(); return { pressed: document.querySelector('[data-visual-toggle]').getAttribute('aria-pressed'), disabled: document.querySelector('[data-visual-toggle]').disabled, visual: !!vis && vis.offsetParent !== null, beside: !!vis && r.left >= p.right - 1, below: !!vis && r.top >= p.bottom - 1, overflow: document.documentElement.scrollWidth > innerWidth, stored: localStorage.getItem('blockquilt.split') }; })()`);
  for (const [width, def] of [[1280, true], [375, false]]) {
    await viewport(width);
    await ev(`localStorage.removeItem('blockquilt.split')`);
    await open();
    const d = await splitState();
    ok(d.pressed === String(def) && d.visual === def && d.beside === (def && width >= 1024) && !d.overflow, `${width} px : blocs, défaut ${def ? '2 panneaux' : '1 panneau'} (${JSON.stringify(d)})`);
    await ev(`document.querySelector('[data-visual-toggle]').click()`);
    const t = await splitState();
    ok(t.pressed === String(!def) && t.visual === !def && t.stored === String(!def) && !t.overflow, `${width} px : le bouton « Visuel à côté » bascule en blocs et garde le choix (${JSON.stringify(t)})`);
    if (!def) ok(t.below && !t.beside, '375 px : 2 panneaux empilés, visuel sous les blocs');
    await ev(`document.querySelector('[data-source-mode]').click()`);
    const s = await splitState();
    ok(s.visual === !def && s.pressed === String(!def) && !s.overflow, `${width} px : le même choix vaut en vue source`);
    await open();
    await ev(`document.querySelector('[data-source-mode]').click()`);
    ok((await splitState()).visual === !def, `${width} px : choix gardé après rechargement`);
    await ev(`document.querySelector('[data-source-mode]').click()`);
    if (def) await ev(`document.querySelector('[data-visual-toggle]').click()`);
    await ev(`(() => { const b = document.querySelector('[data-canvas] [data-id] [data-body]'); b.textContent += ' Zebulon'; b.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
    await waitFor(() => ev(`document.querySelector('[data-visual]').textContent.includes('Zebulon')`), 'visuel mis à jour après frappe');
    ok(true, `${width} px : le visuel suit une frappe dans un bloc`);
    await ev(`document.querySelector('[data-preview]').click()`);
    const pv = await splitState();
    ok(pv.disabled && !pv.visual && !pv.overflow, `${width} px : bouton désactivé en Aperçu`);
    await ev(`document.querySelector('[data-preview]').click()`);
  }
  await ev(`localStorage.removeItem('blockquilt.split')`);
  await ev(`(() => { document.querySelector('[data-source-mode]').click(); const t = document.querySelector('[data-source-text]'); t.value = 'Enregistré depuis la vue source\\n'; t.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
  await key('s', 'KeyS', 83, CTRL);
  await saved((x) => x === 'Enregistré depuis la vue source\n', 'Ctrl+S en vue source');
  ok(true, 'vue source : Ctrl+S enregistre le texte tel quel');
  await viewport(1280);
  await ev(`document.querySelector('[data-full]').click()`);
  ok(await ev(`document.querySelector('[data-source-text]').getBoundingClientRect().height >= innerHeight - 170`), 'vue source en plein écran : la zone de texte prend toute la hauteur');
  await ev(`document.querySelector('[data-editor-full]').close()`);
  await sleep(100);
  await ev(`document.querySelector('[data-source-mode]').click()`);
  await viewport(375);

  // ---- Application de référence (/app) : l'éditeur enregistre par PUT + If-Match ; une écriture d'ailleurs n'est jamais écrasée ----
  await send('Page.navigate', { url: BASE + '/app?login=demo-user1' });
  await waitFor(() => ev(`location.pathname === '/app' && document.readyState === 'complete' && document.querySelectorAll('[data-bq] [data-id]').length > 0`), 'application de démo');
  ok(await ev(`document.querySelector('[data-app]').textContent.includes('user1') && document.querySelector('[data-bq] [data-body]').textContent === 'Arrivée'`), 'app : user1 connecté, guide 1A ouvert dans l’éditeur');
  const guide = path.join(data, 'contents', 'guide-1a.md');
  await ev(`(() => { const b = document.querySelector('[data-bq] [data-body]'); b.textContent = 'Arrivée au gîte'; b.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
  await key('s', 'KeyS', 83, CTRL);
  await waitFor(async () => fs.readFileSync(guide, 'utf8').includes('# Arrivée au gîte'), 'enregistrement du guide');
  ok(JSON.parse(fs.readFileSync(path.join(data, 'contents', 'guide-1a.json'), 'utf8')).by === 'user1', 'app : Ctrl+S enregistre le guide par PUT, auteur user1');
  // Une IA écrit entre-temps (jeton de user1, via Claude) : l'enregistrement suivant de l'éditeur est refusé.
  const cur = await (await fetch(BASE + '/contents/guide-1a', { headers: { Authorization: 'Bearer demo-user1', Accept: 'text/markdown' } }));
  const curMd = await cur.text();
  const ext = await fetch(BASE + '/contents/guide-1a', { method: 'PUT', headers: { Authorization: 'Bearer demo-user1', 'If-Match': cur.headers.get('etag'), 'X-Via': 'Claude', 'Content-Type': 'text/markdown' }, body: curMd + '\nÉcrit par l’IA.\n' });
  ok(ext.status === 204, 'app : une IA écrit le guide avec l’ETag qu’elle a lu');
  await ev(`(() => { const b = document.querySelector('[data-bq] [data-body]'); b.textContent = 'Arrivée (éditeur)'; b.dispatchEvent(new InputEvent('input', { bubbles: true })); })()`);
  await key('s', 'KeyS', 83, CTRL);
  await waitFor(() => ev(`document.querySelector('[data-sheet="remote"]').open`), 'feuille du conflit');
  const kept = fs.readFileSync(guide, 'utf8');
  ok(kept.includes('Écrit par l’IA.') && !kept.includes('Arrivée (éditeur)') && await ev(`editor.getMarkdown().includes('Arrivée (éditeur)')`), 'app : conflit (412) — le texte de l’IA n’est pas écrasé, celui de l’éditeur reste à l’écran');
  const diff = await ev(`(() => { const s = document.querySelector('[data-sheet="remote"]'); return { who: s.querySelector('[data-remote-who]').textContent, ops: [...s.querySelectorAll('[data-remote-diff] [data-op]')].map((d) => d.dataset.op + d.textContent.slice(2)) }; })()`);
  ok(diff.who.startsWith('Modifié par user1 (via Claude) à l’instant') && diff.ops.includes('-# Arrivée (éditeur)') && diff.ops.includes('+# Arrivée au gîte') && diff.ops.includes('+Écrit par l’IA.'), `app : conflit — qui, quand, et les lignes qui changent (${JSON.stringify(diff)})`);
  await ev(`document.querySelector('[data-remote-take]').click()`);
  ok(await ev(`editor.getMarkdown()`) === fs.readFileSync(guide, 'utf8') && await ev(`document.querySelector('[data-save] [data-dot]').hidden`), 'app : « Prendre l’autre version » — l’écran égale le serveur, rien à enregistrer');
  await ev(`editor.undo()`);
  ok(await ev(`editor.getMarkdown().includes('Arrivée (éditeur)')`), 'app : Ctrl+Z rend votre version');
  // Une autre écriture d'ailleurs, vue par la revérification : bandeau, puis « Garder la mienne ».
  const put2 = async (md) => { const g = await fetch(BASE + '/contents/guide-1a', { headers: { Authorization: 'Bearer demo-user1', Accept: 'text/markdown' } }); return fetch(BASE + '/contents/guide-1a', { method: 'PUT', headers: { Authorization: 'Bearer demo-user1', 'If-Match': g.headers.get('etag'), 'X-Via': 'Claude', 'Content-Type': 'text/markdown' }, body: md((await g.text())) }); };
  await put2((t) => t + '\nEncore l’IA.\n');
  ok(await ev(`editor.checkRemote()`) && await ev(`!document.querySelector('[data-remote-bar]').hidden && document.querySelector('[data-remote-text]').textContent.startsWith('Modifié par user1 (via Claude)')`), 'app : revérification — bandeau « Modifié par … », rien ne change à l’écran');
  ok(await ev(`editor.getMarkdown().includes('Arrivée (éditeur)') && !editor.getMarkdown().includes('Encore')`), 'app : votre texte reste tant que vous n’avez pas choisi');
  await ev(`document.querySelector('[data-remote-show]').click()`);
  await ev(`document.querySelector('[data-remote-later]').click()`);
  ok(await ev(`!document.querySelector('[data-sheet="remote"]').open && !document.querySelector('[data-remote-bar]').hidden`), 'app : « Plus tard » garde le bandeau');
  await ev(`document.querySelector('[data-remote-show]').click()`);
  await ev(`document.querySelector('[data-remote-keep]').click()`);
  await waitFor(async () => fs.readFileSync(guide, 'utf8').includes('Arrivée (éditeur)'), 'garder la mienne');
  await waitFor(() => ev(`!document.querySelector('[data-sheet="remote"]').open`), 'réponse après « Garder la mienne »').catch(() => {});
  ok(!fs.readFileSync(guide, 'utf8').includes('Encore') && await ev(`document.querySelector('[data-remote-bar]').hidden && document.querySelector('[data-save] [data-dot]').hidden`), 'app : « Garder la mienne » — votre version remplace l’autre, en connaissance de cause');
  ok(!(await ev(`editor.checkRemote()`)), 'app : revérification sans changement : rien (304)');
  // Sans `source` : l'éditeur lit lui-même le texte et sa version.
  ok(await ev(`(async () => {
    const el = document.createElement('div'); document.body.append(el);
    const e = Blockquilt.mount(el, { contentUrl: 'contents/guide-1b', pollSeconds: 0 });
    for (let i = 0; i < 40 && !e.version; i++) await new Promise((r) => setTimeout(r, 50));
    const out = e.getMarkdown().startsWith('---\\ntitle: Guide 1B') && /^"[0-9a-f]{8}"$/.test(e.version) && el.querySelector('[data-save] [data-dot]').hidden;
    e.destroy(); el.remove();
    return out;
  })()`), 'contentUrl sans source : texte et version lus par l’éditeur');
  ws.close();
} catch (error) {
  ok(false, error.message);
} finally {
  await stop();
  fs.rmSync(data, { recursive: true, force: true, maxRetries: 10 });
}
process.exit(failed ? 1 : 0);
