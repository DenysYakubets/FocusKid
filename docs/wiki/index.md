# 🧠 FocusKid Wiki Index

Welcome to the **FocusKid** engineering wiki. This index links the canonical documentation that the
local knowledge CLI retrieves at task intake (`python3 scripts/knowledge.py retrieve`). Canonical
sources are Wiki/ADR pages; accepted learnings live under `patterns/`; the Graphify code index is
derived. Task history is never a source.

- **[[knowledge-store]]**: source-ownership table, retrieval contract, learning lifecycle, privacy
  boundaries, and Graphify rebuild recipes. Start here.
- **[[adrs]]**: Architecture Decision Records — child STOP dialog vs VISION §1.2, cheap PBKDF2 +
  V2 migration, mascot child-side only (INV-05).
- **[[patterns]]** (`patterns/README.md`): review-gated learning records
  (`knowledge_status: accepted` only are retrieved) and the `propose-learning` contract.

## Related repository documents (not auto-retrieved; cited by ADRs)

- `VISION.md` — canonical product requirements and invariants INV-01..INV-10.
- `docs/IMPLEMENTATION_PLAN.md` — stage tracker and assumption table (AS-xx).
- `docs/UX_FIXES_NOTES.md`, `docs/UI_REDESIGN_NOTES.md`, `docs/FIX_ROUND1_NOTES.md` — stage
  evidence notes that the seeded ADRs and learnings cite.
- `docs/evidence/*.log` — RED/GATE logs with embedded real exit codes.
- `docs/KNOWLEDGE.md` — the REQUIRED-at-intake rule for humans and agents.