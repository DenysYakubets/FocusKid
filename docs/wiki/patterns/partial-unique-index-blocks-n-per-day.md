---
knowledge_type: learning
knowledge_status: accepted
learning_id: "partial-unique-index-blocks-n-per-day"
created_at: 2026-10-24
source_refs:
  - "src/services/db/schema.ts#L122-L131"
  - "src/services/timer/timerService.ts#L141-L149"
  - "src/services/db/__tests__/migrations.test.ts#L57-L73"
reviewed_by: owner
reviewed_at: 2026-10-24
decision_reason: Seeded from verified project history during the owner-approved knowledge-system setup; round-1 HIGH C4 went RED (UNIQUE constraint failed) and GREEN through migration V5 plus the service-layer rule, with upgrade-path coverage.
supersedes:
---

# A partial UNIQUE index cannot express "N per day" — enforce it in the service layer

## Symptom

With `tasks.target_per_day = 2`, starting a second session for the same task on the same local day
failed with `UNIQUE constraint failed: sessions.task_id, sessions.local_date` (AS-04 behaviour)
while the product rule allows up to N non-abandoned runs per day. RED evidence:
`docs/evidence/companion-round-r2-red.log` ("V5: two non-abandoned sessions can share a task/day…").

## Cause

Migration V1 created `CREATE UNIQUE INDEX ux_sessions_task_day ON sessions (task_id, local_date)
WHERE status <> 'abandoned'` — a partial index that can only express **one** row per key. N-per-day
cannot be expressed as `UNIQUE` at all, because N varies per row (`target_per_day`), so no fixed
index can encode the rule.

## Resolution

- **Migration V5** drops `ux_sessions_task_day` (fresh installs create it in V1 and drop it in V5;
  the upgrade path runs the same statement) and deliberately leaves `ux_sessions_one_active`
  (AS-05, one *active* session) untouched.
- The rule moves into `timerService.doStart`: reject when
  `sessionsRepo.countForTaskOnDay(taskId, today) >= task.targetPerDay` with the error code
  `SESSION_LIMIT_REACHED_TODAY`, and **repeat the check inside the same transaction** as the insert.
  AS-05 keeps precedence except when the day is full.
- `tasksRepo.listToday` LEFT JOINs the *latest* of today's runs through a correlated subquery so
  several runs on one day cannot duplicate the task card; `TaskCard` clamps `completedToday` to the
  target (never renders `4/3`).

## Evidence

`src/services/db/__tests__/migrations.test.ts` §V5 (two non-abandoned sessions share a task/day,
one ACTIVE session stays unique, upgrade path V1→V5), `src/services/timer/__tests__/timerServiceDailyLimit.test.ts`
(2nd run allowed pre-fix RED, 3rd rejected for `target_per_day = 2`, default 1 keeps its cap),
`docs/UX_FIXES_NOTES.md` §"C4 is now enforced end to end" (lines 158–171).