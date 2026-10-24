# Engineering learning records

This folder contains reviewed, repository-specific engineering remedies. Do not add child data,
PINs, session rows, personal data, secrets, or verbatim incident payloads.

Each record is a Markdown file with YAML front matter:

```yaml
---
knowledge_type: learning
knowledge_status: candidate
learning_id: short-stable-id
created_at: YYYY-MM-DD
source_refs:
  - src/services/timer/timerService.ts#L141
reviewed_by:
reviewed_at:
decision_reason:
supersedes:
---
```

Add sections for **Symptom**, **Cause**, **Resolution**, and **Evidence**. Source references must
point to repository code, tests, evidence logs under `docs/evidence/`, or a reviewed Wiki/ADR page.
A candidate is excluded from retrieval. Human review happens in Git; acceptance requires
`knowledge_status: accepted`, `reviewed_by`, `reviewed_at`, and at least one `source_refs` entry.
Record the decision reason. For rejected records, state why. For superseded records, set
`supersedes` on the replacement and explain the relation.

After a verified fix, create a candidate with the repository CLI:

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

Use a concise, sanitized evidence summary and existing repository-relative code/test/Wiki/ADR
references; the CLI validates that each `--source-ref` exists in this checkout. The CLI creates only
`candidate` records; human review is required for acceptance. Never copy raw logs, child/device
data, credentials, or personal data into a learning record.

Records present at setup (accepted, each backed by committed RED→GREEN evidence in
`docs/evidence/` and documented in the stage notes):

| learning_id | Lesson |
|---|---|
| `jest-tee-masks-exit-code` | `cmd \| tee` reports tee's exit 0 while jest fails — gate with a direct redirect and read the real code. |
| `foreground-gradle-420s-cap` | Gradle outlives the 420 s foreground cap — run it as a tracked background job and poll; never `nohup`, never `tee`. |
| `partial-unique-index-blocks-n-per-day` | A partial UNIQUE index cannot express N-per-day — drop it in a migration and enforce the rule in the service layer. |
| `route-session-stale-fallback-dead-ends-explicit-start` | `getLatestForTask` drives the display only when its `local_date` is today; otherwise a prior-day row dead-ends the start path. |