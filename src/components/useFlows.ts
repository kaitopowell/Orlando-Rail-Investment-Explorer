import {useEffect,useState,useCallback} from 'react';
import {DEFAULT_TOP_N,loadFlows,type FlowData} from '../data/flows';
import type {CandidateData} from '../data/candidates';
export function useFlows(enabled:boolean,candidates:CandidateData|null) {
  const [data,setData]=useState<FlowData|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
  const [topN,setTopN]=useState<number>(DEFAULT_TOP_N),[selected,select]=useState<string|null>(null);
  const retry=useCallback(()=>setAttempt(n=>n+1),[]);
  useEffect(()=>{
    setData(null);setError('');select(null);
    if(!enabled||!candidates)return;
    const abort=new AbortController();loadFlows(candidates,abort.signal).then(d=>{if(!abort.signal.aborted)setData(d);}).catch((e:unknown)=>{if(!abort.signal.aborted)setError(e instanceof Error?e.message:'Commute data unavailable.');});
    return ()=>abort.abort();
  },[enabled,candidates,attempt]);
  useEffect(()=>{if(selected&&!data?.flows.slice(0,topN).some(f=>f.id===selected))select(null);},[topN,data,selected]);
  return {enabled,data,error,retry,topN,setTopN,selected,select};
}
export type FlowState=ReturnType<typeof useFlows>;
