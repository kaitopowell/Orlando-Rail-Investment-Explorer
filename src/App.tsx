import { useEffect, useState } from "react";
import MapView from "./map/MapView";
import type { PopulationStatus } from "./components/PopulationOverlay";
import Sidebar from "./components/Sidebar";
export default function App() {
  const [trainMotion, setTrainMotion] = useState(false);
  const [trainPaused, setTrainPaused] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { if (media.matches) setTrainMotion(false); };
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [busVisible, setBusVisible] = useState(false);
  const [equityVisible, setEquityVisible] = useState(false);
  const [open, setOpen] = useState(() => window.innerWidth > 600);
  const [countiesVisible, setCountiesVisible] = useState(true);
  const [transitVisible, setTransitVisible] = useState(false);
  const [employmentVisible, setEmploymentVisible] = useState(false);
  const [populationVisible, setPopulationVisible] = useState(false);
  const [populationStatus, setPopulationStatus] =
    useState<PopulationStatus>("off");
  return (
    <main>
      <MapView
        busVisible={busVisible}
        equityVisible={equityVisible}
        employmentVisible={employmentVisible}
        trainMotion={trainMotion}
        trainPaused={trainPaused}
        transitVisible={transitVisible}
        sidebarOpen={open}
        countiesVisible={countiesVisible}
        populationVisible={populationVisible}
        onPopulationStatus={setPopulationStatus}
      />
      <Sidebar
        onTrainMotionToggle={() => { setTrainMotion(!trainMotion); setTrainPaused(false); }}
        onTrainPauseToggle={() => setTrainPaused(!trainPaused)}
        busVisible={busVisible}
        onBusToggle={() => {
          setBusVisible(!busVisible);
        }}
        equityVisible={equityVisible}
        onEquityToggle={() => {
          setEquityVisible(!equityVisible);
          if (!equityVisible && window.innerWidth <= 600) setOpen(false);
        }}
        employmentVisible={employmentVisible}
        onEmploymentToggle={() => {
          setEmploymentVisible(!employmentVisible);
          if (!employmentVisible) {
            if (window.innerWidth <= 600) setOpen(false);
          }
        }}
        trainMotion={trainMotion}
        trainPaused={trainPaused}
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
