import type { Hex, HexData } from "./kontur";
export const pillarDefaults = {
  coverage: 0.35,
  exaggeration: 3,
  scale: "linear" as const,
};
export const pillarRampCss =
  "linear-gradient(to right, rgba(44,61,73,.18), rgba(23,133,139,.6) 94%, #f57b23 95%, #ffe750)";
export const hexCenter = (hex: Hex): [number, number] => {
  const ring = hex.geometry.coordinates[0].slice(0, -1);
  return ring.reduce<[number, number]>(
    (sum, p) => [sum[0] + p[0] / ring.length, sum[1] + p[1] / ring.length],
    [0, 0],
  );
};
// A common radius no larger than ANY supplied hexagon's inscribed radius.
// Thus every pillar stays inside its own polygon, even at coverage 1.
export function pillarRadius(data: HexData) {
  return (
    Math.min(
      ...data.features.map((hex) => {
        const center = hexCenter(hex),
          ring = hex.geometry.coordinates[0];
        const xy = ring.map((p) => [
          (p[0] - center[0]) * 111195 * Math.cos((center[1] * Math.PI) / 180),
          (p[1] - center[1]) * 111195,
        ]);
        return Math.min(
          ...xy.slice(0, -1).map((p, i) => {
            const q = xy[i + 1];
            return (
              Math.abs(p[0] * q[1] - p[1] * q[0]) /
              Math.hypot(q[0] - p[0], q[1] - p[1])
            );
          }),
        );
      }),
    ) * 0.99
  ); // numerical/projection tolerance; display geometry only
}
export function warmThreshold(data: HexData) {
  const values = data.features
    .map((f) => f.properties.population)
    .sort((a, b) => a - b);
  const position = (values.length - 1) * 0.95,
    i = Math.floor(position);
  return values[i] + (values[Math.ceil(position)] - values[i]) * (position - i);
}
export function pillarColor(
  value: number,
  threshold: number,
  maximum: number,
): [number, number, number, number] {
  const warm = value >= threshold;
  const t = warm
    ? maximum > threshold
      ? (value - threshold) / (maximum - threshold)
      : 1
    : threshold > 0
      ? value / threshold
      : 0;
  const low = warm ? [245, 123, 35, 215] : [44, 61, 73, 45];
  const high = warm ? [255, 231, 80, 245] : [23, 133, 139, 155];
  return low.map((v, i) =>
    Math.round(v + (high[i] - v) * Math.max(0, Math.min(1, t))),
  ) as [number, number, number, number];
}
