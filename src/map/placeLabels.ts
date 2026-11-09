import type {Map as MapLibreMap} from 'maplibre-gl';
import {TextLayer} from '@deck.gl/layers';
import type {CandidateData} from '../data/candidates';
import {placeName,type CenterLabels} from '../data/centerLabels';
import type {CommuteFlow} from '../data/flows';
// Cartographic display assumptions, not new center selection or analytical metrics.
export const PLACE_LABEL_STYLE={JOB_THRESHOLD:20000,MIN_ZOOM:8.5,JOB_MIN_ZOOM:9.5,FONT_SIZE:11,PADDING:5,OFFSET_Y:-15} as const;
type Placed={id:string;text:string;position:[number,number]};
export function placeLabels(map:MapLibreMap,candidates:CandidateData,labels:CenterLabels,flows:CommuteFlow[],candidateEnabled:boolean,selected:string|null) {
 if(map.getZoom()<PLACE_LABEL_STYLE.MIN_ZOOM)return [];
 const topIds=new Set(flows.flatMap(f=>[f.a,f.b]));const selectedIds=new Set(flows.filter(f=>f.id===selected).flatMap(f=>[f.a,f.b]));
 const eligible=candidates.centers.filter(c=>topIds.has(c.properties.id)||(candidateEnabled&&map.getZoom()>=PLACE_LABEL_STYLE.JOB_MIN_ZOOM&&c.properties.total_jobs>=PLACE_LABEL_STYLE.JOB_THRESHOLD));
 eligible.sort((a,b)=>Number(selectedIds.has(b.properties.id))-Number(selectedIds.has(a.properties.id))||Number(topIds.has(b.properties.id))-Number(topIds.has(a.properties.id))||b.properties.total_jobs-a.properties.total_jobs||a.properties.id.localeCompare(b.properties.id));
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;ctx.font=`${PLACE_LABEL_STYLE.FONT_SIZE}px Arial`;
 const boxes:{left:number;right:number;top:number;bottom:number}[]=[],placed:Placed[]=[];
 const symbolIds=map.getStyle().layers.filter(l=>l.type==='symbol').map(l=>l.id);
 const width=map.getCanvas().clientWidth,height=map.getCanvas().clientHeight;
 for(const c of eligible){
  const position=c.geometry.coordinates as [number,number],p=map.project(position),text=placeName(labels,c.properties.id);
  const w=ctx.measureText(text).width+2*PLACE_LABEL_STYLE.PADDING,h=PLACE_LABEL_STYLE.FONT_SIZE+2*PLACE_LABEL_STYLE.PADDING,y=p.y+PLACE_LABEL_STYLE.OFFSET_Y;
  const box={left:p.x-w/2,right:p.x+w/2,top:y-h/2,bottom:y+h/2};
  if(box.left<0||box.right>width||box.top<0||box.bottom>height||boxes.some(b=>box.left<b.right&&box.right>b.left&&box.top<b.bottom&&box.bottom>b.top))continue;
  // Basemap symbols have priority. Also reject collisions with their rendered boxes.
  if(symbolIds.length&&map.queryRenderedFeatures([[box.left,box.top],[box.right,box.bottom]],{layers:symbolIds}).length)continue;
  boxes.push(box);placed.push({id:c.properties.id,text,position});
 }
 return placed;
}
export function placeLabelLayer(data:Placed[]) {
 return new TextLayer<Placed>({id:'flow-place-labels',data,pickable:false,getPosition:d=>d.position,getText:d=>d.text,
  getSize:PLACE_LABEL_STYLE.FONT_SIZE,sizeUnits:'pixels',getColor:[230,223,210,235],fontFamily:'Arial',getTextAnchor:'middle',getAlignmentBaseline:'center',getPixelOffset:[0,PLACE_LABEL_STYLE.OFFSET_Y],billboard:true,
  background:true,getBackgroundColor:[13,22,28,215],backgroundPadding:[3,2],parameters:{depthCompare:'always',depthWriteEnabled:false}});
}
