import { LineLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { ColumnDatum } from "../data/population";
import { beamColor, beamHeight } from "./populationVisuals";

// deck.gl 9 / luma.gl 9 named pipeline parameters, scoped to light layers.
const additive = {
  blend: true,
  blendColorOperation: "add",
  blendColorSrcFactor: "src-alpha",
  blendColorDstFactor: "one",
  blendAlphaOperation: "add",
  blendAlphaSrcFactor: "one",
  blendAlphaDstFactor: "one-minus-src-alpha",
  depthWriteEnabled: false,
} as const;

class LightBeamLayer extends LineLayer<ColumnDatum> {
  static layerName = "PopulationLightBeamLayer";
  getShaders() {
    const shaders = super.getShaders();
    return {
      ...shaders,
      inject: {
        ...shaders.inject,
        // LineLayer uv.x interpolates from source (base) to target (tip).
        "fs:DECKGL_FILTER_COLOR": `color.a *= (1.0 - clamp(geometry.uv.x, 0.0, 1.0))
        * (1.0 - smoothstep(0.0, 1.0, abs(geometry.uv.y)));`,
      },
    };
  }
}
class BaseGlowLayer extends ScatterplotLayer<ColumnDatum> {
  static layerName = "PopulationBaseGlowLayer";
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
export function populationBeams(columns: ColumnDatum[], maximum: number) {
  const color = (d: ColumnDatum) =>
    beamColor(d.tract.properties.density, maximum);
  return [
    new BaseGlowLayer({
      id: "population-beam-bases",
      data: columns,
      parameters: additive,
      getPosition: (d) => d.position,
      radiusUnits: "pixels",
      getRadius: 7,
      getFillColor: color,
      pickable: false,
    }),
    ...[
      { id: "halo", width: 6, opacity: 0.16 },
      { id: "core", width: 1.5, opacity: 0.85 },
    ].map(
      ({ id, width, opacity }) =>
        new LightBeamLayer({
          id: `population-beam-${id}`,
          data: columns,
          parameters: additive,
          getSourcePosition: (d) => [...d.position, 0],
          getTargetPosition: (d) => [
            ...d.position,
            beamHeight(d.tract.properties.density),
          ],
          getColor: color,
          getWidth: width,
          widthUnits: "pixels",
          opacity,
          pickable: false,
        }),
    ),
  ];
}
