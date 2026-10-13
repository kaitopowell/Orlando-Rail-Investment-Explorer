import maplibregl from "maplibre-gl";
import type { Feature, Polygon, MultiPolygon } from "geojson";
import type { Counties } from "./studyArea";

// The outside mask is a world constraint, independent of the boundary toggle.
const layerIds = ["county-hit-area", "county-outlines"];

export function addCountyLayers(
  map: maplibregl.Map,
  counties: Counties,
  outside: Feature<Polygon | MultiPolygon>,
  initiallyVisible: boolean,
) {
  let visible = initiallyVisible;
  let hovered: string | number | undefined;
  const popup = new maplibregl.Popup({
    closeButton: false,
    closeOnClick: false,
    className: "county-popup",
    offset: 12,
  });
  map.addSource("counties", { type: "geojson", data: counties });
  map.addSource("outside-counties", { type: "geojson", data: outside });
  map.addLayer({
    id: "county-outside",
    type: "fill",
    source: "outside-counties",
    paint: {
      "fill-color": "#03080c",
      "fill-opacity": 0.99,
      "fill-antialias": false,
    },
  });
  // Fully transparent fill is for hit testing only; county interiors remain unfilled.
  map.addLayer({
    id: "county-hit-area",
    type: "fill",
    source: "counties",
    paint: { "fill-opacity": 0 },
  });
  map.addLayer({
    id: "county-outlines",
    type: "line",
    source: "counties",
    paint: {
      "line-color": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        "#a5ded5",
        "#9ebbb9",
      ],
      "line-opacity": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        0.75,
        0.38,
      ],
      "line-width": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        1.6,
        0.8,
      ],
    },
  });
  // Local DOM text avoids a separate glyph/font service dependency for four small labels.
  const labels = counties.features.map((feature) => {
    const element = document.createElement("div");
    element.className = "county-label-anchor";
    const text = document.createElement("span");
    text.className = "county-label";
    text.textContent = feature.properties.NAME;
    element.append(text);
    element.setAttribute("aria-hidden", "true");
    return new maplibregl.Marker({ element })
      .setLngLat(feature.properties.label)
      .addTo(map);
  });
  function updateLabels() {
    const opacity = visible
      ? Math.max(0, Math.min(0.7, (11 - map.getZoom()) * 0.28))
      : 0;
    for (const label of labels)
      (label.getElement().firstElementChild as HTMLElement).style.opacity =
        String(opacity);
  }
  function clearHover() {
    if (hovered !== undefined)
      map.setFeatureState(
        { source: "counties", id: hovered },
        { hover: false },
      );
    hovered = undefined;
    popup.remove();
    map.getCanvas().style.cursor = "";
  }
  function showCounty(event: maplibregl.MapLayerMouseEvent) {
    if (!visible || !event.features?.length) return;
    clearHover();
    const feature = event.features[0];
    hovered = feature.id;
    if (hovered !== undefined)
      map.setFeatureState({ source: "counties", id: hovered }, { hover: true });
    popup
      .setLngLat(event.lngLat)
      .setText(`${feature.properties.NAME} County`)
      .addTo(map);
    map.getCanvas().style.cursor = "crosshair";
  }
  function setVisible(next: boolean) {
    visible = next;
    for (const id of layerIds)
      map.setLayoutProperty(id, "visibility", next ? "visible" : "none");
    if (!next) clearHover();
    updateLabels();
  }
  map.on("zoom", updateLabels);
  map.on("mousemove", "county-hit-area", showCounty);
  map.on("click", "county-hit-area", showCounty); // touch users can tap a county
  map.on("mouseleave", "county-hit-area", clearHover);
  map.on("movestart", clearHover);
  setVisible(initiallyVisible);
  return {
    setVisible,
    destroy() {
      map.off("zoom", updateLabels);
      map.off("mousemove", "county-hit-area", showCounty);
      map.off("click", "county-hit-area", showCounty);
      map.off("mouseleave", "county-hit-area", clearHover);
      map.off("movestart", clearHover);
      clearHover();
      labels.forEach((label) => label.remove());
    },
  };
}
