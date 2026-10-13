import { useState } from "react";
import MapView from "./map/MapView";
import Sidebar from "./components/Sidebar";
export default function App() {
  const [open, setOpen] = useState(() => window.innerWidth > 600);
  const [countiesVisible, setCountiesVisible] = useState(true);
  return (
    <main>
      <MapView sidebarOpen={open} countiesVisible={countiesVisible} />
      <Sidebar
        open={open}
        onToggle={() => setOpen(!open)}
        countiesVisible={countiesVisible}
        onCountiesToggle={() => setCountiesVisible(!countiesVisible)}
      />
      <div className="map-caption">
        <span>ORBIT / FIELD NOTES</span>
        <p>
          Understanding place.
          <br />
          Imagining connection.
        </p>
      </div>
    </main>
  );
}
