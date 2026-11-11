"""Georeference the FDOT TCAR Sunshine Corridor figure by fitting the SunRail
(green) and Brightline (yellow) lines drawn in it to their GTFS shapes."""
import csv, math, sys
import numpy as np
from PIL import Image
from scipy.optimize import minimize
from scipy.spatial import cKDTree

IMG = sys.argv[1]
im = np.array(Image.open(IMG).convert("RGB")).astype(int)
H, W, _ = im.shape
r, g, b = im[..., 0], im[..., 1], im[..., 2]
green = (r < 60) & (g > 120) & (g < 175) & (b > 80) & (b < 140)
yellow = (r > 240) & (g > 235) & (b < 90)
green[640 * W // 2000 * 0 + int(640 * 1.626):, int(1500 * 1.626):] = False  # legend
yellow[int(640 * 1.626):, int(1500 * 1.626):] = False
print("green px", green.sum(), "yellow px", yellow.sum())

LAT0, LON0 = 28.42, -81.40
KX = 111320 * math.cos(math.radians(LAT0)); KY = 110574
def to_m(lat, lon): return ((lon - LON0) * KX, (lat - LAT0) * KY)

rows = list(csv.DictReader(open("data/processed/passenger_rail_shapes.csv")))
def dens(feed):
    out = []
    for sid in ("1", "2"):
        pts = [to_m(float(x["lat"]), float(x["lon"])) for x in rows if x["feed"] == feed and x["shape_id"] == sid]
        for (x0, y0), (x1, y1) in zip(pts, pts[1:]):
            n = max(1, int(math.hypot(x1 - x0, y1 - y0) // 20))
            out += [(x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n) for k in range(n)]
    return np.array(out)
sun, bri = dens("sunrail"), dens("brightline")
tree = cKDTree(np.vstack([sun, bri]))

def sub(mask, k=40):
    ys, xs = np.nonzero(mask); i = np.arange(0, len(xs), k)
    return np.column_stack([xs[i], ys[i]]).astype(float)
P = np.vstack([sub(green), sub(yellow)])

def to_m_px(P, s, tx, ty):  # s = metres per pixel, north-up, (tx,ty)= metres of pixel (0,0)
    return np.column_stack([tx + P[:, 0] * s, ty - P[:, 1] * s])

SHAPE = np.vstack([sun, bri])
S0 = 3 * 1609.34 / (338 * W / 2000)
def cost(p):
    if not (0.75 * S0 < p[0] < 1.3 * S0): return 1e6
    M = to_m_px(P, *p)
    d, _ = tree.query(M)
    fwd = np.mean(np.minimum(d, 400))
    # reverse: shape points that fall inside the image footprint must have image line nearby
    x0, x1 = p[1], p[1] + W * p[0]; y1, y0 = p[2] - H * p[0], p[2]
    inside = SHAPE[(SHAPE[:, 0] > x0) & (SHAPE[:, 0] < x1) & (SHAPE[:, 1] > y1) & (SHAPE[:, 1] < y0)][::10]
    if len(inside) < 20: return 1e6
    t2 = cKDTree(M)
    d2, _ = t2.query(inside)
    return fwd + np.mean(np.minimum(d2, 400))

# initial: 3 mi bar ~ 338 display px; MCO dot display (1878,480)
s0 = 3 * 1609.34 / (338 * W / 2000)
mco = to_m(28.4312, -81.3081)
tx0 = mco[0] - 1878 * W / 2000 * s0; ty0 = mco[1] + 480 * W / 2000 * s0
best = None
for ds in (0.9, 1.0, 1.1):
    for dx in range(-2000, 2001, 2000):
        for dy in range(-2000, 2001, 2000):
            p0 = [s0 * ds, tx0 + dx, ty0 + dy]
            res = minimize(cost, p0, method="Nelder-Mead", options=dict(xatol=0.05, fatol=0.5, maxiter=300))
            if best is None or res.fun < best.fun: best = res
print("scale m/px", best.x[0], "(initial", s0, ") mean err m", best.fun)
np.save("/tmp/w/analysis/sunshine/fit.npy", best.x)
