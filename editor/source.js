// Vues de l'éditeur : 'edit' (blocs), 'source' (texte Markdown), 'preview' (rendu).
// Vue source : le texte complet, contrôlé par Blocks.lint. Le visuel à côté est commun aux vues blocs et source (render.js).
// En sortant, le texte est relu en blocs (une étape annulable).
import { esc } from './shared.js';

export function installSource(ed) {
  const { o, $, canvas } = ed;
  let sourceText = '';
  ed.sourceArea = () => canvas.querySelector('[data-source-text]');
  ed.renderSource = () => {
    // Redessin en vue source (« Visuel à côté »…) : le texte de la zone fait foi, pas celui lu à l'entrée.
    sourceText = ed.sourceArea()?.value ?? sourceText;
    ed.hideBar();
    canvas.innerHTML = `<div data-source class="bq-column flex flex-col gap-2">
          <textarea data-source-text spellcheck="false" aria-label="Texte source (Markdown)" class="bq-source-text w-full rounded-xl border bg-transparent p-3 font-mono text-[13px] leading-6">${esc(sourceText)}</textarea>
          <ul data-source-lint aria-live="polite" class="space-y-1 text-xs"></ul></div>`;
    ed.refreshSource();
  };
  ed.refreshSource = () => {
    const area = ed.sourceArea();
    if (!area) return;
    const problems = Blocks.lint(area.value);
    canvas.querySelector('[data-source-lint]').innerHTML = problems.length
      ? problems.map((p) => `<li><button type="button" data-source-line="${p.line}" class="w-full rounded-lg bg-red-50 px-2 py-1.5 text-left text-red-800 hover:bg-red-100">Ligne ${p.line} : ${esc(p.message)}</button></li>`).join('')
      : '<li class="px-2 py-1.5 opacity-60">Aucune alerte : l’éditeur relit tout le texte sans perte.</li>';
    ed.refreshVisual();
  };
  /** Sélectionne la ligne n (1 = première) de la zone de texte : un clic sur une alerte y mène. */
  ed.goToLine = (n) => {
    const area = ed.sourceArea();
    const lines = area.value.split('\n');
    const start = lines.slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0);
    area.focus();
    area.setSelectionRange(start, start + (lines[n - 1] || '').length);
  };
  /** Passe à une vue ; demander la vue courante revient à l'édition. */
  ed.setMode = (next) => {
    if (next === ed.mode) next = 'edit';
    if (next === ed.mode) return;
    if (ed.mode === 'source') { ed.checkpoint(); ed.setDoc(Blocks.parse(ed.sourceArea()?.value ?? sourceText)); }
    else if (ed.editing()) { ed.syncFromDom(); ed.checkpoint(); }
    if (next === 'source') sourceText = Blocks.serialize(ed.docMeta(), ed.blocks);
    ed.mode = next;
    if (!o.single) { // un champ n'a ni source, ni aperçu, ni visuel
      $('[data-preview]').setAttribute('aria-pressed', String(ed.mode === 'preview'));
      $('[data-source-mode]')?.setAttribute('aria-pressed', String(ed.mode === 'source'));
      const visual = $('[data-visual-toggle]'); // absent avec visual: false
      if (visual) visual.disabled = ed.mode === 'preview';
    }
    ed.render();
    if (ed.mode === 'source') ed.sourceArea()?.focus({ preventScroll: true });
  };
}
