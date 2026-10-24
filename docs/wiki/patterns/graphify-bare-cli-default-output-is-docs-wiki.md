---
knowledge_type: learning
knowledge_status: candidate
learning_id: "graphify-bare-cli-default-output-is-docs-wiki"
created_at: 2026-10-24
source_refs:
  - "docs/wiki/knowledge-store.md"
  - "scripts/build-graph-index.py"
reviewed_by:
reviewed_at:
decision_reason:
supersedes:
---

# Graphify tool's bare CLI writes docs/wiki/graph.json; pin output_dir=graphify-out

## Symptom

Running the sdlc-buddy graphify tool from the FocusKid root would drop graph.json under docs/wiki/, while the knowledge adapter only reads graphify-out/graph.json, so the graph section stays degraded.

## Cause

tools/graphify.py run_graphify_ast_scan defaults output_dir to "docs/wiki" (its home project's convention) and its watch pipeline re-imports __main__, which fails when invoked from stdin/heredoc.

## Resolution

Invoke run_graphify_ast_scan with output_dir="graphify-out" (and force=True) from a real .py file, or rebuild with the stdlib fallback scripts/build-graph-index.py; keep graphify-out/ gitignored as a derived index.

## Evidence

Stdlib fallback run produced graphify-out/graph.json (N nodes/links) and a subsequent retrieve returned a non-degraded graphify section; both recipes are documented in docs/wiki/knowledge-store.md.
