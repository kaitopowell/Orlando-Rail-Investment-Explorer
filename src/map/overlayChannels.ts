import type { MapboxOverlay } from "@deck.gl/mapbox";
type Props = Parameters<MapboxOverlay["setProps"]>[0];
// One deck canvas: transit is always last, even when Population updates or clears.
export function overlayChannels(overlay: MapboxOverlay) {
  const state: Props[] = [
    { layers: [] },
    { layers: [] },
    { layers: [] },
    { layers: [] },
  ];
  return state.map((_, index) => ({
    setProps(props: Props) {
      state[index] = { ...state[index], ...props };
      overlay.setProps({
        layers: state.flatMap((p) => (p.layers ? [p.layers] : [])),
        effects: state[2].effects?.length
          ? state[2].effects
          : (state[1].effects ?? []),
      });
    },
  }));
}
