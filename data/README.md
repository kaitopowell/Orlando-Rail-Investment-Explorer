# Geographic data

`raw/cb_2025_us_county_500k.zip` is the Census archive supplied on `data/county-boundaries`. The offline pipeline in `analysis/prepare_counties.py` produces the four-county GeoJSON, outside mask, and provenance metadata in `public/data`. The root README records the source URL, 2025 vintage, and owner-supplied download date. No demographic observations or mock data are shipped.

Future data additions need documented provenance, geographic coverage, and validated WGS84 GeoJSON. Prefer reproducible acquisition instructions over committing additional large raw datasets.
