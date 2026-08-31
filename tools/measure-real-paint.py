"""Along-stroke tone ripple in real oil, at full resolution, across scales.

Reported at several detrend radii rather than one, so the figure cannot be an
artefact of a single window. Only windows with a clearly defined stroke
direction are used (structure-tensor coherence >= 0.45), which keeps the samples
inside single strokes and limits contamination from the painting's own subject
shading.
"""
import sys, math
import numpy as np
from PIL import Image

def luma(path, maxside):
    im = Image.open(path).convert('RGB')
    if max(im.size) > maxside:
        s = maxside / max(im.size)
        im = im.resize((int(im.size[0]*s), int(im.size[1]*s)), Image.LANCZOS)
    a = np.asarray(im).astype(np.float64)
    return 0.2126*a[:,:,0] + 0.7152*a[:,:,1] + 0.0722*a[:,:,2], im.size

def orient(win):
    gy, gx = np.gradient(win)
    jxx, jyy, jxy = (gx*gx).mean(), (gy*gy).mean(), (gx*gy).mean()
    th = 0.5*math.atan2(2*jxy, jxx - jyy)
    coh = math.hypot(jxx-jyy, 2*jxy)/max(jxx+jyy, 1e-9)
    return th + math.pi/2, coh

def line(img, cx, cy, ang, n):
    t = np.arange(n) - n/2
    xs, ys = cx + t*math.cos(ang), cy + t*math.sin(ang)
    ok = (xs>=1)&(xs<img.shape[1]-2)&(ys>=1)&(ys<img.shape[0]-2)
    xs, ys = xs[ok], ys[ok]
    if len(xs) < 32: return None
    x0, y0 = xs.astype(int), ys.astype(int)
    fx, fy = xs-x0, ys-y0
    return (img[y0,x0]*(1-fx)*(1-fy) + img[y0,x0+1]*fx*(1-fy)
            + img[y0+1,x0]*(1-fx)*fy + img[y0+1,x0+1]*fx*fy)

def mm(v, r):
    return np.convolve(np.pad(v, r, mode='edge'), np.ones(2*r+1), 'valid')/(2*r+1)

def ripple(v, r):
    if v is None or len(v) < 4*r+8: return None
    res = (v - mm(v, r))[r:-r]
    m = np.abs(v[r:-r]).mean()
    return float(np.sqrt((res**2).mean())/max(m,1e-9))

def run(path, label, maxside, radii):
    img, size = luma(path, maxside)
    h, w = img.shape
    W = 128
    out = {r: [] for r in radii}
    n = 0
    for cy in range(W, h-W, W//2):
        for cx in range(W, w-W, W//2):
            win = img[cy-W//2:cy+W//2, cx-W//2:cx+W//2]
            ang, coh = orient(win)
            if coh < 0.45: continue
            n += 1
            v = line(img, cx, cy, ang, 4*W)
            for r in radii:
                x = ripple(v, r)
                if x is not None: out[r].append(x)
    print(f"\n{label}   [{size[0]}x{size[1]} px, {n} stroke-aligned windows]")
    for r in radii:
        a = np.array(out[r]) if out[r] else None
        if a is None or not len(a): print(f"    +/-{r:>3} px   n/a"); continue
        print(f"    +/-{r:>3} px   median {np.median(a):.4f}   "
              f"quartiles {np.percentile(a,25):.4f}-{np.percentile(a,75):.4f}")

if __name__ == '__main__':
    D = sys.argv[1]
    run(D + "/—Pngtree—hand painted ochre grunge texture_17922860.jpg",
        "close-up of real paint, FULL RES", 2900, [4, 8, 16, 32, 64])
    run(D + "/by Chris Long_.jpg",
        "Chris Long - real oil, normal brush", 2000, [4, 8, 16, 32])
    run(D + "/12bc6f3c0ab63d24a5308d3c62c31acf.jpg",
        "palette-knife impasto tree", 2000, [4, 8, 16, 32])
