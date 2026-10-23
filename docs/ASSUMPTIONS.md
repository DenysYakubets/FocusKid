# FocusKid — Assumptions & interpretations (build stage)

Plan = `docs/IMPLEMENTATION_PLAN.md`. Where a stage was ambiguous, the interpretation below was
chosen and applied (yolo mode: proceed, don't block). Product-owner glance welcome in review.

- **AS-A (Stage 1 vs 2 overlap):** Stage 1's file table says the placeholder `App.tsx` renders
  `AppText`, but `AppText.tsx`/`theme.ts` are listed as Stage 2 files. Interpretation: Stage 1
  creates a minimal `src/ui/theme.ts` (typography tokens ≥ 48sp) and
  `src/ui/components/AppText.tsx`; Stage 2 extends them to the full spec (timer tokens, status
  colors, `TapTarget` etc.). No raw `fontSize` anywhere.
- **Git flow:** the pipeline uses a single branch `feat/focuskid-app` with one commit per stage
  (plus the plan commit), instead of the plan's per-stage `feat/stage-N-*` branches/PRs, per the
  orchestrating task's hard requirements. Push happens once at the end, no force.
- **Stage dependency pre-install:** Stage 2's navigation dependencies
  (`@react-navigation/native`, `@react-navigation/native-stack`, `react-native-screens`,
  `react-native-safe-area-context`) were installed during bootstrap (all are listed for Stage 2
  in the plan; no unlisted dependency was ever added).
- **Out of scope for this delivery:** plan section E steps 5–10 (prebuild, Gradle APK, GitHub
  Release publishing) — publishing is outward-facing and needs explicit owner go-ahead; the
  release script (`scripts/release-apk.sh`) and CI workflow are still delivered as Stage 4 code.