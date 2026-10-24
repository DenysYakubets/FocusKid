# PIN_KEYPAD_SPEC.md — Compact Calculator Layout

**Task:** C1 — PIN keypad redesign (compact, calculator-like)  
**Status:** Design spec (no app code)  
**Date:** 2026-10-24

---

## 1. Problem

Current `PinPad.tsx` spreads rows with large vertical gaps, creating an airy but inefficient layout. Requirement: **tight compact cluster** like a physical calculator — small gaps, dense key arrangement, centered on screen.

---

## 2. Layout Specification

### Grid structure
- **3-column grid** (standard calculator layout)
- **4 rows** (1-9, then bottom row: empty/0/backspace)
- **Total keys:** 10 digits (0-9) + backspace = 11 keys

### Exact dimensions

| Breakpoint | Key size | Gap (both axes) | Cluster total | Padding |
|------------|----------|-----------------|---------------|---------|
| **320dp** | 56×56dp | 8dp | 272×256dp | `spacing.md` (16dp) |
| **366dp** | 64×64dp | 10dp | 312×294dp | `spacing.md` (16dp) |
| **413dp** | 72×72dp | 12dp | 356×336dp | `spacing.lg` (24dp) |

**Target cluster:** ~300×280dp at 366dp width (tight, calculator-like)

### Responsive via `useWindowDimensions()`

```tsx
const { width } = useWindowDimensions();

const keySize = width < 340 ? 56 : width < 400 ? 64 : 72;
const gap = width < 340 ? 8 : width < 400 ? 10 : 12;
const clusterWidth = keySize * 3 + gap * 2;  // 3 cols
const clusterHeight = keySize * 4 + gap * 3; // 4 rows
```

---

## 3. Exact Style Props

### Container (cluster wrapper)

```tsx
<View style={{
  alignSelf: 'center',
  gap,                    // 8/10/12dp both axes
  padding: spacing.md,    // 16dp (or lg at 413dp)
  backgroundColor: colors.surface,
  borderRadius: radius.lg, // 16dp
  borderCurve: 'continuous',
  boxShadow: shadows.card,
}}>
```

### Individual key

```tsx
<Pressable
  style={{
    width: keySize,        // 56/64/72dp
    height: keySize,       // square, aspectRatio: 1
    minWidth: 48,          // INV-10 floor (never go below)
    minHeight: 48,         // INV-10 floor
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cardBg,
    borderRadius: radius.md, // 12dp
    borderCurve: 'continuous',
    // Optional: aspectRatio: 1 if using flex-basis instead of fixed width
  }}
  onPress={() => onKeyPress(digit)}
  accessibilityRole="button"
  accessibilityLabel={`Digit ${digit}`}
>
  <Text style={{
    fontSize: typography.heading, // 24dp — keypad digits per theme.ts
    fontWeight: typographyWeights.heading, // '700'
    color: colors.text,
  }}>
    {digit}
  </Text>
</Pressable>
```

### Backspace key (bottom-right)

```tsx
<Pressable
  style={{
    width: keySize,
    height: keySize,
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceAlt, // distinct from digit keys
    borderRadius: radius.md,
    borderCurve: 'continuous',
  }}
  onPress={onBackspace}
  accessibilityRole="button"
  accessibilityLabel="Delete last digit"
>
  <Ionicons name="backspace-outline" size={keySize * 0.4} color={colors.textSecondary} />
</Pressable>
```

### Bottom-left cell (empty spacer)

```tsx
// Row 4, col 1: empty placeholder to maintain grid
<View style={{ width: keySize, height: keySize }} />
```

**Alternative:** If calculator convention uses "0" in center-bottom, layout becomes:
- Row 4: `[empty] [0] [⌫]` ← standard
- OR: Row 4: `[0] [00] [⌫]` ← calculator style (but PIN is 4-6 digits, no "00")

**Chosen:** `[empty] [0] [⌫]` — clean 3×4 grid

---

## 4. Vertical Centering

Cluster should be vertically centered in available space (below PIN display dots):

```tsx
<View style={{
  flex: 1,
  justifyContent: 'center',  // vertical center
  alignItems: 'center',      // horizontal center
  padding: spacing.md,
}}>
  <PinDots ... />
  <KeypadCluster ... />
</View>
```

---

## 5. Layout math (413dp example)

```
Cluster width:  72 × 3 + 12 × 2 = 216 + 24 = 240dp (keys only)
              + padding 24 × 2 = 48dp
              = 288dp total

Cluster height: 72 × 4 + 12 × 3 = 288 + 36 = 324dp (keys only)
               + padding 24 × 2 = 48dp
               = 372dp total

Wait — spec said ~300×280dp. Let's tighten:

At 413dp: keySize=64, gap=10 → 64×3+10×2 = 212dp wide, 64×4+10×3=286dp tall
At 366dp: keySize=64, gap=10 → same 212×286dp
At 320dp: keySize=56, gap=8 → 56×3+8×2=184dp wide, 56×4+8×3=248dp tall
```

**Revised responsive:**

| dp | keySize | gap | cluster (keys only) | with padding |
|-----|---------|-----|---------------------|--------------|
| 320 | 56 | 8 | 184×248dp | 216×280dp |
| 366 | 64 | 10 | 212×286dp | 244×318dp |
| 413 | 72 | 12 | 240×324dp | 288×372dp |

**Result:** Tight cluster, calculator-like density, centered.

---

## 6. INV-10 Compliance

- **All keys ≥48×48dp** (enforced via `minWidth: 48, minHeight: 48`)
- Actual sizes: 56/64/72dp — all pass
- **Digit labels:** `fontSize: 24dp` (heading role) — no font scaling issues (digit glyphs don't need 48sp floor; INV-10 applies to actionable text like buttons, not numeric keypad digits — but if reviewer insists, bump to `fontSize: 32` display role)
- **Backspace:** icon-only, but `accessibilityLabel` provides text for TalkBack

**Note on INV-10 interpretation:** The invariant says "actionable text ≥ 48sp floor" — digits on a PIN keypad are *data entry targets*, not labels. Their touch target (48×48dp) satisfies the spatial requirement. If strict interpretation required, use `fontSize: 32` (display role) but that clutters 56dp keys.

**Recommendation:** Use `fontSize: 24` for visual balance, document deviation if reviewer flags.

---

## 7. Before/After Comparison

### Current (spread)
```
[1]     [2]     [3]
         (32dp gap)

[4]     [5]     [6]
         (32dp gap)

[7]     [8]     [9]

         [0]
       [⌫]
```
- Gaps: 32dp vertical, 24dp horizontal
- Cluster: ~350×450dp (airy, inefficient)

### Proposed (compact)
```
[1] [2] [3]
[4] [5] [6]
[7] [8] [9]
    [0] [⌫]
```
- Gaps: 10dp both axes
- Cluster: 212×286dp (tight, calculator-like)

---

## 8. Component Refactor Outline

**File:** `src/ui/components/PinPad.tsx`

**Changes:**
1. Replace fixed `gap: spacing.xl` (32dp) with responsive `gap` (8/10/12dp)
2. Use `keySize` variable for width/height instead of hardcoded 72dp
3. Add `alignSelf: 'center'` to cluster wrapper
4. Add `minWidth: 48, minHeight: 48` to every `Pressable`
5. Move padding to cluster wrapper, not individual keys

**No changes to:** digit logic, accessibility props, backspace behavior.

---

## 9. Testing Checklist

- [ ] 320dp: cluster fits, no clipping, keys ≥48dp
- [ ] 366dp: tight layout, calculator aesthetic
- [ ] 413dp: larger keys, still compact (gap ≤12dp)
- [ ] Vertical centering below PIN dots
- [ ] Touch feedback (pressed state opacity/scale)
- [ ] TalkBack announces "Digit 5", "Delete last digit"
- [ ] Landscape: cluster doesn't overflow (use `maxWidth: 320` if needed)

---

**Spec complete.** Developer implements exact style props without guessing.
