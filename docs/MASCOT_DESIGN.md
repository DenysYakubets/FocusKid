# MASCOT_DESIGN.md — FocusKid Companion Mascot Specification

**Task:** C5 — Child-selectable mascot visible on all child screens  
**Status:** Design spec (no app code)  
**Date:** 2026-10-24

---

## 1. Overview

A cheerful, watery companion mascot appears on every child-facing screen (Today, Timer, Stats, Calendar). The child picks their own mascot from a roster; the selection persists via the existing settings store. The mascot is tappable (mood cycles: happy → neutral → excited → sleepy → happy). It floats as a non-blocking overlay and hides on PIN/parent screens for security.

**Design language:** glossy, translucent, liquid aesthetic — "водяниста штука, весела" (watery thing, cheerful). Radial gradients, soft highlights, simple expressive faces.

---

## 2. Mascot Roster (7 candidates)

Each mascot: name, personality, shape, moods (4), primary color token.

| # | Name | Personality | Shape | Moods | Primary Color |
|---|------|-------------|-------|-------|---------------|
| 1 | **Bubblo** | Cheerful water droplet who loves watching kids focus | droplet (teardrop) | happy, neutral, excited, sleepy | `#3B82F6` (blue-500) |
| 2 | **Stella** | Bright star who guides kids through their day | star (5-point) | happy, neutral, excited, sleepy | `#F59E0B` (amber-500) |
| 3 | **Wobble** | Squishy blob who celebrates every small win | blob (organic wobble) | happy, neutral, excited, sleepy | `#8B5CF6` (violet-500) |
| 4 | **Aqua** | Calm sphere who keeps time during focus sessions | sphere (perfect circle) | happy, neutral, excited, sleepy | `#06B6D4` (cyan-500) |
| 5 | **Bud** | Friendly leaf companion who grows with progress | droplet (leaf variant) | happy, neutral, excited, sleepy | `#10B981` (emerald-500) |
| 6 | **Glow** | Soft glow orb who lights up stats and achievements | sphere (glow ring) | happy, neutral, excited, sleepy | `#EC4899` (pink-500) |
| 7 | **Spark** | Tiny star who sparks motivation during tough tasks | star (spark variant) | happy, neutral, excited, sleepy | `#EF4444` (red-500) |

**Color palette derivation:** Each primary color ties to the existing theme via `src/ui/theme.ts` semantic families:
- Bubblo → `primary` (#2563EB) family, slightly lighter
- Stella → `warning` (#92400E) family, brightened
- Wobble → new `mascotViolet` token (add to theme)
- Aqua → new `mascotCyan` token
- Bud → `verified`/`success` (#15803D) family, brightened
- Glow → new `mascotPink` token
- Spark → `abandoned`/`danger` (#DC2626) family, brightened

Add to `src/ui/theme.ts` if not present:
```ts
export const mascotColors = {
  bubblo: '#3B82F6',
  stella: '#F59E0B',
  wobble: '#8B5CF6',
  aqua: '#06B6D4',
  bud: '#10B981',
  glow: '#EC4899',
  spark: '#EF4444',
} as const;
```

---

## 3. Mood States

Each mascot has 4 moods, mapped to PNG assets:

| Mood | Face | Usage |
|------|------|-------|
| **happy** | Curved eyes (^ ^), big smile arc | Default idle state |
| **neutral** | Dot eyes (• •), straight line mouth | Between interactions |
| **excited** | Star/diamond eyes (♦ ♦), open mouth (O) | Task completed, timer done |
| **sleepy** | Closed eyes (— —), small o mouth | Idle > 30s, low battery |

**Asset paths:** `assets/mascots/<Name>/<mood>.png` (256×256, transparent bg)

---

## 4. Selection Screen Spec

**Route:** `app/(child)/mascot-select.tsx` (or modal from settings)

**Layout:**
- **Grid:** 2 columns at 366/413dp, 1 column at 320dp (responsive per ui-designer §2.5)
- **Card:** Each mascot gets a card with:
  - Preview image (128×128 PNG, `happy` mood)
  - Name label (typography `body`, 16sp)
  - Personality blurb (typography `caption`, 12sp, 2-line clamp)
- **Tap-to-preview:** Tapping a card opens full-screen preview showing all 4 moods cycling (auto-play 2s each) with "Select" button (≥48dp touch target per INV-10)
- **Selected state:** Checkmark badge overlay, border highlight using `mascotColors.<name>`

**Persistence:**
- Store choice in existing settings/task store (AsyncStorage key: `@focuskid/mascot`)
- Shape: `{ mascot: "Bubblo", selectedAt: "2026-10-24T..." }`
- Read on app bootstrap (`appBootstrap.tsx`), expose via context or hook `useMascot()`
- Default: `Bubblo` if no selection

**Accessibility:**
- Each card: `accessibilityRole="button"`, `accessibilityLabel="{name} mascot"`
- Selected: `accessibilityState={{ selected: true }}`
- Preview modal: focus trap, dismiss via back button

---

## 5. Floating Component Spec

**Component:** `<MascotFloating />` in `src/ui/components/MascotFloating.tsx`

**Positioning:**
- **Size:** 72×72dp (≥64dp minimum, ≥48dp tap-target with padding)
- **Position:** Bottom-right corner, offset `spacing.lg` (24dp) from edges
- **Safe area:** Respect `useSafeAreaInsets()` bottom/right insets
- **z-index:** Above content, below modals (z: 50)

**Behavior:**
- **Tap:** Cycles mood (happy → neutral → excited → sleepy → happy), triggers subtle bounce animation (scale 1.0 → 1.1 → 1.0, 300ms spring)
- **Drag:** Optional — long-press to reposition (persist position per screen)
- **Idle animation:** Gentle float (translateY ±4dp, 2s ease-in-out loop), paused when `AccessibilityInfo.isReduceMotionEnabled()`

**Animation hints (expo-animation):**
```tsx
import Animated, { useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated';

const floatY = useSharedValue(0);
useEffect(() => {
  if (!reduceMotion) {
    floatY.value = withRepeat(
      withTiming(-4, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
      -1, // infinite
      true // reverse
    );
  }
}, [reduceMotion]);

// Tap bounce
const scale = useSharedValue(1);
const handlePress = () => {
  scale.value = withSequence(
    withTiming(1.1, { duration: 150 }),
    withTiming(1.0, { duration: 150 })
  );
  setMood(nextMood());
};
```

**Visibility rules:**
- **Show on:** Today, Timer, Stats, Calendar (all child screens)
- **Hide on:** PinGate, PinSetup, ParentHome, TaskListEdit, TaskEdit (security: no mascot on PIN/parent screens)
- Implementation: `useMascotVisible()` hook checks route name, returns boolean

**Non-blocking guarantee:**
- `pointerEvents="box-none"` on wrapper (passes taps through except on mascot itself)
- Positioned outside main content flow (absolute, doesn't affect layout)
- Max 72×72dp footprint — won't obscure text or buttons

---

## 6. Per-Screen Placement Rules

| Screen | Position | Rationale |
|--------|----------|-----------|
| **Today** | Bottom-right, above tab bar (if any) | Doesn't block task list CTA |
| **Timer** | Top-right, below header | Avoids countdown digits and controls |
| **Stats** | Bottom-left | Charts occupy right side |
| **Calendar** | Bottom-right, above event list | Doesn't block date grid |
| **Selection screen** | Hidden (grid is the focus) | Redundant with roster preview |

**Responsive:**
- 320dp: offset `spacing.md` (16dp) from edges, size 64×64dp
- 366/413dp: offset `spacing.lg` (24dp), size 72×72dp

**Landscape:**
- Reposition to avoid content: use `useWindowDimensions()`, flip corner if width > height

---

## 7. Theme Token Additions

Add to `src/ui/theme.ts`:

```ts
/** Mascot roster colors — one per selectable companion. */
export const mascotColors = {
  bubblo: '#3B82F6',
  stella: '#F59E0B',
  wobble: '#8B5CF6',
  aqua: '#06B6D4',
  bud: '#10B981',
  glow: '#EC4899',
  spark: '#EF4444',
} as const;

/** Default mascot if no selection persisted. */
export const DEFAULT_MASCOT = 'Bubblo' as const;
```

---

## 8. Asset Generation

Generated via Python PIL (see `scripts/gen_mascots.py` if committed):
- 7 mascots × 4 moods = **28 PNG files**
- Size: 256×256, transparent background
- Path: `assets/mascots/<Name>/<mood>.png`
- All >1KB, verified with `PIL.Image.verify()`

**INDEX.json** at `assets/mascots/INDEX.json`:
```json
[
  {
    "name": "Bubblo",
    "personality": "Cheerful water droplet...",
    "moods": ["happy", "neutral", "excited", "sleepy"],
    "primaryColor": "#3B82F6",
    "previewPath": "assets/mascots/Bubblo/happy.png"
  },
  ...
]
```

---

## 9. INV-10 Compliance

- All touch targets ≥48×48dp (mascot itself: 72×72, selection cards: full width × 120dp min)
- No actionable text <48sp — selection button uses `bodyLarge` (18sp) or larger
- Selection grid uses responsive layout (flex, wrapping), not fixed rows

---

## 10. Developer Handoff Checklist

- [ ] Add `mascotColors` + `DEFAULT_MASCOT` to `src/ui/theme.ts`
- [ ] Copy `assets/mascots/` into project
- [ ] Create `src/ui/components/MascotFloating.tsx`
- [ ] Create `src/hooks/useMascot.ts` (state + persistence)
- [ ] Create `app/(child)/mascot-select.tsx` (or settings modal)
- [ ] Wire into RootNavigator: show on child screens, hide on PIN/parent
- [ ] Test: tap cycles mood, persists across app restart, respects reduce-motion
- [ ] Screenshots at 320/366/413dp per ui-designer §2.6

---

**Spec complete.** No app code in this task — assets + documentation only.
