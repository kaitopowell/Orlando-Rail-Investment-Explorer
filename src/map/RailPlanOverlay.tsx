import { useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import type { RailState } from "../components/useRailPlan";
import type { RailSelection } from "../data/railPlan";
import { RailInspection } from "../components/RailPlanControls";
import { railPlanLayers } from "./railPlanLayers";
export default function RailPlanOverlay({
  state,
  map,
  overlay,
  onSelect,
}: {
  state: RailState;
  map: MapLibreMap;
  overlay: Pick<MapboxOverlay, "setProps">;
  onSelect: (s: RailSelection) => void;
}) {
  const [hovered, setHovered] = useState<RailSelection>(null),
    [view, setView] = useState(0);
  useEffect(() => {
    const update = () => setView((n) => n + 1);
    map.on("moveend", update);
    map.on("resize", update);
    return () => {
      map.off("moveend", update);
      map.off("resize", update);
    };
  }, [map]);
  useEffect(() => {
    overlay.setProps({
      layers: railPlanLayers(state, hovered, setHovered, onSelect, map),
    });
  }, [state, hovered, onSelect, map, overlay, view]);
  useEffect(() => () => overlay.setProps({ layers: [] }), [overlay]);
  useEffect(() => {
    setHovered(null);
  }, [state.enabled, state.budget, state.scenario?.id]);
  useEffect(() => {
    if (
      !state.enabled ||
      state.selection?.kind !== "step" ||
      !state.network ||
      !state.scenario
    )
      return;
    const step = state.scenario.steps.find(
      (s) => s.route_id === state.selection?.id,
    );
    const points = state.network.links
      .filter((l) => step?.new_link_ids.includes(l.id))
      .flatMap((l) => l.coords);
    if (!points.length) return;
    const xs = points.map((p) => p[0]),
      ys = points.map((p) => p[1]);
    map.fitBounds(
      [
        [Math.min(...xs), Math.min(...ys)],
        [Math.max(...xs), Math.max(...ys)],
      ],
      {
        padding: 70,
        maxZoom: 12,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 700,
      },
    );
  }, [state.selection, state.enabled, map]);
  return state.enabled && hovered ? (
    <aside className="rail-hover">
      <RailInspection state={state} selection={hovered} />
    </aside>
  ) : null;
}
