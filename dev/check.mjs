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
  ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending[m.id]) { pending[m.id](m); delete pending[m.id]; } });
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
  ok(await ev(`[...document.querySelectorAll('[data-bar] button')].every((b) => { const r = b.getBoundingClientRect(); return r.width >= 44 && r.height >= 44; })`), 'barre de mise en forme : boutons de 44 px');
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
    const small = [...document.querySelectorAll('[data-bq] button, [data-bq] a')].filter((b) => b.offsetParent && !b.closest('dialog'))
      .filter((b) => { const r = b.getBoundingClientRect(); return r.width < 44 || r.height < 44; }).map((b) => b.getAttribute('aria-label') || b.textContent.trim());
    return { scroll: document.documentElement.scrollWidth <= innerWidth, head: document.querySelector('[data-head]').getBoundingClientRect().height, top: tr.top - cr.top, bottom: cr.bottom - tr.bottom, small };
  })()`);
  for (const width of [375, 1280]) {
    await viewport(width);
    await open();
    const l = await layout();
    ok(l.scroll, `${width} px : aucune barre de défilement horizontale`);
    ok(l.head <= 64, `${width} px : en-tête sur une ligne (${l.head} px)`);
    ok(l.bottom <= l.top + 4, `${width} px : carte H2 sans vide en bas (haut ${l.top}, bas ${l.bottom})`);
    if (width === 375) ok(l.small.length === 0, `375 px : chaque bouton mesure au moins 44 × 44 px ${l.small.join(', ')}`);
    await ev(`document.querySelector('[data-insert="end"]').click()`);
    ok(await ev(`(() => { const d = document.querySelector('[data-sheet="add"]'); const n = d.querySelector('.grid').children.length; const cols = getComputedStyle(d.querySelector('.grid')).gridTemplateColumns.split(' ').length; d.close(); return n > 0 && cols === ${width < 640 ? 2 : 3}; })()`), `${width} px : menu d’ajout en ${width < 640 ? 2 : 3} colonnes`);
  }
  await viewport(375);

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
    await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: k, code, windowsVirtualKeyCode: vk, modifiers });
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
  ok(await ev(`['copy', 'cut', 'paste', 'full', 'delete', 'up', 'down', 'duplicate'].every((a) => document.querySelector('[data-sheet="menu"] [data-act="' + a + '"]'))`), 'menu du bloc : monter, descendre, dupliquer, copier, couper, coller, plein écran, supprimer');
  await ev(`document.querySelector('[data-sheet="menu"] [data-act="delete"]').click()`);
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
  await ev(`(() => { const t = document.querySelector('[data-title]'); t.textContent = 'Titre Ctrl S'; t.dispatchEvent(new InputEvent('input', { bubbles: true })); document.activeElement.blur(); })()`);
  await key('s', 'KeyS', 83, CTRL);
  md = await saved((x) => x.includes('title: Titre Ctrl S'), 'Ctrl+S');
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
    await ev(`(() => { const c = [...document.querySelectorAll('[data-bq] [data-id]')].find((x) => x.querySelector('[data-convert]')?.value === 'text'); c.querySelector('[data-menu]').click(); document.querySelector('[data-sheet="menu"] [data-act="full"]').click(); })()`);
    const bf = await ev(`(() => { const d = document.querySelector('[data-block-full]'); const r = d.getBoundingClientRect(); const f = d.querySelector('[data-rich]'); f.focus(); getSelection().selectAllChildren(f); getSelection().collapseToEnd(); document.execCommand('insertText', false, ' Plein${width}'); return { open: d.open, w: r.width, h: r.height, W: innerWidth, H: innerHeight }; })()`);
    ok(bf.open && bf.w === bf.W && bf.h === bf.H, `${width} px : bloc en plein écran, exactement ${bf.W} × ${bf.H} (${bf.w} × ${bf.h})`);
    await key('Escape', 'Escape', 27);
    ok(await ev(`!document.querySelector('[data-block-full]').open && editor.getMarkdown().includes(' Plein${width}')`), `${width} px : Échap ferme, le texte tapé est dans le document`);
  }
  await viewport(375);

  ws.close();
} catch (error) {
  ok(false, error.message);
} finally {
  await stop();
  fs.rmSync(data, { recursive: true, force: true, maxRetries: 10 });
}
process.exit(failed ? 1 : 0);
