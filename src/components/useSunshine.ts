import { useEffect, useState } from "react";
import {
  loadSunshine,
  type SunshineData,
  type SunshineItem,
} from "../data/sunshine";
export function useSunshine() {
  const [enabled, setEnabled] = useState(false),
    [data, setData] = useState<SunshineData | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0),
    [selected, select] = useState<SunshineItem | null>(null);
  useEffect(() => {
    if (!enabled || data) return;
    let disposed = false;
    setError("");
    loadSunshine()
      .then((d) => {
        if (!disposed) setData(d);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
    };
  }, [enabled, data, attempt]);
  useEffect(() => {
    if (!enabled) select(null);
  }, [enabled]);
  return {
    enabled,
    setEnabled,
    data,
    error,
    retry: () => setAttempt((n) => n + 1),
    selected,
    select,
  };
}
export type SunshineState = ReturnType<typeof useSunshine>;
