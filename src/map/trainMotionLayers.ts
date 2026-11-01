import { TripsLayer } from "@deck.gl/geo-layers";
import { TRAIN_MOTION, type TrainPath, type TrainTrip } from "./trainMotion";
import { TRANSIT_ALPHA_BLEND } from "./transitStyle";

export function trainMotionLayers(paths: TrainPath[], elapsedSeconds: number) {
  return paths.map(path => new TripsLayer<TrainTrip>({
    id: `transit-trains-${path.id}`,
    data: path.trips,
    getPath: trip => trip.path,
    getTimestamps: trip => trip.timestamps,
    getColor: TRAIN_MOTION.color,
    getWidth: TRAIN_MOTION.widthPixels,
    widthUnits: "pixels",
    capRounded: true,
    jointRounded: true,
    fadeTrail: true,
    trailLength: Math.min(TRAIN_MOTION.trailSeconds, path.duration * TRAIN_MOTION.spacingFraction / 3),
    currentTime: elapsedSeconds % path.duration,
    parameters: TRANSIT_ALPHA_BLEND,
    pickable: false,
  }));
}
