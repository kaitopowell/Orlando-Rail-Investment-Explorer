import FlowOverlay from "./FlowOverlay";
import type {FlowState} from "../components/useFlows";
import type {LabelState} from "../components/useCenterLabels";
import CandidateOverlay from "./CandidateOverlay";
import type {CandidateState} from "../components/useCandidates";
import type {CandidateSelection} from "../data/candidates";
import { useEffect, useRef, useState } from "react";
import PopulationOverlay, {
  type PopulationStatus,
} from "../components/PopulationOverlay";
import EquityOverlay from "../components/EquityOverlay";
import EmploymentOverlay from "../components/EmploymentOverlay";
import BusOverlay from "../components/BusOverlay";
import TransitOverlay from "../components/TransitOverlay";
import { overlayChannels } from "./overlayChannels";
import maplibregl from "maplibre-gl";
import { addCountyLayers } from "./countyLayers";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import { MapboxOverlay } from "@deck.gl/mapbox";
import {
  countyBounds,
  createMapFraming,
  type Bounds,
  type Counties,
} from "./studyArea";

export default function MapView({
  candidates,
  flows, labels, onFlowSelect,
  onCandidateSelect,
  busVisible,
  equityVisible,
  sidebarOpen,
  countiesVisible,
  populationVisible,
  onPopulationStatus,
  trainMotion,
  trainPaused,
  transitVisible,
  employmentVisible,
}: {
  candidates: CandidateState;
  flows: FlowState; labels: LabelState; onFlowSelect: (id:string) => void;
  onCandidateSelect: (s: CandidateSelection) => void;
  busVisible: boolean;
  equityVisible: boolean;
  employmentVisible: boolean;
  trainMotion: boolean;
  trainPaused: boolean;
  transitVisible: boolean;
  sidebarOpen: boolean;
  countiesVisible: boolean;
  populationVisible: boolean;
  onPopulationStatus: (status: PopulationStatus) => void;
}) {
  const [scene, setScene] = useState<{
    map: maplibregl.Map;
    labelLayerId?: string;
    overlay: Pick<MapboxOverlay, "setProps">;
    equityOverlay: Pick<MapboxOverlay, "setProps">;
    employmentOverlay: Pick<MapboxOverlay, "setProps">;
    flowOverlay: Pick<MapboxOverlay, "setProps">;
    candidateOverlay: Pick<MapboxOverlay, "setProps">;
    busOverlay: Pick<MapboxOverlay, "setProps">;
    transitOverlay: Pick<MapboxOverlay, "setProps">;
  } | null>(null);
  useEffect(() => {
    if (!scene) return;
    const frame = requestAnimationFrame(() =>
      scene.map.easeTo({
        pitch: populationVisible || employmentVisible ? 45 : 0,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? 0
          : 600,
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [scene, populationVisible, employmentVisible]);
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const boundsRef = useRef<Bounds | null>(null);
  const sidebarRef = useRef(sidebarOpen);
  const framingRef = useRef<ReturnType<typeof createMapFraming> | null>(null);
  const populationVisibleRef = useRef(populationVisible);
  useEffect(() => {
    populationVisibleRef.current =
      populationVisible || employmentVisible || equityVisible || busVisible;
    layersRef.current?.setInteractive(
      !populationVisible && !employmentVisible && !equityVisible && !busVisible,
    );
  }, [populationVisible, employmentVisible, equityVisible, busVisible]);
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
    framingRef.current?.update(sidebarOpen);
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
          maxPitch: 45,
          dragRotate: false,
          touchPitch: false,
          renderWorldCopies: false,
          style:
            "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json",
          attributionControl: false,
        });
        map.touchZoomRotate.disableRotation();
        mapRef.current = map;
        framingRef.current = createMapFraming(
          map,
          boundsRef.current!,
          sidebarRef.current,
        );
        const overlay = new MapboxOverlay({ interleaved: true, layers: [] });
        map.addControl(overlay);
        // MapLibre owns pointer gestures on the shared interleaved canvas.
        // Forward its click/tap to the public picking API so inspectors keep
        // working even when its gesture handler consumes the DOM click.
        map.on("click", (event) => {
          const info = overlay.pickObject({
            x: event.point.x,
            y: event.point.y,
            radius: 2,
          });
          if (info?.object) info.layer?.onClick(info, event);
        });
        if (import.meta.env.DEV)
          window.dispatchEvent(
            new CustomEvent("sol-r:deck-ready", { detail: overlay }),
          );
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
          layersRef.current.setInteractive(!populationVisibleRef.current);
          const labelLayerId = map
            .getStyle()
            .layers.find((layer) => layer.type === "symbol" || layer.id === "county-outlines")?.id;
          const [
            equityOverlay,
            populationOverlay,
            employmentOverlay,
            candidateOverlay,
            flowOverlay,
            busOverlay,
            transitOverlay,
          ] = overlayChannels(overlay, labelLayerId);
          setScene({
            map,
            labelLayerId,
            overlay: populationOverlay,
            equityOverlay,
            employmentOverlay,
            candidateOverlay,
            flowOverlay,
            busOverlay,
            transitOverlay,
          });
          setStatus("ready");
        });
        map.on("error", () => setStatus("error"));
        // A development-only event lets browser tests inspect real camera constraints.
        if (import.meta.env.DEV)
          window.dispatchEvent(
            new CustomEvent("sol-r:map-ready", { detail: map }),
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
      framingRef.current?.destroy();
      framingRef.current = null;
      layersRef.current?.destroy();
      layersRef.current = null;
      mapRef.current = null;
      setScene(null);
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
      {scene && (
        <EquityOverlay
          map={scene.map}
          overlay={scene.equityOverlay}
          enabled={equityVisible}
        />
      )}
      <div className={populationVisible && employmentVisible ? "demand-comparison" : undefined}>
      {scene && (
        <PopulationOverlay
          map={scene.map}
          overlay={scene.overlay}
          enabled={populationVisible}
          beforeId={scene.labelLayerId}
          onStatus={onPopulationStatus}
        />
      )}
      {scene && (
        <EmploymentOverlay
          map={scene.map}
          overlay={scene.employmentOverlay}
          enabled={employmentVisible}
        />
      )}
      </div>
      <div className={busVisible ? "transit-stack" : undefined}>
      {scene && <FlowOverlay map={scene.map} overlay={scene.flowOverlay} state={flows} candidates={candidates} labels={labels} onSelect={onFlowSelect}/>}
      {scene && <CandidateOverlay state={candidates} overlay={scene.candidateOverlay} onSelect={onCandidateSelect}/>}
      {scene && <BusOverlay map={scene.map} overlay={scene.busOverlay} enabled={busVisible}/>}
      {scene && (
        <TransitOverlay
          map={scene.map}
          overlay={scene.transitOverlay}
          enabled={transitVisible}
          motionEnabled={trainMotion}
          motionPaused={trainPaused}
        />
      )}
      </div>
      <div className="view-controls" aria-label="Map views">
        <button
          disabled={dataError}
          onClick={() => framingRef.current?.showOrlando()}
          aria-label="Orlando"
        >
          ⌖ <span>ORLANDO</span>
        </button>
        <button
          disabled={dataError}
          onClick={() => framingRef.current?.showCounties()}
          aria-label="Four counties"
        >
          ▧ <span>FOUR COUNTIES</span>
        </button>
      </div>
    </>
  );
}
