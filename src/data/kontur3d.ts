import { POPULATION_DISPLAY } from "../map/populationDisplay.ts";
import type { Hex } from "./kontur";
export const pillarDefaults = { coverage: 0.35, exaggeration: POPULATION_DISPLAY.exaggeration, scale: "sqrt" as const };
export const hexCenter = (hex: Hex): [number, number] => {
  const ring = hex.geometry.coordinates[0].slice(0, -1);
  return ring.reduce<[number, number]>(
    (sum, p) => [sum[0] + p[0] / ring.length, sum[1] + p[1] / ring.length],
    [0, 0],
  );
};
