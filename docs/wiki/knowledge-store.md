# Engineering Knowledge Store

> **Scope:** development context for agents working on this repository. This is not a runtime app
> feature and must never contain child data, PINs, session rows, or any other personal data from
> the device database.

## Source ownership

| Source | Role | Trust and provenance |
|---|---|---|
| Current `docs/wiki/*.md` pages, including `adrs.md` | Canonical reviewed architecture and decisions | Retrieval includes a repository-relative `source_ref`, the repository commit, and a file SHA-256. Pages without review metadata are reported as `unverified`; verify historical claims against code and tests. |
| `docs/wiki/patterns/*.md` | Review-gated engineering learnings | Retrieved only when `knowledge_status: accepted` AND `learning_id`, `reviewed_by`, `reviewed_at`, and `source_refs` are all present. Candidate, rejected, superseded, legacy, and unmarked records are never returned as policy. |
| `graphify-out/graph.json` | Derived code/symbol index | Rebuildable, never canonical. Results cite `source_file#source_location` and report the indexed commit and whether the index is stale. Rebuild with the Graphify tool (see "Graphify relationship" below). |
| `docs/KNOWLEDGE.md`, `AGENTS.md`, `.agents/skills/*` | Operational instructions for agents | Instruction files, not retrieval sources. The retrieval store never rewrites them. |
| Task history, run logs, chat transcripts | **Not a source** | Task history is never a retrieval source and is never policy. Stage notes such as `docs/UX_FIXES_NOTES.md` are read by humans and cited by ADRs, but they are not automatically retrieved. |

The project scope is fixed to `focuskid`. The CLI does not retrieve another project, tenant,
customer, production, credential, or personal data.

## Retrieval contract

No installation is required. At task intake, query with the task and every relevant changed path:

```bash
python3 scripts/knowledge.py retrieve "How does the child STOP dialog interact with INV-03?" \
  --changed-path src/services/timer/timerService.ts \
  --max-context-chars 12000
```

After a test or lint failure, pass the concise sanitized signature separately so it contributes to ranking:

```bash
python3 scripts/knowledge.py retrieve "Fix the daily session limit regression" \
  --error-signature "UNIQUE constraint failed: sessions.task_id" \
  --changed-path src/services/timer/timerService.ts
```

The JSON response has a fixed `project_id` (`focuskid`) and three explicit groups under `sections`:
`patterns` contains only accepted learning records, `knowledge` contains Wiki/ADR pages, and
`graphify` contains derived code context. Every item carries a repository-relative `source_ref` and
source-specific provenance. `degraded_sources` identifies adapters that failed (an absent
`graphify-out/graph.json` degrades `graphify-code-index`). `context_chars` bounds the serialized
`sections` object in characters; it is not a model-token count. A stale index or a dirty working
tree is returned with `stale_index: true` — rebuild the index and validate paths against the
checkout before relying on code relationships.

The package contract can be embedded from Python (`KnowledgeRequest`, `KnowledgeStore`,
`KnowledgeResult` from `packages/engineering_knowledge/`). Other agents call the same local CLI and
consume its JSON. No HTTP service is exposed.

## Learning lifecycle

1. After a verified fix, capture a focused reusable lesson with
   `python3 scripts/knowledge.py propose-learning` (symptom, cause, resolution, evidence, and
   existing repository-relative source references).
2. The CLI creates a `candidate`; candidates are never retrieved and the command cannot mark a
   record accepted.
3. A human reviews the code/test evidence, scope, privacy, and duplicates in a Git change and
   records the decision.
4. Set the status to `accepted`, `rejected`, or `superseded`. Accepted records require a stable
   ID, reviewer, review date, and source references. Superseded records name their replacement.
5. Accepted retrieval includes the record's provenance. A correction creates a new record that
   supersedes the previous one; it never silently rewrites history.

See [`patterns/README.md`](patterns/README.md) for the record template. The four seed records in
`patterns/` were accepted during the owner-approved knowledge-system setup because each one is
backed by committed evidence (`docs/evidence/*.log`, RED→GREEN test history) documented in the
stage notes.

## Isolation and data boundaries

- The CLI fixes the project scope and repository root; the adapters reject a request whose project
  ID does not match their configured scope.
- The Markdown adapter reads only direct `docs/wiki/*.md` pages. Stage notes, plans, `VISION.md`,
  and other repository Markdown are not automatically retrieved; they are cited by ADRs instead.
- Accepted learnings are read from `docs/wiki/patterns/*.md` under the stricter review rules above.
  Graphify source references are restricted to existing code files and exclude secret, fixture,
  seed-data, and personal-data paths.
- Context size and result count have hard limits; source references are retained when content is
  shortened.
- Never store child names, task contents, PINs or PIN hashes, session rows, device data, or raw
  incident payloads in this store. Evidence fields hold concise, sanitized summaries only.

## Graphify relationship

Graphify remains the code index and retains its own workflow and output format. The adapter reads
the local `graphify-out/graph.json` NetworkX-style nodes and links, returns matched symbols with up
to three callers, callees, and test references, and marks the indexed commit; relationship
references are in `provenance.related_refs`. It never writes to the store or makes Wiki decisions
from Graphify data.

`graphify-out/` and `.graphify/` are gitignored (derived, rebuildable — mirroring Agentic ERP).
Rebuild options, in order of preference:

1. **Graphify AST builder** (tree-sitter quality; requires the `graphifyy` package — present in
   sdlc-buddy's backend venv on the build machine):

   ```bash
   cat > /tmp/graphify_focuskid.py <<'PY'
   import importlib.util, json
   spec = importlib.util.spec_from_file_location("gtool", "/home/hermes/sdlc-buddy/tools/graphify.py")
   m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
   if __name__ == "__main__":
       print(json.dumps(m.run_graphify_ast_scan("/home/hermes/work/FocusKid",
                                                output_dir="graphify-out", force=True)))
   PY
   /home/hermes/sdlc-buddy/backend/.venv/bin/python /tmp/graphify_focuskid.py
   ```

   (Run it from a real file, never a heredoc/`-c` stdin: the builder's watch pipeline re-imports
   `__main__` through multiprocessing and fails on `<stdin>`. Its bare CLI default writes to
   `docs/wiki/graph.json`, so `output_dir="graphify-out"` must be passed explicitly.)

2. **Dependency-free fallback:** `python3 scripts/build-graph-index.py` — a stdlib-only file/symbol
   scan that writes the same `graphify-out/graph.json` shape (used when the Graphify toolchain is
   not installed).