import { ScatterplotLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { DemandNeedles } from "./DemandNeedles";
import { DEMAND_STYLE, demandAlphaBlend, demandAdditiveBlend } from "./demandStyle";
import { hexCenter, pillarDefaults } from "../data/kontur3d";
import { type Hex, type HexData, type HexScale } from "../data/kontur";
import { POPULATION_DISPLAY as STYLE, populationDisplayValue, populationDisplayHeight, populationDisplayColor, populationDisplayRadius, populationNeedleColor, type PopulationDisplaySettings } from "./populationDisplay";
class SoftPopulationCircles extends ScatterplotLayer<Hex> {
  static layerName = "SoftPopulationCircles";
  getShaders() {
    const shaders = super.getShaders();
    return {...shaders, inject: {...shaders.inject,
      "fs:DECKGL_FILTER_COLOR": "if (!bool(picking.isActive)) { color.a *= 1.0 - smoothstep(0.55, 1.0, length(geometry.uv)); }",
    }};
  }
}
// Preserve Employment's taper and bright-base/transparent-tip gradient, then
// cap each fragment's alpha after deck.gl's opacity gamma correction. This is
// an emission budget per spike, not a claim of an absolute framebuffer cap.
class PopulationNeedles extends DemandNeedles<Hex> {
  static layerName = "PopulationNeedles";
  getShaders() {
    const shaders = super.getShaders();
    return {...shaders, inject: {...shaders.inject,
      "fs:DECKGL_FILTER_COLOR": shaders.inject["fs:DECKGL_FILTER_COLOR"] +
        ` if (!bool(picking.isActive)) { color.a = min(color.a, ${STYLE.spikeAlphaCap}); }`,
    }};
  }
}
export function hexPopulationLayers(data: HexData, is3D: boolean, zoom: number, settings: PopulationDisplaySettings,
  scale: HexScale, exaggeration: number, width: number, beforeId: string | undefined,
  hover: (f: Hex | null) => void, select: (f: Hex) => void) {
  const display = (f: Hex) => populationDisplayValue(f.properties.population, settings, scale);
  const triggers = [settings.floor, settings.ceiling, settings.gamma, scale];
  // Keep every original feature in the pickable layer, including almost invisible lows.
  const common = {
    data: data.features, beforeId, getPosition: hexCenter,
    pickable: true, autoHighlight: true, highlightColor: [84, 218, 192, 90] as [number, number, number, number],
    parameters: demandAlphaBlend,
    onHover: (info: PickingInfo<Hex>) => hover(info.object ?? null),
    onClick: (info: PickingInfo<Hex>) => { if (info.object) select(info.object); return true; },
  };
  const spikes = {
    ...common, parameters: demandAdditiveBlend, radiusUnits: "pixels" as const,
    radius: STYLE.needleRadius / pillarDefaults.coverage, coverage: width,
    diskResolution: DEMAND_STYLE.needleSides, extruded: true, material: false as const, opacity: STYLE.needleOpacity,
    getElevation: (f: Hex) => populationDisplayHeight(display(f), exaggeration),
    getFillColor: (f: Hex) => populationNeedleColor(display(f)),
    updateTriggers: {getElevation: [...triggers, exaggeration], getFillColor: triggers},
  };
  const circles = {
    ...common, radiusUnits: "pixels" as const,
    getRadius: (f: Hex) => populationDisplayRadius(display(f), zoom),
    getFillColor: (f: Hex) => populationDisplayColor(display(f), STYLE.circleAlpha),
    updateTriggers: {getRadius: [...triggers, zoom], getFillColor: triggers},
  };
  const glow = {
    data: data.features.filter(f=>f.properties.population>=settings.glowFloor),
    pickable: false, autoHighlight: false,
    getFillColor: (f: Hex): [number,number,number,number] => [45,242,197, STYLE.glowAlpha*Math.pow(display(f),2)],
  };
  // Ground halo only for the top percentiles; bloom beneath every original
  // spike. Both decorations are unpickable and keep the original feature objects.
  return is3D ? [
    new SoftPopulationCircles({...common, parameters: demandAdditiveBlend,
      id: "population-hexagon-ground-glow", radiusUnits: "pixels", getRadius: STYLE.groundRadius,
      data: data.features.filter(f=>f.properties.population>=settings.groundFloor),
      pickable: false, autoHighlight: false,
      getFillColor: f => [36,208,224,STYLE.groundAlpha*Math.pow(display(f),2)],
      updateTriggers: {getFillColor: triggers},
    }),
    new PopulationNeedles({...spikes, id: "population-hexagon-needle-glow",
      pickable: false, autoHighlight: false, radius: spikes.radius*STYLE.bloomWidth,
      getFillColor: f => [36,208,224,STYLE.bloomAlpha*Math.pow(display(f),2)],
    }),
    new PopulationNeedles({...spikes, id: "population-hexagon-pillars"}),
  ] : [
    new SoftPopulationCircles({...circles, ...glow, id: "population-hexagon-circle-glow",
      getRadius: f => populationDisplayRadius(display(f),zoom)*STYLE.circleGlowWidth}),
    new SoftPopulationCircles({...circles, id: "population-hexagons"}),
  ];
}
