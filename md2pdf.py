#!/usr/bin/env python3
"""Convert Markdown to branded Escape Velocity PDF (letter format).

Usage:
    python brand/md2pdf.py briefing.md
    python brand/md2pdf.py briefing.md -o output.pdf
    python brand/md2pdf.py briefing.md --to "Mag. Klaus Berger · Berger & Partner" --date "18. März 2026" --ref "EV-2026-042" --subject "Strategic Briefing" --confidential
"""

import argparse
import asyncio
import re
import tempfile
from datetime import date
from pathlib import Path

import jinja2
import markdown
from playwright.async_api import async_playwright

BRAND_DIR = Path(__file__).resolve().parent
REPO_ROOT = BRAND_DIR.parent
FONTS_DIR = REPO_ROOT / "website" / "fonts"
TEMPLATE_PATH = BRAND_DIR / "letter.html"

FOOTER_TEMPLATE = """
<div style="width: 100%; font-family: 'Inter', sans-serif; font-size: 10px;
            color: #9A948D; display: flex; justify-content: space-between;
            align-items: center; padding: 12px 25mm 0; border-top: 0.5px solid #EEEAE4;">
  <div style="display: flex; align-items: center;">
    <span>+43 664 6522083</span>
    <span style="border-right: 0.5px solid #DDDAD4; height: 10px; margin: 0 12px;"></span>
    <span>tommi.enenkel@escapevelocity.consulting</span>
    <span style="border-right: 0.5px solid #DDDAD4; height: 10px; margin: 0 12px;"></span>
    <span>escapevelocity.consulting</span>
  </div>
  <span style="font-weight: 500; color: #9A948D;">{page_label} <span class="pageNumber"></span> / <span class="totalPages"></span></span>
</div>
"""

STRINGS = {
    "de": {
        "to_label": "An:",
        "subject_label": "Betreff",
        "confidential_label": "Vertraulich",
        "page_label": "Seite",
    },
    "en": {
        "to_label": "To:",
        "subject_label": "Subject",
        "confidential_label": "Confidential",
        "page_label": "Page",
    },
}


def date_today(lang: str = "de") -> str:
    """Return today's date in the given language."""
    today = date.today()
    if lang == "en":
        months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        ]
        return f"{today.day} {months[today.month - 1]} {today.year}"
    months = [
        "Jänner", "Februar", "März", "April", "Mai", "Juni",
        "Juli", "August", "September", "Oktober", "November", "Dezember",
    ]
    return f"{today.day}. {months[today.month - 1]} {today.year}"


def extract_title(text: str) -> str:
    match = re.search(r"^#\s+(.+)$", text, re.MULTILINE)
    return match.group(1).strip() if match else ""


def md_to_html(md_path: Path) -> tuple[str, str]:
    text = md_path.read_text(encoding="utf-8")
    title = extract_title(text)
    # Strip the first h1 if it was extracted as the title (avoid double rendering)
    if title:
        text = re.sub(r"^#\s+" + re.escape(title) + r"\s*$", "", text, count=1, flags=re.MULTILINE)
    html = markdown.markdown(text, extensions=["extra", "smarty"])
    return html, title


def render_template(body_html: str, *, to: str | None, date_str: str,
                    ref: str | None, subject: str | None,
                    confidential: bool, lang: str = "de") -> str:
    template_str = TEMPLATE_PATH.read_text(encoding="utf-8")
    template = jinja2.Template(template_str)
    fonts_uri = FONTS_DIR.as_uri()

    # Show meta strip only when explicit metadata is provided
    show_meta = bool(to or ref or confidential)

    return template.render(
        content=body_html,
        fonts_uri=fonts_uri,
        lang=lang,
        strings=STRINGS[lang],
        recipient=to or "",
        date=date_str,
        ref=ref,
        subject=subject,
        confidential=confidential,
        show_meta=show_meta,
    )


async def html_to_pdf(html: str, output_path: Path, lang: str = "de") -> None:
    # Write to a temp file so Playwright loads it via file:// — this allows
    # @font-face src: url('file:///...') to resolve (set_content uses about:blank
    # origin which blocks file:// font requests).
    with tempfile.NamedTemporaryFile("w", suffix=".html", encoding="utf-8", delete=False) as f:
        f.write(html)
        tmp_path = Path(f.name)
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch()
            page = await browser.new_page()
            await page.goto(tmp_path.as_uri(), wait_until="networkidle")
            await page.pdf(
                path=str(output_path),
                format="A4",
                margin={"top": "12mm", "right": "25mm", "bottom": "20mm", "left": "25mm"},
                print_background=True,
                display_header_footer=True,
                header_template='<div></div>',
                footer_template=FOOTER_TEMPLATE.format(**STRINGS[lang]),
            )
            await browser.close()
    finally:
        tmp_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description="Convert Markdown to branded PDF (letter format)")
    parser.add_argument("input", type=Path, help="Path to Markdown file")
    parser.add_argument("-o", "--output", type=Path, help="Output PDF path (default: same name as input)")
    parser.add_argument("--to", type=str, default=None,
                        help='Recipient display string, e.g. "Name · Company"')
    parser.add_argument("--date", type=str, default=None,
                        help='Date display (default: today in German format)')
    parser.add_argument("--ref", type=str, default=None,
                        help='Reference number, e.g. "EV-2026-042"')
    parser.add_argument("--subject", type=str, default=None,
                        help='Subject line (default: first # h1 from markdown)')
    parser.add_argument("--confidential", action="store_true",
                        help='Add "Vertraulich"/"Confidential" label next to date/ref')
    parser.add_argument("--lang", choices=["de", "en"], default="de",
                        help='Language for labels and date (default: de)')
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"File not found: {args.input}")

    output = args.output or args.input.with_suffix(".pdf")
    output.parent.mkdir(parents=True, exist_ok=True)

    body_html, title = md_to_html(args.input)

    # Subject: explicit flag > first h1
    subject = args.subject or title or None

    # Date: explicit flag > today
    date_str = args.date or date_today(args.lang)

    full_html = render_template(
        body_html,
        to=args.to,
        date_str=date_str,
        ref=args.ref,
        subject=subject,
        confidential=args.confidential,
        lang=args.lang,
    )
    # Write debug HTML alongside PDF
    debug_html = output.with_suffix(".debug.html")
    debug_html.write_text(full_html, encoding="utf-8")
    print(f"Debug HTML: {debug_html}")

    asyncio.run(html_to_pdf(full_html, output, lang=args.lang))
    print(f"Done: {output}")


if __name__ == "__main__":
    main()
