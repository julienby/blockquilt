// Vues de l'éditeur : 'edit' (blocs), 'source' (texte Markdown), 'preview' (rendu).
// Vue source : le texte complet, contrôlé par Blocks.lint et rendu en direct. Grand écran : texte et aperçu côte à côte ;
// téléphone : empilés. Choix « Source / Source + visuel / Visuel » gardé dans localStorage ; défaut « Source + visuel » dès 1024 px. En sortant, le texte est relu en blocs (une étape annulable).
import { esc } from './shared.js';

export function installSource(ed) {
  const { o, $, canvas, titleEl } = ed;
  let sourceText = '';
  const storeKey = 'blockquilt.sourceLayout';
  const layouts = [['text', 'Source'], ['both', 'Source + visuel'], ['visual', 'Visuel']];
  const layoutNow = () => {
    try { const saved = localStorage.getItem(storeKey); if (layouts.some(([l]) => l === saved)) return saved; } catch { /* stockage refusé : défaut */ }
    return innerWidth >= 1024 ? 'both' : 'text';
  };

  ed.sourceArea = () => canvas.querySelector('[data-source-text]');
  ed.renderSource = () => {
    ed.hideBar();
    canvas.innerHTML = `<div data-source class="bq-source mx-auto grid gap-3">
        <div role="group" aria-label="Affichage de la vue source" class="flex gap-1 rounded-xl border border-current/10 p-1">
          ${layouts.map(([l, name]) => `<button type="button" data-source-layout="${l}" aria-pressed="false" class="min-h-11 flex-1 rounded-lg px-1 text-sm font-semibold aria-pressed:bg-brand-600 aria-pressed:text-white">${name}</button>`).join('')}</div>
        <div data-source-pane="text" class="flex min-w-0 flex-col gap-2">
          <textarea data-source-text spellcheck="false" aria-label="Texte source (Markdown)" class="bq-source-text w-full rounded-xl border bg-transparent p-3 font-mono text-[13px] leading-6">${esc(sourceText)}</textarea>
          <ul data-source-lint aria-live="polite" class="space-y-1 text-xs"></ul></div>
        <div data-source-pane="preview" aria-label="Aperçu" class="min-w-0 overflow-auto rounded-xl border p-3 sm:p-4" data-source-preview></div></div>`;
    ed.showSourceLayout(layoutNow());
    ed.refreshSource();
  };
  ed.refreshSource = () => {
    const area = ed.sourceArea();
    if (!area) return;
    const problems = Blocks.lint(area.value);
    canvas.querySelector('[data-source-lint]').innerHTML = problems.length
      ? problems.map((p) => `<li><button type="button" data-source-line="${p.line}" class="w-full rounded-lg bg-red-50 px-2 py-1.5 text-left text-red-800 hover:bg-red-100">Ligne ${p.line} : ${esc(p.message)}</button></li>`).join('')
      : '<li class="px-2 py-1.5 opacity-60">Aucune alerte : l’éditeur relit tout le texte sans perte.</li>';
    const pv = canvas.querySelector('[data-source-preview]');
    pv.innerHTML = Blocks.toHtml(area.value, { media: o.media });
    window.BlockquiltContent?.enhance(pv);
  };
  /** Sélectionne la ligne n (1 = première) de la zone de texte : un clic sur une alerte y mène. */
  ed.goToLine = (n) => {
    const area = ed.sourceArea();
    const lines = area.value.split('\n');
    const start = lines.slice(0, n - 1).reduce((a, l) => a + l.length + 1, 0);
    area.focus();
    area.setSelectionRange(start, start + (lines[n - 1] || '').length);
  };
  ed.showSourceLayout = (layout, keep = false) => {
    canvas.querySelector('[data-source]').dataset.layout = layout;
    canvas.querySelectorAll('[data-source-layout]').forEach((t) => t.setAttribute('aria-pressed', String(t.dataset.sourceLayout === layout)));
    if (keep) try { localStorage.setItem(storeKey, layout); } catch { /* stockage refusé : choix valable pour cet affichage seulement */ }
  };

  /** Passe à une vue ; demander la vue courante revient à l'édition. */
  ed.setMode = (next) => {
    if (next === ed.mode) next = 'edit';
    if (next === ed.mode) return;
    if (ed.mode === 'source') { ed.checkpoint(); ed.setDoc(Blocks.parse(ed.sourceArea()?.value ?? sourceText)); }
    else if (ed.editing()) { ed.syncFromDom(); ed.checkpoint(); }
    if (next === 'source') sourceText = Blocks.serialize(ed.docMeta(), ed.blocks);
    ed.mode = next;
    $('[data-preview]').setAttribute('aria-pressed', String(ed.mode === 'preview'));
    $('[data-source-mode]').setAttribute('aria-pressed', String(ed.mode === 'source'));
    titleEl.contentEditable = String(ed.editing());
    ed.render();
    if (ed.mode === 'source') ed.sourceArea().focus({ preventScroll: true });
  };
}
