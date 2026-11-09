import {parseCSV} from "./csv.ts";
import type {CandidateData} from "./candidates";
export type CenterLabels = Map<string, {name:string; confidence:string; note:string}>;
export const placeName = (labels:CenterLabels, id:string) => labels.get(id)?.name || "Unnamed center";
export const pairName = (labels:CenterLabels, a:string, b:string) => `${placeName(labels,a)} to ${placeName(labels,b)}`;
export function parseCenterLabels(csv:string, centers:CandidateData["byId"]) {
  if(csv.replace(/^\uFEFF/, "").split(/\r?\n/,1)[0] !== "center_id,name,confidence,note") throw new Error("Invalid editorial label columns.");
  const labels:CenterLabels = new Map();
  for (const row of parseCSV(csv)) {
    if (Object.keys(row).join(',') !== 'center_id,name,confidence,note' || !centers.has(row.center_id) || labels.has(row.center_id)) throw new Error("Invalid editorial labels: unknown/duplicate center.");
    labels.set(row.center_id,{name:row.name,confidence:row.confidence,note:row.note});
  }
  return {labels, missing:[...centers.keys()].filter(id=>!labels.get(id)?.name.trim()).sort()};
}
