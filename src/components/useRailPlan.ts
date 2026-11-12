import { useEffect, useMemo, useState } from "react";
import {
  budgetStops,
  DEFAULT_BUDGET,
  loadRailData,
  networkAt,
  scenarioId,
  type CostCase,
  type Measure,
  type RailData,
  type RailSelection,
} from "../data/railPlan";
export function useRailPlan(needed = false) {
  const [enabled, setEnabled] = useState(false),
    [data, setData] = useState<RailData | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  const [cost, setCost] = useState<CostCase>("low"),
    [overhead, setOverhead] = useState(20),
    [measure, setMeasure] = useState<Measure>("minutes_saved"),
    [ratio, setRatio] = useState(2),
    [budget, setBudget] = useState(DEFAULT_BUDGET);
  const [core, setCore] = useState(false),
    [colorBy, setColorBy] = useState<"phase" | "type">("phase"),
    [selection, select] = useState<RailSelection>(null),
    [caveatsOpen, setCaveatsOpen] = useState(true);
  useEffect(() => {
    if ((!enabled && !needed) || data) return;
    let disposed = false;
    setError("");
    loadRailData()
      .then((d) => {
        if (!disposed) setData(d);
      })
      .catch((e) => {
        if (!disposed) setError(e.message);
      });
    return () => {
      disposed = true;
    };
  }, [enabled, needed, data, attempt]);
  const id = scenarioId(cost, overhead, measure, ratio),
    scenario = data?.plan.scenarios.find((s) => s.id === id);
  const network = useMemo(
    () => (data && scenario ? networkAt(data.plan, scenario, budget) : null),
    [data, scenario, budget],
  );
  const stops = useMemo(
    () =>
      data && scenario ? budgetStops(data.plan, scenario) : [0, 10000, 30000],
    [data, scenario],
  );
  useEffect(() => {
    setBudget((b) =>
      stops.includes(b) ? b : ([...stops].reverse().find((n) => n <= b) ?? 0),
    );
  }, [stops]);
  useEffect(() => {
    select(null);
  }, [id, budget, enabled]);
  return {
    enabled,
    setEnabled,
    data,
    error,
    retry: () => setAttempt((n) => n + 1),
    cost,
    setCost,
    overhead,
    setOverhead,
    measure,
    setMeasure,
    ratio,
    setRatio,
    budget,
    setBudget,
    core,
    setCore,
    colorBy,
    setColorBy,
    selection,
    select,
    caveatsOpen,
    setCaveatsOpen,
    scenario,
    network,
    stops,
  };
}
export type RailState = ReturnType<typeof useRailPlan>;
