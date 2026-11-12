export type Coordinate = [number, number];
// Normalized Web Mercator, independent of camera zoom, bearing and pitch.
export function project([lon, lat]: Coordinate): Coordinate {
  return [
    (lon * Math.PI) / 180,
    Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
  ];
}
export function unproject([x, y]: Coordinate): Coordinate {
  return [
    (x * 180) / Math.PI,
    ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI,
  ];
}
export function schematicPath(
  a: Coordinate,
  b: Coordinate,
  aId: string,
  bId: string,
): Coordinate[] {
  const reverse = aId < bId,
    start = project(reverse ? b : a),
    end = project(reverse ? a : b),
    dx = end[0] - start[0],
    dy = end[1] - start[1],
    d = Math.min(Math.abs(dx), Math.abs(dy));
  const corner: Coordinate = [
    start[0] + Math.sign(dx) * d,
    start[1] + Math.sign(dy) * d,
  ];
  if (d < 1e-12 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-12) return [a, b];
  return [a, unproject(corner), b];
}
