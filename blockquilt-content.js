// blockquilt — amélioration facultative du rendu publié (Blocks.toHtml) : carrousels avec flèches et puces.
// Aucune dépendance. Sans ce script, le contenu reste lisible et un carrousel défile au doigt.
// Se lance seul au chargement de la page ; pour du contenu ajouté ensuite : BlockquiltContent.enhance(élément).
(function () {
  const enhance = (root = document) => {
    root.querySelectorAll('.bq-carousel:not(.is-ready)').forEach((c) => {
      const track = c.querySelector('.bq-carousel-track');
      const slides = [...track.children];
      const prev = c.querySelector('.bq-carousel-prev');
      const next = c.querySelector('.bq-carousel-next');
      const dots = c.querySelector('.bq-carousel-dots');
      if (!track || !prev || !next || !dots) return;
      c.classList.add('is-ready');
      if (slides.length < 2) return;
      dots.innerHTML = slides.map((_, i) => `<button type="button" aria-label="Photo ${i + 1} sur ${slides.length}"></button>`).join('');
      const index = () => Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      const go = (i) => track.scrollTo({ left: Math.max(0, Math.min(slides.length - 1, i)) * track.clientWidth, behavior: 'smooth' });
      const update = () => {
        const i = index();
        [...dots.children].forEach((d, j) => d.setAttribute('aria-current', String(i === j)));
        prev.disabled = i === 0;
        next.disabled = i === slides.length - 1;
      };
      prev.addEventListener('click', () => go(index() - 1));
      next.addEventListener('click', () => go(index() + 1));
      dots.addEventListener('click', (e) => { const d = e.target.closest('button'); if (d) go([...dots.children].indexOf(d)); });
      track.addEventListener('scroll', () => { cancelAnimationFrame(update.raf); update.raf = requestAnimationFrame(update); }, { passive: true });
      track.tabIndex = 0;
      track.setAttribute('aria-label', 'Photos (flèches gauche et droite)');
      track.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); go(index() + (e.key === 'ArrowRight' ? 1 : -1)); }
      });
      prev.hidden = next.hidden = dots.hidden = false;
      update();
    });
  };
  window.BlockquiltContent = { enhance };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => enhance());
  else enhance();
})();
