const OFFSET_MS = 5.5 * 60 * 60 * 1000;

function shift(date: Date): Date {
  return new Date(date.getTime() + OFFSET_MS);
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function istDateKey(date: Date): string {
  return shift(date).toISOString().slice(0, 10);
}

export function istMinutesOfDay(date: Date): number {
  const s = shift(date);
  return s.getUTCHours() * 60 + s.getUTCMinutes();
}

export function istDayOfWeek(date: Date): number {
  return shift(date).getUTCDay();
}

export function istNowHHMM(date: Date = new Date()): string {
  const s = shift(date);
  return `${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}`;
}

export function istHHMMToDate(hhmm: string, base: Date = new Date()): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const s = shift(base);
  return new Date(
    Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate(), h, m) - OFFSET_MS,
  );
}

export function nextISTHHMMToDate(hhmm: string, base: Date = new Date()): Date {
  const target = istHHMMToDate(hhmm, base);
  if (target.getTime() <= base.getTime()) {
    return new Date(target.getTime() + 24 * 60 * 60 * 1000);
  }
  return target;
}

export function circularMinuteDistance(a: number, b: number): number {
  const diff = Math.abs(a - b);
  return Math.min(diff, 1440 - diff);
}

export function minusOneYear(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return new Date(
    Date.UTC(date.getUTCFullYear() - 1, date.getUTCMonth(), date.getUTCDate()),
  )
    .toISOString()
    .slice(0, 10);
}

export function lastSevenISTDays(now: Date = new Date()): string[] {
  const days: string[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    days.push(istDateKey(new Date(now.getTime() - i * 24 * 60 * 60 * 1000)));
  }
  return days;
}
