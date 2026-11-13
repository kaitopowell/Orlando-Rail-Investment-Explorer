import { ScatterplotLayer, TextLayer } from "@deck.gl/layers";
import type { Feature, LineString } from "geojson";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { RailSelection } from "../data/railPlan";
import type { RailState } from "../components/useRailPlan";
import {
  displayStations,
  stationLabels,
  LINE_PALETTE,
  rgb,
  type DisplayStation,
} from "../data/networkDisplay";
import { schematicPath } from "./schematic";
import { transitLayers } from "./transitLayers";
export { LINE_PALETTE } from "../data/networkDisplay";
export function railPlanLayers(
  state: RailState,
  hovered: RailSelection,
  onHover: (s: RailSelection) => void,
  onSelect: (s: RailSelection) => void,
  map: MapLibreMap,
  added: Set<string>,
) {
  const { data, network, scenario } = state;
  if (!state.enabled || !data || !network || !scenario) return [];
  const links = network.links.filter((l) => !state.core || data.core.has(l.id));
  const selectedIds = new Set(
    state.selection?.kind === "step"
      ? scenario.steps[Number(state.selection.id)]?.new_link_ids
      : state.selection?.kind === "link"
        ? [state.selection.id]
        : [],
  );
  const features: Feature<LineString, { id: string; name: string }>[] =
    links.map((l) => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates:
          state.drawing === "schematic"
            ? schematicPath(l.coords[0], l.coords[1], l.a, l.b)
            : l.coords,
      },
      properties: { id: l.id, name: `${l.a_name} to ${l.b_name}` },
    }));
  const stations = displayStations(data.plan.nodes, links, scenario),
    labels = placeStationLabels(stations, map);
  const lines = transitLayers(
    features,
    hovered?.kind === "link" ? hovered.id : null,
    1,
    map.getZoom(),
    (f) => onHover(f ? { kind: "link", id: f.properties.id } : null),
    (f) => onSelect({ kind: "link", id: f.properties.id }),
    {
      idPrefix: "rail-plan",
      linesOnly: true,
      coreAlpha: 255,
      rounded: state.drawing === "schematic",
      widthScale: state.drawing === "schematic" ? 1.5 : 1,
      colorFor: (id) => {
        const c = rgb(LINE_PALETTE[network.owner.get(id)!.color_index]);
        return { color: c, core: c };
      },
      opacityFor: (id) =>
        state.hoverLine && network.owner.get(id)?.id !== state.hoverLine
          ? 0.16
          : 1,
      highlightFor: (id) => selectedIds.has(id) || added.has(id),
    },
  );
  return [
    ...lines,
    new ScatterplotLayer<DisplayStation>({
      id: "rail-plan-stations",
      data: stations,
      pickable: true,
      billboard: true,
      parameters: { depthCompare: "always", depthWriteEnabled: false },
      getPosition: (n) => [n.lon, n.lat],
      radiusUnits: "pixels",
      getRadius: (n) =>
        n.kind === "interchange"
          ? 6
          : n.kind === "terminus"
            ? 4
            : n.kind === "existing"
              ? 2.5
              : 2,
      getFillColor: (n) =>
        n.kind === "interchange"
          ? [12, 20, 27, 255]
          : n.kind === "existing"
            ? [115, 125, 134, 220]
            : [240, 244, 247, 255],
      stroked: true,
      getLineColor: (n) =>
        n.kind === "interchange" ? [255, 255, 255, 255] : [12, 20, 27, 255],
      lineWidthUnits: "pixels",
      getLineWidth: (n) => (n.kind === "interchange" ? 2 : 1),
      onHover: ({ object }) =>
        onHover(object ? { kind: "station", id: object.id } : null),
      onClick: ({ object }) => {
        if (object) {
          onSelect({ kind: "station", id: object.id });
          return true;
        }
        return false;
      },
    }),
    new TextLayer({
      id: "rail-plan-labels",
      data: labels,
      getPosition: (n) => [n.lon, n.lat],
      getText: (n) => n.label,
      getPixelOffset: (n) => n.offset,
      getSize: 12,
      getColor: [230, 237, 242, 255],
      fontFamily: "Arial",
      fontWeight: 600,
      background: true,
      getBackgroundColor: [9, 17, 23, 235],
      backgroundPadding: [3, 2],
      billboard: true,
      getTextAnchor: "middle",
      getAlignmentBaseline: "center",
      parameters: { depthCompare: "always", depthWriteEnabled: false },
    }),
  ];
}
function placeStationLabels(stations: DisplayStation[], map: MapLibreMap) {
  const ctx = document.createElement("canvas").getContext("2d")!;
  ctx.font = "600 12px Arial";
  const eligible = stations.filter((n) => {
    if (!n.degree || (n.kind === "pass" && map.getZoom() < 12)) return false;
    const p = map.project([n.lon, n.lat]);
    return (
      p.x >= 0 &&
      p.y >= 0 &&
      p.x <= map.getCanvas().clientWidth &&
      p.y <= map.getCanvas().clientHeight
    );
  });
  const names = stationLabels(eligible);
  const boxes: { x: number; y: number; w: number; h: number }[] = [],
    labels: (DisplayStation & { label: string; offset: [number, number] })[] =
      [];
  const priority = { interchange: 3, terminus: 2, pass: 1, existing: 0 };
  for (const n of [...eligible].sort(
    (a, b) => priority[b.kind] - priority[a.kind] || a.id.localeCompare(b.id),
  )) {
    if (!n.degree || (n.kind === "pass" && map.getZoom() < 12)) continue;
    const p = map.project([n.lon, n.lat]),
      w = ctx.measureText(names.get(n.id)!).width + 8,
      h = 20;
    for (const offset of [
      [0, -18],
      [0, 20],
      [w / 2 + 10, 0],
      [-w / 2 - 10, 0],
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
      labels.push({ ...n, label: names.get(n.id)!, offset });
      break;
    }
  }
  return labels;
}
