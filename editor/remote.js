// Contenu d'une application (`contentUrl`, contrat HTTP du README « Contenus d'une application ») : versions et conflits.
// L'éditeur lit le texte et sa version (ETag), enregistre par PUT avec If-Match, et ne remplace jamais une version écrite
// ailleurs (par une IA, un autre onglet…) : il montre les différences et laisse choisir. Il revérifie de temps en temps
// (`pollSeconds`, 30 par défaut, 0 = jamais) et quand la page redevient visible.
import { esc, ago } from './shared.js';

export function installRemote(ed) {
  const { o, $ } = ed;
  ed.version = o.version || null;
  ed.checkRemote = async () => false;
  const sheet = ed.sheets.remote;
  if (!o.contentUrl || !sheet) return;
  const bar = $('[data-remote-bar]');
  let remote = null; // { markdown, version, by, at } : la version d'ailleurs, en attente d'un choix

  const get = async (headers = {}) => {
    const r = await fetch(o.contentUrl, { headers: { Accept: 'text/markdown', ...headers }, signal: ed.ac.signal, cache: 'no-store' });
    if (r.status === 304) return null;
    if (!r.ok) throw new Error((await r.text()).trim() || 'Lecture impossible');
    const by = r.headers.get('X-Updated-By');
    return { markdown: (await r.text()).replace(/\r\n/g, '\n'), version: r.headers.get('ETag'), by: by ? decodeURIComponent(by) : '', at: Date.parse(r.headers.get('Last-Modified')) };
  };
  const put = (text, version) => fetch(o.contentUrl, { method: 'PUT', headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'If-Match': version || '*' }, body: text, signal: ed.ac.signal });

  const who = (r) => `Modifié ${r.by ? `par ${r.by} ` : ''}${ago(r.at)}`.trim();
  // Feuille : qui, quand, les lignes qui changent (votre texte → l'autre version), puis le choix.
  const show = () => {
    bar.hidden = true;
    $('[data-remote-who]', sheet).textContent = who(remote) + '.';
    const lines = Blocks.diffLines(ed.markdown(), remote.markdown);
    const near = lines.map((l, i) => lines.slice(Math.max(0, i - 2), i + 3).some((x) => x.op !== ' '));
    let gap = false;
    $('[data-remote-diff]', sheet).innerHTML = lines.map((l, i) => {
      if (!near[i]) { const out = gap ? '' : '<div class="px-3 text-stone-400">…</div>'; gap = true; return out; }
      gap = false;
      const cls = l.op === '+' ? 'bg-emerald-50 text-emerald-900' : l.op === '-' ? 'bg-red-50 text-red-900 line-through decoration-red-300' : 'text-stone-500';
      return `<div data-op="${l.op === ' ' ? '=' : l.op}" class="${cls} whitespace-pre-wrap break-words px-3"><span aria-hidden="true" class="select-none opacity-60">${l.op === ' ' ? ' ' : l.op} </span>${esc(l.text) || ' '}</div>`;
    }).join('');
    $('[data-remote-keep]', sheet).hidden = ed.markdown() === remote.markdown;
    ed.openSheet('remote');
  };
  // Une autre version est arrivée : rien ne change à l'écran sans votre accord.
  const arrived = (r) => {
    if (r.markdown === ed.markdown()) { ed.version = r.version; return false; }
    remote = r;
    $('[data-remote-text]', bar).textContent = who(r);
    bar.hidden = false;
    return true;
  };

  /** Revérifier : la version a-t-elle changé ailleurs ? (304 si non : rien ne transite). */
  ed.checkRemote = async () => {
    if (!ed.version || sheet.open) return false;
    try {
      const r = await get({ 'If-None-Match': ed.version });
      return r && r.version !== ed.version ? arrived(r) : false;
    } catch { return false; }
  };

  /** Enregistrer : PUT avec la version lue. 412 : quelqu'un a écrit entre-temps → les différences et le choix. */
  ed.putContent = async (text) => {
    // Version inconnue (texte de départ différent de celui du serveur) : rien n'est écrit avant un choix.
    if (!ed.version) {
      remote = await get();
      if (remote.markdown !== text) { show(); throw new Error('Le texte a changé ailleurs : choisir la version à garder'); }
      ed.version = remote.version;
      remote = null;
      return;
    }
    const r = await put(text, ed.version);
    if (r.status === 412) {
      remote = await get();
      show();
      throw new Error('Modifié ailleurs entre-temps : choisir la version à garder');
    }
    if (!r.ok) throw new Error((await r.text()).trim() || 'Enregistrement impossible');
    ed.version = r.headers.get('ETag');
    bar.hidden = true;
  };

  ed.on(sheet, 'click', async (e) => {
    if (!remote) return;
    if (e.target.closest('[data-remote-take]')) {
      // Prendre l'autre version : une étape annulable ; l'écran correspond alors au serveur.
      const r = remote;
      remote = null;
      sheet.close();
      if (ed.mode === 'source') ed.setMode('edit');
      ed.change(() => ed.setDoc(Blocks.parse(r.markdown)));
      ed.version = r.version;
      ed.setDirty(false);
      ed.toast('Version de l’autre côté chargée');
    } else if (e.target.closest('[data-remote-keep]')) {
      // Garder la mienne : elle remplace l'autre, en connaissance de cause (If-Match = la version qu'on vient de voir).
      const r = remote;
      const text = ed.markdown();
      const w = await put(text, r.version);
      if (w.status === 412) { remote = await get(); return show(); }
      if (!w.ok) return ed.toast((await w.text()).trim() || 'Enregistrement impossible');
      remote = null;
      sheet.close();
      ed.version = w.headers.get('ETag');
      if (ed.markdown() === text) ed.setDirty(false);
      ed.toast('Votre version est enregistrée');
    } else if (e.target.closest('[data-remote-later]')) {
      sheet.close();
      bar.hidden = false; // le bandeau reste : le choix est à faire avant d'enregistrer
    }
  });
  ed.on(bar, 'click', (e) => { if (e.target.closest('[data-remote-show]') && remote) show(); });

  // Version de départ : donnée par l'application (`version`), sinon lue ; sans `source`, le texte aussi.
  if (!ed.version) {
    get().then((r) => {
      if (!o.source) { ed.load(r.markdown); ed.version = r.version; ed.setDirty(false, { loaded: true }); ed.resetHistory(); ed.offerDraft(); }
      else arrived(r); // même texte : sa version est adoptée ; sinon le bandeau, et pas d'enregistrement avant un choix
    }).catch((error) => { if (error.name !== 'AbortError') ed.toast(error.message); });
  }
  const every = o.pollSeconds ?? 30;
  if (every > 0) {
    const tick = () => ed.later(() => { if (document.visibilityState === 'visible') ed.checkRemote(); tick(); }, every * 1000);
    tick();
  }
  ed.on(document, 'visibilitychange', () => { if (document.visibilityState === 'visible') ed.checkRemote(); });
}
