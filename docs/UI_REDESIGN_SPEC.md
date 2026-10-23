# FocusKid UI/UX Redesign — Design Specification (Stage 1)

> **Status:** DESIGN SPEC ONLY. This document changes no code, no tests, no `VISION.md`.
> **Role:** UI DESIGNER. Skills applied: `ui-designer`, `expo-design-system`, `expo-native-ui`,
> `frontend-design`, `web-design-guidelines` (manifest: `.agents/skills/SKILLS.md`).
> **Baseline:** repo `main` @ `85f762c` (read-only reference for this stage).
> **Audience:** the developer agent. This spec is decision-complete — implement it without asking questions.
> **Note on path:** deliverable lives at `docs/UI_REDESIGN_SPEC.md` per pipeline-owner instruction
> (deviation from `ui-designer` §4 which says `docs/plans/<task>.md`; owner instruction wins).

---

## 0. Problem statement & root causes (code evidence)

Owner complaint (verbatim intent): «великі букви, кнопочки тепер маленькі (1-6), раніше було
краще, все не так, UI/UX поганий» — *letters are huge, buttons are now tiny (1–6), it was better
before, the UI/UX is bad.*

Evidence screenshots (layouts described from file names/context; **all decisions below are grounded
in code**, not in the images):

| Screenshot (`~/.hermes/cache/scratch/focuskid-ui/shots-v011/`) | Layout it shows |
|---|---|
| `v011-S2-keypad-top-320dp.png` | PIN keypad top at 320dp: header + only the upper digit rows (1–6) in the viewport; rows 7–9 and 0/⌫ clipped below the fold |
| `v011-S3-after-pin-320dp.png` | Screen immediately after PIN entry at 320dp; oversized text dominates the viewport |
| `v011-S4-addform-320dp.png` | Task add form at 320dp: giant field labels, compressed stepper and weekday toggles |
| `v011-S4-duration-320dp.png`, `v011-S4-list-scrolled-320dp.png` | Duration controls and deep-scrolled task list at 320dp |
| `v011-S5-today-366dp.png`, `v011-S5-today-413dp.png` | Today list at the other two densities |
| `v011-S13-timer-landscape.png`, `v011-S13-today-landscape.png` | Landscape (INV-08) references |

Root causes, all cited to code:

1. **The 48sp floor** — `src/ui/theme.ts:1-9`: `MIN_FONT_SP = 48` and
   `typography = { body: 48, title: 56, timer: 120, timerLandscape: 160 }`. Every `AppText` glyph
   renders at roughly 3× normal mobile size because VISION.md INV-10 reads «Мін. розмір шрифту 48sp».
2. **Long Ukrainian strings × giant type ⇒ chrome is pushed out of fixed containers** —
   `src/i18n/uk.ts` strings are long (e.g. `uk.today.title = 'Мої завдання на сьогодні'`). At 56sp
   a title wraps to 3–4 lines. `PinGateScreen` uses a fixed, non-scrolling container
   (`justifyContent: 'space-between'`) while `PinPad` gives the grid `flex: 1` with rows
   `maxHeight: 110` — when the header + error box (`marginVertical: spacing.md`) grow, fewer than
   4 rows × 48dp fit, so rows 7–9 / 0 / ⌫ fall below the viewport. This is exactly the owner's
   "buttons (1–6)" observation.
3. **Fixed-min-width control rows clip horizontally at 320dp** — `TimerScreen.tsx`
   `actionButton { minWidth: 140 }` × 2 + `gap: spacing.md (16)` = **296dp inside a 288dp content
   box** (320 − 2×16 gutter = 288) → overflow; `title`-variant (56sp) labels inside 140dp buttons
   wrap/overflow → the "tiny buttons" look.
4. **Design-system drift** — baseline probes run on `85f762c`:
   - `grep -rnE '#[0-9a-fA-F]{3,8}' src/ | grep -v theme.ts` → **12 hits** (TodayScreen ×2,
     ParentHome ×1, PinSetup ×1, PinGate ×2, TimerScreen ×5, TaskEdit ×1).
   - `grep -rnE 'fontSize: *([0-9]|[1-4][0-9])\b' src/` → 0 hits (sizes already flow through
     `theme.ts` — this property must survive the redesign).
   - `grep -rnE '(padding|margin|fontSize): *[0-9]+' src/` → 0 hits (spacing already tokenized —
     must survive). Raw `borderRadius: 8/12/16/36`, `maxWidth: 360`, `height: 16` literals are
     *not* caught by those probes but are still drift; §3 tokenizes them.
5. Emoji used as UI icons (`🔒`, `⏱`) — named native-slop tell "Emoji Iconography"
   (expo-design-system). Note: `@expo/vector-icons` is **not present** in `node_modules`, and §7
   forbids new dependencies — so this redesign uses text labels plus standard glyphs (`←`, `⌫`,
   `▲▼`, `›`) only.

---

## 1. Design principles (each decision cites the skill it comes from)

1. **One source of truth.** Every visual value lives in `src/ui/theme.ts`; screens import tokens and
   components, never redefine them. *(expo-design-system: "Never hardcode hex colors, font sizes, or
   spacing"; ui-designer §3 "No color/spacing/type values outside `src/ui/theme.ts`".)*
2. **Semantic color families, documented contrast.** Named tokens only (`bg/surface`, `text*`,
   `accent/danger/success/warning`, `border/divider` families), WCAG AA ≥4.5:1 body, ≥3:1 large text
   and UI boundaries, ratios published in §3. *(ui-designer §2.1; web-design-guidelines contrast
   rules.)*
3. **Responsive layout instead of big type.** Fit is achieved with flex, wrapping rows, scrollable
   regions and breakpoint gutters — never fixed row heights and never oversized fonts to "fill
   space". *(ui-designer §2.3/§2.5; expo-native-ui Responsiveness: flexbox, `useWindowDimensions`,
   ScrollView rules.)*
4. **Native-feeling structure.** `boxShadow` strings (never legacy `shadow*`/`elevation`),
   `borderCurve: 'continuous'`, `gap` over margins, navigation titles over custom header text, four
   states (loading/error/empty/content) per data screen. *(expo-native-ui Styling & Behavior;
   expo-design-system Radius/Shadows.)*
5. **Touch-first, kid-friendly.** Every actionable element ≥ 48dp via `TapTarget`; pressed feedback
   mandatory; per screen exactly one bold element, everything else quiet. *(ui-designer §3 hard
   constraints; frontend-design "Spend your boldness in one place".)*
6. **Text scales, chrome survives.** `allowFontScaling` on everywhere, per-role
   `maxFontSizeMultiplier` (§2/§3), labels wrap before they truncate; never disable scaling
   app-wide. *(expo-design-system Typography → Dynamic Type; amended INV-10 §2.)*
7. **Copy is design content.** Sentence case, plain verbs, one name per action across the flow,
   errors say what happened and what to do, empty states invite action. *(frontend-design "More on
   writing in design".)*
8. **Ukrainian-safe layouts.** Every layout survives `src/i18n/uk.ts` strings (~20% longer than EN)
   at 320dp and at font scale 2.0. Truncation (`numberOfLines`) only where the existing test suite
   pins it (Today/TaskEdit/TaskListEdit titles). *(ui-designer §3; expo-design-system "let labels
   wrap or reflow".)*
9. **Zero drift is the definition of done.** Hex / raw-fontSize / raw-padding probes return zero hits
   outside `theme.ts` before handoff. *(ui-designer §6 review loop, §11 collaboration matrix.)*
10. **No native slop, no generic tells.** No emoji as UI icons, no decorative gradients, no
    ALL-CAPS eyebrows, no template card-grid-everywhere (cards here are pressed list items with a
    clear affordance — justified, not decorative). *(expo-design-system "Named Failures: Native
    Slop"; frontend-design §"AI-generated design tells".)*

---

## 2. INV-10 AMENDMENT (critical decision — explicit)

**Decision: the literal "48sp minimum font" rule is replaced by "scalable text + fixed 48dp touch
targets".** This is a deliberate spec change, approved by the pipeline owner's complaint
(§0) — the 48sp floor is the identified root cause of the giant-text/tiny-controls failure, and it
pitted INV-10 against its own intent (readability) by making controls clip at 320dp.

**New INV-10 semantics:**

| Aspect | Old rule | New rule (amended) |
|---|---|---|
| Body text | literal ≥ 48sp | **16sp default** |
| Section titles | literal ≥ 48sp | **20–24sp** (`title` 20, `heading` 24) |
| Timer digits | 120/160sp | **64–72sp** (`timer` 64 portrait, `timerLandscape` 72) |
| Font scaling | not specified | **`allowFontScaling = true` (mandatory) with per-role `maxFontSizeMultiplier`: text roles up to 3.0** — 16sp × 3.0 = **48sp**, so users who need the old 48sp reach it via the OS font-size setting |
| Touch targets | ≥ 48×48dp | **≥ 48×48dp — KEPT verbatim** (`MIN_TOUCH_DP`, `TapTarget`) |
| TalkBack | supported | **KEPT verbatim** (roles/labels/live-region announcements unchanged) |

### 2.1 Exact changes required in `VISION.md`

- **Line 53** — current text:

  ```
  - [INV-10] **Accessibility & Target Sizes**: Мін. розмір шрифту 48sp, сенсорні кнопки $\ge 48\times 48\text{dp}$, підтримка TalkBack.
  ```

  Replace with:

  ```
  - [INV-10] **Accessibility & Target Sizes**: Масштабований текст — AppText: body 16sp, секційні заголовки 20–24sp, таймер 64–72sp; `allowFontScaling=true` з per-role `maxFontSizeMultiplier` до 3.0 (доступний текст досягає 48sp), сенсорні кнопки $\ge 48\times 48\text{dp}$, підтримка TalkBack.
  ```

- No other VISION.md line changes. INV-08 (landscape parity) and all other invariants untouched.

### 2.2 Exact changes required in `src/ui/__tests__/theme.inv10.test.ts`

- **Line 4** (import): drop `MIN_FONT_SP` (it is removed from `theme.ts`), import `fontScaleMax`:
  `import { MIN_TOUCH_DP, fontScaleMax, statusColors, typography } from '../theme';`
- **Lines 33–36** (`it('MIN_FONT_SP and MIN_TOUCH_DP are at least 48'…)`) — **rewrite** to:

  ```ts
  it('MIN_TOUCH_DP stays 48 and body text can reach the old 48sp need via font scaling', () => {
    expect(MIN_TOUCH_DP).toBeGreaterThanOrEqual(48);
    expect(typography.body).toBe(16);
    expect(fontScaleMax.text * typography.body).toBeGreaterThanOrEqual(48); // 16 × 3.0 = 48
  });
  ```

- **Lines 38–42** (`it('every typography token is >= MIN_FONT_SP (48)'…)`) — **rewrite** to the
  amended scale contract:

  ```ts
  it('typography tokens follow the amended INV-10 scale (body 16, titles 20-24, timer 64-72, all 12..72)', () => {
    expect(typography.body).toBe(16);
    expect(typography.title).toBeGreaterThanOrEqual(20);
    expect(typography.title).toBeLessThanOrEqual(24);
    expect(typography.timer).toBeGreaterThanOrEqual(64);
    expect(typography.timer).toBeLessThanOrEqual(72);
    for (const [, size] of Object.entries(typography)) {
      expect(size).toBeGreaterThanOrEqual(12);
      expect(size).toBeLessThanOrEqual(72);
    }
  });
  ```

- **Lines 44–49** (WCAG contrast pairs) and **lines 51–65** (`TapTarget` ≥48) — **unchanged**;
  extend line 44's pair set only if §3 adds new `statusColors` keys (it does not).

### 2.3 Other docs that must be aligned (text/labels only, no logic)

| File | Line | Change |
|---|---|---|
| `scripts/check-invariants.sh` | 64 | Comment only: `# TSC-15: INV-10 Typography >= 48sp…` → `# TSC-15: INV-10 no raw fontSize literals outside theme.ts (amended INV-10)`. **The grep itself (lines 65–70) stays identical** — it bans raw `fontSize: <digit>` outside `theme.ts`, which remains true under the amendment. |
| `scripts/release-apk.sh` | 61 | Release-note line `INV-10: … typography >= 48sp` → `INV-10: scalable text (16sp body, maxFontScale 3.0) + touch targets >= 48dp + TalkBack`. |
| `.agents/skills/ui-designer/SKILL.md` | 3, 36–38, 61, 78, 100, 144, 170 | The skill's "actionable text ≥ 48sp / mark <48sp as BLOCKED" rules are superseded **for this repo** by this amendment. Flagged as a follow-up for the pipeline owner (this stage edits nothing outside `docs/`). Developer/reviewer must treat §2 here as authoritative over those skill lines. |

---

## 3. Design tokens (all in `src/ui/theme.ts` — extend, never fork)

### 3.1 Color palette (semantic, kid-friendly, high contrast — light is normative)

Canonical names keep the repo's existing vocabulary (it *is* the system — `ui-designer` §12 families
are provided as one-line deprecated aliases so both vocabularies resolve to the same values;
`expo-design-system` "Adopt Before You Build": extend in its own idiom, never a second system).

| Token | Value | Contrast | Use |
|---|---|---|---|
| `background` | `#FFFFFF` | — | app background |
| `surface` | `#F9FAFB` | — | inputs, secondary fills, keypad keys |
| `surfaceAlt` | `#F3F4F6` | — | secondary-button bg, idle pill bg, grouped rows |
| `cardBg` | `#FFFFFF` | — | list-card surface |
| `text` | `#111827` | **17.74:1** on bg | primary text |
| `textSecondary` | `#4B5563` | **7.56:1** on bg | secondary text, meta |
| `white` / `textOnAccent` | `#FFFFFF` | 5.17:1 on `primary` | labels on accent/solid fills |
| `primary` | `#2563EB` | **5.17:1** on bg | CTAs, links, focus accent (the one bold color) |
| `active` | `#1D4ED8` | 6.70:1 (white on it) | running-timer state |
| `verified` (success) | `#15803D` | **5.02:1** (white on it) | success/verified state, resume button |
| `awaiting` (warning) | `#92400E` | **7.09:1** (white on it) | awaiting-verification state |
| `abandoned` (danger) | `#DC2626` | **4.83:1** both directions | destructive actions, danger text |
| `idle` | `#6B7280` | 4.83:1 | idle state text |
| `border` | `#E5E7EB` | 1.24:1 — **decorative only** | card hairlines/dividers; never the sole identifier of a control |
| `borderStrong` **(new)** | `#6B7280` | **4.83:1 ≥ 3:1** | boundaries of outlined controls: inputs, keypad keys, unselected day toggles, ghost buttons (WCAG 1.4.11) |
| `divider` **(new)** | `#E5E7EB` | decorative | section separators (alias of `border` value) |
| `dangerBg` **(new)** | `#FEE2E2` | pairs with `dangerText` | error boxes (replaces 4 drifted literals) |
| `dangerText` **(new)** | `#991B1B` | **6.80:1** on `dangerBg` | error text (replaces 3 drifted literals) |
| `warningBg` **(new)** | `#FEF3C7` | pairs with `warningText` | lockout boxes (replaces 2 drifted literals) |
| `warningText` **(new)** | `#92400E` | **6.37:1** on `warningBg` | lockout text (= `awaiting` value) |

`statusColors` (keep exactly as-is — every pair already passes the existing test):
`idle #F3F4F6/#1F2937 (13.34:1)`, `active #1D4ED8/#FFFFFF (6.70:1)`,
`awaiting #92400E/#FFFFFF (7.09:1)`, `verified #15803D/#FFFFFF (5.02:1)`.

Deprecated aliases exported from `theme.ts` (satisfy `ui-designer` §12 vocabulary, zero renames):
`bg=background`, `textPrimary=text`, `textMuted=textSecondary`, `textOnAccent=white`,
`accent=primary`, `accentText=white`, `danger=abandoned`, `success=verified`, `warning=awaiting`.

**Dark mode: optional, not gated in this stage.** If added later, it ships as explicit pairs applied
via `useColorScheme()` at render time (expo-design-system "static-safe vs hook-only" — hook-only for
pairs): `background #111827`, `surface #1F2937`, `surfaceAlt #374151`, `text #F9FAFB`,
`textSecondary #D1D5DB`, `primary #60A5FA`, `border #374151`, `borderStrong #9CA3AF`,
`dangerBg #7F1D1D`, `dangerText #FECACA`, `warningBg #78350F`, `warningText #FDE68A`.
Token *names* above are the contract, so dark can land without renames.

### 3.2 Spacing scale (4-point grid; components use ONLY these keys)

```ts
export const spacing = { xs: 4, sm: 8, s12: 12, md: 16, lg: 24, xl: 32, xxl: 48 } as const;
```

- Required values 4/8/12/16/24 are all present (plus existing 32/48).
- **`s12` is the one documented addition**: expo-design-system — "If the same in-between multiple of
  4 keeps recurring (12 and 20 are common), add it to the scale as a named step." 12dp is the PIN
  keypad gap and card/stepper rhythm mandated by §4. It is size-named, stays inside the spacing
  family (`ui-designer` §12), and creates no drift because the audits grep raw numbers, not names.
- Rules: `gap` before `margin`, `padding` before `margin`, screen gutter from §3.6, no ad-hoc values
  (`13px`/`7px` forbidden — `ui-designer` §2.2).

### 3.3 Radius

```ts
export const radius = { sm: 8, md: 12, lg: 16, full: 9999 } as const;
```

Pair every non-capsule radius with `{ borderCurve: 'continuous' }` (expo-native-ui / expo-design-system).
Replaces raw `borderRadius: 8/12/16/36` literals. Usage: inputs/steppers/day-toggles `md`; cards,
keypad keys, dialogs `lg`; status pills `full`.

### 3.4 Elevation / shadow (CSS `boxShadow` strings only — never legacy shadow/elevation)

```ts
export const shadows = {
  card:    '0 1px 2px rgba(0, 0, 0, 0.05)',
  raised:  '0 4px 12px rgba(0, 0, 0, 0.10)',
  overlay: '0 8px 24px rgba(0, 0, 0, 0.18)',
} as const;
```

Cards: `cardBg` + hairline `border` + `shadows.card`. Pressed buttons: `shadows.raised`.
Abandon dialog: `surface` + `shadows.overlay`. (expo-native-ui Shadows; expo-design-system Shadows.)

### 3.5 Typography scale (the amended INV-10 ramp)

```ts
export const MIN_TOUCH_DP = 48;                     // kept
export const fontScaleMax =                         // per-role maxFontSizeMultiplier
  { text: 3.0, chrome: 2.0, display: 1.5, timer: 1.2 } as const;
export const typography = {
  caption:        12,   // meta, units, stat captions
  body:           16,   // default copy, field labels, button labels
  bodyLarge:      18,   // emphasized body, primary button labels
  title:          20,   // screen titles, card titles
  heading:        24,   // section titles, keypad digits, countdown status
  display:        32,   // stat totals, big numbers
  timer:          64,   // countdown, portrait
  timerLandscape: 72,   // countdown, landscape
} as const;
```

| Name | Size | Weight | `maxFontSizeMultiplier` | Usage |
|---|---|---|---|---|
| `caption` | 12 | 400 | 3.0 (`text`) | units, stat meta, pause-budget hint |
| `body` | 16 | 400 | 3.0 (`text`) — 16×3 = **48sp** | default text everywhere |
| `bodyLarge` | 18 | 600 | 3.0 (`text`) | primary/emphasized labels |
| `title` | 20 | 700 | 2.0 (`chrome`) | screen + card titles |
| `heading` | 24 | 700 | 2.0 (`chrome`) — 24×2 = 48sp | section headers, keypad digits |
| `display` | 32 | 800 | 1.5 (`display`) | stat totals |
| `timer` | 64 | 700 | 1.2 (`timer`) | countdown portrait |
| `timerLandscape` | 72 | 700 | 1.2 (`timer`) | countdown landscape |

- `MIN_FONT_SP` export is **removed** (§2.2). Weight via `fontWeight` strings (no bundled font files
  in this app — expo-design-system typography rule).
- Chrome roles (`title`/`heading`) cap at 2.0 so headers stay ≤2 lines at large accessibility text;
  body roles reach the old 48sp need at 3.0. Never `allowFontScaling={false}` anywhere.

### 3.6 Responsive breakpoints & gutters

New hook `src/ui/hooks/useScreenGutter.ts` (uses `useWindowDimensions` — expo-native-ui:
flexbox + `useWindowDimensions`, never `Dimensions.get`):

| Width | Class | Screen gutter | Columns (lists/forms) | Content max-width |
|---|---|---|---|---|
| 320dp | compact | `spacing.md` (16) | 1 | 100% |
| 366dp | regular | `spacing.lg` (24) | 1 | 100% |
| 413dp | wide | `spacing.lg` (24) | 1 | 100% |
| any, landscape | — | `spacing.xl` (32) | split-screen per §4 | forms/lists 560 centered |

Type sizes do **not** scale per density (predictable + test-stable); density changes gutters,
columns and split layouts only (`ui-designer` §2.5).

### 3.7 Motion

```ts
export const motion = { fast: 150, base: 250, slow: 400 } as const;
```

Press feedback 150ms opacity, state swaps 250ms; no blocking animations; respect reduced-motion
(`ui-designer` §3). No animation library is added in this stage (§7).

---

## 4. Per-screen redesign rules

Legend: every screen keeps its existing `testID`s (`…-layout-portrait` / `…-layout-landscape`).
All colors/spacing/type below resolve through §3 tokens.

### 4.1 PIN gate + keypad — `PinGateScreen.tsx`, `PinPad.tsx` (+ `PinSetupScreen.tsx` = 2 screens)

- **Files changed:** `src/screens/PinGateScreen.tsx`, `src/ui/components/PinPad.tsx`,
  `src/screens/PinSetupScreen.tsx`.
- **Root cause fixed:** giant 56sp header + non-scrolling `space-between` container clipped keypad
  rows at 320dp (§0.2).
- **Layout, portrait (all densities):** row 1 back chip (ghost, `← Назад`); row 2 title
  (`title` 20, centered, ≤2 lines) + subtitle (`body` 16, `textSecondary`); row 3 error/lockout via
  `NoticeBox` (`body` 16, margins `spacing.sm` — not `md` vertical); row 4 **4-dot indicator**
  (4 × 16dp dots, `gap: spacing.md`, filled = `primary`, existing `digitsEntered` a11y label);
  row 5 keypad grid.
- **Keypad spec (the §0.1 fix):** 3 columns × 4 rows, **all 10 digits + ⌫ visible at 320dp with no
  scroll at font scale ≤2**. Key sizing: `flex: 1` per key, **no `maxWidth` cap**, `minHeight: 56`
  (≥48 ✓), `gap: spacing.s12` (12dp, inside the mandated 8–12 range), `radius.lg`, `surface` bg,
  `borderStrong` 1dp outline, digit text `heading` (24). Math: 320 − 2×24 (§3.6 uses lg gutter at
  … gate container keeps `spacing.lg`) → 272 content → (272 − 2×12)/3 = **83dp keys** (366 → 98dp,
  413 → 114dp); vertical budget 4×56 + 3×12 = 260dp + dots/header ≈ 480dp < 640dp viewport.
  Grid keeps `flex: 1` (pinned by `layoutResponsive.test.tsx` line 148) and rows lose `maxHeight:
  110` in favor of `minHeight: 56`; the whole gate content sits in a `ScrollView`
  (`contentContainerStyle` padding/gap, expo-native-ui) so at font scale 3.0 nothing is clipped —
  it scrolls instead.
- **Landscape (INV-08):** keep the existing two-column structure (left: title/subtitle/error/dots,
  right: keypad), type-scaled per §3.5; `pingate-layout-landscape` testID kept.
- **Abandon dialog:** `surface` card, `radius.lg`, `shadows.overlay`; stacked full-width actions —
  `AppButton danger` ("Так, скасувати") over `AppButton secondary` ("Ні"), `gap: spacing.md`.
- **PinSetup:** same `PinPad` + `NoticeBox info` for the no-recovery notice; landscape = centered
  single column `maxWidth 480` inside its existing ScrollView (usable at any rotation; no state
  split — INV-08 satisfied).
- **Skill rules:** `ui-designer` §2.5 ("verify nothing clips at 320dp"), expo-native-ui
  Responsiveness (ScrollView as first child, `contentContainerStyle`), `web-design-guidelines`
  touch-target sizing (keys ≥48dp), amended INV-10 §2.

### 4.2 Today list — `TodayScreen.tsx`, `TaskCard.tsx`

- **Files changed:** `src/screens/TodayScreen.tsx`, `src/ui/components/TaskCard.tsx`.
- **Header ≤ 2 lines:** row 1 = title (`title` 20, `numberOfLines={1}` + `flexShrink: 1` — **kept,
  pinned by `layoutResponsive.test.tsx` lines 119–121**) + parent chip `AppButton secondary size=sm`
  ("Батьки", `🔒` emoji **dropped** — Emoji Iconography slop); row 2 = active badge `StatusChip
  active` ("Іде таймер") only while a session runs, `alignSelf: 'flex-start'`. Container keeps
  `flexWrap: 'wrap'` (test line 125). Total: exactly ≤ 2 lines at every density/font scale ≤2.
- **Cards (`TaskCard`):** `cardBg` + `border` hairline + `shadows.card` + `radius.lg`, padding
  `spacing.md`, list `gap: spacing.sm`. Row 1: user emoji (`body`+`title`) + title (`title` 20,
  `numberOfLines={2}`). Row 2: duration (`body` 16, `textSecondary`) + **`StatusChip`**
  (`statusColors` pill, `full` radius) + trailing `›` (`heading`, `textSecondary`) as the press
  affordance. Whole card remains one `TapTarget` with the existing composite a11y label.
- **CTA:** empty state = muted `body` lines + full-width `AppButton secondary`
  ("Увійти для батьків") — label unchanged (pinned by `todayEmptyCta.test`).
- **Responsive:** 1 column at 320/366/413; gutters per §3.6; **landscape**: list content
  `maxWidth 600`, centered (readable measure — frontend-design line-length guidance),
  `today-layout-landscape` testID kept.
- **Skill rules:** expo-design-system Self-Critique (hierarchy via type ramp, not ad-hoc sizes),
  frontend-design (one bold element = the accent CTA state; no decorative chrome).

### 4.3 Timer — `TimerScreen.tsx` (+ `ProgressBar.tsx`)

- **Files changed:** `src/screens/TimerScreen.tsx`, `src/ui/components/ProgressBar.tsx`.
- **Root cause fixed:** `minWidth: 140` × 2 + 16 gap = 296 > 288dp content at 320 (§0.3) — replaced
  by a flex bottom action row.
- **Portrait structure:** (1) `ScreenTopBar` — back chip + task title (`title` 20,
  `numberOfLines={1}`); (2) optional `NoticeBox error` under it; (3) `flex: 1` display zone,
  vertically centered: countdown `timer` (64, `fontScaleMax.timer`, `tabular-nums`,
  `textAlign: 'center'`) + `ProgressBar` at `width: '100%'`, height `spacing.md` (16),
  `radius.sm`; (4) **bottom action row**: `flexDirection: 'row'`, `gap: spacing.s12`,
  `paddingVertical: spacing.lg`, gutter §3.6 — `AppButton size=lg flex:1` (Pause = `primary` /
  Resume = `success`) + `AppButton size=lg flex:1 secondary` ("+5 хв"). **No `minWidth`.**
  Math at 320: (288 − 12)/2 = **138dp per button**, labels at `bodyLarge` (18) fit
  ("Продовжити" ≈ 90dp). Pause-budget hint: `caption`/`textSecondary`, centered, above the row.
- **States:** Completed → `heading` `awaiting` text + full-width `AppButton primary` in the bottom
  action row ("Показати батькам" — keeps thumb-zone reach); Verified → solid `statusColors.verified`
  box, `heading` white text, centered; running → `active` accents. Resume button uses `verified`
  green (white 5.02:1) — the drifted `#059669` (3.77:1, fails AA) and `#4B5563` literals die here.
- **Landscape (INV-08):** two columns — left: `timerLandscape` (72) + progress; right: state box +
  the same action row (row of two `flex: 1` buttons, or stacked full-width when the column < 260dp);
  `timer-layout-landscape` testID kept.
- **Skill rules:** ui-designer §5 worked example (countdown = `display` step, compact chrome,
  bottom-row controls), expo-native-ui Behavior (a11y announcements untouched), frontend-design
  (one bold moment = the countdown; controls quiet).

### 4.4 Task edit — `TaskEditScreen.tsx`

- **Files changed:** `src/screens/TaskEditScreen.tsx`.
- **Top bar → wrapping stack (2 rows):** `ScreenTopBar` with `testID="taskedit-topbar"`,
  `flexWrap: 'wrap'` (pinned, test lines 91–93). **Row A:** back/cancel ghost chip + screen title
  (`title` 20, `numberOfLines={1}`, `flex: 1, minWidth: 0, flexShrink: 1`). **Row B:** full-width
  primary action — `AppButton primary` "Зберегти" with `flexBasis: '100%'` (pinned, test lines 88–89).
  Primary action therefore lives in the top region and **can never sit under the keyboard**
  (expo-native-ui: "A form's primary action must never sit under the keyboard").
- **Stacked form:** `ScrollView` (`contentContainerStyle` gutter+`gap: spacing.lg`,
  `keyboardShouldPersistTaps="handled"` — expo-native-ui). Fields stacked vertically: label
  (`body`, `textSecondary`) over `TextInput` (`minHeight: 56`, `radius.md`, `surface` bg,
  `borderStrong` 1dp, `fontSize: typography.body` — **token reference, never a literal** so TSC-15
  stays green).
- **Stepper:** 4 `TapTarget`s at 48×48 (`radius.md`, `borderStrong`) + value display (`heading`),
  row keeps `flexWrap: 'wrap'` (pinned, test line 96), `gap: spacing.s12`.
- **Weekday toggles:** 7 × ≥48dp, `flexWrap: 'wrap'` (pinned, test line 100); selected =
  `primary` bg/white text, unselected = `surface` + `borderStrong`. At 320: 7×48 wraps to 2 rows.
- **Bottom:** danger zone after a `divider` — full-width `AppButton danger` (Видалити) or
  `AppButton secondary` (Архівувати), `marginTop: spacing.xl`.
- **Responsive:** form `maxWidth 560` centered at ≥366 and in landscape (forms shouldn't stretch
  across 720dp); 100% width at 320. **Landscape:** same stack, gutter `xl`.
- **Skill rules:** expo-design-system component contract (buttons via variants, style override
  last), web-design-guidelines form/label/keyboard rules, ui-designer §2.5.

### 4.5 Task list (management) — `TaskListEditScreen.tsx`

- **Files changed:** `src/screens/TaskListEditScreen.tsx`.
- **Top bar:** `ScreenTopBar` `testID="tasklistedit-topbar"`, title `testID="tasklistedit-title"`
  `numberOfLines={1}` (both pinned, test lines 68–73); Row B = full-width `AppButton primary`
  "+ Додати завдання" with `flexBasis: '100%'` (pinned, test line 66).
- **Rows:** card (`cardBg`, `border` hairline, `shadows.card`, `radius.md`, `gap: spacing.md`):
  info column (title `title` 20 + duration `caption`) over an actions row — `▲▼` reorder
  `TapTarget`s 48×48 (`surface`/`borderStrong`) + `AppButton ghost size=sm` "Редагувати".
  Actions row `flexWrap: 'wrap'`, `gap: spacing.sm` so it reflows at 320 instead of clipping.
- **Responsive:** 1 column all densities; gutter §3.6; landscape list `maxWidth 600` centered.
- **Skill rules:** ui-designer §2.5 table, expo-native-ui (list is the scroll container — no outer
  ScrollView), expo-design-system (promote to shared button, not per-screen copies).

### 4.6 Parent home — `ParentHomeScreen.tsx`

- **Files changed:** `src/screens/ParentHomeScreen.tsx`.
- **Header ≤ 2 lines:** row 1 title (`title` 20, `numberOfLines={1}`) + exit chip
  `AppButton ghost size=sm` (danger text); container `flexWrap: 'wrap'` (already).
- **Nav:** replaces the 3 wrapping chips with a **stacked column of 3 full-width
  `AppButton secondary size=lg`** (Керування завданнями / Статистика / Змінити PIN-код) —
  deterministic at 320dp where the longest label ("Керування завданнями") would otherwise wrap
  awkwardly; column also becomes the left column in landscape.
- **Change-PIN box:** `surface` card `radius.lg`; lockout/error via `NoticeBox warning/error`
  (kills the `#FEF3C7`/`#991B1B` raw literals); restyled `PinPad` (§4.1).
- **Awaiting list:** section title `heading` (24); item cards (`radius.md`, hairline): task title
  row, then actions row — `AppButton primary size=md flex:1` ("Перевірити") +
  `AppButton secondary size=md flex:1` (danger-tinted label "Скасувати сесію"), `gap: spacing.s12`,
  `flexWrap: 'wrap'` fallback. At 320: (272−12)/2 = 130dp each — 16sp labels fit.
  Empty state: centered `body` `textSecondary` ("Немає сесій…").
- **Landscape (INV-08):** two columns — left: header + nav column + change-PIN box; right: awaiting
  list (own scroll). `parent-home-layout-landscape` testID kept.
- **Skill rules:** expo-native-ui Behavior (four states: empty/loading/content covered), frontend-design
  (action names identical across flow: "Перевірити" everywhere), ui-designer §2.5.

### 4.7 Stats — `StatsScreen.tsx` (+ `StatBar.tsx`)

- **Files changed:** `src/screens/StatsScreen.tsx`, `src/ui/components/StatBar.tsx`.
- **Top bar:** `ScreenTopBar` back + "Статистика" (`title` 20).
- **Totals:** 2 cards in a row (`flex: 1`, `gap: spacing.md`, `surface`, `radius.lg`, hairline):
  label `body` `textSecondary` centered + value `display` (32) `primary`,
  `{ fontVariant: 'tabular-nums' }` (expo-native-ui Text Styling).
- **`StatBar`:** label (`body` 16) + value (`body` `textSecondary`, `tabular-nums`) in a row that
  keeps `flexWrap: 'wrap'` + `rowGap: spacing.xs` (new — survives 320dp + font scale 2); track
  height `spacing.md`, `radius.sm`, fill `verified`; existing composed a11y label unchanged.
- **Per-task rows:** title `body` `flex: 1` + minutes `body` `textSecondary`; row stays one line with
  `flexShrink` (no clip).
- **Responsive:** portrait 1 column (existing); totals always 2-up (`flex: 1` → 138dp each at
  320 — fits); **landscape keeps the existing 2-column split** (left totals+days, right per-task),
  gutter `xl`, `stats-layout-landscape` testID kept; loading/empty centered states unchanged.
- **Skill rules:** expo-native-ui (tabular numerals, four states), frontend-design (structural =
  informative: bars encode data, no decoration), ui-designer §2.5.

*(Screen count: PinGate, PinSetup, Today, Timer, TaskEdit, TaskListEdit, ParentHome, Stats = **8**.)*

---

## 5. Component inventory (variants + prop signatures)

### 5.1 Existing components — extended

| Component | File | Changes | Prop signature (final) |
|---|---|---|---|
| `AppText` | `src/ui/components/AppText.tsx` | New variant set (§3.5); applies per-role `maxFontSizeMultiplier` from `fontScaleMax`; color still overridable by `style` | `AppTextProps = TextProps & { variant?: 'caption'\|'body'\|'bodyLarge'\|'title'\|'heading'\|'display'\|'timer'\|'timerLandscape'; maxFontSizeMultiplier?: number; allowFontScaling?: boolean /* default true */ }` |
| `TapTarget` | `src/ui/components/TapTarget.tsx` | Add `size`; floor 48 kept; pressed feedback required by callers' style functions | `TapTargetProps = Omit<PressableProps,'accessibilityRole'\|'accessibilityLabel'> & { accessibilityLabel: string; accessibilityRole: 'button'\|'link'\|'tab'; size?: 'sm'\|'md'\|'lg'; /* sm=48, md=56, lg=64 minHeight */ disabled?: boolean; style?: StyleProp<ViewStyle> \| ((s:{pressed:boolean})=>…) }` |
| `PinPad` | `src/ui/components/PinPad.tsx` | Restyled per §4.1: keys 56dp, gap `s12`, `radius.lg`, `borderStrong`, digits `heading`; rows lose `maxHeight:110`, keys lose `maxWidth:96`; **public API unchanged** | `{ onComplete: (pin:string)=>void; disabled?: boolean; value?: string; onChange?: (pin:string)=>void }` |
| `TaskCard` | `src/ui/components/TaskCard.tsx` | §4.2 layout: 2-line title, `StatusChip`, trailing `›`, `shadows.card` | `{ task: TodayTaskView; onPress: ()=>void; disabled?: boolean }` (unchanged) |
| `ProgressBar` | `src/ui/components/ProgressBar.tsx` | Tokenize radius (`radius.sm`), height = `spacing.md`, fill `primary` | `{ total: number; elapsed: number; style?: StyleProp<ViewStyle> }` (unchanged) |
| `StatBar` | `src/ui/components/StatBar.tsx` | §4.7: wrap-safe label row, `tabular-nums` | unchanged props |
| `ErrorBoundary` | `src/ui/components/ErrorBoundary.tsx` | Text variants only (`title`/`body`), buttons → `AppButton` | unchanged props |

### 5.2 New shared components (each already exists ≥2× in screens — promotion rule satisfied;
expo-design-system "When to extract": nameable role, API smaller than implementation)

1. **`AppButton`** — `src/ui/components/AppButton.tsx`
   ```ts
   interface AppButtonProps {
     label: string;
     variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'; // default 'primary'
     size?: 'sm' | 'md' | 'lg';        // minHeight 48 / 56 / 64, token paddings, default 'md'
     onPress: () => void;
     disabled?: boolean;
     loading?: boolean;                 // spinner keeps the a11y label
     fullWidth?: boolean;               // default true for md/lg in stacks
     style?: StyleProp<ViewStyle>;      // merged LAST (layout override only)
   }
   ```
   States × tokens: default (`primary`→`primary`/white, `secondary`→`surfaceAlt`/`text` +
   `borderStrong`, `ghost`→transparent/`primary`, `danger`→transparent/`abandoned` +
   `borderStrong`, `success`→`verified`/white) · pressed (opacity 0.85 + `shadows.raised`,
   `motion.fast`) · disabled (opacity 0.4) · loading (`ActivityIndicator`, label retained for
   TalkBack). Label text = `bodyLarge` (`fontScaleMax.text`). Replaces ~15 ad-hoc
   `TapTarget`+inline-style buttons across screens.
2. **`ScreenTopBar`** — `src/ui/components/ScreenTopBar.tsx`
   ```ts
   interface ScreenTopBarProps {
     onBack?: () => void; backLabel?: string;   // default uk.timer.back
     title?: string;                             // optional (PinGate uses back-only row)
     actions?: React.ReactNode;                  // renders Row B, flexBasis '100%'
     testID?: string; titleTestID?: string;      // preserves pinned test IDs
   }
   ```
   Container `flexDirection:'row'`, `flexWrap:'wrap'`, `rowGap/columnGap: spacing.sm`; Row A =
   back `TapTarget size=sm` + title (`title`, `numberOfLines={1}`, `flex:1,minWidth:0,flexShrink:1`).
   Used by Timer, TaskEdit, TaskListEdit, Stats, (PinGate back-only).
3. **`StatusChip`** — `src/ui/components/StatusChip.tsx`
   ```ts
   interface StatusChipProps {
     status: 'idle' | 'active' | 'awaiting' | 'verified';
     label?: string;              // default uk.status[status]
     size?: 'sm' | 'md';          // padding tokens, radius.full
   }
   ```
   Renders `statusColors[status]` pill, `body` text `fontWeight: '600'`. Used by TaskCard, Today
   active badge, (optional) Timer state.
4. **`NoticeBox`** — `src/ui/components/NoticeBox.tsx`
   ```ts
   interface NoticeBoxProps {
     tone: 'error' | 'warning' | 'info';
     message: string;             // rendered as AppText body, selectable for errors
     testID?: string;
   }
   ```
   error → `dangerBg`/`dangerText`; warning → `warningBg`/`warningText`; info → `surface`/
   `textSecondary`; padding `spacing.md`, `radius.md`, margins `spacing.sm`. Kills all 10 drifted
   hex literals in one place (PinGate ×2 boxes, PinSetup, Today, Timer, TaskEdit, ParentHome ×2).

No other components are promoted this stage (ui-designer §2.4: variants only where a real screen
needs them; wrong abstractions cost more than duplication).

---

## 6. Acceptance criteria (TSC-style; every row is a command the reviewer/tester runs)

| # | Criterion | Verify |
|---|---|---|
| 1 | INV-10 amended in VISION.md (scalable text wording, no «Мін. розмір шрифту 48sp») | `grep -n 'INV-10' VISION.md` → line shows 16sp/20–24sp/64–72sp/maxFontSizeMultiplier 3.0 + 48dp + TalkBack; `grep -c 'Мін. розмір шрифту 48sp' VISION.md` → `0` |
| 2 | INV-10 test rewritten per §2.2 (48dp floor kept, scaling reaches 48sp) | `npx jest src/ui/__tests__/theme.inv10.test.ts` → all PASS (incl. `fontScaleMax.text * typography.body >= 48`, body==16, timer 64–72, contrast pairs, TapTarget ≥48) |
| 3 | `MIN_FONT_SP` removed, `fontScaleMax` + new tokens exported | `grep -rn 'MIN_FONT_SP' src/ scripts/` → no hits; `grep -n 'fontScaleMax' src/ui/theme.ts` → 1 hit |
| 4 | Strict TypeScript gate | `npm run typecheck` → exit 0 (TSC-2) |
| 5 | Full unit suite green (layout pins intact: `flexBasis '100%'`, `flexWrap 'wrap'`, `numberOfLines 1`, PinPad `flex:1`, keys ≥48) | `npm test` → exit 0 |
| 6 | Invariant script passes (TSC-15/TSC-16 comment updated, logic untouched) | `npm run check:invariants` → every check `PASS` or `SKIP`, zero `FAIL` |
| 7 | Zero raw hex outside theme.ts | `grep -rnE '#[0-9a-fA-F]{3,8}' src/ \| grep -v 'src/ui/theme.ts'` → no output |
| 8 | Zero numeric `fontSize` outside theme.ts (token refs like `fontSize: typography.body` are OK) | `grep -rnE 'fontSize:\s*[0-9]' src/ App.tsx \| grep -v 'src/ui/theme.ts'` → no output |
| 9 | Zero raw padding/margin numbers | `grep -rnE '(padding\|margin)(Horizontal\|Vertical)?:\s*[0-9]+' src/` → no output |
| 10 | Zero raw radius/layout literals that §3 tokenized | `grep -rnE 'borderRadius:\s*[0-9]' src/ \| grep -v 'src/ui/theme.ts'` → no output |
| 11 | All touch targets ≥48dp (component-level) | `npx jest src/ui/__tests__/theme.inv10.test.ts src/screens/__tests__/layoutResponsive.test.tsx` → PASS (TapTarget 48, all 10 PinPad keys ≥48) |
| 12 | PIN keypad: all 10 digits + ⌫ visible at 320dp, keys ≥48dp, 4-dot indicator | with emulator at 320dp: `adb exec-out screencap -p > docs/design/pin-after-320.png` → visual: 11 keys + 4 dots fully on screen; repeat `-366`, `-413` |
| 13 | Timer bottom action row: both controls ≥48dp, no horizontal clip at 320dp | `adb exec-out screencap -p > docs/design/timer-after-320.png` → both buttons fully visible (no cut edge); repeat 366/413 |
| 14 | Today header ≤2 lines, cards show state chips at all densities | `adb exec-out screencap -p > docs/design/today-after-{320,366,413}.png` → header = title row (+badge row when running), never 3+ lines |
| 15 | Forms (TaskEdit/TaskListEdit) stack, full-width primary in actions row, nothing clipped at 320 | `adb exec-out screencap -p > docs/design/taskedit-after-320.png` + `tasklist-after-320.png` → Save/Add full-width, stepper/weekday rows wrapped not clipped |
| 16 | Landscape parity (INV-08): all five layout testIDs render | `grep -rc 'layout-landscape' src/screens/*.tsx` → ≥5 (PinGate, Today, Timer, ParentHome, Stats); emulator rotation screenshots `docs/design/*-landscape.png` for pin/timer/today/parent/stats |
| 17 | Large-text smoke: at OS font scale 2.0 all controls remain reachable (scroll, never clip) | `adb shell settings put system font_scale 2.0` → screenshot pin+today+timer → no clipped touch target; restore `adb shell settings put system font_scale 1.0` |
| 18 | Full 3-density after-set exists for review | `ls docs/design/*-after-{320,366,413}.png \| wc -l` → ≥18 (6 flows × 3 densities) plus ≥5 landscape shots |
| 19 | TalkBack contracts intact (labels/roles/announcements unchanged) | `npm test` → `pinGateVerifyErrors`, `todayEmptyCta`, `timerTicks`, `parentHomeLockState`, `statsSessionTouch` all PASS |
| 20 | Release/invariant texts aligned with amended INV-10 | `grep -n '48sp' scripts/release-apk.sh scripts/check-invariants.sh` → no stale `>= 48sp` claims (comment line 64 reworded) |

---

## 7. Out of scope

- **No navigation changes** — `RootNavigator`, routes, guards, screen set, testIDs all unchanged.
- **No data-model changes** — `expo-sqlite` schema, stores, domain logic, validation, i18n **keys**
  (no new `uk.ts` strings; existing labels are reused verbatim).
- **No new dependencies** — nothing beyond packages already present; `@expo/vector-icons` is absent
  and must NOT be added (iconography stays text + standard glyphs `← ⌫ ▲ ▼ ›`).
- **No animation library / rework** — `motion` tokens only; expo-animation integration is a later stage.
- **No dark-mode implementation** — token names reserve it (§3.1); not acceptance-gated here.
- **No changes to `src/ui/__tests__/theme.inv10.test.ts` semantics beyond §2.2**, no changes to other
  tests except where a style *value* they don't assert happens to change (behavior assertions stay).
- **No editing of VISION.md beyond line 53** (§2.1); no skill-file edits this stage (§2.3 flags the
  `ui-designer` SKILL.md follow-up for the owner).

---

## 8. Implementation order (for the developer agent)

1. `theme.ts`: add tokens (§3), remove `MIN_FONT_SP`, new `typography`, `fontScaleMax`, `radius`,
   `shadows`, `motion`, `spacing.s12`, color additions + deprecated aliases.
2. Base components: `AppText` (variants + max-scale), `TapTarget` (`size`).
3. New components: `AppButton`, `ScreenTopBar`, `StatusChip`, `NoticeBox`.
4. Restyle: `PinPad`, `TaskCard`, `ProgressBar`, `StatBar`.
5. Screens in order: PinGate/PinSetup → Today → Timer → TaskEdit → TaskListEdit → ParentHome → Stats.
6. Rewrite `theme.inv10.test.ts` per §2.2; update `VISION.md:53`, the two script strings (§2.3).
7. Run §6 rows 1–11 + 19–20 locally; tester captures §6 rows 12–18 (3 densities + landscape).
8. Hand reviewer the three drift probes (§6 rows 7–10) — done means **zero hits outside `theme.ts`**
   (ui-designer §11).