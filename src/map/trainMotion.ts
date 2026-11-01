import type { TransitItem } from "../data/transit";

// Decorative display settings only: never schedules, frequency or ridership.
export const TRAIN_MOTION = {
  trainsPerPath: 3,
  spacingFraction: 1 / 3,
  speedMetresPerSecond: 700,
  trailSeconds: 1.4,
  widthPixels: 2.5,
  color: [89, 210, 218, 190] as [number, number, number, number],
};
export type TrainTrip = { path: [number, number][]; timestamps: number[] };
export type TrainPath = { id: string; duration: number; trips: TrainTrip[] };
const EARTH_RADIUS_METRES = 6_371_008.8;
function distance(a: number[], b: number[]) {
  const rad = Math.PI / 180;
  const dlat = (b[1] - a[1]) * rad;
  const dlon = (b[0] - a[0]) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dlon / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(Math.min(1, h)));
}

// Called only when loaded line features change. Each disconnected part stays
// separate: no invented connector between MultiLineString components.
export function prepareTrainPaths(items: TransitItem[]): TrainPath[] {
  return items.flatMap(item => {
    const geometry = item.geometry;
    const paths = geometry.type === "LineString" ? [geometry.coordinates]
      : geometry.type === "MultiLineString" ? geometry.coordinates : [];
    return paths.flatMap((coordinates, part) => {
      if (coordinates.length < 2) return [];
      const path = coordinates.map(p => [p[0], p[1]] as [number, number]);
      const timestamps = [0];
      for (let i = 1; i < path.length; i++)
        timestamps.push(timestamps[i - 1] + distance(path[i - 1], path[i]) / TRAIN_MOTION.speedMetresPerSecond);
      const duration = timestamps.at(-1)!;
      if (!(duration > 0) || !Number.isFinite(duration)) return [];
      const trips: TrainTrip[] = [];
      for (let train = 0; train < TRAIN_MOTION.trainsPerPath; train++) {
        const offset = train * TRAIN_MOTION.spacingFraction * duration;
        // Previous-cycle copies preserve the short tail across clock wrap.
        for (const cycle of [-1, 0])
          trips.push({ path, timestamps: timestamps.map(t => t + offset + cycle * duration) });
      }
      return [{ id: `${item.properties.id}-${part}`, duration, trips }];
    });
  });
}
