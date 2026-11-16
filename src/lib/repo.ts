import { db } from "./db";
import { hashToken, newSessionToken, sessionMaxAgeSeconds } from "./tokens";
import type { Route, Snapshot } from "./types";

export type SessionUser = { id: number; email: string };

type UserRow = {
  id: number;
  email: string;
  password_hash: string;
};

type RouteRow = {
  id: number;
  user_id: number;
  name: string;
  origin_label: string;
  origin_lat: number;
  origin_lng: number;
  dest_label: string;
  dest_lat: number;
  dest_lng: number;
  via_label: string | null;
  via_lat: number | null;
  via_lng: number | null;
  arrival_target: string;
  refresh_minutes: number;
  paired_route_id: number | null;
};

type SnapshotRow = {
  id: number;
  route_id: number;
  captured_at: string;
  duration_s: number;
  freeflow_s: number;
  historic_s: number | null;
  distance_m: number;
  source: string;
};

function mapRoute(row: RouteRow): Route {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    originLabel: row.origin_label,
    originLat: row.origin_lat,
    originLng: row.origin_lng,
    destLabel: row.dest_label,
    destLat: row.dest_lat,
    destLng: row.dest_lng,
    viaLabel: row.via_label ?? null,
    viaLat: row.via_lat ?? null,
    viaLng: row.via_lng ?? null,
    arrivalTarget: row.arrival_target,
    refreshMinutes: row.refresh_minutes,
    pairedRouteId: row.paired_route_id ?? null,
  };
}

function mapSnapshot(row: SnapshotRow): Snapshot {
  return {
    id: row.id,
    routeId: row.route_id,
    capturedAt: row.captured_at,
    durationS: row.duration_s,
    freeflowS: row.freeflow_s,
    historicS: row.historic_s,
    distanceM: row.distance_m,
    source: row.source,
  };
}

export function createUser(email: string, passwordHash: string): SessionUser {
  const result = db
    .prepare("INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)")
    .run(email, passwordHash, new Date().toISOString());
  return { id: Number(result.lastInsertRowid), email };
}

export function findUserByEmail(email: string): (SessionUser & { passwordHash: string }) | null {
  const row = db
    .prepare("SELECT id, email, password_hash FROM users WHERE email = ?")
    .get(email) as UserRow | undefined;
  if (!row) return null;
  return { id: row.id, email: row.email, passwordHash: row.password_hash };
}

export function createSession(userId: number): string {
  const token = newSessionToken();
  const now = new Date();
  const expires = new Date(now.getTime() + sessionMaxAgeSeconds * 1000);
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(now.toISOString());
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    hashToken(token),
    userId,
    expires.toISOString(),
  );
  return token;
}

export function findUserByToken(tokenHash: string): SessionUser | null {
  const row = db
    .prepare(
      `SELECT u.id, u.email
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .get(tokenHash, new Date().toISOString()) as { id: number; email: string } | undefined;
  return row ?? null;
}

export function deleteSession(tokenHash: string): void {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(tokenHash);
}

export function listRoutesForUser(userId: number): Route[] {
  const rows = db
    .prepare("SELECT * FROM routes WHERE user_id = ? ORDER BY id")
    .all(userId) as RouteRow[];
  return rows.map(mapRoute);
}

export function getRouteById(userId: number, routeId: number): Route | null {
  const row = db
    .prepare("SELECT * FROM routes WHERE id = ? AND user_id = ?")
    .get(routeId, userId) as RouteRow | undefined;
  return row ? mapRoute(row) : null;
}

export function getRouteForUser(userId: number): Route | null {
  const row = db
    .prepare("SELECT * FROM routes WHERE user_id = ? ORDER BY id LIMIT 1")
    .get(userId) as RouteRow | undefined;
  return row ? mapRoute(row) : null;
}

export type RouteInput = {
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
};

export function viaPoint(route: Route): { lat: number; lng: number } | null {
  if (route.viaLat === null || route.viaLng === null) return null;
  return { lat: route.viaLat, lng: route.viaLng };
}

export function createRoute(userId: number, input: RouteInput): Route {
  const result = db
    .prepare(
      `INSERT INTO routes
        (user_id, name, origin_label, origin_lat, origin_lng,
         dest_label, dest_lat, dest_lng, via_label, via_lat, via_lng,
         arrival_target, refresh_minutes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      userId,
      input.name,
      input.originLabel,
      input.originLat,
      input.originLng,
      input.destLabel,
      input.destLat,
      input.destLng,
      input.viaLabel,
      input.viaLat,
      input.viaLng,
      input.arrivalTarget,
      input.refreshMinutes,
      new Date().toISOString(),
    );
  const row = db
    .prepare("SELECT * FROM routes WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as RouteRow;
  return mapRoute(row);
}

export function setRoutePair(userId: number, routeId: number, pairedRouteId: number | null): void {
  db.prepare("UPDATE routes SET paired_route_id = ? WHERE id = ? AND user_id = ?").run(
    pairedRouteId,
    routeId,
    userId,
  );
}

function plusHours(hhmm: string, hours: number): string {
  const [hour, minute] = hhmm.split(":").map(Number);
  const total = (hour * 60 + minute + hours * 60) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function createReverseRoute(userId: number, route: Route): Route {
  const paired = createRoute(userId, {
    name: `${route.destLabel} to ${route.originLabel}`,
    originLabel: route.destLabel,
    originLat: route.destLat,
    originLng: route.destLng,
    destLabel: route.originLabel,
    destLat: route.originLat,
    destLng: route.originLng,
    viaLabel: route.viaLabel,
    viaLat: route.viaLat,
    viaLng: route.viaLng,
    arrivalTarget: plusHours(route.arrivalTarget, 9),
    refreshMinutes: route.refreshMinutes,
  });
  setRoutePair(userId, route.id, paired.id);
  setRoutePair(userId, paired.id, route.id);
  return getRouteById(userId, paired.id) ?? paired;
}

export function updateRoute(userId: number, routeId: number, input: RouteInput): Route | null {
  const existing = getRouteById(userId, routeId);
  if (!existing) return null;
  const originMoved =
    existing.originLat !== input.originLat || existing.originLng !== input.originLng;
  const destMoved = existing.destLat !== input.destLat || existing.destLng !== input.destLng;
  const viaMoved = existing.viaLat !== input.viaLat || existing.viaLng !== input.viaLng;
  const originChanged = originMoved || existing.originLabel !== input.originLabel;
  const destChanged = destMoved || existing.destLabel !== input.destLabel;
  const viaChanged = viaMoved || existing.viaLabel !== input.viaLabel;

  db.prepare(
    `UPDATE routes SET
      name = ?, origin_label = ?, origin_lat = ?, origin_lng = ?,
      dest_label = ?, dest_lat = ?, dest_lng = ?,
      via_label = ?, via_lat = ?, via_lng = ?,
      arrival_target = ?, refresh_minutes = ?
     WHERE id = ? AND user_id = ?`,
  ).run(
    input.name,
    input.originLabel,
    input.originLat,
    input.originLng,
    input.destLabel,
    input.destLat,
    input.destLng,
    input.viaLabel,
    input.viaLat,
    input.viaLng,
    input.arrivalTarget,
    input.refreshMinutes,
    routeId,
    userId,
  );
  if (originMoved || destMoved || viaMoved) {
    db.prepare("DELETE FROM snapshots WHERE route_id = ?").run(routeId);
  }

  if (existing.pairedRouteId && (originChanged || destChanged || viaChanged)) {
    const pair = getRouteById(userId, existing.pairedRouteId);
    if (pair && (originChanged || destChanged)) {
      const pairOriginLat = input.destLat;
      const pairOriginLng = input.destLng;
      const pairDestLat = input.originLat;
      const pairDestLng = input.originLng;
      const pairMoved =
        pair.originLat !== pairOriginLat ||
        pair.originLng !== pairOriginLng ||
        pair.destLat !== pairDestLat ||
        pair.destLng !== pairDestLng ||
        pair.viaLat !== input.viaLat ||
        pair.viaLng !== input.viaLng;
      db.prepare(
        `UPDATE routes SET
          name = ?, origin_label = ?, origin_lat = ?, origin_lng = ?,
          dest_label = ?, dest_lat = ?, dest_lng = ?,
          via_label = ?, via_lat = ?, via_lng = ?
         WHERE id = ? AND user_id = ?`,
      ).run(
        `${input.destLabel} to ${input.originLabel}`,
        input.destLabel,
        pairOriginLat,
        pairOriginLng,
        input.originLabel,
        pairDestLat,
        pairDestLng,
        input.viaLabel,
        input.viaLat,
        input.viaLng,
        pair.id,
        userId,
      );
      if (pairMoved) {
        db.prepare("DELETE FROM snapshots WHERE route_id = ?").run(pair.id);
      }
    } else if (pair) {
      db.prepare(
        "UPDATE routes SET via_label = ?, via_lat = ?, via_lng = ? WHERE id = ? AND user_id = ?",
      ).run(input.viaLabel, input.viaLat, input.viaLng, pair.id, userId);
      if (viaMoved) {
        db.prepare("DELETE FROM snapshots WHERE route_id = ?").run(pair.id);
      }
    }
  }

  return getRouteById(userId, routeId);
}

export function updateRouteSettings(
  userId: number,
  routeId: number,
  settings: { arrivalTarget?: string; refreshMinutes?: number },
): Route | null {
  const route = getRouteById(userId, routeId);
  if (!route) return null;
  if (settings.arrivalTarget) {
    db.prepare("UPDATE routes SET arrival_target = ? WHERE id = ? AND user_id = ?").run(
      settings.arrivalTarget,
      routeId,
      userId,
    );
  }
  if (settings.refreshMinutes) {
    db.prepare("UPDATE routes SET refresh_minutes = ? WHERE id = ? AND user_id = ?").run(
      settings.refreshMinutes,
      routeId,
      userId,
    );
  }
  return getRouteById(userId, routeId);
}

export function deleteRoute(userId: number, routeId: number): boolean {
  db.prepare("UPDATE routes SET paired_route_id = NULL WHERE paired_route_id = ? AND user_id = ?").run(
    routeId,
    userId,
  );
  const result = db
    .prepare("DELETE FROM routes WHERE id = ? AND user_id = ?")
    .run(routeId, userId);
  return Number(result.changes) > 0;
}

export function listAllRoutes(): Route[] {
  const rows = db.prepare("SELECT * FROM routes ORDER BY id").all() as RouteRow[];
  return rows.map(mapRoute);
}

export function insertSnapshot(routeId: number, snap: Omit<Snapshot, "id" | "routeId" | "capturedAt">): Snapshot {
  return insertSnapshotAt(routeId, new Date().toISOString(), snap);
}

export function insertSnapshotAt(
  routeId: number,
  capturedAt: string,
  snap: Omit<Snapshot, "id" | "routeId" | "capturedAt">,
): Snapshot {
  const result = db
    .prepare(
      `INSERT INTO snapshots
        (route_id, captured_at, duration_s, freeflow_s, historic_s, distance_m, source)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(routeId, capturedAt, snap.durationS, snap.freeflowS, snap.historicS, snap.distanceM, snap.source);
  const row = db
    .prepare("SELECT * FROM snapshots WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as SnapshotRow;
  return mapSnapshot(row);
}

export function deleteSnapshotsBySource(routeId: number, source: string): number {
  const result = db
    .prepare("DELETE FROM snapshots WHERE route_id = ? AND source = ?")
    .run(routeId, source);
  return Number(result.changes);
}

export function latestSnapshot(routeId: number): Snapshot | null {
  const row = db
    .prepare("SELECT * FROM snapshots WHERE route_id = ? ORDER BY captured_at DESC LIMIT 1")
    .get(routeId) as SnapshotRow | undefined;
  return row ? mapSnapshot(row) : null;
}

export function snapshotsSince(routeId: number, isoSince: string): Snapshot[] {
  const rows = db
    .prepare("SELECT * FROM snapshots WHERE route_id = ? AND captured_at >= ? ORDER BY captured_at")
    .all(routeId, isoSince) as SnapshotRow[];
  return rows.map(mapSnapshot);
}

export function snapshotsBetween(routeId: number, fromISO: string, toISO: string): Snapshot[] {
  const rows = db
    .prepare(
      `SELECT * FROM snapshots
       WHERE route_id = ? AND captured_at >= ? AND captured_at <= ?
       ORDER BY captured_at`,
    )
    .all(routeId, fromISO, toISO) as SnapshotRow[];
  return rows.map(mapSnapshot);
}

export function earliestSnapshotAt(routeId: number): string | null {
  const row = db
    .prepare("SELECT MIN(captured_at) AS at FROM snapshots WHERE route_id = ?")
    .get(routeId) as { at: string | null } | undefined;
  return row?.at ?? null;
}

export function isStale(snapshot: Snapshot | null, refreshMinutes: number): boolean {
  if (!snapshot) return true;
  const ageMs = Date.now() - new Date(snapshot.capturedAt).getTime();
  return ageMs > refreshMinutes * 60 * 1000;
}
