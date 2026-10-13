import CountyAttribution from "./CountyAttribution";
import { plannedLayers } from "../data/layers";
export default function Sidebar({
  open,
  onToggle,
  countiesVisible,
  onCountiesToggle,
}: {
  open: boolean;
  onToggle: () => void;
  countiesVisible: boolean;
  onCountiesToggle: () => void;
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
          <div className="section-heading">
            <h2>Data layers</h2>
            <span>01 LIVE / 04 PLANNED</span>
          </div>
          <p className="section-note" id="layer-note">
            Explore the study area. Analytical layers await validated datasets.
          </p>
          <div className="layer-list">
            <label className="layer county-toggle">
              <span className="layer-symbol" aria-hidden="true">
                ⌑
              </span>
              <span className="layer-text">
                <strong>County boundaries</strong>
                <small>Orange · Seminole · Lake · Osceola</small>
              </span>
              <input
                type="checkbox"
                checked={countiesVisible}
                onChange={onCountiesToggle}
                aria-label="County boundaries"
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
          <p className="data-note">
            <span aria-hidden="true">○</span> No analytical datasets loaded.
          </p>
          <CountyAttribution />
        </section>
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
