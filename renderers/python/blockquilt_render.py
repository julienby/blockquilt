"""blockquilt_render — Moteur de rendu HTML autonome (zéro dépendance) pour le format blockquilt."""

from __future__ import annotations

import re
import unicodedata
from typing import Any, Iterator

WIDTH_RE = re.compile(r"^<!-- (1/3|1/2|2/3) -->$")
SIXTHS = {"1/3": 2, "1/2": 3, "2/3": 4}
CALLOUTS = {
    "info": "Info",
    "tip": "Astuce",
    "success": "Succès",
    "warning": "Attention",
    "danger": "Danger",
}
VIDEO_RE = re.compile(r"^https?://(?:www\.)?(?:youtube\.com|youtu\.be|vimeo\.com)/\S+$", re.I)
PHOTO_RE = re.compile(r"^!\[((?:\\.|[^\]\\])*)\]\(((?:media/|https://)[^)\s]+)\)$")
# Taille et format d'une photo seule, sous une seule forme : {size=…}, {ratio=…} ou {size=… ratio=…}.
PHOTO_OPTS_RE = re.compile(r"^(.+)\{(?:size=(small|medium)|ratio=(16:9|4:3|1:1)|size=(small|medium) ratio=(16:9|4:3|1:1))\}$")
LINK_RE = re.compile(r"^\[([^\]]+)\]\(((?:https?://|mailto:|tel:)[^)\s]+)\)$")
LEAD_RE = re.compile(r"^(#{1,6} |:::|>|\||```|~~~|-{3,}\s*$)")
INLINE_RE = re.compile(
    r"\\([\\`*_{}[\]()#+\-.!>=:|~])"
    r"|`([^`\n]+)`"
    r"|\*\*(\S(?:.*?\S)?)\*\*"
    r"|\*(\S(?:.*?\S)?)\*"
    r"|\+\+(\S(?:.*?\S)?)\+\+"
    r"|==(\S(?:.*?\S)?)==|"
    r"\[([^\]]+)\]\(((?:https?://|mailto:|tel:)[^)\s]+)\)"
)

ENTITIES = {"&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'"}
SAFE_TAGS = {
    "div", "span", "p", "br", "hr", "h2", "h3", "h4", "ul", "ol", "li",
    "strong", "em", "u", "mark", "small", "a", "img", "figure", "figcaption",
    "table", "thead", "tbody", "tr", "th", "td",
}
DROP_TAGS = {
    "script", "style", "iframe", "frame", "frameset", "object", "embed",
    "applet", "svg", "math", "template", "noscript", "noembed", "noframes",
    "textarea", "title", "select", "option", "xmp", "plaintext", "head",
    "canvas", "audio", "video", "button", "form",
}
VOID_TAGS = {"br", "hr", "img"}
NAMED_HTML = {
    "amp": "&", "lt": "<", "gt": ">", "quot": '"', "apos": "'",
    "colon": ":", "tab": "\t", "newline": "\n", "nbsp": " ",
}


def esc(s: Any) -> str:
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def attr(s: Any) -> str:
    return esc(s).replace('"', "&quot;")


def unesc(s: str) -> str:
    return re.sub(r"&(?:nbsp|amp|lt|gt|quot|#39);", lambda m: ENTITIES[m.group(0)], s)


def media_url(src: str, media: str = "media/") -> str:
    return media + src[6:] if src.startswith("media/") else src


def slug(text: str) -> str:
    nfd = unicodedata.normalize("NFD", str(text))
    stripped = "".join(ch for ch in nfd if not ("\u0300" <= ch <= "\u036f"))
    s = re.sub(r"[^a-z0-9]+", "-", stripped.lower()).strip("-")
    return s or "section"


def embed_url(url: str) -> str:
    m = re.match(r"^https?://(?:www\.)?youtube\.com/watch\?(?:[^#]*&)?v=([\w-]{11})", url, re.I)
    if m:
        return "https://www.youtube-nocookie.com/embed/" + m.group(1)
    m = re.match(r"^https?://youtu\.be/([\w-]{11})", url, re.I)
    if m:
        return "https://www.youtube-nocookie.com/embed/" + m.group(1)
    m = re.match(r"^https?://(?:www\.)?vimeo\.com/(\d+)", url, re.I)
    if m:
        return "https://player.vimeo.com/video/" + m.group(1)
    return ""


def inline_html(md: str) -> str:
    out: list[str] = []
    at = 0
    for m in INLINE_RE.finditer(md):
        out.append(esc(md[at:m.start()]))
        at = m.end()
        if m.group(1) is not None:
            out.append(esc(m.group(1)))
        elif m.group(2) is not None:
            out.append(f"<code>{esc(m.group(2))}</code>")
        elif m.group(3) is not None:
            out.append(f"<strong>{inline_html(m.group(3))}</strong>")
        elif m.group(4) is not None:
            out.append(f"<em>{inline_html(m.group(4))}</em>")
        elif m.group(5) is not None:
            out.append(f"<u>{inline_html(m.group(5))}</u>")
        elif m.group(6) is not None:
            out.append(f"<mark>{inline_html(m.group(6))}</mark>")
        else:
            out.append(f'<a href="{attr(m.group(8))}">{inline_html(m.group(7))}</a>')
    out.append(esc(md[at:]))
    return "".join(out)


def plain(md: str) -> str:
    return unesc(re.sub(r"<[^>]+>", "", inline_html(md)))


def list_tree(lines: list[str]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    stack: list[dict[str, Any]] = []
    for line in lines:
        m = re.match(r"^( *)(-|\d+\.) (.*)$", line)
        if not m or (not stack and len(m.group(1)) > 0):
            stack = []
            out.append({"line": line})
            continue
        indent = len(m.group(1))
        tag = "ul" if m.group(2) == "-" else "ol"
        while len(stack) > 1 and indent < stack[-1]["indent"]:
            stack.pop()
        top = stack[-1] if stack else None
        if top and indent > top["indent"]:
            lst = {"tag": tag, "items": []}
            top["list"]["items"][-1]["subs"].append(lst)
            stack.append({"indent": indent, "list": lst})
        elif not top or top["list"]["tag"] != tag:
            lst = {"tag": tag, "items": []}
            if len(stack) > 1:
                stack.pop()
                parent = stack[-1]["list"]["items"]
                parent[-1]["subs"].append(lst)
                stack.append({"indent": indent, "list": lst})
            else:
                out.append({"list": lst})
                stack = [{"indent": indent, "list": lst}]
        stack[-1]["list"]["items"].append({"text": m.group(3), "subs": []})
    return out


def list_html(lst: dict[str, Any]) -> str:
    items = "".join(
        f"<li>{inline_html(x['text'])}{''.join(list_html(s) for s in x['subs'])}</li>"
        for x in lst["items"]
    )
    return f"<{lst['tag']}>{items}</{lst['tag']}>"


def flow_html(lines: list[str]) -> str:
    out: list[str] = []
    para: list[str] = []

    def flush() -> None:
        if para:
            out.append(f"<p>{'<br>'.join(inline_html(l) for l in para)}</p>")
            para.clear()

    for node in list_tree(lines):
        if "list" in node:
            flush()
            out.append(list_html(node["list"]))
        elif node["line"].strip() == "":
            flush()
        else:
            para.append(node["line"])
    flush()
    return "".join(out)


# ---- Réécriture en Markdown : ports de blockquilt.js, pour savoir si un bloc se relit sans perte ----

HTML_TOKEN_RE = re.compile(r"<(/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^>]*)?)>|([^<]+)")
MD_MARKS = {"b": "**", "strong": "**", "i": "*", "em": "*", "u": "++", "mark": "==", "a": "a", "code": "`"}


def lines_to_html(lines: list[str]) -> str:
    """Blocks.linesToHtml : lignes séparées par <br>, listes en <ul> / <ol>."""
    return "<br>".join(list_html(n["list"]) if "list" in n else inline_html(n["line"]) for n in list_tree(lines))


def esc_text(s: str) -> str:
    """Blocks.escText : les signes qui changeraient le sens sont protégés par « \\ ». \\W comme en JS : ASCII."""
    s = s.replace("\\", "\\\\")
    s = re.sub(r"[*[\]`]", lambda m: "\\" + m.group(0), s)
    s = s.replace("++", "\\+\\+").replace("==", "\\=\\=")
    return re.sub(r"(^|\W)_|_(?=\W|\Z)", lambda m: m.group(0).replace("_", "\\_", 1), s, flags=re.ASCII)


def safe_href(href: str) -> str:
    """Blocks.safeHref : adresse acceptée pour un lien, sinon chaîne vide."""
    h = unesc(href).strip()
    if re.match(r"^(https?://|mailto:|tel:)", h, re.I):
        full = h
    elif re.match(r"^[\w-]+(\.[\w-]+)+(/\S*)?\Z", h, re.ASCII):
        full = "https://" + h
    else:
        full = ""
    return full.replace(" ", "%20").replace("(", "%28").replace(")", "%29")


def html_to_md(html: str, bullets: bool = False) -> str:
    """Blocks.htmlToMd : HTML d'un champ → Markdown (listes, mises en forme, signes protégés)."""
    lines: list[str] = []
    lists: list[dict[str, Any]] = []
    frames: list[dict[str, str]] = []
    cur = ""
    li_prefix = ""
    start = re.compile(r"^(#{1,6} |\+ |>|:::|~~~|\|)" if bullets else r"^(#{1,6} |[-+] |>|:::|~~~|\|)")

    def put(x: str) -> None:
        nonlocal cur
        if frames:
            frames[-1]["buf"] += x
        else:
            cur += x

    def flush() -> None:
        nonlocal cur, li_prefix
        if li_prefix != "":
            clean = re.sub(r"\n+", " ", cur).strip()
            if clean != "":
                lines.append(li_prefix + clean)
            cur = ""
            li_prefix = ""
            return
        line = start.sub(r"\\\1", cur, count=1)
        line = re.sub(r"^(\d+)([.)]) ", r"\1\\\2 ", line, count=1)
        lines.append(re.sub(r"^(-{3,}\s*)\Z", r"\\\1", line))
        cur = ""

    for m in HTML_TOKEN_RE.finditer(html):
        if m.group(4) is not None:
            text = unesc(m.group(4)).replace("\u00a0", " ")
            in_code = bool(frames) and frames[-1]["tag"] == "code"
            put(text if in_code else esc_text(text))
            continue
        closing = m.group(1) == "/"
        tag = m.group(2).lower()
        if tag in MD_MARKS:
            if not closing:
                href = ""
                if tag == "a":
                    hm = re.search(r'href\s*=\s*"([^"]*)"', m.group(3), re.I)
                    href = safe_href(hm.group(1) if hm else "")
                frames.append({"mark": MD_MARKS[tag], "href": href, "tag": tag, "buf": ""})
            elif frames:
                f = frames.pop()
                lead, core, trail = re.match(r"^(\s*)([\s\S]*?)(\s*)\Z", f["buf"]).groups()
                if core == "":
                    put(lead + trail)
                elif f["tag"] == "a":
                    put(f"{lead}[{core}]({f['href']}){trail}" if f["href"] else lead + core + trail)
                elif f["tag"] == "code":
                    put(lead + esc_text(core) + trail if "`" in core else lead + "`" + core + "`" + trail)
                else:
                    put(lead + f["mark"] + core + f["mark"] + trail)
        elif tag in ("ul", "ol"):
            if cur != "" or li_prefix != "":
                flush()
            if not closing:
                lists.append({"tag": tag, "n": 0, "width": 2})
            elif lists:
                lists.pop()
        elif tag == "li":
            if cur != "" or li_prefix != "":
                flush()
            if not closing:
                top = lists[-1] if lists else None
                if top and top["tag"] == "ol":
                    top["n"] += 1
                    marker = f"{top['n']}. "
                else:
                    marker = "- "
                if top:
                    top["width"] = len(marker)
                li_prefix = " " * sum(x["width"] for x in lists[:-1]) + marker
        elif tag == "br":
            if li_prefix == "":
                flush()
        elif tag in ("div", "p") and cur != "":
            flush()
    if cur != "" or li_prefix != "":
        flush()
    return re.sub(r"^\n+|\n+\Z", "", "\n".join(lines)).replace("****", "")


def _decode_entities(v: str) -> str:
    def hex_sub(m: re.Match[str]) -> str:
        cp = int(m.group(1), 16)
        return chr(cp) if 0 < cp <= 0x10FFFF else "\ufffd"

    def dec_sub(m: re.Match[str]) -> str:
        cp = int(m.group(1))
        return chr(cp) if 0 < cp <= 0x10FFFF else "\ufffd"

    v = re.sub(r"&#x([0-9a-f]+);?", hex_sub, v, flags=re.I)
    v = re.sub(r"&#(\d+);?", dec_sub, v)
    return re.sub(
        r"&(amp|lt|gt|quot|apos|colon|tab|newline|nbsp);?",
        lambda m: NAMED_HTML[m.group(1).lower()],
        v,
        flags=re.I,
    )


def sanitize(html: str, media: str = "media/") -> str:
    def check_url(v: str, allowed: re.Pattern[str]) -> str | None:
        u = re.sub(r"[\u0000-\u0020\u007f-\u009f\u00ad\u200b-\u200f\u2028\u2029\ufeff]", "", _decode_entities(v))
        return u if allowed.match(u) else None

    def allow(tag: str, name: str, value: str) -> str | None:
        if name == "class":
            return value
        if tag == "a" and name == "href":
            return check_url(value, re.compile(r"^(https?://|mailto:|tel:)", re.I))
        if tag == "img" and name == "src":
            u = check_url(value, re.compile(r"^(https://|media/[\w.-]+$)", re.I))
            return media_url(u, media) if u else None
        if tag == "img" and name == "alt":
            return value
        if (tag == "img" and name in ("width", "height")) or (tag in ("th", "td") and name in ("colspan", "rowspan")):
            t = value.strip()
            return t if re.match(r"^\d{1,4}$", t) else None
        return None

    out: list[str] = []
    open_tags: list[str] = []
    tag_re = re.compile(
        r'<!--[\s\S]*?(?:-->|$)|<(/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"\'>/=]+(?:\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s"\'=<>`]+))?)*)\s*/?>'
    )
    attr_re = re.compile(r'([^\s"\'>/=]+)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'=<>`]+)))?')
    at = 0

    def push_text(t: str) -> None:
        out.append(t.replace("<", "&lt;").replace(">", "&gt;"))

    while True:
        m = tag_re.search(html, at)
        if not m:
            break
        push_text(html[at:m.start()])
        at = m.end()
        if m.group(0).startswith("<!--"):
            continue
        tag = m.group(2).lower()
        if tag in DROP_TAGS:
            if not m.group(1):
                end_m = re.search(rf"</{re.escape(tag)}\s*>", html[at:], re.I)
                at = at + end_m.end() if end_m else len(html)
            continue
        if tag not in SAFE_TAGS:
            continue
        if m.group(1):
            if tag in open_tags:
                idx = len(open_tags) - 1 - open_tags[::-1].index(tag)
                while len(open_tags) > idx:
                    out.append(f"</{open_tags.pop()}>")
            continue
        attrs: list[str] = []
        seen_names: set[str] = set()
        for a in attr_re.finditer(m.group(3)):
            name = a.group(1).lower()
            raw = a.group(2) if a.group(2) is not None else (a.group(3) if a.group(3) is not None else (a.group(4) or ""))
            val = _decode_entities(raw) if name in ("class", "alt") else raw
            ok = allow(tag, name, val)
            if ok is not None and name not in seen_names:
                seen_names.add(name)
                attrs.append(f'{name}="{attr(ok)}"')
        if tag == "img" and "src" not in seen_names:
            continue
        if tag == "img" and "alt" not in seen_names:
            attrs.append('alt=""')
        attr_str = (" " + " ".join(attrs)) if attrs else ""
        out.append(f"<{tag}{attr_str}>")
        if tag not in VOID_TAGS:
            open_tags.append(tag)
    push_text(html[at:])
    while open_tags:
        out.append(f"</{open_tags.pop()}>")
    return "".join(out)


def frontmatter(markdown: str) -> tuple[dict[str, str], list[str]]:
    lines = markdown.replace("\r\n", "\n").split("\n")
    if not lines or lines[0] != "---":
        return {}, lines
    try:
        end = lines.index("---", 1)
    except ValueError:
        return {}, lines
    meta: dict[str, str] = {}
    for line in lines[1:end]:
        m = re.match(r"^([A-Za-z_][\w-]*):(?: (.*))?$", line)
        if not m or m.group(1) in meta:
            return {}, lines
        key = m.group(1)
        val = m.group(2) if m.group(2) is not None else ""
        expected = f"{key}:" if val == "" else f"{key}: {val}"
        if expected != line:
            return {}, lines
        meta[key] = val
    return meta, lines[end + 1 :]


def split_chunks(lines: list[str]) -> list[str]:
    chunks: list[str] = []
    cur: list[str] = []
    fence_close: re.Pattern[str] | None = None

    def flush() -> None:
        if cur and any(l.strip() != "" for l in cur):
            chunks.append("\n".join(cur))
        cur.clear()

    def open_block() -> None:
        if not (len(cur) == 1 and WIDTH_RE.match(cur[0])):
            flush()

    for line in lines:
        if fence_close is not None:
            cur.append(line)
            if fence_close.match(line):
                fence_close = None
                flush()
        elif (m := re.match(r"^(`{3,}|~{3,})", line)):
            open_block()
            cur.append(line)
            fence_close = re.compile(r"^" + re.escape(m.group(1)) + r"\s*$")
        elif re.match(r"^:::\w", line):
            open_block()
            cur.append(line)
            fence_close = re.compile(r"^:::\s*$")
        elif re.match(r"^#{1,6} ", line):
            open_block()
            cur.append(line)
            flush()
        elif line.strip() == "":
            flush()
        else:
            cur.append(line)
    flush()
    return chunks


def _tidy(x: str) -> str:
    return "\n".join(re.sub(r"\s+$", "", l) for l in x.split("\n")).strip("\n")


def _first_emoji(text: str) -> str:
    s = text.strip()
    if not s:
        return ""
    ch = s[0]
    cp = ord(ch)
    # Regional indicator pair
    if 0x1F1E6 <= cp <= 0x1F1FF:
        return s[:2] if len(s) > 1 and 0x1F1E6 <= ord(s[1]) <= 0x1F1FF else ch
    # Keycap sequence: [0-9#*] + optional FE0F + 20E3
    if len(s) >= 2 and (s[1] == "\u20e3" or (len(s) >= 3 and s[1] == "\ufe0f" and s[2] == "\u20e3")):
        return s[:3] if s[1] == "\ufe0f" else s[:2]
    # Extended pictographic / emoji blocks (including ZWJ sequences and variation selectors)
    if cp >= 0x2000 and unicodedata.category(ch) in ("So", "Sk") or 0x1F000 <= cp <= 0x1FAFF:
        i = 1
        while i < len(s):
            if s[i] in ("\ufe0f", "\ufe0e") or 0x1F3FB <= ord(s[i]) <= 0x1F3FF:
                i += 1
            elif s[i] == "\u200d" and i + 1 < len(s):
                i += 2
            else:
                break
        return s[:i]
    return ""


def _photo(t: str) -> dict[str, Any] | None:
    """Bloc photo : l'image, puis sa taille et son format facultatifs."""
    o = PHOTO_OPTS_RE.match(t)
    m = PHOTO_RE.match(o.group(1) if o else t)
    if not m:
        return None
    size = (o.group(2) or o.group(4)) if o else ""
    ratio = (o.group(3) or o.group(5)) if o else ""
    return {"type": "photo", "src": m.group(2), "alt": plain(m.group(1)), "size": size or "", "ratio": ratio or ""}


def _body(lines: list[str]) -> str:
    """Texte d'un bloc tel que l'éditeur le réécrit : Blocks.htmlToMd(Blocks.linesToHtml(lignes), true)."""
    return html_to_md(lines_to_html(lines), True)


def _quoted(x: str) -> str:
    return "\n".join("> " + l if l else ">" for l in x.split("\n"))


def _photo_md(b: dict[str, Any]) -> str:
    if not b["src"]:
        return ""
    opts = " ".join(x for x in [b.get("size") and "size=" + b["size"], b.get("ratio") and "ratio=" + b["ratio"]] if x)
    alt = html_to_md(esc(b["alt"])).replace("\n", " ")
    return f"![{alt}]({b['src']})" + (f"{{{opts}}}" if opts else "")


def _to_markdown(b: dict[str, Any]) -> str:
    """Les toMarkdown de blockquilt.js : le texte que l'éditeur écrirait pour ce bloc."""
    t = b["type"]
    if t in ("h1", "h2", "h3"):
        x = re.sub(r"\n+", " ", html_to_md(esc(b["text"]))).strip()
        return "#" * int(t[1]) + " " + x if x else ""
    if t == "text":
        x = _body(b["lines"])
        # Comme le bloc texte de blockquilt.js : si les listes ne se relisent pas, les lignes telles quelles.
        if x != "\n".join(b["lines"]):
            x = html_to_md("<br>".join(inline_html(l) for l in b["lines"]), True)
        return x
    if t in ("t1", "t2", "t3"):
        x = _body(b["lines"])
        return f":::{t}\n{x}\n:::" if x.strip() else ""
    if t == "quote":
        x = _body(b["lines"])
        return _quoted(x) if x.strip() else ""
    if t in CALLOUTS:
        x = _body(b["lines"])
        title = re.sub(r"\s+", " ", b["title"]).strip()
        if x.strip() == "" and not title:
            return ""
        head = f"> [!{t}]" + (" " + b["icon"] if b["icon"] else "") + (" " + title if title else "")
        return head if x.strip() == "" else head + "\n" + _quoted(x)
    if t == "photo":
        return _photo_md(b)
    if t == "carousel":
        items = [x for x in b["items"] if x["src"]]
        return "\n".join([":::carousel", *(_photo_md(x) for x in items), ":::"]) if items else ""
    if t == "card":
        x = _body(b["lines"]) if b["lines"] else ""
        title = re.sub(r"\s+", " ", b["title"]).strip()
        label = re.sub(r"\s+", " ", b["label"]).strip()
        parts = [
            _photo_md(b),
            "### " + html_to_md(esc(title)) if title else "",
            x if x.strip() else "",
            f"[{html_to_md(esc(label))}]({b['href'].strip()})" if label and b["href"].strip() else "",
        ]
        parts = [p for p in parts if p]
        return "\n".join([":::card", *parts, ":::"]) if parts else ""
    if t == "video":
        return b["url"].strip()
    if t == "html":
        return ":::html\n" + re.sub(r"^(:::)", r" \1", b["html"], flags=re.M) + "\n:::" if b["html"].strip() else ""
    if t == "hr":
        return "---"
    if t == "code":
        if b["code"].strip() == "":
            return ""
        longest = max([2, *(len(x) for x in re.findall(r"^`{3,}", b["code"], re.M))])
        fence = "`" * (longest + 1)
        return f"{fence}{b['lang']}\n{b['code']}\n{fence}"
    return ""


def _parse_block(md: str) -> dict[str, Any]:
    """Comme Blocks.fromMarkdown : le premier type qui se réécrit à l'identique ; sinon « texte source » (raw)."""
    lines = _tidy(md).split("\n")
    w = WIDTH_RE.match(lines[0])
    if w:
        if len(lines) == 1:
            return {"type": "space", "width": w.group(1)}
        b = _parse_block("\n".join(lines[1:]))
        b["width"] = w.group(1)
        return b
    t = "\n".join(lines)
    for b in _candidates(t, lines):
        if _tidy(_to_markdown(b)) == t:
            return b
    return {"type": "raw", "md": md}


def _candidates(t: str, lines: list[str]) -> Iterator[dict[str, Any]]:
    """Les types dont la forme correspond, dans l'ordre de blockquilt.js (Blocks.order)."""
    # h1, h2, h3
    for level in (1, 2, 3):
        m = re.match(rf"^#{{{level}}} (.+)$", t)
        if m and "\n" not in t:
            yield {"type": f"h{level}", "text": plain(m.group(1))}
    # t1, t2, t3
    for n in (1, 2, 3):
        m = re.match(rf"^:::t{n}\n([\s\S]+)\n:::$", t)
        if m and not any(LEAD_RE.match(l) for l in m.group(1).split("\n")):
            yield {"type": f"t{n}", "lines": m.group(1).split("\n")}
    # text
    if not any(LEAD_RE.match(l) for l in lines) and not _photo(t) and not VIDEO_RE.match(t):
        yield {"type": "text", "lines": lines}
    # quote
    if all(l.startswith(">") for l in lines) and not re.match(r"^> ?\[!", t):
        yield {"type": "quote", "lines": [re.sub(r"^> ?", "", l) for l in lines]}
    # callouts
    first, rest = lines[0], lines[1:]
    cm = re.match(r"^> \[!(\w+)\](?: (.*))?$", first)
    if cm and cm.group(1) in CALLOUTS and all(l.startswith(">") for l in rest):
        head = (cm.group(2) or "").strip()
        icon = _first_emoji(head)
        title = head[len(icon) :].strip()
        yield {
            "type": cm.group(1),
            "icon": icon,
            "title": title,
            "lines": [re.sub(r"^> ?", "", l) for l in rest],
        }
    # photo
    photo = _photo(t)
    if photo:
        yield photo
    # carousel
    if len(lines) >= 3 and lines[0] == ":::carousel" and lines[-1] == ":::":
        items = [PHOTO_RE.match(l) for l in lines[1:-1]]
        if all(items):
            yield {
                "type": "carousel",
                "items": [{"src": m.group(2), "alt": plain(m.group(1))} for m in items if m],
            }
    # card
    if len(lines) >= 3 and lines[0] == ":::card" and lines[-1] == ":::":
        body_lines = list(lines[1:-1])
        c_photo = PHOTO_RE.match(body_lines[0]) if body_lines else None
        if c_photo:
            body_lines.pop(0)
        c_title = re.match(r"^### (.+)$", body_lines[0]) if body_lines else None
        if c_title:
            body_lines.pop(0)
        c_link = LINK_RE.match(body_lines[-1]) if body_lines else None
        if c_link:
            body_lines.pop()
        if not any(LEAD_RE.match(l) or PHOTO_RE.match(l) for l in body_lines):
            yield {
                "type": "card",
                "src": c_photo.group(2) if c_photo else "",
                "alt": plain(c_photo.group(1)) if c_photo else "",
                "title": plain(c_title.group(1)) if c_title else "",
                "lines": body_lines,
                "label": plain(c_link.group(1)) if c_link else "",
                "href": c_link.group(2) if c_link else "",
            }
    # video
    if VIDEO_RE.match(t):
        yield {"type": "video", "url": t}
    # html
    hm = re.match(r"^:::html\n([\s\S]*)\n:::$", t)
    if hm and not re.search(r"^:::", hm.group(1), re.M):
        yield {"type": "html", "html": hm.group(1)}
    # hr
    if t == "---":
        yield {"type": "hr"}
    # code
    km = re.match(r"^(`{3,})([\w+#.-]*)\n([\s\S]*?)\n?\1$", t)
    if km:
        yield {"type": "code", "lang": km.group(2), "code": km.group(3)}


def _rows(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    row: list[dict[str, Any]] | None = None
    total = 0
    for b in blocks:
        n = SIXTHS.get(b.get("width", ""))
        if not n:
            row = None
            out.append({"block": b})
            continue
        if row is None or total + n > 6:
            row = []
            total = 0
            out.append({"row": row})
        row.append(b)
        total += n
        if total == 6:
            row = None
    return out


def _render_block(b: dict[str, Any], media: str, ids: set[str]) -> str:
    t = b["type"]
    if t in ("h1", "h2", "h3"):
        level = t[1]
        text = b["text"].strip()
        base = slug(text)
        anchor = base
        n = 2
        while anchor in ids:
            anchor = f"{base}-{n}"
            n += 1
        ids.add(anchor)
        return f'<h{level} id="{anchor}">{esc(text)}</h{level}>'
    if t in ("t1", "t2", "t3"):
        return f'<div class="bq-{t}">{flow_html(b["lines"])}</div>'
    if t == "text":
        return flow_html(b["lines"])
    if t == "quote":
        return f'<blockquote>{flow_html(b["lines"])}</blockquote>'
    if t in CALLOUTS:
        title = b["title"].strip()
        icon_html = f'<span class="bq-icon" aria-hidden="true">{esc(b["icon"])}</span> ' if b["icon"] else ""
        head = f'<p class="bq-callout-title">{icon_html}{inline_html(title)}</p>' if (b["icon"] or title) else ""
        label = title or CALLOUTS[t]
        return f'<aside class="bq-callout bq-callout-{t}" role="note" aria-label="{attr(label)}">{head}{flow_html(b["lines"])}</aside>'
    if t == "photo":
        cap = f"<figcaption>{esc(b['alt'])}</figcaption>" if b["alt"] else ""
        cls = " ".join(x for x in [b["size"] and "bq-photo-" + b["size"], b["ratio"] and "bq-ratio-" + b["ratio"].replace(":", "x")] if x)
        cls_attr = f' class="{cls}"' if cls else ""
        return f'<figure{cls_attr}><img src="{attr(media_url(b["src"], media))}" alt="{attr(b["alt"])}" loading="lazy">{cap}</figure>'
    if t == "carousel":
        items = [x for x in b["items"] if x["src"]]
        figs = "".join(
            f'<figure><img src="{attr(media_url(x["src"], media))}" alt="{attr(x["alt"])}" loading="lazy">'
            + (f"<figcaption>{esc(x['alt'])}</figcaption>" if x["alt"] else "")
            + "</figure>"
            for x in items
        )
        return (
            f'<div class="bq-carousel" role="group" aria-roledescription="carrousel" aria-label="{len(items)} photos">'
            f'<div class="bq-carousel-track">{figs}</div>'
            '<button type="button" class="bq-carousel-prev" aria-label="Photo précédente" hidden></button>'
            '<button type="button" class="bq-carousel-next" aria-label="Photo suivante" hidden></button>'
            '<div class="bq-carousel-dots" hidden></div></div>'
        )
    if t == "card":
        img = f'<img src="{attr(media_url(b["src"], media))}" alt="{attr(b["alt"])}" loading="lazy">' if b["src"] else ""
        title_html = f'<h3 class="bq-card-title">{esc(b["title"])}</h3>' if b["title"] else ""
        body_html = flow_html(b["lines"]) if b["lines"] else ""
        link_html = (
            f'<p><a class="bq-card-link" href="{attr(b["href"])}">{esc(b["label"])}</a></p>'
            if b["label"] and re.match(r"^(https?://|mailto:|tel:)", b["href"], re.I)
            else ""
        )
        return f'<div class="bq-card">{img}<div class="bq-card-body">{title_html}{body_html}{link_html}</div></div>'
    if t == "video":
        src = embed_url(b["url"])
        if src:
            return f'<figure class="bq-video"><iframe src="{attr(src)}" title="Vidéo" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></figure>'
        return f'<p><a href="{attr(b["url"])}">{esc(b["url"])}</a></p>'
    if t == "html":
        return f'<div class="bq-html">{sanitize(b["html"], media)}</div>'
    if t == "hr":
        return "<hr>"
    if t == "space":
        return ""
    if t == "code":
        lang_attr = f' class="language-{attr(b["lang"])}"' if b["lang"] else ""
        return f"<pre><code{lang_attr}>{esc(b['code'])}</code></pre>"
    return f'<pre class="bq-raw">{esc(b.get("md", ""))}</pre>'


def to_html(markdown: str, media: str = "media/", title: bool = True) -> str:
    """Convertit un document Markdown blockquilt en fragment HTML <article class="bq-content">."""
    meta, body_lines = frontmatter(markdown)
    blocks = [_parse_block(c) for c in split_chunks(body_lines)]
    ids: set[str] = set()
    icon = f'<span class="bq-icon" aria-hidden="true">{esc(meta["icon"])}</span> ' if meta.get("icon") else ""
    head = (
        f"<header><h1>{icon}{esc(meta['title'])}</h1></header>\n"
        if title and meta.get("title") and not any(b["type"] == "h1" for b in blocks)
        else ""
    )

    def render_col(b: dict[str, Any]) -> str:
        w = SIXTHS[b["width"]]
        if b["type"] == "space":
            return f'<div class="bq-col bq-w{w} bq-space" aria-hidden="true"></div>'
        return f'<div class="bq-col bq-w{w}">{_render_block(b, media, ids)}</div>'

    parts: list[str] = []
    for item in _rows(blocks):
        if "block" in item:
            h = _render_block(item["block"], media, ids)
            if h:
                parts.append(h)
        else:
            row = item["row"]
            if not all(b["type"] == "space" for b in row):
                parts.append(f'<div class="bq-row">{"".join(render_col(b) for b in row)}</div>')

    joined = "\n".join(parts)
    return f'<article class="bq-content">\n{head}{joined}\n</article>'
