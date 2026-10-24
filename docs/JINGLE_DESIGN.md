# JINGLE_DESIGN.md — FocusKid Mascot Completion Jingles

**Task:** C6–C8 — short happy jingle per mascot on timer completion, distinct end-signal per companion, volume settings UI near mascot selection  
**Status:** Design spec + generated assets (no app code)  
**Date:** 2026-10-24  
**Baseline:** repo `main @ 8c6a2e8` (isolated clone, read-only reference for this stage).

---

## 1. Overview

Each of the 7 mascots gets its own short, quiet completion jingle played when the
child's timer FSM transitions into `Completed` or `Verified`. The jingle is
**distinct per mascot** so a child recognises "their" companion's sound without
looking at the screen. Volume is user-controlled (0–100%) from a slider on the
existing mascot selection screen, persisted in the same `settings` key/value
table that already stores the mascot choice (V4 migration, `mascotStore`).

**Constraints honoured:**
- WAV only, 44.1 kHz, 16-bit, mono — generated with Python stdlib (`wave` + `math` + `struct`), no external dependencies.
- Every file 0.80–1.20 s, **peak ≤ 0.5 (≈ −6 dBFS)** so it is never loud even at max volume.
- Smooth fade-in (5 ms) and fade-out (60 ms) on every file — zero audible clicks.
- One distinct musical character per mascot (see §2).
- No new npm dependency unless already present (checked: `package.json` has **neither `expo-av` nor `expo-audio`** — see §3.2).

---

## 2. Per-mascot note (interval pattern, duration, why it fits)

All frequencies are derived from equal-tempered MIDI (A4 = 440 Hz). "Steps" are
inter-onset intervals between note starts.

| # | Mascot | Interval / note pattern | Duration (ms) | Peak | Why it fits the personality |
|---|--------|------------------------|---------------|------|----------------------------|
| 1 | **Bubblo** | C5 → E5 → G5 → C6 ascending arpeggio, 160 ms steps, sine pluck + C6 octave shimmer | 1000 | 0.50 | Bubbly water droplet: a rising major arpeggio reads as a cheerful "bloop-bloop-bloop" climbing upward — matches «Весела краплинка води». |
| 2 | **Stella** | C6 → G6 → C7 sparkle chime, 120 / 140 ms steps, fast-decay sine bells | 900 | 0.50 | Bright guiding star: two quick high bells + a shimmer tail sound like a twinkle — matches «Яскрава зірка, що веде дитину». |
| 3 | **Wobble** | G5 → D5 → G5 → B5 bouncy bounce, 140 ms steps + soft triangle boing tail | 1100 | 0.50 | Squishy blob celebrating wins: down-up-down-up contour with a soft boing reads as a physical bounce — matches «Пухкенький бульбаш, що радіє». |
| 4 | **Aqua** | C5 → G5 → E5 gentle wave sweep, sustained overlapping sine tones | 1200 | 0.50 | Calm sphere keeping time: long, overlapping tones with no sharp attack feel like a slow wave rolling in — matches «Спокійна кулька, що пильнує час». |
| 5 | **Bud** | F4 soft pluck (with F5 octave) → C5 echo, warm short decay | 850 | 0.50 | Friendly leaf growing with progress: a single warm pluck + a gentle echo is organic and unhurried — matches «Дружний листочок, що росте». |
| 6 | **Glow** | C4 + E4 + G4 major triad swell (staggered attack) + C5 top note | 1150 | 0.50 | Soft glow orb lighting up achievements: a warm chord swelling together feels like light blooming — matches «М'яке світіння, що освітлює». |
| 7 | **Spark** | D5 → G5 → B5 quick zap fanfare, 100 ms steps, soft-square + D6 sine tail | 950 | 0.50 | Tiny star sparking motivation: fast, punchy, slightly buzzy (soft-square) reads as an energetic zap — matches «Маленька зірка, що запалює мотивацію». |

**Distinctness guarantee:** the seven patterns differ in (a) contour (ascending
arpeggio / sparkle bells / bounce / wave sweep / single pluck / chord swell /
zap fanfare), (b) timbre (sine vs triangle vs soft-square), (c) rhythm (100–160
ms steps vs sustained), and (d) register (F4 low pluck … C7 high sparkle). No
two mascots share the same pattern.

**Regeneration:** `scripts/gen_jingles.py` (committed alongside this spec) is
deterministic — re-running it reproduces byte-identical WAVs and `INDEX.json`.
Verification script: `scripts/verify_jingles.py` (asserts rate, channels,
duration range, peak cap, fade-in/out silence).

---

## 3. INTEGRATION SPEC

> **This section is a specification only.** No application code, no migration,
> no screen was modified in this task — assets + this document are the entire
> deliverable.

### 3.1 Storage — settings table (migration V6)

The `settings` key/value table already exists from **V4** (`src/services/db/schema.ts`,
used by `mascotStore.ts` via `settingsRepo`). Two new keys are added; because
this is a key/value table (not a column-add), **no `ALTER TABLE` is needed** —
but the brief explicitly asks for a migration slot, so we reserve **V6** as a
no-op schema stamp if the team prefers an explicit version bump, OR (preferred,
zero-risk) just write the new keys through the existing `settingsRepo` with no
migration at all.

**Preferred approach (no migration required):**

```ts
// keys live in the same settings table as MASCOT_SETTING_KEY
export const JINGLE_VOLUME_KEY = '@focuskid/jingle_volume'; // value: "0.0".."1.0", default "0.5"
export const JINGLE_ENABLED_KEY = '@focuskid/jingle_enabled'; // value: "true" | "false", default "true"
```

Written/read through the existing `SettingsRepo` (`get`/`set`) — no schema
change, `migrations.ts` untouched, `MIGRATIONS.length` stays at 5.

**If the team insists on an explicit migration slot** (e.g. to guarantee the
keys exist with defaults on every fresh install), add **V6** to
`src/services/db/schema.ts`:

```ts
/**
 * V6 (C8): seed jingle preferences so every install starts with an explicit
 * default rather than relying on the store's fallback. Idempotent by virtue
 * of INSERT OR IGNORE.
 */
const V6_SQL = `
INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES
  ('@focuskid/jingle_volume', '0.5', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  ('@focuskid/jingle_enabled', 'true', strftime('%Y-%m-%dT%H:%M:%fZ','now'));
`;

export const MIGRATIONS: readonly string[] = [
  V1_SQL, V2_SQL, V3_SQL, V4_SQL, V5_SQL, V6_SQL,
];
```

> ⚠️ `strftime('%Y-%m-%dT%H:%M:%fZ','now')` is SQLite's UTC ISO-8601 with
> milliseconds — matches the `updated_at TEXT NOT NULL` column contract. If the
> team prefers the app's `WallClock.nowIso()` (INV-02 forbids `Date` in app
> code, but raw SQL in a migration runs before the app clock is wired), the
> SQL literal above is the correct migration-time equivalent.

**Test impact:** `src/services/db/__tests__/migrations.test.ts` asserts
`user_version === MIGRATIONS.length` — adding V6 bumps the expected length from
5 → 6; update the two `expect(...).toBe(MIGRATIONS.length)` assertions (they
already reference `MIGRATIONS.length` symbolically, so **no hard-coded 5 exists**
— the test passes automatically once V6 is appended). The table-list assertion
(`['parent_auth','session_events','sessions','settings','tasks']`) is
unaffected (V6 inserts rows, not tables).

---

### 3.2 Playback — which audio module?

**Checked `package.json` and `package-lock.json` in this clone:** neither
`expo-av` nor `expo-audio` is present. The app currently has **no audio module
installed**.

| Candidate | Status | Recommendation |
|-----------|--------|----------------|
| `expo-av` (`Audio.Sound`) | **NOT installed** | Legacy; Expo docs mark it deprecated in favour of `expo-audio` since SDK 52. |
| `expo-audio` | **NOT installed** | **Preferred** if a new dependency is added — it is the current, maintained Expo audio API. |

**Constraint from the brief:** *"offline, no new npm dep if expo-av already
present — CHECK package.json first and note which module is available."*
Result of that check: **neither is available**, so a choice must be made:

- **Option A (recommended): add `expo-audio`** via `npx expo install expo-audio`
  (resolves the SDK-58-compatible version). This is one new native module; it
  requires a dev/rebuild (`npx expo run:android`) because it has native code —
  consistent with the repo's existing pattern (`expo-sqlite`, `expo-crypto`,
  `expo-keep-awake` are all native modules already in the tree).
- **Option B: no new dependency** — implement playback with the platform's
  native `Sound` via a bare `require` + a tiny custom native module, or skip
  audio entirely. This is more work and worse DX; not recommended.

**Recommended playback API (`expo-audio`):**

```ts
import { Audio } from 'expo-audio';

// one-time setup (e.g. app bootstrap, after Audio module is available)
await Audio.setAudioModeAsync({
  playsInSilentModeIOS: true,
  staysActiveInBackground: false,
  shouldDuckAndroid: true,
});

// per-play helper
export async function playJingle(
  mascot: MascotName,
  volume: number, // 0.0 .. 1.0, from settings
): Promise<void> {
  const source = JINGLE_SOURCES[mascot]; // static require map, see §3.3
  const { sound } = await Audio.Sound.createAsync(source, {
    volume: Math.max(0, Math.min(1, volume)),
    isLooping: false,
    rate: 1.0,
  });
  sound.setOnPlaybackStatusUpdate((status) => {
    if (status.isLoaded && status.didJustFinish) {
      void sound.ununloadAsync?.(); // expo-audio: unload to free native resource
      void sound.remove();
    }
  });
  await sound.playAsync();
}
```

> **Static require map (Metro does not bundle dynamic requires):** mirror the
> existing `src/ui/mascotImages.ts` pattern — create
> `src/ui/jingleSources.ts` with one literal `require('../../sfx/jingles/<Mascot>-complete.wav')`
> per roster member. The `Record<MascotName, number>` shape matches how
> `mascotImages` is already typed.

**Where playback hooks in (FSM trigger):**

The timer FSM transition is observed in `src/screens/TimerScreen.tsx` inside
the existing `useEffect` that already watches `displayState.kind` for
accessibility announcements (lines ~186–196 in the baseline):

```ts
useEffect(() => {
  const prev = prevKindRef.current;
  const current = displayState.kind;
  prevKindRef.current = current;

  if (prev === 'Paused' && current === 'Running') {
    AccessibilityInfo.announceForAccessibility(afari.timer.autoResumed);
  } else if (prev !== 'Completed' && current === 'Completed') {
    AccessibilityInfo.announceForAccessibility(uk.timer.completedAnnouncement);
    // C8: play the selected mascot's jingle — child screens ONLY
    void playCompletionJingle(); // reads volume/enabled from settings store
  } else if (prev !== 'Verified' && current === 'Verified') {
    // also play on Verified (parent just approved) — still the child's screen
    void playCompletionJingle();
  }
}, [displayState.kind]);
```

**Child-only guard:** `TimerScreen` is a child route (stack name `Timer`,
reached from `ChildTabsScreen` → `Today`). Parent screens (`ParentHome`,
`Stats`, `TaskListEdit`, `TaskEdit`, `PinGate`, `PinSetup`) never mount
`TimerScreen`, so placing the trigger **only** in `TimerScreen`'s existing
`displayState.kind` effect guarantees the jingle never fires on parent screens.
No additional route guard is needed — the screen boundary is the guard.

**`playCompletionJingle()`** (new, ~20 lines) reads:
- `useMascotStore.getState().mascot` → which jingle file
- `settingsRepo.get(JINGLE_VOLUME_KEY)` → number (default 0.5)
- `settingsRepo.get(JINGLE_ENABLED_KEY)` → boolean (default true)

and no-ops if `jingle_enabled === 'false'` or `volume === 0`.

---

### 3.3 UI — MascotSelectScreen volume slider + Test button

**Location:** `src/screens/MascotSelectScreen.tsx`, immediately after the
preview panel (`testID="mascot-preview"`) and before the roster grid — i.e.
"near mascot selection" as the brief requires.

**Components (no new dependency):**
- **Slider:** `@react-native-community/slider` is **NOT installed**. Per the
  brief ("use existing RN primitives / no new deps"), implement a lightweight
  custom slider using RN's `PanResponder` + `View` (track + thumb), **OR** use
  the simplest possible accessible control: a row of `TapTarget` +/- steppers
  (10% increments) which reuses the exact `TapTarget` primitive already in the
  codebase (`src/ui/components/TapTarget.tsx`, enforces the 48dp INV-10 floor
  automatically). **Recommended: stepper row** — zero new deps, guaranteed
  INV-10 compliant, testable with `fireEvent.press`.
- **Percent label:** `AppText variant="body"` showing `Гучність: NN%`.
- **Test button:** `TapTarget` with `accessibilityRole="button"`, label
  `uk.mascot.jingleTest`, `testID="jingle-test"`. onPress →
  `playJingle(shown, volume)` using the **currently previewed** mascot (`shown`
  variable already exists in the screen: `const shown = tapped ?? mascot;`).

**Exact `uk.ts` strings** (append inside the existing `mascot: { ... }` block,
after `personalities`):

```ts
    // C8: jingle volume + test preview
    jingleVolume: (pct: number) => `Гучність мелодії: ${pct}%`,
    jingleVolumeStepDown: 'Зменшити гучність мелодії',
    jingleVolumeStepUp: 'Збільшити гучність мелодії',
    jingleTest: 'Тест',
    jingleDisabled: 'Мелодію вимкнено',
    jingleSaveError: 'Не вдалося зберегти гучність мелодії. Спробуйте ще раз.',
```

**Slider/stepper spec (responsive, INV-10 safe):**

| Element | testID | a11y role | a11y label | Notes |
|---------|--------|-----------|------------|-------|
| Volume row container | `jingle-volume` | — | — | `View`, `accessibilityLabel` omitted (grouping only) |
| Percent readout | `jingle-volume-value` | `text` | `uk.mascot.jingleVolume(pct)` | renders `Гучність мелодії: 50%` |
| Decrease button | `jingle-volume-down` | `button` | `uk.mascot.jingleVolumeStepDown` | `TapTarget size="sm"` (48dp floor auto-applied) |
| Increase button | `jingle-volume-up` | `button` | `uk.mascot.jingleVolumeStepUp` | `TapTarget size="sm"` |
| Test button | `jingle-test` | `button` | `uk.mascot.jingleTest` | `TapTarget size="sm"`; disabled when `jingle_enabled === false` |
| Save error box | `jingle-save-error` | — | — | `NoticeBox tone="error"`, message `uk.mascot.jingleSaveError` |

**State & persistence (mirrors `mascotStore` exactly):**

```ts
// src/state/jingleStore.ts  (new, follows mascotStore.ts shape)
import { create } from 'zustand';
import { AppServices } from './appServices';

export const JINGLE_VOLUME_KEY = '@focuskid/jingle_volume';
export const JINGLE_ENABLED_KEY = '@focuskid/jingle_enabled';
export const DEFAULT_JINGLE_VOLUME = 0.5;

interface JingleStoreState {
  volume: number;   // 0.0 .. 1.0
  enabled: boolean;
  hydrated: boolean;
  hydrate: (services: AppServices) => Promise<void>;
  setVolume: (v: number, services: AppServices) => Promise<void>;
  setEnabled: (v: boolean, services: AppServices) => Promise<void>;
}
```

- `hydrate()` reads both keys, falls back to `DEFAULT_JINGLE_VOLUME` / `true`
  on missing/corrupt rows (same defensive pattern as `mascotStore.parseStored`).
- `setVolume()` clamps to [0, 1], writes `String(v)` via `settingsRepo.set`,
  rolls back on persistence failure (same rollback-on-error contract as
  `mascotStore.select`).
- A new hook `useJingle()` in `src/ui/hooks/useJingle.ts` mirrors
  `useMascot.ts` (hydrate-on-first-mount, expose `volume`, `enabled`,
  `setVolume`, `setEnabled`).

**Wire-up in MascotSelectScreen (pseudo-diff, not applied):**

```tsx
const { volume, enabled, setVolume } = useJingle();
const pct = Math.round(volume * 100);

<View testID="jingle-volume" style={styles.jingleRow}>
  <AppText variant="body" testID="jingle-volume-value">
    {uk.mascot.jingleVolume(pct)}
  </AppText>
  <View style={styles.jingleControls}>
    <TapTarget
      accessibilityRole="button"
      accessibilityLabel={uk.mascot.jingleVolumeStepDown}
      testID="jingle-volume-down"
      size="sm"
      onPress={() => void setVolume(Math.max(0, volume - 0.1)).catch(() => setSaveError(true))}
    >
      <AppText variant="bodyLarge">−</AppText>
    </TapTarget>
    <TapTarget
      accessibilityRole="button"
      accessibilityLabel={uk.mascot.jingleVolumeStepUp}
      testID="jingle-volume-up"
      size="sm"
      onPress={() => void setVolume(Math.min(1, volume + 0.1)).catch(() => setSaveError(true))}
    >
      <AppText variant="bodyLarge">+</AppText>
    </TapTarget>
    <TapTarget
      accessibilityRole="button"
      accessibilityLabel={uk.mascot.jingleTest}
      testID="jingle-test"
      size="sm"
      disabled={!enabled || volume === 0}
      onPress={() => void playJingle(shown, volume)}
    >
      <AppText variant="bodyLarge">{uk.mascot.jingleTest}</AppText>
    </TapTarget>
  </View>
</View>
```

**Test IDs summary (for `src/screens/__tests__/jingleVolume.test.tsx`):**

| testID | Assertion |
|--------|-----------|
| `jingle-volume` | container renders |
| `jingle-volume-value` | text equals `uk.mascot.jingleVolume(50)` on first hydrate |
| `jingle-volume-down` | press → value text becomes `uk.mascot.jingleVolume(40)`; persists across remount |
| `jingle-volume-up` | press → `uk.mascot.jingleVolume(60)` |
| `jingle-test` | press → `playJingle` mock called with `('Bubblo', 0.5)` (or the previewed mascot) |
| `jingle-save-error` | appears when `settingsRepo.set` rejects (mirrors `mascot-save-error` test) |

**Styling:** all values from `src/ui/theme.ts` tokens (`spacing.md`,
`spacing.sm`, `colors.border`, `radius.md`, `typography.body`) — no raw hex, no
magic numbers (ui-designer §2.1/§2.2). The stepper row wraps responsively at
320dp (existing `useScreenGutter()` + `flexWrap: 'wrap'` already used by the
roster grid).

---

## 4. INV-10 / accessibility notes

- Every new touch target uses `TapTarget` → automatically ≥48×48dp (`MIN_TOUCH_DP`).
- No actionable text <48sp: `AppText variant="bodyLarge"` (18sp, within the
  amended INV-10 ramp) is used for − / + / Тест labels.
- Percent readout is `variant="body"` (16sp, non-actionable) — compliant.
- All strings come from `uk.ts`; no hardcoded Ukrainian in JSX (matches
  existing `MascotSelectScreen` convention).
- Screen readers: `accessibilityRole` + `accessibilityLabel` on every control;
  volume value announced via the readout's text content.

---

## 5. Developer handoff checklist

- [ ] `npx expo install expo-audio` (only new dependency; **neither `expo-av` nor `expo-audio` was present**)
- [ ] Create `src/ui/jingleSources.ts` (static `require` map, mirrors `mascotImages.ts`)
- [ ] Create `src/state/jingleStore.ts` + `src/ui/hooks/useJingle.ts` (mirrors `mascotStore` / `useMascot`)
- [ ] (Optional) Append `V6_SQL` to `src/services/db/schema.ts` if explicit defaults seeding is wanted; otherwise skip — key/value writes need no migration
- [ ] Add the §3.3 volume stepper + Test button to `MascotSelectScreen.tsx`
- [ ] Add §3.3 `uk.ts` strings inside the existing `mascot` block
- [ ] Hook playback into `TimerScreen.tsx`'s existing `displayState.kind` effect (Completed + Verified branches only — child screen, never parent)
- [ ] `test/setup.ts`: add `jest.mock('expo-audio', ...)` so Jest doesn't try to load the native module
- [ ] New tests: `src/screens/__tests__/jingleVolume.test.tsx` (per §3.3 testID table)
- [ ] Gates: `npx tsc --noEmit`, `npm test -- --ci`, `bash scripts/check-invariants.sh` — all exit 0
- [ ] Verify zero drift: `grep -rnE '#[0-9a-fA-F]{3,8}' src/` → only `src/ui/theme.ts`

---

## 6. Assets

- **Directory:** `sfx/jingles/`
- **Files:** 7 × `<Mascot>-complete.wav` (44.1 kHz, 16-bit, mono, 0.80–1.20 s, peak ≤ 0.5)
- **Manifest:** `sfx/jingles/INDEX.json` — `[{ mascot, path, duration_ms, peak_amplitude }, …]` (7 entries)
- **Generator:** `scripts/gen_jingles.py` (stdlib-only, deterministic)
- **Verifier:** `scripts/verify_jingles.py` (asserts rate/channels/duration/peak/fade-in-out)

Regenerate + verify:

```bash
python3 scripts/gen_jingles.py
python3 scripts/verify_jingles.py   # exits 0 only if all 7 pass every constraint
```

---

**Spec complete.** Assets generated and verified; no application code, no
migration, no screen was modified in this task.
