#!/usr/bin/env python3
"""Remove/verify eye glints; compare every pixel with an immutable Git baseline.

Run with --fix once to edit, then without arguments to independently re-read
and verify. Requires Pillow. HSV channels use Pillow's 0..255 scale.
"""
import argparse
from collections import deque
from io import BytesIO
from pathlib import Path
import subprocess

from PIL import Image

BASELINE = 'ec73e2567be73829924be3a0734b83496ed709bb'
ROOT = Path(__file__).resolve().parents[1]


def glints(image):
    rgba = image.convert('RGBA')
    hsv = image.convert('RGB').convert('HSV')
    w, h = image.size
    # Face eye band, excluding background, mouth, crown and body highlights.
    candidates = {(x, y) for y in range(int(h * .32), int(h * .58))
                  for x in range(int(w * .24), int(w * .77))
                  if rgba.getpixel((x, y))[3] > 0
                  and hsv.getpixel((x, y))[2] > 240
                  and hsv.getpixel((x, y))[1] < 30}
    result = set()
    while candidates:
        seed = candidates.pop()
        component = {seed}
        queue = deque([seed])
        while queue:
            x, y = queue.popleft()
            for pt in ((x+1,y), (x-1,y), (x,y+1), (x,y-1)):
                if pt in candidates:
                    candidates.remove(pt)
                    component.add(pt)
                    queue.append(pt)
        # These assets use a 43px dot which overlaps (rather than sits entirely
        # within) the left eye. Closed-eye variants expose less dark boundary.
        if len(component) > w*h*.025:
            continue
        boundary = {(x+dx, y+dy) for x,y in component
                    for dx,dy in ((1,0),(-1,0),(0,1),(0,-1))
                    if (x+dx,y+dy) not in component}
        dark = {pt for pt in boundary if 0 <= pt[0] < w and 0 <= pt[1] < h
                and rgba.getpixel(pt)[3] > 0
                and max(rgba.getpixel(pt)[:3]) < 100}
        if len(dark) >= 4 and len(dark)/len(boundary) >= .04:
            result.update(component)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fix', action='store_true')
    args = parser.parse_args()
    files = sorted((ROOT/'assets/mascots').glob('*/*.png'))
    assert len(files) == 28, f'Expected 28 PNGs, got {len(files)}'
    total = 0
    for path in files:
        relative = path.relative_to(ROOT).as_posix()
        original = Image.open(BytesIO(subprocess.check_output(
            ['git', 'show', f'{BASELINE}:{relative}'], cwd=ROOT)))
        expected = glints(original)
        assert expected, f'{relative}: no baseline eye glints detected'
        with Image.open(path) as current:
            image = current.copy()
        if args.fix:
            has_alpha = 'A' in image.getbands() or 'transparency' in image.info
            image = image.convert('RGBA' if has_alpha else 'RGB')
            for x,y in glints(image):
                if has_alpha:
                    image.putpixel((x,y), (*image.getpixel((x,y))[:3], 0))
                else:
                    # Find nearest visible dark eye colour.
                    dark = [(dx*dx+dy*dy, image.getpixel((x+dx,y+dy)))
                            for dx in range(-50,51) for dy in range(-50,51)
                            if 0<=x+dx<image.width and 0<=y+dy<image.height
                            and max(image.getpixel((x+dx,y+dy))) < 100]
                    assert dark
                    image.putpixel((x,y), min(dark, key=lambda item:item[0])[1])
            image.save(path)
        # Reopen from disk rather than checking the in-memory edited image.
        with Image.open(path) as fh:
            assert fh.size == original.size
            remaining = glints(fh)
            current = fh.convert('RGBA')
            hsv = fh.convert('RGB').convert('HSV')
        before = list(original.convert('RGBA').get_flattened_data())
        after = list(current.get_flattened_data())
        w, h = current.size
        changed = {(i % w, i // w) for i, (a, b) in enumerate(zip(before, after)) if a != b}
        assert not remaining, f'{relative}: {len(remaining)} remaining glint pixels'
        assert changed == expected, f'{relative}: edits outside the detected glints'
        assert 0 < len(changed) < w * h * .025
        # The rebuilt area must never contain a glint-coloured pixel again …
        for x, y in changed:
            if after[y * w + x][3] > 0:
                v, s = hsv.getpixel((x, y))[2], hsv.getpixel((x, y))[1]
                assert not (v > 240 and s < 30), f'{relative}: glint pixel at {(x, y)}'
        # … and no hole may open inside the body: every pixel that lost its
        # alpha must still reach the image border through transparency.
        cleared = {(x, y) for x, y in changed
                   if before[y * w + x][3] > 0 and after[y * w + x][3] == 0}
        if cleared:
            stack = [(x, y) for x in range(w) for y in (0, h - 1)
                     if after[y * w + x][3] == 0]
            stack += [(x, y) for y in range(h) for x in (0, w - 1)
                      if after[y * w + x][3] == 0]
            seen = set()
            while stack:
                x, y = stack.pop()
                if (x, y) in seen:
                    continue
                seen.add((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < w and 0 <= ny < h and (nx, ny) not in seen \
                            and after[ny * w + nx][3] == 0:
                        stack.append((nx, ny))
            holes = cleared - seen
            assert not holes, f'{relative}: {len(holes)} interior pixels punched out'
        total += len(changed)
        print(f'{relative}: changed={len(changed)} ({len(changed)/len(before):.2%}), '
              f'eye_glints_remaining={len(remaining)}, content=PASS')
    print(f'PASS: {len(files)} PNGs; {total} pixels changed; zero eye glints')


if __name__ == '__main__':
    main()
