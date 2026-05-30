import os
import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import SquareModuleDrawer
from PIL import Image, ImageDraw, ImageFont

# Brand colors
TERRACOTTA = "#D4784A"
WARM_BLACK = "#1E1C1A"
CREAM = "#F9F7F4"
ACCENT = "#E8865A"
LIGHT = "#F5F3F0"

URL = "https://escapevelocity.consulting/hi/"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(SCRIPT_DIR, "assets", "qr")
FONT_PATH = os.path.join(SCRIPT_DIR, "SpaceGrotesk.ttf")
# Vector EV monogram (dark tile, light E + terracotta V) — reused as the SVG logo.
MONOGRAM_PATH = os.path.join(SCRIPT_DIR, "assets", "logos", "monogram-dark-square.svg")
MONOGRAM_VIEWBOX = (-368, -1328, 1956)  # (min-x, min-y, side) of monogram-dark-square.svg

CREAM_RGBA = (249, 247, 244, 255)
TRANSPARENT_RGBA = (0, 0, 0, 0)
BOX_SIZE = 20
BORDER = 3


def build_qr(url):
    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=20,
        border=3,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=SquareModuleDrawer(),
        fill_color=WARM_BLACK,
    )
    return img.convert("RGBA")


def recolor_background(img, bg_rgba):
    """StyledPilImage renders modules on a white field; swap white for the target bg."""
    data = img.getdata()
    img.putdata([bg_rgba if px[:3] == (255, 255, 255) else px for px in data])
    return img


def add_logo(img):
    """Composite the rounded EV monogram in the center, over a light quiet-zone plate.

    The plate stays cream even on transparent variants so the logo and its quiet
    zone remain scannable regardless of the surface the QR is placed on.
    """
    size = img.size[0]
    center = size // 2
    logo_side = size // 4          # square side length
    radius = logo_side // 5        # corner radius

    # Rounded square monogram tile
    logo = Image.new("RGBA", (logo_side, logo_side), (0, 0, 0, 0))
    draw = ImageDraw.Draw(logo)
    draw.rounded_rectangle([0, 0, logo_side - 1, logo_side - 1], radius=radius, fill=WARM_BLACK)

    # "EV" in Space Grotesk Bold — E in light, V in accent
    font_size = int(logo_side * 0.55)
    font = ImageFont.truetype(FONT_PATH, font_size)
    font.set_variation_by_name("Bold")

    bbox_full = draw.textbbox((0, 0), "EV", font=font)
    tw = bbox_full[2] - bbox_full[0]
    th = bbox_full[3] - bbox_full[1]
    tx = (logo_side - tw) // 2
    ty = (logo_side - th) // 2 - bbox_full[1]

    draw.text((tx, ty), "E", fill=LIGHT, font=font)
    bbox_e = draw.textbbox((tx, ty), "E", font=font)
    draw.text((bbox_e[2], ty), "V", fill=ACCENT, font=font)

    pad = int(logo_side * 0.12)
    paste_x = center - logo_side // 2
    paste_y = center - logo_side // 2

    # Cream quiet-zone plate behind the logo
    bg = Image.new("RGBA", img.size, (0, 0, 0, 0))
    bg_draw = ImageDraw.Draw(bg)
    bg_draw.rounded_rectangle(
        [paste_x - pad, paste_y - pad, paste_x + logo_side + pad, paste_y + logo_side + pad],
        radius=radius + pad // 2,
        fill=CREAM,
    )
    img = Image.alpha_composite(img, bg)

    # Paste the monogram tile
    overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
    overlay.paste(logo, (paste_x, paste_y))
    img = Image.alpha_composite(img, overlay)
    return img


def make_variant(filename, transparent=False, with_logo=True):
    img = build_qr(URL)
    img = recolor_background(img, TRANSPARENT_RGBA if transparent else CREAM_RGBA)
    if with_logo:
        img = add_logo(img)
    out = os.path.join(OUT_DIR, filename)
    img.save(out, "PNG")
    print(f"Saved {filename} ({img.size[0]}x{img.size[1]}px)")


# --- SVG variants -----------------------------------------------------------

def qr_matrix(url):
    """Boolean module matrix including the quiet-zone border."""
    qr = qrcode.QRCode(
        error_correction=qrcode.constants.ERROR_CORRECT_H,
        box_size=BOX_SIZE,
        border=BORDER,
    )
    qr.add_data(url)
    qr.make(fit=True)
    return qr.get_matrix()


def monogram_inner():
    """Inner markup (dark tile rect + EV glyph paths) of the monogram SVG."""
    with open(MONOGRAM_PATH, encoding="utf-8") as f:
        svg = f.read()
    start = svg.index(">", svg.index("<svg")) + 1
    end = svg.rindex("</svg>")
    return svg[start:end].strip()


def make_svg(filename, transparent=False, with_logo=True):
    m = qr_matrix(URL)
    n = len(m)
    px = n * BOX_SIZE  # nominal pixel size, mirrors the PNG variants

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n} {n}" '
        f'width="{px}" height="{px}" role="img" aria-label="QR code — escapevelocity.consulting/hi/">'
    ]
    if not transparent:
        parts.append(f'<rect width="{n}" height="{n}" fill="{CREAM}"/>')

    # Dark modules as a single crisp-edged group of unit rects.
    rects = "".join(
        f'<rect x="{c}" y="{r}" width="1" height="1"/>'
        for r, row in enumerate(m)
        for c, val in enumerate(row)
        if val
    )
    parts.append(f'<g fill="{WARM_BLACK}" shape-rendering="crispEdges">{rects}</g>')

    if with_logo:
        side = n / 4.0                  # logo tile side, in module units
        lx = (n - side) / 2.0
        ly = (n - side) / 2.0
        pad = side * 0.12
        radius = side / 5.0 + pad / 2.0
        # Cream quiet-zone plate behind the logo
        parts.append(
            f'<rect x="{lx - pad:.3f}" y="{ly - pad:.3f}" '
            f'width="{side + 2 * pad:.3f}" height="{side + 2 * pad:.3f}" '
            f'rx="{radius:.3f}" fill="{CREAM}"/>'
        )
        # Map the monogram's own coordinate system into the logo square
        mvx, mvy, mside = MONOGRAM_VIEWBOX
        scale = side / mside
        parts.append(
            f'<g transform="translate({lx:.3f} {ly:.3f}) scale({scale:.6f}) '
            f'translate({-mvx} {-mvy})">{monogram_inner()}</g>'
        )

    parts.append("</svg>")
    out = os.path.join(OUT_DIR, filename)
    with open(out, "w", encoding="utf-8") as f:
        f.write("\n".join(parts) + "\n")
    print(f"Saved {filename} ({px}x{px}px nominal, {n}x{n} modules)")


# Variant matrix: {cream, transparent} x {logo, no-logo}, emitted as PNG + SVG
VARIANTS = [
    ("qr-hi",                    dict(transparent=False, with_logo=True)),   # cream + logo (canonical)
    ("qr-hi-plain",              dict(transparent=False, with_logo=False)),  # cream, no logo
    ("qr-hi-transparent",        dict(transparent=True,  with_logo=True)),   # transparent + logo
    ("qr-hi-transparent-plain",  dict(transparent=True,  with_logo=False)),  # transparent, no logo
]

if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    for stem, opts in VARIANTS:
        make_variant(stem + ".png", **opts)
        make_svg(stem + ".svg", **opts)
    print(f"\nAll variants (PNG + SVG) written to {OUT_DIR}")
