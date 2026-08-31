#!/usr/bin/env python3
"""Measure real paint WITH A RULER IN FRAME, so the answers are in millimetres.

`measure-real-paint.py` reads tone ripple in pixels. Pixels are not cells, so its
numbers could never become engine targets -- that was the bottleneck the whole of
docs/20 section 7 and section 8 ran into. This script takes photographs that
contain a millimetre rule and reports the same quantities in physical units.

Most of it is periodic-signal work, because a ruler, a canvas weave and a bristle
comb are all combs, and a comb is easiest to measure by its frequency:

  scale     the ruler's mm graticule -> px per mm
  weave     canvas thread pitch, on bare ground AND read through the paint
  ripple    along-stroke tone ripple, detrended at radii given in mm
  width     stroke width by colour threshold
  carry     pigment dragged out of a crossed stroke, vs distance past it

Usage:
  python tools/measure-scaled-paint.py scale  IMG.jpg X0 X1 Y0 Y1 LO HI
  python tools/measure-scaled-paint.py weave  IMG.jpg PXMM along|across X0 X1 Y0 Y1
  python tools/measure-scaled-paint.py ripple IMG.jpg PXMM X0 X1 Y0 Y1 [SKIP0,SKIP1 ...]
  python tools/measure-scaled-paint.py width  IMG.jpg PXMM X0 X1 YMAX
  python tools/measure-scaled-paint.py carry  IMG.jpg PXMM X0 X1 BOT GX0,GX1,GY0,GY1 CX0,CX1,CY0,CY1

[TRAP] Do not put the ruler inside a box you are measuring paint in. Bare metal is
neutral, so a blue-minus-red threshold accepts it and the stroke measures wider
than it is. That happened here before it was caught.

[TRAP] A 1-D column mean sees only the horizontal projection of a thread family
and mixes warp with weft, so it reads long when the cloth is tilted in frame.
Take the weave along ONE axis at a time, on a patch known to be bare, and
cross-check it against the same period read through the paint -- if the paint is
thin those two agree, and agreement is the proof that both are the weave.
"""
import sys
import numpy as np
from PIL import Image


def band_period(col, lo, hi):
    """Dominant period of a 1-D profile, inside [lo, hi] px, sub-bin refined."""
    x = col - col.mean()
    x = x - np.convolve(x, np.ones(201) / 201, mode='same')   # kill slow shading
    F = np.abs(np.fft.rfft(x * np.hanning(len(x))))
    freqs = np.fft.rfftfreq(len(x))
    per = np.divide(1.0, freqs, out=np.full_like(freqs, np.inf), where=freqs > 0)
    m = (per >= lo) & (per <= hi)
    if not m.any():
        return None, 0.0
    i = int(np.argmax(F * m))
    d = 0.0
    if 0 < i < len(F) - 1:
        a, b, c = F[i - 1], F[i], F[i + 1]
        if (a - 2 * b + c) != 0:
            d = 0.5 * (a - c) / (a - 2 * b + c)
    f = freqs[i] + d * (freqs[1] - freqs[0])
    return (1.0 / f if f > 0 else None), float(F[i] / (F[m].mean() + 1e-9))


def gray(path):
    return np.asarray(Image.open(path).convert('L')).astype(np.float64)


def rgb(path):
    return np.asarray(Image.open(path).convert('RGB')).astype(np.float64)


def cmd_scale(path, x0, x1, y0, y1, lo, hi):
    """px per mm from the ruler's graticule.

    Agreement ACROSS bands is the test: a real rule gives the same period at
    every height on it, so a spread of more than a few hundredths of a pixel
    means the rule is tilted in depth and the frame should not be trusted for
    scale."""
    a = gray(path)
    rows = []
    for y in range(y0, y1 - 36, 12):
        p, snr = band_period(a[y:y + 36, x0:x1].mean(axis=0), lo, hi)
        if p:
            rows.append((snr, y, p))
    rows.sort(reverse=True)
    for snr, y, p in rows[:8]:
        print(f"  y={y:5d}  period={p:7.3f} px  snr={snr:5.1f}")
    top = np.array([p for _s, _y, p in rows[:8]])
    print(f"\n  px per mm = {np.median(top):.2f}   (sd {top.std():.3f} over the "
          f"best 8 bands of {len(rows)})")


def cmd_weave(path, pxmm, mode, x0, x1, y0, y1, lo=6.0, hi=60.0):
    a = gray(path)
    res = []
    if mode == 'across':
        for x in range(x0, x1 - 120, 60):
            p, snr = band_period(a[y0:y1, x:x + 120].mean(axis=1), lo, hi)
            if p:
                res.append((snr, p))
    else:
        for y in range(y0, y1 - 60, 30):
            p, snr = band_period(a[y:y + 60, x0:x1].mean(axis=0), lo, hi)
            if p:
                res.append((snr, p))
    res.sort(reverse=True)
    top = np.array([p for _s, p in res[:15]])
    print(f"  {mode:6} n={len(res):3d}  {np.median(top):6.2f} px = "
          f"{np.median(top)/pxmm:5.3f} mm  (sd {top.std():.2f} px, "
          f"best snr {res[0][0]:.1f})")


def cmd_ripple(path, pxmm, x0, x1, y0, y1, skip):
    L = rgb(path).mean(axis=2)[y0:y1, x0:x1]
    p = np.median(L, axis=0)              # median across the stroke's width
    if skip:
        keep = np.ones(len(p), bool)
        for s, e in skip:
            keep[s - x0:e - x0] = False
        p = p[keep]
    print(f"  profile {len(p)} px = {len(p)/pxmm:.1f} mm, band "
          f"{(y1-y0)/pxmm:.2f} mm wide, mean tone {p.mean():.1f}")
    for mm in (0.25, 0.5, 1.0, 2.0, 4.0):
        r = int(round(mm * pxmm))
        if 2 * r + 1 >= len(p):
            continue
        k = np.ones(2 * r + 1) / (2 * r + 1)
        m = np.convolve(p, k, mode='valid')
        c = p[r:len(p) - r]
        rel = np.sqrt(np.mean((c - m) ** 2)) / max(np.mean(m), 1e-9)
        print(f"   +/- {mm:4.2f} mm ({r:4d} px)   {rel:.4f}")


def cmd_width(path, pxmm, x0, x1, ymax, thr=-25.0):
    b = rgb(path)
    b = b[:, :, 2] - b[:, :, 0]
    ws = []
    for x in range(x0, x1, 50):
        on = np.where(b[0:ymax, x] > thr)[0]
        if len(on) < 30:
            continue
        segs = np.split(on, np.where(np.diff(on) > 8)[0] + 1)
        s = max(segs, key=len)
        if len(s) >= 100:
            ws.append(s[-1] - s[0] + 1)
    ws = np.array(ws)
    print(f"  width median {np.median(ws):6.1f} px = {np.median(ws)/pxmm:5.2f} mm "
          f"(iqr {np.percentile(ws,25)/pxmm:.2f}-{np.percentile(ws,75)/pxmm:.2f} mm, "
          f"n={len(ws)})")


def cmd_carry(path, pxmm, x0, x1, bot, gbox, cbox):
    """Pigment dragged OUT of a crossed stroke, past the crossing, on bare ground.

    Measured below the crossed stroke, never on it: over the stroke the same
    colour shift is show-through, which is optics, not carry."""
    b = rgb(path)
    b = b[:, :, 2] - b[:, :, 0]
    gx0, gx1, gy0, gy1 = gbox
    cx0, cx1, cy0, cy1 = cbox
    ground = np.median(b[gy0:gy1, gx0:gx1])
    core = np.median(b[cy0:cy1, cx0:cx1])
    print(f"  clean ground {ground:6.1f}   crossed-stroke core {core:6.1f}")
    print("   mm past crossing   carry %")
    for y in range(bot, b.shape[0] - 40, 40):
        v = np.median(b[y:y + 35, x0:x1])
        print(f"   {(y-bot)/pxmm:12.2f}   {100*(v-ground)/(core-ground):7.1f}")


if __name__ == '__main__':
    what, path = sys.argv[1], sys.argv[2]
    a = sys.argv[3:]
    if what == 'scale':
        cmd_scale(path, *(int(v) for v in a[:6]))
    elif what == 'weave':
        cmd_weave(path, float(a[0]), a[1], *(int(v) for v in a[2:6]))
    elif what == 'ripple':
        skip = [tuple(int(v) for v in s.split(',')) for s in a[5:]]
        cmd_ripple(path, float(a[0]), *(int(v) for v in a[1:5]), skip=skip)
    elif what == 'width':
        cmd_width(path, float(a[0]), *(int(v) for v in a[1:4]))
    elif what == 'carry':
        cmd_carry(path, float(a[0]), int(a[1]), int(a[2]), int(a[3]),
                  tuple(int(v) for v in a[4].split(',')),
                  tuple(int(v) for v in a[5].split(',')))
    else:
        print(__doc__)
