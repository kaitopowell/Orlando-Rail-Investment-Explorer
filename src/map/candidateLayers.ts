import {ArcLayer, ScatterplotLayer} from "@deck.gl/layers";
import type {Color} from "@deck.gl/core";
import {connectionId, type CandidateCenter, type CandidateConnection, type CandidateData, type CandidateSelection} from "../data/candidates";
// Display constants only. Arc width/color carry no analytical meaning.
export const CANDIDATE_STYLE = {
  centerColor: [226, 171, 85, 190] as Color,
  outlineColor: [44, 34, 23, 230] as Color,
  arcColor: [210, 199, 174, 90] as Color,
  highlight: [250, 211, 139, 240] as Color,
  minRadius: 3, maxRadius: 11, radiusPerSqrtJob: 0.025,
  arcWidth: 1, arcHeight: 0.12,
};
const parameters = {depthCompare:"always",depthWriteEnabled:false,blend:true,blendColorOperation:"add",blendColorSrcFactor:"src-alpha",blendColorDstFactor:"one-minus-src-alpha",blendAlphaOperation:"add",blendAlphaSrcFactor:"one",blendAlphaDstFactor:"one-minus-src-alpha"} as const;
export function candidateLayers(data: CandidateData, selected: CandidateSelection, hovered: CandidateSelection, onHover: (s: CandidateSelection) => void, onSelect: (s: CandidateSelection) => void) {
  const active = (kind: "center" | "connection", id: string) => [selected,hovered].some(s => s?.kind === kind && s.id === id);
  return [
    new ArcLayer<CandidateConnection>({id:"candidate-connections",data:data.connections,pickable:true,parameters,
      getSourcePosition:f => f.geometry.coordinates[0] as [number,number],getTargetPosition:f => f.geometry.coordinates[1] as [number,number],
      getSourceColor:f => active("connection",connectionId(f)) ? CANDIDATE_STYLE.highlight : CANDIDATE_STYLE.arcColor,
      getTargetColor:f => active("connection",connectionId(f)) ? CANDIDATE_STYLE.highlight : CANDIDATE_STYLE.arcColor,
      getWidth:CANDIDATE_STYLE.arcWidth,widthUnits:"pixels",getHeight:CANDIDATE_STYLE.arcHeight,
      onHover:({object}) => onHover(object ? {kind:"connection",id:connectionId(object)} : null),
      onClick:({object}) => {if(object) {onSelect({kind:"connection",id:connectionId(object)}); return true;} return false;},
      updateTriggers:{getSourceColor:[selected,hovered],getTargetColor:[selected,hovered]},
    }),
    new ScatterplotLayer<CandidateCenter>({id:"candidate-centers",data:data.centers,pickable:true,parameters,
      getPosition:f => f.geometry.coordinates as [number,number],radiusUnits:"pixels",radiusMinPixels:CANDIDATE_STYLE.minRadius,radiusMaxPixels:CANDIDATE_STYLE.maxRadius,
      getRadius:f => Math.sqrt(f.properties.total_jobs)*CANDIDATE_STYLE.radiusPerSqrtJob,
      getFillColor:CANDIDATE_STYLE.centerColor,stroked:true,lineWidthUnits:"pixels",getLineWidth:1,
      getLineColor:f => active("center",f.properties.id) ? CANDIDATE_STYLE.highlight : CANDIDATE_STYLE.outlineColor,
      onHover:({object}) => onHover(object ? {kind:"center",id:object.properties.id} : null),
      onClick:({object}) => {if(object) {onSelect({kind:"center",id:object.properties.id}); return true;} return false;},
      updateTriggers:{getLineColor:[selected,hovered]},
    }),
  ];
}
