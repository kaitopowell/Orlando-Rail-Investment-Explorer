# Candidate connections — browser review

Captured 2026-11-05 in Chromium with the live CARTO/OSM basemap through the
managed environment proxy. These images use the actual committed data, not
synthetic observations. Laptop viewport: 1440 × 900; phone viewport: 390 × 844.
Reduced motion was enabled. The candidate layer is static.

The comparison camera uses center [-81.45, 28.50], zoom 9.6 on laptop and 8.7
on phone, bearing 0, and pitch 0° / 45°. The sidebar is collapsed to expose the
map. In the combined comparisons, both demand layers use their existing default
3D settings, or their existing 2D modes. Candidate styling does not change them.
Inspection screenshots show the keyboard-selected largest center.

| State | Laptop 2D | Laptop pitched | Phone 2D | Phone pitched |
| --- | --- | --- | --- | --- |
| Candidates off | [Before](laptop-off-2d.png) | [Before](laptop-off-3d.png) | [Before](phone-off-2d.png) | [Before](phone-off-3d.png) |
| Candidates alone | [After](laptop-alone-2d.png) | [After](laptop-alone-3d.png) | [After](phone-alone-2d.png) | [After](phone-alone-3d.png) |
| Candidates + Population + Employment | [After](laptop-combined-2d.png) | [After](laptop-combined-3d.png) | [After](phone-combined-2d.png) | [After](phone-combined-3d.png) |

Inspection: [laptop](laptop-inspection.png) · [phone](phone-inspection.png).

Automated interaction/failure tests use a controlled basemap fixture instead of
external tile services. The live screenshots separately demonstrate label
legibility; they do not guarantee future external service availability.
