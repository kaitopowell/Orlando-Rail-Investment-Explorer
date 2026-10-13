// Display styling only; neither radius nor fill changes the underlying tract data.
export const populationPitch = 45;
export const columnRadiusPixels = (zoom: number) =>
  Math.min(8, 2.5 + Math.max(0, zoom - 8) * 0.8);

export function densityFillAlpha(
  density: number | null,
  maximum: number,
): number {
  if (density === null) return 0;
  // A quiet base tint keeps low-density polygons legible; intensity uses the
  // same square-root transform as height, normalized to this dataset's maximum.
  const intensity = maximum > 0 ? Math.sqrt(Math.max(0, density) / maximum) : 0;
  return Math.round(8 + 24 * Math.min(1, intensity));
}

// Keep city names and major roads as orientation cues.
export const minorPopulationLabel =
  /^(poi_|housenumber$|roadname_(minor|sec)$|place_(hamlet|suburbs|villages)$)/;

// Shared by extruded tracts and the 3D legend; 2D encodings stay unchanged.
export const tractRamp = [
  [8, 65, 70],
  [40, 219, 235],
  [255, 244, 220],
] as const;
export const tractRampCss = `linear-gradient(to right, ${tractRamp.map((c) => `rgb(${c.join(",")})`).join(",")})`;
export const tractExaggeration = 4;
export const tractHeight = (density: number | null) =>
  density !== null && density > 0
    ? 20 * tractExaggeration * Math.sqrt(density)
    : 0;
export function tractColor(
  density: number | null,
  maximum: number,
): [number, number, number, number] {
  const t = maximum > 0 ? Math.sqrt(Math.max(0, density ?? 0) / maximum) : 0;
  const scaled = Math.min(1, t) * 2;
  const index = Math.min(1, Math.floor(scaled));
  const mix = scaled - index;
  const rgb = tractRamp[index].map((value, channel) =>
    Math.round(value + (tractRamp[index + 1][channel] - value) * mix),
  );
  return [rgb[0], rgb[1], rgb[2], 190];
}
