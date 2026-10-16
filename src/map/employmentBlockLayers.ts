import { ColumnLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import { jobColor, type JobScale } from "../data/employment";
import { needleHeight, type BlockData, type JobBlock, type blockStats } from "../data/employmentBlocks";
export class EmploymentNeedles extends ColumnLayer<JobBlock> {
  static layerName = "EmploymentNeedles";
  getShaders() {
    const shaders = super.getShaders();
    return {...shaders, inject: {
      ...shaders.inject,
      "vs:#decl": "out float needleFraction;",
      "vs:#main-start": "needleFraction = (positions.z + 1.0) * 0.5;",
      "vs:DECKGL_FILTER_SIZE": "size.xy *= mix(1.0, 0.12, needleFraction);",
      "fs:#decl": "in float needleFraction;",
      "fs:DECKGL_FILTER_COLOR": "if (!bool(picking.isActive)) { color.a *= pow(1.0 - clamp(needleFraction, 0.0, 1.0), 1.4); }",
    }};
  }
}
export function employmentBlockLayers(data: BlockData, stats: ReturnType<typeof blockStats>, scale: JobScale,
  exag: number, clip: boolean, opacity: number, highlight: string | null,
  hover: (f: JobBlock | null) => void, select: (f: JobBlock) => void) {
  return [new EmploymentNeedles({
    id: "employment-block-needles", data: data.features,
    getPosition: f => f.geometry.coordinates as [number, number],
    radiusUnits: "pixels", radius: 1.2, diskResolution: 6,
    extruded: true, material: false, opacity,
    getElevation: f => needleHeight(f.properties.jobs_total, stats.maximum, stats.cap, clip, scale, exag),
    getFillColor: f => f.properties.w_geocode === highlight ? [255, 240, 253, 255] :
      jobColor(f.properties.jobs_total, stats.maximum),
    parameters: { blend: true, blendColorOperation: "add", blendColorSrcFactor: "src-alpha",
      blendColorDstFactor: "one", blendAlphaSrcFactor: "one", blendAlphaDstFactor: "one-minus-src-alpha",
      depthWriteEnabled: false, depthCompare: "always" },
    pickable: true,
    onHover: (info: PickingInfo<JobBlock>) => hover(info.object ?? null),
    onClick: (info: PickingInfo<JobBlock>) => { if(info.object) select(info.object); return true; },
    updateTriggers: {getElevation: [scale, exag, clip, stats.cap, stats.maximum], getFillColor: [highlight, stats.maximum]},
  })];
}
