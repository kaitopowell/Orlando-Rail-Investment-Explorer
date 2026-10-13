import type {
  Feature,
  FeatureCollection,
  Polygon,
  MultiPolygon,
  Position,
} from "geojson";
export type PopulationProperties = {
  GEOID: string;
  county: string;
  pop_est: number;
  pop_moe: number | null;
  density: number | null;
};
export type Tract = Feature<Polygon | MultiPolygon, PopulationProperties>;
export type PopulationData = FeatureCollection<
  Polygon | MultiPolygon,
  PopulationProperties
>;
export type ColumnDatum = { tract: Tract; position: [number, number] };
export const populationSource = {
  label: "ACS 2024 5-year · B01003",
  url: "https://api.census.gov/data/2024/acs/acs5/groups/B01003.html",
  accessDate: "2026-10-13",
};
export const elevationForDensity = (density: number | null) =>
  density === null ? 0 : 20 * Math.sqrt(density);

// Area-weighted polygon centroid in local longitude/latitude coordinates, with
// holes subtracted and MultiPolygon parts weighted by area (not vertex counts).
export function tractCentroid(geometry: Tract["geometry"]): [number, number] {
  const polygons =
    geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let area = 0,
    x = 0,
    y = 0;
  const origin = polygons[0][0][0];
  for (const polygon of polygons)
    polygon.forEach((ring: Position[], ringIndex) => {
      let crossSum = 0,
        cx = 0,
        cy = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const ax = ring[i][0] - origin[0],
          ay = ring[i][1] - origin[1];
        const bx = ring[i + 1][0] - origin[0],
          by = ring[i + 1][1] - origin[1];
        const cross = ax * by - bx * ay;
        crossSum += cross;
        cx += (ax + bx) * cross;
        cy += (ay + by) * cross;
      }
      if (crossSum === 0) return;
      const weight = Math.abs(crossSum) * (ringIndex === 0 ? 1 : -1);
      x += (cx / (3 * crossSum)) * weight;
      y += (cy / (3 * crossSum)) * weight;
      area += weight;
    });
  if (area <= 0) throw new Error("Degenerate tract geometry");
  return [origin[0] + x / area, origin[1] + y / area];
}

export function parsePopulation(input: unknown): PopulationData {
  const data = input as PopulationData;
  if (
    data?.type !== "FeatureCollection" ||
    !Array.isArray(data.features) ||
    !data.features.length
  )
    throw new Error("Invalid population dataset");
  const ids = new Set<string>();
  for (const tract of data.features) {
    const p = tract.properties;
    if (
      !p ||
      typeof p.GEOID !== "string" ||
      !/^12(069|095|097|117)\d{6}$/.test(p.GEOID) ||
      ids.has(p.GEOID) ||
      !Number.isFinite(p.pop_est) ||
      p.pop_est < 0 ||
      !(p.pop_moe === null || (Number.isFinite(p.pop_moe) && p.pop_moe >= 0)) ||
      !(p.density === null || (Number.isFinite(p.density) && p.density >= 0)) ||
      !["Polygon", "MultiPolygon"].includes(tract.geometry?.type)
    )
      throw new Error("Invalid tract record");
    ids.add(p.GEOID);
    const position = tractCentroid(tract.geometry);
    if (!position.every(Number.isFinite))
      throw new Error("Invalid tract centroid");
  }
  return data;
}

export function columnData(data: PopulationData): ColumnDatum[] {
  return data.features
    .filter(
      (t) =>
        t.properties.pop_est > 0 &&
        t.properties.density !== null &&
        t.properties.density > 0,
    )
    .map((tract) => ({ tract, position: tractCentroid(tract.geometry) }));
}
