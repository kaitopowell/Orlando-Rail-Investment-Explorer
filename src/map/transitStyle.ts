import type { BusTier } from "../data/lynx";

// All transit visual tuning lives here. These are display settings, not new
// observations: bus colors continue to encode the supplied headway tiers.
export const TRANSIT_STYLE = {
  bus: {
    defaultOpacity: 0.65,
    colors: {
      15: [58, 188, 204, 185],
      20: [43, 148, 184, 185],
      30: [40, 107, 160, 185],
      infrequent: [55, 85, 112, 95],
    } satisfies Record<BusTier, [number, number, number, number]>,
    radii: { 15: 2.4, 20: 2, 30: 1.6, infrequent: 1 } satisfies Record<BusTier, number>,
    highlightColor: [89, 220, 231, 255] as [number, number, number, number],
    highlightRadius: 1,
    highlightWidth: 1.25,
    glowAlpha: 24,
    glowRadiusFactor: 2.2,
  },
  rail: {
    radius: 2.6,
    highlightRadius: 3.8,
    fillAlpha: 185,
    lineAlpha: 180,
    lineWidth: 0.65,
    glowAlpha: 24,
    glowRadiusFactor: 2.2,
    passes: [
      { id: "glow", width: 7, alpha: 10 },
      { id: "halo", width: 3.5, alpha: 25 },
      { id: "core", width: 1.5, alpha: 175 },
    ],
    highlightAlpha: 210,
    highlightWidth: 1,
  },
  zoom: { reference: 10.5, exponent: 0.24, minimum: 0.45, maximum: 1.5 },
  glowFeather: 0.12,
} as const;

export const busColors = TRANSIT_STYLE.bus.colors;
export const busRadii = TRANSIT_STYLE.bus.radii;
export const transitRadiusScale = (zoom: number) => Math.max(
  TRANSIT_STYLE.zoom.minimum,
  Math.min(TRANSIT_STYLE.zoom.maximum, 2 ** ((zoom - TRANSIT_STYLE.zoom.reference) * TRANSIT_STYLE.zoom.exponent)),
);

// Source-over is a convex combination, so repeated overlaps approach the
// selected blue/cyan color instead of adding RGB values until they clip white.
export const TRANSIT_ALPHA_BLEND = {
  depthCompare: "always",
  depthWriteEnabled: false,
  blend: true,
  blendColorOperation: "add",
  blendColorSrcFactor: "src-alpha",
  blendColorDstFactor: "one-minus-src-alpha",
  blendAlphaOperation: "add",
  blendAlphaSrcFactor: "one",
  blendAlphaDstFactor: "one-minus-src-alpha",
} as const;

// A faint annulus behind each point: its center is transparent, so the glow
// does not brighten the point core a second time. No animated bus effects.
export function transitGlowShader(radiusFactor: number) {
  const inner = 1 / radiusFactor;
  return `float r = length(geometry.uv); color.a *= smoothstep(${inner.toFixed(6)}, ${(inner + TRANSIT_STYLE.glowFeather).toFixed(6)}, r) * (1.0 - smoothstep(${(inner + TRANSIT_STYLE.glowFeather).toFixed(6)}, 1.0, r));`;
}
