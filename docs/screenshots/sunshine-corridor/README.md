# Sunshine Corridor — browser captures

Real repository GeoJSON and live CARTO basemap, with SunRail, Brightline and the
Sunshine proposal enabled together. Chromium with reduced motion enabled;
laptop 1440 × 900 and phone emulation 390 × 844. Center −81.415, 28.405;
normal zoom 11, zoomed out 9.5, pitched view 45° at zoom 11.

| View | Laptop | Phone |
| --- | --- | --- |
| Normal zoom: red/orange/yellow comparison | [Image](laptop-normal.png) | [Image](phone-normal.png) |
| Zoomed out | [Image](laptop-zoomed-out.png) | [Image](phone-zoomed-out.png) |
| Pitched | [Image](laptop-pitched.png) | [Image](phone-pitched.png) |
| Segment popup | [Image](laptop-popup.png) | [Image](phone-popup.png) |
| Compare table (scrollable sidebar) | [Image](laptop-comparison.png) | [Image](phone-comparison.png) |

The light-red proposal remains distinct from orange SunRail and yellow Brightline
in normal and zoomed-out views. All three use the same rendering implementation,
widths and station-marker styling. Co-located airport station labels can overlap,
as they do under the existing label renderer; station names remain available in
the keyboard selectors and inspection popup.

Live CARTO bytes were fetched through the configured proxy with normal TLS
verification and supplied to Chromium. Successful laptop and phone captures logged
no live-fetch/page/map errors and showed “BASEMAP LIVE”. The phone capture was
updated after fixing word wrapping and the existing baseline panel covering the
new comparison. The open Sunshine sidebar now takes priority on narrow screens;
baseline-only layout remains unchanged.

Automated interaction tests separately use a controlled basemap fixture.
Phone captures are viewport emulation, not physical-device testing. These do not
verify the analytical estimates, survey accuracy or future network availability.
