import { useEffect, useRef } from "react";
import type { Layer } from "@deck.gl/core";
import type { MapboxOverlay } from "@deck.gl/mapbox";
import type { TrainPath } from "./trainMotion";
import { trainMotionLayers } from "./trainMotionLayers";

export function useTrainMotion(
  overlay: Pick<MapboxOverlay, "setProps">,
  baseLayers: Layer[],
  paths: TrainPath[],
  enabled: boolean,
  paused: boolean,
) {
  const elapsed = useRef(0);
  const render = useRef(() => {});
  // The station pulse/hover can change base layers without restarting the clock
  // or rebuilding any geometry/timestamps. Trains stay below station labels.
  useEffect(() => {
    render.current = () => {
      const layers = [...baseLayers];
      if (enabled) {
        const index = layers.findIndex(layer => layer.id === "transit-station-glow");
        layers.splice(index < 0 ? layers.length : index, 0, ...trainMotionLayers(paths, elapsed.current));
      }
      overlay.setProps({ layers });
    };
    render.current();
  }, [overlay, baseLayers, paths, enabled]);
  useEffect(() => {
    if (!enabled || paused || !paths.length) return;
    let frame = 0;
    let previous: number | undefined;
    const tick = (now: number) => {
      if (previous !== undefined && !document.hidden) elapsed.current += (now - previous) / 1000;
      previous = now;
      render.current();
      frame = requestAnimationFrame(tick);
    };
    // A hidden tab resumes without jumping ahead by its entire hidden duration.
    const visibility = () => { previous = undefined; };
    document.addEventListener("visibilitychange", visibility);
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [enabled, paused, paths]);
  useEffect(() => () => overlay.setProps({ layers: [] }), [overlay]);
}
