"""Remove the white eye-glint disc from all 28 FocusKid mascot PNGs.

Findings that drive the algorithm (verified against the ec73e25 baseline):

* The glint is one hard-edged 43px disc of pure white (1441 px, HSV V=255, S=0)
  stamped over the LEFT eye at bbox (75,90)-(117,132) in every sprite.
* The face is mirror-symmetric about x' = 256 - x: for every mood the left eye's
  bbox is exactly the mirror of the right eye's bbox. The disc covers part of
  the left eye, so the covered pixels are rebuilt from the mirrored right side
  (eye pixels come back, the rest is plain head colour).
* For some mascots (Spark/Stella/Wobble) the disc also floats over the
  transparent background next to the body; those pixels go back to transparent.
  A pixel is treated as background only when it is connected to the real
  background through the disc AND the mirrored silhouette is background too, so
  a hole can never be punched inside the head (Bubblo/Bud have asymmetric
  bodies where the mirror alone would lie - their disc is fully interior).

Run with --apply to rewrite the PNGs; without it, it only reports.
"""
import subprocess
import sys
from collections import deque
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BASELINE = "ec73e2567be73829924be3a0734b83496ed709bb"
APPLY = "--apply" in sys.argv
TRUSTED_ASYM_PCT = 5.0  # alpha asymmetry (disc excluded) above this = asymmetric body


def near_white(rgb):
    mx = rgb.max(axis=-1)
    mn = rgb.min(axis=-1)
    return (mx > 240) & ((mx - mn) < 30)


def background_connected(mask, alpha):
    """Mask pixels reachable from the real background through the mask."""
    opaque = alpha > 0
    h, w = mask.shape
    seed = np.zeros_like(mask)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        seed |= mask & np.roll(~opaque, (dy, dx), axis=(0, 1))
    reached = seed.copy()
    queue = deque(zip(*np.nonzero(seed)))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not reached[ny, nx]:
                reached[ny, nx] = True
                queue.append((ny, nx))
    return reached


def dilate_fill(arr, hole):
    """Fill `hole` pixels with the nearest visible (opaque) colour."""
    filled = arr.copy()
    filled[hole] = 0
    for _ in range(400):
        pending = hole & (filled[..., 3] == 0)
        if not pending.any():
            break
        progressed = False
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            src = np.roll(filled, (-dy, -dx), axis=(0, 1))
            take = pending & (src[..., 3] > 0)
            if take.any():
                filled[take] = src[take]
                progressed = True
        if not progressed:
            break
    assert not (hole & (filled[..., 3] == 0)).any(), "dilation left unresolved pixels"
    return filled


def reaches_border_transparent(alpha):
    """Transparent pixels connected to the image border through transparency."""
    transparent = alpha == 0
    h, w = transparent.shape
    seen = np.zeros_like(transparent)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if transparent[y, x] and not seen[y, x]:
                seen[y, x] = True
                queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if transparent[y, x] and not seen[y, x]:
                seen[y, x] = True
                queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and transparent[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True
                queue.append((ny, nx))
    return seen


def main():
    files = sorted((ROOT / "assets/mascots").glob("*/*.png"))
    assert len(files) == 28, len(files)
    total = 0
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        src = subprocess.check_output(
            ["git", "show", f"{BASELINE}:{rel}"], cwd=ROOT)
        orig = np.array(Image.open(BytesIO(src)).convert("RGBA"))
        alpha = orig[..., 3]
        mask = near_white(orig[..., :3]) & (alpha > 0)
        n_mask = int(mask.sum())
        assert n_mask, f"{rel}: no glint detected"

        opaque = alpha > 0
        asym = float(((opaque != opaque[:, ::-1]) & ~mask).sum()) / float((~mask).sum()) * 100

        mirror = np.roll(orig[:, ::-1, :], 1, axis=1)  # src[y, x] = orig[y, 256 - x]
        mirror_inside = mirror[..., 3] > 0
        floating = background_connected(mask, alpha) & ~mirror_inside
        if asym > TRUSTED_ASYM_PCT:
            floating &= False  # asymmetric body: mirror silhouette is unreliable

        out = orig.copy()
        fill = mask & ~floating
        out[fill & mirror_inside] = mirror[fill & mirror_inside]
        dilated = fill & ~mirror_inside
        if dilated.any():
            out = dilate_fill(out, dilated)
        out[floating] = 0  # glint pixels that hung over the background

        changed = (out != orig).any(axis=-1)
        new_transparent = (out[..., 3] == 0) & (orig[..., 3] > 0)
        assert not (near_white(out[..., :3]) & (out[..., 3] > 0)).any(), \
            f"{rel}: glint still present"
        assert changed.sum() == n_mask, f"{rel}: edits outside the glint"
        # No hole may ever open inside the body: every pixel that became
        # transparent must reach the image border through transparency.
        holes = new_transparent & ~reaches_border_transparent(out[..., 3])
        assert not holes.any(), f"{rel}: {int(holes.sum())} interior pixels punched out"
        print(f"{rel}: glint={n_mask} rebuilt_mirror={int((fill & mirror_inside).sum())} "
              f"rebuilt_fill={int(dilated.sum())} removed_over_bg={int(floating.sum())} "
              f"alpha_asym={asym:.2f}% content=PASS")
        total += n_mask
        if APPLY:
            Image.fromarray(out, "RGBA").save(path)
    print(("APPLIED " if APPLY else "DRY-RUN ") + f"{len(files)} PNGs, {total} glint pixels handled")


if __name__ == "__main__":
    main()