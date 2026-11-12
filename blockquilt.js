// Éditeur de rubrique « Bento pastel » : le texte reste du Markdown. On le coupe en blocs pour l'écran, on le recolle à l'enregistrement.
// Chaque bloc a un type qui porte le sens (astuce, consigne, conseil…). L'hôte ne voit jamais de Markdown : il voit du gras, des listes, des teintes.
// Un bloc que l'éditeur ne sait pas refaire à l'identique (tableau, code…) reste du texte tel quel (type « raw ») : rien n'est jamais abîmé.
const Blocks = {
  // Classes Tailwind : `card` = fond et bordure du bloc, `badge` = pastille du type.
  TYPES: {
    title: { label: 'Titre de section', short: 'Titre', desc: 'Sous-titre structurant pour découper la fiche', icon: 'heading', card: 'bg-white border-stone-300/90 text-stone-900', badge: 'bg-stone-100 text-stone-700 border-stone-200/90' },
    text: { label: 'Texte / Explication', short: 'Texte', desc: 'Paragraphe fluide ou liste sur fond ivoire doux', icon: 'align_left', card: 'bg-[#FAF8F5] border-stone-200/90 text-stone-800', badge: 'bg-stone-200/80 text-stone-800 border-stone-300/80' },
    tip: { label: 'Astuce pratique', short: 'Astuce', desc: 'Vert sauge apaisant pour faciliter le séjour', icon: 'sparkles', mark: '💡', card: 'bg-[#EEF6F0] border-emerald-200/90 text-emerald-950', badge: 'bg-emerald-100 text-emerald-900 border-emerald-300/80' },
    advice: { label: 'Conseil local / Recommandation', short: 'Conseil', desc: 'Lavande pastel pour vos bonnes adresses et coups de cœur', icon: 'compass', mark: '🧭', card: 'bg-[#F3F1FA] border-indigo-200/80 text-indigo-950', badge: 'bg-indigo-100 text-indigo-900 border-indigo-300/80' },
    warning: { label: 'Consigne / Vigilance', short: 'Consigne', desc: 'Ambre sable doux pour ce qu’il faut faire ou éviter', icon: 'triangle_alert', mark: '⚠️', card: 'bg-[#FDF6E9] border-amber-200/90 text-amber-950', badge: 'bg-amber-100 text-amber-900 border-amber-300/80' },
    photo: { label: 'Photo explicative', short: 'Photo', desc: 'Montrer un bouton, un compteur ou l’emplacement exact', icon: 'image', card: 'bg-white border-stone-200/90 text-stone-800', badge: 'bg-stone-100 text-stone-700 border-stone-200' },
    audio: { label: 'Mémo Vocal', short: 'Vocal', desc: 'Bientôt disponible', icon: 'mic', soon: true, card: 'bg-purple-50/60 border-purple-200/80 text-purple-950', badge: 'bg-purple-100 text-purple-900 border-purple-200' },
    video: { label: 'Vidéo (YouTube, Vimeo)', short: 'Vidéo', desc: 'Une courte démonstration, par exemple allumer le poêle', icon: 'video', card: 'bg-rose-50/50 border-rose-200/80 text-rose-950', badge: 'bg-rose-100 text-rose-900 border-rose-200' },
    raw: { label: 'Mise en forme avancée', short: 'Avancé', desc: '', icon: 'sliders', card: 'bg-white border-dashed border-stone-300 text-stone-800', badge: 'bg-stone-100 text-stone-700 border-stone-200' },
  },
  TEXT_KEYS: ['title', 'text', 'tip', 'advice', 'warning'],
  MEDIA_KEYS: ['photo', 'audio', 'video'],
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
      else if (m[5] !== undefined) out += '<mark class="ehg-highlight">' + Blocks.inlineHtml(m[5]) + '</mark>';
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
  // Modèle : { type, html } (title, text, tip, advice, warning) · { type:'photo', file, alt } · { type:'video', url } · { type:'raw', md }

  fromMarkdown(md) {
    const t = md.trim();
    const quote = (lead) => ({ '💡': 'tip', '🧭': 'advice', '⚠️': 'warning', '🚨': 'warning', '❗': 'warning' })[lead] ?? (lead === '' ? 'tip' : null);
    let b = null;
    let m;
    const lines = t.split('\n');
    // Rétrocompatibilité : un ancien bloc :::sensible est repris comme bloc texte normal (sans perte d'information).
    if (/^:::sensible/.test(t) && (m = /^:::sensible[ \t]*\n?([\s\S]*?)\n?:::\s*$/.exec(t))) {
      const inner = m[1].trim() === '' ? [] : m[1].trim().split('\n');
      return { type: 'text', html: Blocks.linesToHtml(inner) };
    }
    if ((m = /^!\[((?:\\.|[^\]\\])*)\]\(media\/([^)\s]+)\)$/.exec(t))) {
      b = { type: 'photo', file: m[2], alt: Blocks.plain(m[1]) };
    } else if (Blocks.VIDEO.test(t)) {
      b = { type: 'video', url: t };
    } else if (lines.length === 1 && /^### /.test(t)) {
      b = { type: 'title', html: Blocks.esc(Blocks.plain(t.slice(4))) };
    } else if (lines.every((l) => l.startsWith('>'))) {
      const lead = (/^> ?(💡|⚠️|🚨|❗|🧭)/u.exec(t) || [, ''])[1];
      const type = quote(lead);
      const stripped = lines.map((l) => l.replace(/^> ?(?:💡|⚠️|🚨|❗|🧭)? ?/u, ''));
      if (type) b = { type, mark: lead, html: Blocks.linesToHtml(stripped) };
    } else if (!/^\s*\|/m.test(t) && !/^(#{1,6} |:::|!\[|>)/.test(t)) {
      b = { type: 'text', html: Blocks.linesToHtml(lines) };
      if (Blocks.toMarkdown(b) !== lines.map((l) => l.replace(/\s+$/, '')).join('\n').trim()) {
        b = { type: 'text', html: lines.map(Blocks.inlineHtml).join('<br>') };
      }
    }
    const tidy = (x) => x.split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').trim();
    return b && tidy(Blocks.toMarkdown(b)) === tidy(t) ? b : { type: 'raw', md };
  },

  /** Modèle → Markdown du bloc (vide si le bloc est vide : il disparaît à l'enregistrement). */
  toMarkdown(b) {
    const body = (html) => Blocks.htmlToMd(html, true);
    switch (b.type) {
      case 'title': { const x = Blocks.htmlToMd(b.html).replace(/\n+/g, ' ').trim(); return x ? '### ' + x : ''; }
      case 'text': return body(b.html);
      case 'tip': case 'advice': case 'warning': {
        const x = body(b.html);
        if (x.trim() === '') return '';
        const mark = b.mark ?? Blocks.TYPES[b.type].mark;
        const [first, ...rest] = x.split('\n');
        return [`> ${mark ? mark + ' ' : ''}${first}`, ...rest.map((l) => '> ' + l)].join('\n');
      }
      case 'photo': return b.file ? `![${Blocks.htmlToMd(Blocks.esc(b.alt)).replace(/\n/g, ' ')}](media/${b.file})` : '';
      case 'video': return b.url.trim();
      default: return b.md ?? '';
    }
  },

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
    if (type === 'title') return { type, html: Blocks.esc(Blocks.stripTags(L.join(' ')).replace(/\s+/g, ' ').trim()) };
    const rawLines = Blocks.htmlToMd(b.html ?? '', true).split('\n').filter((l) => l.trim() !== '');
    const html = rawLines.length ? Blocks.linesToHtml(rawLines) : L.join('<br>');
    return { type, html, ...(Blocks.TYPES[type].mark ? { mark: Blocks.TYPES[type].mark } : {}) };
  },

  /** Fusionne deux blocs voisins : le type du dessus l'emporte, les lignes du dessous suivent. null si impossible (titre au-dessus, photo, vidéo, bloc avancé). */
  merge(top, bottom) {
    if (top.type === 'title' || !Blocks.TEXT_KEYS.includes(top.type) || !Blocks.TEXT_KEYS.includes(bottom.type)) return null;
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

  /** Modèle d'un bloc neuf : vide, c'est le texte d'aide qui guide. */
  blank(type) {
    return {
      title: { type, html: '' }, text: { type, html: '' }, tip: { type, html: '', mark: '💡' }, advice: { type, html: '', mark: '🧭' }, warning: { type, html: '', mark: '⚠️' },
      photo: { type, file: '', alt: '' }, video: { type, url: '' },
    }[type];
  },
};
if (typeof module !== 'undefined') module.exports = Blocks;

// ---- Écran : actif seulement si la page contient #ehg ----
(function () {
  const root = typeof document !== 'undefined' ? document.getElementById('ehg') : null;
  if (!root) return;
  const $ = (s, r = root) => r.querySelector(s);
  const media = root.dataset.media;
  const csrf = root.dataset.csrf;
  const saveUrl = root.dataset.save;
  const previewUrl = root.dataset.preview;
  const uploadUrl = root.dataset.upload;
  const canvas = $('[data-canvas]');
  const pill = $('[data-pill]');
  const status = $('[data-status]');
  const titleEl = $('[data-title]');
  const iconEl = $('[data-icon]');
  const toast = $('[data-toast]');
  const T = Blocks.TYPES;

  let slug = root.dataset.slug;
  let icon = '';
  let blocks = [];
  let dirty = false;
  let guestMode = false;
  let insertAt = null; // null = en bas
  let deleteId = null;
  let activeBlockId = null;
  let fullscreenId = null;
  let nextId = 1;

  const ic = (name, cls = 'size-4') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><use href="#ic-${name}"/></svg>`;
  const esc = Blocks.esc;
  const attr = (s) => esc(s).replace(/"/g, '&quot;');
  const showToast = (text) => {
    $('[data-toast-text]').textContent = text;
    toast.classList.remove('opacity-0');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.add('opacity-0'), 1800);
  };

  // ---- État enregistré (grisé) / à enregistrer (vert avec icône disquette) ----
  const setDirty = (value) => {
    if (dirty === value && status.innerHTML !== '') return;
    dirty = value;
    status.innerHTML = `${ic('save', 'size-3.5')} <span>${value ? 'Enregistrer' : 'Enregistré'}</span>`;
    status.disabled = !value;
    status.className = value
      ? 'inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-brand-700 active:scale-95 transition-all'
      : 'inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-100 px-3 py-1.5 text-xs font-semibold text-stone-400 transition-all';
  };
  addEventListener('beforeunload', (event) => { if (dirty) { event.preventDefault(); event.returnValue = ''; } });

  // ---- Titre et icône de la rubrique : « ## 🔑 Arrivée » ----
  const splitHeading = Blocks.splitHeading;
  const heading = () => '## ' + [icon, titleEl.textContent.trim()].filter(Boolean).join(' ');
  const showIcon = () => { iconEl.textContent = icon || '📄'; };

  // ---- Lecture de l'écran vers le modèle (avant tout nouveau dessin) ----
  const syncFromDom = () => {
    if (guestMode) return;
    canvas.querySelectorAll('[data-id]').forEach((card) => {
      const b = blocks.find((x) => x.id === card.dataset.id);
      if (!b) return;
      const rich = (sel) => $(sel, card)?.innerHTML ?? '';
      if (['title', 'text', 'tip', 'advice', 'warning'].includes(b.type)) b.html = rich('[data-body]');
      else if (b.type === 'photo') b.alt = $('[data-body]', card).textContent;
      else if (b.type === 'video') b.url = $('[data-url]', card).value;
      else if (b.type === 'raw') b.md = $('[data-raw]', card).value;
    });
  };
  const markdown = () => {
    syncFromDom();
    return Blocks.serialize(heading(), blocks.map((b) => ({ text: Blocks.toMarkdown(b) })));
  };

  // ---- Dessin : bouton + Insérer au milieu SANS trait horizontal ----
  const gapBtn = 'inline-flex h-7 items-center justify-center gap-1 rounded-full border border-stone-200/90 bg-white px-3 text-[11px] font-bold text-stone-600 shadow-sm transition-all hover:border-stone-400 hover:bg-stone-50 active:scale-95';
  const gap = (index, label) => {
    const canMerge = index > 0 && index < blocks.length && Blocks.merge(blocks[index - 1], blocks[index]) !== null;
    return `<div class="flex items-center justify-center gap-2 py-2.5">
      <button type="button" data-insert="${index}" aria-label="${label}" class="${gapBtn}">${ic('plus', 'size-3.5')}<span>Insérer</span></button>
      ${canMerge ? `<button type="button" data-merge="${index}" aria-label="Fusionner le bloc n°${index + 1} dans le bloc n°${index}" class="${gapBtn}">${ic('fold_vertical', 'size-3.5')}<span>Fusionner</span></button>` : ''}
    </div>`;
  };

  const editable = (cls, html, ph, extra = '') => `<div ${extra} contenteditable="true" role="textbox" aria-multiline="true" spellcheck="false" data-placeholder="${attr(ph)}" class="ehg-edit ${cls}">${html}</div>`;

  const body = (b) => {
    switch (b.type) {
      case 'title': return editable('font-news text-base sm:text-lg font-semibold leading-tight tracking-tight text-stone-900', b.html, 'Saisissez un titre de section…', 'data-body data-plain');
      case 'photo': return `<div class="space-y-2">${b.file ? `<div class="overflow-hidden rounded-xl border border-stone-200 bg-stone-100"><img src="${attr(media + b.file)}" alt="" class="h-36 w-full object-cover"></div>` : ''}
          ${editable('text-xs italic text-stone-600', esc(b.alt), 'Légende de la photo (lue aux personnes malvoyantes)…', 'data-body data-plain')}</div>`;
      case 'video': return `<div class="space-y-2"><div class="flex h-24 flex-col items-center justify-center gap-1 rounded-xl bg-stone-900 text-white"><span class="flex size-9 items-center justify-center rounded-full bg-white/20">${ic('video', 'size-4')}</span><span class="text-[11px] text-stone-300">Lecteur affiché à l’invité</span></div>
          <input data-url type="url" value="${attr(b.url)}" class="w-full rounded-lg border border-rose-200 bg-white/80 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/40" placeholder="https://www.youtube.com/watch?v=…" aria-label="Lien de la vidéo"></div>`;
      case 'raw': return `<div class="space-y-1"><textarea data-raw rows="3" class="w-full rounded-xl border border-stone-300 bg-white p-3 font-mono text-xs leading-5" aria-label="Contenu du bloc">${esc(b.md)}</textarea></div>`;
      default: return editable('min-h-10 text-sm leading-relaxed', b.html, 'Insérez votre texte…', 'data-body data-rich');
    }
  };

  // Structure de bloc :
  // (type contenu)   []fullscreen   | haut
  // contenu                         | drag
  //                  []poubelle     | bas
  const card = (b, i) => {
    const t = T[b.type];
    const isTitle = b.type === 'title';
    const isFull = fullscreenId === b.id;
    const canFullscreen = ['text', 'tip', 'advice', 'warning', 'raw'].includes(b.type);
    const head = Blocks.TEXT_KEYS.includes(b.type)
      ? `<div class="relative inline-flex items-center">${ic(t.icon, 'pointer-events-none absolute left-2.5 size-3.5 opacity-80')}
          <select data-convert aria-label="Type du bloc" class="cursor-pointer appearance-none rounded-full border py-0.5 pl-7 pr-6 text-[11px] font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500 ${t.badge}">
            ${Blocks.TEXT_KEYS.map((k) => `<option value="${k}" ${k === b.type ? 'selected' : ''}>${T[k].label}</option>`).join('')}</select>
          ${ic('chevron_down', 'pointer-events-none absolute right-2 size-3 opacity-70')}</div>`
      : `<span class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${t.badge}">${ic(t.icon, 'size-3.5')}<span>${t.label}</span></span>`;
    const fsBtn = canFullscreen
      ? `<button type="button" data-fullscreen aria-label="${isFull ? 'Quitter le plein écran' : 'Plein écran'}" title="${isFull ? 'Quitter le plein écran' : 'Plein écran'}" class="-mr-1.5 -mt-1 flex size-8 items-center justify-center rounded-xl text-stone-500 hover:bg-black/5 hover:text-stone-900">${ic(isFull ? 'minimize' : 'maximize', 'size-3.5')}</button>`
      : '<span></span>';
    const rail = (name, act, label, disabled) => `<button type="button" data-move="${act}" ${disabled ? 'disabled' : ''} aria-label="${label}" class="flex ${isTitle ? 'size-7' : 'size-8'} items-center justify-center rounded-lg text-stone-500 active:bg-white/80 disabled:pointer-events-none disabled:opacity-20">${ic(name, 'size-3.5')}</button>`;
    return `<article data-id="${b.id}" class="ehg-card flex items-stretch overflow-hidden rounded-2xl border ${t.card} ${isFull ? 'ehg-fullscreen' : ''}">
        <div class="flex min-w-0 flex-1 flex-col ${isTitle ? 'px-3.5 py-2.5' : 'p-3.5'}">
          <div class="${isTitle ? 'mb-1' : 'mb-2'} flex items-center justify-between gap-2">${head}${fsBtn}</div>
          <div class="flex-1">${body(b)}</div>
          <div class="mt-2 flex justify-end">
            <button type="button" data-delete aria-label="Supprimer ce bloc" class="-mb-1 -mr-1.5 flex size-8 items-center justify-center rounded-xl text-red-600 hover:bg-red-50 active:bg-red-100">${ic('trash2', 'size-3.5')}</button>
          </div>
        </div>
        <div class="flex w-10 shrink-0 select-none flex-col items-center justify-between border-l border-black/5 bg-black/[0.02] py-1">
          ${rail('chevron_up', '-1', 'Monter ce bloc', i === 0)}
          <div data-grip role="button" aria-label="Glisser pour déplacer" class="flex ${isTitle ? 'size-7' : 'size-8'} cursor-grab touch-none items-center justify-center rounded-lg text-stone-400 active:cursor-grabbing">${ic('grip', 'size-3.5')}</div>
          ${rail('chevron_down', '1', 'Descendre ce bloc', i === blocks.length - 1)}</div></article>`;
  };

  const render = () => (guestMode ? renderGuest() : renderEdit());
  const renderEdit = () => {
    canvas.innerHTML = `${blocks.length ? gap(0, 'Insérer un bloc au début') : ''}${blocks.map((b, i) => card(b, i) + (i < blocks.length - 1 ? gap(i + 1, 'Insérer un bloc ici') : '')).join('')}
      <div class="${blocks.length ? 'pt-3' : ''} flex items-center gap-2.5">
        <button type="button" data-insert="end" class="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-2xl border border-stone-200/90 bg-white px-4 py-2.5 text-xs font-bold text-stone-600 shadow-sm transition-all hover:border-stone-300 hover:bg-stone-50 active:scale-[0.99] sm:text-sm">
          <span class="flex size-5 items-center justify-center rounded-full bg-stone-100 text-stone-500">${ic('plus', 'size-3.5')}</span><span>Insérer un bloc</span></button>
      </div>`;
    pill.hidden = true;
    canvas.querySelectorAll('.ehg-edit').forEach(clean);
  };
  const clean = (el) => { if (el.innerHTML !== '' && el.textContent === '' && !el.querySelector('img, ul, ol, li')) el.innerHTML = ''; };

  const renderGuest = async () => {
    pill.hidden = true;
    canvas.innerHTML = '<p class="py-10 text-center text-sm text-stone-500">Chargement de l’aperçu…</p>';
    const data = new FormData();
    data.set('_csrf', csrf);
    data.set('text', markdown().split('\n').slice(1).join('\n'));
    try {
      const html = await (await fetch(previewUrl, { method: 'POST', body: data, headers: { 'HX-Request': 'true' } })).text();
      canvas.innerHTML = `<div class="rounded-2xl bg-white p-4"><h2 class="font-news text-2xl font-bold text-stone-900">${esc((icon + ' ' + titleEl.textContent).trim())}</h2>${html}</div>`;
    } catch {
      canvas.innerHTML = '<p role="alert" class="rounded-xl bg-red-100 p-3 text-red-800">Aperçu indisponible. Réessayez.</p>';
    }
  };

  // ---- Modes ----
  const setMode = async (guest) => {
    if (guest === guestMode) return;
    syncFromDom();
    guestMode = guest;
    fullscreenId = null;
    root.querySelectorAll('[data-mode]').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.mode === 'guest') === guest)));
    titleEl.contentEditable = String(!guest);
    render();
    showToast(guest ? 'Visualisation invité' : 'Mode édition');
  };

  // ---- Positionnement fluide au-dessus du clavier virtuel mobile lors de l'ajout d'un bloc ----
  // Règle UX : uniquement déclenché à l'ajout d'un bloc neuf (jamais pendant la frappe ni au focusin sur une liste existante).
  let addedCard = null;
  let addedAt = 0;
  const ensureVisibleAboveKeyboard = (cardEl) => {
    if (!cardEl || fullscreenId) return;
    const vh = window.visualViewport ? window.visualViewport.height : innerHeight;
    const rect = cardEl.getBoundingClientRect();
    const targetTop = Math.max(96, Math.round(vh * 0.26));
    if (rect.bottom > vh - 20 || rect.top > vh * 0.5) {
      const delta = rect.top - targetTop;
      if (Math.abs(delta) > 16) window.scrollBy({ top: delta, behavior: 'smooth' });
    }
  };
  const scrollAboveKeyboard = (cardEl) => {
    if (!cardEl) return;
    addedCard = cardEl;
    addedAt = Date.now();
    const field = cardEl.querySelector('[contenteditable], input, textarea');
    field?.focus({ preventScroll: true });
    requestAnimationFrame(() => ensureVisibleAboveKeyboard(cardEl));
    setTimeout(() => ensureVisibleAboveKeyboard(cardEl), 180);
    setTimeout(() => ensureVisibleAboveKeyboard(cardEl), 360);
  };
  window.visualViewport?.addEventListener('resize', () => {
    if (addedCard && Date.now() - addedAt < 800) {
      ensureVisibleAboveKeyboard(addedCard);
    }
  });

  // ---- Ajout, déplacement, suppression ----
  const add = (type, at) => {
    syncFromDom();
    const b = { id: 'b' + nextId++, ...Blocks.blank(type) };
    const index = at === null || at > blocks.length ? blocks.length : at;
    blocks.splice(index, 0, b);
    setDirty(true);
    render();
    const el = canvas.querySelector(`[data-id="${b.id}"]`);
    el.classList.add('ehg-new');
    scrollAboveKeyboard(el);
  };
  const move = (id, delta) => {
    syncFromDom();
    const i = blocks.findIndex((b) => b.id === id);
    const j = i + delta;
    if (j < 0 || j >= blocks.length) return;
    [blocks[i], blocks[j]] = [blocks[j], blocks[i]];
    setDirty(true);
    render();
    canvas.querySelector(`[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  // Le bloc n°index rejoint celui du dessus, qui garde son type.
  const merge = (index) => {
    syncFromDom();
    const fused = Blocks.merge(blocks[index - 1], blocks[index]);
    if (!fused) return;
    blocks.splice(index - 1, 2, fused);
    setDirty(true);
    render();
    showToast('Blocs fusionnés');
  };
  // Coupe le bloc au curseur : ce qui suit part dans un nouveau bloc du même type, juste en dessous.
  const split = (range) => {
    const field = richOf(range.startContainer);
    const id = field?.closest('[data-id]')?.dataset.id;
    if (!id) return;
    const tail = document.createRange();
    tail.setStart(range.startContainer, range.startOffset);
    tail.setEnd(field, field.childNodes.length);
    const box = document.createElement('div');
    box.append(tail.extractContents());
    syncFromDom();
    const i = blocks.findIndex((b) => b.id === id);
    const nb = { ...blocks[i], id: 'b' + nextId++, html: box.innerHTML };
    blocks.splice(i + 1, 0, nb);
    setDirty(true);
    render();
    canvas.querySelector(`[data-id="${nb.id}"] [data-body]`)?.focus();
    showToast('Bloc scindé');
  };

  const dialog = (name) => document.getElementById('ehg-' + name);
  const openAdd = (at) => {
    insertAt = at;
    const n = blocks.length;
    $('[data-add-where]', dialog('add')).textContent = at === null || at >= n ? `Ajout en bas de fiche (bloc n°${n + 1})` : at === 0 ? 'Insertion tout en haut de la fiche' : `Insertion entre le bloc n°${at} et n°${at + 1}`;
    dialog('add').showModal();
  };

  canvas.addEventListener('focusin', (event) => {
    const cardEl = event.target.closest?.('[data-id]');
    if (cardEl) activeBlockId = cardEl.dataset.id;
  });
  canvas.addEventListener('click', (event) => {
    const el = event.target;
    const cardEl = el.closest('[data-id]');
    const id = cardEl?.dataset.id;
    if (id) activeBlockId = id;
    if (el.closest('[data-fullscreen]')) {
      syncFromDom();
      fullscreenId = fullscreenId === id ? null : id;
      render();
      canvas.querySelector(`[data-id="${id}"] [contenteditable], [data-id="${id}"] textarea`)?.focus();
      return;
    }
    if (el.closest('[data-insert]')) { const v = el.closest('[data-insert]').dataset.insert; syncFromDom(); return openAdd(v === 'end' ? null : Number(v)); }
    if (el.closest('[data-merge]')) return merge(Number(el.closest('[data-merge]').dataset.merge));
    if (el.closest('[data-move]')) return move(id, Number(el.closest('[data-move]').dataset.move));
    if (el.closest('[data-delete]')) {
      syncFromDom();
      const b = blocks.find((x) => x.id === id);
      deleteId = id;
      const badge = $('[data-del-type]', dialog('delete'));
      badge.textContent = T[b.type].label;
      badge.className = `inline-block rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${T[b.type].badge}`;
      const preview = Blocks.stripTags(Blocks.toMarkdown(b)).replace(/\n/g, ' • ').replace(/^[#>:*\s]+/, '').trim();
      $('[data-del-preview]', dialog('delete')).textContent = preview ? `« ${preview.slice(0, 140)}${preview.length > 140 ? '…' : ''} »` : '(Bloc sans texte)';
      $('[data-del-fiche]', dialog('delete')).textContent = titleEl.textContent.trim() || 'cette rubrique';
      return dialog('delete').showModal();
    }
  });

  canvas.addEventListener('change', (event) => {
    if (!event.target.matches('[data-convert]')) return;
    syncFromDom();
    const i = blocks.findIndex((b) => b.id === event.target.closest('[data-id]').dataset.id);
    blocks[i] = { id: blocks[i].id, ...Blocks.convert(blocks[i], event.target.value) };
    setDirty(true);
    render();
    showToast('Converti en ' + T[blocks[i].type].label);
  });

  canvas.addEventListener('input', () => {
    setDirty(true);
  });
  canvas.addEventListener('focusout', (event) => {
    if (event.target.classList?.contains('ehg-edit')) clean(event.target);
  });
  canvas.addEventListener('paste', (event) => {
    if (!event.target.closest?.('.ehg-edit')) return;
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
  });
  canvas.addEventListener('keydown', (event) => {
    const el = event.target;
    if (event.key === 'Escape' && fullscreenId) {
      syncFromDom();
      fullscreenId = null;
      render();
      return;
    }
    if (event.key !== 'Enter' || event.shiftKey || !el.matches?.('.ehg-edit[data-plain]')) return;
    event.preventDefault();
    el.blur();
  });

  // ---- Suppression confirmée ----
  dialog('delete').addEventListener('click', (event) => {
    if (!event.target.closest('[data-del-confirm]')) return;
    blocks = blocks.filter((b) => b.id !== deleteId);
    if (fullscreenId === deleteId) fullscreenId = null;
    deleteId = null;
    dialog('delete').close();
    setDirty(true);
    render();
    showToast('Bloc supprimé');
  });

  // ---- Choix du type à ajouter ----
  const fileInput = $('[data-file]');
  const tile = (key, flat) => `<button type="button" data-pick="${key}" class="rounded-2xl border p-3 text-left transition-transform active:scale-95 ${T[key].soon ? 'opacity-70' : ''} ${flat ? 'flex items-center justify-between gap-2' : 'flex flex-col items-center gap-1.5 text-center'} ${T[key].card}">
      <span class="flex size-8 shrink-0 items-center justify-center rounded-xl border ${T[key].badge}">${ic(T[key].icon)}</span>
      <span class="min-w-0 flex-1"><span class="block text-xs font-bold text-stone-900">${T[key].label}</span>${flat ? `<span class="mt-0.5 block text-[11px] leading-snug opacity-75">${T[key].desc}</span>` : T[key].soon ? '<span class="mt-0.5 inline-block rounded-full bg-purple-200/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-purple-900">Coming soon</span>' : ''}</span></button>`;
  $('[data-add-text]', dialog('add')).innerHTML = Blocks.TEXT_KEYS.map((k) => tile(k, true)).join('');
  $('[data-add-media]', dialog('add')).innerHTML = Blocks.MEDIA_KEYS.map((k) => tile(k, false)).join('');
  dialog('add').addEventListener('click', (event) => {
    const pick = event.target.closest('[data-pick]');
    if (!pick) return;
    if (T[pick.dataset.pick]?.soon) { dialog('add').close(); showToast('Mémo vocal : bientôt disponible'); return; }
    if (pick.dataset.pick === 'photo') { fileInput.click(); dialog('add').close(); return; }
    dialog('add').close();
    add(pick.dataset.pick, insertAt);
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    fileInput.value = '';
    if (!file) return;
    showToast('Envoi de la photo…');
    const data = new FormData();
    data.set('_csrf', csrf);
    data.set('photo', file);
    try {
      const r = await fetch(uploadUrl, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Envoi impossible');
      syncFromDom();
      const b = { id: 'b' + nextId++, ...Blocks.blank('photo'), file: j.id };
      blocks.splice(insertAt === null || insertAt > blocks.length ? blocks.length : insertAt, 0, b);
      setDirty(true);
      render();
      const el = canvas.querySelector(`[data-id="${b.id}"]`);
      scrollAboveKeyboard(el);
      showToast('Photo ajoutée');
    } catch (error) {
      showToast(error.message);
    }
  });

  // ---- Icône de la rubrique ----
  dialog('icon').addEventListener('click', (event) => {
    const pick = event.target.closest('[data-icon-pick]');
    if (!pick) return;
    icon = pick.dataset.iconPick;
    showIcon();
    setDirty(true);
    dialog('icon').close();
    showToast(icon ? `Icône changée en ${icon}` : 'Icône retirée');
  });
  // Emoji libre : collé depuis un clavier ou un site ; seul le premier emoji est gardé.
  dialog('icon').querySelector('[data-icon-use]').addEventListener('click', () => {
    const input = dialog('icon').querySelector('[data-icon-input]');
    const picked = Blocks.firstEmoji(input.value);
    if (!picked) { showToast('Collez un emoji, par exemple 🏡'); return; }
    icon = picked;
    input.value = '';
    showIcon();
    setDirty(true);
    dialog('icon').close();
    showToast(`Icône changée en ${icon}`);
  });
  dialog('icon').querySelector('[data-icon-input]').addEventListener('keydown', (event) => {
    if (event.key === 'Enter') { event.preventDefault(); dialog('icon').querySelector('[data-icon-use]').click(); }
  });
  iconEl.closest('button').addEventListener('click', () => dialog('icon').showModal());
  $('[data-title]').addEventListener('input', () => setDirty(true));
  titleEl.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); titleEl.blur(); } });

  // ---- Modes, ajout, retour sécurisé, enregistrement ----
  root.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode === 'guest')));
  root.querySelectorAll('[data-open-add]').forEach((b) => b.addEventListener('click', () => { syncFromDom(); openAdd(null); }));

  const save = async () => {
    if (!dirty) return true;
    const data = new FormData();
    data.set('_csrf', csrf);
    data.set('slug', slug);
    data.set('text', markdown());
    status.textContent = 'Enregistrement…';
    try {
      const r = await fetch(saveUrl, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Enregistrement impossible');
      if (j.slug !== slug) {
        slug = j.slug;
        history.replaceState(null, '', saveUrl + '/' + encodeURIComponent(slug));
      }
      setDirty(false);
      showToast('Sauvegardé');
      return true;
    } catch (error) {
      setDirty(true);
      showToast(error.message);
      return false;
    }
  };
  status.addEventListener('click', save);

  // Retour vers les rubriques : modale de confirmation si des modifications ne sont pas enregistrées.
  const backBtn = $('[data-back]');
  backBtn?.addEventListener('click', (event) => {
    if (!dirty) return;
    event.preventDefault();
    dialog('leave')?.showModal();
  });
  dialog('leave')?.addEventListener('click', async (event) => {
    if (event.target.closest('[data-leave-discard]')) {
      dirty = false;
      return;
    }
    if (event.target.closest('[data-leave-save]')) {
      dialog('leave').close();
      if (await save()) location.href = backBtn.href;
    }
  });

  // ---- Glisser par la poignée (doigt ou souris) ----
  let drag = null;
  canvas.addEventListener('pointerdown', (event) => {
    const grip = event.target.closest('[data-grip]');
    if (!grip) return;
    syncFromDom();
    drag = grip.closest('[data-id]');
    drag.classList.add('ehg-dragging');
    grip.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const others = [...canvas.querySelectorAll('[data-id]')].filter((c) => c !== drag);
    const next = others.find((c) => event.clientY < c.getBoundingClientRect().top + c.offsetHeight / 2);
    if (next) next.before(drag); else if (others.length) others[others.length - 1].after(drag);
  });
  const dropped = () => {
    if (!drag) return;
    const order = [...canvas.querySelectorAll('[data-id]')].map((c) => c.dataset.id);
    drag = null;
    const same = order.every((id, i) => blocks[i].id === id);
    if (!same) { blocks.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)); setDirty(true); }
    render();
  };
  canvas.addEventListener('pointerup', dropped);
  canvas.addEventListener('pointercancel', dropped);

  // ---- Pilule de mise en forme style Medium (z-50 : apparaît à la sélection de texte OU sur un appui long, et déplaçable) ----
  const richOf = (node) => (node && (node.nodeType === 1 ? node : node.parentElement))?.closest('.ehg-edit[data-rich], .ehg-edit:not([data-plain]):not([data-body])');
  let pillDismissed = false;
  let pillForced = false;
  let pillDrag = null;
  let longPressTimer = null;
  let pressPt = null;
  const placePill = (force = false) => {
    if (pillDrag) return;
    if (force) { pillForced = true; pillDismissed = false; }
    if (guestMode || pillDismissed) { pill.hidden = true; return; }
    const sel = getSelection();
    const hasSel = sel && sel.rangeCount > 0 && !sel.isCollapsed;
    if (!hasSel && !pillForced) { pill.hidden = true; return; }
    const field = (sel && sel.rangeCount ? richOf(sel.anchorNode) : null) || richOf(document.activeElement);
    if (!field || !canvas.contains(field) || field.hasAttribute('data-plain')) { pill.hidden = true; return; }
    let rect = sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : { width: 0, height: 0, top: 0, bottom: 0, left: 0 };
    if (rect.width === 0 && rect.height === 0) {
      const fRect = field.getBoundingClientRect();
      rect = pressPt ? { left: pressPt.x, width: 0, top: pressPt.y - 10, bottom: pressPt.y + 10 } : fRect;
    }
    pill.hidden = false;
    const w = pill.offsetWidth;
    const h = pill.offsetHeight;
    const minTop = fullscreenId ? 12 : 72;
    const top = rect.top - h - 8;
    pill.style.left = Math.max(8, Math.min(innerWidth - w - 8, rect.left + rect.width / 2 - w / 2)) + 'px';
    pill.style.top = (top < minTop ? rect.bottom + 8 : top) + 'px';
  };
  document.addEventListener('selectionchange', () => { pillDismissed = false; placePill(); });
  canvas.addEventListener('input', () => { pillForced = false; });
  canvas.addEventListener('keydown', () => { pillForced = false; pill.hidden = true; });
  canvas.addEventListener('pointerdown', (event) => {
    clearTimeout(longPressTimer);
    const field = richOf(event.target);
    if (!field || field.hasAttribute('data-plain')) { pillForced = false; return; }
    pressPt = { x: event.clientX, y: event.clientY };
    longPressTimer = setTimeout(() => placePill(true), 450);
  });
  canvas.addEventListener('pointermove', (event) => {
    if (pressPt && (Math.abs(event.clientX - pressPt.x) > 10 || Math.abs(event.clientY - pressPt.y) > 10)) {
      clearTimeout(longPressTimer);
    }
  });
  canvas.addEventListener('pointerup', () => clearTimeout(longPressTimer));
  canvas.addEventListener('pointercancel', () => clearTimeout(longPressTimer));
  canvas.addEventListener('contextmenu', (event) => {
    if (event.target.closest?.('.ehg-edit')) {
      event.preventDefault();
      clearTimeout(longPressTimer);
      pressPt = { x: event.clientX || innerWidth / 2, y: event.clientY || 160 };
      placePill(true);
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (!pill.hidden && !pill.contains(event.target) && !richOf(event.target)) { pillForced = false; pill.hidden = true; }
  });
  addEventListener('scroll', () => { if (!pill.hidden && !pillDrag) placePill(); }, { passive: true });
  const keepSelection = (event) => event.preventDefault();
  pill.addEventListener('mousedown', keepSelection);
  pill.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    const grip = event.target.closest('[data-pill-grip]');
    if (!grip) return;
    pillDrag = { dx: event.clientX - pill.offsetLeft, dy: event.clientY - pill.offsetTop };
    grip.setPointerCapture(event.pointerId);
  });
  pill.addEventListener('pointermove', (event) => {
    if (!pillDrag) return;
    pill.style.left = Math.max(8, Math.min(innerWidth - pill.offsetWidth - 8, event.clientX - pillDrag.dx)) + 'px';
    pill.style.top = Math.max(8, Math.min(innerHeight - pill.offsetHeight - 8, event.clientY - pillDrag.dy)) + 'px';
  });
  const endPillDrag = () => { pillDrag = null; };
  pill.addEventListener('pointerup', endPillDrag);
  pill.addEventListener('pointercancel', endPillDrag);
  const unwrapMarks = (range) => {
    const scope = range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement;
    scope.closest('.ehg-edit')?.querySelectorAll('mark').forEach((m) => {
      if (range.intersectsNode(m)) m.replaceWith(...m.childNodes);
    });
  };
  pill.addEventListener('click', (event) => {
    if (event.target.closest('[data-pill-close]')) { pillDismissed = true; pill.hidden = true; return; }
    if (event.target.closest('[data-split]')) { const sel = getSelection(); if (sel.rangeCount) split(sel.getRangeAt(0)); return; }
    const button = event.target.closest('[data-fmt]');
    if (!button) return;
    const sel = getSelection();
    if (!sel.rangeCount) return;
    const what = button.dataset.fmt;
    const range = sel.getRangeAt(0);
    if (what === 'highlight') {
      if (range.collapsed) return;
      const inside = (range.commonAncestorContainer.nodeType === 1 ? range.commonAncestorContainer : range.commonAncestorContainer.parentElement).closest('mark');
      if (inside) unwrapMarks(range);
      else { const m = document.createElement('mark'); m.className = 'ehg-highlight'; m.append(range.extractContents()); range.insertNode(m); sel.removeAllRanges(); sel.selectAllChildren(m); }
    } else if (what === 'clear') {
      document.execCommand('removeFormat');
      unwrapMarks(sel.getRangeAt(0));
    } else document.execCommand(what);
    setDirty(true);
  });

  // ---- Assistant IA : actions sur bloc actif, découpe de notes en vrac, ou révision de la rubrique ----
  const ai = document.querySelector('form[data-ai]');
  const aiDialog = document.getElementById('ai');
  const out = document.getElementById('ai-result');
  const refreshAiModal = () => {
    syncFromDom();
    const target = blocks.find((b) => b.id === activeBlockId && Blocks.TEXT_KEYS.includes(b.type)) || blocks.find((b) => Blocks.TEXT_KEYS.includes(b.type));
    const sec = aiDialog?.querySelector('[data-ai-active-section]');
    if (!sec) return;
    if (target) {
      activeBlockId = target.id;
      sec.hidden = false;
      aiDialog.querySelector('[data-ai-active-badge]').textContent = T[target.type].label;
      const preview = Blocks.stripTags(Blocks.toMarkdown(target)).replace(/\n/g, ' • ').replace(/^[#>:*\s]+/, '').trim();
      aiDialog.querySelector('[data-ai-active-preview]').textContent = preview ? `« ${preview} »` : '(Bloc vide)';
    } else {
      sec.hidden = true;
    }
  };
  root.querySelectorAll('[data-dialog="ai"]').forEach((b) => b.addEventListener('click', refreshAiModal));
  aiDialog?.addEventListener('click', (event) => {
    const actBtn = event.target.closest('[data-ai-block]');
    if (actBtn) {
      syncFromDom();
      const idx = blocks.findIndex((b) => b.id === activeBlockId);
      if (idx < 0) return;
      const b = blocks[idx];
      const act = actBtn.dataset.aiBlock;
      if (act === 'steps') {
        const sentences = Blocks.stripTags(Blocks.lines(b).join(' ')).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
        blocks[idx] = { ...b, html: `<ul>${sentences.map((s) => `<li>${Blocks.esc(s)}</li>`).join('')}</ul>` };
      } else if (act === 'shorten') {
        const plain = Blocks.stripTags(Blocks.lines(b).join(' ')).trim();
        const first = plain.split(/(?<=[.!?])\s+/)[0] || plain;
        blocks[idx] = { ...b, html: '<b>En bref :</b> ' + Blocks.esc(first) };
      } else if (act === 'clarify') {
        if (b.html !== undefined) b.html = b.html.replace(/\b(\d[\d\s:hH/.-]*\d|\d+)\b/g, '<b>$1</b>');
      }
      aiDialog.close();
      setDirty(true);
      render();
      showToast('Bloc mis en forme');
      return;
    }
    if (event.target.closest('[data-ai-generate]')) {
      const rawInput = aiDialog.querySelector('[data-ai-raw]');
      const raw = rawInput.value.trim();
      if (!raw) { aiDialog.close(); return; }
      syncFromDom();
      raw.split(/(?<=[.!?])\s+|\n+/).map((s) => s.trim()).filter(Boolean).forEach((s) => {
        const lower = s.toLowerCase();
        let type = 'text';
        let body = s;
        if (lower.includes('attention') || lower.includes('jamais') || lower.includes('interdit') || lower.includes('consigne')) {
          type = 'warning';
          body = s.replace(/^(?:attention|consigne)\s*:\s*/i, '');
        } else if (lower.includes('astuce')) {
          type = 'tip';
          body = s.replace(/^astuce\s*:\s*/i, '');
        } else if (lower.includes('conseil') || lower.includes('adresse') || lower.includes('restaurant')) {
          type = 'advice';
          body = s.replace(/^conseil\s*:\s*/i, '');
        }
        const nb = { id: 'b' + nextId++, ...Blocks.blank(type) };
        nb.html = Blocks.esc(body);
        blocks.push(nb);
      });
      rawInput.value = '';
      aiDialog.close();
      setDirty(true);
      render();
      showToast('Blocs Bento générés');
    }
  });
  ai?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(ai);
    data.set('text', markdown());
    ai.reset();
    ai.closest('dialog').close();
    out.innerHTML = '<p class="rounded-xl bg-stone-100 p-3 text-stone-700">✨ L’assistant travaille, jusqu’à une minute…</p>';
    try {
      out.innerHTML = await (await fetch(ai.action, { method: 'POST', body: data, headers: { 'HX-Request': 'true' } })).text();
    } catch {
      out.innerHTML = '<p role="alert" class="rounded-xl bg-red-100 p-3 text-red-800">Pas de réponse. Réessayez.</p>';
    }
  });
  out?.addEventListener('click', (event) => {
    if (event.target.closest('[data-ai-apply]')) {
      load(out.querySelector('[data-ai-markdown]').value);
      setDirty(true);
      out.replaceChildren();
      scrollTo({ top: 0 });
    } else if (event.target.closest('[data-ai-dismiss]')) out.replaceChildren();
  });

  // ---- Chargement ----
  const load = (md) => {
    const { title, blocks: parsed } = Blocks.parse(md);
    const h = splitHeading(title);
    icon = h.icon;
    titleEl.textContent = h.title;
    showIcon();
    blocks = parsed.map((p) => ({ id: 'b' + nextId++, ...Blocks.fromMarkdown(p.text) }));
    if (blocks.length === 0) {
      blocks = [{ id: 'b' + nextId++, type: 'text', html: '' }];
    }
    render();
  };
  load($('[data-source]').value);
  setDirty(false);
  root.hidden = false;
})();
