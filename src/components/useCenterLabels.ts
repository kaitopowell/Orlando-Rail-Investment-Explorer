import {useEffect,useState,useCallback} from 'react';
import {parseCenterLabels,type CenterLabels} from '../data/centerLabels';
import type {CandidateData} from '../data/candidates';
export function useCenterLabels(candidates:CandidateData|null,enabled:boolean) {
  const [labels,setLabels]=useState<CenterLabels>(new Map()),[missing,setMissing]=useState<string[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false),[attempt,setAttempt]=useState(0);
  const retry=useCallback(()=>setAttempt(n=>n+1),[]);
  useEffect(()=>{
    if(!enabled||!candidates)return;
    const abort=new AbortController();setLoading(true);setLabels(new Map());setError('');setMissing([]);
    fetch('/data/center_labels.csv',{signal:abort.signal}).then(async r=>{if(!r.ok)throw new Error('Could not load center_labels.csv.');return parseCenterLabels(await r.text(),candidates.byId);}).then(result=>{if(!abort.signal.aborted){setLabels(result.labels);setMissing(result.missing);setLoading(false);}}).catch((e:unknown)=>{if(!abort.signal.aborted){setError(e instanceof Error?e.message:'Editorial labels unavailable.');setLoading(false);}});
    return ()=>abort.abort();
  },[enabled,candidates,attempt]);
  return {labels,missing,error,loading,retry};
}
export type LabelState=ReturnType<typeof useCenterLabels>;
