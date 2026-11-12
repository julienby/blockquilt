// blockquilt — noyau `Blocks` : fonctions pures, sans DOM (tourne aussi sous Node).
// Le texte est la source : Markdown + frontmatter + blocs sémantiques (voir FORMAT.md). On le coupe en blocs, on le recolle sans perte.
// Un bloc que l'éditeur ne sait pas refaire à l'identique reste du texte tel quel (type « raw ») : rien n'est jamais abîmé.
const Blocks = {
  // ---- Registre des types de blocs ----
  // Un type = une entrée : lecture (match), écriture (toMarkdown), rendu (toHtml), bloc neuf (blank), libellés et teintes.
  // L'écran (blockquilt-editor.js) y ajoute edit(b, ui) et read(card, b). Le type « raw » n'est pas dans l'ordre de lecture : c'est le repli.
  types: {},
  order: [],

  /** Enregistre (ou complète) un type. `def` : label, short, icon, group ('text' | 'media' | 'structure'), tone { card, badge }, match, toMarkdown, toHtml, blank, convertible. */
  register(type, def) {
    if (!Blocks.types[type] && type !== 'raw') Blocks.order.push(type);
    Blocks.types[type] = { group: 'text', short: def.label, icon: 'sliders', tone: { card: '', badge: '' }, ...Blocks.types[type], ...def, type };
    return Blocks.types[type];
  },
  def(type) { return Blocks.types[type] || Blocks.types.raw; },
  /** Types texte convertibles entre eux, dans l'ordre d'enregistrement. */
  get TEXT_KEYS() { return Blocks.order.filter((k) => Blocks.types[k].convertible); },
  CALLOUTS: ['info', 'tip', 'success', 'warning', 'danger'],

  ENTITIES: { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" },
  VIDEO: /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|vimeo\.com)\/\S+$/i,
  PHOTO: /^!\[((?:\\.|[^\]\\])*)\]\(((?:media\/|https:\/\/)[^)\s]+)\)$/,

  // ---- Document : frontmatter + blocs ----

  /** Frontmatter en tête : lignes `clé: valeur` à plat. Mal formé → pas de frontmatter (le texte reste dans le corps) et `error`. */
  frontmatter(markdown) {
    const lines = markdown.replace(/\r\n/g, '\n').split('\n');
    const none = (error = null) => ({ meta: {}, body: lines, offset: 0, error });
    if (lines[0] !== '---') return none();
    const end = lines.indexOf('---', 1);
    if (end < 0) return /^[A-Za-z_][\w-]*:/.test(lines[1] ?? '') ? none({ line: 1, message: 'Frontmatter non fermé : ajouter une ligne « --- »' }) : none();
    const meta = {};
    for (let i = 1; i < end; i++) {
      const m = /^([A-Za-z_][\w-]*):(?: (.*))?$/.exec(lines[i]);
      if (!m || Object.hasOwn(meta, m[1]) || Blocks.metaLine(m[1], m[2] ?? '') !== lines[i]) {
        return none({ line: i + 1, message: `Frontmatter mal formé : « ${lines[i]} » (attendu « clé: valeur »)` });
      }
      meta[m[1]] = m[2] ?? '';
    }
    return { meta, body: lines.slice(end + 1), offset: end + 1, error: null };
  },
  metaLine(key, value) { return value === '' ? key + ':' : `${key}: ${value}`; },

  /** Lignes du corps → morceaux de texte d'un bloc chacun, avec leur numéro de ligne (1 = première ligne du fichier). */
  split(lines, offset = 0) {
    const chunks = [];
    const problems = [];
    let cur = [];
    let start = 0;
    let fence = null; // { close: RegExp, line, kind }
    const flush = () => {
      if (cur.length && cur.some((l) => l.trim() !== '')) chunks.push({ text: cur.join('\n'), line: start });
      cur = [];
    };
    const push = (line, i) => { if (!cur.length) start = offset + i + 1; cur.push(line); };
    lines.forEach((line, i) => {
      let m;
      if (fence) {
        if (fence.kind === ':::' && /^:::\w/.test(line)) problems.push({ line: offset + i + 1, message: 'Bloc « ::: » ouvert dans un autre : non pris en charge' });
        push(line, i);
        if (fence.close.test(line)) { fence = null; flush(); }
      } else if ((m = /^(`{3,}|~{3,})/.exec(line))) {
        flush(); push(line, i); fence = { close: new RegExp('^' + m[1] + '\\s*$'), line: offset + i + 1, kind: 'code' };
      } else if (/^:::\w/.test(line)) {
        flush(); push(line, i); fence = { close: /^:::\s*$/, line: offset + i + 1, kind: ':::' };
      } else if (/^#{1,6} /.test(line)) {
        flush(); push(line, i); flush();
      } else if (line.trim() === '') flush();
      else push(line, i);
    });
    if (fence) problems.push({ line: fence.line, message: fence.kind === ':::' ? 'Bloc « ::: » non fermé : ajouter une ligne « ::: »' : 'Bloc de code non fermé : ajouter la ligne « ``` »' });
    flush();
    return { chunks, problems };
  },

  /** Texte complet → { meta, blocks } (blocks : modèles `{ type, … }`). */
  parse(markdown) {
    const fm = Blocks.frontmatter(markdown);
    const { chunks } = Blocks.split(fm.body, fm.offset);
    return { meta: fm.meta, blocks: chunks.map((c) => Blocks.fromMarkdown(c.text)) };
  },

  /** { meta, blocks } → texte complet. Les blocs vides disparaissent. */
  serialize(meta, blocks) {
    const keys = Object.keys(meta || {});
    const head = keys.length ? ['---', ...keys.map((k) => Blocks.metaLine(k, String(meta[k]))), '---'].join('\n') + '\n' : '';
    const body = blocks.map((b) => Blocks.toMarkdown(b)).filter((x) => x.trim() !== '').join('\n\n');
    return head + (head && body ? '\n' : '') + (body ? body + '\n' : '');
  },

  /** Contrôle d'un texte (généré par une IA, écrit à la main…) → [{ line, message }]. Vide si l'éditeur relit tout sans perte. */
  lint(markdown) {
    const fm = Blocks.frontmatter(markdown);
    const { chunks, problems } = Blocks.split(fm.body, fm.offset);
    const out = fm.error ? [fm.error, ...problems] : [...problems];
    for (const c of chunks) {
      const m = /^> ?\[!(\w+)\]/.exec(c.text);
      if (m && !Blocks.CALLOUTS.includes(m[1].toLowerCase())) out.push({ line: c.line, message: `Type d’encadré inconnu « ${m[1]} » (connus : ${Blocks.CALLOUTS.join(', ')})` });
      else if (Blocks.fromMarkdown(c.text).type === 'raw') out.push({ line: c.line, message: 'Bloc non reconnu, gardé tel quel : « ' + c.text.split('\n')[0].slice(0, 60) + ' »' });
    }
    return out.sort((a, b) => a.line - b.line);
  },

  // ---- Texte visible ⇄ Markdown ----
  esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
  attr(s) { return Blocks.esc(s).replace(/"/g, '&quot;'); },
  unesc(s) { return s.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (m) => Blocks.ENTITIES[m]); },
  /** Une ligne de Markdown → texte sans mise en forme. */
  plain(md) { return Blocks.unesc(Blocks.inlineHtml(md).replace(/<[^>]+>/g, '')); },

  /** Une ligne de Markdown → HTML : code, gras, italique, souligné, surligné, liens. Tout le reste reste du texte. */
  inlineHtml(md) {
    const re = /\\([\\`*_{}[\]()#+\-.!>=:|~])|`([^`\n]+)`|\*\*(\S(?:.*?\S)?)\*\*|\*(\S(?:.*?\S)?)\*|\+\+(\S(?:.*?\S)?)\+\+|==(\S(?:.*?\S)?)==|\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^)\s]+)\)/g;
    let out = '';
    let at = 0;
    let m;
    while ((m = re.exec(md))) {
      out += Blocks.esc(md.slice(at, m.index));
      at = re.lastIndex;
      if (m[1] !== undefined) out += Blocks.esc(m[1]);
      else if (m[2] !== undefined) out += '<code>' + Blocks.esc(m[2]) + '</code>';
      else if (m[3] !== undefined) out += '<strong>' + Blocks.inlineHtml(m[3]) + '</strong>';
      else if (m[4] !== undefined) out += '<em>' + Blocks.inlineHtml(m[4]) + '</em>';
      else if (m[5] !== undefined) out += '<u>' + Blocks.inlineHtml(m[5]) + '</u>';
      else if (m[6] !== undefined) out += '<mark>' + Blocks.inlineHtml(m[6]) + '</mark>';
      else out += '<a href="' + Blocks.attr(m[8]) + '">' + Blocks.inlineHtml(m[7]) + '</a>';
    }
    return out + Blocks.esc(md.slice(at));
  },

  /** Lignes de Markdown → HTML d'un champ modifiable : lignes séparées par `<br>`, listes en `<ul><li>` / `<ol><li>`. */
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

  /** Lignes de Markdown → HTML publié : paragraphes `<p>` (lignes jointes par `<br>`), listes `<ul>` / `<ol>`. */
  flowHtml(lines) {
    const out = [];
    let para = [];
    let list = null;
    const flushPara = () => { if (para.length) out.push(`<p>${para.map(Blocks.inlineHtml).join('<br>')}</p>`); para = []; };
    const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((x) => `<li>${Blocks.inlineHtml(x)}</li>`).join('')}</${list.tag}>`); list = null; };
    for (const l of lines) {
      const m = /^(?:(-)|\d+\.) (.*)$/.exec(l);
      if (m) {
        flushPara();
        const tag = m[1] ? 'ul' : 'ol';
        if (list && list.tag !== tag) flushList();
        list = list || { tag, items: [] };
        list.items.push(m[2]);
      } else if (l.trim() === '') { flushPara(); flushList(); }
      else { flushList(); para.push(l); }
    }
    flushPara();
    flushList();
    return out.join('');
  },

  /** Adresse acceptée pour un lien (sinon : pas de lien). */
  safeHref(href) {
    const h = Blocks.unesc(href).trim();
    const full = /^(https?:\/\/|mailto:|tel:)/i.test(h) ? h : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(h) ? 'https://' + h : '';
    return full.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
  },

  /** Texte tapé → Markdown : les signes qui changeraient le sens sont protégés par « \ ». */
  escText(s) {
    return s.replace(/\\/g, '\\\\').replace(/[*[\]`]/g, '\\$&').replace(/\+\+/g, '\\+\\+').replace(/==/g, '\\=\\=')
      .replace(/(^|\W)_|_(?=\W|$)/g, (x) => x.replace('_', '\\_'));
  },

  /** HTML d'un champ modifiable → Markdown (gère `<ul><li>`, `<ol><li>`, et protège les signes Markdown). */
  htmlToMd(html, bullets = false) {
    const lines = [];
    let cur = '';
    let liPrefix = '';
    const lists = [];
    const start = bullets ? /^(#{1,6} |\+ |>|:::|~~~|\|)/ : /^(#{1,6} |[-+] |>|:::|~~~|\|)/;
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
      lines.push(cur.replace(start, '\\$1').replace(/^(\d+)([.)]) /, '$1\\$2 ').replace(/^(-{3,}\s*)$/, '\\$1'));
      cur = '';
    };
    const MARKS = { b: '**', strong: '**', i: '*', em: '*', u: '++', mark: '==', a: 'a', code: '`' };
    const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^>]*)?)>|([^<]+)/g;
    let m;
    while ((m = re.exec(html))) {
      if (m[4] !== undefined) {
        const text = Blocks.unesc(m[4]).replace(/\u00a0/g, ' ');
        const inCode = frames.length && frames[frames.length - 1].tag === 'code';
        put(inCode ? text : Blocks.escText(text));
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
          if (core === '') put(lead + trail);
          else if (f.tag === 'a') put(f.href ? `${lead}[${core}](${f.href})${trail}` : lead + core + trail);
          else if (f.tag === 'code') put(core.includes('`') ? lead + Blocks.escText(core) + trail : lead + '`' + core + '`' + trail);
          else put(lead + f.mark + core + f.mark + trail);
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

  // ---- Bloc Markdown ⇄ modèle ----
  // Modèle : { type, ...champs du type }. Un bloc est lu par le premier type dont l'écriture redonne le même texte ; sinon il reste « raw ».

  /** Comparaison tolérante aux espaces de fin de ligne et aux lignes vides autour, jamais à l'indentation. */
  tidy(x) { return x.split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/^\n+|\n+$/g, ''); },

  fromMarkdown(md) {
    const t = Blocks.tidy(md);
    for (const type of Blocks.order) {
      const def = Blocks.types[type];
      const m = def.match ? def.match(t) : null;
      if (m && Blocks.tidy(def.toMarkdown(m)) === t) return { type, ...m };
    }
    return { type: 'raw', md };
  },

  /** Modèle → Markdown du bloc (vide si le bloc est vide : il disparaît à l'enregistrement). */
  toMarkdown(b) { return Blocks.def(b.type).toMarkdown(b); },

  /** Modèle d'un bloc neuf : vide, c'est le texte d'aide qui guide. */
  blank(type) { return { type, ...Blocks.def(type).blank() }; },

  isEmpty(b) { return Blocks.toMarkdown(b).trim() === ''; },
  stripTags(html) { return Blocks.unesc(html.replace(/<\/li>/gi, '\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')); },

  /** Lignes Markdown d'un bloc texte (le titre d'un encadré devient une première ligne en gras). */
  mdLines(b) {
    const lines = Blocks.htmlToMd(b.html ?? '', true).split('\n').filter((l) => l.trim() !== '');
    return b.title ? ['**' + b.title + '**', ...lines] : lines;
  },
  /** Les lignes d'un bloc texte, en HTML, sans puces : sert à vérifier qu'une conversion ne perd rien. */
  lines(b) { return Blocks.mdLines(b).map((l) => l.replace(/^(?:[-*]|\d+\.) /, '')).map(Blocks.inlineHtml); },

  /** Convertit un bloc texte en un autre type texte. Entre encadrés, l'icône et le titre suivent ; sinon le titre devient une ligne. */
  convert(b, type) {
    if (b.type === type) return b;
    const to = Blocks.def(type);
    const keep = Blocks.CALLOUTS.includes(b.type) && Blocks.CALLOUTS.includes(type);
    const lines = keep ? Blocks.htmlToMd(b.html ?? '', true).split('\n').filter((l) => l.trim() !== '') : Blocks.mdLines(b);
    if (to.single) return { type, html: Blocks.esc(Blocks.stripTags(lines.map(Blocks.inlineHtml).join(' ').replace(/<\/li>/g, ' ')).replace(/\s+/g, ' ').trim()) };
    return { ...Blocks.blank(type), ...(keep ? { icon: b.icon, title: b.title } : {}), html: Blocks.linesToHtml(lines) };
  },

  /** Fusionne deux blocs voisins : le type du dessus l'emporte, les lignes du dessous suivent. null si impossible (titre au-dessus, média, bloc avancé). */
  merge(top, bottom) {
    const K = Blocks.TEXT_KEYS;
    if (Blocks.def(top.type).single || !K.includes(top.type) || !K.includes(bottom.type)) return null;
    const own = Blocks.htmlToMd(top.html ?? '', true).split('\n').filter((l) => l.trim() !== '');
    const below = Blocks.def(bottom.type).single ? [Blocks.htmlToMd(Blocks.esc(Blocks.stripTags(bottom.html)))] : Blocks.mdLines(bottom);
    return { ...top, html: Blocks.linesToHtml([...own, ...below]) };
  },

  /** Premier caractère visible de `text` s'il est un emoji (drapeau, famille, teinte, touche compris), sinon ''. */
  firstEmoji(text) {
    const first = new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(String(text).trim())[Symbol.iterator]().next().value;
    return first && /\p{Extended_Pictographic}|\p{Regional_Indicator}|\u20E3/u.test(first.segment) ? first.segment : '';
  },

  /** Identifiant d'ancre : minuscules, sans accents, tirets. */
  slug(text) {
    return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section';
  },

  /** Adresse de lecteur intégré pour un lien YouTube ou Vimeo (vide si l'adresse n'est pas reconnue). */
  embedUrl(url) {
    let m;
    if ((m = /^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([\w-]{11})/i.exec(url)) || (m = /^https?:\/\/youtu\.be\/([\w-]{11})/i.exec(url))) return 'https://www.youtube-nocookie.com/embed/' + m[1];
    if ((m = /^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i.exec(url))) return 'https://player.vimeo.com/video/' + m[1];
    return '';
  },
  /** Adresse d'une image : « media/<id> » est réécrit avec l'adresse des médias de l'hôte. */
  mediaUrl(src, media = 'media/') { return src.startsWith('media/') ? media + src.slice(6) : src; },

  // ---- Rendu publié : HTML sémantique, classes bq-*, sans Tailwind (feuille blockquilt-content.css) ----

  /** Un bloc → HTML. `ctx` : { media, ids } (ids : ancres déjà prises dans la page). */
  blockHtml(b, ctx = {}) { return Blocks.def(b.type).toHtml(b, { media: 'media/', ids: new Set(), ...ctx }); },

  /** Texte complet → `<article class="bq-content">`. options : { media: 'media/', title: true (h1 depuis le frontmatter) }. */
  toHtml(markdown, options = {}) {
    const { media = 'media/', title = true } = typeof options === 'string' ? { media: options } : options;
    const { meta, blocks } = Blocks.parse(markdown);
    const ctx = { media, ids: new Set() };
    const icon = meta.icon ? `<span class="bq-icon" aria-hidden="true">${Blocks.esc(meta.icon)}</span> ` : '';
    const head = title && meta.title ? `<header><h1>${icon}${Blocks.esc(meta.title)}</h1></header>\n` : '';
    return `<article class="bq-content">\n${head}${blocks.map((b) => Blocks.def(b.type).toHtml(b, ctx)).filter(Boolean).join('\n')}\n</article>`;
  },
};

// ---- Types de base ----
{
  const body = (html) => Blocks.htmlToMd(html, true);
  const quoted = (x) => x.split('\n').map((l) => (l ? '> ' + l : '>')).join('\n');
  const lead = /^(#{1,6} |:::|>|\||```|~~~|-{3,}\s*$)/;
  const tone = (card, badge) => ({ card, badge });

  const heading = (type, level, label) => Blocks.register(type, {
    label, short: label.replace('Titre ', ''), icon: 'heading', convertible: true, single: true,
    tone: tone('bg-white border-stone-300/90 text-stone-900', 'bg-stone-100 text-stone-700 border-stone-200/90'),
    match: (t) => { const m = new RegExp(`^#{${level}} (.+)$`).exec(t); return m ? { html: Blocks.esc(Blocks.plain(m[1])) } : null; },
    toMarkdown: (b) => { const x = Blocks.htmlToMd(Blocks.esc(Blocks.stripTags(b.html))).replace(/\n+/g, ' ').trim(); return x ? '#'.repeat(level) + ' ' + x : ''; },
    toHtml: (b, ctx) => {
      const text = Blocks.stripTags(b.html).trim();
      let id = Blocks.slug(text);
      for (let n = 2; ctx.ids.has(id); n++) id = Blocks.slug(text) + '-' + n;
      ctx.ids.add(id);
      return `<h${level} id="${id}">${Blocks.esc(text)}</h${level}>`;
    },
    blank: () => ({ html: '' }),
  });
  heading('h2', 2, 'Titre H2');
  heading('h3', 3, 'Titre H3');

  Blocks.register('text', {
    label: 'Texte', short: 'Texte', icon: 'align_left', convertible: true,
    tone: tone('bg-[#FAF8F5] border-stone-200/90 text-stone-800', 'bg-stone-200/80 text-stone-800 border-stone-300/80'),
    match: (t) => {
      const lines = t.split('\n');
      if (lines.some((l) => lead.test(l)) || Blocks.PHOTO.test(t) || Blocks.VIDEO.test(t)) return null;
      const html = Blocks.linesToHtml(lines);
      return { html: body(html) === t ? html : lines.map(Blocks.inlineHtml).join('<br>') };
    },
    toMarkdown: (b) => body(b.html),
    toHtml: (b) => Blocks.flowHtml(body(b.html).split('\n')),
    blank: () => ({ html: '' }),
  });

  Blocks.register('quote', {
    label: 'Citation', short: 'Citation', icon: 'quote', convertible: true,
    tone: tone('bg-white border-stone-200/90 border-l-4 border-l-stone-400 text-stone-700', 'bg-stone-100 text-stone-700 border-stone-200'),
    match: (t) => {
      const lines = t.split('\n');
      if (!lines.every((l) => l.startsWith('>')) || /^> ?\[!/.test(t)) return null;
      return { html: Blocks.linesToHtml(lines.map((l) => l.replace(/^> ?/, ''))) };
    },
    toMarkdown: (b) => { const x = body(b.html); return x.trim() ? quoted(x) : ''; },
    toHtml: (b) => `<blockquote>${Blocks.flowHtml(body(b.html).split('\n'))}</blockquote>`,
    blank: () => ({ html: '' }),
  });

  // Encadrés : `> [!type]`, puis facultatifs un emoji (icône) et un titre ; le texte suit, ligne à ligne.
  const callout = (type, label, icon, emoji, card, badge) => Blocks.register(type, {
    label, short: label, icon, emoji, convertible: true, callout: true, tone: tone(card, badge),
    match: (t) => {
      const [first, ...rest] = t.split('\n');
      const m = /^> \[!(\w+)\](?: (.*))?$/.exec(first);
      if (!m || m[1] !== type || !rest.every((l) => l.startsWith('>'))) return null;
      const head = (m[2] ?? '').trim();
      const chosen = Blocks.firstEmoji(head);
      return { icon: chosen, title: head.slice(chosen.length).trim(), html: Blocks.linesToHtml(rest.map((l) => l.replace(/^> ?/, ''))) };
    },
    toMarkdown: (b) => {
      const x = body(b.html);
      const title = (b.title || '').replace(/\s+/g, ' ').trim();
      if (x.trim() === '' && !title) return '';
      const head = `> [!${type}]` + (b.icon ? ' ' + b.icon : '') + (title ? ' ' + title : '');
      return x.trim() === '' ? head : head + '\n' + quoted(x);
    },
    toHtml: (b) => {
      const title = (b.title || '').trim();
      const head = b.icon || title ? `<p class="bq-callout-title">${b.icon ? `<span class="bq-icon" aria-hidden="true">${Blocks.esc(b.icon)}</span> ` : ''}${Blocks.inlineHtml(title)}</p>` : '';
      return `<aside class="bq-callout bq-callout-${type}" role="note" aria-label="${Blocks.attr(title || label)}">${head}${Blocks.flowHtml(body(b.html).split('\n'))}</aside>`;
    },
    blank: () => ({ icon: '', title: '', html: '' }),
  });
  callout('info', 'Info', 'info', 'ℹ️', 'bg-sky-50 border-sky-200/90 text-sky-950', 'bg-sky-100 text-sky-900 border-sky-300/80');
  callout('tip', 'Astuce', 'sparkles', '💡', 'bg-[#EEF6F0] border-emerald-200/90 text-emerald-950', 'bg-emerald-100 text-emerald-900 border-emerald-300/80');
  callout('success', 'Succès', 'check', '✅', 'bg-lime-50 border-lime-200/90 text-lime-950', 'bg-lime-100 text-lime-900 border-lime-300/80');
  callout('warning', 'Attention', 'triangle_alert', '⚠️', 'bg-[#FDF6E9] border-amber-200/90 text-amber-950', 'bg-amber-100 text-amber-900 border-amber-300/80');
  callout('danger', 'Danger', 'octagon_alert', '🚨', 'bg-rose-50 border-rose-200/90 text-rose-950', 'bg-rose-100 text-rose-900 border-rose-300/80');

  Blocks.register('photo', {
    label: 'Photo', short: 'Photo', icon: 'image', group: 'media',
    tone: tone('bg-white border-stone-200/90 text-stone-800', 'bg-stone-100 text-stone-700 border-stone-200'),
    match: (t) => { const m = Blocks.PHOTO.exec(t); return m ? { src: m[2], alt: Blocks.plain(m[1]) } : null; },
    toMarkdown: (b) => (b.src ? `![${Blocks.htmlToMd(Blocks.esc(b.alt)).replace(/\n/g, ' ')}](${b.src})` : ''),
    toHtml: (b, ctx) => `<figure><img src="${Blocks.attr(Blocks.mediaUrl(b.src, ctx.media))}" alt="${Blocks.attr(b.alt)}" loading="lazy">${b.alt ? `<figcaption>${Blocks.esc(b.alt)}</figcaption>` : ''}</figure>`,
    blank: () => ({ src: '', alt: '' }),
  });

  Blocks.register('video', {
    label: 'Vidéo', short: 'Vidéo', icon: 'video', group: 'media',
    tone: tone('bg-rose-50/50 border-rose-200/80 text-rose-950', 'bg-rose-100 text-rose-900 border-rose-200'),
    match: (t) => (Blocks.VIDEO.test(t) ? { url: t } : null),
    toMarkdown: (b) => b.url.trim(),
    toHtml: (b) => {
      const src = Blocks.embedUrl(b.url);
      return src
        ? `<figure class="bq-video"><iframe src="${Blocks.attr(src)}" title="Vidéo" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></figure>`
        : `<p><a href="${Blocks.attr(b.url)}">${Blocks.esc(b.url)}</a></p>`;
    },
    blank: () => ({ url: '' }),
  });

  Blocks.register('hr', {
    label: 'Ligne horizontale', short: 'Ligne', icon: 'minus', group: 'structure',
    tone: tone('bg-white border-stone-200/90 text-stone-500', 'bg-stone-100 text-stone-700 border-stone-200'),
    match: (t) => (t === '---' ? {} : null),
    toMarkdown: () => '---',
    toHtml: () => '<hr>',
    blank: () => ({}),
  });

  Blocks.register('code', {
    label: 'Code', short: 'Code', icon: 'code', group: 'structure',
    tone: tone('bg-slate-50 border-slate-300/90 text-slate-900', 'bg-slate-200 text-slate-800 border-slate-300'),
    match: (t) => { const m = /^(`{3,})([\w+#.-]*)\n([\s\S]*?)\n?\1$/.exec(t); return m ? { lang: m[2], code: m[3] } : null; },
    toMarkdown: (b) => {
      if (b.code.trim() === '') return '';
      const longest = Math.max(2, ...(b.code.match(/^`{3,}/gm) || []).map((x) => x.length));
      const fence = '`'.repeat(longest + 1);
      return `${fence}${b.lang || ''}\n${b.code}\n${fence}`;
    },
    toHtml: (b) => `<pre><code${b.lang ? ` class="language-${Blocks.attr(b.lang)}"` : ''}>${Blocks.esc(b.code)}</code></pre>`,
    blank: () => ({ lang: '', code: '' }),
  });

  // Repli : tout ce que l'éditeur ne sait pas refaire à l'identique reste du texte tel quel, affiché sans être interprété.
  Blocks.register('raw', {
    label: 'Texte source', short: 'Source', icon: 'sliders', group: 'none',
    tone: tone('bg-white border-dashed border-stone-300 text-stone-800', 'bg-stone-100 text-stone-700 border-stone-200'),
    toMarkdown: (b) => b.md ?? '',
    toHtml: (b) => `<pre class="bq-raw">${Blocks.esc(b.md ?? '')}</pre>`,
    blank: () => ({ md: '' }),
  });
}

if (typeof module !== 'undefined') module.exports = Blocks;
