import { PathLayer, ScatterplotLayer } from "@deck.gl/layers";
import type { RailState } from "../components/useRailPlan";
import { schematicPath } from "./schematic";
export function commuteLayers(state: RailState) {
  if (!state.route || !state.data) return [];
  const nodes = new Map(state.data.plan.nodes.map((n) => [n.id, n]));
  const paths = state.route.edges.map((edge) => {
    const a = nodes.get(edge.a)!,
      b = nodes.get(edge.b)!,
      from: [number, number] = [a.lon, a.lat],
      to: [number, number] = [b.lon, b.lat];
    return {
      id: edge.id,
      path:
        state.drawing === "schematic"
          ? schematicPath(from, to, edge.a, edge.b)
          : [from, to],
    };
  });
  const ends = [...new Set([state.commute.from, state.commute.to])].map(
    (id) => nodes.get(id)!,
  );
  return [
    new PathLayer({
      id: "rail-plan-commute-casing",
      data: paths,
      getPath: (d) => d.path,
      getColor: [8, 18, 27, 255],
      getWidth: 8,
      widthUnits: "pixels",
      capRounded: true,
      jointRounded: true,
      parameters: { depthCompare: "always", depthWriteEnabled: false },
    }),
    new PathLayer({
      id: "rail-plan-commute-path",
      data: paths,
      getPath: (d) => d.path,
      getColor: [245, 247, 251, 255],
      getWidth: 4,
      widthUnits: "pixels",
      capRounded: true,
      jointRounded: true,
      parameters: { depthCompare: "always", depthWriteEnabled: false },
    }),
    new ScatterplotLayer({
      id: "rail-plan-commute-ends",
      data: ends,
      getPosition: (n) => [n.lon, n.lat],
      radiusUnits: "pixels",
      getRadius: 10,
      stroked: true,
      getFillColor: [10, 24, 32, 255],
      getLineColor: [255, 255, 255, 255],
      lineWidthUnits: "pixels",
      getLineWidth: 3,
      billboard: true,
      parameters: { depthCompare: "always", depthWriteEnabled: false },
    }),
  ];
}
