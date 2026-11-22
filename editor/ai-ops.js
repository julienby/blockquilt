// IA du document par opérations (PLAN §4c). L'éditeur envoie ses blocs numérotés (champ `blocks`, 0 = frontmatter)
// et note l'identifiant et le texte de chacun. La réponse « @@ remplacer | avant | après | supprimer n » (Blocks.parseOps)
// devient une liste de propositions à cocher. Une proposition dont le bloc a changé depuis l'envoi est périmée :
// jamais appliquée. « Appliquer » fait une seule étape annulable.
import { esc } from './shared.js';

const plural = (k, one, many) => `${k} ${k > 1 ? many : one}`;
const VERB = { replace: 'Remplacer', remove: 'Supprimer', before: 'Ajouter avant', after: 'Ajouter après' };
const BOX = 'mt-1 whitespace-pre-wrap break-words rounded-lg p-2 text-sm';

export function installAiOps(ed, sheet) {
  const { o, $ } = ed;
  let sent = null; // le document tel qu'envoyé : { head, blocks: [{ id, md }], range: [premier, dernier] ou null }
  let items = []; // propositions affichées : [{ op, alerts }]

  const head = () => Blocks.serialize(ed.docMeta(), []).trim();
  const target = (n) => (n === 0 ? sent.head : sent.blocks[n - 1].md);
  // Remplacement sans ligne de largeur : le bloc garde la sienne (Blocks.keepWidth) ; on compare donc sans elle.
  const before = (op) => (op.n > 0 && !Blocks.WIDTH.test(op.markdown.split('\n')[0]) ? target(op.n).replace(/^<!-- [^\n]* -->\n/, '') : target(op.n));

  /** Les champs `blocks` et, pour des blocs désignés (`ids`, les blocs collés), `range` (« 4-8 ») ; garde de quoi retrouver chaque bloc. */
  ed.aiSnapshot = (ids = null) => {
    ed.syncFromDom();
    const blocks = ed.blocks.map((b) => ({ id: b.id, md: Blocks.toMarkdown(b) })).filter((b) => b.md.trim() !== '');
    const nums = ids ? blocks.flatMap((b, i) => (ids.includes(b.id) ? [i + 1] : [])) : [];
    sent = { head: head(), blocks, range: nums.length ? [nums[0], nums.at(-1)] : null };
    return { blocks: JSON.stringify([sent.head, ...blocks.map((b) => b.md)]), ...(sent.range ? { range: sent.range.join('-') } : {}) };
  };
  const outside = ({ op }) => !!sent.range && (op.n < sent.range[0] || op.n > sent.range[1]);

  const stale = ({ op }) => {
    if (op.n === 0) return op.mode === 'replace' && head() !== sent.head;
    const was = sent.blocks[op.n - 1];
    const now = ed.blocks.find((b) => b.id === was.id);
    return !now || Blocks.toMarkdown(now) !== was.md;
  };

  const alertsOf = (op) => {
    if (op.mode === 'remove') return [];
    if (op.n > 0 || op.mode === 'after') return Blocks.lint(op.markdown);
    const fm = Blocks.frontmatter(op.markdown + '\n');
    const ok = !fm.error && Object.keys(fm.meta).length && !fm.body.join('').trim();
    return ok ? [] : [{ line: 1, message: 'Frontmatter attendu : des lignes « clé: valeur » entre deux lignes ---' }];
  };

  const title = ({ mode, n }) => (n > 0 ? `${VERB[mode]} le bloc ${n}`
    : mode === 'replace' ? 'Remplacer le titre et les réglages (frontmatter)' : 'Ajouter au début du document');

  // Bloc à supprimer : son type et le début de son texte rendu (le code Markdown seul ressemblerait à une erreur).
  const named = (md) => {
    const label = Blocks.def(Blocks.parse(md).blocks[0]?.type).label;
    const box = document.createElement('div');
    box.innerHTML = Blocks.toHtml(md, { media: o.media, title: false });
    const text = box.textContent.replace(/\s+/g, ' ').trim();
    return text ? `${label} · « ${text.length > 80 ? text.slice(0, 80) + '…' : text} »` : label;
  };

  // Remplacer : différences mot à mot dans le Markdown ; supprimer : le bloc barré ; ajouter : le rendu du texte ajouté.
  const body = (op) => {
    if (op.mode === 'remove') return `<p class="${BOX} bg-red-50 text-red-900">${esc(named(target(op.n)))}</p>`;
    if (op.mode === 'replace') {
      const parts = Blocks.diffWords(before(op), op.markdown).map((p) => (p.op === ' ' ? esc(p.text)
        : p.op === '-' ? `<del class="bg-red-50 text-red-900 decoration-red-300">${esc(p.text)}</del>`
          : `<ins class="bg-emerald-50 text-emerald-900 no-underline">${esc(p.text)}</ins>`));
      return `<p data-ai-diff class="${BOX} bg-stone-50">${parts.join('')}</p>`;
    }
    return `<div class="bq-content mt-1 rounded-lg border border-amber-200 bg-white p-2 text-sm">${Blocks.toHtml(op.markdown, { media: o.media, title: false })}</div>`;
  };

  const checked = () => items.filter((_, i) => sheet.querySelector(`[data-ai-op="${i}"]`).checked);
  const update = () => {
    const k = checked().length;
    const button = $('[data-ai-ops-apply]', sheet);
    button.disabled = !k;
    button.textContent = !k ? 'Aucune proposition choisie' : k === 1 ? 'Appliquer la proposition choisie' : `Appliquer les ${k} choisies`;
  };

  /** Réponse en opérations → liste de propositions dans la feuille (ou message si la réponse est inutilisable). */
  ed.aiShowOps = (text) => {
    const parsed = Blocks.parseOps(text, sent.blocks.length);
    const summary = $('[data-ai-ops-summary]', sheet);
    items = [];
    let unchanged = 0;
    for (const op of parsed.ops || []) {
      // Un modèle recopie parfois un bloc sans rien changer : ce n'est pas une proposition.
      if (op.mode === 'replace' && op.markdown === Blocks.fragment(before(op))) unchanged++;
      else items.push({ op, alerts: alertsOf(op) });
    }
    if (parsed.error) summary.textContent = `La réponse de l’IA n’est pas utilisable (${parsed.error}). Vous pouvez la copier.`;
    else summary.textContent = (items.length ? plural(items.length, 'proposition', 'propositions') : 'Aucune modification proposée')
      + (unchanged ? ` · ${plural(unchanged, 'bloc inchangé ignoré', 'blocs inchangés ignorés')}` : '') + '.';
    $('[data-ai-ops-list]', sheet).innerHTML = items.map((it, i) => {
      const out = outside(it);
      const old = !out && stale(it);
      const on = !out && !old && !it.alerts.length;
      return `<li class="rounded-xl border border-stone-200 p-2">
        <label class="flex min-h-11 items-center gap-2 text-sm font-semibold"><input type="checkbox" data-ai-op="${i}" class="size-5 shrink-0"${on ? ' checked' : ''}${out || old ? ' disabled' : ''}>
          <span>${esc(title(it.op))}${out ? ' — hors des blocs collés' : old ? ' — périmée : le bloc a changé depuis l’envoi' : ''}</span></label>
        ${body(it.op)}
        ${it.alerts.length ? `<ul role="alert" class="mt-1 space-y-1 text-xs text-red-800">${it.alerts.map((a) => `<li>Ligne ${a.line} : ${esc(a.message)}</li>`).join('')}</ul>` : ''}</li>`;
    }).join('');
    update();
  };

  // Chaque proposition vise son bloc par identifiant : les autres blocs peuvent avoir bougé.
  const apply = () => {
    ed.syncFromDom();
    const wanted = checked();
    const chosen = wanted.filter((it) => !stale(it));
    const fresh = (md) => Blocks.parse(md).blocks.map((b) => ({ id: ed.newId(), ...b }));
    if (chosen.length) ed.change(() => {
      const start = [];
      const at = new Map(); // identifiant du bloc visé → { before, with, after } ; with : null = bloc gardé
      for (const { op } of chosen) {
        if (op.n === 0) {
          if (op.mode === 'replace') ed.setMeta(Blocks.frontmatter(op.markdown + '\n').meta);
          else start.push(...fresh(op.markdown));
          continue;
        }
        const id = sent.blocks[op.n - 1].id;
        if (!at.has(id)) at.set(id, { before: [], with: null, after: [] });
        const g = at.get(id);
        if (op.mode === 'before') g.before.push(...fresh(op.markdown));
        else if (op.mode === 'after') g.after.push(...fresh(op.markdown));
        else g.with = op.mode === 'remove' ? [] : Blocks.keepWidth(ed.blocks.find((b) => b.id === id), Blocks.parse(op.markdown).blocks).map((b) => ({ id: ed.newId(), ...b }));
      }
      ed.blocks = [...start, ...ed.blocks.flatMap((b) => {
        const g = at.get(b.id);
        return g ? [...g.before, ...(g.with ?? [b]), ...g.after] : [b];
      })];
      if (!ed.blocks.length) ed.blocks = [{ id: ed.newId(), ...Blocks.blank('text') }];
    });
    const skipped = wanted.length - chosen.length;
    ed.toast((chosen.length ? plural(chosen.length, 'proposition appliquée', 'propositions appliquées') : 'Rien appliqué')
      + (skipped ? ` · ${plural(skipped, 'périmée ignorée', 'périmées ignorées')}` : ''));
  };

  ed.on(sheet, 'change', (e) => { if (e.target.matches('[data-ai-op]')) update(); });
  ed.on(sheet, 'click', (e) => { if (e.target.closest('[data-ai-ops-apply]')) { sheet.close(); apply(); } });
}
