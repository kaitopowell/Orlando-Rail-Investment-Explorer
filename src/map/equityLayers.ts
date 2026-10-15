import { GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import {
  equityColor,
  householdRadius,
  type EquityClassification,
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
  method: EquityClassification,
  showCounts: boolean,
  points: Map<string, [number, number]>,
) {
  const maximum = Math.max(
    ...data.features.map((f) => f.properties.hh_no_vehicle ?? 0),
  );
  return [
    new GeoJsonLayer<EquityProperties>({
      id: "equity-tracts",
      data,
      pickable: true,
      filled: true,
      stroked: true,
      extruded: false,
      parameters: { depthWriteEnabled: false },
      getFillColor: (f) => equityColor(f.properties, measure, breaks, method),
      getLineColor: (f) =>
        f.properties.GEOID === highlight
          ? [220, 255, 130, 255]
          : [178, 192, 156, 145],
      getLineWidth: (f) => (f.properties.GEOID === highlight ? 2 : 0.5),
      lineWidthUnits: "pixels",
      onHover: (info: PickingInfo<EquityTract>) => hover(info.object ?? null),
      onClick: (info: PickingInfo<EquityTract>) => {
        if (info.object) select(info.object);
        return true;
      },
      updateTriggers: {
        getFillColor: [measure, breaks, method],
        getLineColor: highlight,
        getLineWidth: highlight,
      },
    }),
    ...(showCounts
      ? [
          new ScatterplotLayer<EquityTract>({
            id: "equity-household-counts",
            data: data.features.filter(
              (f) => f.properties.hh_no_vehicle !== null,
            ),
            getPosition: (f) => points.get(f.properties.GEOID)!,
            getRadius: (f) =>
              householdRadius(f.properties.hh_no_vehicle, maximum)!,
            radiusUnits: "pixels",
            stroked: true,
            lineWidthUnits: "pixels",
            getLineWidth: 0.75,
            getFillColor: (f) => [
              220,
              235,
              209,
              f.properties.small_base ? 25 : 60,
            ],
            getLineColor: (f) => [
              220,
              235,
              209,
              f.properties.small_base ? 65 : 160,
            ],
            parameters: { depthWriteEnabled: false },
            pickable: true,
            onHover: (info: PickingInfo<EquityTract>) =>
              hover(info.object ?? null),
            onClick: (info: PickingInfo<EquityTract>) => {
              if (info.object) select(info.object);
              return true;
            },
          }),
        ]
      : []),
  ];
}
