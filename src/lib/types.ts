export type User = {
  id: number;
  email: string;
};

export type Route = {
  id: number;
  userId: number;
  name: string;
  originLabel: string;
  originLat: number;
  originLng: number;
  destLabel: string;
  destLat: number;
  destLng: number;
  viaLabel: string | null;
  viaLat: number | null;
  viaLng: number | null;
  arrivalTarget: string;
  refreshMinutes: number;
  pairedRouteId: number | null;
};

export type Snapshot = {
  id: number;
  routeId: number;
  capturedAt: string;
  durationS: number;
  freeflowS: number;
  historicS: number | null;
  distanceM: number;
  source: string;
};

export type LeaveBySource = "week" | "year" | "current";

export type GeoPoint = {
  lat: number;
  lng: number;
};

export type RouteOptionSource = "current" | "fastest" | "alternative";

export type RouteOption = {
  key: string;
  label: string;
  source: RouteOptionSource;
  durationS: number;
  distanceM: number;
  freeflowS: number;
  historicS: number | null;
  geometry: GeoPoint[];
  pin: GeoPoint | null;
  selected: boolean;
};

export type RouteOptionsPayload = {
  options: RouteOption[];
  mock: boolean;
};

export type RouteTiming = {
  leaveBy: string | null;
  leaveByDurationS: number | null;
  leaveBySource: LeaveBySource | null;
  arriveByNow: string | null;
  nowDurationS: number | null;
  nowSource: LeaveBySource | null;
};

export type RouteOverview = {
  route: Route;
  snapshot: Snapshot | null;
  timing: RouteTiming;
  warning: string | null;
};

export type OverviewPayload = {
  routes: RouteOverview[];
  now: string;
  mock: boolean;
};

export type CurrentPayload = {
  route: Route | null;
  snapshot: Snapshot | null;
  leaveBy: string | null;
  leaveByDurationS: number | null;
  leaveBySource: LeaveBySource | null;
  arriveByNow: string | null;
  originOverride: GeoPoint | null;
  now: string;
  mock: boolean;
  warning: string | null;
};

export type HistoryPoint = {
  day: string;
  dateKey: string;
  durationS: number | null;
  freeflowS: number | null;
  samples: number;
};

export type TrendPoint = {
  capturedAt: string;
  durationS: number;
  freeflowS: number;
  source: string;
};

export type ProfileHour = {
  hour: number;
  durationS: number | null;
  samples: number;
};

export type HistoryPayload = {
  time: string;
  points: HistoryPoint[];
  bestHour: number | null;
  bestHourDurationS: number | null;
  totalSamples: number;
  availableSince: string | null;
  trend: TrendPoint[];
  profile: ProfileHour[];
};

export type YearPayload = {
  time: string;
  points: HistoryPoint[];
  totalSamples: number;
  availableSince: string | null;
};
