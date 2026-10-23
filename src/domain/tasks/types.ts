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
}

export interface NewTask {
  title: string;
  emoji?: string | null;
  targetMinutes: number;
  daysMask: number;
  sortOrder?: number;
}

export type TodayTaskStatus = 'idle' | 'running' | 'paused' | 'completed' | 'verified';

export interface TodayTaskView extends Task {
  sessionId: number | null;
  status: TodayTaskStatus;
}
