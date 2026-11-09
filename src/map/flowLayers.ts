import {ArcLayer} from '@deck.gl/layers';
import type {Color} from '@deck.gl/core';
import type {CandidateData} from '../data/candidates';
import type {CommuteFlow} from '../data/flows';
export const FLOW_STYLE = {color:[239,112,91,175] as Color, highlight:[255,174,139,240] as Color,
  widthPerSqrtJob:0.04,minWidth:1.2,maxWidth:6,height:0.18,tilt:30} as const;
const parameters={depthCompare:'always',depthWriteEnabled:false,blend:true,blendColorOperation:'add',blendColorSrcFactor:'src-alpha',blendColorDstFactor:'one-minus-src-alpha',blendAlphaOperation:'add',blendAlphaSrcFactor:'one',blendAlphaDstFactor:'one-minus-src-alpha'} as const;
export function flowLayers(flows:CommuteFlow[],centers:CandidateData,selected:string|null,hovered:string|null,onHover:(id:string|null)=>void,onSelect:(id:string)=>void) {
 const color=(f:CommuteFlow)=>f.id===selected||f.id===hovered?FLOW_STYLE.highlight:FLOW_STYLE.color;
 return [new ArcLayer<CommuteFlow>({id:'flow-commute-arcs',data:flows,pickable:true,parameters,
  getSourcePosition:f=>centers.byId.get(f.a)!.geometry.coordinates as [number,number],getTargetPosition:f=>centers.byId.get(f.b)!.geometry.coordinates as [number,number],
  getSourceColor:color,getTargetColor:color,getWidth:f=>Math.sqrt(f.jobs)*FLOW_STYLE.widthPerSqrtJob,widthUnits:'pixels',widthMinPixels:FLOW_STYLE.minWidth,widthMaxPixels:FLOW_STYLE.maxWidth,
  getHeight:FLOW_STYLE.height,getTilt:FLOW_STYLE.tilt,
  onHover:({object})=>onHover(object?.id??null),onClick:({object})=>{if(object){onSelect(object.id);return true;}return false;},
  updateTriggers:{getSourceColor:[selected,hovered],getTargetColor:[selected,hovered]}})];
}
