
import wave, struct, math, json, sys, os

# Repo-relative (scripts/ -> FocusKid root): verifies the committed assets in
# sfx/jingles/. Pass a directory to verify another copy, e.g.
#   python3 scripts/verify_jingles.py /tmp/jingle-check
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SFX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE, "sfx", "jingles")
MASCOTS = ["Bubblo","Stella","Wobble","Aqua","Bud","Glow","Spark"]
PEAK_CAP = 0.5
RATE = 44100
CHANNELS = 1

def check(path):
    with wave.open(path, "rb") as w:
        assert w.getframerate() == RATE, f"{path}: rate {w.getframerate()}"
        assert w.getnchannels() == CHANNELS, f"{path}: channels {w.getnchannels()}"
        assert w.getsampwidth() == 2, f"{path}: sampwidth {w.getsampwidth()}"
        n = w.getnframes()
        dur = n / RATE
        assert 0.8 <= dur <= 1.2, f"{path}: duration {dur:.3f}s out of 0.8-1.2s"
        raw = w.readframes(n)
    samples = struct.unpack("<" + "h"*n, raw)
    peak = max(abs(s) for s in samples) / 32767.0
    assert peak <= PEAK_CAP, f"{path}: peak {peak:.4f} > {PEAK_CAP}"
    # fade-out to zero: last 20ms must be near-silent
    tail = samples[-int(0.02*RATE):]
    tail_peak = max(abs(s) for s in tail) / 32767.0
    assert tail_peak < 0.02, f"{path}: tail not faded (tail_peak {tail_peak:.4f})"
    # first 10ms should start near zero too (no click-in)
    head = samples[:int(0.01*RATE)]
    head_peak = max(abs(s) for s in head) / 32767.0
    assert head_peak < 0.05, f"{path}: head not faded (head_peak {head_peak:.4f})"
    return dur, peak

results = []
all_ok = True
for m in MASCOTS:
    p = os.path.join(SFX, f"{m}-complete.wav")
    if not os.path.exists(p):
        print(f"MISSING {p}")
        all_ok = False
        continue
    try:
        dur, peak = check(p)
        results.append((m, dur, peak))
        print(f"OK {m}: {dur*1000:.0f}ms peak={peak:.4f}")
    except AssertionError as e:
        print(f"FAIL {e}")
        all_ok = False

# INDEX.json validation
idx = os.path.join(SFX, "INDEX.json")
if not os.path.exists(idx):
    print("MISSING INDEX.json"); all_ok = False
else:
    with open(idx) as f:
        data = json.load(f)
    assert len(data) == 7, f"INDEX has {len(data)} entries"
    for e in data:
        for k in ("mascot","path","duration_ms","peak_amplitude"):
            assert k in e, f"INDEX entry missing {k}: {e}"
    print("INDEX.json OK (7 entries, all keys)")

print("ALL_VALID" if all_ok else "INVALID")
sys.exit(0 if all_ok else 1)
