---
name: knowledge-retrieval
description: Retrieve source-attributed FocusKid Wiki, accepted learnings, and code context. REQUIRED at every task intake.
---

# FocusKid knowledge retrieval

Use this skill for every repository task — planning, implementation, review, testing, debugging —
when prior decisions or patterns may matter. At the start of each task, run the repository-local CLI
from the FocusKid root. Include every relevant changed path so linked implementation context and
accepted learnings rank higher:

```bash
python3 scripts/knowledge.py retrieve "<specific question>" \
  --changed-path <repository/relative/path> \
  --max-context-chars 12000
```

Add one `--changed-path` for each relevant changed file. Read the returned `source_ref` before
relying on a result. Cite source references in reasoning and verify implementation claims against
current code and tests. If a gate fails, query again with its concise, sanitized signature:

```bash
python3 scripts/knowledge.py retrieve "Investigate the failing behavior" \
  --error-signature "UNIQUE constraint failed: sessions.task_id" \
  --changed-path src/services/timer/timerService.ts
```

The JSON response groups agent context under three stable sections: `sections.patterns` for accepted
learning records, `sections.knowledge` for Wiki/ADR pages, and `sections.graphify` for code symbols
and their related callers, callees, and tests. Read the source references and provenance in each
item. This repository does not provide a task-history section or import any external task database.
The full rule for humans and agents lives in [`docs/KNOWLEDGE.md`](../../../docs/KNOWLEDGE.md).

## Source rules

- Wiki and ADR Markdown (`docs/wiki/*.md`) are the canonical source for reviewed architecture and
  decisions. A result marked `unverified` may be historical; check its source and current code.
- Only a learning with `knowledge_status: accepted` and complete review provenance is eligible.
  Candidate, rejected, superseded, legacy, and unmarked records are not policy.
- Graphify (`graphify-out/graph.json`) is a derived code index. If `degraded_sources` lists
  `graphify-code-index`, or a code result says `stale_index: true`, rebuild it with one of the
  recipes in `docs/wiki/knowledge-store.md` and validate paths against the checkout.
- Results are clipped to a character budget. `context_chars` is not an exact model-token count;
  inspect the sources if more context is needed.
- The project scope is fixed to `focuskid`. Do not pass or retrieve another project, tenant,
  customer, production, credential, or personal data — and never store child data, PINs, or session
  rows in this store.

## Proposing a learning

After a verified fix, create a focused candidate only when it captures a reproducible, reusable
lesson. The CLI validates repository source references and writes the record as `candidate`:

```bash
python3 scripts/knowledge.py propose-learning \
  --learning-id "stable-short-slug" \
  --title "Short reusable lesson" \
  --symptom "What failed" \
  --cause "Why it failed" \
  --resolution "The durable correction" \
  --evidence "Verification performed and its result" \
  --source-ref "src/path/to_file.ts#L12"
```

Candidates are excluded from retrieval. A human must review the code/test evidence in Git and record
accepted, rejected, or superseded status plus provenance before accepted retrieval can use it. Store
concise evidence, never raw logs or child, device, production, credential, or personal data.