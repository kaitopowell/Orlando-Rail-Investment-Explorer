import { useEffect, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import type { SunshineState } from "../components/useSunshine";
import { SunshineDetails } from "../components/SunshineControls";
import { SUNSHINE_COLOR, type SunshineItem } from "../data/sunshine";
import { transitLayers } from "./transitLayers";
export default function SunshineOverlay({
  state,
  map,
  overlay,
}: {
  state: SunshineState;
  map: MapLibreMap;
  overlay: Pick<MapboxOverlay, "setProps">;
}) {
  const [zoom, setZoom] = useState(map.getZoom()),
    [hovered, setHovered] = useState<SunshineItem | null>(null);
  useEffect(() => {
    const update = () => setZoom(map.getZoom());
    map.on("zoom", update);
    return () => {
      map.off("zoom", update);
    };
  }, [map]);
  useEffect(() => {
    overlay.setProps({
      layers:
        state.enabled && state.data
          ? transitLayers(
              state.data.features,
              hovered?.properties.id ?? state.selected?.properties.id ?? null,
              1,
              zoom,
              setHovered,
              state.select,
              {
                idPrefix: "sunshine",
                colors: { color: SUNSHINE_COLOR, core: SUNSHINE_COLOR },
              },
            )
          : [],
    });
  }, [
    state.enabled,
    state.data,
    state.selected,
    state.select,
    hovered,
    zoom,
    overlay,
  ]);
  useEffect(() => () => overlay.setProps({ layers: [] }), [overlay]);
  useEffect(() => {
    if (!state.enabled) setHovered(null);
  }, [state.enabled]);
  return state.enabled && state.selected ? (
    <aside className="sunshine-popup" aria-label="Sunshine Corridor details">
      <button
        aria-label="Close Sunshine Corridor details"
        onClick={() => state.select(null)}
      >
        ×
      </button>
      <SunshineDetails item={state.selected} />
    </aside>
  ) : null;
}
