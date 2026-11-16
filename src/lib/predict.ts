import { circularMinuteDistance, istMinutesOfDay } from "./time";
import type { Snapshot } from "./types";

const WINDOW_MINUTES = 30;

export type PredictionSource = "week" | "year";

type Prediction = { durationS: number; samples: number; source: PredictionSource };

function averageWithin(
  snapshots: Snapshot[],
  minutes: number,
): { durationS: number; samples: number } | null {
  let total = 0;
  let samples = 0;
  for (const snapshot of snapshots) {
    const at = istMinutesOfDay(new Date(snapshot.capturedAt));
    if (circularMinuteDistance(at, minutes) > WINDOW_MINUTES) continue;
    total += snapshot.durationS;
    samples += 1;
  }
  return samples > 0 ? { durationS: total / samples, samples } : null;
}

export function predictDurationAt(
  week: Snapshot[],
  year: Snapshot[],
  when: Date,
): Prediction | null {
  const minutes = istMinutesOfDay(when);
  const recent = averageWithin(week, minutes);
  if (recent) return { ...recent, source: "week" };
  const older = averageWithin(year, minutes);
  if (older) return { ...older, source: "year" };
  return null;
}

export type LeaveBySolution = {
  leaveBy: Date;
  durationS: number;
  source: PredictionSource | "current";
  samples: number;
};

export function solveLeaveBy(
  arrival: Date,
  week: Snapshot[],
  year: Snapshot[],
  fallbackS: number,
): LeaveBySolution {
  let durationS = fallbackS;
  let source: PredictionSource | "current" = "current";
  let samples = 0;
  let leaveBy = new Date(arrival.getTime() - durationS * 1000);

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const prediction = predictDurationAt(week, year, leaveBy);
    if (!prediction) break;
    durationS = prediction.durationS;
    source = prediction.source;
    samples = prediction.samples;
    const next = new Date(arrival.getTime() - durationS * 1000);
    const stable = Math.abs(next.getTime() - leaveBy.getTime()) < 30 * 1000;
    leaveBy = next;
    if (stable) break;
  }

  return { leaveBy, durationS, source, samples };
}
