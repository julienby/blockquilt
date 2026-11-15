// Assistant IA : `aiUrl` désigne le service ; l'éditeur n'appelle aucun modèle lui-même et ne contient aucune clé.
// GET aiUrl → { uses: [{ id, label, scopes }] } : les usages de l'application (modèle et consigne restent chez elle) ;
// sans réponse, les boutons intégrés (consignes écrites). Envoi (POST) : scope (document | block), use, instruction,
// text (document), block (Markdown du bloc). Réponse : { markdown }. Relais prêt à monter : ai/blockquilt-ai.js.
// La réponse passe par Blocks.lint et s'affiche à côté de l'actuel ; puis, au choix (toujours annulable) :
// document : remplacer, ajouter au début, à la fin ; bloc : remplacer, insérer au-dessus, dessous ; ou copier sans rien changer.
import { esc, shared } from './shared.js';

export function installAi(ed) {
  const { o, $ } = ed;
  const sheet = ed.sheets.ai;
  ed.openAi = () => {};
  if (!sheet) return; // sans aiUrl, aucun bouton IA
  let ai = null; // { id, markdown }
  const useCls = 'min-h-11 rounded-xl border border-amber-200 bg-amber-50 px-3 text-sm font-semibold text-amber-950 hover:bg-amber-100';
  let uses = null; // promesse : usages de l'application, ou null (boutons intégrés)
  const loadUses = () => (uses ??= fetch(o.aiUrl, { headers: { Accept: 'application/json' }, signal: ed.ac.signal })
    .then((r) => (r.ok ? r.json() : null)).then((j) => (Array.isArray(j?.uses) && j.uses.length ? j.uses : null)).catch(() => null));

  ed.openAi = (id) => {
    ed.syncFromDom();
    ai = { id };
    const b = id && ed.blocks.find((x) => x.id === id);
    $('[data-ai-scope]', sheet).textContent = b ? `Sur ce bloc : ${ed.def(b).label}` : 'Sur tout le document';
    const labels = b ? ['Remplacer le bloc', 'Insérer au-dessus', 'Insérer dessous'] : ['Remplacer le document', 'Ajouter au début', 'Ajouter à la fin'];
    ['replace', 'start', 'end'].forEach((k, i) => { $(`[data-ai-apply="${k}"]`, sheet).textContent = labels[i]; });
    $('[data-ai-form]', sheet).hidden = false;
    $('[data-ai-result]', sheet).hidden = true;
    $('[data-ai-instruction]', sheet).value = '';
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
    button.disabled = true;
    button.querySelector('span').textContent = 'L’IA travaille…';
    try {
      const r = await fetch(o.aiUrl, { method: 'POST', body: ed.form({ scope: b ? 'block' : 'document', ...(use ? { use } : {}), instruction, text, ...(b ? { block: Blocks.toMarkdown(b) } : {}) }), headers: { Accept: 'application/json' }, signal: ed.ac.signal });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || typeof j.markdown !== 'string') throw new Error(j.error || 'Pas de réponse de l’IA');
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
      if (error.name !== 'AbortError') ed.toast(error.message);
    } finally {
      button.disabled = false;
      button.querySelector('span').textContent = 'Envoyer';
    }
  };
  // how : replace | start | end. Bloc : remplacer, au-dessus, dessous. Document : Blocks.combine (replace | prepend | append).
  const apply = (how) => {
    if (ai.id) {
      const i = ed.blocks.findIndex((x) => x.id === ai.id);
      if (i < 0) return;
      const added = Blocks.parse(ai.markdown).blocks.map((b) => ({ id: ed.newId(), ...b }));
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
