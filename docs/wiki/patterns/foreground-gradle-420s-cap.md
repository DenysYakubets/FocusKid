---
knowledge_type: learning
knowledge_status: accepted
learning_id: "foreground-gradle-420s-cap"
created_at: 2026-10-24
source_refs:
  - "scripts/release-apk.sh#L39-L40"
  - "README.md#L48"
reviewed_by: owner
reviewed_at: 2026-10-24
decision_reason: Seeded from verified project history during the owner-approved knowledge-system setup; the v0.1.4 APK round killed two foreground Gradle runs at the 420s tool cap before the tracked-background recipe completed both builds.
supersedes:
---

# Gradle outlives the 420 s foreground cap — run it tracked-background + poll

## Symptom

`./gradlew assembleDebug` / `assembleRelease` started as a foreground terminal command was killed
twice at exactly the **420.0 s** tool timeout mid-build (v0.1.4 APK round), losing the run. A
detached retry via `setsid`/`nohup` was rejected outright by the tooling, and earlier gate runs piped
through `| tee` had reported exit 0 for failing suites (see the `jest-tee-masks-exit-code` learning).

## Cause

A cold Gradle build of this app takes 6–12 minutes, well past the 420 s foreground command cap, so
any foreground invocation is doomed to be reaped mid-compile. Shell-level background wrappers
(`nohup`/`disown`/`setsid`) are rejected because they detach the process from the tracker: its
output becomes unreadable and its exit code unreachable. A pipe through `tee` additionally replaces
the build's exit status with tee's.

## Resolution

Run Gradle as a **tracked background process** (`terminal(command=…, background=true)` — the runtime
assigns a session id), redirect its output to a log file with `>` (**no pipe**), then poll the log
and `ps` in separate short calls until `BUILD SUCCESSFUL`/`BUILD FAILED` appears; finish by reading
the tracked process's real exit code. Never `nohup`, never `setsid`, never `cmd | tee` on a gate.
Keep `scripts/release-apk.sh`'s step order (npm ci → test → tsc → invariants → prebuild →
`./gradlew assembleDebug`) as the canonical build sequence.

## Evidence

v0.1.4 round: two foreground kills at `timed out after 420.0s`, one rejected `setsid nohup` attempt,
then the tracked-background recipe completed release (6 m 19 s) and debug builds with logs
`gradle-release-014.log` / `gradle-debug-014.log` polled every ~300 s and exit codes read directly.
Repo anchors: `scripts/release-apk.sh` step 6 (`cd android && ./gradlew assembleDebug`) and the
release procedure in `README.md`.