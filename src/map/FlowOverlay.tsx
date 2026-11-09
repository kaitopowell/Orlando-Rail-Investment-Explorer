import {useEffect,useState} from 'react';
import type {Map as MapLibreMap} from 'maplibre-gl';
import type {MapboxOverlay} from '@deck.gl/mapbox';
import type {CandidateState} from '../components/useCandidates';
import type {FlowState} from '../components/useFlows';
import type {LabelState} from '../components/useCenterLabels';
import {flowLayers} from './flowLayers';
import {placeLabels,placeLabelLayer} from './placeLabels';
export default function FlowOverlay({map,overlay,state,candidates,labels,onSelect}:{map:MapLibreMap;overlay:Pick<MapboxOverlay,'setProps'>;state:FlowState;candidates:CandidateState;labels:LabelState;onSelect:(id:string)=>void}) {
 const [hovered,setHovered]=useState<string|null>(null),[view,setView]=useState(0);
 useEffect(()=>{const update=()=>setView(v=>v+1);const moved=()=>{update();map.once('idle',update);};map.on('moveend',moved);map.on('resize',moved);map.once('idle',update);return()=>{map.off('moveend',moved);map.off('resize',moved);map.off('idle',update);};},[map]);
 useEffect(()=>{
  const data=candidates.status==='ready'?candidates.data:null;
  if(!data||(!candidates.enabled&&!state.enabled)){overlay.setProps({layers:[]});return;}
  const flows=state.enabled&&state.data?state.data.flows.slice(0,state.topN):[];
  overlay.setProps({layers:[...(flows.length?flowLayers(flows,data,state.selected,hovered,setHovered,onSelect):[]),placeLabelLayer(placeLabels(map,data,labels.labels,flows,candidates.enabled||state.enabled,state.selected))]});
 },[map,overlay,candidates.data,candidates.status,candidates.enabled,state.enabled,state.data,state.topN,state.selected,labels.labels,hovered,onSelect,view]);
 useEffect(()=>()=>overlay.setProps({layers:[]}),[overlay]);
 useEffect(()=>{if(!state.enabled)setHovered(null);},[state.enabled]);
 return null;
}
