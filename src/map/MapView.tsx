import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { addCountyLayers } from "./countyLayers";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { MapboxOverlay } from "@deck.gl/mapbox";
import {
  countyBounds,
  frameStudyArea,
  type Bounds,
  type Counties,
} from "./studyArea";

export default function MapView({
  sidebarOpen,
  countiesVisible,
}: {
  sidebarOpen: boolean;
  countiesVisible: boolean;
}) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const boundsRef = useRef<Bounds | null>(null);
  const sidebarRef = useRef(sidebarOpen);
  const countiesVisibleRef = useRef(countiesVisible);
  const layersRef = useRef<ReturnType<typeof addCountyLayers> | null>(null);
  useEffect(() => {
    countiesVisibleRef.current = countiesVisible;
    layersRef.current?.setVisible(countiesVisible);
  }, [countiesVisible]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [dataError, setDataError] = useState(false);
  useEffect(() => {
    sidebarRef.current = sidebarOpen;
    if (mapRef.current && boundsRef.current)
      frameStudyArea(mapRef.current, boundsRef.current, sidebarOpen);
  }, [sidebarOpen]);
  useEffect(() => {
    const controller = new AbortController();
    let disposed = false;
    let map: maplibregl.Map | undefined;
    let timeout: number | undefined;
    async function initialize() {
      let data: Counties;
      let outside: Feature<Polygon | MultiPolygon>;
      try {
        const response = await fetch("/data/counties.geojson", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("County data unavailable");
        data = await response.json();
        boundsRef.current = countyBounds(data);
        const maskResponse = await fetch("/data/outside-counties.geojson", {
          signal: controller.signal,
        });
        if (!maskResponse.ok) throw new Error("County mask unavailable");
        outside = await maskResponse.json();
      } catch {
        if (!disposed) {
          setDataError(true);
          setStatus("error");
        }
        return;
      }
      if (disposed || !container.current) return;
      try {
        map = new maplibregl.Map({
          container: container.current,
          maxZoom: 18,
          maxPitch: 0,
          dragRotate: false,
          touchPitch: false,
          renderWorldCopies: false,
          style:
            "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
          attributionControl: false,
        });
        map.touchZoomRotate.disableRotation();
        mapRef.current = map;
        frameStudyArea(map, boundsRef.current!, sidebarRef.current);
        map.addControl(new MapboxOverlay({ interleaved: false, layers: [] }));
        map.addControl(
          new maplibregl.NavigationControl({ showCompass: false }),
          "bottom-right",
        );
        map.addControl(
          new maplibregl.AttributionControl({ compact: true }),
          "bottom-right",
        );
        map.on("load", () => {
          if (!map || disposed) return;
          layersRef.current = addCountyLayers(
            map,
            data,
            outside,
            countiesVisibleRef.current,
          );
          setStatus("ready");
        });
        map.on("error", () => setStatus("error"));
        map.on("resize", () => {
          if (map && boundsRef.current)
            frameStudyArea(map, boundsRef.current, sidebarRef.current);
        });
        // A development-only event lets browser tests inspect real camera constraints.
        if (import.meta.env.DEV)
          window.dispatchEvent(
            new CustomEvent("orbit:map-ready", { detail: map }),
          );
        timeout = window.setTimeout(() => {
          if (map && !map.isStyleLoaded()) setStatus("error");
        }, 20000);
      } catch {
        setStatus("error");
      }
    }
    void initialize();
    return () => {
      disposed = true;
      controller.abort();
      window.clearTimeout(timeout);
      layersRef.current?.destroy();
      layersRef.current = null;
      mapRef.current = null;
      map?.remove();
    };
  }, []);
  return (
    <>
      <div
        ref={container}
        className="map"
        aria-label="Interactive map of Greater Orlando"
      />
      <div className="map-status" role="status">
        <span className={`status-dot ${status}`} />
        {status === "ready"
          ? "BASEMAP LIVE"
          : status === "loading"
            ? "LOADING BASEMAP"
            : "MAP UNAVAILABLE"}
      </div>
      {status === "error" && (
        <div className="map-error" role="alert">
          {dataError
            ? "County boundaries could not load. Reload to retry; the regional map is unavailable."
            : "Map resources could not load. Check network access to CARTO and WebGL support, then reload."}
        </div>
      )}
      <button
        className="recenter"
        disabled={dataError}
        onClick={() => {
          if (mapRef.current && boundsRef.current)
            frameStudyArea(
              mapRef.current,
              boundsRef.current,
              sidebarRef.current,
            );
        }}
        aria-label="Recenter map on Greater Orlando"
      >
        ⌖ <span>FOUR COUNTIES</span>
      </button>
    </>
  );
}
