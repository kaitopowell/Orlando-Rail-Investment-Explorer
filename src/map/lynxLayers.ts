import {ScatterplotLayer} from "@deck.gl/layers";
import type {PickingInfo} from "@deck.gl/core";
import {busTier, meets, type LynxStop, type Threshold} from "../data/lynx";
import {busColors, busRadii, TRANSIT_STYLE, TRANSIT_ALPHA_BLEND, transitRadiusScale, transitGlowShader} from "./transitStyle";
class BusGlow extends ScatterplotLayer<LynxStop> {
  static layerName = "LynxGlow";
  getShaders() {
    const shaders = super.getShaders();
    return {...shaders, inject: {...shaders.inject, "fs:DECKGL_FILTER_COLOR":
      transitGlowShader(TRANSIT_STYLE.bus.glowRadiusFactor)}};
  }
}
export function lynxLayers(stops: LynxStop[], threshold: Threshold, includeLymmo: boolean,
  opacity: number, zoom: number, highlight: string | null, hover: (f: LynxStop | null) => void, select: (f: LynxStop) => void) {
  const tier = (f: LynxStop) => meets(f.properties, threshold, includeLymmo) ? busTier(f.properties,includeLymmo) ?? "infrequent" : "infrequent";
  const position = (f: LynxStop) => [...f.geometry.coordinates, 2] as [number,number,number];
  const parameters = TRANSIT_ALPHA_BLEND;
  const radiusScale = transitRadiusScale(zoom);
  return [new BusGlow({
    id: "lynx-glow", data: stops, opacity, getPosition: position, radiusUnits: "pixels", radiusScale,
    getRadius: f => busRadii[tier(f)] * TRANSIT_STYLE.bus.glowRadiusFactor,
    getFillColor: f => [...busColors[tier(f)].slice(0,3), TRANSIT_STYLE.bus.glowAlpha] as [number,number,number,number],
    pickable: false, parameters,
    updateTriggers: {getRadius:[threshold,includeLymmo], getFillColor:[threshold,includeLymmo]},
  }), new ScatterplotLayer<LynxStop>({
    id: "lynx-stops", data: stops, opacity, getPosition: position, radiusUnits: "pixels", radiusScale,
    getRadius: f => busRadii[tier(f)] + (f.properties.stop_id === highlight ? TRANSIT_STYLE.bus.highlightRadius : 0),
    getFillColor: f => busColors[tier(f)], stroked: true, lineWidthUnits: "pixels",
    getLineWidth: f => f.properties.stop_id === highlight ? TRANSIT_STYLE.bus.highlightWidth : 0,
    getLineColor: TRANSIT_STYLE.bus.highlightColor, parameters, pickable: true,
    onHover: (info: PickingInfo<LynxStop>) => hover(info.object ?? null),
    onClick: (info: PickingInfo<LynxStop>) => {if (info.object) select(info.object); return true;},
    updateTriggers: {getRadius:[threshold,includeLymmo,highlight], getFillColor:[threshold,includeLymmo], getLineWidth:highlight},
  })];
}
