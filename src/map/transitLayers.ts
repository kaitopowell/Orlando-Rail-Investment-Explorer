import { GeoJsonLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Feature, Point, LineString, MultiLineString } from "geojson";
import type { PickingInfo } from "@deck.gl/core";
import { services, type TransitItem } from "../data/transit";
import {
  TRANSIT_STYLE,
  TRANSIT_ALPHA_BLEND,
  transitRadiusScale,
  transitGlowShader,
} from "./transitStyle";
const onTop = { depthCompare: "always", depthWriteEnabled: false } as const;
type RenderItem = Feature<
  Point | LineString | MultiLineString,
  { id: string; name: string }
>;
export type TransitLayerOptions = {
  coreAlpha?: number;
  colorFor?: (id: string) => {
    color: [number, number, number];
    core: [number, number, number];
  };
  highlightFor?: (id: string) => boolean;
  opacityFor?: (id: string) => number;
  widthScale?: number;
  rounded?: boolean;
  linesOnly?: boolean;
  idPrefix: string;
  colors?: { color: [number, number, number]; core: [number, number, number] };
};
class Glow<T extends RenderItem> extends ScatterplotLayer<T> {
  static layerName = "TransitGlow";
  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      inject: {
        ...shaders.inject,
        "fs:DECKGL_FILTER_COLOR": transitGlowShader(
          TRANSIT_STYLE.rail.glowRadiusFactor,
        ),
      },
    };
  }
}
export function transitLayers<T extends RenderItem = TransitItem>(
  items: T[],
  highlighted: string | null,
  pulse: number,
  zoom: number,
  hover: (item: T | null) => void,
  select: (item: T) => void,
  options?: TransitLayerOptions,
) {
  const prefix = options?.idPrefix ?? "transit";
  const palette = (f: { properties: T["properties"] }) =>
    options?.colorFor?.(f.properties.id) ??
    options?.colors ??
    services[(f.properties as TransitItem["properties"]).service];
  const lines = items.filter((f) => f.geometry.type !== "Point");
  const stations = items.filter((f) => f.geometry.type === "Point");
  const events = {
    onHover: (info: PickingInfo<T>) => hover(info.object ?? null),
    onClick: (info: PickingInfo<T>) => {
      if (info.object) select(info.object);
      return true;
    },
  };
  const position = (f: T): [number, number, number] => {
    const p = f.geometry.type === "Point" ? f.geometry.coordinates : [0, 0];
    return [p[0], p[1], 5];
  };
  const lineLayers = TRANSIT_STYLE.rail.passes.map(
    (pass) =>
      new GeoJsonLayer<T["properties"]>({
        id: `${prefix}-${pass.id}`,
        data: { type: "FeatureCollection" as const, features: lines },
        parameters: TRANSIT_ALPHA_BLEND,
        getLineColor: (f) => [
          ...(pass.id === "core" ? palette(f).core : palette(f).color),
          (pass.id === "core" && options?.coreAlpha !== undefined ? options.coreAlpha : pass.id === "core" &&
          (highlighted === f.properties.id ||
            options?.highlightFor?.(f.properties.id))
            ? TRANSIT_STYLE.rail.highlightAlpha
            : pass.alpha) * (options?.opacityFor?.(f.properties.id) ?? 1),
        ],
        getLineWidth: (f) =>
          (pass.width +
            (highlighted === f.properties.id ||
            options?.highlightFor?.(f.properties.id)
              ? TRANSIT_STYLE.rail.highlightWidth
              : 0)) *
          (options?.widthScale ?? 1),
        ...(options?.rounded
          ? { lineJointRounded: true, lineCapRounded: true }
          : {}),
        lineWidthUnits: "pixels",
        pickable: pass.id === "halo",
        ...events,
        updateTriggers: {
          getLineColor: [highlighted, options],
          getLineWidth: [highlighted, options],
        },
      }),
  );
  if (options?.linesOnly) return lineLayers;
  return [
    ...lineLayers,
    new Glow<T>({
      id: `${prefix}-station-glow`,
      data: stations,
      parameters: TRANSIT_ALPHA_BLEND,
      getPosition: position,
      radiusUnits: "pixels",
      radiusScale: transitRadiusScale(zoom),
      getRadius:
        TRANSIT_STYLE.rail.radius * TRANSIT_STYLE.rail.glowRadiusFactor * pulse,
      getFillColor: (f) => [...palette(f).color, TRANSIT_STYLE.rail.glowAlpha],
      pickable: false,
    }),
    new ScatterplotLayer<T>({
      id: `${prefix}-stations`,
      data: stations,
      parameters: TRANSIT_ALPHA_BLEND,
      getPosition: position,
      radiusUnits: "pixels",
      radiusScale: transitRadiusScale(zoom),
      getRadius: (f) =>
        f.properties.id === highlighted
          ? TRANSIT_STYLE.rail.highlightRadius
          : TRANSIT_STYLE.rail.radius,
      stroked: true,
      lineWidthUnits: "pixels",
      getLineWidth: TRANSIT_STYLE.rail.lineWidth,
      getLineColor: (f) => [...palette(f).color, TRANSIT_STYLE.rail.lineAlpha],
      getFillColor: (f) => [...palette(f).color, TRANSIT_STYLE.rail.fillAlpha],
      pickable: true,
      ...events,
      updateTriggers: { getRadius: highlighted },
    }),
    new TextLayer<T>({
      id: `${prefix}-station-labels`,
      data: zoom >= 10 ? stations : [],
      parameters: onTop,
      getPosition: position,
      getText: (f) => f.properties.name,
      getSize: 12,
      getColor: (f) => [...palette(f).core, 255],
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
