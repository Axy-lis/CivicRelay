# Phase 4: real SoCal geographic coverage

This is the first Phase 4 release. It works without Supabase and includes the database migration/import for connecting later. It identifies geographic context and suggests sourced contacts. It does not establish asset ownership or send reports to agencies.

## Coverage shipped

| Layer | Coverage / source | Important limit |
| --- | --- | --- |
| Counties | 10 Census 2025 county polygons | Generalized cartographic boundaries |
| Incorporated places | 235 cities and towns intersecting the region, Census 2025 | CDPs are excluded; outside incorporated cities is shown as unincorporated |
| Congress | 35 intersecting 119th congressional districts, Census 2025 | Current 2025–2026 term; future election maps are separate |
| Water | 612 distinct active, verified retail systems intersecting the region, California Water Boards SABL | Not every provider has verified coverage in this source; gaps and overlaps require review |
| Intake directory | 9 local entries and 2 water leak contacts; Caltrans maintenance link | Partial department coverage; no API delivery integration |

The ten counties are Imperial, Kern, Los Angeles, Orange, Riverside, San Bernardino, San Diego, San Luis Obispo, Santa Barbara, and Ventura. This is an explicit broad SoCal scope, rather than an official definition of the region.

County and city polygons are not department service territories. Water-service polygons identify a provider, not whether a specific leak is in public infrastructure or private plumbing. Every real report remains unassigned until ownership review. A coordinator can select a sourced contact and record an assignment; external delivery remains disconnected.

Official city intake suggestions cover road and streetlight issues in Los Angeles and San Diego. County road intake suggestions cover the unincorporated parts of Los Angeles, Orange, Riverside, San Bernardino, San Diego, San Luis Obispo, and Kern; San Diego County also has a streetlight reporting contact. These are candidate intakes for public local assets, subject to maintenance responsibilities and exceptions. Imperial, Ventura and Santa Barbara have geographic coverage but their county intake directories still need verification. Other incorporated cities need their own verified intake entries.

## Map and resident workflow

The default browser-local workspace uses real SoCal geography and begins empty. The separate simulated-account workspace retains fictional test incidents and boundaries. Existing `civic-relay-v1` browser records are retained under their original storage key; they are not silently reclassified or uploaded. The new local key is `civic-relay-socal-v1`.

Residents can search incorporated city names, choose example locations, request GPS, enter coordinates, and place or drag a pin. The offline SVG map uses bundled official shapes and works without an API key or tile service. It shows county outlines, city outlines on zoom, and water outlines on closer zoom. It has no street basemap or address geocoding. City search chooses a representative point inside a city, not a street address; the resident must adjust the location to their issue.

The routing result shows jurisdiction, district, provider if unambiguous, boundary flags, official intake links where verified, original water verification dates, and retrieval/source metadata. Suggestions remain in the manual review queue. Unsupported categories, uncovered locations, overlapping providers and gaps are never silently assigned.

## Sources and reproducibility

The original download hashes, retrieval date, feature counts and source vintages are in `dist/data/sources.json`. Each GeoJSON embeds its own source metadata. Retrieved October 20, 2026:

- [Census 2025 cartographic boundary documentation](https://www.census.gov/geographies/mapping-files/2025/geo/carto-boundary-file.html).
- [Counties, 1:500,000](https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_county_500k.zip).
- [California places, 1:500,000](https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_06_place_500k.zip).
- [119th Congress, 1:500,000](https://www2.census.gov/geo/tiger/GENZ2025/shp/cb_2025_us_cd119_500k.zip).
- [Water Boards verified service-area layer](https://gispublic.waterboards.ca.gov/portalserver/rest/services/Drinking_Water/California_Drinking_Water_System_Area_Boundaries/MapServer/0).

Keep the three original ZIP names in a source folder. Save a GeoJSON response from the Water Boards layer's `/query` endpoint as `water.json`, using these parameters:

```text
where=VERIFIED_STATUS='Verified' AND BOUNDARY_TYPE='Water Service Area'
geometry=-121.5,32.5,-114,36.9
geometryType=esriGeometryEnvelope
inSR=4326
spatialRel=esriSpatialRelIntersects
outSR=4326
outFields=SABL_PWSID,WATER_SYSTEM_NUMBER,WATER_SYSTEM_NAME,COUNTY,ACTIVITY_STATUS_CD,DT_VERIFIED,VERIFIED_STATUS,BOUNDARY_TYPE
f=geojson
```

The download returned 843 records before filtering to the ten counties. The generator rejects reported transfer-limit truncation, filters active verified retail service areas, excludes wholesale/jurisdictional polygons, unions multiple polygons for the same water-system ID, preserves holes/islands, repairs invalid geometry, simplifies at 5 meters in California Albers (EPSG:3310), and snaps to a 0.000001-degree grid. Census places with LSAD 25 or 43 are incorporated places; CDPs are excluded. Intersecting city/district/provider polygons are kept whole, with the county layer gating regional coverage.

With Python 3 and `pyshp`, `shapely`, `pyproj` installed:

```sh
python scripts/import-socal.py /absolute/path/to/source --retrieved 2026-10-20
npm run coverage:sql
```

Use the actual retrieval date for a refreshed snapshot. Review changes to counts, hashes, geometry, classifications, gaps and contacts before publishing a refresh. The intake directory is maintained in `dist/socal.js`; add only primary official sources and a checked date. Water contact entries use exact water-system IDs, not name guessing. Personal verifier names and resident contact details are not collected from the source.

Census borders use a 100-meter review margin and water borders use 25 meters. These are conservative product heuristics, not guaranteed accuracy bounds for a 1:500,000 map. Near a congressional edge, district is left null to avoid false district signals. The app stops assigning 119th district labels after January 2, 2027, until a new term's data is added. Representative names and notification recipients are not maintained here.

## Connect Supabase later

Apply all five migrations, in order. Then run `npm run coverage:sql`, open `supabase/socal.generated.sql` and apply it through a privileged database connection or Supabase SQL Editor. The generated file is intentionally ignored in Git because it is reproducible from the bundled assets. If the SQL Editor rejects the file as too large, run `node scripts/build-socal-editor.mjs`. Open `supabase/socal-editor.generated/` and run its numbered SQL files in order, one query per file. The first creates private staging tables, the load files can be retried, and the last verifies counts before atomically replacing active routing data. Run the start file only at the beginning; rerunning it clears staged progress. Do not put database credentials in the browser.

The import runs as a transaction, replaces only public routing datasets/features/contacts, and upserts the sourced agency names for coordinator assignment. It does not touch resident reports or automatically reactivate retired agencies. Authenticated residents cannot modify routing tables or call the private legacy resolver. The shared **live** resolver uses real polygons; the shared **test** resolver keeps fictional fixtures. Without the data import, live routes safely remain in review.

Live submissions capture a routing snapshot containing sources and suggested intake. Later data refreshes do not change a report's original geographic context. Coordinator assignments update the snapshot's department and reason. Legacy live reports without snapshots retain their stored routing result. Hosted acceptance must be checked on your own project; the import and migrations have been tested in isolated PostgreSQL/PostGIS.

## Validation

`npm test` checks real points in all ten counties, cities, unincorporated Joshua Tree, Los Angeles and San Diego water providers, a known verified-data gap, provider overlaps, polygon holes/islands, congressional border review, saved report context, and local submissions. The PostGIS suite imports all 892 features, compares server and browser results, preserves source snapshots after a data refresh, and verifies write restrictions and demo/live separation. Browser checks cover city search, pin interaction, report saving, manual assignment, persistence, and desktop/phone layouts.

## Remaining Phase 4 work

- [ ] Verify agency intakes for every incorporated city and the remaining three county public-works offices.
- [ ] Add approved leak-reporting contacts for the remaining water providers; verify source gaps against local utilities.
- [ ] Import detailed official city/unincorporated boundaries where generalized Census shapes are insufficient.
- [ ] Add maintained-road inventories, Caltrans highway ownership, utility streetlight inventories, tribal/federal/private land exceptions and contracts.
- [ ] Replace suggested contacts with automatic assignment only where category-specific asset ownership is supported by evidence.
- [ ] Add street imagery / a street basemap behind the draggable pin, including road names, intersections, and landmarks; select a provider and configure attribution, key restrictions, and usage limits.
- [ ] Add street/address search with a suitable geocoding provider.
- [ ] Validate real boundary cases with local staff; add a documented data-refresh schedule and stale-contact handling.
- [ ] Import the prepared data into a connected Supabase project and run hosted acceptance checks.
- [ ] Obtain agency submission permissions/API access, implement delivery receipts/retries, and distinguish accepted external tickets from local records.
- [ ] Connect term-specific congressional offices/notification recipients and an approved escalation workflow.

## Safety contacts

Non-emergency safety reporting adds seven separately sourced directory entries: Los Angeles and San Diego city police, plus sheriff directories for unincorporated areas of Los Angeles, Orange, Riverside, San Bernardino, and San Diego counties. County entries are not used as substitutes for incorporated-city police. Border uncertainty and other cities/counties stay in manual jurisdiction review. These are contact suggestions, not verified dispatch areas or external delivery integrations. See [Safety reporting](SAFETY-REPORTING.md).
