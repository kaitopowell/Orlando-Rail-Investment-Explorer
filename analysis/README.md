# Geographic analysis

`prepare_counties.py` is an offline Python/GDAL pipeline reading the supplied Census ZIP in `data/raw/`. Run `/usr/bin/python3 analysis/prepare_counties.py` to regenerate `public/data`, and `/usr/bin/python3 analysis/test_counties.py` to validate it. The cloud environment already provides GDAL 3.10.3; no downloads are performed. See the root README for source, vintage, download date, projection, and simplification details.

Keep future Pandas/GeoPandas analysis separate from rendering. Document source, license, coverage, field definitions, missing-data handling, and transformations for each dataset. Export browser-facing GeoJSON in WGS84 (EPSG:4326). Document model requirements and assumptions before optimization; linear regression is prohibited. Never substitute fabricated demographics or costs.
