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

CREAM_RGBA = (249, 247, 244, 255)
TRANSPARENT_RGBA = (0, 0, 0, 0)


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


# Variant matrix: {cream, transparent} x {logo, no-logo}
VARIANTS = [
    ("qr-hi.png",                    dict(transparent=False, with_logo=True)),   # cream + logo (canonical)
    ("qr-hi-plain.png",              dict(transparent=False, with_logo=False)),  # cream, no logo
    ("qr-hi-transparent.png",        dict(transparent=True,  with_logo=True)),   # transparent + logo
    ("qr-hi-transparent-plain.png",  dict(transparent=True,  with_logo=False)),  # transparent, no logo
]

if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    for filename, opts in VARIANTS:
        make_variant(filename, **opts)
    print(f"\nAll variants written to {OUT_DIR}")
