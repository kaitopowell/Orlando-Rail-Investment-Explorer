import { PathLayer, ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Color } from "@deck.gl/core";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { RailCenter, RailLink, RailSelection } from "../data/railPlan";
import type { RailState } from "../components/useRailPlan";
export const PHASES = [
  { max: 2500, label: "$0–2.5B", color: [86, 180, 233] },
  { max: 5000, label: "$2.5–5B", color: [230, 159, 0] },
  { max: 10000, label: "$5–10B", color: [0, 158, 115] },
  { max: 15000, label: "$10–15B", color: [204, 121, 167] },
  { max: 20000, label: "$15–20B", color: [240, 228, 66] },
  { max: 30000, label: "$20–30B", color: [213, 94, 0] },
];
export const LINK_TYPES = {
  passenger_corridor: { label: "Passenger corridor", color: [86, 180, 233] },
  freight_corridor: { label: "Freight corridor", color: [230, 159, 0] },
  new_alignment: { label: "New alignment", color: [204, 121, 167] },
};
export const RAIL_STYLE = {
  width: 5,
  casing: 8,
  stationRadius: 4,
  anchorRadius: 6,
  labelZoom: 11,
  fontSize: 12,
};
const parameters = {
  depthCompare: "always",
  depthWriteEnabled: false,
} as const;
export function railPlanLayers(
  state: RailState,
  hovered: RailSelection,
  onHover: (s: RailSelection) => void,
  onSelect: (s: RailSelection) => void,
  map: MapLibreMap,
) {
  const { data, network, scenario } = state;
  if (!state.enabled || !data || !network || !scenario) return [];
  const active = (kind: "link" | "station", id: string) =>
    [hovered, state.selection].some(
      (s) =>
        (s?.kind === kind && s.id === id) ||
        (kind === "link" &&
          s?.kind === "step" &&
          scenario.steps
            .find((st) => st.route_id === s.id)
            ?.new_link_ids.includes(id)),
    );
  const color = (l: RailLink): Color => {
    const step = scenario.steps[network.built.get(l.id)!];
    const rgb =
      state.colorBy === "type"
        ? LINK_TYPES[l.class].color
        : PHASES.find((p) => step.total_cost_musd <= p.max)!.color;
    return [
      rgb[0],
      rgb[1],
      rgb[2],
      state.core && !data.plan.core_link_ids.includes(l.id) ? 65 : 255,
    ] as Color;
  };
  const paths = {
    data: network.links,
    getPath: (l: RailLink) => l.coords,
    widthUnits: "pixels" as const,
    capRounded: true,
    jointRounded: true,
    parameters,
  };
  const labels = stationLabels(network.stations, map);
  return [
    new PathLayer<RailLink>({
      ...paths,
      id: "rail-plan-casing",
      getColor: [7, 14, 20, 255],
      getWidth: (l: RailLink) =>
        active("link", l.id) ? 11 : RAIL_STYLE.casing,
      updateTriggers: { getWidth: [state.selection, hovered] },
    }),
    new PathLayer<RailLink>({
      ...paths,
      id: "rail-plan-links",
      pickable: true,
      getColor: color,
      getWidth: (l: RailLink) =>
        active("link", l.id)
          ? 8
          : state.core && data.plan.core_link_ids.includes(l.id)
            ? 7
            : RAIL_STYLE.width,
      onHover: ({ object }) =>
        onHover(object ? { kind: "link", id: object.id } : null),
      onClick: ({ object }) => {
        if (object) {
          onSelect({ kind: "link", id: object.id });
          return true;
        }
        return false;
      },
      updateTriggers: {
        getColor: [state.core, state.colorBy, scenario.id],
        getWidth: [state.selection, hovered, state.core],
      },
    }),
    new ScatterplotLayer<RailCenter>({
      id: "rail-plan-stations",
      data: network.stations,
      pickable: true,
      parameters,
      getPosition: (c) => [c.lon, c.lat],
      radiusUnits: "pixels",
      getRadius: (c) =>
        c.anchor ? RAIL_STYLE.anchorRadius : RAIL_STYLE.stationRadius,
      getFillColor: [241, 244, 245, 255],
      stroked: true,
      getLineColor: (c) =>
        active("station", c.id) ? [86, 180, 233, 255] : [10, 19, 25, 255],
      getLineWidth: 2,
      lineWidthUnits: "pixels",
      onHover: ({ object }) =>
        onHover(object ? { kind: "station", id: object.id } : null),
      onClick: ({ object }) => {
        if (object) {
          onSelect({ kind: "station", id: object.id });
          return true;
        }
        return false;
      },
      updateTriggers: { getLineColor: [state.selection, hovered] },
    }),
    new TextLayer({
      id: "rail-plan-labels",
      data: labels,
      parameters,
      getPosition: (d) => [d.lon, d.lat],
      getText: (d) => d.name,
      getPixelOffset: (d) => d.offset,
      getSize: RAIL_STYLE.fontSize,
      getColor: [240, 244, 246, 255],
      fontFamily: "Arial",
      fontWeight: 600,
      billboard: true,
      background: true,
      getBackgroundColor: [9, 17, 23, 235],
      backgroundPadding: [4, 2],
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
    }),
  ];
}
function stationLabels(stations: RailCenter[], map: MapLibreMap) {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = `600 ${RAIL_STYLE.fontSize}px Arial`;
  const boxes: { x: number; y: number; w: number; h: number }[] = [],
    labels: (RailCenter & { offset: [number, number] })[] = [];
  for (const c of [...stations].sort(
    (a, b) =>
      Number(b.anchor) - Number(a.anchor) ||
      b.jobs - a.jobs ||
      a.id.localeCompare(b.id),
  )) {
    if (!c.anchor && map.getZoom() < RAIL_STYLE.labelZoom) continue;
    const p = map.project([c.lon, c.lat]),
      w = ctx.measureText(c.name).width + 10,
      h = 20;
    for (const offset of [
      [0, -18],
      [0, 20],
      [w / 2 + 12, 0],
      [-w / 2 - 12, 0],
    ] as [number, number][]) {
      const b = {
        x: p.x + offset[0] - w / 2,
        y: p.y + offset[1] - h / 2,
        w,
        h,
      };
      if (
        b.x < 0 ||
        b.y < 0 ||
        b.x + w > map.getCanvas().clientWidth ||
        b.y + h > map.getCanvas().clientHeight ||
        boxes.some(
          (a) =>
            b.x < a.x + a.w &&
            b.x + b.w > a.x &&
            b.y < a.y + a.h &&
            b.y + b.h > a.y,
        )
      )
        continue;
      boxes.push(b);
      labels.push({ ...c, offset });
      break;
    }
  }
  return labels;
}
