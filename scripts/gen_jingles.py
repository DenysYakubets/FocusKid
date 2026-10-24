
import wave, struct, math, json, os, sys

# Repo-relative (scripts/ -> FocusKid root): the committed jingle assets live in
# sfx/jingles/. Pass an output directory to regenerate elsewhere, e.g.
#   python3 scripts/gen_jingles.py /tmp/jingle-check   (then `diff -r` it)
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SFX = sys.argv[1] if len(sys.argv) > 1 else os.path.join(BASE, "sfx", "jingles")
os.makedirs(SFX, exist_ok=True)

RATE = 44100
PEAK_CAP = 0.5  # ~-6dBFS, conservative ceiling

def midi2hz(m):
    return 440.0 * (2 ** ((m - 69) / 12.0))

# Note helpers (MIDI): C4=60, D4=62, E4=64, F4=65, G4=67, A4=69, B4=71, C5=72, D5=74, E5=76, G5=79, A5=81, C6=84
C4, D4, E4, F4, G4, A4, B4 = 60, 62, 64, 65, 67, 69, 71
C5, D5, E5, F5, G5, A5, B5 = 72, 74, 76, 77, 79, 81, 83
C6, E6, G6 = 84, 88, 91

def env_ad(t, dur, attack=0.01, decay_frac=0.7):
    """Attack-decay envelope: linear attack, exponential-ish decay to 0."""
    if t < attack:
        return t / attack
    # decay phase
    dt = (t - attack) / max(dur - attack, 1e-6)
    # smooth decay to zero
    return max(0.0, (1.0 - dt)) ** 1.5

def tone(freq, dur, amp, t0, total, attack=0.012, kind="sine", decay_frac=0.75):
    """Return generator contribution for one tone starting at t0 (seconds) within total."""
    n_total = int(total * RATE)
    n_start = int(t0 * RATE)
    n_dur = int(dur * RATE)
    out = []
    for i in range(n_dur):
        n = n_start + i
        if n >= n_total:
            break
        t = i / RATE
        ph = 2 * math.pi * freq * t
        if kind == "sine":
            s = math.sin(ph)
        elif kind == "triangle":
            # simple triangle via arcsin approximation
            s = (2 / math.pi) * math.asin(math.sin(ph))
        elif kind == "square_soft":
            s = math.tanh(3 * math.sin(ph))
        else:
            s = math.sin(ph)
        e = env_ad(t, dur, attack=attack, decay_frac=decay_frac)
        out.append((n, s * e * amp))
    return out

def render(events, total_s):
    """events: list of (start_sec, freq, dur, amp, kind). Returns list of floats (0..1 scale pre-cap)."""
    n_total = int(total_s * RATE)
    buf = [0.0] * n_total
    for (t0, freq, dur, amp, kind) in events:
        for (n, v) in tone(freq, dur, amp, t0, total_s, kind=kind):
            if 0 <= n < n_total:
                buf[n] += v
    # global fade-in 5ms and fade-out last 60ms to guarantee no clicks
    fade_in = int(0.005 * RATE)
    fade_out = int(0.060 * RATE)
    for i in range(fade_in):
        buf[i] *= i / fade_in
    for i in range(fade_out):
        idx = n_total - 1 - i
        if idx >= 0:
            buf[idx] *= i / fade_out
    # normalize to PEAK_CAP
    peak = max(abs(v) for v in buf)
    if peak > 0:
        scale = PEAK_CAP / peak
        buf = [v * scale for v in buf]
    return buf

def write_wav(path, buf):
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        frames = b"".join(struct.pack("<h", int(max(-1.0, min(1.0, v)) * 32767)) for v in buf)
        w.writeframes(frames)

def peak_of(buf):
    return max(abs(v) for v in buf)

# ---- Per-mascot jingle definitions (distinct character) ----
# Each: (mascot, total_duration_s, events[(t0, freq, dur, amp, kind)], note_pattern_for_doc)

def build_bubblo():
    # Bubblo: bubbly ascending arpeggio C5-E5-G5-C6 with soft pluck timbre
    total = 1.0
    notes = [C5, E5, G5, C6]
    events = []
    for i, m in enumerate(notes):
        t0 = 0.05 + i * 0.16
        events.append((t0, midi2hz(m), 0.22, 0.9, "sine"))
    # add a subtle octave-up shimmer on last note
    events.append((0.53, midi2hz(C6 + 12), 0.30, 0.35, "sine"))
    buf = render(events, total)
    pattern = "C5→E5→G5→C6 ascending arpeggio (160ms steps), sine pluck + C6 octave shimmer"
    return buf, total, pattern

def build_stella():
    # Stella: sparkle chime — two quick high bells C6, G6 with fast decay
    total = 0.9
    events = [
        (0.04, midi2hz(C6), 0.35, 1.0, "sine"),
        (0.16, midi2hz(G6), 0.30, 0.8, "sine"),
        (0.30, midi2hz(C6 + 12), 0.40, 0.5, "sine"),  # C7 sparkle tail
    ]
    buf = render(events, total)
    pattern = "C6→G6→C7 sparkle chime (120/140ms steps), fast-decay sine bells"
    return buf, total, pattern

def build_wobble():
    # Wobble: bouncy boing — descending then ascending sine with pitch glide feel via two quick notes
    total = 1.1
    events = [
        (0.03, midi2hz(G5), 0.18, 1.0, "sine"),
        (0.17, midi2hz(D5), 0.18, 0.9, "sine"),
        (0.31, midi2hz(G5), 0.18, 0.95, "sine"),
        (0.45, midi2hz(B5), 0.22, 0.85, "sine"),
        # boing accent: soft triangle
        (0.60, midi2hz(G5), 0.35, 0.5, "triangle"),
    ]
    buf = render(events, total)
    pattern = "G5→D5→G5→B5 bouncy bounce (140ms steps) + soft triangle boing tail"
    return buf, total, pattern

def build_aqua():
    # Aqua: gentle wave sweep — slow sine glide approximated by two sustained tones with overlap
    total = 1.2
    events = [
        (0.03, midi2hz(C5), 0.55, 0.9, "sine"),
        (0.35, midi2hz(G5), 0.55, 0.7, "sine"),
        (0.65, midi2hz(E5), 0.50, 0.6, "sine"),
    ]
    buf = render(events, total)
    pattern = "C5→G5→E5 gentle wave sweep (sustained, overlapping sine tones)"
    return buf, total, pattern

def build_bud():
    # Bud: soft pluck — single warm note F4 with harmonics, short
    total = 0.85
    events = [
        (0.04, midi2hz(F4), 0.45, 1.0, "sine"),
        (0.04, midi2hz(F4 + 12), 0.35, 0.4, "sine"),  # octave
        (0.30, midi2hz(C5), 0.40, 0.55, "sine"),
    ]
    buf = render(events, total)
    pattern = "F4 soft pluck (with F5 octave) → C5 echo, warm short decay"
    return buf, total, pattern

def build_glow():
    # Glow: warm chord swell — C major triad (C4,E4,G4) swelling together
    total = 1.15
    events = [
        (0.03, midi2hz(C4), 0.9, 0.8, "sine"),
        (0.10, midi2hz(E4), 0.85, 0.7, "sine"),
        (0.17, midi2hz(G4), 0.80, 0.7, "sine"),
        (0.35, midi2hz(C5), 0.70, 0.5, "sine"),
    ]
    buf = render(events, total)
    pattern = "C4+E4+G4 major triad swell (staggered attack) + C5 top note"
    return buf, total, pattern

def build_spark():
    # Spark: quick zap fanfare — fast rising minor-third punch D5-G5-B5 then zap
    total = 0.95
    events = [
        (0.03, midi2hz(D5), 0.14, 1.0, "square_soft"),
        (0.13, midi2hz(G5), 0.14, 0.95, "square_soft"),
        (0.23, midi2hz(B5), 0.20, 0.9, "square_soft"),
        (0.40, midi2hz(D5 + 12), 0.45, 0.6, "sine"),  # D6 zap tail
    ]
    buf = render(events, total)
    pattern = "D5→G5→B5 quick zap fanfare (100ms steps, soft-square) + D6 sine tail"
    return buf, total, pattern

BUILDERS = {
    "Bubblo": build_bubblo,
    "Stella": build_stella,
    "Wobble": build_wobble,
    "Aqua": build_aqua,
    "Bud": build_bud,
    "Glow": build_glow,
    "Spark": build_spark,
}

index = []
patterns = {}
for mascot, fn in BUILDERS.items():
    buf, total, pattern = fn()
    path = os.path.join(SFX, f"{mascot}-complete.wav")
    write_wav(path, buf)
    dur_ms = int(round(len(buf) / RATE * 1000))
    peak = peak_of(buf)
    index.append({
        "mascot": mascot,
        "path": f"sfx/jingles/{mascot}-complete.wav",
        "duration_ms": dur_ms,
        "peak_amplitude": round(peak, 4),
    })
    patterns[mascot] = pattern
    print(f"WROTE {mascot}: {dur_ms}ms peak={peak:.4f}")

with open(os.path.join(SFX, "INDEX.json"), "w") as f:
    json.dump(index, f, indent=2)
print("INDEX.json written")

# dump patterns for the doc
with open(os.path.join(SFX, "PATTERNS.json"), "w") as f:
    json.dump(patterns, f, indent=2)
print("PATTERNS.json written")
