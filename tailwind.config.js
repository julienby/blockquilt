module.exports = {
  content: ['./index.html', './blockquilt.js', './app.js'],
  theme: {
    extend: {
      // Bleu du logo (#075985) décliné en gamme et deux polices hébergées (assets/fonts).
      colors: { brand: { 50: '#f0f9ff', 100: '#e0f2fe', 200: '#bae6fd', 500: '#0ea5e9', 600: '#0284c7', 700: '#0369a1', 800: '#075985', 900: '#0c4a6e' } },
      fontFamily: {
        jakarta: ['"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        news: ['Newsreader', 'ui-serif', 'Georgia', 'serif'],
      },
    },
  },
};
