"""
Builds the "job." app icon from Allo's real glyph outlines (SIL OFL 1.1), so the
favicon needs no web font. Usage: python scripts/make-icon.py <AlloVariable.woff2> <out.svg>
Requires: fonttools, brotli.
"""
import sys
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.boundsPen import BoundsPen

src, out = sys.argv[1], sys.argv[2]
font = instantiateVariableFont(TTFont(src), {"opsz": 32, "wght": 640, "ROND": 92})
gs = font.getGlyphSet()
cmap = font.getBestCmap()
text = "job."
names = [cmap[ord(c)] for c in text]
tracking = -40  # font units, tighter like the wordmark

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

# fit into a 64×64 tile with padding, flip y (font units are y-up)
box, pad = 64, 9
scale = min((box - 2 * pad) / w, (box - 2 * pad) / h)
ox = (box - w * scale) / 2 - xmin * scale
oy = (box + h * scale) / 2 + ymin * scale

paths = []
for i, (n, dx) in enumerate(placed):
    pen = SVGPathPen(gs)
    gs[n].draw(TransformPen(pen, (scale, 0, 0, -scale, ox + dx * scale, oy)))
    fill = "#FF5A36" if text[i] == "." else "#F4EEE3"
    paths.append(f'<path fill="{fill}" d="{pen.getCommands()}"/>')

svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <!-- co-wrapped icon: "job." set in Allo (Josh Puckett, SIL OFL 1.1), outlined -->
  <rect width="64" height="64" rx="15" fill="#111111"/>
  {"".join(paths)}
</svg>
'''
open(out, "w").write(svg)
print("wrote", out, len(svg), "bytes")
