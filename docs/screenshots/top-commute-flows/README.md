# Top commute flows — browser captures

Captured 2026-11-09 with Chromium, reduced motion enabled, the repository's real
center/flow/label files and live CARTO basemap resources. Laptop: 1440 × 900;
phone emulation: 390 × 844. Center: −81.43, 28.48; zoom 10.2 / 9.8; flat pitch
0°, pitched view 45°. Sidebar is collapsed for map comparisons and expanded for
inspection. No map data, error banners or labels were removed from these images.

| State | Laptop | Phone |
| --- | --- | --- |
| Flows off, 2D | [Image](laptop-off-2d.png) | [Image](phone-off-2d.png) |
| Flows off, pitched | [Image](laptop-off-pitched.png) | [Image](phone-off-pitched.png) |
| Flows alone, 2D | [Image](laptop-flows-2d.png) | [Image](phone-flows-2d.png) |
| Flows alone, pitched | [Image](laptop-flows-pitched.png) | [Image](phone-flows-pitched.png) |
| Flows and candidates, 2D | [Image](laptop-candidates-2d.png) | [Image](phone-candidates-2d.png) |
| Flows and candidates, pitched | [Image](laptop-candidates-pitched.png) | [Image](phone-candidates-pitched.png) |
| Selected-flow inspection | [Image](laptop-inspection.png) | [Image](phone-inspection.png) |

The managed browser's live CARTO requests were fulfilled with the same remote
bytes retrieved by curl through the configured proxy, using normal TLS
verification. The successful captures logged no failed live requests. An earlier
laptop capture showed the existing map-resource warning; a diagnostic retry
completed without map errors and supplies the laptop images here. No application
error-handling behavior was changed to obtain the screenshots.

Automated interaction regressions use a controlled basemap fixture separately.
These captures verify the live map at capture time, not future availability,
physical-device performance, or other browser engines. Names may be suppressed
by zoom/collision rules; the sidebar remains the complete accessible list.
