import { ColumnLayer, GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import { columnRadiusPixels, densityFillAlpha } from "./populationVisuals";
import { populationBeams } from "./populationBeams";
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
      stroked: true,
      // All polygons remain pickable, including zero-population and missing-density tracts.
      getFillColor: (f) => [
        78,
        155,
        145,
        densityFillAlpha(f.properties.density, maximum),
      ],
      getLineColor: (f) =>
        f.properties.GEOID === highlighted
          ? [172, 246, 229, 220]
          : [119, 169, 166, 90],
      getLineWidth: (f) => (f.properties.GEOID === highlighted ? 1.8 : 0.75),
      lineWidthUnits: "pixels",
      updateTriggers: { getLineColor: highlighted, getLineWidth: highlighted },
      onHover: hover,
      onClick,
    }),
    ...(is3D
      ? populationBeams(columns, maximum)
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
