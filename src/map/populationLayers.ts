import {
  ColumnLayer,
  GeoJsonLayer,
  ScatterplotLayer,
  PathLayer,
} from "@deck.gl/layers";
import {
  columnRadiusPixels,
  densityFillAlpha,
  tractColor,
  tractHeight,
} from "./populationVisuals";
import type { PickingInfo } from "@deck.gl/core";
import {
  elevationForDensity,
  type PopulationProperties,
  type PopulationData,
  type ColumnDatum,
  type Tract,
} from "../data/population";

export function populationLayers(
  data: PopulationData,
  columns: ColumnDatum[],
  highlighted: string | null,
  onHover: (tract: Tract | null) => void,
  onSelect: (tract: Tract) => void,
  zoom: number,
  is3D = false,
) {
  const radius = columnRadiusPixels(zoom);
  const maximum = Math.max(
    0,
    ...data.features.map((f) => f.properties.density ?? 0),
  );
  const pick = (info: PickingInfo<Tract | ColumnDatum>) =>
    info.object && ("tract" in info.object ? info.object.tract : info.object);
  const onClick = (info: PickingInfo<Tract | ColumnDatum>) => {
    const tract = pick(info);
    if (tract) onSelect(tract);
    return true;
  };
  const hover = (info: PickingInfo<Tract | ColumnDatum>) =>
    onHover(pick(info) || null);
  return [
    new GeoJsonLayer<PopulationProperties>({
      id: "population-tracts",
      data,
      pickable: true,
      filled: true,
      stroked: !is3D,
      extruded: is3D,
      getElevation: (f) =>
        f.properties.pop_est === 0 ? 0 : tractHeight(f.properties.density),
      material: is3D
        ? {
            ambient: 0.5,
            diffuse: 0.65,
            shininess: 18,
            specularColor: [90, 125, 125],
          }
        : true,
      // All polygons remain pickable, including zero-population and missing-density tracts.
      getFillColor: (f) =>
        is3D
          ? tractColor(
              f.properties.pop_est === 0 ? 0 : f.properties.density,
              maximum,
            )
          : [78, 155, 145, densityFillAlpha(f.properties.density, maximum)],
      getLineColor: (f) =>
        f.properties.GEOID === highlighted
          ? [172, 246, 229, 220]
          : [119, 169, 166, 90],
      getLineWidth: (f) => (f.properties.GEOID === highlighted ? 1.8 : 0.75),
      lineWidthUnits: "pixels",
      updateTriggers: {
        getFillColor: [is3D, maximum],
        getLineColor: highlighted,
        getLineWidth: highlighted,
      },
      autoHighlight: is3D,
      highlightColor: [180, 240, 225, 70],
      onHover: hover,
      onClick,
    }),
    ...(is3D
      ? [
          new PathLayer<{ path: [number, number, number][]; geoid: string }>({
            id: "population-roof-edges",
            data: data.features.flatMap((f) => {
              const height =
                f.properties.pop_est === 0
                  ? 0
                  : tractHeight(f.properties.density);
              const polygons =
                f.geometry.type === "Polygon"
                  ? [f.geometry.coordinates]
                  : f.geometry.coordinates;
              return polygons.flatMap((polygon) =>
                polygon.map((ring) => ({
                  geoid: f.properties.GEOID,
                  path: ring.map(([lng, lat]): [number, number, number] => [
                    lng,
                    lat,
                    height + 1,
                  ]),
                })),
              );
            }),
            getPath: (d) => d.path,
            getColor: (d) =>
              d.geoid === highlighted
                ? [215, 255, 240, 230]
                : [164, 226, 216, 140],
            getWidth: (d) => (d.geoid === highlighted ? 1.5 : 0.65),
            widthUnits: "pixels",
            pickable: false,
            updateTriggers: { getColor: highlighted, getWidth: highlighted },
          }),
        ]
      : [
          new ScatterplotLayer<ColumnDatum>({
            id: "population-glow",
            data: columns,
            getPosition: (d) => d.position,
            radiusUnits: "pixels",
            getRadius: radius * 1.6,
            radiusMinPixels: 4,
            radiusMaxPixels: 13,
            getFillColor: [97, 224, 201, 28],
            pickable: false,
          }),
          new ColumnLayer<ColumnDatum>({
            id: "population-columns",
            data: columns,
            diskResolution: 12,
            radius,
            radiusUnits: "pixels",
            extruded: true,
            getPosition: (d) => d.position,
            getElevation: (d) =>
              elevationForDensity(d.tract.properties.density),
            getFillColor: (d) =>
              d.tract.properties.GEOID === highlighted
                ? [181, 248, 228, 230]
                : [104, 203, 183, 160],
            material: {
              ambient: 0.8,
              diffuse: 0.3,
              shininess: 12,
              specularColor: [90, 150, 135],
            },
            pickable: true,
            onHover: hover,
            onClick,
            updateTriggers: { getFillColor: highlighted },
          }),
        ]),
  ];
}
