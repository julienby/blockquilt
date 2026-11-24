<?php
declare(strict_types=1);

require __DIR__ . '/BlockquiltRender.php';

$fixturesDir = dirname(__DIR__, 2) . '/tests/fixtures';
$mdFiles = glob($fixturesDir . '/*.md');
sort($mdFiles);

$failed = 0;
$ok = static function (bool $cond, string $name) use (&$failed): void {
    echo ($cond ? 'ok   ' : 'FAIL ') . $name . "\n";
    if (!$cond) {
        $failed++;
    }
};

$ok(count($mdFiles) >= 21, 'fixtures : au moins 21 fichiers');
foreach ($mdFiles as $mdPath) {
    $htmlPath = preg_replace('/\.md$/', '.html', $mdPath);
    $md = file_get_contents($mdPath);
    $expected = file_exists($htmlPath) ? file_get_contents($htmlPath) : null;
    $actual = BlockquiltRender::toHtml($md, 'media/');
    $ok($expected !== null && $actual === $expected, 'rendu HTML exact : ' . basename($htmlPath));
}

$rowMd = "<!-- 1/3 -->\n![C](media/c1)\n\n<!-- 2/3 -->\nTexte.\n\nFin.\n";
$rowExpected = "<article class=\"bq-content\">\n<div class=\"bq-row\"><div class=\"bq-col bq-w2\"><figure><img src=\"media/c1\" alt=\"C\" loading=\"lazy\"><figcaption>C</figcaption></figure></div><div class=\"bq-col bq-w4\"><p>Texte.</p></div></div>\n<p>Fin.</p>\n</article>";
$ok(BlockquiltRender::toHtml($rowMd) === $rowExpected, 'lignes composées : bq-row / bq-col');

foreach ([
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<a href="javascript:alert(1)">x</a>',
    '<a href="&#106;avascript:alert(1)">x</a>',
    '<svg onload=alert(1)><circle/></svg>',
    '<iframe src="https://evil.example"></iframe>',
    '<div onclick="alert(1)">x</div>',
] as $p) {
    $out = BlockquiltRender::sanitize($p);
    $clean = !preg_match('/<(script|iframe|svg)/i', $out) && !preg_match('/(javascript:|onclick|onerror)/i', $out);
    $ok($clean, 'filtre XSS : ' . $p);
}

$ok(BlockquiltRender::sanitize('<a href="/c">c</a><a href="#h">h</a>') === '<a href="/c">c</a><a href="#h">h</a>', 'filtre : liens « / » et « # » gardés');
foreach (['<a href="//evil.fr">x</a>', '<a href="/\\evil.fr">x</a>', '<a href="/&#x9;/evil.fr">x</a>', '<a href="../x">x</a>'] as $p) {
    $ok(!str_contains(BlockquiltRender::sanitize($p), 'href'), 'filtre : lien refusé : ' . $p);
}

exit($failed ? 1 : 0);
