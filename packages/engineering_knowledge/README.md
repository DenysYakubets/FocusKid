# FocusKid Engineering Knowledge

Dependency-free Python contract and filesystem adapters used by the repository's local
engineering-agent CLI (`project_id` fixed to `focuskid`).

```bash
python3 scripts/knowledge.py retrieve "How does the child STOP dialog interact with INV-03?" \
  --changed-path src/services/timer/timerService.ts
```

For a failing test or runtime error, pass its exact signature separately:

```bash
python3 scripts/knowledge.py retrieve "Fix the daily session limit regression" \
  --error-signature "UNIQUE constraint failed: sessions.task_id" \
  --changed-path src/services/timer/timerService.ts
```

The project ID and repository root are fixed by the CLI. Python callers can use
`KnowledgeRequest`, `KnowledgeStore`, and `KnowledgeResult` from the package; other agents should
call the CLI and consume its JSON response. The response groups source-linked items under
`sections.patterns` (accepted learnings), `sections.knowledge` (Wiki/ADR pages), and
`sections.graphify` (code index results). The CLI does not retrieve task history.

The Markdown adapter retrieves current wiki/ADR pages from `docs/wiki/*.md`. Accepted learning
patterns under `docs/wiki/patterns/*.md` are a separate source gated on
`knowledge_status: accepted` plus review provenance, and implementation symbols come from the local
Graphify output at `graphify-out/graph.json`. Markdown results include repository-relative source
references, source roles, the repository commit, and file SHA-256; other adapters provide
provenance specific to their source. Plans, stage notes, and other repository Markdown are excluded
from automatic retrieval. Missing or failing adapters appear in `degraded_sources`, and the
serialized `sections` object is bounded by `max_context_chars`.

The package has no database, model, or third-party runtime dependency. It does not ingest task
history, child/device data, credentials, or production records. See
[`docs/wiki/knowledge-store.md`](../../docs/wiki/knowledge-store.md) for governance and source
trust, and [`docs/KNOWLEDGE.md`](../../docs/KNOWLEDGE.md) for the required-at-intake rule.

After a verified, reusable fix, agents can create a review-gated candidate with
`python3 scripts/knowledge.py propose-learning`. Candidates include a symptom, cause, resolution,
evidence, and existing repository source references. They are excluded from retrieval until a human
records the review provenance and accepts them.

Run the Engineering Knowledge tests, including the deterministic golden query set, with:

```bash
python3 -m pytest tests/engineering_knowledge -q
```

The golden cases verify expected source retrieval for Wiki queries, exact error signatures,
changed-path learning matches, and Graphify callers/tests. They test the retrieval contract without
an LLM or network dependency.