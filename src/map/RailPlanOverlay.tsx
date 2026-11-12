import { useEffect, useRef, useState } from "react";
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
    [view, setView] = useState(0),
    [added, setAdded] = useState(new Set<string>());
  const previous = useRef({
    scenario: "",
    budget: state.budget,
    ids: new Set<string>(),
  });
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
    const ids = new Set(state.network?.links.map((l) => l.id)),
      old = previous.current;
    previous.current = {
      scenario: state.scenario?.id ?? "",
      budget: state.budget,
      ids,
    };
    setAdded(new Set());
    if (
      state.enabled &&
      old.scenario === state.scenario?.id &&
      state.budget > old.budget &&
      !matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      setAdded(new Set([...ids].filter((id) => !old.ids.has(id))));
      const timer = setTimeout(() => setAdded(new Set()), 1600);
      return () => clearTimeout(timer);
    }
  }, [state.enabled, state.budget, state.scenario, state.network]);
  useEffect(() => {
    overlay.setProps({
      layers: railPlanLayers(state, hovered, setHovered, onSelect, map, added),
    });
  }, [state, hovered, onSelect, map, overlay, view, added]);
  useEffect(() => () => overlay.setProps({ layers: [] }), [overlay]);
  useEffect(() => {
    setHovered(null);
  }, [state.enabled, state.budget, state.scenario?.id]);
  // Preserve each native layer's exact label zoom range/opacity and restore them on every exit.
  useEffect(() => {
    if (!state.enabled || state.drawing !== "schematic") return;
    const originals = map
      .getStyle()
      .layers.filter((l) => l.type === "symbol" && !l.id.startsWith("deckgl-"))
      .map((l) => ({
        id: l.id,
        min: l.minzoom ?? 0,
        max: l.maxzoom ?? 24,
        opacity: map.getPaintProperty(l.id, "text-opacity"),
      }));
    for (const l of originals) {
      map.setPaintProperty(l.id, "text-opacity", 0.35);
      map.setLayerZoomRange(l.id, Math.min(l.min + 2, l.max), l.max);
    }
    return () => {
      if (!map.getStyle()) return;
      for (const l of originals)
        if (map.getLayer(l.id)) {
          map.setPaintProperty(l.id, "text-opacity", l.opacity ?? null);
          map.setLayerZoomRange(l.id, l.min, l.max);
        }
    };
  }, [map, state.enabled, state.drawing]);
  useEffect(() => {
    if (
      !state.enabled ||
      state.selection?.kind !== "step" ||
      !state.network ||
      !state.scenario
    )
      return;
    const step = state.scenario.steps[Number(state.selection.id)];
    const points = state.network.links
      .filter((l) => step?.new_link_ids.includes(l.id))
      .flatMap((l) => l.coords);
    if (!points.length) return;
    map.fitBounds(
      [
        [
          Math.min(...points.map((p) => p[0])),
          Math.min(...points.map((p) => p[1])),
        ],
        [
          Math.max(...points.map((p) => p[0])),
          Math.max(...points.map((p) => p[1])),
        ],
      ],
      {
        padding: 70,
        maxZoom: 12,
        duration: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 700,
      },
    );
  }, [state.selection, state.enabled, map]);
  return state.enabled && (state.selection || hovered) ? (
    <aside
      className="rail-hover"
      style={{ pointerEvents: state.selection ? "auto" : "none" }}
    >
      <button onClick={() => state.select(null)}>Close rail inspection</button>
      <RailInspection state={state} selection={state.selection ?? hovered} />
    </aside>
  ) : null;
}
