import { GeoJsonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { services, type TransitItem } from "../data/transit";
import {TRANSIT_STYLE, TRANSIT_ALPHA_BLEND, transitRadiusScale, transitGlowShader} from "./transitStyle";
const onTop = { depthCompare: "always", depthWriteEnabled: false } as const;
class Glow extends ScatterplotLayer<TransitItem> {
  static layerName = "TransitGlow";
  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      inject: {
        ...shaders.inject,
        "fs:DECKGL_FILTER_COLOR":
          transitGlowShader(TRANSIT_STYLE.rail.glowRadiusFactor),
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
    ...TRANSIT_STYLE.rail.passes.map(
      (pass) =>
        new GeoJsonLayer<TransitItem["properties"]>({
          id: `transit-${pass.id}`,
          data: { type: "FeatureCollection" as const, features: lines },
          parameters: TRANSIT_ALPHA_BLEND,
          getLineColor: (f) => [
            ...(pass.id === "core"
              ? services[f.properties.service].core
              : services[f.properties.service].color),
            pass.id === "core" && highlighted === f.properties.id ? TRANSIT_STYLE.rail.highlightAlpha : pass.alpha,
          ],
          getLineWidth: (f) =>
            pass.width + (highlighted === f.properties.id ? TRANSIT_STYLE.rail.highlightWidth : 0),
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
      parameters: TRANSIT_ALPHA_BLEND,
      getPosition: position,
      radiusUnits: "pixels",
      radiusScale: transitRadiusScale(zoom),
      getRadius: TRANSIT_STYLE.rail.radius * TRANSIT_STYLE.rail.glowRadiusFactor * pulse,
      getFillColor: (f) => [...services[f.properties.service].color, TRANSIT_STYLE.rail.glowAlpha],
      pickable: false,
    }),
    new ScatterplotLayer<TransitItem>({
      id: "transit-stations",
      data: stations,
      parameters: TRANSIT_ALPHA_BLEND,
      getPosition: position,
      radiusUnits: "pixels",
      radiusScale: transitRadiusScale(zoom),
      getRadius: (f) => (f.properties.id === highlighted ? TRANSIT_STYLE.rail.highlightRadius : TRANSIT_STYLE.rail.radius),
      stroked: true,
      lineWidthUnits: "pixels",
      getLineWidth: TRANSIT_STYLE.rail.lineWidth,
      getLineColor: (f) => [...services[f.properties.service].color, TRANSIT_STYLE.rail.lineAlpha],
      getFillColor: (f) => [...services[f.properties.service].color, TRANSIT_STYLE.rail.fillAlpha],
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
