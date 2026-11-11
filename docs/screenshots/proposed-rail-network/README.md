# Proposed rail network — browser captures

Captured November 11, 2026 in Chromium with reduced motion enabled. Real repository
rail plan/equity files and live CARTO tiles; no mock demographic or model data.
Laptop: 1440 × 900, zoom 9.8. Phone emulation: 390 × 844, zoom 9.2.
Map center: −81.43, 28.55; pitch 0° or 45°. Default plan: $10B, low cost,
20-minute wait/access overhead, minutes saved. Core view uses link-type colors.

| State | Laptop | Phone |
| --- | --- | --- |
| Layer off | [Image](laptop-off-2d.png) | [Image](phone-off-2d.png) |
| Plan, 2D | [Image](laptop-plan-2d.png) | [Image](phone-plan-2d.png) |
| Plan, pitched | [Image](laptop-plan-3d.png) | [Image](phone-plan-3d.png) |
| Core highlight / link types | [Image](laptop-core-2d.png) | [Image](phone-core-2d.png) |
| Controls / summary | [Image](laptop-summary.png) | [Image](phone-summary.png) |
| Equity panel | [Image](laptop-equity.png) | [Image](phone-equity.png) |

Live CARTO response bytes were retrieved through the environment proxy by curl,
with normal TLS verification, and supplied to Chromium. Both viewport runs logged
no live fetch errors or page errors and showed “BASEMAP LIVE”. These screenshots
were refreshed after visual review found native basemap text overprinting station
names; the new station-name layer now uses dark backgrounds above native labels.
No basemap styling or existing-layer behavior was changed.

The automated interaction suite uses a controlled basemap fixture separately.
Phone results are viewport emulation, not a physical-device test. These captures
do not establish future network availability or cross-browser performance.
