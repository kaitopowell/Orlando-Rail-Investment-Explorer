import {useEffect, useState} from "react";
import type {MapboxOverlay} from "@deck.gl/mapbox";
import type {CandidateState} from "../components/useCandidates";
import type {CandidateSelection} from "../data/candidates";
import {candidateLayers} from "./candidateLayers";
export default function CandidateOverlay({state,overlay,onSelect}: {state:CandidateState;overlay:Pick<MapboxOverlay,"setProps">;onSelect:(s:CandidateSelection)=>void}) {
  const [hovered,setHovered] = useState<CandidateSelection>(null);
  useEffect(() => {
    overlay.setProps({layers:state.enabled && state.status === "ready" && state.data ? candidateLayers(state.data,state.selection,hovered,setHovered,onSelect) : []});
  }, [overlay,state.enabled,state.status,state.data,state.selection,hovered,onSelect]);
  useEffect(() => () => overlay.setProps({layers:[]}), [overlay]);
  useEffect(() => {if(!state.enabled) setHovered(null);}, [state.enabled]);
  return null;
}
