"use client";

import { useEffect, useRef } from "react";
import type { LayerGroup, Map as LeafletMap } from "leaflet";
import type { GeoPoint } from "@/lib/types";

import "leaflet/dist/leaflet.css";

type LeafletModule = typeof import("leaflet");

const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> ' +
  '&copy; <a href="https://carto.com/attributions">CARTO</a>';

function drawRoute(
  L: LeafletModule,
  map: LeafletMap,
  layer: LayerGroup,
  points: GeoPoint[],
  selected: boolean,
) {
  layer.clearLayers();
  if (points.length === 0) return;

  const latLngs = points.map((point) => [point.lat, point.lng] as [number, number]);
  L.polyline(latLngs, {
    color: "#0b1220",
    weight: 8,
    opacity: 0.85,
    lineCap: "round",
    lineJoin: "round",
  }).addTo(layer);
  L.polyline(latLngs, {
    color: selected ? "#34d399" : "#60a5fa",
    weight: 4,
    opacity: 0.95,
    lineCap: "round",
    lineJoin: "round",
  }).addTo(layer);

  const start = latLngs[0];
  const end = latLngs[latLngs.length - 1];
  L.circleMarker(start, {
    radius: 4.5,
    color: "#052e1f",
    weight: 2,
    fillColor: "#34d399",
    fillOpacity: 1,
  }).addTo(layer);
  L.circleMarker(end, {
    radius: 4.5,
    color: "#2a0b0b",
    weight: 2,
    fillColor: "#f87171",
    fillOpacity: 1,
  }).addTo(layer);

  const bounds = L.latLngBounds(latLngs);
  if (bounds.isValid()) map.fitBounds(bounds, { padding: [16, 16], animate: false });
}

export function RouteMap({
  points,
  selected = false,
  className = "h-36 w-full",
}: {
  points: GeoPoint[];
  selected?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const pointsRef = useRef(points);
  const selectedRef = useRef(selected);
  pointsRef.current = points;
  selectedRef.current = selected;

  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;

    void (async () => {
      const L = await import("leaflet");
      if (disposed || !containerRef.current) return;
      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: true,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        touchZoom: false,
      });
      map.setView([28.6139, 77.209], 10);
      L.tileLayer(TILE_URL, {
        subdomains: "abcd",
        maxZoom: 19,
        detectRetina: true,
        attribution: ATTRIBUTION,
      }).addTo(map);
      const layer = L.layerGroup().addTo(map);
      mapRef.current = map;
      layerRef.current = layer;
      drawRoute(L, map, layer, pointsRef.current, selectedRef.current);
      observer = new ResizeObserver(() => map.invalidateSize());
      observer.observe(containerRef.current);
      requestAnimationFrame(() => map.invalidateSize());
    })();

    return () => {
      disposed = true;
      observer?.disconnect();
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (!cancelled) drawRoute(L, map, layer, points, selected);
    });
    return () => {
      cancelled = true;
    };
  }, [points, selected]);

  return <div ref={containerRef} className={`leaflet-route ${className}`} />;
}
