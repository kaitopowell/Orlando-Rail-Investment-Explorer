import { GeoJsonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { services, type TransitItem } from "../data/transit";
const onTop = { depthCompare: "always", depthWriteEnabled: false } as const;
const additive = {
  ...onTop,
  blend: true,
  blendColorOperation: "add",
  blendColorSrcFactor: "src-alpha",
  blendColorDstFactor: "one",
  blendAlphaSrcFactor: "one",
  blendAlphaDstFactor: "one-minus-src-alpha",
} as const;
class Glow extends ScatterplotLayer<TransitItem> {
  static layerName = "TransitGlow";
  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      inject: {
        ...shaders.inject,
        "fs:DECKGL_FILTER_COLOR":
          "color.a *= pow(max(0.0, 1.0 - length(geometry.uv)), 2.0);",
      },
    };
  }
}
export function transitLayers(
  items: TransitItem[],
  highlighted: string | null,
  pulse: number,
  zoom: number,
  hover: (item: TransitItem | null) => void,
  select: (item: TransitItem) => void,
) {
  const lines = items.filter((f) => f.geometry.type !== "Point");
  const stations = items.filter((f) => f.geometry.type === "Point");
  const events = {
    onHover: (info: PickingInfo<TransitItem>) => hover(info.object ?? null),
    onClick: (info: PickingInfo<TransitItem>) => {
      if (info.object) select(info.object);
      return true;
    },
  };
  const position = (f: TransitItem): [number, number, number] => {
    const p = f.geometry.type === "Point" ? f.geometry.coordinates : [0, 0];
    return [p[0], p[1], 5];
  };
  return [
    ...[
      { id: "glow", width: 15, alpha: 22 },
      { id: "halo", width: 7, alpha: 60 },
      { id: "core", width: 2, alpha: 240 },
    ].map(
      (pass) =>
        new GeoJsonLayer<TransitItem["properties"]>({
          id: `transit-${pass.id}`,
          data: { type: "FeatureCollection" as const, features: lines },
          parameters: additive,
          getLineColor: (f) => [
            ...(pass.id === "core"
              ? services[f.properties.service].core
              : services[f.properties.service].color),
            highlighted === f.properties.id ? 255 : pass.alpha,
          ],
          getLineWidth: (f) =>
            pass.width + (highlighted === f.properties.id ? 1.5 : 0),
          lineWidthUnits: "pixels",
          pickable: pass.id === "halo",
          ...events,
          updateTriggers: {
            getLineColor: highlighted,
            getLineWidth: highlighted,
          },
        }),
    ),
    new Glow({
      id: "transit-station-glow",
      data: stations,
      parameters: additive,
      getPosition: position,
      radiusUnits: "pixels",
      getRadius: 14 * pulse,
      getFillColor: (f) => [...services[f.properties.service].color, 150],
      pickable: false,
    }),
    new ScatterplotLayer<TransitItem>({
      id: "transit-stations",
      data: stations,
      parameters: onTop,
      getPosition: position,
      radiusUnits: "pixels",
      getRadius: (f) => (f.properties.id === highlighted ? 5 : 3.5),
      stroked: true,
      lineWidthUnits: "pixels",
      getLineWidth: 1,
      getLineColor: [255, 250, 225, 240],
      getFillColor: (f) => [...services[f.properties.service].core, 255],
      pickable: true,
      ...events,
      updateTriggers: { getRadius: highlighted },
    }),
    new TextLayer<TransitItem>({
      id: "transit-station-labels",
      data: zoom >= 10 ? stations : [],
      parameters: onTop,
      getPosition: position,
      getText: (f) => f.properties.name,
      getSize: 12,
      getColor: (f) => [...services[f.properties.service].core, 255],
      getPixelOffset: [9, -10],
      getTextAnchor: "start",
      getAlignmentBaseline: "bottom",
      fontFamily: "sans-serif",
      fontSettings: { sdf: true },
      outlineWidth: 3,
      outlineColor: [5, 12, 17, 255],
      pickable: false,
    }),
  ];
}
