import SunshineControls from "./SunshineControls";
import type {SunshineState} from "./useSunshine";
import {RailPlanToggle} from "./RailPlanControls";
import type {RailState} from "./useRailPlan";
import type {RailSelection} from "../data/railPlan";
import FlowControls from "./FlowControls";
import type {FlowState} from "./useFlows";
import type {LabelState} from "./useCenterLabels";
import CandidateControls from "./CandidateControls";
import type {CandidateState} from "./useCandidates";
import type { PopulationStatus } from "./PopulationOverlay";
import { populationSource } from "../data/population";
import CountyAttribution from "./CountyAttribution";
import { plannedLayers } from "../data/layers";
export default function Sidebar({
  sunshine, railPlan,
  candidates,
  flows, labels, onFlowsToggle,
  busVisible,
  onBusToggle,
  equityVisible,
  onEquityToggle,
  employmentVisible,
  onEmploymentToggle,
  trainMotion,
  trainPaused,
  onTrainMotionToggle,
  onTrainPauseToggle,
  transitVisible,
  onTransitToggle,
  open,
  onToggle,
  countiesVisible,
  onCountiesToggle,
  populationVisible,
  populationStatus,
  onPopulationToggle,
}: {
  sunshine: SunshineState;
  railPlan: RailState; onRailSelect: (s:RailSelection)=>void;
  candidates: CandidateState;
  flows: FlowState; labels: LabelState; onFlowsToggle: () => void;
  busVisible: boolean;
  onBusToggle: () => void;
  equityVisible: boolean;
  onEquityToggle: () => void;
  employmentVisible: boolean;
  onEmploymentToggle: () => void;
  trainMotion: boolean;
  trainPaused: boolean;
  onTrainMotionToggle: () => void;
  onTrainPauseToggle: () => void;
  transitVisible: boolean;
  onTransitToggle: () => void;
  open: boolean;
  onToggle: () => void;
  countiesVisible: boolean;
  onCountiesToggle: () => void;
  populationVisible: boolean;
  populationStatus: PopulationStatus;
  onPopulationToggle: () => void;
}) {
  return (
    <aside
      className={`sidebar ${open ? "" : "collapsed"}`}
      aria-label="Explorer controls"
    >
      <header className="brand">
        <div className="brand-mark" aria-hidden="true">
          ◎
        </div>
        <div className="brand-name">
          SOL/R<span>Seminole · Orange/Osceola · Lake · Rail</span>
        </div>
        <button
          className="collapse"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls="sidebar-content"
          aria-label={open ? "Collapse sidebar" : "Expand sidebar"}
        >
          {open ? "‹" : "›"}
        </button>
      </header>
      <div id="sidebar-content" hidden={!open}>
        <section className="intro">
          <p className="eyebrow">A REGION IN MOTION</p>
          <h1>
            Where could rail
            <br />
            take Orlando?
          </h1>
          <p>
            A geographic workspace for exploring the region’s next connections.
          </p>
          <div className="milestone">
            <span />
            01 / EXPLORER FOUNDATION
          </div>
        </section>
        <section className="layers">
          <div className="layer-list">
            <label className="layer county-toggle">
              <span className="layer-symbol" aria-hidden="true">
                ⌑
              </span>
              <span className="layer-text">
                <strong>Boundaries</strong>
                <small>Orange · Seminole · Lake · Osceola</small>
              </span>
              <input
                type="checkbox"
                checked={countiesVisible}
                onChange={onCountiesToggle}
                aria-label="County boundaries"
              />
            </label>
          </div>
          <section aria-labelledby="data-layers-heading">
            <div className="section-heading">
              <h2 id="data-layers-heading">Data layers</h2>
              <span>{String(6).padStart(2, "0")} LIVE / {String(plannedLayers.length).padStart(2, "0")} PLANNED</span>
            </div>
            <p className="section-note" id="layer-note">
              Explore demand, jobs and need indicators by place.
            </p>
            <div className="layer-list">
              <label className="layer county-toggle">
                <span className="layer-symbol" aria-hidden="true">
                  ◉
                </span>
                <span className="layer-text">
                  <strong>Population</strong>
                  <small>ACS tracts · Kontur modeled hexagons</small>
                </span>
                <input
                  type="checkbox"
                  checked={populationVisible}
                  onChange={onPopulationToggle}
                  aria-label="Population"
                />
              </label>
              <label className="layer county-toggle">
                <span className="layer-symbol">▦</span>
                <span className="layer-text">
                  <strong>Employment</strong>
                  <small>LODES 2023 · jobs by workplace</small>
                </span>
                <input
                  type="checkbox"
                  checked={employmentVisible}
                  onChange={onEmploymentToggle}
                  aria-label="Employment"
                />
              </label>
              <label className="layer county-toggle">
                <span className="layer-symbol">◒</span>
                <span className="layer-text">
                  <strong>Equity</strong>
                  <small>ACS 2020 to 2024 · need indicators</small>
                </span>
                <input
                  type="checkbox"
                  aria-label="Equity"
                  checked={equityVisible}
                  onChange={onEquityToggle}
                />
              </label>
              {plannedLayers.map((layer) => (
                <label className="layer" key={layer.id}>
                  <span className="layer-symbol" aria-hidden="true">
                    {layer.symbol}
                  </span>
                  <span className="layer-text">
                    <strong>{layer.name}</strong>
                    <small>{layer.description}</small>
                  </span>
                  <input
                    type="checkbox"
                    disabled
                    aria-describedby="layer-note"
                    aria-label={layer.name}
                  />
                </label>
              ))}
            </div>
          </section>
          <section className="transit-group" aria-labelledby="existing-transit-heading">
            <div className="section-heading">
              <h2 id="existing-transit-heading">Existing transit</h2>
            </div>
            <p className="section-note">Current rail and bus service.</p>
            <div className="layer-list">
              <label className="layer county-toggle">
                <span className="layer-symbol">⌁</span>
                <span className="layer-text">
                  <strong>Rail · SunRail / Brightline</strong>
                  <small>SunRail · Brightline (intercity)</small>
                </span>
                <input
                  type="checkbox"
                  checked={transitVisible}
                  onChange={onTransitToggle}
                  aria-label="Existing transit"
                />
              </label>
              {transitVisible && (
                <div className="train-motion-controls">
                  <label>
                    <input type="checkbox" checked={trainMotion} onChange={onTrainMotionToggle}
                      aria-label="Illustrative train motion" aria-describedby="train-motion-note" />
                    Train motion
                  </label>
                  <button type="button" disabled={!trainMotion} onClick={onTrainPauseToggle}
                    aria-label={trainPaused ? "Play train motion" : "Pause train motion"}>
                    {trainPaused ? "Play" : "Pause"}
                  </button>
                  <p id="train-motion-note">Illustrative train motion. Not real schedules.</p>
                </div>
              )}
              <label className="layer county-toggle">
                <span className="layer-symbol" aria-hidden="true">●</span>
                <span className="layer-text"><strong>Bus baseline (LYNX)</strong><small>Scheduled peak frequency · Wednesday</small></span>
                <input type="checkbox" aria-label="Bus baseline (LYNX)" checked={busVisible} onChange={onBusToggle}/>
              </label>
            </div>
          </section>
          <SunshineControls state={sunshine} rail={railPlan}/>
          {populationVisible && populationStatus !== "off" && (
            <p className="data-note">
              <span aria-hidden="true">○</span>{" "}
              {populationStatus === "ready"
                ? "Population layer loaded."
                : populationStatus === "loading"
                  ? "Loading population…"
                  : "Population unavailable. Retry on map."}
            </p>
          )}
          <CountyAttribution />
          <p className="county-attribution">
            <a href="https://lehd.ces.census.gov/data/lodes/LODES8/fl/wac/fl_wac_S000_JT00_2023.csv.gz">
              Census LODES 8.4 (2023), jobs by workplace location.
            </a>{" "}
            Accessed 2026-10-15. Population and Employment can be compared together
            in 2D and 3D.
          </p>
          <p className="county-attribution">
            Modeled population:{" "}
            <a href="https://data.humdata.org/organization/kontur">
              Kontur Population · CC BY · Humanitarian Data Exchange
            </a>
            . Release 2023-11-01.
          </p>
          <p className="county-attribution">
            Transit:{" "}
            <a href="https://corporate.sunrail.com/about-sunrail/gtfs-data-download/">
              SunRail GTFS
            </a>{" "}
            ·{" "}
            <a href="http://feed.gobrightline.com/bl_gtfs.zip">
              Brightline GTFS
            </a>{" "}
            via <a href="https://www.transit.land/">Transitland</a>.<br />
            Accessed 2026-10-13 · licenses not specified. Brightline is
            intercity, not local baseline service.
          </p>
          <p className="county-attribution">
            Bus: <a href="http://gtfsrt.golynx.com/gtfsrt/google_transit.zip">LYNX GTFS</a> · Mobility Database mdb-347.
            Accessed 2026-10-16. License not specified in the listing.
            Scheduled service, not observed reliability.
          </p>
          <p className="county-attribution">
            Population:{" "}
            <a href={populationSource.url} target="_blank" rel="noreferrer">
              {populationSource.label}
            </a>
            <br />
            Accessed 2026-10-13 · tract boundaries 2024.
          </p>
        </section>
        <RailPlanToggle state={railPlan}/>
        <CandidateControls state={candidates} labels={labels}/>
        <FlowControls state={flows} candidates={candidates} labels={labels} onToggle={onFlowsToggle}/>
        <section className="study">
          <p className="eyebrow">STUDY AREA</p>
          <h2>
            Greater Orlando <span>FL</span>
          </h2>
          <p>
            Pan to explore. Scroll to zoom.
            <br />
            Recenter to see all four counties.
          </p>
        </section>
        <footer>
          <span>UCF · COP4283</span>
          <span>RESEARCH IN PROGRESS</span>
        </footer>
      </div>
    </aside>
  );
}
