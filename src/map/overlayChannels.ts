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
    { layers: [] },
  ];
  return state.map((_, index) => ({
    setProps(props: Props) {
      state[index] = { ...state[index], ...props };
      const layers = _flatten(
        state.map((p) => p.layers),
        Boolean,
      ) as Layer<{ beforeId?: string }>[];
      // Stable visual phases across channels: a later rail source must not
      // paint over another source's station markers or labels.
      const phase = (layer: Layer) => {
        if (!/^(rail-plan-|sunshine-|transit-)/.test(layer.id)) return 0;
        if (/labels$/.test(layer.id)) return 4;
        if (/station|commute-ends/.test(layer.id)) return 3;
        if (/casing$/.test(layer.id)) return 1;
        return 2;
      };
      layers.sort((a, b) => phase(a) - phase(b));
      const pillars = layers.some(
        (layer) => layer.id === "population-hexagon-pillars" || layer.id === "employment-block-needles",
      );
      const railPlanActive = layers.some(layer => layer.id.startsWith("rail-plan-"));
      const transitActive = layers.some(layer => layer.id === "lynx-stops" || layer.id.startsWith("transit-"));
      overlay.setProps({
        // Equity stays below Population even when pillars move below map labels.
        // Without transit, retain the existing demand-layer placement.
        layers: layers.map((layer) =>
          // Station-name backgrounds keep native labels from overprinting names.
          layer.id === "rail-plan-labels" ? layer.clone({ beforeId: undefined }) :
          // Transit and demand share a slot below labels and county outlines,
          // preserving demand < bus < rail order even across overlay updates.
          (layer.id.startsWith("candidate-") || layer.id.startsWith("flow-") || layer.id.startsWith("rail-plan-") || layer.id.startsWith("sunshine-") || transitActive || railPlanActive || layers.some(l => l.id.startsWith("population-hexagon")))
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
