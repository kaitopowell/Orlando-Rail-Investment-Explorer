import {ScatterplotLayer} from "@deck.gl/layers";
import type {PickingInfo} from "@deck.gl/core";
import {busColors, busRadii, busTier, meets, type LynxStop, type Threshold} from "../data/lynx";
class BusGlow extends ScatterplotLayer<LynxStop> {
  static layerName = "LynxGlow";
  getShaders() {
    const shaders = super.getShaders();
    return {...shaders, inject: {...shaders.inject, "fs:DECKGL_FILTER_COLOR":
      "color.a *= pow(max(0.0, 1.0 - length(geometry.uv)), 2.0);"}};
  }
}
export function lynxLayers(stops: LynxStop[], threshold: Threshold, includeLymmo: boolean,
  opacity: number, highlight: string | null, hover: (f: LynxStop | null) => void, select: (f: LynxStop) => void) {
  const tier = (f: LynxStop) => meets(f.properties, threshold, includeLymmo) ? busTier(f.properties,includeLymmo) ?? "infrequent" : "infrequent";
  const position = (f: LynxStop) => [...f.geometry.coordinates, 2] as [number,number,number];
  const parameters = {depthCompare: "always", depthWriteEnabled: false} as const;
  return [new BusGlow({
    id: "lynx-glow", data: stops, opacity, getPosition: position, radiusUnits: "pixels",
    getRadius: f => busRadii[tier(f)] * 3, getFillColor: f => busColors[tier(f)],
    pickable: false, parameters: {...parameters, blend: true, blendColorOperation: "add",
      blendColorSrcFactor: "src-alpha", blendColorDstFactor: "one"},
    updateTriggers: {getRadius:[threshold,includeLymmo], getFillColor:[threshold,includeLymmo]},
  }), new ScatterplotLayer<LynxStop>({
    id: "lynx-stops", data: stops, opacity, getPosition: position, radiusUnits: "pixels",
    getRadius: f => busRadii[tier(f)] + (f.properties.stop_id === highlight ? 2 : 0),
    getFillColor: f => busColors[tier(f)], stroked: true, lineWidthUnits: "pixels",
    getLineWidth: f => f.properties.stop_id === highlight ? 1.5 : 0,
    getLineColor: [232,251,255,255], parameters, pickable: true,
    onHover: (info: PickingInfo<LynxStop>) => hover(info.object ?? null),
    onClick: (info: PickingInfo<LynxStop>) => {if (info.object) select(info.object); return true;},
    updateTriggers: {getRadius:[threshold,includeLymmo,highlight], getFillColor:[threshold,includeLymmo], getLineWidth:highlight},
  })];
}
