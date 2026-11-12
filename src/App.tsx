import RailPlanControls from "./components/RailPlanControls";
import {useSunshine} from "./components/useSunshine";
import {useRailPlan} from "./components/useRailPlan";
import type {RailSelection} from "./data/railPlan";
import {useFlows} from "./components/useFlows";
import {useCenterLabels} from "./components/useCenterLabels";
import {useCandidates} from "./components/useCandidates";
import type {CandidateSelection} from "./data/candidates";
import { useCallback, useEffect, useState } from "react";
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
  const sunshine = useSunshine();
  const railPlan = useRailPlan(sunshine.enabled);
  useEffect(()=>{if((railPlan.enabled||sunshine.enabled)&&window.innerWidth<=600)setOpen(false);},[railPlan.enabled,sunshine.enabled]);
  useEffect(()=>{if(open&&window.innerWidth<=600)railPlan.setPanelOpen(false);},[open,railPlan.setPanelOpen]);
  const selectRail = useCallback((s:RailSelection) => { railPlan.select(s); railPlan.setPanelOpen(true); if(window.innerWidth<=600)setOpen(false); }, [railPlan.select]);
  const [flowsVisible, setFlowsVisible] = useState(false);
  const candidates = useCandidates(flowsVisible);
  const labels = useCenterLabels(candidates.data, candidates.enabled || flowsVisible);
  const flows = useFlows(flowsVisible, candidates.data);
  const selectFlow = useCallback((id:string) => { flows.select(id); setOpen(true); }, [flows.select]);
  const selectCandidate = useCallback((selection: CandidateSelection) => { candidates.select(selection); setOpen(true); }, [candidates.select]);
  const [countiesVisible, setCountiesVisible] = useState(true);
  const [transitVisible, setTransitVisible] = useState(false);
  const [employmentVisible, setEmploymentVisible] = useState(false);
  const [populationVisible, setPopulationVisible] = useState(false);
  const [populationStatus, setPopulationStatus] =
    useState<PopulationStatus>("off");
  return (
    <main>
      <MapView sunshine={sunshine}
        railPlan={railPlan} onRailSelect={selectRail}
        flows={flows}
        labels={labels}
        onFlowSelect={selectFlow}
        candidates={candidates}
        onCandidateSelect={selectCandidate}
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
      <RailPlanControls state={railPlan} sunshine={sunshine} onSelect={selectRail}/>
      <Sidebar sunshine={sunshine}
        railPlan={railPlan} onRailSelect={selectRail}
        flows={flows}
        labels={labels}
        onFlowsToggle={() => setFlowsVisible(!flowsVisible)}
        candidates={candidates}
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
