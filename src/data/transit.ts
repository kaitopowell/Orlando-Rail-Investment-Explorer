import type {
  Feature,
  Point,
  LineString,
  MultiLineString,
  FeatureCollection,
} from "geojson";
export const services = {
  sunrail: {
    name: "SunRail",
    color: [255, 138, 31] as [number, number, number],
    core: [255, 201, 132] as [number, number, number],
  },
  brightline: {
    name: "Brightline",
    color: [255, 214, 10] as [number, number, number],
    core: [255, 241, 149] as [number, number, number],
  },
};
export type Service = keyof typeof services;
export type TransitItem = Feature<
  Point | LineString | MultiLineString,
  { service: Service; name: string; id: string }
>;
export async function loadTransit(signal: AbortSignal): Promise<TransitItem[]> {
  const groups = await Promise.all(
    (Object.keys(services) as Service[]).flatMap((service) =>
      ["line", "stations"].map(async (kind) => {
        const response = await fetch(`/data/${service}_${kind}.geojson`, {
          signal,
        });
        if (!response.ok) throw new Error("Transit data unavailable");
        const data = (await response.json()) as FeatureCollection;
        if (data.type !== "FeatureCollection" || !Array.isArray(data.features))
          throw new Error("Invalid transit data");
        return data.features.map((feature, i) => {
          if (
            !["Point", "LineString", "MultiLineString"].includes(
              feature.geometry?.type,
            )
          )
            throw new Error("Invalid transit geometry");
          return {
            ...feature,
            properties: {
              service,
              name: String(
                feature.properties?.stop_name ?? services[service].name,
              ),
              id: `${service}-${kind}-${i}`,
            },
          } as TransitItem;
        });
      }),
    ),
  );
  return groups.flat();
}
