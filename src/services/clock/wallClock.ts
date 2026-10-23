export interface WallClock {
  todayLocalDate(): string;
  weekdayIndex(localDate?: string): number;
  addDays(localDate: string, n: number): string;
  nowIso(): string;
}

export const systemWallClock: WallClock = {
  todayLocalDate(): string {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  weekdayIndex(localDate?: string): number {
    if (localDate) {
      const parts = localDate.split('-');
      const year = Number(parts[0]);
      const month = Number(parts[1]);
      const day = Number(parts[2]);
      const d = new Date(year, month - 1, day);
      return (d.getDay() + 6) % 7;
    }
    const d = new Date();
    return (d.getDay() + 6) % 7;
  },

  addDays(localDate: string, n: number): string {
    const parts = localDate.split('-');
    const year = Number(parts[0]);
    const month = Number(parts[1]);
    const day = Number(parts[2]);
    const d = new Date(year, month - 1, day + n);
    const resYear = d.getFullYear();
    const resMonth = String(d.getMonth() + 1).padStart(2, '0');
    const resDay = String(d.getDate()).padStart(2, '0');
    return `${resYear}-${resMonth}-${resDay}`;
  },

  nowIso(): string {
    return new Date().toISOString();
  },
};
