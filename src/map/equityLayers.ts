import { GeoJsonLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import {
  equityColor,
  type EquityData,
  type EquityMeasure,
  type EquityProperties,
  type EquityTract,
} from "../data/equity";
export function equityLayers(
  data: EquityData,
  measure: EquityMeasure,
  breaks: number[],
  highlight: string | null,
  hover: (f: EquityTract | null) => void,
  select: (f: EquityTract) => void,
) {
  return [
    new GeoJsonLayer<EquityProperties>({
      id: "equity-tracts",
      data,
      pickable: true,
      filled: true,
      stroked: true,
      extruded: false,
      parameters: { depthWriteEnabled: false },
      getFillColor: (f) => equityColor(f.properties, measure, breaks),
      getLineColor: (f) =>
        f.properties.GEOID === highlight
          ? [220, 255, 130, 255]
          : [150, 160, 150, 110],
      getLineWidth: (f) => (f.properties.GEOID === highlight ? 2 : 0.5),
      lineWidthUnits: "pixels",
      onHover: (info: PickingInfo<EquityTract>) => hover(info.object ?? null),
      onClick: (info: PickingInfo<EquityTract>) => {
        if (info.object) select(info.object);
        return true;
      },
      updateTriggers: {
        getFillColor: [measure, breaks],
        getLineColor: highlight,
        getLineWidth: highlight,
      },
    }),
  ];
}
