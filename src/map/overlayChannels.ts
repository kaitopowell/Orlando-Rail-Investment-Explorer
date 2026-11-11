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
        (layer) => layer.id === "population-hexagon-pillars" || layer.id === "employment-block-needles",
      );
      const transitActive = layers.some(layer => layer.id === "lynx-stops" || layer.id.startsWith("transit-"));
      overlay.setProps({
        // Equity stays below Population even when pillars move below map labels.
        // Without transit, retain the existing demand-layer placement.
        layers: layers.map((layer) =>
          // Station-name backgrounds keep native labels from overprinting names.
          layer.id === "rail-plan-labels" ? layer.clone({ beforeId: undefined }) :
          // Transit and demand share a slot below labels and county outlines,
          // preserving demand < bus < rail order even across overlay updates.
          (layer.id.startsWith("candidate-") || layer.id.startsWith("flow-") || layer.id.startsWith("rail-plan-") || transitActive || layers.some(l => l.id.startsWith("population-hexagon")))
            ? layer.clone({ beforeId: labelLayerId })
            : layer.id === "equity-tracts" || layer.id === "employment-block-needles"
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
