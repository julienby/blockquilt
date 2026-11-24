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
  /** Largeur d'un bloc dans une ligne composée : sa première ligne. Trois largeurs seulement. */
  WIDTH: /^<!-- (1\/3|1\/2|2\/3) -->$/,
  SIXTHS: { '1/3': 2, '1/2': 3, '2/3': 4 },
  /** Blocs → suite de { block } (pleine largeur) et { row: [blocs] }. Une ligne se ferme à 6 sixièmes ; ce qui déborde ouvre la suivante. */
  rows(blocks) {
    const out = [];
    let row = null;
    let sum = 0;
    for (const b of blocks) {
      const n = Blocks.SIXTHS[b.width];
      if (!n) { row = null; out.push({ block: b }); continue; }
      if (!row || sum + n > 6) { row = []; sum = 0; out.push({ row }); }
      row.push(b);
      sum += n;
      if (sum === 6) row = null;
    }
    return out;
  },
  CALLOUTS: ['info', 'tip', 'success', 'warning', 'danger'],

  ENTITIES: { '&nbsp;': ' ', '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" },
  VIDEO: /^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|vimeo\.com)\/\S+$/i,
  PHOTO: /^!\[((?:\\.|[^\]\\])*)\]\(((?:media\/|https:\/\/)[^)\s]+)\)$/,
  // Taille et format d'une photo seule, sous une seule forme : {size=…}, {ratio=…} ou {size=… ratio=…}.
  PHOTO_OPTS: /^(.+)\{(?:size=(small|medium)|ratio=(16:9|4:3|1:1)|size=(small|medium) ratio=(16:9|4:3|1:1))\}$/,

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
    // Une ligne de largeur (« <!-- 1/3 --> ») seule reste en tête du bloc qui la suit, même un bloc ::: ou un titre.
    const open = () => { if (!(cur.length === 1 && Blocks.WIDTH.test(cur[0]))) flush(); };
    lines.forEach((line, i) => {
      let m;
      if (fence) {
        if (fence.kind === ':::' && /^:::\w/.test(line)) problems.push({ line: offset + i + 1, message: 'Bloc « ::: » ouvert dans un autre : non pris en charge' });
        push(line, i);
        if (fence.close.test(line)) { fence = null; flush(); }
      } else if ((m = /^(`{3,}|~{3,})/.exec(line))) {
        open(); push(line, i); fence = { close: new RegExp('^' + m[1] + '\\s*$'), line: offset + i + 1, kind: 'code' };
      } else if (/^:::\w/.test(line)) {
        open(); push(line, i); fence = { close: /^:::\s*$/, line: offset + i + 1, kind: ':::' };
      } else if (/^#{1,6} /.test(line)) {
        open(); push(line, i); flush();
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

  /**
   * Texte venu d'ailleurs (collage, réponse IA) → texte où un bloc non reconnu sans signe de structure en tête
   * (pas `#… `, `>`, `|`, `:::`, ``` ``` ```, `---`, `<`) devient un bloc texte. Ce qui ne s'affichait pas reste visible tel quel.
   * Un fichier ouvert reste strict (parse) : son écriture d'origine est gardée.
   */
  loosen(markdown) {
    const { meta, blocks } = Blocks.parse(markdown);
    const loose = blocks.map((b) => {
      const t = b.type === 'raw' ? Blocks.tidy(b.md) : '';
      const m = t && !t.startsWith('<') ? Blocks.types.text.match(t) : null;
      if (!m) return b;
      const { md, ...rest } = b;
      return { ...rest, type: 'text', ...m };
    });
    return Blocks.serialize(meta, loose);
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
    const blocks = chunks.map((c) => ({ ...Blocks.fromMarkdown(c.text), line: c.line }));
    for (const r of Blocks.rows(blocks)) {
      if (r.row && r.row.reduce((n, b) => n + Blocks.SIXTHS[b.width], 0) < 6) out.push({ line: r.row[0].line, message: `Ligne incomplète (${r.row.map((b) => b.width).join(' + ')}) : ses blocs s'élargissent pour la remplir. Lignes possibles : 1/2 + 1/2, 1/3 + 2/3, 2/3 + 1/3, 1/3 + 1/3 + 1/3.` });
    }
    return out.sort((a, b) => a.line - b.line);
  },

  // ---- Désigner et modifier un bloc dans le texte (IA, MCP…) : place + empreinte, sans identifiant dans le texte ----

  /** Empreinte courte d'un texte (FNV-1a 32 bits, 8 caractères hexadécimaux). */
  hash(text) {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
    return (h >>> 0).toString(16).padStart(8, '0');
  },

  /** Texte complet → { meta, blocks: [{ n, line, type, hash, text }] } ; n commence à 1, line = première ligne dans le fichier. */
  address(markdown) {
    const fm = Blocks.frontmatter(markdown);
    const { chunks } = Blocks.split(fm.body, fm.offset);
    return { meta: fm.meta, blocks: chunks.map((c, i) => ({ n: i + 1, line: c.line, type: Blocks.fromMarkdown(c.text).type, hash: Blocks.hash(c.text), text: c.text })) };
  },

  /** Fragment (bloc ou blocs) nettoyé : fins de ligne Unix, sans lignes vides autour. */
  fragment(markdown) { return String(markdown ?? '').replace(/\r\n/g, '\n').replace(/^\s*\n/, '').replace(/\n\s*$/, '').replace(/^\s+$/, ''); },

  /**
   * Modifier le bloc n s'il a toujours l'empreinte `hash` : mode `replace` | `before` | `after` | `remove`.
   * Seules les lignes du bloc changent, le reste du texte est gardé à l'identique.
   * → { markdown } ou { error: { code: 'missing' | 'stale' | 'empty', message } }
   */
  changeBlock(markdown, { n, hash, mode = 'replace', markdown: fragment = '' }) {
    const md = markdown.replace(/\r\n/g, '\n');
    const block = Blocks.address(md).blocks[n - 1];
    if (!block) return { error: { code: 'missing', message: `Pas de bloc ${n}` } };
    if (block.hash !== hash) return { error: { code: 'stale', message: `Le bloc ${n} a changé depuis la lecture (empreinte ${block.hash}, attendue ${hash}) : relire le contenu` } };
    const frag = Blocks.fragment(fragment);
    if (!frag && mode !== 'remove' && mode !== 'replace') return { error: { code: 'empty', message: 'Rien à insérer' } };
    const lines = md.split('\n');
    const start = block.line - 1;
    const count = block.text.split('\n').length;
    const own = lines.slice(start, start + count);
    if (mode === 'remove' || !frag) {
      // Retrait : les lignes vides qui suivent partent avec le bloc ; en fin de texte, celles qui le précèdent.
      let from = start, to = start + count;
      while (to < lines.length && lines[to].trim() === '') to++;
      if (to >= lines.length) while (from > 0 && lines[from - 1].trim() === '') from--;
      lines.splice(from, to - from);
    } else {
      const put = mode === 'replace' ? frag.split('\n') : mode === 'before' ? [...frag.split('\n'), '', ...own] : [...own, '', ...frag.split('\n')];
      // Un titre peut toucher le paragraphe voisin : une ligne vide garde les blocs séparés.
      if (mode !== 'after' && start > 0 && lines[start - 1].trim() !== '') put.unshift('');
      if (mode !== 'before' && start + count < lines.length && lines[start + count].trim() !== '') put.push('');
      lines.splice(start, count, ...put);
    }
    let out = lines.join('\n');
    if (out.trim() === '') out = '';
    else if (!out.endsWith('\n')) out += '\n';
    return { markdown: out };
  },

  /**
   * Ajouter un texte (de l'IA…) à un contenu : `replace` | `prepend` (au début, sous le frontmatter) | `append` (à la fin).
   * Frontmatter du fragment : en `replace`, il remplace celui du contenu s'il en a un, sinon celui du contenu est gardé ;
   * en `prepend` / `append`, ses clés absentes du contenu sont ajoutées, celles du contenu ne changent pas.
   */
  combine(markdown, fragment, mode = 'append') {
    const doc = Blocks.frontmatter(markdown);
    const add = Blocks.frontmatter(String(fragment ?? ''));
    const addBody = Blocks.fragment(add.body.join('\n'));
    const hasAddMeta = Object.keys(add.meta).length > 0;
    const meta = mode === 'replace' && hasAddMeta ? add.meta : { ...doc.meta };
    if (mode !== 'replace') for (const k of Object.keys(add.meta)) if (!Object.hasOwn(meta, k)) meta[k] = add.meta[k];
    const ownBody = Blocks.fragment(doc.body.join('\n'));
    const parts = mode === 'replace' ? [addBody] : mode === 'prepend' ? [addBody, ownBody] : [ownBody, addBody];
    const body = parts.filter(Boolean).join('\n\n');
    const keys = Object.keys(meta);
    // Frontmatter mal formé : il est resté dans le corps du contenu, on n'en écrit pas d'autre.
    const head = keys.length && !doc.error ? ['---', ...keys.map((k) => Blocks.metaLine(k, meta[k])), '---'].join('\n') + '\n' : '';
    return head + (head && body ? '\n' : '') + (body ? body + '\n' : '');
  },

  /**
   * Différences ligne à ligne entre deux textes → [{ op: ' ' | '-' | '+', text }] (plus longue sous-suite commune).
   * Au-delà de `limit` lignes différentes de chaque côté, tout l'ancien est retiré et tout le nouveau ajouté.
   */
  diffLines(a, b, limit = 1500) {
    const lines = (t) => String(t).replace(/\r\n/g, '\n').split('\n');
    return Blocks.diff(lines(a), lines(b), limit);
  },

  /** Différences mot à mot (espaces compris) → [{ op, text }] ; les mots voisins de même sorte sont réunis en un morceau. */
  diffWords(a, b, limit = 1500) {
    const words = (t) => String(t).split(/(\s+)/).filter(Boolean);
    const out = [];
    for (const p of Blocks.diff(words(a), words(b), limit)) {
      if (out.at(-1)?.op === p.op) out.at(-1).text += p.text;
      else out.push({ ...p });
    }
    return out;
  },

  /** Différences entre deux listes de textes (lignes, mots) : le moteur de diffLines et diffWords. */
  diff(x, y, limit) {
    let s = 0;
    while (s < x.length && s < y.length && x[s] === y[s]) s++;
    let e = 0;
    while (e < x.length - s && e < y.length - s && x[x.length - 1 - e] === y[y.length - 1 - e]) e++;
    const xs = x.slice(s, x.length - e);
    const ys = y.slice(s, y.length - e);
    const mid = [];
    if (xs.length > limit || ys.length > limit) {
      mid.push(...xs.map((t) => ({ op: '-', text: t })), ...ys.map((t) => ({ op: '+', text: t })));
    } else {
      // Longueurs des sous-suites communes, depuis la fin.
      const L = Array.from({ length: xs.length + 1 }, () => new Uint32Array(ys.length + 1));
      for (let i = xs.length - 1; i >= 0; i--) for (let j = ys.length - 1; j >= 0; j--) L[i][j] = xs[i] === ys[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
      let i = 0, j = 0;
      while (i < xs.length || j < ys.length) {
        if (i < xs.length && j < ys.length && xs[i] === ys[j]) { mid.push({ op: ' ', text: xs[i] }); i++; j++; }
        else if (i < xs.length && (j >= ys.length || L[i + 1][j] >= L[i][j + 1])) mid.push({ op: '-', text: xs[i++] });
        else mid.push({ op: '+', text: ys[j++] });
      }
    }
    const same = (t) => ({ op: ' ', text: t });
    return [...x.slice(0, s).map(same), ...mid, ...x.slice(x.length - e).map(same)];
  },

  /**
   * Réponse de l'IA en opérations → { ops: [{ mode, n, markdown }] } ou { error } (rien n'est réparé).
   * Format : une ligne « @@ <verbe> <n> », puis le corps jusqu'au prochain « @@ » (plusieurs blocs permis).
   * Verbes : remplacer, avant, après (corps obligatoire), supprimer (sans corps) ; modes : replace, before, after, remove.
   * n : place du bloc dans le document envoyé, qui en a `count` ; 0 = frontmatter (remplacer, après seulement).
   * Un seul « remplacer » ou « supprimer » par bloc. « @@ rien » (ou une réponse vide) : aucune opération, ce qui est valide.
   */
  parseOps(text, count) {
    const MODES = { remplacer: 'replace', avant: 'before', après: 'after', supprimer: 'remove' };
    if (String(text ?? '').trim() === '@@ rien') return { ops: [] };
    const lines = String(text ?? '').replace(/\r\n/g, '\n').split('\n');
    const heads = [];
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('@@')) heads.push({ at: i + 1, head: /^@@ (\S+) (\d+)\s*$/.exec(lines[i]), body: [] });
      else if (heads.length) heads.at(-1).body.push(lines[i]);
      else if (lines[i].trim()) return { error: `Ligne ${i + 1} : « @@ <verbe> <numéro> » attendu, pas de texte avant` };
    }
    const ops = [];
    const changed = new Set();
    for (const { at, head, body } of heads) {
      const fail = (message) => ({ error: `Ligne ${at} : ${message}` });
      const mode = head && MODES[head[1]];
      if (!mode) return fail('« @@ remplacer | avant | après | supprimer <numéro> » attendu');
      const n = Number(head[2]);
      const markdown = Blocks.fragment(body.join('\n'));
      if (n > count) return fail(`pas de bloc ${n} (le document en a ${count})`);
      if (n === 0 && (mode === 'before' || mode === 'remove')) return fail('le bloc 0 (frontmatter) se remplace ou se complète après, rien d’autre');
      if (mode === 'remove' ? markdown : !markdown) return fail(mode === 'remove' ? '« supprimer » n’a pas de texte' : `« ${head[1]} » sans texte`);
      if (mode === 'replace' || mode === 'remove') {
        if (changed.has(n)) return fail(`un seul « remplacer » ou « supprimer » par bloc (bloc ${n})`);
        changed.add(n);
      }
      ops.push({ mode, n, markdown });
    }
    return { ops };
  },

  // ---- Texte visible ⇄ Markdown ----
  esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); },
  attr(s) { return Blocks.esc(s).replace(/"/g, '&quot;'); },
  unesc(s) { return s.replace(/&(?:nbsp|amp|lt|gt|quot|#39);/g, (m) => Blocks.ENTITIES[m]); },
  /** Une ligne de Markdown → texte sans mise en forme. */
  plain(md) { return Blocks.unesc(Blocks.inlineHtml(md).replace(/<[^>]+>/g, '')); },

  /**
   * Une ligne de Markdown → HTML : code, gras, italique, souligné, surligné, liens, adresses nues. Tout le reste reste du texte.
   * urls : « link » (HTML publié), « mark » (champ de l'éditeur : l'adresse nue porte data-bq-url, réécrite nue par htmlToMd),
   * « text » (dans le texte d'un lien : pas de lien dans un lien).
   */
  inlineHtml(md, urls = 'link') {
    const re = /\\([\\`*_{}[\]()#+\-.!>=:|~])|`([^`\n]+)`|\*\*(\S(?:.*?\S)?)\*\*|\*(\S(?:.*?\S)?)\*|\+\+(\S(?:.*?\S)?)\+\+|==(\S(?:.*?\S)?)==|\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:|#)[^)\s]+|\/(?![\/\\])[^)\s]*)\)|(?<!\w)(https?:\/\/[^\s<>]+)/g;
    let out = '';
    let at = 0;
    let m;
    while ((m = re.exec(md))) {
      out += Blocks.esc(md.slice(at, m.index));
      at = re.lastIndex;
      if (m[1] !== undefined) out += Blocks.esc(m[1]);
      else if (m[2] !== undefined) out += '<code>' + Blocks.esc(m[2]) + '</code>';
      else if (m[3] !== undefined) out += '<strong>' + Blocks.inlineHtml(m[3], urls) + '</strong>';
      else if (m[4] !== undefined) out += '<em>' + Blocks.inlineHtml(m[4], urls) + '</em>';
      else if (m[5] !== undefined) out += '<u>' + Blocks.inlineHtml(m[5], urls) + '</u>';
      else if (m[6] !== undefined) out += '<mark>' + Blocks.inlineHtml(m[6], urls) + '</mark>';
      else if (m[7] !== undefined) out += '<a href="' + Blocks.attr(m[8]) + '">' + Blocks.inlineHtml(m[7], 'text') + '</a>';
      else {
        const url = Blocks.urlEnd(m[9]);
        at = re.lastIndex = m.index + url.length; // la ponctuation finale reste du texte
        out += urls === 'text' || !/^https?:\/\/./.test(url) ? Blocks.esc(url)
          : `<a href="${Blocks.attr(url)}"${urls === 'mark' ? ' data-bq-url' : ''}>${Blocks.esc(url)}</a>`;
      }
    }
    return out + Blocks.esc(md.slice(at));
  },

  /**
   * Lignes de Markdown → suite de { line } et { list: { tag, items: [{ text, subs: [list…] }] } }.
   * Listes à plusieurs niveaux : un élément enfant est indenté de la largeur de la puce du parent (« - » : 2 espaces, « 1. » : 3).
   * Une indentation hors de ces règles n'est pas réécrite à l'identique : le bloc reste alors du texte source.
   */
  listTree(lines) {
    const out = [];
    let stack = []; // [{ indent, list }]
    for (const l of lines) {
      const m = /^( *)(-|\d+\.) (.*)$/.exec(l);
      if (!m || (!stack.length && m[1].length)) { stack = []; out.push({ line: l }); continue; }
      const indent = m[1].length;
      const tag = m[2] === '-' ? 'ul' : 'ol';
      while (stack.length > 1 && indent < stack[stack.length - 1].indent) stack.pop();
      let top = stack[stack.length - 1];
      if (top && indent > top.indent) {
        const list = { tag, items: [] };
        top.list.items[top.list.items.length - 1].subs.push(list);
        stack.push({ indent, list });
      } else if (!top || top.list.tag !== tag) {
        const list = { tag, items: [] };
        if (stack.length > 1) {
          stack.pop();
          const parent = stack[stack.length - 1].list.items;
          parent[parent.length - 1].subs.push(list);
          stack.push({ indent, list });
        } else {
          out.push({ list });
          stack = [{ indent, list }];
        }
      }
      top = stack[stack.length - 1];
      top.list.items.push({ text: m[3], subs: [] });
    }
    return out;
  },
  listHtml(list, urls = 'link') {
    return `<${list.tag}>${list.items.map((x) => `<li>${Blocks.inlineHtml(x.text, urls)}${x.subs.map((sub) => Blocks.listHtml(sub, urls)).join('')}</li>`).join('')}</${list.tag}>`;
  },

  /** Lignes de Markdown → HTML d'un champ modifiable : lignes séparées par `<br>`, listes en `<ul><li>` / `<ol><li>` (imbriquées). */
  linesToHtml(lines) {
    return Blocks.listTree(lines).map((n) => (n.list ? Blocks.listHtml(n.list, 'mark') : Blocks.inlineHtml(n.line, 'mark'))).join('<br>');
  },

  /** Lignes de Markdown → HTML publié : paragraphes `<p>` (lignes jointes par `<br>`), listes `<ul>` / `<ol>` (imbriquées). */
  flowHtml(lines) {
    const out = [];
    let para = [];
    const flush = () => { if (para.length) out.push(`<p>${para.map((l) => Blocks.inlineHtml(l)).join('<br>')}</p>`); para = []; };
    for (const n of Blocks.listTree(lines)) {
      if (n.list) { flush(); out.push(Blocks.listHtml(n.list)); }
      else if (n.line.trim() === '') flush();
      else para.push(n.line);
    }
    flush();
    return out.join('');
  },

  /** Adresse acceptée pour un lien (sinon : pas de lien). */
  safeHref(href) {
    const h = Blocks.unesc(href).trim();
    const full = /^(https?:\/\/|mailto:|tel:|#.|\/(?![\/\\]))/i.test(h) ? h : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(h) ? 'https://' + h : '';
    return full.replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
  },

  /** Adresse nue lue dans un texte, sans sa ponctuation finale : « . , ; : ! ? ' " » », et « ) » qui n'a pas de « ( » dans l'adresse. */
  urlEnd(u) {
    while (/[.,;:!?'"»]$/.test(u) || (u.endsWith(')') && u.split(')').length > u.split('(').length)) u = u.slice(0, -1);
    return u;
  },
  URL: /(?<!\w)https?:\/\/[^\s<>]+/g,

  /** Texte tapé → Markdown : les signes qui changeraient le sens sont protégés par « \ », sauf dans une adresse nue (lue telle quelle). */
  escText(s) {
    let out = '';
    let at = 0;
    for (const m of s.matchAll(Blocks.URL)) {
      const url = Blocks.urlEnd(m[0]);
      out += Blocks.escPlain(s.slice(at, m.index)) + url;
      at = m.index + url.length;
    }
    return out + Blocks.escPlain(s.slice(at));
  },
  escPlain(s) {
    return s.replace(/\\/g, '\\\\').replace(/[*[\]`]/g, '\\$&').replace(/\+\+/g, '\\+\\+').replace(/==/g, '\\=\\=').replace(/~~/g, '\\~\\~')
      .replace(/(^|\W)_|_(?=\W|$)/g, (x) => x.replace('_', '\\_'));
  },

  /** HTML d'un champ modifiable → Markdown (gère `<ul><li>`, `<ol><li>`, et protège les signes Markdown). */
  htmlToMd(html, bullets = false, inline = false) {
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
      lines.push(inline ? cur : cur.replace(start, '\\$1').replace(/^(\d+)([.)]) /, '$1\\$2 ').replace(/^(-{3,}\s*)$/, '\\$1').replace(/^<!--/, '<\\!--'));
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
          frames.push({ mark: MARKS[tag], href: tag === 'a' ? Blocks.safeHref((/href\s*=\s*"([^"]*)"/i.exec(m[3]) || [])[1] || '') : '', tag, buf: '', auto: tag === 'a' && /\sdata-bq-url\b/i.test(m[3]) });
        } else if (frames.length) {
          const f = frames.pop();
          const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(f.buf);
          if (core === '' || f.auto) put(f.buf); // adresse nue du champ : son texte, relu en lien s'il est encore une adresse
          else if (f.tag === 'a') put(f.href ? `${lead}[${core}](${f.href})${trail}` : lead + core + trail);
          else if (f.tag === 'code') put(core.includes('`') ? lead + Blocks.escText(core) + trail : lead + '`' + core + '`' + trail);
          else put(lead + f.mark + core + f.mark + trail);
        }
      } else if (tag === 'ul' || tag === 'ol') {
        // Liste, éventuellement dans une autre (dans un <li>, ou directement dans la liste comme le fait execCommand('indent')).
        if (cur !== '' || liPrefix !== '') flush();
        if (!closing) lists.push({ tag, n: 0, width: 2 });
        else lists.pop();
      } else if (tag === 'li') {
        if (cur !== '' || liPrefix !== '') flush();
        if (!closing) {
          const top = lists[lists.length - 1];
          const marker = top && top.tag === 'ol' ? `${++top.n}. ` : '- ';
          if (top) top.width = marker.length;
          liPrefix = ' '.repeat(lists.slice(0, -1).reduce((w, l) => w + l.width, 0)) + marker;
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

  /** Caractère d'une entité numérique ; hors Unicode (0, au-delà de U+10FFFF) : U+FFFD. */
  codePoint(n) { return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '\ufffd'; },

  /**
   * HTML collé (page web, traitement de texte) → Markdown blockquilt, au mieux. Sans DOM.
   * Seul le texte est gardé : titres, paragraphes, listes, citations, code, photos https, vidéos YouTube et Vimeo, lignes.
   * Un <div> est un saut de ligne, pas un bloc. Le texte caché (aria-hidden, hidden, display: none) est retiré.
   * La mise en forme du texte passe par htmlToMd. Ce que le noyau ne relit pas à l'identique deviendra un bloc « texte source ».
   */
  fromHtml(html) {
    const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', hellip: '…', ndash: '–', mdash: '—' };
    const decode = (s) => s.replace(/&#x([0-9a-f]+);?|&#(\d+);?|&([a-z]+);/gi, (m, hex, dec, name) =>
      (hex ? Blocks.codePoint(parseInt(hex, 16)) : dec ? Blocks.codePoint(Number(dec)) : NAMED[name.toLowerCase()] ?? m));
    const attrOf = (attrs, name) => {
      const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs);
      return m ? decode(m[1] ?? m[2] ?? m[3]).trim() : '';
    };
    const INLINE = { b: 'b', strong: 'b', i: 'i', em: 'i', u: 'u', mark: 'mark', code: 'code', a: 'a' };
    // Un bloc par paragraphe (PARA). Un conteneur (LINE) n'est qu'un saut de ligne : les pages mettent des <div> partout.
    const PARA = /^(p|h[1-6]|figure|figcaption)$/;
    const LINE = /^(div|section|article|main|header|footer|table|tr|dl|dt|dd|address|details|summary|center)$/;
    const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/;
    // Ce qu'un lecteur d'écran ne lit pas : aria-hidden="true", hidden, display: none. La classe « hidden » ne compte pas.
    const hidden = (attrs) => attrOf(attrs, 'aria-hidden') === 'true' || /\shidden(?=[\s=]|$)/i.test(attrs.replace(/"[^"]*"|'[^']*'/g, '""'))
      || /display\s*:\s*none/i.test(attrOf(attrs, 'style'));
    const DROP = [...Blocks.DROP_TAGS, 'nav', 'aside'];

    const out = [];
    let kind = 'text'; // segment en cours : text, h1…h6, list, quote, caption
    let buf = ''; // HTML propre du segment : texte échappé et balises sans attributs
    let open = []; // balises de mise en forme ouvertes dans buf
    let lists = 0;
    let quotes = 0;
    let pre = null; // texte du bloc <pre> en cours
    let lastPhoto = null; // { i, src } : la photo qu'une <figcaption> peut légender
    const photo = (alt, src) => `![${Blocks.htmlToMd(Blocks.esc(alt), false, true).replace(/\n/g, ' ')}](${src})`;
    const plain = () => Blocks.htmlToMd(Blocks.esc(Blocks.stripTags(buf)), false, true).replace(/\n+/g, ' ').trim();
    const flush = () => {
      while (open.length) buf += `</${open.pop()}>`;
      const lines = Blocks.htmlToMd(buf, kind === 'list' || kind === 'quote').split('\n')
        .map((l) => (kind === 'list' ? l.trimEnd() : l.trim())).filter((l) => l !== '');
      if (lines.length) {
        if (kind[0] === 'h') out.push('#'.repeat(Math.min(Number(kind[1]), 3)) + ' ' + plain());
        else if (kind === 'caption' && lastPhoto && lastPhoto.i === out.length - 1) out[lastPhoto.i] = photo(plain(), lastPhoto.src);
        else if (kind === 'quote') out.push(lines.map((l) => '> ' + l).join('\n'));
        else out.push(lines.join('\n'));
      }
      buf = '';
      kind = 'text';
    };
    const push = (md) => { flush(); out.push(md); };
    const code = () => { push(Blocks.toMarkdown({ type: 'code', lang: '', code: pre.replace(/^\n/, '').replace(/\s+$/, '') })); pre = null; };

    const re = /<!--[\s\S]*?(?:-->|$)|<![^>]*>|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
    let at = 0;
    let m;
    const ws = []; // éléments en white-space: pre… ouverts : { tag, n } (n : balises de même nom ouvertes dedans)
    const text = (t) => {
      if (pre !== null) pre += decode(t);
      else if (!ws.length) buf += Blocks.esc(decode(t).replace(/[ \t\n\r\f]+/g, ' '));
      // Les retours à la ligne du texte comptent ; une ligne vide ouvre un nouveau bloc.
      else decode(t).split(/\n[ \t\r\f]*\n\s*/).forEach((part, i) => {
        if (i) { if (lists || quotes) buf += '<br>'; else flush(); }
        buf += Blocks.esc(part.replace(/[ \t\r\f]+/g, ' ')).replace(/\n/g, '<br>');
      });
    };
    // Saute un élément caché jusqu'à sa balise de fin, en comptant les balises de même nom ouvertes dedans.
    const skip = (tag) => {
      let depth = 1;
      let s;
      while (depth && (s = re.exec(html))) if (s[2] && s[2].toLowerCase() === tag && !s[0].endsWith('/>')) depth += s[1] ? -1 : 1;
      at = s ? re.lastIndex : (re.lastIndex = html.length);
    };
    while ((m = re.exec(html))) {
      text(html.slice(at, m.index));
      at = re.lastIndex;
      if (!m[2]) continue; // commentaire, <!DOCTYPE>
      const close = m[1] === '/';
      const tag = m[2].toLowerCase();
      const attrs = m[3] || '';
      if (tag === 'iframe' && !close) {
        const src = attrOf(attrs, 'src');
        const yt = /youtube(?:-nocookie)?\.com\/embed\/([\w-]{11})/i.exec(src);
        const vimeo = /player\.vimeo\.com\/video\/(\d+)/i.exec(src);
        if (yt) push('https://youtu.be/' + yt[1]);
        else if (vimeo) push('https://vimeo.com/' + vimeo[1]);
      }
      if (DROP.includes(tag)) {
        // Retirée avec son contenu. Sans balise de fin (<embed>…), seule la balise part.
        if (!close) {
          const end = new RegExp('</' + tag + '\\s*>', 'ig');
          end.lastIndex = at;
          if (end.exec(html)) at = re.lastIndex = end.lastIndex;
        }
        continue;
      }
      if (!close && hidden(attrs)) {
        if (!VOID.test(tag)) skip(tag);
        continue;
      }
      if (pre === null && !VOID.test(tag)) {
        const top = ws[ws.length - 1];
        if (close) { if (top && top.tag === tag) { if (top.n) top.n--; else ws.pop(); } }
        else if (/white-space\s*:\s*pre/i.test(attrOf(attrs, 'style'))) ws.push({ tag, n: 0 });
        else if (top && top.tag === tag) top.n++;
      }
      if (pre !== null) {
        if (tag === 'pre' && close) code();
        else if (tag === 'br') pre += '\n';
        continue;
      }
      if (INLINE[tag]) {
        const t = INLINE[tag];
        if (!close) {
          open.push(t);
          buf += t === 'a' ? `<a href="${Blocks.attr(attrOf(attrs, 'href'))}">` : `<${t}>`;
        } else if (open.includes(t)) {
          const i = open.lastIndexOf(t);
          while (open.length > i) buf += `</${open.pop()}>`;
        }
      } else if (tag === 'ul' || tag === 'ol') {
        if (!close && !lists && !quotes) { flush(); kind = 'list'; }
        lists = Math.max(lists + (close ? -1 : 1), 0);
        buf += close ? `</${tag}>` : `<${tag}>`;
        if (close && !lists && !quotes) flush();
      } else if (tag === 'li') {
        if (lists) buf += close ? '</li>' : '<li>';
      } else if (tag === 'blockquote') {
        if (!close && !quotes && !lists) { flush(); kind = 'quote'; }
        quotes = Math.max(quotes + (close ? -1 : 1), 0);
        if (close && !quotes && !lists) flush();
      } else if (tag === 'pre' && !close && !lists && !quotes) {
        flush();
        pre = '';
      } else if (tag === 'br') {
        buf += lists ? ' ' : '<br>';
      } else if (tag === 'td' || tag === 'th') {
        if (!close) buf += ' ';
      } else if (tag === 'hr') {
        if (!lists && !quotes) push('---');
      } else if (tag === 'img') {
        const src = attrOf(attrs, 'src').replace(/ /g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
        const tiny = ['width', 'height'].some((a) => /^\d+$/.test(attrOf(attrs, a)) && Number(attrOf(attrs, a)) < 48);
        if (!lists && !quotes && !tiny && /^https:\/\/\S+$/i.test(src)) {
          push(photo(attrOf(attrs, 'alt'), src));
          lastPhoto = { i: out.length - 1, src };
        }
      } else if (PARA.test(tag) || LINE.test(tag)) {
        if (lists) buf += ' ';
        else if (quotes || LINE.test(tag)) buf += '<br>';
        else {
          flush();
          if (!close && /^h[1-6]$/.test(tag)) kind = tag;
          if (!close && tag === 'figcaption') kind = 'caption';
        }
      }
    }
    text(html.slice(at));
    if (pre !== null) code();
    flush();
    return out.join('\n\n');
  },

  // ---- Filtre HTML (bloc :::html) : sans DOM, liste blanche courte et figée. L'allonger demande une ligne dans DECISIONS.md. ----
  SAFE_TAGS: ['div', 'span', 'p', 'br', 'hr', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'strong', 'em', 'u', 'mark', 'small', 'a', 'img', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'th', 'td'],
  // Balises retirées avec tout leur contenu.
  DROP_TAGS: ['script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'svg', 'math', 'template', 'noscript', 'noembed', 'noframes', 'textarea', 'title', 'select', 'option', 'xmp', 'plaintext', 'head', 'canvas', 'audio', 'video', 'button', 'form'],
  VOID_TAGS: ['br', 'hr', 'img'],

  /** HTML quelconque → HTML sûr : balises de SAFE_TAGS, attributs permis seulement, adresses vérifiées. `media` réécrit « media/… ». */
  sanitize(html, media = 'media/') {
    const decode = (v) => v.replace(/&#x([0-9a-f]+);?/gi, (_, h) => Blocks.codePoint(parseInt(h, 16)))
      .replace(/&#(\d+);?/g, (_, d) => Blocks.codePoint(Number(d)))
      .replace(/&(amp|lt|gt|quot|apos|colon|tab|newline|nbsp);?/gi, (_, n) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", colon: ':', tab: '\t', newline: '\n', nbsp: ' ' })[n.toLowerCase()]);
    const url = (v, allowed) => { const u = decode(v).replace(/[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]/g, ''); return allowed.test(u) ? u : null; };
    const allow = (tag, name, value) => {
      if (name === 'class') return value;
      if (tag === 'a' && name === 'href') return url(value, /^(https?:\/\/|mailto:|tel:|#.|\/(?![\/\\]))/i);
      if (tag === 'img' && name === 'src') { const u = url(value, /^(https:\/\/|media\/[\w.-]+$)/i); return u && Blocks.mediaUrl(u, media); }
      if (tag === 'img' && name === 'alt') return value;
      if ((tag === 'img' && (name === 'width' || name === 'height')) || ((tag === 'th' || tag === 'td') && (name === 'colspan' || name === 'rowspan'))) return /^\d{1,4}$/.test(value.trim()) ? value.trim() : null;
      return null;
    };
    const out = [];
    const open = [];
    const re = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>\/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g;
    let at = 0;
    let m;
    const text = (t) => out.push(t.replace(/</g, '&lt;').replace(/>/g, '&gt;'));
    while ((m = re.exec(html))) {
      text(html.slice(at, m.index));
      at = re.lastIndex;
      if (m[0].startsWith('<!--')) continue;
      const tag = m[2].toLowerCase();
      if (Blocks.DROP_TAGS.includes(tag)) {
        if (!m[1]) {
          const end = new RegExp('</' + tag + '\\s*>', 'ig');
          end.lastIndex = at;
          const e = end.exec(html);
          at = e ? end.lastIndex : html.length;
          re.lastIndex = at;
        }
        continue;
      }
      if (!Blocks.SAFE_TAGS.includes(tag)) continue; // balise inconnue : retirée, son texte reste
      if (m[1]) {
        const i = open.lastIndexOf(tag);
        if (i >= 0) while (open.length > i) out.push(`</${open.pop()}>`);
        continue;
      }
      const attrs = [];
      const are = /([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
      let a;
      while ((a = are.exec(m[3]))) {
        const name = a[1].toLowerCase();
        const raw = a[2] ?? a[3] ?? a[4] ?? '';
        const value = name === 'class' || name === 'alt' ? decode(raw) : raw;
        const ok = allow(tag, name, value);
        if (ok !== null && ok !== undefined && !attrs.some((x) => x.startsWith(name + '='))) attrs.push(`${name}="${Blocks.attr(ok)}"`);
      }
      if (tag === 'img' && !attrs.some((x) => x.startsWith('src='))) continue;
      if (tag === 'img' && !attrs.some((x) => x.startsWith('alt='))) attrs.push('alt=""');
      out.push(`<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`);
      if (!Blocks.VOID_TAGS.includes(tag)) open.push(tag);
    }
    text(html.slice(at));
    while (open.length) out.push(`</${open.pop()}>`);
    return out.join('');
  },

  // ---- Bloc Markdown ⇄ modèle ----
  // Modèle : { type, ...champs du type }. Un bloc est lu par le premier type dont l'écriture redonne le même texte ; sinon il reste « raw ».

  /** Comparaison tolérante aux espaces de fin de ligne et aux lignes vides autour, jamais à l'indentation. */
  tidy(x) { return x.split('\n').map((l) => l.replace(/\s+$/, '')).join('\n').replace(/^\n+|\n+$/g, ''); },

  fromMarkdown(md) {
    const lines = Blocks.tidy(md).split('\n');
    const w = Blocks.WIDTH.exec(lines[0]);
    if (w) {
      if (lines.length === 1) return { type: 'space', width: w[1] };
      return { ...Blocks.fromMarkdown(lines.slice(1).join('\n')), width: w[1] };
    }
    const t = lines.join('\n');
    for (const type of Blocks.order) {
      const def = Blocks.types[type];
      const m = def.match ? def.match(t) : null;
      if (m && Blocks.tidy(def.toMarkdown(m)) === t) return { type, ...m };
    }
    return { type: 'raw', md };
  },

  /** Modèle → Markdown du bloc (vide si le bloc est vide : il disparaît à l'enregistrement). */
  toMarkdown(b) {
    const x = Blocks.def(b.type).toMarkdown(b);
    if (!b.width) return x;
    // Un bloc vidé disparaît, sa largeur avec lui ; l'Espace n'a que sa largeur.
    return x || b.type === 'space' ? `<!-- ${b.width} -->` + (x ? '\n' + x : '') : '';
  },

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
  lines(b) { return Blocks.mdLines(b).map((l) => l.replace(/^\s*(?:[-*]|\d+\.) /, '')).map(Blocks.inlineHtml); },

  /** Convertit un bloc texte en un autre type texte. Entre encadrés, l'icône et le titre suivent ; sinon le titre devient une ligne. */
  convert(b, type) {
    if (b.type === type) return b;
    const out = Blocks.convertBody(b, type);
    return b.width ? { ...out, width: b.width } : out;
  },
  convertBody(b, type) {
    const to = Blocks.def(type);
    const keep = Blocks.CALLOUTS.includes(b.type) && Blocks.CALLOUTS.includes(type);
    const lines = keep ? Blocks.htmlToMd(b.html ?? '', true).split('\n').filter((l) => l.trim() !== '') : Blocks.mdLines(b);
    // Vers un titre : une seule ligne, sans puces.
    if (to.single) return { type, html: Blocks.esc(Blocks.stripTags(lines.map((l) => Blocks.inlineHtml(l.replace(/^\s*(?:[-*]|\d+\.) /, ''))).join(' ')).replace(/\s+/g, ' ').trim()) };
    return { ...Blocks.blank(type), ...(keep ? { icon: b.icon, title: b.title } : {}), html: Blocks.linesToHtml(lines) };
  },

  /** Blocs qui remplacent `old` (réponse de l'IA sur un bloc) : un bloc seul, sans largeur écrite, garde celle de `old`. */
  keepWidth(old, blocks) {
    return old.width && blocks.length === 1 && !blocks[0].width ? [{ ...blocks[0], width: old.width }] : blocks;
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
  /** Adresse d'une image : « media/<id> » est réécrit avec l'adresse des médias (option `media`). */
  mediaUrl(src, media = 'media/') { return src.startsWith('media/') ? media + src.slice(6) : src; },

  // ---- Rendu publié : HTML sémantique, classes bq-*, sans Tailwind (feuille blockquilt-content.css) ----

  /** Un bloc → HTML. `ctx` : { media, ids } (ids : ancres déjà prises dans la page). */
  blockHtml(b, ctx = {}) { return Blocks.def(b.type).toHtml(b, { media: 'media/', ids: new Set(), ...ctx }); },

  /** Texte complet → `<article class="bq-content">`. options : { media: 'media/', title: true (h1 depuis le frontmatter, s'il n'y a pas de bloc H1) }. */
  toHtml(markdown, options = {}) {
    const { media = 'media/', title = true } = typeof options === 'string' ? { media: options } : options;
    const { meta, blocks } = Blocks.parse(markdown);
    const ctx = { media, ids: new Set() };
    const icon = meta.icon ? `<span class="bq-icon" aria-hidden="true">${Blocks.esc(meta.icon)}</span> ` : '';
    // Titre du frontmatter en <h1>, sauf si le contenu a déjà son bloc H1 : jamais deux <h1>.
    const head = title && meta.title && !blocks.some((b) => b.type === 'h1') ? `<header><h1>${icon}${Blocks.esc(meta.title)}</h1></header>\n` : '';
    const one = (b) => Blocks.def(b.type).toHtml(b, ctx);
    // Ligne composée : une colonne par bloc, de 2, 3 ou 4 sixièmes (blockquilt-content.css) ; une ligne d'Espaces seuls ne s'affiche pas.
    const col = (b) => (b.type === 'space' ? `<div class="bq-col bq-w${Blocks.SIXTHS[b.width]} bq-space" aria-hidden="true"></div>` : `<div class="bq-col bq-w${Blocks.SIXTHS[b.width]}">${one(b)}</div>`);
    const html = Blocks.rows(blocks).map((r) => (r.block ? one(r.block) : r.row.every((b) => b.type === 'space') ? '' : `<div class="bq-row">${r.row.map(col).join('')}</div>`));
    return `<article class="bq-content">\n${head}${html.filter(Boolean).join('\n')}\n</article>`;
  },
};

// ---- Types de base ----
{
  const body = (html) => Blocks.htmlToMd(html, true);
  const quoted = (x) => x.split('\n').map((l) => (l ? '> ' + l : '>')).join('\n');
  const lead = /^(#{1,6} |:::|>|\||```|~~~|-{3,}\s*$)/;
  // Classes de la carte et du badge dans l'éditeur. bq-tone / bq-badge : neutres, tirés de la couleur du texte de la page
  // (blockquilt.css) ; les encadrés, la vidéo, le code et le HTML gardent une teinte qui porte leur sens.
  const tone = (card, badge) => ({ card, badge });

  // Bordure noire : 3 px pour H1, 2 px pour H2, 1 px pour H3 — la page se lit par sections.
  const heading = (type, level, label, border) => Blocks.register(type, {
    label, short: label.replace('Titre ', ''), icon: 'heading', convertible: true, single: true,
    tone: tone(`bq-tone bq-tone-strong ${border}`, 'bq-badge'),
    match: (t) => { const m = new RegExp(`^#{${level}} (.+)$`).exec(t); return m ? { html: Blocks.esc(Blocks.plain(m[1])) } : null; },
    toMarkdown: (b) => { const x = Blocks.htmlToMd(Blocks.esc(Blocks.stripTags(b.html)), false, true).replace(/\n+/g, ' ').trim(); return x ? '#'.repeat(level) + ' ' + x : ''; },
    toHtml: (b, ctx) => {
      const text = Blocks.stripTags(b.html).trim();
      let id = Blocks.slug(text);
      for (let n = 2; ctx.ids.has(id); n++) id = Blocks.slug(text) + '-' + n;
      ctx.ids.add(id);
      return `<h${level} id="${id}">${Blocks.esc(text)}</h${level}>`;
    },
    blank: () => ({ html: '' }),
  });
  heading('h1', 1, 'Titre H1', 'border-[3px] border-stone-900');
  heading('h2', 2, 'Titre H2', 'border-2 border-stone-900');
  heading('h3', 3, 'Titre H3', 'border-stone-900');

  // Texte en grand (taille H1, H2, H3) sans la sémantique d'un titre : un paragraphe, hors du plan de la page et des ancres.
  // `:::t1` … `:::` (comme `:::carousel`), le texte en Markdown entre les deux.
  for (const [n, cls] of [[1, 'text-2xl font-extrabold'], [2, 'text-xl font-bold'], [3, 'text-[17px] font-bold']]) {
    Blocks.register('t' + n, {
      label: `Texte T${n} (taille H${n})`, short: 'T' + n, icon: 'type', convertible: true, size: cls,
      tone: tone('bq-tone bq-tone-dashed border-dashed', 'bq-badge'),
      match: (t) => {
        const m = new RegExp(`^:::t${n}\n([\\s\\S]+)\n:::$`).exec(t);
        if (!m || m[1].split('\n').some((l) => lead.test(l))) return null;
        return { html: Blocks.linesToHtml(m[1].split('\n')) };
      },
      toMarkdown: (b) => { const x = body(b.html); return x.trim() ? `:::t${n}\n${x}\n:::` : ''; },
      toHtml: (b) => `<div class="bq-t${n}">${Blocks.flowHtml(body(b.html).split('\n'))}</div>`,
      blank: () => ({ html: '' }),
    });
  }

  Blocks.register('text', {
    label: 'Texte', short: 'Texte', icon: 'align_left', convertible: true,
    tone: tone('bq-tone', 'bq-badge'),
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
    tone: tone('bq-tone bq-tone-quote border-l-4', 'bq-badge'),
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
    tone: tone('bq-tone', 'bq-badge'),
    match: (t) => {
      const [, line = t, size1, ratio1, size2, ratio2] = Blocks.PHOTO_OPTS.exec(t) || [];
      const m = Blocks.PHOTO.exec(line);
      return m ? { src: m[2], alt: Blocks.plain(m[1]), size: size1 || size2 || '', ratio: ratio1 || ratio2 || '' } : null;
    },
    // Le carrousel écrit et rend ses photos par ces deux fonctions : elles n'ont ni taille ni format.
    toMarkdown: (b) => {
      if (!b.src) return '';
      const opts = [b.size && 'size=' + b.size, b.ratio && 'ratio=' + b.ratio].filter(Boolean).join(' ');
      return `![${Blocks.htmlToMd(Blocks.esc(b.alt), false, true).replace(/\n/g, ' ')}](${b.src})` + (opts ? `{${opts}}` : '');
    },
    toHtml: (b, ctx) => {
      const cls = [b.size && 'bq-photo-' + b.size, b.ratio && 'bq-ratio-' + b.ratio.replace(':', 'x')].filter(Boolean).join(' ');
      return `<figure${cls ? ` class="${cls}"` : ''}><img src="${Blocks.attr(Blocks.mediaUrl(b.src, ctx.media))}" alt="${Blocks.attr(b.alt)}" loading="lazy">${b.alt ? `<figcaption>${Blocks.esc(b.alt)}</figcaption>` : ''}</figure>`;
    },
    blank: () => ({ src: '', alt: '', size: '', ratio: '' }),
  });

  // Carrousel : `:::carousel`, une photo par ligne, `:::`. Rendu : une photo à la fois (scroll-snap), flèches et puces avec blockquilt-content.js.
  Blocks.register('carousel', {
    label: 'Carrousel', short: 'Carrousel', icon: 'images', group: 'media',
    tone: tone('bq-tone', 'bq-badge'),
    match: (t) => {
      const lines = t.split('\n');
      if (lines[0] !== ':::carousel' || lines[lines.length - 1] !== ':::' || lines.length < 3) return null;
      const items = lines.slice(1, -1).map((l) => Blocks.PHOTO.exec(l));
      return items.every(Boolean) ? { items: items.map((m) => ({ src: m[2], alt: Blocks.plain(m[1]) })) } : null;
    },
    toMarkdown: (b) => {
      const items = b.items.filter((x) => x.src);
      return items.length ? [':::carousel', ...items.map((x) => Blocks.types.photo.toMarkdown(x)), ':::'].join('\n') : '';
    },
    toHtml: (b, ctx) => {
      const items = b.items.filter((x) => x.src);
      // Flèches et puces cachées : blockquilt-content.js les montre et les relie (sans lui, la piste défile au doigt).
      return `<div class="bq-carousel" role="group" aria-roledescription="carrousel" aria-label="${items.length} photos">`
        + `<div class="bq-carousel-track">${items.map((x) => Blocks.types.photo.toHtml(x, ctx)).join('')}</div>`
        + '<button type="button" class="bq-carousel-prev" aria-label="Photo précédente" hidden></button><button type="button" class="bq-carousel-next" aria-label="Photo suivante" hidden></button>'
        + '<div class="bq-carousel-dots" hidden></div></div>';
    },
    blank: () => ({ items: [] }),
  });

  // Carte : `:::card`, puis, chacun facultatif et dans cet ordre : une photo, un titre `### …`, du texte, un lien seul sur
  // la dernière ligne (rendu en bouton) ; puis `:::`. Le titre reste hors du plan de la page (pas d'ancre).
  const LINK = /^\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:|#)[^)\s]+|\/(?![\/\\])[^)\s]*)\)$/;
  Blocks.register('card', {
    label: 'Carte', short: 'Carte', icon: 'card', group: 'media',
    tone: tone('bq-tone', 'bq-badge'),
    match: (t) => {
      const lines = t.split('\n');
      if (lines[0] !== ':::card' || lines[lines.length - 1] !== ':::' || lines.length < 3) return null;
      const rest = lines.slice(1, -1);
      const photo = Blocks.PHOTO.exec(rest[0]);
      if (photo) rest.shift();
      const title = /^### (.+)$/.exec(rest[0] ?? '');
      if (title) rest.shift();
      const link = LINK.exec(rest[rest.length - 1] ?? '');
      if (link) rest.pop();
      if (rest.some((l) => lead.test(l) || Blocks.PHOTO.test(l))) return null;
      return { src: photo ? photo[2] : '', alt: photo ? Blocks.plain(photo[1]) : '', title: title ? Blocks.plain(title[1]) : '',
        html: rest.length ? Blocks.linesToHtml(rest) : '', label: link ? Blocks.plain(link[1]) : '', href: link ? link[2] : '' };
    },
    toMarkdown: (b) => {
      const text = body(b.html);
      const title = b.title.replace(/\s+/g, ' ').trim();
      const label = b.label.replace(/\s+/g, ' ').trim();
      const href = Blocks.safeHref(b.href);
      const lines = [
        b.src && Blocks.types.photo.toMarkdown(b),
        title && '### ' + Blocks.htmlToMd(Blocks.esc(title), false, true),
        text.trim() && text,
        label && href && `[${Blocks.htmlToMd(Blocks.esc(label), false, true)}](${href})`,
      ].filter(Boolean);
      return lines.length ? [':::card', ...lines, ':::'].join('\n') : '';
    },
    toHtml: (b, ctx) => {
      const img = b.src ? `<img src="${Blocks.attr(Blocks.mediaUrl(b.src, ctx.media))}" alt="${Blocks.attr(b.alt)}" loading="lazy">` : '';
      const text = body(b.html);
      const link = b.label && /^(https?:\/\/|mailto:|tel:|#.|\/(?![\/\\]))/i.test(b.href) ? `<p><a class="bq-card-link" href="${Blocks.attr(b.href)}">${Blocks.esc(b.label)}</a></p>` : '';
      return `<div class="bq-card">${img}<div class="bq-card-body">${b.title ? `<h3 class="bq-card-title">${Blocks.esc(b.title)}</h3>` : ''}${text.trim() ? Blocks.flowHtml(text.split('\n')) : ''}${link}</div></div>`;
    },
    blank: () => ({ src: '', alt: '', title: '', html: '', label: '', href: '' }),
  });

  Blocks.register('video', {
    label: 'Vidéo', short: 'Vidéo', icon: 'video', group: 'media',
    tone: tone('bg-rose-50/50 border-rose-200/80 text-rose-950', 'bg-rose-100 text-rose-900 border-rose-200'),
    match: (t) => (Blocks.VIDEO.test(t) ? { url: t } : null),
    toMarkdown: (b) => b.url.trim(),
    toHtml: (b) => {
      const src = Blocks.embedUrl(b.url);
      const href = Blocks.safeHref(b.url);
      if (src) return `<figure class="bq-video"><iframe src="${Blocks.attr(src)}" title="Vidéo" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></figure>`;
      return href ? `<p><a href="${Blocks.attr(href)}">${Blocks.esc(b.url)}</a></p>` : `<p>${Blocks.esc(b.url)}</p>`;
    },
    blank: () => ({ url: '' }),
  });

  // Bloc HTML : le source est gardé tel quel ; le rendu passe toujours par Blocks.sanitize.
  // Classes (Tailwind ou autres) : seules celles présentes dans le CSS de la page ont un effet.
  Blocks.register('html', {
    label: 'HTML', short: 'HTML', icon: 'html', group: 'structure',
    tone: tone('bg-white border-indigo-200/90 text-stone-900', 'bg-indigo-100 text-indigo-900 border-indigo-200'),
    match: (t) => { const m = /^:::html\n([\s\S]*)\n:::$/.exec(t); return m && !/^:::/m.test(m[1]) ? { html: m[1] } : null; },
    toMarkdown: (b) => (b.html.trim() ? `:::html\n${b.html.replace(/^(:::)/gm, ' $1')}\n:::` : ''),
    toHtml: (b, ctx) => `<div class="bq-html">${Blocks.sanitize(b.html, ctx.media)}</div>`,
    blank: () => ({ html: '' }),
  });

  Blocks.register('hr', {
    label: 'Ligne horizontale', short: 'Ligne', icon: 'minus', group: 'structure', ai: false, // aucun texte : pas d'IA sur ce bloc
    tone: tone('bq-tone', 'bq-badge'),
    match: (t) => (t === '---' ? {} : null),
    toMarkdown: () => '---',
    toHtml: () => '<hr>',
    blank: () => ({}),
  });

  // Espace : une place vide dans une ligne composée. Son texte n'est que sa largeur (« <!-- 1/3 --> »), lue par fromMarkdown.
  Blocks.register('space', {
    label: 'Espace', short: 'Espace', icon: 'space', group: 'structure', ai: false,
    tone: tone('bq-tone bq-tone-dashed border-dashed', 'bq-badge'),
    toMarkdown: () => '',
    toHtml: () => '',
    blank: () => ({ width: '1/3' }),
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
    tone: tone('bq-tone bq-tone-dashed border-dashed', 'bq-badge'),
    toMarkdown: (b) => b.md ?? '',
    toHtml: (b) => `<pre class="bq-raw">${Blocks.esc(b.md ?? '')}</pre>`,
    blank: () => ({ md: '' }),
  });
}

if (typeof module !== 'undefined') module.exports = Blocks;
