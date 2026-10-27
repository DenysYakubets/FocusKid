export interface Task {
  id: number;
  title: string;
  emoji: string | null;
  targetMinutes: number;
  daysMask: number;
  sortOrder: number;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  /** C4: times per day (1..10, default 1). */
  targetPerDay: number;
  category: string;
}

export interface NewTask {
  title: string;
  emoji?: string | null;
  targetMinutes: number;
  daysMask: number;
  sortOrder?: number;
  /** C4: times per day (1..10, default 1). */
  targetPerDay?: number;
  category?: string;
}

export type TodayTaskStatus = 'idle' | 'running' | 'paused' | 'completed' | 'verified';

export interface TodayTaskView extends Task {
  sessionId: number | null;
  status: TodayTaskStatus;
  /** C4: completed (or awaiting) sessions for this task today. */
  completedToday: number;
}
