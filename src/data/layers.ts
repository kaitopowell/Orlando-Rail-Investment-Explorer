// Metadata only: no demographic, transit, or model data is included.
export const plannedLayers = [
  {
    id: "population",
    name: "Population",
    description: "Where people live",
    symbol: "◉",
  },
  {
    id: "employment",
    name: "Employment",
    description: "Where people work",
    symbol: "▦",
  },
  {
    id: "income",
    name: "Household income",
    description: "Economic context",
    symbol: "≋",
  },
  {
    id: "transit",
    name: "Existing transit",
    description: "Network and access",
    symbol: "⌁",
  },
] as const;
