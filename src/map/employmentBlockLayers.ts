import { DemandNeedles } from "./DemandNeedles";
import { DEMAND_STYLE, demandAdditiveBlend } from "./demandStyle";
import type { PickingInfo } from "@deck.gl/core";
import { jobColor, type JobScale } from "../data/employment";
import { needleHeight, type BlockData, type JobBlock, type blockStats } from "../data/employmentBlocks";
export function employmentBlockLayers(data: BlockData, stats: ReturnType<typeof blockStats>, scale: JobScale,
  exag: number, clip: boolean, opacity: number, highlight: string | null,
  hover: (f: JobBlock | null) => void, select: (f: JobBlock) => void) {
  return [new DemandNeedles<JobBlock>({
    id: "employment-block-needles", data: data.features,
    getPosition: f => f.geometry.coordinates as [number, number],
    radiusUnits: "pixels", radius: DEMAND_STYLE.needleRadius, diskResolution: DEMAND_STYLE.needleSides,
    extruded: true, material: false, opacity,
    getElevation: f => needleHeight(f.properties.jobs_total, stats.maximum, stats.cap, clip, scale, exag),
    getFillColor: f => f.properties.w_geocode === highlight ? [255, 240, 253, 255] :
      jobColor(f.properties.jobs_total, stats.maximum),
    parameters: demandAdditiveBlend,
    pickable: true,
    onHover: (info: PickingInfo<JobBlock>) => hover(info.object ?? null),
    onClick: (info: PickingInfo<JobBlock>) => { if(info.object) select(info.object); return true; },
    updateTriggers: {getElevation: [scale, exag, clip, stats.cap, stats.maximum], getFillColor: [highlight, stats.maximum]},
  })];
}
