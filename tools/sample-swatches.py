"""Sample named-pigment swatches from the artist's mixing charts.

White-balanced on the chart's own paper/canvas ground, which is what makes the
numbers comparable at all: a photograph carries the room's light, and these
charts helpfully all sit on a white ground.
"""
import sys
import numpy as np
from PIL import Image

def load(path):
    im = Image.open(path).convert('RGB')
    return np.asarray(im).astype(np.float64), im.size

def patch(a, nx, ny, r=0.012):
    h, w = a.shape[:2]
    x, y = int(nx*w), int(ny*h)
    rr = max(3, int(r*min(w, h)))
    win = a[max(0,y-rr):y+rr, max(0,x-rr):x+rr]
    return np.median(win.reshape(-1, 3), axis=0)

def hexs(c):
    return '#%02x%02x%02x' % tuple(int(max(0, min(255, v))) for v in c)

def balance(a, white):
    """Scale channels so the chart's ground reads neutral white."""
    g = white.mean()
    return np.clip(a * (g / np.maximum(white, 1e-6)) * (245.0/g), 0, 255)

if __name__ == '__main__':
    path = sys.argv[1]
    a, size = load(path)
    print(f"{path.split('/')[-1]}  {size[0]}x{size[1]}")
    # sample points given as name,nx,ny triples
    pts = []
    for spec in sys.argv[2:]:
        name, nx, ny = spec.split(',')
        pts.append((name, float(nx), float(ny)))
    # white point: the caller must pass one called "white"
    wp = None
    for name, nx, ny in pts:
        if name == 'white':
            wp = patch(a, nx, ny)
    if wp is not None:
        print(f"  ground as photographed {hexs(wp)}  -> balancing to neutral")
        b = balance(a, wp)
    else:
        b = a
    for name, nx, ny in pts:
        raw = patch(a, nx, ny)
        bal = patch(b, nx, ny)
        print(f"  {name:<22} raw {hexs(raw)}   balanced {hexs(bal)}")
