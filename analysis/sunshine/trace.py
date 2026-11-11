"""Trace the orange Sunshine Corridor line from the FDOT TCAR figure and write lat/lon."""
import json, math, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy.spatial import cKDTree

IMG = sys.argv[1]
im0 = Image.open(IMG).convert("RGB"); im = np.array(im0).astype(int)
H, W, _ = im.shape; F = W / 2000
r, g, b = im[..., 0], im[..., 1], im[..., 2]
orange = (r > 235) & (g > 110) & (g < 175) & (b < 60)
orange[int(640 * F):, int(1500 * F):] = False
oy, ox = np.nonzero(orange); otree = cKDTree(np.column_stack([ox, oy]))

s, tx, ty = np.load("analysis/sunshine/fit.npy")
LAT0, LON0 = 28.42, -81.40
KX = 111320 * math.cos(math.radians(LAT0)); KY = 110574
def px_to_ll(x, y): return (LON0 + (tx + x * s) / KX, LAT0 + (ty - y * s) / KY)

# waypoints read off the figure (2000-px-wide display coordinates), MCO -> South I-Drive
WP = [(1878,480),(1880,540),(1872,585),(1845,600),(1790,610),(1720,595),(1660,565),(1620,555),
      (1480,552),(1390,548),(1362,520),(1352,490),(1368,430),(1380,398),(1250,396),(1000,398),
      (800,402),(640,402),(600,415),(585,440),(570,470),(540,510),(500,560),(440,640),(380,720),
      (300,820),(262,880),(255,925),(248,950)]
snapped = []
for x, y in WP:
    d, i = otree.query([x * F, y * F])
    snapped.append((ox[i], oy[i]) if d < 40 * F else (x * F, y * F))
    if d >= 40 * F: print("no orange near", x, y, "d", d / F)
# densify along the snapped polyline so the later length is stable
ll = [px_to_ll(x, y) for x, y in snapped]
def hav(a, c):
    return math.hypot((a[0] - c[0]) * KX, (a[1] - c[1]) * KY)
cum = [0]
for a, c in zip(ll, ll[1:]): cum.append(cum[-1] + hav(a, c))
OCCC = min(range(len(ll)), key=lambda i: hav(ll[i], px_to_ll(616 * F, 370 * F)))
print("MCO->OCCC mi", cum[OCCC] / 1609.34, " OCCC->SID mi", (cum[-1] - cum[OCCC]) / 1609.34, " total", cum[-1] / 1609.34)
print("MCO", ll[0], "OCCC", ll[OCCC], "SID", ll[-1])
json.dump({"coords": ll, "occc_index": OCCC, "mco_to_occc_mi": cum[OCCC] / 1609.34,
           "occc_to_sid_mi": (cum[-1] - cum[OCCC]) / 1609.34}, open("analysis/sunshine/trace.json", "w"))
# verification picture
d = ImageDraw.Draw(im0)
d.line([(x, y) for x, y in snapped], fill=(255, 0, 255), width=5)
for x, y in snapped: d.ellipse([x - 7, y - 7, x + 7, y + 7], outline=(0, 0, 255), width=3)
im0.resize((1600, int(H * 1600 / W))).save("analysis/sunshine/trace_check.png")
