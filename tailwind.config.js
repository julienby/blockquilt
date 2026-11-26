module.exports = {
  // Les classes de l'éditeur ne valent que sous .bq-root (posée par mount sur l'élément reçu) : elles gagnent dans l'éditeur
  // et ne touchent pas une page qui a son propre Tailwind (.hidden, sm:inline-flex… dans un autre ordre).
  important: '.bq-root',
  content: ['./index.html', './blockquilt.js', './blockquilt-editor.js', './editor/*.js'],
  theme: {
    extend: {
      // Couleur d'accent de l'éditeur : variable CSS --bq-accent (bleu par défaut), nuances calculées par color-mix.
      colors: { brand: {
        50: 'color-mix(in srgb, var(--bq-accent, #0284c7) 8%, transparent)',
        100: 'color-mix(in srgb, var(--bq-accent, #0284c7) 16%, transparent)',
        500: 'var(--bq-accent, #0284c7)',
        600: 'var(--bq-accent, #0284c7)',
        700: 'color-mix(in srgb, var(--bq-accent, #0284c7) 82%, black)',
      } },
      fontFamily: {
        jakarta: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        news: ['Newsreader', 'ui-serif', 'Georgia', 'serif'],
      },
    },
  },
};
