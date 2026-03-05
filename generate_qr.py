import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.moduledrawers.pil import SquareModuleDrawer
from PIL import Image, ImageDraw, ImageFont

# Brand colors
TERRACOTTA = "#D4784A"
WARM_BLACK = "#1E1C1A"
CREAM = "#F9F7F4"

url = "https://escapevelocity.consulting/hi/"

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
    back_color=CREAM,
    fill_color=WARM_BLACK,
)
img = img.convert("RGBA")

size = img.size[0]
center = size // 2
logo_side = size // 4  # square side length
radius = logo_side // 5  # corner radius

# Create rounded square logo
logo = Image.new("RGBA", (logo_side, logo_side), (0, 0, 0, 0))
draw = ImageDraw.Draw(logo)
draw.rounded_rectangle([0, 0, logo_side - 1, logo_side - 1], radius=radius, fill=WARM_BLACK)

# "EV" text using Space Grotesk Bold — E in cream, V in accent
ACCENT = "#E8865A"
LIGHT = "#F5F3F0"
font_size = int(logo_side * 0.55)
import os
script_dir = os.path.dirname(os.path.abspath(__file__))
font = ImageFont.truetype(os.path.join(script_dir, "SpaceGrotesk.ttf"), font_size)
font.set_variation_by_name("Bold")

# Measure full "EV" for centering
bbox_full = draw.textbbox((0, 0), "EV", font=font)
tw = bbox_full[2] - bbox_full[0]
th = bbox_full[3] - bbox_full[1]
tx = (logo_side - tw) // 2
ty = (logo_side - th) // 2 - bbox_full[1]

# Draw E in light, then V in accent
draw.text((tx, ty), "E", fill=LIGHT, font=font)
bbox_e = draw.textbbox((tx, ty), "E", font=font)
draw.text((bbox_e[2], ty), "V", fill=ACCENT, font=font)

# Background padding in cream
pad = int(logo_side * 0.12)
paste_x = center - logo_side // 2
paste_y = center - logo_side // 2

bg = Image.new("RGBA", img.size, (0, 0, 0, 0))
bg_draw = ImageDraw.Draw(bg)
bg_draw.rounded_rectangle(
    [paste_x - pad, paste_y - pad, paste_x + logo_side + pad, paste_y + logo_side + pad],
    radius=radius + pad // 2,
    fill=CREAM,
)
img = Image.alpha_composite(img, bg)

# Paste logo
overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
overlay.paste(logo, (paste_x, paste_y))
img = Image.alpha_composite(img, overlay)

out = os.path.join(script_dir, "qr-hi.png")
img.save(out, "PNG")
print(f"Saved to {out} ({img.size[0]}x{img.size[1]}px)")
