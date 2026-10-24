import { ADD_TIME_STEP_MS, PAUSE_BUDGET_MS } from '../../domain/timer/constants';
import { pausedElapsed, remaining, runElapsed } from '../../domain/timer/elapsed';
import { transition } from '../../domain/timer/fsm';
import { TimerState } from '../../domain/timer/types';
import { MonotonicClock } from '../clock/monotonic';
import { WallClock } from '../clock/wallClock';
import { Db } from '../db/Db';
import { SessionRow, SessionsRepo, createSessionsRepo } from '../repos/sessionsRepo';
import { TasksRepo } from '../repos/tasksRepo';

export interface TimerSnapshot {
  state: TimerState;
  sessionId: number | null;
  taskId: number | null;
}

export type TimerServiceResult =
  | { ok: true; state: TimerState }
  | { ok: false; error: string };

export type ParentToken = unknown;
export type TokenConsumer = (token: ParentToken) => boolean;

export function restore(row: SessionRow, now: number): TimerState {
  switch (row.status) {
    case 'running':
      return {
        kind: 'Running',
        targetMs: row.targetMs,
        addedMs: row.addedMs,
        runAccumMs: row.elapsedRunMs,
        runSince: now,
        pausedTotalMs: row.pausedTotalMs,
        pauseCount: row.pauseCount,
      };
    case 'paused':
      return {
        kind: 'Paused',
        targetMs: row.targetMs,
        addedMs: row.addedMs,
        runAccumMs: row.elapsedRunMs,
        pausedSince: now,
        pausedTotalMs: row.pausedTotalMs,
        pauseCount: row.pauseCount,
      };
    case 'completed':
      return {
        kind: 'Completed',
        targetMs: row.targetMs,
        addedMs: row.addedMs,
        runAccumMs: row.elapsedRunMs,
        pausedTotalMs: row.pausedTotalMs,
        pauseCount: row.pauseCount,
      };
    case 'verified':
      return {
        kind: 'Verified',
        targetMs: row.targetMs,
        addedMs: row.addedMs,
        runAccumMs: row.elapsedRunMs,
        pausedTotalMs: row.pausedTotalMs,
        pauseCount: row.pauseCount,
      };
    case 'abandoned':
      return { kind: 'Idle' };
  }
}

export interface TimerService {
  start(taskId: number): Promise<TimerServiceResult>;
  pause(): Promise<TimerServiceResult>;
  resume(): Promise<TimerServiceResult>;
  addTime(ms?: number): Promise<TimerServiceResult>;
  tick(): Promise<TimerServiceResult>;
  requestComplete(): Promise<TimerServiceResult>;
  /** F3: child-initiated stop — no parent token required. */
  stop(): Promise<TimerServiceResult>;
  verify(sessionId: number, token?: ParentToken): Promise<TimerServiceResult>;
  abandon(sessionId: number, token?: ParentToken): Promise<TimerServiceResult>;
  checkpoint(): Promise<void>;
  hydrate(): Promise<TimerSnapshot>;
  getSnapshot(): TimerSnapshot;
}

export function createTimerService(deps: {
  db: Db;
  clock: MonotonicClock;
  wall: WallClock;
  sessionsRepo: SessionsRepo;
  tasksRepo: TasksRepo;
  consumeToken?: TokenConsumer;
}): TimerService {
  const { db, clock, wall, sessionsRepo, tasksRepo, consumeToken = () => false } = deps;

  let state: TimerState = { kind: 'Idle' };
  let sessionId: number | null = null;
  let taskId: number | null = null;

  let opQueue: Promise<unknown> = Promise.resolve();
  function enqueue<T>(op: () => Promise<T>): Promise<T> {
    const run = opQueue.then(op, op);
    opQueue = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }

  function getSnapshot(): TimerSnapshot {
    return { state, sessionId, taskId };
  }

  async function doHydrate(): Promise<TimerSnapshot> {
    const active = await sessionsRepo.getActive();
    if (active) {
      state = restore(active, clock.now());
      sessionId = active.id;
      taskId = active.taskId;
    } else {
      state = { kind: 'Idle' };
      sessionId = null;
      taskId = null;
    }
    return getSnapshot();
  }

  async function doStart(newTaskId: number): Promise<TimerServiceResult> {
    // AS-05: at most one active session (fast-path pre-check). Checked first so the friendly-mapped
    // activeSessionError code wins when a task has both today's row and a foreign active session.
    const active = await sessionsRepo.getActive();
    if (active && active.taskId !== newTaskId) {
      return { ok: false, error: 'ACTIVE_SESSION_EXISTS' };
    }

    // AS-04: one session per task per local calendar day (fast-path pre-check)
    const today = wall.todayLocalDate();
    const existingToday = await sessionsRepo.getTodayForTask(newTaskId, today);
    if (existingToday) {
      return { ok: false, error: 'SESSION_ALREADY_EXISTS_TODAY' };
    }

    if (active) {
      return { ok: false, error: 'ACTIVE_SESSION_EXISTS' };
    }

    const task = await tasksRepo.get(newTaskId);
    if (!task) {
      return { ok: false, error: 'TASK_NOT_FOUND' };
    }

    const targetMs = task.targetMinutes * 60_000;
    const now = clock.now();
    const res = transition({ kind: 'Idle' }, { type: 'START', now, targetMs });
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    const nowIso = wall.nowIso();
    type TxResult =
      | { ok: true; session: SessionRow }
      | { ok: false; error: 'ACTIVE_SESSION_EXISTS' | 'SESSION_ALREADY_EXISTS_TODAY' };

    let txRes: TxResult;
    try {
      txRes = await db.transaction<TxResult>(async (tx) => {
        const txSessionsRepo = createSessionsRepo(tx);

        const inTxToday = await txSessionsRepo.getTodayForTask(newTaskId, today);
        if (inTxToday) {
          return { ok: false, error: 'SESSION_ALREADY_EXISTS_TODAY' };
        }

        const inTxActive = await txSessionsRepo.getActive();
        if (inTxActive) {
          return { ok: false, error: 'ACTIVE_SESSION_EXISTS' };
        }

        const createdSession = await txSessionsRepo.insertRunning({
          taskId: newTaskId,
          localDate: today,
          targetMs,
          startedAt: nowIso,
          updatedAt: nowIso,
        });

        await txSessionsRepo.appendEvent({
          sessionId: createdSession.id,
          event: 'START',
          fromState: 'Idle',
          toState: 'running',
          runMs: 0,
          createdAt: nowIso,
        });

        return { ok: true, session: createdSession };
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const code = (err as { code?: string | number })?.code;
      const isUniqueConstraint =
        msg.includes('UNIQUE constraint failed') ||
        code === 'SQLITE_CONSTRAINT' ||
        code === 'SQLITE_CONSTRAINT_UNIQUE' ||
        code === 2067 ||
        code === 19;

      if (isUniqueConstraint) {
        const existingAfter = await sessionsRepo.getTodayForTask(newTaskId, today);
        if (existingAfter) {
          return { ok: false, error: 'SESSION_ALREADY_EXISTS_TODAY' };
        }
        const activeAfter = await sessionsRepo.getActive();
        if (activeAfter) {
          return { ok: false, error: 'ACTIVE_SESSION_EXISTS' };
        }
        return { ok: false, error: 'SESSION_ALREADY_EXISTS_TODAY' };
      }
      return { ok: false, error: msg || 'START_FAILED' };
    }

    if (!txRes.ok) {
      return { ok: false, error: txRes.error };
    }

    state = res.state;
    sessionId = txRes.session.id;
    taskId = newTaskId;

    return { ok: true, state };
  }

  async function doPause(): Promise<TimerServiceResult> {
    if (!sessionId || state.kind !== 'Running') {
      return { ok: false, error: 'INVALID_TRANSITION' };
    }

    const now = clock.now();
    const res = transition(state, { type: 'PAUSE', now });
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    const currentSessionId = sessionId;
    const nowIso = wall.nowIso();

    await db.transaction(async (tx) => {
      const txSessionsRepo = createSessionsRepo(tx);
      await txSessionsRepo.setStatus(currentSessionId, 'paused', {
        elapsedRunMs: res.state.kind === 'Paused' ? res.state.runAccumMs : 0,
        pausedTotalMs: res.state.kind === 'Paused' ? res.state.pausedTotalMs : 0,
        pauseCount: res.state.kind === 'Paused' ? res.state.pauseCount : 0,
        updatedAt: nowIso,
      });

      await txSessionsRepo.appendEvent({
        sessionId: currentSessionId,
        event: 'PAUSE',
        fromState: 'running',
        toState: 'paused',
        runMs: res.state.kind === 'Paused' ? res.state.runAccumMs : 0,
        createdAt: nowIso,
      });
    });

    state = res.state;
    return { ok: true, state };
  }

  async function doResume(): Promise<TimerServiceResult> {
    if (!sessionId || state.kind !== 'Paused') {
      return { ok: false, error: 'INVALID_TRANSITION' };
    }

    const now = clock.now();
    const res = transition(state, { type: 'RESUME', now });
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    const currentSessionId = sessionId;
    const nowIso = wall.nowIso();
    const targetState = res.state;

    await db.transaction(async (tx) => {
      const txSessionsRepo = createSessionsRepo(tx);
      if (targetState.kind === 'Completed') {
        await txSessionsRepo.setStatus(currentSessionId, 'completed', {
          elapsedRunMs: targetState.runAccumMs,
          pausedTotalMs: targetState.pausedTotalMs,
          completedAt: nowIso,
          updatedAt: nowIso,
        });
        await txSessionsRepo.appendEvent({
          sessionId: currentSessionId,
          event: 'COMPLETE',
          fromState: 'paused',
          toState: 'completed',
          runMs: targetState.runAccumMs,
          createdAt: nowIso,
        });
      } else if (targetState.kind === 'Running') {
        await txSessionsRepo.setStatus(currentSessionId, 'running', {
          elapsedRunMs: targetState.runAccumMs,
          pausedTotalMs: targetState.pausedTotalMs,
          updatedAt: nowIso,
        });
        await txSessionsRepo.appendEvent({
          sessionId: currentSessionId,
          event: 'RESUME',
          fromState: 'paused',
          toState: 'running',
          runMs: targetState.runAccumMs,
          createdAt: nowIso,
        });
      }
    });

    state = res.state;
    return { ok: true, state };
  }

  async function doAddTime(ms: number = ADD_TIME_STEP_MS): Promise<TimerServiceResult> {
    if (!sessionId || (state.kind !== 'Running' && state.kind !== 'Paused')) {
      return { ok: false, error: 'INVALID_TRANSITION' };
    }

    const now = clock.now();
    const fromState = state.kind.toLowerCase();
    const res = transition(state, { type: 'ADD_TIME', now, ms });
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    const currentSessionId = sessionId;
    const nowIso = wall.nowIso();
    const targetAddedMs = res.state.kind !== 'Idle' ? res.state.addedMs : 0;
    const currentRunMs = runElapsed(state, now);

    await db.transaction(async (tx) => {
      const txSessionsRepo = createSessionsRepo(tx);
      await txSessionsRepo.setStatus(
        currentSessionId,
        res.state.kind === 'Running' ? 'running' : 'paused',
        {
          elapsedRunMs: currentRunMs,
          addedMs: targetAddedMs,
          updatedAt: nowIso,
        }
      );

      await txSessionsRepo.appendEvent({
        sessionId: currentSessionId,
        event: 'ADD_TIME',
        fromState,
        toState: res.state.kind.toLowerCase(),
        runMs: currentRunMs,
        createdAt: nowIso,
      });
    });

    state = res.state;
    return { ok: true, state };
  }

  async function doTick(): Promise<TimerServiceResult> {
    if (!sessionId || (state.kind !== 'Running' && state.kind !== 'Paused')) {
      if (state.kind === 'Completed') {
        return { ok: true, state };
      }
      return { ok: false, error: 'INVALID_TRANSITION' };
    }

    const now = clock.now();
    const prevKind = state.kind;
    const res = transition(state, { type: 'TICK', now });
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    const currentSessionId = sessionId;
    const nowIso = wall.nowIso();

    if (res.effects.includes('AUTO_RESUMED') || res.effects.includes('COMPLETED')) {
      await db.transaction(async (tx) => {
        const txSessionsRepo = createSessionsRepo(tx);

        if (res.effects.includes('AUTO_RESUMED')) {
          await txSessionsRepo.appendEvent({
            sessionId: currentSessionId,
            event: 'AUTO_RESUMED',
            fromState: 'paused',
            toState: 'running',
            runMs: res.state.kind !== 'Idle' ? res.state.runAccumMs : 0,
            createdAt: nowIso,
          });
        }

        if (res.effects.includes('COMPLETED')) {
          const targetState = res.state;
          if (targetState.kind === 'Completed') {
            await txSessionsRepo.setStatus(currentSessionId, 'completed', {
              elapsedRunMs: targetState.runAccumMs,
              pausedTotalMs: targetState.pausedTotalMs,
              completedAt: nowIso,
              updatedAt: nowIso,
            });
            await txSessionsRepo.appendEvent({
              sessionId: currentSessionId,
              event: 'COMPLETE',
              fromState: prevKind.toLowerCase(),
              toState: 'completed',
              runMs: targetState.runAccumMs,
              createdAt: nowIso,
            });
          }
        } else if (res.effects.includes('AUTO_RESUMED')) {
          if (res.state.kind === 'Running') {
            await txSessionsRepo.setStatus(currentSessionId, 'running', {
              pausedTotalMs: res.state.pausedTotalMs,
              updatedAt: nowIso,
            });
          }
        }
      });
    }

    state = res.state;
    return { ok: true, state };
  }

  async function doRequestComplete(): Promise<TimerServiceResult> {
    if (!sessionId || state.kind !== 'Running') {
      return { ok: false, error: 'INVALID_TRANSITION' };
    }

    const now = clock.now();
    const res = transition(state, { type: 'COMPLETE', now });
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    const currentSessionId = sessionId;
    const nowIso = wall.nowIso();
    const targetState = res.state;

    if (targetState.kind === 'Completed') {
      await db.transaction(async (tx) => {
        const txSessionsRepo = createSessionsRepo(tx);
        await txSessionsRepo.setStatus(currentSessionId, 'completed', {
          elapsedRunMs: targetState.runAccumMs,
          completedAt: nowIso,
          updatedAt: nowIso,
        });

        await txSessionsRepo.appendEvent({
          sessionId: currentSessionId,
          event: 'COMPLETE',
          fromState: 'running',
          toState: 'completed',
          runMs: targetState.runAccumMs,
          createdAt: nowIso,
        });
      });
    }

    state = res.state;
    return { ok: true, state };
  }

  /**
   * F3: child-initiated stop. Terminates the live session through the existing
   * abandon path (status -> 'abandoned', audit event appended) without any
   * parent token: no minutes are earned, nothing reaches Completed/Verified,
   * and the task can be started again today (no penalty, INV-09).
   */
  async function doStop(): Promise<TimerServiceResult> {
    if (!sessionId || (state.kind !== 'Running' && state.kind !== 'Paused')) {
      return { ok: false, error: 'INVALID_TRANSITION' };
    }

    const now = clock.now();
    const fromKind = state.kind;
    const res = transition(state, { type: 'STOP', now });
    if (!res.ok) {
      return { ok: false, error: res.error };
    }

    const currentSessionId = sessionId;
    const currentRunMs = runElapsed(state, now);
    const currentPausedMs = Math.min(PAUSE_BUDGET_MS, pausedElapsed(state, now));
    const nowIso = wall.nowIso();

    await db.transaction(async (tx) => {
      const txSessionsRepo = createSessionsRepo(tx);
      await txSessionsRepo.setStatus(currentSessionId, 'abandoned', {
        elapsedRunMs: currentRunMs,
        pausedTotalMs: currentPausedMs,
        updatedAt: nowIso,
      });

      await txSessionsRepo.appendEvent({
        sessionId: currentSessionId,
        event: 'STOP',
        fromState: fromKind.toLowerCase(),
        toState: 'abandoned',
        runMs: currentRunMs,
        createdAt: nowIso,
      });
    });

    state = { kind: 'Idle' };
    sessionId = null;
    taskId = null;

    return { ok: true, state };
  }

  async function doCheckpoint(): Promise<void> {
    if (!sessionId || (state.kind !== 'Running' && state.kind !== 'Paused')) {
      return;
    }
    const now = clock.now();
    const currentRunMs = runElapsed(state, now);
    const currentPausedMs = Math.min(PAUSE_BUDGET_MS, pausedElapsed(state, now));
    await sessionsRepo.checkpoint(sessionId, currentRunMs, currentPausedMs, wall.nowIso());
  }

  async function doVerify(targetSessionId: number, token?: ParentToken): Promise<TimerServiceResult> {
    const authorized = consumeToken(token);
    if (!authorized) {
      return { ok: false, error: 'PARENT_AUTH_REQUIRED' };
    }

    const row = await sessionsRepo.get(targetSessionId);
    if (!row) {
      return { ok: false, error: 'INVALID_SESSION' };
    }
    if (row.status === 'verified') {
      return { ok: false, error: 'VERIFIED_IMMUTABLE' };
    }
    if (row.status !== 'completed') {
      return { ok: false, error: 'NOT_COMPLETED' };
    }

    const nowIso = wall.nowIso();
    await db.transaction(async (tx) => {
      const txSessionsRepo = createSessionsRepo(tx);
      await txSessionsRepo.setStatus(targetSessionId, 'verified', {
        verifiedAt: nowIso,
        updatedAt: nowIso,
      });

      await txSessionsRepo.appendEvent({
        sessionId: targetSessionId,
        event: 'VERIFY',
        fromState: 'completed',
        toState: 'verified',
        runMs: row.elapsedRunMs,
        createdAt: nowIso,
      });
    });

    const verifiedState: TimerState = {
      kind: 'Verified',
      targetMs: row.targetMs,
      addedMs: row.addedMs,
      runAccumMs: row.elapsedRunMs,
      pausedTotalMs: row.pausedTotalMs,
      pauseCount: row.pauseCount,
    };

    if (sessionId === targetSessionId) {
      state = verifiedState;
    }

    return { ok: true, state: verifiedState };
  }

  async function doAbandon(targetSessionId: number, token?: ParentToken): Promise<TimerServiceResult> {
    const authorized = consumeToken(token);
    if (!authorized) {
      return { ok: false, error: 'PARENT_AUTH_REQUIRED' };
    }

    const row = await sessionsRepo.get(targetSessionId);
    if (!row) {
      return { ok: false, error: 'INVALID_SESSION' };
    }
    if (row.status === 'verified') {
      return { ok: false, error: 'VERIFIED_IMMUTABLE' };
    }
    if (row.status === 'abandoned') {
      return { ok: true, state: { kind: 'Idle' } };
    }

    const nowIso = wall.nowIso();
    await db.transaction(async (tx) => {
      const txSessionsRepo = createSessionsRepo(tx);
      await txSessionsRepo.setStatus(targetSessionId, 'abandoned', {
        updatedAt: nowIso,
      });

      await txSessionsRepo.appendEvent({
        sessionId: targetSessionId,
        event: 'PARENT_ABANDON',
        fromState: row.status,
        toState: 'abandoned',
        runMs: row.elapsedRunMs,
        createdAt: nowIso,
      });
    });

    if (sessionId === targetSessionId) {
      state = { kind: 'Idle' };
      sessionId = null;
      taskId = null;
    }

    return { ok: true, state: { kind: 'Idle' } };
  }

  return {
    getSnapshot,
    hydrate: () => enqueue(() => doHydrate()),
    start: (newTaskId: number) => enqueue(() => doStart(newTaskId)),
    pause: () => enqueue(() => doPause()),
    resume: () => enqueue(() => doResume()),
    addTime: (ms?: number) => enqueue(() => doAddTime(ms)),
    tick: () => enqueue(() => doTick()),
    requestComplete: () => enqueue(() => doRequestComplete()),
    stop: () => enqueue(() => doStop()),
    verify: (targetSessionId: number, token?: ParentToken) =>
      enqueue(() => doVerify(targetSessionId, token)),
    abandon: (targetSessionId: number, token?: ParentToken) =>
      enqueue(() => doAbandon(targetSessionId, token)),
    checkpoint: () => enqueue(() => doCheckpoint()),
  };
}
