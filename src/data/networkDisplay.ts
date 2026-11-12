import type { RailLink, RailNode, RailScenario } from "./railPlan";
// Fixed categorical display palette. Names/colors are keyed by the supplied line,
// never by the current budget or construction order. Reserved baseline colors omitted.
export const LINE_PALETTE = [
  "#00C9D8",
  "#3C78D8",
  "#8B62D9",
  "#CC4BC2",
  "#9C284F",
  "#57B45C",
  "#A1C349",
  "#145B68",
  "#80DDD0",
  "#B9A4E8",
  "#E8A0CF",
  "#CBD5E1",
] as const;
export const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];
export const stationName = (name: string) =>
  name.replace(/\s*\([^)]*\)/g, "").trim();
export type DisplayStation = RailNode & {
  kind: "interchange" | "terminus" | "pass" | "existing";
  lines: string[];
  degree: number;
};
export function displayStations(
  nodes: RailNode[],
  links: RailLink[],
  scenario: RailScenario,
): DisplayStation[] {
  const owner = new Map(
      scenario.lines.flatMap((l) =>
        l.link_ids.map((id) => [id, l.id] as const),
      ),
    ),
    incident = new Map<string, RailLink[]>();
  for (const l of links)
    for (const id of [l.a, l.b])
      incident.set(id, [...(incident.get(id) ?? []), l]);
  return nodes
    .filter((n) => n.existing_station || incident.has(n.id))
    .map((n) => {
      const edges = incident.get(n.id) ?? [],
        lines = [...new Set(edges.map((e) => owner.get(e.id)!))];
      return {
        ...n,
        lines,
        degree: edges.length,
        kind: !edges.length
          ? "existing"
          : lines.length >= 2 || n.existing_station
            ? "interchange"
            : edges.length === 1
              ? "terminus"
              : "pass",
      };
    });
}
