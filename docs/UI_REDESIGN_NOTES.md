# UI Redesign — Implementation Notes (developer stage 2)

Implements `docs/UI_REDESIGN_SPEC.md` on `feat/ui-redesign` (baseline `main @ 85f762c`).
Everything not listed here follows the spec literally. Interpretations and the two
necessary deviations are documented below (task brief: "if anything is ambiguous,
the spec wins, document interpretations in docs/UI_REDESIGN_NOTES.md").

## 1. INV-10 amendment (spec §2) — applied exactly

- `VISION.md:53` replaced with the exact §2.1 wording; no other VISION.md line touched.
- `src/ui/__tests__/theme.inv10.test.ts` rewritten per §2.2 verbatim (RED first:
  `docs/evidence/inv10-red.log` → `docs/evidence/inv10-green.log`).
- `MIN_FONT_SP` fully removed; `grep -rn 'MIN_FONT_SP' src/ scripts/` = 0 hits;
  `grep -c 'fontScaleMax' src/ui/theme.ts` = **1** (acceptance row 3).
- `scripts/check-invariants.sh:64` — **comment reworded only** (authorized by §2.3);
  the TSC-15 grep itself (lines 65–70) is untouched.
- `scripts/release-apk.sh` release-note line reworded per §2.3 (no stale `>= 48sp`
  claim remains: `grep -n '48sp' scripts/*.sh` → no output).

## 2. Deviation (necessary): `src/ui/__tests__/a11y.inv10.test.tsx` rule 3 amended

Spec §7 says no changes to other tests, but that test asserted **"every Text
fontSize >= 48"** — the literal-48sp rule §2 explicitly deletes — so §6 row 5
(`npm test` exit 0) is unreachable without touching it. Amended to the §2
contract: fontSize within 12..72, `allowFontScaling !== false`, and body-size
roles (16/18) must satisfy `maxFontSizeMultiplier * fontSize >= 48`.
Everything else in that file (pressable label/role, 48x48dp flattening) unchanged.

## 3. Interpretations

- **ScreenTopBar `actions`**: the component clones its `actions` children to add
  `flexBasis: '100%'`, so Row B is full-width no matter what the caller passes
  (keeps the `layoutResponsive` pin on the Save/Add buttons).
- **AppButton has one label** (spec §5.2 contract: `label` is both visible text and
  a11y label; `style` overrides layout only, never colors):
  - TaskListEdit "+ Додати завдання" renders **without the decorative "+"** so the
    a11y label stays exactly `uk.taskCrud.addTask` (pinned by `layoutResponsive`).
  - TaskListEdit "Редагувати" and ParentHome "Перевірити"/"Скасувати сесію" drop
    the old `: <task title>` suffix of their composite labels — required by the
    AppButton contract §5.2/§4.5/§4.6. Reorder `▲▼` `TapTarget`s **keep** their
    composite labels. Trade-off noted for the reviewer.
  - "ghost + danger text" (ParentHome exit) and "secondary with danger-tinted
    label" (abandon session) are rendered with the **`danger` variant** — the
    danger-tinted member of the fixed variant set. Colors cannot be overridden
    through `style` per §5.2.
- **StatusChip default labels** reuse existing uk keys (`active → uk.today.active`,
  `awaiting → uk.timer.awaiting`, `idle/verified → uk.status.*`). **No `uk.ts`
  changes at all** (spec §7: no new strings; verified — only pre-existing
  namespaces `uk.*` are referenced and `tsc` validates them).
- **PinGate landscape dots**: the 4-dot indicator stays inside `PinPad` (right
  column above the keypad). Moving it to the left column would require changing
  `PinPad`'s public API (forbidden by §5.1) or duplicating the `digitsEntered`
  a11y node. Portrait order matches §4.1 exactly: back chip → title/subtitle →
  notice → dots → keypad.
- **Timer action row** inherits the horizontal gutter from the screen container;
  the row itself carries `paddingVertical: spacing.lg` + `gap: spacing.s12` —
  visually identical to §4.3's "row + gutter" wording.
- **NoticeBox** renders the first sentence of a message as its own nested `Text`
  node so legacy behavior queries (`verifyFlow` looks up `Невірний PIN-код`
  alone) and full-message queries (`pinGateVerifyErrors`) both keep matching the
  pre-existing nested-Text rendering.
- **StatusChip pill is not `accessible`** — its text is read directly by TalkBack
  and the owning control (TaskCard) keeps the composite label; otherwise
  `verifyFlow`'s `getByLabelText(/Перевірено/)` matches two nodes.
- **Additions beyond the spec's token block** (all inside `theme.ts` /
  hook file, zero new deps): `typographyWeights` + `typographyScaleRole` maps
  (§3.5 weight column and per-role `fontScaleMax` selection), `CONTENT_MAX_WIDTH`
  + `useScreenGutter()` (§3.6 breakpoint table, `useWindowDimensions` via the
  same namespace access `useOrientation` uses so `landscapeParity`'s spy applies).

## 4. Script changes (authorized list)

| File | Line | Change |
|---|---|---|
| `scripts/check-invariants.sh` | 64 | Comment reworded only (§2.3). Grep logic untouched. |
| `scripts/release-apk.sh` | 61 | INV-10 release-note line reworded (§2.3). |

## 5. Tests & evidence

- RED: `docs/evidence/inv10-red.log` (2 failed/4), `docs/evidence/ui-redesign-red.log`
  (suite failed: components did not exist yet).
- GREEN: `docs/evidence/inv10-green.log` (4 passed), `docs/evidence/ui-redesign-green.log`
  (5 passed), `docs/evidence/ui-redesign-invariants.log` (all PASS/SKIP).
- New: `src/screens/__tests__/uiRedesignLayout.test.tsx` — render/layout pins per
  spec §6 rows 2/5/11/13 (AppText scaling roles, PinPad keys uncapped ≥48dp,
  AppButton/NoticeBox/StatusChip tokens, Timer action row without `minWidth: 140`).

## 6. Not done here (other agents/stages)

- Emulator screenshots / §6 rows 12–18 and 17 (3 densities, landscape, font scale 2.0)
  belong to the tester agent.
- `.agents/skills/ui-designer/SKILL.md` 48sp lines: flagged as owner follow-up (§2.3).
- `docs/IMPLEMENTATION_PLAN.md` AS-11/section-D still describe the old 48sp rule —
  spec §7 does not authorize changing that file; flagging it here for the owner.
- `.agents/` remains untracked (not this stage's artifact); the spec
  `docs/UI_REDESIGN_SPEC.md` is committed with this stage so the branch is
  self-contained.