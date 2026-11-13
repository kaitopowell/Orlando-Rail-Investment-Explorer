import { RightPanel, usePanelSelection } from "./RightPanels";
import { useEffect, useMemo, useState } from "react";
import type { Map } from "maplibre-gl";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import { loadTransit, services, type TransitItem } from "../data/transit";
import { transitLayers } from "../map/transitLayers";
import { prepareTrainPaths } from "../map/trainMotion";
import { useTrainMotion } from "../map/useTrainMotion";
export default function TransitOverlay({
  map,
  overlay,
  enabled,
  motionEnabled,
  motionPaused,
}: {
  map: Map;
  overlay: Pick<MapboxOverlay, "setProps">;
  enabled: boolean;
  motionEnabled: boolean;
  motionPaused: boolean;
}) {
  const [items, setItems] = useState<TransitItem[]>([]);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<TransitItem | null>(null);
  const [hovered, setHovered] = useState<TransitItem | null>(null);
  const [zoom, setZoom] = useState(map.getZoom());
  const [pulse, setPulse] = useState(1);
  const selectOnMap = usePanelSelection("transit", setSelected);
  useEffect(() => {
    if (!enabled) {
      setSelected(null);
      setHovered(null);
      return;
    }
    const abort = new AbortController();
    setError(false);
    loadTransit(abort.signal)
      .then(setItems)
      .catch(() => {
        if (!abort.signal.aborted) setError(true);
      });
    return () => abort.abort();
  }, [enabled, retry]);
  useEffect(() => {
    const update = () => setZoom(map.getZoom());
    map.on("zoom", update);
    return () => {
      map.off("zoom", update);
    };
  }, [map]);
  useEffect(() => {
    if (!enabled) return;
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;
    function start() {
      window.clearInterval(timer);
      setPulse(1);
      if (!media.matches)
        timer = window.setInterval(
          () =>
            setPulse(
              1 + 0.06 * Math.sin(((performance.now() / 1000) * Math.PI) / 2),
            ),
          100,
        );
    }
    start();
    media.addEventListener("change", start);
    return () => {
      window.clearInterval(timer);
      media.removeEventListener("change", start);
    };
  }, [enabled]);
  const trainPaths = useMemo(() => prepareTrainPaths(items), [items]);
  const baseLayers = useMemo(() => enabled && !error ? transitLayers(
    items, hovered?.properties.id ?? selected?.properties.id ?? null,
    pulse, zoom, setHovered, selectOnMap,
  ) : [], [enabled, error, items, hovered, selected, pulse, zoom]);
  useTrainMotion(overlay, baseLayers, trainPaths, enabled && !error && motionEnabled, motionPaused);
  if (!enabled) return null;
  return (
    <RightPanel id="transit" title="Existing transit" reveal={selected} className="transit-panel" aria-label="Existing transit layer">
      <h2>Existing transit</h2>
      <div className="transit-legend">
        <span style={{ color: "#ff8a1f" }}>● SunRail</span>
        <span style={{ color: "#ffd60a" }}>● Brightline · intercity</span>
      </div>
      {error ? (
        <p role="alert">
          Transit data unavailable.{" "}
          <button onClick={() => setRetry(retry + 1)}>Retry transit</button>
        </p>
      ) : items.length === 0 ? (
        <p role="status">Loading transit…</p>
      ) : (
        <>
          <label>
            Inspect transit
            <select
              aria-label="Inspect transit"
              value={selected?.properties.id ?? ""}
              onChange={(e) =>
                setSelected(
                  items.find((f) => f.properties.id === e.target.value) ?? null,
                )
              }
            >
              <option value="">Select a line or station…</option>
              {items.map((f) => (
                <option key={f.properties.id} value={f.properties.id}>
                  {services[f.properties.service].name} · {f.properties.name}
                  {f.geometry.type === "Point" ? " station" : " line"}
                </option>
              ))}
            </select>
          </label>
          {hovered && !selected && <p>{hovered.properties.name}</p>}
          {selected && (
            <div aria-label="Transit details">
              <button
                aria-label="Close transit details"
                onClick={() => setSelected(null)}
              >
                ×
              </button>
              <strong>{selected.properties.name}</strong>
              <p>
                Operator: {services[selected.properties.service].name}
                {selected.properties.service === "brightline" && (
                  <>
                    <br />
                    Intercity service · not local baseline service
                  </>
                )}
              </p>
            </div>
          )}
        </>
      )}
    </RightPanel>
  );
}
