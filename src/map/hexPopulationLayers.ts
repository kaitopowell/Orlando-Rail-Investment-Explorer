import { ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { DemandNeedles } from "./DemandNeedles";
import { DEMAND_STYLE, demandAlphaBlend, demandRadius } from "./demandStyle";
import { hexCenter, pillarDefaults } from "../data/kontur3d";
import { hexColor, hexHeight, type Hex, type HexData, type HexScale } from "../data/kontur";
class SoftPopulationCircles extends ScatterplotLayer<Hex> {
  static layerName = "SoftPopulationCircles";
  getShaders() {
    const shaders = super.getShaders();
    return {...shaders, inject: {...shaders.inject,
      "fs:DECKGL_FILTER_COLOR": "if (!bool(picking.isActive)) { color.a *= 1.0 - smoothstep(0.55, 1.0, length(geometry.uv)); }",
    }};
  }
}
export function hexPopulationLayers(data: HexData, is3D: boolean, zoom: number, maximum: number,
  scale: HexScale, exaggeration: number, width: number, beforeId: string | undefined,
  hover: (f: Hex | null) => void, select: (f: Hex) => void) {
  const common = {
    data: data.features, beforeId, getPosition: hexCenter,
    pickable: true, autoHighlight: true, highlightColor: [84, 218, 192, 90] as [number, number, number, number],
    parameters: demandAlphaBlend,
    onHover: (info: PickingInfo<Hex>) => hover(info.object ?? null),
    onClick: (info: PickingInfo<Hex>) => { if (info.object) select(info.object); return true; },
  };
  return is3D ? [new DemandNeedles<Hex>({
    ...common, id: "population-hexagon-pillars", radiusUnits: "pixels",
    radius: DEMAND_STYLE.needleRadius / pillarDefaults.coverage, coverage: width,
    diskResolution: DEMAND_STYLE.needleSides, extruded: true, material: false, opacity: DEMAND_STYLE.opacity,
    getElevation: f => hexHeight(f.properties.population, maximum, scale, exaggeration),
    getFillColor: f => hexColor(f.properties.population, maximum),
    updateTriggers: {getElevation: [scale, exaggeration, maximum], getFillColor: maximum},
  })] : [new SoftPopulationCircles({
    ...common, id: "population-hexagons", radiusUnits: "pixels",
    getRadius: f => demandRadius(f.properties.population, maximum, zoom),
    getFillColor: f => {const c = hexColor(f.properties.population, maximum); return [c[0], c[1], c[2], DEMAND_STYLE.circleAlpha];},
    updateTriggers: {getRadius: [zoom, maximum], getFillColor: maximum},
  })];
}
