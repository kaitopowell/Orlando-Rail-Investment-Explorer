import {useCallback, useEffect, useState} from "react";
import {loadCandidates, type CandidateData, type CandidateSelection} from "../data/candidates";
export function useCandidates() {
  const [enabled, setEnabled] = useState(false);
  const [data, setData] = useState<CandidateData | null>(null);
  const [status, setStatus] = useState<"off" | "loading" | "ready" | "error">("off");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [selection, select] = useState<CandidateSelection>(null);
  const retry = useCallback(() => setAttempt(n => n+1), []);
  const toggle = useCallback(() => setEnabled(v => !v), []);
  useEffect(() => {
    select(null);
    if (!enabled) { setStatus("off"); return; }
    const abort = new AbortController();
    setData(null); setStatus("loading"); setError("");
    loadCandidates(abort.signal).then(result => {
      if (!abort.signal.aborted) { setData(result); setStatus("ready"); }
    }).catch((e: unknown) => {
      if (!abort.signal.aborted) { setStatus("error"); setError(e instanceof Error ? e.message : "Candidate data unavailable."); }
    });
    return () => abort.abort();
  }, [enabled, attempt]);
  return {enabled, data, status, error, retry, toggle, selection, select};
}
export type CandidateState = ReturnType<typeof useCandidates>;
