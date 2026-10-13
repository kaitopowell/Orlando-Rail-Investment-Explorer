# SOL/R data sources

## County boundaries

- Source: [U.S. Census Bureau 2025 cartographic county boundaries, 1:500,000](https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip).
- Vintage: 2025.
- Downloaded: October 12, 2026 at 11:11 PM America/New_York, as supplied by the repository owner.
- Input: `data/raw/cb_2025_us_county_500k.zip`.
- Counties: Lake (12069), Orange (12095), Osceola (12097), Seminole (12117).
- Processing: `analysis/prepare_counties.py` filters the local archive, simplifies at 75 metres in NAD83 / UTM 17N, and exports WGS84 GeoJSON to `public/data`. Source metadata and the input checksum are in `public/data/counties-source.json`.
- This cartographic product is for regional visualization, not surveying or analytical inference.

## Basemap

[CARTO Dark Matter](https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json), with CARTO/OpenStreetMap attribution displayed on the map. External tile services require network access. Basemap labels are not project analytical datasets.

## Camera anchors and future layers

The approximate named coordinates in `src/config/mapViews.ts` configure the default camera only; they are not analytical observations. Population, employment, income, and transit controls remain placeholders. No demographic observations, ridership estimates, infrastructure costs, or optimization results are supplied.
