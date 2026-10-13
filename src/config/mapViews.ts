// Approximate named camera anchors [longitude, latitude], not analytical observations.
// Disney Springs anchors the Disney area; OCCC anchors International Drive.
export const orlandoLandmarks = {
  downtownOrlando: [-81.3792, 28.5383],
  ucf: [-81.2001, 28.6024],
  mco: [-81.3081, 28.4312],
  disneySprings: [-81.517, 28.37],
  internationalDrive: [-81.4694, 28.425],
} satisfies Record<string, [number, number]>;

export const framingConfig = {
  countyBoundsPaddingRatio: 0.01,
  mobileBreakpoint: 600,
  padding: {
    top: 85,
    bottom: 110,
    desktopSidebar: 380,
    desktopCollapsed: 130,
    desktopRight: 70,
    mobileSide: 28,
  },
  flightDuration: 900,
};
