import { gunzipSync } from "node:zlib";
import { deleteSnapshotsBySource, insertSnapshotAt, listAllRoutes } from "../src/lib/repo";
import { lastSevenISTDays, minusOneYear } from "../src/lib/time";
import type { Route } from "../src/lib/types";

const BASE = "https://api.tomtom.com/traffic/trafficstats";
const SOURCE = "traffic-stats";
const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

type JobStatus = {
  jobId: string;
  jobState: string;
  urls?: string[];
};

type StatsSummary = {
  dateRange: number;
  timeSet: number;
  distance: number;
  averageTravelTime: number;
  medianTravelTime: number;
};

type StatsResult = {
  dateRanges: Array<{ "@id": number; from: string; to: string }>;
  timeSets: Array<{ "@id": number; name: string }>;
  routes: Array<{ summaries: StatsSummary[] }>;
};

type BackfillRow = {
  capturedAt: string;
  durationS: number;
  distanceM: number;
  medianS: number | null;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function argValue(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function pickRoute(): Route {
  const routes = listAllRoutes();
  const requested = argValue("--route");
  if (requested) {
    const route = routes.find((item) => item.id === Number(requested));
    if (!route) throw new Error(`No route with id ${requested}`);
    return route;
  }
  if (routes.length === 0) throw new Error("No routes saved yet");
  if (routes.length > 1) {
    throw new Error(
      `Multiple routes found (${routes.map((item) => item.id).join(", ")}). Pass --route <id>.`,
    );
  }
  return routes[0];
}

function buildTimeSets() {
  return Array.from({ length: 24 }, (_, hour) => {
    const from = `${pad(hour)}:00`;
    const to = hour === 23 ? "24:00" : `${pad(hour + 1)}:00`;
    return {
      name: `${from}-${to}`,
      timeGroups: [{ days: DAYS, times: [`${from}-${to}`] }],
    };
  });
}

function buildDateRanges() {
  const current = lastSevenISTDays();
  const previous = current.map(minusOneYear);
  return [...new Set([...previous, ...current])].map((day) => ({
    name: day,
    from: day,
    to: day,
  }));
}

async function submitJob(key: string, route: Route): Promise<string> {
  const body = {
    jobName: `commute-board backfill route ${route.id} ${new Date().toISOString()}`,
    distanceUnit: "KILOMETERS",
    routes: [
      {
        name: route.name,
        start: { latitude: route.originLat, longitude: route.originLng },
        end: { latitude: route.destLat, longitude: route.destLng },
        fullTraversal: false,
        zoneId: "Asia/Kolkata",
        probeSource: "ALL",
      },
    ],
    dateRanges: buildDateRanges(),
    timeSets: buildTimeSets(),
  };
  const response = await fetch(`${BASE}/routeanalysis/1?key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Job request failed (${response.status}): ${text}`);
  const created = JSON.parse(text) as { jobId?: string };
  if (!created.jobId) throw new Error(`Job not created: ${text}`);
  return created.jobId;
}

async function waitForResult(key: string, jobId: string): Promise<string> {
  const deadline = Date.now() + 20 * 60 * 1000;
  let last = "";
  while (Date.now() < deadline) {
    await sleep(5000);
    const response = await fetch(`${BASE}/status/1/${jobId}?key=${encodeURIComponent(key)}`);
    if (!response.ok) throw new Error(`Status check failed (${response.status})`);
    const status = (await response.json()) as JobStatus;
    if (status.jobState !== last) {
      process.stdout.write(`${status.jobState}\n`);
      last = status.jobState;
    }
    if (status.jobState === "NEED_CONFIRMATION") {
      await fetch(`${BASE}/status/1/${jobId}/accept?key=${encodeURIComponent(key)}`, {
        method: "POST",
      });
      continue;
    }
    if (status.jobState === "DONE") {
      const jsonUrl = status.urls?.find((url) => url.includes(".json")) ?? status.urls?.[1];
      if (!jsonUrl) throw new Error("Job finished without a JSON result URL");
      return jsonUrl;
    }
    if (["ERROR", "REJECTED", "CANCELLED", "EXPIRED"].includes(status.jobState)) {
      throw new Error(`Job ended as ${status.jobState}`);
    }
  }
  throw new Error("Timed out waiting for the Traffic Stats job");
}

async function downloadResult(url: string): Promise<StatsResult> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Result download failed (${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  const gzip = buffer.length > 2 && buffer[0] === 0x1f && buffer[1] === 0x8b;
  const text = (gzip ? gunzipSync(buffer) : buffer).toString("utf8");
  return JSON.parse(text) as StatsResult;
}

function toRows(result: StatsResult): BackfillRow[] {
  const days = new Map(result.dateRanges.map((range) => [range["@id"], range.from]));
  const starts = new Map(result.timeSets.map((set) => [set["@id"], set.name.split("-")[0]]));
  const now = Date.now();
  const rows: BackfillRow[] = [];
  for (const route of result.routes ?? []) {
    for (const summary of route.summaries ?? []) {
      const day = days.get(summary.dateRange);
      const start = starts.get(summary.timeSet);
      if (!day || !start || !summary.averageTravelTime) continue;
      const capturedAt = new Date(`${day}T${start}:30:00+05:30`).toISOString();
      if (new Date(capturedAt).getTime() > now) continue;
      rows.push({
        capturedAt,
        durationS: Math.round(summary.averageTravelTime),
        distanceM: Math.round(summary.distance ?? 0),
        medianS: summary.medianTravelTime ? Math.round(summary.medianTravelTime) : null,
      });
    }
  }
  return rows;
}

async function main() {
  const key = (argValue("--key") ?? process.env.TOMTOM_STATS_API_KEY ?? "").trim();
  if (!key) {
    throw new Error(
      "Missing Traffic Stats key. Start the 30-day trial at https://move.tomtom.com/register, " +
        "then set TOMTOM_STATS_API_KEY in .env.local or pass --key.",
    );
  }

  const route = pickRoute();
  const dateRanges = buildDateRanges();
  console.log(`Route ${route.id}: ${route.originLabel} -> ${route.destLabel}`);
  console.log(`Days: ${dateRanges.map((range) => range.from).join(", ")}`);
  console.log("Time sets: 24 hourly windows");

  if (process.argv.includes("--dry-run")) {
    console.log("Dry run only; no job submitted.");
    return;
  }

  const jobId = await submitJob(key, route);
  console.log(`Submitted job ${jobId}; waiting for results...`);
  const url = await waitForResult(key, jobId);
  const result = await downloadResult(url);
  const rows = toRows(result);
  if (rows.length === 0) {
    console.log("No summaries returned; nothing imported.");
    return;
  }

  const removed = deleteSnapshotsBySource(route.id, SOURCE);
  for (const row of rows) {
    insertSnapshotAt(route.id, row.capturedAt, {
      durationS: row.durationS,
      freeflowS: row.durationS,
      historicS: row.medianS,
      distanceM: row.distanceM,
      source: SOURCE,
    });
  }
  const daysWithData = new Set(rows.map((row) => row.capturedAt.slice(0, 10))).size;
  console.log(
    `Imported ${rows.length} readings across ${daysWithData} days (replaced ${removed} older imports).`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
