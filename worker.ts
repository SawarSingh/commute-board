import {
  insertSnapshot,
  isStale,
  latestSnapshot,
  listAllRoutes,
  viaPoint,
} from "./src/lib/repo";
import { fetchTraffic, usingMockProvider } from "./src/lib/traffic";

const TICK_MS = 30_000;

async function tick(): Promise<void> {
  for (const route of listAllRoutes()) {
    const last = latestSnapshot(route.id);
    if (!isStale(last, route.refreshMinutes)) continue;
    try {
      const traffic = await fetchTraffic(
        route.originLat,
        route.originLng,
        route.destLat,
        route.destLng,
        viaPoint(route),
      );
      insertSnapshot(route.id, traffic);
      console.log(
        `[${new Date().toISOString()}] route ${route.id}: ${Math.round(
          traffic.durationS / 60,
        )} min (${traffic.source})`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${new Date().toISOString()}] route ${route.id} failed: ${message}`);
    }
  }
}

console.log(`commute-board worker started (${usingMockProvider() ? "mock" : "tomtom"})`);
void tick();
setInterval(() => void tick(), TICK_MS);
