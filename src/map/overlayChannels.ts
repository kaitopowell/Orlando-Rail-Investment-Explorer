import { _flatten, type Layer } from "@deck.gl/core";
import type { MapboxOverlay } from "@deck.gl/mapbox";
type Props = Parameters<MapboxOverlay["setProps"]>[0];
// One deck canvas: transit is always last, even when Population updates or clears.
export function overlayChannels(overlay: MapboxOverlay, labelLayerId?: string) {
  const state: Props[] = [
    { layers: [] },
    { layers: [] },
    { layers: [] },
    { layers: [] },
  ];
  return state.map((_, index) => ({
    setProps(props: Props) {
      state[index] = { ...state[index], ...props };
      const layers = _flatten(
        state.map((p) => p.layers),
        Boolean,
      ) as Layer<{ beforeId?: string }>[];
      const pillars = layers.some(
        (layer) => layer.id === "population-hexagon-pillars",
      );
      overlay.setProps({
        // Equity stays below Population even when pillars move below map labels.
        // Other demand views and transit retain their top-of-basemap order.
        layers: layers.map((layer) =>
          layer.id === "equity-tracts"
            ? layer.clone({ beforeId: pillars ? labelLayerId : undefined })
            : layer,
        ),
        effects: state[2].effects?.length
          ? state[2].effects
          : (state[1].effects ?? []),
      });
    },
  }));
}
