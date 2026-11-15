// Assistant IA : `aiUrl` désigne le service ; l'éditeur n'appelle aucun modèle lui-même et ne contient aucune clé.
// Envoi : scope (document | block), instruction, text (document), block (Markdown du bloc). Réponse : { markdown }.
// La réponse passe par Blocks.lint, s'affiche avant / après, puis « Appliquer » (annulable) ou « Ignorer ».
import { esc } from './shared.js';

export function installAi(ed) {
  const { o, $ } = ed;
  const sheet = ed.sheets.ai;
  ed.openAi = () => {};
  if (!sheet) return; // sans aiUrl, aucun bouton IA
  let ai = null; // { id, markdown }

  ed.openAi = (id) => {
    ed.syncFromDom();
    ai = { id };
    const b = id && ed.blocks.find((x) => x.id === id);
    $('[data-ai-scope]', sheet).textContent = b ? `Sur ce bloc : ${ed.def(b).label}` : 'Sur tout le document';
    $('[data-ai-form]', sheet).hidden = false;
    $('[data-ai-result]', sheet).hidden = true;
    $('[data-ai-instruction]', sheet).value = '';
    ed.openSheet('ai');
  };
  const run = async () => {
    const instruction = $('[data-ai-instruction]', sheet).value.trim();
    if (!instruction) return ed.toast('Écrivez une consigne');
    const text = ed.markdown();
    const b = ai.id && ed.blocks.find((x) => x.id === ai.id);
    if (ai.id && !b) return sheet.close();
    const button = $('[data-ai-run]', sheet);
    button.disabled = true;
    button.querySelector('span').textContent = 'L’IA travaille…';
    try {
      const r = await fetch(o.aiUrl, { method: 'POST', body: ed.form({ scope: b ? 'block' : 'document', instruction, text, ...(b ? { block: Blocks.toMarkdown(b) } : {}) }), headers: { Accept: 'application/json' }, signal: ed.ac.signal });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || typeof j.markdown !== 'string') throw new Error(j.error || 'Pas de réponse de l’IA');
      ai.markdown = j.markdown.replace(/\r\n/g, '\n');
      const problems = Blocks.lint(ai.markdown);
      const lint = $('[data-ai-lint]', sheet);
      lint.hidden = !problems.length;
      lint.innerHTML = problems.map((p) => `<li>Ligne ${p.line} : ${esc(p.message)}</li>`).join('');
      $('[data-ai-force-wrap]', sheet).hidden = !problems.length;
      $('[data-ai-force]', sheet).checked = false;
      $('[data-ai-apply]', sheet).disabled = problems.length > 0;
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
  const apply = () => {
    const parsed = Blocks.parse(ai.markdown);
    if (ai.id) {
      const i = ed.blocks.findIndex((x) => x.id === ai.id);
      if (i < 0) return;
      ed.change(() => ed.blocks.splice(i, 1, ...parsed.blocks.map((b) => ({ id: ed.newId(), ...b }))));
    } else {
      // Sans frontmatter dans la réponse, le titre et l'icône du document sont gardés.
      ed.change(() => ed.setDoc({ meta: Object.keys(parsed.meta).length ? parsed.meta : ed.docMeta(), blocks: parsed.blocks }));
    }
    ed.toast('Proposition appliquée');
  };
  ed.on(sheet, 'click', (e) => {
    const preset = e.target.closest('[data-ai-preset]');
    if (preset) { $('[data-ai-instruction]', sheet).value = preset.dataset.aiPreset; return run(); }
    if (e.target.closest('[data-ai-run]')) return run();
    if (e.target.closest('[data-ai-ignore]')) return sheet.close();
    if (e.target.closest('[data-ai-apply]')) { sheet.close(); apply(); }
  });
  ed.on(sheet, 'change', (e) => { if (e.target.matches('[data-ai-force]')) $('[data-ai-apply]', sheet).disabled = !e.target.checked; });
}
