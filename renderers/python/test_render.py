"""Tests de conformité du moteur Python contre toutes les fixtures JS."""

from pathlib import Path
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import blockquilt_render as bq

FIXTURES = Path(__file__).resolve().parents[2] / "tests" / "fixtures"


class TestBlockquiltPythonRender(unittest.TestCase):
    def test_fixtures_exact_parity(self) -> None:
        md_files = sorted(FIXTURES.glob("*.md"))
        self.assertGreaterEqual(len(md_files), 21)
        for md_path in md_files:
            html_path = md_path.with_suffix(".html")
            self.assertTrue(html_path.exists(), f"Fixture HTML manquante : {html_path.name}")
            md = md_path.read_text(encoding="utf-8")
            expected = html_path.read_text(encoding="utf-8")
            with self.subTest(fixture=md_path.name):
                self.assertEqual(bq.to_html(md, media="media/"), expected)

    def test_rows_and_space(self) -> None:
        md = "<!-- 1/3 -->\n![C](media/c1)\n\n<!-- 2/3 -->\nTexte.\n\nFin.\n"
        expected = (
            '<article class="bq-content">\n'
            '<div class="bq-row"><div class="bq-col bq-w2"><figure><img src="media/c1" alt="C" loading="lazy">'
            '<figcaption>C</figcaption></figure></div><div class="bq-col bq-w4"><p>Texte.</p></div></div>\n'
            "<p>Fin.</p>\n"
            "</article>"
        )
        self.assertEqual(bq.to_html(md), expected)

    def test_sanitize_xss(self) -> None:
        payloads = [
            "<script>alert(1)</script>",
            "<img src=x onerror=alert(1)>",
            '<a href="javascript:alert(1)">x</a>',
            '<a href="&#106;avascript:alert(1)">x</a>',
            "<svg onload=alert(1)><circle/></svg>",
            '<iframe src="https://evil.example"></iframe>',
            '<div onclick="alert(1)">x</div>',
        ]
        for p in payloads:
            out = bq.sanitize(p)
            self.assertNotRegex(out, r"<(script|iframe|svg)", p)
            self.assertNotIn("javascript:", out.lower())
            self.assertNotIn("onclick", out.lower())
            self.assertNotIn("onerror", out.lower())


if __name__ == "__main__":
    unittest.main(verbosity=2)
