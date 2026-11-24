"""
Builds the app icon — "co" inside a ring, after portfolios.here's circled-p mark —
from Allo's real glyph outlines (SIL OFL 1.1), so the favicon needs no web font. Usage: python scripts/make-icon.py <AlloVariable.woff2> <out.svg>
Requires: fonttools, brotli.
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

src, out = sys.argv[1], sys.argv[2]
font = instantiateVariableFont(TTFont(src), {"opsz": 32, "wght": 560, "ROND": 80})
gs = font.getGlyphSet()
cmap = font.getBestCmap()
text = "co"
names = [cmap[ord(c)] for c in text]
tracking = -30  # font units, tighter like the wordmark

# lay out glyphs on a baseline, collect bounds
x = 0
placed = []
for n in names:
    placed.append((n, x))
    x += gs[n].width + tracking
bp = BoundsPen(gs)
for n, dx in placed:
    gs[n].draw(TransformPen(bp, (1, 0, 0, 1, dx, 0)))
xmin, ymin, xmax, ymax = bp.bounds
w, h = xmax - xmin, ymax - ymin

# fit inside the ring (64×64 tile), centred on the x-height, flip y (font units are y-up)
box = 64
inner = 30  # max text width inside the ring
scale = inner / w
ox = (box - w * scale) / 2 - xmin * scale
oy = (box + h * scale) / 2 + ymin * scale

paths = []
for i, (n, dx) in enumerate(placed):
    pen = SVGPathPen(gs)
    gs[n].draw(TransformPen(pen, (scale, 0, 0, -scale, ox + dx * scale, oy)))
    paths.append(f'<path fill="#FFFFFF" d="{pen.getCommands()}"/>')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <!-- co-wrapped icon: "co" set in Allo (Josh Puckett, SIL OFL 1.1), outlined, in a ring -->
  <rect width="64" height="64" rx="12" fill="#000000"/>
  <circle cx="32" cy="32" r="22" fill="none" stroke="#FFFFFF" stroke-width="3"/>
  {"".join(paths)}
</svg>
'''
open(out, "w").write(svg)
print("wrote", out, len(svg), "bytes")
