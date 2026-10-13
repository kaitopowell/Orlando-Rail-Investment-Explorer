import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import { LngLat, type Map as MapLibreMap } from "maplibre-gl";
import { orlandoLandmarks, framingConfig } from "../config/mapViews";

export type Counties = FeatureCollection<
  Polygon | MultiPolygon,
  { GEOID: string; NAME: string; label: [number, number] }
>;
export type Bounds = [[number, number], [number, number]];

export function countyBounds(data: Counties): Bounds {
  const bounds: Bounds = [
    [Infinity, Infinity],
    [-Infinity, -Infinity],
  ];
  if (data.features.length !== 4)
    throw new Error("Expected four county boundaries");
  for (const feature of data.features) {
    const polygons =
      feature.geometry.type === "Polygon"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    for (const polygon of polygons)
      for (const ring of polygon)
        for (const [lng, lat] of ring) {
          if (!Number.isFinite(lng) || !Number.isFinite(lat))
            throw new Error("Invalid county coordinates");
          bounds[0][0] = Math.min(bounds[0][0], lng);
          bounds[0][1] = Math.min(bounds[0][1], lat);
          bounds[1][0] = Math.max(bounds[1][0], lng);
          bounds[1][1] = Math.max(bounds[1][1], lat);
        }
  }
  if (!bounds.flat().every(Number.isFinite))
    throw new Error("Empty county geometry");
  return bounds;
}

export function paddedCountyBounds(bounds: Bounds): Bounds {
  const dx =
    (bounds[1][0] - bounds[0][0]) * framingConfig.countyBoundsPaddingRatio;
  const dy =
    (bounds[1][1] - bounds[0][1]) * framingConfig.countyBoundsPaddingRatio;
  return [
    [bounds[0][0] - dx, bounds[0][1] - dy],
    [bounds[1][0] + dx, bounds[1][1] + dy],
  ];
}

export function createMapFraming(
  map: MapLibreMap,
  bounds: Bounds,
  initialSidebarOpen: boolean,
) {
  const limits = paddedCountyBounds(bounds);
  const landmarks = Object.values(orlandoLandmarks);
  const core: Bounds = [
    [
      Math.min(...landmarks.map((p) => p[0])),
      Math.min(...landmarks.map((p) => p[1])),
    ],
    [
      Math.max(...landmarks.map((p) => p[0])),
      Math.max(...landmarks.map((p) => p[1])),
    ],
  ];
  let sidebarOpen = initialSidebarOpen;
  let mode: "orlando" | "counties" | "explore" = "orlando";
  const clamp = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, value));
  // Default maxBounds constraints force a viewport-filling zoom, clipping a tall
  // region on ultrawide screens. Constrain the center instead; the persistent
  // outside mask supplies letterboxing without revealing a neighboring world.
  map.setTransformConstrain((center, zoom) => ({
    center: new LngLat(
      clamp(center.lng, limits[0][0], limits[1][0]),
      clamp(center.lat, limits[0][1], limits[1][1]),
    ),
    zoom: clamp(zoom, map.getMinZoom(), map.getMaxZoom()),
  }));
  map.setMaxBounds(limits);
  function camera(target: Bounds) {
    const mobile =
      map.getContainer().clientWidth <= framingConfig.mobileBreakpoint;
    const p = framingConfig.padding;
    return map.cameraForBounds(target, {
      padding: {
        top: p.top,
        bottom: p.bottom,
        left: mobile
          ? p.mobileSide
          : sidebarOpen
            ? p.desktopSidebar
            : p.desktopCollapsed,
        right: mobile ? p.mobileSide : p.desktopRight,
      },
      bearing: 0,
    });
  }
  function go(view: "orlando" | "counties", animate = true) {
    mode = view;
    const target = camera(view === "orlando" ? core : bounds);
    if (target)
      map.flyTo({
        ...target,
        pitch: 0,
        duration:
          animate &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? framingConfig.flightDuration
            : 0,
      });
  }
  function update(open = sidebarOpen) {
    sidebarOpen = open;
    const overview = camera(bounds);
    if (!overview || overview.zoom === undefined) return;
    map.setMinZoom(overview.zoom);
    if (mode !== "explore") go(mode, false);
  }
  function onMove(event: object) {
    if ("originalEvent" in event) mode = "explore";
  }
  function onResize() {
    update();
  }
  function onOrientation() {
    map.resize();
    update();
  }
  map.on("movestart", onMove);
  map.on("resize", onResize);
  window.addEventListener("orientationchange", onOrientation);
  update();
  return {
    update,
    showOrlando: () => go("orlando"),
    showCounties: () => go("counties"),
    destroy() {
      map.off("movestart", onMove);
      map.off("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
    },
  };
}
