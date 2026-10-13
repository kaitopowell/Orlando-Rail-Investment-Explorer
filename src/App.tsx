import { useState } from "react";
import MapView from "./map/MapView";
import type { PopulationStatus } from "./components/PopulationOverlay";
import Sidebar from "./components/Sidebar";
export default function App() {
  const [open, setOpen] = useState(() => window.innerWidth > 600);
  const [countiesVisible, setCountiesVisible] = useState(true);
  const [transitVisible, setTransitVisible] = useState(false);
  const [populationVisible, setPopulationVisible] = useState(false);
  const [populationStatus, setPopulationStatus] =
    useState<PopulationStatus>("off");
  return (
    <main>
      <MapView
        transitVisible={transitVisible}
        sidebarOpen={open}
        countiesVisible={countiesVisible}
        populationVisible={populationVisible}
        onPopulationStatus={setPopulationStatus}
      />
      <Sidebar
        transitVisible={transitVisible}
        onTransitToggle={() => {
          setTransitVisible(!transitVisible);
          if (!transitVisible && window.innerWidth <= 600) setOpen(false);
        }}
        populationVisible={populationVisible}
        populationStatus={populationStatus}
        onPopulationToggle={() => {
          setPopulationVisible(!populationVisible);
          if (!populationVisible && window.innerWidth <= 600) setOpen(false);
        }}
        open={open}
        onToggle={() => setOpen(!open)}
        countiesVisible={countiesVisible}
        onCountiesToggle={() => setCountiesVisible(!countiesVisible)}
      />
      <div className="map-caption">
        <span>SOL/R / FIELD NOTES</span>
        <p>
          Understanding place.
          <br />
          Imagining connection.
        </p>
      </div>
    </main>
  );
}
