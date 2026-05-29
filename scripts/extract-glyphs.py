# brand/scripts/extract-glyphs.py
#
# One-time prep step (NOT part of the regular build): extracts authoritative
# glyph outlines for the wordmark from the static 700-weight Space Grotesk and
# writes them to assets/logos/_glyphs.json. The pure-Node generator
# (scripts/generate-logos.ts) reads that JSON to assemble the logo SVGs, so the
# normal `npm run build:logos` needs no Python and no font parsing.
#
# Re-run only if the wordmark text or the font changes:
#   python -m fontTools.varLib.instancer SpaceGrotesk.ttf wght=700 -o fonts/SpaceGrotesk-700.ttf
#   python scripts/extract-glyphs.py
#
# Outlines are emitted in a normalised 1000 units-per-em space, already flipped
# to SVG y-down with the baseline at y=0.

import json
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

UPM_OUT = 1000
CHARS = sorted(set("Escape Velocity EV"))

font = TTFont("fonts/SpaceGrotesk-700.ttf")
upm = font["head"].unitsPerEm
scale = UPM_OUT / upm
gs = font.getGlyphSet()
cmap = font.getBestCmap()
hmtx = font["hmtx"]

out = {"unitsPerEm": UPM_OUT, "glyphs": {}}

for ch in CHARS:
    cp = ord(ch)
    if cp not in cmap:
        continue
    gname = cmap[cp]
    adv = hmtx[gname][0] * scale

    # Outline: scale to UPM_OUT and flip y (font y-up -> SVG y-down).
    spen = SVGPathPen(gs)
    tpen = TransformPen(spen, (scale, 0, 0, -scale, 0, 0))
    gs[gname].draw(tpen)
    d = spen.getCommands()

    # Bounds in font units (y-up) -> normalised, y-down.
    bpen = BoundsPen(gs)
    gs[gname].draw(bpen)
    if bpen.bounds:
        x_min, y_min, x_max, y_max = bpen.bounds
        bounds = [x_min * scale, -y_max * scale, x_max * scale, -y_min * scale]
    else:
        bounds = [0, 0, 0, 0]

    out["glyphs"][ch] = {"d": d, "adv": adv, "bounds": bounds}

with open("assets/logos/_glyphs.json", "w", encoding="utf-8") as fh:
    json.dump(out, fh, separators=(",", ":"))

print(f"Wrote {len(out['glyphs'])} glyphs to assets/logos/_glyphs.json (UPM={UPM_OUT})")
