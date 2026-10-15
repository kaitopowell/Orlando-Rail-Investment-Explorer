# Geographic data

All provenance and license notes are in [DATA_SOURCES.md](../docs/DATA_SOURCES.md).

| Local input | Source |
| --- | --- |
| `raw/cb_2025_us_county_500k.zip` | U.S. Census Bureau, 2025 cartographic county boundaries |
| `raw/cb_2024_12_tract_500k.zip` | U.S. Census Bureau, 2024 Florida tract boundaries, 1:500,000 |
| `raw/acs_b01003_tracts_2024_5yr.csv`, `raw/acs_b01003_counties_2024_5yr.csv` | Census ACS 2024 five-year B01003, accessed 2026-10-13 |
| `raw/sunrail_gtfs_2026-10-13.zip` | [SunRail GTFS](https://corporate.sunrail.com/gtfs/google_transit.zip), accessed 2026-10-13 |
| `raw/brightline_gtfs_2026-10-13.zip` | Brightline GTFS, feed `f-brightline~trails`, [producer URL](http://feed.gobrightline.com/bl_gtfs.zip), downloaded via [Transitland](https://www.transit.land/) REST API on 2026-10-13 |
| `processed/sunrail_line.geojson`, `processed/sunrail_stations.geojson` | Supplied SunRail GTFS geometry clipped to the four counties using 2025 county boundaries |
| `processed/brightline_line.geojson`, `processed/brightline_stations.geojson` | Supplied Brightline GTFS geometry clipped to the same counties; intercity service, not local baseline service |
| `processed/lodes_wac_tracts_2023.csv` | Census LODES 8.4, Florida WAC 2023, aggregated workplace jobs; see [source and method](../docs/DATA_SOURCES.md#employment). Raw LODES inputs are not committed. |

Stations outside Lake, Orange, Osceola and Seminole counties are excluded. No license is specified for either feed; credit SunRail, Brightline as producer, and Transitland. See the detailed source notes for the SunRail FDOT disclaimer and supplied SHA1 values.

Offline scripts in `analysis/` publish county boundaries/mask, ACS population tracts and lightly simplified transit copies into `public/data/`. Station coordinates and source properties are preserved by transit publication. No data are downloaded by these scripts.
