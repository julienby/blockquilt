// Éditeur de rubrique « Bento pastel » : le texte reste du Markdown. On le coupe en blocs pour l'écran, on le recolle à l'enregistrement.
// Chaque bloc a un type qui porte le sens (astuce, consigne, conseil…). L'hôte ne voit jamais de Markdown : il voit du gras, des listes, des teintes.
// Un bloc que l'éditeur ne sait pas refaire à l'identique (tableau, code…) reste du texte tel quel (type « raw ») : rien n'est jamais abîmé.
const Blocks = {
  // ---- Registre des types de blocs ----
  // Un type = une entrée : lecture (match), écriture (toMarkdown), rendu (toHtml), bloc neuf (blank), libellés et teintes.
  // L'écran (blockquilt-editor.js) y ajoute edit(b, ui) et read(card, b). Le type « raw » n'est pas dans l'ordre de lecture : c'est le repli.
  types: {},
  order: [],

  /** Enregistre (ou remplace) un type. `def` : label, short, icon, group ('text' | 'media'), tone { card, badge }, match, toMarkdown, toHtml, blank, convertible. */
  register(type, def) {
    if (!Blocks.types[type] && type !== 'raw') Blocks.order.push(type);
    Blocks.types[type] = { group: 'text', short: def.label, icon: 'sliders', tone: { card: '', badge: '' }, ...Blocks.types[type], ...def, type };
    return Blocks.types[type];
  },
  def(type) { return Blocks.types[type] || Blocks.types.raw; },
  /** Types texte convertibles entre eux, dans l'ordre d'enregistrement. */
  get TEXT_KEYS() { return Blocks.order.filter((k) => Blocks.types[k].convertible); },
  get TYPES() { return Blocks.types; },

  ENTITIES: { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" },
  VIDEO: /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|vimeo\.com)\/\S+$/i,

  /** Texte d'une rubrique → { title: première ligne « ## … », blocks: [{ text }] }. */
  parse(markdown) {
    const lines = markdown.replace(/\r\n/g, '\n').trim().split('\n');
    const title = /^##(?:\s+|$)/.test(lines[0] ?? '') ? lines.shift() : '';
    const blocks = [];
    let current = [];
    let fence = false;
    const flush = () => {
      const text = current.join('\n').trim();
      if (text) blocks.push({ text });
      current = [];
    };
    for (const line of lines) {
      if (!fence && /^:::\w+/.test(line)) { flush(); fence = true; current.push(line); continue; }
      if (fence) {
        current.push(line);
        if (/^:::\s*$/.test(line)) { fence = false; flush(); }
        continue;
      }
      if (/^#{3,4} /.test(line)) { flush(); current.push(line); flush(); continue; }
      if (line.trim() === '') { flush(); continue; }
      current.push(line);
    }
    flush();
    return { title, blocks };
  },

  serialize(title, blocks) {
    return [title.trim(), ...blocks.map((b) => b.text.trim()).filter(Boolean)].filter(Boolean).join('\n\n') + '\n';
  },

  // ---- Texte visible ⇄ Markdown ----
  esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
  unesc(s) { return s.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (m) => Blocks.ENTITIES[m]); },
  /** Une ligne de Markdown → texte sans mise en forme. */
  plain(md) { return Blocks.unesc(Blocks.inlineHtml(md).replace(/<[^>]+>/g, '')); },

  /** Une ligne de Markdown → HTML : gras, italique, souligné, surligné, liens. Tout le reste reste du texte. */
  inlineHtml(md) {
    const re = /\\([\\`*_{}[\]()#+\-.!>=])|\*\*(\S(?:.*?\S)?)\*\*|\*(\S(?:.*?\S)?)\*|\+\+(\S(?:.*?\S)?)\+\+|==(\S(?:.*?\S)?)==|\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^)\s]+)\)/g;
    let out = '';
    let at = 0;
    let m;
    while ((m = re.exec(md))) {
      out += Blocks.esc(md.slice(at, m.index));
      at = re.lastIndex;
      if (m[1] !== undefined) out += Blocks.esc(m[1]);
      else if (m[2] !== undefined) out += '<b>' + Blocks.inlineHtml(m[2]) + '</b>';
      else if (m[3] !== undefined) out += '<i>' + Blocks.inlineHtml(m[3]) + '</i>';
      else if (m[4] !== undefined) out += '<u>' + Blocks.inlineHtml(m[4]) + '</u>';
      else if (m[5] !== undefined) out += '<mark class="bq-highlight">' + Blocks.inlineHtml(m[5]) + '</mark>';
      else out += '<a href="' + Blocks.esc(m[7]).replace(/"/g, '&quot;') + '">' + Blocks.inlineHtml(m[6]) + '</a>';
    }
    return out + Blocks.esc(md.slice(at));
  },

  /** Lignes de Markdown → HTML avec listes `<ul><li>` / `<ol><li>` (éditables via l'icône Liste du menu flottant). */
  linesToHtml(lines) {
    const out = [];
    let listTag = null;
    let items = [];
    const closeList = () => {
      if (listTag) {
        out.push(`<${listTag}>${items.map((x) => `<li>${x}</li>`).join('')}</${listTag}>`);
        listTag = null;
        items = [];
      }
    };
    for (const l of lines) {
      let m;
      if ((m = /^- (.*)$/.exec(l))) {
        if (listTag && listTag !== 'ul') closeList();
        listTag = 'ul';
        items.push(Blocks.inlineHtml(m[1]));
      } else if ((m = /^\d+\. (.*)$/.exec(l))) {
        if (listTag && listTag !== 'ol') closeList();
        listTag = 'ol';
        items.push(Blocks.inlineHtml(m[1]));
      } else {
        closeList();
        out.push(Blocks.inlineHtml(l));
      }
    }
    closeList();
    return out.join('<br>');
  },

  /** Adresse acceptée pour un lien (sinon : pas de lien). */
  safeHref(href) {
    const h = Blocks.unesc(href).trim();
    const full = /^(https?:\/\/|mailto:|tel:)/i.test(h) ? h : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(h) ? 'https://' + h : '';
    return full.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
  },

  /** HTML d'un champ modifiable → Markdown (gère `<ul><li>`, `<ol><li>`, et protège les signes Markdown). */
  htmlToMd(html, bullets = false) {
    const lines = [];
    let cur = '';
    let liPrefix = '';
    const lists = [];
    const start = bullets ? /^(#{1,6} |\+ |>)/ : /^(#{1,6} |[-+] |>)/;
    const frames = [];
    const put = (s) => { if (frames.length) frames[frames.length - 1].buf += s; else cur += s; };
    const flush = () => {
      if (liPrefix !== '') {
        const clean = cur.replace(/\n+/g, ' ').trim();
        if (clean !== '') lines.push(liPrefix + clean);
        cur = '';
        liPrefix = '';
        return;
      }
      lines.push(cur.replace(start, '\\$1').replace(/^(\d+)([.)]) /, '$1\\$2 '));
      cur = '';
    };
    const MARKS = { b: '**', strong: '**', i: '*', em: '*', u: '++', mark: '==', a: 'a' };
    const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^>]*)?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(html))) {
      if (m[4] !== undefined) {
        put(Blocks.unesc(m[4]).replace(/\u00a0/g, ' ').replace(/\\/g, '\\\\').replace(/[*[\]`]/g, '\\$&').replace(/\+\+/g, '\\+\\+').replace(/==/g, '\\=\\=')
          .replace(/(^|\W)_|_(?=\W|$)/g, (x) => x.replace('_', '\\_')));
        continue;
      }
      const closing = m[1] === '/';
      const tag = m[2].toLowerCase();
      if (MARKS[tag]) {
        if (!closing) {
          frames.push({ mark: MARKS[tag], href: tag === 'a' ? Blocks.safeHref((/href\s*=\s*"([^"]*)"/i.exec(m[3]) || [])[1] || '') : '', tag, buf: '' });
        } else if (frames.length) {
          const f = frames.pop();
          const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(f.buf);
          put(core === '' ? lead + trail : f.tag === 'a' ? (f.href ? `${lead}[${core}](${f.href})${trail}` : lead + core + trail) : lead + f.mark + core + f.mark + trail);
        }
      } else if (tag === 'ul' || tag === 'ol') {
        if (!closing) {
          if (cur !== '') flush();
          lists.push({ tag, n: 0 });
        } else {
          if (cur !== '' || liPrefix !== '') flush();
          lists.pop();
        }
      } else if (tag === 'li') {
        if (!closing) {
          if (cur !== '') flush();
          const top = lists[lists.length - 1];
          liPrefix = top && top.tag === 'ol' ? `${++top.n}. ` : '- ';
        } else {
          flush();
        }
      } else if (tag === 'br') {
        if (liPrefix === '') flush();
      } else if ((tag === 'div' || tag === 'p') && cur !== '') {
        flush();
      }
    }
    if (cur !== '' || liPrefix !== '') flush();
    return lines.join('\n').replace(/^\n+|\n+$/g, '').replace(/\*\*\*\*/g, '');
  },

  // ---- Bloc Markdown ⇄ modèle d'écran ----
  // Modèle : { type, ...champs du type }. Un bloc est lu par le premier type dont l'écriture redonne le même texte ; sinon il reste « raw ».

  tidy(x) { return x.split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim(); },

  fromMarkdown(md) {
    const t = md.trim();
    let m;
    // Rétrocompatibilité : un ancien bloc :::sensible est repris comme bloc texte normal (sans perte d'information).
    if ((m = /^:::sensible[ \t]*\n?([\s\S]*?)\n?:::\s*$/.exec(t))) {
      const inner = m[1].trim() === '' ? [] : m[1].trim().split('\n');
      return { type: 'text', html: Blocks.linesToHtml(inner) };
    }
    for (const type of Blocks.order) {
      const def = Blocks.types[type];
      const m = def.match ? def.match(t) : null;
      if (m && Blocks.tidy(def.toMarkdown(m)) === Blocks.tidy(t)) return { type, ...m };
    }
    return { type: 'raw', md };
  },

  /** Modèle → Markdown du bloc (vide si le bloc est vide : il disparaît à l'enregistrement). */
  toMarkdown(b) { return Blocks.def(b.type).toMarkdown(b); },

  /** Modèle d'un bloc neuf : vide, c'est le texte d'aide qui guide. */
  blank(type) { return { type, ...Blocks.def(type).blank() }; },

  isEmpty(b) { return Blocks.toMarkdown(b).trim() === ''; },
  stripTags(html) { return Blocks.unesc(html.replace(/<\/li>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')); },

  /** Les lignes d'un bloc texte, en HTML, quelle que soit sa forme : sert à convertir un bloc en un autre sans rien perdre. */
  lines(b) {
    return Blocks.htmlToMd(b.html ?? '', true).split('\n').map((l) => l.replace(/^(?:[-*]|\d+\.) /, '')).map(Blocks.inlineHtml);
  },

  /** Convertit un bloc texte en un autre type texte (titre, texte, astuce, conseil, consigne). */
  convert(b, type) {
    if (b.type === type) return b;
    let L = Blocks.lines(b).filter((h) => h.replace(/<[^>]+>/g, '').trim() !== '');
    if (L.length === 0) L = [''];
    if (Blocks.def(type).single) return { type, html: Blocks.esc(Blocks.stripTags(L.join(' ')).replace(/\s+/g, ' ').trim()) };
    const rawLines = Blocks.htmlToMd(b.html ?? '', true).split('\n').filter((l) => l.trim() !== '');
    const html = rawLines.length ? Blocks.linesToHtml(rawLines) : L.join('<br>');
    return { ...Blocks.blank(type), html };
  },

  /** Fusionne deux blocs voisins : le type du dessus l'emporte, les lignes du dessous suivent. null si impossible (titre au-dessus, photo, vidéo, bloc avancé). */
  merge(top, bottom) {
    const K = Blocks.TEXT_KEYS;
    if (Blocks.def(top.type).single || !K.includes(top.type) || !K.includes(bottom.type)) return null;
    const lines = (b) => Blocks.htmlToMd(b.html ?? '', true).split('\n').filter((l) => l.trim() !== '');
    return { ...top, html: Blocks.linesToHtml([...lines(top), ...lines(bottom)]) };
  },

  /** Premier caractère visible de `text` s'il est un emoji (drapeau, famille, teinte, touche compris), sinon ''. */
  firstEmoji(text) {
    const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(String(text).trim())[Symbol.iterator]().next().value;
    return first && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u.test(first.segment) ? first.segment : '';
  },

  /** « ## 🔑 Arrivée » → { icon: '🔑', title: 'Arrivée' }. */
  splitHeading(line) {
    const text = line.replace(/^## */, '').trim();
    const icon = Blocks.firstEmoji(text);
    return { icon, title: text.slice(icon.length).trim() };
  },

  // ---- Visualisation invité : Markdown d'une rubrique (sans la ligne « ## ») → HTML ----
  // Même lecture que l'éditeur, mêmes teintes que les cartes (Blocks.TYPES). Tout le texte est échappé ; liens limités à http(s), mailto, tel.

  /** Adresse de lecteur intégré pour un lien YouTube ou Vimeo (vide si l'adresse n'est pas reconnue). */
  embedUrl(url) {
    let m;
    if ((m = /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([\w-]{11})/i.exec(url)) || (m = /^https?:\/\/youtu\.be\/([\w-]{11})/i.exec(url))) return 'https://www.youtube-nocookie.com/embed/' + m[1];
    if ((m = /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i.exec(url))) return 'https://player.vimeo.com/video/' + m[1];
    return '';
  },

  /** Un bloc → HTML invité. `media` : adresse des photos (« media/<id> » du texte y est réécrit). */
  blockHtml(b, media) { return Blocks.def(b.type).toHtml(b, { media }); },

  /** Texte d'une rubrique, sans sa ligne « ## titre » → HTML invité, bloc par bloc. */
  toHtml(markdown, media = 'media/') {
    // « ## » factice : parse() lit toujours la première ligne « ## » comme titre de rubrique, jamais comme bloc.
    const { blocks } = Blocks.parse('##\n' + markdown);
    return `<div class="bq-view">${blocks.map((b) => Blocks.blockHtml(Blocks.fromMarkdown(b.text), media)).join('')}</div>`;
  },
};

// ---- Types de base ----
{
  const attr = (s) => Blocks.esc(s).replace(/"/g, '&quot;');
  const body = (html) => Blocks.htmlToMd(html, true);
  const PHOTO = /^!\[((?:\\.|[^\]\\])*)\]\(media\/([^)\s]+)\)$/;

  Blocks.register('title', {
    label: 'Titre de section', short: 'Titre', icon: 'heading', convertible: true, single: true,
    tone: { card: 'bg-white border-stone-300/90 text-stone-900', badge: 'bg-stone-100 text-stone-700 border-stone-200/90' },
    match: (t) => (!t.includes('\n') && /^### /.test(t) ? { html: Blocks.esc(Blocks.plain(t.slice(4))) } : null),
    toMarkdown: (b) => { const x = Blocks.htmlToMd(b.html).replace(/\n+/g, ' ').trim(); return x ? '### ' + x : ''; },
    toHtml: (b) => `<h3 class="mb-2 mt-6 font-news text-xl font-semibold leading-tight tracking-tight text-stone-900">${b.html}</h3>`,
    blank: () => ({ html: '' }),
  });

  Blocks.register('text', {
    label: 'Texte / Explication', short: 'Texte', icon: 'align_left', convertible: true,
    tone: { card: 'bg-[#FAF8F5] border-stone-200/90 text-stone-800', badge: 'bg-stone-200/80 text-stone-800 border-stone-300/80' },
    match: (t) => {
      if (/^\s*\|/m.test(t) || /^(#{1,6} |:::|!\[|>)/.test(t) || Blocks.VIDEO.test(t)) return null;
      const lines = t.split('\n');
      const b = { type: 'text', html: Blocks.linesToHtml(lines) };
      return body(b.html) === Blocks.tidy(t) ? { html: b.html } : { html: lines.map(Blocks.inlineHtml).join('<br>') };
    },
    toMarkdown: (b) => body(b.html),
    toHtml: (b) => `<p class="my-3 leading-7">${b.html}</p>`,
    blank: () => ({ html: '' }),
  });

  // Encadrés : citation Markdown dont la première ligne commence par l'emoji du type.
  const callout = (type, label, short, icon, marks, tone) => Blocks.register(type, {
    label, short, icon, convertible: true, tone, mark: marks[0],
    match: (t) => {
      const lines = t.split('\n');
      if (!lines.every((l) => l.startsWith('>'))) return null;
      const lead = (/^> ?(💡|⚠️|🚨|❗|🧭)/u.exec(t) || [, ''])[1];
      if (!marks.includes(lead) && !(lead === '' && type === 'tip')) return null;
      return { mark: lead, html: Blocks.linesToHtml(lines.map((l) => l.replace(/^> ?(?:💡|⚠️|🚨|❗|🧭)? ?/u, ''))) };
    },
    toMarkdown: (b) => {
      const x = body(b.html);
      if (x.trim() === '') return '';
      const mark = b.mark ?? marks[0];
      const [first, ...rest] = x.split('\n');
      return [`> ${mark ? mark + ' ' : ''}${first}`, ...rest.map((l) => '> ' + l)].join('\n');
    },
    toHtml: (b) => {
      const mark = b.mark ?? marks[0];
      return `<aside data-type="${type}" class="my-4 rounded-2xl border p-4 leading-7 ${tone.card}">${mark ? `<span aria-hidden="true">${mark}</span> ` : ''}${b.html}</aside>`;
    },
    blank: () => ({ html: '', mark: marks[0] }),
  });
  callout('tip', 'Astuce pratique', 'Astuce', 'sparkles', ['💡'], { card: 'bg-[#EEF6F0] border-emerald-200/90 text-emerald-950', badge: 'bg-emerald-100 text-emerald-900 border-emerald-300/80' });
  callout('advice', 'Conseil local / Recommandation', 'Conseil', 'compass', ['🧭'], { card: 'bg-[#F3F1FA] border-indigo-200/80 text-indigo-950', badge: 'bg-indigo-100 text-indigo-900 border-indigo-300/80' });
  callout('warning', 'Consigne / Vigilance', 'Consigne', 'triangle_alert', ['⚠️', '🚨', '❗'], { card: 'bg-[#FDF6E9] border-amber-200/90 text-amber-950', badge: 'bg-amber-100 text-amber-900 border-amber-300/80' });

  Blocks.register('photo', {
    label: 'Photo explicative', short: 'Photo', icon: 'image', group: 'media',
    tone: { card: 'bg-white border-stone-200/90 text-stone-800', badge: 'bg-stone-100 text-stone-700 border-stone-200' },
    match: (t) => { const m = PHOTO.exec(t); return m ? { file: m[2], alt: Blocks.plain(m[1]) } : null; },
    toMarkdown: (b) => (b.file ? `![${Blocks.htmlToMd(Blocks.esc(b.alt)).replace(/\n/g, ' ')}](media/${b.file})` : ''),
    toHtml: (b, ctx) => `<img src="${attr(ctx.media + b.file)}" alt="${attr(b.alt)}" loading="lazy" class="my-4 h-auto w-full rounded-xl">`,
    blank: () => ({ file: '', alt: '' }),
  });

  Blocks.register('video', {
    label: 'Vidéo (YouTube, Vimeo)', short: 'Vidéo', icon: 'video', group: 'media',
    tone: { card: 'bg-rose-50/50 border-rose-200/80 text-rose-950', badge: 'bg-rose-100 text-rose-900 border-rose-200' },
    match: (t) => (Blocks.VIDEO.test(t) ? { url: t } : null),
    toMarkdown: (b) => b.url.trim(),
    toHtml: (b) => {
      const src = Blocks.embedUrl(b.url);
      return src
        ? `<div class="my-4 aspect-video overflow-hidden rounded-xl bg-stone-100"><iframe class="h-full w-full" src="${attr(src)}" title="Vidéo" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></div>`
        : `<p class="my-3"><a href="${attr(b.url)}">${Blocks.esc(b.url)}</a></p>`;
    },
    blank: () => ({ url: '' }),
  });

  // Repli : tout ce que l'éditeur ne sait pas refaire à l'identique reste du texte tel quel.
  Blocks.register('raw', {
    label: 'Mise en forme avancée', short: 'Avancé', icon: 'sliders', group: 'none',
    tone: { card: 'bg-white border-dashed border-stone-300 text-stone-800', badge: 'bg-stone-100 text-stone-700 border-stone-200' },
    toMarkdown: (b) => b.md ?? '',
    toHtml: (b, ctx) => {
      // Titres et photos ligne à ligne, le reste en texte (tableaux et code restent lisibles, jamais interprétés).
      const out = [];
      let para = [];
      const flush = () => { if (para.length) out.push(`<p class="my-3 leading-7">${Blocks.linesToHtml(para)}</p>`); para = []; };
      for (const line of (b.md ?? '').split('\n')) {
        let m;
        if ((m = /^(#{1,6}) +(.*)$/.exec(line))) { flush(); out.push(`<h4 class="mb-2 mt-5 font-semibold tracking-tight text-stone-900">${Blocks.inlineHtml(m[2])}</h4>`); }
        else if ((m = PHOTO.exec(line.trim()))) { flush(); out.push(Blocks.types.photo.toHtml({ file: m[2], alt: Blocks.plain(m[1]) }, ctx)); }
        else if (/^:::\w*\s*$/.test(line)) continue;
        else para.push(line.replace(/^> ?/, ''));
      }
      flush();
      return out.join('');
    },
    blank: () => ({ md: '' }),
  });
}

if (typeof module !== 'undefined') module.exports = Blocks;

