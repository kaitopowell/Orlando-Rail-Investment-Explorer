import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { MapboxOverlay } from "@deck.gl/mapbox";

const center: [number, number] = [-81.3792, 28.5383];
export default function MapView() {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  useEffect(() => {
    if (!container.current) return;
    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: container.current,
        center,
        zoom: 10.2,
        minZoom: 2,
        maxZoom: 18,
        style:
          "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
        attributionControl: false,
      });
    } catch {
      setStatus("error");
      return;
    }
    mapRef.current = map;
    // Empty by design: validated analytical layers will be supplied here later.
    const overlay = new MapboxOverlay({ interleaved: false, layers: [] });
    map.addControl(overlay);
    map.addControl(
      new maplibregl.NavigationControl({ visualizePitch: true }),
      "bottom-right",
    );
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );
    map.on("load", () => setStatus("ready"));
    map.on("error", () => setStatus("error"));
    const timeout = window.setTimeout(() => {
      if (!map.isStyleLoaded()) setStatus("error");
    }, 20000);
    return () => {
      window.clearTimeout(timeout);
      mapRef.current = null;
      map.remove();
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
            : "BASEMAP UNAVAILABLE"}
      </div>
      {status === "error" && (
        <div className="map-error" role="alert">
          Map resources could not load. Check network access to CARTO and WebGL
          support, then reload. No analytical data is shown.
        </div>
      )}
      <button
        className="recenter"
        onClick={() =>
          mapRef.current?.flyTo({
            center,
            zoom: 10.2,
            pitch: 0,
            bearing: 0,
            duration: window.matchMedia("(prefers-reduced-motion: reduce)")
              .matches
              ? 0
              : 900,
          })
        }
        aria-label="Recenter map on Greater Orlando"
      >
        ⌖ <span>ORLANDO</span>
      </button>
    </>
  );
}
