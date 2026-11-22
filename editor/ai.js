// Assistant IA : `aiUrl` désigne le service ; l'éditeur n'appelle aucun modèle lui-même et ne contient aucune clé.
// GET aiUrl → { uses: [{ id, label, scopes }] } : les usages de l'application (modèle et consigne restent chez elle) ;
// sans réponse, les boutons intégrés (consignes écrites). Envoi (POST) : scope (document | block), use, instruction,
// text (document), block (Markdown du bloc), blocks (document hors vue source : blocs numérotés, voir ai-ops.js),
// range (blocs collés : « 4-8 », numéros de `blocks` ; l'IA ne modifie qu'eux).
// Réponse : { operations } (propositions une à une, ai-ops.js) ou { markdown }. Relais prêt à monter : ai/blockquilt-ai.js.
// { markdown } passe par Blocks.lint et s'affiche à côté de l'actuel ; puis, au choix (toujours annulable) :
// document : remplacer, ajouter au début, à la fin ; bloc : remplacer, insérer au-dessus, dessous ; ou copier sans rien changer.
import { esc, shared, request } from './shared.js';
import { installAiOps } from './ai-ops.js';

export function installAi(ed) {
  const { o, $ } = ed;
  const sheet = ed.sheets.ai;
  ed.openAi = () => {};
  ed.offerPasted = () => {};
  ed.refreshPasted = () => {};
  if (!sheet) return; // sans aiUrl, aucun bouton IA
  installAiOps(ed, sheet);
  let ai = null; // { id, markdown }
  // Demande en cours : annulée quand la feuille se ferme, pour qu'une réponse n'arrive jamais dans une autre ouverture.
  let pending = null;
  ed.on(sheet, 'close', () => pending?.abort());
  const useCls = 'min-h-11 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-950 hover:bg-amber-100';
  let uses = null; // promesse : usages de l'application, ou null (boutons intégrés)
  const loadUses = () => (uses ??= fetch(o.aiUrl, { headers: { Accept: 'application/json' }, signal: ed.ac.signal })
    .then((r) => (r.ok ? r.json() : null)).then((j) => (Array.isArray(j?.uses) && j.uses.length ? j.uses : null)).catch(() => null));

  // Blocs collés : offerts juste après le collage (bandeau). Le bandeau part dès qu'ils ne se suivent plus tels quels
  // (Annuler redonne des identifiants, bloc remplacé ou déplacé) ou hors de la vue blocs. La frappe le garde.
  const pastedBar = $('[data-pasted]');
  let pasted = null; // identifiants des blocs collés, dans l'ordre
  const together = () => {
    const i = ed.blocks.findIndex((b) => b.id === pasted[0]);
    return i >= 0 && pasted.every((id, k) => ed.blocks[i + k]?.id === id);
  };
  ed.refreshPasted = () => {
    if (pasted && (ed.mode !== 'edit' || !together())) pasted = null;
    pastedBar.hidden = !pasted;
  };
  ed.offerPasted = (ids) => {
    pasted = ids;
    $('[data-pasted-text]', pastedBar).textContent = `${ids.length} blocs collés`;
    pastedBar.hidden = false;
  };
  ed.on(pastedBar, 'click', (e) => {
    if (e.target.closest('[data-pasted-ai]') && pasted) ed.openAi(null, pasted);
    else if (e.target.closest('[data-pasted-close]')) { pasted = null; pastedBar.hidden = true; }
  });

  // id : un bloc ; ids : des blocs collés (tout le document part, l'IA ne modifie qu'eux) ; rien : tout le document.
  ed.openAi = (id, ids = null) => {
    ed.syncFromDom();
    ai = { id, ids };
    const b = id && ed.blocks.find((x) => x.id === id);
    $('[data-ai-scope]', sheet).textContent = b ? `Sur ce bloc : ${ed.def(b).label}` : ids ? `Sur les ${ids.length} blocs collés` : 'Sur tout le document';
    const labels = b ? ['Remplacer le bloc', 'Insérer au-dessus', 'Insérer dessous'] : ['Remplacer le document', 'Ajouter au début', 'Ajouter à la fin'];
    ['replace', 'start', 'end'].forEach((k, i) => { $(`[data-ai-apply="${k}"]`, sheet).textContent = labels[i]; });
    $('[data-ai-form]', sheet).hidden = false;
    $('[data-ai-result]', sheet).hidden = true;
    $('[data-ai-instruction]', sheet).value = '';
    $('[data-ai-error]', sheet).hidden = true;
    ed.openSheet('ai');
    loadUses().then((list) => {
      if (!list || !ai || ai.id !== id) return;
      const scope = b ? 'block' : 'document';
      $('[data-ai-uses]', sheet).innerHTML = list.filter((u) => !u.scopes || u.scopes.includes(scope))
        .map((u) => `<button type="button" data-ai-use="${esc(u.id).replace(/"/g, '&quot;')}" class="${useCls}">${esc(u.label)}</button>`).join('');
    });
  };
  // use : identifiant d'un usage de l'application (la consigne écrite, facultative, le précise).
  const run = async (use = '') => {
    const instruction = $('[data-ai-instruction]', sheet).value.trim();
    if (!instruction && !use) return ed.toast('Écrivez une consigne');
    const text = ed.markdown();
    const b = ai.id && ed.blocks.find((x) => x.id === ai.id);
    if (ai.id && !b) return sheet.close();
    const button = $('[data-ai-run]', sheet);
    const failure = $('[data-ai-error]', sheet);
    failure.hidden = true;
    button.disabled = true;
    button.querySelector('span').textContent = 'L’IA travaille…';
    const mine = new AbortController();
    pending = mine;
    try {
      // En vue source, le texte de la zone fait foi : pas de blocs à désigner, le document part entier.
      const numbered = !b && ed.mode !== 'source' ? ed.aiSnapshot(ai.ids) : {};
      const r = await request(o.aiUrl, { method: 'POST', body: ed.form({ scope: b ? 'block' : 'document', ...(use ? { use } : {}), instruction, text, ...(b ? { block: Blocks.toMarkdown(b) } : {}), ...numbered }), headers: { Accept: 'application/json' }, signal: AbortSignal.any([ed.ac.signal, mine.signal]) });
      const j = await r.json().catch(() => ({}));
      if (mine.signal.aborted) return;
      const ops = r.ok && typeof j.operations === 'string';
      if (!ops && (!r.ok || typeof j.markdown !== 'string')) throw new Error(j.error || 'Pas de réponse de l’IA');
      $('[data-ai-ops]', sheet).hidden = !ops;
      $('[data-ai-whole]', sheet).hidden = ops;
      if (ops) {
        ai.markdown = j.operations;
        ed.aiShowOps(j.operations);
        $('[data-ai-form]', sheet).hidden = true;
        $('[data-ai-result]', sheet).hidden = false;
        return;
      }
      ai.markdown = j.markdown.replace(/\r\n/g, '\n');
      const problems = Blocks.lint(ai.markdown);
      const lint = $('[data-ai-lint]', sheet);
      lint.hidden = !problems.length;
      lint.innerHTML = problems.map((p) => `<li>Ligne ${p.line} : ${esc(p.message)}</li>`).join('');
      $('[data-ai-force-wrap]', sheet).hidden = !problems.length;
      $('[data-ai-force]', sheet).checked = false;
      sheet.querySelectorAll('[data-ai-apply]').forEach((x) => { x.disabled = problems.length > 0; });
      const show = (md) => Blocks.toHtml(md, { media: o.media, title: !b });
      $('[data-ai-before]', sheet).innerHTML = show(b ? Blocks.toMarkdown(b) : text);
      $('[data-ai-after]', sheet).innerHTML = show(ai.markdown);
      $('[data-ai-form]', sheet).hidden = true;
      $('[data-ai-result]', sheet).hidden = false;
    } catch (error) {
      // Dans la feuille, pas en notification : un message de limite (413, 429) doit rester le temps d'être lu.
      if (error.name !== 'AbortError') { failure.textContent = error.message; failure.hidden = false; }
    } finally {
      if (pending === mine) pending = null;
      button.disabled = false;
      button.querySelector('span').textContent = 'Envoyer';
    }
  };
  // how : replace | start | end. Bloc : remplacer, au-dessus, dessous. Document : Blocks.combine (replace | prepend | append).
  const apply = (how) => {
    if (ai.id) {
      const i = ed.blocks.findIndex((x) => x.id === ai.id);
      if (i < 0) return;
      const parsed = Blocks.parse(ai.markdown).blocks;
      const added = (how === 'replace' ? Blocks.keepWidth(ed.blocks[i], parsed) : parsed).map((b) => ({ id: ed.newId(), ...b }));
      ed.change(() => (how === 'replace' ? ed.blocks.splice(i, 1, ...added) : ed.blocks.splice(how === 'start' ? i : i + 1, 0, ...added)));
    } else {
      // Remplacer : sans frontmatter dans la réponse, le titre et l'icône du document sont gardés ; au début / à la fin : ses clés absentes sont ajoutées.
      const next = Blocks.parse(Blocks.combine(ed.markdown(), ai.markdown, { replace: 'replace', start: 'prepend', end: 'append' }[how]));
      ed.change(() => ed.setDoc({ meta: next.meta, blocks: next.blocks }));
    }
    ed.toast({ replace: 'Proposition appliquée', start: ai.id ? 'Insérée au-dessus' : 'Ajoutée au début', end: ai.id ? 'Insérée dessous' : 'Ajoutée à la fin' }[how]);
  };
  ed.on(sheet, 'click', (e) => {
    const preset = e.target.closest('[data-ai-preset]');
    if (preset) { $('[data-ai-instruction]', sheet).value = preset.dataset.aiPreset; return run(); }
    const use = e.target.closest('[data-ai-use]');
    if (use) return run(use.dataset.aiUse);
    if (e.target.closest('[data-ai-run]')) return run();
    if (e.target.closest('[data-ai-ignore]')) return sheet.close();
    if (e.target.closest('[data-ai-copy]')) {
      shared.clipboard = ai.markdown;
      navigator.clipboard?.writeText(ai.markdown).catch(() => {});
      sheet.close();
      return ed.toast('Proposition copiée, rien n’a changé');
    }
    const how = e.target.closest('[data-ai-apply]')?.dataset.aiApply;
    if (how) { sheet.close(); apply(how); }
  });
  ed.on(sheet, 'change', (e) => { if (e.target.matches('[data-ai-force]')) sheet.querySelectorAll('[data-ai-apply]').forEach((x) => { x.disabled = !e.target.checked; }); });
}
