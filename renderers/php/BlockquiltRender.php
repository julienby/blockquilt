<?php
declare(strict_types=1);

/**
 * BlockquiltRender — Moteur de rendu HTML autonome (zéro dépendance) pour le format blockquilt.
 */
final class BlockquiltRender
{
    private const WIDTH_RE = '/^<!-- (1\/3|1\/2|2\/3) -->$/';
    private const SIXTHS = ['1/3' => 2, '1/2' => 3, '2/3' => 4];
    private const CALLOUTS = [
        'info' => 'Info',
        'tip' => 'Astuce',
        'success' => 'Succès',
        'warning' => 'Attention',
        'danger' => 'Danger',
    ];
    private const VIDEO_RE = '/^https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|vimeo\.com)\/\S+$/i';
    private const PHOTO_RE = '/^!\[((?:\\\\.|[^\]\\\\])*)\]\(((?:media\/|https:\/\/)[^)\s]+)\)$/';
    // Taille et format d'une photo seule, sous une seule forme : {size=…}, {ratio=…} ou {size=… ratio=…}.
    private const PHOTO_OPTS_RE = '/^(.+)\{(?:size=(small|medium)|ratio=(16:9|4:3|1:1)|size=(small|medium) ratio=(16:9|4:3|1:1))\}$/';
    private const LINK_RE = '/^\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^)\s]+)\)$/';
    private const LEAD_RE = '/^(#{1,6} |:::|>|\||```|~~~|-{3,}\s*$)/';
    private const INLINE_RE = '/\\\\([\\\\`*_{}[\]()#+\-.!>=:|~])|`([^`\n]+)`|\*\*(\S(?:.*?\S)?)\*\*|\*(\S(?:.*?\S)?)\*|\+\+(\S(?:.*?\S)?)\+\+|==(\S(?:.*?\S)?)==|\[([^\]]+)\]\(((?:https?:\/\/|mailto:|tel:)[^)\s]+)\)/u';

    private const ENTITIES = ['&nbsp;' => ' ', '&amp;' => '&', '&lt;' => '<', '&gt;' => '>', '&quot;' => '"', '&#39;' => "'"];
    private const SAFE_TAGS = [
        'div', 'span', 'p', 'br', 'hr', 'h2', 'h3', 'h4', 'ul', 'ol', 'li',
        'strong', 'em', 'u', 'mark', 'small', 'a', 'img', 'figure', 'figcaption',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
    ];
    private const DROP_TAGS = [
        'script', 'style', 'iframe', 'frame', 'frameset', 'object', 'embed',
        'applet', 'svg', 'math', 'template', 'noscript', 'noembed', 'noframes',
        'textarea', 'title', 'select', 'option', 'xmp', 'plaintext', 'head',
        'canvas', 'audio', 'video', 'button', 'form',
    ];
    private const VOID_TAGS = ['br', 'hr', 'img'];
    private const NAMED_HTML = [
        'amp' => '&', 'lt' => '<', 'gt' => '>', 'quot' => '"', 'apos' => "'",
        'colon' => ':', 'tab' => "\t", 'newline' => "\n", 'nbsp' => ' ',
    ];

    public static function esc(string $s): string
    {
        return str_replace(['&', '<', '>'], ['&amp;', '&lt;', '&gt;'], $s);
    }

    public static function attr(string $s): string
    {
        return str_replace('"', '&quot;', self::esc($s));
    }

    public static function unesc(string $s): string
    {
        return strtr($s, self::ENTITIES);
    }

    public static function mediaUrl(string $src, string $media = 'media/'): string
    {
        return str_starts_with($src, 'media/') ? $media . substr($src, 6) : $src;
    }

    public static function slug(string $text): string
    {
        $nfd = \Normalizer::normalize($text, \Normalizer::FORM_D);
        if ($nfd !== false) {
            $text = preg_replace('/[\x{0300}-\x{036f}]/u', '', $nfd) ?? $text;
        }
        $s = trim((string) preg_replace('/[^a-z0-9]+/', '-', strtolower($text)), '-');
        return $s !== '' ? $s : 'section';
    }

    public static function embedUrl(string $url): string
    {
        if (preg_match('/^https?:\/\/(?:www\.)?youtube\.com\/watch\?(?:[^#]*&)?v=([\w-]{11})/i', $url, $m)) {
            return 'https://www.youtube-nocookie.com/embed/' . $m[1];
        }
        if (preg_match('/^https?:\/\/youtu\.be\/([\w-]{11})/i', $url, $m)) {
            return 'https://www.youtube-nocookie.com/embed/' . $m[1];
        }
        if (preg_match('/^https?:\/\/(?:www\.)?vimeo\.com\/(\d+)/i', $url, $m)) {
            return 'https://player.vimeo.com/video/' . $m[1];
        }
        return '';
    }

    public static function inlineHtml(string $md): string
    {
        $out = '';
        $at = 0;
        if (preg_match_all(self::INLINE_RE, $md, $matches, PREG_OFFSET_CAPTURE | PREG_SET_ORDER)) {
            foreach ($matches as $m) {
                $idx = $m[0][1];
                $out .= self::esc(substr($md, $at, $idx - $at));
                $at = $idx + strlen($m[0][0]);
                if (isset($m[1]) && $m[1][1] !== -1) {
                    $out .= self::esc($m[1][0]);
                } elseif (isset($m[2]) && $m[2][1] !== -1) {
                    $out .= '<code>' . self::esc($m[2][0]) . '</code>';
                } elseif (isset($m[3]) && $m[3][1] !== -1) {
                    $out .= '<strong>' . self::inlineHtml($m[3][0]) . '</strong>';
                } elseif (isset($m[4]) && $m[4][1] !== -1) {
                    $out .= '<em>' . self::inlineHtml($m[4][0]) . '</em>';
                } elseif (isset($m[5]) && $m[5][1] !== -1) {
                    $out .= '<u>' . self::inlineHtml($m[5][0]) . '</u>';
                } elseif (isset($m[6]) && $m[6][1] !== -1) {
                    $out .= '<mark>' . self::inlineHtml($m[6][0]) . '</mark>';
                } else {
                    $out .= '<a href="' . self::attr($m[8][0]) . '">' . self::inlineHtml($m[7][0]) . '</a>';
                }
            }
        }
        return $out . self::esc(substr($md, $at));
    }

    public static function plain(string $md): string
    {
        return self::unesc((string) preg_replace('/<[^>]+>/', '', self::inlineHtml($md)));
    }

    /** @param string[] $lines */
    private static function listTree(array $lines): array
    {
        $out = [];
        $stack = [];
        foreach ($lines as $l) {
            if (!preg_match('/^( *)(-|\d+\.) (.*)$/', $l, $m) || (!$stack && strlen($m[1]) > 0)) {
                $stack = [];
                $out[] = ['line' => $l];
                continue;
            }
            $indent = strlen($m[1]);
            $tag = $m[2] === '-' ? 'ul' : 'ol';
            while (count($stack) > 1 && $indent < $stack[count($stack) - 1]['indent']) {
                array_pop($stack);
            }
            $top = $stack ? $stack[count($stack) - 1] : null;
            if ($top && $indent > $top['indent']) {
                $lst = (object) ['tag' => $tag, 'items' => []];
                $lastIdx = count($top['list']->items) - 1;
                $top['list']->items[$lastIdx]->subs[] = $lst;
                $stack[] = ['indent' => $indent, 'list' => $lst];
            } elseif (!$top || $top['list']->tag !== $tag) {
                $lst = (object) ['tag' => $tag, 'items' => []];
                if (count($stack) > 1) {
                    array_pop($stack);
                    $parent = $stack[count($stack) - 1]['list']->items;
                    $parent[count($parent) - 1]->subs[] = $lst;
                    $stack[] = ['indent' => $indent, 'list' => $lst];
                } else {
                    $out[] = ['list' => $lst];
                    $stack = [['indent' => $indent, 'list' => $lst]];
                }
            }
            $stack[count($stack) - 1]['list']->items[] = (object) ['text' => $m[3], 'subs' => []];
        }
        return $out;
    }

    private static function listHtml(object $lst): string
    {
        $items = '';
        foreach ($lst->items as $x) {
            $subs = '';
            foreach ($x->subs as $s) {
                $subs .= self::listHtml($s);
            }
            $items .= '<li>' . self::inlineHtml($x->text) . $subs . '</li>';
        }
        return "<{$lst->tag}>{$items}</{$lst->tag}>";
    }

    /** @param string[] $lines */
    public static function flowHtml(array $lines): string
    {
        $out = [];
        $para = [];
        $flush = static function () use (&$out, &$para): void {
            if ($para) {
                $out[] = '<p>' . implode('<br>', array_map([self::class, 'inlineHtml'], $para)) . '</p>';
                $para = [];
            }
        };
        foreach (self::listTree($lines) as $n) {
            if (isset($n['list'])) {
                $flush();
                $out[] = self::listHtml($n['list']);
            } elseif (trim($n['line']) === '') {
                $flush();
            } else {
                $para[] = $n['line'];
            }
        }
        $flush();
        return implode('', $out);
    }

    private static function decodeEntities(string $v): string
    {
        $v = (string) preg_replace_callback('/&#x([0-9a-f]+);?/i', static function ($m) {
            $cp = intval($m[1], 16);
            return ($cp > 0 && $cp <= 0x10FFFF) ? mb_chr($cp, 'UTF-8') : "\u{FFFD}";
        }, $v);
        $v = (string) preg_replace_callback('/&#(\d+);?/', static function ($m) {
            $cp = intval($m[1], 10);
            return ($cp > 0 && $cp <= 0x10FFFF) ? mb_chr($cp, 'UTF-8') : "\u{FFFD}";
        }, $v);
        return (string) preg_replace_callback('/&(amp|lt|gt|quot|apos|colon|tab|newline|nbsp);?/i', static fn($m) => self::NAMED_HTML[strtolower($m[1])], $v);
    }

    public static function sanitize(string $html, string $media = 'media/'): string
    {
        $checkUrl = static function (string $v, string $allowed): ?string {
            $u = (string) preg_replace('/[\x{0000}-\x{0020}\x{007f}-\x{009f}\x{00ad}\x{200b}-\x{200f}\x{2028}\x{2029}\x{feff}]/u', '', self::decodeEntities($v));
            return preg_match($allowed, $u) ? $u : null;
        };
        $allow = static function (string $tag, string $name, string $value) use ($checkUrl, $media): ?string {
            if ($name === 'class') {
                return $value;
            }
            if ($tag === 'a' && $name === 'href') {
                return $checkUrl($value, '/^(https?:\/\/|mailto:|tel:)/i');
            }
            if ($tag === 'img' && $name === 'src') {
                $u = $checkUrl($value, '/^(https:\/\/|media\/[\w.-]+$)/i');
                return $u !== null ? self::mediaUrl($u, $media) : null;
            }
            if ($tag === 'img' && $name === 'alt') {
                return $value;
            }
            if (($tag === 'img' && ($name === 'width' || $name === 'height')) || (($tag === 'th' || $tag === 'td') && ($name === 'colspan' || $name === 'rowspan'))) {
                $t = trim($value);
                return preg_match('/^\d{1,4}$/', $t) ? $t : null;
            }
            return null;
        };

        $out = [];
        $open = [];
        $tagRe = '/<!--[\s\S]*?(?:-->|$)|<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"\'>\/=]+(?:\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s"\'=<>`]+))?)*)\s*\/?>/';
        $attrRe = '/([^\s"\'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s"\'=<>`]+)))?/';
        $at = 0;
        $len = strlen($html);
        $pushText = static function (string $t) use (&$out): void {
            $out[] = str_replace(['<', '>'], ['&lt;', '&gt;'], $t);
        };

        while ($at <= $len && preg_match($tagRe, $html, $m, PREG_OFFSET_CAPTURE, $at)) {
            $idx = $m[0][1];
            $pushText(substr($html, $at, $idx - $at));
            $at = $idx + strlen($m[0][0]);
            if (str_starts_with($m[0][0], '<!--')) {
                continue;
            }
            $tag = strtolower($m[2][0]);
            if (in_array($tag, self::DROP_TAGS, true)) {
                if ($m[1][0] === '') {
                    if (preg_match('/<\/' . preg_quote($tag, '/') . '\s*>/i', $html, $endM, PREG_OFFSET_CAPTURE, $at)) {
                        $at = $endM[0][1] + strlen($endM[0][0]);
                    } else {
                        $at = $len;
                    }
                }
                continue;
            }
            if (!in_array($tag, self::SAFE_TAGS, true)) {
                continue;
            }
            if ($m[1][0] !== '') {
                $pos = array_search($tag, array_reverse($open, true), true);
                if ($pos !== false) {
                    while (count($open) > $pos) {
                        $out[] = '</' . array_pop($open) . '>';
                    }
                }
                continue;
            }
            $attrs = [];
            $seen = [];
            if (preg_match_all($attrRe, $m[3][0], $attrMatches, PREG_SET_ORDER)) {
                foreach ($attrMatches as $a) {
                    $name = strtolower($a[1]);
                    $raw = $a[2] ?? ($a[3] ?? ($a[4] ?? ''));
                    if ($raw === '' && isset($a[3]) && $a[3] !== '') {
                        $raw = $a[3];
                    } elseif ($raw === '' && isset($a[4]) && $a[4] !== '') {
                        $raw = $a[4];
                    }
                    $val = ($name === 'class' || $name === 'alt') ? self::decodeEntities($raw) : $raw;
                    $ok = $allow($tag, $name, $val);
                    if ($ok !== null && !isset($seen[$name])) {
                        $seen[$name] = true;
                        $attrs[] = $name . '="' . self::attr($ok) . '"';
                    }
                }
            }
            if ($tag === 'img' && !isset($seen['src'])) {
                continue;
            }
            if ($tag === 'img' && !isset($seen['alt'])) {
                $attrs[] = 'alt=""';
            }
            $out[] = '<' . $tag . ($attrs ? ' ' . implode(' ', $attrs) : '') . '>';
            if (!in_array($tag, self::VOID_TAGS, true)) {
                $open[] = $tag;
            }
        }
        $pushText(substr($html, $at));
        while ($open) {
            $out[] = '</' . array_pop($open) . '>';
        }
        return implode('', $out);
    }

    public static function frontmatter(string $markdown): array
    {
        $lines = explode("\n", str_replace("\r\n", "\n", $markdown));
        if (($lines[0] ?? '') !== '---') {
            return [[], $lines];
        }
        $end = array_search('---', array_slice($lines, 1, null, true), true);
        if ($end === false) {
            return [[], $lines];
        }
        $meta = [];
        for ($i = 1; $i < $end; $i++) {
            if (!preg_match('/^([A-Za-z_][\w-]*):(?: (.*))?$/', $lines[$i], $m) || array_key_exists($m[1], $meta)) {
                return [[], $lines];
            }
            $val = $m[2] ?? '';
            $expected = $val === '' ? $m[1] . ':' : $m[1] . ': ' . $val;
            if ($expected !== $lines[$i]) {
                return [[], $lines];
            }
            $meta[$m[1]] = $val;
        }
        return [$meta, array_slice($lines, $end + 1)];
    }

    /** @param string[] $lines @return string[] */
    private static function splitChunks(array $lines): array
    {
        $chunks = [];
        $cur = [];
        $fenceClose = null;
        $flush = static function () use (&$chunks, &$cur): void {
            if ($cur) {
                foreach ($cur as $l) {
                    if (trim($l) !== '') {
                        $chunks[] = implode("\n", $cur);
                        break;
                    }
                }
                $cur = [];
            }
        };
        $open = static function () use (&$cur, $flush): void {
            if (!(count($cur) === 1 && preg_match(self::WIDTH_RE, $cur[0]))) {
                $flush();
            }
        };
        foreach ($lines as $line) {
            if ($fenceClose !== null) {
                $cur[] = $line;
                if (preg_match($fenceClose, $line)) {
                    $fenceClose = null;
                    $flush();
                }
            } elseif (preg_match('/^(`{3,}|~{3,})/', $line, $m)) {
                $open();
                $cur[] = $line;
                $fenceClose = '/^' . preg_quote($m[1], '/') . '\s*$/';
            } elseif (preg_match('/^:::\w/', $line)) {
                $open();
                $cur[] = $line;
                $fenceClose = '/^:::\s*$/';
            } elseif (preg_match('/^#{1,6} /', $line)) {
                $open();
                $cur[] = $line;
                $flush();
            } elseif (trim($line) === '') {
                $flush();
            } else {
                $cur[] = $line;
            }
        }
        $flush();
        return $chunks;
    }

    private static function tidy(string $x): string
    {
        $lines = array_map(static fn($l) => (string) preg_replace('/\s+$/', '', $l), explode("\n", $x));
        return trim(implode("\n", $lines), "\n");
    }

    private static function firstEmoji(string $text): string
    {
        $s = trim($text);
        if ($s === '') {
            return '';
        }
        if (preg_match('/^(\p{Regional_Indicator}{2}|[0-9#*]\x{fe0f}?\x{20e3}|(?:\p{Extended_Pictographic}(?:\x{fe0f}|\x{fe0e}|[\x{1f3fb}-\x{1f3ff}])?(?:\x{200d}\p{Extended_Pictographic}(?:\x{fe0f}|\x{fe0e}|[\x{1f3fb}-\x{1f3ff}])?)*))/u', $s, $m)) {
            return $m[1];
        }
        return '';
    }

    /** Bloc photo : l'image, puis sa taille et son format facultatifs ; null si ce n'est pas une photo. */
    private static function photo(string $t): ?array
    {
        $hasOpts = preg_match(self::PHOTO_OPTS_RE, $t, $o) === 1;
        if (!preg_match(self::PHOTO_RE, $hasOpts ? $o[1] : $t, $m)) {
            return null;
        }
        $size = $hasOpts ? (($o[2] ?? '') ?: ($o[4] ?? '')) : '';
        $ratio = $hasOpts ? (($o[3] ?? '') ?: ($o[5] ?? '')) : '';
        return ['type' => 'photo', 'src' => $m[2], 'alt' => self::plain($m[1]), 'size' => $size, 'ratio' => $ratio];
    }

    private static function parseBlock(string $md): array
    {
        $lines = explode("\n", self::tidy($md));
        if (preg_match(self::WIDTH_RE, $lines[0], $w)) {
            if (count($lines) === 1) {
                return ['type' => 'space', 'width' => $w[1]];
            }
            $b = self::parseBlock(implode("\n", array_slice($lines, 1)));
            $b['width'] = $w[1];
            return $b;
        }
        $t = implode("\n", $lines);
        foreach ([1, 2, 3] as $lvl) {
            if (count($lines) === 1 && preg_match('/^#{' . $lvl . '} (.+)$/', $t, $m)) {
                return ['type' => 'h' . $lvl, 'text' => self::plain($m[1])];
            }
        }
        foreach ([1, 2, 3] as $n) {
            if (preg_match('/^:::t' . $n . '\n([\s\S]+)\n:::$/', $t, $m)) {
                $bodyLines = explode("\n", $m[1]);
                $ok = true;
                foreach ($bodyLines as $l) {
                    if (preg_match(self::LEAD_RE, $l)) {
                        $ok = false;
                        break;
                    }
                }
                if ($ok) {
                    return ['type' => 't' . $n, 'lines' => $bodyLines];
                }
            }
        }
        $isText = self::photo($t) === null && !preg_match(self::VIDEO_RE, $t);
        if ($isText) {
            foreach ($lines as $l) {
                if (preg_match(self::LEAD_RE, $l)) {
                    $isText = false;
                    break;
                }
            }
        }
        if ($isText) {
            return ['type' => 'text', 'lines' => $lines];
        }
        if (!preg_match('/^> ?\[!/', $t)) {
            $allQuote = true;
            foreach ($lines as $l) {
                if (!str_starts_with($l, '>')) {
                    $allQuote = false;
                    break;
                }
            }
            if ($allQuote) {
                return ['type' => 'quote', 'lines' => array_map(static fn($l) => (string) preg_replace('/^> ?/', '', $l), $lines)];
            }
        }
        $first = $lines[0];
        $rest = array_slice($lines, 1);
        if (preg_match('/^> \[!(\w+)\](?: (.*))?$/', $first, $cm) && isset(self::CALLOUTS[$cm[1]])) {
            $allQ = true;
            foreach ($rest as $l) {
                if (!str_starts_with($l, '>')) {
                    $allQ = false;
                    break;
                }
            }
            if ($allQ) {
                $head = trim($cm[2] ?? '');
                $icon = self::firstEmoji($head);
                $title = trim(substr($head, strlen($icon)));
                return [
                    'type' => $cm[1],
                    'icon' => $icon,
                    'title' => $title,
                    'lines' => array_map(static fn($l) => (string) preg_replace('/^> ?/', '', $l), $rest),
                ];
            }
        }
        $photo = self::photo($t);
        if ($photo !== null) {
            return $photo;
        }
        if (count($lines) >= 3 && $lines[0] === ':::carousel' && $lines[count($lines) - 1] === ':::') {
            $items = [];
            $ok = true;
            foreach (array_slice($lines, 1, -1) as $l) {
                if (preg_match(self::PHOTO_RE, $l, $pm)) {
                    $items[] = ['src' => $pm[2], 'alt' => self::plain($pm[1])];
                } else {
                    $ok = false;
                    break;
                }
            }
            if ($ok) {
                return ['type' => 'carousel', 'items' => $items];
            }
        }
        if (count($lines) >= 3 && $lines[0] === ':::card' && $lines[count($lines) - 1] === ':::') {
            $body = array_slice($lines, 1, -1);
            $photo = ($body && preg_match(self::PHOTO_RE, $body[0], $pm)) ? $pm : null;
            if ($photo) {
                array_shift($body);
            }
            $title = ($body && preg_match('/^### (.+)$/', $body[0], $tm)) ? $tm : null;
            if ($title) {
                array_shift($body);
            }
            $link = ($body && preg_match(self::LINK_RE, $body[count($body) - 1], $lm)) ? $lm : null;
            if ($link) {
                array_pop($body);
            }
            $ok = true;
            foreach ($body as $l) {
                if (preg_match(self::LEAD_RE, $l) || preg_match(self::PHOTO_RE, $l)) {
                    $ok = false;
                    break;
                }
            }
            if ($ok) {
                return [
                    'type' => 'card',
                    'src' => $photo ? $photo[2] : '',
                    'alt' => $photo ? self::plain($photo[1]) : '',
                    'title' => $title ? self::plain($title[1]) : '',
                    'lines' => $body,
                    'label' => $link ? self::plain($link[1]) : '',
                    'href' => $link ? $link[2] : '',
                ];
            }
        }
        if (preg_match(self::VIDEO_RE, $t)) {
            return ['type' => 'video', 'url' => $t];
        }
        if (preg_match('/^:::html\n([\s\S]*)\n:::$/', $t, $hm) && !preg_match('/^:::/m', $hm[1])) {
            return ['type' => 'html', 'html' => $hm[1]];
        }
        if ($t === '---') {
            return ['type' => 'hr'];
        }
        if (preg_match('/^(`{3,})([\w+#.-]*)\n([\s\S]*?)\n?\1$/', $t, $km)) {
            return ['type' => 'code', 'lang' => $km[2], 'code' => $km[3]];
        }
        return ['type' => 'raw', 'md' => $md];
    }

    private static function renderBlock(array $b, string $media, array &$ids): string
    {
        $t = $b['type'];
        if ($t === 'h1' || $t === 'h2' || $t === 'h3') {
            $lvl = $t[1];
            $text = trim($b['text']);
            $base = self::slug($text);
            $id = $base;
            for ($n = 2; isset($ids[$id]); $n++) {
                $id = $base . '-' . $n;
            }
            $ids[$id] = true;
            return "<h{$lvl} id=\"{$id}\">" . self::esc($text) . "</h{$lvl}>";
        }
        if ($t === 't1' || $t === 't2' || $t === 't3') {
            return '<div class="bq-' . $t . '">' . self::flowHtml($b['lines']) . '</div>';
        }
        if ($t === 'text') {
            return self::flowHtml($b['lines']);
        }
        if ($t === 'quote') {
            return '<blockquote>' . self::flowHtml($b['lines']) . '</blockquote>';
        }
        if (isset(self::CALLOUTS[$t])) {
            $title = trim($b['title']);
            $iconHtml = $b['icon'] !== '' ? '<span class="bq-icon" aria-hidden="true">' . self::esc($b['icon']) . '</span> ' : '';
            $head = ($b['icon'] !== '' || $title !== '') ? '<p class="bq-callout-title">' . $iconHtml . self::inlineHtml($title) . '</p>' : '';
            $label = $title !== '' ? $title : self::CALLOUTS[$t];
            return '<aside class="bq-callout bq-callout-' . $t . '" role="note" aria-label="' . self::attr($label) . '">' . $head . self::flowHtml($b['lines']) . '</aside>';
        }
        if ($t === 'photo') {
            $cap = $b['alt'] !== '' ? '<figcaption>' . self::esc($b['alt']) . '</figcaption>' : '';
            $cls = implode(' ', array_filter([
                $b['size'] !== '' ? 'bq-photo-' . $b['size'] : '',
                $b['ratio'] !== '' ? 'bq-ratio-' . str_replace(':', 'x', $b['ratio']) : '',
            ]));
            return '<figure' . ($cls !== '' ? ' class="' . $cls . '"' : '') . '><img src="' . self::attr(self::mediaUrl($b['src'], $media)) . '" alt="' . self::attr($b['alt']) . '" loading="lazy">' . $cap . '</figure>';
        }
        if ($t === 'carousel') {
            $items = array_values(array_filter($b['items'], static fn($x) => $x['src'] !== ''));
            $figs = '';
            foreach ($items as $x) {
                $cap = $x['alt'] !== '' ? '<figcaption>' . self::esc($x['alt']) . '</figcaption>' : '';
                $figs .= '<figure><img src="' . self::attr(self::mediaUrl($x['src'], $media)) . '" alt="' . self::attr($x['alt']) . '" loading="lazy">' . $cap . '</figure>';
            }
            return '<div class="bq-carousel" role="group" aria-roledescription="carrousel" aria-label="' . count($items) . ' photos">'
                . '<div class="bq-carousel-track">' . $figs . '</div>'
                . '<button type="button" class="bq-carousel-prev" aria-label="Photo précédente" hidden></button>'
                . '<button type="button" class="bq-carousel-next" aria-label="Photo suivante" hidden></button>'
                . '<div class="bq-carousel-dots" hidden></div></div>';
        }
        if ($t === 'card') {
            $img = $b['src'] !== '' ? '<img src="' . self::attr(self::mediaUrl($b['src'], $media)) . '" alt="' . self::attr($b['alt']) . '" loading="lazy">' : '';
            $titleHtml = $b['title'] !== '' ? '<h3 class="bq-card-title">' . self::esc($b['title']) . '</h3>' : '';
            $bodyHtml = $b['lines'] ? self::flowHtml($b['lines']) : '';
            $linkHtml = ($b['label'] !== '' && preg_match('/^(https?:\/\/|mailto:|tel:)/i', $b['href']))
                ? '<p><a class="bq-card-link" href="' . self::attr($b['href']) . '">' . self::esc($b['label']) . '</a></p>'
                : '';
            return '<div class="bq-card">' . $img . '<div class="bq-card-body">' . $titleHtml . $bodyHtml . $linkHtml . '</div></div>';
        }
        if ($t === 'video') {
            $src = self::embedUrl($b['url']);
            return $src !== ''
                ? '<figure class="bq-video"><iframe src="' . self::attr($src) . '" title="Vidéo" loading="lazy" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe></figure>'
                : '<p><a href="' . self::attr($b['url']) . '">' . self::esc($b['url']) . '</a></p>';
        }
        if ($t === 'html') {
            return '<div class="bq-html">' . self::sanitize($b['html'], $media) . '</div>';
        }
        if ($t === 'hr') {
            return '<hr>';
        }
        if ($t === 'space') {
            return '';
        }
        if ($t === 'code') {
            $lang = $b['lang'] !== '' ? ' class="language-' . self::attr($b['lang']) . '"' : '';
            return '<pre><code' . $lang . '>' . self::esc($b['code']) . '</code></pre>';
        }
        return '<pre class="bq-raw">' . self::esc($b['md'] ?? '') . '</pre>';
    }

    public static function toHtml(string $markdown, string $media = 'media/', bool $title = true): string
    {
        [$meta, $bodyLines] = self::frontmatter($markdown);
        $blocks = array_map([self::class, 'parseBlock'], self::splitChunks($bodyLines));
        $hasH1 = false;
        foreach ($blocks as $b) {
            if ($b['type'] === 'h1') {
                $hasH1 = true;
                break;
            }
        }
        $icon = !empty($meta['icon']) ? '<span class="bq-icon" aria-hidden="true">' . self::esc($meta['icon']) . '</span> ' : '';
        $head = ($title && !empty($meta['title']) && !$hasH1)
            ? '<header><h1>' . $icon . self::esc($meta['title']) . "</h1></header>\n"
            : '';

        $rows = [];
        $row = null;
        $sum = 0;
        foreach ($blocks as $b) {
            $n = self::SIXTHS[$b['width'] ?? ''] ?? 0;
            if (!$n) {
                $row = null;
                $rows[] = ['block' => $b];
                continue;
            }
            if ($row === null || $sum + $n > 6) {
                $row = [];
                $sum = 0;
                $rows[] = ['row' => &$row];
            }
            $row[] = $b;
            $sum += $n;
            if ($sum === 6) {
                unset($row);
                $row = null;
            }
        }
        unset($row);

        $ids = [];
        $parts = [];
        foreach ($rows as $item) {
            if (isset($item['block'])) {
                $h = self::renderBlock($item['block'], $media, $ids);
                if ($h !== '') {
                    $parts[] = $h;
                }
            } else {
                $allSpace = true;
                foreach ($item['row'] as $b) {
                    if ($b['type'] !== 'space') {
                        $allSpace = false;
                        break;
                    }
                }
                if (!$allSpace) {
                    $cols = '';
                    foreach ($item['row'] as $b) {
                        $w = self::SIXTHS[$b['width']];
                        if ($b['type'] === 'space') {
                            $cols .= '<div class="bq-col bq-w' . $w . ' bq-space" aria-hidden="true"></div>';
                        } else {
                            $cols .= '<div class="bq-col bq-w' . $w . '">' . self::renderBlock($b, $media, $ids) . '</div>';
                        }
                    }
                    $parts[] = '<div class="bq-row">' . $cols . '</div>';
                }
            }
        }

        return "<article class=\"bq-content\">\n" . $head . implode("\n", $parts) . "\n</article>";
    }
}
