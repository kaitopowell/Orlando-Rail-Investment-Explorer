import { ColumnLayer, GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
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
) {
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
      // Almost transparent interiors provide hit testing for every tract, including zeros.
      getFillColor: [101, 214, 199, 2],
      getLineColor: (f) =>
        f.properties.GEOID === highlighted
          ? [172, 246, 229, 220]
          : [119, 169, 166, 65],
      getLineWidth: (f) => (f.properties.GEOID === highlighted ? 1.8 : 0.5),
      lineWidthUnits: "pixels",
      updateTriggers: { getLineColor: highlighted, getLineWidth: highlighted },
      onHover: hover,
      onClick,
    }),
    new ScatterplotLayer<ColumnDatum>({
      id: "population-glow",
      data: columns,
      getPosition: (d) => d.position,
      radiusUnits: "meters",
      getRadius: 200,
      radiusMinPixels: 2,
      radiusMaxPixels: 12,
      getFillColor: [97, 224, 201, 28],
      pickable: false,
    }),
    new ColumnLayer<ColumnDatum>({
      id: "population-columns",
      data: columns,
      diskResolution: 12,
      radius: 100,
      extruded: true,
      getPosition: (d) => d.position,
      getElevation: (d) => elevationForDensity(d.tract.properties.density),
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
  ];
}
