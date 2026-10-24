---
knowledge_type: learning
knowledge_status: accepted
learning_id: "jest-tee-masks-exit-code"
created_at: 2026-10-24
source_refs:
  - "docs/UX_FIXES_NOTES.md#L131-L148"
  - "docs/evidence/ux-fixes-red.log"
reviewed_by: owner
reviewed_at: 2026-10-24
decision_reason: Seeded from verified project history during the owner-approved knowledge-system setup; incident and re-verification are documented in the UX-fix stage notes and both logs carry real exit codes.
supersedes:
---

# `cmd | tee` masks the gate exit code (false-green runs)

## Symptom

Two background gate runs of `npx jest --ci … | tee docs/evidence/ux-fixes-green.log` reported exit 0
while the tree actually had **4 suites / 3 tests failing (225/228)**. The red runs looked green in
both the terminal status and the saved log; the stale background output was never re-read.

## Cause

In a shell pipeline `$?` is the exit status of the **last** command — `tee` — not `jest`. `tee`
succeeds whenever it can write the file, so a failing test suite still yields pipeline exit 0. The
same trap applies to `bash script.sh | tee log` for any gate.

## Resolution

Run every gate by **direct redirect** and record the tool's own exit code into the log:

```bash
npx jest --ci > docs/evidence/<stage>-green.log 2>&1; echo "JEST_EXIT=$?" >> docs/evidence/<stage>-green.log
# if a pipe is unavoidable: set -o pipefail first, and assert on $?
```

Assert the embedded `JEST_EXIT=…`/`INV_EXIT=…`/`TSC_EXIT=…` value before calling a run green, and
re-read the log instead of trusting the launching command's status.

## Evidence

`docs/evidence/ux-fixes-red.log` is the direct-redirect RED capture (11 suites / 14 tests failed on
the pre-fix tree, real exit recorded) that this discipline produced. The masked background runs and
the four failures they hid (wrong import depth, duplicate «Календар» query, `findByText` on a
TextInput, split header nodes) are documented in `docs/UX_FIXES_NOTES.md` §"Evidence note —
continuation verification (direct runs, no pipe)", lines 131–148. The re-verification ran
`npx jest --ci` → 62 suites / 236 tests exit 0 × 5 with direct redirects.