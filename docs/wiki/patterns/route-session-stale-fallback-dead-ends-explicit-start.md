---
knowledge_type: learning
knowledge_status: accepted
learning_id: "route-session-stale-fallback-dead-ends-explicit-start"
created_at: 2026-10-24
source_refs:
  - "src/screens/TimerScreen.tsx#L66-L83"
  - "src/services/repos/sessionsRepo.ts#L203-L209"
  - "src/screens/__tests__/timerReadyToday.test.tsx"
reviewed_by: owner
reviewed_at: 2026-10-24
decision_reason: Seeded from verified project history during the owner-approved knowledge-system setup; round-1 HIGH C3 went RED→GREEN with four pinned READY cases and a refresh-on-focus regression test.
supersedes:
---

# `getLatestForTask` fallback must be today-only or it dead-ends the explicit start

## Symptom

After any prior-day session (yesterday's Verified/Completed row), the Timer screen rendered a dead
Verified/Completed box with no «Почати» and could route the child to `PinGate {intent: verify}` for a
stale row — the child could never start today's run. RED evidence:
`docs/evidence/companion-round-r2-red.log` ("a task verified YESTERDAY + a free today shows
«Почати»…").

## Cause

`TimerScreen.refreshRouteSession` fed its display state from
`sessionsRepo.getLatestForTask(taskId)`, which returns the latest non-abandoned session **of any
local date**. A row from yesterday therefore impersonated today's state, and the literal
"no session with local_date = today" READY formula additionally let today's *completed* run block
Start forever (a '2/3' day could never begin run 2).

## Resolution

- Use `getLatestForTask` **only when `latest.localDate === wall.todayLocalDate()`**; a prior-day row
  is ignored (`src/screens/TimerScreen.tsx#L70-L76`), so yesterday's state never drives today's UI
  and a stale Completed row no longer reaches PinGate verify.
- Documented READY extension (needed for C4 to be reachable):
  `READY = no ACTIVE session AND todayRuns < target_per_day`. Today's Completed/Verified state is
  still rendered; an explicit «Почати» appears next to «Покажи батькам» only while
  `runs < target`, and disappears at the cap.
- `refreshRouteSession` is re-run on store mutation, navigation focus, and verification, with an
  in-flight sequence guard (`loadSeqRef`) so a stale async load can never overwrite a fresh one.

## Evidence

`src/screens/__tests__/timerReadyToday.test.tsx` (4 pinned READY cases, including verified-yesterday
→ free today), `src/screens/__tests__/routeSessionRefresh.test.tsx` (refresh on store mutation and
focus after verify), `src/services/repos/__tests__/sessionsRepo.test.ts` (`getLatestForTask` returns
the latest non-abandoned session, `null` for unknown task), and `docs/UX_FIXES_NOTES.md` §"READY
comes from TODAY's sessions" (lines 173–182).