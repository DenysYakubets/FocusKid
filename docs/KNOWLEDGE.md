# Knowledge retrieval is REQUIRED at every task intake

> For agents: the skill version of this rule is
> [`.agents/skills/knowledge-retrieval/SKILL.md`](../.agents/skills/knowledge-retrieval/SKILL.md).
> Sources and governance: [`docs/wiki/knowledge-store.md`](wiki/knowledge-store.md).

No task — plan, implement, review, test, debug, or docs — starts cold. At intake, retrieve what this
repository already knows and fold the hits (with their `source_ref`) into the brief you act on.

## 1. Intake (required, before editing anything)

```bash
python3 scripts/knowledge.py retrieve "<the task, phrased specifically>" \
  --changed-path <path/you/plan/to/change> \
  --changed-path <another/relevant/path> \
  --max-context-chars 12000
```

- Pass **one `--changed-path` per file/directory** the task will touch: accepted learnings whose
  `source_refs` and wiki pages matching those paths rank higher.
- Read every hit's `source_ref` before relying on it, and cite it in the brief/plan. Verify
  implementation claims against current code and tests — wiki pages can be historical.
- Fold the results into the brief: prior decisions (ADRs), accepted learnings, and the code symbols
  (with callers/callees/tests) for the paths you are about to change.

## 2. On a test/lint/gate failure (required before diagnosing)

Re-query with the concise, sanitized failure signature so it contributes to ranking:

```bash
python3 scripts/knowledge.py retrieve "Investigate the failing behavior" \
  --error-signature "UNIQUE constraint failed: sessions.task_id" \
  --changed-path src/services/timer/timerService.ts
```

Omit payloads, child/device data, PINs, and personal data from the signature.

## 3. After a verified fix (required before calling the task done)

Record the reusable lesson as a review-gated candidate:

```bash
python3 scripts/knowledge.py propose-learning \
  --learning-id "stable-short-slug" \
  --title "Short reusable lesson" \
  --symptom "What failed" \
  --cause "Why it failed" \
  --resolution "The durable correction" \
  --evidence "Verification performed and its result" \
  --source-ref "path/that/existed.ts#L12"
```

The CLI writes `knowledge_status: candidate` under `docs/wiki/patterns/` — **candidates are excluded
from retrieval**. Only an owner/human review in Git flips it to `accepted` (with `reviewed_by`,
`reviewed_at`, decision reason), after which it becomes policy for future intakes. Skip
`propose-learning` when nothing reusable was learned.

## Source rules (what retrieval may return)

- `docs/wiki/*.md` (including `adrs.md`) — canonical reviewed decisions.
- `docs/wiki/patterns/*.md` — **accepted-only** learnings with full review provenance; candidates
  and unmarked files are never returned.
- `graphify-out/graph.json` — derived code index; `degraded_sources` or `stale_index: true` means
  rebuild it (recipes in `docs/wiki/knowledge-store.md`) and validate paths against the checkout.
- **Task history is not a source.** Stage notes (`docs/*_NOTES.md`) are cited by ADRs/learnings but
  are not auto-retrieved. Never store child data, PINs, session rows, or credentials in this store.