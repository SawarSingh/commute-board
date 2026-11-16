import { snapshotsBetween, snapshotsSince } from "./repo";
import { predictDurationAt, solveLeaveBy } from "./predict";
import { nextISTHHMMToDate } from "./time";
import type { Route, RouteTiming, Snapshot } from "./types";

const DAY_MS = 24 * 60 * 60 * 1000;

const EMPTY_TIMING: RouteTiming = {
  leaveBy: null,
  leaveByDurationS: null,
  leaveBySource: null,
  arriveByNow: null,
  nowDurationS: null,
  nowSource: null,
};

function timingFrom(
  route: Route,
  snapshot: Snapshot,
  week: Snapshot[],
  year: Snapshot[],
  now: Date,
): RouteTiming {
  const nowMs = now.getTime();
  const arrival = nextISTHHMMToDate(route.arrivalTarget, now);
  const solved = solveLeaveBy(arrival, week, year, snapshot.durationS);

  const nowPrediction = predictDurationAt(week, year, now);
  const nowDurationS = nowPrediction ? nowPrediction.durationS : snapshot.durationS;

  return {
    leaveBy: solved.leaveBy.toISOString(),
    leaveByDurationS: Math.round(solved.durationS),
    leaveBySource: solved.source,
    arriveByNow: new Date(nowMs + nowDurationS * 1000).toISOString(),
    nowDurationS: Math.round(nowDurationS),
    nowSource: nowPrediction ? nowPrediction.source : "current",
  };
}

export function computeRouteTiming(
  route: Route,
  snapshot: Snapshot | null,
  now: Date = new Date(),
): RouteTiming {
  if (!snapshot) return EMPTY_TIMING;

  const nowMs = now.getTime();
  const week = snapshotsSince(route.id, new Date(nowMs - 7 * DAY_MS).toISOString());
  const year = snapshotsBetween(
    route.id,
    new Date(nowMs - 372 * DAY_MS).toISOString(),
    new Date(nowMs - 357 * DAY_MS).toISOString(),
  );

  return timingFrom(route, snapshot, week, year, now);
}

export function computeLiveTiming(
  route: Route,
  snapshot: Snapshot | null,
  now: Date = new Date(),
): RouteTiming {
  if (!snapshot) return EMPTY_TIMING;
  return timingFrom(route, snapshot, [], [], now);
}

export function upcomingSortKey(
  route: Route,
  timing: RouteTiming,
  now: Date = new Date(),
): number {
  if (timing.leaveBy) return new Date(timing.leaveBy).getTime();
  return nextISTHHMMToDate(route.arrivalTarget, now).getTime();
}
