import type { FeatureCollection, Polygon, MultiPolygon } from "geojson";
import type { Map as MapLibreMap, LngLatBoundsLike } from "maplibre-gl";

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

// Derive camera constraints from the geometry and available screen area, not fixed coordinates.
export function frameStudyArea(
  map: MapLibreMap,
  bounds: Bounds,
  sidebarOpen: boolean,
) {
  const mobile = map.getContainer().clientWidth <= 600;
  const padding = {
    top: 75,
    bottom: 90,
    left: mobile ? 28 : sidebarOpen ? 380 : 130,
    right: mobile ? 28 : 70,
  };
  map.setMaxBounds(undefined);
  map.setMinZoom(0);
  map.fitBounds(bounds as LngLatBoundsLike, {
    padding,
    duration: 0,
    bearing: 0,
    pitch: 0,
  });
  const minZoom = map.getZoom();
  // The fitted viewport already accounts for screen aspect ratio and sidebar padding.
  // Expand it slightly so maxBounds never clips the initial fit on wide or narrow screens.
  const visible = map.getBounds();
  const dx = (visible.getEast() - visible.getWest()) * 0.12;
  const dy = (visible.getNorth() - visible.getSouth()) * 0.12;
  map.setMaxBounds([
    [visible.getWest() - dx, visible.getSouth() - dy],
    [visible.getEast() + dx, visible.getNorth() + dy],
  ]);
  map.setMinZoom(minZoom);
}
