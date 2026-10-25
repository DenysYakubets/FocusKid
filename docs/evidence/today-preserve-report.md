# Today visibility fix validation

All commands ran from `/home/hermes/work/FocusKid`.

| Command | Exit | Evidence/result |
| --- | --- | --- |
| `python3 scripts/knowledge.py retrieve "task deletion archive today screen visibility" --changed-path src/screens/TaskEditScreen.tsx --limit 8` | 0 | Checked current code against retrieved task/session context; graph index marked stale. |
| `npx tsc --noEmit` (baseline) | 0 | today-preserve-baseline-tsc.log |
| `npm test` (baseline) | 1 | 296 passed, 1 failed, 297 total; PIN timing 130ms vs <50ms. |
| `bash scripts/check-invariants.sh` (baseline) | 0 | today-preserve-baseline-invariants.log |
| `npm test -- --runInBand src/screens/__tests__/TaskEditScreen.test.tsx` (RED) | 1 | 2 failed, 3 passed; stale todayTasks and missing archiveHint. |
| `npm test -- --runInBand src/screens/__tests__/TaskEditScreen.test.tsx` (GREEN) | 0 | 5 passed; today-preserve-targeted-green.log |
| `git diff --check` | 0 | No whitespace errors. |
| `git diff --exit-code -- src/services/db/schema.ts scripts/check-invariants.sh` | 0 | Protected files unchanged. |
| `rg -n '#[0-9a-fA-F]{3,8}\|fontSize: *[0-9]' src/screens/TaskEditScreen.tsx src/screens/PinGateScreen.tsx src/i18n/uk.ts` | 1 | No matches (probe used extended alternation). |

Final gates are recorded in today-preserve-green*.log. Full Jest uses `--runInBand` to reduce resource contention after the baseline timing failure. No lint script/config is provided by this repository. No adb/device is available for native screenshots at 320/366/413dp; existing scrollable form and scalable caption tokens are retained.

Stage only the fix files and today-preserve evidence: pre-existing untracked skill files and other concurrent work must remain outside this commit.

## Concurrent-work isolation

The first full post-fix run passed 76 suites / 298 tests (`today-preserve-green.log`). During its invariant gate, unrelated concurrent mascot tests appeared and failed typechecking. A subsequent shared run captured 5 mascot test failures (`today-preserve-final-test.log`). No mascot files were changed by this task.

Validation worktree setup (all commands exit 0):

```
git diff --binary -- docs/IMPLEMENTATION_PLAN.md src/i18n/uk.ts src/screens/PinGateScreen.tsx src/screens/TaskEditScreen.tsx src/screens/__tests__/TaskEditScreen.test.tsx > .git/today-preserve.patch
git worktree add --detach .git/today-validation 69648f7
git -C .git/today-validation apply ../today-preserve.patch
ln -s /home/hermes/work/FocusKid/node_modules .git/today-validation/node_modules
git worktree move .git/today-validation .expo/today-validation
```

An earlier temporary checkout under node_modules was removed. Both node_modules and .git locations yielded “No tests found”; those test runs do not constitute validation. The final `.expo/today-validation` checkout discovers actual tests (`today-preserve-patch-discovery.log`).

Final patch commands run from `/home/hermes/work/FocusKid/.expo/today-validation`:

```
npm test -- --listTests --runInBand
npx tsc --noEmit
npm test -- --runInBand
bash scripts/check-invariants.sh
```

Outputs are in `today-preserve-patch-{discovery,tsc,test,invariants}.log`.

Final patch results: discovery 0 (76 suites discovered), TypeScript 0, Jest 0 (76 suites / 298 tests passed), invariants 0. Invariant Android build/release checks report SKIP when their artifacts are absent. No tests were skipped by Jest.

Commit/push commands:

```
git add docs/IMPLEMENTATION_PLAN.md src/i18n/uk.ts src/screens/PinGateScreen.tsx src/screens/TaskEditScreen.tsx src/screens/__tests__/TaskEditScreen.test.tsx docs/evidence/today-preserve-*
git diff --cached --check
git diff --cached --stat
git commit -m "fix(today-screen): preserve previous tasks on create + clarify delete/archive buttons"
git push origin main
git rev-parse HEAD
```

Explicit staging replaces `git add -A` to preserve pre-existing skills and concurrent mascot work. Commit and push results are reported in the task response.
