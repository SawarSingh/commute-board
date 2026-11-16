import { istDayOfWeek, istMinutesOfDay } from "./time";

export type TrafficResult = {
  durationS: number;
  freeflowS: number;
  historicS: number | null;
  distanceM: number;
  source: "tomtom" | "mock";
};

export type PlaceSuggestion = {
  id: string;
  label: string;
  detail: string;
  lat: number;
  lng: number;
};

type MockPlace = { label: string; detail: string; lat: number; lng: number };

const MOCK_PLACES: MockPlace[] = [
  { label: "Connaught Place", detail: "New Delhi", lat: 28.6315, lng: 77.2167 },
  { label: "India Gate", detail: "Rajpath, New Delhi", lat: 28.6129, lng: 77.2295 },
  { label: "Chandni Chowk", detail: "Old Delhi", lat: 28.6506, lng: 77.23 },
  { label: "Karol Bagh Metro", detail: "New Delhi", lat: 28.6519, lng: 77.1886 },
  { label: "Hauz Khas Village", detail: "South Delhi", lat: 28.5535, lng: 77.1948 },
  { label: "Nehru Place", detail: "South Delhi", lat: 28.5494, lng: 77.2507 },
  { label: "Lajpat Nagar", detail: "South Delhi", lat: 28.5677, lng: 77.2433 },
  { label: "Select Citywalk, Saket", detail: "South Delhi", lat: 28.5286, lng: 77.2197 },
  { label: "Cyber Hub, DLF Cyber City", detail: "Gurugram", lat: 28.4949, lng: 77.0887 },
  { label: "Golf Course Road", detail: "Gurugram", lat: 28.4398, lng: 77.1025 },
  { label: "IGI Airport Terminal 3", detail: "New Delhi", lat: 28.5562, lng: 77.1 },
  { label: "Aerocity", detail: "New Delhi", lat: 28.551, lng: 77.12 },
  { label: "Dwarka Sector 21", detail: "New Delhi", lat: 28.552, lng: 77.058 },
  { label: "Noida Sector 18", detail: "Noida", lat: 28.5708, lng: 77.326 },
  { label: "Rohini Sector 18", detail: "North West Delhi", lat: 28.7445, lng: 77.118 },
  { label: "Vaishali Metro", detail: "Ghaziabad", lat: 28.65, lng: 77.34 },
];

export async function searchPlaces(query: string): Promise<PlaceSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  if (!API_KEY) {
    const needle = trimmed.toLowerCase();
    return MOCK_PLACES.filter((place) =>
      `${place.label} ${place.detail}`.toLowerCase().includes(needle),
    )
      .slice(0, 6)
      .map((place, index) => ({ id: `mock-${index}`, ...place }));
  }

  const url =
    `https://api.tomtom.com/search/2/search/${encodeURIComponent(trimmed)}.json` +
    `?key=${API_KEY}&countrySet=IN&typeahead=true&limit=6&language=en-GB` +
    `&lat=28.6139&lon=77.209&radius=50000`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Search failed (${res.status})`);
  const data = (await res.json()) as {
    results?: Array<{
      id?: string;
      poi?: { name?: string };
      address?: { freeformAddress?: string };
      position?: { lat: number; lon: number };
    }>;
  };

  const seen = new Set<string>();
  const suggestions: PlaceSuggestion[] = [];
  for (const [index, hit] of (data.results ?? []).entries()) {
    if (!hit.position) continue;
    const address = hit.address?.freeformAddress ?? "";
    const label = hit.poi?.name ?? address;
    if (!label) continue;
    const detail = address === label ? "" : address;
    const key = `${label}|${detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    suggestions.push({
      id: hit.id ?? `${hit.position.lat},${hit.position.lon},${index}`,
      label,
      detail,
      lat: hit.position.lat,
      lng: hit.position.lon,
    });
  }
  return suggestions;
}

const API_KEY = process.env.TOMTOM_API_KEY?.trim() ?? "";

export function usingMockProvider(): boolean {
  return API_KEY.length === 0;
}

function haversineMeters(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function congestionFactor(date: Date): number {
  const minutes = istMinutesOfDay(date);
  const day = istDayOfWeek(date);
  const weekend = day === 0 || day === 6;
  const gauss = (mu: number, sigma: number) => Math.exp(-((minutes - mu) ** 2) / (2 * sigma ** 2));
  const morning = gauss(9 * 60, 70);
  const evening = gauss(18 * 60 + 30, 90);
  let factor = 1 + (weekend ? 0.3 : 0.95) * morning + (weekend ? 0.35 : 1.05) * evening;
  factor += (Math.sin(minutes / 7) + 1) * 0.02;
  return Math.max(0.85, Math.min(2.6, factor));
}

function mockTraffic(originLat: number, originLng: number, destLat: number, destLng: number): TrafficResult {
  const now = new Date();
  const straight = haversineMeters(originLat, originLng, destLat, destLng);
  const distanceM = Math.round(straight * 1.35);
  const freeflowS = Math.round((distanceM / 1000 / 45) * 3600);
  const durationS = Math.round(freeflowS * congestionFactor(now));
  return { durationS, freeflowS, historicS: null, distanceM, source: "mock" };
}

type RoutingInstruction = {
  routeOffsetInMeters?: number;
  street?: string;
  roadNumbers?: string[];
};

type RoutingRoute = {
  summary?: {
    lengthInMeters?: number;
    travelTimeInSeconds?: number;
    noTrafficTravelTimeInSeconds?: number;
    historicTrafficTravelTimeInSeconds?: number;
  };
  legs?: Array<{ points?: Array<{ latitude: number; longitude: number }> }>;
  guidance?: { instructions?: RoutingInstruction[] };
};

type RoutingResponse = {
  routes?: RoutingRoute[];
};

export async function fetchTraffic(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  via?: { lat: number; lng: number } | null,
): Promise<TrafficResult> {
  if (!API_KEY) return mockTraffic(originLat, originLng, destLat, destLng);
  const path = via
    ? `${originLat},${originLng}:${via.lat},${via.lng}:${destLat},${destLng}`
    : `${originLat},${originLng}:${destLat},${destLng}`;
  const url =
    `https://api.tomtom.com/routing/1/calculateRoute/` +
    `${path}/json` +
    `?key=${API_KEY}&traffic=true&travelMode=car&routeType=fastest&computeTravelTimeFor=all`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  const data = (await res.json()) as RoutingResponse;
  const summary = data.routes?.[0]?.summary;
  if (!summary?.travelTimeInSeconds) throw new Error("No route found");
  return {
    durationS: summary.travelTimeInSeconds,
    freeflowS: summary.noTrafficTravelTimeInSeconds ?? summary.travelTimeInSeconds,
    historicS: summary.historicTrafficTravelTimeInSeconds ?? null,
    distanceM: summary.lengthInMeters ?? 0,
    source: "tomtom",
  };
}

export type RouteOptionDraft = {
  label: string;
  durationS: number;
  freeflowS: number;
  historicS: number | null;
  distanceM: number;
  geometry: Array<{ lat: number; lng: number }>;
  pin: { lat: number; lng: number } | null;
};

const GENERIC_ROAD = /^(dwarka|gurugram|gurgaon|new delhi|delhi)$/i;
const ROUTE_OPTIONS_TTL_MS = 120_000;
const routeOptionsCache = new Map<
  string,
  { expires: number; value: RouteOptionDraft[] }
>();

function simplifyPoints<T extends { lat: number; lng: number }>(points: T[], max = 120): T[] {
  if (points.length <= max) return points;
  const step = Math.ceil(points.length / max);
  const out: T[] = [];
  for (let index = 0; index < points.length; index += step) out.push(points[index]);
  const last = points[points.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function cleanRoadName(street?: string, roadNumbers?: string[]): string | null {
  const name = street?.trim();
  if (name && !GENERIC_ROAD.test(name)) return name;
  const number = roadNumbers?.[0]?.trim();
  return number || null;
}

function deriveRouteLabel(route: RoutingRoute, index: number): string {
  const total = route.summary?.lengthInMeters ?? 0;
  const instructions = route.guidance?.instructions ?? [];
  const scores = new Map<string, number>();
  for (let position = 0; position < instructions.length; position += 1) {
    const start = instructions[position].routeOffsetInMeters;
    if (start === undefined) continue;
    const end = instructions[position + 1]?.routeOffsetInMeters ?? total;
    const distance = Math.max(0, end - start);
    const name = cleanRoadName(
      instructions[position].street,
      instructions[position].roadNumbers,
    );
    if (!name) continue;
    scores.set(name, (scores.get(name) ?? 0) + distance);
  }
  const best = [...scores.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best && total > 0 && best[1] >= total * 0.12) return best[0];
  return index === 0 ? "Fastest" : `Alternative ${index}`;
}

function uniqueLabel(label: string, used: Map<string, number>): string {
  const count = used.get(label) ?? 0;
  used.set(label, count + 1);
  return count === 0 ? label : `${label} ${count + 1}`;
}

function routeGeometry(route: RoutingRoute): Array<{ lat: number; lng: number }> {
  const points: Array<{ lat: number; lng: number }> = [];
  for (const leg of route.legs ?? []) {
    for (const point of leg.points ?? []) {
      points.push({ lat: point.latitude, lng: point.longitude });
    }
  }
  return simplifyPoints(points);
}

function farthestPoint(
  reference: Array<{ lat: number; lng: number }>,
  candidate: Array<{ lat: number; lng: number }>,
): { lat: number; lng: number } | null {
  if (candidate.length === 0) return null;
  const sample = simplifyPoints(candidate, 50);
  const anchors = simplifyPoints(reference, 50);
  if (anchors.length === 0) return sample[Math.floor(sample.length / 2)] ?? null;
  let best = sample[0];
  let bestDistance = -1;
  for (const point of sample) {
    let nearest = Infinity;
    for (const anchor of anchors) {
      const distance = haversineMeters(point.lat, point.lng, anchor.lat, anchor.lng);
      if (distance < nearest) nearest = distance;
    }
    if (nearest > bestDistance) {
      bestDistance = nearest;
      best = point;
    }
  }
  if (bestDistance > 350) return best;
  return sample[Math.floor(sample.length / 2)] ?? null;
}

export function routeOptionsSimilar(a: RouteOptionDraft, b: RouteOptionDraft): boolean {
  if (
    Math.abs(a.durationS - b.durationS) < 60 &&
    Math.abs(a.distanceM - b.distanceM) < 400
  ) {
    return true;
  }
  const sample = simplifyPoints(a.geometry, 30);
  const reference = simplifyPoints(b.geometry, 60);
  if (sample.length === 0 || reference.length === 0) return false;
  let total = 0;
  for (const point of sample) {
    let nearest = Infinity;
    for (const anchor of reference) {
      const distance = haversineMeters(point.lat, point.lng, anchor.lat, anchor.lng);
      if (distance < nearest) nearest = distance;
    }
    total += nearest;
  }
  return total / sample.length < 180;
}

function mockRouteOptions(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
): RouteOptionDraft[] {
  const straight = haversineMeters(originLat, originLng, destLat, destLng);
  const baseDistance = Math.round(straight * 1.35);
  const baseFreeflow = Math.round((baseDistance / 1000 / 45) * 3600);
  const factor = congestionFactor(new Date());
  const midLat = (originLat + destLat) / 2;
  const midLng = (originLng + destLng) / 2;
  const dLat = destLat - originLat;
  const dLng = destLng - originLng;
  const perpLat = -dLng;
  const perpLng = dLat;
  const norm = Math.hypot(perpLat, perpLng) || 1;
  const bend = (offset: number) => ({
    lat: midLat + (perpLat / norm) * offset,
    lng: midLng + (perpLng / norm) * offset,
  });
  const variants = [
    { label: "Fastest", offset: 0.003, durationScale: 1, distanceScale: 1, pin: false },
    { label: "Via city", offset: 0.018, durationScale: 1.08, distanceScale: 1.45, pin: true },
    { label: "Outer road", offset: -0.02, durationScale: 1.16, distanceScale: 1.55, pin: true },
  ];
  return variants.map((variant) => {
    const pivot = bend(variant.offset);
    const geometry = [
      { lat: originLat, lng: originLng },
      {
        lat: originLat * 0.65 + pivot.lat * 0.35,
        lng: originLng * 0.65 + pivot.lng * 0.35,
      },
      pivot,
      {
        lat: pivot.lat * 0.35 + destLat * 0.65,
        lng: pivot.lng * 0.35 + destLng * 0.65,
      },
      { lat: destLat, lng: destLng },
    ];
    const distanceM = Math.round(baseDistance * variant.distanceScale);
    const freeflowS = Math.round(baseFreeflow * variant.distanceScale);
    return {
      label: variant.label,
      durationS: Math.round(freeflowS * factor * variant.durationScale),
      freeflowS,
      historicS: null,
      distanceM,
      geometry,
      pin: variant.pin ? pivot : null,
    };
  });
}

export async function fetchRouteOptions(
  originLat: number,
  originLng: number,
  destLat: number,
  destLng: number,
  via?: { lat: number; lng: number } | null,
  maxAlternatives = 2,
): Promise<RouteOptionDraft[]> {
  if (!API_KEY) return mockRouteOptions(originLat, originLng, destLat, destLng);

  const alternatives = Math.max(0, Math.min(5, Math.trunc(maxAlternatives)));
  const cacheKey = [
    originLat.toFixed(4),
    originLng.toFixed(4),
    destLat.toFixed(4),
    destLng.toFixed(4),
    via ? `${via.lat.toFixed(4)},${via.lng.toFixed(4)}` : "none",
    alternatives,
  ].join("|");
  const cached = routeOptionsCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.value;

  const path = via
    ? `${originLat},${originLng}:${via.lat},${via.lng}:${destLat},${destLng}`
    : `${originLat},${originLng}:${destLat},${destLng}`;
  const url =
    `https://api.tomtom.com/routing/1/calculateRoute/${path}/json` +
    `?key=${API_KEY}&traffic=true&travelMode=car&routeType=fastest` +
    `&maxAlternatives=${alternatives}&computeTravelTimeFor=all` +
    `&instructionsType=text&language=en-GB`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Routing failed (${res.status})`);
  const data = (await res.json()) as RoutingResponse;
  const routes = data.routes ?? [];
  if (routes.length === 0) throw new Error("No route found");

  const used = new Map<string, number>();
  const drafts = routes.map((route, index) => {
    const summary = route.summary;
    if (!summary?.travelTimeInSeconds) throw new Error("No route found");
    return {
      label: uniqueLabel(deriveRouteLabel(route, index), used),
      durationS: summary.travelTimeInSeconds,
      freeflowS: summary.noTrafficTravelTimeInSeconds ?? summary.travelTimeInSeconds,
      historicS: summary.historicTrafficTravelTimeInSeconds ?? null,
      distanceM: summary.lengthInMeters ?? 0,
      geometry: routeGeometry(route),
      pin: null as { lat: number; lng: number } | null,
    };
  });

  const fastestGeometry = drafts[0]?.geometry ?? [];
  for (let index = 1; index < drafts.length; index += 1) {
    drafts[index].pin = farthestPoint(fastestGeometry, drafts[index].geometry);
  }
  if (via && drafts[0]) drafts[0].pin = { lat: via.lat, lng: via.lng };
  drafts.sort((a, b) => a.durationS - b.durationS);

  routeOptionsCache.set(cacheKey, {
    expires: Date.now() + ROUTE_OPTIONS_TTL_MS,
    value: drafts,
  });
  return drafts;
}
