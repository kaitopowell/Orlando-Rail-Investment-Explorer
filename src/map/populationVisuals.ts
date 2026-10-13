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
