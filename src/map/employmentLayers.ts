import { ColumnLayer, GeoJsonLayer, ScatterplotLayer } from "@deck.gl/layers";
import {
  jobColor,
  jobHeight,
  jobRadius,
  type JobData,
  type JobTract,
  type JobProperties,
  type JobScale,
  type JobMeasure,
} from "../data/employment";
import type { PickingInfo } from "@deck.gl/core";
class TaperedColumn extends ColumnLayer<JobTract> {
  static layerName = "EmploymentTaperedColumn";
  getShaders() {
    const s = super.getShaders();
    return {
      ...s,
      inject: {
        ...s.inject,
        "vs:#main-start": "geometry.uv.x = (positions.z + 1.0) * 0.5;",
        "vs:DECKGL_FILTER_SIZE": "size.xy *= mix(1.0, 0.2, geometry.uv.x);",
      },
    };
  }
}
class JobGlow extends ScatterplotLayer<JobTract> {
  static layerName = "EmploymentGlow";
  getShaders() {
    const s = super.getShaders();
    return {
      ...s,
      inject: {
        ...s.inject,
        "fs:DECKGL_FILTER_COLOR":
          "color.a *= pow(max(0.0, 1.0 - length(geometry.uv)), 2.0);",
      },
    };
  }
}
const additive = {
  blend: true,
  blendColorOperation: "add",
  blendColorSrcFactor: "src-alpha",
  blendColorDstFactor: "one",
  blendAlphaSrcFactor: "one",
  blendAlphaDstFactor: "one-minus-src-alpha",
  depthWriteEnabled: false,
} as const;
export function employmentLayers(
  data: JobData,
  is3D: boolean,
  zoom: number,
  measure: JobMeasure,
  scale: JobScale,
  exag: number,
  highlight: string | null,
  hover: (f: JobTract | null) => void,
  select: (f: JobTract) => void,
) {
  const positive = data.features.filter((f) => f.properties.jobs_total > 0);
  const max = Math.max(...positive.map((f) => f.properties[measure] ?? 0)),
    maxJobs = Math.max(...positive.map((f) => f.properties.jobs_total)),
    maxDensity = Math.max(
      ...positive.map((f) => f.properties.jobs_per_km2 ?? 0),
    );
  const events = {
    onHover: (info: PickingInfo<JobTract>) => hover(info.object ?? null),
    onClick: (info: PickingInfo<JobTract>) => {
      if (info.object) select(info.object);
      return true;
    },
  };
  const position = (f: JobTract) => f.properties.point;
  return [
    new GeoJsonLayer<JobProperties>({
      id: "employment-tracts",
      data,
      pickable: true,
      filled: true,
      stroked: true,
      getFillColor: (f) => {
        const c = jobColor(f.properties.jobs_per_km2 ?? 0, maxDensity);
        return [c[0], c[1], c[2], f.properties.GEOID === highlight ? 75 : 18];
      },
      getLineColor: (f) =>
        f.properties.GEOID === highlight
          ? [255, 190, 240, 230]
          : [150, 110, 190, 55],
      getLineWidth: (f) => (f.properties.GEOID === highlight ? 1.5 : 0.5),
      lineWidthUnits: "pixels",
      ...events,
      updateTriggers: {
        getFillColor: highlight,
        getLineColor: highlight,
        getLineWidth: highlight,
      },
    }),
    ...(is3D
      ? [
          new JobGlow({
            id: "employment-glow",
            data: positive,
            getPosition: position,
            getRadius: 10,
            radiusUnits: "pixels",
            getFillColor: (f) => {
              const c = jobColor(f.properties[measure] ?? 0, max);
              return [c[0], c[1], c[2], 120];
            },
            parameters: additive,
            pickable: false,
            updateTriggers: { getFillColor: measure },
          }),
          new TaperedColumn({
            id: "employment-columns",
            data: positive,
            getPosition: position,
            radiusUnits: "pixels",
            radius: 2.8,
            diskResolution: 12,
            extruded: true,
            flatShading: true,
            getElevation: (f) =>
              jobHeight(f.properties[measure] ?? 0, max, scale, exag),
            getFillColor: (f) => jobColor(f.properties[measure] ?? 0, max),
            material: {
              ambient: 0.8,
              diffuse: 0.6,
              shininess: 24,
              specularColor: [180, 120, 190],
            },
            pickable: true,
            ...events,
            updateTriggers: {
              getElevation: [measure, scale, exag],
              getFillColor: measure,
            },
          }),
        ]
      : [
          new ScatterplotLayer<JobTract>({
            id: "employment-circles",
            data: positive,
            getPosition: position,
            radiusUnits: "pixels",
            getRadius: (f) => jobRadius(f.properties.jobs_total, maxJobs, zoom),
            getFillColor: (f) => {
              const c = jobColor(f.properties.jobs_total, maxJobs);
              return [c[0], c[1], c[2], 95];
            },
            parameters: additive,
            pickable: true,
            ...events,
            updateTriggers: { getRadius: zoom },
          }),
        ]),
  ];
}
